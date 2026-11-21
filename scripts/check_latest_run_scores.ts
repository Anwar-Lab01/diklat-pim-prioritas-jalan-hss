import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

const latestRun = db.prepare(`
  SELECT sr.run_id, sr.executed_at, pm.model_code, sr.operating_mode
  FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC
  LIMIT 1
`).get() as any;

console.log('Latest scoring run:', latestRun);

const roadScores = db.prepare(`
  SELECT rps.road_key, rps.priority_rank, rps.final_score as composite_score
  FROM road_priority_scores rps
  WHERE rps.run_id = ?
  ORDER BY rps.priority_rank ASC
`).all(latestRun.run_id) as any[];

console.log('Road scores count for latest run:', roadScores.length);
console.log('Top 5 roads in latest run:');
console.log(roadScores.slice(0, 5));
