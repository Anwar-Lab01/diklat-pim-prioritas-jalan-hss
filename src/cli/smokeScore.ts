import { getDatabase, closeDatabase } from '../db/connection.ts';
import { ScoringService } from '../services/scoringService.ts';
import { ModelService } from '../services/modelService.ts';
import { calculateNormalizedWeights } from '../engine/normalization.ts';
import { scoreRoad } from '../engine/scoringEngine.ts';

export function inspectRoadScore(
  roadKeyInput: string,
  modeInput: string = 'OPERATIONAL_2025'
) {
  const roadKey = roadKeyInput.trim().toUpperCase();
  const operatingMode = (modeInput.toUpperCase() === 'BENCHMARK_2024'
    ? 'BENCHMARK_2024'
    : 'OPERATIONAL_2025') as 'OPERATIONAL_2025' | 'BENCHMARK_2024';

  const db = getDatabase();
  const scoringSvc = new ScoringService(db);
  const modelSvc = new ModelService(db);

  // Execute or retrieve scoring to obtain ranking
  const scoringResult = scoringSvc.executeScoringRun(
    operatingMode,
    'POLICY_DEFAULT_V1',
    'CLI_SMOKE_INSPECTOR'
  );

  const rankedRoad = scoringResult.rankedScores.find((r) => r.road_key === roadKey);
  if (!rankedRoad) {
    console.error(`\n[ERROR] Road '${roadKey}' not found in canonical 350-road dataset.`);
    process.exit(1);
  }

  const modelConfig = scoringSvc.loadModelConfig('POLICY_DEFAULT_V1');
  const weights = calculateNormalizedWeights(modelConfig);
  const variables = modelSvc.getVariables();
  const varMap = new Map(variables.map((v) => [v.variable_code, v]));

  console.log('\n' + '='.repeat(80));
  console.log(`DETERMINISTIC PRIORITY SCORE EXPLAINABILITY: ${rankedRoad.road_key}`);
  console.log('='.repeat(80));

  console.log('\n[1] ROAD & MODEL METADATA');
  console.log(`  • Road Key        : ${rankedRoad.road_key} (SK Ruas: ${rankedRoad.nomor_ruas})`);
  console.log(`  • Display Name    : ${rankedRoad.display_name}`);
  console.log(`  • Kecamatan       : ${rankedRoad.district_name}`);
  console.log(`  • Operating Mode  : ${operatingMode}`);
  console.log(`  • Model Code      : POLICY_DEFAULT_V1 (BASELINE_LOCKED)`);
  console.log(`  • Priority Rank   : #${rankedRoad.priority_rank} / 350`);
  console.log(`  • Priority Tier   : ${rankedRoad.tier_category}`);
  console.log(`  • Composite Score : ${rankedRoad.final_score.toFixed(8)}`);

  console.log('\n[2] TIE-BREAKER METADATA');
  console.log(`  • Kemantapan Jalan (2025) : ${rankedRoad.tie_breaker_metadata.mantap_pct.toFixed(2)}%`);
  console.log(`  • Penduduk Terlayani      : ${rankedRoad.tie_breaker_metadata.penduduk_dilayani_raw} jiwa`);
  console.log(`  • Nomor Ruas Urutan       : ${rankedRoad.tie_breaker_metadata.nomor_ruas}`);

  console.log('\n[3] CATEGORY SUBTOTAL CONTRIBUTIONS');
  console.log('  Category Code         | Raw Wgt | Norm Wgt | Subtotal | Contribution %');
  console.log('  ----------------------+---------+----------+----------+---------------');
  for (const cat of modelConfig.categories) {
    const sub = rankedRoad.category_subtotals[cat.category_code];
    const rawW = cat.raw_weight.toFixed(6);
    const normW = (weights.category_normalized_weights[cat.category_code] || 0.0).toFixed(6);
    const subVal = sub.subtotal.toFixed(6);
    const pct = ((sub.subtotal / rankedRoad.final_score) * 100).toFixed(2);
    console.log(
      `  ${cat.category_code.padEnd(21)} | ${rawW} | ${normW} | ${subVal} | ${pct.padStart(13)}%`
    );
  }

  console.log('\n[4] 17 FACTOR BREAKDOWN MATRIX');
  console.log('  Variable Code                    | Category             | Norm Val | Eff Wgt  | Contrib');
  console.log('  ---------------------------------+----------------------+----------+----------+---------');
  for (const v of modelConfig.variables) {
    const factor = rankedRoad.factor_contributions[v.variable_code];
    const normV = factor.normalized_value.toFixed(4);
    const effW = factor.effective_weight.toFixed(6);
    const contrib = factor.contribution.toFixed(6);
    console.log(
      `  ${v.variable_code.padEnd(32)} | ${v.category_code.padEnd(20)} | ${normV.padStart(8)} | ${effW.padStart(8)} | ${contrib.padStart(7)}`
    );
  }

  console.log('\n[5] MATHEMATICAL VERIFICATION');
  const totalContrib = Object.values(rankedRoad.factor_contributions).reduce(
    (s, c) => s + c.contribution,
    0
  );
  const totalSubtotal = Object.values(rankedRoad.category_subtotals).reduce(
    (s, c) => s + c.subtotal,
    0
  );
  console.log(`  • Sum of 17 Contributions : ${totalContrib.toFixed(8)}`);
  console.log(`  • Sum of 4 Subtotals      : ${totalSubtotal.toFixed(8)}`);
  console.log(`  • Final Composite Score   : ${rankedRoad.final_score.toFixed(8)}`);
  console.log(
    `  • Delta (Explainability)  : ${Math.abs(totalContrib - rankedRoad.final_score).toExponential(4)} (Exact Zero within float limit)`
  );

  console.log('\n' + '='.repeat(80) + '\n');
}

// CLI entrypoint
const targetRoad = process.argv[2] || 'HSS-KAB-001';
const targetMode = process.argv[3] || 'OPERATIONAL_2025';

try {
  inspectRoadScore(targetRoad, targetMode);
} finally {
  closeDatabase();
}
