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
  showNotification?: (idcard: string) => void;
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
  ctx.writeLog(formatLogLine("[DEBUG]", `========== handleCombinedVitals START ==========`));
  ctx.writeLog(formatLogLine("[DEBUG]", `Payload received: ${JSON.stringify(payload)}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `idcardValue: ${idcardValue ?? 'null'}`));
  
  // Log all available fields
  ctx.writeLog(formatLogLine("[DEBUG]", `Available fields in payload:`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - weight: ${payload.weight ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - height: ${payload.height ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - bp: ${payload.bp ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - bp2: ${payload.bp2 ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - pressure: ${payload.pressure ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - temp: ${payload.temp ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - temperature: ${payload.temperature ?? 'not present'}`));
  ctx.writeLog(formatLogLine("[DEBUG]", `  - pulse: ${payload.pulse ?? 'not present'}`));
  
  const measurements: Array<{
    deviceType: "weight" | "height" | "bp" | "bp2" | "temp" | "pulse";
    value: number | string | null;
  }> = [];

  // Extract measurements from payload (already flattened by processMqttMessage)
  if (payload.weight != null) {
    measurements.push({ deviceType: "weight", value: payload.weight });
    ctx.writeLog(formatLogLine("[DEBUG]", `✅ Extracted weight: ${payload.weight}`));
  } else {
    ctx.writeLog(formatLogLine("[DEBUG]", `❌ Weight is null/undefined`));
  }
  if (payload.height != null) {
    measurements.push({ deviceType: "height", value: payload.height });
    ctx.writeLog(formatLogLine("[DEBUG]", `✅ Extracted height: ${payload.height}`));
  } else {
    ctx.writeLog(formatLogLine("[DEBUG]", `❌ Height is null/undefined`));
  }
  
  // Combine bp and bp2 into a single "bp/bp2" format measurement
  if (payload.bp != null && payload.bp2 != null) {
    const combinedBP = `${payload.bp}/${payload.bp2}`;
    measurements.push({ deviceType: "bp", value: combinedBP });
    ctx.writeLog(formatLogLine("[DEBUG]", `Combined BP: ${combinedBP} from bp=${payload.bp}, bp2=${payload.bp2}`));
  } else if (payload.bp != null) {
    measurements.push({ deviceType: "bp", value: payload.bp });
  } else if (payload.bp2 != null) {
    measurements.push({ deviceType: "bp2", value: payload.bp2 });
  }
  
  if (payload.pressure != null) measurements.push({ deviceType: "bp", value: payload.pressure });
  if (payload.temp != null) measurements.push({ deviceType: "temp", value: payload.temp });
  if (payload.temperature != null) measurements.push({ deviceType: "temp", value: payload.temperature });
  if (payload.pulse != null) measurements.push({ deviceType: "pulse", value: payload.pulse });

  ctx.writeLog(formatLogLine("[DEBUG]", `Extracted ${measurements.length} measurements: ${measurements.map(m => `${m.deviceType}=${m.value}`).join(', ')}`));
  
  if (measurements.length === 0) {
    ctx.writeLog(formatLogLine("[MQTT]", "[WARNING] No vital measurements in payload"));
    return;
  }

  // ===== กรณีมี ID Card (เครื่องที่ 1: BP Monitor) =====
  if (idcardValue) {
    ctx.writeLog(formatLogLine("[DEBUG]", `========== RECEIVED ID CARD: ${idcardValue} ==========`));
    
    // ตรวจสอบ session ปัจจุบัน - ถ้ามี session เก่าที่ idcard ต่างกัน และยังไม่สมบูรณ์ (ไม่มีน้ำหนัก-ส่วนสูง) → ล้างทิ้ง
    const existingSession = sqliteGet<{ 
      id: number; 
      idcard: string | null; 
      weight: number | null; 
      height: number | null;
      is_temp?: number | null;
    }>(
      ctx.sqlite,
      `SELECT id, idcard, weight, height, is_temp 
       FROM active_sessions 
       WHERE (is_temp IS NULL OR is_temp = 0)
       ORDER BY last_update DESC 
       LIMIT 1`
    );
    
    if (existingSession && existingSession.idcard && existingSession.idcard !== idcardValue) {
      // มี session เก่าที่ idcard ต่างกัน
      const hasWeight = existingSession.weight != null;
      const hasHeight = existingSession.height != null;
      
      if (!hasWeight || !hasHeight) {
        // Session เก่ายังไม่สมบูรณ์ (ไม่มีน้ำหนักหรือส่วนสูง) → ล้างทิ้ง
        ctx.writeLog(
          formatLogLine(
            "[SESSION]", 
            `[CLEAR] Clearing incomplete session ${existingSession.idcard} (weight=${hasWeight ? '✓' : '✗'}, height=${hasHeight ? '✓' : '✗'}) - New ID Card ${idcardValue} detected`
          )
        );
        
        sqliteRun(ctx.sqlite, "DELETE FROM active_sessions WHERE id = ?", [existingSession.id]);
        sqliteRun(ctx.sqlite, "DELETE FROM pending_measurements WHERE idcard = ?", [existingSession.idcard]);
        
        ctx.emit?.("session:cleared", { 
          idcard: existingSession.idcard,
          reason: "incomplete_session_replaced"
        });
      } else {
        ctx.writeLog(
          formatLogLine(
            "[SESSION]", 
            `[KEEP] Previous session ${existingSession.idcard} is complete (weight=✓, height=✓) - Creating new session for ${idcardValue}`
          )
        );
      }
    }
    
    // บังคับ lookup ทุกครั้งเมื่อมี idcard เพื่อให้ PID/Visit No แสดงทันทีใน Active Session
    if (ctx.getMySqlStatus && ctx.getMySqlStatus().connected) {
      ctx.writeLog(formatLogLine("[DEBUG]", "MySQL is CONNECTED - proceeding with person/visit lookup"));
      try {
        ctx.writeLog(formatLogLine("[DEBUG]", `Calling handleCardReader for idcard: ${idcardValue}`));
        const cardResult = await handleCardReader(ctx.mysqlPool, ctx.sqlite, {
          idcard: idcardValue,
          timestamp: payload.timestamp
        });
        ctx.writeLog(formatLogLine("[DEBUG]", `handleCardReader result: ok=${cardResult.ok}, person=${cardResult.person ? `PID=${cardResult.person.pid}` : 'null'}, visit=${cardResult.visit ? `visitno=${cardResult.visit.visitno}` : 'null'}, pendingVisit=${cardResult.pendingVisit}, reason=${cardResult.reason || 'none'}`));

        if (cardResult.ok) {
          if (cardResult.pendingVisit) {
            ctx.writeLog(
              formatLogLine(
                "[SESSION]",
                `[PENDING] IDCard=${idcardValue}, PID=${cardResult.person?.pid ?? "-"} (visit not found today)`
              )
            );
          } else {
            ctx.writeLog(
              formatLogLine(
                "[SESSION]",
                `[RESOLVED] IDCard=${idcardValue}, PID=${cardResult.person?.pid ?? "-"}, VisitNo=${cardResult.visit?.visitno ?? "-"}, PCU=${cardResult.visit?.pcucode ?? "-"}`
              )
            );
          }
          ctx.emit?.("session:started", { idcard: idcardValue });
          ctx.emit?.("session:updated", { idcard: idcardValue, field: "identity" });
        } else {
          ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] Card reader failed: ${cardResult.reason}`));
          upsertLocalSessionForIdcard(ctx, idcardValue);
          ctx.emit?.("session:started", { idcard: idcardValue });
        }
      } catch (error) {
        ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] Card reader exception: ${error}`));
        upsertLocalSessionForIdcard(ctx, idcardValue);
        ctx.emit?.("session:started", { idcard: idcardValue });
      }
    } else {
      // MySQL not connected, create local session
      upsertLocalSessionForIdcard(ctx, idcardValue);
      ctx.writeLog(formatLogLine("[SESSION]", `[LOCAL] Session created for ${idcardValue} (MySQL offline)`));
      ctx.emit?.("session:started", { idcard: idcardValue });
    }
  }
  // ===== กรณีไม่มี ID Card (เครื่องที่ 2: Scale - น้ำหนัก/ส่วนสูง) =====
  // กฎ: น้ำหนัก-ส่วนสูงจะต้อง stamp ตาม ID Card ล่าสุดเท่านั้น
  // ถ้าไม่เคยมี ID Card มาก่อน → ไม่บันทึก
  // ถ้าเวลาเกิน 5 นาที → ไม่บันทึก (ไม่ทำตามขั้นตอน)
  else {
    ctx.writeLog(formatLogLine("[SESSION]", "[WEIGHT/HEIGHT] Received measurement without ID Card - looking for latest session"));
    
    const latestSession = sqliteGet<{ 
      id: number; 
      idcard: string | null; 
      is_temp?: number | null;
      last_update: string;
    }>(
      ctx.sqlite,
      `SELECT id, idcard, is_temp, last_update
       FROM active_sessions 
       WHERE idcard IS NOT NULL AND idcard != '' AND (is_temp IS NULL OR is_temp = 0)
       ORDER BY last_update DESC 
       LIMIT 1`
    );

    if (!latestSession || !latestSession.idcard) {
      ctx.writeLog(
        formatLogLine(
          "[SESSION]", 
          "[REJECTED] ❌ No active session with ID Card found - Weight/Height requires ID Card scan first"
        )
      );
      ctx.emit?.("toast:show", {
        variant: "destructive",
        title: "❌ ID Card Required",
        description: "Please scan ID Card before measuring weight/height"
      });
      return;
    }

    // ตรวจสอบ Timeout (5 นาที)
    const lastUpdateTime = new Date(latestSession.last_update + ' UTC').getTime();
    const currentTime = Date.now();
    const timeDiffMinutes = (currentTime - lastUpdateTime) / (1000 * 60);
    const TIMEOUT_MINUTES = 5;
    
    ctx.writeLog(
      formatLogLine(
        "[SESSION]", 
        `[TIMEOUT-CHECK] Session ${latestSession.idcard} updated ${timeDiffMinutes.toFixed(2)} minutes ago (limit: ${TIMEOUT_MINUTES} min)`
      )
    );
    
    if (timeDiffMinutes > TIMEOUT_MINUTES) {
      ctx.writeLog(
        formatLogLine(
          "[SESSION]", 
          `[REJECTED] ⏱️ Session expired (${timeDiffMinutes.toFixed(2)} min > ${TIMEOUT_MINUTES} min) - Please scan ID Card again`
        )
      );
      ctx.emit?.("toast:show", {
        variant: "destructive",
        title: "⏱️ Session Expired",
        description: `Too late! Please scan ID Card again (${timeDiffMinutes.toFixed(1)} min exceeded)`
      });
      return;
    }

    // ใช้ idcard จาก session ล่าสุด
    idcardValue = latestSession.idcard;
    ctx.writeLog(
      formatLogLine(
        "[SESSION]", 
        `[ACCEPTED] ✅ Using session ${idcardValue} (${timeDiffMinutes.toFixed(2)} min ago, within ${TIMEOUT_MINUTES} min limit) for weight/height measurement`
      )
    );
  }

  // ===== ตรวจจับและ resolve visitno ถ้ายังเป็น null (session ยังไม่ได้ query MySQL visit) =====
  const currentSession = sqliteGet<{ id: number; visitno: number | null; pcucode: string | null; pid: number | null; pcucodeperson: string | null }>(
    ctx.sqlite,
    "SELECT id, visitno, pcucode, pid, pcucodeperson FROM active_sessions WHERE idcard = ?",
    [idcardValue]
  );

  if (currentSession && (currentSession.visitno == null || currentSession.pcucode == null)) {
    // Session มี idcard แต่ยัง parse ไม่มี visitno - ต้องหาจาก MySQL
    if (ctx.getMySqlStatus && ctx.getMySqlStatus().connected && currentSession.pid && currentSession.pcucodeperson) {
      try {
        const visitRows = await mysqlQuery<VisitRecord[]>(
          ctx.mysqlPool,
          `SELECT pcucode, visitno, visitdate
           FROM visit
           WHERE pcucodeperson = ? AND pid = ? AND visitdate = CURDATE()
           ORDER BY visitno DESC
           LIMIT 1`,
          [currentSession.pcucodeperson, currentSession.pid]
        );

        if (visitRows.length > 0) {
          const visit = visitRows[0];
          sqliteRun(
            ctx.sqlite,
            `UPDATE active_sessions
             SET pcucode = ?, visitno = ?, visitdate = ?, last_update = datetime('now')
             WHERE id = ?`,
            [visit.pcucode, visit.visitno, toSqliteDate(visit.visitdate), currentSession.id]
          );
          ctx.writeLog(formatLogLine("[SESSION]", `[RESOLVED] Found visitno=${visit.visitno} for ${idcardValue}`));
          ctx.emit?.("session:updated", { idcard: idcardValue, field: "visitno" });
        } else {
          ctx.writeLog(formatLogLine("[SESSION]", `[WARNING] No visit found today for ${idcardValue}`));
        }
      } catch (error) {
        ctx.writeLog(formatLogLine("[SESSION]", `[ERROR] Failed to resolve visitno: ${error}`));
      }
    }
  }

  // Process each measurement
  let updatedFields: string[] = [];
  for (const { deviceType, value } of measurements) {
    ctx.writeLog(formatLogLine("[DEBUG]", `Processing measurement: deviceType=${deviceType}, value=${value}, idcard=${idcardValue || '(none)'}`));
    ctx.writeLog(formatLogLine("[DEBUG]", `Current session in SQLite before processing:`));
    try {
      const currentSession = sqliteGet<any>(ctx.sqlite, 'SELECT * FROM active_sessions ORDER BY last_update DESC LIMIT 1');
      ctx.writeLog(formatLogLine("[DEBUG]", `Active session: id=${currentSession?.id}, idcard=${currentSession?.idcard}, weight=${currentSession?.weight}, height=${currentSession?.height}, pressure=${currentSession?.pressure}`));
    } catch (e) {
      ctx.writeLog(formatLogLine("[DEBUG]", `Could not read current session: ${e}`));
    }
    let result = await handleVitalSign(ctx.mysqlPool, ctx.sqlite, {
      idcard: idcardValue,
      deviceType,
      value
    });

    ctx.writeLog(formatLogLine("[DEBUG]", `handleVitalSign result: ok=${result.ok}, fieldName=${result.fieldName}, reason=${result.reason}`));

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
        formatLogLine("[SESSION]", `[PENDING] visit not found today for ${idcardValue ?? "(temp)"} - data saved to SQLite`)
      );
      ctx.writeLog(
        formatLogLine("[DEBUG]", `Emitting session:updated for field=${result.fieldName}, sessionId=${result.session.id}`)
      );
      ctx.emit?.("session:updated", { idcard: idcardValue || result.session.idcard, field: result.fieldName });
      ctx.emit?.("data:updated", { idcard: idcardValue || result.session.idcard, field: result.fieldName, value });
      updatedFields.push(result.fieldName);
      continue;
    }

    try {
      let mysqlFieldName = result.fieldName;
      // For BP measurements, check if we should stamp to pressure or pressure2
      if (deviceType === "bp" || deviceType === "bp2") {
        mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
          pcucode: result.session.pcucode,
          visitno: result.session.visitno
        });
      }
      
      // For BP measurements, read the combined value from SQLite (set by handleVitalSign)
      let stampValue = value;
      if (deviceType === "bp" || deviceType === "bp2") {
        const session = sqliteGet<{ pressure: string | null }>(
          ctx.sqlite,
          "SELECT pressure FROM active_sessions WHERE id = ?",
          [result.session.id]
        );
        if (session?.pressure) {
          stampValue = session.pressure;
          ctx.writeLog(formatLogLine("[DEBUG]", `Using combined BP value: ${stampValue} (original: ${value})`));
        }
      }
      
      ctx.writeLog(
        formatLogLine(
          "[MYSQL]",
          `[STAMP-ATTEMPT] Updating visit table: pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${stampValue}, idcard=${idcardValue ?? ""}`
        )
      );
      const updateResult = await mysqlQuery<{ affectedRows?: number }>(
        ctx.mysqlPool,
        `UPDATE visit SET ${mysqlFieldName} = ?, dateupdate = NOW()
         WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()`,
        [stampValue, result.session.pcucode, result.session.visitno]
      );
      ctx.writeLog(
        formatLogLine(
          "[MYSQL]",
          `[STAMP-RESULT] affectedRows=${updateResult?.affectedRows ?? 0}`
        )
      );

      if (!updateResult || !updateResult.affectedRows) {
        const reason = "visit_row_not_matched";
        enqueuePendingMeasurement(ctx, {
          idcard: idcardValue ?? "",
          deviceType,
          value: stampValue ?? null,
          measuredAt: payload.timestamp,
          errorMessage: reason
        });
        logSyncHistory(ctx.sqlite, {
          sessionId: result.session.id,
          idcard: idcardValue ?? "",
          visitno: result.session.visitno,
          fieldsUpdated: [mysqlFieldName],
          status: "replay_pending",
          errorMessage: reason
        });
        
        // Show error toast for failed stamp
        ctx.emit?.("toast:show", {
          variant: "destructive",
          title: "⚠️ Sync Failed",
          description: `Could not save ${mysqlFieldName} - will retry later`
        });
        
        ctx.writeLog(
          formatLogLine(
            "[MYSQL]",
            `[STAMP-SKIP] No row updated (idcard=${idcardValue ?? ""}, pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${stampValue})`
          )
        );
        continue;
      }

      logSyncHistory(ctx.sqlite, {
        sessionId: result.session.id,
        idcard: idcardValue ?? "",
        visitno: result.session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: "success"
      });
      
      // Show success toast for MySQL stamp
      ctx.emit?.("toast:show", {
        variant: "success",
        title: "✅ Data Synced",
        description: `${mysqlFieldName} saved to database`
      });

      // For BP, handleVitalSign already updated SQLite with combined value - don't overwrite it
      // For other measurements, update SQLite
      if (deviceType !== "bp" && deviceType !== "bp2") {
        sqliteRun(
          ctx.sqlite,
          `UPDATE active_sessions
           SET ${result.fieldName} = ?, last_update = datetime('now')
           WHERE id = ?`,
          [value, result.session.id]
        );
      }

      ctx.writeLog(formatLogLine("[MQTT]", `[UPDATED] ${result.fieldName}=${stampValue} for session_id=${result.session.id}, idcard=${idcardValue ?? 'none'}`));
      updatedFields.push(result.fieldName);
      ctx.writeLog(formatLogLine("[EVENT]", `Field ${result.fieldName} updated successfully`));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown_error";
      let mysqlFieldName = result.fieldName;
      if ((deviceType === "bp" || deviceType === "bp2") && result.session.pcucode && result.session.visitno != null) {
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
      ctx.writeLog(
        formatLogLine(
          "[MYSQL]",
          `[ERROR] Stamp failed (idcard=${idcardValue ?? ""}, pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${value}) reason=${messageText}`
        )
      );
    }
  }
  
  // Emit events once after all measurements processed
  if (updatedFields.length > 0) {
    ctx.writeLog(formatLogLine("[EVENT]", `Emitting session:updated and data:updated for ${updatedFields.length} field(s): ${updatedFields.join(', ')}`));
    ctx.emit?.("session:updated", { idcard: idcardValue, fields: updatedFields });
    ctx.emit?.("data:updated", { idcard: idcardValue, fields: updatedFields });
    
    // Show toast notification for data update
    ctx.emit?.("toast:show", {
      variant: "default",
      title: "📊 Data Updated",
      description: `Updated: ${updatedFields.join(', ')} for ${idcardValue || 'session'}`
    });
    
    // Show notification if idcard is available
    if (idcardValue && ctx.showNotification) {
      ctx.showNotification(idcardValue);
    }
  } else {
    ctx.writeLog(formatLogLine("[EVENT]", `No fields were successfully updated`));
  }
  
  ctx.writeLog(formatLogLine("[DEBUG]", `========== handleCombinedVitals END ==========`));
};

