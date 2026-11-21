import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

// Check all scores in diklat_pim.db
const allScores = db.prepare(`SELECT score_id, run_id, road_key, priority_rank, final_score FROM road_priority_scores WHERE priority_rank <= 5`).all() as any[];
console.log('Sample top 5 scores from all runs:');
const uniqueFinalScoresForRank1 = new Set();
for (const s of allScores) {
  if (s.priority_rank === 1) {
    uniqueFinalScoresForRank1.add(`${s.final_score} (road: ${s.road_key})`);
  }
}
console.log('Unique final scores for Rank 1:', Array.from(uniqueFinalScoresForRank1));

// Let's search 1.ml_apps for 0.584347
function searchDir(dir: string, needle: string) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!['node_modules', '.git', '.next'].includes(f)) {
          searchDir(full, needle);
        }
      } else if (f.endsWith('.json') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.csv') || f.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes(needle)) {
          console.log(`FOUND '${needle}' in ${full}`);
        }
      }
    }
  } catch (e) {
    // skip
  }
}

console.log('Searching 1.ml_apps for 0.584347...');
searchDir('F:\\WebApps\\1.ml_apps', '0.584347');
searchDir('F:\\WebApps\\1.ml_apps', '0.573937');
searchDir('F:\\WebApps\\1.ml_apps', '0.562304');
console.log('Done searching 1.ml_apps.');

console.log('Searching local workspace for 0.573937...');
searchDir('.', '0.573937');
console.log('Done searching local workspace.');
