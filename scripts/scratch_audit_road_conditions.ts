import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

const sample = db.prepare('SELECT * FROM road_conditions LIMIT 2').all();
console.log('Sample road_conditions:');
console.log(JSON.stringify(sample, null, 2));

const cols = db.prepare("PRAGMA table_info('road_conditions')").all();
console.log('road_conditions columns:', cols.map((c: any) => c.name));

db.close();
