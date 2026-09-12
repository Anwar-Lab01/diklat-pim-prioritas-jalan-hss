import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_DIR, DB_PATH, PROJECT_ROOT, DEPLOY_DB_PATH } from '../config/constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: DatabaseSync | null = null;

export function getDatabase(dbPath: string = DB_PATH): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  let targetPath = dbPath;

  if (isServerless) {
    const candidates = [
      dbPath,
      path.resolve(PROJECT_ROOT, 'data/diklat_pim_deploy.db'),
      path.resolve(process.cwd(), 'data/diklat_pim_deploy.db'),
      path.resolve(__dirname, '../data/diklat_pim_deploy.db'),
      path.resolve(__dirname, '../../data/diklat_pim_deploy.db'),
      '/var/task/data/diklat_pim_deploy.db'
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) {
      const tmpPath = path.join('/tmp', path.basename(found));
      try {
        if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size !== fs.statSync(found).size) {
          fs.copyFileSync(found, tmpPath);
        }
        targetPath = tmpPath;
      } catch (copyErr) {
        console.warn('Failed copying database to /tmp, falling back to direct open:', copyErr);
        targetPath = found;
      }
    }
  }

  // Ensure data directory exists if writable
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Read-only filesystem or restricted environment
  }

  const isProductionOrVercel = Boolean(
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL ||
    process.env.DB_READONLY === '1'
  );
  const isDeployDb = targetPath.includes('diklat_pim_deploy.db');
  const isReadOnly = (isProductionOrVercel || isDeployDb) && !isServerless;

  let db: DatabaseSync;
  if (isReadOnly) {
    try {
      db = new DatabaseSync(targetPath, { readOnly: true });
    } catch {
      db = new DatabaseSync(targetPath);
    }
    try {
      db.exec('PRAGMA foreign_keys = ON;');
    } catch {
      // Ignore pragma failures on read-only databases
    }
  } else {
    db = new DatabaseSync(targetPath);
    db.exec('PRAGMA foreign_keys = ON;');
    if (!isDeployDb) {
      db.exec('PRAGMA journal_mode = WAL;');

      // Initialize schema
      const schemaPath = path.resolve(PROJECT_ROOT, 'src/db/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql);
      }
    }
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
