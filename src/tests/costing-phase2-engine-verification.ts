import assert from 'node:assert';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { TreatmentCostingEngine } from '../services/treatmentCostingEngine.ts';
import { CostingReferenceService } from '../services/costingReferenceService.ts';

console.log('================================================================');
console.log('STARTING PHASE 2 ASB TREATMENT & COSTING ENGINE VERIFICATION');
console.log('================================================================');

const db = getDatabase();
const engine = new TreatmentCostingEngine(db);
const costingRef = new CostingReferenceService(db);

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
// SUITE 1: TREATMENT RULE EVALUATION (R01..R06)
// -------------------------------------------------------------
console.log('\n--- 1. TREATMENT SELECTION RULES R01..R06 ---');

runTest('Rule Evaluation', 'Exactly 6 treatment rules R01..R06 exist with strict priority hierarchy and mapped AHSP profiles', () => {
  const rules = engine.getTreatmentRules();
  assert.strictEqual(rules.length, 6, `Expected 6 rules, got ${rules.length}`);
  const expectedRules = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'];
  assert.deepStrictEqual(rules.map((r: any) => r.rule_id), expectedRules);
  for (let i = 0; i < rules.length; i++) {
    assert.strictEqual(rules[i].priority_order, i + 1, `Rule ${rules[i].rule_id} priority order must be ${i + 1}`);
  }
  // Verify profile description and mapped AHSP items count
  const r01 = rules.find((r: any) => r.rule_id === 'R01');
  assert.ok(r01.profile_description, 'R01 profile description must not be null');
  assert.strictEqual(r01.mapped_ahsp_items_count, 5, 'R01 must have exactly 5 mapped AHSP items');

  const r02 = rules.find((r: any) => r.rule_id === 'R02');
  assert.strictEqual(r02.mapped_ahsp_items_count, 3, 'R02 must have exactly 3 mapped AHSP items');

  const r04 = rules.find((r: any) => r.rule_id === 'R04');
  assert.strictEqual(r04.mapped_ahsp_items_count, 4, 'R04 must have exactly 4 mapped AHSP items');

  const r05 = rules.find((r: any) => r.rule_id === 'R05');
  assert.strictEqual(r05.mapped_ahsp_items_count, 3, 'R05 must have exactly 3 mapped AHSP items');

  const r06 = rules.find((r: any) => r.rule_id === 'R06');
  assert.strictEqual(r06.mapped_ahsp_items_count, 0, 'R06 routine maintenance has 0 mapped ASB items');
});

runTest('Rule Evaluation', 'R01 triggers for unpaved surface or corridor heavy damage', () => {
  const dummySeg = {
    segment_id: 'TEST-SEG-R01',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 100,
    segment_length_m: 100,
    road_width_m: 4.5,
    surface_type: 'Tanah',
    dominant_condition: 'Rusak Berat',
    segment_status: 'Kritis',
    recommended_treatment: 'Rekonstruksi',
  };
  const res = engine.evaluateSegment(dummySeg);
  assert.strictEqual(res.rule_id, 'R01');
  assert.strictEqual(res.asb_type, 'D');
  assert.ok(res.asb_id !== null, 'R01 must match a valid ASB package');
  assert.ok(res.indicative_cost_rp > 0);
});

runTest('Rule Evaluation', 'R02 triggers for major rehabilitation on critical paved corridor', () => {
  const dummySeg = {
    segment_id: 'TEST-SEG-R02',
    road_key: 'HSS-KAB-001',
    sta_start_m: 100,
    sta_end_m: 200,
    segment_length_m: 100,
    road_width_m: 4.0,
    surface_type: 'Aspal',
    dominant_condition: 'Rusak Ringan',
    segment_status: 'Perlu Perbaikan',
    recommended_treatment: 'Rehabilitasi Mayor',
  };
  const cond = { tidak_mantap_pct: 45, rusak_berat_pct: 10 };
  const res = engine.evaluateSegment(dummySeg, cond);
  assert.strictEqual(res.rule_id, 'R02');
  assert.strictEqual(res.asb_type, 'C');
  assert.ok(res.asb_id !== null);
  assert.ok(res.indicative_cost_rp > 0);
});

