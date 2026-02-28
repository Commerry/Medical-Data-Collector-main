import { SqliteDb, sqliteRun } from "../database/sqlite";

const toSqlValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const logMqttMessage = (
  db: SqliteDb,
  params: {
    topic: string;
    deviceType: string;
    idcard?: string;
    payload: string;
    status?: string;
    errorMessage?: string | null;
  }
) => {
  try {
    sqliteRun(
      db,
      `INSERT INTO mqtt_log (topic, device_type, idcard, payload, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?)` ,
      [
        toSqlValue(params.topic),
        toSqlValue(params.deviceType),
        toSqlValue(params.idcard),
        toSqlValue(params.payload),
        toSqlValue(params.status ?? "received"),
        toSqlValue(params.errorMessage)
      ]
    );
  } catch (error) {
    // Avoid breaking MQTT processing if logging fails.
    console.warn("[MQTT] logMqttMessage failed", error);
  }
};

export const logSyncHistory = (
  db: SqliteDb,
  params: {
    sessionId: number | null;
    idcard: string;
    visitno: number | null;
    fieldsUpdated: string[];
    status: string;
    errorMessage?: string | null;
  }
) => {
  try {
    sqliteRun(
      db,
      `INSERT INTO sync_history
       (session_id, idcard, visitno, fields_updated, sync_status, error_message)
       VALUES (?, ?, ?, ?, ?, ?)` ,
      [
        toSqlValue(params.sessionId),
        toSqlValue(params.idcard),
        toSqlValue(params.visitno),
        toSqlValue(JSON.stringify(params.fieldsUpdated)),
        toSqlValue(params.status),
        toSqlValue(params.errorMessage)
      ]
    );
  } catch (error) {
    console.warn("[MQTT] logSyncHistory failed", error);
  }
};
