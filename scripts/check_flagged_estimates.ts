import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

// Check all segments and how they are evaluated
const estimates = db.prepare(`
  SELECT 
    segment_id,
    road_key,
    matched_width_m,
    segment_length_m,
    unit_price_rp,
    indicative_cost_rp,
    adjustment_flags,
    calculation_mode
  FROM road_segment_cost_estimates
  WHERE scenario_id = 'SCN-2027-BASELINE'
`).all() as any[];

console.log('Total estimates:', estimates.length);

const flagged = estimates.filter(e => e.adjustment_flags && e.adjustment_flags.includes('MANUAL_REVIEW_WIDTH_EXCEEDED'));
console.log('Flagged MANUAL_REVIEW_WIDTH_EXCEEDED count:', flagged.length);
console.log(flagged);

const totalCostPrevious = estimates.reduce((sum, e) => sum + e.indicative_cost_rp, 0);
console.log('Total cost previous sum of segments:', totalCostPrevious);

const flaggedCost = flagged.reduce((sum, e) => sum + e.indicative_cost_rp, 0);
console.log('Flagged segments cost sum:', flaggedCost);

console.log('Cost without flagged segments:', totalCostPrevious - flaggedCost);
