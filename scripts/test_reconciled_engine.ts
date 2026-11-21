import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

// Check if road_cost_summaries needs manual_review_segments
const rcsCols = (db.prepare("PRAGMA table_info('road_cost_summaries')").all() as any[]).map(c => c.name);
if (!rcsCols.includes('manual_review_segments')) {
  console.log('Adding manual_review_segments to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN manual_review_segments INTEGER DEFAULT 0;');
}
if (!rcsCols.includes('manual_review_length_km')) {
  console.log('Adding manual_review_length_km to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN manual_review_length_km REAL DEFAULT 0;');
}

console.log('Schema updated successfully for Phase 2.1.');
