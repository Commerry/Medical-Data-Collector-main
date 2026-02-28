import { contextBridge, ipcRenderer } from "electron";

const allowedChannels = [
  "config:get-all",
  "config:set",
  "db:test-connection",
  "db:get-status",
  "db:reset-sqlite",
  // "mqtt:get-status",
  // "mqtt:get-clients",
  // "mqtt:get-credentials",
  "serial:get-status",
  "serial:get-devices",
  "serial:get-ports",
  "session:get-active",
  "session:get-all",
  "history:get-visits",
  "system:get-info",
  "system:register-to-api"
];

const allowedEvents = [
  "session:started",
  "session:updated",
  "data:updated",
  "mysql:status",
  // "mqtt:clients-updated"
  "serial:devices-updated",
  "serial:status"
];

contextBridge.exposeInMainWorld("mdc", {
  ping: () => "pong",
  invoke: (channel: string, payload?: unknown) => {
    if (!allowedChannels.includes(channel)) {
      throw new Error(`Channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!allowedEvents.includes(channel)) {
      throw new Error(`Event not allowed: ${channel}`);
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
