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
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
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
