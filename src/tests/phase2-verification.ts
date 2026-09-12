import assert from 'node:assert';
import { getDatabase, closeDatabase } from '../db/connection.ts';
import { ScoringService } from '../services/scoringService.ts';
import { BenchmarkService } from '../services/benchmarkService.ts';
import { RoadService } from '../services/roadService.ts';
import { calculateNormalizedWeights } from '../engine/normalization.ts';
import { scoreRoad, rankRoads } from '../engine/scoringEngine.ts';
import type { RoadFeatureVector, ScoringModelConfig } from '../engine/types.ts';

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

export function executePhase2TestSuite() {
  console.log('================================================================');
  console.log('STARTING PHASE 2 AUTOMATED SCORING ENGINE VERIFICATION SUITE');
  console.log('================================================================');

  const db = getDatabase();
  const scoringSvc = new ScoringService(db);
  const benchmarkSvc = new BenchmarkService(db);
  const roadSvc = new RoadService(db);

  const modelConfig = scoringSvc.loadModelConfig('POLICY_DEFAULT_V1');
  const weights = calculateNormalizedWeights(modelConfig);

  // ------------------------------------------------------------------
  // 1. MODEL MATH INVARIANTS
  // ------------------------------------------------------------------
  console.log('\n--- 1. MODEL WEIGHT MATH INVARIANTS ---');

  runTest('Model Math', 'Normalized category weights sum to 1.0 (tolerance 1e-12)', () => {
    const catSum = Object.values(weights.category_normalized_weights).reduce((s, w) => s + w, 0);
    assert.ok(
      Math.abs(catSum - 1.0) < 1e-12,
      `Category normalized sum expected 1.0, got ${catSum}`
    );
  });

  runTest('Model Math', 'Each category local weights sum to 1.0 (tolerance 1e-6)', () => {
    for (const cat of modelConfig.categories) {
      const catVars = modelConfig.variables.filter((v) => v.category_code === cat.category_code);
      const localSum = catVars.reduce((s, v) => s + v.local_weight, 0);
      assert.ok(
        Math.abs(localSum - 1.0) < 1e-6,
        `Local weights sum for ${cat.category_code} expected 1.0, got ${localSum}`
      );
    }
  });

  runTest('Model Math', 'Global effective weights sum to 1.0 (tolerance 1e-12)', () => {
    const effSum = Object.values(weights.effective_weights).reduce((s, w) => s + w, 0);
    assert.ok(
      Math.abs(effSum - 1.0) < 1e-12,
      `Effective weights sum expected 1.0, got ${effSum}`
    );
  });

  runTest('Model Math', 'Effective weight is exactly parent normalized weight * local weight', () => {
    for (const v of modelConfig.variables) {
      const parentNormWeight = weights.category_normalized_weights[v.category_code];
      const expectedEff = parentNormWeight * v.local_weight;
      const actualEff = weights.effective_weights[v.variable_code];
      assert.ok(
        Math.abs(actualEff - expectedEff) < 1e-12,
        `Mismatch for ${v.variable_code}: expected ${expectedEff}, got ${actualEff}`
      );
    }
  });

  // ------------------------------------------------------------------
  // 2. EXTREME ROAD INVARIANTS
  // ------------------------------------------------------------------
  console.log('\n--- 2. EXTREME ROAD INVARIANTS ---');

  runTest('Extreme Road', 'Fictitious road with all 1.0 values yields final score exactly 1.00000000', () => {
    const allOnesVector: RoadFeatureVector = {
      road_key: 'HSS-KAB-EXTREME-1',
      nomor_ruas: '998',
      display_name: 'Fictitious Perfect Road',
      district_name: 'Kandangan',
      mantap_pct: 100.0,
      penduduk_dilayani_raw: 9999,
      normalized_values: Object.fromEntries(
        modelConfig.variables.map((v) => [v.variable_code, 1.0])
      ),
    };

    const score = scoreRoad(allOnesVector, modelConfig, weights);
    assert.ok(
      Math.abs(score.final_score - 1.0) < 1e-12,
      `Expected 1.0, got ${score.final_score}`
    );
  });

  runTest('Extreme Road', 'Fictitious road with all 0.0 values yields final score exactly 0.00000000', () => {
    const allZerosVector: RoadFeatureVector = {
      road_key: 'HSS-KAB-EXTREME-0',
      nomor_ruas: '999',
      display_name: 'Fictitious Zero Road',
      district_name: 'Kandangan',
      mantap_pct: 0.0,
      penduduk_dilayani_raw: 0,
      normalized_values: Object.fromEntries(
        modelConfig.variables.map((v) => [v.variable_code, 0.0])
      ),
    };

    const score = scoreRoad(allZerosVector, modelConfig, weights);
    assert.ok(
      Math.abs(score.final_score - 0.0) < 1e-12,
      `Expected 0.0, got ${score.final_score}`
    );
  });

  // ------------------------------------------------------------------
  // 3. FULL COVERAGE & STRICT BIJECTIVE RANKING (OPERATIONAL 2025)
  // ------------------------------------------------------------------
  console.log('\n--- 3. COVERAGE & STRICT BIJECTIVE RANKING ---');

  const opResult = scoringSvc.executeScoringRun('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

  runTest('Coverage', 'Exactly 350 roads evaluated and scored', () => {
    assert.strictEqual(opResult.rankedScores.length, 350);
  });

  runTest('Coverage', 'Ranks form contiguous bijection {1, 2, ..., 350} with zero ties or gaps', () => {
    const ranks = opResult.rankedScores.map((r) => r.priority_rank);
    for (let i = 1; i <= 350; i++) {
      assert.strictEqual(ranks[i - 1], i, `Rank at index ${i - 1} must be ${i}`);
    }
    const uniqueRanks = new Set(ranks);
    assert.strictEqual(uniqueRanks.size, 350, 'Duplicate ranks detected');
  });

  runTest('Coverage', 'Every canonical road HSS-KAB-001..350 appears exactly once', () => {
    const scoredKeys = new Set(opResult.rankedScores.map((r) => r.road_key));
    assert.strictEqual(scoredKeys.size, 350);
    for (let i = 1; i <= 350; i++) {
      const key = `HSS-KAB-${String(i).padStart(3, '0')}`;
      assert.ok(scoredKeys.has(key), `Missing canonical key ${key} in scored output`);
    }
  });

  // ------------------------------------------------------------------
  // 4. FACTOR CONTRIBUTIONS & DECOMPOSITION EXPLAINABILITY
  // ------------------------------------------------------------------
  console.log('\n--- 4. FACTOR DECOMPOSITION & EXPLAINABILITY ---');

  runTest('Decomposition', 'For all 350 roads: SUM(contributions) == final_score (tolerance 1e-9)', () => {
    for (const road of opResult.rankedScores) {
      const contribSum = Object.values(road.factor_contributions).reduce(
        (s, c) => s + c.contribution,
        0
      );
      assert.ok(
        Math.abs(contribSum - road.final_score) < 1e-9,
        `Road ${road.road_key}: contrib sum ${contribSum} != final score ${road.final_score}`
      );
    }
  });

  runTest('Decomposition', 'For all 350 roads: SUM(subtotals) == final_score (tolerance 1e-9)', () => {
    for (const road of opResult.rankedScores) {
      const subtotalSum = Object.values(road.category_subtotals).reduce(
        (s, c) => s + c.subtotal,
        0
      );
      assert.ok(
        Math.abs(subtotalSum - road.final_score) < 1e-9,
        `Road ${road.road_key}: subtotal sum ${subtotalSum} != final score ${road.final_score}`
      );
    }
  });

  runTest('Decomposition', 'Exactly 17 contributions per road, 0 duplicate, 0 missing', () => {
    for (const road of opResult.rankedScores) {
      const varKeys = Object.keys(road.factor_contributions);
      assert.strictEqual(
        varKeys.length,
        17,
        `Road ${road.road_key} has ${varKeys.length} variables, expected 17`
      );
      for (const v of modelConfig.variables) {
        assert.ok(
          road.factor_contributions[v.variable_code] !== undefined,
          `Missing variable ${v.variable_code}`
        );
      }
    }
  });

  // ------------------------------------------------------------------
  // 5. VARIABLES & LABEL_TOP105 ISOLATION
  // ------------------------------------------------------------------
  console.log('\n--- 5. LABEL_TOP105 EXCLUSION & NON-INTERFERENCE ---');

  runTest('Variables', 'label_top105 is not among scoring variables', () => {
    const varCodes = modelConfig.variables.map((v) => v.variable_code);
    assert.strictEqual(
      varCodes.some((c) => c.includes('top105')),
      false
    );
  });

  runTest('Variables', 'Modifying label_top105 externally cannot change operational scores', () => {
    const featureVector = scoringSvc.loadRoadFeatureVectors('OPERATIONAL_2025')[0];
    const initialScore = scoreRoad(featureVector, modelConfig, weights).final_score;

    // Mutate feature with label_top105 = 1.0 (external non-scoring flag)
    (featureVector.normalized_values as any)['label_top105'] = 1.0;

    const reScored = scoreRoad(featureVector, modelConfig, weights);
    assert.strictEqual(
      reScored.final_score,
      initialScore,
      'Mutating label_top105 must have zero effect on scoreRoad calculation'
    );
  });

  // ------------------------------------------------------------------
  // 6. OPERATING MODE ISOLATION (OPERATIONAL VS BENCHMARK)
  // ------------------------------------------------------------------
  console.log('\n--- 6. OPERATING MODE ISOLATION ---');

  const benchResult = scoringSvc.executeScoringRun('BENCHMARK_2024', 'POLICY_DEFAULT_V1');

  runTest('Mode Isolation', 'Both modes evaluate 350 roads with distinct condition observations', () => {
    assert.strictEqual(benchResult.rankedScores.length, 350);

    // Compare HSS-KAB-001 in operational vs benchmark
    const op001 = opResult.rankedScores.find((r) => r.road_key === 'HSS-KAB-001')!;
    const bench001 = benchResult.rankedScores.find((r) => r.road_key === 'HSS-KAB-001')!;

    // In 2025 condition, HSS-KAB-001 has sedang=0.6429, rusak_ringan=0.3571
    // In 2024 benchmark, HSS-KAB-001 has sedang=1.0000, rusak_ringan=0.0000
    const opSedang = op001.factor_contributions['norm_kondisi_sedang'].normalized_value;
    const benchSedang = bench001.factor_contributions['norm_kondisi_sedang'].normalized_value;

    assert.ok(
      Math.abs(opSedang - benchSedang) > 0.1,
      `Mode contamination detected: opSedang=${opSedang}, benchSedang=${benchSedang}`
    );
  });

  // ------------------------------------------------------------------
  // 7. DETERMINISM & REPRODUCIBILITY
  // ------------------------------------------------------------------
  console.log('\n--- 7. DETERMINISM & REPRODUCIBILITY ---');

  runTest('Determinism', 'Consecutive scoring runs yield identical scores, ranks, and subtotals', () => {
    const run1 = scoringSvc.executeScoringRun('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');
    const run2 = scoringSvc.executeScoringRun('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

    assert.strictEqual(run1.rankedScores.length, run2.rankedScores.length);
    for (let i = 0; i < run1.rankedScores.length; i++) {
      const r1 = run1.rankedScores[i];
      const r2 = run2.rankedScores[i];

      assert.strictEqual(r1.road_key, r2.road_key, `Mismatch at index ${i}`);
      assert.strictEqual(r1.priority_rank, r2.priority_rank);
      assert.strictEqual(r1.final_score, r2.final_score);
      assert.strictEqual(
        r1.category_subtotals['TEKNIS_JALAN'].subtotal,
        r2.category_subtotals['TEKNIS_JALAN'].subtotal
      );
    }
  });

  // ------------------------------------------------------------------
  // 8. BASELINE IMMUTABILITY DATABASE ENFORCEMENT
  // ------------------------------------------------------------------
  console.log('\n--- 8. BASELINE IMMUTABILITY (TRIGGER ENFORCEMENT) ---');

  runTest('Immutability', 'Direct SQL UPDATE on POLICY_DEFAULT_V1 is rejected by trigger', () => {
    assert.throws(
      () => {
        db.exec("UPDATE priority_models SET model_name = 'Hacked' WHERE model_code = 'POLICY_DEFAULT_V1'");
      },
      /LOCKED_MODEL_IMMUTABLE/,
      'Expected trigger to reject UPDATE on locked model'
    );
  });

  runTest('Immutability', 'Direct SQL DELETE on POLICY_DEFAULT_V1 is rejected by trigger', () => {
    assert.throws(
      () => {
        db.exec("DELETE FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1'");
      },
      /LOCKED_MODEL_IMMUTABLE/,
      'Expected trigger to reject DELETE on locked model'
    );
  });

  runTest('Immutability', 'Direct SQL UPDATE on category weights of POLICY_DEFAULT_V1 is rejected', () => {
    assert.throws(
      () => {
        db.exec(
          "UPDATE model_category_weights SET raw_weight = 0.99 WHERE model_id = '00000000-0000-5000-a000-000000000001'"
        );
      },
      /LOCKED_MODEL_IMMUTABLE/,
      'Expected trigger to reject UPDATE on category weights'
    );
  });

  runTest('Immutability', 'Direct SQL DELETE on category weights of POLICY_DEFAULT_V1 is rejected', () => {
    assert.throws(
      () => {
        db.exec(
          "DELETE FROM model_category_weights WHERE model_id = '00000000-0000-5000-a000-000000000001'"
        );
      },
      /LOCKED_MODEL_IMMUTABLE/,
      'Expected trigger to reject DELETE on category weights'
    );
  });

  // ------------------------------------------------------------------
  // 9. EXECUTION PERFORMANCE BENCHMARK
  // ------------------------------------------------------------------
  console.log('\n--- 9. EXECUTION LATENCY BENCHMARK ---');

  runTest('Performance', 'Pure scoring of 350 roads completes in < 50ms', () => {
    const vectors = scoringSvc.loadRoadFeatureVectors('OPERATIONAL_2025');
    const start = performance.now();
    const ranked = rankRoads(vectors, modelConfig);
    const durationMs = performance.now() - start;

    console.log(`         -> Measured pure calculation time: ${durationMs.toFixed(2)}ms for 350 roads`);
    assert.ok(
      durationMs < 50,
      `Scoring execution time expected < 50ms, took ${durationMs.toFixed(2)}ms`
    );
    assert.strictEqual(ranked.length, 350);
  });

  // ------------------------------------------------------------------
  // 10. BENCHMARK CONCORDANCE AUDIT
  // ------------------------------------------------------------------
  console.log('\n--- 10. BENCHMARK CONCORDANCE AUDIT ---');

  runTest('Benchmark Audit', 'Concordance against label_top105 evaluates cleanly without error', () => {
    const audit = benchmarkSvc.evaluateBenchmarkConcordance();
    console.log(`         -> Historical Top-105 Count : ${audit.historical_top105_count}`);
    console.log(`         -> Policy Top-105 Count     : ${audit.policy_top105_count}`);
    console.log(`         -> Overlap Intersection     : ${audit.overlap_count} roads`);
    console.log(`         -> Concordance Percentage   : ${audit.concordance_pct.toFixed(2)}%`);
    assert.strictEqual(audit.historical_top105_count, 105);
    assert.strictEqual(audit.policy_top105_count, 105);
    assert.ok(audit.overlap_count >= 70, `Expected concordance overlap >= 70, got ${audit.overlap_count}`);
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
    throw new Error(`${failedCount} test(s) failed in Phase 2 verification.`);
  }

  return { passedCount, failedCount, total: results.length };
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('phase2-verification.ts')) {
  try {
    executePhase2TestSuite();
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
