import { UiDataService } from '../services/uiDataService.ts';

// Test assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`TEST FAILED: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runPhase3Verification() {
  console.log('================================================================');
  console.log('STARTING PHASE 3 RECONCILED AUTOMATED VERIFICATION SUITE');
  console.log('================================================================\n');

  const uiService = new UiDataService();
  let totalTests = 0;

  // --- TEST GROUP 1: DASHBOARD OFFICIAL METRICS & KPIS ---
  console.log('--- 1. DASHBOARD OFFICIAL METRICS & KPIS ---');
  const dashboard2025 = uiService.getDashboardData('OPERATIONAL_2025');

  assert(dashboard2025.kpis.totalRoads === 350, 'Dashboard -> Total roads must be exactly 350');
  totalTests++;

  assert(
    Math.abs(dashboard2025.kpis.totalLengthKm - 732.46) < 0.001,
    'Dashboard -> Total length must equal 732.460 km'
  );
  totalTests++;

  assert(
    Math.abs(dashboard2025.kpis.mantapKm - 392.89) < 0.001,
    'Dashboard -> Mantap length must equal 392.890 km'
  );
  totalTests++;

  assert(
    Math.abs(dashboard2025.kpis.tidakMantapKm - 339.57) < 0.001,
    'Dashboard -> Tidak Mantap length must equal 339.570 km'
  );
  totalTests++;

  assert(
    dashboard2025.kpis.mantapPct === 53.64 && dashboard2025.kpis.tidakMantapPct === 46.36,
    'Dashboard -> Mantap/Tidak Mantap percentages must be 53.64% and 46.36%'
  );
  totalTests++;

  assert(
    dashboard2025.kpis.top35Count === 35 && dashboard2025.kpis.top105Count === 105,
    'Dashboard -> Top-35 and Top-105 counts must be 35 and 105'
  );
  totalTests++;

  assert(
    dashboard2025.categoryWeights.length === 4,
    'Dashboard -> Exactly 4 category weights presented'
  );
  totalTests++;

  // --- TEST GROUP 2: EXACT AUTHORITATIVE 2025 CONDITION AGGREGATES ---
  console.log('\n--- 2. EXACT AUTHORITATIVE 2025 CONDITION AGGREGATES ---');
  const cb = dashboard2025.conditionBreakdown;

  assert(
    Math.abs(cb.baik_km - 131.65) < 0.001,
    'Conditions -> Baik length must equal exactly 131.650 km'
  );
  totalTests++;

  assert(
    Math.abs(cb.sedang_km - 261.24) < 0.001,
    'Conditions -> Sedang length must equal exactly 261.240 km'
  );
  totalTests++;

  assert(
    Math.abs(cb.rusak_ringan_km - 111.41) < 0.001,
    'Conditions -> Rusak Ringan length must equal exactly 111.410 km'
  );
  totalTests++;

  assert(
    Math.abs(cb.rusak_berat_km - 228.16) < 0.001,
    'Conditions -> Rusak Berat length must equal exactly 228.160 km'
  );
  totalTests++;

  // Additive integrity proofs
  assert(
    Math.abs(cb.baik_km + cb.sedang_km - dashboard2025.kpis.mantapKm) < 0.001,
    'Conditions Proof -> Baik (131.65) + Sedang (261.24) == Mantap (392.890 km)'
  );
  totalTests++;

  assert(
    Math.abs(cb.rusak_ringan_km + cb.rusak_berat_km - dashboard2025.kpis.tidakMantapKm) < 0.001,
    'Conditions Proof -> Rusak Ringan (111.41) + Rusak Berat (228.16) == Tidak Mantap (339.570 km)'
  );
  totalTests++;

  assert(
    Math.abs(dashboard2025.kpis.mantapKm + dashboard2025.kpis.tidakMantapKm - dashboard2025.kpis.totalLengthKm) < 0.001,
    'Conditions Proof -> Mantap (392.89) + Tidak Mantap (339.57) == Total (732.460 km)'
  );
  totalTests++;

  // --- TEST GROUP 3: TOP-10 PRIORITY SNAPSHOT ---
  console.log('\n--- 3. TOP-10 PRIORITY SNAPSHOT ---');
  assert(dashboard2025.top10.length === 10, 'Top-10 -> Exactly 10 roads returned');
  totalTests++;

  const expectedRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const actualRanks = dashboard2025.top10.map((r) => r.priority_rank);
  assert(
    JSON.stringify(actualRanks) === JSON.stringify(expectedRanks),
    'Top-10 -> Priority ranks must be strictly contiguous sequence 1..10'
  );
  totalTests++;

  const rank1 = dashboard2025.top10[0];
  assert(
    rank1.road_key === 'HSS-KAB-025' && rank1.nomor_ruas === '025',
    'Top-10 -> Rank #1 must be canonical road HSS-KAB-025 (Singakarsa - Palas)'
  );
  totalTests++;

  assert(
    rank1.tier_category === 'TOP_35',
    'Top-10 -> Rank #1 tier category must be TOP_35'
  );
  totalTests++;

  // --- TEST GROUP 4: 350-ROAD PRIORITY TABLE DATASET ---
  console.log('\n--- 4. 350-ROAD PRIORITY TABLE DATASET ---');
  const tableData = uiService.getPriorityTableData('OPERATIONAL_2025');

  assert(tableData.length === 350, 'Table -> Exactly 350 roads present in priority table dataset');
  totalTests++;

  const allRanks = new Set(tableData.map((r) => r.priority_rank));
  assert(allRanks.size === 350, 'Table -> All 350 ranks are strictly unique (zero ties)');
  totalTests++;

  assert(
    tableData[0].priority_rank === 1 && tableData[349].priority_rank === 350,
    'Table -> Ranks form contiguous bijection {1, 2, ..., 350}'
  );
  totalTests++;

  const tierCounts: Record<string, number> = {};
  for (const r of tableData) {
    tierCounts[r.tier_category] = (tierCounts[r.tier_category] || 0) + 1;
  }
  assert(
    tierCounts['TOP_35'] === 35 &&
      tierCounts['TOP_70'] === 35 &&
      tierCounts['TOP_105'] === 35 &&
      tierCounts['REGULAR'] === 245,
    'Table -> Tier distribution matches exactly: 35 TOP_35, 35 TOP_70, 35 TOP_105, 245 REGULAR'
  );
  totalTests++;

  // --- TEST GROUP 5: DUPLICATE NAME DISAMBIGUATION ---
  console.log('\n--- 5. DUPLICATE NAME DISAMBIGUATION ---');
  const mawarRoads = tableData.filter((r) => r.display_name.toLowerCase().includes('mawar'));
  assert(mawarRoads.length === 2, 'Duplicate Name -> Exactly 2 roads match name query "Mawar"');
  totalTests++;

  const mawarKandangan = mawarRoads.find((r) => r.road_key === 'HSS-KAB-013');
  const mawarDaha = mawarRoads.find((r) => r.road_key === 'HSS-KAB-295');
  assert(
    mawarKandangan !== undefined && mawarDaha !== undefined,
    'Duplicate Name -> Both HSS-KAB-013 and HSS-KAB-295 exist with separate keys'
  );
  totalTests++;

  assert(
    mawarKandangan!.district_name === 'Kandangan' && mawarDaha!.district_name === 'Daha Selatan',
    'Duplicate Name -> Districts are cleanly separated (Kandangan vs Daha Selatan)'
  );
  totalTests++;

  assert(
    Math.abs(mawarKandangan!.mantap_pct - 100) < 0.01 && Math.abs(mawarDaha!.mantap_pct - 0) < 0.01,
    'Duplicate Name -> 2025 conditions remain independent without cross-contamination'
  );
  totalTests++;

  // --- TEST GROUP 6: HSS-KAB-001 FROZEN PHASE 2 RESULT CONSISTENCY ---
  console.log('\n--- 6. HSS-KAB-001 OPERATIONAL SCORING CONSISTENCY ---');
  const detail001 = uiService.getRoadDetailData('HSS-KAB-001', 'OPERATIONAL_2025');
  assert(detail001 !== null, 'HSS-KAB-001 -> Detail loads successfully');
  totalTests++;

  assert(
    detail001!.priorityResult.priority_rank === 12,
    'HSS-KAB-001 -> Priority rank is exactly #12 (not #252)'
  );
  totalTests++;

  assert(
    Math.abs(detail001!.priorityResult.final_score - 0.52961022) < 1e-6,
    'HSS-KAB-001 -> Final composite score is exactly 0.529610 (not 0.334002)'
  );
  totalTests++;

  assert(
    detail001!.priorityResult.tier_category === 'TOP_35',
    'HSS-KAB-001 -> Tier category is TOP_35 (Rank 12 is within Top 35 priority band)'
  );
  totalTests++;

  assert(
    detail001!.mathematicalAudit.is_exact === true,
    'HSS-KAB-001 -> Decomposition is exact: SUM(subtotals) == SUM(factors) == FinalScore'
  );
  totalTests++;

  // --- TEST GROUP 7: HSS-KAB-350 AUTHORITATIVE IDENTITY ---
  console.log('\n--- 7. HSS-KAB-350 AUTHORITATIVE IDENTITY ---');
  const detail350 = uiService.getRoadDetailData('HSS-KAB-350', 'OPERATIONAL_2025');
  assert(detail350 !== null, 'HSS-KAB-350 -> Detail loads successfully');
  totalTests++;

  assert(
    detail350!.identity.road_key === 'HSS-KAB-350',
    'HSS-KAB-350 -> road_key is HSS-KAB-350'
  );
  totalTests++;

  assert(
    detail350!.identity.nomor_ruas === '350',
    'HSS-KAB-350 -> nomor_ruas is official SK number 350'
  );
  totalTests++;

  assert(
    detail350!.identity.canonical_name === 'Jl. Keramat Sakti - Ds. Tebing Tinggi',
    'HSS-KAB-350 -> canonical_name is "Jl. Keramat Sakti - Ds. Tebing Tinggi" (from SK Bupati)'
  );
  totalTests++;

  assert(
    detail350!.identity.display_name === 'Keramat Sakti - Ds. Tebing Tinggi',
    'HSS-KAB-350 -> display_name is "Keramat Sakti - Ds. Tebing Tinggi"'
  );
  totalTests++;

  assert(
    detail350!.identity.district_name === 'Simpur',
    'HSS-KAB-350 -> district_name is Simpur'
  );
  totalTests++;

  // --- TEST GROUP 8: SCORING RUN CONSISTENCY ACROSS ENDPOINTS ---
  console.log('\n--- 8. SCORING RUN CONSISTENCY ACROSS ENDPOINTS ---');
  const activeOpRunId = dashboard2025.run_id;
  assert(
    typeof activeOpRunId === 'string' && activeOpRunId.length > 0,
    'Run Consistency -> Dashboard provides valid active run_id'
  );
  totalTests++;

  const allRowsMatchRun = tableData.every((r) => r.run_id === activeOpRunId);
  assert(
    allRowsMatchRun,
    'Run Consistency -> All 350 table rows resolve strictly from the dashboard active run_id'
  );
  totalTests++;

  const detail025 = uiService.getRoadDetailData('HSS-KAB-025', 'OPERATIONAL_2025');
  assert(
    detail025!.priorityResult.run_id === activeOpRunId,
    'Run Consistency -> Road detail for HSS-KAB-025 resolves from the same run_id'
  );
  totalTests++;

  assert(
    detail001!.priorityResult.run_id === activeOpRunId,
    'Run Consistency -> Road detail for HSS-KAB-001 resolves from the same run_id'
  );
  totalTests++;

  assert(
    detail350!.priorityResult.run_id === activeOpRunId,
    'Run Consistency -> Road detail for HSS-KAB-350 resolves from the same run_id'
  );
  totalTests++;

  // Benchmark Run Isolation
  const benchmarkDashboard = uiService.getDashboardData('BENCHMARK_2024');
  const bmRunId = benchmarkDashboard.run_id;
  assert(
    bmRunId !== activeOpRunId,
    'Run Consistency -> BENCHMARK_2024 run_id is strictly distinct from OPERATIONAL_2025'
  );
  totalTests++;

  const bmTable = uiService.getPriorityTableData('BENCHMARK_2024');
  const allBmRowsMatchRun = bmTable.every((r) => r.run_id === bmRunId);
  assert(
    allBmRowsMatchRun,
    'Run Consistency -> All 350 benchmark table rows resolve strictly from the benchmark run_id'
  );
  totalTests++;

  assert(
    benchmarkDashboard.benchmarkAudit !== undefined &&
      benchmarkDashboard.benchmarkAudit.concordantRoadsCount === 73 &&
      benchmarkDashboard.benchmarkAudit.concordancePct === 69.52,
    'Mode Isolation -> Benchmark concordance against label_top105 is exactly 73 roads (69.52%)'
  );
  totalTests++;

  // --- TEST GROUP 9: ROAD DETAIL EXPLAINABILITY & LABEL_TOP105 EXCLUSION ---
  console.log('\n--- 9. ROAD DETAIL EXPLAINABILITY (17 FACTORS) ---');
  assert(
    detail025!.factors.length === 17,
    'Detail -> Exactly 17 scoring factors returned in detail breakdown'
  );
  totalTests++;

  assert(
    detail025!.categoryContributions.length === 4,
    'Detail -> Exactly 4 category contributions returned'
  );
  totalTests++;

  assert(
    detail025!.mathematicalAudit.is_exact === true,
    'Detail -> Mathematical decomposition is exact: SUM(subtotals) == SUM(factors) == FinalScore'
  );
  totalTests++;

  assert(
    detail025!.mathematicalAudit.delta_subtotals < 1e-9 &&
      detail025!.mathematicalAudit.delta_contributions < 1e-9,
    'Detail -> Additive explainability delta is less than 1e-9 floating point precision'
  );
  totalTests++;

  const hasLabelTop105 = detail025!.factors.some((f) => f.variable_code === 'label_top105');
  assert(!hasLabelTop105, 'Explainability -> label_top105 is strictly absent from scoring factors');
  totalTests++;

  // --- TEST GROUP 10: SEMANTIC SAFETY ENFORCEMENT ---
  console.log('\n--- 10. SEMANTIC SAFETY ENFORCEMENT ---');
  const forbiddenPhrases = [
    'pemeliharaan rutin',
    'regular maintenance',
    'treatment recommendation',
    'rekomendasi perlakuan',
  ];

  let semanticViolation = false;
  for (const r of tableData) {
    const tierLower = r.tier_category.toLowerCase();
    for (const phrase of forbiddenPhrases) {
      if (tierLower.includes(phrase)) {
        semanticViolation = true;
        break;
      }
    }
  }
  assert(!semanticViolation, 'Semantic Safety -> Priority tiers contain NO road-treatment wording');
  totalTests++;

  // --- TEST GROUP 11: PROVENANCE DATA INTEGRITY ---
  console.log('\n--- 11. PROVENANCE DATA INTEGRITY ---');
  const provenance = uiService.getProvenanceData();
  const allVerified = provenance.checklist.every((item) => item.status === 'VERIFIED');
  assert(allVerified, 'Provenance -> All 9 authoritative checklist items are VERIFIED');
  totalTests++;

  assert(
    provenance.checklist.length === 9,
    'Provenance -> Complete checklist of 9 data layers returned'
  );
  totalTests++;

  console.log('\n================================================================');
  console.log(`RECONCILED PHASE 3 TEST SUMMARY: ${totalTests} PASSED, 0 FAILED (TOTAL: ${totalTests})`);
  console.log('================================================================\n');
}

runPhase3Verification().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
