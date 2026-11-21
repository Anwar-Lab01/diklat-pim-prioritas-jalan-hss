/**
 * SIAP JALAN HSS — Phase 3: Mathematical Budget Optimization Engine
 * Deterministic Integer Linear Programming (ILP) and Exact 0-1 Knapsack Solver
 * with Dantzig / Martello-Toth LP Relaxation Bounding and Exact Integer-Sen Precision.
 */

import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

// Global BigInt JSON serialization support
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    const num = Number(this);
    return Number.isSafeInteger(num) ? num : this.toString();
  };
}

export type OptimizationObjective =
  | 'PRIORITY_WEIGHTED'   // Objective A: Maximize sum(AHP/WSM road priority score * damaged length * x_s)
  | 'MAX_LENGTH'          // Objective B: Maximize sum(damaged segment length * x_s)
  | 'PRIORITY_RESPECTING' // Priority-respecting lexicographic / hierarchical optimization
  | 'GREEDY_BENCHMARK';   // Benchmark: Priority-ordered greedy road allocation

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'BENCHMARK_GREEDY';

export type RoadOperationalStatus =
  | 'FUNDED_CONSTRUCTION'     // Road receives actual indicative construction funding (> Rp 0)
  | 'ROUTINE_MAINTENANCE'     // Road segments are all good/fair (R06), needing routine maintenance only (Rp 0)
  | 'MANUAL_TECHNICAL_REVIEW' // Road has segments with width > 5m requiring special manual engineering review (Rp 0)
  | 'DEFERRED_BY_BUDGET'      // Road requires construction but deferred due to insufficient budget
  | 'INCOMPLETE_ESTIMATE'     // Road has incomplete or unmapped segments
  | 'NOT_ELIGIBLE';           // Road not eligible under R01-R06

export interface SegmentOptimizationItem {
  segment_id: string;
  road_key: string;
  rule_id: string;
  asb_type: string;
  segment_length_m: number;
  road_width_m: number;
  cost_sen: bigint;
  cost_rp: number;
  priority_score: number;
  priority_rank: number;
  value_priority_weighted: number;
  value_max_length: number;
  value_priority_respecting: number;
}

export interface RoadOptimizationResult {
  road_key: string;
  road_name: string;
  district_name: string;
  priority_rank: number;
  composite_score: number;
  length_official_km: number;
  length_surveyed_km: number;
  treated_length_km: number;
  allocated_treated_length_km: number;
  total_segments: number;
  treated_segments: number;
  routine_segments: number;
  manual_review_segments: number;
  allocated_treated_segments: number;
  total_pagu_asb_rp: number;
  total_pagu_asb_sen: bigint;
  allocated_pagu_rp: number;
  allocated_pagu_sen: bigint;
  operational_status: RoadOperationalStatus;
  is_accommodated_in_queue: boolean;
  allocation_rank: number;
  cumulative_cost_rp: number;
  cumulative_cost_sen: bigint;
  selection_rationale: string;
}

export interface OptimizationRunResult {
  scenario_id: string;
  objective_mode: OptimizationObjective;
  budget_ceiling_rp: number;
  budget_ceiling_sen: bigint;
  allocated_cost_rp: number;
  allocated_cost_sen: bigint;
  remaining_budget_rp: number;
  remaining_budget_sen: bigint;
  treated_length_km: number;
  priority_weighted_score: number;
  selected_segments_count: number;
  solver_name: string;
  solver_status: SolverStatus;
  nodes_explored: number;
  optimality_gap_pct: number;
  runtime_ms: number;
  status_breakdown: {
    funded_construction_roads: number;
    routine_maintenance_roads: number;
    manual_review_roads: number;
    deferred_by_budget_roads: number;
    incomplete_estimate_roads: number;
    not_eligible_roads: number;
    total_roads: number;
  };
  planning_indicators: {
    existing_network_mantap_km: number;
    existing_network_mantap_pct: number;
    eligible_damaged_length_km: number;
    selected_treatment_length_km: number;
    remaining_untreated_damaged_length_km: number;
    estimated_treatment_expenditure_rp: number;
    disclaimer: string;
  };
  selected_segment_ids: string[];
  road_allocations: RoadOptimizationResult[];
}

