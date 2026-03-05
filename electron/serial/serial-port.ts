import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

export type SerialDevice = {
  deviceId: string;
  deviceName: string;
  macAddress: string;
  lastSeen: Date;
  online: boolean;
};

export type SerialPortOptions = {
  portName: string;
  baudRate: number;
  onMessage?: (payload: { deviceId: string; deviceType: string; message: string }) => void;
  onDevicesUpdated?: (devices: SerialDevice[]) => void;
  onStatusChanged?: (status: { connected: boolean; portName: string }) => void;
  writeLog?: (message: string) => void;
};

export type SerialPortInstance = {
  port: SerialPort;
  isConnected: () => boolean;
  getDevices: () => SerialDevice[];
  disconnect: () => void;
};

const devices = new Map<string, SerialDevice>();
const DEVICE_TIMEOUT_MS = 10000; // 10 seconds - ตรงกับ Center timeout (เรียลไทม์)

export const startSerialPort = ({
  portName,
  baudRate,
  onMessage,
  onDevicesUpdated,
  onStatusChanged,
  writeLog
}: SerialPortOptions): SerialPortInstance => {
  let isConnected = false;
  let port: SerialPort | null = null;
  let deviceCheckInterval: NodeJS.Timeout | null = null;
  let reconnectInterval: NodeJS.Timeout | null = null;
  let isReconnecting = false;

  const emitDevicesUpdated = () => {
    onDevicesUpdated?.(Array.from(devices.values()));
  };

  const updateDevice = (deviceId: string, deviceName: string, macAddress: string) => {
    const existing = devices.get(deviceId);
    if (existing) {
      writeLog?.(`[SERIAL-DEVICE] Updated: ${deviceId} (${deviceName})`);
      existing.lastSeen = new Date();
      existing.online = true;
    } else {
      writeLog?.(`[SERIAL-DEVICE] New device: ${deviceId} (${deviceName}) MAC: ${macAddress}`);
      devices.set(deviceId, {
        deviceId,
        deviceName,
        macAddress,
        lastSeen: new Date(),
        online: true
      });
    }
    writeLog?.(`[SERIAL-DEVICE] Total devices: ${devices.size}`);
    emitDevicesUpdated();
  };

  const checkDeviceTimeout = () => {
    const now = Date.now();
    let changed = false;
    const devicesToRemove: string[] = [];
    
    devices.forEach((device, deviceId) => {
      const timeSinceLastSeen = now - device.lastSeen.getTime();
      
      // If device hasn't been seen for DEVICE_TIMEOUT_MS, mark for removal
      if (timeSinceLastSeen > DEVICE_TIMEOUT_MS) {
        if (device.online) {
          writeLog?.(`[SERIAL-TIMEOUT] Device ${deviceId} timed out (${Math.floor(timeSinceLastSeen / 1000)}s since last seen)`);
        }
        // Remove device after timeout
        devicesToRemove.push(deviceId);
        changed = true;
      }
    });
    
    // Remove timed out devices from map
    devicesToRemove.forEach(deviceId => {
      devices.delete(deviceId);
      writeLog?.(`[SERIAL-TIMEOUT] Removed device ${deviceId} from active list`);
    });
    
    if (changed) {
      writeLog?.(`[SERIAL-TIMEOUT] Active devices: ${devices.size}`);
      emitDevicesUpdated();
    }
  };

  const connect = () => {
    // Clear reconnect interval if connecting manually
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    
    isReconnecting = false;
    
    try {
      port = new SerialPort({
        path: portName,
        baudRate: baudRate,
        autoOpen: false
      });

      const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

      port.open((err) => {
        if (err) {
          console.error(`[SERIAL] Failed to open port ${portName}:`, err.message);
          isConnected = false;
          onStatusChanged?.({ connected: false, portName });
          // Start reconnect attempts
          startReconnect();
          return;
        }

        isConnected = true;
        writeLog?.(`[SERIAL] Connected to ${portName} at ${baudRate} baud`);
        onStatusChanged?.({ connected: true, portName });

        // Start device timeout checker - ตรวจสอบทุก 3 วินาที (เรียลไทม์)
        deviceCheckInterval = setInterval(checkDeviceTimeout, 3000);
      });

      parser.on("data", (line: string) => {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) return;
        
        // Log ทุกบรรทัดที่รับมา (DEBUG)
        writeLog?.(`[SERIAL-RAW] ${trimmedLine}`);
        
        // ========== PARSE DEBUG MESSAGES ==========
        // Pattern: "Station X: MAC_ADDRESS"
        const stationMatch = trimmedLine.match(/Station\s+(\d+):\s+([0-9A-Fa-f:]{17})/);
        if (stationMatch) {
          const stationNum = stationMatch[1];
          const macAddress = stationMatch[2].toUpperCase();
          const deviceId = `DEVICE_${stationNum.padStart(3, '0')}`;
          const deviceName = `Device ${stationNum}`;
          
          writeLog?.(`[SERIAL-PARSE] Detected device from Station line: ${deviceId} MAC: ${macAddress}`);
          updateDevice(deviceId, deviceName, macAddress);
          return; // ไม่ต้อง process ต่อ
        }
        
        // Pattern: "Method X - ... Y stations" หรือ "softAPgetStationNum(): Y"
        const countMatch = trimmedLine.match(/(?:(\d+)\s+stations?|softAPgetStationNum\(\):\s*(\d+))/i);
        if (countMatch) {
          const count = parseInt(countMatch[1] || countMatch[2]);
          writeLog?.(`[SERIAL-PARSE] Detected ${count} stations`);
          // อาจจะเคลียร์ offline devices ที่เกินจำนวนนี้ในอนาคต
          return;
        }
        
        // ========== PARSE JSON MESSAGES ==========
        let jsonString = trimmedLine;
        if (trimmedLine.startsWith("[DATA]")) {
          jsonString = trimmedLine.substring(6).trim();
        } else if (trimmedLine.startsWith("{") && trimmedLine.endsWith("}")) {
          jsonString = trimmedLine;
        } else {
          // ไม่ใช่ทั้ง Station pattern และ JSON - skip
          return;
        }
        
        try {
          const data = JSON.parse(jsonString);
          
          // Handle device status message
          if (data.type === "device_status") {
            updateDevice(data.deviceId, data.deviceName || data.deviceId, data.macAddress || "");
          }
          
          // Handle vitals data message
          else if (data.type === "vitals") {
            // Don't update device here - device_status messages handle device tracking
            // Updating device from vitals causes duplicate device entries
            
            // Process vitals data - แปลงเป็นรูปแบบที่ handleCombinedVitals ต้องการ
            const vitalsPayload: any = {
              idcard: data.idcard || "",
              timestamp: data.timestamp || data.data?.timestamp || Date.now()
            };

            // รองรับ payload แบบ batch/combined ที่ส่ง field ตรง ๆ
            if (data.weight != null) vitalsPayload.weight = data.weight;
            if (data.height != null) vitalsPayload.height = data.height;
            if (data.bp != null) vitalsPayload.bp = data.bp;
            if (data.bp2 != null) vitalsPayload.bp2 = data.bp2;
            if (data.pressure != null) vitalsPayload.pressure = data.pressure;
            if (data.temp != null) vitalsPayload.temp = data.temp;
            if (data.temperature != null) vitalsPayload.temperature = data.temperature;
            if (data.pulse != null) vitalsPayload.pulse = data.pulse;
            if (data.spo2 != null) vitalsPayload.spo2 = data.spo2;
            
            // Handle nested data structure from combined measurements (weight_height, blood_pressure)
            if (data.data && typeof data.data === 'object') {
              if (data.data.weight != null) vitalsPayload.weight = data.data.weight;
              if (data.data.height != null) vitalsPayload.height = data.data.height;
              if (data.data.bp != null) vitalsPayload.bp = data.data.bp;
              if (data.data.bp2 != null) vitalsPayload.bp2 = data.data.bp2;
              if (data.data.temp != null) vitalsPayload.temp = data.data.temp;
              if (data.data.temperature != null) vitalsPayload.temperature = data.data.temperature;
              if (data.data.pulse != null) vitalsPayload.pulse = data.data.pulse;
              if (data.data.spo2 != null) vitalsPayload.spo2 = data.data.spo2;
            }
            
            // แมป deviceType กับ field ที่ถูกค้อง (สำหรับ single value measurements)
            if (data.deviceType === "bp") {
              vitalsPayload.bp = data.data?.value || null;
              vitalsPayload.pressure = data.data?.value || null;  // alias
            } else if (data.deviceType === "bp2") {
              vitalsPayload.bp2 = data.data?.value || null;
            } else if (data.deviceType === "temp") {
              vitalsPayload.temp = data.data?.value || null;
              vitalsPayload.temperature = data.data?.value || null;  // alias
            } else if (data.deviceType === "pulse") {
              vitalsPayload.pulse = data.data?.value || null;
            } else if (data.deviceType === "spo2") {
              vitalsPayload.spo2 = data.data?.value || null;
            } else if (data.deviceType === "weight") {
              vitalsPayload.weight = data.data?.value || null;
            } else if (data.deviceType === "height") {
              vitalsPayload.height = data.data?.value || null;
            }
            // weight_height deviceType is already handled above in nested data structure section
            
            onMessage?.({
              deviceId: data.deviceId || "unknown",
              deviceType: "vitals",
              message: JSON.stringify(vitalsPayload)
            });
          }
          
          // Handle legacy device type messages (deviceType-based routing)
          else if (data.deviceType && 'idcard' in data) {
            // Accept any deviceType with idcard field (even if empty string)
            // This handles: blood_pressure, weight_height, etc.
            writeLog?.(`[SERIAL-PARSE] DeviceType: ${data.deviceType}, IDCard: ${data.idcard || '(empty)'}`);
            
            onMessage?.({
              deviceId: data.deviceId || "unknown",
              deviceType: data.deviceType,
              message: JSON.stringify(data)
            });
          }
        } catch (error) {
          console.error("[SERIAL] Failed to parse message:", jsonString, error);
        }
      });

      port.on("error", (err) => {
        console.error("[SERIAL] Port error:", err.message);
        writeLog?.(`[SERIAL] Port error: ${err.message}`);
        isConnected = false;
        
        // Clear all devices on error
        devices.clear();
        onDevicesUpdated?.(Array.from(devices.values()));
        onStatusChanged?.({ connected: false, portName });
        
        // Try to reconnect after error
        if (!reconnectInterval && !isReconnecting) {
          writeLog?.(`[SERIAL] Will attempt to reconnect...`);
          startReconnect();
        }
      });

      port.on("close", () => {
        writeLog?.(`[SERIAL] Port closed`);
        isConnected = false;
        
        if (deviceCheckInterval) {
          clearInterval(deviceCheckInterval);
          deviceCheckInterval = null;
        }
        
        // Clear all devices on disconnect
        devices.clear();
        onDevicesUpdated?.(Array.from(devices.values()));
        onStatusChanged?.({ connected: false, portName });
        
        // Start auto-reconnect
        startReconnect();
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[SERIAL] Failed to create port:", errorMsg);
      isConnected = false;
      onStatusChanged?.({ connected: false, portName });
      startReconnect();
    }
  };

  const startReconnect = () => {
    if (reconnectInterval || isReconnecting) return;
    
    writeLog?.(`[SERIAL] Starting auto-reconnect attempts...`);
    reconnectInterval = setInterval(attemptReconnect, 5000); // Try every 5 seconds
  };

  const attemptReconnect = async () => {
    if (isConnected || isReconnecting) return;
    
    isReconnecting = true;
    
    try {
      // Check if port is available
      const availablePorts = await listSerialPorts();
      const portExists = availablePorts.some(p => p.path === portName);
      
      if (portExists) {
        writeLog?.(`[SERIAL] Port ${portName} detected, attempting reconnect...`);
        
        // Stop reconnect interval before attempting connection
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
          reconnectInterval = null;
        }
        
        isReconnecting = false;
        connect();
      } else {
        isReconnecting = false;
      }
    } catch (error) {
      console.error("[SERIAL] Reconnect check failed:", error);
      isReconnecting = false;
    }
  };

  const disconnect = (): Promise<void> => {
    return new Promise((resolve) => {
      writeLog?.(`[SERIAL] Disconnecting from ${portName}...`);
      
      // Stop reconnect attempts
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      
      if (deviceCheckInterval) {
        clearInterval(deviceCheckInterval);
        deviceCheckInterval = null;
      }
      
      devices.clear();
      isConnected = false;
      isReconnecting = false;
      
      // Notify about disconnection
      onDevicesUpdated?.(Array.from(devices.values()));
      onStatusChanged?.({ connected: false, portName });
      
      if (port) {
        // Remove all listeners to prevent memory leaks
        port.removeAllListeners();
        
        if (port.isOpen) {
          port.close((err) => {
            if (err) {
              console.error("[SERIAL] Error closing port:", err.message);
            }
            writeLog?.("[SERIAL] Port closed successfully");
            port = null;
            resolve();
          });
        } else {
          port = null;
          resolve();
        }
      } else {
        resolve();
      }
    });
  };

  const getDevices = () => {
    return Array.from(devices.values());
  };

  const getIsConnected = () => {
    return isConnected;
  };

  // Auto-connect
  connect();

  return {
    port: port!,
    isConnected: getIsConnected,
    getDevices,
    disconnect: disconnect as () => Promise<void>
  };
};

// List available serial ports
export const listSerialPorts = async (): Promise<Array<{ path: string; manufacturer?: string }>> => {
  try {
    const { SerialPort } = await import("serialport");
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer
    }));
  } catch (error) {
    console.error("[SERIAL] Failed to list ports:", error);
    return [];
  }
};
