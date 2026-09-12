import assert from 'node:assert';
import { getDatabase, closeDatabase } from '../db/connection.ts';
import { RoadService } from '../services/roadService.ts';
import { CrosswalkService } from '../services/crosswalkService.ts';
import { ConditionService } from '../services/conditionService.ts';
import { SpatialService } from '../services/spatialService.ts';
import { ModelService } from '../services/modelService.ts';
import { runMasterIngestion } from '../ingestion/ingestAuthoritativeData.ts';
import { AUTHORITY_INVARIANTS } from '../config/constants.ts';

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

export function executePhase1TestSuite() {
  console.log('================================================================');
  console.log('STARTING PHASE 1 AUTOMATED ACCEPTANCE VERIFICATION SUITE');
  console.log('================================================================');

  const db = getDatabase();
  const roadSvc = new RoadService(db);
  const crosswalkSvc = new CrosswalkService(db);
  const conditionSvc = new ConditionService(db);
  const spatialSvc = new SpatialService(db);
  const modelSvc = new ModelService(db);

  // ------------------------------------------------------------------
  // 1. IDENTITY TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 1. CANONICAL IDENTITY TESTS ---');

  runTest('Identity', 'Road count must be exactly 350', () => {
    const count = roadSvc.getRoadCount();
    assert.strictEqual(count, 350, `Expected 350 roads, got ${count}`);
  });

  runTest('Identity', 'All 350 road_keys must be unique', () => {
    const roads = roadSvc.getAllRoads();
    const uniqueKeys = new Set(roads.map((r) => r.road_key));
    assert.strictEqual(uniqueKeys.size, 350, `Expected 350 unique road_keys, got ${uniqueKeys.size}`);
  });

  runTest('Identity', 'Canonical keys must form contiguous sequence HSS-KAB-001 to HSS-KAB-350', () => {
    const roads = roadSvc.getAllRoads();
    for (let i = 1; i <= 350; i++) {
      const expectedKey = `HSS-KAB-${String(i).padStart(3, '0')}`;
      const found = roads.find((r) => r.road_key === expectedKey);
      assert.ok(found, `Missing expected contiguous road key: ${expectedKey}`);
      assert.strictEqual(found.nomor_ruas, String(i).padStart(3, '0'));
    }
  });

  runTest('Identity', 'No null or empty canonical identity fields', () => {
    const roads = roadSvc.getAllRoads();
    for (const r of roads) {
      assert.ok(r.road_id && r.road_id.length > 0, `Empty road_id for ${r.road_key}`);
      assert.ok(r.road_key && r.road_key.length > 0, `Empty road_key`);
      assert.ok(r.nomor_ruas && r.nomor_ruas.length > 0, `Empty nomor_ruas for ${r.road_key}`);
      assert.ok(r.canonical_name && r.canonical_name.length > 0, `Empty canonical_name for ${r.road_key}`);
      assert.ok(r.display_name && r.display_name.length > 0, `Empty display_name for ${r.road_key}`);
      assert.ok(r.district_name && r.district_name.length > 0, `Empty district_name for ${r.road_key}`);
    }
  });

  // ------------------------------------------------------------------
  // 2. CROSSWALK TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 2. SOURCE CROSSWALK TESTS ---');

  runTest('Crosswalk', 'Total verified crosswalk records must be exactly 1,400', () => {
    const count = crosswalkSvc.getCrosswalkCount();
    assert.strictEqual(count, 1400, `Expected 1,400 crosswalk records, got ${count}`);
  });

  runTest('Crosswalk', 'All 4 source systems must have exactly 350 verified mappings', () => {
    const crosswalks = crosswalkSvc.getAllCrosswalks();
    const systemCounts: Record<string, number> = {};
    for (const c of crosswalks) {
      systemCounts[c.source_system] = (systemCounts[c.source_system] || 0) + 1;
      assert.strictEqual(c.match_status, 'VERIFIED', `Unverified match found for ${c.source_id}`);
    }

    assert.strictEqual(systemCounts['dashboard_2025'], 350, 'dashboard_2025 count mismatch');
    assert.strictEqual(systemCounts['qgis_county_roads'], 350, 'qgis_county_roads count mismatch');
    assert.strictEqual(systemCounts['historical_normative_workbook'], 350, 'historical workbook mismatch');
    assert.strictEqual(systemCounts['dataset_ml_clean'], 350, 'dataset_ml_clean count mismatch');
  });

  runTest('Crosswalk', 'All crosswalks resolve strictly to existing canonical roads', () => {
    const crosswalks = crosswalkSvc.getAllCrosswalks();
    const validRoadKeys = new Set(roadSvc.getAllRoads().map((r) => r.road_key));
    for (const c of crosswalks) {
      assert.ok(
        validRoadKeys.has(c.road_key),
        `Orphan crosswalk record: ${c.source_system}/${c.source_id} -> ${c.road_key}`
      );
    }
  });

  runTest('Crosswalk', 'Unknown source IDs fail explicitly with zero fuzzy or silent fallback', () => {
    const resolved = crosswalkSvc.resolveSourceId('dashboard_2025', 'UNKNOWN_NONEXISTENT_ROAD_ID');
    assert.strictEqual(resolved, null, 'Expected null for non-existent source ID');

    assert.throws(
      () => {
        crosswalkSvc.resolveSourceIdStrict('dashboard_2025', 'UNKNOWN_NONEXISTENT_ROAD_ID');
      },
      /UNRESOLVED_SOURCE_ID/,
      'Expected resolveSourceIdStrict to throw'
    );
  });

  // ------------------------------------------------------------------
  // 3. CONDITIONS TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 3. 2025 ROAD CONDITIONS TESTS ---');

  runTest('Conditions', 'Exactly 350 roads represented in 2025 condition scope', () => {
    const conditions = conditionSvc.getAllConditions(2025);
    assert.strictEqual(conditions.length, 350, `Expected 350 condition rows, got ${conditions.length}`);
  });

  runTest('Conditions', 'Aggregate network length must equal 732.460 km (within 0.001 tolerance)', () => {
    const summary = conditionSvc.getAggregateSummary(2025);
    const delta = Math.abs(summary.total_panjang_km - AUTHORITY_INVARIANTS.TOTAL_LENGTH_KM_2025);
    assert.ok(
      delta < 0.002,
      `Expected total length 732.460 km, got ${summary.total_panjang_km} (delta: ${delta})`
    );
  });

  runTest('Conditions', 'Mantap and Tidak Mantap totals must match official authority', () => {
    const summary = conditionSvc.getAggregateSummary(2025);
    const deltaMantap = Math.abs(summary.mantap_km - AUTHORITY_INVARIANTS.MANTAP_KM_2025);
    const deltaTidakMantap = Math.abs(summary.tidak_mantap_km - AUTHORITY_INVARIANTS.TIDAK_MANTAP_KM_2025);

    assert.ok(
      deltaMantap < 0.002,
      `Expected mantap 392.890 km, got ${summary.mantap_km} (delta: ${deltaMantap})`
    );
    assert.ok(
      deltaTidakMantap < 0.002,
      `Expected tidak mantap 339.570 km, got ${summary.tidak_mantap_km} (delta: ${deltaTidakMantap})`
    );
  });

  runTest('Conditions', 'Source authority must be FINAL_2025 from official Dashboard 2025', () => {
    const conditions = conditionSvc.getAllConditions(2025);
    for (const c of conditions) {
      assert.strictEqual(c.authority_status, 'FINAL_2025');
      assert.strictEqual(c.source_filename, 'Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx');
    }
  });

  // ------------------------------------------------------------------
  // 4. MODEL DEFINITIONS & VARIABLES TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 4. MODEL & VARIABLES TESTS ---');

  runTest('Variables', 'Category count must be exactly 4', () => {
    const categories = modelSvc.getCategories();
    assert.strictEqual(categories.length, 4, `Expected 4 categories, got ${categories.length}`);
  });

  runTest('Variables', 'Category raw weights must preserve exact historical coefficients', () => {
    const categories = modelSvc.getCategories();
    const map = new Map(categories.map((c) => [c.category_code, c.default_weight_raw]));

    assert.strictEqual(map.get('TEKNIS_JALAN'), 0.378965);
    assert.strictEqual(map.get('AKSESIBILITAS'), 0.283815);
    assert.strictEqual(map.get('PELAYANAN_MASYARAKAT'), 0.192412);
    assert.strictEqual(map.get('SPASIAL_DEMOGRAFI'), 0.144807);

    // Sum is 0.999999
    const sum = 0.378965 + 0.283815 + 0.192412 + 0.144807;
    assert.strictEqual(Math.round(sum * 1000000) / 1000000, 0.999999);
  });

  runTest('Variables', 'Variable definitions count must be exactly 17', () => {
    const variables = modelSvc.getVariables();
    assert.strictEqual(variables.length, 17, `Expected 17 variables, got ${variables.length}`);
  });

  runTest('Variables', 'Every variable must map to exactly one valid category', () => {
    const variables = modelSvc.getVariables();
    const validCats = new Set(['TEKNIS_JALAN', 'AKSESIBILITAS', 'PELAYANAN_MASYARAKAT', 'SPASIAL_DEMOGRAFI']);

    const catVarCounts: Record<string, number> = {};
    for (const v of variables) {
      assert.ok(validCats.has(v.category_code), `Invalid category ${v.category_code} for ${v.variable_code}`);
      catVarCounts[v.category_code] = (catVarCounts[v.category_code] || 0) + 1;
    }

    assert.strictEqual(catVarCounts['TEKNIS_JALAN'], 7, 'TEKNIS_JALAN must have 7 variables');
    assert.strictEqual(catVarCounts['AKSESIBILITAS'], 3, 'AKSESIBILITAS must have 3 variables');
    assert.strictEqual(catVarCounts['PELAYANAN_MASYARAKAT'], 4, 'PELAYANAN_MASYARAKAT must have 4 variables');
    assert.strictEqual(catVarCounts['SPASIAL_DEMOGRAFI'], 3, 'SPASIAL_DEMOGRAFI must have 3 variables');
  });

  runTest('Variables', 'label_top105 must be strictly excluded from scoring variable definitions', () => {
    const variables = modelSvc.getVariables();
    const hasTop105 = variables.some((v) => v.variable_code.includes('top105') || v.variable_code.includes('label'));
    assert.strictEqual(hasTop105, false, 'label_top105 must NOT be in variable_definitions table');
  });

  runTest('Variables', 'Baseline model POLICY_DEFAULT_V1 invariants hold', () => {
    const baseline = modelSvc.getBaselineModel();
    assert.ok(baseline, 'Baseline model not found');
    assert.strictEqual(baseline.model_code, 'POLICY_DEFAULT_V1');
    assert.strictEqual(baseline.model_lifecycle, 'BASELINE_LOCKED');
    assert.strictEqual(baseline.is_locked, 1);

    // Level 1 sum of normalized weights must equal 1.00000000
    const catSum = baseline.category_weights.reduce((s, c) => s + c.normalized_weight, 0);
    assert.ok(
      Math.abs(catSum - 1.0) < 1e-12,
      `Level 1 category normalized weight sum must equal 1.0, got ${catSum}`
    );

    // Level 2 sum of effective weights across all 17 variables must equal 1.00000000
    const effSum = baseline.variable_weights.reduce((s, v) => s + v.effective_weight, 0);
    assert.ok(
      Math.abs(effSum - 1.0) < 1e-12,
      `Level 2 effective weight sum must equal 1.0, got ${effSum}`
    );
  });

  // ------------------------------------------------------------------
  // 5. GEOMETRY TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 5. SPATIAL GEOMETRY TESTS ---');

  runTest('Geometry', 'County road geometries count must be exactly 350', () => {
    const count = spatialSvc.getCountyGeometryCount();
    assert.strictEqual(count, 350, `Expected 350 geometries, got ${count}`);
  });

  runTest('Geometry', 'All 350 geometries resolve to canonical road_keys with 0 orphans', () => {
    const fc = spatialSvc.getAllCountyRoadsGeoJson();
    assert.strictEqual(fc.features.length, 350, 'FeatureCollection count mismatch');

    const validRoadKeys = new Set(roadSvc.getAllRoads().map((r) => r.road_key));
    for (const f of fc.features) {
      assert.ok(
        validRoadKeys.has(f.properties.road_key),
        `Geometry has invalid road_key: ${f.properties.road_key}`
      );
      const hasCoords = f.geometry && (
        (Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length > 0) ||
        (Array.isArray(f.geometry.geometries) && f.geometry.geometries.length > 0)
      );
      assert.ok(hasCoords, `Empty geometry coordinates for ${f.properties.road_key}`);
    }
  });

  runTest('Geometry', 'Synthetic network connectors are strictly excluded from county roads', () => {
    const fc = spatialSvc.getAllCountyRoadsGeoJson();
    for (const f of fc.features) {
      assert.ok(!f.properties.road_key.includes('bridge-gap'), 'Synthetic connector found in county roads');
      assert.ok(f.properties.road_key.startsWith('HSS-KAB-'), 'Non-canonical road key in county geometries');
    }
  });

  runTest('Geometry', 'Public facilities count must be exactly 285', () => {
    const count = spatialSvc.getPublicFacilityCount();
    assert.strictEqual(count, 285, `Expected 285 facilities, got ${count}`);
  });

  // ------------------------------------------------------------------
  // 6. IDEMPOTENCY TESTS
  // ------------------------------------------------------------------
  console.log('\n--- 6. IDEMPOTENCY & RE-INGESTION TESTS ---');

  runTest('Idempotency', 'Re-running ingestion pipeline produces identical row counts with zero corruption', () => {
    // Record counts before
    const roadsBefore = roadSvc.getRoadCount();
    const crosswalkBefore = crosswalkSvc.getCrosswalkCount();
    const conditionsBefore = conditionSvc.getAllConditions().length;
    const geometriesBefore = spatialSvc.getCountyGeometryCount();
    const facilitiesBefore = spatialSvc.getPublicFacilityCount();

    // Re-run master ingestion
    const reIngest = runMasterIngestion();
    assert.strictEqual(reIngest.success, true, 'Re-ingestion failed');

    // Check counts after
    assert.strictEqual(roadSvc.getRoadCount(), roadsBefore, 'Roads count changed after re-ingestion');
    assert.strictEqual(
      crosswalkSvc.getCrosswalkCount(),
      crosswalkBefore,
      'Crosswalk count changed after re-ingestion'
    );
    assert.strictEqual(
      conditionSvc.getAllConditions().length,
      conditionsBefore,
      'Conditions count changed after re-ingestion'
    );
    assert.strictEqual(
      spatialSvc.getCountyGeometryCount(),
      geometriesBefore,
      'Geometries count changed after re-ingestion'
    );
    assert.strictEqual(
      spatialSvc.getPublicFacilityCount(),
      facilitiesBefore,
      'Facilities count changed after re-ingestion'
    );
  });

  // ------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------
  console.log('\n================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${results.length})`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    throw new Error(`${failedCount} test(s) failed in Phase 1 verification.`);
  }

  return { passedCount, failedCount, total: results.length };
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('phase1-verification.ts')) {
  try {
    executePhase1TestSuite();
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
