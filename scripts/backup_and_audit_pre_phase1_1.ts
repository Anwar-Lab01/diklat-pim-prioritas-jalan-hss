import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DB_PATH = path.resolve('data/diklat_pim.db');
const BACKUP_DIR = path.resolve('data/backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Check integrity
const integrity = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
console.log('PRAGMA integrity_check:', integrity[0]?.integrity_check);

const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
console.log('PRAGMA foreign_key_check violations:', fkCheck.length);

// Checkpoint WAL first
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

// Timestamped backup path
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `diklat_pim_pre_phase1_1_${timestamp}.db`);

// Vacuum into backup
db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}'`);
console.log(`Backup created successfully at: ${backupPath}`);

// Verify backup DB
const backupDb = new DatabaseSync(backupPath);
const backupIntegrity = backupDb.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
console.log('Backup integrity_check:', backupIntegrity[0]?.integrity_check);

// Baseline tables
const baselineTables = [
  'roads',
  'road_aliases',
  'source_crosswalk',
  'road_conditions',
  'treatment_engine_segments',
  'road_geometries',
  'road_district_intersections',
  'road_village_intersections',
  'road_rtrw_intersections',
  'road_spatial_profiles',
  'priority_models',
  'categories',
  'model_category_weights',
  'variable_definitions',
  'model_variable_weights',
  'road_variable_observations',
  'road_priority_scores',
  'scoring_runs',
  // Layer 7 reference tables
  'master_asb_items',
  'master_ahsp_items',
  'treatment_package_rules',
  'asb_ahsp_profiles',
  'asb_ahsp_profile_items'
];

interface TableBaseline {
  count: number;
  hash: string;
}

const baselineReport: Record<string, TableBaseline> = {};

for (const table of baselineTables) {
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as { cnt: number };
  const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all();
  
  // Hash data rows
  const hash = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  baselineReport[table] = {
    count: countRow.cnt,
    hash
  };
  console.log(`Table ${table.padEnd(30)}: ${countRow.cnt.toString().padStart(6)} rows | hash: ${hash.substring(0, 16)}...`);
}

const hashFile = path.join(BACKUP_DIR, 'baseline_hashes_pre_phase1_1.json');
fs.writeFileSync(hashFile, JSON.stringify(baselineReport, null, 2), 'utf-8');
console.log(`Saved baseline hashes to: ${hashFile}`);

db.close();
backupDb.close();