runTest('Rule Evaluation', 'R06 triggers as default routine maintenance for good condition segments', () => {
  const dummySeg = {
    segment_id: 'TEST-SEG-R06',
    road_key: 'HSS-KAB-001',
    sta_start_m: 300,
    sta_end_m: 400,
    segment_length_m: 100,
    road_width_m: 5.0,
    surface_type: 'Aspal',
    dominant_condition: 'Baik',
    segment_status: 'Mantap',
    recommended_treatment: 'Pemeliharaan Rutin',
  };
  const res = engine.evaluateSegment(dummySeg);
  assert.strictEqual(res.rule_id, 'R06');
  assert.strictEqual(res.asb_type, 'NONE');
  assert.strictEqual(res.indicative_cost_rp, 0);
  assert.strictEqual(res.indicative_cost_sen, 0);
});

// -------------------------------------------------------------
// SUITE 2: ASB MATCHING & STANDARD DIMENSIONS
// -------------------------------------------------------------
console.log('\n--- 2. ASB BM 2027 PACKAGE MATCHING ---');

runTest('ASB Matching', 'Survey width snaps to closest standard ASB package width (3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0)', () => {
  // 3.3m should snap to 3.5m
  const segA = {
    segment_id: 'TEST-WIDTH-A',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 100,
    segment_length_m: 100,
    road_width_m: 3.3,
    surface_type: 'Tanah',
    dominant_condition: 'Rusak Berat',
    segment_status: 'Kritis',
    recommended_treatment: 'Rekonstruksi',
  };
  const resA = engine.evaluateSegment(segA);
  assert.strictEqual(resA.matched_width_m, 3.5);

  // 4.8m should snap to 5.0m
  const segB = {
    segment_id: 'TEST-WIDTH-B',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 100,
    segment_length_m: 100,
    road_width_m: 4.8,
    surface_type: 'Tanah',
    dominant_condition: 'Rusak Berat',
    segment_status: 'Kritis',
    recommended_treatment: 'Rekonstruksi',
  };
  const resB = engine.evaluateSegment(segB);
  assert.strictEqual(resB.matched_width_m, 5.0);
});

runTest('ASB Matching', 'Width > 5.0m triggers MANUAL_REVIEW_WIDTH_EXCEEDED and excludes cost (Rp 0)', () => {
  const segWide = {
    segment_id: 'TEST-WIDTH-WIDE',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 100,
    segment_length_m: 100,
    road_width_m: 12.0,
    surface_type: 'Aspal',
    dominant_condition: 'Rusak Ringan',
    segment_status: 'Perlu Perbaikan',
    recommended_treatment: 'Rehabilitasi Ringan',
  };
  const cond = { tidak_mantap_pct: 35.7, rusak_berat_pct: 0 };
  const resWide = engine.evaluateSegment(segWide, cond);
  assert.strictEqual(resWide.status, 'MANUAL_REVIEW_WIDTH_EXCEEDED');
  assert.strictEqual(resWide.indicative_cost_rp, 0);
  assert.strictEqual(resWide.indicative_cost_sen, 0);
  assert.strictEqual(resWide.asb_id, null);
  assert.ok(resWide.adjustment_flags.includes('MANUAL_REVIEW_WIDTH_EXCEEDED'));
  assert.ok(resWide.adjustment_flags.includes('UNSUPPORTED_WIDTH_EXTRAPOLATION_EXCLUDED'));
});

