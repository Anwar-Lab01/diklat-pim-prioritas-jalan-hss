import { TreatmentCostingEngine } from '../src/services/treatmentCostingEngine.ts';
import { getDatabase } from '../src/db/connection.ts';

const db = getDatabase();
const engine = new TreatmentCostingEngine(db);

console.log('Calculating SCN-2027-BASELINE...');
const summary = engine.calculateAndPersistScenario('SCN-2027-BASELINE');

console.log('Calculation complete:');
console.log(`- Scenario: ${summary.scenario_name} (${summary.scenario_code})`);
console.log(`- Budget Ceiling: Rp ${summary.budget_ceiling_rp.toLocaleString('id-ID')}`);
console.log(`- Total Cost: Rp ${summary.total_cost_rp.toLocaleString('id-ID')}`);
console.log(`- Allocated Cost: Rp ${summary.allocated_cost_rp.toLocaleString('id-ID')}`);
console.log(`- Total Roads: ${summary.total_roads}`);
console.log(`- Funded Roads: ${summary.funded_roads}`);
console.log(`- Deferred Roads: ${summary.deferred_roads}`);
console.log(`- Total Segments: ${summary.total_segments}`);
console.log(`- Treated Segments: ${summary.treated_segments}`);
console.log(`- Routine Segments: ${summary.routine_segments}`);
console.log(`- Treated Length: ${summary.treated_length_km.toFixed(2)} km`);

// Also create a second scenario for comparison: SCN-2027-OPTIMAL-30M with ceiling Rp 30 Miliar
try {
  console.log('\nCreating comparison scenario SCN-2027-OPT-30M...');
  const optSummary = engine.createScenario({
    scenario_code: 'OPT_30M',
    scenario_name: 'Skenario Alokasi Terbatas (Plafon Rp 30 Miliar)',
    budget_year: 2027,
    budget_ceiling_rp: 30000000000,
    description: 'Skenario simulasi fiskal dengan batas pagu alokasi Rp 30 Miliar berbasis prioritas komposit AHP/WSM.'
  });
  console.log(`- Scenario Created: ${optSummary.scenario_name}`);
  console.log(`- Funded Roads: ${optSummary.funded_roads} / ${optSummary.total_roads}`);
  console.log(`- Allocated Cost: Rp ${optSummary.allocated_cost_rp.toLocaleString('id-ID')}`);
} catch (err: any) {
  console.log('Comparison scenario note:', err.message);
}
