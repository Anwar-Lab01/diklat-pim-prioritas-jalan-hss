import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { CostingReferenceService } from './costingReferenceService.ts';
import {
  OptimizationEngine,
  type OptimizationObjective,
  type OptimizationRunResult,
  type RoadOperationalStatus,
} from './optimizationEngine.ts';

export interface EvaluatedSegmentResult {
  segment_id: string;
  road_key: string;
  sta_start_m: number;
  sta_end_m: number;
  segment_length_m: number;
  road_width_m: number;
  dominant_condition: string;
  surface_type: string;
  segment_status: string;
  recommended_treatment: string;
  // Rule Evaluation
  rule_id: string;
  rule_label: string;
  rule_priority: number;
  asb_type: string;
  structural_profile: string;
  selection_rationale: string;
  // ASB Matching
  asb_id: string | null;
  package_name: string | null;
  unit: string | null;
  matched_width_m: number;
  matched_surface: string;
  unit_price_rp: number;
  unit_price_sen: number;
  // Quantity & Cost
  quantity: number;
  calculation_mode: string;
  indicative_cost_rp: number;
  indicative_cost_sen: number;
  calculation_formula: string;
  // Status & Traceability
  status: 'READY' | 'INCOMPLETE_DATA' | 'UNMAPPED' | 'NO_MATCHING_RULE' | 'MANUAL_REVIEW_WIDTH_EXCEEDED';
  adjustment_flags: string[];
}

export interface RoadCostSummaryRow {
  road_key: string;
  road_name: string;
  district_name: string;
  priority_rank: number | null;
  composite_score: number | null;
  dominant_rule_id: string;
  dominant_asb_type: string;
  total_segments: number;
  treated_segments: number;
  routine_segments: number;
  manual_review_segments?: number;
  total_length_km: number;
  treated_length_km: number;
  manual_review_length_km?: number;
  total_pagu_asb_rp: number;
  total_pagu_asb_sen: number;
  is_funded: number;
  allocation_rank: number;
  cumulative_cost_rp: number;
  cumulative_cost_sen: number;
  status_summary: string;
  operational_status?: RoadOperationalStatus;
  allocated_pagu_rp?: number;
  allocated_pagu_sen?: number;
  allocated_treated_segments?: number;
  allocated_treated_length_km?: number;
  selection_rationale?: string;
}

export interface ScenarioDetailSummary {
  scenario_id: string;
  scenario_code: string;
  scenario_name: string;
  budget_year: number;
  description: string | null;
  scenario_status: string;
  budget_ceiling_rp: number;
  budget_ceiling_sen: number;
  total_cost_rp: number;
  total_cost_sen: number;
  allocated_cost_rp: number;
  allocated_cost_sen: number;
  allocation_strategy: string;
  optimization_objective?: string;
  solver_status?: string;
  solver_nodes?: number;
  solver_gap_pct?: number;
  solver_runtime_ms?: number;
  total_roads: number;
  funded_roads: number;
  deferred_roads: number;
  funded_construction_roads?: number;
  routine_maintenance_roads?: number;
  manual_review_roads?: number;
  total_segments: number;
  treated_segments: number;
  routine_segments: number;
  manual_review_segments: number;
  standardized_treated_segments: number;
  treated_length_km: number;
  manual_review_length_km: number;
  priority_weighted_score?: number;
  asb_type_breakdown: Record<string, { segments: number; cost_rp: number; cost_sen: number; length_km: number }>;
  status_breakdown?: {
    funded_construction_roads: number;
    routine_maintenance_roads: number;
    manual_review_roads: number;
    deferred_by_budget_roads: number;
    total_roads: number;
  };
  planning_indicators?: {
    existing_network_mantap_km: number;
    existing_network_mantap_pct: number;
    eligible_damaged_length_km: number;
    selected_treatment_length_km: number;
    remaining_untreated_damaged_length_km: number;
    estimated_treatment_expenditure_rp: number;
    disclaimer: string;
  };
}