runTest('ASB Matching', 'Matched ASB package exists in master_asb_items with positive unit price', () => {
  const dummySeg = {
    segment_id: 'TEST-ASB-LOOKUP',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 100,
    segment_length_m: 100,
    road_width_m: 4.5,
    surface_type: 'Tanah',
    dominant_condition: 'Rusak Berat',
    segment_status: 'Kritis',
    recommended_treatment: 'Rekonstruksi',
  };
  const res = engine.evaluateSegment(dummySeg);
  assert.ok(res.asb_id);
  const asbItem = db.prepare('SELECT * FROM master_asb_items WHERE asb_id = ?').get(res.asb_id) as any;
  assert.ok(asbItem);
  assert.strictEqual(res.unit_price_rp, asbItem.unit_price_rp);
  assert.strictEqual(res.unit_price_sen, asbItem.unit_price_sen);
  assert.ok(res.unit_price_rp > 0);
});

// -------------------------------------------------------------
// SUITE 3: INTEGER-SEN MONEY ARITHMETIC & PRECISION
// -------------------------------------------------------------
console.log('\n--- 3. INTEGER-SEN PRECISION ---');

runTest('Integer-Sen Precision', 'Segment indicative cost in sen is exact product of length and unit price sen', () => {
  const dummySeg = {
    segment_id: 'TEST-SEN-EXACT',
    road_key: 'HSS-KAB-001',
    sta_start_m: 0,
    sta_end_m: 125,
    segment_length_m: 125,
    road_width_m: 4.0,
    surface_type: 'Tanah',
    dominant_condition: 'Rusak Berat',
    segment_status: 'Kritis',
    recommended_treatment: 'Rekonstruksi',
  };
  const res = engine.evaluateSegment(dummySeg);
  const expectedSen = res.segment_length_m * res.unit_price_sen;
  assert.strictEqual(res.indicative_cost_sen, expectedSen);
  assert.strictEqual(res.indicative_cost_rp, Math.round(expectedSen / 100));
  assert.ok(Number.isInteger(res.indicative_cost_sen));
});

runTest('Integer-Sen Precision', 'Zero floating point drift when aggregating 10,000 sen values', () => {
  const baseSen = 72345678; // Rp 723.456,78
  let totalSen = 0;
  for (let i = 0; i < 10000; i++) {
    totalSen += baseSen;
  }
  assert.strictEqual(totalSen, baseSen * 10000);
  assert.ok(Number.isInteger(totalSen));
  const rpTotal = CostingReferenceService.senToRp(totalSen);
  assert.strictEqual(rpTotal, (baseSen * 10000) / 100);
});

// -------------------------------------------------------------
// SUITE 4: SCENARIO CALCULATION & CEILING ALLOCATION
// -------------------------------------------------------------
console.log('\n--- 4. SCENARIO CALCULATION & ALLOCATION ---');

let baselineSummary: any;

runTest('Scenario Calculation', 'Calculate and persist SCN-2027-BASELINE evaluates all 7,487 segments across 350 roads', () => {
  baselineSummary = engine.calculateAndPersistScenario('SCN-2027-BASELINE');
  assert.strictEqual(baselineSummary.scenario_code, 'BASELINE_2027');
  assert.strictEqual(baselineSummary.total_roads, 350);
  assert.strictEqual(baselineSummary.total_segments, 7487);
  assert.strictEqual(baselineSummary.treated_segments, 3421);
  assert.strictEqual(baselineSummary.routine_segments, 4064);
  assert.strictEqual(baselineSummary.manual_review_segments, 2);
  assert.strictEqual(baselineSummary.treated_segments + baselineSummary.routine_segments + baselineSummary.manual_review_segments, 7487);
});

