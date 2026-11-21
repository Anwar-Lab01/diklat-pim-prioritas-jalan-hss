import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const rules = db.prepare('SELECT * FROM treatment_package_rules ORDER BY priority_order ASC').all();
console.log(rules);
