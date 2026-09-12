// src/server.ts
import { fileURLToPath as fileURLToPath4 } from "node:url";

// src/server/server.ts
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import express from "express";

// src/config/constants.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function getProjectRoot() {
  if (process.env.PROJECT_ROOT) {
    return path.resolve(process.env.PROJECT_ROOT);
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return process.cwd();
  }
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, "package.json")) && fs.existsSync(path.join(curr, "01_authoritative_seed"))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(__dirname, "../../");
}
var PROJECT_ROOT = getProjectRoot();
var DB_DIR = path.resolve(PROJECT_ROOT, "data");
var DEPLOY_DB_PATH = path.resolve(DB_DIR, "diklat_pim_deploy.db");
var DEFAULT_DEV_DB_PATH = path.resolve(DB_DIR, "diklat_pim.db");
var DB_PATH = process.env.DB_PATH ? path.resolve(PROJECT_ROOT, process.env.DB_PATH) : process.env.NODE_ENV === "production" || process.env.VERCEL || !fs.existsSync(DEFAULT_DEV_DB_PATH) ? DEPLOY_DB_PATH : DEFAULT_DEV_DB_PATH;
var SEED_BASE_DIR = path.resolve(
  PROJECT_ROOT,
  "01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry"
);
var SEED_FILES = {
  roadRegistry: path.resolve(SEED_BASE_DIR, "authoritative/road_registry_authoritative.csv"),
  roadMaster: path.resolve(SEED_BASE_DIR, "master/road_master.csv"),
  roadAliases: path.resolve(SEED_BASE_DIR, "authoritative/road_aliases_authoritative.csv"),
  sourceCrosswalk: path.resolve(SEED_BASE_DIR, "authoritative/source_crosswalk.csv"),
  roadConditions2025: path.resolve(SEED_BASE_DIR, "conditions/road_conditions_2025.csv"),
  roadsCountyGeoJson: path.resolve(SEED_BASE_DIR, "spatial/roads_county.geojson"),
  roadsProvincialGeoJson: path.resolve(SEED_BASE_DIR, "spatial/roads_provincial.geojson"),
  roadsNationalGeoJson: path.resolve(SEED_BASE_DIR, "spatial/roads_national.geojson"),
  networkConnectorsGeoJson: path.resolve(SEED_BASE_DIR, "spatial/network_connectors.geojson"),
  rtrwPolaRuangGeoJson: path.resolve(SEED_BASE_DIR, "spatial/rtrw_pola_ruang.geojson"),
  rtrwCategoriesCsv: path.resolve(SEED_BASE_DIR, "spatial/rtrw_pola_ruang_categories.csv"),
  publicFacilitiesGeoJson: path.resolve(SEED_BASE_DIR, "facilities/public_facilities.geojson"),
  districtsGeoJson: path.resolve(SEED_BASE_DIR, "administration/districts.geojson"),
  districtsMaster: path.resolve(SEED_BASE_DIR, "administration/district_master.csv"),
  villagesGeoJson: path.resolve(SEED_BASE_DIR, "administration/villages.geojson"),
  villagesMaster: path.resolve(SEED_BASE_DIR, "administration/village_master.csv"),
  priorityBaselineCanonical: path.resolve(
    SEED_BASE_DIR,
    "priority/priority_baseline_normative_canonical.csv"
  )
};
var AUTHORITY_INVARIANTS = {
  CANONICAL_ROAD_COUNT: 350,
  CANONICAL_KEY_PREFIX: "HSS-KAB-",
  CANONICAL_RANGE_START: 1,
  CANONICAL_RANGE_END: 350,
  CROSSWALK_COUNT: 1400,
  TOTAL_LENGTH_KM_2025: 732.46,
  MANTAP_KM_2025: 392.89,
  TIDAK_MANTAP_KM_2025: 339.57,
  DISTRICT_COUNT: 11,
  VILLAGE_COUNT: 148,
  PUBLIC_FACILITY_COUNT: 285,
  PROVINCIAL_ROAD_COUNT: 4,
  NATIONAL_ROAD_COUNT: 8,
  CONNECTOR_COUNT: 4,
  REFERENCE_NETWORK_TOTAL: 16,
  CATEGORY_COUNT: 4,
  VARIABLE_COUNT: 17
};
var VARIABLE_DEFINITIONS = [
  // Kategori 1: Data Teknis Jalan (7 Variabel, Local Weight = 1/7)
  {
    variable_code: "norm_panjang_ruas",
    category_code: "TEKNIS_JALAN",
    variable_label: "Panjang Ruas Jalan",
    definition: "Panjang bentang fisik ruas jalan SK.",
    optimization_dir: "BENEFIT",
    raw_unit: "km",
    raw_source_field: "PANJANG (KM)",
    normalization_rule: "LINEAR_MINMAX",
    param_min: 0.06,
    param_max: 17.11,
    local_weight_default: 1 / 7,
    display_order: 1
  },
  {
    variable_code: "norm_lebar_ruas",
    category_code: "TEKNIS_JALAN",
    variable_label: "Lebar Perkerasan Jalan",
    definition: "Lebar perkerasan rata-rata badan jalan.",
    optimization_dir: "BENEFIT",
    raw_unit: "m",
    raw_source_field: "Lbr_Keras",
    normalization_rule: "CLAMPED_MINMAX",
    param_min: 3,
    param_max: 14,
    local_weight_default: 1 / 7,
    display_order: 2
  },
  {
    variable_code: "norm_kondisi_sedang",
    category_code: "TEKNIS_JALAN",
    variable_label: "Proporsi Rusak Sedang",
    definition: "Persentase segmen dalam kondisi rusak sedang yang membutuhkan pemeliharaan berkala.",
    optimization_dir: "BENEFIT",
    raw_unit: "rasio",
    raw_source_field: "sedang_pct",
    normalization_rule: "PERCENTAGE_RATIO",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 7,
    display_order: 3
  },
  {
    variable_code: "norm_rusak_ringan",
    category_code: "TEKNIS_JALAN",
    variable_label: "Proporsi Rusak Ringan",
    definition: "Persentase segmen dalam kondisi rusak ringan yang membutuhkan pemeliharaan rutin.",
    optimization_dir: "BENEFIT",
    raw_unit: "rasio",
    raw_source_field: "rusak_ringan_pct",
    normalization_rule: "PERCENTAGE_RATIO",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 7,
    display_order: 4
  },
  {
    variable_code: "norm_rusak_berat",
    category_code: "TEKNIS_JALAN",
    variable_label: "Proporsi Rusak Berat",
    definition: "Persentase segmen dalam kondisi rusak berat yang membutuhkan rehabilitasi/rekonstruksi.",
    optimization_dir: "BENEFIT",
    raw_unit: "rasio",
    raw_source_field: "rusak_berat_pct",
    normalization_rule: "PERCENTAGE_RATIO",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 7,
    display_order: 5
  },
  {
    variable_code: "norm_permukaan_aspal_penmac",
    category_code: "TEKNIS_JALAN",
    variable_label: "Proporsi Permukaan Aspal / Penetran Macadam",
    definition: "Persentase lapis permukaan beraspal (Hotmix atau Lapen).",
    optimization_dir: "BENEFIT",
    raw_unit: "rasio",
    raw_source_field: "surface_asphalt_pct_source",
    normalization_rule: "PERCENTAGE_RATIO",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 7,
    display_order: 6
  },
  {
    variable_code: "norm_permukaan_beton",
    category_code: "TEKNIS_JALAN",
    variable_label: "Proporsi Permukaan Rigid Beton",
    definition: "Persentase lapis permukaan kaku beton semen (rigid pavement).",
    optimization_dir: "BENEFIT",
    raw_unit: "rasio",
    raw_source_field: "surface_rigid_pct_source",
    normalization_rule: "PERCENTAGE_RATIO",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 7,
    display_order: 7
  },
  // Kategori 2: Data Aksesibilitas (3 Variabel, Local Weight = 1/3)
  {
    variable_code: "norm_koneksi_jalan_provinsi",
    category_code: "AKSESIBILITAS",
    variable_label: "Konektivitas Jalan Provinsi",
    definition: "Indikator keterhubungan langsung dengan jaringan jalan provinsi.",
    optimization_dir: "BENEFIT",
    raw_unit: "biner",
    raw_source_field: "koneksi_jalan_provinsi",
    normalization_rule: "BINARY_FLAG",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 3,
    display_order: 8
  },
  {
    variable_code: "norm_koneksi_jalan_nasional",
    category_code: "AKSESIBILITAS",
    variable_label: "Konektivitas Jalan Nasional",
    definition: "Indikator keterhubungan langsung dengan jaringan koridor nasional trans-Kalimantan.",
    optimization_dir: "BENEFIT",
    raw_unit: "biner",
    raw_source_field: "koneksi_jalan_nasional",
    normalization_rule: "BINARY_FLAG",
    param_min: 0,
    param_max: 1,
    local_weight_default: 1 / 3,
    display_order: 9
  },
  {
    variable_code: "norm_jarak_ibukota_kabupaten_cost",
    category_code: "AKSESIBILITAS",
    variable_label: "Aksesibilitas Ibukota Kabupaten (Kandangan)",
    definition: "Jarak rute terpendek jaringan jalan menuju pusat pemerintahan di Kandangan.",
    optimization_dir: "COST",
    raw_unit: "meter",
    raw_source_field: "jarak_ibukota_kabupaten",
    normalization_rule: "INVERTED_MINMAX",
    param_min: 257.6,
    param_max: 47122.1,
    local_weight_default: 1 / 3,
    display_order: 10
  },
  // Kategori 3: Data Pelayanan Masyarakat (4 Variabel, Local Weight = 1/4)
  {
    variable_code: "norm_jarak_rsud_cost",
    category_code: "PELAYANAN_MASYARAKAT",
    variable_label: "Aksesibilitas Rumah Sakit Umum Daerah",
    definition: "Jarak jaringan jalan terpendek menuju fasilitas RSUD rujukan tingkat kabupaten.",
    optimization_dir: "COST",
    raw_unit: "meter",
    raw_source_field: "jarak_rsud",
    normalization_rule: "INVERTED_MINMAX",
    param_min: 41.4,
    param_max: 43384.5,
    local_weight_default: 0.25,
    display_order: 11
  },
  {
    variable_code: "norm_jarak_puskesmas_cost",
    category_code: "PELAYANAN_MASYARAKAT",
    variable_label: "Aksesibilitas Puskesmas",
    definition: "Jarak jaringan jalan terpendek menuju fasilitas kesehatan tingkat pertama (Puskesmas).",
    optimization_dir: "COST",
    raw_unit: "meter",
    raw_source_field: "jarak_puskesmas",
    normalization_rule: "INVERTED_MINMAX",
    param_min: 0,
    param_max: 21229.7,
    local_weight_default: 0.25,
    display_order: 12
  },
  {
    variable_code: "norm_jarak_sd_smp_cost",
    category_code: "PELAYANAN_MASYARAKAT",
    variable_label: "Aksesibilitas Pendidikan Dasar (SD/SMP)",
    definition: "Jarak jaringan jalan terpendek menuju fasilitas sekolah dasar atau menengah pertama.",
    optimization_dir: "COST",
    raw_unit: "meter",
    raw_source_field: "jarak_sd_smp",
    normalization_rule: "INVERTED_MINMAX",
    param_min: 0,
    param_max: 8064.6,
    local_weight_default: 0.25,
    display_order: 13
  },
  {
    variable_code: "norm_jarak_pasar_cost",
    category_code: "PELAYANAN_MASYARAKAT",
    variable_label: "Aksesibilitas Pasar Tradisional",
    definition: "Jarak jaringan jalan terpendek menuju titik pasar rakyat/sentra ekonomi lokal.",
    optimization_dir: "COST",
    raw_unit: "meter",
    raw_source_field: "jarak_pasar",
    normalization_rule: "INVERTED_MINMAX",
    param_min: 0,
    param_max: 18270,
    local_weight_default: 0.25,
    display_order: 14
  },
  // Kategori 4: Data Spasial & Demografi (3 Variabel, Local Weight = 1/3)
  {
    variable_code: "norm_penduduk_dilayani",
    category_code: "SPASIAL_DEMOGRAFI",
    variable_label: "Penduduk Terlayani",
    definition: "Jumlah agregat penduduk pada desa/kelurahan yang dilintasi ruas jalan.",
    optimization_dir: "BENEFIT",
    raw_unit: "jiwa",
    raw_source_field: "penduduk_dilayani",
    normalization_rule: "LINEAR_MINMAX",
    param_min: 138,
    param_max: 9090,
    local_weight_default: 1 / 3,
    display_order: 15
  },
  {
    variable_code: "norm_desa_dilalui",
    category_code: "SPASIAL_DEMOGRAFI",
    variable_label: "Cakupan Desa Terlintasi",
    definition: "Jumlah wilayah desa/kelurahan yang dilintasi secara fisik oleh ruas jalan.",
    optimization_dir: "BENEFIT",
    raw_unit: "desa",
    raw_source_field: "desa_dilalui",
    normalization_rule: "LINEAR_MINMAX",
    param_min: 1,
    param_max: 9,
    local_weight_default: 1 / 3,
    display_order: 16
  },
  {
    variable_code: "norm_kecamatan_dilalui",
    category_code: "SPASIAL_DEMOGRAFI",
    variable_label: "Cakupan Kecamatan Terlintasi",
    definition: "Jumlah wilayah kecamatan yang dilintasi oleh bentang ruas jalan.",
    optimization_dir: "BENEFIT",
    raw_unit: "kecamatan",
    raw_source_field: "kecamatan_dilalui",
    normalization_rule: "LINEAR_MINMAX",
    param_min: 1,
    param_max: 3,
    local_weight_default: 1 / 3,
    display_order: 17
  }
];

