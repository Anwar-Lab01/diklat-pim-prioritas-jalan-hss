import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

const latestRun = db.prepare(`
  SELECT sr.run_id
  FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC
  LIMIT 1
`).get() as any;

const roadScores = db.prepare(`
  SELECT road_key, priority_rank, final_score as composite_score
  FROM road_priority_scores
  WHERE run_id = ?
  ORDER BY priority_rank ASC
`).all(latestRun.run_id) as any[];

const costMap = new Map<string, number>();
const summaries = db.prepare(`SELECT road_key, total_pagu_asb_rp FROM road_cost_summaries WHERE scenario_id = 'SCN-2027-BASELINE'`).all() as any[];
for (const s of summaries) costMap.set(s.road_key, s.total_pagu_asb_rp);

console.log('=== CASE A: PREVIOUS (INCLUDING HSS-KAB-001 Rp 424.400.000) ===');
let cumA = 0;
let fundedA = 0;
let allocatedA = 0;
for (const rs of roadScores) {
  const cost = costMap.get(rs.road_key) || 0;
  cumA += cost;
  if (cumA <= 50000000000) {
    fundedA++;
    allocatedA += cost;
  }
}
console.log(`Rp 50M -> Funded: ${fundedA} roads, Allocated: Rp ${allocatedA.toLocaleString('id-ID')}, Remaining: Rp ${(50000000000 - allocatedA).toLocaleString('id-ID')}`);

let cumA30 = 0;
let fundedA30 = 0;
let allocatedA30 = 0;
for (const rs of roadScores) {
  const cost = costMap.get(rs.road_key) || 0;
  cumA30 += cost;
  if (cumA30 <= 30000000000) {
    fundedA30++;
    allocatedA30 += cost;
  }
}
console.log(`Rp 30M -> Funded: ${fundedA30} roads, Allocated: Rp ${allocatedA30.toLocaleString('id-ID')}, Remaining: Rp ${(30000000000 - allocatedA30).toLocaleString('id-ID')}`);

console.log('\n=== CASE B: RECONCILED (EXCLUDING 2 SEGMENTS WIDTH > 5m on HSS-KAB-001) ===');
let cumB = 0;
let fundedB = 0;
let allocatedB = 0;
for (const rs of roadScores) {
  let cost = costMap.get(rs.road_key) || 0;
  if (rs.road_key === 'HSS-KAB-001') cost = 0; // excluded
  cumB += cost;
  if (cumB <= 50000000000) {
    fundedB++;
    allocatedB += cost;
  }
}
console.log(`Rp 50M -> Funded: ${fundedB} roads, Allocated: Rp ${allocatedB.toLocaleString('id-ID')}, Remaining: Rp ${(50000000000 - allocatedB).toLocaleString('id-ID')}`);

let cumB30 = 0;
let fundedB30 = 0;
let allocatedB30 = 0;
for (const rs of roadScores) {
  let cost = costMap.get(rs.road_key) || 0;
  if (rs.road_key === 'HSS-KAB-001') cost = 0; // excluded
  cumB30 += cost;
  if (cumB30 <= 30000000000) {
    fundedB30++;
    allocatedB30 += cost;
  }
}
console.log(`Rp 30M -> Funded: ${fundedB30} roads, Allocated: Rp ${allocatedB30.toLocaleString('id-ID')}, Remaining: Rp ${(30000000000 - allocatedB30).toLocaleString('id-ID')}`);
