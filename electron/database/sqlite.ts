import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { sqliteSchemaStatements } from "./schema";

export type SqliteDb = Database.Database;

export const createSqliteDb = (basePath: string): SqliteDb => {
  const dataDir = path.join(basePath, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "data.db");
  const db = new Database(dbPath);

  sqliteSchemaStatements.forEach((statement) => {
    db.exec(statement);
  });

  return db;
};

export const resetSqliteDb = (basePath: string, db?: SqliteDb): SqliteDb => {
  try {
    db?.close();
  } catch (_error) {
    // ignore close errors
  }

  const dataDir = path.join(basePath, "data");
  const dbPath = path.join(dataDir, "data.db");
  
  // Try to delete the database file
  let deleted = false;
  if (fs.existsSync(dbPath)) {
    try {
      // Add a small delay to ensure file handle is released on Windows
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          fs.rmSync(dbPath);
          deleted = true;
          break;
        } catch (error: any) {
          if (i === maxRetries - 1) {
            // Last retry failed, log but continue
            console.warn(`[SQLite] Could not delete database file: ${error.message}`);
            console.warn(`[SQLite] Will recreate tables instead`);
          } else {
            // Wait a bit before retry (50ms)
            const start = Date.now();
            while (Date.now() - start < 50) { /* busy wait */ }
          }
        }
      }
    } catch (error) {
      console.warn(`[SQLite] Failed to delete database:`, error);
    }
  }

  // If we couldn't delete, try to open and truncate instead
  if (!deleted && fs.existsSync(dbPath)) {
    try {
      const existingDb = new Database(dbPath);
      
      // Drop all tables
      const tables = existingDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>;
      
      for (const table of tables) {
        try {
          existingDb.prepare(`DROP TABLE IF EXISTS ${table.name}`).run();
        } catch (_error) {
          // ignore
        }
      }
      
      existingDb.close();
      
      // Wait a moment before recreating
      const start = Date.now();
      while (Date.now() - start < 100) { /* busy wait */ }
      
    } catch (_error) {
      console.warn(`[SQLite] Could not truncate existing database`);
    }
  }

  return createSqliteDb(basePath);
};

export const sqliteRun = (db: SqliteDb, sql: string, params: unknown[] = []) => {
  return db.prepare(sql).run(params);
};

export const sqliteGet = <T>(db: SqliteDb, sql: string, params: unknown[] = []) => {
  return db.prepare(sql).get(params) as T | undefined;
};

export const sqliteAll = <T>(db: SqliteDb, sql: string, params: unknown[] = []) => {
  return db.prepare(sql).all(params) as T[];
};
