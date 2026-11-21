import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const DB_PATH = path.resolve('data/diklat_pim.db');
console.log(`Applying Phase 2 Database Migration on: ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

// 1. Add columns to budget_scenarios if not present
const bsCols = (db.prepare("PRAGMA table_info('budget_scenarios');").all() as Array<{ name: string }>).map(c => c.name);

const bsNewCols: Array<{ name: string; type: string; dflt: string }> = [
  { name: 'budget_ceiling_rp', type: 'REAL', dflt: '50000000000' }, // Rp 50 Miliar
  { name: 'budget_ceiling_sen', type: 'INTEGER', dflt: '5000000000000' },
  { name: 'total_cost_rp', type: 'REAL', dflt: '0' },
  { name: 'total_cost_sen', type: 'INTEGER', dflt: '0' },
  { name: 'allocated_cost_rp', type: 'REAL', dflt: '0' },
  { name: 'allocated_cost_sen', type: 'INTEGER', dflt: '0' },
  { name: 'allocation_strategy', type: 'TEXT', dflt: "'PRIORITY_RANK_GREEDY'" }
];

for (const col of bsNewCols) {
  if (!bsCols.includes(col.name)) {
    console.log(`Adding column ${col.name} to budget_scenarios...`);
    db.exec(`ALTER TABLE budget_scenarios ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.dflt};`);
  }
}

// 2. Add columns to road_cost_summaries if not present
const rcsCols = (db.prepare("PRAGMA table_info('road_cost_summaries');").all() as Array<{ name: string }>).map(c => c.name);

const rcsNewCols: Array<{ name: string; type: string; dflt: string }> = [
  { name: 'is_funded', type: 'INTEGER', dflt: '0' },
  { name: 'allocation_rank', type: 'INTEGER', dflt: 'NULL' },
  { name: 'cumulative_cost_rp', type: 'REAL', dflt: '0' },
  { name: 'cumulative_cost_sen', type: 'INTEGER', dflt: '0' }
];

for (const col of rcsNewCols) {
  if (!rcsCols.includes(col.name)) {
    console.log(`Adding column ${col.name} to road_cost_summaries...`);
    db.exec(`ALTER TABLE road_cost_summaries ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.dflt};`);
  }
}

// 3. Verify integrity
const integrity = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
console.log('PRAGMA integrity_check:', integrity[0]?.integrity_check);

const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
console.log('PRAGMA foreign_key_check violations:', fkViolations.length);

db.close();
console.log('Phase 2 Database Migration applied successfully.');
