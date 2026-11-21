import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
console.log('Tables:', tables.map(t => t.name));
