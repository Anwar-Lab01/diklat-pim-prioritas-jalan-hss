import type {
  RoadFeatureVector,
  ScoringModelConfig,
  ScoringCategoryConfig,
  ScoringVariableConfig,
  NormalizedModelWeights,
  RankedRoadScore,
  TierCategory,
} from './types.ts';
import { calculateNormalizedWeights, EPSILON_WEIGHT_TOLERANCE } from './normalization.ts';
import { rankRoads, determineTierCategory } from './scoringEngine.ts';

export interface CategoryWeightInput {
  category_code: string;
  category_name: string;
  raw_weight: number;
}

export interface VariableWeightInput {
  variable_code: string;
  category_code: string;
  variable_label: string;
  local_weight: number;
}

export interface SimulationModelConfig {
  categories: CategoryWeightInput[];
  variables: VariableWeightInput[];
}

export interface RoadComparisonResult {
  road_key: string;
  nomor_ruas: string;
  display_name: string;
  district_name: string;
  baseline_rank: number;
  simulated_rank: number;
  rank_delta: number; // baseline_rank - simulated_rank (positive = moved UP)
  baseline_score: number;
  simulated_score: number;
  score_delta: number; // simulated_score - baseline_score
  baseline_tier: TierCategory;
  simulated_tier: TierCategory;
  tier_changed: boolean;
  subtotal_teknis: number;
  subtotal_akses: number;
  subtotal_pelayanan: number;
  subtotal_spasial: number;
}

export interface ScenarioSummary {
  roads_evaluated: number;
  moved_up_count: number;
  moved_down_count: number;
  unchanged_count: number;
  tier_changed_count: number;
  biggest_upward_mover: {
    road_key: string;
    nomor_ruas: string;
    display_name: string;
    baseline_rank: number;
    simulated_rank: number;
    rank_delta: number;
  } | null;
  biggest_downward_mover: {
    road_key: string;
    nomor_ruas: string;
    display_name: string;
    baseline_rank: number;
    simulated_rank: number;
    rank_delta: number;
  } | null;
  top10_simulated: RoadComparisonResult[];
}

export interface RoadFactorExplainability {
  variable_code: string;
  variable_label: string;
  category_code: string;
  category_name: string;
  normalized_value: number;
  baseline_effective_weight: number;
  simulated_effective_weight: number;
  weight_delta: number;
  baseline_contribution: number;
  simulated_contribution: number;
  contribution_delta: number;
}

export interface RoadDetailComparison {
  road_key: string;
  nomor_ruas: string;
  display_name: string;
  district_name: string;
  baseline_rank: number;
  simulated_rank: number;
  rank_delta: number;
  baseline_score: number;
  simulated_score: number;
  score_delta: number;
  baseline_tier: TierCategory;
  simulated_tier: TierCategory;
  factors: RoadFactorExplainability[];
}

// Canonical source raw category weights
export const BASELINE_RAW_CATEGORIES: CategoryWeightInput[] = [
  { category_code: 'TEKNIS_JALAN', category_name: 'Data Teknis Jalan', raw_weight: 0.378965 },
  { category_code: 'AKSESIBILITAS', category_name: 'Data Aksesibilitas', raw_weight: 0.283815 },
  { category_code: 'PELAYANAN_MASYARAKAT', category_name: 'Data Pelayanan Masyarakat', raw_weight: 0.192412 },
  { category_code: 'SPASIAL_DEMOGRAFI', category_name: 'Data Spasial & Demografi', raw_weight: 0.144807 },
];

