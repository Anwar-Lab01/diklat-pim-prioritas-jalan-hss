const STORAGE_KEY = 'hss-road-planning-workspace-v1';
const ROAD_KEY_PATTERN = /^HSS-KAB-\d{3}$/;
const MODES = new Set(['OPERATIONAL_2025', 'BENCHMARK_2024']);
const CATEGORY_CODES = new Set(['TEKNIS_JALAN', 'AKSESIBILITAS', 'PELAYANAN_MASYARAKAT', 'SPASIAL_DEMOGRAFI']);
const CATEGORY_COUNTS = { TEKNIS_JALAN: 7, AKSESIBILITAS: 3, PELAYANAN_MASYARAKAT: 4, SPASIAL_DEMOGRAFI: 3 };

function limitedText(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function validConfig(config) {
  if (!config || !Array.isArray(config.categories) || !Array.isArray(config.variables)) return null;
  if (config.categories.length !== 4 || config.variables.length !== 17) return null;
  const categories = config.categories.filter((item) => CATEGORY_CODES.has(item.category_code)
    && Number.isFinite(item.raw_weight) && item.raw_weight >= 0 && item.raw_weight <= 1);
  const variables = config.variables.filter((item) => typeof item.variable_code === 'string'
    && CATEGORY_CODES.has(item.category_code) && Number.isFinite(item.local_weight)
    && item.local_weight >= 0 && item.local_weight <= 1);
  if (categories.length !== 4 || variables.length !== 17) return null;
  if (new Set(categories.map((item) => item.category_code)).size !== 4
    || new Set(variables.map((item) => item.variable_code)).size !== 17) return null;
  if (Math.abs(categories.reduce((sum, item) => sum + item.raw_weight, 0) - 1) > 0.002) return null;
  if (Object.entries(CATEGORY_COUNTS).some(([code, count]) => {
    const local = variables.filter((item) => item.category_code === code);
    return local.length !== count || Math.abs(local.reduce((sum, item) => sum + item.local_weight, 0) - 1) > 0.002;
  })) return null;
  return {
    categories: categories.map(({ category_code, raw_weight }) => ({ category_code, raw_weight })),
    variables: variables.map(({ variable_code, category_code, local_weight }) => ({ variable_code, category_code, local_weight })),
  };
}

function validRoads(roads = []) {
  if (!Array.isArray(roads)) return [];
  return roads.filter((item) => item && ROAD_KEY_PATTERN.test(item.road_key)).slice(0, 350).map((item) => ({
    road_key: item.road_key,
    recommendation: item.recommendation === 'defer' ? 'defer' : 'propose',
    rationale: limitedText(item.rationale),
    recorded_decision: ['approved', 'deferred', 'not_selected'].includes(item.recorded_decision) ? item.recorded_decision : 'unrecorded',
    decision_note: limitedText(item.decision_note),
    decision_date: /^\d{4}-\d{2}-\d{2}$/.test(item.decision_date || '') ? item.decision_date : '',
    evidence: item.evidence && typeof item.evidence === 'object' ? {
      display_name: limitedText(item.evidence.display_name, 160),
      district_name: limitedText(item.evidence.district_name, 120),
      rank: Number.isInteger(item.evidence.rank) ? item.evidence.rank : null,
      mantap_pct: Number.isFinite(item.evidence.mantap_pct) ? item.evidence.mantap_pct : null,
      final_score: Number.isFinite(item.evidence.final_score) ? item.evidence.final_score : null,
      length_km: Number.isFinite(item.evidence.length_km) ? item.evidence.length_km : null,
      condition_year: Number.isInteger(item.evidence.condition_year) ? item.evidence.condition_year : null,
      condition_source: limitedText(item.evidence.condition_source, 200),
      condition: item.evidence.condition && typeof item.evidence.condition === 'object' ? Object.fromEntries(
        ['baik_pct', 'sedang_pct', 'rusak_ringan_pct', 'rusak_berat_pct'].flatMap((key) => Number.isFinite(item.evidence.condition[key]) ? [[key, item.evidence.condition[key]]] : []),
      ) : null,
      key_factors: Array.isArray(item.evidence.key_factors) ? item.evidence.key_factors.slice(0, 3).flatMap((factor) => (
        factor && typeof factor.label === 'string' && Number.isFinite(factor.contribution)
          ? [{ label: limitedText(factor.label, 120), contribution: factor.contribution }]
          : []
      )) : [],
      rank_mode: MODES.has(item.evidence.rank_mode) ? item.evidence.rank_mode : null,
      rank_model: limitedText(item.evidence.rank_model, 80),
    } : null,
  }));
}

export function emptyPlanningWorkspace() {
  return { version: 1, scenarios: [], proposals: [], draft: { title: 'Usulan penanganan jalan', rationale: '', planning_period: '', mode: 'OPERATIONAL_2025', roads: [], scenario_name: '', config: null } };
}

export function normalizePlanningWorkspace(raw) {
  const empty = emptyPlanningWorkspace();
  if (!raw || typeof raw !== 'object') return empty;
  const scenarios = (Array.isArray(raw.scenarios) ? raw.scenarios : []).slice(-30).flatMap((item) => {
    const config = validConfig(item?.config);
    if (!config || typeof item.id !== 'string') return [];
    return [{ id: limitedText(item.id, 80), name: limitedText(item.name, 100) || 'Skenario tanpa nama', mode: MODES.has(item.mode) ? item.mode : 'OPERATIONAL_2025', created_at: limitedText(item.created_at, 40), config }];
  });
  const proposals = (Array.isArray(raw.proposals) ? raw.proposals : []).slice(-100).flatMap((item) => {
    if (!item || typeof item.id !== 'string') return [];
    return [{ id: limitedText(item.id, 80), title: limitedText(item.title, 100) || 'Usulan tanpa judul', rationale: limitedText(item.rationale), planning_period: limitedText(item.planning_period, 100), status: 'DRAFT', mode: MODES.has(item.mode) ? item.mode : 'OPERATIONAL_2025', model: 'POLICY_DEFAULT_V1', created_at: limitedText(item.created_at, 40), updated_at: limitedText(item.updated_at, 40), scenario_name: limitedText(item.scenario_name, 100), config: validConfig(item.config), roads: validRoads(item.roads) }];
  });
  const draft = raw.draft && typeof raw.draft === 'object' ? raw.draft : empty.draft;
  return {
    version: 1,
    scenarios,
    proposals,
    draft: {
      id: typeof draft.id === 'string' ? limitedText(draft.id, 80) : '',
      title: limitedText(draft.title, 100) || empty.draft.title,
      rationale: limitedText(draft.rationale),
      planning_period: limitedText(draft.planning_period, 100),
      mode: MODES.has(draft.mode) ? draft.mode : empty.draft.mode,
      roads: validRoads(draft.roads),
      scenario_name: limitedText(draft.scenario_name, 100),
      config: validConfig(draft.config),
    },
  };
}

export function readPlanningWorkspace(storage) {
  try {
    return normalizePlanningWorkspace(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return emptyPlanningWorkspace();
  }
}

export function writePlanningWorkspace(storage, workspace) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizePlanningWorkspace(workspace)));
    return true;
  } catch {
    return false;
  }
}

export function summarizeRankSensitivity(rankings, cutoff = 35) {
  const roads = new Map();
  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    for (const item of ranking) {
      if (!ROAD_KEY_PATTERN.test(item?.road_key) || !Number.isInteger(item.priority_rank)) continue;
      const record = roads.get(item.road_key) || { road_key: item.road_key, ranks: [] };
      record.ranks.push(item.priority_rank);
      roads.set(item.road_key, record);
    }
  }
  const scenarioCount = rankings.filter(Array.isArray).length;
  return Array.from(roads.values()).map((item) => {
    const min_rank = Math.min(...item.ranks);
    const max_rank = Math.max(...item.ranks);
    const candidate_count = item.ranks.filter((rank) => rank <= cutoff).length;
    return { ...item, min_rank, max_rank, rank_range: max_rank - min_rank, candidate_count, scenario_count: scenarioCount };
  }).sort((a, b) => b.candidate_count - a.candidate_count || a.rank_range - b.rank_range || a.min_rank - b.min_rank || a.road_key.localeCompare(b.road_key));
}
