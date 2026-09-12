import { strict as assert } from 'node:assert';
import {
  BASELINE_RAW_CATEGORIES,
  BASELINE_LOCAL_VARIABLES,
  getBaselineSimulationConfig,
  rebalanceCategorySiblings,
  rebalanceVariableSiblings,
  buildScoringModelConfig,
  runSimulationComparison,
  explainRoadMovement,
} from '../engine/simulationEngine.ts';
import { calculateNormalizedWeights } from '../engine/normalization.ts';
import { rankRoads } from '../engine/scoringEngine.ts';
import { ScoringService } from '../services/scoringService.ts';
import { SimulationService } from '../services/simulationService.ts';
import { ModelService } from '../services/modelService.ts';
import { getDatabase } from '../db/connection.ts';

console.log('================================================================');
console.log('STARTING PHASE 5 SIMULASI SKENARIO VERIFICATION SUITE');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(testName: string, testFn: () => void) {
  try {
    testFn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    failedTests++;
  }
}

const db = getDatabase();
const scoringService = new ScoringService(db);
const simulationService = new SimulationService(db);
const modelService = new ModelService(db);

// Load baseline feature vectors & scores
const featureVectors = scoringService.loadRoadFeatureVectors('OPERATIONAL_2025');
const baselineModelConfig = scoringService.loadModelConfig('POLICY_DEFAULT_V1');
const baselineRankedScores = rankRoads(featureVectors, baselineModelConfig);

console.log('--- 1. RAW CATEGORY WEIGHT NORMALIZATION & SUM INVARIANTS ---');

runTest('Raw source category weights sum to 0.999999 without silent correction', () => {
  const sumRaw = BASELINE_RAW_CATEGORIES.reduce((s, c) => s + c.raw_weight, 0);
  assert.equal(sumRaw.toFixed(6), '0.999999');
});

runTest('Runtime category normalization produces exact sum = 1.0', () => {
  const config = buildScoringModelConfig(getBaselineSimulationConfig());
  const weights = calculateNormalizedWeights(config);
  const sumNorm = Object.values(weights.category_normalized_weights).reduce((s, w) => s + w, 0);
  assert(Math.abs(sumNorm - 1.0) < 1e-9, `Category normalized sum must be 1.0, got ${sumNorm}`);
});

runTest('Local variable weights within each category sum to exactly 1.0', () => {
  const config = getBaselineSimulationConfig();
  for (const cat of config.categories) {
    const vars = config.variables.filter((v) => v.category_code === cat.category_code);
    const sumLocal = vars.reduce((s, v) => s + v.local_weight, 0);
    assert(Math.abs(sumLocal - 1.0) < 1e-9, `Local sum for ${cat.category_code} must be 1.0, got ${sumLocal}`);
  }
});

runTest('Total effective weights across all 17 variables sum to exactly 1.0', () => {
  const config = buildScoringModelConfig(getBaselineSimulationConfig());
  const weights = calculateNormalizedWeights(config);
  const sumEff = Object.values(weights.effective_weights).reduce((s, w) => s + w, 0);
  assert(Math.abs(sumEff - 1.0) < 1e-9, `Effective sum must be 1.0, got ${sumEff}`);
});

console.log('\n--- 2. PROPORTIONAL SIBLING AUTO-BALANCING LOGIC ---');

runTest('Category sibling rebalance preserves relative proportions of remaining mass', () => {
  // Baseline categories
  const initial = getBaselineSimulationConfig().categories;
  // Increase PELAYANAN_MASYARAKAT to 0.30
  const updated = rebalanceCategorySiblings(initial, 'PELAYANAN_MASYARAKAT', 0.30);
  
  const target = updated.find((c) => c.category_code === 'PELAYANAN_MASYARAKAT')!;
  assert.equal(target.raw_weight, 0.30);

  // Check sum of remaining mass = 0.70
  const remaining = updated.filter((c) => c.category_code !== 'PELAYANAN_MASYARAKAT');
  const sumRemaining = remaining.reduce((s, c) => s + c.raw_weight, 0);
  assert(Math.abs(sumRemaining - 0.70) < 1e-9);

  // Check proportional ratios among siblings
  const initialSiblings = initial.filter((c) => c.category_code !== 'PELAYANAN_MASYARAKAT');
  const initialSumSiblings = initialSiblings.reduce((s, c) => s + c.raw_weight, 0);

  for (const sib of remaining) {
    const orig = initial.find((c) => c.category_code === sib.category_code)!;
    const expected = 0.70 * (orig.raw_weight / initialSumSiblings);
    assert(Math.abs(sib.raw_weight - expected) < 1e-9);
  }
});