runTest('Scenario Calculation', 'SCN-2027-BASELINE total cost and allocated cost match authority constants', () => {
  assert.strictEqual(baselineSummary.budget_ceiling_rp, 50000000000); // Rp 50 M
  assert.strictEqual(baselineSummary.total_cost_rp, 784322010000); // Rp 784,32 M (reconciled: -Rp 424.400.000)
  assert.strictEqual(baselineSummary.allocated_cost_rp, 48789930000); // Rp 48,79 M (reconciled: -Rp 424.400.000)
  assert.strictEqual(baselineSummary.funded_roads, 19);
  assert.strictEqual(baselineSummary.deferred_roads, 331);
  assert.strictEqual(baselineSummary.treated_segments, 3421);
  assert.strictEqual(baselineSummary.routine_segments, 4064);
  assert.strictEqual(baselineSummary.manual_review_segments, 2);
  assert.ok(Math.abs(baselineSummary.treated_length_km - 336.29) < 0.1);
  assert.ok(Math.abs(baselineSummary.manual_review_length_km - 0.20) < 0.05);
});

runTest('Scenario Calculation', 'Allocated cost is strictly within budget ceiling (allocated <= ceiling)', () => {
  assert.ok(
    baselineSummary.allocated_cost_rp <= baselineSummary.budget_ceiling_rp,
    `Allocated ${baselineSummary.allocated_cost_rp} must be <= ceiling ${baselineSummary.budget_ceiling_rp}`
  );
  assert.ok(baselineSummary.allocated_cost_sen <= baselineSummary.budget_ceiling_sen);
});

runTest('Ceiling Allocation', 'Road summaries strictly observe priority ranking and monotonic cumulative cost for exactly 350 roads', () => {
  const roads = engine.getRoadCostSummaries('SCN-2027-BASELINE');
  assert.strictEqual(roads.length, 350, `Expected exactly 350 roads, got ${roads.length}`);

  let prevCumulative = 0;
  let fundedCount = 0;

  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    assert.strictEqual(r.allocation_rank, i + 1);

    // Cumulative cost check
    assert.strictEqual(r.cumulative_cost_rp, prevCumulative + r.total_pagu_asb_rp);
    prevCumulative = r.cumulative_cost_rp;

    // Threshold check
    if (r.is_funded === 1) {
      fundedCount++;
      assert.ok(r.cumulative_cost_rp <= baselineSummary.budget_ceiling_rp);
    } else {
      assert.ok(r.cumulative_cost_rp > baselineSummary.budget_ceiling_rp);
    }
  }

  assert.strictEqual(fundedCount, 19);
});

runTest('Road Filter & Summaries', 'Dominant ASB types match standard codes and support filtering', () => {
  const roadsD = engine.getRoadCostSummaries('SCN-2027-BASELINE', { dominantType: 'D' });
  assert.strictEqual(roadsD.length, 114, `Expected 114 roads with dominant type D, got ${roadsD.length}`);

  const roadsC = engine.getRoadCostSummaries('SCN-2027-BASELINE', { dominantType: 'C' });
  assert.strictEqual(roadsC.length, 51, `Expected 51 roads with dominant type C, got ${roadsC.length}`);

  const roadsB = engine.getRoadCostSummaries('SCN-2027-BASELINE', { dominantType: 'B' });
  assert.strictEqual(roadsB.length, 16, `Expected 16 roads with dominant type B, got ${roadsB.length}`);

  const roadsA = engine.getRoadCostSummaries('SCN-2027-BASELINE', { dominantType: 'A' });
  assert.strictEqual(roadsA.length, 31, `Expected 31 roads with dominant type A, got ${roadsA.length}`);

  const roadsNone = engine.getRoadCostSummaries('SCN-2027-BASELINE', { dominantType: 'NONE' });
  assert.strictEqual(roadsNone.length, 138, `Expected 138 roads with dominant type NONE, got ${roadsNone.length}`);

  assert.strictEqual(roadsD.length + roadsC.length + roadsB.length + roadsA.length + roadsNone.length, 350);
});

// -------------------------------------------------------------
// SUITE 5: COMPARISON & SECOND SCENARIO DYNAMICS
// -------------------------------------------------------------
console.log('\n--- 5. MULTI-SCENARIO DYNAMICS & COMPARISON ---');

