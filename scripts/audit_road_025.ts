import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== ROAD 025 (Singakarsa - Palas) ===');
const road = db.prepare(`SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, length_km_official, width_m_official FROM roads WHERE road_key = 'HSS-KAB-025'`).get();
console.log('roads table:', road);

const cond = db.prepare(`SELECT * FROM road_conditions WHERE road_key = 'HSS-KAB-025'`).all();
console.log('road_conditions table:', cond);

const geom = db.prepare(`SELECT road_key, geometry_length_m FROM road_geometries WHERE road_key = 'HSS-KAB-025'`).get();
console.log('road_geometries table:', geom);

const segStats = db.prepare(`
  SELECT 
    COUNT(*) as segment_count,
    SUM(segment_length_m) as total_seg_m,
    SUM(segment_length_m)/1000.0 as total_seg_km
  FROM treatment_engine_segments 
  WHERE road_key = 'HSS-KAB-025'
`).get();
console.log('treatment_engine_segments stats:', segStats);

const segEstimates = db.prepare(`
  SELECT 
    scenario_id,
    COUNT(*) as est_count,
    SUM(segment_length_m) as total_len_m,
    SUM(indicative_cost_rp) as total_cost_rp
  FROM road_segment_cost_estimates
  WHERE road_key = 'HSS-KAB-025'
  GROUP BY scenario_id
`).all();
console.log('road_segment_cost_estimates by scenario:', segEstimates);

const costSummaries = db.prepare(`
  SELECT 
    scenario_id,
    total_segments,
    treated_segments,
    routine_segments,
    manual_review_segments,
    total_length_km,
    treated_length_km,
    manual_review_length_km,
    total_pagu_asb_rp,
    is_funded,
    allocation_rank
  FROM road_cost_summaries
  WHERE road_key = 'HSS-KAB-025'
`).all();
console.log('road_cost_summaries:', costSummaries);

console.log('\n=== ALL SCORING RUNS FOR HSS-KAB-025 ===');
const scoreRuns = db.prepare(`
  SELECT 
    sr.run_id,
    sr.executed_at,
    sr.operating_mode,
    pm.model_code,
    rps.priority_rank,
    rps.final_score,
    rps.tier_category
  FROM road_priority_scores rps
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE rps.road_key = 'HSS-KAB-025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC
`).all();
console.log(scoreRuns);

console.log('\n=== ALL SCORING RUNS IN SYSTEM ===');
const allRuns = db.prepare(`
  SELECT sr.run_id, sr.operating_mode, sr.executed_at, pm.model_code, COUNT(rps.road_key) as score_count
  FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  LEFT JOIN road_priority_scores rps ON sr.run_id = rps.run_id
  GROUP BY sr.run_id
  ORDER BY sr.run_id ASC
`).all();
console.log(allRuns);
