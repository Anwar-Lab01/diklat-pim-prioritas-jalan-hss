import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const colsRcs = db.prepare("PRAGMA table_info('road_cost_summaries')").all();
console.log('road_cost_summaries columns:', colsRcs.map((c: any) => `${c.name} (${c.type})`));

const colsRsce = db.prepare("PRAGMA table_info('road_segment_cost_estimates')").all();
console.log('road_segment_cost_estimates columns:', colsRsce.map((c: any) => `${c.name} (${c.type})`));
