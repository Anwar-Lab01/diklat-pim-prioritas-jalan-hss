import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const DB_PATH = path.resolve('data/diklat_pim.db');
console.log(`Applying Phase 2.1 Database Hardening & Schema Migration on: ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

// 1. Add manual_review_segments and manual_review_length_km to road_cost_summaries if not present
const rcsCols = (db.prepare("PRAGMA table_info('road_cost_summaries');").all() as Array<{ name: string }>).map(c => c.name);

if (!rcsCols.includes('manual_review_segments')) {
  console.log('Adding column manual_review_segments to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN manual_review_segments INTEGER DEFAULT 0;');
}

if (!rcsCols.includes('manual_review_length_km')) {
  console.log('Adding column manual_review_length_km to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN manual_review_length_km REAL DEFAULT 0;');
}

// 2. Verify integrity
const integrity = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
console.log('PRAGMA integrity_check:', integrity[0]?.integrity_check);

const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
console.log('PRAGMA foreign_key_check violations:', fkViolations.length);

db.close();
console.log('Phase 2.1 Database Migration applied successfully.');
