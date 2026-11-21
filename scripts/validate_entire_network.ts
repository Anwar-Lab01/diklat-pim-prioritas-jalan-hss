import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== NETWORK VALIDATION AUDIT ===\n');

// 1. Canonical roads
const roadCount = db.prepare('SELECT COUNT(*) as count FROM roads').get() as any;
const roadLen = db.prepare('SELECT SUM(length_km_official) as total FROM roads').get() as any;
console.log(`1. Canonical Roads: ${roadCount.count} (Target: 350), Total Length: ${roadLen.total.toFixed(3)} km (Target: 732.460 km)`);

// 2. Condition segments
const segCount = db.prepare('SELECT COUNT(*) as count FROM treatment_engine_segments').get() as any;
const segLen = db.prepare('SELECT SUM(segment_length_m)/1000.0 as total FROM treatment_engine_segments').get() as any;
console.log(`2. Condition Segments: ${segCount.count} (Target: 7,487), Total Length: ${segLen.total.toFixed(3)} km (Target: 732.460 km)`);

// 3. Variables & Categories
const varCount = db.prepare('SELECT COUNT(*) as count FROM variable_definitions').get() as any;
const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as any;
console.log(`3. Variables: ${varCount.count} (Target: 17), Categories: ${catCount.count} (Target: 4)`);

// 4. Policy model
const model = db.prepare("SELECT * FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1'").get() as any;
console.log(`4. Policy Model: ${model ? model.model_name : 'NOT FOUND'} (${model?.model_code})`);

// 5. ASB references
const asbTotal = db.prepare('SELECT COUNT(*) as count FROM master_asb_items').get() as any;
const asbActive = db.prepare('SELECT COUNT(*) as count FROM master_asb_items WHERE is_active = 1').get() as any;
console.log(`5. ASB References: Total = ${asbTotal.count} (Target: 1,010), Active = ${asbActive.count}`);

// 6. AHSP references
const ahspTotal = db.prepare('SELECT COUNT(*) as count FROM master_ahsp_items').get() as any;
const ahspActive = db.prepare('SELECT COUNT(*) as count FROM master_ahsp_items WHERE is_active = 1').get() as any;
console.log(`6. AHSP References: Total = ${ahspTotal.count} (Target: 483), Active = ${ahspActive.count}`);

// 7. Treatment rules R01-R06
const ruleCount = db.prepare('SELECT COUNT(*) as count FROM treatment_package_rules').get() as any;
const rules = db.prepare('SELECT rule_id, rule_label, priority, asb_type FROM treatment_package_rules ORDER BY priority ASC').all() as any[];
console.log(`7. Treatment Rules: ${ruleCount.count} (Target: 6)`);
console.log(rules);

// 8. ASB mapping profiles & items
const profileCount = db.prepare('SELECT COUNT(*) as count FROM asb_ahsp_profiles').get() as any;
const profileItemCount = db.prepare('SELECT COUNT(*) as count FROM asb_ahsp_profile_items').get() as any;
console.log(`8. ASB Mapping Profiles: ${profileCount.count} (Target: 11), Profile Items: ${profileItemCount.count} (Target: 35)`);
