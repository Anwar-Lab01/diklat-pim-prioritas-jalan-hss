import type {
  RoadFeatureVector,
  ScoringModelConfig,
  NormalizedModelWeights,
  FactorContribution,
  CategorySubtotal,
  RoadScoreBreakdown,
  RankedRoadScore,
  TierCategory,
} from './types.ts';
import { calculateNormalizedWeights } from './normalization.ts';
import { compareRoadPriority } from './tieBreaker.ts';

/**
 * Assigns tier category according to official ranking percentiles.
 * Top-35 (Top 10%), Top-70 (Top 20%), Top-105 (Top 30%), Regular.
 */
export function determineTierCategory(rank: number): TierCategory {
  if (rank <= 35) return 'TOP_35';
  if (rank <= 70) return 'TOP_70';
  if (rank <= 105) return 'TOP_105';
  return 'REGULAR';
}

/**
 * Pure function: Scores a single road feature vector against a model configuration.
 *
 * For category k and variable i:
 * - contribution[k, i] = normalized_value[i] * effective_weight[k, i]
 * - category_subtotal[k] = sum(contribution[k, i])
 * - final_score = sum(category_subtotal[k])
 */
export function scoreRoad(
  features: RoadFeatureVector,
  modelConfig: ScoringModelConfig,
  precomputedWeights?: NormalizedModelWeights
): RoadScoreBreakdown {
  const weights = precomputedWeights || calculateNormalizedWeights(modelConfig);

  const factor_contributions: Record<string, FactorContribution> = {};
  const category_subtotals: Record<string, CategorySubtotal> = {};

  // Initialize category subtotals
  for (const cat of modelConfig.categories) {
    category_subtotals[cat.category_code] = {
      category_code: cat.category_code,
      raw_weight: cat.raw_weight,
      normalized_weight: weights.category_normalized_weights[cat.category_code] || 0.0,
      subtotal: 0.0,
    };
  }

  let final_score = 0.0;

  // Calculate 17 variable contributions
  for (const v of modelConfig.variables) {
    const rawNormVal = features.normalized_values[v.variable_code];
    if (rawNormVal === undefined || isNaN(rawNormVal)) {
      throw new Error(
        `MISSING_VARIABLE: Road ${features.road_key} is missing normalized value for '${v.variable_code}'.`
      );
    }

    // Strict clamping [0.0, 1.0]
    const normVal = Math.min(1.0, Math.max(0.0, rawNormVal));
    const effWeight = weights.effective_weights[v.variable_code] || 0.0;
    const contribution = normVal * effWeight;

    factor_contributions[v.variable_code] = {
      variable_code: v.variable_code,
      category_code: v.category_code,
      normalized_value: normVal,
      effective_weight: effWeight,
      contribution,
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
      nomor_ruas: features.nomor_ruas,
    },
  };
}

/**
 * Pure function: Scores and deterministically ranks an entire list of road feature vectors.
 *
 * Guarantees:
 * - 1-to-1 bijective ranking {1, 2, ..., N} with zero duplicate ranks.
 * - Cascading tie-breaking on tied scores.
 * - Reproducible ordering.
 */
export function rankRoads(
  roadFeaturesList: RoadFeatureVector[],
  modelConfig: ScoringModelConfig
): RankedRoadScore[] {
  const weights = calculateNormalizedWeights(modelConfig);

  // 1. Calculate scores and factor breakdowns for each road
  const scoredRoads: RoadScoreBreakdown[] = roadFeaturesList.map((rf) =>
    scoreRoad(rf, modelConfig, weights)
  );

  // 2. Sort using deterministic tie-breaker cascade
  scoredRoads.sort(compareRoadPriority);

  // 3. Assign contiguous ranks 1..N and tier categories
  const rankedRoads: RankedRoadScore[] = scoredRoads.map((road, index) => {
    const priority_rank = index + 1;
    return {
      ...road,
      priority_rank,
      tier_category: determineTierCategory(priority_rank),
    };
  });

  return rankedRoads;
}
