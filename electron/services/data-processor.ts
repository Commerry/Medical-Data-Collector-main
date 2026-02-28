import { MySqlPool, mysqlQuery } from "../database/mysql";
import { SqliteDb, sqliteAll, sqliteGet, sqliteRun } from "../database/sqlite";
import { logMqttMessage, logSyncHistory } from "../logger/db-logger";
import { formatLogLine } from "../logger/file-logger";
import { getFieldName, handleCardReader, handleVitalSign } from "./session-manager";

export type MessageContext = {
  mysqlPool: MySqlPool;
  sqlite: SqliteDb;
  writeLog: (message: string) => void;
  emit?: (channel: string, payload?: unknown) => void;
  getMySqlStatus?: () => { connected: boolean };
};

type PendingMeasurementRow = {
  id: number;
  idcard: string;
  device_type: string;
  value: string | null;
  measured_at: string | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
};

const MAX_REPLAY_ATTEMPTS = 3;

type PersonRecord = {
  pid: number;
  pcucodeperson: string;
};

type VisitRecord = {
  pcucode: string;
  visitno: number;
  visitdate: string;
};

const resolveBpMySqlField = async (
  mysqlPool: MySqlPool,
  params: { pcucode: string; visitno: number }
): Promise<"pressure" | "pressure2"> => {
  try {
    const rows = await mysqlQuery<Array<{ pressure: string | null; pressure2: string | null }>>(
      mysqlPool,
      `SELECT pressure, pressure2
       FROM visit
       WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()
       LIMIT 1`,
      [params.pcucode, params.visitno]
    );
    const visit = rows[0];
    const hasPressure = Boolean(visit?.pressure && String(visit.pressure).trim());
    return hasPressure ? "pressure2" : "pressure";
  } catch (_error) {
    // If pressure2 column is missing or query fails, fall back to pressure.
    return "pressure";
  }
};

const toSqliteDate = (value: unknown) => {
  if (value instanceof Date) {
    return value.toUTCString();
  }
  if (typeof value === "string") {
    return value;
  }
  return value == null ? null : String(value);
};

const normalizeIdcardValue = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toUpperCase();
};

const enqueuePendingCardReader = (ctx: MessageContext, params: { idcard: string; timestamp?: string }) => {
  sqliteRun(
    ctx.sqlite,
    `INSERT INTO pending_cardreader (idcard, timestamp, status)
     VALUES (?, ?, 'pending')`,
    [params.idcard, params.timestamp ?? null]
  );
};

