import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDatabase } from '../src/db/connection.ts';

const db = getDatabase();
const baseline = JSON.parse(fs.readFileSync('data/backups/baseline_hashes_pre_phase3.json', 'utf8')).hashes;

for (const [tbl, h] of Object.entries(baseline)) {
  const rows = db.prepare('SELECT * FROM ' + tbl + ' ORDER BY 1').all();
  const curH = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  console.log(`${tbl}: ${curH === h ? 'MATCH' : 'DIFF'}`);
}
