import { DatabaseSync } from 'node:sqlite';
import { TreatmentCostingEngine } from '../src/services/treatmentCostingEngine.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const engine = new TreatmentCostingEngine(db);

const baseDetail = engine.getScenarioDetailSummary('SCN-2027-BASELINE');
console.log('=== SCN-2027-BASELINE (Rp 50 Miliar) METRICS ===');
console.log('Allocated Rp:', baseDetail.allocated_cost_rp.toLocaleString('id-ID'));
console.log('Total Roads:', baseDetail.total_roads);
console.log('Funded Roads (in queue):', baseDetail.funded_roads);
console.log('Funded Construction Roads (> Rp 0):', baseDetail.funded_construction_roads);
console.log('Routine Maintenance Roads (Rp 0):', baseDetail.routine_maintenance_roads);
console.log('Manual Technical Review Roads (Rp 0):', baseDetail.manual_review_roads);
console.log('Status Breakdown:', baseDetail.status_breakdown);
console.log('Planning Indicators:', baseDetail.planning_indicators);

console.log('\nTop 20 roads in SCN-2027-BASELINE:');
const roads = engine.getRoadCostSummaries('SCN-2027-BASELINE');
for (const r of roads.slice(0, 20)) {
  console.log(`Rank #${r.allocation_rank} [${r.road_key}] ${r.road_name}: Status=${r.operational_status} | Pagu ASB=Rp ${r.total_pagu_asb_rp.toLocaleString('id-ID')} | Allocated=Rp ${(r.allocated_pagu_rp || 0).toLocaleString('id-ID')} | Treated Segs=${r.allocated_treated_segments || 0}/${r.treated_segments}`);
}

console.log('\n=== RECALCULATE SCN-2027-OPT_30M (Rp 30 Miliar) ===');
const opt30Detail = engine.calculateAndPersistScenario('SCN-2027-OPT_30M');
console.log('Allocated Rp:', opt30Detail.allocated_cost_rp.toLocaleString('id-ID'));
console.log('Funded Roads (in queue):', opt30Detail.funded_roads);
console.log('Funded Construction Roads (> Rp 0):', opt30Detail.funded_construction_roads);
console.log('Routine Maintenance Roads (Rp 0):', opt30Detail.routine_maintenance_roads);
console.log('Manual Technical Review Roads (Rp 0):', opt30Detail.manual_review_roads);
console.log('Status Breakdown:', opt30Detail.status_breakdown);
