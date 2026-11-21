import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== SEARCH FOR 0.584347 OR HSS-KAB-025 SCORES ===');
const runsWithScores = db.prepare(`
  SELECT 
    sr.run_id,
    sr.executed_at,
    sr.operating_mode,
    pm.model_code,
    rps.priority_rank,
    rps.final_score
  FROM road_priority_scores rps
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE rps.road_key = 'HSS-KAB-025'
  GROUP BY rps.final_score
`).all();
console.log(runsWithScores);

console.log('=== SEARCH ANY ROAD WITH SCORE 0.584347 OR RANK 1 ===');
const anyRoad = db.prepare(`
  SELECT 
    sr.run_id,
    sr.executed_at,
    sr.operating_mode,
    pm.model_code,
    rps.road_key,
    rps.priority_rank,
    rps.final_score
  FROM road_priority_scores rps
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE rps.final_score BETWEEN 0.5843 AND 0.5844
     OR (rps.priority_rank = 1 AND rps.final_score != 0.6499452417543741)
  LIMIT 20
`).all();
console.log(anyRoad);

console.log('=== CHECK ROADS OR CONDITIONS WITH LENGTH 3.17 ===');
const roads317 = db.prepare(`
  SELECT * FROM roads WHERE length_km_official BETWEEN 3.16 AND 3.18
`).all();
console.log('roads with length ~3.17:', roads317);

const cond317 = db.prepare(`
  SELECT * FROM road_conditions WHERE total_panjang_km BETWEEN 3.16 AND 3.18
`).all();
console.log('conditions with length ~3.17:', cond317);

const geom317 = db.prepare(`
  SELECT road_key, geometry_length_m FROM road_geometries WHERE geometry_length_m BETWEEN 3160 AND 3180
`).all();
console.log('geometries with length ~3.17:', geom317);

console.log('=== CHECK CROSSWALK FOR HSS-KAB-025 ===');
const cw = db.prepare(`
  SELECT * FROM road_id_crosswalk WHERE canonical_road_key = 'HSS-KAB-025'
`).all();
console.log('crosswalk for HSS-KAB-025:', cw);

console.log('=== CHECK 1.ml_apps REFERENCE FILES FOR 0.584347 AND 3.17 ===');
