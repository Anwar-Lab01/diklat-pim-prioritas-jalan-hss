import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase, withTransaction } from '../db/connection.ts';
import type {
  RoadFeatureVector,
  ScoringModelConfig,
  ScoringCategoryConfig,
  ScoringVariableConfig,
  RankedRoadScore,
} from '../engine/types.ts';
import { rankRoads } from '../engine/scoringEngine.ts';

export interface ScoringRunEntity {
  run_id: string;
  model_id: string;
  operating_mode: 'OPERATIONAL_2025' | 'BENCHMARK_2024';
  roads_evaluated: number;
  top105_concordance: number | null;
  execution_time_ms: number;
  run_by_user_id: string;
  executed_at: string;
}

export class ScoringService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Load model configuration and weights from the database.
   */
  loadModelConfig(modelCode: string = 'POLICY_DEFAULT_V1'): ScoringModelConfig {
    const modelStmt = this.db.prepare(
      'SELECT model_id, model_code FROM priority_models WHERE model_code = ?'
    );
    const model = modelStmt.get(modelCode) as unknown as
      | { model_id: string; model_code: string }
      | undefined;

    if (!model) {
      throw new Error(`MODEL_NOT_FOUND: Model with code '${modelCode}' does not exist.`);
    }

    const catStmt = this.db.prepare(`
      SELECT mc.category_code, c.category_name, mc.raw_weight
      FROM model_category_weights mc
      JOIN categories c ON mc.category_code = c.category_code
      WHERE mc.model_id = ?
      ORDER BY c.display_order ASC
    `);
    const catRows = catStmt.all(model.model_id) as unknown as Array<{
      category_code: string;
      category_name: string;
      raw_weight: number;
    }>;

    const varStmt = this.db.prepare(`
      SELECT mv.variable_code, mv.category_code, mv.local_weight
      FROM model_variable_weights mv
      JOIN variable_definitions vd ON mv.variable_code = vd.variable_code
      WHERE mv.model_id = ?
      ORDER BY vd.display_order ASC
    `);
    const varRows = varStmt.all(model.model_id) as unknown as Array<{
      variable_code: string;
      category_code: string;
      local_weight: number;
    }>;

    const categories: ScoringCategoryConfig[] = catRows.map((c) => ({
      category_code: c.category_code,
      category_name: c.category_name,
      raw_weight: c.raw_weight,
      variable_codes: varRows
        .filter((v) => v.category_code === c.category_code)
        .map((v) => v.variable_code),
    }));

    const variables: ScoringVariableConfig[] = varRows.map((v) => ({
      variable_code: v.variable_code,
      category_code: v.category_code,
      local_weight: v.local_weight,
    }));

    return {
      model_id: model.model_id,
      model_code: model.model_code,
      categories,
      variables,
    };
  }

  /**
   * Load raw and normalized feature vectors for all 350 canonical roads.
   */
  loadRoadFeatureVectors(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025'
  ): RoadFeatureVector[] {
    const roadsStmt = this.db.prepare(`
      SELECT
        r.road_key,
        r.nomor_ruas,
        r.display_name,
        r.district_name,
        COALESCE(c.mantap_pct, 0.0) as mantap_pct
      FROM roads r
      LEFT JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = 2025
      ORDER BY r.nomor_ruas ASC
    `);
    const roads = roadsStmt.all() as unknown as Array<{
      road_key: string;
      nomor_ruas: string;
      display_name: string;
      district_name: string;
      mantap_pct: number;
    }>;

    const obsStmt = this.db.prepare(`
      SELECT road_key, variable_code, raw_value, normalized_value
      FROM road_variable_observations
      WHERE operating_mode = ?
      ORDER BY road_key ASC, variable_code ASC
    `);
    const obsRows = obsStmt.all(operatingMode) as unknown as Array<{
      road_key: string;
      variable_code: string;
      raw_value: number;
      normalized_value: number;
    }>;

    // Group observations by road_key
    const obsMap = new Map<string, { norms: Record<string, number>; rawPop: number }>();
    for (const obs of obsRows) {
      if (!obsMap.has(obs.road_key)) {
        obsMap.set(obs.road_key, { norms: {}, rawPop: 0.0 });
      }
      const entry = obsMap.get(obs.road_key)!;
      entry.norms[obs.variable_code] = obs.normalized_value;
      if (obs.variable_code === 'norm_penduduk_dilayani') {
        entry.rawPop = obs.raw_value;
      }
    }

    const featureVectors: RoadFeatureVector[] = [];
    for (const r of roads) {
      const entry = obsMap.get(r.road_key);
      if (!entry) {
        throw new Error(
          `MISSING_OBSERVATIONS: No observations found for road '${r.road_key}' in mode '${operatingMode}'.`
        );
      }

      featureVectors.push({
        road_key: r.road_key,
        nomor_ruas: r.nomor_ruas,
        display_name: r.display_name,
        district_name: r.district_name,
        mantap_pct: r.mantap_pct,
        penduduk_dilayani_raw: entry.rawPop,
        normalized_values: entry.norms,
      });
    }

    return featureVectors;
  }

  /**
   * Execute full scoring pipeline and persist run + scores to the database.
   */
  executeScoringRun(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1',
    userId: string = 'SYSTEM_SCORING_ENGINE'
  ): {
    runId: string;
    executionTimeMs: number;
    rankedScores: RankedRoadScore[];
  } {
    const startTime = performance.now();

    const modelConfig = this.loadModelConfig(modelCode);
    const featureVectors = this.loadRoadFeatureVectors(operatingMode);

    // Pure deterministic calculation
    const rankedScores = rankRoads(featureVectors, modelConfig);

    const calcDurationMs = Math.round(performance.now() - startTime);

    // Persist results within transaction
    const runId = crypto.randomUUID();

    withTransaction(this.db, () => {
      // 1. Insert scoring_runs record
      const runStmt = this.db.prepare(`
        INSERT INTO scoring_runs (
          run_id,
          model_id,
          operating_mode,
          roads_evaluated,
          top105_concordance,
          execution_time_ms,
          run_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      runStmt.run(
        runId,
        modelConfig.model_id,
        operatingMode,
        rankedScores.length,
        null, // populated separately by benchmark service if desired
        calcDurationMs,
        userId
      );

      // 2. Insert 350 road_priority_scores records
      const scoreStmt = this.db.prepare(`
        INSERT INTO road_priority_scores (
          score_id,
          run_id,
          road_key,
          final_score,
          priority_rank,
          tier_category,
          subtotal_teknis,
          subtotal_akses,
          subtotal_pelayanan,
          subtotal_spasial,
          factor_breakdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const r of rankedScores) {
        const scoreId = crypto.randomUUID();
        const subTeknis = r.category_subtotals['TEKNIS_JALAN']?.subtotal || 0.0;
        const subAkses = r.category_subtotals['AKSESIBILITAS']?.subtotal || 0.0;
        const subPelayanan = r.category_subtotals['PELAYANAN_MASYARAKAT']?.subtotal || 0.0;
        const subSpasial = r.category_subtotals['SPASIAL_DEMOGRAFI']?.subtotal || 0.0;

        const breakdownJson = JSON.stringify({
          subtotals: r.category_subtotals,
          factors: r.factor_contributions,
        });

        scoreStmt.run(
          scoreId,
          runId,
          r.road_key,
          r.final_score,
          r.priority_rank,
          r.tier_category,
          subTeknis,
          subAkses,
          subPelayanan,
          subSpasial,
          breakdownJson
        );
      }
    });

    const totalDurationMs = Math.round(performance.now() - startTime);

    return {
      runId,
      executionTimeMs: totalDurationMs,
      rankedScores,
    };
  }

  /**
   * Retrieve the latest scoring run for a given mode and model.
   */
  getLatestScoringRun(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): {
    run: ScoringRunEntity;
    scores: Array<{
      road_key: string;
      final_score: number;
      priority_rank: number;
      tier_category: string;
      subtotal_teknis: number;
      subtotal_akses: number;
      subtotal_pelayanan: number;
      subtotal_spasial: number;
      factor_breakdown: string;
    }>;
  } | null {
    const model = this.loadModelConfig(modelCode);
    const runStmt = this.db.prepare(`
      SELECT * FROM scoring_runs
      WHERE model_id = ? AND operating_mode = ?
      ORDER BY executed_at DESC
      LIMIT 1
    `);
    const run = runStmt.get(model.model_id, operatingMode) as unknown as
      | ScoringRunEntity
      | undefined;

    if (!run) return null;

    const scoresStmt = this.db.prepare(`
      SELECT
        road_key,
        final_score,
        priority_rank,
        tier_category,
        subtotal_teknis,
        subtotal_akses,
        subtotal_pelayanan,
        subtotal_spasial,
        factor_breakdown
      FROM road_priority_scores
      WHERE run_id = ?
      ORDER BY priority_rank ASC
    `);
    const scores = scoresStmt.all(run.run_id) as unknown as any[];

    return { run, scores };
  }
}