const enqueuePendingMeasurement = (
  ctx: MessageContext,
  params: {
    idcard: string;
    deviceType: string;
    value: string | number | null;
    measuredAt?: string;
    errorMessage?: string | null;
  }
) => {
  sqliteRun(
    ctx.sqlite,
    `INSERT INTO pending_measurements
     (idcard, device_type, value, measured_at, status, attempt_count, max_attempts, last_error)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [
      params.idcard,
      params.deviceType,
      params.value == null ? null : String(params.value),
      params.measuredAt ?? null,
      MAX_REPLAY_ATTEMPTS,
      params.errorMessage ?? null
    ]
  );
};

const upsertLocalSessionForIdcard = (ctx: MessageContext, idcard: string) => {
  // If the session already exists for this idcard, only refresh last_update.
  const existing = sqliteGet<{ id: number }>(
    ctx.sqlite,
    "SELECT id FROM active_sessions WHERE idcard = ?",
    [idcard]
  );
  if (existing) {
    sqliteRun(
      ctx.sqlite,
      "UPDATE active_sessions SET is_temp = 0, last_update = datetime('now') WHERE id = ?",
      [existing.id]
    );
    return;
  }

  let tempSession: { id: number; idcard: string | null; is_temp?: number | null } | undefined;
  try {
    tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      ctx.sqlite,
      `SELECT id, idcard, is_temp FROM active_sessions
       WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  } catch (_error) {
    tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      ctx.sqlite,
      `SELECT id, idcard, 0 as is_temp FROM active_sessions
       WHERE idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  }

  // If there is no temp row, reuse the most-recent session row as the active row.
  if (!tempSession) {
    try {
      tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
        ctx.sqlite,
        `SELECT id, idcard, is_temp FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    } catch (_error) {
      tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
        ctx.sqlite,
        `SELECT id, idcard, 0 as is_temp FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    }
  }

  const reusedIdcard = normalizeIdcardValue(tempSession?.idcard ?? "");
  const preserveMeasurements = Boolean(tempSession) && (!reusedIdcard || Boolean(tempSession?.is_temp));

  if (tempSession) {
    try {
      sqliteRun(
        ctx.sqlite,
        "DELETE FROM active_sessions WHERE (is_temp = 1 OR idcard IS NULL OR idcard = '') AND id != ?",
        [tempSession.id]
      );
    } catch (_error) {
      sqliteRun(
        ctx.sqlite,
        "DELETE FROM active_sessions WHERE (idcard IS NULL OR idcard = '') AND id != ?",
        [tempSession.id]
      );
    }
    sqliteRun(ctx.sqlite, "DELETE FROM active_sessions WHERE idcard = ? AND id != ?", [idcard, tempSession.id]);
    if (preserveMeasurements) {
      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = NULL, pcucode = NULL, pcucodeperson = NULL,
             visitno = NULL, visitdate = NULL,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [idcard, tempSession.id]
      );
    } else {
      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = NULL, pcucode = NULL, pcucodeperson = NULL,
             visitno = NULL, visitdate = NULL,
             weight = NULL, height = NULL, pressure = NULL, temperature = NULL, pulse = NULL,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [idcard, tempSession.id]
      );
    }
    return;
  }

  try {
    sqliteRun(
      ctx.sqlite,
      "DELETE FROM active_sessions WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''"
    );
  } catch (_error) {
    sqliteRun(ctx.sqlite, "DELETE FROM active_sessions WHERE idcard IS NULL OR idcard = ''");
  }
  sqliteRun(ctx.sqlite, "DELETE FROM active_sessions WHERE idcard = ?", [idcard]);
  sqliteRun(
    ctx.sqlite,
    `INSERT OR REPLACE INTO active_sessions
     (idcard, session_start, last_update, is_temp)
     VALUES (?, datetime('now'), datetime('now'), 0)`,
    [idcard]
  );
};

const ensureSessionForIdcard = async (ctx: MessageContext, idcard: string) => {
  // If a session already exists for this idcard, refresh its metadata without clearing values.
  const existing = sqliteGet<{ id: number }>(
    ctx.sqlite,
    "SELECT id FROM active_sessions WHERE idcard = ?",
    [idcard]
  );

  const personRows = await mysqlQuery<PersonRecord[]>(
    ctx.mysqlPool,
    "SELECT pid, pcucodeperson FROM person WHERE idcard = ?",
    [idcard]
  );
  const person = personRows[0];
  if (!person) {
    return null;
  }

  const visitRows = await mysqlQuery<VisitRecord[]>(
    ctx.mysqlPool,
    `SELECT pcucode, visitno, visitdate
     FROM visit
     WHERE pcucodeperson = ? AND pid = ? AND visitdate = CURDATE()
     ORDER BY visitno DESC
     LIMIT 1`,
    [person.pcucodeperson, person.pid]
  );
  const visit = visitRows[0];
  if (!visit) {
    return null;
  }

  if (existing) {
    sqliteRun(
      ctx.sqlite,
      `UPDATE active_sessions
       SET pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?, is_temp = 0,
           last_update = datetime('now')
       WHERE id = ?`,
      [
        person.pid,
        visit.pcucode,
        person.pcucodeperson,
        visit.visitno,
        toSqliteDate(visit.visitdate),
        existing.id
      ]
    );
    return { idcard, pcucode: visit.pcucode, visitno: visit.visitno };
  }

  let sessionRow: { id: number; idcard: string | null; is_temp?: number | null } | undefined;
  try {
    sessionRow = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      ctx.sqlite,
      `SELECT id, idcard, is_temp FROM active_sessions
       WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  } catch (_error) {
    sessionRow = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      ctx.sqlite,
      `SELECT id, idcard, 0 as is_temp FROM active_sessions
       WHERE idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  }
  if (!sessionRow) {
    try {
      sessionRow = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
        ctx.sqlite,
        `SELECT id, idcard, is_temp FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    } catch (_error) {
      sessionRow = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
        ctx.sqlite,
        `SELECT id, idcard, 0 as is_temp FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    }
  }

  if (sessionRow) {
    const reusedIdcard = normalizeIdcardValue(sessionRow.idcard ?? "");
    const preserveMeasurements = !reusedIdcard || Boolean(sessionRow.is_temp);

    sqliteRun(ctx.sqlite, "DELETE FROM active_sessions WHERE idcard = ? AND id != ?", [idcard, sessionRow.id]);
    if (preserveMeasurements) {
      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [
          idcard,
          person.pid,
          visit.pcucode,
          person.pcucodeperson,
          visit.visitno,
          toSqliteDate(visit.visitdate),
          sessionRow.id
        ]
      );
    } else {
      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?,
             weight = NULL, height = NULL, pressure = NULL, temperature = NULL, pulse = NULL,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [
          idcard,
          person.pid,
          visit.pcucode,
          person.pcucodeperson,
          visit.visitno,
          toSqliteDate(visit.visitdate),
          sessionRow.id
        ]
      );
    }
  } else {
    sqliteRun(
      ctx.sqlite,
      `INSERT OR REPLACE INTO active_sessions
       (idcard, pid, pcucode, pcucodeperson, visitno, visitdate, session_start, last_update, is_temp)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)`,
      [
        idcard,
        person.pid,
        visit.pcucode,
        person.pcucodeperson,
        visit.visitno,
        toSqliteDate(visit.visitdate)
      ]
    );
  }

  return { idcard, pcucode: visit.pcucode, visitno: visit.visitno };
};

const replayPendingForIdcard = async (ctx: MessageContext, idcard: string) => {
  const session = sqliteGet<{ id: number; pcucode: string; visitno: number }>(
    ctx.sqlite,
    "SELECT id, pcucode, visitno FROM active_sessions WHERE idcard = ?",
    [idcard]
  );
  if (!session) {
    return;
  }

  const pending = sqliteAll<PendingMeasurementRow>(
    ctx.sqlite,
    `SELECT id, idcard, device_type, value, measured_at, status, attempt_count, max_attempts
     FROM pending_measurements
     WHERE idcard = ? AND status = 'pending'
     ORDER BY created_at ASC`,
    [idcard]
  );

  for (const item of pending) {
    const sqliteFieldName = getFieldName(item.device_type as "weight" | "height" | "bp" | "bp2" | "temp" | "pulse" | "spo2");
    
    // ถ้า device type ไม่รองรับ (เช่น spo2) ให้ skip
    if (!sqliteFieldName) {
      sqliteRun(
        ctx.sqlite,
        `UPDATE pending_measurements
         SET status = 'skipped', last_error = 'Device type not supported in database', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [item.id]
      );
      continue;
    }
    
    const mysqlFieldName =
      item.device_type === "bp" || item.device_type === "bp2"
        ? await resolveBpMySqlField(ctx.mysqlPool, { pcucode: session.pcucode, visitno: session.visitno })
        : sqliteFieldName;
    const nextAttempt = (item.attempt_count ?? 0) + 1;
    const maxAttempts = item.max_attempts ?? MAX_REPLAY_ATTEMPTS;
    try {
      await mysqlQuery(
        ctx.mysqlPool,
        `UPDATE visit SET ${mysqlFieldName} = ?, dateupdate = NOW()
         WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()`,
        [item.value, session.pcucode, session.visitno]
      );

      sqliteRun(
        ctx.sqlite,
        `UPDATE pending_measurements
         SET status = 'replayed', attempt_count = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextAttempt, item.id]
      );

      logSyncHistory(ctx.sqlite, {
        sessionId: session.id,
        idcard,
        visitno: session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: "replay_success"
      });

      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET ${sqliteFieldName} = ?, last_update = datetime('now')
         WHERE idcard = ?`,
        [item.value, idcard]
      );

      ctx.emit?.("session:updated", { idcard, field: sqliteFieldName });
      ctx.emit?.("data:updated", { idcard, field: sqliteFieldName, value: item.value });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown_error";
      const failed = nextAttempt >= maxAttempts;
      sqliteRun(
        ctx.sqlite,
        `UPDATE pending_measurements
         SET status = ?, attempt_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [failed ? "failed" : "pending", nextAttempt, messageText, item.id]
      );

      logSyncHistory(ctx.sqlite, {
        sessionId: session.id,
        idcard,
        visitno: session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: failed ? "replay_failed" : "replay_pending",
        errorMessage: messageText
      });
    }
  }
};

export const autoReplayPending = async (ctx: MessageContext) => {
  const pendingCardReaders = sqliteAll<{ idcard: string }>(
    ctx.sqlite,
    "SELECT DISTINCT idcard FROM pending_cardreader WHERE status = 'pending'"
  );
  const pendingMeasurements = sqliteAll<{ idcard: string }>(
    ctx.sqlite,
    "SELECT DISTINCT idcard FROM pending_measurements WHERE status = 'pending'"
  );

  const idcards = Array.from(
    new Set([
      ...pendingCardReaders.map((row) => row.idcard),
      ...pendingMeasurements.map((row) => row.idcard)
    ])
  );

  for (const idcard of idcards) {
    const session = await ensureSessionForIdcard(ctx, idcard);
    if (!session) {
      continue;
    }

    sqliteRun(
      ctx.sqlite,
      `UPDATE pending_cardreader
       SET status = 'replayed', updated_at = CURRENT_TIMESTAMP
       WHERE idcard = ? AND status = 'pending'`,
      [idcard]
    );

    await replayPendingForIdcard(ctx, idcard);
  }
};

/**
 * Handles combined vitals payload (new unified format)
 * Processes all vital measurements in a single topic
 */
const handleCombinedVitals = async (
  ctx: MessageContext,
  payload: any,
  idcardValue: string | null
) => {
  const measurements: Array<{
    deviceType: "weight" | "height" | "bp" | "temp" | "pulse";
    value: number | string | null;
  }> = [];

  // Extract measurements from payload
  if (payload.weight != null) measurements.push({ deviceType: "weight", value: payload.weight });
  if (payload.height != null) measurements.push({ deviceType: "height", value: payload.height });
  if (payload.bp != null) measurements.push({ deviceType: "bp", value: payload.bp });
  if (payload.pressure != null) measurements.push({ deviceType: "bp", value: payload.pressure });
  if (payload.temp != null) measurements.push({ deviceType: "temp", value: payload.temp });
  if (payload.temperature != null) measurements.push({ deviceType: "temp", value: payload.temperature });
  if (payload.pulse != null) measurements.push({ deviceType: "pulse", value: payload.pulse });

  if (measurements.length === 0) {
    ctx.writeLog(formatLogLine("[MQTT]", "[WARNING] No vital measurements in payload"));
    return;
  }

  // Check if session exists, if not create one automatically (for unified vitals)
  if (idcardValue) {
    const existingSession = sqliteGet<{ id: number }>(
      ctx.sqlite,
      "SELECT id FROM active_sessions WHERE idcard = ?",
      [idcardValue]
    );

    if (!existingSession) {
      // Try to create session from MySQL if connected
      if (ctx.getMySqlStatus && ctx.getMySqlStatus().connected) {
        try {
          const session = await ensureSessionForIdcard(ctx, idcardValue);
          if (session) {
            ctx.writeLog(formatLogLine("[SESSION]", `[AUTO-CREATED] Session for ${idcardValue}`));
          } else {
            // Person or visit not found, create local session
            upsertLocalSessionForIdcard(ctx, idcardValue);
            ctx.writeLog(formatLogLine("[SESSION]", `[LOCAL] Session created for ${idcardValue} (visit not found)`));
          }
        } catch (error) {
          // Error creating session, create local session
          upsertLocalSessionForIdcard(ctx, idcardValue);
          ctx.writeLog(formatLogLine("[SESSION]", `[LOCAL] Session created for ${idcardValue} (error: ${error})`));
        }
      } else {
        // MySQL not connected, create local session
        upsertLocalSessionForIdcard(ctx, idcardValue);
        ctx.writeLog(formatLogLine("[SESSION]", `[LOCAL] Session created for ${idcardValue} (MySQL offline)`));
      }
      
      // Emit session started event
      ctx.emit?.("session:started", { idcard: idcardValue });
    }
  }

  // Process each measurement
  for (const { deviceType, value } of measurements) {
    let result = await handleVitalSign(ctx.mysqlPool, ctx.sqlite, {
      idcard: idcardValue,
      deviceType,
      value
    });

    // If vitals arrive with an idcard but there is no session yet, auto-create it and retry once.
    if (!result.ok && result.reason === "session_not_found" && idcardValue) {
      if (ctx.getMySqlStatus && ctx.getMySqlStatus().connected) {
        try {
          const session = await ensureSessionForIdcard(ctx, idcardValue);
          if (session) {
            ctx.emit?.("session:started", { idcard: idcardValue });
          } else {
            upsertLocalSessionForIdcard(ctx, idcardValue);
            ctx.emit?.("session:started", { idcard: idcardValue });
          }
        } catch (_error) {
          upsertLocalSessionForIdcard(ctx, idcardValue);
          ctx.emit?.("session:started", { idcard: idcardValue });
        }
      } else {
        upsertLocalSessionForIdcard(ctx, idcardValue);
        ctx.emit?.("session:started", { idcard: idcardValue });
      }

      result = await handleVitalSign(ctx.mysqlPool, ctx.sqlite, {
        idcard: idcardValue,
        deviceType,
        value
      });
    }

    if (!result.ok || !result.fieldName) {
      if (result.reason === "session_not_found") {
        enqueuePendingMeasurement(ctx, {
          idcard: idcardValue ?? "",
          deviceType,
          value: value ?? null,
          measuredAt: payload.timestamp,
          errorMessage: result.reason
        });
        logSyncHistory(ctx.sqlite, {
          sessionId: null,
          idcard: idcardValue ?? "",
          visitno: null,
          fieldsUpdated: [deviceType],
          status: "replay_pending",
          errorMessage: result.reason
        });
      }
      ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] ${result.reason}`));
      continue;
    }

    if (result.session.visitno == null || result.session.pcucode == null) {
      enqueuePendingMeasurement(ctx, {
        idcard: idcardValue ?? "",
        deviceType,
        value: value ?? null,
        measuredAt: payload.timestamp,
        errorMessage: "visit_not_found_today"
      });
      logSyncHistory(ctx.sqlite, {
        sessionId: result.session.id,
        idcard: idcardValue ?? "",
        visitno: result.session.visitno,
        fieldsUpdated: [result.fieldName],
        status: "replay_pending",
        errorMessage: "visit_not_found_today"
      });
      ctx.writeLog(
        formatLogLine("[SESSION]", `[PENDING] visit not found today for ${idcardValue ?? "(temp)"}`)
      );
      ctx.emit?.("session:updated", { idcard: idcardValue, field: result.fieldName });
      ctx.emit?.("data:updated", { idcard: idcardValue, field: result.fieldName, value });
      continue;
    }

    try {
      let mysqlFieldName = result.fieldName;
      if (deviceType === "bp") {
        mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
          pcucode: result.session.pcucode,
          visitno: result.session.visitno
        });
      }
      await mysqlQuery(
        ctx.mysqlPool,
        `UPDATE visit SET ${mysqlFieldName} = ?, dateupdate = NOW()
         WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()`,
        [value, result.session.pcucode, result.session.visitno]
      );

      logSyncHistory(ctx.sqlite, {
        sessionId: result.session.id,
        idcard: idcardValue ?? "",
        visitno: result.session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: "success"
      });

      // Update SQLite active_sessions for Frontend display using session ID
      sqliteRun(
        ctx.sqlite,
        `UPDATE active_sessions
         SET ${result.fieldName} = ?, last_update = datetime('now')
         WHERE id = ?`,
        [value, result.session.id]
      );

      ctx.writeLog(formatLogLine("[MQTT]", `[UPDATED] ${result.fieldName}=${value}`));
      ctx.emit?.("session:updated", { idcard: idcardValue, field: result.fieldName });
      ctx.emit?.("data:updated", { idcard: idcardValue, field: result.fieldName, value });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown_error";
      let mysqlFieldName = result.fieldName;
      if (deviceType === "bp" && result.session.pcucode && result.session.visitno != null) {
        mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
          pcucode: result.session.pcucode,
          visitno: result.session.visitno
        });
      }
      enqueuePendingMeasurement(ctx, {
        idcard: idcardValue ?? "",
        deviceType,
        value: value ?? null,
        measuredAt: payload.timestamp,
        errorMessage: messageText
      });
      logSyncHistory(ctx.sqlite, {
        sessionId: result.session.id,
        idcard: idcardValue ?? "",
        visitno: result.session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: "replay_pending",
        errorMessage: messageText
      });
      ctx.writeLog(formatLogLine("[MYSQL]", `[ERROR] ${messageText}`));
    }
  }
};

