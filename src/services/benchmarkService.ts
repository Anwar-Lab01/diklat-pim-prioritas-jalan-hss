import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { ScoringService } from './scoringService.ts';
import { SEED_FILES } from '../config/constants.ts';
import { parseCsv } from '../ingestion/csvParser.ts';

export interface BenchmarkComparisonResult {
  total_evaluated: number;
  historical_top105_count: number;
  policy_top105_count: number;
  overlap_count: number;
  concordance_pct: number;
  only_in_policy: Array<{
    road_key: string;
    priority_rank: number;
    final_score: number;
    display_name: string;
  }>;
  only_in_historical: Array<{
    road_key: string;
    priority_rank: number;
    final_score: number;
    display_name: string;
  }>;
}

export class BenchmarkService {
  private db: DatabaseSync;
  private scoringSvc: ScoringService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.scoringSvc = new ScoringService(this.db);
  }

  /**
   * Compare BENCHMARK_2024 priority ranking against historical label_top105.
   *
   * Note: This is an audit / concordance tool ONLY.
   * label_top105 is NEVER used as a scoring input.
   */
  evaluateBenchmarkConcordance(): BenchmarkComparisonResult {
    // 1. Execute or get BENCHMARK_2024 scoring run
    const scoringResult = this.scoringSvc.executeScoringRun(
      'BENCHMARK_2024',
      'POLICY_DEFAULT_V1',
      'AUDIT_BENCHMARK_RUNNER'
    );

    const rankedScores = scoringResult.rankedScores;
    const policyTop105 = rankedScores.slice(0, 105);
    const policyTop105Keys = new Set(policyTop105.map((r) => r.road_key));

    // 2. Load historical label_top105 ground-truth flags
    const baselineCsv = fs.readFileSync(SEED_FILES.priorityBaselineCanonical, 'utf8');
    const rows = parseCsv<{ road_key: string; label_top105: string }>(baselineCsv);

    const historicalTop105Keys = new Set<string>();
    for (const row of rows) {
      if (row.label_top105 === '1' || row.label_top105 === 'true') {
        historicalTop105Keys.add(row.road_key);
      }
    }

    // 3. Compute overlap & concordance
    let overlapCount = 0;
    for (const key of policyTop105Keys) {
      if (historicalTop105Keys.has(key)) {
        overlapCount++;
      }
    }

    const concordancePct = (overlapCount / 105) * 100;

    // 4. Update top105_concordance in scoring_runs table
    const updateRunStmt = this.db.prepare(`
      UPDATE scoring_runs
      SET top105_concordance = ?
      WHERE run_id = ?
    `);
    updateRunStmt.run(Math.round(concordancePct * 100) / 100, scoringResult.runId);

    // 5. Build difference lists
    const scoreMap = new Map(rankedScores.map((r) => [r.road_key, r]));

    const onlyInPolicy = policyTop105
      .filter((r) => !historicalTop105Keys.has(r.road_key))
      .map((r) => ({
        road_key: r.road_key,
        priority_rank: r.priority_rank,
        final_score: r.final_score,
        display_name: r.display_name,
      }));

    const onlyInHistorical: Array<{
      road_key: string;
      priority_rank: number;
      final_score: number;
      display_name: string;
    }> = [];

    for (const histKey of historicalTop105Keys) {
      if (!policyTop105Keys.has(histKey)) {
        const road = scoreMap.get(histKey);
        if (road) {
          onlyInHistorical.push({
            road_key: road.road_key,
            priority_rank: road.priority_rank,
            final_score: road.final_score,
            display_name: road.display_name,
          });
        }
      }
    }

    onlyInHistorical.sort((a, b) => a.priority_rank - b.priority_rank);

    return {
      total_evaluated: rankedScores.length,
      historical_top105_count: historicalTop105Keys.size,
      policy_top105_count: policyTop105.length,
      overlap_count: overlapCount,
      concordance_pct: Math.round(concordancePct * 100) / 100,
      only_in_policy: onlyInPolicy,
      only_in_historical: onlyInHistorical,
    };
  }
}
