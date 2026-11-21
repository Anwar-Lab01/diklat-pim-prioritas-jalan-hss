import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const DB_PATH = path.resolve('data/diklat_pim.db');
console.log(`Connecting to: ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

console.log('--- Applying Phase 1.1 Hardening Migration ---');

// 1. Column unit_price_sen in master_asb_items
const asbCols = db.prepare(`PRAGMA table_info(master_asb_items)`).all() as Array<{ name: string }>;
const hasAsbSen = asbCols.some(c => c.name === 'unit_price_sen');
if (!hasAsbSen) {
  console.log('Adding column unit_price_sen to master_asb_items...');
  db.exec('ALTER TABLE master_asb_items ADD COLUMN unit_price_sen INTEGER;');
}
db.exec('UPDATE master_asb_items SET unit_price_sen = CAST(ROUND(unit_price_rp * 100) AS INTEGER);');
const asbVerify = db.prepare('SELECT count(*) as cnt FROM master_asb_items WHERE unit_price_sen IS NOT NULL;').get() as { cnt: number };
console.log(`master_asb_items updated with unit_price_sen: ${asbVerify.cnt} rows`);

// 2. Column unit_price_sen in master_ahsp_items
const ahspCols = db.prepare(`PRAGMA table_info(master_ahsp_items)`).all() as Array<{ name: string }>;
const hasAhspSen = ahspCols.some(c => c.name === 'unit_price_sen');
if (!hasAhspSen) {
  console.log('Adding column unit_price_sen to master_ahsp_items...');
  db.exec('ALTER TABLE master_ahsp_items ADD COLUMN unit_price_sen INTEGER;');
}
db.exec('UPDATE master_ahsp_items SET unit_price_sen = CAST(ROUND(unit_price_rp * 100) AS INTEGER);');
const ahspVerify = db.prepare('SELECT count(*) as cnt FROM master_ahsp_items WHERE unit_price_sen IS NOT NULL;').get() as { cnt: number };
console.log(`master_ahsp_items updated with unit_price_sen: ${ahspVerify.cnt} rows`);

// 3. Composite unique index on treatment_engine_segments
console.log('Creating unique index uq_tes_segment_road on treatment_engine_segments(segment_id, road_key)...');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_tes_segment_road ON treatment_engine_segments(segment_id, road_key);');

// 4. Budget Scenarios table
console.log('Creating budget_scenarios table...');
db.exec(`
CREATE TABLE IF NOT EXISTS budget_scenarios (
    scenario_id             TEXT PRIMARY KEY,
    scenario_code           TEXT NOT NULL UNIQUE,
    scenario_name           TEXT NOT NULL,
    budget_year             INTEGER NOT NULL,
    description             TEXT,
    scenario_status         TEXT NOT NULL DEFAULT 'DRAFT',
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bs_year ON budget_scenarios(budget_year);
CREATE INDEX IF NOT EXISTS idx_bs_status ON budget_scenarios(scenario_status);
`);

// Seed default scenario if not present
const existingScenario = db.prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?').get('SCN-2027-BASELINE');
if (!existingScenario) {
  console.log('Seeding default baseline scenario SCN-2027-BASELINE...');
  db.prepare(`
    INSERT INTO budget_scenarios (
      scenario_id,
      scenario_code,
      scenario_name,
      budget_year,
      description,
      scenario_status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));
  `).run(
    'SCN-2027-BASELINE',
    'BASELINE_2027',
    'Skenario Pagu Indikatif Baseline 2027',
    2027,
    'Skenario acuan pagu indikatif baseline penanganan jalan Kabupaten HSS Tahun Anggaran 2027',
    'ACTIVE'
  );
}

// 5. Recreate road_segment_cost_estimates with scenario_id and composite foreign key
console.log('Recreating road_segment_cost_estimates...');
db.exec(`DROP TABLE IF EXISTS road_segment_cost_estimates;`);
db.exec(`
CREATE TABLE IF NOT EXISTS road_segment_cost_estimates (
    estimate_id             TEXT PRIMARY KEY,
    scenario_id             TEXT NOT NULL REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE,
    segment_id              TEXT NOT NULL,
    road_key                TEXT NOT NULL,
    budget_year             INTEGER NOT NULL,
    rule_id                 TEXT REFERENCES treatment_package_rules(rule_id) ON DELETE RESTRICT,
    asb_id                  TEXT REFERENCES master_asb_items(asb_id) ON DELETE RESTRICT,
    matched_width_m         REAL NOT NULL,
    matched_surface         TEXT NOT NULL,
    segment_length_m        REAL NOT NULL,
    unit_price_rp           REAL NOT NULL,
    unit_price_sen          INTEGER NOT NULL,
    indicative_cost_rp      REAL NOT NULL,
    indicative_cost_sen     INTEGER NOT NULL,
    calculation_mode        TEXT NOT NULL,
    adjustment_flags        TEXT,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (segment_id, road_key) REFERENCES treatment_engine_segments(segment_id, road_key) ON DELETE RESTRICT,
    FOREIGN KEY (road_key) REFERENCES roads(road_key) ON DELETE RESTRICT,
    CONSTRAINT uq_rsce_scenario_segment UNIQUE (scenario_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_rsce_scenario ON road_segment_cost_estimates(scenario_id);
CREATE INDEX IF NOT EXISTS idx_rsce_road ON road_segment_cost_estimates(road_key);
CREATE INDEX IF NOT EXISTS idx_rsce_segment ON road_segment_cost_estimates(segment_id);
`);

// 6. Recreate road_cost_summaries with scenario_id
console.log('Recreating road_cost_summaries...');
db.exec(`DROP TABLE IF EXISTS road_cost_summaries;`);
db.exec(`
CREATE TABLE IF NOT EXISTS road_cost_summaries (
    summary_id              TEXT PRIMARY KEY,
    scenario_id             TEXT NOT NULL REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE,
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    budget_year             INTEGER NOT NULL,
    dominant_rule_id        TEXT REFERENCES treatment_package_rules(rule_id) ON DELETE RESTRICT,
    dominant_asb_type       TEXT,
    total_segments          INTEGER NOT NULL,
    treated_segments        INTEGER NOT NULL,
    routine_segments        INTEGER NOT NULL,
    total_length_km         REAL NOT NULL,
    treated_length_km       REAL NOT NULL,
    total_pagu_asb_rp       REAL NOT NULL,
    total_pagu_asb_sen      INTEGER NOT NULL,
    ahsp_reference_rp       REAL,
    ahsp_reference_sen      INTEGER,
    status_summary          TEXT NOT NULL,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_rcs_scenario_road UNIQUE (scenario_id, road_key)
);

CREATE INDEX IF NOT EXISTS idx_rcs_scenario ON road_cost_summaries(scenario_id);
CREATE INDEX IF NOT EXISTS idx_rcs_road ON road_cost_summaries(road_key);
CREATE INDEX IF NOT EXISTS idx_rcs_year ON road_cost_summaries(budget_year);
`);

// 7. Verify integrity and foreign keys
const integrity = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
console.log('PRAGMA integrity_check:', integrity[0]?.integrity_check);

const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
console.log('PRAGMA foreign_key_check violations:', fkViolations.length);

db.close();
console.log('--- Migration completed successfully ---');