runTest('Multi-Scenario', 'Create or recalculate SCN-2027-OPT_30M with Rp 30 M ceiling', () => {
  let optScn = costingRef.getScenarioById('SCN-2027-OPT_30M');
  if (!optScn) {
    optScn = engine.createScenario({
      scenario_code: 'OPT_30M',
      scenario_name: 'Skenario Alokasi Terbatas (Plafon Rp 30 Miliar)',
      budget_year: 2027,
      budget_ceiling_rp: 30000000000,
      description: 'Skenario simulasi fiskal pagu Rp 30 Miliar.',
    });
  } else {
    optScn = engine.calculateAndPersistScenario('SCN-2027-OPT_30M');
  }

  assert.ok(optScn);
  assert.strictEqual(optScn.budget_ceiling_rp, 30000000000);
  assert.ok(optScn.allocated_cost_rp <= 30000000000);
  assert.ok(optScn.funded_roads < 19, '30M ceiling should fund fewer roads than 50M');
  assert.ok(optScn.funded_roads > 0);
});

runTest('Multi-Scenario', 'Comparison summary lists all scenarios with correct aggregated metrics', () => {
  const comparison = engine.getScenarioComparison();
  assert.ok(comparison.length >= 2);
  const base = comparison.find((s) => s.scenario_id === 'SCN-2027-BASELINE');
  const opt = comparison.find((s) => s.scenario_id === 'SCN-2027-OPT_30M');
  assert.ok(base);
  assert.ok(opt);
  assert.strictEqual(base.funded_roads, 19);
  assert.ok(opt.funded_roads <= base.funded_roads);
});

runTest('Edge Case Dynamics', 'Scenario with ceiling smaller than rank #1 road allocates Rp 0 across 0 funded roads', () => {
  const lowCeilingCode = `LOWCEIL_${Date.now()}`;
  const lowCeilingScn = engine.createScenario({
    scenario_code: lowCeilingCode,
    scenario_name: 'Skenario Plafon Mikro (Rp 100 Juta)',
    budget_year: 2027,
    budget_ceiling_rp: 100000000, // Rp 100 Juta, far below Road #1 pagu
    description: 'Pengujian batas bawah fiskal plafon mikro',
  });

  assert.strictEqual(lowCeilingScn.budget_ceiling_rp, 100000000);
  assert.strictEqual(lowCeilingScn.funded_roads, 0, 'No roads should be funded when ceiling is smaller than rank #1');
  assert.strictEqual(lowCeilingScn.deferred_roads, 350);
  assert.strictEqual(lowCeilingScn.allocated_cost_rp, 0);
  assert.strictEqual(lowCeilingScn.allocated_cost_sen, 0);
  assert.ok(lowCeilingScn.allocated_cost_rp <= lowCeilingScn.budget_ceiling_rp);

  // Clean up
  engine.deleteScenario(lowCeilingScn.scenario_id);
});

// -------------------------------------------------------------
// SUITE 6: SINGLE ROAD DETAIL & AHSP PROFILE BREAKDOWN
// -------------------------------------------------------------
console.log('\n--- 6. ROAD TRACEABILITY & AHSP PROFILE BREAKDOWN ---');

