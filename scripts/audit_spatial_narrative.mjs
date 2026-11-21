import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== VARIABLE DEFINITIONS ===');
const vars = db.prepare('SELECT variable_code, variable_name, category_code, direction, unit, source_field FROM variable_definitions').all();
console.table(vars);

console.log('=== SAMPLE OBSERVATIONS FOR DEMOGRAPHIC / SPATIAL VARIABLES ===');
const obs = db.prepare(`
  SELECT r.road_key, v.variable_code, o.raw_value, o.normalized_value 
  FROM road_variable_observations o 
  JOIN variable_definitions v ON o.variable_id = v.variable_id 
  JOIN roads r ON o.road_id = r.road_id
  WHERE v.variable_code IN ('norm_penduduk_dilayani', 'norm_desa_dilalui', 'norm_kecamatan_dilalui', 'norm_jarak_ibukota_kabupaten_cost')
  LIMIT 16
`).all();
console.table(obs);

console.log('=== DEMOGRAPHICS SUMMARY ===');
const demo = db.prepare(`
  SELECT 
    COUNT(*) as total_villages,
    COUNT(population) as with_pop,
    COUNT(households_total) as with_households,
    SUM(households_total) as sum_households,
    SUM(population) as sum_pop
  FROM village_demographics
`).get();
console.log('village_demographics stats:', demo);
