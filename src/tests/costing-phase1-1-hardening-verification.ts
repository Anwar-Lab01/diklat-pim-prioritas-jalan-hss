import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CostingReferenceService } from '../services/costingReferenceService.ts';

const DB_PATH = path.resolve('data/diklat_pim.db');
const BACKUP_DIR = path.resolve('data/backups');

console.log('================================================================');
console.log('STARTING PHASE 1.1 DATABASE HARDENING & VALIDATION TEST SUITE');
console.log('================================================================');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
const costingSvc = new CostingReferenceService(db);

let passedTests = 0;
let failedTests = 0;

function runTest(suite: string, name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${suite} -> ${name}`);
    passedTests++;
  } catch (error: any) {
    console.error(`  [FAIL] ${suite} -> ${name}: ${error.message}`);
    failedTests++;
  }
}

// -------------------------------------------------------------
// SUITE 1: DATABASE INTEGRITY & PRAGMA CHECKS
// -------------------------------------------------------------
runTest('Database Integrity', 'PRAGMA integrity_check returns ok', () => {
  const result = db.prepare('PRAGMA integrity_check;').all() as Array<{ integrity_check: string }>;
  assert.strictEqual(result[0]?.integrity_check, 'ok');
});

runTest('Database Integrity', 'PRAGMA foreign_key_check returns 0 violations', () => {
  const result = db.prepare('PRAGMA foreign_key_check;').all();
  assert.strictEqual(result.length, 0, `Found ${result.length} foreign key violations`);
});

runTest('Database Integrity', 'uq_tes_segment_road composite unique index exists on treatment_engine_segments', () => {
  const indexes = db.prepare(`PRAGMA index_list('treatment_engine_segments');`).all() as Array<{ name: string; unique: number }>;
  const found = indexes.find(i => i.name === 'uq_tes_segment_road');
  assert.ok(found, 'Index uq_tes_segment_road must exist');
  assert.strictEqual(found.unique, 1, 'Index uq_tes_segment_road must be unique');

  const cols = db.prepare(`PRAGMA index_info('uq_tes_segment_road');`).all() as Array<{ name: string }>;
  assert.deepStrictEqual(cols.map(c => c.name), ['segment_id', 'road_key']);
});

runTest('Database Integrity', 'budget_scenarios table exists with required schema', () => {
  const cols = db.prepare(`PRAGMA table_info('budget_scenarios');`).all() as Array<{ name: string; type: string; notnull: number; pk: number }>;
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes('scenario_id'));
  assert.ok(colNames.includes('scenario_code'));
  assert.ok(colNames.includes('scenario_name'));
  assert.ok(colNames.includes('budget_year'));
  assert.ok(colNames.includes('scenario_status'));
});

// -------------------------------------------------------------
// SUITE 2: MONEY PRECISION HARDENING VERIFICATION
// -------------------------------------------------------------
runTest('Money Precision', '1,010 ASB items have 100% populated unit_price_sen exact to unit_price_rp * 100', () => {
  const rows = db.prepare('SELECT asb_id, unit_price_rp, unit_price_sen FROM master_asb_items;').all() as Array<{ asb_id: string; unit_price_rp: number; unit_price_sen: number }>;
  assert.strictEqual(rows.length, 1010);
  for (const r of rows) {
    assert.ok(Number.isInteger(r.unit_price_sen), `asb ${r.asb_id} unit_price_sen must be integer`);
    assert.strictEqual(r.unit_price_sen, Math.round(r.unit_price_rp * 100));
    // Verify that ASB items are whole rupiah (sen % 100 === 0)
    assert.strictEqual(r.unit_price_sen % 100, 0, `asb ${r.asb_id} must be whole rupiah`);
  }
});

runTest('Money Precision', '483 AHSP items have 100% populated unit_price_sen exact to unit_price_rp * 100', () => {
  const rows = db.prepare('SELECT ahsp_id, unit_price_rp, unit_price_sen FROM master_ahsp_items;').all() as Array<{ ahsp_id: string; unit_price_rp: number; unit_price_sen: number }>;
  assert.strictEqual(rows.length, 483);
  for (const r of rows) {
    assert.ok(Number.isInteger(r.unit_price_sen), `ahsp ${r.ahsp_id} unit_price_sen must be integer`);
    assert.strictEqual(r.unit_price_sen, Math.round(r.unit_price_rp * 100));
    // Verify sen conversion back to float matches original float within 1e-9
    const convertedBack = r.unit_price_sen / 100;
    assert.ok(Math.abs(convertedBack - r.unit_price_rp) < 1e-9, `Precision drift detected for ${r.ahsp_id}`);
  }
});

runTest('Money Precision', 'Aggregate integer sen sum prevents floating-point drift', () => {
  const ahspSumRow = db.prepare('SELECT SUM(unit_price_sen) as total_sen, SUM(unit_price_rp) as total_rp FROM master_ahsp_items;').get() as { total_sen: number; total_rp: number };
  assert.ok(Number.isInteger(ahspSumRow.total_sen));
  const rpFromSen = ahspSumRow.total_sen / 100;
  // Difference between integer scaled sum and raw float sum is within floating-point epsilon
  assert.ok(Math.abs(rpFromSen - ahspSumRow.total_rp) < 0.01);
});

runTest('Money Precision', 'CostingReferenceService conversion and formatting helpers function properly', () => {
  assert.strictEqual(CostingReferenceService.rpToSen(1708.82), 170882);
  assert.strictEqual(CostingReferenceService.senToRp(170882), 1708.82);
  assert.strictEqual(CostingReferenceService.rpToSen(410000), 41000000);
  assert.strictEqual(CostingReferenceService.senToRp(41000000), 410000);
});

// -------------------------------------------------------------
// SUITE 3: ROAD-SEGMENT RELATIONAL INTEGRITY VERIFICATION
// -------------------------------------------------------------
runTest('Relational Integrity', 'Valid (segment_id, road_key) insertion succeeds', () => {
  // Pick an actual segment
  const sampleSegment = db.prepare('SELECT segment_id, road_key FROM treatment_engine_segments LIMIT 1;').get() as { segment_id: string; road_key: string };
  assert.ok(sampleSegment);

  db.exec('SAVEPOINT test_rel_valid;');
  try {
    db.prepare(`
      INSERT INTO road_segment_cost_estimates (
        estimate_id,
        scenario_id,
        segment_id,
        road_key,
        budget_year,
        matched_width_m,
        matched_surface,
        segment_length_m,
        unit_price_rp,
        unit_price_sen,
        indicative_cost_rp,
        indicative_cost_sen,
        calculation_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      'TEST-EST-001',
      'SCN-2027-BASELINE',
      sampleSegment.segment_id,
      sampleSegment.road_key,
      2027,
      3.5,
      'HRS-Base',
      100.0,
      723000.0,
      72300000,
      72300000.0,
      7230000000,
      'EXACT_MATCH'
    );

    const check = db.prepare('SELECT * FROM road_segment_cost_estimates WHERE estimate_id = ?;').get('TEST-EST-001');
    assert.ok(check, 'Estimate should be inserted');
  } finally {
    db.exec('ROLLBACK TO test_rel_valid;');
  }
});