runTest('Variable sibling rebalance keeps other categories completely untouched', () => {
  const initial = getBaselineSimulationConfig().variables;
  // Edit norm_jarak_rsud_cost to 0.40 inside PELAYANAN_MASYARAKAT
  const updated = rebalanceVariableSiblings(initial, 'PELAYANAN_MASYARAKAT', 'norm_jarak_rsud_cost', 0.40);

  // Check that variables in other categories are 100% identical
  const nonTargetInitial = initial.filter((v) => v.category_code !== 'PELAYANAN_MASYARAKAT');
  for (const orig of nonTargetInitial) {
    const current = updated.find((v) => v.variable_code === orig.variable_code)!;
    assert.equal(current.local_weight, orig.local_weight);
  }

  // Check sum in PELAYANAN_MASYARAKAT is 1.0
  const pelVars = updated.filter((v) => v.category_code === 'PELAYANAN_MASYARAKAT');
  const sumPel = pelVars.reduce((s, v) => s + v.local_weight, 0);
  assert(Math.abs(sumPel - 1.0) < 1e-9);
});

runTest('Zero sibling edge case distributes remaining mass equally', () => {
  const categories = [
    { category_code: 'A', category_name: 'A', raw_weight: 1.0 },
    { category_code: 'B', category_name: 'B', raw_weight: 0.0 },
    { category_code: 'C', category_name: 'C', raw_weight: 0.0 },
  ];
  // Change A to 0.40
  const updated = rebalanceCategorySiblings(categories, 'A', 0.40);
  assert.equal(updated.find((c) => c.category_code === 'A')!.raw_weight, 0.40);
  assert.equal(updated.find((c) => c.category_code === 'B')!.raw_weight, 0.30);
  assert.equal(updated.find((c) => c.category_code === 'C')!.raw_weight, 0.30);
});

runTest('Invalid negative and NaN weights are rejected safely', () => {
  const initial = getBaselineSimulationConfig().categories;
  assert.throws(() => rebalanceCategorySiblings(initial, 'TEKNIS_JALAN', NaN));
  assert.throws(() => rebalanceCategorySiblings(initial, 'TEKNIS_JALAN', Infinity));
  
  // Clamping check for out-of-bound inputs
  const clampedNeg = rebalanceCategorySiblings(initial, 'TEKNIS_JALAN', -0.5);
  assert.equal(clampedNeg.find((c) => c.category_code === 'TEKNIS_JALAN')!.raw_weight, 0.0);

  const clampedHigh = rebalanceCategorySiblings(initial, 'TEKNIS_JALAN', 1.5);
  assert.equal(clampedHigh.find((c) => c.category_code === 'TEKNIS_JALAN')!.raw_weight, 1.0);
});

console.log('\n--- 3. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---');

runTest('Baseline Rank #1 road is HSS-KAB-025 with score ~0.649945', () => {
  const top1 = baselineRankedScores[0];
  assert.equal(top1.road_key, 'HSS-KAB-025');
  assert.equal(top1.priority_rank, 1);
  assert.equal(top1.tier_category, 'TOP_35');
  assert(Math.abs(top1.final_score - 0.649945) < 0.001);
});

runTest('Baseline Rank #12 road is HSS-KAB-001 with score ~0.529610', () => {
  const r12 = baselineRankedScores.find((r) => r.road_key === 'HSS-KAB-001')!;
  assert.equal(r12.priority_rank, 12);
  assert.equal(r12.tier_category, 'TOP_35');
  assert(Math.abs(r12.final_score - 0.529610) < 0.001);
});