export const processMqttMessage = async (
  ctx: MessageContext,
  params: { topic: string; deviceType: string; message: string }
) => {
  const { topic, deviceType, message } = params;
  let payload: any;
  try {
    payload = JSON.parse(message);
  } catch (error) {
    logMqttMessage(ctx.sqlite, {
      topic,
      deviceType,
      payload: message,
      status: "error",
      errorMessage: "invalid_json"
    });
    ctx.writeLog(formatLogLine("[MQTT]", "[ERROR] Invalid JSON", message));
    return;
  }

  logMqttMessage(ctx.sqlite, {
    topic,
    deviceType,
    idcard: payload.idcard,
    payload: message
  });

  const normalizeIdcard = (value: unknown) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const lower = trimmed.toLowerCase();
    if (lower === "stringisnullorempty" || lower === "null") {
      return "";
    }
    return trimmed.toUpperCase();
  };

  // Handle new combined vitals topic
  if (deviceType === "vitals") {
    const idcardValue = normalizeIdcard(payload.idcard) || null;
    await handleCombinedVitals(ctx, payload, idcardValue);
    return;
  }

  if (deviceType === "cardreader") {
    const idcardValue = normalizeIdcard(payload.idcard);
    if (!idcardValue) {
      sqliteRun(ctx.sqlite, "DELETE FROM sync_history");
      sqliteRun(ctx.sqlite, "DELETE FROM pending_measurements");
      sqliteRun(ctx.sqlite, "DELETE FROM pending_cardreader");
      sqliteRun(ctx.sqlite, "DELETE FROM active_sessions");
      try {
        sqliteRun(
          ctx.sqlite,
          `INSERT INTO active_sessions
           (idcard, session_start, last_update, is_temp)
           VALUES (NULL, datetime('now'), NULL, 1)`
        );
      } catch (_error) {
        try {
          sqliteRun(
            ctx.sqlite,
            `INSERT INTO active_sessions
             (idcard, session_start, last_update, is_temp)
             VALUES ('', datetime('now'), NULL, 1)`
          );
        } catch (_innerError) {
          try {
            sqliteRun(
              ctx.sqlite,
              `UPDATE active_sessions
               SET idcard = '', pid = NULL, pcucode = NULL, pcucodeperson = NULL,
                   visitno = NULL, visitdate = NULL, weight = NULL, height = NULL,
                   pressure = NULL, temperature = NULL, pulse = NULL, is_temp = 1,
                   session_start = datetime('now'), last_update = NULL`
            );
          } catch (_finalError) {
            sqliteRun(
              ctx.sqlite,
              `INSERT INTO active_sessions
               (idcard, session_start, last_update)
               VALUES ('', datetime('now'), NULL)`
            );
          }
        }
      }
      ctx.writeLog(formatLogLine("[SESSION]", "[CLEARED] Waiting for new session"));
      ctx.emit?.("session:started", { idcard: null });
      ctx.emit?.("session:updated", { idcard: null, field: "reset" });
      return;
    }
    if (ctx.getMySqlStatus && !ctx.getMySqlStatus().connected) {
      upsertLocalSessionForIdcard(ctx, idcardValue);
      enqueuePendingCardReader(ctx, { idcard: idcardValue, timestamp: payload.timestamp });
      sqliteRun(
        ctx.sqlite,
        `UPDATE pending_measurements
         SET idcard = ?, updated_at = CURRENT_TIMESTAMP
         WHERE (idcard IS NULL OR idcard = '') AND status = 'pending'`,
        [idcardValue]
      );
      ctx.writeLog(
        formatLogLine("[SESSION]", `[PENDING] IDCard: ${idcardValue} (mysql disconnected)`)
      );
      ctx.emit?.("session:started", { idcard: idcardValue });
      return;
    }
    const result = await handleCardReader(ctx.mysqlPool, ctx.sqlite, {
      idcard: idcardValue,
      timestamp: payload.timestamp
    });
    if (!result.ok) {
      ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] ${result.reason}`));
    } else {
      if (result.pendingVisit) {
        enqueuePendingCardReader(ctx, { idcard: idcardValue, timestamp: payload.timestamp });
        ctx.writeLog(
          formatLogLine("[SESSION]", `[PENDING] IDCard: ${idcardValue} (visit not found today)`)
        );
        ctx.emit?.("session:started", { idcard: idcardValue });
      } else {
        sqliteRun(
          ctx.sqlite,
          `UPDATE pending_measurements
           SET idcard = ?, updated_at = CURRENT_TIMESTAMP
           WHERE (idcard IS NULL OR idcard = '') AND status = 'pending'`,
          [idcardValue]
        );
        ctx.writeLog(
          formatLogLine("[SESSION]", `[STARTED] IDCard: ${idcardValue}`)
        );
        sqliteRun(
          ctx.sqlite,
          `UPDATE pending_cardreader SET status = 'replayed', updated_at = CURRENT_TIMESTAMP
           WHERE idcard = ? AND status = 'pending'`,
          [idcardValue]
        );
        ctx.emit?.("session:started", { idcard: idcardValue });
        await replayPendingForIdcard(ctx, idcardValue);
      }
    }
    return;
  }

  const value =
    payload.weight ??
    payload.height ??
    payload.pressure ??
    payload.temperature ??
    payload.pulse;
  const deviceTypeMap = deviceType === "bp" ? "bp" : deviceType;
  const idcardValue = normalizeIdcard(payload.idcard) || null;
  let result = await handleVitalSign(ctx.mysqlPool, ctx.sqlite, {
    idcard: idcardValue,
    deviceType: deviceTypeMap as "weight" | "height" | "bp" | "temp" | "pulse",
    value
  });

  // For single-vitals topics: if an idcard is provided but no session exists, auto-create and retry once.
  if (!result.ok && result.reason === "session_not_found" && idcardValue) {
    if (ctx.getMySqlStatus && ctx.getMySqlStatus().connected) {
      try {
        const session = await ensureSessionForIdcard(ctx, idcardValue);
        if (!session) {
          upsertLocalSessionForIdcard(ctx, idcardValue);
        }
      } catch (_error) {
        upsertLocalSessionForIdcard(ctx, idcardValue);
      }
    } else {
      upsertLocalSessionForIdcard(ctx, idcardValue);
    }

    result = await handleVitalSign(ctx.mysqlPool, ctx.sqlite, {
      idcard: idcardValue,
      deviceType: deviceTypeMap as "weight" | "height" | "bp" | "temp" | "pulse",
      value
    });
  }

  if (!result.ok || !result.fieldName) {
    if (result.reason === "session_not_found") {
      enqueuePendingMeasurement(ctx, {
        idcard: idcardValue ?? "",
        deviceType: deviceTypeMap,
        value: value ?? null,
        measuredAt: payload.timestamp,
        errorMessage: result.reason
      });
      logSyncHistory(ctx.sqlite, {
        sessionId: null,
        idcard: idcardValue ?? "",
        visitno: null,
        fieldsUpdated: [deviceTypeMap],
        status: "replay_pending",
        errorMessage: result.reason
      });
    }
    ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] ${result.reason}`));
    return;
  }

  if (result.session.visitno == null || result.session.pcucode == null) {
    enqueuePendingMeasurement(ctx, {
      idcard: idcardValue ?? "",
      deviceType: deviceTypeMap,
      value: value ?? null,
      measuredAt: payload.timestamp,
      errorMessage: "visit_not_found_today"
    });
    logSyncHistory(ctx.sqlite, {
      sessionId: result.session.id,
      idcard: idcardValue ?? "",
      visitno: result.session.visitno,
      fieldsUpdated: [result.fieldName],
      status: "replay_pending",
      errorMessage: "visit_not_found_today"
    });
    ctx.writeLog(
      formatLogLine("[SESSION]", `[PENDING] visit not found today for ${idcardValue ?? "(temp)"}`)
    );
    ctx.emit?.("session:updated", { idcard: idcardValue, field: result.fieldName });
    ctx.emit?.("data:updated", { idcard: idcardValue, field: result.fieldName, value });
    return;
  }

  try {
    let mysqlFieldName = result.fieldName;
    if (deviceTypeMap === "bp") {
      mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
        pcucode: result.session.pcucode,
        visitno: result.session.visitno
      });
    }
    await mysqlQuery(
      ctx.mysqlPool,
      `UPDATE visit SET ${mysqlFieldName} = ?, dateupdate = NOW()
       WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()`,
      [value, result.session.pcucode, result.session.visitno]
    );

    logSyncHistory(ctx.sqlite, {
      sessionId: result.session.id,
      idcard: idcardValue ?? "",
      visitno: result.session.visitno,
      fieldsUpdated: [mysqlFieldName],
      status: "success"
    });

    ctx.writeLog(
      formatLogLine("[MQTT]", `[UPDATED] ${result.fieldName}=${value}`)
    );
    ctx.emit?.("session:updated", { idcard: idcardValue, field: result.fieldName });
    ctx.emit?.("data:updated", { idcard: idcardValue, field: result.fieldName, value });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "unknown_error";
    let mysqlFieldName = result.fieldName;
    if (deviceTypeMap === "bp" && result.session.pcucode && result.session.visitno != null) {
      mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
        pcucode: result.session.pcucode,
        visitno: result.session.visitno
      });
    }
    enqueuePendingMeasurement(ctx, {
      idcard: idcardValue ?? "",
      deviceType: deviceTypeMap,
      value: value ?? null,
      measuredAt: payload.timestamp,
      errorMessage: messageText
    });
    logSyncHistory(ctx.sqlite, {
      sessionId: result.session.id,
      idcard: idcardValue ?? "",
      visitno: result.session.visitno,
      fieldsUpdated: [mysqlFieldName],
      status: "replay_pending",
      errorMessage: messageText
    });
    ctx.writeLog(formatLogLine("[MYSQL]", `[ERROR] ${messageText}`));
  }
};
