import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

console.log('--- DISTINCT PACKAGE NAMES FOR JALAN KABUPATEN ---');
const packages = db.prepare(`
  SELECT DISTINCT package_name, COUNT(*) as cnt, MIN(road_width_m) as min_w, MAX(road_width_m) as max_w 
  FROM master_asb_items 
  WHERE item_category = 'Jalan Kabupaten' 
  GROUP BY package_name
  ORDER BY package_name
`).all();
console.log(packages);

console.log('--- CHECK ASB TYPES IN PACKAGE NAME ---');
const typeMap = db.prepare(`
  SELECT DISTINCT 
    substr(package_name, 1, 13) as prefix, 
    COUNT(*) as cnt,
    MIN(unit_price_rp) as min_p,
    MAX(unit_price_rp) as max_p
  FROM master_asb_items
  WHERE item_category = 'Jalan Kabupaten'
  GROUP BY prefix
`).all();
console.log(typeMap);

db.close();
