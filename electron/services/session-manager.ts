import { MySqlPool, mysqlQuery } from "../database/mysql";
import { SqliteDb, sqliteGet, sqliteRun } from "../database/sqlite";

export type CardReaderPayload = {
  idcard: string;
  timestamp: string;
};

export type VitalPayload = {
  idcard: string | null;
  deviceType: "weight" | "height" | "bp" | "bp2" | "temp" | "pulse" | "spo2";
  value: number | string;
};

type PersonRecord = {
  pid: number;
  pcucodeperson: string;
};

type VisitRecord = {
  pcucode: string;
  visitno: number;
  visitdate: string;
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

export const handleCardReader = async (
  mysqlPool: MySqlPool,
  sqlite: SqliteDb,
  payload: CardReaderPayload
) => {
  const normalizeIdcard = (value: unknown) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    return trimmed.toUpperCase();
  };

  const incomingIdcard = normalizeIdcard(payload.idcard);
  console.log("[SESSION-MGR] ========== handleCardReader START ==========");
  console.log("[SESSION-MGR] Incoming idcard:", incomingIdcard);
  if (!incomingIdcard) {
    console.log("[SESSION-MGR] ERROR: Invalid idcard (empty or null)");
    return { ok: false, reason: "invalid_idcard" };
  }

  console.log("[SESSION-MGR] Querying person table where idcard=", incomingIdcard);
  const personRows = await mysqlQuery<PersonRecord[]>(
    mysqlPool,
    "SELECT pid, pcucodeperson FROM person WHERE idcard = ?",
    [incomingIdcard]
  );
  console.log("[SESSION-MGR] Person query returned:", personRows.length, "rows");
  const person = personRows[0];
  if (!person) {
    console.log("[SESSION-MGR] ERROR: Person NOT FOUND in database for idcard:", incomingIdcard);
    return { ok: false, reason: "person_not_found" };
  }
  console.log("[SESSION-MGR] Person FOUND - PID:", person.pid, "PCU:", person.pcucodeperson);

  // If the current active session already matches this idcard, just refresh metadata.
  // This prevents "resetting" the session when the card is scanned repeatedly.
  let currentSession:
    | { id: number; idcard: string | null; is_temp?: number | null }
    | undefined;
  try {
    currentSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      sqlite,
      "SELECT id, idcard, is_temp FROM active_sessions ORDER BY last_update DESC LIMIT 1"
    );
  } catch (_error) {
    currentSession = sqliteGet<{ id: number; idcard: string | null }>(
      sqlite,
      "SELECT id, idcard FROM active_sessions ORDER BY last_update DESC LIMIT 1"
    ) as any;
  }
  const currentIdcard = normalizeIdcard(currentSession?.idcard ?? "");
  const currentIsTemp = Boolean((currentSession as any)?.is_temp);

  if (currentSession && !currentIsTemp && currentIdcard && currentIdcard === incomingIdcard) {
    console.log("[SESSION-MGR] Same idcard as current session - refreshing");
    console.log("[SESSION-MGR] Querying visit table where pcucodeperson=", person.pcucodeperson, "pid=", person.pid, "visitdate=CURDATE()");
    const visitRows = await mysqlQuery<VisitRecord[]>(
      mysqlPool,
      `SELECT pcucode, visitno, visitdate
       FROM visit
       WHERE pcucodeperson = ? AND pid = ? AND visitdate = CURDATE()
       ORDER BY visitno DESC
       LIMIT 1`,
      [person.pcucodeperson, person.pid]
    );
    console.log("[SESSION-MGR] Visit query returned:", visitRows.length, "rows");
    const visit = visitRows[0];

    if (!visit) {
      console.log("[SESSION-MGR] WARNING: Visit NOT FOUND for today (pendingVisit=true)");
      sqliteRun(
        sqlite,
        `UPDATE active_sessions
         SET pid = ?, pcucodeperson = ?, pcucode = NULL, visitno = NULL, visitdate = NULL,
             is_temp = 0, last_update = datetime('now')
         WHERE id = ?`,
        [person.pid, person.pcucodeperson, currentSession.id]
      );
      return { ok: true, person, visit: null, pendingVisit: true };
    }

    console.log("[SESSION-MGR] Visit FOUND - visitno:", visit.visitno, "pcucode:", visit.pcucode);
    console.log("[SESSION-MGR] Updating active_sessions with PID and Visit data");
    sqliteRun(
      sqlite,
      `UPDATE active_sessions
       SET pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?,
           is_temp = 0, last_update = datetime('now')
       WHERE id = ?`,
      [
        person.pid,
        visit.pcucode,
        person.pcucodeperson,
        visit.visitno,
        toSqliteDate(visit.visitdate),
        currentSession.id
      ]
    );
    return { ok: true, person, visit, pendingVisit: false };
  }

  let tempSession: { id: number; idcard: string | null; is_temp?: number | null } | undefined;
  try {
    tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      sqlite,
      `SELECT id, idcard, is_temp FROM active_sessions
       WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  } catch (_error) {
    tempSession = sqliteGet<{ id: number; idcard: string | null; is_temp?: number | null }>(
      sqlite,
      `SELECT id, idcard, 0 as is_temp FROM active_sessions
       WHERE idcard IS NULL OR idcard = ''
       ORDER BY last_update DESC
       LIMIT 1`
    );
  }

  // Reuse a temp session if available; otherwise reuse the most-recent row as the active session.
  const sessionToReuse = tempSession?.id
    ? { id: tempSession.id, idcard: tempSession.idcard, is_temp: tempSession.is_temp }
    : currentSession?.id
      ? { id: currentSession.id, idcard: currentSession.idcard, is_temp: currentSession.is_temp }
      : undefined;

  const reusedIdcard = normalizeIdcard(sessionToReuse?.idcard ?? "");
  const preserveMeasurements = Boolean(sessionToReuse) && (!reusedIdcard || Boolean(sessionToReuse?.is_temp));

  const visitRows = await mysqlQuery<VisitRecord[]>(
    mysqlPool,
    `SELECT pcucode, visitno, visitdate
     FROM visit
     WHERE pcucodeperson = ? AND pid = ? AND visitdate = CURDATE()
     ORDER BY visitno DESC
     LIMIT 1`,
    [person.pcucodeperson, person.pid]
  );
  const visit = visitRows[0];
  if (!visit) {
    if (sessionToReuse) {
      sqliteRun(sqlite, "DELETE FROM active_sessions WHERE idcard = ? AND id != ?", [incomingIdcard, sessionToReuse.id]);
      if (preserveMeasurements) {
        sqliteRun(
          sqlite,
          `UPDATE active_sessions
           SET idcard = ?, pid = ?, pcucodeperson = ?, pcucode = NULL, visitno = NULL, visitdate = NULL,
               is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
           WHERE id = ?`,
          [incomingIdcard, person.pid, person.pcucodeperson, sessionToReuse.id]
        );
      } else {
        sqliteRun(
          sqlite,
          `UPDATE active_sessions
           SET idcard = ?, pid = ?, pcucodeperson = ?, pcucode = NULL, visitno = NULL, visitdate = NULL,
               weight = NULL, height = NULL, pressure = NULL, pressure2 = NULL, temperature = NULL, pulse = NULL,
               is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
           WHERE id = ?`,
          [incomingIdcard, person.pid, person.pcucodeperson, sessionToReuse.id]
        );
      }
    } else {
      sqliteRun(
        sqlite,
        `INSERT OR REPLACE INTO active_sessions
         (idcard, pid, pcucodeperson, visitno, visitdate, session_start, last_update, is_temp)
         VALUES (?, ?, ?, NULL, NULL, datetime('now'), datetime('now'), 0)`,
        [incomingIdcard, person.pid, person.pcucodeperson]
      );
    }

    return { ok: true, person, visit: null, pendingVisit: true };
  }

  if (sessionToReuse) {
    sqliteRun(sqlite, "DELETE FROM active_sessions WHERE idcard = ? AND id != ?", [incomingIdcard, sessionToReuse.id]);
    if (preserveMeasurements) {
      sqliteRun(
        sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [
          incomingIdcard,
          person.pid,
          visit.pcucode,
          person.pcucodeperson,
          visit.visitno,
          toSqliteDate(visit.visitdate),
          sessionToReuse.id
        ]
      );
    } else {
      sqliteRun(
        sqlite,
        `UPDATE active_sessions
         SET idcard = ?, pid = ?, pcucode = ?, pcucodeperson = ?, visitno = ?, visitdate = ?,
             weight = NULL, height = NULL, pressure = NULL, pressure2 = NULL, temperature = NULL, pulse = NULL,
             is_temp = 0, session_start = datetime('now'), last_update = datetime('now')
         WHERE id = ?`,
        [
          incomingIdcard,
          person.pid,
          visit.pcucode,
          person.pcucodeperson,
          visit.visitno,
          toSqliteDate(visit.visitdate),
          sessionToReuse.id
        ]
      );
    }
  } else {
    sqliteRun(
      sqlite,
      `INSERT OR REPLACE INTO active_sessions
       (idcard, pid, pcucode, pcucodeperson, visitno, visitdate, session_start, last_update, is_temp)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)`,
      [
        incomingIdcard,
        person.pid,
        visit.pcucode,
        person.pcucodeperson,
        visit.visitno,
        toSqliteDate(visit.visitdate)
      ]
    );
  }

  return { ok: true, person, visit, pendingVisit: false };
};

export const handleVitalSign = async (
  mysqlPool: MySqlPool,
  sqlite: SqliteDb,
  payload: VitalPayload
) => {
  const hasIdcard = Boolean(payload.idcard && payload.idcard.trim());
  console.log(`[VITAL-SIGN] Processing ${payload.deviceType}, value=${payload.value}, idcard=${payload.idcard || '(none)'}`);
  
  let session:
    | {
        id: number;
        pcucode: string | null;
        visitno: number | null;
        idcard: string | null;
        is_temp: number | null;
      }
    | undefined;

  if (hasIdcard) {
    console.log(`[VITAL-SIGN] Looking for session with idcard=${payload.idcard}`);
    session = sqliteGet<{
      id: number;
      pcucode: string | null;
      visitno: number | null;
      idcard: string | null;
      is_temp: number | null;
    }>(
      sqlite,
      "SELECT id, pcucode, visitno, idcard, is_temp FROM active_sessions WHERE idcard = ?",
      [payload.idcard]
    );
  } else {
    console.log(`[VITAL-SIGN] No idcard provided, using latest active session`);
    try {
      session = sqliteGet<{
        id: number;
        pcucode: string | null;
        visitno: number | null;
        idcard: string | null;
        is_temp: number | null;
      }>(
        sqlite,
        `SELECT id, pcucode, visitno, idcard, is_temp
         FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    } catch (_error) {
      session = sqliteGet<{
        id: number;
        pcucode: string | null;
        visitno: number | null;
        idcard: string | null;
        is_temp: number | null;
      }>(
        sqlite,
        `SELECT id, pcucode, visitno, idcard, 0 as is_temp
         FROM active_sessions
         ORDER BY last_update DESC
         LIMIT 1`
      );
    }
    if (session) {
      console.log(`[VITAL-SIGN] Found session id=${session.id}, idcard=${session.idcard || '(none)'}, is_temp=${session.is_temp}`);
    }
  }

  if (!session && !hasIdcard) {
    try {
      sqliteRun(sqlite, "DELETE FROM active_sessions WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''");
    } catch (_error) {
      sqliteRun(sqlite, "DELETE FROM active_sessions WHERE idcard IS NULL OR idcard = ''");
    }
    try {
      sqliteRun(
        sqlite,
        `INSERT INTO active_sessions
         (idcard, session_start, last_update, is_temp)
         VALUES (NULL, datetime('now'), datetime('now'), 1)`
      );
    } catch (_error) {
      sqliteRun(
        sqlite,
        `INSERT INTO active_sessions
         (idcard, session_start, last_update, is_temp)
         VALUES ('', datetime('now'), datetime('now'), 1)`
      );
    }
    if (!session) {
      try {
        session = sqliteGet<{
          id: number;
          pcucode: string | null;
          visitno: number | null;
          idcard: string | null;
          is_temp: number | null;
        }>(
          sqlite,
          `SELECT id, pcucode, visitno, idcard, is_temp
           FROM active_sessions
           WHERE is_temp = 1 OR idcard IS NULL OR idcard = ''
           ORDER BY last_update DESC
           LIMIT 1`
        );
      } catch (_error) {
        session = sqliteGet<{
          id: number;
          pcucode: string | null;
          visitno: number | null;
          idcard: string | null;
          is_temp: number | null;
        }>(
          sqlite,
          `SELECT id, pcucode, visitno, idcard, 0 as is_temp
           FROM active_sessions
           WHERE idcard IS NULL OR idcard = ''
           ORDER BY last_update DESC
           LIMIT 1`
        );
      }
    }
  }

  if (!session) {
    return { ok: false, reason: "session_not_found" };
  }

  const fieldName = getFieldName(payload.deviceType);
  
  // ถ้า device type ไม่รองรับ (เช่น spo2) ให้ skip โดยไม่ error
  if (!fieldName) {
    return { ok: false, reason: "unsupported_device_type", deviceType: payload.deviceType };
  }
  
  // Special handling for BP: check if we should stamp to pressure or pressure2
  if (payload.deviceType === "bp" || payload.deviceType === "bp2") {
    // For MySQL, check if pressure already has a value
    // If yes, we should stamp to pressure2 instead
    // This is handled by resolveBpMySqlField in data-processor
    
    // For SQLite active_sessions display, just store the value as-is
    sqliteRun(
      sqlite,
      `UPDATE active_sessions
       SET ${fieldName} = ?, last_update = datetime('now')
       WHERE id = ?`,
      [payload.value, session.id]
    );
    
    return { ok: true, session, fieldName };
  }
  // Pulse: always overwrite the existing value
  else if (payload.deviceType === "pulse") {
    sqliteRun(
      sqlite,
      `UPDATE active_sessions
       SET ${fieldName} = ?, last_update = datetime('now')
       WHERE id = ?`,
      [payload.value, session.id]
    );
    
    return { ok: true, session, fieldName };
  }
  // Normal field update for other measurements (weight, height, temperature)
  else {
    console.log(`[VITAL-SIGN] Updating session id=${session.id}, field=${fieldName}, value=${payload.value}, idcard=${session.idcard || '(none)'}`);
    
    // Verify session before update
    const beforeUpdate = sqliteGet<{ weight: any, height: any, temperature: any, pressure: any, idcard: string }>(
      sqlite,
      'SELECT weight, height, temperature, pressure, idcard FROM active_sessions WHERE id = ?',
      [session.id]
    );
    console.log(`[VITAL-SIGN] Before update - session=${JSON.stringify(beforeUpdate)}`);
    
    sqliteRun(
      sqlite,
      `UPDATE active_sessions
       SET ${fieldName} = ?, last_update = datetime('now')
       WHERE id = ?`,
      [payload.value, session.id]
    );
    
    // Verify after update
    const afterUpdate = sqliteGet<{ weight: any, height: any, temperature: any, pressure: any, idcard: string }>(
      sqlite,
      'SELECT weight, height, temperature, pressure, idcard FROM active_sessions WHERE id = ?',
      [session.id]
    );
    console.log(`[VITAL-SIGN] After update - session=${JSON.stringify(afterUpdate)}`);
    console.log(`[VITAL-SIGN] ✓ Successfully updated ${fieldName} in session id=${session.id}`);

    return { ok: true, session, fieldName };
  }
};

export const getFieldName = (deviceType: VitalPayload["deviceType"]): string | null => {
  switch (deviceType) {
    case "weight":
      return "weight";
    case "height":
      return "height";
    case "bp":
      return "pressure";
    case "bp2":
      return "pressure2";
    case "temp":
      return "temperature";
    case "pulse":
      return "pulse";
    case "spo2":
      // spo2 ยังไม่มี field ในฐานข้อมูล - skip ไปก่อน
      return null;
    default:
      throw new Error(`Unsupported device type: ${deviceType}`);
  }
};