// Baseline local variable weights (Equal defaults: 1/7, 1/3, 1/4, 1/3)
export const BASELINE_LOCAL_VARIABLES: VariableWeightInput[] = [
  // 1. TEKNIS_JALAN (7 variables -> 1/7 each)
  { variable_code: 'norm_panjang_ruas', category_code: 'TEKNIS_JALAN', variable_label: 'Panjang Ruas', local_weight: 1 / 7 },
  { variable_code: 'norm_lebar_ruas', category_code: 'TEKNIS_JALAN', variable_label: 'Lebar Ruas', local_weight: 1 / 7 },
  { variable_code: 'norm_kondisi_sedang', category_code: 'TEKNIS_JALAN', variable_label: 'Kondisi Sedang', local_weight: 1 / 7 },
  { variable_code: 'norm_rusak_ringan', category_code: 'TEKNIS_JALAN', variable_label: 'Rusak Ringan', local_weight: 1 / 7 },
  { variable_code: 'norm_rusak_berat', category_code: 'TEKNIS_JALAN', variable_label: 'Rusak Berat', local_weight: 1 / 7 },
  { variable_code: 'norm_permukaan_aspal_penmac', category_code: 'TEKNIS_JALAN', variable_label: 'Permukaan Aspal/Penmac', local_weight: 1 / 7 },
  { variable_code: 'norm_permukaan_beton', category_code: 'TEKNIS_JALAN', variable_label: 'Permukaan Beton', local_weight: 1 / 7 },

  // 2. AKSESIBILITAS (3 variables -> 1/3 each)
  { variable_code: 'norm_koneksi_jalan_provinsi', category_code: 'AKSESIBILITAS', variable_label: 'Koneksi Jalan Provinsi', local_weight: 1 / 3 },
  { variable_code: 'norm_koneksi_jalan_nasional', category_code: 'AKSESIBILITAS', variable_label: 'Koneksi Jalan Nasional', local_weight: 1 / 3 },
  { variable_code: 'norm_jarak_ibukota_kabupaten_cost', category_code: 'AKSESIBILITAS', variable_label: 'Jarak Ibukota Kabupaten (Cost)', local_weight: 1 / 3 },

  // 3. PELAYANAN_MASYARAKAT (4 variables -> 1/4 each)
  { variable_code: 'norm_jarak_rsud_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak RSUD (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_puskesmas_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak Puskesmas (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_sd_smp_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak SD/SMP (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_pasar_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak Pasar (Cost)', local_weight: 1 / 4 },

  // 4. SPASIAL_DEMOGRAFI (3 variables -> 1/3 each)
  { variable_code: 'norm_penduduk_dilayani', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Penduduk Dilayani', local_weight: 1 / 3 },
  { variable_code: 'norm_desa_dilalui', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Desa Dilalui', local_weight: 1 / 3 },
  { variable_code: 'norm_kecamatan_dilalui', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Kecamatan Dilalui', local_weight: 1 / 3 },
];

/**
 * Returns a pristine deep clone of the baseline policy configuration (POLICY_DEFAULT_V1).
 */
export function getBaselineSimulationConfig(): SimulationModelConfig {
  return {
    categories: BASELINE_RAW_CATEGORIES.map((c) => ({ ...c })),
    variables: BASELINE_LOCAL_VARIABLES.map((v) => ({ ...v })),
  };
}

/**
 * Proportional Sibling Auto-Balance for Categories.
 *
 * Rule:
 * When the user adjusts category `editedCode` to `newWeight` in [0.0, 1.0]:
 * The remaining mass `(1 - newWeight)` is distributed among sibling categories
 * in proportion to their current weights.
 * If all sibling categories currently have weight 0, the remaining mass is distributed equally.
 */
export function rebalanceCategorySiblings(
  currentCategories: CategoryWeightInput[],
  editedCode: string,
  newWeight: number
): CategoryWeightInput[] {
  if (isNaN(newWeight) || !isFinite(newWeight)) {
    throw new Error(`INVALID_WEIGHT: Weight must be a finite number, got ${newWeight}`);
  }
  const clampedWeight = Math.min(1.0, Math.max(0.0, newWeight));

  const targetCategory = currentCategories.find((c) => c.category_code === editedCode);
  if (!targetCategory) {
    throw new Error(`CATEGORY_NOT_FOUND: Category '${editedCode}' does not exist.`);
  }

  const siblings = currentCategories.filter((c) => c.category_code !== editedCode);
  const remainingMass = 1.0 - clampedWeight;

  const currentSiblingSum = siblings.reduce((sum, c) => sum + c.raw_weight, 0);

  const updated: CategoryWeightInput[] = currentCategories.map((cat) => {
    if (cat.category_code === editedCode) {
      return { ...cat, raw_weight: clampedWeight };
    }

    if (currentSiblingSum > 1e-12) {
      const proportion = cat.raw_weight / currentSiblingSum;
      return { ...cat, raw_weight: remainingMass * proportion };
    } else {
      // Equal distribution if all siblings were zero
      return { ...cat, raw_weight: remainingMass / siblings.length };
    }
  });

  return updated;
}

/**
 * Proportional Sibling Auto-Balance for Local Variables within a Category.
 *
 * Rule:
 * When the user adjusts variable `editedCode` to `newWeight` in [0.0, 1.0]:
 * The remaining mass `(1 - newWeight)` within that category is distributed among sibling variables
 * in proportion to their current local weights.
 * Variables in other categories and category weights are completely unaffected.
 */
export function rebalanceVariableSiblings(
  currentVariables: VariableWeightInput[],
  categoryCode: string,
  editedCode: string,
  newWeight: number
): VariableWeightInput[] {
  if (isNaN(newWeight) || !isFinite(newWeight)) {
    throw new Error(`INVALID_WEIGHT: Weight must be a finite number, got ${newWeight}`);
  }
  const clampedWeight = Math.min(1.0, Math.max(0.0, newWeight));

  const categoryVariables = currentVariables.filter((v) => v.category_code === categoryCode);
  const targetVar = categoryVariables.find((v) => v.variable_code === editedCode);
  if (!targetVar) {
    throw new Error(
      `VARIABLE_NOT_FOUND: Variable '${editedCode}' does not exist in category '${categoryCode}'.`
    );
  }

  const siblings = categoryVariables.filter((v) => v.variable_code !== editedCode);
  const remainingMass = 1.0 - clampedWeight;
  const currentSiblingSum = siblings.reduce((sum, v) => sum + v.local_weight, 0);

  const updated: VariableWeightInput[] = currentVariables.map((v) => {
    if (v.category_code !== categoryCode) {
      return { ...v };
    }

    if (v.variable_code === editedCode) {
      return { ...v, local_weight: clampedWeight };
    }

    if (currentSiblingSum > 1e-12) {
      const proportion = v.local_weight / currentSiblingSum;
      return { ...v, local_weight: remainingMass * proportion };
    } else {
      return { ...v, local_weight: remainingMass / siblings.length };
    }
  });

  return updated;
}

/**
 * Converts a simulation configuration into a standard ScoringModelConfig
 * suitable for the deterministic scoring engine.
 */
export function buildScoringModelConfig(
  simConfig: SimulationModelConfig,
  modelId: string = 'SIMULATION_DRAFT'
): ScoringModelConfig {
  const categories: ScoringCategoryConfig[] = simConfig.categories.map((c) => ({
    category_code: c.category_code,
    category_name: c.category_name,
    raw_weight: c.raw_weight,
    variable_codes: simConfig.variables
      .filter((v) => v.category_code === c.category_code)
      .map((v) => v.variable_code),
  }));

  const variables: ScoringVariableConfig[] = simConfig.variables.map((v) => ({
    variable_code: v.variable_code,
    category_code: v.category_code,
    local_weight: v.local_weight,
  }));

  return {
    model_id: modelId,
    model_code: 'SIMULATION_SCENARIO',
    categories,
    variables,
  };
}

/**
 * Executes a deterministic simulation scoring run across all 350 roads
 * and produces full side-by-side comparison metrics against baseline scores.
 */
export function runSimulationComparison(
  featureVectors: RoadFeatureVector[],
  baselineScores: RankedRoadScore[],
  simConfig: SimulationModelConfig
): {
  simulatedRankedScores: RankedRoadScore[];
  comparisons: RoadComparisonResult[];
  summary: ScenarioSummary;
} {
  const scoringConfig = buildScoringModelConfig(simConfig);
  const simulatedRankedScores = rankRoads(featureVectors, scoringConfig);

  // Map baseline scores by road_key
  const baselineMap = new Map<string, RankedRoadScore>(
    baselineScores.map((b) => [b.road_key, b])
  );

  let movedUpCount = 0;
  let movedDownCount = 0;
  let unchangedCount = 0;
  let tierChangedCount = 0;

  let biggestUpwardMover: ScenarioSummary['biggest_upward_mover'] = null;
  let biggestDownwardMover: ScenarioSummary['biggest_downward_mover'] = null;

  const comparisons: RoadComparisonResult[] = simulatedRankedScores.map((sim) => {
    const base = baselineMap.get(sim.road_key);
    if (!base) {
      throw new Error(`MISSING_BASELINE: No baseline score found for road '${sim.road_key}'`);
    }

    // Explicit definition: rank_delta = baseline_rank - simulated_rank
    // Positive means moved UP (e.g. rank 10 -> rank 4 => +6)
    // Negative means moved DOWN (e.g. rank 2 -> rank 8 => -6)
    const rankDelta = base.priority_rank - sim.priority_rank;
    const scoreDelta = sim.final_score - base.final_score;
    const tierChanged = base.tier_category !== sim.tier_category;

    if (rankDelta > 0) movedUpCount++;
    else if (rankDelta < 0) movedDownCount++;
    else unchangedCount++;

    if (tierChanged) tierChangedCount++;

    // Track biggest movers
    if (
      rankDelta > 0 &&
      (!biggestUpwardMover || rankDelta > biggestUpwardMover.rank_delta)
    ) {
      biggestUpwardMover = {
        road_key: sim.road_key,
        nomor_ruas: sim.nomor_ruas,
        display_name: sim.display_name,
        baseline_rank: base.priority_rank,
        simulated_rank: sim.priority_rank,
        rank_delta: rankDelta,
      };
    }

    if (
      rankDelta < 0 &&
      (!biggestDownwardMover || rankDelta < biggestDownwardMover.rank_delta)
    ) {
      biggestDownwardMover = {
        road_key: sim.road_key,
        nomor_ruas: sim.nomor_ruas,
        display_name: sim.display_name,
        baseline_rank: base.priority_rank,
        simulated_rank: sim.priority_rank,
        rank_delta: rankDelta,
      };
    }

    return {
      road_key: sim.road_key,
      nomor_ruas: sim.nomor_ruas,
      display_name: sim.display_name,
      district_name: sim.district_name,
      baseline_rank: base.priority_rank,
      simulated_rank: sim.priority_rank,
      rank_delta: rankDelta,
      baseline_score: base.final_score,
      simulated_score: sim.final_score,
      score_delta: scoreDelta,
      baseline_tier: base.tier_category,
      simulated_tier: sim.tier_category,
      tier_changed: tierChanged,
      subtotal_teknis: sim.category_subtotals['TEKNIS_JALAN']?.subtotal || 0.0,
      subtotal_akses: sim.category_subtotals['AKSESIBILITAS']?.subtotal || 0.0,
      subtotal_pelayanan: sim.category_subtotals['PELAYANAN_MASYARAKAT']?.subtotal || 0.0,
      subtotal_spasial: sim.category_subtotals['SPASIAL_DEMOGRAFI']?.subtotal || 0.0,
    };
  });

  const summary: ScenarioSummary = {
    roads_evaluated: simulatedRankedScores.length,
    moved_up_count: movedUpCount,
    moved_down_count: movedDownCount,
    unchanged_count: unchangedCount,
    tier_changed_count: tierChangedCount,
    biggest_upward_mover: biggestUpwardMover,
    biggest_downward_mover: biggestDownwardMover,
    top10_simulated: comparisons.slice(0, 10),
  };

  return {
    simulatedRankedScores,
    comparisons,
    summary,
  };
}

/**
 * Explains why a specific road moved rank between baseline and simulation.
 * Returns comparative factor decomposition for all 17 variables.
 */
export function explainRoadMovement(
  roadKey: string,
  featureVectors: RoadFeatureVector[],
  baselineScores: RankedRoadScore[],
  simConfig: SimulationModelConfig
): RoadDetailComparison {
  const roadFeatures = featureVectors.find((r) => r.road_key === roadKey);
  if (!roadFeatures) {
    throw new Error(`ROAD_NOT_FOUND: Road '${roadKey}' not found in feature vectors.`);
  }

  const baseRoadScore = baselineScores.find((r) => r.road_key === roadKey);
  if (!baseRoadScore) {
    throw new Error(`BASELINE_SCORE_NOT_FOUND: No baseline score for road '${roadKey}'.`);
  }

  const baselineWeights = calculateNormalizedWeights(
    buildScoringModelConfig(getBaselineSimulationConfig())
  );
  const simWeights = calculateNormalizedWeights(buildScoringModelConfig(simConfig));

  // Determine simulated rank
  const simScoringConfig = buildScoringModelConfig(simConfig);
  const allSimScores = rankRoads(featureVectors, simScoringConfig);
  const simRoadScore = allSimScores.find((r) => r.road_key === roadKey)!;

  const categoryNameMap = new Map<string, string>(
    simConfig.categories.map((c) => [c.category_code, c.category_name])
  );

  const factors: RoadFactorExplainability[] = simConfig.variables.map((v) => {
    const normVal = roadFeatures.normalized_values[v.variable_code] || 0.0;
    const baseEffWeight = baselineWeights.effective_weights[v.variable_code] || 0.0;
    const simEffWeight = simWeights.effective_weights[v.variable_code] || 0.0;

    const baseContribution = normVal * baseEffWeight;
    const simContribution = normVal * simEffWeight;

    return {
      variable_code: v.variable_code,
      variable_label: v.variable_label,
      category_code: v.category_code,
      category_name: categoryNameMap.get(v.category_code) || v.category_code,
      normalized_value: normVal,
      baseline_effective_weight: baseEffWeight,
      simulated_effective_weight: simEffWeight,
      weight_delta: simEffWeight - baseEffWeight,
      baseline_contribution: baseContribution,
      simulated_contribution: simContribution,
      contribution_delta: simContribution - baseContribution,
    };
  });

  return {
    road_key: roadKey,
    nomor_ruas: roadFeatures.nomor_ruas,
    display_name: roadFeatures.display_name,
    district_name: roadFeatures.district_name,
    baseline_rank: baseRoadScore.priority_rank,
    simulated_rank: simRoadScore.priority_rank,
    rank_delta: baseRoadScore.priority_rank - simRoadScore.priority_rank,
    baseline_score: baseRoadScore.final_score,
    simulated_score: simRoadScore.final_score,
    score_delta: simRoadScore.final_score - baseRoadScore.final_score,
    baseline_tier: baseRoadScore.tier_category,
    simulated_tier: simRoadScore.tier_category,
    factors,
  };
}
