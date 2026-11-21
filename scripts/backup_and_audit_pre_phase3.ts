import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const dbPath = path.resolve('data/diklat_pim.db');
const backupDir = path.resolve('data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `diklat_pim_pre_phase3_${timestamp}.db`);
fs.copyFileSync(dbPath, backupPath);

console.log('Database backup created at:', backupPath);

const db = new DatabaseSync(dbPath);

function getTableChecksum(tableName: string): string {
  const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY 1 ASC`).all();
  const hash = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return hash;
}

const audit = {
  timestamp: new Date().toISOString(),
  roads_count: (db.prepare('SELECT count(*) as c FROM roads').get() as any).c,
  conditions_2025_count: (db.prepare('SELECT count(*) as c FROM road_conditions WHERE survey_year=2025').get() as any).c,
  network_official_km: (db.prepare('SELECT sum(length_km_official) as s FROM roads').get() as any).s,
  network_condition_km: (db.prepare('SELECT sum(total_panjang_km) as s FROM road_conditions WHERE survey_year=2025').get() as any).s,
  dd1_segments_count: (db.prepare('SELECT count(*) as c FROM treatment_engine_segments').get() as any).c,
  dd1_segments_km: (db.prepare('SELECT sum(segment_length_m)/1000.0 as s FROM treatment_engine_segments').get() as any).s,
  variables_count: (db.prepare('SELECT count(*) as c FROM variable_definitions').get() as any).c,
  categories_count: (db.prepare('SELECT count(*) as c FROM categories').get() as any).c,
  asb_items_count: (db.prepare('SELECT count(*) as c FROM master_asb_items').get() as any).c,
  ahsp_items_count: (db.prepare('SELECT count(*) as c FROM master_ahsp_items').get() as any).c,
  treatment_rules_count: (db.prepare('SELECT count(*) as c FROM treatment_package_rules').get() as any).c,
  profiles_count: (db.prepare('SELECT count(*) as c FROM asb_ahsp_profiles').get() as any).c,
  profile_items_count: (db.prepare('SELECT count(*) as c FROM asb_ahsp_profile_items').get() as any).c,
  scenarios_count: (db.prepare('SELECT count(*) as c FROM budget_scenarios').get() as any).c,
  estimates_count: (db.prepare('SELECT count(*) as c FROM road_segment_cost_estimates').get() as any).c,
  summaries_count: (db.prepare('SELECT count(*) as c FROM road_cost_summaries').get() as any).c,
  hashes: {
    roads: getTableChecksum('roads'),
    road_conditions: getTableChecksum('road_conditions'),
    treatment_engine_segments: getTableChecksum('treatment_engine_segments'),
    variable_definitions: getTableChecksum('variable_definitions'),
    categories: getTableChecksum('categories'),
    master_asb_items: getTableChecksum('master_asb_items'),
    master_ahsp_items: getTableChecksum('master_ahsp_items'),
    treatment_package_rules: getTableChecksum('treatment_package_rules'),
    asb_ahsp_profiles: getTableChecksum('asb_ahsp_profiles'),
    asb_ahsp_profile_items: getTableChecksum('asb_ahsp_profile_items'),
  }
};

fs.writeFileSync(
  path.join(backupDir, `baseline_hashes_pre_phase3.json`),
  JSON.stringify(audit, null, 2)
);

console.log('Pre-Phase 3 Baseline Audit Audit Record created:');
console.log(JSON.stringify(audit, null, 2));