runTest('Traceability', 'getRoadCostDetail returns road info, summary, segment list, and AHSP breakdown', () => {
  const detail = engine.getRoadCostDetail('SCN-2027-BASELINE', 'HSS-KAB-001');
  assert.ok(detail);
  assert.ok(detail.road);
  assert.strictEqual(detail.road.road_key, 'HSS-KAB-001');
  assert.ok(detail.summary);
  assert.strictEqual(detail.summary.road_key, 'HSS-KAB-001');
  assert.ok(Array.isArray(detail.segments));
  assert.strictEqual(detail.segments.length, 6);

  // Segments 0 and 1 exceed 5.0m width (12.0m) and are marked MANUAL_REVIEW_MODE
  const seg0 = detail.segments[0];
  assert.strictEqual(seg0.calculation_mode, 'MANUAL_REVIEW_MODE');
  assert.ok(seg0.package_name.includes('Penanganan Khusus'));
  assert.strictEqual(seg0.indicative_cost_rp, 0);

  // Sum of segment costs equals total pagu
  const segCostSum = detail.segments.reduce((acc: number, s: any) => acc + (s.indicative_cost_rp || 0), 0);
  assert.strictEqual(segCostSum, detail.summary.total_pagu_asb_rp);

  // Also test a road with treated segments for AHSP profile items
  const treatedDetail = engine.getRoadCostDetail('SCN-2027-BASELINE', 'HSS-KAB-025');
  assert.ok(treatedDetail);
  assert.ok(treatedDetail.summary.treated_segments > 0);
  assert.ok(Array.isArray(treatedDetail.ahspBreakdown));
  assert.ok(treatedDetail.ahspBreakdown.length > 0, 'Road with treated segments must map to AHSP breakdown items');
  for (const item of treatedDetail.ahspBreakdown) {
    assert.ok(item.rule_identifier || item.profile_item_id);
    assert.ok(item.description || item.item_description);
    assert.ok(item.division_code >= 1 && item.division_code <= 10);
  }
});

// -------------------------------------------------------------
// SUITE 7: SCENARIO CRUD LIFECYCLE & CASCADE ISOLATION
// -------------------------------------------------------------
console.log('\n--- 7. SCENARIO CRUD LIFECYCLE & INTEGRITY ---');

runTest('Scenario Lifecycle', 'Scenario creation, update, and cascade deletion behave correctly', () => {
  // Clean up any lingering test scenario from prior runs
  try { db.exec("DELETE FROM budget_scenarios WHERE scenario_code LIKE 'TEMP_%';"); } catch {}

  const tempCode = `TEMP_${Date.now()}`;
  // 1. Create temporary scenario
  const created = engine.createScenario({
    scenario_code: tempCode,
    scenario_name: 'Skenario Uji Temporer',
    budget_year: 2027,
    budget_ceiling_rp: 20000000000,
    description: 'Untuk pengujian lifecycle otomatis',
  });
  assert.ok(created.scenario_id);

  // Check estimates and summaries exist
  const countEst = db.prepare('SELECT count(*) as cnt FROM road_segment_cost_estimates WHERE scenario_id = ?').get(created.scenario_id) as any;
  assert.strictEqual(countEst.cnt, 7487);
  const countSum = db.prepare('SELECT count(*) as cnt FROM road_cost_summaries WHERE scenario_id = ?').get(created.scenario_id) as any;
  assert.strictEqual(countSum.cnt, 350);

  // 2. Update scenario ceiling
  const updated = engine.updateScenario(created.scenario_id, {
    scenario_name: 'Skenario Uji Temporer (Updated)',
    budget_ceiling_rp: 25000000000,
  });
  assert.strictEqual(updated.budget_ceiling_rp, 25000000000);

  // 3. Delete scenario (should cascade delete all 7,487 estimates and 350 summaries)
  const deleted = engine.deleteScenario(created.scenario_id);
  assert.strictEqual(deleted, true);

  const checkEst = db.prepare('SELECT count(*) as cnt FROM road_segment_cost_estimates WHERE scenario_id = ?').get(created.scenario_id) as any;
  assert.strictEqual(checkEst.cnt, 0);
  const checkSum = db.prepare('SELECT count(*) as cnt FROM road_cost_summaries WHERE scenario_id = ?').get(created.scenario_id) as any;
  assert.strictEqual(checkSum.cnt, 0);
});

runTest('Scenario Lifecycle', 'SCN-2027-BASELINE is protected from deletion', () => {
  assert.throws(
    () => {
      engine.deleteScenario('SCN-2027-BASELINE');
    },
    /PROTECTED_SCENARIO/,
    'Deleting SCN-2027-BASELINE must throw PROTECTED_SCENARIO'
  );
});

// -------------------------------------------------------------
// SUITE 8: CSV EXPORT FIDELITY
// -------------------------------------------------------------
console.log('\n--- 8. CSV EXPORT FIDELITY ---');