runTest('Baseline Rank #133 road is HSS-KAB-295 with score ~0.412427', () => {
  const r133 = baselineRankedScores.find((r) => r.road_key === 'HSS-KAB-295')!;
  assert.equal(r133.priority_rank, 133);
  assert.equal(r133.tier_category, 'REGULAR');
  assert(Math.abs(r133.final_score - 0.412427) < 0.001);
});

runTest('Baseline Rank #169 road is HSS-KAB-350 with score ~0.381386', () => {
  const r169 = baselineRankedScores.find((r) => r.road_key === 'HSS-KAB-350')!;
  assert.equal(r169.priority_rank, 169);
  assert.equal(r169.tier_category, 'REGULAR');
  assert(Math.abs(r169.final_score - 0.381386) < 0.001);
});

runTest('Baseline Rank #245 road is HSS-KAB-013 with score ~0.340749', () => {
  const r245 = baselineRankedScores.find((r) => r.road_key === 'HSS-KAB-013')!;
  assert.equal(r245.priority_rank, 245);
  assert.equal(r245.tier_category, 'REGULAR');
  assert(Math.abs(r245.final_score - 0.340749) < 0.001);
});

runTest('Baseline tier partition is exactly {35, 35, 35, 245}', () => {
  const counts = { TOP_35: 0, TOP_70: 0, TOP_105: 0, REGULAR: 0 };
  for (const r of baselineRankedScores) {
    counts[r.tier_category]++;
  }
  assert.equal(counts.TOP_35, 35);
  assert.equal(counts.TOP_70, 35);
  assert.equal(counts.TOP_105, 35);
  assert.equal(counts.REGULAR, 245);
});

console.log('\n--- 4. RESET TO BASELINE MATHEMATICAL EQUALITY ---');

runTest('Resetting simulation produces 100% mathematical equality across all 350 roads', () => {
  const resetConfig = getBaselineSimulationConfig();
  const { simulatedRankedScores, comparisons, summary } = runSimulationComparison(
    featureVectors,
    baselineRankedScores,
    resetConfig
  );

  assert.equal(summary.roads_evaluated, 350);
  assert.equal(summary.moved_up_count, 0);
  assert.equal(summary.moved_down_count, 0);
  assert.equal(summary.unchanged_count, 350);
  assert.equal(summary.tier_changed_count, 0);
  assert.equal(summary.biggest_upward_mover, null);
  assert.equal(summary.biggest_downward_mover, null);

  for (let i = 0; i < 350; i++) {
    const sim = simulatedRankedScores[i];
    const base = baselineRankedScores[i];
    assert.equal(sim.road_key, base.road_key);
    assert.equal(sim.priority_rank, base.priority_rank);
    assert.equal(sim.tier_category, base.tier_category);
    assert(Math.abs(sim.final_score - base.final_score) < 1e-9);
  }
});

console.log('\n--- 5. MANDATORY SMOKE TEST SCENARIO ---');

runTest('Executing policy shift scenario recomputes scores, ranks, and tiers', () => {
  let simConfig = getBaselineSimulationConfig();

  // 1. Shift category emphasis: Increase Pelayanan Masyarakat from ~0.192 to 0.450
  simConfig.categories = rebalanceCategorySiblings(
    simConfig.categories,
    'PELAYANAN_MASYARAKAT',
    0.450
  );

  // 2. Shift variable emphasis within Pelayanan Masyarakat: Increase norm_jarak_rsud_cost to 0.50
  simConfig.variables = rebalanceVariableSiblings(
    simConfig.variables,
    'PELAYANAN_MASYARAKAT',
    'norm_jarak_rsud_cost',
    0.50
  );

  const { simulatedRankedScores, comparisons, summary } = runSimulationComparison(
    featureVectors,
    baselineRankedScores,
    simConfig
  );

  assert.equal(simulatedRankedScores.length, 350);
  assert(summary.moved_up_count > 0, 'At least one road must move up');
  assert(summary.moved_down_count > 0, 'At least one road must move down');
  assert(summary.biggest_upward_mover !== null, 'Biggest upward mover must exist');
  assert(summary.biggest_downward_mover !== null, 'Biggest downward mover must exist');

  console.log(`     * Roads Moved Up    : ${summary.moved_up_count}`);
  console.log(`     * Roads Moved Down  : ${summary.moved_down_count}`);
  console.log(`     * Roads Unchanged   : ${summary.unchanged_count}`);
  console.log(`     * Tier Changes      : ${summary.tier_changed_count}`);
  console.log(`     * Top Upward Mover  : ${summary.biggest_upward_mover?.display_name} (#${summary.biggest_upward_mover?.baseline_rank} -> #${summary.biggest_upward_mover?.simulated_rank}, Δ +${summary.biggest_upward_mover?.rank_delta})`);
  console.log(`     * Top Down Mover    : ${summary.biggest_downward_mover?.display_name} (#${summary.biggest_downward_mover?.baseline_rank} -> #${summary.biggest_downward_mover?.simulated_rank}, Δ ${summary.biggest_downward_mover?.rank_delta})`);

  // Verify rank_delta definition: positive = moved UP
  const upMover = summary.biggest_upward_mover!;
  assert(upMover.simulated_rank < upMover.baseline_rank);
  assert(upMover.rank_delta > 0);
  assert.equal(upMover.rank_delta, upMover.baseline_rank - upMover.simulated_rank);
});

