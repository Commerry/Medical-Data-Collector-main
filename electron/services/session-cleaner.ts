import { SqliteDb, sqliteGet, sqliteRun } from "../database/sqlite";

export const cleanupExpiredSessions = (db: SqliteDb, timeoutMinutes: number) => {
  const cutoff = `-${timeoutMinutes} minutes`;
  sqliteRun(
    db,
    `DELETE FROM sync_history
     WHERE session_id IN (
       SELECT id FROM active_sessions
       WHERE COALESCE(last_update, session_start) < datetime('now', ?)
     )`,
    [cutoff]
  );
  sqliteRun(
    db,
    `DELETE FROM active_sessions
     WHERE COALESCE(last_update, session_start) < datetime('now', ?)` ,
    [cutoff]
  );

  // If everything expired, create a temp session so the app returns to a clean waiting state.
  const remaining = sqliteGet<{ id: number }>(db, "SELECT id FROM active_sessions LIMIT 1");
  if (!remaining) {
    try {
      sqliteRun(
        db,
        `INSERT INTO active_sessions
         (idcard, session_start, last_update, is_temp)
         VALUES (NULL, datetime('now'), datetime('now'), 1)`
      );
    } catch (_error) {
      sqliteRun(
        db,
        `INSERT INTO active_sessions
         (idcard, session_start, last_update)
         VALUES ('', datetime('now'), datetime('now'))`
      );
    }
  }
};
