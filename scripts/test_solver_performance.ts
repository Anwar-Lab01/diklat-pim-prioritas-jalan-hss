import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

const latestRun = db.prepare(`
  SELECT sr.run_id FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC LIMIT 1
`).get() as any;

const scores = db.prepare(`
  SELECT road_key, priority_rank, final_score FROM road_priority_scores WHERE run_id = ?
`).all(latestRun.run_id) as any[];

const scoreMap = new Map<string, { rank: number; score: number }>();
for (const s of scores) {
  scoreMap.set(s.road_key, { rank: s.priority_rank, score: s.final_score });
}

const segRows = db.prepare(`
  SELECT 
    rsce.segment_id,
    rsce.road_key,
    rsce.segment_length_m,
    rsce.unit_price_sen,
    rsce.indicative_cost_sen,
    rsce.indicative_cost_rp,
    rsce.rule_id
  FROM road_segment_cost_estimates rsce
  WHERE rsce.scenario_id = 'SCN-2027-BASELINE'
    AND rsce.indicative_cost_sen > 0
    AND rsce.calculation_mode != 'MANUAL_REVIEW_MODE'
`).all() as any[];

console.log(`Eligible segments: ${segRows.length}`);

// Check segment length variations
const lenDist: Record<number, number> = {};
for (const r of segRows) {
  lenDist[r.segment_length_m] = (lenDist[r.segment_length_m] || 0) + 1;
}
console.log('Segment length distribution:', lenDist);
