import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const rows = db.prepare(`
  SELECT * FROM road_segment_cost_estimates 
  WHERE segment_id IN ('HSS-KAB-001-SEG-0000', 'HSS-KAB-001-SEG-0001') 
    AND scenario_id = 'SCN-2027-BASELINE'
`).all();
console.log(rows);
