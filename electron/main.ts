import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification } from "electron";
import path from "path";
import { existsSync, readdirSync } from "fs";
import { initConfigStore, getConfig, setConfig, type AppConfig } from "./config/app-config";
import { resetSqliteDb } from "./database/sqlite";
import { createMySqlPool } from "./database/mysql";
// import { startBroker } from "./mqtt/broker";
import { startSerialPort, type SerialPortInstance } from "./serial/serial-port";
import { createFileLogger, formatLogLine } from "./logger/file-logger";
import { autoReplayPending, processMqttMessage } from "./services/data-processor";
import { registerIpcHandlers } from "./ipc/handlers";
import { IPC_EVENTS } from "./ipc/events";
import { cleanupExpiredSessions } from "./services/session-cleaner";
import { rotateLogs } from "./logger/log-rotator";
import { createStaticServer } from "./server/static-server";

const isDev = !app.isPackaged;

// ===== Single Instance Lock - ป้องกันการเปิดโปรแกรมซ้อน =====
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // มี instance อื่นทำงานอยู่แล้ว - ปิดตัวนี้
  console.log("[APP] Another instance is already running. Quitting...");
  app.quit();
} else {
  // รับการแจ้งเตือนเมื่อมีการพยายามเปิด instance ใหม่
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    console.log("[APP] Second instance detected. Focusing main window...");
    // Focus window ที่มีอยู่แล้ว
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// let stopBroker: (() => void) | null = null;
// let brokerPort = 0;
// let brokerRunning = false;
let serialPortInstance: SerialPortInstance | null = null;
let serialConnected = false;
let serialPortName = "";
let mysqlConnected = false;
let mysqlStatusTimer: NodeJS.Timeout | null = null;
let sessionCleanupTimer: NodeJS.Timeout | null = null;
let logRotationTimer: NodeJS.Timeout | null = null;
let replayPendingTimer: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let staticServer: { server: any; port: number; stop: () => void } | null = null;
let sqlite: any = null;
let lastNotificationTime: { [key: string]: number } = {};

const getBaseUrl = () => {
  if (isDev) {
    return "http://localhost:3005";
  } else {
    return staticServer ? `http://127.0.0.1:${staticServer.port}` : "";
  }
};

const loadRoute = (route: string) => {
  if (!mainWindow) {
    return;
  }
  const base = getBaseUrl();
  mainWindow.loadURL(route === "/" ? base : `${base}${route}`);
};

const ensureTray = () => {
  if (tray) {
    return;
  }

  // Use proper icon file for tray
  let iconPath: string;
  if (isDev) {
    // In development, icon is in build folder
    iconPath = path.join(__dirname, "..", "build", "favicon.ico");
  } else {
    // In production, try to use icon from resources
    const resourceIcon = path.join(process.resourcesPath, "favicon.ico");
    if (existsSync(resourceIcon)) {
      iconPath = resourceIcon;
    } else {
      // Fallback to build folder in app.asar
      iconPath = path.join(__dirname, "..", "build", "favicon.ico");
    }
  }

  // Load and resize icon for tray (Windows requires small icons)
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    console.error("[ERROR] Tray icon not found at:", iconPath);
    // Create a simple fallback icon
    trayIcon = nativeImage.createEmpty();
  } else {
    // Resize to 16x16 for Windows tray
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  
  tray = new Tray(trayIcon);
  tray.setToolTip("Medical Data Collector");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          loadRoute("/");
        }
      }
    },
    {
      label: "Settings",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          loadRoute("/settings");
        }
      }
    },
    {
      label: "History",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          loadRoute("/history");
        }
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
};

const emitToWindows = (channel: string, payload?: unknown) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, payload);
  });
};

