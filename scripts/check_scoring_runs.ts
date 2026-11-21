import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const runs = db.prepare('SELECT * FROM scoring_runs').all();
console.log('Scoring runs count:', runs.length);
console.log('Scoring runs:', runs.slice(0, 5));
