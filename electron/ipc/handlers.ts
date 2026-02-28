import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "./events";
import type { AppConfig } from "../config/app-config";
import type { SqliteDb } from "../database/sqlite";
import { createMySqlPool, testMySqlConnection } from "../database/mysql";
import { sqliteAll, sqliteGet } from "../database/sqlite";
import { listSerialPorts } from "../serial/serial-port";
import type { SerialDevice } from "../serial/serial-port";
import * as os from "os";
import * as https from "https";

export type IpcContext = {
  sqlite: SqliteDb;
  getConfig: () => AppConfig;
  setConfig: (partial: Partial<AppConfig>) => void;
  updateMySqlPool: (config: AppConfig["database"]) => void;
  // getBrokerStatus: () => { running: boolean; port: number };
  // getBrokerClients: () => { clientId: string; ip: string | null }[];
  getSerialStatus: () => { connected: boolean; portName: string };
  getSerialDevices: () => SerialDevice[];
  getMySqlStatus: () => { connected: boolean };
  resetSqliteDb: () => void;
};

export const registerIpcHandlers = (ipcMain: IpcMain, ctx: IpcContext) => {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_ALL, () => ctx.getConfig());

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<AppConfig>) => {
    ctx.setConfig(partial);
    const config = ctx.getConfig();
    if (partial.database) {
      ctx.updateMySqlPool(config.database);
    }
    return config;
  });

  ipcMain.handle(
    IPC_CHANNELS.DB_TEST_CONNECTION,
    async (_event, payload: AppConfig["database"]) => {
      const pool = createMySqlPool({
        host: payload.host,
        port: payload.port,
        user: payload.username,
        password: payload.password,
        database: payload.database
      });
      try {
        await testMySqlConnection(pool);
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return { ok: false, error: message };
      } finally {
        await pool.end();
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.DB_GET_STATUS, () => ctx.getMySqlStatus());

  ipcMain.handle(IPC_CHANNELS.DB_RESET_SQLITE, () => {
    ctx.resetSqliteDb();
    return { ok: true };
  });

  // ipcMain.handle(IPC_CHANNELS.MQTT_GET_STATUS, () => ctx.getBrokerStatus());
  // ipcMain.handle(IPC_CHANNELS.MQTT_GET_CLIENTS, () => ctx.getBrokerClients());
  // ipcMain.handle(IPC_CHANNELS.MQTT_GET_CREDENTIALS, () => ctx.getConfig().mqtt);

  ipcMain.handle(IPC_CHANNELS.SERIAL_GET_STATUS, () => ctx.getSerialStatus());
  ipcMain.handle(IPC_CHANNELS.SERIAL_GET_DEVICES, () => ctx.getSerialDevices());
  ipcMain.handle(IPC_CHANNELS.SERIAL_GET_PORTS, async () => {
    const ports = await listSerialPorts();
    return ports;
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ACTIVE, () => {
    try {
      return sqliteGet(
        ctx.sqlite,
        `SELECT * FROM active_sessions
         ORDER BY COALESCE(last_update, session_start) DESC
         LIMIT 1`
      );
    } catch (_error) {
      return sqliteGet(
        ctx.sqlite,
        `SELECT * FROM active_sessions
         ORDER BY COALESCE(last_update, session_start) DESC
         LIMIT 1`
      );
    }
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_ALL, () => {
    return sqliteAll(ctx.sqlite, "SELECT * FROM active_sessions ORDER BY last_update DESC");
  });

  ipcMain.handle(
    IPC_CHANNELS.HISTORY_GET_VISITS,
    (_event, payload?: { startDate?: string; endDate?: string; idcard?: string }) => {
      const filters = payload ?? {};
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filters.startDate) {
        clauses.push("date(sync_timestamp) >= date(?)");
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        clauses.push("date(sync_timestamp) <= date(?)");
        params.push(filters.endDate);
      }
      if (filters.idcard) {
        clauses.push("idcard = ?");
        params.push(filters.idcard);
      }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      return sqliteAll(
        ctx.sqlite,
        `SELECT * FROM sync_history ${where} ORDER BY sync_timestamp DESC LIMIT 200`,
        params
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_INFO, () => {
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    
    // หา IP address ที่เป็น IPv4 และไม่ใช่ loopback
    let ip = "";
    for (const interfaceName of Object.keys(networkInterfaces)) {
      const addresses = networkInterfaces[interfaceName];
      if (addresses) {
        for (const addr of addresses) {
          if (addr.family === "IPv4" && !addr.internal) {
            ip = addr.address;
            break;
          }
        }
      }
      if (ip) break;
    }
    
    return { hostname, ip };
  });

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_REGISTER_TO_API,
    (_event, payload: { pCUCode: string; hostname: string; iP: string }) => {
      return new Promise((resolve) => {
        const postData = JSON.stringify(payload);
        
        const options = {
          hostname: "webapp.pfpintranet.com",
          port: 443,
          path: "/mdc-api/api/mdc",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          }
        };

        const req = https.request(options, (res) => {
          let data = "";
          
          res.on("data", (chunk) => {
            data += chunk;
          });
          
          res.on("end", () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ ok: true, data });
            } else {
              resolve({ ok: false, error: `HTTP ${res.statusCode}` });
            }
          });
        });

        req.on("error", (error) => {
          resolve({ ok: false, error: error.message });
        });

        req.write(postData);
        req.end();
      });
    }
  );
};
