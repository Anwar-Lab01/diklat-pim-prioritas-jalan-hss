import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const DB_PATH = path.resolve('data/diklat_pim.db');
console.log(`Applying Phase 3 Database Schema Migration on: ${DB_PATH}`);
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

// 1. Update road_cost_summaries
const rcsCols = (db.prepare("PRAGMA table_info('road_cost_summaries');").all() as Array<{ name: string }>).map(c => c.name);

if (!rcsCols.includes('operational_status')) {
  console.log('Adding column operational_status to road_cost_summaries...');
  db.exec("ALTER TABLE road_cost_summaries ADD COLUMN operational_status TEXT DEFAULT 'DEFERRED_BY_BUDGET';");
}

if (!rcsCols.includes('allocated_pagu_rp')) {
  console.log('Adding column allocated_pagu_rp to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN allocated_pagu_rp REAL DEFAULT 0;');
}

if (!rcsCols.includes('allocated_pagu_sen')) {
  console.log('Adding column allocated_pagu_sen to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN allocated_pagu_sen INTEGER DEFAULT 0;');
}

if (!rcsCols.includes('allocated_treated_segments')) {
  console.log('Adding column allocated_treated_segments to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN allocated_treated_segments INTEGER DEFAULT 0;');
}

if (!rcsCols.includes('allocated_treated_length_km')) {
  console.log('Adding column allocated_treated_length_km to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN allocated_treated_length_km REAL DEFAULT 0;');
}

if (!rcsCols.includes('selection_rationale')) {
  console.log('Adding column selection_rationale to road_cost_summaries...');
  db.exec('ALTER TABLE road_cost_summaries ADD COLUMN selection_rationale TEXT DEFAULT NULL;');
}

// 2. Update road_segment_cost_estimates
const rsceCols = (db.prepare("PRAGMA table_info('road_segment_cost_estimates');").all() as Array<{ name: string }>).map(c => c.name);

if (!rsceCols.includes('is_selected')) {
  console.log('Adding column is_selected to road_segment_cost_estimates...');
  db.exec('ALTER TABLE road_segment_cost_estimates ADD COLUMN is_selected INTEGER DEFAULT 0;');
}

if (!rsceCols.includes('selection_status')) {
  console.log('Adding column selection_status to road_segment_cost_estimates...');
  db.exec("ALTER TABLE road_segment_cost_estimates ADD COLUMN selection_status TEXT DEFAULT 'UNSELECTED';");
}

// 3. Update budget_scenarios
const bsCols = (db.prepare("PRAGMA table_info('budget_scenarios');").all() as Array<{ name: string }>).map(c => c.name);

if (!bsCols.includes('optimization_objective')) {
  console.log('Adding column optimization_objective to budget_scenarios...');
  db.exec("ALTER TABLE budget_scenarios ADD COLUMN optimization_objective TEXT DEFAULT 'GREEDY_BENCHMARK';");
}

if (!bsCols.includes('solver_status')) {
  console.log('Adding column solver_status to budget_scenarios...');
  db.exec("ALTER TABLE budget_scenarios ADD COLUMN solver_status TEXT DEFAULT 'BENCHMARK_GREEDY';");
}

if (!bsCols.includes('solver_nodes')) {
  console.log('Adding column solver_nodes to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN solver_nodes INTEGER DEFAULT 0;');
}

if (!bsCols.includes('solver_gap_pct')) {
  console.log('Adding column solver_gap_pct to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN solver_gap_pct REAL DEFAULT 0;');
}

if (!bsCols.includes('solver_runtime_ms')) {
  console.log('Adding column solver_runtime_ms to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN solver_runtime_ms INTEGER DEFAULT 0;');
}

if (!bsCols.includes('treated_length_km')) {
  console.log('Adding column treated_length_km to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN treated_length_km REAL DEFAULT 0;');
}

if (!bsCols.includes('priority_weighted_score')) {
  console.log('Adding column priority_weighted_score to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN priority_weighted_score REAL DEFAULT 0;');
}

if (!bsCols.includes('funded_construction_roads')) {
  console.log('Adding column funded_construction_roads to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN funded_construction_roads INTEGER DEFAULT 0;');
}

if (!bsCols.includes('routine_maintenance_roads')) {
  console.log('Adding column routine_maintenance_roads to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN routine_maintenance_roads INTEGER DEFAULT 0;');
}

if (!bsCols.includes('manual_review_roads')) {
  console.log('Adding column manual_review_roads to budget_scenarios...');
  db.exec('ALTER TABLE budget_scenarios ADD COLUMN manual_review_roads INTEGER DEFAULT 0;');
}

// 4. Create scenario_optimizations table for scenario run history and multi-objective comparisons
db.exec(`
  CREATE TABLE IF NOT EXISTS scenario_optimizations (
    optimization_id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    budget_ceiling_rp REAL NOT NULL,
    budget_ceiling_sen INTEGER NOT NULL,
    objective_mode TEXT NOT NULL,
    solver_name TEXT NOT NULL,
    solver_status TEXT NOT NULL,
    nodes_explored INTEGER NOT NULL DEFAULT 0,
    optimality_gap_pct REAL NOT NULL DEFAULT 0,
    runtime_ms INTEGER NOT NULL DEFAULT 0,
    total_cost_rp REAL NOT NULL,
    total_cost_sen INTEGER NOT NULL,
    remaining_budget_rp REAL NOT NULL,
    treated_length_km REAL NOT NULL,
    priority_weighted_score REAL NOT NULL,
    selected_segments_count INTEGER NOT NULL,
    funded_construction_count INTEGER NOT NULL,
    routine_maintenance_count INTEGER NOT NULL,
    manual_review_count INTEGER NOT NULL,
    deferred_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (scenario_id) REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_scn_opt_scenario ON scenario_optimizations(scenario_id);
`);

// 5. Verify integrity
const integrity = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
console.log('PRAGMA integrity_check:', integrity[0]?.integrity_check);

const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
console.log('PRAGMA foreign_key_check violations:', fkViolations.length);

db.close();
console.log('Phase 3 Database Schema Migration applied successfully.');
