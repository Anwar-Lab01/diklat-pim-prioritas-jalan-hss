import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

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

interface Item {
  id: string;
  road_key: string;
  costSen: bigint;
  costRp: number;
  lengthM: number;
  priorityScore: number;
  priorityRank: number;
  valueA: number; // Priority-weighted length (score * length_km)
  valueB: number; // Length in km
  valueC: number; // Priority-respecting value: (1000 - rank) * 1000 + valueA
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
    valueC: (351 - sc.rank) * 1000 + sc.score * lenKm,
  };
});

export interface SolverResult {
  objective: string;
  budgetCeilingRp: number;
  selectedCount: number;
  totalCostRp: number;
  totalCostSen: bigint;
  remainingBudgetRp: number;
  totalTreatedKm: number;
  priorityWeightedScore: number;
  nodesVisited: number;
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';
  optimalityGapPct: number;
  runtimeMs: number;
  selectedSegmentIds: string[];
}

function solveKnapsackILP(
  items: Item[],
  budgetSen: bigint,
  objective: 'PRIORITY_WEIGHTED' | 'MAX_LENGTH' | 'PRIORITY_RESPECTING'
): SolverResult {
  const startTime = Date.now();
  const timeLimitMs = 3000;
  const nodeLimit = 100000;

  // 1. Map values
  const elements = items.map((it) => {
    let val = it.valueA;
    if (objective === 'MAX_LENGTH') val = it.valueB;
    if (objective === 'PRIORITY_RESPECTING') val = it.valueC;
    const cSen = it.costSen;
    const cRp = Number(cSen) / 100;
    const eff = cRp > 0 ? val / cRp : 0;
    return { it, val, cSen, eff };
  });

  // Sort descending by efficiency, secondary by cost descending
  elements.sort((a, b) => {
    if (Math.abs(b.eff - a.eff) > 1e-12) return b.eff - a.eff;
    if (b.cSen > a.cSen) return 1;
    if (b.cSen < a.cSen) return -1;
    return 0;
  });

  const n = elements.length;

  // Prefix sums for quick LP bound
  const prefCost = new BigInt64Array(n + 1);
  const prefVal = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    prefCost[i + 1] = prefCost[i] + elements[i].cSen;
    prefVal[i + 1] = prefVal[i] + elements[i].val;
  }

  // 2. LP Relaxation Upper Bound function
  function lpBound(fromIdx: number, curCost: bigint, curVal: number): number {
    const rem = budgetSen - curCost;
    if (rem <= 0n) return curVal;
    if (fromIdx >= n) return curVal;

    // Binary search for break item b
    let low = fromIdx;
    let high = n - 1;
    let b = n;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const spanCost = prefCost[mid + 1] - prefCost[fromIdx];
      if (spanCost <= rem) {
        low = mid + 1;
      } else {
        b = mid;
        high = mid - 1;
      }
    }

    const fitCount = b - fromIdx;
    const addedCost = prefCost[b] - prefCost[fromIdx];
    const addedVal = prefVal[b] - prefVal[fromIdx];
    let bound = curVal + addedVal;
    const finalRem = rem - addedCost;

    if (b < n && finalRem > 0n && elements[b].cSen > 0n) {
      bound += elements[b].val * (Number(finalRem) / Number(elements[b].cSen));
    }
    return bound;
  }

  const globalUB = lpBound(0, 0n, 0);

  // 3. Initial greedy heuristic solution
  let bestVal = 0;
  let bestCostSen = 0n;
  const bestSelected = new Uint8Array(n);
  const curSelected = new Uint8Array(n);

  let gCost = 0n;
  let gVal = 0;
  for (let i = 0; i < n; i++) {
    if (gCost + elements[i].cSen <= budgetSen) {
      gCost += elements[i].cSen;
      gVal += elements[i].val;
      bestSelected[i] = 1;
    }
  }
  bestVal = gVal;
  bestCostSen = gCost;

  // 4. Branch and Bound
  let nodes = 0;
  let timedOut = false;

  function dfs(idx: number, curCost: bigint, curVal: number) {
    nodes++;

    if (curVal > bestVal) {
      bestVal = curVal;
      bestCostSen = curCost;
      bestSelected.set(curSelected);
    }

    if (idx >= n) return;

    if ((nodes & 4095) === 0) {
      if (Date.now() - startTime > timeLimitMs || nodes >= nodeLimit) {
        timedOut = true;
        return;
      }
    }

    // Prune check
    const ub = lpBound(idx, curCost, curVal);
    if (ub <= bestVal + 1e-9) {
      return; // Pruned by LP bound
    }

    // Branch 1: Include item idx
    if (curCost + elements[idx].cSen <= budgetSen) {
      curSelected[idx] = 1;
      dfs(idx + 1, curCost + elements[idx].cSen, curVal + elements[idx].val);
      curSelected[idx] = 0;
      if (timedOut) return;
    }

    // Branch 2: Exclude item idx
    const ubEx = lpBound(idx + 1, curCost, curVal);
    if (ubEx > bestVal + 1e-9) {
      dfs(idx + 1, curCost, curVal);
    }
  }

  dfs(0, 0n, 0);

  const selectedIds: string[] = [];
  let totalKm = 0;
  let weightedScore = 0;
  for (let i = 0; i < n; i++) {
    if (bestSelected[i] === 1) {
      selectedIds.push(elements[i].it.id);
      totalKm += elements[i].it.lengthM / 1000.0;
      weightedScore += elements[i].it.valueA;
    }
  }

  const duration = Date.now() - startTime;
  const gap = globalUB > 0 ? Math.max(0, ((globalUB - bestVal) / globalUB) * 100) : 0;
  const status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' = selectedIds.length === 0
    ? (budgetSen < 100000000n ? 'INFEASIBLE' : 'FEASIBLE')
    : (!timedOut && gap < 0.001 ? 'OPTIMAL' : 'FEASIBLE');

  return {
    objective,
    budgetCeilingRp: Number(budgetSen) / 100,
    selectedCount: selectedIds.length,
    totalCostRp: Number(bestCostSen) / 100,
    totalCostSen: bestCostSen,
    remainingBudgetRp: Number(budgetSen - bestCostSen) / 100,
    totalTreatedKm: totalKm,
    priorityWeightedScore: weightedScore,
    nodesVisited: nodes,
    status,
    optimalityGapPct: Math.round(gap * 10000) / 10000,
    runtimeMs: duration,
    selectedSegmentIds: selectedIds,
  };
}

// Test across budgets: 10B, 20B, 30B, 50B, 75B, 100B
const ceilings = [10, 20, 30, 50, 75, 100];

for (const c of ceilings) {
  const bSen = BigInt(c) * 100000000000n;
  console.log(`\n============================= CEILING: Rp ${c} MILIAR =============================`);
  for (const obj of ['PRIORITY_WEIGHTED', 'MAX_LENGTH', 'PRIORITY_RESPECTING'] as const) {
    const res = solveKnapsackILP(items, bSen, obj);
    console.log(`[${obj.padEnd(20)}] Cost: Rp ${res.totalCostRp.toLocaleString('id-ID').padStart(14)} | Treated: ${res.totalTreatedKm.toFixed(2).padStart(6)} km | Score: ${res.priorityWeightedScore.toFixed(4).padStart(7)} | Segs: ${res.selectedCount.toString().padStart(4)} | Nodes: ${res.nodesVisited.toString().padStart(6)} | Status: ${res.status.padEnd(8)} (Gap: ${res.optimalityGapPct}%) | Time: ${res.runtimeMs}ms`);
  }
}
