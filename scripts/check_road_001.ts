import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const score = db.prepare(`
  SELECT rps.*, r.canonical_name, rcs.total_pagu_asb_rp, rcs.is_funded, rcs.allocation_rank, rcs.cumulative_cost_rp
  FROM road_priority_scores rps
  JOIN roads r ON rps.road_key = r.road_key
  JOIN road_cost_summaries rcs ON rps.road_key = rcs.road_key AND rcs.scenario_id = 'SCN-2027-BASELINE'
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' AND rps.road_key = 'HSS-KAB-001'
`).get();

console.log('HSS-KAB-001 details:');
console.log(score);