export class OptimizationEngine {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Run the mathematical optimization solver or greedy benchmark.
   */
  public runOptimization(
    scenarioId: string,
    objective: OptimizationObjective = 'PRIORITY_WEIGHTED',
    customCeilingRp?: number
  ): OptimizationRunResult {
    const startTime = Date.now();

    // 1. Fetch scenario details
    const scenario = this.db
      .prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?')
      .get(scenarioId) as any;
    if (!scenario) {
      throw new Error(`SCENARIO_NOT_FOUND: Scenario with id '${scenarioId}' does not exist.`);
    }

    const ceilingRp = customCeilingRp !== undefined ? Number(customCeilingRp) : Number(scenario.budget_ceiling_rp || 50000000000);
    const ceilingSen = BigInt(Math.round(ceilingRp * 100));

    // 2. Load latest authoritative road scores
    const latestRun = this.db
      .prepare(`
        SELECT sr.run_id 
        FROM scoring_runs sr 
        JOIN priority_models pm ON sr.model_id = pm.model_id 
        WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' 
        ORDER BY sr.executed_at DESC, sr.run_id DESC 
        LIMIT 1
      `)
      .get() as any;

    const roadScores = this.db
      .prepare(`
        SELECT road_key, priority_rank, final_score as composite_score
        FROM road_priority_scores
        WHERE run_id = ?
        ORDER BY priority_rank ASC
      `)
      .all(latestRun?.run_id || '') as any[];

    const scoreMap = new Map<string, { rank: number; score: number }>();
    for (const rs of roadScores) {
      scoreMap.set(rs.road_key, { rank: Number(rs.priority_rank), score: Number(rs.composite_score) });
    }

    // 3. Load all canonical roads
    const roads = this.db
      .prepare(`
        SELECT road_key, canonical_name, display_name, district_name, length_km_official
        FROM roads
        ORDER BY road_key ASC
      `)
      .all() as any[];

    // 4. Load evaluated segment estimates for this scenario
    const segEstimates = this.db
      .prepare(`
        SELECT 
          rsce.segment_id,
          rsce.road_key,
          rsce.rule_id,
          rsce.asb_id,
          rsce.segment_length_m,
          rsce.matched_width_m,
          rsce.unit_price_sen,
          rsce.indicative_cost_sen,
          rsce.indicative_cost_rp,
          rsce.calculation_mode,
          tpr.asb_type
        FROM road_segment_cost_estimates rsce
        LEFT JOIN treatment_package_rules tpr ON rsce.rule_id = tpr.rule_id
        WHERE rsce.scenario_id = ?
        ORDER BY rsce.road_key ASC, rsce.segment_id ASC
      `)
      .all(scenarioId) as any[];

    // 5. Partition segments: eligible for optimization vs routine / manual review / unmapped
    const eligibleItems: SegmentOptimizationItem[] = [];
    const allSegmentsByRoad: Record<string, any[]> = {};

    for (const s of segEstimates) {
      if (!allSegmentsByRoad[s.road_key]) {
        allSegmentsByRoad[s.road_key] = [];
      }
      allSegmentsByRoad[s.road_key].push(s);

      const costSen = BigInt(s.indicative_cost_sen || 0);
      const isManualReview = s.calculation_mode === 'MANUAL_REVIEW_MODE' || (s.rule_id === null && s.matched_width_m > 5.0);
      const isRoutine = s.rule_id === 'R06' || s.asb_type === 'NONE' || costSen === 0n;

      if (!isManualReview && !isRoutine && costSen > 0n) {
        const sc = scoreMap.get(s.road_key) || { rank: 999, score: 0 };
        const lenKm = s.segment_length_m / 1000.0;
        const valA = sc.score * lenKm; // Priority-weighted length proxy
        const valB = lenKm;            // Length in km
        const valC = (351 - sc.rank) * 1000 + valA; // Priority-respecting hierarchical metric

        eligibleItems.push({
          segment_id: s.segment_id,
          road_key: s.road_key,
          rule_id: s.rule_id,
          asb_type: s.asb_type,
          segment_length_m: s.segment_length_m,
          road_width_m: s.matched_width_m,
          cost_sen: costSen,
          cost_rp: Number(costSen) / 100,
          priority_score: sc.score,
          priority_rank: sc.rank,
          value_priority_weighted: valA,
          value_max_length: valB,
          value_priority_respecting: valC,
        });
      }
    }

    // 6. Execute chosen solver
    let selectedIds = new Set<string>();
    let solverStatus: SolverStatus = 'FEASIBLE';
    let nodesExplored = 0;
    let optimalityGapPct = 0;
    const solverName = objective === 'GREEDY_BENCHMARK'
      ? 'Greedy Priority-Rank Order Benchmark'
      : objective === 'PRIORITY_RESPECTING'
      ? 'Lexicographic Hierarchical ILP Solver'
      : 'Martello-Toth Branch-and-Bound ILP Solver';

    if (objective === 'GREEDY_BENCHMARK') {
      // Benchmark: Greedy road-by-road allocation in strict priority rank order (Phase 2.1 Baseline)
      const sortedRoads = [...roads].sort((a, b) => {
        const ra = scoreMap.get(a.road_key)?.rank ?? 999;
        const rb = scoreMap.get(b.road_key)?.rank ?? 999;
        return ra - rb;
      });

      let currentAllocatedSen = 0n;
      for (const r of sortedRoads) {
        const roadSegs = (allSegmentsByRoad[r.road_key] || []).filter(
          (seg) => seg.indicative_cost_sen > 0 && seg.calculation_mode !== 'MANUAL_REVIEW_MODE'
        );
        const roadCostSen = roadSegs.reduce((sum, seg) => sum + BigInt(seg.indicative_cost_sen), 0n);

        if (roadCostSen > 0n) {
          if (currentAllocatedSen + roadCostSen <= ceilingSen) {
            currentAllocatedSen += roadCostSen;
            for (const seg of roadSegs) {
              selectedIds.add(seg.segment_id);
            }
          } else {
            // Strict priority prefix allocation: stop as soon as a road exceeds available ceiling
            break;
          }
        }
      }
      solverStatus = 'BENCHMARK_GREEDY';
      nodesExplored = sortedRoads.length;
      optimalityGapPct = 0;
    } else if (objective === 'PRIORITY_RESPECTING') {
      // Lexicographic Priority-Respecting Optimization:
      // Step 1: Fund entire top-priority roads in strict priority rank order as long as they fit.
      // Step 2: On the remaining budget, optimize via knapsack across remaining eligible segments!
      const sortedRoads = [...roads].sort((a, b) => {
        const ra = scoreMap.get(a.road_key)?.rank ?? 999;
        const rb = scoreMap.get(b.road_key)?.rank ?? 999;
        return ra - rb;
      });

      let currentAllocatedSen = 0n;
      const priorityFundedRoadKeys = new Set<string>();

      for (const r of sortedRoads) {
        const roadSegs = (allSegmentsByRoad[r.road_key] || []).filter(
          (seg) => seg.indicative_cost_sen > 0 && seg.calculation_mode !== 'MANUAL_REVIEW_MODE'
        );
        const roadCostSen = roadSegs.reduce((sum, seg) => sum + BigInt(seg.indicative_cost_sen), 0n);

        if (roadCostSen > 0n) {
          if (currentAllocatedSen + roadCostSen <= ceilingSen) {
            currentAllocatedSen += roadCostSen;
            priorityFundedRoadKeys.add(r.road_key);
            for (const seg of roadSegs) {
              selectedIds.add(seg.segment_id);
            }
          } else {
            break;
          }
        }
      }

      const remainingBudgetSen = ceilingSen - currentAllocatedSen;
      if (remainingBudgetSen > 0n) {
        const remainingItems = eligibleItems.filter((it) => !priorityFundedRoadKeys.has(it.road_key));
        if (remainingItems.length > 0) {
          const ilpRemaining = this.solveKnapsackILP(remainingItems, remainingBudgetSen, 'PRIORITY_WEIGHTED');
          for (const id of ilpRemaining.selectedIds) {
            selectedIds.add(id);
          }
          solverStatus = ilpRemaining.status;
          nodesExplored = sortedRoads.length + ilpRemaining.nodesExplored;
          optimalityGapPct = ilpRemaining.optimalityGapPct;
        } else {
          solverStatus = 'OPTIMAL';
          nodesExplored = sortedRoads.length;
          optimalityGapPct = 0;
        }
      } else {
        solverStatus = 'OPTIMAL';
        nodesExplored = sortedRoads.length;
        optimalityGapPct = 0;
      }
    } else {
      // Exact / High-Performance Mathematical ILP Solver (PRIORITY_WEIGHTED or MAX_LENGTH)
      const ilpResult = this.solveKnapsackILP(eligibleItems, ceilingSen, objective);
      selectedIds = ilpResult.selectedIds;
      solverStatus = ilpResult.status;
      nodesExplored = ilpResult.nodesExplored;
      optimalityGapPct = ilpResult.optimalityGapPct;
    }

    // 7. Aggregate Road-Level Allocations & Classify Operational Statuses
    let totalAllocatedSen = 0n;
    let totalTreatedLengthM = 0;
    let totalWeightedScore = 0;

    const roadAllocations: RoadOptimizationResult[] = [];

    // Pre-calculate road-level summaries
    for (const r of roads) {
      const segs = allSegmentsByRoad[r.road_key] || [];
      const totalSegs = segs.length;
      let treatedSegs = 0;
      let routineSegs = 0;
      let manualReviewSegs = 0;
      let treatedLenM = 0;
      let totalPaguSen = 0n;

      let roadAllocatedSegs = 0;
      let roadAllocatedLenM = 0;
      let roadAllocatedSen = 0n;

      for (const s of segs) {
        const costSen = BigInt(s.indicative_cost_sen || 0);
        const isManual = s.calculation_mode === 'MANUAL_REVIEW_MODE' || (s.rule_id === null && s.matched_width_m > 5.0);
        const isRoutine = s.rule_id === 'R06' || s.asb_type === 'NONE' || costSen === 0n;

        if (isManual) {
          manualReviewSegs++;
        } else if (!isRoutine && costSen > 0n) {
          treatedSegs++;
          treatedLenM += s.segment_length_m;
          totalPaguSen += costSen;

          if (selectedIds.has(s.segment_id)) {
            roadAllocatedSegs++;
            roadAllocatedLenM += s.segment_length_m;
            roadAllocatedSen += costSen;
          }
        } else {
          routineSegs++;
        }
      }

      totalAllocatedSen += roadAllocatedSen;
      totalTreatedLengthM += roadAllocatedLenM;

      const sc = scoreMap.get(r.road_key) || { rank: 999, score: 0 };
      if (roadAllocatedLenM > 0) {
        totalWeightedScore += sc.score * (roadAllocatedLenM / 1000.0);
      }

      // Classify Operational Status:
      let opStatus: RoadOperationalStatus = 'DEFERRED_BY_BUDGET';
      let rationale = '';

      if (totalPaguSen === 0n) {
        if (manualReviewSegs > 0) {
          opStatus = 'MANUAL_TECHNICAL_REVIEW';
          rationale = `Memerlukan review teknis / DED khusus karena memiliki ${manualReviewSegs} segmen berdimensi khusus (lebar > 5,0m). Pagu konstruksi diset Rp 0.`;
        } else if (routineSegs === totalSegs || totalSegs === 0) {
          opStatus = 'ROUTINE_MAINTENANCE';
          rationale = 'Seluruh segmen berkondisi Baik/Sedang sehingga hanya dialokasikan untuk pemeliharaan rutin preventif. Pagu konstruksi fisik mayor Rp 0.';
        } else {
          opStatus = 'NOT_ELIGIBLE';
          rationale = 'Segmen jalan tidak memenuhi kriteria penanganan standar R01-R06.';
        }
      } else {
        if (roadAllocatedSen > 0n) {
          opStatus = 'FUNDED_CONSTRUCTION';
          if (roadAllocatedSegs === treatedSegs) {
            rationale = `Terakomodasi penuh: seluruh ${treatedSegs} segmen rusak (${(treatedLenM / 1000).toFixed(2)} km) didanai pagu indikatif sebesar Rp ${(Number(roadAllocatedSen) / 100).toLocaleString('id-ID')}.`;
          } else {
            rationale = `Terakomodasi parsial: ${roadAllocatedSegs} dari ${treatedSegs} segmen rusak (${(roadAllocatedLenM / 1000).toFixed(2)} km) didanai sebesar Rp ${(Number(roadAllocatedSen) / 100).toLocaleString('id-ID')}.`;
          }
        } else {
          opStatus = 'DEFERRED_BY_BUDGET';
          rationale = `Tertunda karena keterbatasan pagu plafon anggaran (kebutuhan Rp ${(Number(totalPaguSen) / 100).toLocaleString('id-ID')} melampaui sisa alokasi optimasi).`;
        }
      }

      roadAllocations.push({
        road_key: r.road_key,
        road_name: r.display_name || r.canonical_name,
        district_name: r.district_name || 'HSS',
        priority_rank: sc.rank,
        composite_score: sc.score,
        length_official_km: Number(r.length_km_official),
        length_surveyed_km: segs.reduce((a, b) => a + (b.segment_length_m || 0), 0) / 1000.0,
        treated_length_km: treatedLenM / 1000.0,
        allocated_treated_length_km: roadAllocatedLenM / 1000.0,
        total_segments: totalSegs,
        treated_segments: treatedSegs,
        routine_segments: routineSegs,
        manual_review_segments: manualReviewSegs,
        allocated_treated_segments: roadAllocatedSegs,
        total_pagu_asb_rp: Number(totalPaguSen) / 100,
        total_pagu_asb_sen: totalPaguSen,
        allocated_pagu_rp: Number(roadAllocatedSen) / 100,
        allocated_pagu_sen: roadAllocatedSen,
        operational_status: opStatus,
        is_accommodated_in_queue: opStatus === 'FUNDED_CONSTRUCTION',
        allocation_rank: 0, // Assigned after sorting
        cumulative_cost_rp: 0,
        cumulative_cost_sen: 0n,
        selection_rationale: rationale,
      });
    }

    // Sort roads for display: Funded first (by priority rank), then routine maintenance (by rank), then manual review, then deferred (by rank)
    roadAllocations.sort((a, b) => {
      // 1. FUNDED_CONSTRUCTION first
      if (a.operational_status === 'FUNDED_CONSTRUCTION' && b.operational_status !== 'FUNDED_CONSTRUCTION') return -1;
      if (a.operational_status !== 'FUNDED_CONSTRUCTION' && b.operational_status === 'FUNDED_CONSTRUCTION') return 1;

      // 2. ROUTINE_MAINTENANCE second
      if (a.operational_status === 'ROUTINE_MAINTENANCE' && b.operational_status !== 'ROUTINE_MAINTENANCE') return -1;
      if (a.operational_status !== 'ROUTINE_MAINTENANCE' && b.operational_status === 'ROUTINE_MAINTENANCE') return 1;

      // 3. MANUAL_TECHNICAL_REVIEW third
      if (a.operational_status === 'MANUAL_TECHNICAL_REVIEW' && b.operational_status !== 'MANUAL_TECHNICAL_REVIEW') return -1;
      if (a.operational_status !== 'MANUAL_TECHNICAL_REVIEW' && b.operational_status === 'MANUAL_TECHNICAL_REVIEW') return 1;

      // 4. Default: by priority rank
      return a.priority_rank - b.priority_rank;
    });

    let runningCumSen = 0n;
    let rankCounter = 1;
    for (const ra of roadAllocations) {
      ra.allocation_rank = rankCounter++;
      runningCumSen += ra.allocated_pagu_sen;
      ra.cumulative_cost_sen = runningCumSen;
      ra.cumulative_cost_rp = Number(runningCumSen) / 100;
    }

    // Status counts
    let fundedCount = 0;
    let routineCount = 0;
    let manualCount = 0;
    let deferredCount = 0;
    let incompleteCount = 0;
    let notEligibleCount = 0;

    for (const ra of roadAllocations) {
      if (ra.operational_status === 'FUNDED_CONSTRUCTION') fundedCount++;
      else if (ra.operational_status === 'ROUTINE_MAINTENANCE') routineCount++;
      else if (ra.operational_status === 'MANUAL_TECHNICAL_REVIEW') manualCount++;
      else if (ra.operational_status === 'DEFERRED_BY_BUDGET') deferredCount++;
      else if (ra.operational_status === 'INCOMPLETE_ESTIMATE') incompleteCount++;
      else notEligibleCount++;
    }

    const duration = Date.now() - startTime;
    const remainingBudgetSen = ceilingSen >= totalAllocatedSen ? ceilingSen - totalAllocatedSen : 0n;

    const result: OptimizationRunResult = {
      scenario_id: scenarioId,
      objective_mode: objective,
      budget_ceiling_rp: ceilingRp,
      budget_ceiling_sen: ceilingSen,
      allocated_cost_rp: Number(totalAllocatedSen) / 100,
      allocated_cost_sen: totalAllocatedSen,
      remaining_budget_rp: Number(remainingBudgetSen) / 100,
      remaining_budget_sen: remainingBudgetSen,
      treated_length_km: Math.round((totalTreatedLengthM / 1000.0) * 100) / 100,
      priority_weighted_score: Math.round(totalWeightedScore * 10000) / 10000,
      selected_segments_count: selectedIds.size,
      solver_name: solverName,
      solver_status: solverStatus,
      nodes_explored: nodesExplored,
      optimality_gap_pct: optimalityGapPct,
      runtime_ms: duration,
      status_breakdown: {
        funded_construction_roads: fundedCount,
        routine_maintenance_roads: routineCount,
        manual_review_roads: manualCount,
        deferred_by_budget_roads: deferredCount,
        incomplete_estimate_roads: incompleteCount,
        not_eligible_roads: notEligibleCount,
        total_roads: roads.length,
      },
      planning_indicators: {
        existing_network_mantap_km: 392.89,
        existing_network_mantap_pct: 53.64,
        eligible_damaged_length_km: 336.29,
        selected_treatment_length_km: Math.round((totalTreatedLengthM / 1000.0) * 100) / 100,
        remaining_untreated_damaged_length_km: Math.max(0, Math.round((336.29 - (totalTreatedLengthM / 1000.0)) * 100) / 100),
        estimated_treatment_expenditure_rp: Number(totalAllocatedSen) / 100,
        disclaimer: 'Indikator Perencanaan Program — Bukan Prediksi Hasil Otomatis (Estimasi Makro Indikatif Tanpa Model Transisi Kondisi Pasca-Konstruksi).',
      },
      selected_segment_ids: Array.from(selectedIds),
      road_allocations: roadAllocations,
    };

    return result;
  }

