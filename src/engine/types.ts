/**
 * Pure Domain Types for Deterministic Scoring Micro-Engine
 * Zero database, filesystem, or UI dependencies.
 */

export type TierCategory = 'TOP_35' | 'TOP_70' | 'TOP_105' | 'REGULAR';

export interface RoadFeatureVector {
  road_key: string;
  nomor_ruas: string;
  display_name: string;
  district_name: string;
  mantap_pct: number;               // 0.0 to 100.0 (used in Tie-Breaker Criterion 1)
  penduduk_dilayani_raw: number;     // Raw population (used in Tie-Breaker Criterion 2)
  normalized_values: Record<string, number>; // Exactly 17 variables, values in [0.0, 1.0]
}

export interface ScoringCategoryConfig {
  category_code: string;
  category_name?: string;
  raw_weight: number;
  variable_codes: string[];
}

export interface ScoringVariableConfig {
  variable_code: string;
  category_code: string;
  local_weight: number;             // Sum of local weights within category = 1.0
}

export interface ScoringModelConfig {
  model_id: string;
  model_code: string;
  categories: ScoringCategoryConfig[];
  variables: ScoringVariableConfig[];
}

export interface NormalizedModelWeights {
  category_normalized_weights: Record<string, number>; // W_k^* = W_k / sum(W)
  effective_weights: Record<string, number>;           // Omega_{k,i} = W_k^* * w_{k,i}
}

export interface FactorContribution {
  variable_code: string;
  category_code: string;
  normalized_value: number;
  effective_weight: number;
  contribution: number;                                // norm_val * eff_weight
}

export interface CategorySubtotal {
  category_code: string;
  raw_weight: number;
  normalized_weight: number;
  subtotal: number;                                    // sum of contributions in category
}

export interface RoadScoreBreakdown {
  road_key: string;
  nomor_ruas: string;
  display_name: string;
  district_name: string;
  final_score: number;                                 // sum of category subtotals
  category_subtotals: Record<string, CategorySubtotal>;
  factor_contributions: Record<string, FactorContribution>;
  tie_breaker_metadata: {
    mantap_pct: number;
    penduduk_dilayani_raw: number;
    nomor_ruas: string;
  };
}

export interface RankedRoadScore extends RoadScoreBreakdown {
  priority_rank: number;                               // 1 through 350
  tier_category: TierCategory;
}