// src/db/connection.ts
import { DatabaseSync } from "node:sqlite";
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
var dbInstance = null;
function getDatabase(dbPath = DB_PATH) {
  if (dbInstance) {
    return dbInstance;
  }
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  let targetPath = dbPath;
  if (isServerless) {
    const candidates = [
      dbPath,
      path2.resolve(PROJECT_ROOT, "data/diklat_pim_deploy.db"),
      path2.resolve(process.cwd(), "data/diklat_pim_deploy.db"),
      path2.resolve(__dirname2, "../data/diklat_pim_deploy.db"),
      path2.resolve(__dirname2, "../../data/diklat_pim_deploy.db"),
      "/var/task/data/diklat_pim_deploy.db"
    ];
    const found = candidates.find((c) => fs2.existsSync(c));
    if (found) {
      const tmpPath = path2.join("/tmp", path2.basename(found));
      try {
        if (!fs2.existsSync(tmpPath) || fs2.statSync(tmpPath).size !== fs2.statSync(found).size) {
          fs2.copyFileSync(found, tmpPath);
        }
        targetPath = tmpPath;
      } catch (copyErr) {
        console.warn("Failed copying database to /tmp, falling back to direct open:", copyErr);
        targetPath = found;
      }
    }
  }
  try {
    const dir = path2.dirname(targetPath);
    if (!fs2.existsSync(dir)) {
      fs2.mkdirSync(dir, { recursive: true });
    }
  } catch {
  }
  const isProductionOrVercel = Boolean(
    process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.DB_READONLY === "1"
  );
  const isDeployDb = targetPath.includes("diklat_pim_deploy.db");
  const isReadOnly = (isProductionOrVercel || isDeployDb) && !isServerless;
  let db;
  if (isReadOnly) {
    try {
      db = new DatabaseSync(targetPath, { readOnly: true });
    } catch {
      db = new DatabaseSync(targetPath);
    }
    try {
      db.exec("PRAGMA foreign_keys = ON;");
    } catch {
    }
  } else {
    db = new DatabaseSync(targetPath);
    db.exec("PRAGMA foreign_keys = ON;");
    if (!isDeployDb) {
      db.exec("PRAGMA journal_mode = WAL;");
      const schemaPath = path2.resolve(PROJECT_ROOT, "src/db/schema.sql");
      if (fs2.existsSync(schemaPath)) {
        const schemaSql = fs2.readFileSync(schemaPath, "utf8");
        db.exec(schemaSql);
      }
    }
  }
  dbInstance = db;
  return dbInstance;
}
function withTransaction(db, action) {
  db.exec("BEGIN TRANSACTION;");
  try {
    const result = action();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

// src/services/scoringService.ts
import crypto from "node:crypto";

// src/engine/normalization.ts
var EPSILON_WEIGHT_TOLERANCE = 1e-9;
function calculateNormalizedWeights(modelConfig) {
  const categoryRawSum = modelConfig.categories.reduce(
    (sum, c) => sum + c.raw_weight,
    0
  );
  if (categoryRawSum <= 0) {
    throw new Error(
      `INVALID_CATEGORY_WEIGHTS: Sum of category raw weights must be positive, got ${categoryRawSum}`
    );
  }
  const category_normalized_weights = {};
  for (const cat of modelConfig.categories) {
    category_normalized_weights[cat.category_code] = cat.raw_weight / categoryRawSum;
  }
  const normalizedCatSum = Object.values(category_normalized_weights).reduce(
    (s, w) => s + w,
    0
  );
  if (Math.abs(normalizedCatSum - 1) > EPSILON_WEIGHT_TOLERANCE) {
    throw new Error(
      `INVARIANT_VIOLATION_LEVEL_1: Sum of normalized category weights must be 1.0, got ${normalizedCatSum}`
    );
  }
  const varsByCategory = /* @__PURE__ */ new Map();
  for (const v of modelConfig.variables) {
    if (!varsByCategory.has(v.category_code)) {
      varsByCategory.set(v.category_code, []);
    }
    varsByCategory.get(v.category_code).push(v);
  }
  const effective_weights = {};
  let globalEffectiveSum = 0;
  for (const cat of modelConfig.categories) {
    const catVars = varsByCategory.get(cat.category_code) || [];
    if (catVars.length === 0) {
      throw new Error(
        `EMPTY_CATEGORY: Category ${cat.category_code} has 0 variables.`
      );
    }
    const localSum = catVars.reduce((s, v) => s + v.local_weight, 0);
    if (Math.abs(localSum - 1) > EPSILON_WEIGHT_TOLERANCE) {
      throw new Error(
        `INVARIANT_VIOLATION_LEVEL_2: Sum of local weights for category ${cat.category_code} must be 1.0, got ${localSum}`
      );
    }
    const catNormWeight = category_normalized_weights[cat.category_code];
    for (const v of catVars) {
      const effWeight = catNormWeight * v.local_weight;
      effective_weights[v.variable_code] = effWeight;
      globalEffectiveSum += effWeight;
    }
  }
  if (Math.abs(globalEffectiveSum - 1) > EPSILON_WEIGHT_TOLERANCE) {
    throw new Error(
      `INVARIANT_VIOLATION_GLOBAL_EFFECTIVE: Sum of all 17 effective weights must be 1.0, got ${globalEffectiveSum}`
    );
  }
  return {
    category_normalized_weights,
    effective_weights
  };
}

// src/engine/tieBreaker.ts
var EPSILON_SCORE_TIE = 1e-7;
var EPSILON_MANTAP_TIE = 1e-4;
function compareRoadPriority(a, b) {
  const scoreDiff = b.final_score - a.final_score;
  if (Math.abs(scoreDiff) > EPSILON_SCORE_TIE) {
    return scoreDiff;
  }
  const mantapDiff = a.tie_breaker_metadata.mantap_pct - b.tie_breaker_metadata.mantap_pct;
  if (Math.abs(mantapDiff) > EPSILON_MANTAP_TIE) {
    return mantapDiff;
  }
  const popDiff = b.tie_breaker_metadata.penduduk_dilayani_raw - a.tie_breaker_metadata.penduduk_dilayani_raw;
  if (Math.abs(popDiff) > 1e-3) {
    return popDiff;
  }
  return a.nomor_ruas.localeCompare(b.nomor_ruas);
}

// src/engine/scoringEngine.ts
function determineTierCategory(rank) {
  if (rank <= 35) return "TOP_35";
  if (rank <= 70) return "TOP_70";
  if (rank <= 105) return "TOP_105";
  return "REGULAR";
}
function scoreRoad(features, modelConfig, precomputedWeights) {
  const weights = precomputedWeights || calculateNormalizedWeights(modelConfig);
  const factor_contributions = {};
  const category_subtotals = {};
  for (const cat of modelConfig.categories) {
    category_subtotals[cat.category_code] = {
      category_code: cat.category_code,
      raw_weight: cat.raw_weight,
      normalized_weight: weights.category_normalized_weights[cat.category_code] || 0,
      subtotal: 0
    };
  }
  let final_score = 0;
  for (const v of modelConfig.variables) {
    const rawNormVal = features.normalized_values[v.variable_code];
    if (rawNormVal === void 0 || isNaN(rawNormVal)) {
      throw new Error(
        `MISSING_VARIABLE: Road ${features.road_key} is missing normalized value for '${v.variable_code}'.`
      );
    }
    const normVal = Math.min(1, Math.max(0, rawNormVal));
    const effWeight = weights.effective_weights[v.variable_code] || 0;
    const contribution = normVal * effWeight;
    factor_contributions[v.variable_code] = {
      variable_code: v.variable_code,
      category_code: v.category_code,
      normalized_value: normVal,
      effective_weight: effWeight,
      contribution
    };
    category_subtotals[v.category_code].subtotal += contribution;
    final_score += contribution;
  }
  return {
    road_key: features.road_key,
    nomor_ruas: features.nomor_ruas,
    display_name: features.display_name,
    district_name: features.district_name,
    final_score,
    category_subtotals,
    factor_contributions,
    tie_breaker_metadata: {
      mantap_pct: features.mantap_pct,
      penduduk_dilayani_raw: features.penduduk_dilayani_raw,
      nomor_ruas: features.nomor_ruas
    }
  };
}
function rankRoads(roadFeaturesList, modelConfig) {
  const weights = calculateNormalizedWeights(modelConfig);
  const scoredRoads = roadFeaturesList.map(
    (rf) => scoreRoad(rf, modelConfig, weights)
  );
  scoredRoads.sort(compareRoadPriority);
  const rankedRoads = scoredRoads.map((road, index) => {
    const priority_rank = index + 1;
    return {
      ...road,
      priority_rank,
      tier_category: determineTierCategory(priority_rank)
    };
  });
  return rankedRoads;
}

// src/services/scoringService.ts
var ScoringService = class {
  db;
  constructor(db) {
    this.db = db || getDatabase();
  }
  /**
   * Load model configuration and weights from the database.
   */
  loadModelConfig(modelCode = "POLICY_DEFAULT_V1") {
    const modelStmt = this.db.prepare(
      "SELECT model_id, model_code FROM priority_models WHERE model_code = ?"
    );
    const model = modelStmt.get(modelCode);
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
    const catRows = catStmt.all(model.model_id);
    const varStmt = this.db.prepare(`
      SELECT mv.variable_code, mv.category_code, mv.local_weight
      FROM model_variable_weights mv
      JOIN variable_definitions vd ON mv.variable_code = vd.variable_code
      WHERE mv.model_id = ?
      ORDER BY vd.display_order ASC
    `);
    const varRows = varStmt.all(model.model_id);
    const categories = catRows.map((c) => ({
      category_code: c.category_code,
      category_name: c.category_name,
      raw_weight: c.raw_weight,
      variable_codes: varRows.filter((v) => v.category_code === c.category_code).map((v) => v.variable_code)
    }));
    const variables = varRows.map((v) => ({
      variable_code: v.variable_code,
      category_code: v.category_code,
      local_weight: v.local_weight
    }));
    return {
      model_id: model.model_id,
      model_code: model.model_code,
      categories,
      variables
    };
  }
  /**
   * Load raw and normalized feature vectors for all 350 canonical roads.
   */
  loadRoadFeatureVectors(operatingMode = "OPERATIONAL_2025") {
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
    const roads = roadsStmt.all();
    const obsStmt = this.db.prepare(`
      SELECT road_key, variable_code, raw_value, normalized_value
      FROM road_variable_observations
      WHERE operating_mode = ?
      ORDER BY road_key ASC, variable_code ASC
    `);
    const obsRows = obsStmt.all(operatingMode);
    const obsMap = /* @__PURE__ */ new Map();
    for (const obs of obsRows) {
      if (!obsMap.has(obs.road_key)) {
        obsMap.set(obs.road_key, { norms: {}, rawPop: 0 });
      }
      const entry = obsMap.get(obs.road_key);
      entry.norms[obs.variable_code] = obs.normalized_value;
      if (obs.variable_code === "norm_penduduk_dilayani") {
        entry.rawPop = obs.raw_value;
      }
    }
    const featureVectors = [];
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
        normalized_values: entry.norms
      });
    }
    return featureVectors;
  }
  /**
   * Execute full scoring pipeline and persist run + scores to the database.
   */
  executeScoringRun(operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1", userId = "SYSTEM_SCORING_ENGINE") {
    const startTime = performance.now();
    const modelConfig = this.loadModelConfig(modelCode);
    const featureVectors = this.loadRoadFeatureVectors(operatingMode);
    const rankedScores = rankRoads(featureVectors, modelConfig);
    const calcDurationMs = Math.round(performance.now() - startTime);
    const runId = crypto.randomUUID();
    withTransaction(this.db, () => {
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
        null,
        // populated separately by benchmark service if desired
        calcDurationMs,
        userId
      );
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
        const subTeknis = r.category_subtotals["TEKNIS_JALAN"]?.subtotal || 0;
        const subAkses = r.category_subtotals["AKSESIBILITAS"]?.subtotal || 0;
        const subPelayanan = r.category_subtotals["PELAYANAN_MASYARAKAT"]?.subtotal || 0;
        const subSpasial = r.category_subtotals["SPASIAL_DEMOGRAFI"]?.subtotal || 0;
        const breakdownJson = JSON.stringify({
          subtotals: r.category_subtotals,
          factors: r.factor_contributions
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
      rankedScores
    };
  }
  /**
   * Retrieve the latest scoring run for a given mode and model.
   */
  getLatestScoringRun(operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1") {
    const model = this.loadModelConfig(modelCode);
    const runStmt = this.db.prepare(`
      SELECT * FROM scoring_runs
      WHERE model_id = ? AND operating_mode = ?
      ORDER BY executed_at DESC
      LIMIT 1
    `);
    const run = runStmt.get(model.model_id, operatingMode);
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
    const scores = scoresStmt.all(run.run_id);
    return { run, scores };
  }
};

// src/services/conditionService.ts
var ConditionService = class {
  db;
  constructor(db) {
    this.db = db || getDatabase();
  }
  /**
   * Retrieve authoritative condition for a specific road and survey year (defaults to 2025).
   */
  getConditionByRoadKey(roadKey, surveyYear = 2025) {
    const stmt = this.db.prepare(
      "SELECT * FROM road_conditions WHERE road_key = ? AND survey_year = ?"
    );
    const result = stmt.get(roadKey, surveyYear);
    return result || null;
  }
  /**
   * Retrieve all road conditions for a given survey year.
   */
  getAllConditions(surveyYear = 2025) {
    const stmt = this.db.prepare(
      "SELECT * FROM road_conditions WHERE survey_year = ? ORDER BY road_key ASC"
    );
    return stmt.all(surveyYear);
  }
  /**
   * Calculate overall aggregate metrics for the network.
   */
  getAggregateSummary(surveyYear = 2025) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as road_count,
        ROUND(SUM(total_panjang_km), 3) as total_panjang_km,
        ROUND(SUM(mantap_km), 3) as mantap_km,
        ROUND(SUM(tidak_mantap_km), 3) as tidak_mantap_km,
        ROUND(SUM(baik_km), 3) as baik_km,
        ROUND(SUM(sedang_km), 3) as sedang_km,
        ROUND(SUM(rusak_ringan_km), 3) as rusak_ringan_km,
        ROUND(SUM(rusak_berat_km), 3) as rusak_berat_km
      FROM road_conditions
      WHERE survey_year = ?
    `);
    const row = stmt.get(surveyYear);
    const totalKm = row.total_panjang_km || 0;
    const mantapKm = row.mantap_km || 0;
    const tidakMantapKm = row.tidak_mantap_km || 0;
    const mantapPct = totalKm > 0 ? Math.round(mantapKm / totalKm * 1e4) / 100 : 0;
    const tidakMantapPct = totalKm > 0 ? Math.round(tidakMantapKm / totalKm * 1e4) / 100 : 0;
    return {
      road_count: row.road_count,
      total_panjang_km: totalKm,
      mantap_km: mantapKm,
      mantap_pct: mantapPct,
      tidak_mantap_km: tidakMantapKm,
      tidak_mantap_pct: tidakMantapPct,
      baik_km: row.baik_km || 0,
      sedang_km: row.sedang_km || 0,
      rusak_ringan_km: row.rusak_ringan_km || 0,
      rusak_berat_km: row.rusak_berat_km || 0
    };
  }
  /**
   * District-level aggregation of road conditions.
   */
  getConditionByDistrict(surveyYear = 2025) {
    const stmt = this.db.prepare(`
      SELECT
        r.district_name,
        COUNT(r.road_key) as road_count,
        ROUND(SUM(c.total_panjang_km), 3) as total_km,
        ROUND(SUM(c.mantap_km), 3) as mantap_km,
        ROUND(SUM(c.tidak_mantap_km), 3) as tidak_mantap_km
      FROM roads r
      JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = ?
      GROUP BY r.district_name
      ORDER BY total_km DESC
    `);
    const rows = stmt.all(surveyYear);
    return rows.map((r) => ({
      ...r,
      mantap_pct: r.total_km > 0 ? Math.round(r.mantap_km / r.total_km * 1e4) / 100 : 0
    }));
  }
};

// src/services/roadService.ts
var RoadService = class {
  db;
  constructor(db) {
    this.db = db || getDatabase();
  }
  /**
   * Authoritative lookup by canonical road_key (e.g. 'HSS-KAB-001')
   */
  getRoadByKey(roadKey) {
    if (!roadKey || !roadKey.startsWith("HSS-KAB-")) {
      return null;
    }
    const stmt = this.db.prepare("SELECT * FROM roads WHERE road_key = ?");
    const result = stmt.get(roadKey);
    return result || null;
  }
  /**
   * Authoritative lookup by deterministic UUIDv5 road_id
   */
  getRoadById(roadId) {
    if (!roadId) return null;
    const stmt = this.db.prepare("SELECT * FROM roads WHERE road_id = ?");
    const result = stmt.get(roadId);
    return result || null;
  }
  /**
   * Authoritative lookup by official SK nomor_ruas (e.g. '001')
   */
  getRoadByNomorRuas(nomorRuas) {
    if (!nomorRuas) return null;
    const formatted = nomorRuas.padStart(3, "0");
    const stmt = this.db.prepare("SELECT * FROM roads WHERE nomor_ruas = ?");
    const result = stmt.get(formatted);
    return result || null;
  }
  /**
   * Retrieve all 350 canonical roads
   */
  getAllRoads() {
    const stmt = this.db.prepare("SELECT * FROM roads ORDER BY nomor_ruas ASC");
    return stmt.all();
  }
  /**
   * Total count of canonical roads
   */
  getRoadCount() {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM roads");
    const row = stmt.get();
    return row.count;
  }
  /**
   * Search roads via explicit search helpers (road_key, nomor_ruas, display_name, or aliases).
   * NOTE: For UI autocomplete/filtering ONLY. Joins must NEVER rely on free text.
   */
  searchRoads(query) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const stmt = this.db.prepare(`
      SELECT DISTINCT r.*
      FROM roads r
      LEFT JOIN road_aliases a ON r.road_key = a.road_key
      WHERE r.road_key LIKE ?
         OR r.nomor_ruas LIKE ?
         OR r.display_name LIKE ?
         OR r.canonical_name LIKE ?
         OR a.alias_name LIKE ?
      ORDER BY r.nomor_ruas ASC
      LIMIT 50
    `);
    const pattern = `%${trimmed}%`;
    return stmt.all(pattern, pattern, pattern, pattern, pattern);
  }
};

// src/services/modelService.ts
var ModelService = class {
  db;
  constructor(db) {
    this.db = db || getDatabase();
  }
  /**
   * Retrieve all 4 normative categories.
   */
  getCategories() {
    const stmt = this.db.prepare("SELECT * FROM categories ORDER BY display_order ASC");
    return stmt.all();
  }
  /**
   * Retrieve all 17 normative variable definitions.
   * Guarantees label_top105 is not included.
   */
  getVariables(categoryCode) {
    let sql = "SELECT * FROM variable_definitions";
    const params = [];
    if (categoryCode) {
      sql += " WHERE category_code = ?";
      params.push(categoryCode);
    }
    sql += " ORDER BY display_order ASC";
    const stmt = this.db.prepare(sql);
    return params.length > 0 ? stmt.all(...params) : stmt.all();
  }
  /**
   * Retrieve baseline model POLICY_DEFAULT_V1 and its locked hierarchical weights.
   */
  getBaselineModel() {
    const modelStmt = this.db.prepare(
      "SELECT * FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1'"
    );
    const model = modelStmt.get();
    if (!model) return null;
    const catStmt = this.db.prepare(
      "SELECT category_code, raw_weight, normalized_weight FROM model_category_weights WHERE model_id = ? ORDER BY category_code ASC"
    );
    const catWeights = catStmt.all(model.model_id);
    const varStmt = this.db.prepare(
      "SELECT variable_code, category_code, local_weight, effective_weight FROM model_variable_weights WHERE model_id = ? ORDER BY variable_code ASC"
    );
    const varWeights = varStmt.all(model.model_id);
    return {
      model_id: model.model_id,
      model_code: model.model_code,
      model_name: model.model_name,
      model_lifecycle: model.model_lifecycle,
      is_locked: model.is_locked,
      category_weights: catWeights,
      variable_weights: varWeights
    };
  }
  /**
   * Retrieve road variable observations for a specific road and operating mode.
   */
  getRoadObservations(roadKey, operatingMode = "OPERATIONAL_2025") {
    const stmt = this.db.prepare(`
      SELECT variable_code, raw_value, normalized_value
      FROM road_variable_observations
      WHERE road_key = ? AND operating_mode = ?
      ORDER BY variable_code ASC
    `);
    return stmt.all(roadKey, operatingMode);
  }
};

// src/services/benchmarkService.ts
import fs3 from "node:fs";

// src/ingestion/csvParser.ts
function parseCsv(csvText) {
  const lines = [];
  let currentRow = [];
  let currentField = "";
  let insideQuotes = false;
  const text = csvText.trim();
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = i + 1 < len ? text[i + 1] : "";
    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        currentField = "";
        if (currentRow.length > 0 && currentRow.some((f) => f.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }
  if (lines.length === 0) {
    return [];
  }
  const headers = lines[0].map((h) => h.replace(/^[\uFEFF]/, ""));
  const result = [];
  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] !== void 0 ? row[c] : "";
    }
    result.push(obj);
  }
  return result;
}

// src/services/benchmarkService.ts
var BenchmarkService = class {
  db;
  scoringSvc;
  constructor(db) {
    this.db = db || getDatabase();
    this.scoringSvc = new ScoringService(this.db);
  }
  /**
   * Compare BENCHMARK_2024 priority ranking against historical label_top105.
   *
   * Note: This is an audit / concordance tool ONLY.
   * label_top105 is NEVER used as a scoring input.
   */
  evaluateBenchmarkConcordance(modelCode = "POLICY_DEFAULT_V1") {
    let latestRun = this.scoringSvc.getLatestScoringRun("BENCHMARK_2024", modelCode);
    let runId;
    let policyTop105;
    let policyTop105Keys;
    let scoreMap;
    if (latestRun) {
      runId = latestRun.run.run_id;
      const roadsStmt = this.db.prepare("SELECT road_key, display_name FROM roads");
      const allRoads = roadsStmt.all();
      const rMap = new Map(allRoads.map((r) => [r.road_key, r.display_name]));
      policyTop105 = latestRun.scores.slice(0, 105).map((s) => ({
        road_key: s.road_key,
        priority_rank: s.priority_rank,
        final_score: s.final_score,
        display_name: rMap.get(s.road_key) || s.road_key
      }));
      policyTop105Keys = new Set(policyTop105.map((r) => r.road_key));
      scoreMap = new Map(
        latestRun.scores.map((s) => [
          s.road_key,
          {
            road_key: s.road_key,
            priority_rank: s.priority_rank,
            final_score: s.final_score,
            display_name: rMap.get(s.road_key) || s.road_key
          }
        ])
      );
    } else {
      const scoringResult = this.scoringSvc.executeScoringRun(
        "BENCHMARK_2024",
        modelCode,
        "AUDIT_BENCHMARK_RUNNER"
      );
      runId = scoringResult.runId;
      policyTop105 = scoringResult.rankedScores.slice(0, 105).map((r) => ({
        road_key: r.road_key,
        priority_rank: r.priority_rank,
        final_score: r.final_score,
        display_name: r.display_name
      }));
      policyTop105Keys = new Set(policyTop105.map((r) => r.road_key));
      scoreMap = new Map(
        scoringResult.rankedScores.map((r) => [
          r.road_key,
          {
            road_key: r.road_key,
            priority_rank: r.priority_rank,
            final_score: r.final_score,
            display_name: r.display_name
          }
        ])
      );
    }
    const baselineCsv = fs3.readFileSync(SEED_FILES.priorityBaselineCanonical, "utf8");
    const rows = parseCsv(baselineCsv);
    const historicalTop105Keys = /* @__PURE__ */ new Set();
    for (const row of rows) {
      if (row.label_top105 === "1" || row.label_top105 === "true") {
        historicalTop105Keys.add(row.road_key);
      }
    }
    let overlapCount = 0;
    for (const key of policyTop105Keys) {
      if (historicalTop105Keys.has(key)) {
        overlapCount++;
      }
    }
    const concordancePct = overlapCount / 105 * 100;
    const updateRunStmt = this.db.prepare(`
      UPDATE scoring_runs
      SET top105_concordance = ?
      WHERE run_id = ?
    `);
    updateRunStmt.run(Math.round(concordancePct * 100) / 100, runId);
    const onlyInPolicy = policyTop105.filter((r) => !historicalTop105Keys.has(r.road_key)).map((r) => ({
      road_key: r.road_key,
      priority_rank: r.priority_rank,
      final_score: r.final_score,
      display_name: r.display_name
    }));
    const onlyInHistorical = [];
    for (const histKey of historicalTop105Keys) {
      if (!policyTop105Keys.has(histKey)) {
        const road = scoreMap.get(histKey);
        if (road) {
          onlyInHistorical.push({
            road_key: road.road_key,
            priority_rank: road.priority_rank,
            final_score: road.final_score,
            display_name: road.display_name
          });
        }
      }
    }
    onlyInHistorical.sort((a, b) => a.priority_rank - b.priority_rank);
    return {
      total_evaluated: scoreMap.size,
      historical_top105_count: historicalTop105Keys.size,
      policy_top105_count: policyTop105.length,
      overlap_count: overlapCount,
      concordance_pct: Math.round(concordancePct * 100) / 100,
      only_in_policy: onlyInPolicy,
      only_in_historical: onlyInHistorical
    };
  }
};

// src/services/uiDataService.ts
var UiDataService = class {
  db;
  scoringService;
  conditionService;
  roadService;
  modelService;
  benchmarkService;
  constructor(db) {
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
  getDashboardData(operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1") {
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode);
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) {
      throw new Error(`SCORING_RUN_UNAVAILABLE: Could not retrieve scoring run for mode '${operatingMode}'.`);
    }
    const condSummary = this.conditionService.getAggregateSummary(2025);
    const top10Scores = latestRun.scores.slice(0, 10);
    const top10Keys = top10Scores.map((s) => s.road_key);
    const roadStmt = this.db.prepare(`
      SELECT r.road_key, r.nomor_ruas, r.display_name, r.district_name, r.length_km_official,
             COALESCE(c.mantap_pct, 0.0) as mantap_pct
      FROM roads r
      LEFT JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = 2025
      WHERE r.road_key IN (${top10Keys.map(() => "?").join(",")})
    `);
    const roadRows = roadStmt.all(...top10Keys);
    const roadMap = new Map(roadRows.map((r) => [r.road_key, r]));
    const top10 = top10Scores.map((s) => {
      const road = roadMap.get(s.road_key);
      return {
        priority_rank: s.priority_rank,
        road_key: s.road_key,
        nomor_ruas: road?.nomor_ruas || "",
        display_name: road?.display_name || "",
        district_name: road?.district_name || "",
        length_km_official: road?.length_km_official || 0,
        mantap_pct: road?.mantap_pct || 0,
        final_score: s.final_score,
        tier_category: s.tier_category
      };
    });
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
        normalized_pct: Math.round(cw.normalized_weight * 1e4) / 100
      };
    });
    const totalKm = condSummary.total_panjang_km;
    const conditionBreakdown = {
      baik_km: condSummary.baik_km,
      baik_pct: totalKm > 0 ? Math.round(condSummary.baik_km / totalKm * 1e4) / 100 : 0,
      sedang_km: condSummary.sedang_km,
      sedang_pct: totalKm > 0 ? Math.round(condSummary.sedang_km / totalKm * 1e4) / 100 : 0,
      rusak_ringan_km: condSummary.rusak_ringan_km,
      rusak_ringan_pct: totalKm > 0 ? Math.round(condSummary.rusak_ringan_km / totalKm * 1e4) / 100 : 0,
      rusak_berat_km: condSummary.rusak_berat_km,
      rusak_berat_pct: totalKm > 0 ? Math.round(condSummary.rusak_berat_km / totalKm * 1e4) / 100 : 0
    };
    let benchmarkAudit;
    if (operatingMode === "BENCHMARK_2024") {
      const audit = this.benchmarkService.evaluateBenchmarkConcordance();
      benchmarkAudit = {
        historicalTop105Count: audit.historical_top105_count,
        policyTop105Count: audit.policy_top105_count,
        concordantRoadsCount: audit.overlap_count,
        concordancePct: audit.concordance_pct
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
        top105Count: 105
      },
      top10,
      categoryWeights,
      conditionBreakdown,
      benchmarkAudit
    };
  }
  /**
   * Get complete dataset for all 350 roads in the priority table.
   */
  getPriorityTableData(operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1") {
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
    return stmt.all(latestRun.run.run_id);
  }
  /**
   * Get single road explainability and 17-factor decomposition profile.
   */
  getRoadDetailData(roadKey, operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1") {
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
    const scoreRow = scoreRowStmt.get(latestRun.run.run_id, roadKey);
    if (!scoreRow) return null;
    const breakdown = JSON.parse(scoreRow.factor_breakdown);
    const subtotalsMap = breakdown.subtotals || {};
    const rawFactors = breakdown.factors || {};
    const factorsList = Array.isArray(rawFactors) ? rawFactors : Object.values(rawFactors);
    const categories = this.modelService.getCategories();
    const catMap = new Map(categories.map((c) => [c.category_code, c]));
    const varDefs = this.modelService.getVariables();
    const varMap = new Map(varDefs.map((v) => [v.variable_code, v]));
    const model = this.modelService.getBaselineModel();
    const catWeightsMap = new Map(model?.category_weights.map((c) => [c.category_code, c]));
    const categoryContributions = categories.map((c) => {
      const sub = subtotalsMap[c.category_code]?.subtotal || 0;
      const cw = catWeightsMap.get(c.category_code);
      const pctOfScore = scoreRow.final_score > 0 ? sub / scoreRow.final_score * 100 : 0;
      return {
        category_code: c.category_code,
        category_name: c.category_name,
        raw_weight: cw?.raw_weight || c.default_weight_raw,
        normalized_weight: cw?.normalized_weight || 0,
        subtotal: sub,
        percentage_of_score: Math.round(pctOfScore * 100) / 100
      };
    });
    const factors = factorsList.map((f) => {
      const def = varMap.get(f.variable_code);
      const cat = catMap.get(f.category_code);
      return {
        variable_code: f.variable_code,
        variable_label: def?.variable_label || f.variable_code,
        definition: def?.definition || "",
        category_code: f.category_code,
        category_name: cat?.category_name || f.category_code,
        raw_value: f.raw_value,
        raw_unit: def?.raw_unit || "",
        optimization_dir: def?.optimization_dir || "BENEFIT",
        normalized_value: f.normalized_value,
        local_weight: f.local_weight,
        effective_weight: f.effective_weight,
        contribution: f.contribution
      };
    });
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
        identity_status: road.identity_status
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
        authority_status: condition.authority_status
      },
      priorityResult: {
        priority_rank: scoreRow.priority_rank,
        final_score: scoreRow.final_score,
        tier_category: scoreRow.tier_category,
        operating_mode: operatingMode,
        model_code: modelCode,
        run_id: latestRun.run.run_id
      },
      categoryContributions,
      factors,
      mathematicalAudit: {
        final_score: scoreRow.final_score,
        sum_subtotals: sumSubtotals,
        sum_contributions: sumContributions,
        delta_subtotals: deltaSub,
        delta_contributions: deltaContrib,
        is_exact: deltaSub < 1e-9 && deltaContrib < 1e-9
      }
    };
  }
  /**
   * Get system provenance checklist and status.
   */
  getProvenanceData() {
    const roadCountStmt = this.db.prepare("SELECT COUNT(*) as c FROM roads");
    const roadCount = roadCountStmt.get().c;
    const crosswalkStmt = this.db.prepare(
      "SELECT COUNT(*) as c FROM source_crosswalk WHERE match_status = 'VERIFIED'"
    );
    const crosswalkCount = crosswalkStmt.get().c;
    const conditionStmt = this.db.prepare(
      "SELECT COUNT(*) as c FROM road_conditions WHERE survey_year = 2025"
    );
    const conditionCount = conditionStmt.get().c;
    const geomStmt = this.db.prepare("SELECT COUNT(*) as c FROM road_geometries");
    const geomCount = geomStmt.get().c;
    const districtStmt = this.db.prepare("SELECT COUNT(*) as c FROM districts");
    const districtCount = districtStmt.get().c;
    const villageStmt = this.db.prepare("SELECT COUNT(*) as c FROM villages");
    const villageCount = villageStmt.get().c;
    const facStmt = this.db.prepare("SELECT COUNT(*) as c FROM public_facilities");
    const facCount = facStmt.get().c;
    const varStmt = this.db.prepare("SELECT COUNT(*) as c FROM variable_definitions");
    const varCount = varStmt.get().c;
    const catStmt = this.db.prepare("SELECT COUNT(*) as c FROM categories");
    const catCount = catStmt.get().c;
    return {
      checklist: [
        {
          label: "Registri Ruas Jalan Otoritatif (SK Bupati)",
          current: roadCount,
          expected: 350,
          unit: "ruas",
          status: roadCount === 350 ? "VERIFIED" : "FAILED",
          source: "SK_BUPATI_HSS_2023_2024 / road_registry_authoritative.csv"
        },
        {
          label: "Matriks Penyelarasan Sistem (Source Crosswalk)",
          current: crosswalkCount,
          expected: 1400,
          unit: "pemetaan",
          status: crosswalkCount === 1400 ? "VERIFIED" : "FAILED",
          source: "4 Sumber: Dashboard 2025, QGIS, Historis, ML Clean"
        },
        {
          label: "Otoritas Kondisi Jalan Resmi 2025",
          current: conditionCount,
          expected: 350,
          unit: "ruas (732.460 km)",
          status: conditionCount === 350 ? "VERIFIED" : "FAILED",
          source: "Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx"
        },
        {
          label: "Geometri Spasial Jalan Kabupaten",
          current: geomCount,
          expected: 350,
          unit: "linestring WGS84",
          status: geomCount === 350 ? "VERIFIED" : "FAILED",
          source: "roads_county.geojson (Konektor sintetis dieksklusi)"
        },
        {
          label: "Wilayah Administrasi Kecamatan",
          current: districtCount,
          expected: 11,
          unit: "kecamatan",
          status: districtCount === 11 ? "VERIFIED" : "FAILED",
          source: "districts.geojson / BPS HSS"
        },
        {
          label: "Wilayah Administrasi Desa / Kelurahan",
          current: villageCount,
          expected: 148,
          unit: "desa/kelurahan",
          status: villageCount === 148 ? "VERIFIED" : "FAILED",
          source: "villages.geojson / BPS HSS"
        },
        {
          label: "Sebaran Fasilitas Publik",
          current: facCount,
          expected: 285,
          unit: "titik fasilitas",
          status: facCount === 285 ? "VERIFIED" : "FAILED",
          source: "RSUD (2), Puskesmas (21), SD/SMP (251), Pasar (11)"
        },
        {
          label: "Kategori Pembobotan Hierarkis",
          current: catCount,
          expected: 4,
          unit: "kategori",
          status: catCount === 4 ? "VERIFIED" : "FAILED",
          source: "Teknis, Aksesibilitas, Yanmas, Spasial-Demografi"
        },
        {
          label: "Variabel Normatif Skoring",
          current: varCount,
          expected: 17,
          unit: "variabel",
          status: varCount === 17 ? "VERIFIED" : "FAILED",
          source: "17 Variabel Normatif (label_top105 dieksklusi)"
        }
      ],
      activeModel: {
        code: "POLICY_DEFAULT_V1",
        name: "Policy Default v1 (Neutral Local Weights)",
        lifecycle: "BASELINE_LOCKED",
        immutable: true
      },
      operatingMode: "OPERATIONAL_2025"
    };
  }
};

// src/services/spatialService.ts
import fs4 from "node:fs";
import * as turf from "@turf/turf";
var SpatialService = class {
  db;
  scoringService;
  // In-memory caches for static GeoJSON files
  cachedProvincialGeoJson = null;
  cachedNationalGeoJson = null;
  cachedConnectorsGeoJson = null;
  cachedDistrictsGeoJson = null;
  cachedKabupatenGeoJson = null;
  cachedVillagesGeoJson = null;
  cachedRtrwGeoJson = null;
  cachedRtrwCategories = null;
  constructor(db) {
    this.db = db || getDatabase();
    this.scoringService = new ScoringService(this.db);
  }
  /**
   * Retrieve geometry for a single road by canonical road_key.
   */
  getGeometryByRoadKey(roadKey) {
    const stmt = this.db.prepare("SELECT * FROM road_geometries WHERE road_key = ?");
    const result = stmt.get(roadKey);
    return result || null;
  }
  /**
   * Total count of stored county road geometries (must equal 350).
   */
  getCountyGeometryCount() {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM road_geometries");
    const row = stmt.get();
    return row.count;
  }
  /**
   * Retrieve all 350 county geometries as a valid GeoJSON FeatureCollection (raw geometry without score).
   */
  getAllCountyRoadsGeoJson() {
    const stmt = this.db.prepare(`
      SELECT
        g.road_key,
        g.road_id,
        g.geometry_geojson,
        r.nomor_ruas,
        r.display_name,
        r.district_name,
        r.length_km_official
      FROM road_geometries g
      JOIN roads r ON g.road_key = r.road_key
      ORDER BY r.nomor_ruas ASC
    `);
    const rows = stmt.all();
    return {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: JSON.parse(r.geometry_geojson),
        properties: {
          road_key: r.road_key,
          road_id: r.road_id,
          nomor_ruas: r.nomor_ruas,
          display_name: r.display_name,
          district_name: r.district_name,
          length_km: r.length_km_official
        }
      }))
    };
  }
  /**
   * Retrieve all 350 county road geometries merged with active scoring results and 2025 condition facts.
   * Scoped to the active scoring run for the specified operating mode and model code.
   */
  getCountyRoadsWithScores(operatingMode = "OPERATIONAL_2025", modelCode = "POLICY_DEFAULT_V1") {
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode, "MAP_SERVICE");
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) {
      throw new Error(`SCORING_RUN_UNAVAILABLE for map spatial service [${operatingMode}/${modelCode}]`);
    }
    const runId = latestRun.run.run_id;
    const surveyYear = operatingMode === "BENCHMARK_2024" ? 2024 : 2025;
    const stmt = this.db.prepare(`
      SELECT
        g.road_key,
        g.road_id,
        g.geometry_geojson,
        r.nomor_ruas,
        r.display_name,
        r.canonical_name,
        r.district_name,
        r.length_km_official,
        r.width_m_official,
        s.run_id,
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
      FROM road_geometries g
      JOIN roads r ON g.road_key = r.road_key
      JOIN road_priority_scores s ON s.road_key = r.road_key AND s.run_id = ?
      LEFT JOIN road_conditions c ON c.road_key = r.road_key AND c.survey_year = ?
      ORDER BY s.priority_rank ASC
    `);
    const rows = stmt.all(runId, surveyYear);
    if (rows.length !== AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT) {
      throw new Error(
        `Map county roads count mismatch: expected ${AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT}, got ${rows.length}`
      );
    }
    return {
      type: "FeatureCollection",
      properties: {
        operatingMode,
        modelCode,
        run_id: runId,
        road_count: rows.length,
        crs: "EPSG:4326"
      },
      features: rows.map((r) => ({
        type: "Feature",
        geometry: JSON.parse(r.geometry_geojson),
        properties: {
          road_key: r.road_key,
          road_id: r.road_id,
          nomor_ruas: r.nomor_ruas,
          display_name: r.display_name,
          canonical_name: r.canonical_name,
          district_name: r.district_name,
          length_km: r.length_km_official,
          width_m: r.width_m_official,
          mantap_pct: Math.round(r.mantap_pct * 100) / 100,
          tidak_mantap_pct: Math.round(r.tidak_mantap_pct * 100) / 100,
          baik_km: r.baik_km,
          sedang_km: r.sedang_km,
          rusak_ringan_km: r.rusak_ringan_km,
          rusak_berat_km: r.rusak_berat_km,
          final_score: r.final_score,
          priority_rank: r.priority_rank,
          tier_category: r.tier_category,
          subtotal_teknis: r.subtotal_teknis,
          subtotal_akses: r.subtotal_akses,
          subtotal_pelayanan: r.subtotal_pelayanan,
          subtotal_spasial: r.subtotal_spasial,
          run_id: r.run_id,
          operating_mode: operatingMode
        }
      }))
    };
  }
  /**
   * Retrieve the complete reference network (4 provincial, 8 national, 4 connectors = 16 features).
   * Explicitly ensures connectors are labeled 'Konektor Jaringan Analisis' and have NO priority/treatment fields.
   */
  getReferenceNetworkGeoJson() {
    if (!this.cachedProvincialGeoJson) {
      this.cachedProvincialGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.roadsProvincialGeoJson, "utf8"));
    }
    if (!this.cachedNationalGeoJson) {
      this.cachedNationalGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.roadsNationalGeoJson, "utf8"));
    }
    if (!this.cachedConnectorsGeoJson) {
      this.cachedConnectorsGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.networkConnectorsGeoJson, "utf8"));
    }
    const combinedFeatures = [];
    for (let i = 0; i < this.cachedProvincialGeoJson.features.length; i++) {
      const f = this.cachedProvincialGeoJson.features[i];
      combinedFeatures.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          feature_id: `prov-${f.properties.source_object_id || i + 1}`,
          network_class: "PROVINSI",
          network_label: "Jalan Provinsi",
          road_name: f.properties.road_name,
          is_synthetic: false,
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1e3).toFixed(3)
        }
      });
    }
    for (let i = 0; i < this.cachedNationalGeoJson.features.length; i++) {
      const f = this.cachedNationalGeoJson.features[i];
      combinedFeatures.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          feature_id: `nat-${f.properties.source_object_id || i + 1}`,
          network_class: "NASIONAL",
          network_label: "Jalan Nasional",
          road_name: f.properties.road_name,
          is_synthetic: false,
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1e3).toFixed(3)
        }
      });
    }
    for (const f of this.cachedConnectorsGeoJson.features) {
      combinedFeatures.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          feature_id: f.properties.connector_id,
          network_class: "KONEKTOR_ANALISIS",
          network_label: "Konektor Jaringan Analisis",
          connector_name: f.properties.connector_name,
          is_synthetic: true,
          purpose: "network_topology",
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1e3).toFixed(3)
        }
      });
    }
    return {
      type: "FeatureCollection",
      features: combinedFeatures
    };
  }
  /**
   * Retrieve administrative district boundaries (11 polygons).
   */
  getDistrictsGeoJson() {
    if (!this.cachedDistrictsGeoJson) {
      this.cachedDistrictsGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.districtsGeoJson, "utf8"));
    }
    return this.cachedDistrictsGeoJson;
  }
  /**
   * Retrieve the Kabupaten Hulu Sungai Selatan outer boundary deterministically
   * derived by dissolving / unioning all 11 authoritative district polygons.
   * The derived geometry is display context only (no scoring attributes).
   */
  getKabupatenGeoJson() {
    if (this.cachedKabupatenGeoJson) {
      return this.cachedKabupatenGeoJson;
    }
    const districtsGeoJson = this.getDistrictsGeoJson();
    if (!districtsGeoJson.features || districtsGeoJson.features.length !== AUTHORITY_INVARIANTS.DISTRICT_COUNT) {
      throw new Error(
        `Kabupaten dissolve failed: expected ${AUTHORITY_INVARIANTS.DISTRICT_COUNT} districts, found ${districtsGeoJson.features?.length}`
      );
    }
    let unionPoly = districtsGeoJson.features[0];
    for (let i = 1; i < districtsGeoJson.features.length; i++) {
      const merged = turf.union(turf.featureCollection([unionPoly, districtsGeoJson.features[i]]));
      if (!merged) {
        throw new Error(`Kabupaten dissolve failed at district index ${i}`);
      }
      unionPoly = merged;
    }
    this.cachedKabupatenGeoJson = {
      type: "FeatureCollection",
      name: "kabupaten_hss_boundary",
      bbox: turf.bbox(unionPoly),
      features: [
        {
          type: "Feature",
          properties: {
            boundary_type: "KABUPATEN",
            regency_name: "Hulu Sungai Selatan",
            province_name: "Kalimantan Selatan",
            label: "Batas Kabupaten Hulu Sungai Selatan",
            source: "DISSOLVE_11_DISTRICTS",
            district_count: districtsGeoJson.features.length
          },
          geometry: unionPoly.geometry
        }
      ]
    };
    return this.cachedKabupatenGeoJson;
  }
  /**
   * Retrieve administrative village boundaries (148 polygons).
   */
  getVillagesGeoJson() {
    if (!this.cachedVillagesGeoJson) {
      this.cachedVillagesGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.villagesGeoJson, "utf8"));
    }
    return this.cachedVillagesGeoJson;
  }
  /**
   * Retrieve public facilities as GeoJSON FeatureCollection (285 points).
   */
  getPublicFacilitiesGeoJson(typeFilter) {
    let sql = "SELECT * FROM public_facilities";
    const params = [];
    if (typeFilter) {
      sql += " WHERE facility_type = ?";
      params.push(typeFilter);
    }
    sql += " ORDER BY facility_type ASC, facility_name ASC";
    const stmt = this.db.prepare(sql);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    const getLabel = (t) => {
      switch (t) {
        case "hospital":
          return "RSUD";
        case "puskesmas":
          return "Puskesmas";
        case "school":
          return "SD / SMP";
        case "market":
          return "Pasar Rakyat";
        default:
          return t;
      }
    };
    return {
      type: "FeatureCollection",
      features: rows.map((f) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [f.longitude, f.latitude]
        },
        properties: {
          facility_id: f.facility_id,
          facility_name: f.facility_name,
          facility_type: f.facility_type,
          facility_type_label: getLabel(f.facility_type),
          facility_subtype: f.facility_subtype,
          district_name: f.district_name,
          village_name: f.village_name,
          source_layer: f.source_layer
        }
      }))
    };
  }
  /**
   * Total count of public facilities (must equal 285).
   */
  getPublicFacilityCount() {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM public_facilities");
    const row = stmt.get();
    return row.count;
  }
  /**
   * Retrieve RTRW Pola Ruang categories and feature counts.
   */
  getRtrwCategories() {
    if (!this.cachedRtrwCategories) {
      const csv = fs4.readFileSync(SEED_FILES.rtrwCategoriesCsv, "utf8");
      const lines = csv.trim().split("\n").slice(1);
      this.cachedRtrwCategories = lines.map((l) => {
        const [nama, count] = l.split(",");
        return { nama_pola_ruang: nama.trim(), feature_count: parseInt(count.trim(), 10) || 0 };
      });
    }
    return this.cachedRtrwCategories;
  }
  /**
   * Retrieve full RTRW Pola Ruang GeoJSON (2,832 polygons, ~17.5 MB).
   * Cached in memory upon initial request.
   */
  getRtrwGeoJson() {
    if (!this.cachedRtrwGeoJson) {
      this.cachedRtrwGeoJson = JSON.parse(fs4.readFileSync(SEED_FILES.rtrwPolaRuangGeoJson, "utf8"));
    }
    return this.cachedRtrwGeoJson;
  }
};

// src/server/server.ts
var __filename3 = fileURLToPath3(import.meta.url);
var __dirname3 = path3.dirname(__filename3);
function createServer() {
  const app2 = express();
  const uiService = new UiDataService();
  const modelService = new ModelService();
  const spatialService = new SpatialService();
  app2.use(express.json());
  app2.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app2.get("/api/dashboard", (req, res) => {
    try {
      const mode = req.query.mode || "OPERATIONAL_2025";
      const modelCode = req.query.model || "POLICY_DEFAULT_V1";
      const data = uiService.getDashboardData(mode, modelCode);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/roads", (req, res) => {
    try {
      const mode = req.query.mode || "OPERATIONAL_2025";
      const modelCode = req.query.model || "POLICY_DEFAULT_V1";
      const data = uiService.getPriorityTableData(mode, modelCode);
      res.json({ success: true, total: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/roads/:roadKey", (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const mode = req.query.mode || "OPERATIONAL_2025";
      const modelCode = req.query.model || "POLICY_DEFAULT_V1";
      const data = uiService.getRoadDetailData(roadKey, mode, modelCode);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: `ROAD_NOT_FOUND: Road with key '${roadKey}' does not exist.`
        });
      }
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/provenance", (req, res) => {
    try {
      const data = uiService.getProvenanceData();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/model", (req, res) => {
    try {
      const baseline = modelService.getBaselineModel();
      const categories = modelService.getCategories();
      const variables = modelService.getVariables();
      res.json({
        success: true,
        data: {
          model: baseline,
          categories,
          variables
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/roads", (req, res) => {
    try {
      const mode = req.query.mode || "OPERATIONAL_2025";
      const modelCode = req.query.model || "POLICY_DEFAULT_V1";
      const data = spatialService.getCountyRoadsWithScores(mode, modelCode);
      res.json({ success: true, total: data.features.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/reference-network", (req, res) => {
    try {
      const data = spatialService.getReferenceNetworkGeoJson();
      res.json({ success: true, total: data.features.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/facilities", (req, res) => {
    try {
      const typeFilter = req.query.type;
      const data = spatialService.getPublicFacilitiesGeoJson(typeFilter);
      res.json({ success: true, total: data.features.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/districts", (req, res) => {
    try {
      const data = spatialService.getDistrictsGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/kabupaten", (req, res) => {
    try {
      const data = spatialService.getKabupatenGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/basemap-config", (req, res) => {
    try {
      const satelliteTileUrl = process.env.SATELLITE_TILE_URL || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      const satelliteAttribution = process.env.SATELLITE_ATTRIBUTION || "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";
      res.json({
        success: true,
        data: {
          neutral: {
            id: "neutral",
            label: "Latar Netral",
            isOffline: true
          },
          osm: {
            id: "osm",
            label: "Peta Jalan",
            isOffline: false,
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | Dinas PUTR Kab. HSS',
            maxZoom: 19
          },
          satellite: {
            id: "satellite",
            label: "Citra Satelit",
            isOffline: false,
            url: satelliteTileUrl,
            attribution: satelliteAttribution,
            maxZoom: 19
          }
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/villages", (req, res) => {
    try {
      const data = spatialService.getVillagesGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/rtrw/categories", (req, res) => {
    try {
      const data = spatialService.getRtrwCategories();
      res.json({ success: true, total: data.length, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/map/rtrw", (req, res) => {
    try {
      const data = spatialService.getRtrwGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  const publicDir = path3.resolve(PROJECT_ROOT, "src/public");
  app2.use(express.static(publicDir));
  app2.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path3.join(publicDir, "index.html"));
    }
    next();
  });
  return app2;
}
if (process.argv[1] === fileURLToPath3(import.meta.url)) {
  const PORT = process.env.PORT || 3e3;
  const app2 = createServer();
  app2.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`SISTEM PENDUKUNG PRIORITAS PENANGANAN JALAN KABUPATEN HSS (MVP)`);
    console.log(`Server aktif di: http://localhost:${PORT}`);
    console.log(`Mode Operasional Default: OPERATIONAL_2025`);
    console.log(`Model Aktif: POLICY_DEFAULT_V1 (350 Ruas Kanonikal Terverifikasi)`);
    console.log(`================================================================`);
  });
}

// src/server.ts
var app = createServer();
var server_default = app;
if (process.argv[1] === fileURLToPath4(import.meta.url)) {
  const PORT = process.env.PORT || 3e3;
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`SISTEM PENDUKUNG PRIORITAS PENANGANAN JALAN KABUPATEN HSS (MVP)`);
    console.log(`Server aktif di: http://localhost:${PORT}`);
    console.log(`Mode Operasional Default: OPERATIONAL_2025`);
    console.log(`Model Aktif: POLICY_DEFAULT_V1 (350 Ruas Kanonikal Terverifikasi)`);
    console.log(`================================================================`);
  });
}
export {
  server_default as default
};
