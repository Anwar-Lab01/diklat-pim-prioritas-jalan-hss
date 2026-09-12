import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DB_DIR, DB_PATH, PROJECT_ROOT } from '../config/constants.ts';

let dbInstance: DatabaseSync | null = null;

export function getDatabase(dbPath: string = DB_PATH): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Enforce foreign key constraints and WAL mode
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Initialize schema
  const schemaPath = path.resolve(PROJECT_ROOT, 'src/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  dbInstance = db;
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function withTransaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = action();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}
