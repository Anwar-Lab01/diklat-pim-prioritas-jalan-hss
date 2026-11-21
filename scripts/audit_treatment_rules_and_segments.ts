import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

console.log('=== 1. TREATMENT RULES (R01..R06) ===');
const rules = db.prepare('SELECT rule_id, priority_order, rule_label, selected_profile, asb_type, condition_logic FROM treatment_package_rules ORDER BY priority_order').all();
console.log(JSON.stringify(rules, null, 2));

console.log('\n=== 2. ASB-AHSP PROFILES ===');
const profiles = db.prepare('SELECT profile_id, asb_type, structural_profile, purpose_description FROM asb_ahsp_profiles ORDER BY profile_id').all();
console.log(JSON.stringify(profiles, null, 2));

console.log('\n=== 3. ASB-AHSP PROFILE ITEMS SAMPLE ===');
const profileItems = db.prepare('SELECT profile_id, rule_identifier, item_role, quantity_basis, ahsp_id, division_code FROM asb_ahsp_profile_items LIMIT 10').all();
console.log(JSON.stringify(profileItems, null, 2));

console.log('\n=== 4. MASTER ASB SAMPLE & CATEGORIES ===');
const asbSummary = db.prepare(`
  SELECT item_category, treatment_family, surface_type, COUNT(*) as cnt, MIN(road_width_m) as min_w, MAX(road_width_m) as max_w 
  FROM master_asb_items 
  GROUP BY item_category, treatment_family, surface_type
`).all();
console.log(JSON.stringify(asbSummary, null, 2));

console.log('\n=== 5. TREATMENT ENGINE SEGMENTS SUMMARY ===');
const segConditions = db.prepare(`
  SELECT dominant_condition, surface_type, segment_status, COUNT(*) as cnt, 
         MIN(road_width_m) as min_w, MAX(road_width_m) as max_w,
         MIN(segment_length_m) as min_len, MAX(segment_length_m) as max_len
  FROM treatment_engine_segments 
  GROUP BY dominant_condition, surface_type, segment_status
`).all();
console.log(JSON.stringify(segConditions, null, 2));

console.log('\n=== 6. RECOMMENDED TREATMENT IN SEGMENTS ===');
const recTreatments = db.prepare(`
  SELECT recommended_treatment, COUNT(*) as cnt 
  FROM treatment_engine_segments 
  GROUP BY recommended_treatment
`).all();
console.log(JSON.stringify(recTreatments, null, 2));

db.close();
