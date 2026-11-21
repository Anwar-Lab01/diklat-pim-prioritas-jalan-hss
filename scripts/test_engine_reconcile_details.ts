import { DatabaseSync } from 'node:sqlite';
import { TreatmentCostingEngine } from '../src/services/treatmentCostingEngine.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const engine = new TreatmentCostingEngine(db);

const rc = db.prepare(`SELECT * FROM road_conditions WHERE road_key = 'HSS-KAB-001' AND survey_year = 2025`).get() as any;
console.log('HSS-KAB-001 road condition:', rc);

const segs001 = db.prepare(`SELECT * FROM treatment_engine_segments WHERE road_key = 'HSS-KAB-001'`).all() as any[];
console.log(`HSS-KAB-001 has ${segs001.length} segments.`);
for (const s of segs001) {
  const ev = engine.evaluateSegment(s, rc);
  console.log(`Seg ${s.segment_id}: cond=${s.dominant_condition}, width=${s.road_width_m}, rule=${ev.rule_id}, type=${ev.asb_type}, cost=${ev.indicative_cost_rp}, status=${ev.status}, flags=${JSON.stringify(ev.adjustment_flags)}`);
}