  /**
   * Persist optimization result into database scenario and snapshot tables.
   */
  public persistOptimizationResult(result: OptimizationRunResult): void {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Update budget_scenarios table
      this.db
        .prepare(`
          UPDATE budget_scenarios
          SET budget_ceiling_rp = ?,
              budget_ceiling_sen = ?,
              allocated_cost_rp = ?,
              allocated_cost_sen = ?,
              allocation_strategy = ?,
              optimization_objective = ?,
              solver_status = ?,
              solver_nodes = ?,
              solver_gap_pct = ?,
              solver_runtime_ms = ?,
              treated_length_km = ?,
              priority_weighted_score = ?,
              funded_construction_roads = ?,
              routine_maintenance_roads = ?,
              manual_review_roads = ?,
              updated_at = datetime('now')
          WHERE scenario_id = ?;
        `)
        .run(
          result.budget_ceiling_rp,
          Number(result.budget_ceiling_sen),
          result.allocated_cost_rp,
          Number(result.allocated_cost_sen),
          result.objective_mode,
          result.objective_mode,
          result.solver_status,
          result.nodes_explored,
          result.optimality_gap_pct,
          result.runtime_ms,
          result.treated_length_km,
          result.priority_weighted_score,
          result.status_breakdown.funded_construction_roads,
          result.status_breakdown.routine_maintenance_roads,
          result.status_breakdown.manual_review_roads,
          result.scenario_id
        );

      // 2. Update is_selected and selection_status in road_segment_cost_estimates
      const selectedSet = new Set(result.selected_segment_ids);
      const updateSegStmt = this.db.prepare(`
        UPDATE road_segment_cost_estimates
        SET is_selected = ?,
            selection_status = ?
        WHERE scenario_id = ? AND segment_id = ?;
      `);

      const allSegs = this.db
        .prepare(`
          SELECT segment_id, indicative_cost_sen, calculation_mode, rule_id
          FROM road_segment_cost_estimates
          WHERE scenario_id = ?
        `)
        .all(result.scenario_id) as any[];

      for (const seg of allSegs) {
        const isSel = selectedSet.has(seg.segment_id) ? 1 : 0;
        let status = 'DEFERRED_BY_BUDGET';
        if (isSel === 1) {
          status = 'SELECTED_CONSTRUCTION';
        } else if (seg.calculation_mode === 'MANUAL_REVIEW_MODE') {
          status = 'EXCLUDED_MANUAL_REVIEW';
        } else if (seg.rule_id === 'R06' || seg.indicative_cost_sen === 0) {
          status = 'ROUTINE_MAINTENANCE';
        }

        updateSegStmt.run(isSel, status, result.scenario_id, seg.segment_id);
      }

      // 3. Update road_cost_summaries table
      const updateRcsStmt = this.db.prepare(`
        UPDATE road_cost_summaries
        SET is_funded = ?,
            operational_status = ?,
            allocated_pagu_rp = ?,
            allocated_pagu_sen = ?,
            allocated_treated_segments = ?,
            allocated_treated_length_km = ?,
            allocation_rank = ?,
            cumulative_cost_rp = ?,
            cumulative_cost_sen = ?,
            status_summary = ?,
            selection_rationale = ?
        WHERE scenario_id = ? AND road_key = ?;
      `);

      for (const ra of result.road_allocations) {
        const isFunded = ra.operational_status === 'FUNDED_CONSTRUCTION' ? 1 : 0;
        updateRcsStmt.run(
          isFunded,
          ra.operational_status,
          ra.allocated_pagu_rp,
          Number(ra.allocated_pagu_sen),
          ra.allocated_treated_segments,
          ra.allocated_treated_length_km,
          ra.allocation_rank,
          ra.cumulative_cost_rp,
          Number(ra.cumulative_cost_sen),
          isFunded === 1 ? 'PROPOSED_FUNDED' : 'DEFERRED_BY_BUDGET',
          ra.selection_rationale,
          result.scenario_id,
          ra.road_key
        );
      }

      // 4. Record snapshot into scenario_optimizations
      const optId = `OPT-${result.scenario_id}-${result.objective_mode}-${Date.now()}`;
      this.db
        .prepare(`
          INSERT INTO scenario_optimizations (
            optimization_id,
            scenario_id,
            budget_ceiling_rp,
            budget_ceiling_sen,
            objective_mode,
            solver_name,
            solver_status,
            nodes_explored,
            optimality_gap_pct,
            runtime_ms,
            total_cost_rp,
            total_cost_sen,
            remaining_budget_rp,
            treated_length_km,
            priority_weighted_score,
            selected_segments_count,
            funded_construction_count,
            routine_maintenance_count,
            manual_review_count,
            deferred_count,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
        `)
        .run(
          optId,
          result.scenario_id,
          result.budget_ceiling_rp,
          Number(result.budget_ceiling_sen),
          result.objective_mode,
          result.solver_name,
          result.solver_status,
          result.nodes_explored,
          result.optimality_gap_pct,
          result.runtime_ms,
          result.allocated_cost_rp,
          Number(result.allocated_cost_sen),
          result.remaining_budget_rp,
          result.treated_length_km,
          result.priority_weighted_score,
          result.selected_segments_count,
          result.status_breakdown.funded_construction_roads,
          result.status_breakdown.routine_maintenance_roads,
          result.status_breakdown.manual_review_roads,
          result.status_breakdown.deferred_by_budget_roads
        );

      this.db.exec('COMMIT;');
    } catch (err: any) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Compare all 4 allocation methods side-by-side for a specific scenario and ceiling.
   */
  public compareAllMethods(
    scenarioId: string,
    ceilingRp?: number
  ): {
    ceilingRp: number;
    current_objective: string;
    comparison: any[];
    methods: Record<OptimizationObjective, OptimizationRunResult>;
    comparativeAnalysis: string;
  } {
    const scn = this.db.prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?').get(scenarioId) as any;
    const targetCeiling = ceilingRp !== undefined ? ceilingRp : Number(scn?.budget_ceiling_rp || 50000000000);

    const greedy = this.runOptimization(scenarioId, 'GREEDY_BENCHMARK', targetCeiling);
    const prioWeighted = this.runOptimization(scenarioId, 'PRIORITY_WEIGHTED', targetCeiling);
    const maxLength = this.runOptimization(scenarioId, 'MAX_LENGTH', targetCeiling);
    const prioRespecting = this.runOptimization(scenarioId, 'PRIORITY_RESPECTING', targetCeiling);

    let analysis = `Komparasi Alokasi Pagu Rp ${(targetCeiling / 1e9).toFixed(0)} Miliar:\n`;
    analysis += `- Greedy Prioritas (Benchmark Phase 2.1) mengalokasikan Rp ${greedy.allocated_cost_rp.toLocaleString('id-ID')} dengan panjang ${greedy.treated_length_km.toFixed(2)} km pada ${greedy.status_breakdown.funded_construction_roads} ruas konstruksi.\n`;
    analysis += `- Optimasi Matematis Objektif A (Cakupan Prioritas) memaksimalkan penyerapan plafon hingga Rp ${prioWeighted.allocated_cost_rp.toLocaleString('id-ID')} (panjang: ${prioWeighted.treated_length_km.toFixed(2)} km, skor tertimbang: ${prioWeighted.priority_weighted_score.toFixed(4)}).\n`;
    analysis += `- Optimasi Matematis Objektif B (Panjang Maksimal) menghasilkan panjang penanganan fisik terbesar yaitu ${maxLength.treated_length_km.toFixed(2)} km (+${(maxLength.treated_length_km - greedy.treated_length_km).toFixed(2)} km dibanding Greedy).\n`;
    analysis += `- Optimasi Taat Prioritas (Priority-Respecting) menyeimbangkan kepatuhan urutan prioritas AHP/WSM dengan efisiensi penganggaran (${prioRespecting.treated_length_km.toFixed(2)} km, ${prioRespecting.status_breakdown.funded_construction_roads} ruas).`;

    const comparisonList = [
      {
        optimization_objective: 'GREEDY_BENCHMARK',
        budget_ceiling_rp: greedy.budget_ceiling_rp,
        allocated_cost_rp: greedy.allocated_cost_rp,
        remaining_ceiling_rp: greedy.remaining_budget_rp,
        allocated_treated_length_km: greedy.treated_length_km,
        priority_weighted_score: greedy.priority_weighted_score,
        funded_construction_roads: greedy.status_breakdown.funded_construction_roads,
        routine_maintenance_roads: greedy.status_breakdown.routine_maintenance_roads,
        manual_review_roads: greedy.status_breakdown.manual_review_roads,
        solver_status: greedy.solver_status,
        solver_runtime_ms: greedy.runtime_ms,
        optimality_gap_pct: greedy.optimality_gap_pct,
      },
      {
        optimization_objective: 'PRIORITY_WEIGHTED',
        budget_ceiling_rp: prioWeighted.budget_ceiling_rp,
        allocated_cost_rp: prioWeighted.allocated_cost_rp,
        remaining_ceiling_rp: prioWeighted.remaining_budget_rp,
        allocated_treated_length_km: prioWeighted.treated_length_km,
        priority_weighted_score: prioWeighted.priority_weighted_score,
        funded_construction_roads: prioWeighted.status_breakdown.funded_construction_roads,
        routine_maintenance_roads: prioWeighted.status_breakdown.routine_maintenance_roads,
        manual_review_roads: prioWeighted.status_breakdown.manual_review_roads,
        solver_status: prioWeighted.solver_status,
        solver_runtime_ms: prioWeighted.runtime_ms,
        optimality_gap_pct: prioWeighted.optimality_gap_pct,
      },
      {
        optimization_objective: 'MAX_LENGTH',
        budget_ceiling_rp: maxLength.budget_ceiling_rp,
        allocated_cost_rp: maxLength.allocated_cost_rp,
        remaining_ceiling_rp: maxLength.remaining_budget_rp,
        allocated_treated_length_km: maxLength.treated_length_km,
        priority_weighted_score: maxLength.priority_weighted_score,
        funded_construction_roads: maxLength.status_breakdown.funded_construction_roads,
        routine_maintenance_roads: maxLength.status_breakdown.routine_maintenance_roads,
        manual_review_roads: maxLength.status_breakdown.manual_review_roads,
        solver_status: maxLength.solver_status,
        solver_runtime_ms: maxLength.runtime_ms,
        optimality_gap_pct: maxLength.optimality_gap_pct,
      },
      {
        optimization_objective: 'PRIORITY_RESPECTING',
        budget_ceiling_rp: prioRespecting.budget_ceiling_rp,
        allocated_cost_rp: prioRespecting.allocated_cost_rp,
        remaining_ceiling_rp: prioRespecting.remaining_budget_rp,
        allocated_treated_length_km: prioRespecting.treated_length_km,
        priority_weighted_score: prioRespecting.priority_weighted_score,
        funded_construction_roads: prioRespecting.status_breakdown.funded_construction_roads,
        routine_maintenance_roads: prioRespecting.status_breakdown.routine_maintenance_roads,
        manual_review_roads: prioRespecting.status_breakdown.manual_review_roads,
        solver_status: prioRespecting.solver_status,
        solver_runtime_ms: prioRespecting.runtime_ms,
        optimality_gap_pct: prioRespecting.optimality_gap_pct,
      },
    ];

    return {
      ceilingRp: targetCeiling,
      current_objective: scn?.optimization_objective || 'PRIORITY_WEIGHTED',
      comparison: comparisonList,
      methods: {
        GREEDY_BENCHMARK: greedy,
        PRIORITY_WEIGHTED: prioWeighted,
        MAX_LENGTH: maxLength,
        PRIORITY_RESPECTING: prioRespecting,
      },
      comparativeAnalysis: analysis,
    };
  }

