import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

const cross = db.prepare(`
  SELECT dominant_condition, segment_status, surface_type, recommended_treatment, count(*) as cnt 
  FROM treatment_engine_segments 
  GROUP BY dominant_condition, segment_status, surface_type, recommended_treatment 
  ORDER BY cnt DESC
`).all();
console.log(cross);

db.close();
