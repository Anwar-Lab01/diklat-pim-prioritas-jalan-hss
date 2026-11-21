import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

const wideSegsCondition = db.prepare(`
  SELECT 
    dominant_condition,
    surface_type,
    road_width_m,
    count(*) as cnt,
    sum(segment_length_m) as len_m
  FROM treatment_engine_segments
  WHERE road_width_m > 5.0
  GROUP BY dominant_condition, surface_type, road_width_m
  ORDER BY road_width_m ASC
`).all();

console.log('Wide segments (>5m) condition breakdown:');
console.log(wideSegsCondition);

const wideNonMantap = db.prepare(`
  SELECT segment_id, road_key, road_width_m, segment_length_m, dominant_condition, surface_type
  FROM treatment_engine_segments
  WHERE road_width_m > 5.0 AND dominant_condition NOT IN ('baik', 'sedang')
`).all();

console.log('\nWide segments with Non-Mantap condition (requiring major package):', wideNonMantap.length);
console.log(wideNonMantap);
