import { DatabaseSync } from 'node:sqlite';
import { TreatmentCostingEngine } from '../src/services/treatmentCostingEngine.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const engine = new TreatmentCostingEngine(db);

console.log('Recalculating SCN-2027-BASELINE...');
const baseSummary = engine.calculateAndPersistScenario('SCN-2027-BASELINE');
console.log('BASELINE Summary:', {
  total_roads: baseSummary.total_roads,
  funded_roads: baseSummary.funded_roads,
  deferred_roads: baseSummary.deferred_roads,
  total_segments: baseSummary.total_segments,
  standardized_treated_segments: baseSummary.standardized_treated_segments,
  routine_segments: baseSummary.routine_segments,
  manual_review_segments: baseSummary.manual_review_segments,
  treated_length_km: baseSummary.treated_length_km,
  manual_review_length_km: baseSummary.manual_review_length_km,
  total_cost_rp: baseSummary.total_cost_rp,
  total_cost_formatted: 'Rp ' + baseSummary.total_cost_rp.toLocaleString('id-ID'),
  allocated_cost_rp: baseSummary.allocated_cost_rp,
  allocated_cost_formatted: 'Rp ' + baseSummary.allocated_cost_rp.toLocaleString('id-ID'),
  ceiling_rp: baseSummary.budget_ceiling_rp,
  remaining_ceiling: 'Rp ' + (baseSummary.budget_ceiling_rp - baseSummary.allocated_cost_rp).toLocaleString('id-ID')
});

console.log('\nRecalculating SCN-2027-OPT_30M...');
const opt30Summary = engine.calculateAndPersistScenario('SCN-2027-OPT_30M');
console.log('OPT_30M Summary:', {
  total_roads: opt30Summary.total_roads,
  funded_roads: opt30Summary.funded_roads,
  deferred_roads: opt30Summary.deferred_roads,
  total_cost_rp: opt30Summary.total_cost_rp,
  allocated_cost_rp: opt30Summary.allocated_cost_rp,
  allocated_cost_formatted: 'Rp ' + opt30Summary.allocated_cost_rp.toLocaleString('id-ID'),
  ceiling_rp: opt30Summary.budget_ceiling_rp,
  remaining_ceiling: 'Rp ' + (opt30Summary.budget_ceiling_rp - opt30Summary.allocated_cost_rp).toLocaleString('id-ID')
});
