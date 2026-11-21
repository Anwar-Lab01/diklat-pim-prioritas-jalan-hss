import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('--- SEGMENT WIDTH DISTRIBUTION IN treatment_engine_segments ---');
const segWidths = db.prepare(`
  SELECT road_width_m, count(*) as count, sum(segment_length_m) as total_len_m
  FROM treatment_engine_segments
  GROUP BY road_width_m
  ORDER BY road_width_m ASC
`).all();
console.log(segWidths);

console.log('--- SEGMENTS WITH WIDTH > 5.0m ---');
const wideSegs = db.prepare(`
  SELECT segment_id, road_key, road_width_m, segment_length_m, dominant_condition, surface_type
  FROM treatment_engine_segments
  WHERE road_width_m > 5.0
`).all();
console.log(wideSegs);

console.log('--- SEGMENTS WITH WIDTH < 3.0m ---');
const narrowSegs = db.prepare(`
  SELECT segment_id, road_key, road_width_m, segment_length_m, dominant_condition, surface_type
  FROM treatment_engine_segments
  WHERE road_width_m < 3.0
`).all();
console.log('Narrow segments count (< 3.0m):', narrowSegs.length);
if (narrowSegs.length > 0) {
  console.log('Sample narrow:', narrowSegs.slice(0, 5));
}
