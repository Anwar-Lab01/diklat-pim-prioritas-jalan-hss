import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const row = db.prepare(`SELECT * FROM road_cost_summaries WHERE road_key = 'HSS-KAB-025' AND scenario_id = 'SCN-2027-BASELINE'`).get();
console.log('road_cost_summaries row for HSS-KAB-025:', row);

const rps = db.prepare(`
  SELECT rps.*, sr.operating_mode, sr.executed_at, pm.model_code
  FROM road_priority_scores rps
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE rps.road_key = 'HSS-KAB-025'
  ORDER BY sr.executed_at DESC
  LIMIT 5
`).all();
console.log('recent road_priority_scores for HSS-KAB-025:', rps);
