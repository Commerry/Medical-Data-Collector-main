import fs from "fs";
import path from "path";
import Store from "electron-store";

export type AppConfig = {
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  // mqtt: {
  //   port: number;
  //   username: string;
  //   password: string;
  // };
  serial: {
    portName: string;
    baudRate: number;
  };
  app: {
    pcucode: string;
    sessionTimeoutMinutes: number;
    logRetentionDays: number;
    autoStart: boolean;
  };
};

let store: Store<AppConfig> | null = null;

const defaultConfig: AppConfig = {
  database: {
    host: "127.0.0.1",
    port: 3306,
    username: "root",
    password: "",
    database: ""
  },
  // mqtt: {
  //   port: 1883,
  //   username: "clinic_device",
  //   password: "Abcd1234**"
  // },
  serial: {
    portName: "COM3",
    baudRate: 115200
  },
  app: {
    pcucode: "09584",
    sessionTimeoutMinutes: 5,
    logRetentionDays: 30,
    autoStart: true
  }
};

export const initConfigStore = (basePath: string) => {
  if (store) {
    return store;
  }

  const keyPath = path.join(basePath, "config.key");
  let encryptionKey = "";
  if (fs.existsSync(keyPath)) {
    encryptionKey = fs.readFileSync(keyPath, "utf8");
  } else {
    encryptionKey = cryptoRandomString();
    fs.writeFileSync(keyPath, encryptionKey, "utf8");
  }

  store = new Store<AppConfig>({
    name: "config",
    encryptionKey,
    defaults: defaultConfig
  });

  // store.set("mqtt", defaultConfig.mqtt);
  // Set default serial config if not exists
  const current = store.get("serial");
  if (!current) {
    store.set("serial", defaultConfig.serial);
  }

  return store;
};

export const getConfig = () => {
  if (!store) {
    throw new Error("Config store not initialized");
  }
  return store.store;
};

export const setConfig = (partial: Partial<AppConfig>) => {
  if (!store) {
    throw new Error("Config store not initialized");
  }
  store.set(partial as AppConfig);
};

const cryptoRandomString = () => {
  const bytes = Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
  return bytes.toString("hex");
};