const showDataNotification = (idcard: string) => {
  // Prevent duplicate notifications within 2 seconds for same idcard
  const now = Date.now();
  if (lastNotificationTime[idcard] && (now - lastNotificationTime[idcard]) < 2000) {
    console.log(`[NOTIFICATION-SKIP] Skipping duplicate notification for ${idcard}`);
    return;
  }
  lastNotificationTime[idcard] = now;

  // Only show notification when window is minimized or hidden
  if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) {
    console.log(`[NOTIFICATION-SKIP] Window is visible and not minimized`);
    return;
  }

  if (!sqlite) {
    console.log(`[NOTIFICATION-ERROR] SQLite not initialized`);
    return;
  }

  try {
    // Get current session data from active_sessions
    const session = sqlite.prepare(
      `SELECT idcard, pressure, pressure2, pulse, temperature, weight, height
       FROM active_sessions
       WHERE idcard = ?
       LIMIT 1`
    ).get(idcard);

    if (!session) {
      console.log(`[NOTIFICATION-ERROR] Session not found for ${idcard}`);
      return;
    }

    const bodyLines: string[] = [];
    
    // Blood Pressure (combined format)
    if (session.pressure) {
      bodyLines.push(`🩺 Blood Pressure: ${session.pressure} mmHg`);
    }
    
    if (session.pulse) {
      bodyLines.push(`❤️  Pulse: ${session.pulse} bpm`);
    }
    
    if (session.temperature) {
      bodyLines.push(`🌡️  Temperature: ${session.temperature}°C`);
    }
    
    if (session.weight) {
      bodyLines.push(`⚖️  Weight: ${session.weight} kg`);
    }
    
    if (session.height) {
      bodyLines.push(`📏 Height: ${session.height} cm`);
    }
    
    // Show ID card number
    bodyLines.push(`🪪 ID Card: ${idcard}`);
    
    const body = bodyLines.join('\n');

    console.log(`[NOTIFICATION] Creating notification for ${idcard}`);
    console.log(`[NOTIFICATION] Body: ${body}`);
    
    // Get icon path for notification
    let iconPath: string | undefined;
    if (isDev) {
      iconPath = path.join(__dirname, "..", "build", "icon.ico");
    } else {
      const resourceIcon = path.join(process.resourcesPath, "icon.ico");
      iconPath = existsSync(resourceIcon) ? resourceIcon : path.join(__dirname, "..", "build", "icon.ico");
    }
    
    const notification = new Notification({
      title: "Medical Data Collector",
      subtitle: "📊 Data Received",
      body: body,
      silent: false,
      urgency: 'critical',
      timeoutType: 'default',
      icon: iconPath
    });

    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();
    console.log(`[NOTIFICATION] Notification sent for ${idcard}`);
  } catch (error) {
    console.error(`[NOTIFICATION-ERROR] Error:`, error);
  }
};

const createWindow = () => {
  // Get icon path
  let iconPath: string;
  if (isDev) {
    iconPath = path.join(__dirname, "..", "build", "icon.ico");
  } else {
    const resourceIcon = path.join(process.resourcesPath, "icon.ico");
    iconPath = existsSync(resourceIcon) ? resourceIcon : path.join(__dirname, "..", "build", "icon.ico");
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    title: "Medical Data Collector",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3005 ws://localhost:* data: blob:; connect-src 'self' http://localhost:3005 ws://localhost:* https://webapp.pfpintranet.com;"
      : "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; connect-src 'self' https://webapp.pfpintranet.com; style-src 'self' 'unsafe-inline';";
    
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  mainWindow.loadURL(getBaseUrl());
  
  // Developer Tools disabled for production use
  // if (isDev) {
  //   mainWindow.webContents.openDevTools({ mode: "detach" });
  // }

  // ส่ง serial status หลังจาก page โหลดเสร็จ เพื่อให้ renderer ได้รับ event แน่นอน
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_EVENTS.SERIAL_STATUS, {
        connected: serialPortInstance ? serialPortInstance.isConnected() : serialConnected,
        portName: serialPortName
      });
      mainWindow.webContents.send(IPC_EVENTS.MYSQL_STATUS, {
        connected: mysqlConnected
      });
    }
  });

  ensureTray();

  mainWindow.on("minimize", () => {
    console.log("[WINDOW] Window minimized");
    mainWindow?.hide();
  });

  mainWindow.on("close", (event: Electron.Event) => {
    if (!isQuitting) {
      event.preventDefault();
      console.log("[WINDOW] Window hidden (close prevented)");
      mainWindow?.hide();
    }
  });
  
  // Test notification after window loads
  setTimeout(() => {
    console.log("[TEST] Sending test notification...");
    try {
      const testNotification = new Notification({
        title: "Medical Data Collector",
        body: "Notification system is ready! 🔔",
        silent: false
      });
      testNotification.show();
      console.log("[TEST] Test notification sent successfully");
    } catch (error) {
      console.error("[TEST] Failed to show test notification:", error);
    }
  }, 3000); // Show test notification 3 seconds after window opens
};

