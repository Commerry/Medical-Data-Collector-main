import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from "electron";
import path from "path";
import { existsSync, readdirSync } from "fs";
import { initConfigStore, getConfig, setConfig } from "./config/app-config";
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

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  ensureTray();

  mainWindow.on("minimize", () => {
    mainWindow?.hide();
  });

  mainWindow.on("close", (event: Electron.Event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
};

app.whenReady().then(async () => {
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
  
  let sqlite = resetSqliteDb(userDataPath);
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
      onMessage: (params) => {
        processMqttMessage(
          {
            mysqlPool,
            sqlite,
            writeLog: logger.write,
            emit: (channel, payload) => {
              emitToWindows(channel, payload);
            },
            getMySqlStatus: () => ({ connected: mysqlConnected })
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
    // getBrokerStatus: () => ({ running: brokerRunning, port: brokerPort }),
    // getBrokerClients: () => brokerInstance.getClients(),
    getSerialStatus: () => ({ connected: serialConnected, portName: serialPortName }),
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
