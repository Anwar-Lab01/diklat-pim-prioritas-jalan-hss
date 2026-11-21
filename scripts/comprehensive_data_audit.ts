import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== ASB UNIT AUDIT ===');
const units = db.prepare('SELECT item_category, unit, count(*) as cnt FROM master_asb_items GROUP BY item_category, unit').all();
console.log(units);

console.log('\n=== CHECK ZERO OR NEGATIVE UNIT PRICES IN ASB ===');
const zeroPrices = db.prepare('SELECT asb_id, package_name, unit_price_rp, unit_price_sen FROM master_asb_items WHERE unit_price_rp <= 0 OR unit_price_sen <= 0').all();
console.log('Zero or negative ASB prices:', zeroPrices.length);

console.log('\n=== CHECK ROAD SEGMENTS DATA COMPLETENESS ===');
const invalidSegs = db.prepare(`
  SELECT segment_id, road_key, segment_length_m, road_width_m, dominant_condition, surface_type
  FROM treatment_engine_segments
  WHERE segment_length_m <= 0 OR road_width_m <= 0 OR dominant_condition IS NULL OR surface_type IS NULL
`).all();
console.log('Invalid segments count:', invalidSegs.length);

console.log('\n=== SEGMENT SURFACE TYPES ===');
const surfaces = db.prepare(`
  SELECT surface_type, count(*) as cnt, sum(segment_length_m) as len_m
  FROM treatment_engine_segments
  GROUP BY surface_type
`).all();
console.log(surfaces);

console.log('\n=== SEGMENT CONDITIONS ===');
const conditions = db.prepare(`
  SELECT dominant_condition, count(*) as cnt, sum(segment_length_m) as len_m
  FROM treatment_engine_segments
  GROUP BY dominant_condition
`).all();
console.log(conditions);
