import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  CATEGORY_DEFINITIONS,
  VARIABLE_DEFINITIONS,
  SEED_FILES,
  AUTHORITY_INVARIANTS,
} from '../config/constants.ts';
import { parseCsv } from './csvParser.ts';

interface BaselineCanonicalRow {
  road_key: string;
  road_id: string;
  nomor_ruas: string;
  canonical_name: string;
  display_name: string;
  norm_panjang_ruas: string;
  norm_lebar_ruas: string;
  norm_kondisi_sedang: string;
  norm_rusak_ringan: string;
  norm_rusak_berat: string;
  norm_permukaan_aspal_penmac: string;
  norm_permukaan_beton: string;
  norm_penduduk_dilayani: string;
  norm_desa_dilalui: string;
  norm_kecamatan_dilalui: string;
  norm_koneksi_jalan_provinsi: string;
  norm_koneksi_jalan_nasional: string;
  norm_jarak_rsud_cost: string;
  norm_jarak_puskesmas_cost: string;
  norm_jarak_sd_smp_cost: string;
  norm_jarak_pasar_cost: string;
  norm_jarak_ibukota_kabupaten_cost: string;
  label_top105?: string;
  [key: string]: any;
}

export function seedModelDefinitions(db: DatabaseSync): {
  insertedCategories: number;
  insertedVariables: number;
  insertedModels: number;
  insertedCategoryWeights: number;
  insertedVariableWeights: number;
  insertedObservations: number;
} {
  // 1. Seed Categories (4 categories)
  const insertCatStmt = db.prepare(`
    INSERT INTO categories (
      category_code,
      category_name,
      description,
      display_order,
      default_weight_raw
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(category_code) DO UPDATE SET
      category_name = excluded.category_name,
      description = excluded.description,
      display_order = excluded.display_order,
      default_weight_raw = excluded.default_weight_raw
  `);

  let insertedCategories = 0;
  let rawCategorySum = 0;
  for (const cat of CATEGORY_DEFINITIONS) {
    insertCatStmt.run(
      cat.category_code,
      cat.category_name,
      cat.description,
      cat.display_order,
      cat.default_weight_raw
    );
    rawCategorySum += cat.default_weight_raw;
    insertedCategories++;
  }

  // 2. Seed Variable Definitions (17 variables - NO label_top105)
  const insertVarStmt = db.prepare(`
    INSERT INTO variable_definitions (
      variable_code,
      category_code,
      variable_label,
      definition,
      optimization_dir,
      raw_unit,
      raw_source_field,
      normalization_rule,
      param_min,
      param_max,
      is_recomputable,
      display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(variable_code) DO UPDATE SET
      category_code = excluded.category_code,
      variable_label = excluded.variable_label,
      definition = excluded.definition,
      optimization_dir = excluded.optimization_dir,
      raw_unit = excluded.raw_unit,
      raw_source_field = excluded.raw_source_field,
      normalization_rule = excluded.normalization_rule,
      param_min = excluded.param_min,
      param_max = excluded.param_max,
      is_recomputable = excluded.is_recomputable,
      display_order = excluded.display_order
  `);

  let insertedVariables = 0;
  for (const v of VARIABLE_DEFINITIONS) {
    insertVarStmt.run(
      v.variable_code,
      v.category_code,
      v.variable_label,
      v.definition,
      v.optimization_dir,
      v.raw_unit,
      v.raw_source_field,
      v.normalization_rule,
      v.param_min,
      v.param_max,
      1,
      v.display_order
    );
    insertedVariables++;
  }

  // 3. Seed POLICY_DEFAULT_V1 Model
  const modelId = '00000000-0000-5000-a000-000000000001';
  const modelCode = 'POLICY_DEFAULT_V1';

  const insertModelStmt = db.prepare(`
    INSERT INTO priority_models (
      model_id,
      model_code,
      model_name,
      description,
      model_lifecycle,
      operating_mode,
      is_locked,
      created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_code) DO UPDATE SET
      model_name = excluded.model_name,
      description = excluded.description,
      model_lifecycle = excluded.model_lifecycle,
      operating_mode = excluded.operating_mode,
      is_locked = excluded.is_locked
  `);

  insertModelStmt.run(
    modelId,
    modelCode,
    'Kebijakan Default Baseline v1 (Bobot Lokal Netral)',
    'Model acuan dasar (baseline) dengan 4 bobot kategori historis dan pembobotan lokal netral (equal local weights). Dikunci permanen sebagai tolok ukur.',
    'BASELINE_LOCKED',
    'OPERATIONAL_2025',
    1,
    'SYSTEM_AUTHORITY'
  );
  const insertedModels = 1;

  // 4. Seed Category Weights for POLICY_DEFAULT_V1
  const insertCatWeightStmt = db.prepare(`
    INSERT INTO model_category_weights (
      weight_id,
      model_id,
      category_code,
      raw_weight,
      normalized_weight,
      is_locked
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, category_code) DO UPDATE SET
      raw_weight = excluded.raw_weight,
      normalized_weight = excluded.normalized_weight,
      is_locked = excluded.is_locked
  `);

  let insertedCategoryWeights = 0;
  const categoryNormalizedMap = new Map<string, number>();

  for (const cat of CATEGORY_DEFINITIONS) {
    const normWeight = cat.default_weight_raw / rawCategorySum;
    categoryNormalizedMap.set(cat.category_code, normWeight);

    const weightId = crypto
      .createHash('md5')
      .update(`catweight:${modelId}:${cat.category_code}`)
      .digest('hex');
    const uuidWeightId = `${weightId.slice(0, 8)}-${weightId.slice(8, 12)}-${weightId.slice(12, 16)}-${weightId.slice(16, 20)}-${weightId.slice(20, 32)}`;

    insertCatWeightStmt.run(
      uuidWeightId,
      modelId,
      cat.category_code,
      cat.default_weight_raw,
      normWeight,
      1 // Locked for baseline
    );
    insertedCategoryWeights++;
  }

  // 5. Seed Variable Local & Effective Weights for POLICY_DEFAULT_V1
  const insertVarWeightStmt = db.prepare(`
    INSERT INTO model_variable_weights (
      weight_id,
      model_id,
      variable_code,
      category_code,
      local_weight,
      effective_weight,
      is_locked
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, variable_code) DO UPDATE SET
      category_code = excluded.category_code,
      local_weight = excluded.local_weight,
      effective_weight = excluded.effective_weight,
      is_locked = excluded.is_locked
  `);

  let insertedVariableWeights = 0;
  for (const v of VARIABLE_DEFINITIONS) {
    const catNormWeight = categoryNormalizedMap.get(v.category_code) || 0;
    const localWeight = v.local_weight_default;
    const effectiveWeight = catNormWeight * localWeight;

    const weightId = crypto
      .createHash('md5')
      .update(`varweight:${modelId}:${v.variable_code}`)
      .digest('hex');
    const uuidWeightId = `${weightId.slice(0, 8)}-${weightId.slice(8, 12)}-${weightId.slice(12, 16)}-${weightId.slice(16, 20)}-${weightId.slice(20, 32)}`;

    insertVarWeightStmt.run(
      uuidWeightId,
      modelId,
      v.variable_code,
      v.category_code,
      localWeight,
      effectiveWeight,
      1 // Locked for baseline
    );
    insertedVariableWeights++;
  }

  // 6. Ingest Observations (Benchmark 2024 & Operational 2025)
  const baselineCsv = fs.readFileSync(SEED_FILES.priorityBaselineCanonical, 'utf8');
  const baselineRows = parseCsv<BaselineCanonicalRow>(baselineCsv);

  // Load conditions for live 2025 condition overlay
  const conditionsRows = db
    .prepare('SELECT road_key, sedang_pct, rusak_ringan_pct, rusak_berat_pct FROM road_conditions WHERE survey_year = 2025')
    .all() as Array<{
    road_key: string;
    sedang_pct: number;
    rusak_ringan_pct: number;
    rusak_berat_pct: number;
  }>;

  const conditionsMap = new Map(conditionsRows.map((c) => [c.road_key, c]));

  const insertObsStmt = db.prepare(`
    INSERT INTO road_variable_observations (
      observation_id,
      road_key,
      operating_mode,
      variable_code,
      raw_value,
      normalized_value,
      calculated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(road_key, operating_mode, variable_code) DO UPDATE SET
      raw_value = excluded.raw_value,
      normalized_value = excluded.normalized_value,
      calculated_at = datetime('now')
  `);

  let insertedObservations = 0;

  for (const row of baselineRows) {
    const cond2025 = conditionsMap.get(row.road_key);

    for (const v of VARIABLE_DEFINITIONS) {
      const varCode = v.variable_code;
      const benchmarkNormStr = row[varCode];
      const benchmarkNormVal = benchmarkNormStr !== undefined ? parseFloat(benchmarkNormStr) || 0.0 : 0.0;
      const clampedBench = Math.min(1.0, Math.max(0.0, benchmarkNormVal));

      // 6.1 Insert BENCHMARK_2024 observation
      const benchObsHash = crypto
        .createHash('md5')
        .update(`obs:BENCHMARK_2024:${row.road_key}:${varCode}`)
        .digest('hex');
      const benchObsId = `${benchObsHash.slice(0, 8)}-${benchObsHash.slice(8, 12)}-${benchObsHash.slice(12, 16)}-${benchObsHash.slice(16, 20)}-${benchObsHash.slice(20, 32)}`;

      insertObsStmt.run(
        benchObsId,
        row.road_key,
        'BENCHMARK_2024',
        varCode,
        clampedBench, // raw value approximation
        clampedBench
      );
      insertedObservations++;

      // 6.2 Insert OPERATIONAL_2025 observation
      let opNormVal = clampedBench;
      let opRawVal = clampedBench;

      if (varCode === 'norm_kondisi_sedang' && cond2025) {
        opRawVal = cond2025.sedang_pct;
        opNormVal = Math.min(1.0, Math.max(0.0, cond2025.sedang_pct / 100.0));
      } else if (varCode === 'norm_rusak_ringan' && cond2025) {
        opRawVal = cond2025.rusak_ringan_pct;
        opNormVal = Math.min(1.0, Math.max(0.0, cond2025.rusak_ringan_pct / 100.0));
      } else if (varCode === 'norm_rusak_berat' && cond2025) {
        opRawVal = cond2025.rusak_berat_pct;
        opNormVal = Math.min(1.0, Math.max(0.0, cond2025.rusak_berat_pct / 100.0));
      }

      const opObsHash = crypto
        .createHash('md5')
        .update(`obs:OPERATIONAL_2025:${row.road_key}:${varCode}`)
        .digest('hex');
      const opObsId = `${opObsHash.slice(0, 8)}-${opObsHash.slice(8, 12)}-${opObsHash.slice(12, 16)}-${opObsHash.slice(16, 20)}-${opObsHash.slice(20, 32)}`;

      insertObsStmt.run(
        opObsId,
        row.road_key,
        'OPERATIONAL_2025',
        varCode,
        opRawVal,
        opNormVal
      );
      insertedObservations++;
    }
  }

  return {
    insertedCategories,
    insertedVariables,
    insertedModels,
    insertedCategoryWeights,
    insertedVariableWeights,
    insertedObservations,
  };
}
