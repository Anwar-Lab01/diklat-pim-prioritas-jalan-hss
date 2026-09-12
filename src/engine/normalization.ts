import type {
  ScoringModelConfig,
  NormalizedModelWeights,
} from './types.ts';

export const EPSILON_WEIGHT_TOLERANCE = 1e-9;

/**
 * Calculates dynamic normalized category weights and global effective weights.
 *
 * Formulas:
 * 1. Category Normalization:
 *    S_W = sum(raw_category_weights)
 *    W_k^* = raw_category_weight[k] / S_W
 *
 * 2. Effective Weight:
 *    Omega_{k, i} = W_k^* * local_weight[k, i]
 */
export function calculateNormalizedWeights(
  modelConfig: ScoringModelConfig
): NormalizedModelWeights {
  const categoryRawSum = modelConfig.categories.reduce(
    (sum, c) => sum + c.raw_weight,
    0
  );

  if (categoryRawSum <= 0) {
    throw new Error(
      `INVALID_CATEGORY_WEIGHTS: Sum of category raw weights must be positive, got ${categoryRawSum}`
    );
  }

  const category_normalized_weights: Record<string, number> = {};
  for (const cat of modelConfig.categories) {
    category_normalized_weights[cat.category_code] = cat.raw_weight / categoryRawSum;
  }

  // Validate Level 1 invariant: sum(W_k^*) == 1.0
  const normalizedCatSum = Object.values(category_normalized_weights).reduce(
    (s, w) => s + w,
    0
  );
  if (Math.abs(normalizedCatSum - 1.0) > EPSILON_WEIGHT_TOLERANCE) {
    throw new Error(
      `INVARIANT_VIOLATION_LEVEL_1: Sum of normalized category weights must be 1.0, got ${normalizedCatSum}`
    );
  }

  // Group variables by category to validate Level 2 invariants
  const varsByCategory = new Map<string, typeof modelConfig.variables>();
  for (const v of modelConfig.variables) {
    if (!varsByCategory.has(v.category_code)) {
      varsByCategory.set(v.category_code, []);
    }
    varsByCategory.get(v.category_code)!.push(v);
  }

  const effective_weights: Record<string, number> = {};
  let globalEffectiveSum = 0;

  for (const cat of modelConfig.categories) {
    const catVars = varsByCategory.get(cat.category_code) || [];
    if (catVars.length === 0) {
      throw new Error(
        `EMPTY_CATEGORY: Category ${cat.category_code} has 0 variables.`
      );
    }

    const localSum = catVars.reduce((s, v) => s + v.local_weight, 0);
    if (Math.abs(localSum - 1.0) > EPSILON_WEIGHT_TOLERANCE) {
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

  // Validate global effective weights sum: sum(Omega) == 1.0
  if (Math.abs(globalEffectiveSum - 1.0) > EPSILON_WEIGHT_TOLERANCE) {
    throw new Error(
      `INVARIANT_VIOLATION_GLOBAL_EFFECTIVE: Sum of all 17 effective weights must be 1.0, got ${globalEffectiveSum}`
    );
  }

  return {
    category_normalized_weights,
    effective_weights,
  };
}