  /**
   * Internal Exact 0-1 Knapsack / Martello-Toth ILP Solver
   */
  private solveKnapsackILP(
    items: SegmentOptimizationItem[],
    budgetSen: bigint,
    objective: 'PRIORITY_WEIGHTED' | 'MAX_LENGTH' | 'PRIORITY_RESPECTING'
  ): {
    selectedIds: Set<string>;
    status: SolverStatus;
    nodesExplored: number;
    optimalityGapPct: number;
  } {
    const timeLimitMs = 3000;
    const nodeLimit = 150000;
    const startTime = Date.now();

    // 1. Prepare elements with specific objective values
    const elements = items.map((it) => {
      let val = it.value_priority_weighted;
      if (objective === 'MAX_LENGTH') val = it.value_max_length;
      if (objective === 'PRIORITY_RESPECTING') val = it.value_priority_respecting;

      const cSen = it.cost_sen;
      const cRp = Number(cSen) / 100;
      const eff = cRp > 0 ? val / cRp : 0;
      return { it, val, cSen, eff };
    });

    // 2. Sort descending by efficiency, secondary by cost descending
    elements.sort((a, b) => {
      if (Math.abs(b.eff - a.eff) > 1e-12) return b.eff - a.eff;
      if (b.cSen > a.cSen) return 1;
      if (b.cSen < a.cSen) return -1;
      return 0;
    });

    const n = elements.length;

    // Prefix sums for quick O(1) LP upper bounding
    const prefCost = new BigInt64Array(n + 1);
    const prefVal = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      prefCost[i + 1] = prefCost[i] + elements[i].cSen;
      prefVal[i + 1] = prefVal[i] + elements[i].val;
    }

