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
};

export type SerialPortInstance = {
  port: SerialPort;
  isConnected: boolean;
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
  onStatusChanged
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
      existing.lastSeen = new Date();
      existing.online = true;
    } else {
      devices.set(deviceId, {
        deviceId,
        deviceName,
        macAddress,
        lastSeen: new Date(),
        online: true
      });
    }
    emitDevicesUpdated();
  };

  const checkDeviceTimeout = () => {
    const now = Date.now();
    let changed = false;
    devices.forEach((device) => {
      if (now - device.lastSeen.getTime() > DEVICE_TIMEOUT_MS) {
        if (device.online) {
          device.online = false;
          changed = true;
        }
      }
    });
    if (changed) {
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
        console.log(`[SERIAL] Connected to ${portName} at ${baudRate} baud`);
        onStatusChanged?.({ connected: true, portName });

        // Start device timeout checker - ตรวจสอบทุก 3 วินาที (เรียลไทม์)
        deviceCheckInterval = setInterval(checkDeviceTimeout, 3000);
      });

      parser.on("data", (line: string) => {
        // Filter เฉพาะบรรทัดที่เป็น JSON data (ขึ้นต้นด้วย [DATA])
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) return;
        
        // ตรวจสอบว่าเป็นบรรทัด [DATA] หรือไม่
        let jsonString = trimmedLine;
        if (trimmedLine.startsWith("[DATA]")) {
          // ตัด prefix [DATA] ออก
          jsonString = trimmedLine.substring(6).trim();
        } else {
          // ถ้าไม่มี [DATA] prefix ให้ skip (เป็น debug message)
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
            // Update device status
            if (data.deviceId) {
              updateDevice(data.deviceId, data.deviceName || data.deviceId, data.macAddress || "");
            }
            
            // Process vitals data - แปลงเป็นรูปแบบที่ handleCombinedVitals ต้องการ
            const vitalsPayload: any = {
              idcard: data.idcard || "",
              timestamp: data.data?.timestamp || Date.now()
            };
            
            // แมป deviceType กับ field ที่ถูกค้อง
            if (data.deviceType === "bp") {
              vitalsPayload.bp = data.data?.value || null;
              vitalsPayload.pressure = data.data?.value || null;  // alias
            } else if (data.deviceType === "bp2") {
              vitalsPayload.bp = data.data?.value || null;
              vitalsPayload.pressure = data.data?.value || null;  // alias
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
            
            onMessage?.({
              deviceId: data.deviceId || "unknown",
              deviceType: "vitals",
              message: JSON.stringify(vitalsPayload)
            });
          }
          
          // Handle legacy device type messages
          else if (data.deviceType && data.idcard) {
            if (data.deviceId) {
              updateDevice(data.deviceId, data.deviceName || data.deviceId, data.macAddress || "");
            }
            
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
        isConnected = false;
        onStatusChanged?.({ connected: false, portName });
      });

      port.on("close", () => {
        console.log("[SERIAL] Port closed");
        isConnected = false;
        onStatusChanged?.({ connected: false, portName });
        
        if (deviceCheckInterval) {
          clearInterval(deviceCheckInterval);
          deviceCheckInterval = null;
        }
        
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
    
    console.log("[SERIAL] Starting auto-reconnect attempts...");
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
        console.log(`[SERIAL] Port ${portName} detected, attempting reconnect...`);
        connect();
      }
    } catch (error) {
      console.error("[SERIAL] Reconnect check failed:", error);
      isReconnecting = false;
    }
  };

  const disconnect = () => {
    // Stop reconnect attempts
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
    
    if (port && port.isOpen) {
      port.close((err) => {
        if (err) {
          console.error("[SERIAL] Error closing port:", err.message);
        }
      });
    }
    
    if (deviceCheckInterval) {
      clearInterval(deviceCheckInterval);
      deviceCheckInterval = null;
    }
    
    devices.clear();
    isConnected = false;
  };

  const getDevices = () => {
    return Array.from(devices.values());
  };

  // Auto-connect
  connect();

  return {
    port: port!,
    isConnected,
    getDevices,
    disconnect
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
