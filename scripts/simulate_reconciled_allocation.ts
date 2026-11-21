import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

// Run allocation test without the Rp 424.400.000 from HSS-KAB-001
const roads = db.prepare(`
  SELECT rcs.road_key, r.canonical_name, rcs.allocation_rank, rcs.total_pagu_asb_rp, rps.priority_rank
  FROM road_cost_summaries rcs
  JOIN roads r ON rcs.road_key = r.road_key
  JOIN road_priority_scores rps ON rcs.road_key = rps.road_key
  JOIN scoring_runs sr ON rps.run_id = sr.run_id
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE rcs.scenario_id = 'SCN-2027-BASELINE' AND pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY rps.priority_rank ASC
`).all() as any[];

console.log(`Total roads: ${roads.length}`);

// Modify HSS-KAB-001 cost to 0
for (const r of roads) {
  if (r.road_key === 'HSS-KAB-001') {
    r.corrected_cost = 0;
  } else {
    r.corrected_cost = r.total_pagu_asb_rp;
  }
}

// Re-calculate greedy allocation with Rp 50 Billion ceiling
const ceiling50M = 50000000000;
let cum50M = 0;
let fundedCount50M = 0;
let allocated50M = 0;

console.log('\n--- SIMULATED RECONCILED ALLOCATION (Rp 50 M Ceiling) ---');
for (const r of roads) {
  cum50M += r.corrected_cost;
  const isFunded = cum50M <= ceiling50M;
  if (isFunded) {
    fundedCount50M++;
    allocated50M += r.corrected_cost;
    if (r.allocation_rank <= 22) {
      console.log(`Funded #${r.priority_rank} [${r.road_key}] ${r.canonical_name}: cost=Rp ${r.corrected_cost.toLocaleString('id-ID')}, cum=Rp ${cum50M.toLocaleString('id-ID')}`);
    }
  } else {
    if (r.allocation_rank <= 22) {
      console.log(`DEFERRED #${r.priority_rank} [${r.road_key}] ${r.canonical_name}: cost=Rp ${r.corrected_cost.toLocaleString('id-ID')}, would be cum=Rp ${cum50M.toLocaleString('id-ID')}`);
    }
  }
}

console.log(`\nReconciled Rp 50M Scenario Results:`);
console.log(`- Funded roads count: ${fundedCount50M}`);
console.log(`- Allocated amount: Rp ${allocated50M.toLocaleString('id-ID')}`);
console.log(`- Ceiling: Rp ${ceiling50M.toLocaleString('id-ID')}`);
console.log(`- Remaining budget: Rp ${(ceiling50M - allocated50M).toLocaleString('id-ID')}`);

// Re-calculate greedy allocation with Rp 30 Billion ceiling
const ceiling30M = 30000000000;
let cum30M = 0;
let fundedCount30M = 0;
let allocated30M = 0;

console.log('\n--- SIMULATED RECONCILED ALLOCATION (Rp 30 M Ceiling) ---');
for (const r of roads) {
  cum30M += r.corrected_cost;
  const isFunded = cum30M <= ceiling30M;
  if (isFunded) {
    fundedCount30M++;
    allocated30M += r.corrected_cost;
    console.log(`Funded #${r.priority_rank} [${r.road_key}] ${r.canonical_name}: cost=Rp ${r.corrected_cost.toLocaleString('id-ID')}, cum=Rp ${cum30M.toLocaleString('id-ID')}`);
  }
}

console.log(`\nReconciled Rp 30M Scenario Results:`);
console.log(`- Funded roads count: ${fundedCount30M}`);
console.log(`- Allocated amount: Rp ${allocated30M.toLocaleString('id-ID')}`);
console.log(`- Ceiling: Rp ${ceiling30M.toLocaleString('id-ID')}`);
console.log(`- Remaining budget: Rp ${(ceiling30M - allocated30M).toLocaleString('id-ID')}`);
