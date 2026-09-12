import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { ScoringService } from './scoringService.ts';
import { ConditionService } from './conditionService.ts';
import { RoadService } from './roadService.ts';
import { ModelService } from './modelService.ts';
import { BenchmarkService } from './benchmarkService.ts';

export interface DashboardData {
  operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024';
  modelCode: string;
  run_id: string;
  kpis: {
    totalRoads: number;
    totalLengthKm: number;
    mantapKm: number;
    mantapPct: number;
    tidakMantapKm: number;
    tidakMantapPct: number;
    top35Count: number;
    top105Count: number;
  };
  top10: Array<{
    priority_rank: number;
    road_key: string;
    nomor_ruas: string;
    display_name: string;
    district_name: string;
    length_km_official: number;
    mantap_pct: number;
    final_score: number;
    tier_category: string;
  }>;
  categoryWeights: Array<{
    category_code: string;
    category_name: string;
    raw_weight: number;
    normalized_weight: number;
    normalized_pct: number;
  }>;
  conditionBreakdown: {
    baik_km: number;
    baik_pct: number;
    sedang_km: number;
    sedang_pct: number;
    rusak_ringan_km: number;
    rusak_ringan_pct: number;
    rusak_berat_km: number;
    rusak_berat_pct: number;
  };
  benchmarkAudit?: {
    historicalTop105Count: number;
    policyTop105Count: number;
    concordantRoadsCount: number;
    concordancePct: number;
  };
}

export interface PriorityTableRow {
  run_id: string;
  road_key: string;
  nomor_ruas: string;
  display_name: string;
  canonical_name: string;
  district_name: string;
  village_coverage: string;
  length_km_official: number;
  width_m_official: number;
  priority_rank: number;
  final_score: number;
  tier_category: string;
  mantap_pct: number;
  tidak_mantap_pct: number;
  baik_km: number;
  sedang_km: number;
  rusak_ringan_km: number;
  rusak_berat_km: number;
  subtotal_teknis: number;
  subtotal_akses: number;
  subtotal_pelayanan: number;
  subtotal_spasial: number;
}

export interface RoadDetailData {
  identity: {
    road_key: string;
    nomor_ruas: string;
    display_name: string;
    canonical_name: string;
    district_name: string;
    village_coverage: string;
    length_km_official: number;
    width_m_official: number;
    identity_status: string;
  };
  condition2025: {
    total_panjang_km: number;
    mantap_km: number;
    mantap_pct: number;
    tidak_mantap_km: number;
    tidak_mantap_pct: number;
    baik_km: number;
    baik_pct: number;
    sedang_km: number;
    sedang_pct: number;
    rusak_ringan_km: number;
    rusak_ringan_pct: number;
    rusak_berat_km: number;
    rusak_berat_pct: number;
    source_filename: string;
    authority_status: string;
  };
  priorityResult: {
    priority_rank: number;
    final_score: number;
    tier_category: string;
    operating_mode: string;
    model_code: string;
    run_id: string;
  };
  categoryContributions: Array<{
    category_code: string;
    category_name: string;
    raw_weight: number;
    normalized_weight: number;
    subtotal: number;
    percentage_of_score: number;
  }>;
  factors: Array<{
    variable_code: string;
    variable_label: string;
    definition: string;
    category_code: string;
    category_name: string;
    raw_value: number;
    raw_unit: string;
    optimization_dir: 'BENEFIT' | 'COST';
    normalized_value: number;
    local_weight: number;
    effective_weight: number;
    contribution: number;
  }>;
  mathematicalAudit: {
    final_score: number;
    sum_subtotals: number;
    sum_contributions: number;
    delta_subtotals: number;
    delta_contributions: number;
    is_exact: boolean;
  };
}

