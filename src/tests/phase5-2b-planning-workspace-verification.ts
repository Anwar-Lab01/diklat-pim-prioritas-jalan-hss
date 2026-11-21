import assert from 'node:assert/strict';
import { emptyPlanningWorkspace, normalizePlanningWorkspace, readPlanningWorkspace, summarizeRankSensitivity, writePlanningWorkspace } from '../public/planningWorkspace.js';

const categoryCodes = ['TEKNIS_JALAN', 'AKSESIBILITAS', 'PELAYANAN_MASYARAKAT', 'SPASIAL_DEMOGRAFI'];
const config = {
  categories: categoryCodes.map((category_code) => ({ category_code, raw_weight: 0.25 })),
  variables: categoryCodes.flatMap((category_code, categoryIndex) => {
    const count = [7, 3, 4, 3][categoryIndex];
    return Array.from({ length: count }, (_, index) => ({ variable_code: `${category_code}_${index}`, category_code, local_weight: 1 / count }));
  }),
};
const storage = {
  value: null as string | null,
  getItem() { return this.value; },
  setItem(_key: string, value: string) { this.value = value; },
};

assert.deepEqual(readPlanningWorkspace(storage), emptyPlanningWorkspace(), 'An empty browser store starts with a blank draft.');

const workspace = {
  ...emptyPlanningWorkspace(),
  scenarios: [{ id: 'scn-1', name: 'Perhatian kerusakan berat', mode: 'OPERATIONAL_2025', created_at: '2026-10-22', config }],
  draft: {
    id: '', title: 'Kajian Kandangan', rationale: 'Ruas dibandingkan pada kondisi 2025.', mode: 'OPERATIONAL_2025',
    scenario_name: 'Perhatian kerusakan berat', config,
    roads: [{ road_key: 'HSS-KAB-034', recommendation: 'propose', rationale: 'Menjaga koridor yang masih mantap.', evidence: { display_name: 'Jl. Jend. Sudirman', rank: 6, mantap_pct: 100, final_score: 0.543922, length_km: 2.44, condition_year: 2025, condition_source: 'kondisi_2025.csv', rank_mode: 'OPERATIONAL_2025', rank_model: 'POLICY_DEFAULT_V1', condition: { baik_pct: 20, sedang_pct: 80, rusak_ringan_pct: 0, rusak_berat_pct: 0 } } }],
  },
};
assert.equal(writePlanningWorkspace(storage, workspace), true, 'A named scenario and proposal save to local browser storage.');
assert.equal(readPlanningWorkspace(storage).draft.roads[0].road_key, 'HSS-KAB-034', 'A saved shortlist survives a read-after-write.');
assert.equal(readPlanningWorkspace(storage).draft.planning_period, '', 'An unset planning period remains explicitly blank.');
assert.equal(readPlanningWorkspace(storage).draft.roads[0].evidence.rank_mode, 'OPERATIONAL_2025', 'Road evidence retains the ranking context used when it was added.');
assert.equal(readPlanningWorkspace(storage).draft.roads[0].evidence.condition_source, 'kondisi_2025.csv', 'Road evidence retains its condition source.');

const sanitized = normalizePlanningWorkspace({ ...workspace, draft: { ...workspace.draft, roads: [{ road_key: '<script>', rationale: '<img src=x>' }] } });
assert.equal(sanitized.draft.roads.length, 0, 'Invalid road IDs never enter saved decisions.');
assert.equal(normalizePlanningWorkspace({ ...workspace, scenarios: [{ id: 'x', config: { categories: [], variables: [] } }] }).scenarios.length, 0, 'Incomplete model weights cannot be saved as a valid scenario.');

const summary = summarizeRankSensitivity([
  [{ road_key: 'HSS-KAB-001', priority_rank: 8 }, { road_key: 'HSS-KAB-002', priority_rank: 40 }],
  [{ road_key: 'HSS-KAB-001', priority_rank: 9 }, { road_key: 'HSS-KAB-002', priority_rank: 20 }],
]);
assert.deepEqual(summary[0], { road_key: 'HSS-KAB-001', ranks: [8, 9], min_rank: 8, max_rank: 9, rank_range: 1, candidate_count: 2, scenario_count: 2 }, 'Sensitivity results show rank range and shortlist appearances, not probability.');
assert.equal(summary[1].candidate_count, 1, 'Shortlist appearances use the configured rank cutoff independently per scenario.');

storage.value = '{';
assert.deepEqual(readPlanningWorkspace(storage), emptyPlanningWorkspace(), 'Corrupt browser storage recovers to a clean, empty workspace.');
console.log('[PASS] Planning workspace persistence, input validation, and deterministic rank sensitivity.');