export const processMqttMessage = async (
  ctx: MessageContext,
  params: { topic: string; deviceType: string; message: string }
) => {
  const { topic, deviceType, message } = params;
  
  ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `========================================`));
  ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Topic: ${topic}`));
  ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `DeviceType: ${deviceType}`));
  ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Message: ${message}`));
  ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Message Length: ${message.length} chars`));
  
  let payload: any;
  try {
    payload = JSON.parse(message);
    ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Payload Keys: ${Object.keys(payload).join(', ')}`));
    if (payload.data) {
      ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Payload.data Keys: ${Object.keys(payload.data).join(', ')}`));
      ctx.writeLog(formatLogLine("[MQTT-RECEIVE]", `Payload.data: ${JSON.stringify(payload.data)}`));
    }
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

  // Extract vitals data from nested structure if present
  let vitalsPayload = payload;
  if (payload.data && typeof payload.data === 'object') {
    ctx.writeLog(formatLogLine("[MQTT-EXTRACT]", `Found nested data object, extracting vitals...`));
    ctx.writeLog(formatLogLine("[MQTT-EXTRACT]", `Nested data keys: ${Object.keys(payload.data).join(', ')}`));
    // Merge data from nested 'data' object to root level
    vitalsPayload = {
      ...payload,
      ...payload.data,
      idcard: payload.idcard || payload.data.idcard
    };
    ctx.writeLog(formatLogLine("[MQTT-EXTRACT]", `Merged payload keys: ${Object.keys(vitalsPayload).join(', ')}`));
    ctx.writeLog(formatLogLine("[MQTT-EXTRACT]", `Weight: ${vitalsPayload.weight}, Height: ${vitalsPayload.height}`));
  }

  // Handle combined vitals topic (vitals, blood_pressure, weight_height, etc.)
  if (deviceType === "vitals" || deviceType === "blood_pressure" || deviceType === "weight_height") {
    ctx.writeLog(formatLogLine("[MQTT-ROUTE]", `✅ Routing to handleCombinedVitals for deviceType: ${deviceType}`));
    const idcardValue = normalizeIdcard(vitalsPayload.idcard) || null;
    ctx.writeLog(formatLogLine("[MQTT-ROUTE]", `Extracted idcard: ${idcardValue ?? '(null - no ID card)'}`));
    ctx.writeLog(formatLogLine("[MQTT-ROUTE]", `Payload to handleCombinedVitals: ${JSON.stringify(vitalsPayload)}`));
    await handleCombinedVitals(ctx, vitalsPayload, idcardValue);
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
          formatLogLine(
            "[SESSION]",
            `[STARTED] IDCard=${idcardValue}, PID=${result.person?.pid ?? "-"}, VisitNo=${result.visit?.visitno ?? "-"}, PCU=${result.visit?.pcucode ?? "-"}`
          )
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
    if (deviceTypeMap === "bp" || deviceTypeMap === "bp2") {
      mysqlFieldName = await resolveBpMySqlField(ctx.mysqlPool, {
        pcucode: result.session.pcucode,
        visitno: result.session.visitno
      });
    }
    ctx.writeLog(
      formatLogLine(
        "[MYSQL]",
        `[STAMP-ATTEMPT] Updating visit table: pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${value}, idcard=${idcardValue ?? ""}`
      )
    );
    const updateResult = await mysqlQuery<{ affectedRows?: number }>(
      ctx.mysqlPool,
      `UPDATE visit SET ${mysqlFieldName} = ?, dateupdate = NOW()
       WHERE pcucode = ? AND visitno = ? AND visitdate = CURDATE()`,
      [value, result.session.pcucode, result.session.visitno]
    );
    ctx.writeLog(
      formatLogLine(
        "[MYSQL]",
        `[STAMP-RESULT] affectedRows=${updateResult?.affectedRows ?? 0}`
      )
    );

    if (!updateResult || !updateResult.affectedRows) {
      const reason = "visit_row_not_matched";
      enqueuePendingMeasurement(ctx, {
        idcard: idcardValue ?? "",
        deviceType: deviceTypeMap,
        value: value ?? null,
        measuredAt: payload.timestamp,
        errorMessage: reason
      });
      logSyncHistory(ctx.sqlite, {
        sessionId: result.session.id,
        idcard: idcardValue ?? "",
        visitno: result.session.visitno,
        fieldsUpdated: [mysqlFieldName],
        status: "replay_pending",
        errorMessage: reason
      });
      ctx.writeLog(
        formatLogLine(
          "[MYSQL]",
          `[STAMP-SKIP] No row updated (idcard=${idcardValue ?? ""}, pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${value})`
        )
      );
      return;
    }

    logSyncHistory(ctx.sqlite, {
      sessionId: result.session.id,
      idcard: idcardValue ?? "",
      visitno: result.session.visitno,
      fieldsUpdated: [mysqlFieldName],
      status: "success"
    });

    ctx.writeLog(
      formatLogLine(
        "[MQTT]",
        `[UPDATED] ${result.fieldName}=${value} (pcucode=${result.session.pcucode}, visitno=${result.session.visitno})`
      )
    );
    ctx.emit?.("session:updated", { idcard: idcardValue, field: result.fieldName });
    ctx.emit?.("data:updated", { idcard: idcardValue, field: result.fieldName, value });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "unknown_error";
    let mysqlFieldName = result.fieldName;
    if ((deviceTypeMap === "bp" || deviceTypeMap === "bp2") && result.session.pcucode && result.session.visitno != null) {
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
    ctx.writeLog(
      formatLogLine(
        "[MYSQL]",
        `[ERROR] Stamp failed (idcard=${idcardValue ?? ""}, pcucode=${result.session.pcucode}, visitno=${result.session.visitno}, field=${mysqlFieldName}, value=${value}) reason=${messageText}`
      )
    );
  }
};