runTest('CSV Export', 'exportScenarioCsv generates RFC-compliant CSV with UTF-8 BOM, all 350 roads, and headers', () => {
  const csv = engine.exportScenarioCsv('SCN-2027-BASELINE');
  assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for Excel compatibility');
  const lines = csv.replace('\uFEFF', '').split('\r\n').filter((l) => l.trim().length > 0);
  // 7 comment lines + 1 header line + 350 data rows = 358 lines
  assert.strictEqual(lines.length, 358, `Expected 358 lines (7 meta + 1 header + 350 rows), got ${lines.length}`);

  const header = lines[7];
  assert.ok(header.includes('Kode Ruas'));
  assert.ok(header.includes('Nama Ruas'));
  assert.ok(header.includes('Kecamatan'));
  assert.ok(header.includes('Total Pagu ASB (Rp)'));
  assert.ok(header.includes('Status Alokasi Plafon'));

  // First data line (line 8) should be allocation rank 1
  assert.ok(lines[8].startsWith('1,'));
  assert.ok(lines[8].includes('TERAKOMODASI'));
});

// -------------------------------------------------------------
// SUITE 9: REFERENCE CATALOG SEARCH
// -------------------------------------------------------------
console.log('\n--- 9. REFERENCE CATALOG SEARCH ---');

runTest('Catalog Search', 'searchASB supports search query, category filtering, and type filtering', () => {
  const allJalan = engine.searchASB({ category: 'Jalan Kabupaten', limit: 2000 });
  assert.strictEqual(allJalan.length, 932);

  const jembatan = engine.searchASB({ category: 'Jembatan pada Jalan Kabupaten', limit: 2000 });
  assert.strictEqual(jembatan.length, 78);

  const queryMatch = engine.searchASB({ search: 'Tipe A', limit: 10 });
  assert.ok(queryMatch.length > 0);
  for (const item of queryMatch) {
    const text = (item.package_name + ' ' + (item.specification || '')).toLowerCase();
    assert.ok(text.includes('tipe a'));
  }
});

runTest('Catalog Search', 'searchAHSP supports query and division filtering', () => {
  const div3 = engine.searchAHSP({ division: 3, limit: 100 });
  assert.ok(div3.length > 0);
  for (const item of div3) {
    assert.strictEqual(item.division_code, 3);
  }

  const queryMatch = engine.searchAHSP({ search: 'aspal', limit: 10 });
  assert.ok(queryMatch.length > 0);
});

// -------------------------------------------------------------
// SUITE 10: BASELINE INVARIANTS PROTECTION
// -------------------------------------------------------------
console.log('\n--- 10. BASELINE INVARIANTS PROTECTION ---');

runTest('Baseline Protection', 'Canonical 350 roads, official 2025 conditions (732.46 km), and model weights remain 100% intact', () => {
  const roadCount = db.prepare('SELECT count(*) as cnt FROM roads;').get() as any;
  assert.strictEqual(roadCount.cnt, 350);

  const condStats = db.prepare('SELECT sum(total_panjang_km) as totalKm FROM road_conditions WHERE survey_year = 2025;').get() as any;
  assert.ok(Math.abs(condStats.totalKm - 732.46) < 0.001);

  const catWeights = db.prepare('SELECT sum(normalized_weight) as sumWeight FROM model_category_weights;').get() as any;
  assert.ok(Math.abs(catWeights.sumWeight - 1.0) < 0.001);

  const varDefs = db.prepare('SELECT count(*) as cnt FROM variable_definitions;').get() as any;
  assert.strictEqual(varDefs.cnt, 17);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`PHASE 2 ENGINE SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${passedTests + failedTests})`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error(`VERIFICATION FAILED: ${failedTests} test(s) failed.`);
  process.exit(1);
} else {
  console.log('ALL PHASE 2 ASB COSTING ENGINE TESTS PASSED SUCCESSFULLY!');
}
