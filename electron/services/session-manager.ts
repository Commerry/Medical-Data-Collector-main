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
  if (!incomingIdcard) {
    return { ok: false, reason: "invalid_idcard" };
  }

  const personRows = await mysqlQuery<PersonRecord[]>(
    mysqlPool,
    "SELECT pid, pcucodeperson FROM person WHERE idcard = ?",
    [incomingIdcard]
  );
  const person = personRows[0];
  if (!person) {
    return { ok: false, reason: "person_not_found" };
  }

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
               weight = NULL, height = NULL, pressure = NULL, temperature = NULL, pulse = NULL,
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
             weight = NULL, height = NULL, pressure = NULL, temperature = NULL, pulse = NULL,
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
  
  sqliteRun(
    sqlite,
    `UPDATE active_sessions
     SET ${fieldName} = ?, last_update = datetime('now')
     WHERE id = ?`,
    [payload.value, session.id]
  );

  return { ok: true, session, fieldName };
};

export const getFieldName = (deviceType: VitalPayload["deviceType"]): string | null => {
  switch (deviceType) {
    case "weight":
      return "weight";
    case "height":
      return "height";
    case "bp":
    case "bp2":  // bp2 แมปไปที่ pressure เหมือน bp (ให้ data-processor จัดการ pressure/pressure2)
      return "pressure";
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