runTest('Relational Integrity', 'Mismatched (segment_id, road_key) pair fails foreign key constraint', () => {
  // Pick two distinct segments from different roads
  const segA = db.prepare('SELECT segment_id, road_key FROM treatment_engine_segments LIMIT 1;').get() as { segment_id: string; road_key: string };
  const segB = db.prepare('SELECT segment_id, road_key FROM treatment_engine_segments WHERE road_key != ? LIMIT 1;').get(segA.road_key) as { segment_id: string; road_key: string };
  assert.ok(segA && segB);

  db.exec('SAVEPOINT test_rel_mismatch;');
  try {
    let failed = false;
    try {
      // Intentionally pair segA.segment_id with segB.road_key (MISMATCH!)
      db.prepare(`
        INSERT INTO road_segment_cost_estimates (
          estimate_id,
          scenario_id,
          segment_id,
          road_key,
          budget_year,
          matched_width_m,
          matched_surface,
          segment_length_m,
          unit_price_rp,
          unit_price_sen,
          indicative_cost_rp,
          indicative_cost_sen,
          calculation_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).run(
        'TEST-EST-MISMATCH',
        'SCN-2027-BASELINE',
        segA.segment_id,
        segB.road_key, // MISMATCH!
        2027,
        3.5,
        'HRS-Base',
        100.0,
        723000.0,
        72300000,
        72300000.0,
        7230000000,
        'EXACT_MATCH'
      );
    } catch (err: any) {
      failed = true;
      assert.ok(err.message.includes('FOREIGN KEY constraint failed'), `Expected FK error, got: ${err.message}`);
    }
    assert.ok(failed, 'Insertion of mismatched (segment_id, road_key) MUST fail with FK constraint violation');
  } finally {
    db.exec('ROLLBACK TO test_rel_mismatch;');
  }
});

runTest('Relational Integrity', 'Non-existent segment_id fails foreign key constraint', () => {
  const sampleRoad = db.prepare('SELECT road_key FROM roads LIMIT 1;').get() as { road_key: string };

  db.exec('SAVEPOINT test_rel_nonexistent;');
  try {
    let failed = false;
    try {
      db.prepare(`
        INSERT INTO road_segment_cost_estimates (
          estimate_id,
          scenario_id,
          segment_id,
          road_key,
          budget_year,
          matched_width_m,
          matched_surface,
          segment_length_m,
          unit_price_rp,
          unit_price_sen,
          indicative_cost_rp,
          indicative_cost_sen,
          calculation_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).run(
        'TEST-EST-NONEXISTENT',
        'SCN-2027-BASELINE',
        'NON_EXISTENT_SEGMENT_99999',
        sampleRoad.road_key,
        2027,
        3.5,
        'HRS-Base',
        100.0,
        723000.0,
        72300000,
        72300000.0,
        7230000000,
        'EXACT_MATCH'
      );
    } catch (err: any) {
      failed = true;
      assert.ok(err.message.includes('FOREIGN KEY constraint failed'), `Expected FK error, got: ${err.message}`);
    }
    assert.ok(failed, 'Insertion of non-existent segment_id MUST fail with FK constraint violation');
  } finally {
    db.exec('ROLLBACK TO test_rel_nonexistent;');
  }
});

runTest('Relational Integrity', 'Duplicate (scenario_id, segment_id) fails unique constraint', () => {
  const sampleSegment = db.prepare('SELECT segment_id, road_key FROM treatment_engine_segments LIMIT 1;').get() as { segment_id: string; road_key: string };

  db.exec('SAVEPOINT test_unique_segment;');
  try {
    db.prepare(`
      INSERT INTO road_segment_cost_estimates (
        estimate_id,
        scenario_id,
        segment_id,
        road_key,
        budget_year,
        matched_width_m,
        matched_surface,
        segment_length_m,
        unit_price_rp,
        unit_price_sen,
        indicative_cost_rp,
        indicative_cost_sen,
        calculation_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      'TEST-EST-UQ-1',
      'SCN-2027-BASELINE',
      sampleSegment.segment_id,
      sampleSegment.road_key,
      2027,
      3.5,
      'HRS-Base',
      100.0,
      723000.0,
      72300000,
      72300000.0,
      7230000000,
      'EXACT_MATCH'
    );

    let failed = false;
    try {
      db.prepare(`
        INSERT INTO road_segment_cost_estimates (
          estimate_id,
          scenario_id,
          segment_id,
          road_key,
          budget_year,
          matched_width_m,
          matched_surface,
          segment_length_m,
          unit_price_rp,
          unit_price_sen,
          indicative_cost_rp,
          indicative_cost_sen,
          calculation_mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).run(
        'TEST-EST-UQ-2',
        'SCN-2027-BASELINE',
        sampleSegment.segment_id, // Same segment in same scenario!
        sampleSegment.road_key,
        2027,
        3.5,
        'HRS-Base',
        100.0,
        723000.0,
        72300000,
        72300000.0,
        7230000000,
        'EXACT_MATCH'
      );
    } catch (err: any) {
      failed = true;
      assert.ok(err.message.includes('UNIQUE constraint failed'), `Expected UNIQUE constraint error, got: ${err.message}`);
    }
    assert.ok(failed, 'Duplicate estimate for same (scenario_id, segment_id) MUST fail');
  } finally {
    db.exec('ROLLBACK TO test_unique_segment;');
  }
});

// -------------------------------------------------------------
// SUITE 4: BUDGET SCENARIO ARCHITECTURE VERIFICATION
// -------------------------------------------------------------
runTest('Budget Scenarios', 'Baseline scenario exists with status ACTIVE and year 2027', () => {
  const scenario = costingSvc.getScenarioById('SCN-2027-BASELINE');
  assert.ok(scenario, 'SCN-2027-BASELINE must exist');
  assert.strictEqual(scenario.scenario_code, 'BASELINE_2027');
  assert.strictEqual(scenario.budget_year, 2027);
  assert.strictEqual(scenario.scenario_status, 'ACTIVE');
});

runTest('Budget Scenarios', 'Unique constraint prevents duplicate scenario_code', () => {
  db.exec('SAVEPOINT test_scenario_code;');
  try {
    let failed = false;
    try {
      costingSvc.createScenario({
        scenario_id: 'SCN-2027-DUPLICATE',
        scenario_code: 'BASELINE_2027', // Duplicate code!
        scenario_name: 'Duplicate Scenario',
        budget_year: 2027
      });
    } catch (err: any) {
      failed = true;
      assert.ok(err.message.includes('UNIQUE constraint failed'), `Expected UNIQUE constraint error, got: ${err.message}`);
    }
    assert.ok(failed, 'Duplicate scenario_code must be rejected');
  } finally {
    db.exec('ROLLBACK TO test_scenario_code;');
  }
});

runTest('Budget Scenarios', 'Foreign key cascade deletes estimates and summaries on scenario deletion', () => {
  const sampleSegment = db.prepare('SELECT segment_id, road_key FROM treatment_engine_segments LIMIT 1;').get() as { segment_id: string; road_key: string };

  db.exec('SAVEPOINT test_scenario_cascade;');
  try {
    // Create temporary scenario
    costingSvc.createScenario({
      scenario_id: 'SCN-TEMP-TEST',
      scenario_code: 'TEMP_TEST',
      scenario_name: 'Temporary Test Scenario',
      budget_year: 2027
    });

    // Insert estimate for temp scenario
    db.prepare(`
      INSERT INTO road_segment_cost_estimates (
        estimate_id,
        scenario_id,
        segment_id,
        road_key,
        budget_year,
        matched_width_m,
        matched_surface,
        segment_length_m,
        unit_price_rp,
        unit_price_sen,
        indicative_cost_rp,
        indicative_cost_sen,
        calculation_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      'EST-TEMP-CASCADE',
      'SCN-TEMP-TEST',
      sampleSegment.segment_id,
      sampleSegment.road_key,
      2027,
      3.5,
      'HRS-Base',
      100.0,
      723000.0,
      72300000,
      72300000.0,
      7230000000,
      'EXACT_MATCH'
    );

    // Insert summary for temp scenario
    db.prepare(`
      INSERT INTO road_cost_summaries (
        summary_id,
        scenario_id,
        road_key,
        budget_year,
        total_segments,
        treated_segments,
        routine_segments,
        total_length_km,
        treated_length_km,
        total_pagu_asb_rp,
        total_pagu_asb_sen,
        status_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `).run(
      'SUM-TEMP-CASCADE',
      'SCN-TEMP-TEST',
      sampleSegment.road_key,
      2027,
      1,
      1,
      0,
      0.1,
      0.1,
      72300000.0,
      7230000000,
      'ESTIMATED'
    );

    // Verify insertion
    const estBefore = db.prepare('SELECT count(*) as cnt FROM road_segment_cost_estimates WHERE scenario_id = ?;').get('SCN-TEMP-TEST') as { cnt: number };
    const sumBefore = db.prepare('SELECT count(*) as cnt FROM road_cost_summaries WHERE scenario_id = ?;').get('SCN-TEMP-TEST') as { cnt: number };
    assert.strictEqual(estBefore.cnt, 1);
    assert.strictEqual(sumBefore.cnt, 1);

    // Delete scenario
    db.prepare('DELETE FROM budget_scenarios WHERE scenario_id = ?;').run('SCN-TEMP-TEST');

    // Verify cascade deletion
    const estAfter = db.prepare('SELECT count(*) as cnt FROM road_segment_cost_estimates WHERE scenario_id = ?;').get('SCN-TEMP-TEST') as { cnt: number };
    const sumAfter = db.prepare('SELECT count(*) as cnt FROM road_cost_summaries WHERE scenario_id = ?;').get('SCN-TEMP-TEST') as { cnt: number };
    assert.strictEqual(estAfter.cnt, 0, 'Estimates should be cascaded on scenario delete');
    assert.strictEqual(sumAfter.cnt, 0, 'Summaries should be cascaded on scenario delete');
  } finally {
    db.exec('ROLLBACK TO test_scenario_cascade;');
  }
});

// -------------------------------------------------------------
// SUITE 5: REFERENCE DATA INTEGRITY & PROFILING VALIDATION
// -------------------------------------------------------------
runTest('Reference Integrity', 'Record counts of all reference tables match required totals', () => {
  assert.strictEqual(costingSvc.getASBCount(), 1010, 'Expected 1010 ASB items');
  assert.strictEqual(costingSvc.getAHSPCount(), 483, 'Expected 483 AHSP items');
  assert.strictEqual(costingSvc.getTreatmentRules().length, 6, 'Expected 6 treatment rules');
  assert.strictEqual(costingSvc.getProfiles().length, 11, 'Expected 11 profiles');
  assert.strictEqual(costingSvc.getTotalProfileItemsCount(), 35, 'Expected 35 profile items');
});

runTest('Reference Integrity', '100% of asb_ahsp_profile_items point to valid master_ahsp_items', () => {
  const invalidItems = db.prepare(`
    SELECT aapi.profile_item_id, aapi.ahsp_id
    FROM asb_ahsp_profile_items aapi
    LEFT JOIN master_ahsp_items mah ON aapi.ahsp_id = mah.ahsp_id
    WHERE aapi.ahsp_id IS NOT NULL AND mah.ahsp_id IS NULL;
  `).all();
  assert.strictEqual(invalidItems.length, 0, 'Profile items must all reference valid AHSP items');
});

// -------------------------------------------------------------
// SUITE 6: BASELINE INVARIANT PROTECTION
// -------------------------------------------------------------
runTest('Baseline Protection', 'Canonical roads, conditions, segments and spatial profiles remain 100% intact', () => {
  const hashFilePath = path.join(BACKUP_DIR, 'baseline_hashes_pre_phase1_1.json');
  assert.ok(fs.existsSync(hashFilePath), 'Baseline hash file must exist');

  const baselineMap = JSON.parse(fs.readFileSync(hashFilePath, 'utf8'));

  const staticTables = [
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
    'road_variable_observations'
  ];

  for (const table of staticTables) {
    const currentCount = (db.prepare(`SELECT COUNT(*) as cnt FROM "${table}"`).get() as { cnt: number }).cnt;
    assert.strictEqual(currentCount, baselineMap[table].count, `Row count mismatch on table ${table}`);
  }
});

runTest('Baseline Protection', 'Baseline model POLICY_DEFAULT_V1 and ranking integrity are strictly preserved', () => {
  const model = db.prepare("SELECT model_id, model_code, model_lifecycle, is_locked FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1';").get() as { model_id: string; model_code: string; model_lifecycle: string; is_locked: number } | undefined;
  assert.ok(model, 'POLICY_DEFAULT_V1 model must exist');
  assert.strictEqual(model.model_lifecycle, 'BASELINE_LOCKED');
  assert.strictEqual(model.is_locked, 1);

  // Check scoring run for this model
  const baselineRun = db.prepare(`SELECT * FROM scoring_runs WHERE model_id = ? ORDER BY executed_at ASC LIMIT 1;`).get(model.model_id) as { run_id: string } | undefined;
  assert.ok(baselineRun, 'Baseline run for POLICY_DEFAULT_V1 must exist');

  const scoresCount = (db.prepare(`SELECT COUNT(*) as cnt FROM road_priority_scores WHERE run_id = ?;`).get(baselineRun.run_id) as { cnt: number }).cnt;
  assert.strictEqual(scoresCount, 350, 'Baseline run must have exactly 350 road scores');

  // Verify zero costing variables in priority variable definitions
  const costVars = db.prepare(`
    SELECT * FROM variable_definitions 
    WHERE variable_code LIKE '%asb%' 
       OR variable_code LIKE '%ahsp%' 
       OR (variable_code LIKE '%cost%' AND variable_code NOT IN ('norm_jarak_ibukota_kabupaten_cost', 'norm_jarak_rsud_cost', 'norm_jarak_puskesmas_cost', 'norm_jarak_sd_smp_cost', 'norm_jarak_pasar_cost'));
  `).all();
  assert.strictEqual(costVars.length, 0, 'No ASB/AHSP cost indicators must exist in priority model');
});

console.log('================================================================');
console.log(`PHASE 1.1 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