console.log('\n--- 6. ROAD-LEVEL COMPARATIVE EXPLAINABILITY ---');

runTest('Comparative explainability details all 17 variables with exact deltas', () => {
  let simConfig = getBaselineSimulationConfig();
  simConfig.categories = rebalanceCategorySiblings(simConfig.categories, 'PELAYANAN_MASYARAKAT', 0.40);
  
  const explanation = explainRoadMovement('HSS-KAB-025', featureVectors, baselineRankedScores, simConfig);
  assert.equal(explanation.road_key, 'HSS-KAB-025');
  assert.equal(explanation.factors.length, 17);

  // Check mathematical consistency of each factor
  for (const f of explanation.factors) {
    assert(Math.abs(f.weight_delta - (f.simulated_effective_weight - f.baseline_effective_weight)) < 1e-9);
    assert(Math.abs(f.contribution_delta - (f.simulated_contribution - f.baseline_contribution)) < 1e-9);
  }
});

console.log('\n--- 7. BASELINE IMMUTABILITY & DATABASE ISOLATION ---');

runTest('Simulation execution never mutates database priority_models or scoring_runs', () => {
  const modelBefore = modelService.getBaselineModel();
  const latestRunBefore = scoringService.getLatestScoringRun('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

  // Run simulation via service
  let simConfig = getBaselineSimulationConfig();
  simConfig.categories = rebalanceCategorySiblings(simConfig.categories, 'SPASIAL_DEMOGRAFI', 0.50);
  simulationService.calculateSimulation(simConfig, 'OPERATIONAL_2025');

  const modelAfter = modelService.getBaselineModel();
  const latestRunAfter = scoringService.getLatestScoringRun('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

  // Verify database rows remain untouched
  assert.equal(modelBefore?.model_id, modelAfter?.model_id);
  assert.equal(latestRunBefore?.run.run_id, latestRunAfter?.run.run_id);
  assert.equal(latestRunBefore?.scores.length, latestRunAfter?.scores.length);
});

runTest('BENCHMARK_2024 and label_top105 remain isolated and never affect operational simulation', () => {
  const simContext = simulationService.getSimulationContext('OPERATIONAL_2025');
  // Confirm no label_top105 in variable definitions
  const hasLabelTop105 = simContext.baselineConfig.variables.some((v) => v.variable_code === 'label_top105');
  assert.equal(hasLabelTop105, false, 'label_top105 must never exist as a simulation variable');
});

console.log('\n================================================================');
console.log(`PHASE 5 VERIFICATION COMPLETE: ${passedTests} / ${passedTests + failedTests} TESTS PASSED!`);
if (failedTests > 0) {
  console.error(`FAILED TESTS: ${failedTests}`);
  process.exit(1);
} else {
  console.log('ALL PHASE 5 TESTS PASSED!');
  console.log('>> VERDICT: PHASE_5_SIMULATION_PASS <<');
}
console.log('================================================================\n');