export class TreatmentCostingEngine {
  private db: DatabaseSync;
  private costingRefService: CostingReferenceService;
  private optimizationEngine: OptimizationEngine;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.costingRefService = new CostingReferenceService(this.db);
    this.optimizationEngine = new OptimizationEngine(this.db);
  }

  /**
   * Preload candidate ASB road packages grouped by Type (A, B, C, D)
   */
  private loadASBCandidates(): Record<string, any[]> {
    const rows = this.db.prepare(`
      SELECT asb_id, package_name, road_width_m, surface_type, unit, unit_price_rp, unit_price_sen
      FROM master_asb_items
      WHERE item_category = 'Jalan Kabupaten' AND is_active = 1
      ORDER BY road_width_m ASC, unit_price_rp ASC
    `).all() as any[];

    const grouped: Record<string, any[]> = { A: [], B: [], C: [], D: [] };
    for (const r of rows) {
      const match = (r.package_name || '').match(/Jalan Tipe ([A-Z])/i);
      if (match) {
        const typeLetter = match[1].toUpperCase();
        if (grouped[typeLetter]) {
          grouped[typeLetter].push(r);
        }
      }
    }
    return grouped;
  }

  /**
   * Evaluate a single segment against rules R01..R06 and match ASB
   */
  public evaluateSegment(
    seg: any,
    roadCondition?: any,
    asbCandidates?: Record<string, any[]>
  ): EvaluatedSegmentResult {
    const candidateGroups = asbCandidates || this.loadASBCandidates();
    const cond = roadCondition || {};
    const isUnpaved = seg.surface_type === 'Tanah' || seg.surface_type === 'Kerikil';
    const segmentLengthM = Number(seg.segment_length_m) || 0;
    const roadWidthM = Number(seg.road_width_m) || 3.5;

    // Check data completeness
    if (!seg.segment_id || !seg.road_key || segmentLengthM <= 0) {
      return {
        segment_id: seg.segment_id || 'UNKNOWN',
        road_key: seg.road_key || 'UNKNOWN',
        sta_start_m: Number(seg.sta_start_m) || 0,
        sta_end_m: Number(seg.sta_end_m) || 0,
        segment_length_m: segmentLengthM,
        road_width_m: roadWidthM,
        dominant_condition: seg.dominant_condition || 'N/A',
        surface_type: seg.surface_type || 'N/A',
        segment_status: seg.segment_status || 'N/A',
        recommended_treatment: seg.recommended_treatment || 'N/A',
        rule_id: 'INCOMPLETE_DATA',
        rule_label: 'Data Segmen Tidak Lengkap',
        rule_priority: 99,
        asb_type: 'NONE',
        structural_profile: 'none',
        selection_rationale: 'Parameter wajib (panjang/identitas segmen) tidak valid atau 0.',
        asb_id: null,
        package_name: null,
        unit: null,
        matched_width_m: roadWidthM,
        matched_surface: seg.surface_type || 'Unknown',
        unit_price_rp: 0,
        unit_price_sen: 0,
        quantity: 0,
        calculation_mode: 'FULL_SEGMENT_MODE',
        indicative_cost_rp: 0,
        indicative_cost_sen: 0,
        calculation_formula: 'N/A',
        status: 'INCOMPLETE_DATA',
        adjustment_flags: ['missing_segment_parameters']
      };
    }

    // Determine Rule ID
    let ruleId = 'R06';
    let ruleLabel = 'Kondisi Baik / Mantap (Pemeliharaan Rutin)';
    let rulePriority = 6;
    let asbType = 'NONE';
    let structuralProfile = 'no_major_asb_package';
    let rationale = '';

    if (seg.dominant_condition === 'baik' || seg.dominant_condition === 'sedang') {
      ruleId = 'R06';
      ruleLabel = 'Kondisi Baik / Mantap';
      rulePriority = 6;
      asbType = 'NONE';
      structuralProfile = 'no_major_asb_package';
      rationale = `Kondisi fisik segmen mantap (${seg.dominant_condition}). Cukup dialokasikan untuk pemeliharaan rutin tanpa paket rekonstruksi struktural besar.`;
    } else {
      const unpavedPct = isUnpaved ? 100 : 0;
      const nonMantapPct = cond ? Number(cond.tidak_mantap_pct) || 0 : 100;
      const rusakBeratPct = cond ? Number(cond.rusak_berat_pct) || 0 : 0;

      if (unpavedPct >= 50 || (nonMantapPct >= 40 && rusakBeratPct >= 20)) {
        ruleId = 'R01';
        ruleLabel = 'Kerusakan Struktural Berat / Belum Beraspal';
        rulePriority = 1;
        asbType = 'D';
        structuralProfile = 'base_subbase_fill';
        rationale = isUnpaved
          ? `Permukaan segmen berupa ${seg.surface_type} (belum beraspal / jalan tanah/kerikil). Memerlukan paket peningkatan struktural lapis pondasi lengkap plus timbunan pilihan (Tipe D).`
          : `Koridor ruas mengalami kerusakan berat kritis (Non-Mantap: ${nonMantapPct.toFixed(1)}%, Rusak Berat: ${rusakBeratPct.toFixed(1)}%). Memerlukan paket rekonstruksi lapis fondasi dan timbunan (Tipe D).`;
      } else if (nonMantapPct >= 40) {
        ruleId = 'R02';
        ruleLabel = 'Kerusakan Berat Tanpa Timbunan';
        rulePriority = 2;
        asbType = 'C';
        structuralProfile = 'base_plus_subbase';
        rationale = `Kondisi Non-Mantap koridor ruas tinggi (${nonMantapPct.toFixed(1)}% >= 40%). Memerlukan paket rekonstruksi lapis pondasi atas dan bawah (Tipe C) tanpa timbunan tebal.`;
      } else if (nonMantapPct >= 25 && rusakBeratPct >= 10) {
        ruleId = 'R03';
        ruleLabel = 'Kerusakan Sedang-Berat (Komponen Rusak Berat)';
        rulePriority = 3;
        asbType = 'C';
        structuralProfile = 'base_plus_subbase';
        rationale = `Koridor ruas mengalami kerusakan sedang-berat signifikan dengan komponen rusak berat (Non-Mantap: ${nonMantapPct.toFixed(1)}%, Rusak Berat: ${rusakBeratPct.toFixed(1)}%). Memerlukan rekonstruksi LPA + LPB (Tipe C).`;
      } else if (nonMantapPct >= 25 && rusakBeratPct < 10) {
        ruleId = 'R04';
        ruleLabel = 'Kerusakan Sedang';
        rulePriority = 4;
        asbType = 'B';
        structuralProfile = 'base_course';
        rationale = `Kerusakan sedang dominan tanpa kerusakan berat masif (Non-Mantap: ${nonMantapPct.toFixed(1)}%, Rusak Berat: ${rusakBeratPct.toFixed(1)}% < 10%). Memerlukan perbaikan lapis fondasi atas LPA dan aspal baru (Tipe B).`;
      } else if (nonMantapPct >= 10 && nonMantapPct < 25) {
        ruleId = 'R05';
        ruleLabel = 'Kerusakan Ringan';
        rulePriority = 5;
        asbType = 'A';
        structuralProfile = 'surface_only';
        rationale = `Kerusakan permukaan ringan (Non-Mantap: ${nonMantapPct.toFixed(1)}% di antara 10% - 25%). Memerlukan pelapisan ulang permukaan aspal / overlay (Tipe A).`;
      } else {
        ruleId = 'R06';
        ruleLabel = 'Kondisi Baik / Mantap';
        rulePriority = 6;
        asbType = 'NONE';
        structuralProfile = 'no_major_asb_package';
        rationale = `Tingkat kerusakan koridor rendah (< 10%). Pemeliharaan rutin standar.`;
      }
    }

    // Handle Type NONE (Routine Maintenance)
    if (asbType === 'NONE') {
      return {
        segment_id: seg.segment_id,
        road_key: seg.road_key,
        sta_start_m: Number(seg.sta_start_m),
        sta_end_m: Number(seg.sta_end_m),
        segment_length_m: segmentLengthM,
        road_width_m: roadWidthM,
        dominant_condition: seg.dominant_condition,
        surface_type: seg.surface_type,
        segment_status: seg.segment_status,
        recommended_treatment: seg.recommended_treatment,
        rule_id: ruleId,
        rule_label: ruleLabel,
        rule_priority: rulePriority,
        asb_type: asbType,
        structural_profile: structuralProfile,
        selection_rationale: rationale,
        asb_id: null,
        package_name: 'Pemeliharaan Rutin (Non-ASB Fisik Rekonstruksi)',
        unit: 'Meter',
        matched_width_m: roadWidthM,
        matched_surface: seg.surface_type,
        unit_price_rp: 0,
        unit_price_sen: 0,
        quantity: segmentLengthM,
        calculation_mode: 'FULL_SEGMENT_MODE',
        indicative_cost_rp: 0,
        indicative_cost_sen: 0,
        calculation_formula: 'Pagu Konstruksi Fisik Mayor = 0 (Pemeliharaan Rutin Terbina)',
        status: 'READY',
        adjustment_flags: []
      };
    }

    // Match ASB item for Type A, B, C, D
    const candidates = candidateGroups[asbType] || [];
    if (candidates.length === 0) {
      return {
        segment_id: seg.segment_id,
        road_key: seg.road_key,
        sta_start_m: Number(seg.sta_start_m),
        sta_end_m: Number(seg.sta_end_m),
        segment_length_m: segmentLengthM,
        road_width_m: roadWidthM,
        dominant_condition: seg.dominant_condition,
        surface_type: seg.surface_type,
        segment_status: seg.segment_status,
        recommended_treatment: seg.recommended_treatment,
        rule_id: ruleId,
        rule_label: ruleLabel,
        rule_priority: rulePriority,
        asb_type: asbType,
        structural_profile: structuralProfile,
        selection_rationale: rationale,
        asb_id: null,
        package_name: null,
        unit: null,
        matched_width_m: roadWidthM,
        matched_surface: seg.surface_type,
        unit_price_rp: 0,
        unit_price_sen: 0,
        quantity: segmentLengthM,
        calculation_mode: 'FULL_SEGMENT_MODE',
        indicative_cost_rp: 0,
        indicative_cost_sen: 0,
        calculation_formula: 'N/A',
        status: 'UNMAPPED',
        adjustment_flags: ['no_asb_candidates_found_for_type']
      };
    }

    const flags: string[] = [];

    // Width matching: round up nearest within ASB Kabupaten standard (3.0m - 5.0m)
    const matchedWidthCandidates = candidates.filter(i => (i.road_width_m || 0) >= roadWidthM);
    if (matchedWidthCandidates.length === 0) {
      // Width exceeds all available ASB packages (> 5.0m).
      // Under Phase 2.1 financial reconciliation, do NOT extrapolate or snap to 5.0m.
      // Exclude from definitive standardized ASB totals with explicit status MANUAL_REVIEW_WIDTH_EXCEEDED.
      return {
        segment_id: seg.segment_id,
        road_key: seg.road_key,
        sta_start_m: Number(seg.sta_start_m),
        sta_end_m: Number(seg.sta_end_m),
        segment_length_m: segmentLengthM,
        road_width_m: roadWidthM,
        dominant_condition: seg.dominant_condition,
        surface_type: seg.surface_type,
        segment_status: seg.segment_status,
        recommended_treatment: seg.recommended_treatment,
        rule_id: ruleId,
        rule_label: ruleLabel,
        rule_priority: rulePriority,
        asb_type: asbType,
        structural_profile: structuralProfile,
        selection_rationale: `${rationale} [PERHATIAN: Lebar eksisting ${roadWidthM}m melampaui batas maksimal standar ASB Jalan Kabupaten (maks. 5,0m). Estimasi biaya ditiadakan (Rp 0) untuk review teknis manual/DED khusus agar tidak terjadi distorsi anggaran].`,
        asb_id: null,
        package_name: `Penanganan Khusus (Lebar ${roadWidthM}m > 5,0m Butuh Review Manual/DED)`,
        unit: 'Meter',
        matched_width_m: roadWidthM,
        matched_surface: seg.surface_type,
        unit_price_rp: 0,
        unit_price_sen: 0,
        quantity: segmentLengthM,
        calculation_mode: 'MANUAL_REVIEW_MODE',
        indicative_cost_rp: 0,
        indicative_cost_sen: 0,
        calculation_formula: `Pagu ASB = Rp 0 (Memerlukan Review Teknis / DED Manual karena Lebar ${roadWidthM}m > 5,0m Batas Maksimal ASB)`,
        status: 'MANUAL_REVIEW_WIDTH_EXCEEDED',
        adjustment_flags: ['MANUAL_REVIEW_WIDTH_EXCEEDED', 'UNSUPPORTED_WIDTH_EXTRAPOLATION_EXCLUDED']
      };
    }

    if (roadWidthM < 3.0) {
      flags.push('MINIMUM_WIDTH_SNAP_3M');
    }

    const selectedWidth = matchedWidthCandidates[0].road_width_m;
    const sameWidthCandidates = matchedWidthCandidates.filter(i => i.road_width_m === selectedWidth);

    // Surface preference matching
    const prefSurface = asbType === 'A' ? 'HRS-WC' : 'HRS-Base';
    let surfaceCandidates = sameWidthCandidates.filter(i => i.surface_type === prefSurface);
    if (surfaceCandidates.length === 0) {
      surfaceCandidates = sameWidthCandidates;
      flags.push('SURFACE_FALLBACK_USED');
    }

    const selectedASB = surfaceCandidates[0];

    // Fixed-point integer sen calculation
    const unitPriceSen = Number(selectedASB.unit_price_sen);
    const unitPriceRp = Number(selectedASB.unit_price_rp);
    const indicativeCostSen = BigInt(unitPriceSen) * BigInt(Math.round(segmentLengthM));
    const indicativeCostRp = Number(indicativeCostSen) / 100;
    const formulaStr = `${segmentLengthM} m × Rp ${unitPriceRp.toLocaleString('id-ID')} / m = Rp ${indicativeCostRp.toLocaleString('id-ID')}`;

    return {
      segment_id: seg.segment_id,
      road_key: seg.road_key,
      sta_start_m: Number(seg.sta_start_m),
      sta_end_m: Number(seg.sta_end_m),
      segment_length_m: segmentLengthM,
      road_width_m: roadWidthM,
      dominant_condition: seg.dominant_condition,
      surface_type: seg.surface_type,
      segment_status: seg.segment_status,
      recommended_treatment: seg.recommended_treatment,
      rule_id: ruleId,
      rule_label: ruleLabel,
      rule_priority: rulePriority,
      asb_type: asbType,
      structural_profile: structuralProfile,
      selection_rationale: rationale,
      asb_id: selectedASB.asb_id,
      package_name: selectedASB.package_name,
      unit: selectedASB.unit,
      matched_width_m: selectedASB.road_width_m,
      matched_surface: selectedASB.surface_type,
      unit_price_rp: unitPriceRp,
      unit_price_sen: unitPriceSen,
      quantity: segmentLengthM,
      calculation_mode: 'FULL_SEGMENT_MODE',
      indicative_cost_rp: indicativeCostRp,
      indicative_cost_sen: Number(indicativeCostSen),
      calculation_formula: formulaStr,
      status: 'READY',
      adjustment_flags: flags
    };
  }

  /**
   * Run full costing engine on all 7,487 segments for a budget scenario and persist results.
   */
  public calculateAndPersistScenario(scenarioId: string): ScenarioDetailSummary {
    const scenario = this.costingRefService.getScenarioById(scenarioId);
    if (!scenario) {
      throw new Error(`SCENARIO_NOT_FOUND: Scenario with id '${scenarioId}' does not exist.`);
    }

    const budgetYear = scenario.budget_year;
    const budgetCeilingSen = BigInt((scenario as any).budget_ceiling_sen || 5000000000000); // Rp 50 Miliar default

    const asbCandidates = this.loadASBCandidates();

    // Load road conditions for survey year
    const roadConditions = this.db.prepare(`
      SELECT road_key, tidak_mantap_pct, rusak_berat_pct, rusak_ringan_pct, baik_pct, sedang_pct, total_panjang_km
      FROM road_conditions
      WHERE survey_year = 2025
    `).all() as any[];

    const roadCondMap = new Map<string, any>();
    for (const rc of roadConditions) {
      roadCondMap.set(rc.road_key, rc);
    }

    // Load road priority ranks and scores
    const roadScores = this.db.prepare(`
      SELECT rps.road_key, rps.priority_rank, rps.final_score as composite_score
      FROM road_priority_scores rps
      WHERE rps.run_id = (
        SELECT sr.run_id 
        FROM scoring_runs sr 
        JOIN priority_models pm ON sr.model_id = pm.model_id 
        WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' 
        ORDER BY sr.executed_at DESC, sr.run_id DESC 
        LIMIT 1
      )
      ORDER BY rps.priority_rank ASC
    `).all() as any[];

    const scoreMap = new Map<string, { rank: number; score: number }>();
    for (const rs of roadScores) {
      scoreMap.set(rs.road_key, { rank: rs.priority_rank, score: rs.composite_score });
    }

    // Load all canonical roads
    const roads = this.db.prepare(`
      SELECT road_key, canonical_name, display_name, district_name, length_km_official
      FROM roads
      ORDER BY road_key ASC
    `).all() as any[];

    // Load all 7,487 segments
    const segments = this.db.prepare(`
      SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, dominant_condition, segment_status,
             surface_type, road_width_m, recommended_treatment
      FROM treatment_engine_segments
      ORDER BY road_key ASC, sta_start_m ASC
    `).all() as any[];

    // Evaluate each segment
    const evaluatedSegments: EvaluatedSegmentResult[] = [];
    const segmentsByRoad: Record<string, EvaluatedSegmentResult[]> = {};

    for (const seg of segments) {
      const rc = roadCondMap.get(seg.road_key);
      const evalResult = this.evaluateSegment(seg, rc, asbCandidates);
      evaluatedSegments.push(evalResult);

      if (!segmentsByRoad[seg.road_key]) {
        segmentsByRoad[seg.road_key] = [];
      }
      segmentsByRoad[seg.road_key].push(evalResult);
    }

    // Begin Database Transaction to persist estimates and summaries
    this.db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Delete existing estimates and summaries for this scenario
      this.db.prepare('DELETE FROM road_segment_cost_estimates WHERE scenario_id = ?;').run(scenarioId);
      this.db.prepare('DELETE FROM road_cost_summaries WHERE scenario_id = ?;').run(scenarioId);

      // 2. Insert segment estimates
      const insertEstStmt = this.db.prepare(`
        INSERT INTO road_segment_cost_estimates (
          estimate_id,
          scenario_id,
          segment_id,
          road_key,
          budget_year,
          rule_id,
          asb_id,
          matched_width_m,
          matched_surface,
          segment_length_m,
          unit_price_rp,
          unit_price_sen,
          indicative_cost_rp,
          indicative_cost_sen,
          calculation_mode,
          adjustment_flags,
          calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
      `);

      for (const es of evaluatedSegments) {
        insertEstStmt.run(
          `EST-${scenario.scenario_code}-${es.segment_id}`,
          scenarioId,
          es.segment_id,
          es.road_key,
          budgetYear,
          es.rule_id === 'INCOMPLETE_DATA' || es.rule_id === 'NO_MATCHING_RULE' ? null : es.rule_id,
          es.asb_id,
          es.matched_width_m,
          es.matched_surface,
          es.segment_length_m,
          es.unit_price_rp,
          es.unit_price_sen,
          es.indicative_cost_rp,
          es.indicative_cost_sen,
          es.calculation_mode,
          es.adjustment_flags.length > 0 ? JSON.stringify(es.adjustment_flags) : null
        );
      }

      // 3. Aggregate road summaries
      const roadSummaries: any[] = [];
      for (const road of roads) {
        const segs = segmentsByRoad[road.road_key] || [];
        const totalSegs = segs.length;
        let treatedSegs = 0;
        let routineSegs = 0;
        let manualReviewSegs = 0;
        let treatedLenM = 0;
        let manualReviewLenM = 0;
        let totalPaguSen = 0n;

        const ruleCounter: Record<string, number> = {};
        const asbTypeCounter: Record<string, number> = {};

        for (const s of segs) {
          if (s.status === 'MANUAL_REVIEW_WIDTH_EXCEEDED') {
            manualReviewSegs++;
            manualReviewLenM += s.segment_length_m;
            ruleCounter[s.rule_id] = (ruleCounter[s.rule_id] || 0) + 1;
            asbTypeCounter[s.asb_type] = (asbTypeCounter[s.asb_type] || 0) + 1;
          } else if (s.asb_type !== 'NONE' && s.indicative_cost_sen > 0) {
            treatedSegs++;
            treatedLenM += s.segment_length_m;
            totalPaguSen += BigInt(s.indicative_cost_sen);
            ruleCounter[s.rule_id] = (ruleCounter[s.rule_id] || 0) + 1;
            asbTypeCounter[s.asb_type] = (asbTypeCounter[s.asb_type] || 0) + 1;
          } else {
            routineSegs++;
          }
        }

        // Dominant rule & ASB type
        let dominantRuleId = 'R06';
        let dominantAsbType = 'NONE';
        let maxRuleCount = 0;
        for (const [rId, c] of Object.entries(ruleCounter)) {
          if (c > maxRuleCount) {
            maxRuleCount = c;
            dominantRuleId = rId;
          }
        }
        let maxTypeCount = 0;
        for (const [t, c] of Object.entries(asbTypeCounter)) {
          if (c > maxTypeCount) {
            maxTypeCount = c;
            dominantAsbType = t;
          }
        }

        const scoreInfo = scoreMap.get(road.road_key);
        const priorityRank = scoreInfo?.rank ?? 999;
        const compScore = scoreInfo?.score ?? 0;

        roadSummaries.push({
          summary_id: `SUM-${budgetYear}-${scenario.scenario_code}-${road.road_key}`,
          scenario_id: scenarioId,
          road_key: road.road_key,
          road_name: road.display_name,
          district_name: road.district_name,
          budget_year: budgetYear,
          dominant_rule_id: dominantRuleId,
          dominant_asb_type: dominantAsbType,
          total_segments: totalSegs,
          treated_segments: treatedSegs,
          routine_segments: routineSegs,
          manual_review_segments: manualReviewSegs,
          total_length_km: Number(road.length_km_official) || (segs.reduce((a, b) => a + b.segment_length_m, 0) / 1000),
          treated_length_km: treatedLenM / 1000,
          manual_review_length_km: manualReviewLenM / 1000,
          total_pagu_asb_sen: totalPaguSen,
          total_pagu_asb_rp: Number(totalPaguSen) / 100,
          priority_rank: priorityRank,
          composite_score: compScore,
        });
      }

      // 4. Sort roads by priority rank for greedy budget ceiling allocation
      roadSummaries.sort((a, b) => a.priority_rank - b.priority_rank);

      let runningCumulativeSen = 0n;
      let allocatedTotalSen = 0n;
      let allocRank = 1;

      const insertSumStmt = this.db.prepare(`
        INSERT INTO road_cost_summaries (
          summary_id,
          scenario_id,
          road_key,
          budget_year,
          dominant_rule_id,
          dominant_asb_type,
          total_segments,
          treated_segments,
          routine_segments,
          manual_review_segments,
          total_length_km,
          treated_length_km,
          manual_review_length_km,
          total_pagu_asb_rp,
          total_pagu_asb_sen,
          is_funded,
          allocation_rank,
          cumulative_cost_rp,
          cumulative_cost_sen,
          status_summary,
          operational_status,
          allocated_pagu_rp,
          allocated_pagu_sen,
          allocated_treated_segments,
          allocated_treated_length_km,
          selection_rationale,
          calculated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
      `);

      let fundedConstructionCount = 0;
      let routineMaintenanceCount = 0;
      let manualReviewCount = 0;
      let totalAllocatedTreatedKm = 0;
      let totalPrioWeightedScore = 0;

      for (const rs of roadSummaries) {
        runningCumulativeSen += rs.total_pagu_asb_sen;
        const isFunded = runningCumulativeSen <= budgetCeilingSen ? 1 : 0;
        if (isFunded === 1) {
          allocatedTotalSen += rs.total_pagu_asb_sen;
        }

        // Phase 3 Operational Status Classification
        let operationalStatus: RoadOperationalStatus = 'DEFERRED_BY_BUDGET';
        let allocatedPaguSen = 0n;
        let allocatedTreatedSegs = 0;
        let allocatedTreatedLenKm = 0;
        let rationale = '';

        if (rs.total_pagu_asb_sen === 0n) {
          if (rs.manual_review_segments > 0) {
            operationalStatus = 'MANUAL_TECHNICAL_REVIEW';
            rationale = `Memerlukan review teknis / DED khusus karena memiliki ${rs.manual_review_segments} segmen berdimensi khusus (lebar > 5,0m). Pagu konstruksi diset Rp 0.`;
            manualReviewCount++;
          } else {
            operationalStatus = 'ROUTINE_MAINTENANCE';
            rationale = 'Seluruh segmen berkondisi Baik/Sedang (R06); dialokasikan untuk pemeliharaan rutin preventif tanpa paket rekonstruksi fisik.';
            routineMaintenanceCount++;
          }
        } else {
          if (isFunded === 1) {
            operationalStatus = 'FUNDED_CONSTRUCTION';
            allocatedPaguSen = rs.total_pagu_asb_sen;
            allocatedTreatedSegs = rs.treated_segments;
            allocatedTreatedLenKm = rs.treated_length_km;
            totalAllocatedTreatedKm += rs.treated_length_km;
            totalPrioWeightedScore += rs.composite_score * rs.treated_length_km;
            rationale = `Terakomodasi penuh: ${rs.treated_segments} segmen didanai pagu indikatif Rp ${rs.total_pagu_asb_rp.toLocaleString('id-ID')}.`;
            fundedConstructionCount++;
          } else {
            operationalStatus = 'DEFERRED_BY_BUDGET';
            rationale = 'Tertunda karena keterbatasan pagu plafon fiskal skenario.';
          }
        }

        const statusSummary = isFunded === 1 ? 'PROPOSED_FUNDED' : 'DEFERRED_CEILING_REACHED';

        insertSumStmt.run(
          rs.summary_id,
          scenarioId,
          rs.road_key,
          budgetYear,
          rs.dominant_rule_id,
          rs.dominant_asb_type,
          rs.total_segments,
          rs.treated_segments,
          rs.routine_segments,
          rs.manual_review_segments,
          rs.total_length_km,
          rs.treated_length_km,
          rs.manual_review_length_km,
          rs.total_pagu_asb_rp,
          Number(rs.total_pagu_asb_sen),
          isFunded,
          allocRank,
          Number(runningCumulativeSen) / 100,
          Number(runningCumulativeSen),
          statusSummary,
          operationalStatus,
          Number(allocatedPaguSen) / 100,
          Number(allocatedPaguSen),
          allocatedTreatedSegs,
          allocatedTreatedLenKm,
          rationale
        );

        rs.is_funded = isFunded;
        rs.allocation_rank = allocRank;
        rs.cumulative_cost_sen = Number(runningCumulativeSen);
        rs.cumulative_cost_rp = Number(runningCumulativeSen) / 100;
        rs.status_summary = statusSummary;
        rs.operational_status = operationalStatus;
        rs.allocated_pagu_rp = Number(allocatedPaguSen) / 100;
        rs.allocated_pagu_sen = Number(allocatedPaguSen);
        rs.allocated_treated_segments = allocatedTreatedSegs;
        rs.allocated_treated_length_km = allocatedTreatedLenKm;
        rs.selection_rationale = rationale;
        allocRank++;
      }

      // 5. Update road_segment_cost_estimates is_selected and selection_status
      const fundedRoadKeys = roadSummaries
        .filter(r => r.operational_status === 'FUNDED_CONSTRUCTION')
        .map(r => r.road_key);

      const fundedKeyPlaceholder = fundedRoadKeys.length > 0
        ? fundedRoadKeys.map(k => `'${k}'`).join(',')
        : "''";

      this.db.prepare(`
        UPDATE road_segment_cost_estimates
        SET is_selected = CASE 
              WHEN road_key IN (${fundedKeyPlaceholder}) 
                   AND indicative_cost_sen > 0 AND calculation_mode != 'MANUAL_REVIEW_MODE' THEN 1 
              ELSE 0 
            END,
            selection_status = CASE
              WHEN calculation_mode = 'MANUAL_REVIEW_MODE' THEN 'EXCLUDED_MANUAL_REVIEW'
              WHEN rule_id = 'R06' OR indicative_cost_sen = 0 THEN 'ROUTINE_MAINTENANCE'
              WHEN road_key IN (${fundedKeyPlaceholder}) THEN 'SELECTED_CONSTRUCTION'
              ELSE 'DEFERRED_BY_BUDGET'
            END
        WHERE scenario_id = ?;
      `).run(scenarioId);

      // 6. Update budget_scenarios aggregates
      const totalCostSen = runningCumulativeSen;
      const totalCostRp = Number(totalCostSen) / 100;
      const allocatedCostRp = Number(allocatedTotalSen) / 100;

      this.db.prepare(`
        UPDATE budget_scenarios
        SET total_cost_rp = ?,
            total_cost_sen = ?,
            allocated_cost_rp = ?,
            allocated_cost_sen = ?,
            funded_construction_roads = ?,
            routine_maintenance_roads = ?,
            manual_review_roads = ?,
            treated_length_km = ?,
            priority_weighted_score = ?,
            solver_status = 'BENCHMARK_GREEDY',
            updated_at = datetime('now')
        WHERE scenario_id = ?;
      `).run(
        totalCostRp,
        Number(totalCostSen),
        allocatedCostRp,
        Number(allocatedTotalSen),
        fundedConstructionCount,
        routineMaintenanceCount,
        manualReviewCount,
        Math.round(totalAllocatedTreatedKm * 100) / 100,
        Math.round(totalPrioWeightedScore * 10000) / 10000,
        scenarioId
      );

      this.db.exec('COMMIT;');
    } catch (err: any) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return this.getScenarioDetailSummary(scenarioId);
  }

  /**
   * Get scenario detail and comprehensive metrics
   */
  public getScenarioDetailSummary(scenarioId: string): ScenarioDetailSummary {
    const scn = this.db.prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?').get(scenarioId) as any;
    if (!scn) {
      throw new Error(`SCENARIO_NOT_FOUND: ${scenarioId}`);
    }

    const roadsStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_roads,
        SUM(CASE WHEN is_funded = 1 THEN 1 ELSE 0 END) as funded_roads,
        SUM(CASE WHEN is_funded = 0 THEN 1 ELSE 0 END) as deferred_roads,
        SUM(total_segments) as total_segments,
        SUM(treated_segments) as treated_segments,
        SUM(routine_segments) as routine_segments,
        SUM(manual_review_segments) as manual_review_segments,
        SUM(treated_length_km) as treated_length_km,
        SUM(manual_review_length_km) as manual_review_length_km,
        SUM(total_pagu_asb_sen) as total_pagu_sen,
        SUM(CASE WHEN is_funded = 1 THEN total_pagu_asb_sen ELSE 0 END) as allocated_sen
      FROM road_cost_summaries
      WHERE scenario_id = ?
    `).get(scenarioId) as any;

    // Type breakdown
    const typeBreakdownRows = this.db.prepare(`
      SELECT 
        rsce.rule_id,
        tpr.asb_type,
        COUNT(*) as segments,
        SUM(rsce.indicative_cost_sen) as cost_sen,
        SUM(rsce.segment_length_m) as length_m
      FROM road_segment_cost_estimates rsce
      LEFT JOIN treatment_package_rules tpr ON rsce.rule_id = tpr.rule_id
      WHERE rsce.scenario_id = ?
      GROUP BY tpr.asb_type
    `).all(scenarioId) as any[];

    const asbTypeBreakdown: Record<string, { segments: number; cost_rp: number; cost_sen: number; length_km: number }> = {};
    for (const r of typeBreakdownRows) {
      const typeKey = r.asb_type || 'NONE';
      asbTypeBreakdown[typeKey] = {
        segments: r.segments,
        cost_sen: Number(r.cost_sen || 0),
        cost_rp: Number(r.cost_sen || 0) / 100,
        length_km: (Number(r.length_m) || 0) / 1000
      };
    }

    const opStats = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN operational_status = 'FUNDED_CONSTRUCTION' THEN 1 ELSE 0 END) as funded_construction,
        SUM(CASE WHEN operational_status = 'ROUTINE_MAINTENANCE' THEN 1 ELSE 0 END) as routine_maintenance,
        SUM(CASE WHEN operational_status = 'MANUAL_TECHNICAL_REVIEW' THEN 1 ELSE 0 END) as manual_review,
        SUM(CASE WHEN operational_status = 'DEFERRED_BY_BUDGET' THEN 1 ELSE 0 END) as deferred_budget,
        SUM(allocated_treated_length_km) as allocated_treated_km,
        SUM(allocated_pagu_sen) as allocated_sen
      FROM road_cost_summaries
      WHERE scenario_id = ?
    `).get(scenarioId) as any;

    const treatedKmAllocated = Number(opStats?.allocated_treated_km || scn.treated_length_km || roadsStats?.treated_length_km || 0);

    return {
      scenario_id: scn.scenario_id,
      scenario_code: scn.scenario_code,
      scenario_name: scn.scenario_name,
      budget_year: scn.budget_year,
      description: scn.description,
      scenario_status: scn.scenario_status,
      budget_ceiling_rp: Number(scn.budget_ceiling_rp || 0),
      budget_ceiling_sen: Number(scn.budget_ceiling_sen || 0),
      total_cost_rp: Number(scn.total_cost_rp || (roadsStats?.total_pagu_sen ? Number(roadsStats.total_pagu_sen) / 100 : 0)),
      total_cost_sen: Number(scn.total_cost_sen || roadsStats?.total_pagu_sen || 0),
      allocated_cost_rp: Number(scn.allocated_cost_rp || (roadsStats?.allocated_sen ? Number(roadsStats.allocated_sen) / 100 : 0)),
      allocated_cost_sen: Number(scn.allocated_cost_sen || roadsStats?.allocated_sen || 0),
      allocation_strategy: scn.allocation_strategy || 'PRIORITY_RANK_GREEDY',
      optimization_objective: scn.optimization_objective || 'GREEDY_BENCHMARK',
      solver_status: scn.solver_status || 'BENCHMARK_GREEDY',
      solver_nodes: Number(scn.solver_nodes || 0),
      solver_gap_pct: Number(scn.solver_gap_pct || 0),
      solver_runtime_ms: Number(scn.solver_runtime_ms || 0),
      total_roads: Number(roadsStats?.total_roads || 0),
      funded_roads: Number(roadsStats?.funded_roads || 0),
      deferred_roads: Number(roadsStats?.deferred_roads || 0),
      funded_construction_roads: Number(opStats?.funded_construction || scn.funded_construction_roads || 0),
      routine_maintenance_roads: Number(opStats?.routine_maintenance || scn.routine_maintenance_roads || 0),
      manual_review_roads: Number(opStats?.manual_review || scn.manual_review_roads || 0),
      total_segments: Number(roadsStats?.total_segments || 0),
      treated_segments: Number(roadsStats?.treated_segments || 0),
      routine_segments: Number(roadsStats?.routine_segments || 0),
      manual_review_segments: Number(roadsStats?.manual_review_segments || 0),
      standardized_treated_segments: Number(roadsStats?.treated_segments || 0),
      treated_length_km: Number(roadsStats?.treated_length_km || 0),
      manual_review_length_km: Number(roadsStats?.manual_review_length_km || 0),
      allocated_treated_length_km: Math.round(treatedKmAllocated * 100) / 100,
      priority_weighted_score: Number(scn.priority_weighted_score || 0),
      asb_type_breakdown: asbTypeBreakdown,
      status_breakdown: {
        funded_construction_roads: Number(opStats?.funded_construction || scn.funded_construction_roads || 0),
        routine_maintenance_roads: Number(opStats?.routine_maintenance || scn.routine_maintenance_roads || 0),
        manual_review_roads: Number(opStats?.manual_review || scn.manual_review_roads || 0),
        deferred_by_budget_roads: Number(opStats?.deferred_budget || (Number(roadsStats?.total_roads || 0) - Number(opStats?.funded_construction || 0) - Number(opStats?.routine_maintenance || 0) - Number(opStats?.manual_review || 0))),
        total_roads: Number(roadsStats?.total_roads || 0),
      },
      planning_indicators: {
        existing_network_mantap_km: 392.89,
        existing_network_mantap_pct: 53.64,
        eligible_damaged_length_km: 336.29,
        selected_treatment_length_km: Math.round(treatedKmAllocated * 100) / 100,
        remaining_untreated_damaged_length_km: Math.max(0, Math.round((336.29 - treatedKmAllocated) * 100) / 100),
        estimated_treatment_expenditure_rp: Number(scn.allocated_cost_rp || 0),
        disclaimer: 'Indikator Perencanaan Program — Bukan Prediksi Hasil Otomatis (Estimasi Makro Indikatif Tanpa Model Transisi Kondisi Pasca-Konstruksi).',
      }
    };
  }

  /**
   * Get all road cost summaries for a scenario with optional filters
   */
  public getRoadCostSummaries(
    scenarioId: string,
    filters?: { district?: string; isFunded?: number; dominantType?: string; search?: string; operationalStatus?: string }
  ): RoadCostSummaryRow[] {
    let sql = `
      SELECT 
        rcs.*,
        r.display_name as road_name,
        r.district_name,
        rps.priority_rank,
        rps.composite_score
      FROM road_cost_summaries rcs
      JOIN roads r ON rcs.road_key = r.road_key
      LEFT JOIN (
        SELECT rps_inner.road_key, rps_inner.priority_rank, rps_inner.final_score as composite_score
        FROM road_priority_scores rps_inner
        WHERE rps_inner.run_id = (
          SELECT sr.run_id 
          FROM scoring_runs sr 
          JOIN priority_models pm ON sr.model_id = pm.model_id 
          WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' 
          ORDER BY sr.executed_at DESC, sr.run_id DESC 
          LIMIT 1
        )
      ) rps ON rcs.road_key = rps.road_key
      WHERE rcs.scenario_id = ?
    `;

    const params: any[] = [scenarioId];

    if (filters?.district) {
      sql += ` AND r.district_name = ?`;
      params.push(filters.district);
    }
    if (filters?.isFunded !== undefined && filters?.isFunded !== null) {
      sql += ` AND rcs.is_funded = ?`;
      params.push(filters.isFunded);
    }
    if (filters?.operationalStatus) {
      sql += ` AND rcs.operational_status = ?`;
      params.push(filters.operationalStatus);
    }
    if (filters?.dominantType) {
      sql += ` AND rcs.dominant_asb_type = ?`;
      params.push(filters.dominantType);
    }
    if (filters?.search) {
      sql += ` AND (r.display_name LIKE ? OR rcs.road_key LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    sql += ` ORDER BY rcs.allocation_rank ASC`;

    return this.db.prepare(sql).all(...params) as unknown as RoadCostSummaryRow[];
  }

  /**
   * Get road detail and full segment costing breakdown for a specific road in a scenario
   */
  public getRoadCostDetail(scenarioId: string, roadKey: string): {
    road: any;
    summary: any;
    segments: any[];
    ahspBreakdown: any[];
  } | null {
    const road = this.db.prepare(`
      SELECT r.*, rc.total_panjang_km as total_condition_length_km, rc.tidak_mantap_pct, rc.mantap_pct, rc.rusak_berat_pct, rc.rusak_ringan_pct, rc.baik_pct, rc.sedang_pct
      FROM roads r
      LEFT JOIN road_conditions rc ON r.road_key = rc.road_key AND rc.survey_year = 2025
      WHERE r.road_key = ?
    `).get(roadKey) as any;

    if (!road) return null;

    const summary = this.db.prepare(`
      SELECT rcs.*, rps.priority_rank, rps.composite_score
      FROM road_cost_summaries rcs
      LEFT JOIN (
        SELECT rps_inner.road_key, rps_inner.priority_rank, rps_inner.final_score as composite_score
        FROM road_priority_scores rps_inner
        WHERE rps_inner.run_id = (
          SELECT sr.run_id 
          FROM scoring_runs sr 
          JOIN priority_models pm ON sr.model_id = pm.model_id 
          WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' 
          ORDER BY sr.executed_at DESC, sr.run_id DESC 
          LIMIT 1
        )
      ) rps ON rcs.road_key = rps.road_key
      WHERE rcs.scenario_id = ? AND rcs.road_key = ?
    `).get(scenarioId, roadKey) as any;

    const segments = this.db.prepare(`
      SELECT 
        rsce.*,
        tes.sta_start_m,
        tes.sta_end_m,
        tes.dominant_condition,
        tes.surface_type,
        tes.segment_status,
        tes.recommended_treatment,
        tpr.rule_label,
        tpr.asb_type,
        tpr.selected_profile,
        mai.package_name,
        mai.specification
      FROM road_segment_cost_estimates rsce
      JOIN treatment_engine_segments tes ON rsce.segment_id = tes.segment_id
      LEFT JOIN treatment_package_rules tpr ON rsce.rule_id = tpr.rule_id
      LEFT JOIN master_asb_items mai ON rsce.asb_id = mai.asb_id
      WHERE rsce.scenario_id = ? AND rsce.road_key = ?
      ORDER BY tes.sta_start_m ASC
    `).all(scenarioId, roadKey) as any[];

    // Extract relevant AHSP profile items for the dominant rule
    for (const s of segments) {
      if (!s.asb_id && (s.calculation_mode === 'MANUAL_REVIEW_MODE' || (s.adjustment_flags && s.adjustment_flags.includes('MANUAL_REVIEW_WIDTH_EXCEEDED')))) {
        s.package_name = `Penanganan Khusus (Lebar ${s.matched_width_m}m > 5,0m Butuh Review Manual/DED)`;
        s.specification = `Lebar eksisting ${s.matched_width_m}m melampaui batas standar katalog ASB Jalan Kabupaten (maks. 5,0m). Estimasi biaya diset Rp 0 untuk review teknis/DED khusus.`;
      }
    }

    let ahspBreakdown: any[] = [];
    if (summary?.dominant_rule_id && summary.dominant_rule_id !== 'R06') {
      ahspBreakdown = this.db.prepare(`
        SELECT aapi.*, mah.payment_code, mah.item_description, mah.unit as ahsp_unit, mah.unit_price_rp as ahsp_price_rp, mah.unit_price_sen as ahsp_price_sen
        FROM asb_ahsp_profile_items aapi
        JOIN treatment_package_rules tpr ON aapi.profile_id = 'profile_asb_' || lower(tpr.asb_type)
        LEFT JOIN master_ahsp_items mah ON aapi.ahsp_id = mah.ahsp_id
        WHERE tpr.rule_id = ?
        ORDER BY aapi.profile_item_id ASC
      `).all(summary.dominant_rule_id) as any[];
    }

    return { road, summary, segments, ahspBreakdown };
  }

  /**
   * Export scenario results as CSV
   */
  public exportScenarioCsv(scenarioId: string): string {
    const scn = this.getScenarioDetailSummary(scenarioId);
    const roads = this.getRoadCostSummaries(scenarioId);

    const headers = [
      'Alokasi Rank',
      'Kode Ruas',
      'Nama Ruas',
      'Kecamatan',
      'Prioritas Rank',
      'Skor Komposit',
      'Panjang Resmi (km)',
      'Panjang Tertangani (km)',
      'Total Segmen',
      'Segmen Tertangani',
      'Segmen Rutin',
      'Paket ASB Dominan',
      'Aturan Terpilih',
      'Total Pagu ASB (Rp)',
      'Status Alokasi Plafon',
      'Kumulatif Pagu (Rp)',
      'Status Operasional',
      'Pagu Teralokasi (Rp)',
      'Rasionalisasi Keputusan'
    ];

    const rows = roads.map(r => {
      const isFunded = r.is_funded === 1 || r.operational_status === 'FUNDED_CONSTRUCTION';
      const treatedKm = r.allocated_treated_length_km !== undefined && r.allocated_treated_length_km !== null
        ? Number(r.allocated_treated_length_km)
        : (isFunded ? Number(r.treated_length_km || 0) : 0);
      const treatedSegs = r.allocated_treated_segments !== undefined && r.allocated_treated_segments !== null
        ? Number(r.allocated_treated_segments)
        : (isFunded ? Number(r.treated_segments || 0) : 0);
      const allocatedRp = r.allocated_pagu_rp !== undefined && r.allocated_pagu_rp !== null
        ? Number(r.allocated_pagu_rp)
        : (isFunded ? Number(r.total_pagu_asb_rp || 0) : 0);

      return [
        r.allocation_rank,
        `"${r.road_key || ''}"`,
        `"${(r.road_name || '').replace(/"/g, '""')}"`,
        `"${r.district_name || ''}"`,
        r.priority_rank ?? '-',
        r.composite_score ? r.composite_score.toFixed(6) : '-',
        Number(r.total_length_km || 0).toFixed(3),
        treatedKm.toFixed(3),
        r.total_segments || 0,
        treatedSegs,
        r.routine_segments || 0,
        `"Tipe ${r.dominant_asb_type || 'NONE'}"`,
        r.dominant_rule_id || 'R06',
        Math.round(r.total_pagu_asb_rp || 0),
        isFunded ? 'TERAKOMODASI' : 'TERTUNDA',
        Math.round(r.cumulative_cost_rp || 0),
        `"${r.operational_status || (isFunded ? 'FUNDED_CONSTRUCTION' : 'DEFERRED_BY_BUDGET')}"`,
        Math.round(allocatedRp),
        `"${(r.selection_rationale || '').replace(/"/g, '""')}"`
      ];
    });

    const fundedCount = scn.funded_construction_roads ?? (roads.filter(r => r.operational_status === 'FUNDED_CONSTRUCTION' || r.is_funded === 1).length);

    const csvLines = [
      `# LAPORAN PERENCANAAN BIAYA PENANGANAN JALAN KABUPATEN HSS`,
      `# Skenario: "${scn.scenario_name}" (${scn.scenario_code})`,
      `# Tahun Anggaran: ${scn.budget_year}`,
      `# Plafon Anggaran: Rp ${Math.round(scn.budget_ceiling_rp).toLocaleString('id-ID')}`,
      `# Total Kebutuhan Pagu: Rp ${Math.round(scn.total_cost_rp).toLocaleString('id-ID')}`,
      `# Total Terakomodasi: Rp ${Math.round(scn.allocated_cost_rp).toLocaleString('id-ID')} (${fundedCount} ruas)`,
      `# Tanggal Ekspor: ${new Date().toISOString()}`,
      headers.join(','),
      ...rows.map(r => r.join(','))
    ];

    return '\uFEFF' + csvLines.join('\r\n');
  }

  /**
   * List all scenarios with summary stats
   */
  public getScenarios(): any[] {
    return this.db.prepare(`
      SELECT 
        bs.*,
        COUNT(rcs.road_key) as total_roads_in_summary,
        SUM(CASE WHEN rcs.is_funded = 1 THEN 1 ELSE 0 END) as funded_roads_count
      FROM budget_scenarios bs
      LEFT JOIN road_cost_summaries rcs ON bs.scenario_id = rcs.scenario_id
      GROUP BY bs.scenario_id
      ORDER BY bs.budget_year DESC, bs.created_at ASC
    `).all();
  }

  /**
   * Create a new budget scenario and immediately calculate initial costing
   */
  public createScenario(data: {
    scenario_code: string;
    scenario_name: string;
    budget_year: number;
    budget_ceiling_rp?: number;
    description?: string;
    scenario_status?: string;
    allocation_strategy?: string;
  }): ScenarioDetailSummary {
    const cleanCode = data.scenario_code.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const scenarioId = `SCN-${data.budget_year}-${cleanCode}`;
    const ceilingRp = data.budget_ceiling_rp !== undefined ? data.budget_ceiling_rp : 50000000000;
    const ceilingSen = Math.round(ceilingRp * 100);

    const existing = this.db.prepare('SELECT scenario_id FROM budget_scenarios WHERE scenario_id = ? OR scenario_code = ?').get(scenarioId, data.scenario_code);
    if (existing) {
      throw new Error(`DUPLICATE_SCENARIO: Scenario with id '${scenarioId}' or code '${data.scenario_code}' already exists.`);
    }

    this.db.prepare(`
      INSERT INTO budget_scenarios (
        scenario_id,
        scenario_code,
        scenario_name,
        budget_year,
        description,
        scenario_status,
        budget_ceiling_rp,
        budget_ceiling_sen,
        total_cost_rp,
        total_cost_sen,
        allocated_cost_rp,
        allocated_cost_sen,
        allocation_strategy,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, datetime('now'), datetime('now'));
    `).run(
      scenarioId,
      data.scenario_code,
      data.scenario_name,
      data.budget_year,
      data.description || null,
      data.scenario_status || 'DRAFT',
      ceilingRp,
      ceilingSen,
      data.allocation_strategy || 'PRIORITY_RANK_GREEDY'
    );

    // Calculate immediately
    return this.calculateAndPersistScenario(scenarioId);
  }

  /**
   * Update scenario metadata and/or ceiling, recalculate if ceiling changed
   */
  public updateScenario(
    scenarioId: string,
    data: {
      scenario_name?: string;
      budget_ceiling_rp?: number;
      description?: string;
      scenario_status?: string;
      allocation_strategy?: string;
    }
  ): ScenarioDetailSummary {
    const current = this.db.prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?').get(scenarioId) as any;
    if (!current) {
      throw new Error(`SCENARIO_NOT_FOUND: Scenario with id '${scenarioId}' does not exist.`);
    }

    const newName = data.scenario_name ?? current.scenario_name;
    const newDesc = data.description !== undefined ? data.description : current.description;
    const newStatus = data.scenario_status ?? current.scenario_status;
    const newStrategy = data.allocation_strategy ?? current.allocation_strategy;
    
    let ceilingChanged = false;
    let newCeilingRp = current.budget_ceiling_rp;
    let newCeilingSen = current.budget_ceiling_sen;

    if (data.budget_ceiling_rp !== undefined && data.budget_ceiling_rp !== current.budget_ceiling_rp) {
      ceilingChanged = true;
      newCeilingRp = data.budget_ceiling_rp;
      newCeilingSen = Math.round(newCeilingRp * 100);
    }

    this.db.prepare(`
      UPDATE budget_scenarios
      SET scenario_name = ?,
          description = ?,
          scenario_status = ?,
          budget_ceiling_rp = ?,
          budget_ceiling_sen = ?,
          allocation_strategy = ?,
          updated_at = datetime('now')
      WHERE scenario_id = ?;
    `).run(newName, newDesc, newStatus, newCeilingRp, newCeilingSen, newStrategy, scenarioId);

    if (ceilingChanged) {
      return this.calculateAndPersistScenario(scenarioId);
    }

    return this.getScenarioDetailSummary(scenarioId);
  }

  /**
   * Delete a scenario and its associated estimates and summaries
   */
  public deleteScenario(scenarioId: string): boolean {
    if (scenarioId === 'SCN-2027-BASELINE') {
      throw new Error('PROTECTED_SCENARIO: Skenario baseline (SCN-2027-BASELINE) dilindungi dan tidak boleh dihapus.');
    }
    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare('DELETE FROM road_segment_cost_estimates WHERE scenario_id = ?;').run(scenarioId);
      this.db.prepare('DELETE FROM road_cost_summaries WHERE scenario_id = ?;').run(scenarioId);
      const res = this.db.prepare('DELETE FROM budget_scenarios WHERE scenario_id = ?;').run(scenarioId);
      this.db.exec('COMMIT;');
      return (res as any).changes > 0;
    } catch (err: any) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Multi-scenario comparison
   */
  public getScenarioComparison(): any[] {
    const scenarios = this.getScenarios();
    return scenarios.map(scn => {
      try {
        return this.getScenarioDetailSummary(scn.scenario_id);
      } catch {
        return scn;
      }
    });
  }

  /**
   * Search ASB catalog items
   */
  public searchASB(params: { search?: string; category?: string; asbType?: string; limit?: number }): any[] {
    let sql = 'SELECT * FROM master_asb_items WHERE is_active = 1';
    const bindings: any[] = [];
    if (params.category) {
      sql += ' AND item_category = ?';
      bindings.push(params.category);
    }
    if (params.asbType) {
      sql += ' AND package_name LIKE ?';
      bindings.push(`%Tipe ${params.asbType}%`);
    }
    if (params.search) {
      sql += ' AND (package_name LIKE ? OR item_code LIKE ? OR specification LIKE ?)';
      bindings.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
    }
    sql += ' ORDER BY item_category ASC, road_width_m ASC, unit_price_rp ASC';
    if (params.limit) {
      sql += ' LIMIT ?';
      bindings.push(params.limit);
    }
    return this.db.prepare(sql).all(...bindings);
  }

  /**
   * Search AHSP catalog items
   */
  public searchAHSP(params: { search?: string; division?: number; limit?: number }): any[] {
    let sql = 'SELECT * FROM master_ahsp_items WHERE is_active = 1';
    const bindings: any[] = [];
    if (params.division) {
      sql += ' AND division_code = ?';
      bindings.push(params.division);
    }
    if (params.search) {
      sql += ' AND (item_description LIKE ? OR payment_code LIKE ?)';
      bindings.push(`%${params.search}%`, `%${params.search}%`);
    }
    sql += ' ORDER BY division_code ASC, ahsp_id ASC';
    if (params.limit) {
      sql += ' LIMIT ?';
      bindings.push(params.limit);
    }
    return this.db.prepare(sql).all(...bindings);
  }

  /**
   * Get all 6 treatment rules with mapping profile info
   */
  public getTreatmentRules(): any[] {
    return this.db.prepare(`
      SELECT 
        tpr.*,
        aap.purpose_description as profile_description,
        aap.disclaimer as profile_disclaimer,
        COUNT(aapi.profile_item_id) as mapped_ahsp_items_count
      FROM treatment_package_rules tpr
      LEFT JOIN asb_ahsp_profiles aap ON (tpr.selected_profile = aap.structural_profile OR tpr.asb_type = aap.asb_type)
      LEFT JOIN asb_ahsp_profile_items aapi ON aap.profile_id = aapi.profile_id
      GROUP BY tpr.rule_id
      ORDER BY tpr.priority_order ASC
    `).all();
  }

  /**
   * Run Mathematical Budget Optimization on a scenario
   */
  public runOptimization(
    scenarioId: string,
    objective: OptimizationObjective = 'PRIORITY_WEIGHTED',
    customCeilingRp?: number
  ): OptimizationRunResult {
    const result = this.optimizationEngine.runOptimization(scenarioId, objective, customCeilingRp);
    this.optimizationEngine.persistOptimizationResult(result);
    return result;
  }

  /**
   * Compare all 4 allocation methods side-by-side for a specific scenario and ceiling
   */
  public compareOptimizationMethods(scenarioId: string, ceilingRp?: number) {
    return this.optimizationEngine.compareAllMethods(scenarioId, ceilingRp);
  }

  /**
   * Duplicate an existing scenario with a new code and name
   */
  public duplicateScenario(
    sourceScenarioId: string,
    newCode: string,
    newName?: string,
    description?: string,
    customCeilingRp?: number,
    optimizationObjective?: OptimizationObjective
  ): ScenarioDetailSummary {
    const source = this.costingRefService.getScenarioById(sourceScenarioId);
    if (!source) {
      throw new Error(`SCENARIO_NOT_FOUND: Source scenario '${sourceScenarioId}' not found.`);
    }

    const targetCeiling = customCeilingRp !== undefined && !isNaN(customCeilingRp) && customCeilingRp > 0
      ? customCeilingRp
      : source.budget_ceiling_rp;

    const newScenario = this.createScenario({
      scenario_code: newCode,
      scenario_name: newName || `${source.scenario_name} (Salinan)`,
      budget_year: source.budget_year,
      budget_ceiling_rp: targetCeiling,
      description: description || `Salinan dari skenario ${source.scenario_code}`,
      scenario_status: 'DRAFT',
      allocation_strategy: optimizationObjective || source.allocation_strategy || 'PRIORITY_RANK_GREEDY',
    });

    if (optimizationObjective && optimizationObjective !== 'GREEDY_BENCHMARK') {
      this.runOptimization(newScenario.scenario_id, optimizationObjective, targetCeiling);
      return this.getScenarioDetailSummary(newScenario.scenario_id);
    }

    return newScenario;
  }

  /**
   * Get deferred and excluded road register with clear rationale
   */
  public getDeferredRoadRegister(scenarioId: string): any[] {
    return this.db.prepare(`
      SELECT 
        rcs.road_key,
        r.display_name as road_name,
        r.district_name,
        rps.priority_rank,
        rps.composite_score,
        rcs.total_length_km,
        rcs.treated_length_km,
        rcs.total_pagu_asb_rp,
        rcs.allocated_pagu_rp,
        rcs.operational_status,
        rcs.selection_rationale,
        rcs.manual_review_segments
      FROM road_cost_summaries rcs
      JOIN roads r ON rcs.road_key = r.road_key
      LEFT JOIN (
        SELECT rps_inner.road_key, rps_inner.priority_rank, rps_inner.final_score as composite_score
        FROM road_priority_scores rps_inner
        WHERE rps_inner.run_id = (
          SELECT sr.run_id 
          FROM scoring_runs sr 
          JOIN priority_models pm ON sr.model_id = pm.model_id 
          WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025' 
          ORDER BY sr.executed_at DESC, sr.run_id DESC 
          LIMIT 1
        )
      ) rps ON rcs.road_key = rps.road_key
      WHERE rcs.scenario_id = ? AND rcs.operational_status != 'FUNDED_CONSTRUCTION'
      ORDER BY rps.priority_rank ASC
    `).all(scenarioId);
  }

  /**
   * Get optimization run history for a scenario
   */
  public getOptimizationHistory(scenarioId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM scenario_optimizations
      WHERE scenario_id = ?
      ORDER BY created_at DESC
    `).all(scenarioId);
  }
}
