import { getDatabase, closeDatabase } from '../db/connection.ts';
import { ScoringService } from '../services/scoringService.ts';

export function runFullNetworkScoring(modeInput: string = 'OPERATIONAL_2025') {
  const operatingMode = (modeInput.toUpperCase() === 'BENCHMARK_2024'
    ? 'BENCHMARK_2024'
    : 'OPERATIONAL_2025') as 'OPERATIONAL_2025' | 'BENCHMARK_2024';

  const db = getDatabase();
  const scoringSvc = new ScoringService(db);

  console.log('\n' + '='.repeat(90));
  console.log(`EXECUTING FULL NETWORK DETERMINISTIC SCORING RUN (${operatingMode})`);
  console.log('='.repeat(90));

  const result = scoringSvc.executeScoringRun(
    operatingMode,
    'POLICY_DEFAULT_V1',
    'CLI_NETWORK_RUNNER'
  );

  console.log(`\n  • Run ID            : ${result.runId}`);
  console.log(`  • Model             : POLICY_DEFAULT_V1 (Baseline Locked)`);
  console.log(`  • Operating Mode    : ${operatingMode}`);
  console.log(`  • Roads Evaluated   : ${result.rankedScores.length} / 350`);
  console.log(`  • Execution Time    : ${result.executionTimeMs} ms (Pure calculation < 1ms)`);

  const topScore = result.rankedScores[0].final_score;
  const bottomScore = result.rankedScores[result.rankedScores.length - 1].final_score;
  const medianScore = result.rankedScores[Math.floor(result.rankedScores.length / 2)].final_score;

  console.log(`  • Score Range       : Min ${bottomScore.toFixed(6)} | Median ${medianScore.toFixed(6)} | Max ${topScore.toFixed(6)}`);

  console.log('\n[TIER DISTRIBUTION SUMMARY]');
  const tierCounts: Record<string, number> = {
    TOP_35: 0,
    TOP_70: 0,
    TOP_105: 0,
    REGULAR: 0,
  };
  for (const r of result.rankedScores) {
    tierCounts[r.tier_category] = (tierCounts[r.tier_category] || 0) + 1;
  }
  console.log(`  • Tier 1 (TOP_35)   : ${tierCounts['TOP_35']} ruas (Prioritas Sangat Mendesak / Top 10%)`);
  console.log(`  • Tier 2 (TOP_70)   : ${tierCounts['TOP_70']} ruas (Prioritas Tinggi / Top 20%)`);
  console.log(`  • Tier 3 (TOP_105)  : ${tierCounts['TOP_105']} ruas (Prioritas Sedang / Top 30%)`);
  console.log(`  • Tier 4 (REGULAR)  : ${tierCounts['REGULAR']} ruas (Reguler Pemeliharaan)`);

  console.log('\n[TOP 20 PRIORITAS PENANGANAN JALAN KABUPATEN]');
  console.log('  Rank | Road Key    | No. | Display Name                     | Kecamatan       | Mantap % | Final Score | Tier');
  console.log('  -----+-------------+-----+----------------------------------+-----------------+----------+-------------+---------');
  for (let i = 0; i < 20; i++) {
    const r = result.rankedScores[i];
    const rankStr = `#${r.priority_rank}`.padEnd(4);
    const keyStr = r.road_key.padEnd(11);
    const noStr = r.nomor_ruas.padEnd(3);
    const nameStr = (r.display_name.length > 32 ? r.display_name.slice(0, 30) + '..' : r.display_name).padEnd(32);
    const distStr = r.district_name.padEnd(15);
    const mantapStr = `${r.tie_breaker_metadata.mantap_pct.toFixed(1)}%`.padStart(8);
    const scoreStr = r.final_score.toFixed(6).padStart(11);
    const tierStr = r.tier_category.padEnd(7);
    console.log(`  ${rankStr} | ${keyStr} | ${noStr} | ${nameStr} | ${distStr} | ${mantapStr} | ${scoreStr} | ${tierStr}`);
  }

  console.log('\n[BOTTOM 5 RUAS (SKOR TERENDAH / KONDISI BAIK)]');
  console.log('  Rank | Road Key    | No. | Display Name                     | Kecamatan       | Mantap % | Final Score | Tier');
  console.log('  -----+-------------+-----+----------------------------------+-----------------+----------+-------------+---------');
  for (let i = result.rankedScores.length - 5; i < result.rankedScores.length; i++) {
    const r = result.rankedScores[i];
    const rankStr = `#${r.priority_rank}`.padEnd(4);
    const keyStr = r.road_key.padEnd(11);
    const noStr = r.nomor_ruas.padEnd(3);
    const nameStr = (r.display_name.length > 32 ? r.display_name.slice(0, 30) + '..' : r.display_name).padEnd(32);
    const distStr = r.district_name.padEnd(15);
    const mantapStr = `${r.tie_breaker_metadata.mantap_pct.toFixed(1)}%`.padStart(8);
    const scoreStr = r.final_score.toFixed(6).padStart(11);
    const tierStr = r.tier_category.padEnd(7);
    console.log(`  ${rankStr} | ${keyStr} | ${noStr} | ${nameStr} | ${distStr} | ${mantapStr} | ${scoreStr} | ${tierStr}`);
  }

  console.log('\n' + '='.repeat(90) + '\n');
}

// CLI entrypoint
const targetMode = process.argv[2] || 'OPERATIONAL_2025';
try {
  runFullNetworkScoring(targetMode);
} finally {
  closeDatabase();
}
