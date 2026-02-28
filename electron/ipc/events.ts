export const IPC_CHANNELS = {
  CONFIG_GET_ALL: "config:get-all",
  CONFIG_SET: "config:set",
  DB_TEST_CONNECTION: "db:test-connection",
  DB_GET_STATUS: "db:get-status",
  DB_RESET_SQLITE: "db:reset-sqlite",
  // MQTT_GET_STATUS: "mqtt:get-status",
  // MQTT_GET_CLIENTS: "mqtt:get-clients",
  // MQTT_GET_CREDENTIALS: "mqtt:get-credentials",
  SERIAL_GET_STATUS: "serial:get-status",
  SERIAL_GET_DEVICES: "serial:get-devices",
  SERIAL_GET_PORTS: "serial:get-ports",
  SESSION_GET_ACTIVE: "session:get-active",
  SESSION_GET_ALL: "session:get-all",
  HISTORY_GET_VISITS: "history:get-visits",
  SYSTEM_GET_INFO: "system:get-info",
  SYSTEM_REGISTER_TO_API: "system:register-to-api"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = {
  SESSION_STARTED: "session:started",
  SESSION_UPDATED: "session:updated",
  DATA_UPDATED: "data:updated",
  MYSQL_STATUS: "mysql:status",
  // MQTT_CLIENTS_UPDATED: "mqtt:clients-updated"
  SERIAL_DEVICES_UPDATED: "serial:devices-updated",
  SERIAL_STATUS: "serial:status"
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