    function lpBound(fromIdx: number, curCost: bigint, curVal: number): number {
      const rem = budgetSen - curCost;
      if (rem <= 0n) return curVal;
      if (fromIdx >= n) return curVal;

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

      const addedVal = prefVal[b] - prefVal[fromIdx];
      let bound = curVal + addedVal;
      const finalRem = rem - (prefCost[b] - prefCost[fromIdx]);

      if (b < n && finalRem > 0n && elements[b].cSen > 0n) {
        bound += elements[b].val * (Number(finalRem) / Number(elements[b].cSen));
      }
      return bound;
    }

    const globalUB = lpBound(0, 0n, 0);

    // Initial greedy lower bound
    let bestVal = 0;
    const bestSelected = new Uint8Array(n);
    const curSelected = new Uint8Array(n);

    let gCost = 0n;
    for (let i = 0; i < n; i++) {
      if (gCost + elements[i].cSen <= budgetSen) {
        gCost += elements[i].cSen;
        bestVal += elements[i].val;
        bestSelected[i] = 1;
      }
    }

    // Branch and Bound search
    let nodes = 0;
    let timedOut = false;

    function dfs(idx: number, curCost: bigint, curVal: number) {
      nodes++;

      if (curVal > bestVal) {
        bestVal = curVal;
        bestSelected.set(curSelected);
      }

      if (idx >= n) return;

      if ((nodes & 4095) === 0) {
        if (Date.now() - startTime > timeLimitMs || nodes >= nodeLimit) {
          timedOut = true;
          return;
        }
      }

      const ub = lpBound(idx, curCost, curVal);
      if (ub <= bestVal + 1e-9) {
        return; // PRUNED
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

    const selectedIds = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (bestSelected[i] === 1) {
        selectedIds.add(elements[i].it.segment_id);
      }
    }

    const gap = timedOut
      ? (globalUB > 0 ? Math.max(0, ((globalUB - bestVal) / globalUB) * 100) : 0)
      : 0.0;
    const status: SolverStatus = selectedIds.size === 0
      ? (budgetSen < 100000000n ? 'INFEASIBLE' : (!timedOut ? 'OPTIMAL' : 'FEASIBLE'))
      : (!timedOut ? 'OPTIMAL' : 'FEASIBLE');

    return {
      selectedIds,
      status,
      nodesExplored: nodes,
      optimalityGapPct: Math.round(gap * 10000) / 10000,
    };
  }
}