export class UiDataService {
  private db: DatabaseSync;
  private scoringService: ScoringService;
  private conditionService: ConditionService;
  private roadService: RoadService;
  private modelService: ModelService;
  private benchmarkService: BenchmarkService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.scoringService = new ScoringService(this.db);
    this.conditionService = new ConditionService(this.db);
    this.roadService = new RoadService(this.db);
    this.modelService = new ModelService(this.db);
    this.benchmarkService = new BenchmarkService(this.db);
  }

  /**
   * Get executive dashboard metrics for a given operating mode.
   */
  getDashboardData(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): DashboardData {
    // 1. Ensure scoring run exists
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode);
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) {
      throw new Error(`SCORING_RUN_UNAVAILABLE: Could not retrieve scoring run for mode '${operatingMode}'.`);
    }

    // 2. Condition aggregate summary
    const condSummary = this.conditionService.getAggregateSummary(2025);

    // 3. Top 10 rows
    const top10Scores = latestRun.scores.slice(0, 10);
    const top10Keys = top10Scores.map((s) => s.road_key);
    const roadStmt = this.db.prepare(`
      SELECT r.road_key, r.nomor_ruas, r.display_name, r.district_name, r.length_km_official,
             COALESCE(c.mantap_pct, 0.0) as mantap_pct
      FROM roads r
      LEFT JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = 2025
      WHERE r.road_key IN (${top10Keys.map(() => '?').join(',')})
    `);
    const roadRows = roadStmt.all(...top10Keys) as unknown as Array<{
      road_key: string;
      nomor_ruas: string;
      display_name: string;
      district_name: string;
      length_km_official: number;
      mantap_pct: number;
    }>;
    const roadMap = new Map(roadRows.map((r) => [r.road_key, r]));

    const top10 = top10Scores.map((s) => {
      const road = roadMap.get(s.road_key);
      return {
        priority_rank: s.priority_rank,
        road_key: s.road_key,
        nomor_ruas: road?.nomor_ruas || '',
        display_name: road?.display_name || '',
        district_name: road?.district_name || '',
        length_km_official: road?.length_km_official || 0,
        mantap_pct: road?.mantap_pct || 0,
        final_score: s.final_score,
        tier_category: s.tier_category,
      };
    });

    // 4. Model Category weights
    const model = this.modelService.getBaselineModel();
    const categories = this.modelService.getCategories();
    const catMap = new Map(categories.map((c) => [c.category_code, c]));

    const categoryWeights = (model?.category_weights || []).map((cw) => {
      const cat = catMap.get(cw.category_code);
      return {
        category_code: cw.category_code,
        category_name: cat?.category_name || cw.category_code,
        raw_weight: cw.raw_weight,
        normalized_weight: cw.normalized_weight,
        normalized_pct: Math.round(cw.normalized_weight * 10000) / 100,
      };
    });

    // 5. Condition breakdown percentages
    const totalKm = condSummary.total_panjang_km;
    const conditionBreakdown = {
      baik_km: condSummary.baik_km,
      baik_pct: totalKm > 0 ? Math.round((condSummary.baik_km / totalKm) * 10000) / 100 : 0,
      sedang_km: condSummary.sedang_km,
      sedang_pct: totalKm > 0 ? Math.round((condSummary.sedang_km / totalKm) * 10000) / 100 : 0,
      rusak_ringan_km: condSummary.rusak_ringan_km,
      rusak_ringan_pct: totalKm > 0 ? Math.round((condSummary.rusak_ringan_km / totalKm) * 10000) / 100 : 0,
      rusak_berat_km: condSummary.rusak_berat_km,
      rusak_berat_pct: totalKm > 0 ? Math.round((condSummary.rusak_berat_km / totalKm) * 10000) / 100 : 0,
    };

    // 6. Benchmark concordance audit if benchmark mode
    let benchmarkAudit;
    if (operatingMode === 'BENCHMARK_2024') {
      const audit = this.benchmarkService.evaluateBenchmarkConcordance();
      benchmarkAudit = {
        historicalTop105Count: audit.historical_top105_count,
        policyTop105Count: audit.policy_top105_count,
        concordantRoadsCount: audit.overlap_count,
        concordancePct: audit.concordance_pct,
      };
    }

    return {
      operatingMode,
      modelCode,
      run_id: latestRun.run.run_id,
      kpis: {
        totalRoads: 350,
        totalLengthKm: condSummary.total_panjang_km,
        mantapKm: condSummary.mantap_km,
        mantapPct: condSummary.mantap_pct,
        tidakMantapKm: condSummary.tidak_mantap_km,
        tidakMantapPct: condSummary.tidak_mantap_pct,
        top35Count: 35,
        top105Count: 105,
      },
      top10,
      categoryWeights,
      conditionBreakdown,
      benchmarkAudit,
    };
  }

  /**
   * Get complete dataset for all 350 roads in the priority table.
   */
  getPriorityTableData(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): PriorityTableRow[] {
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode);
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) {
      throw new Error(`SCORING_RUN_UNAVAILABLE for table data`);
    }

    const stmt = this.db.prepare(`
      SELECT
        s.run_id,
        r.road_key,
        r.nomor_ruas,
        r.display_name,
        r.canonical_name,
        r.district_name,
        r.village_coverage,
        r.length_km_official,
        r.width_m_official,
        s.priority_rank,
        s.final_score,
        s.tier_category,
        s.subtotal_teknis,
        s.subtotal_akses,
        s.subtotal_pelayanan,
        s.subtotal_spasial,
        COALESCE(c.mantap_pct, 0.0) as mantap_pct,
        COALESCE(c.tidak_mantap_pct, 0.0) as tidak_mantap_pct,
        COALESCE(c.baik_km, 0.0) as baik_km,
        COALESCE(c.sedang_km, 0.0) as sedang_km,
        COALESCE(c.rusak_ringan_km, 0.0) as rusak_ringan_km,
        COALESCE(c.rusak_berat_km, 0.0) as rusak_berat_km
      FROM road_priority_scores s
      JOIN roads r ON s.road_key = r.road_key
      LEFT JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = 2025
      WHERE s.run_id = ?
      ORDER BY s.priority_rank ASC
    `);

    return stmt.all(latestRun.run.run_id) as unknown as PriorityTableRow[];
  }

  /**
   * Get single road explainability and 17-factor decomposition profile.
   */
  getRoadDetailData(
    roadKey: string,
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): RoadDetailData | null {
    const road = this.roadService.getRoadByKey(roadKey);
    if (!road) return null;

    const condition = this.conditionService.getConditionByRoadKey(roadKey, 2025);
    if (!condition) return null;

    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode);
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) return null;

    const scoreRowStmt = this.db.prepare(`
      SELECT * FROM road_priority_scores
      WHERE run_id = ? AND road_key = ?
    `);
    const scoreRow = scoreRowStmt.get(latestRun.run.run_id, roadKey) as unknown as any;
    if (!scoreRow) return null;

    const breakdown = JSON.parse(scoreRow.factor_breakdown);
    const subtotalsMap: Record<string, any> = breakdown.subtotals || {};
    const rawFactors = breakdown.factors || {};
    const factorsList: any[] = Array.isArray(rawFactors) ? rawFactors : Object.values(rawFactors);

    const categories = this.modelService.getCategories();
    const catMap = new Map(categories.map((c) => [c.category_code, c]));

    const varDefs = this.modelService.getVariables();
    const varMap = new Map(varDefs.map((v) => [v.variable_code, v]));

    // Model Category Weights
    const model = this.modelService.getBaselineModel();
    const catWeightsMap = new Map(model?.category_weights.map((c) => [c.category_code, c]));

    // Category contributions
    const categoryContributions = categories.map((c) => {
      const sub = subtotalsMap[c.category_code]?.subtotal || 0.0;
      const cw = catWeightsMap.get(c.category_code);
      const pctOfScore = scoreRow.final_score > 0 ? (sub / scoreRow.final_score) * 100 : 0;
      return {
        category_code: c.category_code,
        category_name: c.category_name,
        raw_weight: cw?.raw_weight || c.default_weight_raw,
        normalized_weight: cw?.normalized_weight || 0,
        subtotal: sub,
        percentage_of_score: Math.round(pctOfScore * 100) / 100,
      };
    });

    // 17 factors
    const factors = factorsList.map((f: any) => {
      const def = varMap.get(f.variable_code);
      const cat = catMap.get(f.category_code);
      return {
        variable_code: f.variable_code,
        variable_label: def?.variable_label || f.variable_code,
        definition: def?.definition || '',
        category_code: f.category_code,
        category_name: cat?.category_name || f.category_code,
        raw_value: f.raw_value,
        raw_unit: def?.raw_unit || '',
        optimization_dir: def?.optimization_dir || 'BENEFIT',
        normalized_value: f.normalized_value,
        local_weight: f.local_weight,
        effective_weight: f.effective_weight,
        contribution: f.contribution,
      };
    });

    // Invariant calculations
    const sumSubtotals = categoryContributions.reduce((sum, c) => sum + c.subtotal, 0);
    const sumContributions = factors.reduce((sum, f) => sum + f.contribution, 0);
    const deltaSub = Math.abs(sumSubtotals - scoreRow.final_score);
    const deltaContrib = Math.abs(sumContributions - scoreRow.final_score);

    return {
      identity: {
        road_key: road.road_key,
        nomor_ruas: road.nomor_ruas,
        display_name: road.display_name,
        canonical_name: road.canonical_name,
        district_name: road.district_name,
        village_coverage: road.village_coverage,
        length_km_official: road.length_km_official,
        width_m_official: road.width_m_official,
        identity_status: road.identity_status,
      },
      condition2025: {
        total_panjang_km: condition.total_panjang_km,
        mantap_km: condition.mantap_km,
        mantap_pct: condition.mantap_pct,
        tidak_mantap_km: condition.tidak_mantap_km,
        tidak_mantap_pct: condition.tidak_mantap_pct,
        baik_km: condition.baik_km,
        baik_pct: condition.baik_pct,
        sedang_km: condition.sedang_km,
        sedang_pct: condition.sedang_pct,
        rusak_ringan_km: condition.rusak_ringan_km,
        rusak_ringan_pct: condition.rusak_ringan_pct,
        rusak_berat_km: condition.rusak_berat_km,
        rusak_berat_pct: condition.rusak_berat_pct,
        source_filename: condition.source_filename,
        authority_status: condition.authority_status,
      },
      priorityResult: {
        priority_rank: scoreRow.priority_rank,
        final_score: scoreRow.final_score,
        tier_category: scoreRow.tier_category,
        operating_mode: operatingMode,
        model_code: modelCode,
        run_id: latestRun.run.run_id,
      },
      categoryContributions,
      factors,
      mathematicalAudit: {
        final_score: scoreRow.final_score,
        sum_subtotals: sumSubtotals,
        sum_contributions: sumContributions,
        delta_subtotals: deltaSub,
        delta_contributions: deltaContrib,
        is_exact: deltaSub < 1e-9 && deltaContrib < 1e-9,
      },
    };
  }

  /**
   * Get system provenance checklist and status.
   */
  getProvenanceData() {
    const roadCountStmt = this.db.prepare('SELECT COUNT(*) as c FROM roads');
    const roadCount = (roadCountStmt.get() as any).c;

    const crosswalkStmt = this.db.prepare(
      "SELECT COUNT(*) as c FROM source_crosswalk WHERE match_status = 'VERIFIED'"
    );
    const crosswalkCount = (crosswalkStmt.get() as any).c;

    const conditionStmt = this.db.prepare(
      'SELECT COUNT(*) as c FROM road_conditions WHERE survey_year = 2025'
    );
    const conditionCount = (conditionStmt.get() as any).c;

    const geomStmt = this.db.prepare('SELECT COUNT(*) as c FROM road_geometries');
    const geomCount = (geomStmt.get() as any).c;

    const districtStmt = this.db.prepare('SELECT COUNT(*) as c FROM districts');
    const districtCount = (districtStmt.get() as any).c;

    const villageStmt = this.db.prepare('SELECT COUNT(*) as c FROM villages');
    const villageCount = (villageStmt.get() as any).c;

    const facStmt = this.db.prepare('SELECT COUNT(*) as c FROM public_facilities');
    const facCount = (facStmt.get() as any).c;

    const varStmt = this.db.prepare('SELECT COUNT(*) as c FROM variable_definitions');
    const varCount = (varStmt.get() as any).c;

    const catStmt = this.db.prepare('SELECT COUNT(*) as c FROM categories');
    const catCount = (catStmt.get() as any).c;

    return {
      checklist: [
        {
          label: 'Registri Ruas Jalan Otoritatif (SK Bupati)',
          current: roadCount,
          expected: 350,
          unit: 'ruas',
          status: roadCount === 350 ? 'VERIFIED' : 'FAILED',
          source: 'SK_BUPATI_HSS_2023_2024 / road_registry_authoritative.csv',
        },
        {
          label: 'Matriks Penyelarasan Sistem (Source Crosswalk)',
          current: crosswalkCount,
          expected: 1400,
          unit: 'pemetaan',
          status: crosswalkCount === 1400 ? 'VERIFIED' : 'FAILED',
          source: '4 Sumber: Dashboard 2025, QGIS, Historis, ML Clean',
        },
        {
          label: 'Otoritas Kondisi Jalan Resmi 2025',
          current: conditionCount,
          expected: 350,
          unit: 'ruas (732.460 km)',
          status: conditionCount === 350 ? 'VERIFIED' : 'FAILED',
          source: 'Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx',
        },
        {
          label: 'Geometri Spasial Jalan Kabupaten',
          current: geomCount,
          expected: 350,
          unit: 'linestring WGS84',
          status: geomCount === 350 ? 'VERIFIED' : 'FAILED',
          source: 'roads_county.geojson (Konektor sintetis dieksklusi)',
        },
        {
          label: 'Wilayah Administrasi Kecamatan',
          current: districtCount,
          expected: 11,
          unit: 'kecamatan',
          status: districtCount === 11 ? 'VERIFIED' : 'FAILED',
          source: 'districts.geojson / BPS HSS',
        },
        {
          label: 'Wilayah Administrasi Desa / Kelurahan',
          current: villageCount,
          expected: 148,
          unit: 'desa/kelurahan',
          status: villageCount === 148 ? 'VERIFIED' : 'FAILED',
          source: 'villages.geojson / BPS HSS',
        },
        {
          label: 'Sebaran Fasilitas Publik',
          current: facCount,
          expected: 285,
          unit: 'titik fasilitas',
          status: facCount === 285 ? 'VERIFIED' : 'FAILED',
          source: 'RSUD (2), Puskesmas (21), SD/SMP (251), Pasar (11)',
        },
        {
          label: 'Kategori Pembobotan Hierarkis',
          current: catCount,
          expected: 4,
          unit: 'kategori',
          status: catCount === 4 ? 'VERIFIED' : 'FAILED',
          source: 'Teknis, Aksesibilitas, Yanmas, Spasial-Demografi',
        },
        {
          label: 'Variabel Normatif Skoring',
          current: varCount,
          expected: 17,
          unit: 'variabel',
          status: varCount === 17 ? 'VERIFIED' : 'FAILED',
          source: '17 Variabel Normatif (label_top105 dieksklusi)',
        },
      ],
      activeModel: {
        code: 'POLICY_DEFAULT_V1',
        name: 'Policy Default v1 (Neutral Local Weights)',
        lifecycle: 'BASELINE_LOCKED',
        immutable: true,
      },
      operatingMode: 'OPERATIONAL_2025',
    };
  }
}
