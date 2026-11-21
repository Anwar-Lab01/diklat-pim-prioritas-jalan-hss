import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = path.resolve('data/diklat_pim.db');
const backupDir = path.resolve('data/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `diklat_pim_pre_phase2_1_${timestamp}.db`);
fs.copyFileSync(dbPath, backupPath);

console.log('Database backup created at:', backupPath);

const db = new DatabaseSync(dbPath);
console.log('Roads count:', (db.prepare('SELECT count(*) as c FROM roads').get() as any).c);
console.log('Conditions count:', (db.prepare('SELECT count(*) as c FROM road_conditions WHERE survey_year=2025').get() as any).c);
console.log('DD1 Segments count:', (db.prepare('SELECT count(*) as c FROM treatment_engine_segments').get() as any).c);
console.log('Observations count:', (db.prepare("SELECT count(*) as c FROM road_variable_observations").get() as any).c);
console.log('ASB items count:', (db.prepare('SELECT count(*) as c FROM master_asb_items').get() as any).c);
console.log('AHSP items count:', (db.prepare('SELECT count(*) as c FROM master_ahsp_items').get() as any).c);
console.log('Treatment rules count:', (db.prepare('SELECT count(*) as c FROM treatment_package_rules').get() as any).c);
console.log('Profiles count:', (db.prepare('SELECT count(*) as c FROM asb_ahsp_profiles').get() as any).c);
console.log('Profile items count:', (db.prepare('SELECT count(*) as c FROM asb_ahsp_profile_items').get() as any).c);
console.log('Scenarios count:', (db.prepare('SELECT count(*) as c FROM budget_scenarios').get() as any).c);
console.log('Estimates count:', (db.prepare('SELECT count(*) as c FROM road_segment_cost_estimates').get() as any).c);
console.log('Summaries count:', (db.prepare('SELECT count(*) as c FROM road_cost_summaries').get() as any).c);
