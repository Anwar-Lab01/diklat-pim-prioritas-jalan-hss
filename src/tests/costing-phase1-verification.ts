import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDatabase, closeDatabase } from '../db/connection.ts';
import { CostingReferenceService } from '../services/costingReferenceService.ts';
import { PROJECT_ROOT } from '../config/constants.ts';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function runTest(suite: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ suite, name, passed: true });
    console.log(`  [PASS] ${suite} -> ${name}`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, message: err.message });
    console.error(`  [FAIL] ${suite} -> ${name}`);
    console.error(`         Error: ${err.message}`);
  }
}

export function executeCostingPhase1TestSuite() {
  console.log('================================================================');
  console.log('STARTING PHASE 1 COSTING & BUDGETING ACCEPTANCE SUITE');
  console.log('================================================================');

  const db = getDatabase();
  const costingSvc = new CostingReferenceService(db);

  // -------------------------------------------------------------
  // SUITE 1: DATABASE INTEGRITY & CONSTRAINTS
  // -------------------------------------------------------------
  runTest('Database Integrity', 'PRAGMA integrity_check returns ok', () => {
    const res = db.prepare('PRAGMA integrity_check;').all() as any[];
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].integrity_check, 'ok');
  });

  runTest('Database Integrity', 'PRAGMA foreign_key_check returns 0 violations', () => {
    const res = db.prepare('PRAGMA foreign_key_check;').all() as any[];
    assert.strictEqual(res.length, 0, `Foreign key violations found: ${JSON.stringify(res)}`);
  });

  // -------------------------------------------------------------
  // SUITE 2: RECORD COUNTS (EXACT EXPECTED)
  // -------------------------------------------------------------
  runTest('Record Counts', 'master_asb_items has exactly 1,010 items (932 jalan, 78 jembatan)', () => {
    const total = costingSvc.getASBCount();
    assert.strictEqual(total, 1010, `Expected 1010 ASB items, got ${total}`);

    const jalan = costingSvc.getASBItemsByCategory('Jalan Kabupaten');
    assert.strictEqual(jalan.length, 932, `Expected 932 Jalan Kabupaten items, got ${jalan.length}`);

    const jembatan = costingSvc.getASBItemsByCategory('Jembatan pada Jalan Kabupaten');
    assert.strictEqual(jembatan.length, 78, `Expected 78 Jembatan items, got ${jembatan.length}`);
  });

  runTest('Record Counts', 'master_ahsp_items has exactly 483 items across 10 divisions', () => {
    const total = costingSvc.getAHSPCount();
    assert.strictEqual(total, 483, `Expected 483 AHSP items, got ${total}`);

    const distinctDivs = db.prepare('SELECT COUNT(DISTINCT division_code) as cnt FROM master_ahsp_items;').get() as { cnt: number };
    assert.strictEqual(distinctDivs.cnt, 10, `Expected 10 divisions, got ${distinctDivs.cnt}`);
  });

  runTest('Record Counts', 'treatment_package_rules has exactly 6 rules (R01..R06)', () => {
    const rules = costingSvc.getTreatmentRules();
    assert.strictEqual(rules.length, 6, `Expected 6 rules, got ${rules.length}`);
    const ruleIds = rules.map(r => r.rule_id);
    assert.deepStrictEqual(ruleIds, ['R01', 'R02', 'R03', 'R04', 'R05', 'R06']);
  });

  runTest('Record Counts', 'asb_ahsp_profiles has exactly 11 profiles', () => {
    const profiles = costingSvc.getProfiles();
    assert.strictEqual(profiles.length, 11, `Expected 11 profiles, got ${profiles.length}`);
  });

  runTest('Record Counts', 'asb_ahsp_profile_items has exactly 35 suggested rules', () => {
    const totalItems = costingSvc.getTotalProfileItemsCount();
    assert.strictEqual(totalItems, 35, `Expected 35 profile items, got ${totalItems}`);
  });

  runTest('Record Counts', 'road_segment_cost_estimates and road_cost_summaries are empty tables', () => {
    const segEst = db.prepare('SELECT count(*) as cnt FROM road_segment_cost_estimates;').get() as { cnt: number };
    assert.strictEqual(segEst.cnt, 0, `Expected 0 rows in road_segment_cost_estimates, got ${segEst.cnt}`);

    const summaries = db.prepare('SELECT count(*) as cnt FROM road_cost_summaries;').get() as { cnt: number };
    assert.strictEqual(summaries.cnt, 0, `Expected 0 rows in road_cost_summaries, got ${summaries.cnt}`);
  });

  // -------------------------------------------------------------
  // SUITE 3: DATA CONTENT VERIFICATION & FIDELITY
  // -------------------------------------------------------------
  runTest('Data Fidelity', 'ASB item asb_0001 matches exact source specifications', () => {
    const item = costingSvc.getASBItemById('asb_0001');
    assert.ok(item, 'Item asb_0001 should exist');
    assert.strictEqual(item.item_code, '1.3.04.01.01.0003');
    assert.strictEqual(item.package_name, 'Jalan Tipe A1');
    assert.strictEqual(item.unit_price_rp, 723000);
    assert.strictEqual(item.unit, 'Meter');
    assert.strictEqual(item.road_width_m, 3);
    assert.strictEqual(item.budget_year, 2027);
  });

  runTest('Data Fidelity', 'AHSP item hps_0001 retains exact float precision', () => {
    const item = costingSvc.getAHSPItemById('hps_0001');
    assert.ok(item, 'Item hps_0001 should exist');
    assert.strictEqual(item.payment_code, '1.20.(1)');
    assert.strictEqual(item.division_code, 1);
    assert.strictEqual(item.division_name, 'UMUM');
    assert.strictEqual(item.unit_price_rp, 735878.68);
    assert.strictEqual(item.price_year, 2025);
  });

  runTest('Data Fidelity', 'Treatment rules maintain correct priority and condition logic', () => {
    const r01 = costingSvc.getTreatmentRuleById('R01');
    assert.ok(r01);
    assert.strictEqual(r01.priority_order, 1);
    assert.strictEqual(r01.selected_profile, 'base_subbase_fill');
    assert.strictEqual(r01.asb_type, 'D');

    const r06 = costingSvc.getTreatmentRuleById('R06');
    assert.ok(r06);
    assert.strictEqual(r06.priority_order, 6);
    assert.strictEqual(r06.selected_profile, 'no_major_asb_package');
    assert.strictEqual(r06.asb_type, 'NONE');
  });

  runTest('Data Fidelity', 'Unique constraints prevent duplicate entries', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO treatment_package_rules (
          rule_id, priority_order, rule_label, selected_profile, asb_type, condition_logic
        ) VALUES ('R01_DUP', 1, 'Duplicate Priority Test', 'base_subbase_fill', 'D', '{}');
      `).run();
    }, /UNIQUE constraint failed/);
  });

  // -------------------------------------------------------------
  // SUITE 4: BASELINE PROTECTION VERIFICATION
  // -------------------------------------------------------------
  runTest('Baseline Protection', 'Canonical roads (350) and conditions (350) retain 100% data fidelity against pre-phase1 backup', () => {
    const baselineReportPath = path.resolve(PROJECT_ROOT, 'data/backups/baseline_hashes_pre_phase1.json');
    assert.ok(fs.existsSync(baselineReportPath), 'Baseline report file must exist');
    const baselineData = JSON.parse(fs.readFileSync(baselineReportPath, 'utf8'));
    const backupDb = getDatabase(baselineData.backup_path);

    // Verify 350 roads
    const currentRoads = db.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, length_km_official, width_m_official, identity_status FROM roads ORDER BY nomor_ruas;').all();
    const backupRoads = backupDb.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, length_km_official, width_m_official, identity_status FROM roads ORDER BY nomor_ruas;').all();
    assert.strictEqual(currentRoads.length, 350);
    assert.strictEqual(backupRoads.length, 350);
    assert.deepStrictEqual(currentRoads, backupRoads, 'Canonical roads attributes must be 100% identical to backup');

    // Verify 350 conditions
    const currentConds = db.prepare('SELECT road_key, survey_year, baik_km, sedang_km, rusak_ringan_km, rusak_berat_km, mantap_km, tidak_mantap_km, total_panjang_km, authority_status FROM road_conditions ORDER BY road_key;').all();
    const backupConds = backupDb.prepare('SELECT road_key, survey_year, baik_km, sedang_km, rusak_ringan_km, rusak_berat_km, mantap_km, tidak_mantap_km, total_panjang_km, authority_status FROM road_conditions ORDER BY road_key;').all();
    assert.strictEqual(currentConds.length, 350);
    assert.deepStrictEqual(currentConds, backupConds, 'Authoritative conditions must be 100% identical to backup');
  });

  runTest('Baseline Protection', 'Crosswalk (1,400) and Segments (7,487) retain 100% data fidelity against pre-phase1 backup', () => {
    const baselineReportPath = path.resolve(PROJECT_ROOT, 'data/backups/baseline_hashes_pre_phase1.json');
    const baselineData = JSON.parse(fs.readFileSync(baselineReportPath, 'utf8'));
    const backupDb = getDatabase(baselineData.backup_path);

    // Verify 1400 crosswalks
    const currentCw = db.prepare('SELECT crosswalk_id, source_system, source_id, source_name, road_key, match_method, match_status FROM source_crosswalk ORDER BY crosswalk_id;').all();
    const backupCw = backupDb.prepare('SELECT crosswalk_id, source_system, source_id, source_name, road_key, match_method, match_status FROM source_crosswalk ORDER BY crosswalk_id;').all();
    assert.strictEqual(currentCw.length, 1400);
    assert.deepStrictEqual(currentCw, backupCw, 'Source crosswalk must be 100% identical to backup');

    // Verify 7487 segments
    const currentSegs = db.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, dominant_condition, segment_status, surface_type, road_width_m, recommended_treatment FROM treatment_engine_segments ORDER BY segment_id;').all();
    const backupSegs = backupDb.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, dominant_condition, segment_status, surface_type, road_width_m, recommended_treatment FROM treatment_engine_segments ORDER BY segment_id;').all();
    assert.strictEqual(currentSegs.length, 7487);
    assert.deepStrictEqual(currentSegs, backupSegs, 'Treatment segments must be 100% identical to backup');
  });

  runTest('Baseline Protection', 'Priority model invariants (4 categories, 17 variables, weights) are strictly untouched', () => {
    const baselineReportPath = path.resolve(PROJECT_ROOT, 'data/backups/baseline_hashes_pre_phase1.json');
    const baselineData = JSON.parse(fs.readFileSync(baselineReportPath, 'utf8'));
    const backupDb = getDatabase(baselineData.backup_path);

    const curCats = db.prepare('SELECT * FROM categories ORDER BY category_code;').all();
    const bakCats = backupDb.prepare('SELECT * FROM categories ORDER BY category_code;').all();
    assert.deepStrictEqual(curCats, bakCats);

    const curVars = db.prepare('SELECT * FROM variable_definitions ORDER BY variable_code;').all();
    const bakVars = backupDb.prepare('SELECT * FROM variable_definitions ORDER BY variable_code;').all();
    assert.deepStrictEqual(curVars, bakVars);

    const curCatWeights = db.prepare('SELECT * FROM model_category_weights ORDER BY category_code;').all();
    const bakCatWeights = backupDb.prepare('SELECT * FROM model_category_weights ORDER BY category_code;').all();
    assert.deepStrictEqual(curCatWeights, bakCatWeights);

    const curVarWeights = db.prepare('SELECT * FROM model_variable_weights ORDER BY variable_code;').all();
    const bakVarWeights = backupDb.prepare('SELECT * FROM model_variable_weights ORDER BY variable_code;').all();
    assert.deepStrictEqual(curVarWeights, bakVarWeights);

    // Verify zero cost contamination in variable definitions
    const costVars = db.prepare("SELECT * FROM variable_definitions WHERE variable_code LIKE '%cost%' AND variable_code NOT IN ('norm_jarak_ibukota_kabupaten_cost', 'norm_jarak_rsud_cost', 'norm_jarak_puskesmas_cost', 'norm_jarak_sd_smp_cost', 'norm_jarak_pasar_cost');").all();
    assert.strictEqual(costVars.length, 0, 'No ASB/AHSP cost indicators must exist in priority model');
  });

  // Summary
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log('================================================================');
  console.log(`PHASE 1 COSTING SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================');

  if (failedCount > 0) {
    throw new Error(`PHASE 1 COSTING VERIFICATION FAILED: ${failedCount} test(s) failed.`);
  }

  return { passedCount, failedCount, total: results.length };
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('costing-phase1-verification.ts')) {
  try {
    executeCostingPhase1TestSuite();
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
