import type { RoadScoreBreakdown } from './types.ts';

export const EPSILON_SCORE_TIE = 1e-7;
export const EPSILON_MANTAP_TIE = 1e-4;

/**
 * Deterministic Tie-Breaking Comparator
 * Obeying SCORING_ENGINE_CONTRACT_V1.md Section 4.
 *
 * Rules:
 * 1. Primary: Higher FinalScore (if difference > 1e-7).
 * 2. Criterion 1 (Damage Urgency): Lower mantap_pct ranks higher.
 * 3. Criterion 2 (Population Served): Higher penduduk_dilayani_raw ranks higher.
 * 4. Criterion 3 (Official Road Number): Ascending nomor_ruas (e.g. '012' beats '045').
 *
 * Return negative if A should rank before B (A is higher priority),
 * positive if B should rank before A, 0 if identical (impossible due to unique nomor_ruas).
 */
export function compareRoadPriority(
  a: RoadScoreBreakdown,
  b: RoadScoreBreakdown
): number {
  const scoreDiff = b.final_score - a.final_score;

  // Primary: Significant score difference (> 1e-7)
  if (Math.abs(scoreDiff) > EPSILON_SCORE_TIE) {
    return scoreDiff;
  }

  // Criterion 1: Road Damage Urgency (Lower mantap_pct = higher priority)
  const mantapDiff = a.tie_breaker_metadata.mantap_pct - b.tie_breaker_metadata.mantap_pct;
  if (Math.abs(mantapDiff) > EPSILON_MANTAP_TIE) {
    return mantapDiff; // smaller mantap_pct comes first
  }

  // Criterion 2: Population Served (Higher population = higher priority)
  const popDiff =
    b.tie_breaker_metadata.penduduk_dilayani_raw -
    a.tie_breaker_metadata.penduduk_dilayani_raw;
  if (Math.abs(popDiff) > 0.001) {
    return popDiff; // larger population comes first
  }

  // Criterion 3: Official SK Road Number (Ascending lexicographical order)
  return a.nomor_ruas.localeCompare(b.nomor_ruas);
}
