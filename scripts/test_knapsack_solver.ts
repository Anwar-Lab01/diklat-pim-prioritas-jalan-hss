import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

// Load latest scoring run
const latestRun = db.prepare(`
  SELECT sr.run_id FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC LIMIT 1
`).get() as any;

const scores = db.prepare(`
  SELECT road_key, priority_rank, final_score FROM road_priority_scores WHERE run_id = ?
`).all(latestRun.run_id) as any[];

const scoreMap = new Map<string, { rank: number; score: number }>();
for (const s of scores) {
  scoreMap.set(s.road_key, { rank: s.priority_rank, score: s.final_score });
}

// Load eligible segments with cost from SCN-2027-BASELINE
const segRows = db.prepare(`
  SELECT 
    rsce.segment_id,
    rsce.road_key,
    rsce.segment_length_m,
    rsce.unit_price_sen,
    rsce.indicative_cost_sen,
    rsce.indicative_cost_rp,
    rsce.rule_id
  FROM road_segment_cost_estimates rsce
  WHERE rsce.scenario_id = 'SCN-2027-BASELINE'
    AND rsce.indicative_cost_sen > 0
    AND rsce.calculation_mode != 'MANUAL_REVIEW_MODE'
`).all() as any[];

console.log(`Total eligible segments: ${segRows.length}`);

// Prepare items for Objective A and B
interface Item {
  id: string;
  road_key: string;
  costSen: bigint;
  costRp: number;
  lengthM: number;
  priorityScore: number;
  priorityRank: number;
  valueA: number; // Priority-weighted length (score * length_km)
  valueB: number; // Length in meters (or km)
}

const items: Item[] = segRows.map((r) => {
  const sc = scoreMap.get(r.road_key) || { rank: 999, score: 0 };
  const lenKm = r.segment_length_m / 1000.0;
  return {
    id: r.segment_id,
    road_key: r.road_key,
    costSen: BigInt(r.indicative_cost_sen),
    costRp: r.indicative_cost_rp,
    lengthM: r.segment_length_m,
    priorityScore: sc.score,
    priorityRank: sc.rank,
    valueA: sc.score * lenKm,
    valueB: lenKm,
  };
});

// Let's implement an exact branch-and-bound solver with LP relaxation bounding
function solveExactKnapsack(
  items: Item[],
  budgetSen: bigint,
  objective: 'A' | 'B'
): {
  selectedIds: Set<string>;
  totalCostSen: bigint;
  totalValue: number;
  nodesVisited: number;
  provenOptimal: boolean;
  timeMs: number;
} {
  const startTime = Date.now();

  // 1. Sort items by efficiency (value / cost) descending
  const sorted = [...items].map((it) => {
    const val = objective === 'A' ? it.valueA : it.valueB;
    const eff = Number(it.costSen) > 0 ? val / (Number(it.costSen) / 100) : 0;
    return { ...it, val, eff };
  });

  sorted.sort((a, b) => b.eff - a.eff);

  const n = sorted.length;
  let bestVal = 0;
  let bestSelected = new Uint8Array(n);
  const currentSelected = new Uint8Array(n);

  let nodesVisited = 0;

  // Initial greedy heuristic to set a high lower bound
  let gCost = 0n;
  let gVal = 0;
  for (let i = 0; i < n; i++) {
    if (gCost + sorted[i].costSen <= budgetSen) {
      gCost += sorted[i].costSen;
      gVal += sorted[i].val;
      bestSelected[i] = 1;
    }
  }
  bestVal = gVal;

  console.log(`Initial greedy LB for Obj ${objective}: ${bestVal.toFixed(4)}, cost: ${Number(gCost)/100}`);

  // Prefix sums for quick LP relaxation bound
  function getLPUpperBound(idx: number, curCost: bigint, curVal: number): number {
    let remBudget = budgetSen - curCost;
    let bound = curVal;
    for (let i = idx; i < n; i++) {
      if (sorted[i].costSen <= remBudget) {
        remBudget -= sorted[i].costSen;
        bound += sorted[i].val;
      } else {
        // Fractional item
        if (remBudget > 0n && Number(sorted[i].costSen) > 0) {
          bound += sorted[i].val * (Number(remBudget) / Number(sorted[i].costSen));
        }
        break;
      }
    }
    return bound;
  }

  // Branch and bound with depth-first search
  function branch(idx: number, curCost: bigint, curVal: number) {
    nodesVisited++;

    if (curVal > bestVal) {
      bestVal = curVal;
      bestSelected.set(currentSelected);
    }

    if (idx >= n) return;

    // Time budget guard (e.g. 10 seconds)
    if (nodesVisited % 10000 === 0 && Date.now() - startTime > 10000) {
      return;
    }

    // LP Upper Bound check
    const ub = getLPUpperBound(idx, curCost, curVal);
    if (ub <= bestVal + 1e-9) {
      return; // PRUNE
    }

    // Branch 1: Include item idx (if it fits)
    if (curCost + sorted[idx].costSen <= budgetSen) {
      currentSelected[idx] = 1;
      branch(idx + 1, curCost + sorted[idx].costSen, curVal + sorted[idx].val);
      currentSelected[idx] = 0;
    }

    // Branch 2: Exclude item idx
    // Before branching exclude, check upper bound without item idx
    const ubExclude = getLPUpperBound(idx + 1, curCost, curVal);
    if (ubExclude > bestVal + 1e-9) {
      branch(idx + 1, curCost, curVal);
    }
  }

  branch(0, 0n, 0);

  const selectedIds = new Set<string>();
  let totalCostSen = 0n;
  for (let i = 0; i < n; i++) {
    if (bestSelected[i] === 1) {
      selectedIds.add(sorted[i].id);
      totalCostSen += sorted[i].costSen;
    }
  }

  const duration = Date.now() - startTime;
  return {
    selectedIds,
    totalCostSen,
    totalValue: bestVal,
    nodesVisited,
    provenOptimal: nodesVisited < 10000 || duration < 10000,
    timeMs: duration,
  };
}

// Test Rp 30 Miliar & Rp 50 Miliar
const budgets = [
  { name: '10 Miliar', val: 1000000000000n },
  { name: '30 Miliar', val: 3000000000000n },
  { name: '50 Miliar', val: 5000000000000n },
];

for (const b of budgets) {
  console.log(`\n=================== TESTING BUDGET: ${b.name} ===================`);
  console.log('--- Objective A (Priority-Weighted Coverage) ---');
  const resA = solveExactKnapsack(items, b.val, 'A');
  console.log(`Selected: ${resA.selectedIds.size} segments, Cost: Rp ${(Number(resA.totalCostSen)/100).toLocaleString('id-ID')}, Value: ${resA.totalValue.toFixed(4)}, Nodes: ${resA.nodesVisited}, Time: ${resA.timeMs}ms, Proven: ${resA.provenOptimal}`);

  console.log('--- Objective B (Maximum Treatment Length) ---');
  const resB = solveExactKnapsack(items, b.val, 'B');
  console.log(`Selected: ${resB.selectedIds.size} segments, Cost: Rp ${(Number(resB.totalCostSen)/100).toLocaleString('id-ID')}, Treated Length: ${resB.totalValue.toFixed(2)} km, Nodes: ${resB.nodesVisited}, Time: ${resB.timeMs}ms, Proven: ${resB.provenOptimal}`);
}
