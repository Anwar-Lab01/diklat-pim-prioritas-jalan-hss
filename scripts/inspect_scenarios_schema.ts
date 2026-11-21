import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const cols = db.prepare("PRAGMA table_info('budget_scenarios')").all() as any[];
console.log('Columns of budget_scenarios:');
for (const c of cols) {
  console.log(` - ${c.name} (${c.type})`);
}

const scns = db.prepare('SELECT * FROM budget_scenarios').all();
console.log('Existing budget_scenarios:', scns);