// Set application name for Windows notifications and taskbar
app.setName("Medical Data Collector");

app.whenReady().then(async () => {
  // Request notification permission on Windows
  if (process.platform === 'win32') {
    const hasPermission = Notification.isSupported();
    console.log(`[NOTIFICATION] Notification supported: ${hasPermission}`);
    if (hasPermission) {
      console.log(`[NOTIFICATION] Notifications are supported and ready`);
    } else {
      console.warn(`[NOTIFICATION-WARNING] Notifications are not supported on this system`);
    }
  }
  
  const userDataPath = app.getPath("userData");
  initConfigStore(userDataPath);
  const config = getConfig();
  app.setLoginItemSettings({
    openAtLogin: config.app.autoStart,
    openAsHidden: config.app.autoStart
  });
  
  // Start static server in production mode
  if (!isDev) {
    // In production, renderer is in resources/renderer (from extraResources)
    const rendererPath = path.join(process.resourcesPath, "renderer");
    
    console.log(`[DEBUG] Resources path: ${process.resourcesPath}`);
    console.log(`[DEBUG] Renderer path: ${rendererPath}`);
    console.log(`[DEBUG] Directory exists: ${existsSync(rendererPath)}`);
    
    if (existsSync(rendererPath)) {
      try {
        const files = readdirSync(rendererPath);
        console.log(`[DEBUG] Files in renderer (first 10):`, files.slice(0, 10));
      } catch (e) {
        console.error(`[ERROR] Cannot read renderer directory:`, e);
      }
    } else {
      console.error(`[ERROR] Renderer directory does not exist!`);
    }
    
    try {
      staticServer = await createStaticServer(rendererPath, 0);
      console.log(`[INFO] Static server started on port ${staticServer.port}`);
    } catch (error) {
      console.error(`[ERROR] Failed to start static server:`, error);
    }
  }
  
  sqlite = resetSqliteDb(userDataPath);
  let mysqlPool = createMySqlPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.username,
    password: config.database.password,
    database: config.database.database
  });
  const logger = createFileLogger(userDataPath);

  // const brokerInstance = startBroker({
  //   port: config.mqtt.port,
  //   username: config.mqtt.username,
  //   password: config.mqtt.password,
  //   onMessage: (params) => {
  //     processMqttMessage(
  //       {
  //         mysqlPool,
  //         sqlite,
  //         writeLog: logger.write,
  //         emit: (channel, payload) => {
  //           emitToWindows(channel, payload);
  //         },
  //         getMySqlStatus: () => ({ connected: mysqlConnected })
  //       },
  //       params
  //     ).catch((error) => {
  //       const message = error instanceof Error ? error.message : "unknown_error";
  //       logger.write(formatLogLine("[MQTT]", `[ERROR] ${message}`));
  //     });
  //   },
  //   onClientsUpdated: (clients) => {
  //     emitToWindows(IPC_EVENTS.MQTT_CLIENTS_UPDATED, clients);
  //   }
  // });

  // stopBroker = () => {
  //   brokerInstance.server.close();
  //   brokerInstance.broker.close();
  //   brokerRunning = false;
  // };
  // brokerPort = config.mqtt.port;
  // brokerRunning = true;

  // Start Serial Port (only if portName is configured)
  if (config.serial.portName && config.serial.portName.trim() !== "") {
    serialPortInstance = startSerialPort({
      portName: config.serial.portName,
      baudRate: config.serial.baudRate,
      writeLog: logger.write,
      onMessage: (params) => {
        processMqttMessage(
          {
            mysqlPool,
            sqlite,
            writeLog: logger.write,
            emit: (channel, payload) => {
              emitToWindows(channel, payload);
            },
            getMySqlStatus: () => ({ connected: mysqlConnected }),
            showNotification: showDataNotification
          },
          {
            topic: `medical/${params.deviceId}/${params.deviceType}`,
            deviceType: params.deviceType,
            message: params.message
          }
        ).catch((error) => {
          const message = error instanceof Error ? error.message : "unknown_error";
          logger.write(formatLogLine("[SERIAL]", `[ERROR] ${message}`));
        });
      },
      onDevicesUpdated: (devices) => {
        logger.write(formatLogLine("[SERIAL]", `Devices updated: ${devices.length} device(s) - ${devices.map(d => `${d.deviceId}:${d.online?'ON':'OFF'}`).join(', ')}`));
        emitToWindows(IPC_EVENTS.SERIAL_DEVICES_UPDATED, devices);
      },
      onStatusChanged: (status) => {
        serialConnected = status.connected;
        serialPortName = status.portName;
        emitToWindows(IPC_EVENTS.SERIAL_STATUS, status);
      }
    });

    // Don't read isConnected here - it's async and onStatusChanged will update it
    serialPortName = config.serial.portName;
  } else {
    logger.write(formatLogLine("[SERIAL]", "Port not configured. Please set port in Settings."));
  }

  const setConfigWithSideEffects = (partial: Parameters<typeof setConfig>[0]) => {
    setConfig(partial);
    const updated = getConfig();
    app.setLoginItemSettings({
      openAtLogin: updated.app.autoStart,
      openAsHidden: updated.app.autoStart
    });
  };

  const restartSerialPort = async (serialConfig: AppConfig["serial"]) => {
    logger.write(formatLogLine("[SERIAL-RESTART]", `Restarting serial port to ${serialConfig.portName || 'none'}...`));
    
    // Notify UI about restart
    emitToWindows(IPC_EVENTS.SERIAL_STATUS, { connected: false, portName: serialPortName });
    emitToWindows(IPC_EVENTS.SERIAL_DEVICES_UPDATED, []);
    
    // Disconnect existing instance
    if (serialPortInstance) {
      logger.write(formatLogLine("[SERIAL-RESTART]", "Disconnecting existing port..."));
      try {
        await serialPortInstance.disconnect();
        logger.write(formatLogLine("[SERIAL-RESTART]", "Existing port disconnected successfully"));
        // Wait for port to be fully released by OS
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logger.write(formatLogLine("[SERIAL-RESTART]", `Error during disconnect: ${errMsg}`));
      }
      serialPortInstance = null;
    }

    // Clear states
    serialConnected = false;
    serialPortName = "";

    // Only reconnect if port is configured
    if (serialConfig.portName && serialConfig.portName.trim() !== "") {
      logger.write(formatLogLine("[SERIAL-RESTART]", `Starting new connection to ${serialConfig.portName}...`));
      serialPortInstance = startSerialPort({
        portName: serialConfig.portName,
        baudRate: serialConfig.baudRate,
        writeLog: logger.write,
        onMessage: (params) => {
          processMqttMessage(
            {
              mysqlPool,
              sqlite,
              writeLog: logger.write,
              emit: (channel, payload) => {
                emitToWindows(channel, payload);
              },
              getMySqlStatus: () => ({ connected: mysqlConnected }),
              showNotification: showDataNotification
            },
            {
              topic: `medical/${params.deviceId}/${params.deviceType}`,
              deviceType: params.deviceType,
              message: params.message
            }
          ).catch((error) => {
            const message = error instanceof Error ? error.message : "unknown_error";
            logger.write(formatLogLine("[SERIAL]", `[ERROR] ${message}`));
          });
        },
        onDevicesUpdated: (devices) => {
          logger.write(formatLogLine("[SERIAL]", `Devices updated: ${devices.length} device(s) - ${devices.map(d => `${d.deviceId}:${d.online?'ON':'OFF'}`).join(', ')}`));
          emitToWindows(IPC_EVENTS.SERIAL_DEVICES_UPDATED, devices);
        },
        onStatusChanged: (status) => {
          serialConnected = status.connected;
          serialPortName = status.portName;
          emitToWindows(IPC_EVENTS.SERIAL_STATUS, status);
        }
      });
      serialPortName = serialConfig.portName;
    } else {
      logger.write(formatLogLine("[SERIAL]", "Port not configured. Please set port in Settings."));
      emitToWindows(IPC_EVENTS.SERIAL_STATUS, { connected: false, portName: "" });
      emitToWindows(IPC_EVENTS.SERIAL_DEVICES_UPDATED, []);
    }
  };

  const ipcContext = {
    sqlite,
    getConfig,
    setConfig: setConfigWithSideEffects,
    updateMySqlPool: (dbConfig) => {
      mysqlPool.end().catch(() => null);
      mysqlPool = createMySqlPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database
      });
    },
    restartSerialPort,
    // getBrokerStatus: () => ({ running: brokerRunning, port: brokerPort }),
    // getBrokerClients: () => brokerInstance.getClients(),
    getSerialStatus: () => ({ 
      connected: serialPortInstance ? serialPortInstance.isConnected() : serialConnected, 
      portName: serialPortName 
    }),
    getSerialDevices: () => serialPortInstance?.getDevices() || [],
    getMySqlStatus: () => ({ connected: mysqlConnected }),
    resetSqliteDb: () => {
      sqlite = resetSqliteDb(userDataPath, sqlite);
      ipcContext.sqlite = sqlite;
    }
  };

  registerIpcHandlers(ipcMain, ipcContext);

  const checkMySqlStatus = async () => {
    const previous = mysqlConnected;
    try {
      const connection = await mysqlPool.getConnection();
      await connection.ping();
      connection.release();
      mysqlConnected = true;
    } catch (_error) {
      mysqlConnected = false;
    }
    if (previous !== mysqlConnected) {
      emitToWindows(IPC_EVENTS.MYSQL_STATUS, { connected: mysqlConnected });
    }
  };

  checkMySqlStatus().catch(() => null);
  mysqlStatusTimer = setInterval(checkMySqlStatus, 10000);

  sessionCleanupTimer = setInterval(() => {
    const timeoutMinutes = Math.max(1, ipcContext.getConfig().app.sessionTimeoutMinutes || 5);
    cleanupExpiredSessions(sqlite, timeoutMinutes);
  }, 60 * 1000);

  replayPendingTimer = setInterval(() => {
    autoReplayPending({
      mysqlPool,
      sqlite,
      writeLog: logger.write,
      emit: (channel, payload) => {
        emitToWindows(channel, payload);
      },
      getMySqlStatus: () => ({ connected: mysqlConnected })
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown_error";
      logger.write(formatLogLine("[REPLAY]", `[ERROR] ${message}`));
    });
  }, 30 * 1000);

  rotateLogs(userDataPath, config.app.logRetentionDays);
  logRotationTimer = setInterval(() => {
    rotateLogs(userDataPath, config.app.logRetentionDays);
  }, 6 * 60 * 60 * 1000);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    isQuitting = true;
    // stopBroker?.();
    serialPortInstance?.disconnect();
    staticServer?.stop();
    if (mysqlStatusTimer) {
      clearInterval(mysqlStatusTimer);
      mysqlStatusTimer = null;
    }
    if (sessionCleanupTimer) {
      clearInterval(sessionCleanupTimer);
      sessionCleanupTimer = null;
    }
    if (logRotationTimer) {
      clearInterval(logRotationTimer);
      logRotationTimer = null;
    }
    if (replayPendingTimer) {
      clearInterval(replayPendingTimer);
      replayPendingTimer = null;
    }
    app.quit();
  }
});
