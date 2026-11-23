/**
 * Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
 * Client Application Controller (Phase 3 & Phase 4 Web GIS)
 */

import {
  ROAD_TIER_STYLES,
  SELECTION_HALO_STYLE,
  HIT_TARGET_STYLE,
  REFERENCE_NETWORK_STYLES,
  ADMINISTRATIVE_STYLES,
  RTRW_COLORS,
  RTRW_FAMILY_LABELS,
  BASEMAP_CONFIG,
  createFacilityIcon,
  ROUTE_TRACING_STYLE,
  ROUTE_ACCESS_POINT_STYLE,
  DD1_SEGMENT_STYLES,
  getDD1SegmentFullMapStyle,
} from './mapStyle.js';
import { readPlanningWorkspace, summarizeRankSensitivity, writePlanningWorkspace } from './planningWorkspace.js';

function getSavedWorkspace() {
  try { return readPlanningWorkspace(window.localStorage); }
  catch { return readPlanningWorkspace({ getItem: () => null }); }
}

const initialWorkspace = getSavedWorkspace();
let drawerReturnFocus = null;

const state = {
  mode: initialWorkspace.draft.mode || 'OPERATIONAL_2025',
  modelCode: 'POLICY_DEFAULT_V1',
  currentView: 'dashboard',
  roads: [],
  filteredRoads: [],
  dashboardData: null,
  provenanceData: null,
  modelData: null,
  selectedRoadDetail: null,
  search: '',
  district: 'ALL',
  tier: 'ALL',
  condition: 'ALL',
  sort: 'rank_asc',
  page: 1,
  pageSize: 50,
  precisionMode: false,

  // --- Phase 4, 4.5, 4.6 & 5.1C Web GIS State ---
  roadThematicMode: 'PRIORITAS', // 'PRIORITAS' | 'KONDISI_DD1'
  map: null,
  mapInitialized: false,
  mapLayers: {
    osmBasemap: null,
    satelliteBasemap: null,
    countyRoads: null,
    countyRoadsHitTarget: null,
    fullDd1Segments: null,
    provincialRoads: null,
    nationalRoads: null,
    connectors: null,
    rsud: null,
    puskesmas: null,
    markets: null,
    schools: null,
    kabupaten: null,
    districts: null,
    villages: null,
    rtrw: null,
    selectionHalo: null,
    routeTrace: null,
    dd1Segments: null,
  },
  isInteractiveDetailMode: false,
  interactiveDetailRoadKey: null,
  inspectorRequest: 0,
  facilityRequest: 0,
  currentRoadNearestFacilities: [],
  currentRoadDemographics: null,
  currentRoadDD1Segments: null,
  showDd1Segments: false,
  mapData: {
    countyRoads: null,
    dd1Segments: null,
    referenceNetwork: null,
    facilities: null,
    kabupaten: null,
    districts: null,
    villages: null,
    rtrw: null,
  },
  mapFilters: {
    search: '',
    district: 'ALL',
    tier: 'ALL',
    condition: 'ALL',
  },
  selectedRoadKey: null,

  // --- Phase 4.7 Popup & Tooltip Interaction Control ---
  popupSettings: {
    masterEnabled: true,
    administrasi: true,
    fasilitas: true,
    jaringanReferensi: true,
    polaRuangRtrw: true,
  },
  tooltipSettings: {
    enabled: true,
  },

  // --- Phase 5: Policy Weight Scenario Simulation State ---
  simulation: {
    initialized: false,
    contextMode: null,
    scenarioId: '',
    simConfig: null,
    featureVectors: null,
    baselineScores: null,
    simulatedScores: null,
    comparisons: [],
    summary: null,
    activeVariableCategory: 'TEKNIS_JALAN',
    filter: {
      search: '',
      district: 'ALL',
      movement: 'ALL',
      tier: 'ALL',
    },
    page: 1,
    pageSize: 25,
    mapColorSource: 'BASELINE', // 'BASELINE' | 'SIMULATION'
    selectedRoadExplainKey: null,
    scenarioName: '',
  },
  workspace: initialWorkspace,
};

window.appState = state;
window.fitHssBounds = fitHssBounds;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
});

function syncDrawerAccessibility(drawer) {
  const modeless = drawer.classList.contains('drawer-map-mode') && window.matchMedia('(min-width: 1024px)').matches;
  drawer.setAttribute('aria-modal', String(!modeless));
  if (!modeless && !drawer.classList.contains('hidden') && !drawer.contains(document.activeElement)) {
    document.getElementById('btn-close-drawer')?.focus({ preventScroll: true });
  }
  return !modeless;
}

function initEventListeners() {
  initMobileNavigation();
  initPlanningWorkspace();
  document.addEventListener('keydown', (event) => {
    const drawer = document.getElementById('road-detail-drawer');
    if (!drawer || drawer.classList.contains('hidden')) {
      if (event.key === 'Escape' && state.currentView === 'peta' && state.isInteractiveDetailMode && !event.defaultPrevented) {
        if (state.activeTracedFacilityType) document.getElementById('btn-close-route-hud')?.click();
        else document.getElementById('hud-btn-close')?.click();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDetailDrawer();
      return;
    }
    if (event.key !== 'Tab' || !syncDrawerAccessibility(drawer)) return;
    const focusable = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  // Mode Selector
  const modeSelect = document.getElementById('mode-select');
  modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    state.simulation.initialized = false;
    state.simulation.contextMode = null;
    state.simulation.scenarioId = '';
    state.simulation.scenarioName = isBaselineSimulationConfig(state.simulation.simConfig) ? '' : 'Skenario saat ini';
    state.workspace.draft.scenario_name = '';
    updateModeVisuals();
    savePlanningWorkspace('Konteks draf diperbarui');
    writeRouteContext();
    reloadActiveData();
  });

  // Restore Operational Mode button in warning banner
  document.getElementById('btn-restore-operational').addEventListener('click', () => {
    state.mode = 'OPERATIONAL_2025';
    state.simulation.initialized = false;
    state.simulation.contextMode = null;
    state.simulation.scenarioId = '';
    state.simulation.scenarioName = isBaselineSimulationConfig(state.simulation.simConfig) ? '' : 'Skenario saat ini';
    state.workspace.draft.scenario_name = '';
    modeSelect.value = 'OPERATIONAL_2025';
    updateModeVisuals();
    savePlanningWorkspace('Konteks draf diperbarui');
    writeRouteContext();
    reloadActiveData();
  });

  // Table Search & Filters
  document.getElementById('table-search').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    syncSharedRoadFilters('table');
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-district').addEventListener('change', (e) => {
    state.district = e.target.value;
    syncSharedRoadFilters('table');
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-tier').addEventListener('change', (e) => {
    state.tier = e.target.value;
    syncSharedRoadFilters('table');
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-condition').addEventListener('change', (e) => {
    state.condition = e.target.value;
    syncSharedRoadFilters('table');
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value;
    applyTableFilters();
  });

  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('table-search').value = '';
    document.getElementById('filter-district').value = 'ALL';
    document.getElementById('filter-tier').value = 'ALL';
    document.getElementById('filter-condition').value = 'ALL';
    document.getElementById('sort-select').value = 'rank_asc';
    state.search = '';
    state.district = 'ALL';
    state.tier = 'ALL';
    state.condition = 'ALL';
    state.sort = 'rank_asc';
    state.page = 1;
    syncSharedRoadFilters('table');
    applyTableFilters();
    applyMapFilters();
  });

  document.getElementById('page-size-select').addEventListener('change', (e) => {
    state.pageSize = parseInt(e.target.value, 10);
    state.page = 1;
    renderPriorityTable();
  });

  // Drawer Close
  document.getElementById('btn-close-drawer').addEventListener('click', closeDetailDrawer);
  document.getElementById('btn-close-drawer-bottom').addEventListener('click', closeDetailDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDetailDrawer);

  // Precision Toggle in Drawer
  document.getElementById('precision-toggle').addEventListener('change', (e) => {
    state.precisionMode = e.target.checked;
    if (state.selectedRoadDetail) {
      renderFactorsBreakdown(state.selectedRoadDetail);
      renderMathAudit(state.selectedRoadDetail);
    }
  });

  // Phase 5 Simulation listeners
  initSimulationEventListeners();

  // Phase 5.1 Route Tracing listeners (Drawer & Card 5 Overlay)
  document.getElementById('btn-trace-puskesmas')?.addEventListener('click', () => traceNearestFacilityRoute('puskesmas'));
  document.getElementById('btn-trace-school')?.addEventListener('click', () => traceNearestFacilityRoute('school'));
  document.getElementById('btn-trace-hospital')?.addEventListener('click', () => traceNearestFacilityRoute('hospital'));
  document.getElementById('btn-trace-market')?.addEventListener('click', () => traceNearestFacilityRoute('market'));
  document.getElementById('btn-clear-route-trace')?.addEventListener('click', () => clearRouteTrace());

  // Interactive Road Detail Card 5 Facility Route listeners
  document.getElementById('btn-card-trace-puskesmas')?.addEventListener('click', () => traceNearestFacilityRoute('puskesmas'));
  document.getElementById('btn-card-trace-school')?.addEventListener('click', () => traceNearestFacilityRoute('school'));
  document.getElementById('btn-card-trace-hospital')?.addEventListener('click', () => traceNearestFacilityRoute('hospital'));
  document.getElementById('btn-card-trace-market')?.addEventListener('click', () => traceNearestFacilityRoute('market'));
  document.getElementById('btn-close-route-hud')?.addEventListener('click', () => {
    const type = state.activeTracedFacilityType;
    clearRouteTrace();
    document.getElementById(`btn-card-trace-${type}`)?.focus({ preventScroll: true });
  });
  document.getElementById('hud-btn-close')?.addEventListener('click', () => {
    exitInteractiveSpatialProfile();
    document.getElementById('hss-map')?.focus({ preventScroll: true });
  });
  document.getElementById('inspector-rtrw-layer')?.addEventListener('click', () => {
    document.getElementById('layer-rtrw')?.click();
  });

  // Toggle Road Narrative 8 Dimensions in Inspector
  document.getElementById('btn-toggle-narrative-full')?.addEventListener('click', () => {
    const box = document.getElementById('inspector-narrative-full-box');
    const icon = document.getElementById('btn-toggle-narrative-icon');
    const btn = document.getElementById('btn-toggle-narrative-full');
    if (!box || !btn) return;
    const isHidden = box.classList.contains('hidden');
    if (isHidden) {
      box.classList.remove('hidden');
      if (icon) icon.textContent = '▴ Ciutkan';
      btn.setAttribute('aria-expanded', 'true');
    } else {
      box.classList.add('hidden');
      if (icon) icon.textContent = '▾ Buka';
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  // Phase 5.1A Segment toggle listener
  document.getElementById('btn-toggle-dd1-segments')?.addEventListener('click', toggleDD1SegmentsOnMap);
}

function initMobileNavigation() {
  const toggle = document.getElementById('btn-mobile-nav');
  const panel = document.getElementById('mobile-navigation');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    setMobileNavigationOpen(!isExpanded);
  });

  panel.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-view]');
    if (!link) return;

    const currentHash = (window.location.hash || '#dashboard').split('?')[0];
    if (currentHash === link.getAttribute('href')) {
      event.preventDefault();
      setMobileNavigationOpen(false, { restoreFocus: true });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setMobileNavigationOpen(false, { restoreFocus: true });
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (
      toggle.getAttribute('aria-expanded') === 'true' &&
      !panel.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      setMobileNavigationOpen(false);
    }
  });

  const desktopQuery = window.matchMedia('(min-width: 768px)');
  desktopQuery.addEventListener?.('change', (event) => {
    if (event.matches) setMobileNavigationOpen(false);
  });
}

function setMobileNavigationOpen(isOpen, { restoreFocus = false } = {}) {
  const toggle = document.getElementById('btn-mobile-nav');
  const panel = document.getElementById('mobile-navigation');
  if (!toggle || !panel) return;

  panel.classList.toggle('hidden', !isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.setAttribute('aria-label', isOpen ? 'Tutup navigasi utama' : 'Buka navigasi utama');

  if (isOpen) {
    panel.querySelector('a[data-view]')?.focus({ preventScroll: true });
  } else if (restoreFocus) {
    toggle.focus({ preventScroll: true });
  }
}

function initPlanningWorkspace() {
  document.getElementById('compare-shortlist-clear-button')?.addEventListener('click', () => {
    state.workspace.draft.roads = [];
    savePlanningWorkspace('Daftar pilihan dikosongkan');
    renderPlanningWorkspace();
  });
  document.getElementById('proposal-name-input')?.addEventListener('input', (event) => {
    state.workspace.draft.title = event.target.value;
    savePlanningWorkspace();
  });
  document.getElementById('proposal-planning-period')?.addEventListener('input', (event) => {
    state.workspace.draft.planning_period = event.target.value;
    savePlanningWorkspace();
  });
  document.getElementById('proposal-rationale-input')?.addEventListener('input', (event) => {
    state.workspace.draft.rationale = event.target.value;
    savePlanningWorkspace();
  });
  document.getElementById('proposal-save-rationale')?.addEventListener('click', () => {
    state.workspace.draft.rationale = document.getElementById('proposal-rationale-input')?.value || '';
    savePlanningWorkspace('Catatan draf tersimpan di perangkat ini');
  });
  document.getElementById('proposal-save-button')?.addEventListener('click', saveProposalDraft);
  document.getElementById('scenario-save-button')?.addEventListener('click', saveScenario);
  document.getElementById('scenario-load-button')?.addEventListener('click', loadSelectedScenario);
  document.getElementById('sensitivity-run-button')?.addEventListener('click', runRankSensitivity);
  document.getElementById('proposal-brief-button')?.addEventListener('click', renderProposalBrief);

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const key = action.dataset.roadKey;
    switch (action.dataset.action) {
      case 'add-to-shortlist':
        event.preventDefault();
        event.stopPropagation();
        addRoadToProposal(key);
        break;
      case 'remove-from-shortlist':
        state.workspace.draft.roads = state.workspace.draft.roads.filter((road) => road.road_key !== key);
        savePlanningWorkspace('Ruas dihapus dari draf');
        renderPlanningWorkspace();
        break;
      case 'toggle-map-view': {
        const view = action.dataset.viewTarget === 'peta' ? 'peta' : 'prioritas';
        writeRouteContext({ view });
        switchView(view);
        break;
      }
      case 'reopen-proposal':
        reopenSavedProposal(action.dataset.proposalId);
        break;
      case 'print-proposal-brief':
        printProposalBrief();
        break;
      default:
        break;
    }
  });

  document.addEventListener('input', (event) => {
    const field = event.target.dataset.roadField;
    const road = state.workspace.draft.roads.find((item) => item.road_key === event.target.dataset.roadKey);
    if (!road || !['rationale', 'decision_note'].includes(field)) return;
    road[field] = event.target.value;
    savePlanningWorkspace();
  });
  document.addEventListener('change', (event) => {
    const field = event.target.dataset.roadField;
    const road = state.workspace.draft.roads.find((item) => item.road_key === event.target.dataset.roadKey);
    if (!road) return;
    if (field === 'recommendation') road.recommendation = event.target.value === 'defer' ? 'defer' : 'propose';
    else if (field === 'recorded_decision') {
      road.recorded_decision = ['approved', 'deferred', 'not_selected'].includes(event.target.value) ? event.target.value : 'unrecorded';
      if (road.recorded_decision === 'unrecorded') road.decision_date = '';
    } else if (field === 'decision_date') {
      road.decision_date = /^\d{4}-\d{2}-\d{2}$/.test(event.target.value) ? event.target.value : '';
    } else return;
    savePlanningWorkspace('Catatan keputusan diperbarui');
    renderPlanningWorkspace();
  });
  renderPlanningWorkspace();
}

function savePlanningWorkspace(notice = '') {
  const currentScenarioName = state.simulation.scenarioName || (state.workspace.draft.mode === state.mode ? state.workspace.draft.scenario_name : '');
  state.workspace.draft.mode = state.mode;
  if (state.simulation.simConfig) state.workspace.draft.config = state.simulation.simConfig;
  state.workspace.draft.scenario_name = currentScenarioName;
  let saved = false;
  try { saved = writePlanningWorkspace(window.localStorage, state.workspace); } catch { /* Local storage may be blocked by browser policy. */ }
  const status = document.getElementById('proposal-draft-status');
  if (status) status.textContent = saved ? (notice || 'Tersimpan di perangkat ini') : 'Penyimpanan lokal tidak tersedia';
  if (saved) state.workspace = readPlanningWorkspace(window.localStorage);
  return saved;
}

function renderPlanningWorkspace() {
  const draft = state.workspace.draft;
  const proposalName = document.getElementById('proposal-name-input');
  const planningPeriod = document.getElementById('proposal-planning-period');
  const proposalRationale = document.getElementById('proposal-rationale-input');
  if (proposalName && document.activeElement !== proposalName) proposalName.value = draft.title;
  if (planningPeriod && document.activeElement !== planningPeriod) planningPeriod.value = draft.planning_period || '';
  if (proposalRationale && document.activeElement !== proposalRationale) proposalRationale.value = draft.rationale;

  const compareList = document.getElementById('compare-shortlist-list');
  const compareCount = document.getElementById('compare-shortlist-count');
  const compareEmpty = document.getElementById('compare-shortlist-empty');
  const proposalList = document.getElementById('proposal-items-list');
  const proposalCount = document.getElementById('proposal-items-count');
  const proposalEmpty = document.getElementById('proposal-items-empty');
  const roads = draft.roads || [];
  if (compareCount) compareCount.textContent = String(roads.length);
  if (proposalCount) proposalCount.textContent = String(roads.length);
  compareEmpty?.classList.toggle('hidden', roads.length > 0);
  proposalEmpty?.classList.toggle('hidden', roads.length > 0);
  const rendered = roads.map((road) => {
    const evidence = road.evidence || {};
    const rankMode = evidence.rank_mode === 'BENCHMARK_2024' ? 'audit 2024' : evidence.rank_mode === 'OPERATIONAL_2025' ? 'operasional 2025' : 'konteks belum tercatat';
    const rankText = Number.isInteger(evidence.rank) ? `Peringkat #${evidence.rank} (${rankMode})` : 'Peringkat belum tersedia';
    const mantapText = Number.isFinite(evidence.mantap_pct) ? `${formatId(evidence.mantap_pct, 1)}% mantap` : 'Kondisi belum tercatat';
    const driverText = evidence.key_factors?.length
      ? `<div class="mt-2 text-[11px] text-slate-600"><span class="font-semibold">Kontribusi skor terbesar:</span> ${evidence.key_factors.map((factor) => escapeHtml(factor.label)).join(', ')}</div>`
      : '';
    return `<li class="rounded-lg border border-slate-200 bg-white p-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0"><button type="button" class="text-left font-semibold text-sky-900 hover:underline" onclick="openRoadDetail('${escapeHtml(road.road_key)}')">${escapeHtml(evidence.display_name || road.road_key)}</button>
          <div class="mt-0.5 text-[11px] text-slate-500">${escapeHtml(evidence.district_name || 'Kecamatan belum tersedia')} · ${rankText} · kondisi ${escapeHtml(String(evidence.condition_year || 2025))}: ${mantapText}</div>
          ${evidence.condition ? `<div class="mt-1 text-[11px] text-slate-500">Baik ${formatId(evidence.condition.baik_pct ?? 0, 1)}% · Sedang ${formatId(evidence.condition.sedang_pct ?? 0, 1)}% · Rusak ringan ${formatId(evidence.condition.rusak_ringan_pct ?? 0, 1)}% · Rusak berat ${formatId(evidence.condition.rusak_berat_pct ?? 0, 1)}%</div>` : ''}
          ${driverText}
        </div>
        <button type="button" data-action="remove-from-shortlist" data-road-key="${escapeHtml(road.road_key)}" class="shrink-0 rounded px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50" aria-label="Hapus ${escapeHtml(evidence.display_name || road.road_key)} dari draf">Hapus</button>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <label class="text-[11px] font-semibold text-slate-600">Catatan: <select data-road-field="recommendation" data-road-key="${escapeHtml(road.road_key)}" class="ml-1 rounded border border-slate-300 bg-white px-2 py-1 font-normal"><option value="propose" ${road.recommendation !== 'defer' ? 'selected' : ''}>Diusulkan untuk ditinjau</option><option value="defer" ${road.recommendation === 'defer' ? 'selected' : ''}>Ditunda untuk ditinjau</option></select></label>
        <label class="text-[11px] font-semibold text-slate-600">Hasil aktual (opsional): <select data-road-field="recorded_decision" data-road-key="${escapeHtml(road.road_key)}" class="ml-1 rounded border border-slate-300 bg-white px-2 py-1 font-normal"><option value="unrecorded" ${road.recorded_decision === 'unrecorded' ? 'selected' : ''}>Belum dicatat</option><option value="approved" ${road.recorded_decision === 'approved' ? 'selected' : ''}>Disetujui</option><option value="deferred" ${road.recorded_decision === 'deferred' ? 'selected' : ''}>Ditunda</option><option value="not_selected" ${road.recorded_decision === 'not_selected' ? 'selected' : ''}>Tidak dipilih</option></select></label>
      </div>
      ${road.recorded_decision !== 'unrecorded' ? `<label class="mt-2 block text-[11px] font-semibold text-slate-600">Tanggal keputusan (isi dari dokumen rujukan)<input data-road-field="decision_date" data-road-key="${escapeHtml(road.road_key)}" type="date" value="${escapeHtml(road.decision_date || '')}" class="ml-2 rounded border border-slate-300 px-2 py-1 font-normal"></label>` : ''}
      <label class="mt-2 block text-[11px] font-semibold text-slate-600">Alasan / pertanyaan yang perlu ditindaklanjuti<textarea data-road-field="rationale" data-road-key="${escapeHtml(road.road_key)}" rows="2" maxlength="1000" class="mt-1 w-full rounded border border-slate-300 px-2.5 py-2 font-normal" placeholder="Apa dasar usulan atau hal yang perlu diperiksa?">${escapeHtml(road.rationale)}</textarea></label>
      <label class="mt-2 block text-[11px] font-semibold text-slate-600">Catatan hasil keputusan, jika sudah ada<textarea data-road-field="decision_note" data-road-key="${escapeHtml(road.road_key)}" rows="1" maxlength="1000" class="mt-1 w-full rounded border border-slate-300 px-2.5 py-2 font-normal" placeholder="Jangan isi sebelum ada keputusan yang dapat dirujuk">${escapeHtml(road.decision_note)}</textarea></label>
    </li>`;
  }).join('');
  if (compareList) compareList.innerHTML = rendered;
  if (proposalList) proposalList.innerHTML = rendered;

  const scenarioSelect = document.getElementById('scenario-load-select');
  if (scenarioSelect) {
    const current = scenarioSelect.value;
    scenarioSelect.innerHTML = '<option value="">Pilih skenario</option>' + state.workspace.scenarios.map((scenario) => `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name)} · ${scenario.mode === 'BENCHMARK_2024' ? 'Audit 2024' : 'Operasional 2025'}</option>`).join('');
    if (state.workspace.scenarios.some((scenario) => scenario.id === current)) scenarioSelect.value = current;
  }
  const savedScenarios = document.getElementById('scenario-saved-list');
  if (savedScenarios) savedScenarios.innerHTML = state.workspace.scenarios.length
    ? state.workspace.scenarios.map((scenario) => `<li class="rounded border border-slate-200 bg-white px-2.5 py-2">${escapeHtml(scenario.name)} <span class="text-slate-400">· ${scenario.mode === 'BENCHMARK_2024' ? 'Audit 2024' : 'Operasional 2025'}</span></li>`).join('')
    : '<li class="text-slate-400">Belum ada skenario tersimpan.</li>';
  const savedProposals = document.getElementById('proposal-saved-list');
  if (savedProposals) savedProposals.innerHTML = state.workspace.proposals.length
    ? [...state.workspace.proposals].reverse().map((proposal) => `<li class="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-2"><span class="min-w-0 truncate">${escapeHtml(proposal.title)} <span class="text-slate-400">· draf · ${escapeHtml(proposal.created_at.slice(0, 10))}</span></span><button type="button" data-action="reopen-proposal" data-proposal-id="${escapeHtml(proposal.id)}" class="shrink-0 font-semibold text-sky-700 hover:underline">Buka</button></li>`).join('')
    : '<li class="text-slate-400">Belum ada draf usulan tersimpan.</li>';
}

function formatId(value, digits = 2) {
  return Number(value).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function cloneConfig(config) {
  return config ? JSON.parse(JSON.stringify(config)) : null;
}

function hydrateConfig(config) {
  if (!config) return getInitialSimConfig();
  const base = getInitialSimConfig();
  const categories = new Map(config.categories.map((item) => [item.category_code, item.raw_weight]));
  const variables = new Map(config.variables.map((item) => [item.variable_code, item.local_weight]));
  base.categories.forEach((item) => { if (categories.has(item.category_code)) item.raw_weight = categories.get(item.category_code); });
  base.variables.forEach((item) => { if (variables.has(item.variable_code)) item.local_weight = variables.get(item.variable_code); });
  return base;
}

function isBaselineSimulationConfig(config) {
  if (!config) return true;
  const baseline = getInitialSimConfig();
  return baseline.categories.every((item) => Math.abs(item.raw_weight - (config.categories.find((value) => value.category_code === item.category_code)?.raw_weight ?? -1)) < 1e-9)
    && baseline.variables.every((item) => Math.abs(item.local_weight - (config.variables.find((value) => value.variable_code === item.variable_code)?.local_weight ?? -1)) < 1e-9);
}

async function addRoadToProposal(roadKey) {
  if (!/^HSS-KAB-\d{3}$/.test(roadKey || '')) return;
  const draft = state.workspace.draft;
  const existing = draft.roads.find((road) => road.road_key === roadKey);
  if (existing) {
    document.getElementById('proposal-draft-status')?.replaceChildren(document.createTextNode('Ruas ini sudah ada dalam draf.'));
    return;
  }
  let evidence = state.roads.find((road) => road.road_key === roadKey) || null;
  let detail = state.selectedRoadDetail?.identity?.road_key === roadKey ? state.selectedRoadDetail : null;
  try {
    if (!detail) {
      const response = await fetch(`/api/roads/${encodeURIComponent(roadKey)}?mode=${encodeURIComponent(state.mode)}&model=${encodeURIComponent(state.modelCode)}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.error || 'Data ruas tidak tersedia.');
      detail = json.data;
    }
  } catch (error) {
    if (!evidence) {
      document.getElementById('proposal-draft-status')?.replaceChildren(document.createTextNode('Ruas belum dapat dimuat; coba lagi setelah data tersedia.'));
      return;
    }
  }
  const identity = detail?.identity;
  const condition = detail?.condition2025;
  const rank = detail?.priorityResult?.priority_rank ?? evidence?.priority_rank ?? null;
  draft.roads.push({
    road_key: roadKey,
    recommendation: 'propose',
    rationale: '',
    recorded_decision: 'unrecorded',
    decision_note: '',
    decision_date: '',
    evidence: {
      display_name: identity?.display_name || evidence?.display_name || roadKey,
      district_name: identity?.district_name || evidence?.district_name || '',
      rank,
      mantap_pct: condition?.mantap_pct ?? evidence?.mantap_pct ?? null,
      final_score: detail?.priorityResult?.final_score ?? evidence?.final_score ?? null,
      length_km: identity?.length_km_official ?? evidence?.length_km_official ?? null,
      condition_year: 2025,
      condition_source: condition?.source_filename || 'Sumber kondisi tahun 2025; periksa katalog sumber.',
      rank_mode: state.mode,
      rank_model: state.modelCode,
      condition: condition ? { baik_pct: condition.baik_pct, sedang_pct: condition.sedang_pct, rusak_ringan_pct: condition.rusak_ringan_pct, rusak_berat_pct: condition.rusak_berat_pct } : null,
      key_factors: detail?.factors?.filter((factor) => Number.isFinite(factor.contribution)).sort((a, b) => b.contribution - a.contribution).slice(0, 3).map((factor) => ({ label: factor.variable_label, contribution: factor.contribution })) || [],
    },
  });
  savePlanningWorkspace('Ruas ditambahkan ke draf');
  renderPlanningWorkspace();
}

function saveScenario() {
  if (!state.simulation.simConfig) {
    document.getElementById('scenario-name-input')?.focus();
    return;
  }
  const name = document.getElementById('scenario-name-input')?.value.trim().slice(0, 100);
  if (!name) {
    document.getElementById('scenario-name-input')?.setCustomValidity('Beri nama skenario agar dapat dibuka kembali.');
    document.getElementById('scenario-name-input')?.reportValidity();
    document.getElementById('scenario-name-input')?.addEventListener('input', (event) => event.target.setCustomValidity(''), { once: true });
    return;
  }
  const scenario = { id: crypto.randomUUID(), name, mode: state.mode, created_at: new Date().toISOString(), config: cloneConfig(state.simulation.simConfig) };
  state.workspace.scenarios.push(scenario);
  state.simulation.scenarioId = scenario.id;
  state.simulation.scenarioName = name;
  state.workspace.draft.scenario_name = name;
  savePlanningWorkspace('Skenario tersimpan di perangkat ini');
  updateSimulationContextStatus('Skenario tersimpan');
  writeRouteContext({ view: 'simulasi' });
  renderPlanningWorkspace();
}

async function loadSelectedScenario() {
  const id = document.getElementById('scenario-load-select')?.value;
  const scenario = state.workspace.scenarios.find((item) => item.id === id);
  if (!scenario) return;
  state.mode = scenario.mode;
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) modeSelect.value = state.mode;
  state.simulation.initialized = false;
  state.simulation.contextMode = null;
  state.simulation.simConfig = hydrateConfig(scenario.config);
  state.simulation.scenarioId = scenario.id;
  state.simulation.scenarioName = scenario.name;
  state.workspace.draft.mode = state.mode;
  state.workspace.draft.scenario_name = scenario.name;
  state.workspace.draft.config = cloneConfig(state.simulation.simConfig);
  updateModeVisuals();
  writeRouteContext({ view: 'simulasi' });
  await loadSimulation();
  renderPlanningWorkspace();
}

async function runRankSensitivity() {
  if (!state.simulation.initialized || state.simulation.contextMode !== state.mode || !state.simulation.featureVectors) await loadSimulation();
  const output = document.getElementById('sensitivity-results');
  if (!state.simulation.initialized || state.simulation.contextMode !== state.mode || !state.simulation.featureVectors || !output) {
    if (output) output.textContent = 'Analisis belum dapat dijalankan karena data peringkat untuk konteks ini belum tersedia.';
    return;
  }
  const configs = [
    ['Model acuan', getInitialSimConfig()],
    [state.simulation.scenarioName || 'Skenario saat ini', cloneConfig(state.simulation.simConfig)],
    ['Tekankan kerusakan berat', buildSensitivityPreset('KERUSAKAN')],
    ['Tekankan koneksi jalan provinsi', buildSensitivityPreset('AKSES')],
  ];
  const results = configs.map(([name, config]) => ({ name, roads: simRankRoads(state.simulation.featureVectors, config).map((road) => ({ road_key: road.road_key, priority_rank: road.priority_rank })) }));
  const sensitivity = summarizeRankSensitivity(results.map((item) => item.roads), 35).slice(0, 8);
  output.innerHTML = `<p class="font-semibold text-slate-800">Sensitivitas terhadap Asumsi · kelompok peringkat 1–35 pada ${results.length} skenario yang ditampilkan</p>
    <p class="mt-1 text-[11px] text-slate-500">Dihitung ulang secara deterministik untuk konteks ${state.mode === 'BENCHMARK_2024' ? 'audit 2024' : 'operasional 2025'}. Angka menunjukkan kemunculan pada skenario, bukan probabilitas atau kepastian kebutuhan.</p>
    <p class="mt-2 text-[11px] text-slate-600">${results.map((item) => escapeHtml(item.name)).join(' · ')}</p>
    <ul class="mt-2 space-y-1.5">${sensitivity.map((item) => { const road = state.simulation.featureVectors.find((feature) => feature.road_key === item.road_key); return `<li class="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-2"><span><strong>${escapeHtml(road?.display_name || item.road_key)}</strong><span class="block text-[10px] text-slate-500">#${item.min_rank}–#${item.max_rank} · kandidat ${item.candidate_count}/${item.scenario_count} skenario</span></span><button type="button" data-action="add-to-shortlist" data-road-key="${escapeHtml(item.road_key)}" class="rounded border border-sky-200 px-2 py-1 text-[10px] font-semibold text-sky-800">Tambahkan</button></li>`; }).join('')}</ul>`;
}

function buildSensitivityPreset(kind) {
  const config = getInitialSimConfig();
  if (kind === 'KERUSAKAN') {
    config.categories = simRebalanceCategorySiblings(config.categories, 'TEKNIS_JALAN', 0.55);
    config.variables = simRebalanceVariableSiblings(config.variables, 'TEKNIS_JALAN', 'norm_rusak_berat', 0.35);
  } else {
    config.categories = simRebalanceCategorySiblings(config.categories, 'AKSESIBILITAS', 0.45);
    config.variables = simRebalanceVariableSiblings(config.variables, 'AKSESIBILITAS', 'norm_koneksi_jalan_provinsi', 0.40);
  }
  return config;
}

function saveProposalDraft() {
  const draft = state.workspace.draft;
  draft.title = document.getElementById('proposal-name-input')?.value.trim().slice(0, 100) || 'Usulan penanganan jalan';
  draft.rationale = document.getElementById('proposal-rationale-input')?.value || '';
  draft.planning_period = document.getElementById('proposal-planning-period')?.value || '';
  if (!draft.roads.length) {
    document.getElementById('proposal-draft-status')?.replaceChildren(document.createTextNode('Tambahkan ruas sebelum menyimpan draf usulan.'));
    return;
  }
  const now = new Date().toISOString();
  const existingIndex = state.workspace.proposals.findIndex((proposal) => proposal.id === draft.id);
  const existing = existingIndex >= 0 ? state.workspace.proposals[existingIndex] : null;
  const snapshot = { id: draft.id || crypto.randomUUID(), title: draft.title, rationale: draft.rationale, planning_period: draft.planning_period, status: 'DRAFT', mode: state.mode, model: state.modelCode, scenario_name: state.simulation.scenarioName || (draft.mode === state.mode ? draft.scenario_name : ''), created_at: existing?.created_at || now, updated_at: now, config: cloneConfig(state.simulation.simConfig || draft.config), roads: cloneConfig(draft.roads) };
  if (existingIndex >= 0) state.workspace.proposals[existingIndex] = snapshot;
  else state.workspace.proposals.push(snapshot);
  draft.id = snapshot.id;
  savePlanningWorkspace('Draf tersimpan di perangkat ini');
  renderPlanningWorkspace();
}

function reopenSavedProposal(id) {
  const saved = state.workspace.proposals.find((proposal) => proposal.id === id);
  if (!saved) return;
  state.workspace.draft = { id: saved.id, title: saved.title, rationale: saved.rationale, planning_period: saved.planning_period || '', mode: saved.mode, roads: cloneConfig(saved.roads), scenario_name: saved.scenario_name, config: cloneConfig(saved.config) };
  state.mode = saved.mode;
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) modeSelect.value = saved.mode;
  state.simulation.initialized = false;
  state.simulation.contextMode = null;
  state.simulation.simConfig = saved.config ? hydrateConfig(saved.config) : null;
  state.simulation.scenarioName = saved.scenario_name;
  updateModeVisuals();
  writeRouteContext({ view: 'simulasi' });
  switchView('simulasi');
  savePlanningWorkspace('Draf dibuka kembali');
  renderPlanningWorkspace();
}

function renderProposalBrief() {
  const preview = document.getElementById('proposal-brief-preview');
  if (!preview) return;
  const draft = state.workspace.draft;
  if (!draft.roads.length) {
    preview.classList.remove('hidden');
    preview.textContent = 'Tambahkan setidaknya satu ruas dan lengkapi alasan sebelum menyiapkan ringkasan.';
    return;
  }
  const context = { title: document.getElementById('proposal-name-input')?.value.trim() || draft.title, planning_period: document.getElementById('proposal-planning-period')?.value.trim() || draft.planning_period || '', rationale: document.getElementById('proposal-rationale-input')?.value || draft.rationale, mode: state.mode, model: state.modelCode, scenario: state.simulation.scenarioName || (draft.mode === state.mode ? draft.scenario_name : '') || 'Model acuan', roads: cloneConfig(draft.roads), date: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' }) };
  savePlanningWorkspace();
  preview.dataset.brief = JSON.stringify(context);
  preview.classList.remove('hidden');
  preview.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2"><div><h3 class="font-bold text-slate-900">${escapeHtml(context.title)}</h3><p class="text-[10px] text-slate-500">Draf kajian · disiapkan ${context.date} · periode rencana ${escapeHtml(context.planning_period || 'belum ditetapkan')} · ${context.mode === 'BENCHMARK_2024' ? 'Audit 2024' : 'Operasional 2025'} · ${escapeHtml(context.scenario)}</p></div><button type="button" data-action="print-proposal-brief" class="rounded bg-sky-700 px-3 py-1.5 text-[11px] font-semibold text-white">Cetak / simpan PDF</button></div>
    <p class="mt-2"><strong>Catatan usulan:</strong> ${escapeHtml(context.rationale || 'Belum ada catatan umum.')}</p>
    <ul class="mt-2 space-y-2">${context.roads.map((road) => {
      const evidence = road.evidence || {};
      const condition = evidence.condition;
      const rankContext = evidence.rank_mode === 'BENCHMARK_2024' ? 'audit 2024' : evidence.rank_mode === 'OPERATIONAL_2025' ? 'operasional 2025' : 'konteks belum tercatat';
      const conditionText = condition
        ? `Mantap ${Number.isFinite(evidence.mantap_pct) ? `${formatId(evidence.mantap_pct, 1)}%` : 'tidak tercatat'} · baik ${formatId(condition.baik_pct ?? 0, 1)}% · sedang ${formatId(condition.sedang_pct ?? 0, 1)}% · rusak ringan ${formatId(condition.rusak_ringan_pct ?? 0, 1)}% · rusak berat ${formatId(condition.rusak_berat_pct ?? 0, 1)}%`
        : 'Rincian kondisi fisik tidak tersimpan';
      return `<li class="break-inside-avoid rounded border border-slate-200 bg-white p-2.5"><strong>${escapeHtml(evidence.display_name || road.road_key)}</strong> · ${escapeHtml(evidence.district_name || 'Kecamatan belum tercatat')} · ${escapeHtml(road.road_key)}<div class="mt-0.5 text-[11px] text-slate-600">${road.recommendation === 'defer' ? 'Ditunda untuk ditinjau' : 'Diusulkan untuk ditinjau'} · peringkat #${evidence.rank ?? '—'} (${rankContext}, model acuan) · panjang ${Number.isFinite(evidence.length_km) ? `${formatId(evidence.length_km, 3)} km` : 'tidak tercatat'}</div><div class="mt-1 text-[11px] text-slate-700">${conditionText} · sumber kondisi ${evidence.condition_year || 'tahun tidak tercatat'}: ${escapeHtml(evidence.condition_source || 'tidak tercatat')} (tanggal publikasi tidak tersedia)</div><div class="mt-1"><strong>Alasan:</strong> ${escapeHtml(road.rationale || 'Belum dicatat.')}</div>${evidence.key_factors?.length ? `<div class="mt-1 text-[10px] text-slate-500"><strong>Kontribusi skor utama:</strong> ${evidence.key_factors.map((factor) => escapeHtml(factor.label)).join(', ')}</div>` : ''}<div class="mt-1 text-[10px] text-slate-600"><strong>Hasil aktual yang dicatat:</strong> ${escapeHtml(decisionLabel(road.recorded_decision))}${road.decision_date ? ` · ${escapeHtml(road.decision_date)}` : ''}${road.decision_note ? ` · ${escapeHtml(road.decision_note)}` : ''}</div></li>`;
    }).join('')}</ul>
    <div class="mt-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-900"><strong>Batas penggunaan:</strong> Ini draf bahan kajian, bukan persetujuan kegiatan, alokasi anggaran, atau izin pengadaan. Kondisi fisik mengacu pada data 2025; hasil peringkat mengikuti konteks mode/model di atas dan beberapa input model operasional memiliki tahun sumber historis. Verifikasi lapangan, kemutakhiran bukti, kesiapan teknis, manfaat, dan kewenangan anggaran tetap diperlukan.</div>
    <p class="mt-2 text-[10px] text-slate-500">Identitas ruas mengikuti daftar resmi. Kondisi dan nama berkas sumber disimpan saat ruas ditambahkan ke draf; tanggal publikasi berkas tidak tersedia. Persetujuan kebijakan model tidak tercatat dalam aplikasi.</p>`;
}

function decisionLabel(value) {
  return ({ approved: 'disetujui', deferred: 'ditunda', not_selected: 'tidak dipilih' })[value] || 'belum dicatat';
}

function printProposalBrief() {
  const preview = document.getElementById('proposal-brief-preview');
  if (!preview?.dataset.brief) return;
  document.body.classList.add('printing-proposal-brief');
  const cleanup = () => document.body.classList.remove('printing-proposal-brief');
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

function updateModeVisuals() {
  const isBenchmark = state.mode === 'BENCHMARK_2024';
  const banner = document.getElementById('benchmark-warning-banner');
  const yearBadge = document.getElementById('data-year-badge');

  if (isBenchmark) {
    banner.classList.remove('hidden');
    yearBadge.textContent = '2024 (Audit)';
    yearBadge.className = 'font-bold text-amber-300';
  } else {
    banner.classList.add('hidden');
    yearBadge.textContent = '2025';
    yearBadge.className = 'font-semibold text-white';
  }
}

function reloadActiveData() {
  if (state.currentView === 'dashboard') {
    loadDashboard();
  } else if (state.currentView === 'prioritas') {
    loadPriorityTable();
  } else if (state.currentView === 'peta') {
    if (state.mapInitialized) {
      loadMapCountyRoads();
    }
  } else if (state.currentView === 'simulasi' || state.currentView === 'usulan') {
    loadSimulation();
  }
  if (state.selectedRoadDetail) {
    openRoadDetail(state.selectedRoadDetail.identity.road_key);
  }
  updateMapStatus();
}

// --- ROUTING ---
function handleRouting() {
  const hash = window.location.hash || '#dashboard';
  const [baseHash, query] = hash.split('?');
  const params = new URLSearchParams(query || '');

  if (['OPERATIONAL_2025', 'BENCHMARK_2024'].includes(params.get('mode'))) {
    state.mode = params.get('mode');
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) modeSelect.value = state.mode;
    state.simulation.initialized = false;
    updateModeVisuals();
  } else {
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) modeSelect.value = state.mode;
    updateModeVisuals();
  }
  const linkedScenario = state.workspace.scenarios.find((scenario) => scenario.id === params.get('scenario'));
  if (linkedScenario) {
    state.mode = linkedScenario.mode;
    state.simulation.scenarioId = linkedScenario.id;
    state.simulation.scenarioName = linkedScenario.name;
    state.simulation.simConfig = hydrateConfig(linkedScenario.config);
    state.simulation.initialized = false;
    state.simulation.contextMode = null;
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) modeSelect.value = state.mode;
    updateModeVisuals();
  } else if (state.workspace.draft.mode === state.mode && state.workspace.draft.config) {
    state.simulation.simConfig = hydrateConfig(state.workspace.draft.config);
    state.simulation.scenarioName = state.workspace.draft.scenario_name || '';
  }
  state.search = (params.get('search') || '').trim().toLowerCase();
  state.district = params.get('district') || 'ALL';
  state.tier = params.get('tier') || 'ALL';
  state.condition = params.get('condition') || 'ALL';
  state.mapFilters = { search: state.search, district: state.district, tier: state.tier, condition: state.condition };
  syncSharedRoadFilters('state', false);

  const viewMap = {
    '#dashboard': 'dashboard',
    '#prioritas': 'prioritas',
    '#peta': 'peta',
    '#jelajahi': 'prioritas',
    '#usulan': 'simulasi',
    '#data-metode': 'data-sumber',
    '#data-sumber': 'data-sumber',
    '#model': 'model',
    '#simulasi': 'simulasi',
    '#asb-costing': 'asb-costing',
    '#biaya': 'asb-costing',
    '#perencanaan-asb': 'asb-costing',
  };

  const targetView = viewMap[baseHash] || 'dashboard';
  const drawer = document.getElementById('road-detail-drawer');
  if (!params.get('road') && drawer && !drawer.classList.contains('hidden')) {
    drawer.classList.add('hidden');
    drawer.classList.remove('drawer-map-mode');
    state.selectedRoadDetail = null;
    clearDD1SegmentsLayer();
  }
  switchView(targetView);

  // Check for deep link to road detail: e.g. #prioritas?road=HSS-KAB-025 or #peta?road=HSS-KAB-025
  if (query) {
    const roadKey = params.get('road');
    if (roadKey) {
      openRoadDetail(roadKey);
      if (targetView === 'peta') {
        setTimeout(() => selectRoadOnMap(roadKey), 300);
      }
    }
  }
  writeRouteContext({ view: targetView, road: params.get('road') || '' });
}

function switchView(viewName) {
  const mobileNav = document.getElementById('mobile-navigation');
  const focusIsInMobileNav = Boolean(mobileNav && mobileNav.contains(document.activeElement));
  const mobileNavIsOpen = Boolean(mobileNav && !mobileNav.classList.contains('hidden'));
  if (viewName !== 'peta' && state.isInteractiveDetailMode) exitInteractiveSpatialProfile();
  state.currentView = viewName;
  document.querySelectorAll('[data-action="toggle-map-view"]').forEach((button) => {
    const selected = button.dataset.viewTarget === (viewName === 'peta' ? 'peta' : 'prioritas');
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('bg-sky-600', selected);
    button.classList.toggle('text-white', selected);
    button.classList.toggle('text-slate-600', !selected);
  });

  // Toggle active views
  document.querySelectorAll('main > section').forEach((sec) => sec.classList.add('hidden'));
  const activeSec = document.getElementById(`view-${viewName}`);
  if (activeSec) activeSec.classList.remove('hidden');
  if (viewName === 'data-sumber') document.getElementById('view-model')?.classList.remove('hidden');

  // Toggle visual and announced navigation state across desktop and mobile links.
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.remove('bg-sky-50', 'text-sky-700', 'font-semibold', 'text-slate-700', 'text-slate-200');
    link.removeAttribute('aria-current');
    link.classList.add(link.classList.contains('mobile-nav-link') ? 'text-slate-200' : 'text-slate-700');
  });
  const navView = viewName === 'peta' ? 'prioritas' : viewName;
  document.querySelectorAll(`.nav-link[data-view="${navView}"]`).forEach((link) => {
    link.setAttribute('aria-current', 'page');
    if (!link.classList.contains('mobile-nav-link')) {
      link.classList.add('bg-sky-50', 'text-sky-700', 'font-semibold');
      link.classList.remove('text-slate-700');
    }
  });

  if (mobileNavIsOpen) {
    setMobileNavigationOpen(false);
    if (focusIsInMobileNav) {
      const heading = activeSec?.querySelector('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }

  // Load view data
  const drawerEl = document.getElementById('road-detail-drawer');
  if (viewName === 'dashboard') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadDashboard();
  } else if (viewName === 'prioritas') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadPriorityTable();
  } else if (viewName === 'peta') {
    if (state.selectedRoadDetail) {
      drawerEl?.classList.add('drawer-map-mode');
    }
    if (!state.mapInitialized) {
      initMap();
    }
    [50, 150, 350, 700].forEach((delay) => {
      setTimeout(() => {
        if (state.map) {
          state.map.invalidateSize({ pan: false });
        }
      }, delay);
    });
  } else if (viewName === 'data-sumber') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadProvenance();
    loadModel();
  } else if (viewName === 'model') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadModel();
  } else if (viewName === 'simulasi') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadSimulation();
  } else if (viewName === 'usulan') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadSimulation();
  } else if (viewName === 'asb-costing') {
    drawerEl?.classList.remove('drawer-map-mode');
    if (window.AsbCostingModule && window.AsbCostingModule.init) {
      window.AsbCostingModule.init();
    }
  }
  if (drawerEl && !drawerEl.classList.contains('hidden')) syncDrawerAccessibility(drawerEl);

  if (viewName === 'simulasi' || viewName === 'usulan') renderPlanningWorkspace();
}

function syncSharedRoadFilters(source = 'state', updateUrl = true) {
  if (source === 'table') {
    state.search = document.getElementById('table-search')?.value.trim().toLowerCase() ?? state.search;
    state.district = document.getElementById('filter-district')?.value ?? state.district;
    state.tier = document.getElementById('filter-tier')?.value ?? state.tier;
    state.condition = document.getElementById('filter-condition')?.value ?? state.condition;
    state.mapFilters = { search: state.search, district: state.district, tier: state.tier, condition: state.condition };
  } else if (source === 'map') {
    state.mapFilters.search = document.getElementById('map-search-input')?.value.trim().toLowerCase() ?? state.mapFilters.search;
    state.mapFilters.district = document.getElementById('map-filter-district')?.value ?? state.mapFilters.district;
    state.mapFilters.tier = document.getElementById('map-filter-tier')?.value ?? state.mapFilters.tier;
    state.mapFilters.condition = document.getElementById('map-filter-condition')?.value ?? state.mapFilters.condition;
    state.search = state.mapFilters.search;
    state.district = state.mapFilters.district;
    state.tier = state.mapFilters.tier;
    state.condition = state.mapFilters.condition;
  }

  const fields = [
    ['table-search', 'map-search-input', 'search', ''],
    ['filter-district', 'map-filter-district', 'district', 'ALL'],
    ['filter-tier', 'map-filter-tier', 'tier', 'ALL'],
    ['filter-condition', 'map-filter-condition', 'condition', 'ALL'],
  ];
  for (const [tableId, mapId, key, fallback] of fields) {
    const value = state[key] || fallback;
    const table = document.getElementById(tableId);
    const map = document.getElementById(mapId);
    if (key === 'search') {
      if (table) table.value = value;
      if (map) map.value = value;
    } else {
      setSelectValue(table, value);
      setSelectValue(map, value);
    }
  }
  if (updateUrl) writeRouteContext();
}

function setSelectValue(select, value) {
  if (!select || !value) return;
  if (![...select.options].some((option) => option.value === value)) {
    select.add(new Option(value, value));
  }
  select.value = value;
}

function writeRouteContext({ road = state.selectedRoadDetail?.identity?.road_key ?? '', view = state.currentView } = {}) {
  const hashes = { dashboard: '#dashboard', prioritas: '#prioritas', peta: '#peta', 'data-sumber': '#data-metode', model: '#model', simulasi: '#usulan', usulan: '#usulan' };
  const params = new URLSearchParams();
  params.set('mode', state.mode);
  params.set('model', state.modelCode);
  if (state.search) params.set('search', state.search);
  if (state.district !== 'ALL') params.set('district', state.district);
  if (state.tier !== 'ALL') params.set('tier', state.tier);
  if (state.condition !== 'ALL') params.set('condition', state.condition);
  if (road) params.set('road', road);
  if (state.simulation.scenarioId) params.set('scenario', state.simulation.scenarioId);
  const hash = `${hashes[view] || '#dashboard'}?${params}`;
  history.replaceState(null, '', hash);
}

// --- VIEW 1: DASHBOARD ---
async function loadDashboard() {
  try {
    const res = await fetch(`/api/dashboard?mode=${state.mode}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.dashboardData = json.data;
    renderDashboard(json.data);
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderDashboard(data) {
  // 1. KPI Cards
  const kpiContainer = document.getElementById('kpi-cards-container');
  kpiContainer.innerHTML = `
    <div class="dashboard-kpi-card">
      <div class="dashboard-kpi-card__content">
        <div class="dashboard-kpi-card__label">Total Ruas Kabupaten</div>
        <div class="dashboard-kpi-card__value">${formatId(data.kpis.totalRoads, 0)} <span class="dashboard-kpi-card__unit">ruas</span></div>
        <div class="dashboard-kpi-card__detail">Berdasarkan SK Bupati</div>
      </div>
      <img class="dashboard-kpi-card__illustration" src="/assets/dashboard-kpis/ivory/road-network.webp" alt="" width="960" height="640" decoding="async">
    </div>
    <div class="dashboard-kpi-card">
      <div class="dashboard-kpi-card__content">
        <div class="dashboard-kpi-card__label">Total Panjang Jaringan</div>
        <div class="dashboard-kpi-card__value">${formatId(data.kpis.totalLengthKm, 3)} <span class="dashboard-kpi-card__unit">km</span></div>
        <div class="dashboard-kpi-card__detail">Ruas Kabupaten HSS</div>
      </div>
      <img class="dashboard-kpi-card__illustration" src="/assets/dashboard-kpis/ivory/bridge-distance.webp" alt="" width="960" height="640" decoding="async">
    </div>
    <div class="dashboard-kpi-card dashboard-kpi-card--condition">
      <div class="dashboard-kpi-card__content">
        <div class="dashboard-kpi-card__label">Kondisi Mantap</div>
        <div class="dashboard-kpi-card__value">${formatId(data.kpis.mantapPct)}%</div>
        <div class="dashboard-kpi-card__detail">${formatId(data.kpis.mantapKm, 3)} km (Baik + Sedang)</div>
      </div>
      <img class="dashboard-kpi-card__illustration" src="/assets/dashboard-kpis/ivory/maintained-road.webp" alt="" width="960" height="640" decoding="async">
    </div>
  `;

  // 2. Category Weights
  const catContainer = document.getElementById('category-weights-container');
  catContainer.innerHTML = [...data.categoryWeights]
    .sort((a, b) => b.normalized_pct - a.normalized_pct)
    .map(
      (c, index) => `
    <div>
      <div class="mb-1.5 flex justify-between gap-3 text-sm font-medium text-slate-700">
        <span>${escapeHtml(c.category_name)}</span>
        <span class="shrink-0 font-bold tabular-nums ${index === 0 ? 'text-sky-800' : 'text-slate-900'}">${formatId(c.normalized_pct, 2)}%</span>
      </div>
      <div class="h-2 rounded-full bg-slate-100" aria-hidden="true">
        <div class="h-full rounded-full ${index === 0 ? 'bg-sky-700' : 'bg-sky-400'}" style="width: ${c.normalized_pct}%"></div>
      </div>
    </div>
  `
    )
    .join('');

  // 3. Condition Breakdown
  const cond = data.conditionBreakdown;
  const conditions = [
    { label: 'Baik', color: 'bg-emerald-500', km: cond.baik_km, pct: cond.baik_pct },
    { label: 'Sedang', color: 'bg-sky-500', km: cond.sedang_km, pct: cond.sedang_pct },
    { label: 'Rusak Ringan', color: 'bg-amber-500', km: cond.rusak_ringan_km, pct: cond.rusak_ringan_pct },
    { label: 'Rusak Berat', color: 'bg-rose-500', km: cond.rusak_berat_km, pct: cond.rusak_berat_pct },
  ];
  document.getElementById('dashboard-condition-summary').innerHTML = `
    <div class="flex flex-wrap items-baseline gap-x-2">
      <strong class="text-3xl font-extrabold tracking-tight text-emerald-800 tabular-nums">${formatId(data.kpis.mantapPct)}%</strong>
      <span class="text-xs font-semibold text-emerald-800">jalan mantap</span>
    </div>
    <p class="mt-0.5 text-xs text-slate-600">${formatId(data.kpis.mantapKm, 3)} dari ${formatId(data.kpis.totalLengthKm, 3)} km</p>
  `;
  document.getElementById('condition-breakdown-container').innerHTML = `
    <div class="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      ${conditions.map(c => `<div class="${c.color}" style="width: ${c.pct}%"></div>`).join('')}
    </div>
    <ul class="grid grid-cols-2 gap-2">
      ${conditions.map(c => `
        <li class="min-w-0 rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-1.5">
          <div class="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span class="h-2 w-2 shrink-0 rounded-full ${c.color}" aria-hidden="true"></span>
            ${c.label}
          </div>
          <div class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs tabular-nums">
            <strong class="text-slate-900">${formatId(c.pct)}%</strong>
            <span class="text-slate-600">${formatId(c.km, 3)} km</span>
          </div>
        </li>
      `).join('')}
    </ul>
  `;

  // 4. Top 10 Table
  const top10Tbody = document.getElementById('top10-table-body');
  top10Tbody.innerHTML = data.top10
    .map(
      (r) => `
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="if (!event.target.closest('[data-action]')) openRoadDetail('${r.road_key}')">
      <td class="py-2.5 px-3 font-bold text-slate-900">#${r.priority_rank}</td>
      <td class="py-2.5 px-3 font-mono text-xs text-slate-500">${r.nomor_ruas}</td>
      <td class="py-2.5 px-3 font-semibold text-sky-900 hover:text-sky-600">${escapeHtml(r.display_name)}</td>
      <td class="py-2.5 px-3 text-xs text-slate-600">${escapeHtml(r.district_name)}</td>
      <td class="py-2.5 px-3 text-right text-xs font-mono">${r.length_km_official.toFixed(3)} km</td>
      <td class="py-2.5 px-3 text-center">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
          r.mantap_pct >= 60
            ? 'bg-emerald-100 text-emerald-800'
            : r.mantap_pct >= 40
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-rose-800'
        }">${r.mantap_pct.toFixed(1)}%</span>
      </td>
      <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${formatId(r.final_score, 4)}</td>
      <td class="py-2.5 px-3 text-center">${renderTierBadge(r.tier_category)}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition mr-1" onclick="event.stopPropagation(); viewRoadOnMap('${r.road_key}')">
          Peta
        </button>
        <button class="text-xs bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold px-2 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
          Detail
        </button>
        <button type="button" data-action="add-to-shortlist" data-road-key="${r.road_key}" class="mt-1 text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition">+ Usulan</button>
      </td>
    </tr>
  `
    )
    .join('');
}

// --- VIEW 2: PRIORITY TABLE ---
async function loadPriorityTable() {
  try {
    const res = await fetch(`/api/roads?mode=${state.mode}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.roads = json.data;
    populateDistrictFilter(state.roads);
    applyTableFilters();
  } catch (err) {
    console.error('Error loading priority table:', err);
  }
}

function populateDistrictFilter(roads) {
  const select = document.getElementById('filter-district');
  const existingVal = select.value;

  const districts = Array.from(new Set(roads.map((r) => r.district_name))).sort();
  select.innerHTML = '<option value="ALL">Semua Kecamatan (11)</option>';
  for (const d of districts) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  }

  if (existingVal && districts.includes(existingVal)) {
    select.value = existingVal;
  }
}

function applyTableFilters() {
  let list = [...state.roads];

  // 1. Text Search
  if (state.search) {
    const q = state.search;
    list = list.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.canonical_name.toLowerCase().includes(q) ||
        r.nomor_ruas.includes(q) ||
        r.road_key.toLowerCase().includes(q)
      );
  }

  // 2. District Filter
  if (state.district !== 'ALL') {
    list = list.filter((r) => r.district_name === state.district);
  }

  // 3. Tier Filter
  if (state.tier !== 'ALL') {
    list = list.filter((r) => r.tier_category === state.tier);
  }

  // 4. Condition Filter
  if (state.condition === 'MANTAP') {
    list = list.filter((r) => r.mantap_pct >= 60.0);
  } else if (state.condition === 'TRANSISI') {
    list = list.filter((r) => r.mantap_pct >= 40.0 && r.mantap_pct < 60.0);
  } else if (state.condition === 'KRITIS') {
    list = list.filter((r) => r.mantap_pct < 40.0);
  }

  // 5. Sorting
  if (state.sort === 'rank_asc') {
    list.sort((a, b) => a.priority_rank - b.priority_rank);
  } else if (state.sort === 'rank_desc') {
    list.sort((a, b) => b.priority_rank - a.priority_rank);
  } else if (state.sort === 'score_desc') {
    list.sort((a, b) => b.final_score - a.final_score);
  } else if (state.sort === 'mantap_asc') {
    list.sort((a, b) => a.mantap_pct - b.mantap_pct);
  } else if (state.sort === 'mantap_desc') {
    list.sort((a, b) => b.mantap_pct - a.mantap_pct);
  } else if (state.sort === 'length_desc') {
    list.sort((a, b) => b.length_km_official - a.length_km_official);
  }

  state.filteredRoads = list;
  document.getElementById('table-filtered-count').textContent = list.length;

  renderPriorityTable();
}

function renderPriorityTable() {
  const tbody = document.getElementById('priority-table-body');
  const startIndex = (state.page - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, state.filteredRoads.length);
  const pageItems = state.filteredRoads.slice(startIndex, endIndex);

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-8 text-center text-slate-400 text-xs">
          Tidak ada ruas jalan yang cocok dengan kriteria filter pencarian.
        </td>
      </tr>
    `;
    renderPagination(0);
    return;
  }

  tbody.innerHTML = pageItems
    .map(
      (r) => `
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="if (!event.target.closest('[data-action]')) openRoadDetail('${r.road_key}')">
      <td class="py-2.5 px-3 font-bold text-slate-900">#${r.priority_rank}</td>
      <td class="py-2.5 px-3 font-mono text-xs text-slate-500">${r.nomor_ruas}</td>
      <td class="py-2.5 px-3">
        <div class="font-semibold text-sky-950">${escapeHtml(r.display_name)}</div>
        <div class="text-[10px] text-slate-400 font-mono">${r.road_key}</div>
      </td>
      <td class="py-2.5 px-3 text-xs text-slate-600">${escapeHtml(r.district_name)}</td>
      <td class="py-2.5 px-3 text-right text-xs font-mono">${r.length_km_official.toFixed(3)} km</td>
      <td class="py-2.5 px-3 text-center">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
          r.mantap_pct >= 60
            ? 'bg-emerald-100 text-emerald-800'
            : r.mantap_pct >= 40
            ? 'bg-amber-100 text-amber-800'
            : 'bg-rose-100 text-rose-800'
        }">${r.mantap_pct.toFixed(1)}%</span>
      </td>
      <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${formatId(r.final_score, 4)}</td>
      <td class="py-2.5 px-3 text-center">${renderTierBadge(r.tier_category)}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition mr-1" onclick="event.stopPropagation(); viewRoadOnMap('${r.road_key}')">
          Peta
        </button>
        <button class="text-xs bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold px-2 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
          Detail
        </button>
        <button type="button" data-action="add-to-shortlist" data-road-key="${r.road_key}" class="mt-1 text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition">+ Usulan</button>
      </td>
    </tr>
  `
    )
    .join('');

  renderPagination(state.filteredRoads.length);
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / state.pageSize);
  const container = document.getElementById('pagination-controls');

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="px-2.5 py-1 border border-slate-300 rounded font-medium ${
      state.page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'
    }" onclick="changePage(${state.page - 1})" ${state.page === 1 ? 'disabled' : ''}>Prev</button>
    <span class="px-2 text-slate-600 font-medium">Hal ${state.page} dari ${totalPages}</span>
    <button class="px-2.5 py-1 border border-slate-300 rounded font-medium ${
      state.page === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100'
    }" onclick="changePage(${state.page + 1})" ${state.page === totalPages ? 'disabled' : ''}>Next</button>
  `;
  container.innerHTML = html;
}

window.changePage = function (newPage) {
  const totalPages = Math.ceil(state.filteredRoads.length / state.pageSize);
  if (newPage < 1 || newPage > totalPages) return;
  state.page = newPage;
  renderPriorityTable();
};

// --- VIEW 5: PETA PRIORITAS (WEB GIS SPATIAL ENGINE - FASE 4) ---
async function initMap() {
  if (state.mapInitialized) return;

  const mapContainer = document.getElementById('hss-map');
  if (!mapContainer) return;

  // Initialize Leaflet Map
  // Center roughly at Kandangan / Hulu Sungai Selatan (-2.6885, 115.245)
  state.map = L.map('hss-map', {
    center: [-2.6885, 115.245],
    zoom: 11,
    minZoom: 9,
    maxZoom: 18,
    attributionControl: true,
  });

  state.map.on('tooltipopen', (event) => {
    if (!event.tooltip.options.className?.includes('road-map-tooltip')) return;
    const previousTooltip = state.activeRoadTooltip;
    state.activeRoadTooltip = event.tooltip;
    if (previousTooltip && previousTooltip !== event.tooltip) state.map.closeTooltip(previousTooltip);
  });
  state.map.on('tooltipclose', (event) => {
    if (state.activeRoadTooltip === event.tooltip) state.activeRoadTooltip = null;
  });

  // Ensure local vendored leaflet image asset path is authoritative
  if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
    L.Icon.Default.imagePath = '/vendor/leaflet/images/';
  }

  // Create Deterministic Custom Panes with explicit z-index (Administrative hierarchy)
  const panes = [
    { name: 'basemapPane', zIndex: 200 },
    { name: 'rtrwPane', zIndex: 350 },
    { name: 'villagesPane', zIndex: 370 },
    { name: 'districtsPane', zIndex: 380 },
    { name: 'kabupatenPane', zIndex: 390 },
    { name: 'refRoadsPane', zIndex: 450 },
    { name: 'connectorsPane', zIndex: 460 },
    { name: 'countyRoadsPane', zIndex: 500 },
    { name: 'routeTracingPane', zIndex: 550 },
    { name: 'selectionHaloPane', zIndex: 600 },
    { name: 'dd1SegmentsPane', zIndex: 610 },
    { name: 'facilitiesPane', zIndex: 700 },
  ];

  panes.forEach((p) => {
    state.map.createPane(p.name);
    state.map.getPane(p.name).style.zIndex = p.zIndex;
  });

  // Force clean container sizing
  state.map.invalidateSize({ pan: false });

  // Attach ResizeObserver to container to react to window resizes and panel adjustments
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (state.map) {
        state.map.invalidateSize({ pan: false });
      }
    });
    ro.observe(mapContainer);
  } else {
    window.addEventListener('resize', () => {
      if (state.map) {
        state.map.invalidateSize({ pan: false });
      }
    });
  }

  // 1. OpenStreetMap TileLayer (Peta Jalan)
  state.mapLayers.osmBasemap = L.tileLayer(BASEMAP_CONFIG.osm.url, {
    pane: 'basemapPane',
    maxZoom: BASEMAP_CONFIG.osm.maxZoom,
    attribution: BASEMAP_CONFIG.osm.attribution,
  }).addTo(state.map);

  // 2. Satellite Imagery TileLayer (Citra Satelit - ESRI World Imagery / Configurable)
  state.mapLayers.satelliteBasemap = L.tileLayer(BASEMAP_CONFIG.satellite.url, {
    pane: 'basemapPane',
    maxZoom: BASEMAP_CONFIG.satellite.maxZoom,
    attribution: BASEMAP_CONFIG.satellite.attribution,
  });

  // Offline detection and graceful fallback banner for tile layers
  const handleTileError = () => {
    document.getElementById('map-offline-banner')?.classList.remove('hidden');
    document.getElementById('hss-map').style.backgroundColor = '#f1f5f9';
  };
  state.mapLayers.osmBasemap.on('tileerror', handleTileError);
  state.mapLayers.satelliteBasemap.on('tileerror', handleTileError);

  const handleTileLoad = () => {
    const isNeutral = document.getElementById('layer-basemap-neutral')?.checked;
    if (!isNeutral) {
      document.getElementById('map-offline-banner')?.classList.add('hidden');
    }
  };
  state.mapLayers.osmBasemap.on('load', handleTileLoad);
  state.mapLayers.satelliteBasemap.on('load', handleTileLoad);

  // Map zoom listener for facility decluttering
  state.map.on('zoomend', handleMapZoomChange);

  initMapControls();
  state.mapInitialized = true;

  await loadMapData();

  // Final sizing pass and viewport alignment after all GeoJSON layers are mounted
  setTimeout(() => {
    if (state.map) {
      state.map.invalidateSize({ pan: false });
      if (!state.isInteractiveDetailMode) fitHssBounds();
    }
  }, 100);
}

function initMapControls() {
  // Focus HSS button
  document.getElementById('map-btn-fit-hss')?.addEventListener('click', fitHssBounds);

  // Clear Road Selection button
  document.getElementById('map-btn-clear-selection')?.addEventListener('click', clearRoadSelection);

  // Reset Map Filters button & Empty State Reset button
  const resetFiltersAction = () => {
    const searchEl = document.getElementById('map-search-input');
    const distEl = document.getElementById('map-filter-district');
    const tierEl = document.getElementById('map-filter-tier');
    const condEl = document.getElementById('map-filter-condition');

    if (searchEl) searchEl.value = '';
    if (distEl) distEl.value = 'ALL';
    if (tierEl) tierEl.value = 'ALL';
    if (condEl) condEl.value = 'ALL';

    state.mapFilters = { search: '', district: 'ALL', tier: 'ALL', condition: 'ALL' };
    syncSharedRoadFilters('map');
    state.page = 1;
    applyTableFilters();
    applyMapFilters();
  };

  document.getElementById('map-btn-reset-filters')?.addEventListener('click', resetFiltersAction);
  document.getElementById('map-btn-empty-reset')?.addEventListener('click', resetFiltersAction);

  // Live search input & autocomplete with keyboard navigation
  const searchInput = document.getElementById('map-search-input');
  const autocompleteBox = document.getElementById('map-search-autocomplete');

  searchInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    state.mapFilters.search = q;
    syncSharedRoadFilters('map');
    state.page = 1;
    applyTableFilters();
    handleMapSearchAutocomplete(q);
    applyMapFilters();
  });

  searchInput?.addEventListener('keydown', (e) => {
    const box = document.getElementById('map-search-autocomplete');
    if (box?.classList.contains('hidden') || currentAutocompleteMatches.length === 0) {
      if (e.key === 'Enter') {
        applyMapFilters();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteSelectedIndex = (autocompleteSelectedIndex + 1) % currentAutocompleteMatches.length;
      renderAutocompleteItems(searchInput.value.trim());
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteSelectedIndex = (autocompleteSelectedIndex - 1 + currentAutocompleteMatches.length) % currentAutocompleteMatches.length;
      renderAutocompleteItems(searchInput.value.trim());
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (autocompleteSelectedIndex >= 0 && autocompleteSelectedIndex < currentAutocompleteMatches.length) {
        selectFromMapAutocomplete(currentAutocompleteMatches[autocompleteSelectedIndex].properties.road_key);
      } else if (currentAutocompleteMatches.length === 1) {
        selectFromMapAutocomplete(currentAutocompleteMatches[0].properties.road_key);
      } else {
        box.classList.add('hidden');
        applyMapFilters();
      }
    } else if (e.key === 'Escape') {
      box.classList.add('hidden');
      autocompleteSelectedIndex = -1;
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput?.contains(e.target) && !autocompleteBox?.contains(e.target)) {
      autocompleteBox?.classList.add('hidden');
    }
  });

  // District, Tier, Condition Filter dropdowns
  document.getElementById('map-filter-district')?.addEventListener('change', (e) => {
    state.mapFilters.district = e.target.value;
    syncSharedRoadFilters('map');
    state.page = 1;
    applyTableFilters();
    applyMapFilters();
  });

  document.getElementById('map-filter-tier')?.addEventListener('change', (e) => {
    state.mapFilters.tier = e.target.value;
    syncSharedRoadFilters('map');
    state.page = 1;
    applyTableFilters();
    applyMapFilters();
  });

  document.getElementById('map-filter-condition')?.addEventListener('change', (e) => {
    state.mapFilters.condition = e.target.value;
    syncSharedRoadFilters('map');
    state.page = 1;
    applyTableFilters();
    applyMapFilters();
  });

  // Layer panel toggle
  const layersBtn = document.getElementById('btn-toggle-layers');
  const gisSidePanel = document.getElementById('gis-side-panel');
  const closeLayersBtn = document.getElementById('btn-close-layers');

  const toggleGisPanel = () => {
    gisSidePanel?.classList.toggle('hidden');
    layersBtn?.setAttribute('aria-expanded', String(!gisSidePanel?.classList.contains('hidden')));
    setTimeout(() => {
      state.map?.invalidateSize({ pan: false });
    }, 50);
  };

  layersBtn?.addEventListener('click', toggleGisPanel);
  closeLayersBtn?.addEventListener('click', () => {
    gisSidePanel?.classList.add('hidden');
    layersBtn?.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      state.map?.invalidateSize({ pan: false });
    }, 50);
  });

  // Legend collapse toggle
  const legendBtn = document.getElementById('btn-toggle-legend-body');
  const legendBody = document.getElementById('map-legend-body');
  legendBtn?.addEventListener('click', () => {
    legendBody?.classList.toggle('hidden');
    legendBtn.textContent = legendBody?.classList.contains('hidden') ? '▲' : '▼';
  });

  // Quick Map Presets
  document.getElementById('preset-prioritas')?.addEventListener('click', () => applyMapPreset('prioritas'));
  document.getElementById('preset-pelayanan')?.addEventListener('click', () => applyMapPreset('pelayanan'));
  document.getElementById('preset-tataruang')?.addEventListener('click', () => applyMapPreset('tataruang'));

  // Thematic Road View Mode: Prioritas <-> Kondisi DD1 (Phase 5.1C)
  document.getElementById('btn-theme-prioritas')?.addEventListener('click', () => {
    setRoadThematicMode('PRIORITAS');
  });
  document.getElementById('btn-theme-dd1')?.addEventListener('click', () => {
    setRoadThematicMode('KONDISI_DD1');
  });

  // Simulation Map Mode Toggles
  document.getElementById('map-btn-source-baseline')?.addEventListener('click', () => {
    setMapColorSource('BASELINE');
  });
  document.getElementById('map-btn-source-simulation')?.addEventListener('click', () => {
    setMapColorSource('SIMULATION');
  });
  document.getElementById('map-btn-restore-baseline')?.addEventListener('click', () => {
    setMapColorSource('BASELINE');
  });

  // Basemap radio toggles (Latar Netral, Peta Jalan, Citra Satelit)
  document.querySelectorAll('input[name="basemap-layer"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      setBasemapMode(e.target.value);
    });
  });

  // Reference road layer toggles
  document.getElementById('layer-roads-provincial')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.provincialRoads, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-roads-national')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.nationalRoads, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-connectors')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.connectors, e.target.checked);
    updateDynamicLegend();
  });

  // Facilities layer toggles
  document.getElementById('layer-fac-hospital')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.rsud, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-fac-puskesmas')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.puskesmas, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-fac-market')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.markets, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-fac-school')?.addEventListener('change', (e) => {
    updateSchoolsVisibility(e.target.checked);
    updateDynamicLegend();
  });

  // Administrative layer toggles
  document.getElementById('layer-admin-kabupaten')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.kabupaten, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-admin-districts')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.districts, e.target.checked);
    updateDynamicLegend();
  });
  document.getElementById('layer-admin-villages')?.addEventListener('change', (e) => {
    toggleLayerVisibility(state.mapLayers.villages, e.target.checked);
    updateDynamicLegend();
  });

  // RTRW layer toggle (on-demand loading)
  document.getElementById('layer-rtrw')?.addEventListener('change', async (e) => {
    document.getElementById('inspector-rtrw-layer')?.setAttribute('aria-pressed', String(e.target.checked));
    if (e.target.checked) {
      if (!state.mapData.rtrw) {
        await loadRtrwLayer();
      } else if (state.mapLayers.rtrw) {
        state.mapLayers.rtrw.addTo(state.map);
      }
    } else {
      if (state.mapLayers.rtrw && state.map.hasLayer(state.mapLayers.rtrw)) {
        state.map.removeLayer(state.mapLayers.rtrw);
      }
    }
    updateDynamicLegend();
  });

  // --- Phase 4.7 Map Interaction & Popup Controls ---
  const popupMaster = document.getElementById('popup-master');
  const popupAdmin = document.getElementById('popup-administrasi');
  const popupFac = document.getElementById('popup-fasilitas');
  const popupRef = document.getElementById('popup-jaringan');
  const popupRtrw = document.getElementById('popup-rtrw');
  const tooltipMaster = document.getElementById('tooltip-master');
  const subWrapper = document.getElementById('popup-subordinates');

  function syncPopupControlsUI() {
    const enabled = state.popupSettings.masterEnabled;
    if (popupMaster) popupMaster.checked = enabled;
    if (popupAdmin) {
      popupAdmin.checked = state.popupSettings.administrasi;
      popupAdmin.disabled = !enabled;
    }
    if (popupFac) {
      popupFac.checked = state.popupSettings.fasilitas;
      popupFac.disabled = !enabled;
    }
    if (popupRef) {
      popupRef.checked = state.popupSettings.jaringanReferensi;
      popupRef.disabled = !enabled;
    }
    if (popupRtrw) {
      popupRtrw.checked = state.popupSettings.polaRuangRtrw;
      popupRtrw.disabled = !enabled;
    }
    if (subWrapper) {
      subWrapper.style.opacity = enabled ? '1' : '0.45';
      subWrapper.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }

  function updateTooltipVisibility(enabled) {
    const mapEl = document.getElementById('hss-map');
    if (!mapEl) return;
    if (enabled) {
      mapEl.classList.remove('tooltips-hidden');
    } else {
      mapEl.classList.add('tooltips-hidden');
    }
  }

  window.syncPopupControlsUI = syncPopupControlsUI;
  window.updateTooltipVisibility = updateTooltipVisibility;

  popupMaster?.addEventListener('change', (e) => {
    state.popupSettings.masterEnabled = e.target.checked;
    if (!e.target.checked) {
      state.map?.closePopup();
    }
    syncPopupControlsUI();
  });

  popupAdmin?.addEventListener('change', (e) => {
    state.popupSettings.administrasi = e.target.checked;
    if (!e.target.checked) state.map?.closePopup();
  });

  popupFac?.addEventListener('change', (e) => {
    state.popupSettings.fasilitas = e.target.checked;
    if (!e.target.checked) state.map?.closePopup();
  });

  popupRef?.addEventListener('change', (e) => {
    state.popupSettings.jaringanReferensi = e.target.checked;
    if (!e.target.checked) state.map?.closePopup();
  });

  popupRtrw?.addEventListener('change', (e) => {
    state.popupSettings.polaRuangRtrw = e.target.checked;
    if (!e.target.checked) state.map?.closePopup();
  });

  tooltipMaster?.addEventListener('change', (e) => {
    state.tooltipSettings.enabled = e.target.checked;
    updateTooltipVisibility(e.target.checked);
  });

  // Initial sync with state
  syncPopupControlsUI();
  if (tooltipMaster) tooltipMaster.checked = state.tooltipSettings.enabled;
  updateTooltipVisibility(state.tooltipSettings.enabled);
}

function setBasemapMode(mode) {
  const mapEl = document.getElementById('hss-map');
  const banner = document.getElementById('map-offline-banner');

  if (mode === 'osm') {
    if (state.map.hasLayer(state.mapLayers.satelliteBasemap)) {
      state.map.removeLayer(state.mapLayers.satelliteBasemap);
    }
    if (!state.map.hasLayer(state.mapLayers.osmBasemap)) {
      state.mapLayers.osmBasemap.addTo(state.map);
    }
    if (mapEl) mapEl.style.backgroundColor = '';
    banner?.classList.add('hidden');
  } else if (mode === 'satellite') {
    if (state.map.hasLayer(state.mapLayers.osmBasemap)) {
      state.map.removeLayer(state.mapLayers.osmBasemap);
    }
    if (!state.map.hasLayer(state.mapLayers.satelliteBasemap)) {
      state.mapLayers.satelliteBasemap.addTo(state.map);
    }
    if (mapEl) mapEl.style.backgroundColor = '';
    banner?.classList.add('hidden');
  } else {
    // neutral
    if (state.map.hasLayer(state.mapLayers.osmBasemap)) {
      state.map.removeLayer(state.mapLayers.osmBasemap);
    }
    if (state.map.hasLayer(state.mapLayers.satelliteBasemap)) {
      state.map.removeLayer(state.mapLayers.satelliteBasemap);
    }
    if (mapEl) mapEl.style.backgroundColor = '#f1f5f9';
    banner?.classList.remove('hidden');
  }

  // Adjust RTRW fill opacity if active
  if (state.mapLayers.rtrw) {
    const isSat = mode === 'satellite';
    state.mapLayers.rtrw.setStyle({
      fillOpacity: isSat ? 0.50 : 0.40,
    });
  }

  updateDynamicLegend();
}

async function applyMapPreset(preset) {
  const kabCheckbox = document.getElementById('layer-admin-kabupaten');
  const distCheckbox = document.getElementById('layer-admin-districts');
  const vilCheckbox = document.getElementById('layer-admin-villages');
  const hospCheckbox = document.getElementById('layer-fac-hospital');
  const puskCheckbox = document.getElementById('layer-fac-puskesmas');
  const mktCheckbox = document.getElementById('layer-fac-market');
  const schCheckbox = document.getElementById('layer-fac-school');
  const rtrwCheckbox = document.getElementById('layer-rtrw');

  if (preset === 'prioritas') {
    if (kabCheckbox) kabCheckbox.checked = true;
    if (distCheckbox) distCheckbox.checked = true;
    if (vilCheckbox) vilCheckbox.checked = false;
    if (hospCheckbox) hospCheckbox.checked = false;
    if (puskCheckbox) puskCheckbox.checked = false;
    if (mktCheckbox) mktCheckbox.checked = false;
    if (schCheckbox) schCheckbox.checked = false;
    if (rtrwCheckbox) rtrwCheckbox.checked = false;
  } else if (preset === 'pelayanan') {
    if (kabCheckbox) kabCheckbox.checked = true;
    if (distCheckbox) distCheckbox.checked = true;
    if (vilCheckbox) vilCheckbox.checked = false;
    if (hospCheckbox) hospCheckbox.checked = true;
    if (puskCheckbox) puskCheckbox.checked = true;
    if (mktCheckbox) mktCheckbox.checked = true;
    if (schCheckbox) schCheckbox.checked = true;
    if (rtrwCheckbox) rtrwCheckbox.checked = false;
  } else if (preset === 'tataruang') {
    if (kabCheckbox) kabCheckbox.checked = true;
    if (distCheckbox) distCheckbox.checked = true;
    if (vilCheckbox) vilCheckbox.checked = false;
    if (hospCheckbox) hospCheckbox.checked = false;
    if (puskCheckbox) puskCheckbox.checked = false;
    if (mktCheckbox) mktCheckbox.checked = false;
    if (schCheckbox) schCheckbox.checked = false;
    if (rtrwCheckbox) rtrwCheckbox.checked = true;
  }

  toggleLayerVisibility(state.mapLayers.kabupaten, kabCheckbox?.checked);
  toggleLayerVisibility(state.mapLayers.districts, distCheckbox?.checked);
  toggleLayerVisibility(state.mapLayers.villages, vilCheckbox?.checked);
  toggleLayerVisibility(state.mapLayers.rsud, hospCheckbox?.checked);
  toggleLayerVisibility(state.mapLayers.puskesmas, puskCheckbox?.checked);
  toggleLayerVisibility(state.mapLayers.markets, mktCheckbox?.checked);
  updateSchoolsVisibility(schCheckbox?.checked);

  if (rtrwCheckbox?.checked) {
    if (!state.mapData.rtrw) {
      await loadRtrwLayer();
    } else if (state.mapLayers.rtrw && !state.map.hasLayer(state.mapLayers.rtrw)) {
      state.mapLayers.rtrw.addTo(state.map);
    }
  } else {
    if (state.mapLayers.rtrw && state.map.hasLayer(state.mapLayers.rtrw)) {
      state.map.removeLayer(state.mapLayers.rtrw);
    }
  }

  updateDynamicLegend();
}

async function loadMapData() {
  try {
    const [roadsRes, refRes, facRes, distRes, vilRes, kabRes] = await Promise.all([
      fetch(`/api/map/roads?mode=${state.mode}&model=${encodeURIComponent(state.modelCode)}`).then((r) => r.json()),
      fetch('/api/map/reference-network').then((r) => r.json()),
      fetch('/api/map/facilities').then((r) => r.json()),
      fetch('/api/map/districts').then((r) => r.json()),
      fetch('/api/map/villages').then((r) => r.json()),
      fetch('/api/map/kabupaten').then((r) => r.json()),
    ]);

    if (kabRes && kabRes.success) {
      state.mapData.kabupaten = kabRes.data;
      renderKabupaten(kabRes.data);
    }

    if (distRes.success) {
      state.mapData.districts = distRes.data;
      renderDistricts(distRes.data);
      populateMapDistrictFilter(distRes.data);
    }

    if (vilRes.success) {
      state.mapData.villages = vilRes.data;
      renderVillages(vilRes.data);
    }

    if (refRes.success) {
      state.mapData.referenceNetwork = refRes.data;
      renderReferenceNetwork(refRes.data);
    }

    if (facRes.success) {
      state.mapData.facilities = facRes.data;
      renderFacilities(facRes.data);
    }

    if (roadsRes.success) {
      state.mapData.countyRoads = roadsRes.data;
      applyMapFilters();
      if (state.mapFilters.search === '' && state.mapFilters.district === 'ALL') fitHssBounds();
    }

    updateMapStatus();
    updateDynamicLegend();
  } catch (err) {
    console.error('Error loading map data:', err);
  }
}

function renderKabupaten(data) {
  if (state.mapLayers.kabupaten && state.map.hasLayer(state.mapLayers.kabupaten)) {
    state.map.removeLayer(state.mapLayers.kabupaten);
  }

  state.mapLayers.kabupaten = L.geoJSON(data, {
    pane: 'kabupatenPane',
    style: {
      color: ADMINISTRATIVE_STYLES.kabupaten.color,
      weight: ADMINISTRATIVE_STYLES.kabupaten.weight,
      opacity: ADMINISTRATIVE_STYLES.kabupaten.opacity,
      fill: ADMINISTRATIVE_STYLES.kabupaten.fill,
    },
    onEachFeature: (f, layer) => {
      layer.bindTooltip('Batas Kabupaten Hulu Sungai Selatan', {
        sticky: true,
        direction: 'top',
        className: 'text-xs font-bold text-slate-900 bg-white/95 px-2 py-1 rounded shadow',
      });
    },
  });

  const checkbox = document.getElementById('layer-admin-kabupaten');
  if (!checkbox || checkbox.checked) {
    state.mapLayers.kabupaten.addTo(state.map);
  }
}

async function loadMapCountyRoads() {
  try {
    const roadsRes = await fetch(`/api/map/roads?mode=${state.mode}&model=${encodeURIComponent(state.modelCode)}`).then((r) => r.json());
    if (roadsRes.success) {
      state.mapData.countyRoads = roadsRes.data;
      applyMapFilters();
    }
  } catch (err) {
    console.error('Error reloading map county roads:', err);
  }
}

function renderThematicRoads(features) {
  if (state.mapLayers.countyRoads) {
    state.map.removeLayer(state.mapLayers.countyRoads);
  }
  if (state.mapLayers.countyRoadsHitTarget) {
    state.map.removeLayer(state.mapLayers.countyRoadsHitTarget);
  }

  const isSimMode = state.simulation?.mapColorSource === 'SIMULATION' && (state.simulation?.comparisons?.length || 0) > 0;
  const simMap = isSimMode
    ? new Map(state.simulation.comparisons.map((c) => [c.road_key, c]))
    : null;

  const setupRoadInteractivity = (feature, layer) => {
    const p = feature.properties;
    const simComp = simMap?.get(p.road_key);
    const activeTier = (isSimMode && simComp) ? simComp.simulated_tier : p.tier_category;
    const tierStyle = ROAD_TIER_STYLES[activeTier] || ROAD_TIER_STYLES.REGULAR;

    let scoreInfo = `
      <div class="mt-1 pt-1 border-t border-slate-200 flex items-center justify-between space-x-2">
        <span class="font-bold text-slate-900">Peringkat: #${p.priority_rank}</span>
        <span class="font-mono text-sky-800 font-semibold">Skor: ${formatId(p.final_score, 4)}</span>
      </div>
      <div class="mt-0.5 flex items-center justify-between space-x-2 text-[10px]">
        <span class="px-1.5 py-0.5 rounded font-semibold ${tierStyle.badgeClass}">${getTierDisplayName(activeTier)}</span>
        <span class="text-slate-600">Mantap: ${p.mantap_pct.toFixed(1)}%</span>
      </div>
    `;

    if (isSimMode && simComp) {
      const delta = simComp.rank_delta;
      const deltaClass = delta > 0 ? 'text-emerald-700 bg-emerald-100' : delta < 0 ? 'text-rose-700 bg-rose-100' : 'text-slate-700 bg-slate-100';
      const deltaText = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 0';

      scoreInfo = `
        <div class="mt-1.5 pt-1.5 border-t border-amber-200 bg-amber-50/80 -mx-1 px-1.5 py-1 rounded">
          <div class="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-0.5">Mode Simulasi Skenario</div>
          <div class="flex items-center justify-between space-x-2">
            <span class="font-bold text-slate-900">Rank Sim: #${simComp.simulated_rank}</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${deltaClass}">${deltaText}</span>
          </div>
          <div class="flex items-center justify-between space-x-2 mt-0.5 text-[10px]">
            <span class="text-slate-500">Baseline: #${simComp.baseline_rank}</span>
            <span class="font-mono font-semibold text-amber-900">Skor: ${simComp.simulated_score.toFixed(4)}</span>
          </div>
          <div class="mt-1 flex items-center justify-between text-[10px]">
            <span class="px-1.5 py-0.5 rounded font-semibold ${tierStyle.badgeClass}">${getTierDisplayName(activeTier)}</span>
            <span class="text-slate-500">Δ Skor: ${(simComp.score_delta >= 0 ? '+' : '') + simComp.score_delta.toFixed(4)}</span>
          </div>
        </div>
      `;
    }

    const tooltipContent = `
      <div class="p-1 text-xs leading-relaxed">
        <div class="font-bold text-slate-900">${escapeHtml(p.display_name)}</div>
        <div class="text-[10px] text-slate-500 font-mono">No: ${p.nomor_ruas} | ${p.road_key}</div>
        <div class="text-[11px] text-slate-700">Kecamatan: <strong>${escapeHtml(p.district_name)}</strong></div>
        ${scoreInfo}
      </div>
    `;
    layer.bindTooltip(tooltipContent, {
      sticky: true,
      className: 'road-map-tooltip shadow-md rounded-lg border border-slate-200',
    });

    layer.on('click', (e) => {
      if (e && e.originalEvent) {
        L.DomEvent.stopPropagation(e);
      }
      showRoadQuickPopup(p.road_key, e.latlng || layer.getBounds().getCenter());
    });
  };

  // 1. Invisible hit target layer (weight: 16, opacity: 0) for effortless clicking
  state.mapLayers.countyRoadsHitTarget = L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      pane: 'countyRoadsPane',
      style: HIT_TARGET_STYLE,
      onEachFeature: setupRoadInteractivity,
    }
  );
  if (state.roadThematicMode === 'PRIORITAS') {
    state.mapLayers.countyRoadsHitTarget.addTo(state.map);
  }

  // 2. Visible thematic priority styled road layer
  state.mapLayers.countyRoads = L.geoJSON(
    { type: 'FeatureCollection', features },
    {
      pane: 'countyRoadsPane',
      style: (feature) => {
        const p = feature.properties;
        const activeTier = (isSimMode && simMap?.get(p.road_key))
          ? simMap.get(p.road_key).simulated_tier
          : (p.tier_category || 'REGULAR');
        const style = ROAD_TIER_STYLES[activeTier] || ROAD_TIER_STYLES.REGULAR;
        return {
          color: style.color,
          weight: style.weight,
          opacity: style.opacity,
          lineCap: 'round',
          lineJoin: 'round',
        };
      },
      onEachFeature: setupRoadInteractivity,
    }
  );
  if (state.roadThematicMode === 'PRIORITAS') {
    state.mapLayers.countyRoads.addTo(state.map);
  }

  // 3. If in DD1 mode, update/render DD1 segments layer for currently filtered roads
  if (state.roadThematicMode === 'KONDISI_DD1') {
    renderFullDD1Segments(features);
  }
}

// --- FULL-MAP THEMATIC MODE: KONDISI DD1 (Phase 5.1C) ---
async function loadFullDD1SegmentsData() {
  if (state.mapData.dd1Segments) return state.mapData.dd1Segments;
  try {
    const res = await fetch('/api/map/dd1-segments');
    const data = await res.json();
    state.mapData.dd1Segments = data;
    return data;
  } catch (err) {
    console.error('Failed to load full DD1 segments data:', err);
    return null;
  }
}

function setupDD1SegmentInteractivity(feature, layer) {
  const p = feature.properties;
  const condLabelMap = {
    baik: 'Baik',
    sedang: 'Sedang',
    rusak_ringan: 'Rusak Ringan',
    rusak_berat: 'Rusak Berat',
  };
  const condBadgeMap = {
    baik: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    sedang: 'bg-amber-100 text-amber-800 border-amber-300',
    rusak_ringan: 'bg-orange-100 text-orange-800 border-orange-300',
    rusak_berat: 'bg-rose-100 text-rose-800 border-rose-300',
  };
  const condBadge = condBadgeMap[p.dominant_condition] || 'bg-slate-100 text-slate-800';
  const condLabel = condLabelMap[p.dominant_condition] || p.dominant_condition;
  const statusBadge = p.segment_status === 'mantap'
    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Mantap</span>'
    : '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Tidak Mantap</span>';

  const priorityBadge = p.priority_rank !== null
    ? `<div class="mt-1 pt-1 border-t border-slate-200 flex items-center justify-between text-[11px]">
         <span class="text-slate-500">Prioritas ruas:</span>
         <span class="font-bold text-slate-800">#${p.priority_rank} <span class="text-[10px] text-slate-500">(${getTierDisplayName(p.priority_tier || 'REGULAR')})</span></span>
       </div>`
    : '';

  const tooltipContent = `
    <div class="p-1.5 text-xs leading-relaxed max-w-xs">
      <div class="font-bold text-slate-900">${escapeHtml(p.nama_ruas)}</div>
      <div class="text-[10px] text-slate-500 font-mono">No: ${p.nomor_ruas} | ${p.road_key}</div>
      
      <div class="mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-700">
        <span>${p.sta_label}</span>
        <span class="text-slate-500 font-normal">${p.length_m} m ${p.is_short_final ? '(akhir pendek)' : ''}</span>
      </div>
      
      <div class="mt-1 flex items-center space-x-1.5">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${condBadge}">${condLabel}</span>
        ${statusBadge}
      </div>

      <div class="mt-1 text-[10px] text-slate-600">
        <div>Perlakuan: <span class="font-medium text-slate-800">${escapeHtml(p.treatment)}</span></div>
        <div>Permukaan: <span class="font-medium text-slate-800">${p.surface}</span> (${p.road_width_m} m)</div>
      </div>
      
      ${priorityBadge}
    </div>
  `;

  layer.bindTooltip(tooltipContent, {
    sticky: true,
    className: 'road-map-tooltip shadow-md rounded-lg border border-slate-200 dd1-segment-tooltip',
  });

  layer.on('click', (e) => {
    if (e && e.originalEvent) {
      L.DomEvent.stopPropagation(e);
    }
    showRoadQuickPopup(p.road_key, e.latlng || layer.getBounds().getCenter());
  });
}

async function renderFullDD1Segments(filteredCountyRoads) {
  if (state.mapLayers.fullDd1Segments && state.map) {
    state.map.removeLayer(state.mapLayers.fullDd1Segments);
    state.mapLayers.fullDd1Segments = null;
  }

  const dd1Data = await loadFullDD1SegmentsData();
  if (!dd1Data || !dd1Data.features || !state.map) return;

  const allowedKeys = filteredCountyRoads
    ? new Set(filteredCountyRoads.map((f) => f.properties.road_key))
    : null;

  const featuresToRender = allowedKeys
    ? dd1Data.features.filter((f) => allowedKeys.has(f.properties.road_key))
    : dd1Data.features;

  const canvasRenderer = L.canvas({ padding: 0.5, pane: 'dd1SegmentsPane' });

  state.mapLayers.fullDd1Segments = L.geoJSON(
    { type: 'FeatureCollection', features: featuresToRender },
    {
      renderer: canvasRenderer,
      style: (feature) => getDD1SegmentFullMapStyle(feature),
      onEachFeature: setupDD1SegmentInteractivity,
    }
  );

  if (state.roadThematicMode === 'KONDISI_DD1') {
    state.mapLayers.fullDd1Segments.addTo(state.map);
  }
}

async function setRoadThematicMode(mode) {
  if (state.roadThematicMode === mode) return;
  state.roadThematicMode = mode;

  const btnPrioritas = document.getElementById('btn-theme-prioritas');
  const btnDd1 = document.getElementById('btn-theme-dd1');

  if (mode === 'PRIORITAS') {
    if (btnPrioritas) {
      btnPrioritas.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-600 text-white shadow-xs transition';
    }
    if (btnDd1) {
      btnDd1.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition';
    }

    // Hide DD1 segments
    if (state.mapLayers.fullDd1Segments && state.map && state.map.hasLayer(state.mapLayers.fullDd1Segments)) {
      state.map.removeLayer(state.mapLayers.fullDd1Segments);
    }

    // Show county roads
    if (state.mapLayers.countyRoads && state.map && !state.map.hasLayer(state.mapLayers.countyRoads)) {
      state.mapLayers.countyRoads.addTo(state.map);
    }
    if (state.mapLayers.countyRoadsHitTarget && state.map && !state.map.hasLayer(state.mapLayers.countyRoadsHitTarget)) {
      state.mapLayers.countyRoadsHitTarget.addTo(state.map);
    }
  } else if (mode === 'KONDISI_DD1') {
    if (btnPrioritas) {
      btnPrioritas.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition';
    }
    if (btnDd1) {
      btnDd1.className = 'px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white shadow-xs transition';
    }

    // Hide county roads
    if (state.mapLayers.countyRoads && state.map && state.map.hasLayer(state.mapLayers.countyRoads)) {
      state.map.removeLayer(state.mapLayers.countyRoads);
    }
    if (state.mapLayers.countyRoadsHitTarget && state.map && state.map.hasLayer(state.mapLayers.countyRoadsHitTarget)) {
      state.map.removeLayer(state.mapLayers.countyRoadsHitTarget);
    }

    // Render & show full DD1 segments
    if (!state.mapLayers.fullDd1Segments) {
      const isFiltered = state.filteredRoads && state.filteredRoads.length > 0 && state.filteredRoads.length < 350;
      await renderFullDD1Segments(isFiltered ? state.filteredRoads.map((r) => ({ properties: r })) : null);
    } else if (state.map && !state.map.hasLayer(state.mapLayers.fullDd1Segments)) {
      state.mapLayers.fullDd1Segments.addTo(state.map);
    }
  }

  // Preserve selected road halo highlight if a road is active
  if (state.selectedRoadKey) {
    selectRoadOnMap(state.selectedRoadKey);
  }

  updateDynamicLegend();
}

window.setRoadThematicMode = setRoadThematicMode;

function renderReferenceNetwork(data) {
  const provincialFeatures = data.features.filter((f) => f.properties.network_class === 'PROVINSI');
  const nationalFeatures = data.features.filter((f) => f.properties.network_class === 'NASIONAL');
  const connectorFeatures = data.features.filter((f) => f.properties.network_class === 'KONEKTOR_ANALISIS');

  // Provincial
  state.mapLayers.provincialRoads = L.geoJSON(
    { type: 'FeatureCollection', features: provincialFeatures },
    {
      pane: 'refRoadsPane',
      style: REFERENCE_NETWORK_STYLES.PROVINSI,
      onEachFeature: (f, layer) => {
        const name = f.properties.road_name || 'Jalan Provinsi';
        layer.bindTooltip(
          `<b>${escapeHtml(name)}</b><br/><span class="text-xs text-indigo-700 font-semibold">Jalan Provinsi (4 Ruas)</span>`,
          { sticky: true }
        );
      },
    }
  ).addTo(state.map);

  // National
  state.mapLayers.nationalRoads = L.geoJSON(
    { type: 'FeatureCollection', features: nationalFeatures },
    {
      pane: 'refRoadsPane',
      style: REFERENCE_NETWORK_STYLES.NASIONAL,
      onEachFeature: (f, layer) => {
        const name = f.properties.road_name || 'Jalan Nasional';
        layer.bindTooltip(
          `<b>${escapeHtml(name)}</b><br/><span class="text-xs text-teal-800 font-semibold">Jalan Nasional (8 Ruas)</span>`,
          { sticky: true }
        );
      },
    }
  ).addTo(state.map);

  // Analytical Connectors
  state.mapLayers.connectors = L.geoJSON(
    { type: 'FeatureCollection', features: connectorFeatures },
    {
      pane: 'connectorsPane',
      style: REFERENCE_NETWORK_STYLES.KONEKTOR_ANALISIS,
      onEachFeature: (f, layer) => {
        const p = f.properties;
        const name = p.connector_name || p.road_name || 'Konektor Jaringan Analisis';
        const popupContent = `
          <div class="p-1.5 text-xs">
            <div class="font-bold text-slate-800">${escapeHtml(name)}</div>
            <div class="text-[11px] text-amber-700 font-semibold mt-1">Konektor Jaringan Analisis (Topologi)</div>
            <div class="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Elemen sintetis pemodelan jaringan. Bukan ruas SK bupati, bukan jembatan fisik, dan tidak memiliki peringkat prioritas penanganan.
            </div>
          </div>
        `;
        layer.on('click', (e) => {
          if (!state.popupSettings.masterEnabled || !state.popupSettings.jaringanReferensi) return;
          L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(state.map);
        });
      },
    }
  ).addTo(state.map);
}

function renderFacilities(data) {
  const rsudFeatures = data.features.filter((f) => f.properties.facility_type === 'hospital');
  const puskesmasFeatures = data.features.filter((f) => f.properties.facility_type === 'puskesmas');
  const marketFeatures = data.features.filter((f) => f.properties.facility_type === 'market');
  const schoolFeatures = data.features.filter((f) => f.properties.facility_type === 'school');

  const createMarkerLayer = (features, type) => {
    return L.geoJSON(
      { type: 'FeatureCollection', features },
      {
        pane: 'facilitiesPane',
        pointToLayer: (feature, latlng) => {
          return L.marker(latlng, { icon: createFacilityIcon(type) });
        },
        onEachFeature: (f, layer) => {
          const p = f.properties;
          const popupContent = `
            <div class="p-1.5 text-xs">
              <div class="font-bold text-slate-900">${escapeHtml(p.facility_name)}</div>
              <div class="text-[11px] text-slate-600 font-medium capitalize">${p.facility_type}</div>
              <div class="text-[10px] text-slate-500 mt-0.5">Kecamatan: ${p.district || '-'} | Desa: ${p.village || '-'}</div>
            </div>
          `;
          layer.on('click', (e) => {
            if (!state.popupSettings.masterEnabled || !state.popupSettings.fasilitas) return;
            L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(state.map);
          });
        },
      }
    );
  };

  state.mapLayers.rsud = createMarkerLayer(rsudFeatures, 'hospital').addTo(state.map);
  state.mapLayers.puskesmas = createMarkerLayer(puskesmasFeatures, 'puskesmas').addTo(state.map);
  state.mapLayers.markets = createMarkerLayer(marketFeatures, 'market').addTo(state.map);
  state.mapLayers.schools = createMarkerLayer(schoolFeatures, 'school'); // schools off by default
}

function renderDistricts(data) {
  state.mapLayers.districts = L.geoJSON(data, {
    pane: 'districtsPane',
    style: ADMINISTRATIVE_STYLES.districts,
    onEachFeature: (f, layer) => {
      const name = f.properties.nama_kecamatan || f.properties.district_name || f.properties.WADMKC || 'Kecamatan';
      layer.bindTooltip(`Kec. ${escapeHtml(name)}`, {
        permanent: true,
        direction: 'center',
        className: 'district-label',
      });
    },
  }).addTo(state.map);
}

function renderVillages(data) {
  state.mapLayers.villages = L.geoJSON(data, {
    pane: 'villagesPane',
    style: ADMINISTRATIVE_STYLES.villages,
    onEachFeature: (f, layer) => {
      const p = f.properties;
      const name = p.nama_desa || p.village_name || p.NAMOBJ || 'Desa';
      const adminType = p.admin_type || '-';
      const kecamatan = p.district_name || p.nama_kecamatan || '-';
      const kode = p.village_id || '-';
      const luas = p.area_ha_source ? `${Number(p.area_ha_source).toFixed(2)} ha` : '-';

      // Hover tooltip (respects CSS-based tooltip toggle and close-zoom threshold >= 12)
      layer.bindTooltip(`<span class="text-[10px] text-slate-600">${escapeHtml(name)}</span>`, {
        permanent: false,
        direction: 'center',
      });
      layer.on('tooltipopen', () => {
        if (state.map && state.map.getZoom() < 12) {
          layer.closeTooltip();
        }
      });

      // Click popup with guard (Phase 4.7)
      layer.on('click', (e) => {
        if (!state.popupSettings.masterEnabled || !state.popupSettings.administrasi) return;
        L.popup({ className: 'shadow-md rounded-lg border border-slate-200' })
          .setLatLng(e.latlng)
          .setContent(`
            <div class="p-2 text-xs leading-relaxed min-w-[180px]">
              <div class="font-bold text-slate-900 text-sm">${escapeHtml(name)}</div>
              <div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(adminType)}</div>
              <div class="mt-1.5 space-y-0.5">
                <div class="text-[11px] text-slate-700">Kecamatan: <strong>${escapeHtml(kecamatan)}</strong></div>
                <div class="text-[11px] text-slate-600">Kode Wilayah: <span class="font-mono">${escapeHtml(kode)}</span></div>
                <div class="text-[11px] text-slate-600">Luas: ${luas}</div>
              </div>
            </div>
          `)
          .openOn(state.map);
      });
    },
  });
}

async function loadRtrwLayer() {
  if (state.mapData.rtrw && state.mapLayers.rtrw) {
    if (!state.map.hasLayer(state.mapLayers.rtrw)) {
      state.mapLayers.rtrw.addTo(state.map);
    }
    updateDynamicLegend();
    return;
  }

  const spinner = document.getElementById('rtrw-loading-indicator');
  spinner?.classList.remove('hidden');

  const t0 = performance.now();
  try {
    const res = await fetch('/api/map/rtrw');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.mapData.rtrw = json.data;
    state.mapLayers.rtrw = L.geoJSON(json.data, {
      pane: 'rtrwPane',
      style: (feature) => {
        const pola = feature.properties.nama_objek || feature.properties.NAMOBJ || feature.properties.pola_ruang || '';
        const color = RTRW_COLORS[pola] || '#94a3b8';
        const isSat = document.getElementById('layer-basemap-satellite')?.checked;
        return {
          fillColor: color,
          fillOpacity: isSat ? 0.50 : 0.40,
          weight: 0.8,
          color: '#334155',
          opacity: 0.5,
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        const pola = p.nama_objek || p.NAMOBJ || p.pola_ruang || 'Pola Ruang';
        const kec = p.kecamatan || p.WADMKC || '-';
        const luas = p.luas_ha ? `${Number(p.luas_ha).toFixed(2)} ha` : '-';
        const kode = p.kode_kawasan || '-';

        layer.bindTooltip(`
          <div class="text-xs p-1">
            <div class="font-bold text-slate-900">${escapeHtml(pola)}</div>
            <div class="text-[10px] text-slate-600 mt-0.5">Kecamatan: ${escapeHtml(kec)}</div>
            <div class="text-[10px] text-slate-500">Luas: ${luas} | Kode: ${kode}</div>
          </div>
        `, {
          sticky: true,
          className: 'shadow-md rounded-lg border border-slate-200 bg-white/95',
        });

        // Click popup with guard (Phase 4.7)
        layer.on('click', (e) => {
          if (!state.popupSettings.masterEnabled || !state.popupSettings.polaRuangRtrw) return;
          L.popup({ className: 'shadow-md rounded-lg border border-slate-200' })
            .setLatLng(e.latlng)
            .setContent(`
              <div class="p-2 text-xs leading-relaxed">
                <div class="font-bold text-slate-900">${escapeHtml(pola)}</div>
                <div class="text-[10px] text-slate-600 mt-0.5">Kecamatan: ${escapeHtml(kec)}</div>
                <div class="text-[10px] text-slate-500">Luas: ${luas} | Kode: ${kode}</div>
              </div>
            `)
            .openOn(state.map);
        });
      },
    });

    if (document.getElementById('layer-rtrw')?.checked) {
      state.mapLayers.rtrw.addTo(state.map);
    }

    const t1 = performance.now();
    console.info(`[Phase 4.6] RTRW categorical layer rendered in ${(t1 - t0).toFixed(1)}ms (${json.data.features?.length || 2832} polygons)`);
    updateDynamicLegend();
  } catch (err) {
    console.error('Error loading RTRW overlay:', err);
    const rtrwToggle = document.getElementById('layer-rtrw');
    if (rtrwToggle) rtrwToggle.checked = false;
  } finally {
    spinner?.classList.add('hidden');
  }
}

function applyMapFilters() {
  if (!state.mapData.countyRoads) return;

  let features = state.mapData.countyRoads.features;

  // Search
  if (state.mapFilters.search) {
    const q = state.mapFilters.search;
    features = features.filter((f) => {
      const p = f.properties;
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.canonical_name.toLowerCase().includes(q) ||
        p.nomor_ruas.includes(q) ||
        p.road_key.toLowerCase().includes(q)
      );
    });
  }

  // District
  if (state.mapFilters.district !== 'ALL') {
    features = features.filter((f) => f.properties.district_name === state.mapFilters.district);
  }

  // Tier
  if (state.mapFilters.tier !== 'ALL') {
    features = features.filter((f) => f.properties.tier_category === state.mapFilters.tier);
  }

  // Condition
  if (state.mapFilters.condition === 'MANTAP') {
    features = features.filter((f) => f.properties.mantap_pct >= 60.0);
  } else if (state.mapFilters.condition === 'TRANSISI') {
    features = features.filter((f) => f.properties.mantap_pct >= 40.0 && f.properties.mantap_pct < 60.0);
  } else if (state.mapFilters.condition === 'KRITIS') {
    features = features.filter((f) => f.properties.mantap_pct < 40.0);
  }

  // Empty state handling
  const emptyStateEl = document.getElementById('map-empty-state');
  if (features.length === 0) {
    emptyStateEl?.classList.remove('hidden');
  } else {
    emptyStateEl?.classList.add('hidden');
  }

  renderThematicRoads(features);

  // Update status badge & text
  const badge = document.getElementById('map-filtered-badge');
  if (badge) {
    badge.textContent = `Menampilkan ${features.length} dari 350 ruas`;
    badge.className = features.length === 350
      ? 'px-2.5 py-1 rounded-full font-bold bg-sky-100 text-sky-800'
      : 'px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800';
  }

  const statRoads = document.getElementById('map-stat-visible-roads');
  if (statRoads) {
    statRoads.textContent = `Menampilkan ${features.length} dari 350 ruas jalan`;
  }
}

let autocompleteSelectedIndex = -1;
let currentAutocompleteMatches = [];

function handleMapSearchAutocomplete(query) {
  const box = document.getElementById('map-search-autocomplete');
  if (!box || !state.mapData.countyRoads) return;

  autocompleteSelectedIndex = -1;

  if (!query || query.length < 2) {
    box.classList.add('hidden');
    box.innerHTML = '';
    currentAutocompleteMatches = [];
    return;
  }

  currentAutocompleteMatches = state.mapData.countyRoads.features
    .filter((f) => {
      const p = f.properties;
      return (
        p.display_name.toLowerCase().includes(query) ||
        p.canonical_name.toLowerCase().includes(query) ||
        p.nomor_ruas.includes(query) ||
        p.road_key.toLowerCase().includes(query)
      );
    })
    .slice(0, 8);

  if (currentAutocompleteMatches.length === 0) {
    box.innerHTML = `
      <div class="px-3 py-2.5 text-xs text-slate-500 italic text-center">
        Tidak ada ruas jalan yang cocok dengan "${escapeHtml(query)}"
      </div>
    `;
    box.classList.remove('hidden');
    return;
  }

  renderAutocompleteItems(query);
  box.classList.remove('hidden');
}

function renderAutocompleteItems(query) {
  const box = document.getElementById('map-search-autocomplete');
  if (!box) return;

  const escaped = escapeRegExp(query);
  const regex = new RegExp(`(${escaped})`, 'gi');

  box.innerHTML = currentAutocompleteMatches
    .map((m, idx) => {
      const p = m.properties;
      const highlightedName = escapeHtml(p.display_name).replace(regex, '<mark class="bg-sky-200 text-slate-900 rounded px-0.5">$1</mark>');
      const highlightedKey = escapeHtml(p.road_key).replace(regex, '<mark class="bg-sky-200 text-slate-900 rounded px-0.5">$1</mark>');
      const highlightedNum = escapeHtml(p.nomor_ruas).replace(regex, '<mark class="bg-sky-200 text-slate-900 rounded px-0.5">$1</mark>');
      const isSelected = idx === autocompleteSelectedIndex;

      return `
        <div class="px-3 py-2 cursor-pointer border-b border-slate-100 last:border-0 flex items-center justify-between transition-colors ${
          isSelected ? 'bg-sky-100' : 'hover:bg-slate-50'
        }" onclick="selectFromMapAutocomplete('${p.road_key}')" data-index="${idx}">
          <div>
            <div class="font-semibold text-slate-800 text-xs">${highlightedName}</div>
            <div class="text-[10px] text-slate-500 font-mono">No. ${highlightedNum} | ${highlightedKey} | ${escapeHtml(p.district_name)}</div>
          </div>
          <div class="text-right font-mono shrink-0 ml-2">
            <span class="text-xs font-bold text-slate-900">#${p.priority_rank}</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

window.selectFromMapAutocomplete = function (roadKey) {
  const box = document.getElementById('map-search-autocomplete');
  box?.classList.add('hidden');
  autocompleteSelectedIndex = -1;
  enterInteractiveSpatialProfile(roadKey);
};

function populateMapDistrictFilter(districtsGeoJson) {
  const select = document.getElementById('map-filter-district');
  if (!select || !districtsGeoJson?.features) return;

  const names = districtsGeoJson.features
    .map((f) => f.properties.nama_kecamatan || f.properties.district_name || f.properties.WADMKC)
    .filter(Boolean)
    .sort();

  select.innerHTML = '<option value="ALL">Semua Kecamatan (11)</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  setSelectValue(select, state.mapFilters.district);
}

window.selectRoadOnMap = function (roadKey, { fit = true } = {}) {
  if (!state.mapData.countyRoads || !state.map) return;

  const feature = state.mapData.countyRoads.features.find((f) => f.properties.road_key === roadKey);
  if (!feature) return;

  state.selectedRoadKey = roadKey;

  // Show "Hapus Pilihan" button
  document.getElementById('map-btn-clear-selection')?.classList.remove('hidden');

  // Clear previous halo
  if (state.mapLayers.selectionHalo) {
    state.map.removeLayer(state.mapLayers.selectionHalo);
  }

  // Draw Cyan Selection Halo in selectionHaloPane
  state.mapLayers.selectionHalo = L.geoJSON(feature, {
    pane: 'selectionHaloPane',
    interactive: false,
    style: SELECTION_HALO_STYLE,
  }).addTo(state.map);

  // Zoom to road with viewport padding accounting for drawer width on desktop
  const bounds = state.mapLayers.selectionHalo.getBounds();
  if (fit && bounds.isValid()) {
    const isDesktop = window.innerWidth >= 1024;
    const drawerEl = document.getElementById('road-detail-drawer');
    const isDrawerOpen = drawerEl && !drawerEl.classList.contains('hidden');
    // On desktop, drawer takes ~576px on right. Give padding [460, 40] so road is centered in left viewport
    const rightPad = isDesktop && isDrawerOpen ? 460 : 60;
    state.map.fitBounds(bounds, {
      paddingBottomRight: [rightPad, 40],
      paddingTopLeft: [40, 40],
      maxZoom: 15,
    });
  }
};

window.clearRoadSelection = function () {
  if (state.isInteractiveDetailMode) {
    exitInteractiveSpatialProfile();
    return;
  }
  if (state.mapLayers.selectionHalo && state.map) {
    state.map.removeLayer(state.mapLayers.selectionHalo);
    state.mapLayers.selectionHalo = null;
  }
  clearDD1SegmentsLayer();
  state.selectedRoadKey = null;
  document.getElementById('map-btn-clear-selection')?.classList.add('hidden');

  if (window.location.hash.startsWith('#peta')) writeRouteContext({ road: '' });
};

window.viewRoadOnMap = async function (roadKey) {
  if (!/^HSS-KAB-\d{3}$/.test(roadKey || '')) return;
  writeRouteContext({ road: roadKey, view: 'peta' });
  switchView('peta');

  if (!state.mapInitialized) {
    await initMap();
  }
  [50, 150, 300].forEach((d) => setTimeout(() => state.map?.invalidateSize({ pan: false }), d));

  setTimeout(() => {
    enterInteractiveSpatialProfile(roadKey);
  }, 200);
};

// =============================================================================
// Map road inspection
// =============================================================================

window.showRoadQuickPopup = function (roadKey, latlng) {
  if (!state.map) return;
  const feature = state.mapData.countyRoads?.features?.find((f) => f.properties.road_key === roadKey);
  if (!feature) return;
  if (state.isInteractiveDetailMode) {
    if (state.interactiveDetailRoadKey !== roadKey) enterInteractiveSpatialProfile(roadKey);
    return;
  }
  selectRoadOnMap(roadKey);
  const p = feature.properties;

  const isSimMode = state.currentSimulationResult !== null;
  const simMap = isSimMode ? state.currentSimulationResult?.roadMap : null;
  const activeTier = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_tier
    : (p.tier_category || 'REGULAR');
  const activeScore = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_score
    : (p.final_score ?? 0);
  const activeRank = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_rank
    : (p.priority_rank ?? '—');

  const popupHtml = `
    <div class="road-quick-popup p-1 text-slate-800" style="min-width: 220px; font-family: inherit;">
      <div class="flex items-center space-x-1.5 mb-1">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-100 text-sky-800 border border-sky-300">${escapeHtml(p.road_key)}</span>
        <span class="text-[11px] text-slate-500 font-mono">No. ${escapeHtml(p.nomor_ruas)}</span>
      </div>
      <div class="font-bold text-slate-900 text-xs leading-snug mb-1">${escapeHtml(p.display_name)}</div>
      <div class="text-[11px] text-slate-600 mb-2">Kecamatan: <strong>${escapeHtml(p.district_name)}</strong></div>
      <div class="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10px] mb-2.5">
        <div>Panjang: <strong>${(p.length_km || 0).toFixed(2)} km</strong></div>
        <div>Peringkat: <strong class="text-rose-600 font-bold">#${activeRank}</strong></div>
        <div>Skor: <strong class="font-mono">${Number(activeScore).toFixed(4)}</strong></div>
        <div>Kemantapan: <strong>${(p.mantap_pct || 0).toFixed(0)}%</strong></div>
      </div>
      <button type="button" onclick="enterInteractiveSpatialProfile('${escapeHtml(p.road_key)}')" class="w-full py-1.5 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center justify-center space-x-1.5 transition">
        <span>🔍</span>
        <span>Lihat Detail</span>
      </button>
    </div>
  `;

  L.popup({
    className: 'road-interactive-popup shadow-xl rounded-xl',
    offset: [0, -10],
    autoPan: true,
    autoPanPadding: [50, 50],
  })
    .setLatLng(latlng)
    .setContent(popupHtml)
    .openOn(state.map);
};

window.enterInteractiveSpatialProfile = async function (roadKey) {
  if (!state.mapData.countyRoads || !state.map) return;
  const feature = state.mapData.countyRoads.features.find((f) => f.properties.road_key === roadKey);
  if (!feature) return;

  const p = feature.properties;
  const request = ++state.inspectorRequest;
  const gisPanel = document.getElementById('gis-side-panel');
  if (!state.isInteractiveDetailMode) {
    state.inspectorLayersWereHidden = gisPanel.classList.contains('hidden');
    gisPanel.classList.add('hidden');
    document.getElementById('btn-toggle-layers').setAttribute('aria-expanded', 'false');
  }
  state.isInteractiveDetailMode = true;
  state.interactiveDetailRoadKey = roadKey;
  state.map.closePopup();
  if (state.activeRoadTooltip) state.map.closeTooltip(state.activeRoadTooltip);
  if (state.selectedRoadDetail && state.selectedRoadDetail.identity.road_key !== roadKey) closeDetailDrawer();
  clearRouteTrace({ skipZoomReset: true });

  const inspector = document.getElementById('road-inspector');
  const container = document.getElementById('map-container');
  inspector.classList.remove('hidden');
  container.classList.add('inspection-open');
  inspector.querySelector('.inspector-content').scrollTop = 0;
  const rtrwLayer = document.getElementById('layer-rtrw');
  document.getElementById('inspector-rtrw-layer').setAttribute('aria-pressed', String(rtrwLayer.checked));

  state.map.invalidateSize({ pan: false });
  selectRoadOnMap(roadKey, { fit: false });
  fitInspectedRoad();
  container.scrollIntoView({ block: 'nearest' });

  const isSimMode = state.currentSimulationResult !== null;
  const simMap = isSimMode ? state.currentSimulationResult?.roadMap : null;
  const activeTier = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_tier
    : (p.tier_category || 'REGULAR');
  const activeScore = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_score
    : (p.final_score ?? 0);
  const activeRank = isSimMode && simMap?.get(roadKey)
    ? simMap.get(roadKey).simulated_rank
    : (p.priority_rank ?? '—');

  const hudKey = document.getElementById('hud-road-key');
  const hudNum = document.getElementById('hud-nomor-ruas');
  const hudName = document.getElementById('hud-road-name');
  const hudTier = document.getElementById('hud-tier-badge');
  const hudRank = document.getElementById('hud-rank');
  const hudLen = document.getElementById('hud-length');

  if (hudKey) hudKey.textContent = p.road_key;
  if (hudNum) hudNum.textContent = `No. ${p.nomor_ruas}`;
  if (hudName) hudName.textContent = p.display_name;
  if (hudTier) {
    hudTier.textContent = getTierDisplayName(activeTier);
    hudTier.className = `text-[10px] px-2 py-0.5 rounded-full font-bold ${
      activeTier === 'TOP_35' ? 'bg-rose-900/90 text-rose-200 border border-rose-600' :
      activeTier === 'TOP_70' ? 'bg-orange-900/90 text-orange-200 border border-orange-600' :
      activeTier === 'TOP_105' ? 'bg-yellow-900/90 text-yellow-200 border border-yellow-600' :
      'bg-slate-800 text-slate-300 border border-slate-700'
    }`;
  }
  if (hudRank) hudRank.textContent = `#${activeRank}`;
  if (hudLen) hudLen.textContent = `${(p.length_km || 0).toFixed(3)} km`;

  hudName?.focus({ preventScroll: true });
  document.getElementById('hud-btn-drawer').onclick = () => openRoadDetail(roadKey, { showFactors: true });
  const idVillages = document.getElementById('card-id-villages');
  document.getElementById('card-id-district').textContent = p.district_name || '—';
  idVillages.textContent = 'Memuat data spasial…';
  for (const field of document.querySelectorAll('#card-spasial dd')) field.textContent = '—';
  document.getElementById('card-s-rtrw-breakdown').replaceChildren();

  // 9. Populate Card 2 & 3: Kondisi & Kemantapan
  const totalKm = p.length_km || 1;
  const baikKm = p.baik_km || 0;
  const sedangKm = p.sedang_km || 0;
  const rrKm = p.rusak_ringan_km || 0;
  const rbKm = p.rusak_berat_km || 0;

  const baikPct = totalKm > 0 ? (baikKm / totalKm) * 100 : 0;
  const sedangPct = totalKm > 0 ? (sedangKm / totalKm) * 100 : 0;
  const rrPct = totalKm > 0 ? (rrKm / totalKm) * 100 : 0;
  const rbPct = totalKm > 0 ? (rbKm / totalKm) * 100 : 0;

  const mantapKm = baikKm + sedangKm;
  const tidakMantapKm = rrKm + rbKm;
  const mantapPct = totalKm > 0 ? (mantapKm / totalKm) * 100 : (p.mantap_pct || 0);
  const tidakMantapPct = totalKm > 0 ? (tidakMantapKm / totalKm) * 100 : (p.tidak_mantap_pct || 0);

  const barBaik = document.getElementById('bar-kondisi-baik');
  const barSedang = document.getElementById('bar-kondisi-sedang');
  const barRr = document.getElementById('bar-kondisi-rr');
  const barRb = document.getElementById('bar-kondisi-rb');
  if (barBaik) barBaik.style.width = `${baikPct}%`;
  if (barSedang) barSedang.style.width = `${sedangPct}%`;
  if (barRr) barRr.style.width = `${rrPct}%`;
  if (barRb) barRb.style.width = `${rbPct}%`;

  const cBaik = document.getElementById('card-c-baik');
  const cSedang = document.getElementById('card-c-sedang');
  const cRr = document.getElementById('card-c-rr');
  const cRb = document.getElementById('card-c-rb');
  if (cBaik) cBaik.textContent = `${baikKm.toFixed(2)} km (${baikPct.toFixed(0)}%)`;
  if (cSedang) cSedang.textContent = `${sedangKm.toFixed(2)} km (${sedangPct.toFixed(0)}%)`;
  if (cRr) cRr.textContent = `${rrKm.toFixed(2)} km (${rrPct.toFixed(0)}%)`;
  if (cRb) cRb.textContent = `${rbKm.toFixed(2)} km (${rbPct.toFixed(0)}%)`;

  const kMantap = document.getElementById('card-k-mantap');
  const kTidakMantap = document.getElementById('card-k-tidak-mantap');
  if (kMantap) kMantap.textContent = `${mantapKm.toFixed(2)} km (${mantapPct.toFixed(1)}%)`;
  if (kTidakMantap) kTidakMantap.textContent = `${tidakMantapKm.toFixed(2)} km (${tidakMantapPct.toFixed(1)}%)`;

  // 10. Populate Card 4: Karakteristik Teknis
  const tLebar = document.getElementById('card-t-lebar');
  if (tLebar) {
    if (p.width_m !== null && p.width_m !== undefined && !isNaN(Number(p.width_m)) && Number(p.width_m) > 0) {
      tLebar.textContent = `${Number(p.width_m).toFixed(1)} m`;
    } else {
      tLebar.textContent = 'Data tidak tersedia';
    }
  }
  const tStatus = document.getElementById('card-t-status');
  if (tStatus) {
    tStatus.textContent = p.identity_status || 'Kabupaten';
  }
  const tAspalInit = document.getElementById('card-t-aspal');
  const tBetonInit = document.getElementById('card-t-beton');
  if (tAspalInit) tAspalInit.textContent = 'Memuat...';
  if (tBetonInit) tBetonInit.textContent = 'Memuat...';

  // 11. Populate Card 6: Informasi Prioritas
  const pScore = document.getElementById('card-p-score');
  const pSubTeknis = document.getElementById('card-p-sub-teknis');
  const pSubAkses = document.getElementById('card-p-sub-akses');
  const pSubPelayanan = document.getElementById('card-p-sub-pelayanan');
  const pSubSpasial = document.getElementById('card-p-sub-spasial');

  if (pScore) pScore.textContent = Number(activeScore).toFixed(6);
  if (pSubTeknis) pSubTeknis.textContent = (p.subtotal_teknis || 0).toFixed(4);
  if (pSubAkses) pSubAkses.textContent = (p.subtotal_akses || 0).toFixed(4);
  if (pSubPelayanan) pSubPelayanan.textContent = (p.subtotal_pelayanan || 0).toFixed(4);
  if (pSubSpasial) pSubSpasial.textContent = (p.subtotal_spasial || 0).toFixed(4);

  loadRoadNearestFacilities(roadKey);
  loadRoadNarrative(roadKey);
  // 14. Asynchronously fetch full spatial profile & technical details (Task 1: SPASIAL DAN AKSESIBILITAS WILAYAH)
  try {
    const [detailRes, spatialRes] = await Promise.all([
      fetch(`/api/roads/${roadKey}?mode=${state.mode}&model=${state.modelCode}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/spatial/roads/${roadKey}/spatial-profile`).then((r) => r.json()).catch(() => null),
    ]);

    if (request !== state.inspectorRequest) return;

    // Update technical characteristics from detail factors
    const tAspal = document.getElementById('card-t-aspal');
    const tBeton = document.getElementById('card-t-beton');
    if (detailRes?.success && detailRes.data) {
      const d = detailRes.data;
      const aspalFactor = d.factors?.find((f) => f.variable_code === 'norm_permukaan_aspal_penmac');
      const betonFactor = d.factors?.find((f) => f.variable_code === 'norm_permukaan_beton');

      if (tAspal) {
        const rawA = aspalFactor?.raw_value;
        if (rawA !== null && rawA !== undefined && !isNaN(Number(rawA))) {
          tAspal.textContent = `${(Number(rawA) * 100).toFixed(0)}%`;
        } else {
          tAspal.textContent = 'Data tidak tersedia';
        }
      }
      if (tBeton) {
        const rawB = betonFactor?.raw_value;
        if (rawB !== null && rawB !== undefined && !isNaN(Number(rawB))) {
          tBeton.textContent = `${(Number(rawB) * 100).toFixed(0)}%`;
        } else {
          tBeton.textContent = 'Data tidak tersedia';
        }
      }
    } else {
      if (tAspal) tAspal.textContent = 'Data tidak tersedia';
      if (tBeton) tBeton.textContent = 'Data tidak tersedia';
    }

    // Update Card 5: Spasial dan Aksesibilitas Wilayah
    if (spatialRes?.success && spatialRes.data) {
      const sp = spatialRes.data;
      const sJarak = document.getElementById('card-s-jarak-ibukota');
      const sDesa = document.getElementById('card-s-desa');
      const sKec = document.getElementById('card-s-kecamatan');
      const sPermukiman = document.getElementById('card-s-permukiman');
      const sProduksi = document.getElementById('card-s-produksi');
      const sLindung = document.getElementById('card-s-lindung');
      const sBadanAir = document.getElementById('card-s-badan-air');
      const sBreakdown = document.getElementById('card-s-rtrw-breakdown');

      if (sJarak) {
        if (
          sp.jarak_ibukota_kabupaten_m !== null &&
          sp.jarak_ibukota_kabupaten_m !== undefined &&
          !isNaN(Number(sp.jarak_ibukota_kabupaten_m))
        ) {
          sJarak.textContent = `${(Number(sp.jarak_ibukota_kabupaten_m) / 1000).toFixed(2)} km`;
        } else {
          sJarak.textContent = 'Data tidak tersedia';
        }
      }
      if (sDesa) sDesa.textContent = `${sp.desa_count} desa`;
      if (sKec) sKec.textContent = `${sp.kecamatan_count} kec`;
      if (sPermukiman) {
        sPermukiman.textContent = `${sp.permukiman_pct.toFixed(1)}% (${(sp.permukiman_length_m / 1000).toFixed(2)} km)`;
      }
      if (sProduksi) {
        sProduksi.textContent = `${sp.produksi_pct.toFixed(1)}% (${(sp.produksi_length_m / 1000).toFixed(2)} km)`;
      }
      if (sLindung) sLindung.textContent = `${sp.lindung_pct.toFixed(1)}%`;
      if (sBadanAir) sBadanAir.textContent = `${sp.badan_air_pct.toFixed(1)}%`;

      if (sBreakdown && Array.isArray(sp.rtrw_classes)) {
        sBreakdown.innerHTML = sp.rtrw_classes
          .map(
            (c) =>
              `<div class="flex justify-between gap-2 py-1.5"><span>${escapeHtml(
                c.name
              )}:</span><span class="shrink-0 font-semibold">${c.pct.toFixed(1)}% (${(c.length_m / 1000).toFixed(2)} km)</span></div>`
          )
          .join('') || 'Tidak ada irisan yang tercatat.';
      }

      idVillages.textContent = 'Nama desa tidak tersedia.';
      // Update villages in Card 1
      if (idVillages && sp.desa_names && sp.desa_names.length > 0) {
        idVillages.textContent = `Desa: ${sp.desa_names.join(', ')}`;
      }
    } else {
      idVillages.textContent = 'Data spasial tidak tersedia.';
    }
  } catch (err) {
    if (request === state.inspectorRequest) idVillages.textContent = 'Gagal memuat data spasial.';
    console.error('Error fetching spatial detail:', err);
  }
};

function fitInspectedRoad() {
  const bounds = state.mapLayers.selectionHalo?.getBounds();
  if (!bounds?.isValid()) return;
  state.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
}

window.exitInteractiveSpatialProfile = function () {
  state.inspectorRequest++;
  state.isInteractiveDetailMode = false;
  state.interactiveDetailRoadKey = null;
  clearRouteTrace({ skipZoomReset: true });
  document.getElementById('road-inspector').classList.add('hidden');
  document.getElementById('map-container').classList.remove('inspection-open');
  document.getElementById('gis-side-panel').classList.toggle('hidden', state.inspectorLayersWereHidden);
  document.getElementById('btn-toggle-layers').setAttribute('aria-expanded', String(!state.inspectorLayersWereHidden));
  clearRoadSelection();
  state.map?.invalidateSize({ pan: false });
};

function fitHssBounds() {
  if (state.mapLayers.countyRoads && state.mapLayers.countyRoads.getBounds().isValid()) {
    state.map.fitBounds(state.mapLayers.countyRoads.getBounds(), { padding: [20, 20] });
  } else {
    state.map.setView([-2.6885, 115.245], 11);
  }
}

function toggleLayerVisibility(layer, isVisible) {
  if (!layer || !state.map) return;
  if (isVisible) {
    if (!state.map.hasLayer(layer)) layer.addTo(state.map);
  } else {
    if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
  }
}

function handleMapZoomChange() {
  const isSchoolChecked = document.getElementById('layer-fac-school')?.checked;
  if (isSchoolChecked) {
    updateSchoolsVisibility(true);
  }
  updateDynamicLegend();
}

function updateSchoolsVisibility(isChecked) {
  if (!state.mapLayers.schools || !state.map) return;
  const zoom = state.map.getZoom();
  if (isChecked && zoom >= 12.5) {
    if (!state.map.hasLayer(state.mapLayers.schools)) {
      state.map.addLayer(state.mapLayers.schools);
    }
  } else {
    if (state.map.hasLayer(state.mapLayers.schools)) {
      state.map.removeLayer(state.mapLayers.schools);
    }
  }
}

function updateDynamicLegend() {
  const container = document.getElementById('map-legend-body');
  if (!container) return;

  let html = '';

  // 1. Primary Road Symbology: Prioritas Penanganan vs Kondisi Jalan DD1 — 2025
  if (state.roadThematicMode === 'KONDISI_DD1') {
    html += `
      <div>
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kondisi Jalan DD1 — 2025</div>
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
            <span class="font-semibold text-emerald-800">Baik (131,65 km · 17,97%)</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1.5 bg-amber-500 rounded-full inline-block"></span>
            <span class="text-slate-700">Sedang (261,24 km · 35,67%)</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1.5 bg-orange-500 rounded-full inline-block"></span>
            <span class="text-slate-700">Rusak Ringan (111,41 km · 15,21%)</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1.5 bg-rose-500 rounded-full inline-block"></span>
            <span class="font-semibold text-rose-700">Rusak Berat (228,16 km · 31,15%)</span>
          </div>
        </div>
        <div class="text-[10px] text-slate-400 mt-1 pl-1">
          * 7.487 segmen survei kondisi 100m
        </div>
      </div>
    `;
  } else {
    html += `
      <div>
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prioritas Penanganan</div>
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1.5 bg-rose-600 rounded-full inline-block"></span>
            <span class="font-semibold text-rose-800">Peringkat 1–35</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1 bg-orange-500 rounded-full inline-block"></span>
            <span class="text-slate-700">Rank 36–70 (Prioritas Tinggi)</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1 bg-amber-500 rounded-full inline-block"></span>
            <span class="text-slate-700">Rank 71–105 (Kebijakan)</span>
          </div>
          <div class="flex items-center space-x-2">
            <span class="w-5 h-1 bg-slate-600 inline-block"></span>
            <span class="text-slate-600">Ruas Kabupaten Lainnya / Di Luar Prioritas Utama</span>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Jaringan Referensi (Only if any checked)
  const showProv = document.getElementById('layer-roads-provincial')?.checked;
  const showNas = document.getElementById('layer-roads-national')?.checked;
  const showConn = document.getElementById('layer-connectors')?.checked;

  if (showProv || showNas || showConn) {
    html += `
      <div class="border-t border-slate-100 pt-1.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Jaringan Referensi</div>
        <div class="space-y-1">
          ${showNas ? `
            <div class="flex items-center space-x-2">
              <span class="w-5 h-1 bg-teal-700 inline-block"></span>
              <span class="text-slate-700">Jalan Nasional (8)</span>
            </div>` : ''}
          ${showProv ? `
            <div class="flex items-center space-x-2">
              <span class="w-5 h-1 bg-indigo-500 inline-block"></span>
              <span class="text-slate-700">Jalan Provinsi (4)</span>
            </div>` : ''}
          ${showConn ? `
            <div class="flex items-center space-x-2">
              <span class="w-5 h-0.5 border-t border-dashed border-slate-400 inline-block"></span>
              <span class="text-slate-600 font-mono text-[10px]">Konektor Analisis (Topologi)</span>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  // 3. Administrasi (Only if checked)
  const showKab = document.getElementById('layer-admin-kabupaten')?.checked;
  const showDist = document.getElementById('layer-admin-districts')?.checked;
  const showVil = document.getElementById('layer-admin-villages')?.checked;
  if (showKab || showDist || showVil) {
    html += `
      <div class="border-t border-slate-100 pt-1.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Batas Administrasi</div>
        <div class="space-y-1">
          ${showKab ? `
            <div class="flex items-center space-x-2">
              <span class="w-4 h-1 border-t-2 border-slate-900 inline-block"></span>
              <span class="text-slate-900 font-medium">Batas Kabupaten HSS</span>
            </div>` : ''}
          ${showDist ? `
            <div class="flex items-center space-x-2">
              <span class="w-4 h-2 border border-dashed border-slate-500 bg-sky-100/40 inline-block"></span>
              <span class="text-slate-700">Kecamatan (11)</span>
            </div>` : ''}
          ${showVil ? `
            <div class="flex items-center space-x-2">
              <span class="w-4 h-1 border-t border-dotted border-slate-400 inline-block"></span>
              <span class="text-slate-600">Desa/Kelurahan (148)</span>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  // 4. Fasilitas Publik (Only active ones)
  const showHosp = document.getElementById('layer-fac-hospital')?.checked;
  const showPusk = document.getElementById('layer-fac-puskesmas')?.checked;
  const showMkt = document.getElementById('layer-fac-market')?.checked;
  const showSch = document.getElementById('layer-fac-school')?.checked;

  if (showHosp || showPusk || showMkt || showSch) {
    const currentZoom = state.map?.getZoom() || 11;
    html += `
      <div class="border-t border-slate-100 pt-1.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fasilitas Publik</div>
        <div class="grid grid-cols-2 gap-1 text-[11px]">
          ${showHosp ? `
            <div class="flex items-center space-x-1.5">
              <span class="w-2.5 h-2.5 bg-rose-600 rounded-sm inline-block"></span>
              <span>RSUD</span>
            </div>` : ''}
          ${showPusk ? `
            <div class="flex items-center space-x-1.5">
              <span class="w-2.5 h-2.5 bg-emerald-600 rounded-full inline-block"></span>
              <span>Puskesmas</span>
            </div>` : ''}
          ${showMkt ? `
            <div class="flex items-center space-x-1.5">
              <span class="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block"></span>
              <span>Pasar</span>
            </div>` : ''}
          ${showSch ? `
            <div class="flex items-center space-x-1.5 col-span-2">
              <span class="w-2.5 h-2.5 bg-sky-600 rounded-full inline-block"></span>
              <span>Sekolah ${currentZoom < 12.5 ? '<em class="text-[10px] text-slate-400">(Zoom ≥ 12.5)</em>' : ''}</span>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  // 5. RTRW Pola Ruang (ONLY if checked and loaded!)
  const showRtrw = document.getElementById('layer-rtrw')?.checked;
  if (showRtrw && state.mapData.rtrw) {
    html += `
      <div class="border-t border-slate-100 pt-1.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pola Ruang RTRW</div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
          ${Object.entries(RTRW_COLORS).map(([name, col]) => {
            const label = RTRW_FAMILY_LABELS[name] || name.replace('Kawasan ', '');
            return `
            <div class="flex items-center space-x-1.5 truncate" title="${name}">
              <span class="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style="background-color: ${col}"></span>
              <span class="truncate text-slate-700">${label}</span>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function updateMapStatus() {
  const statMode = document.getElementById('map-stat-mode');
  if (statMode) {
    statMode.textContent = state.mode === 'BENCHMARK_2024' ? 'Audit peringkat 2024' : 'Operasional 2025';
    statMode.className = state.mode === 'BENCHMARK_2024' ? 'font-semibold text-amber-600' : 'font-semibold text-emerald-700';
  }
}

// --- VIEW 3: DATA & SUMBER (PROVENANCE) ---
async function loadProvenance() {
  try {
    const res = await fetch('/api/provenance');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.provenanceData = json.data;
    renderProvenance(json.data);
  } catch (err) {
    console.error('Error loading provenance:', err);
  }
}

function renderProvenance(data) {
  const tbody = document.getElementById('provenance-checklist-body');
  tbody.innerHTML = data.checklist
    .map(
      (item) => `
    <tr class="hover:bg-slate-50">
      <td class="py-2.5 px-3 font-semibold text-slate-900">${escapeHtml(item.label)}</td>
      <td class="py-2.5 px-3 text-center font-bold text-slate-900 font-mono">${item.current} ${item.unit}</td>
      <td class="py-2.5 px-3 text-center text-slate-600 font-mono">${item.expected} ${item.unit}</td>
      <td class="py-2.5 px-3 text-slate-500 font-mono text-[11px]">${escapeHtml(item.source)}</td>
      <td class="py-2.5 px-3 text-center">
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
          item.status === 'VERIFIED'
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-rose-100 text-rose-800'
        }">${item.status === 'VERIFIED' ? 'Jumlah cocok' : 'Perlu diperiksa'}</span>
      </td>
    </tr>
  `
    )
    .join('');
}

// --- VIEW 4: MODEL PRIORITAS ---
async function loadModel() {
  try {
    const res = await fetch('/api/model');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.modelData = json.data;
    renderModel(json.data);
  } catch (err) {
    console.error('Error loading model:', err);
  }
}

function renderModel(data) {
  // Categories Table
  const catTbody = document.getElementById('model-categories-body');
  const totalRaw = data.categories.reduce((s, c) => s + c.default_weight_raw, 0);

  catTbody.innerHTML = data.categories
    .map((c) => {
      const norm = c.default_weight_raw / totalRaw;
      const count = data.variables.filter((v) => v.category_code === c.category_code).length;
      return `
      <tr>
        <td class="py-2 px-3 font-mono font-bold text-slate-700">${c.category_code}</td>
        <td class="py-2 px-3 font-semibold text-slate-900">${c.category_name}</td>
        <td class="py-2 px-3 text-center font-bold text-sky-700">${count} variabel</td>
        <td class="py-2 px-3 text-right font-mono text-slate-600">${c.default_weight_raw.toFixed(6)}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-sky-800">${norm.toFixed(6)}</td>
        <td class="py-2 px-3 text-right font-bold text-slate-900">${(norm * 100).toFixed(2)}%</td>
      </tr>
    `;
    })
    .join('');

  // 17 Variables Table
  const varTbody = document.getElementById('model-variables-body');
  varTbody.innerHTML = data.variables
    .map((v, idx) => {
      const cat = data.categories.find((c) => c.category_code === v.category_code);
      const catCount = data.variables.filter((x) => x.category_code === v.category_code).length;
      const localWeight = 1.0 / catCount;
      const normCat = (cat?.default_weight_raw || 0) / totalRaw;
      const effWeight = normCat * localWeight;

      return `
      <tr>
        <td class="py-2 px-2.5 text-slate-400 font-mono">${idx + 1}</td>
        <td class="py-2 px-2.5">
          <div class="font-semibold text-slate-900">${escapeHtml(v.variable_label)}</div>
          <div class="text-[10px] text-slate-400 font-mono">${v.variable_code}</div>
        </td>
        <td class="py-2 px-2.5 text-xs text-slate-600">${cat?.category_name || v.category_code}</td>
        <td class="py-2 px-2.5 text-xs font-mono text-slate-500">${v.raw_unit || '-'}</td>
        <td class="py-2 px-2.5 text-center">
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${
            v.optimization_dir === 'BENEFIT'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-indigo-100 text-indigo-800'
          }">${v.optimization_dir}</span>
        </td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-700">${localWeight.toFixed(6)}</td>
        <td class="py-2 px-2.5 text-right font-mono font-bold text-sky-900">${effWeight.toFixed(6)}</td>
      </tr>
    `;
    })
    .join('');
}

// --- ROAD DETAIL & EXPLAINABILITY DRAWER ---
window.openRoadDetail = async function (roadKey, { showFactors = false } = {}) {
  if (!/^HSS-KAB-\d{3}$/.test(roadKey || '')) return;
  const drawer = document.getElementById('road-detail-drawer');
  const wasOpen = drawer && !drawer.classList.contains('hidden');
  if (!wasOpen) drawerReturnFocus = document.activeElement;
  const inspectorRequest = state.inspectorRequest;
  try {
    const res = await fetch(`/api/roads/${encodeURIComponent(roadKey)}?mode=${encodeURIComponent(state.mode)}&model=${encodeURIComponent(state.modelCode)}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    if (showFactors && inspectorRequest !== state.inspectorRequest) return;
    if (state.isInteractiveDetailMode && state.interactiveDetailRoadKey !== roadKey) exitInteractiveSpatialProfile();
    state.selectedRoadDetail = json.data;
    renderRoadDetailDrawer(json.data);

    if (state.currentView === 'peta') {
      drawer.classList.add('drawer-map-mode');
    } else {
      drawer.classList.remove('drawer-map-mode');
    }
    drawer.classList.remove('hidden');
    syncDrawerAccessibility(drawer);

    writeRouteContext({ road: roadKey });
    if (showFactors) {
      document.getElementById('road-detail-evidence').open = true;
      const factors = document.getElementById('drawer-factor-section');
      const body = document.getElementById('drawer-scroll-body');
      body.scrollTop += factors.getBoundingClientRect().top - body.getBoundingClientRect().top - 16;
      factors.focus({ preventScroll: true });
    } else if (!wasOpen) document.getElementById('btn-close-drawer')?.focus({ preventScroll: true });
  } catch (err) {
    console.error('Error opening road detail:', err);
  }
};

function closeDetailDrawer() {
  const drawer = document.getElementById('road-detail-drawer');
  drawer.classList.add('hidden');
  drawer.classList.remove('drawer-map-mode');
  drawer.setAttribute('aria-modal', 'true');
  state.selectedRoadDetail = null;
  clearDD1SegmentsLayer();
  writeRouteContext({ road: '' });
  if (drawerReturnFocus?.isConnected) drawerReturnFocus.focus({ preventScroll: true });
  drawerReturnFocus = null;
}

function renderRoadDetailDrawer(data) {
  const id = data.identity;
  const cond = data.condition2025;
  const res = data.priorityResult;

  // Header
  document.getElementById('drawer-road-key').textContent = id.road_key;
  document.getElementById('drawer-nomor-ruas').textContent = `No. Ruas: ${id.nomor_ruas}`;
  document.getElementById('drawer-title').textContent = id.display_name;
  document.getElementById('drawer-district').textContent = `Kecamatan ${id.district_name}`;
  document.getElementById('footer-road-key').textContent = id.road_key;

  // Section A: Identity
  document.getElementById('d-canonical-name').textContent = id.canonical_name;
  document.getElementById('d-village').textContent = id.village_coverage || '-';
  document.getElementById('d-length').textContent = `${id.length_km_official.toFixed(3)} km`;
  document.getElementById('d-width').textContent = `${id.width_m_official.toFixed(2)} meter`;

  // Section B: 2025 Condition
  document.getElementById('d-kondisi-baik').textContent = `${cond.baik_km.toFixed(3)} km (${cond.baik_pct.toFixed(1)}%)`;
  document.getElementById('d-kondisi-sedang').textContent = `${cond.sedang_km.toFixed(3)} km (${cond.sedang_pct.toFixed(1)}%)`;
  document.getElementById('d-kondisi-rr').textContent = `${cond.rusak_ringan_km.toFixed(3)} km (${cond.rusak_ringan_pct.toFixed(1)}%)`;
  document.getElementById('d-kondisi-rb').textContent = `${cond.rusak_berat_km.toFixed(3)} km (${cond.rusak_berat_pct.toFixed(1)}%)`;

  document.getElementById('d-mantap-summary').textContent = `${cond.mantap_km.toFixed(3)} km (${cond.mantap_pct.toFixed(1)}%)`;
  document.getElementById('d-tidak-mantap-summary').textContent = `${cond.tidak_mantap_km.toFixed(3)} km (${cond.tidak_mantap_pct.toFixed(1)}%)`;

  // Section C: Priority Result
  document.getElementById('d-final-score').textContent = formatId(res.final_score, 4);
  document.getElementById('d-priority-rank').innerHTML = `#${res.priority_rank} <span class="text-sm font-normal text-slate-500">/ 350</span>`;

  const badgeEl = document.getElementById('d-tier-badge');
  badgeEl.className = `px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${getTierBadgeClass(
    res.tier_category
  )}`;
  badgeEl.textContent = getTierDisplayName(res.tier_category);

  const addButton = document.getElementById('drawer-add-to-proposal-button');
  if (addButton) addButton.dataset.roadKey = id.road_key;
  const explanation = document.getElementById('drawer-explanation');
  if (explanation) {
    const drivers = [...data.factors].filter((factor) => Number.isFinite(factor.contribution)).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
    const conditionText = cond.mantap_pct >= 60
      ? `Kondisi fisik tergolong mantap (${formatId(cond.mantap_pct, 1)}%); komposisinya ${formatId(cond.baik_pct, 1)}% baik dan ${formatId(cond.sedang_pct, 1)}% sedang.`
      : `Kemantapan fisik tercatat ${formatId(cond.mantap_pct, 1)}%, dengan ${formatId(cond.rusak_ringan_pct + cond.rusak_berat_pct, 1)}% rusak ringan atau berat.`;
    explanation.innerHTML = `<p><strong>${conditionText}</strong> Hasil ${res.operating_mode === 'BENCHMARK_2024' ? 'audit 2024' : 'operasional 2025'} menempatkan ruas ini pada peringkat <strong>#${res.priority_rank}</strong> (${getTierDisplayName(res.tier_category)}). Peringkat mengurutkan skor gabungan dan tidak menyatakan tingkat kerusakan atau keputusan pekerjaan.</p>
      <p class="mt-1">Faktor dengan kontribusi terbesar pada skor ruas: ${drivers.map((factor) => `<strong>${escapeHtml(factor.variable_label)}</strong>`).join(', ') || 'rincian kontribusi tidak tersedia'}.</p>
      <p class="mt-1 text-[11px] text-slate-600">Kondisi fisik berasal dari ${escapeHtml(cond.source_filename || 'sumber kondisi tahun 2025')} (2025). Gunakan rincian perhitungan dan sumber untuk memeriksa bukti serta keterbatasannya.</p>`;
  }

  // Section A.2: Spatial Administrative Coverage (Phase 5.1)
  loadRoadCoverage(id.road_key);

  // Section C.2: Nearest Facilities & Accessibility Tracing (Phase 5.1)
  loadRoadNearestFacilities(id.road_key);
  clearRouteTrace();

  // Profil dan Karakteristik Ruas (Road Narrative Engine)
  loadRoadNarrative(id.road_key);

  // Section F: Demografi Rumah Tangga Dilayani (Phase 5.1A)
  loadRoadDemographics(id.road_key);

  // Section G: Data Kondisi Jalan per Segmen DD1 (Phase 5.1A)
  loadRoadDD1Segments(id.road_key);

  // Section D: 4 Category Contributions
  const catCards = document.getElementById('d-category-cards');
  catCards.innerHTML = data.categoryContributions
    .map(
      (c) => `
    <div class="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5 shadow-sm">
      <div class="flex justify-between text-xs">
        <span class="font-bold text-slate-800">${c.category_name}</span>
        <span class="font-bold text-sky-700 font-mono">${c.subtotal.toFixed(6)}</span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-1.5">
        <div class="bg-sky-600 h-1.5 rounded-full" style="width: ${Math.min(100, c.percentage_of_score)}%"></div>
      </div>
      <div class="flex justify-between text-[10px] text-slate-500">
        <span>Bobot Kebijakan: ${(c.normalized_weight * 100).toFixed(1)}%</span>
        <span>Porsi Skor: <strong>${c.percentage_of_score.toFixed(1)}%</strong></span>
      </div>
    </div>
  `
    )
    .join('');

  // Section E: 17 Factors Breakdown
  renderFactorsBreakdown(data);
  renderMathAudit(data);
}

async function loadRoadCoverage(roadKey) {
  const badge = document.getElementById('d-coverage-summary-badge');
  const vList = document.getElementById('d-villages-list');
  const dList = document.getElementById('d-districts-list');
  if (!vList || !dList) return;

  vList.innerHTML = '<span class="text-slate-400 italic text-[11px]">Memuat data desa...</span>';
  dList.innerHTML = '<span class="text-slate-400 italic text-[11px]">Memuat data kecamatan...</span>';

  try {
    const res = await fetch(`/api/spatial/roads/${roadKey}/coverage`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const cov = json.data;

    if (badge) {
      badge.textContent = `${cov.village_count} Desa · ${cov.district_count} Kec`;
    }

    if (cov.villages.length === 0) {
      vList.innerHTML = '<span class="text-slate-400 italic text-[11px]">Tidak ada data spasial desa</span>';
    } else {
      vList.innerHTML = cov.villages
        .map(
          (v) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
          v.is_boundary_ambiguous
            ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : 'bg-white text-slate-700 border border-slate-200'
        }">
          ${escapeHtml(v.village_name)}
          <span class="ml-1 text-[9px] font-mono ${v.is_boundary_ambiguous ? 'text-amber-600' : 'text-slate-400'}">
            (${v.intersection_length_m.toFixed(0)}m · ${v.share_of_road_pct.toFixed(0)}%)
          </span>
          ${v.is_boundary_ambiguous ? '<span class="ml-1 text-[9px]" title="Batas administratif ambigu (<15m)">⚠️</span>' : ''}
        </span>
      `
        )
        .join('');
    }

    if (cov.districts.length === 0) {
      dList.innerHTML = '<span class="text-slate-400 italic text-[11px]">Tidak ada data spasial kecamatan</span>';
    } else {
      dList.innerHTML = cov.districts
        .map(
          (d) => `
        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white text-sky-800 border border-sky-200">
          Kec. ${escapeHtml(d.district_name)}
          <span class="ml-1 text-[9px] font-mono text-sky-600">(${d.share_of_road_pct.toFixed(0)}%)</span>
        </span>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading road coverage:', err);
    if (vList) vList.innerHTML = '<span class="text-rose-500 text-[11px]">Gagal memuat desa</span>';
    if (dList) dList.innerHTML = '<span class="text-rose-500 text-[11px]">Gagal memuat kecamatan</span>';
  }
}

async function loadRoadNarrative(roadKey) {
  const inspectorSummary = document.getElementById('inspector-narrative-summary');
  const drawerSummary = document.getElementById('drawer-narrative-summary');
  const drawer8Dim = document.getElementById('drawer-narrative-8dim-content');

  if (inspectorSummary) {
    inspectorSummary.innerHTML = '<p class="text-slate-500 italic">Memuat profil dan narasi karakteristik ruas jalan…</p>';
  }
  if (drawerSummary) {
    drawerSummary.innerHTML = '<p class="text-slate-500 italic">Memuat profil dan narasi karakteristik ruas jalan…</p>';
  }

  try {
    const res = await fetch(`/api/roads/${encodeURIComponent(roadKey)}/narrative?mode=${encodeURIComponent(state.mode)}&model=${encodeURIComponent(state.modelCode)}`);
    const json = await res.json();
    if (!json.success || !json.data) throw new Error(json.error || 'Gagal memuat narasi');
    const data = json.data;

    // Render 1-3 paragraph summary
    const paragraphsHtml = (data.ringkasan_eksekutif || '')
      .split('\n\n')
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');

    if (inspectorSummary) inspectorSummary.innerHTML = paragraphsHtml;
    if (drawerSummary) drawerSummary.innerHTML = paragraphsHtml;

    // Populate Inspector 8 Dimension Templates
    const t1 = document.getElementById('narrative-t1-text');
    const t2 = document.getElementById('narrative-t2-text');
    const t3 = document.getElementById('narrative-t3-text');
    const t4 = document.getElementById('narrative-t4-text');
    const t5 = document.getElementById('narrative-t5-text');
    const t6 = document.getElementById('narrative-t6-text');
    const t7 = document.getElementById('narrative-t7-text');
    const t8 = document.getElementById('narrative-t8-text');

    if (t1) t1.textContent = data.template1_gambaran_umum?.text || '—';
    if (t2) t2.textContent = data.template2_cakupan_demografi?.text || '—';
    if (t3) t3.textContent = data.template3_tata_ruang_rtrw?.text || '—';
    if (t4) t4.textContent = data.template4_aksesibilitas_pelayanan?.text || '—';
    if (t5) t5.textContent = data.template5_kondisi_kemantapan?.text || '—';
    if (t6) t6.textContent = data.template6_karakteristik_teknis?.text || '—';
    if (t7) t7.textContent = data.template7_penilaian_prioritas?.text || '—';
    if (t8) t8.textContent = data.template8_kesimpulan_karakteristik?.text || '—';

    // Populate Drawer 8 Dimension Templates
    if (drawer8Dim) {
      const dimensions = [
        data.template1_gambaran_umum,
        data.template2_cakupan_demografi,
        data.template3_tata_ruang_rtrw,
        data.template4_aksesibilitas_pelayanan,
        data.template5_kondisi_kemantapan,
        data.template6_karakteristik_teknis,
        data.template7_penilaian_prioritas,
        data.template8_kesimpulan_karakteristik,
      ];
      drawer8Dim.innerHTML = dimensions
        .filter(Boolean)
        .map(
          (dim, idx) => `
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
            <h4 class="font-bold text-sky-900 text-xs">${idx + 1}. ${escapeHtml(dim?.title || '')}</h4>
            <p class="mt-1 text-slate-700 leading-relaxed text-xs">${escapeHtml(dim?.text || '')}</p>
          </div>
        `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading road narrative:', err);
    if (inspectorSummary) {
      inspectorSummary.innerHTML = '<p class="text-rose-600 text-xs">Gagal memuat profil narasi ruas jalan.</p>';
    }
    if (drawerSummary) {
      drawerSummary.innerHTML = '<p class="text-rose-600 text-xs">Gagal memuat profil narasi ruas jalan.</p>';
    }
  }
}

const FACILITY_CARD_CONFIG = [
  { type: 'puskesmas', label: 'Puskesmas', icon: '🩺' },
  { type: 'school', label: 'Sekolah', icon: '🏫' },
  { type: 'hospital', label: 'RSUD', icon: '🏥' },
  { type: 'market', label: 'Pasar', icon: '🛒' },
];

async function loadRoadNearestFacilities(roadKey) {
  if (state.currentRoadKey === roadKey && (state.nearestFacilitiesLoading || state.currentRoadNearestFacilities?.length)) return;
  const request = ++state.facilityRequest;
  state.currentRoadKey = roadKey;
  state.currentRoadNearestFacilities = [];
  state.nearestFacilitiesLoading = true;
  state.nearestFacilitiesError = null;

  // 1. Set explicit LOADING state: "Memuat data jarak..." on both Drawer & Card 5 Overlay
  for (const cfg of FACILITY_CARD_CONFIG) {
    const b = document.getElementById(`badge-dist-${cfg.type}`);
    const n = document.getElementById(`name-dist-${cfg.type}`);
    const s = document.getElementById(`status-dist-${cfg.type}`);
    if (b) {
      b.textContent = '...';
      b.className = 'text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded';
    }
    if (n) {
      n.textContent = 'Memuat data jarak...';
      n.className = 'text-[11px] text-slate-400 italic truncate mt-1';
    }
    if (s) {
      s.innerHTML = '<span>Memuat rute jaringan...</span>';
    }

    const button = document.getElementById(`btn-card-trace-${cfg.type}`);
    button.disabled = true;
    document.getElementById(`card-badge-dist-${cfg.type}`).textContent = '…';
    document.getElementById(`card-name-dist-${cfg.type}`).textContent = 'Memuat…';
  }

  try {
    const res = await fetch(`/api/spatial/roads/${encodeURIComponent(roadKey)}/nearest-facilities`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat');

    if (request !== state.facilityRequest) return;
    state.currentRoadNearestFacilities = json.data || [];
    state.nearestFacilitiesLoading = false;

    // 2. Populate facility cards with explicit states: AVAILABLE, UNRESOLVED_NETWORK, NO_FACILITY_DATA
    for (const cfg of FACILITY_CARD_CONFIG) {
      const b = document.getElementById(`badge-dist-${cfg.type}`);
      const n = document.getElementById(`name-dist-${cfg.type}`);
      const s = document.getElementById(`status-dist-${cfg.type}`);
      const fac = state.currentRoadNearestFacilities.find((f) => f.facility_type === cfg.type);

      const button = document.getElementById(`btn-card-trace-${cfg.type}`);
      button.disabled = false;
      const disconnected = fac && fac.network_distance_m < 0;
      document.getElementById(`card-badge-dist-${cfg.type}`).textContent = !fac || disconnected ? '—' : `${(fac.network_distance_m / 1000).toFixed(2)} km`;
      const name = document.getElementById(`card-name-dist-${cfg.type}`);
      name.textContent = !fac ? 'Data belum tersedia' : disconnected ? 'Jaringan terputus' : fac.nearest_facility_name;
      button.title = name.textContent;

      if (!fac) {
        // NO_FACILITY_DATA: "Data fasilitas belum tersedia"
        if (b) {
          b.textContent = 'Tidak ada';
          b.className = 'text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded';
        }
        if (n) {
          n.textContent = 'Data fasilitas belum tersedia';
          n.className = 'text-[11px] text-slate-500 truncate mt-1';
        }
        if (s) {
          s.innerHTML = '<span class="text-slate-400">Data fasilitas belum tersedia</span>';
        }
      } else if (fac.network_distance_m < 0) {
        // UNRESOLVED_NETWORK: "Rute jaringan tidak terhubung"
        if (b) {
          b.textContent = 'Terputus';
          b.className = 'text-[11px] font-mono font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded';
        }
        if (n) {
          n.textContent = 'Rute jaringan tidak terhubung';
          n.className = 'text-[11px] font-semibold text-amber-800 truncate mt-1';
        }
        if (s) {
          s.innerHTML = '<span class="text-amber-700 font-medium">Ruas berada pada komponen jaringan yang terpisah.</span>';
        }
      } else {
        // AVAILABLE: Show actual nearest facility name & network distance
        const distKm = (fac.network_distance_m / 1000).toFixed(1);
        if (b) {
          b.textContent = `${distKm} km`;
          b.className = 'text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded';
        }
        if (n) {
          n.textContent = fac.nearest_facility_name;
          n.className = 'text-[11px] font-semibold text-slate-800 truncate mt-1';
          n.title = fac.nearest_facility_name;
        }
        if (s) {
          const snapStr = fac.facility_snap_distance_m ? `Snap: ${fac.facility_snap_distance_m.toFixed(0)}m` : '';
          s.innerHTML = `<span class="text-slate-500">${snapStr}</span><span class="text-indigo-600 font-semibold group-hover:underline">Petakan ➔</span>`;
        }
      }
    }
  } catch (err) {
    if (request !== state.facilityRequest) return;
    state.nearestFacilitiesLoading = false;
    state.nearestFacilitiesError = err.message;
    console.error('Error loading nearest facilities:', err);

    // ERROR state: "Gagal memuat data aksesibilitas"
    for (const cfg of FACILITY_CARD_CONFIG) {
      const b = document.getElementById(`badge-dist-${cfg.type}`);
      const n = document.getElementById(`name-dist-${cfg.type}`);
      const s = document.getElementById(`status-dist-${cfg.type}`);
      if (b) {
        b.textContent = 'Error';
        b.className = 'text-[11px] font-mono font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded';
      }
      if (n) {
        n.textContent = 'Gagal memuat data aksesibilitas';
        n.className = 'text-[11px] text-rose-600 truncate mt-1';
      }
      if (s) {
        s.innerHTML = '<span class="text-rose-500 font-medium">Periksa koneksi server</span>';
      }

      document.getElementById(`btn-card-trace-${cfg.type}`).disabled = false;
      document.getElementById(`card-badge-dist-${cfg.type}`).textContent = '—';
      document.getElementById(`card-name-dist-${cfg.type}`).textContent = 'Gagal memuat';
    }
  }
}

function clearRouteTrace(options = {}) {
  if (state.mapLayers.routeTrace && state.map) {
    state.map.removeLayer(state.mapLayers.routeTrace);
    state.mapLayers.routeTrace = null;
  }
  state.isRouteTracingActive = false;
  state.activeTracedFacilityType = null;

  // Drawer elements
  const card = document.getElementById('route-trace-card');
  const btnClear = document.getElementById('btn-clear-route-trace');
  const unresMsg = document.getElementById('rtc-unresolved-msg');
  const grid = document.getElementById('rtc-details-grid');
  if (card) card.classList.add('hidden');
  if (btnClear) btnClear.classList.add('hidden');
  if (unresMsg) unresMsg.classList.add('hidden');
  if (grid) grid.classList.remove('hidden');

  // Interactive Overlay Route HUD
  const routeHud = document.getElementById('interactive-route-hud');
  if (routeHud) routeHud.classList.add('hidden');

  for (const cfg of FACILITY_CARD_CONFIG) {
    document.getElementById(`btn-card-trace-${cfg.type}`)?.setAttribute('aria-pressed', 'false');
  }

  if (!options.skipZoomReset && state.isInteractiveDetailMode) fitInspectedRoad();
}

function renderInspectorRoute(facilityType, facility) {
  if (!state.isInteractiveDetailMode) return;
  const connected = facility && facility.network_distance_m >= 0;
  state.activeTracedFacilityType = facilityType;
  document.getElementById(`btn-card-trace-${facilityType}`).setAttribute('aria-pressed', 'true');
  document.getElementById('route-hud-type-badge').textContent = connected ? 'Rute jaringan terpendek · Dijkstra' : '';
  document.getElementById('route-hud-facility-name').textContent = facility?.nearest_facility_name || '';
  document.getElementById('route-hud-network-dist').textContent = connected
    ? `${(facility.network_distance_m / 1000).toFixed(2)} km (${facility.network_distance_m.toFixed(0)} m)`
    : facility ? 'Rute jaringan tidak terhubung' : state.nearestFacilitiesError ? 'Gagal memuat data rute' : 'Data fasilitas belum tersedia';
  document.getElementById('route-hud-comparison').classList.toggle('hidden', !connected);
  if (connected) {
    document.getElementById('route-hud-straight-dist').textContent = facility.straight_line_distance_m == null ? '—' : `${(facility.straight_line_distance_m / 1000).toFixed(2)} km`;
    document.getElementById('route-hud-snap-dist').textContent = `${facility.facility_snap_distance_m.toFixed(1)} m`;
  }
  document.getElementById('interactive-route-hud').classList.remove('hidden');
}

function traceNearestFacilityRoute(facilityType) {
  clearRouteTrace({ skipZoomReset: true });

  const card = document.getElementById('route-trace-card');
  const btnClear = document.getElementById('btn-clear-route-trace');
  const unresMsg = document.getElementById('rtc-unresolved-msg');
  const grid = document.getElementById('rtc-details-grid');
  const nameEl = document.getElementById('rtc-facility-name');
  const distEl = document.getElementById('rtc-network-dist');

  const facRecord = (state.currentRoadNearestFacilities || []).find((f) => f.facility_type === facilityType);
  if (!state.nearestFacilitiesLoading) renderInspectorRoute(facilityType, facRecord);

  // Guard: Loading state
  if (state.nearestFacilitiesLoading) {
    if (card && nameEl && distEl) {
      nameEl.textContent = 'Memuat data jarak...';
      distEl.textContent = '...';
      distEl.className = 'font-mono text-slate-500';
      if (grid) grid.classList.add('hidden');
      if (unresMsg) {
        unresMsg.textContent = 'Sedang memuat data jarak rute jaringan. Mohon tunggu sejenak.';
        unresMsg.className = 'text-[11px] text-indigo-800 bg-indigo-50 p-2.5 rounded border border-indigo-200 leading-relaxed';
        unresMsg.classList.remove('hidden');
      }
      card.classList.remove('hidden');
    }
    return;
  }

  // Guard: Error state
  if (state.nearestFacilitiesError) {
    if (card && nameEl && distEl) {
      nameEl.textContent = 'Gagal memuat data aksesibilitas';
      distEl.textContent = 'Error';
      distEl.className = 'font-mono text-rose-700 font-bold';
      if (grid) grid.classList.add('hidden');
      if (unresMsg) {
        unresMsg.textContent = 'Gagal memuat data aksesibilitas. Silakan periksa koneksi server.';
        unresMsg.className = 'text-[11px] text-rose-800 bg-rose-50 p-2.5 rounded border border-rose-200 leading-relaxed';
        unresMsg.classList.remove('hidden');
      }
      card.classList.remove('hidden');
    }
    return;
  }

  // Guard: No data for this category
  if (!facRecord) {
    if (card && nameEl && distEl) {
      nameEl.textContent = 'Data fasilitas belum tersedia';
      distEl.textContent = '-';
      distEl.className = 'font-mono text-slate-500';
      if (grid) grid.classList.add('hidden');
      if (unresMsg) {
        unresMsg.textContent = 'Data fasilitas belum tersedia untuk kategori ini.';
        unresMsg.className = 'text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed';
        unresMsg.classList.remove('hidden');
      }
      card.classList.remove('hidden');
    }
    return;
  }

  // Guard: Disconnected network (UNRESOLVED_NETWORK)
  if (facRecord.network_distance_m < 0) {
    if (card && nameEl && distEl) {
      nameEl.textContent = facRecord.nearest_facility_name || 'Fasilitas Tidak Terjangkau';
      distEl.textContent = 'Rute jaringan tidak terhubung';
      distEl.className = 'font-mono text-amber-700 font-bold';
      if (grid) grid.classList.add('hidden');
      if (unresMsg) {
        unresMsg.textContent = 'Rute jaringan tidak terhubung. Ruas berada pada komponen jaringan yang terpisah dari lokasi fasilitas ini.';
        unresMsg.className = 'text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 leading-relaxed';
        unresMsg.classList.remove('hidden');
      }
      card.classList.remove('hidden');
      if (btnClear) btnClear.classList.remove('hidden');
    }
    return;
  }

  // AVAILABLE: Render route tracing on map
  state.isRouteTracingActive = true;
  state.activeTracedFacilityType = facilityType;

  // Ensure routeTracingPane exists
  if (state.map && !state.map.getPane('routeTracingPane')) {
    state.map.createPane('routeTracingPane');
    state.map.getPane('routeTracingPane').style.zIndex = 550;
  }

  const routeGeo = JSON.parse(facRecord.route_geometry_geojson);
  const accessPt = JSON.parse(facRecord.road_access_point_geojson);
  const snapPt = JSON.parse(facRecord.facility_snap_point_geojson);

  const routeGroup = L.layerGroup();

  // 1a. Route line casing/glow for high contrast
  const routeGlow = L.geoJSON(routeGeo, {
    pane: 'routeTracingPane',
    style: {
      color: '#4338ca',
      weight: 8,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    },
  });
  routeGroup.addLayer(routeGlow);

  // 1b. Route line (violet #8b5cf6, weight 4.5, dashArray 6,6)
  const routeLine = L.geoJSON(routeGeo, {
    pane: 'routeTracingPane',
    style: ROUTE_TRACING_STYLE,
  });
  routeGroup.addLayer(routeLine);

  // 2. Road access point (cyan #06b6d4)
  const accessMarker = L.circleMarker([accessPt.coordinates[1], accessPt.coordinates[0]], {
    pane: 'selectionHaloPane',
    ...ROUTE_ACCESS_POINT_STYLE,
  }).bindPopup(`
    <div class="p-1 text-xs">
      <strong>Titik Akses Jalan Optimal</strong><br>
      Ruas: ${escapeHtml(facRecord.road_key)}
    </div>
  `);
  routeGroup.addLayer(accessMarker);

  // 3. Destination facility marker (violet #8b5cf6)
  const facIcon = createFacilityIcon(facilityType);
  const facMarker = L.marker([snapPt.coordinates[1], snapPt.coordinates[0]], {
    pane: 'facilitiesPane',
    icon: facIcon,
  }).bindPopup(`
    <div class="p-1.5 text-xs">
      <div class="font-bold text-slate-900">${escapeHtml(facRecord.nearest_facility_name)}</div>
      <div class="text-[11px] text-indigo-700 font-semibold mt-0.5">Jarak Jaringan: ${(facRecord.network_distance_m / 1000).toFixed(2)} km</div>
      <div class="text-[10px] text-slate-500">Snap ke Jaringan: ${facRecord.facility_snap_distance_m.toFixed(1)} m</div>
      <div class="text-[9px] font-mono text-slate-400 mt-1">Metode: ${facRecord.derivation_method}</div>
    </div>
  `);
  routeGroup.addLayer(facMarker);

  if (state.map) {
    routeGroup.addTo(state.map);
    state.mapLayers.routeTrace = routeGroup;

    // Fit bounds to route with generous padding
    const bounds = routeLine.getBounds();
    if (bounds.isValid()) {
      state.map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 16,
      });
    }
  }

  // Update Drawer Route Trace Card
  if (card) {
    nameEl.textContent = facRecord.nearest_facility_name;
    distEl.textContent = `${(facRecord.network_distance_m / 1000).toFixed(2)} km (${facRecord.network_distance_m.toFixed(0)} m)`;
    distEl.className = 'font-mono text-indigo-700 font-bold';
    document.getElementById('rtc-straight-dist').textContent = facRecord.straight_line_distance_m !== null
      ? `${(facRecord.straight_line_distance_m / 1000).toFixed(2)} km`
      : '-';
    document.getElementById('rtc-snap-dist').textContent = `${facRecord.facility_snap_distance_m.toFixed(1)} m`;
    if (grid) grid.classList.remove('hidden');
    if (unresMsg) unresMsg.classList.add('hidden');
    card.classList.remove('hidden');
  }
  if (btnClear) {
    btnClear.classList.remove('hidden');
  }

}

// ====================================================================
// SECTION F: DEMOGRAFI RUMAH TANGGA DILAYANI (PHASE 5.1A)
// ====================================================================
async function loadRoadDemographics(roadKey) {
  const badge = document.getElementById('d-households-summary-badge');
  const totalEl = document.getElementById('d-households-total');
  const maleEl = document.getElementById('d-households-male');
  const femaleEl = document.getElementById('d-households-female');
  const listEl = document.getElementById('d-households-villages-list');
  if (!totalEl || !listEl) return;

  if (badge) badge.textContent = 'Memuat...';
  totalEl.textContent = '...';
  if (maleEl) maleEl.textContent = '...';
  if (femaleEl) femaleEl.textContent = '...';
  listEl.innerHTML = '<span class="text-slate-400 italic text-[11px]">Memuat data rumah tangga...</span>';

  try {
    const res = await fetch(`/api/roads/${encodeURIComponent(roadKey)}/demographics`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const demo = json.data;
    state.currentRoadDemographics = demo;

    if (badge) {
      badge.textContent = `${demo.total_households.toLocaleString('id-ID')} Rumah Tangga`;
    }
    totalEl.textContent = `${demo.total_households.toLocaleString('id-ID')}`;
    if (maleEl) maleEl.textContent = `${demo.total_households_male.toLocaleString('id-ID')}`;
    if (femaleEl) femaleEl.textContent = `${demo.total_households_female.toLocaleString('id-ID')}`;

    if (!demo.villages || demo.villages.length === 0) {
      listEl.innerHTML = '<span class="text-slate-400 italic text-[11px]">Tidak ada data desa terlintasi</span>';
    } else {
      listEl.innerHTML = demo.villages
        .map(
          (v) => `
        <div class="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs">
          <div>
            <div class="font-semibold text-slate-800">${escapeHtml(v.village_name)}</div>
            <div class="text-[10px] text-slate-400">Kec. ${escapeHtml(v.district_name)} · Lintasan ${v.intersection_length_m.toFixed(0)}m (${v.share_of_road_pct.toFixed(0)}%)</div>
          </div>
          <div class="text-right font-mono">
            <div class="font-bold text-emerald-800">${v.households_total.toLocaleString('id-ID')} RT</div>
            <div class="text-[9px] text-slate-400">LK: ${v.households_male.toLocaleString('id-ID')} · PR: ${v.households_female.toLocaleString('id-ID')}</div>
          </div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading road demographics:', err);
    if (badge) badge.textContent = 'Gagal';
    if (totalEl) totalEl.textContent = '-';
    if (listEl) listEl.innerHTML = '<span class="text-rose-500 text-[11px]">Gagal memuat data demografi rumah tangga</span>';
  }
}

// ====================================================================
// SECTION G: DATA KONDISI JALAN PER SEGMEN DD1 (PHASE 5.1A)
// ====================================================================
async function loadRoadDD1Segments(roadKey) {
  const badge = document.getElementById('d-segments-summary-badge');
  const totalLenEl = document.getElementById('d-segments-total-len');
  const countLabel = document.getElementById('d-segments-count-label');
  const listEl = document.getElementById('d-segments-list');
  const progressBar = document.getElementById('d-segments-progress-bar');
  const btnToggle = document.getElementById('btn-toggle-dd1-segments');
  const btnLabel = document.getElementById('btn-toggle-dd1-label');

  if (!listEl) return;

  clearDD1SegmentsLayer();
  state.currentRoadDD1Segments = null;
  state.showDd1Segments = false;
  if (btnLabel) btnLabel.textContent = 'Tampilkan di Peta';
  if (btnToggle) {
    btnToggle.className = 'px-3 py-1.5 rounded text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors flex items-center space-x-1';
  }

  if (badge) badge.textContent = 'Memuat...';
  listEl.innerHTML = '<span class="text-slate-400 italic text-[11px]">Memuat data segmen DD1...</span>';

  try {
    const res = await fetch(`/api/roads/${encodeURIComponent(roadKey)}/segments`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    const segData = json.data;
    state.currentRoadDD1Segments = segData;

    if (badge) {
      badge.textContent = `${segData.total_segments} Segmen · ${segData.total_length_m.toLocaleString('id-ID')} m`;
    }
    if (totalLenEl) {
      totalLenEl.textContent = `${segData.total_length_m.toLocaleString('id-ID')} m (${segData.summary.mantap_pct}% Mantap)`;
    }
    if (countLabel) {
      countLabel.textContent = `${segData.total_segments} Segmen ${segData.has_short_final_segment ? '(Segmen akhir ' + segData.last_segment_length_m + 'm)' : '(Standard 100m)'}`;
    }

    // Stats chips
    const statBaik = document.getElementById('d-seg-stat-baik');
    const statSedang = document.getElementById('d-seg-stat-sedang');
    const statRR = document.getElementById('d-seg-stat-rr');
    const statRB = document.getElementById('d-seg-stat-rb');
    if (statBaik) statBaik.textContent = `${segData.summary.baik_m} m (${segData.summary.baik_pct}%)`;
    if (statSedang) statSedang.textContent = `${segData.summary.sedang_m} m (${segData.summary.sedang_pct}%)`;
    if (statRR) statRR.textContent = `${segData.summary.rusak_ringan_m} m (${segData.summary.rusak_ringan_pct}%)`;
    if (statRB) statRB.textContent = `${segData.summary.rusak_berat_m} m (${segData.summary.rusak_berat_pct}%)`;

    // Progress bar
    if (progressBar) {
      progressBar.innerHTML = `
        <div style="width: ${segData.summary.baik_pct}%" class="bg-emerald-500 h-full" title="Baik: ${segData.summary.baik_pct}%"></div>
        <div style="width: ${segData.summary.sedang_pct}%" class="bg-amber-400 h-full" title="Sedang: ${segData.summary.sedang_pct}%"></div>
        <div style="width: ${segData.summary.rusak_ringan_pct}%" class="bg-orange-500 h-full" title="Rusak Ringan: ${segData.summary.rusak_ringan_pct}%"></div>
        <div style="width: ${segData.summary.rusak_berat_pct}%" class="bg-rose-500 h-full" title="Rusak Berat: ${segData.summary.rusak_berat_pct}%"></div>
      `;
    }

    if (!segData.segments || segData.segments.length === 0) {
      listEl.innerHTML = '<span class="text-slate-400 italic text-[11px]">Tidak ada data segmen DD1</span>';
    } else {
      listEl.innerHTML = segData.segments
        .map((s) => {
          const isShort = s.segment_length_m < 100;
          const condStyle = DD1_SEGMENT_STYLES[s.dominant_condition] || DD1_SEGMENT_STYLES.sedang;
          const statusBg = s.segment_status === 'mantap' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
          return `
            <div id="seg-card-${s.segment_id}" class="p-2 rounded bg-white border border-slate-200 text-xs hover:border-sky-400 cursor-pointer transition-colors space-y-1" onclick="focusDD1Segment('${s.segment_id}')">
              <div class="flex items-center justify-between">
                <span class="font-bold font-mono text-slate-800">${escapeHtml(s.sta_display)}</span>
                <div class="flex items-center space-x-1">
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${isShort ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-600'}">
                    ${s.segment_length_m} m ${isShort ? '⚡' : ''}
                  </span>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold ${statusBg}">
                    ${s.status_label}
                  </span>
                </div>
              </div>
              <div class="flex items-center justify-between text-[11px]">
                <div class="flex items-center space-x-1">
                  <span class="w-2 h-2 rounded-full inline-block" style="background-color: ${condStyle.color}"></span>
                  <span class="font-semibold text-slate-700">${s.condition_label}</span>
                </div>
                <span class="text-[10px] text-slate-500 font-medium">${escapeHtml(s.treatment_label)}</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center justify-between">
                <span>${escapeHtml(s.surface_type)} · ${s.road_width_m}m</span>
                <span class="text-sky-600 hover:underline">Sorot di peta ➔</span>
              </div>
            </div>
          `;
        })
        .join('');
    }
  } catch (err) {
    console.error('Error loading DD1 segments:', err);
    if (badge) badge.textContent = 'Gagal';
    if (listEl) listEl.innerHTML = '<span class="text-rose-500 text-[11px]">Gagal memuat segmen kondisi DD1</span>';
  }
}

function clearDD1SegmentsLayer() {
  if (state.mapLayers.dd1Segments && state.map) {
    state.map.removeLayer(state.mapLayers.dd1Segments);
    state.mapLayers.dd1Segments = null;
  }
  state.showDd1Segments = false;
  const btnLabel = document.getElementById('btn-toggle-dd1-label');
  const btnToggle = document.getElementById('btn-toggle-dd1-segments');
  if (btnLabel) btnLabel.textContent = 'Tampilkan di Peta';
  if (btnToggle) {
    btnToggle.className = 'px-3 py-1.5 rounded text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white transition-colors flex items-center space-x-1';
  }
}

function toggleDD1SegmentsOnMap() {
  if (state.showDd1Segments) {
    clearDD1SegmentsLayer();
  } else {
    if (!state.currentRoadDD1Segments || !state.selectedRoadKey) return;
    renderDD1SegmentsOnMap(state.currentRoadDD1Segments, state.selectedRoadKey);
  }
}

function renderDD1SegmentsOnMap(segData, roadKey) {
  if (!state.map || !state.mapData.countyRoads) return;
  const roadFeature = state.mapData.countyRoads.features.find((f) => f.properties.road_key === roadKey);
  if (!roadFeature || !roadFeature.geometry) return;

  clearDD1SegmentsLayer();

  const geom = roadFeature.geometry;
  const rawCoords = geom.type === 'LineString' ? geom.coordinates : (geom.coordinates[0] || []);
  if (rawCoords.length < 2) return;

  function haversineM(c1, c2) {
    const R = 6371000;
    const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
    const dLon = ((c2[0] - c1[0]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((c1[1] * Math.PI) / 180) * Math.cos((c2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const cumDist = [0];
  for (let i = 1; i < rawCoords.length; i++) {
    cumDist[i] = cumDist[i - 1] + haversineM(rawCoords[i - 1], rawCoords[i]);
  }
  const totalGeoLength = cumDist[cumDist.length - 1];
  if (totalGeoLength <= 0) return;

  const roadTotalM = segData.total_length_m > 0 ? segData.total_length_m : totalGeoLength;

  function interpolatePoint(dist) {
    if (dist <= 0) return [rawCoords[0][1], rawCoords[0][0]];
    if (dist >= totalGeoLength) return [rawCoords[rawCoords.length - 1][1], rawCoords[rawCoords.length - 1][0]];
    let idx = 1;
    while (idx < cumDist.length && cumDist[idx] < dist) idx++;
    const segLen = cumDist[idx] - cumDist[idx - 1];
    const segFrac = segLen > 0 ? (dist - cumDist[idx - 1]) / segLen : 0;
    const p0 = rawCoords[idx - 1];
    const p1 = rawCoords[idx];
    const lng = p0[0] + (p1[0] - p0[0]) * segFrac;
    const lat = p0[1] + (p1[1] - p0[1]) * segFrac;
    return [lat, lng];
  }

  function sliceLineToLatLngs(staStartM, staEndM) {
    const startRatio = staStartM / roadTotalM;
    const endRatio = staEndM / roadTotalM;
    const targetStart = startRatio * totalGeoLength;
    const targetEnd = endRatio * totalGeoLength;

    const latLngs = [interpolatePoint(targetStart)];
    for (let i = 0; i < rawCoords.length; i++) {
      if (cumDist[i] > targetStart && cumDist[i] < targetEnd) {
        latLngs.push([rawCoords[i][1], rawCoords[i][0]]);
      }
    }
    latLngs.push(interpolatePoint(targetEnd));
    return latLngs;
  }

  const segmentGroup = L.featureGroup();
  state.segmentPolylineMap = new Map();

  for (const seg of segData.segments) {
    const latLngs = sliceLineToLatLngs(seg.sta_start_m, seg.sta_end_m);
    if (latLngs.length < 2) continue;

    const condStyle = DD1_SEGMENT_STYLES[seg.dominant_condition] || DD1_SEGMENT_STYLES.sedang;
    const polyline = L.polyline(latLngs, {
      color: condStyle.color,
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });

    const tooltipContent = `
      <div class="p-1.5 text-xs space-y-1">
        <div class="font-bold text-slate-900">${escapeHtml(seg.sta_display)} (${seg.segment_length_m} m)</div>
        <div class="text-[11px] text-slate-700 font-semibold">${escapeHtml(roadFeature.properties.display_name)}</div>
        <div class="text-[10px]">
          Kondisi: <strong style="color: ${condStyle.color}">${seg.condition_label}</strong> (${seg.status_label})
        </div>
        <div class="text-[10px] text-slate-600">Penanganan: <strong>${escapeHtml(seg.treatment_label)}</strong></div>
        <div class="text-[9px] text-slate-400">Permukaan: ${seg.surface_type} | Lebar: ${seg.road_width_m} m</div>
      </div>
    `;

    polyline.bindTooltip(tooltipContent, {
      sticky: true,
      className: 'shadow-md rounded-lg border border-slate-200',
    });

    polyline.on('mouseover', () => {
      polyline.setStyle({ weight: 9 });
      const card = document.getElementById(`seg-card-${seg.segment_id}`);
      if (card) card.classList.add('ring-2', 'ring-sky-400', 'bg-sky-50');
    });

    polyline.on('mouseout', () => {
      polyline.setStyle({ weight: 6 });
      const card = document.getElementById(`seg-card-${seg.segment_id}`);
      if (card) card.classList.remove('ring-2', 'ring-sky-400', 'bg-sky-50');
    });

    polyline.on('click', (e) => {
      if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
      focusDD1Segment(seg.segment_id);
    });

    segmentGroup.addLayer(polyline);
    state.segmentPolylineMap.set(seg.segment_id, polyline);
  }

  segmentGroup.addTo(state.map);
  state.mapLayers.dd1Segments = segmentGroup;
  state.showDd1Segments = true;

  const btnLabel = document.getElementById('btn-toggle-dd1-label');
  const btnToggle = document.getElementById('btn-toggle-dd1-segments');
  if (btnLabel) btnLabel.textContent = 'Sembunyikan Segmen';
  if (btnToggle) {
    btnToggle.className = 'px-3 py-1.5 rounded text-xs font-semibold bg-slate-700 hover:bg-slate-800 text-white transition-colors flex items-center space-x-1';
  }
}

window.focusDD1Segment = function(segmentId) {
  const card = document.getElementById(`seg-card-${segmentId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card.classList.add('ring-2', 'ring-sky-500', 'bg-sky-50');
    setTimeout(() => card.classList.remove('ring-2', 'ring-sky-500', 'bg-sky-50'), 1500);
  }

  if (!state.showDd1Segments) {
    toggleDD1SegmentsOnMap();
  }

  if (state.segmentPolylineMap && state.segmentPolylineMap.has(segmentId)) {
    const polyline = state.segmentPolylineMap.get(segmentId);
    polyline.setStyle({ weight: 10 });
    polyline.openTooltip();
    setTimeout(() => polyline.setStyle({ weight: 6 }), 2000);
  }
};

function renderFactorsBreakdown(data) {
  const tbody = document.getElementById('d-factors-body');
  const isPrecise = state.precisionMode;

  tbody.innerHTML = data.factors
    .map((f) => {
      const rawFormatted =
        f.raw_value !== null && f.raw_value !== undefined
          ? `${f.raw_value.toLocaleString('id-ID')} ${f.raw_unit}`
          : '-';

      const normFormatted = isPrecise ? f.normalized_value.toFixed(8) : f.normalized_value.toFixed(4);
      const effFormatted = isPrecise ? f.effective_weight.toFixed(8) : f.effective_weight.toFixed(4);
      const contribFormatted = isPrecise ? f.contribution.toFixed(8) : f.contribution.toFixed(4);

      return `
      <tr class="hover:bg-slate-50">
        <td class="py-2 px-2.5">
          <div class="font-semibold text-slate-800">${escapeHtml(f.variable_label)}</div>
          <div class="text-[9px] text-slate-400 font-mono">${f.category_name}</div>
        </td>
        <td class="py-2 px-2.5 font-mono text-slate-600">${rawFormatted}</td>
        <td class="py-2 px-2 text-center font-bold text-[10px] ${
          f.optimization_dir === 'BENEFIT' ? 'text-emerald-700' : 'text-indigo-700'
        }">${f.optimization_dir}</td>
        <td class="py-2 px-2 text-right font-mono text-slate-700">${normFormatted}</td>
        <td class="py-2 px-2 text-right font-mono text-slate-600">${effFormatted}</td>
        <td class="py-2 px-2.5 text-right font-mono font-bold text-sky-900">${contribFormatted}</td>
      </tr>
    `;
    })
    .join('');
}

function renderMathAudit(data) {
  const audit = data.mathematicalAudit;
  const isPrecise = state.precisionMode;

  const box = document.getElementById('d-math-audit-box');
  const digits = isPrecise ? 10 : 4;
  box.innerHTML = `
    <div class="flex items-center justify-between font-bold">
      <span>Pemeriksaan aritmetika skor</span>
      <span class="${audit.is_exact ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'} px-2 py-0.5 rounded text-[10px]">${audit.is_exact ? 'Konsisten dalam toleransi' : 'Perbedaan terdeteksi'}</span>
    </div>
    <div class="text-[11px] text-slate-700 mt-1 space-y-0.5">
      <div>Subtotal 4 kategori: <strong>${formatId(audit.sum_subtotals, digits)}</strong> · selisih dari skor: ${formatId(audit.delta_subtotals, digits)}</div>
      <div>Kontribusi 17 faktor: <strong>${formatId(audit.sum_contributions, digits)}</strong> · selisih dari skor: ${formatId(audit.delta_contributions, digits)}</div>
      <div>Skor komposit: <strong>${formatId(audit.final_score, digits)}</strong></div>
      <div class="text-[10px] text-slate-500">Pemeriksaan ini mencocokkan aritmetika, bukan keakuratan observasi atau persetujuan kebijakan.</div>
    </div>
  `;
}

// --- TIER BADGE HELPERS (STRICT SEMANTIC RULES) ---
function renderTierBadge(tier) {
  const cls = getTierBadgeClass(tier);
  const name = getTierDisplayName(tier);
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${cls}">${name}</span>`;
}

function getTierBadgeClass(tier) {
  switch (tier) {
    case 'TOP_35':
      return 'bg-rose-100 text-rose-800 border border-rose-200';
    case 'TOP_70':
      return 'bg-orange-100 text-orange-800 border border-orange-200';
    case 'TOP_105':
      return 'bg-amber-100 text-amber-800 border border-amber-200';
    case 'REGULAR':
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function getTierDisplayName(tier) {
  // STRICT RULE: Never label as 'Pemeliharaan Rutin' or 'Regular Maintenance'
  switch (tier) {
    case 'TOP_35':
      return 'Peringkat 1–35';
    case 'TOP_70':
      return 'Peringkat 36–70';
    case 'TOP_105':
      return 'Peringkat 71–105';
    case 'REGULAR':
    default:
      return 'Peringkat 106–350';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// PHASE 5: SIMULASI SKENARIO BOBOT KEBIJAKAN (IN-MEMORY STATELESS WORKSPACE)
// ============================================================================

const SIM_BASELINE_CATEGORIES = [
  { category_code: 'TEKNIS_JALAN', category_name: 'Data Teknis Jalan', raw_weight: 0.378965 },
  { category_code: 'AKSESIBILITAS', category_name: 'Data Aksesibilitas', raw_weight: 0.283815 },
  { category_code: 'PELAYANAN_MASYARAKAT', category_name: 'Data Pelayanan Masyarakat', raw_weight: 0.192412 },
  { category_code: 'SPASIAL_DEMOGRAFI', category_name: 'Spasial dan Aksesibilitas Wilayah', raw_weight: 0.144807 },
];

const SIM_BASELINE_VARIABLES = [
  // 1. TEKNIS_JALAN (7 variables -> 1/7 each)
  { variable_code: 'norm_panjang_ruas', category_code: 'TEKNIS_JALAN', variable_label: 'Panjang Ruas', local_weight: 1 / 7 },
  { variable_code: 'norm_lebar_ruas', category_code: 'TEKNIS_JALAN', variable_label: 'Lebar Ruas', local_weight: 1 / 7 },
  { variable_code: 'norm_kondisi_sedang', category_code: 'TEKNIS_JALAN', variable_label: 'Kondisi Sedang', local_weight: 1 / 7 },
  { variable_code: 'norm_rusak_ringan', category_code: 'TEKNIS_JALAN', variable_label: 'Rusak Ringan', local_weight: 1 / 7 },
  { variable_code: 'norm_rusak_berat', category_code: 'TEKNIS_JALAN', variable_label: 'Rusak Berat', local_weight: 1 / 7 },
  { variable_code: 'norm_permukaan_aspal_penmac', category_code: 'TEKNIS_JALAN', variable_label: 'Permukaan Aspal/Penmac', local_weight: 1 / 7 },
  { variable_code: 'norm_permukaan_beton', category_code: 'TEKNIS_JALAN', variable_label: 'Permukaan Beton', local_weight: 1 / 7 },

  // 2. AKSESIBILITAS (3 variables -> 1/3 each)
  { variable_code: 'norm_koneksi_jalan_provinsi', category_code: 'AKSESIBILITAS', variable_label: 'Koneksi Jalan Provinsi', local_weight: 1 / 3 },
  { variable_code: 'norm_koneksi_jalan_nasional', category_code: 'AKSESIBILITAS', variable_label: 'Koneksi Jalan Nasional', local_weight: 1 / 3 },
  { variable_code: 'norm_jarak_ibukota_kabupaten_cost', category_code: 'AKSESIBILITAS', variable_label: 'Jarak Ibukota Kabupaten (Cost)', local_weight: 1 / 3 },

  // 3. PELAYANAN_MASYARAKAT (4 variables -> 1/4 each)
  { variable_code: 'norm_jarak_rsud_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak RSUD (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_puskesmas_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak Puskesmas (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_sd_smp_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak SD/SMP (Cost)', local_weight: 1 / 4 },
  { variable_code: 'norm_jarak_pasar_cost', category_code: 'PELAYANAN_MASYARAKAT', variable_label: 'Jarak Pasar (Cost)', local_weight: 1 / 4 },

  // 4. SPASIAL_DEMOGRAFI (3 variables -> 1/3 each)
  { variable_code: 'norm_penduduk_dilayani', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Penduduk Dilayani', local_weight: 1 / 3 },
  { variable_code: 'norm_desa_dilalui', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Desa Dilalui', local_weight: 1 / 3 },
  { variable_code: 'norm_kecamatan_dilalui', category_code: 'SPASIAL_DEMOGRAFI', variable_label: 'Kecamatan Dilalui', local_weight: 1 / 3 },
];

function getInitialSimConfig() {
  return {
    categories: SIM_BASELINE_CATEGORIES.map((c) => ({ ...c })),
    variables: SIM_BASELINE_VARIABLES.map((v) => ({ ...v })),
  };
}

const getBaselineSimulationConfig = getInitialSimConfig;

// Proportional Sibling Auto-Balancing (Category Level)
function simRebalanceCategorySiblings(currentCategories, editedCode, newWeight) {
  const clamped = Math.min(1.0, Math.max(0.0, Number(newWeight) || 0));
  const siblings = currentCategories.filter((c) => c.category_code !== editedCode);
  const remainingMass = 1.0 - clamped;
  const currentSiblingSum = siblings.reduce((s, c) => s + c.raw_weight, 0);

  return currentCategories.map((cat) => {
    if (cat.category_code === editedCode) {
      return { ...cat, raw_weight: clamped };
    }
    if (currentSiblingSum > 1e-12) {
      return { ...cat, raw_weight: remainingMass * (cat.raw_weight / currentSiblingSum) };
    } else {
      return { ...cat, raw_weight: remainingMass / siblings.length };
    }
  });
}

// Proportional Sibling Auto-Balancing (Variable Level within Category)
function simRebalanceVariableSiblings(currentVariables, categoryCode, editedCode, newWeight) {
  const clamped = Math.min(1.0, Math.max(0.0, Number(newWeight) || 0));
  const catVars = currentVariables.filter((v) => v.category_code === categoryCode);
  const siblings = catVars.filter((v) => v.variable_code !== editedCode);
  const remainingMass = 1.0 - clamped;
  const currentSiblingSum = siblings.reduce((s, v) => s + v.local_weight, 0);

  return currentVariables.map((v) => {
    if (v.category_code !== categoryCode) return { ...v };
    if (v.variable_code === editedCode) return { ...v, local_weight: clamped };
    if (currentSiblingSum > 1e-12) {
      return { ...v, local_weight: remainingMass * (v.local_weight / currentSiblingSum) };
    } else {
      return { ...v, local_weight: remainingMass / siblings.length };
    }
  });
}

// Normalized & Effective Weights Calculation
function simCalculateNormalizedWeights(simConfig) {
  const rawSum = simConfig.categories.reduce((s, c) => s + c.raw_weight, 0) || 1.0;
  const category_normalized_weights = {};
  for (const c of simConfig.categories) {
    category_normalized_weights[c.category_code] = c.raw_weight / rawSum;
  }

  const effective_weights = {};
  for (const v of simConfig.variables) {
    const catNorm = category_normalized_weights[v.category_code] || 0.0;
    effective_weights[v.variable_code] = catNorm * v.local_weight;
  }

  return { category_normalized_weights, effective_weights };
}

// Deterministic Comparator
function simCompareRoadPriority(a, b) {
  const scoreDiff = b.final_score - a.final_score;
  if (Math.abs(scoreDiff) > 1e-7) return scoreDiff;
  const mantapDiff = a.mantap_pct - b.mantap_pct;
  if (Math.abs(mantapDiff) > 1e-4) return mantapDiff;
  const popDiff = b.penduduk_dilayani_raw - a.penduduk_dilayani_raw;
  if (Math.abs(popDiff) > 0.001) return popDiff;
  return a.nomor_ruas.localeCompare(b.nomor_ruas);
}

// Pure in-memory ranking
function simRankRoads(featureVectors, simConfig) {
  const weights = simCalculateNormalizedWeights(simConfig);

  const scoredRoads = featureVectors.map((rf) => {
    let final_score = 0.0;
    const category_subtotals = {};
    const factor_contributions = {};

    for (const c of simConfig.categories) {
      category_subtotals[c.category_code] = {
        category_code: c.category_code,
        subtotal: 0.0,
      };
    }

    for (const v of simConfig.variables) {
      const normVal = Math.min(1.0, Math.max(0.0, rf.normalized_values[v.variable_code] || 0.0));
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
      road_key: rf.road_key,
      nomor_ruas: rf.nomor_ruas,
      display_name: rf.display_name,
      district_name: rf.district_name,
      mantap_pct: rf.mantap_pct,
      penduduk_dilayani_raw: rf.penduduk_dilayani_raw,
      final_score,
      category_subtotals,
      factor_contributions,
    };
  });

  scoredRoads.sort(simCompareRoadPriority);

  return scoredRoads.map((road, idx) => {
    const priority_rank = idx + 1;
    let tier_category = 'REGULAR';
    if (priority_rank <= 35) tier_category = 'TOP_35';
    else if (priority_rank <= 70) tier_category = 'TOP_70';
    else if (priority_rank <= 105) tier_category = 'TOP_105';

    return {
      ...road,
      priority_rank,
      tier_category,
    };
  });
}

// Recalculate simulation state & generate comparison metrics
function recalculateSimulation() {
  if (!state.simulation.featureVectors || !state.simulation.baselineScores) return;

  const simScores = simRankRoads(state.simulation.featureVectors, state.simulation.simConfig);
  state.simulation.simulatedScores = simScores;

  const baselineMap = new Map(state.simulation.baselineScores.map((b) => [b.road_key, b]));

  let movedUp = 0;
  let movedDown = 0;
  let unchanged = 0;
  let tierChanged = 0;

  let maxUp = null;
  let maxDown = null;

  const comparisons = simScores.map((sim) => {
    const base = baselineMap.get(sim.road_key);
    const rankDelta = base.priority_rank - sim.priority_rank; // positive = UP
    const scoreDelta = sim.final_score - base.final_score;
    const isTierChanged = base.tier_category !== sim.tier_category;

    if (rankDelta > 0) movedUp++;
    else if (rankDelta < 0) movedDown++;
    else unchanged++;

    if (isTierChanged) tierChanged++;

    if (rankDelta > 0 && (!maxUp || rankDelta > maxUp.rank_delta)) {
      maxUp = {
        road_key: sim.road_key,
        display_name: sim.display_name,
        baseline_rank: base.priority_rank,
        simulated_rank: sim.priority_rank,
        rank_delta: rankDelta,
      };
    }

    if (rankDelta < 0 && (!maxDown || rankDelta < maxDown.rank_delta)) {
      maxDown = {
        road_key: sim.road_key,
        display_name: sim.display_name,
        baseline_rank: base.priority_rank,
        simulated_rank: sim.priority_rank,
        rank_delta: rankDelta,
      };
    }

    return {
      road_key: sim.road_key,
      nomor_ruas: sim.nomor_ruas,
      display_name: sim.display_name,
      district_name: sim.district_name,
      baseline_rank: base.priority_rank,
      simulated_rank: sim.priority_rank,
      rank_delta: rankDelta,
      baseline_score: base.final_score,
      simulated_score: sim.final_score,
      score_delta: scoreDelta,
      baseline_tier: base.tier_category,
      simulated_tier: sim.tier_category,
      tier_changed: isTierChanged,
      subtotal_teknis: sim.category_subtotals['TEKNIS_JALAN']?.subtotal || 0.0,
      subtotal_akses: sim.category_subtotals['AKSESIBILITAS']?.subtotal || 0.0,
      subtotal_pelayanan: sim.category_subtotals['PELAYANAN_MASYARAKAT']?.subtotal || 0.0,
      subtotal_spasial: sim.category_subtotals['SPASIAL_DEMOGRAFI']?.subtotal || 0.0,
    };
  });

  state.simulation.comparisons = comparisons;
  state.simulation.summary = {
    roads_evaluated: simScores.length,
    moved_up_count: movedUp,
    moved_down_count: movedDown,
    unchanged_count: unchanged,
    tier_changed_count: tierChanged,
    biggest_upward_mover: maxUp,
    biggest_downward_mover: maxDown,
    top10_simulated: comparisons.slice(0, 10),
  };

  renderSimulationKPIs();
  renderSimulationTop10();
  renderSimulationTable();

  // If map is currently displaying simulation tier, update map
  if (state.simulation.mapColorSource === 'SIMULATION' && state.currentView === 'peta') {
    applyMapFilters();
  }
}

function updateSimulationContextStatus(message) {
  const status = document.getElementById('sim-context-status');
  if (!status) return;
  const mode = state.mode === 'BENCHMARK_2024' ? 'Audit peringkat 2024' : 'Peringkat operasional 2025';
  const scenario = state.simulation.scenarioName || 'Model acuan';
  status.textContent = `${message} · ${mode} · ${scenario}. Data kondisi profil yang ditampilkan tetap tahun 2025.`;
}

// Load Simulation Context from API
async function loadSimulation() {
  const requestedMode = state.mode;
  try {
    if (!state.simulation.initialized || state.simulation.contextMode !== requestedMode) {
      const savedConfig = state.simulation.simConfig ? cloneConfig(state.simulation.simConfig) : null;
      updateSimulationContextStatus('Memuat konteks peringkat');
      state.simulation.initialized = false;
      state.simulation.contextMode = null;
      state.simulation.featureVectors = null;
      state.simulation.baselineScores = null;
      state.simulation.simulatedScores = null;
      state.simulation.comparisons = [];
      state.simulation.summary = null;
      document.getElementById('sim-top10-body')?.replaceChildren();
      document.getElementById('sim-table-body')?.replaceChildren();
      const count = document.getElementById('sim-table-count');
      if (count) count.textContent = '—';
      const pageInfo = document.getElementById('sim-pagination-info');
      if (pageInfo) pageInfo.textContent = 'Konteks sedang dimuat';
      const sensitivity = document.getElementById('sensitivity-results');
      if (sensitivity) sensitivity.textContent = 'Analisis sensitivitas akan tersedia setelah konteks peringkat dimuat.';
      const res = await fetch(`/api/simulation/context?mode=${requestedMode}&model=${encodeURIComponent(state.modelCode)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      if (requestedMode !== state.mode) return;

      state.simulation.featureVectors = json.data.featureVectors;
      state.simulation.baselineScores = json.data.baselineRankedScores;
      state.simulation.simConfig = savedConfig ? hydrateConfig(savedConfig) : getInitialSimConfig();

      // Populate district filter
      const districtSelect = document.getElementById('sim-filter-district');
      if (districtSelect) {
        const districts = Array.from(new Set(json.data.featureVectors.map((f) => f.district_name))).sort();
        districtSelect.innerHTML = '<option value="ALL">Semua Kecamatan (11)</option>';
        districts.forEach((d) => {
          districtSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
      }

      state.simulation.contextMode = requestedMode;
      state.simulation.initialized = true;
      updateSimulationContextStatus(`Konteks siap · ${json.data.featureVectors.length} ruas`);
    } else {
      updateSimulationContextStatus(`Konteks siap · ${state.simulation.featureVectors?.length || 0} ruas`);
    }

    renderSimulationCategories();
    renderSimulationVariables();
    recalculateSimulation();
  } catch (err) {
    console.error('Error loading simulation workspace:', err);
    state.simulation.initialized = false;
    state.simulation.contextMode = null;
    state.simulation.featureVectors = null;
    const output = document.getElementById('sensitivity-results');
    if (output) output.textContent = 'Data peringkat untuk konteks ini gagal dimuat. Periksa koneksi lalu buka kembali skenario.';
    updateSimulationContextStatus('Konteks gagal dimuat; hasil lama tidak digunakan');
  }
}

// Render Category Controls (Level 1)
function renderSimulationCategories() {
  const container = document.getElementById('sim-categories-container');
  if (!container || !state.simulation.simConfig) return;

  const weights = simCalculateNormalizedWeights(state.simulation.simConfig);
  const baseMap = new Map(SIM_BASELINE_CATEGORIES.map((c) => [c.category_code, c.raw_weight]));

  let html = '';
  for (const cat of state.simulation.simConfig.categories) {
    const rawVal = cat.raw_weight;
    const normVal = weights.category_normalized_weights[cat.category_code] || 0.0;
    const baseRaw = baseMap.get(cat.category_code) || 0.0;
    const delta = rawVal - baseRaw;
    const deltaBadge = Math.abs(delta) > 0.0001
      ? `<span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${delta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%</span>`
      : '<span class="text-[10px] text-slate-400">Baseline</span>';

    html += `
      <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-bold text-slate-800 text-xs">${escapeHtml(cat.category_name)}</div>
            <div class="text-[10px] text-slate-400 font-mono">${cat.category_code}</div>
          </div>
          <div class="flex items-center space-x-1.5">
            ${deltaBadge}
            <span class="text-xs font-bold text-sky-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">${(normVal * 100).toFixed(2)}%</span>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          <input type="range" min="0" max="1" step="0.005" value="${rawVal}"
            class="flex-1 accent-sky-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            oninput="window.onCategoryWeightChange('${cat.category_code}', this.value)" />
          <input type="number" min="0" max="1" step="0.001" value="${rawVal.toFixed(4)}"
            class="w-20 px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-right focus:ring-1 focus:ring-sky-500"
            onchange="window.onCategoryWeightChange('${cat.category_code}', this.value)" />
        </div>
        <div class="text-[10px] text-slate-400 flex justify-between">
          <span>Baseline Raw: ${baseRaw.toFixed(4)}</span>
          <span>Normal: ${(normVal * 100).toFixed(2)}%</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// Render Local Variable Controls (Level 2)
function renderSimulationVariables() {
  const container = document.getElementById('sim-variables-container');
  if (!container || !state.simulation.simConfig) return;

  const activeCat = state.simulation.activeVariableCategory || 'TEKNIS_JALAN';
  const catVars = state.simulation.simConfig.variables.filter((v) => v.category_code === activeCat);
  const weights = simCalculateNormalizedWeights(state.simulation.simConfig);

  const baseConfig = getBaselineSimulationConfig();
  const baseWeights = simCalculateNormalizedWeights(baseConfig);
  const baseVarMap = new Map(baseConfig.variables.map((v) => [v.variable_code, v.local_weight]));

  let html = '';
  for (const v of catVars) {
    const localVal = v.local_weight;
    const effWeight = weights.effective_weights[v.variable_code] || 0.0;
    const baseLocal = baseVarMap.get(v.variable_code) || 0.0;
    const baseEff = baseWeights.effective_weights[v.variable_code] || 0.0;
    const effDelta = effWeight - baseEff;
    const deltaBadge = Math.abs(effDelta) > 0.0001
      ? `<span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${effDelta > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">Δ ${(effDelta >= 0 ? '+' : '')}${(effDelta * 100).toFixed(2)}%</span>`
      : '<span class="text-[10px] text-slate-400">Baseline</span>';

    html += `
      <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-slate-800 text-xs">${escapeHtml(v.variable_label)}</div>
            <div class="text-[10px] text-slate-400 font-mono">${v.variable_code}</div>
          </div>
          <div class="flex items-center space-x-1.5">
            ${deltaBadge}
            <span class="text-[11px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono" title="Bobot Efektif (Read-Only)">Ω = ${(effWeight * 100).toFixed(2)}%</span>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          <input type="range" min="0" max="1" step="0.005" value="${localVal}"
            class="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            oninput="window.onVariableWeightChange('${activeCat}', '${v.variable_code}', this.value)" />
          <input type="number" min="0" max="1" step="0.001" value="${localVal.toFixed(4)}"
            class="w-20 px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-right focus:ring-1 focus:ring-indigo-500"
            onchange="window.onVariableWeightChange('${activeCat}', '${v.variable_code}', this.value)" />
        </div>
        <div class="text-[10px] text-slate-400 flex justify-between">
          <span>Bobot Lokal: ${(localVal * 100).toFixed(2)}%</span>
          <span class="font-mono">Efektif (Read-Only): ${(effWeight * 100).toFixed(2)}%</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Update tabs active state
  document.querySelectorAll('.sim-cat-tab').forEach((tab) => {
    if (tab.getAttribute('data-cat') === activeCat) {
      tab.className = 'sim-cat-tab active px-2.5 py-1 text-xs font-semibold rounded-md bg-sky-50 text-sky-700 border border-sky-200 transition';
    } else {
      tab.className = 'sim-cat-tab px-2.5 py-1 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-100 transition';
    }
  });
}

// Render Summary KPIs
function renderSimulationKPIs() {
  const sum = state.simulation.summary;
  if (!sum) return;

  const kpiMovedUp = document.getElementById('sim-kpi-moved-up');
  const kpiMovedDown = document.getElementById('sim-kpi-moved-down');
  const kpiUnchanged = document.getElementById('sim-kpi-unchanged');
  const kpiTierChanged = document.getElementById('sim-kpi-tier-changed');
  const kpiTopUp = document.getElementById('sim-kpi-top-up');
  const kpiTopDown = document.getElementById('sim-kpi-top-down');

  if (kpiMovedUp) kpiMovedUp.innerHTML = `${sum.moved_up_count} <span class="text-xs font-normal text-slate-400">ruas</span>`;
  if (kpiMovedDown) kpiMovedDown.innerHTML = `${sum.moved_down_count} <span class="text-xs font-normal text-slate-400">ruas</span>`;
  if (kpiUnchanged) kpiUnchanged.innerHTML = `${sum.unchanged_count} <span class="text-xs font-normal text-slate-400">ruas</span>`;
  if (kpiTierChanged) kpiTierChanged.innerHTML = `${sum.tier_changed_count} <span class="text-xs font-normal text-slate-400">ruas</span>`;

  if (kpiTopUp) {
    if (sum.biggest_upward_mover) {
      kpiTopUp.innerHTML = `<span class="text-emerald-700" title="${escapeHtml(sum.biggest_upward_mover.display_name)}">${escapeHtml(sum.biggest_upward_mover.display_name)}</span> <span class="text-[10px] text-emerald-800 font-extrabold bg-emerald-100 px-1 rounded">▲ +${sum.biggest_upward_mover.rank_delta}</span>`;
    } else {
      kpiTopUp.textContent = '—';
    }
  }

  if (kpiTopDown) {
    if (sum.biggest_downward_mover) {
      kpiTopDown.innerHTML = `<span class="text-rose-700" title="${escapeHtml(sum.biggest_downward_mover.display_name)}">${escapeHtml(sum.biggest_downward_mover.display_name)}</span> <span class="text-[10px] text-rose-800 font-extrabold bg-rose-100 px-1 rounded">▼ ${sum.biggest_downward_mover.rank_delta}</span>`;
    } else {
      kpiTopDown.textContent = '—';
    }
  }
}

// Render Top 10 Comparison Table
function renderSimulationTop10() {
  const tbody = document.getElementById('sim-top10-body');
  if (!tbody || !state.simulation.summary) return;

  const top10 = state.simulation.summary.top10_simulated;
  let html = '';

  for (const r of top10) {
    const delta = r.rank_delta;
    const deltaBadge = delta > 0
      ? `<span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">▲ +${delta}</span>`
      : delta < 0
      ? `<span class="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">▼ ${delta}</span>`
      : '<span class="text-slate-400 font-medium">— 0</span>';

    html += `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2 px-2 text-center font-black text-slate-900">#${r.simulated_rank}</td>
        <td class="py-2 px-2 text-center text-slate-400">#${r.baseline_rank}</td>
        <td class="py-2 px-2 text-center">${deltaBadge}</td>
        <td class="py-2 px-2.5 font-mono text-slate-600">${escapeHtml(r.nomor_ruas)}</td>
        <td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(r.display_name)}</td>
        <td class="py-2 px-2.5 text-slate-600">${escapeHtml(r.district_name)}</td>
        <td class="py-2 px-2.5 text-right font-mono font-bold text-sky-800">${r.simulated_score.toFixed(4)}</td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-400">${r.baseline_score.toFixed(4)}</td>
        <td class="py-2 px-2.5 text-center">${renderTierBadge(r.simulated_tier)}</td>
        <td class="py-2 px-2 text-center">
          <button onclick="window.openSimulationExplainModal('${r.road_key}')" class="px-2 py-0.5 text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition">Audit</button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// Render Full 350-Road Table with Filtering & Pagination
function renderSimulationTable() {
  const tbody = document.getElementById('sim-table-body');
  if (!tbody || !state.simulation.comparisons) return;

  const f = state.simulation.filter;
  let filtered = state.simulation.comparisons;

  if (f.search) {
    const q = f.search.toLowerCase();
    filtered = filtered.filter((r) =>
      r.display_name.toLowerCase().includes(q) ||
      r.nomor_ruas.toLowerCase().includes(q) ||
      r.road_key.toLowerCase().includes(q)
    );
  }

  if (f.district !== 'ALL') {
    filtered = filtered.filter((r) => r.district_name === f.district);
  }

  if (f.movement === 'MOVED_UP') {
    filtered = filtered.filter((r) => r.rank_delta > 0);
  } else if (f.movement === 'MOVED_DOWN') {
    filtered = filtered.filter((r) => r.rank_delta < 0);
  } else if (f.movement === 'TIER_CHANGED') {
    filtered = filtered.filter((r) => r.tier_changed);
  } else if (f.movement === 'UNCHANGED') {
    filtered = filtered.filter((r) => r.rank_delta === 0);
  }

  if (f.tier !== 'ALL') {
    filtered = filtered.filter((r) => r.simulated_tier === f.tier);
  }

  const countBadge = document.getElementById('sim-table-count');
  if (countBadge) countBadge.textContent = filtered.length;

  // Pagination
  const pageSize = state.simulation.pageSize || 25;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  state.simulation.page = Math.min(state.simulation.page, totalPages);
  state.simulation.page = Math.max(1, state.simulation.page);

  const startIdx = (state.simulation.page - 1) * pageSize;
  const pageRows = filtered.slice(startIdx, startIdx + pageSize);

  const pageInfo = document.getElementById('sim-pagination-info');
  if (pageInfo) pageInfo.textContent = `${filtered.length > 0 ? startIdx + 1 : 0}-${Math.min(startIdx + pageSize, filtered.length)} dari ${filtered.length} ruas`;

  const currPage = document.getElementById('sim-current-page');
  if (currPage) currPage.textContent = state.simulation.page;

  const prevBtn = document.getElementById('sim-btn-prev-page');
  const nextBtn = document.getElementById('sim-btn-next-page');
  if (prevBtn) prevBtn.disabled = state.simulation.page <= 1;
  if (nextBtn) nextBtn.disabled = state.simulation.page >= totalPages;

  let html = '';
  for (const r of pageRows) {
    const delta = r.rank_delta;
    const deltaBadge = delta > 0
      ? `<span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">▲ +${delta}</span>`
      : delta < 0
      ? `<span class="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">▼ ${delta}</span>`
      : '<span class="text-slate-400 font-medium">— 0</span>';

    const scoreDelta = r.score_delta;
    const scoreDeltaText = `${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(4)}`;

    html += `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2 px-2 text-center font-black text-slate-900">#${r.simulated_rank}</td>
        <td class="py-2 px-2 text-center text-slate-400">#${r.baseline_rank}</td>
        <td class="py-2 px-2 text-center">${deltaBadge}</td>
        <td class="py-2 px-2.5 font-mono text-slate-600">${escapeHtml(r.nomor_ruas)}</td>
        <td class="py-2 px-3 font-semibold text-slate-800">${escapeHtml(r.display_name)}</td>
        <td class="py-2 px-2.5 text-slate-600">${escapeHtml(r.district_name)}</td>
        <td class="py-2 px-2.5 text-right font-mono font-bold text-sky-800">${r.simulated_score.toFixed(4)}</td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-400">${r.baseline_score.toFixed(4)}</td>
        <td class="py-2 px-2.5 text-center">${renderTierBadge(r.baseline_tier)}</td>
        <td class="py-2 px-2.5 text-center">${renderTierBadge(r.simulated_tier)}</td>
        <td class="py-2 px-2 text-center space-x-1 whitespace-nowrap">
          <button onclick="window.openSimulationExplainModal('${r.road_key}')" class="px-2 py-0.5 text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition" title="Audit Dekomposisi 17 Faktor">🔍 Audit</button>
          <button onclick="window.viewRoadOnSimulationMap('${r.road_key}')" class="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition" title="Lihat di Peta GIS">🗺️ Peta</button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// Window Event Callbacks for Category and Variable Sliders
window.onCategoryWeightChange = function (categoryCode, value) {
  if (!state.simulation.simConfig) return;
  state.simulation.scenarioId = '';
  state.simulation.scenarioName = 'Skenario saat ini';
  state.simulation.simConfig.categories = simRebalanceCategorySiblings(
    state.simulation.simConfig.categories,
    categoryCode,
    parseFloat(value)
  );
  renderSimulationCategories();
  renderSimulationVariables();
  updateSimulationContextStatus('Asumsi diubah; skenario belum disimpan');
  recalculateSimulation();
};

window.onVariableWeightChange = function (categoryCode, variableCode, value) {
  if (!state.simulation.simConfig) return;
  state.simulation.scenarioId = '';
  state.simulation.scenarioName = 'Skenario saat ini';
  state.simulation.simConfig.variables = simRebalanceVariableSiblings(
    state.simulation.simConfig.variables,
    categoryCode,
    variableCode,
    parseFloat(value)
  );
  renderSimulationVariables();
  updateSimulationContextStatus('Asumsi diubah; skenario belum disimpan');
  recalculateSimulation();
};

window.applySimulationPreset = function (presetType) {
  if (!state.simulation.simConfig) return;
  state.simulation.scenarioId = '';
  state.simulation.scenarioName = ({ BASELINE: '', PELAYANAN: 'Lebih dekat ke fasilitas layanan', AKSES: 'Tekankan koneksi jalan provinsi', KERUSAKAN: 'Tekankan kerusakan berat' })[presetType] || 'Skenario saat ini';

  if (presetType === 'BASELINE') {
    state.simulation.simConfig = getInitialSimConfig();
  } else if (presetType === 'PELAYANAN') {
    state.simulation.simConfig = getInitialSimConfig();
    state.simulation.simConfig.categories = simRebalanceCategorySiblings(
      state.simulation.simConfig.categories,
      'PELAYANAN_MASYARAKAT',
      0.450
    );
    state.simulation.simConfig.variables = simRebalanceVariableSiblings(
      state.simulation.simConfig.variables,
      'PELAYANAN_MASYARAKAT',
      'norm_jarak_rsud_cost',
      0.50
    );
  } else if (presetType === 'AKSES') {
    state.simulation.simConfig = getInitialSimConfig();
    state.simulation.simConfig.categories = simRebalanceCategorySiblings(
      state.simulation.simConfig.categories,
      'AKSESIBILITAS',
      0.450
    );
    state.simulation.simConfig.variables = simRebalanceVariableSiblings(
      state.simulation.simConfig.variables,
      'AKSESIBILITAS',
      'norm_koneksi_jalan_provinsi',
      0.40
    );
  } else if (presetType === 'KERUSAKAN') {
    state.simulation.simConfig = getInitialSimConfig();
    state.simulation.simConfig.categories = simRebalanceCategorySiblings(
      state.simulation.simConfig.categories,
      'TEKNIS_JALAN',
      0.550
    );
    state.simulation.simConfig.variables = simRebalanceVariableSiblings(
      state.simulation.simConfig.variables,
      'TEKNIS_JALAN',
      'norm_rusak_berat',
      0.35
    );
  }

  renderSimulationCategories();
  renderSimulationVariables();
  updateSimulationContextStatus(presetType === 'BASELINE' ? 'Baseline dipulihkan' : 'Preset simulasi aktif; skenario belum disimpan');
  recalculateSimulation();
};

window.resetSimulationToBaseline = function () {
  window.applySimulationPreset('BASELINE');
};

// Open Single Road Explainability Modal
window.openSimulationExplainModal = function (roadKey) {
  const road = state.simulation.comparisons?.find((r) => r.road_key === roadKey);
  const feat = state.simulation.featureVectors?.find((r) => r.road_key === roadKey);
  if (!road || !feat) return;

  const modal = document.getElementById('modal-sim-explain');
  if (!modal) return;

  document.getElementById('sim-modal-road-key').textContent = road.road_key;
  document.getElementById('sim-modal-road-name').textContent = road.display_name;
  document.getElementById('sim-modal-district').textContent = `Kecamatan ${road.district_name} | No. Ruas: ${road.nomor_ruas}`;

  document.getElementById('sim-modal-rank-sim').textContent = `#${road.simulated_rank}`;
  document.getElementById('sim-modal-rank-base').textContent = `#${road.baseline_rank}`;

  const rankDeltaEl = document.getElementById('sim-modal-rank-delta');
  if (rankDeltaEl) {
    if (road.rank_delta > 0) {
      rankDeltaEl.className = 'text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200';
      rankDeltaEl.textContent = `▲ +${road.rank_delta} (Naik)`;
    } else if (road.rank_delta < 0) {
      rankDeltaEl.className = 'text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200';
      rankDeltaEl.textContent = `▼ ${road.rank_delta} (Turun)`;
    } else {
      rankDeltaEl.className = 'text-xs font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200';
      rankDeltaEl.textContent = '— Tetap (0)';
    }
  }

  document.getElementById('sim-modal-score-sim').textContent = road.simulated_score.toFixed(6);
  document.getElementById('sim-modal-score-delta').textContent = `Δ ${(road.score_delta >= 0 ? '+' : '')}${road.score_delta.toFixed(6)}`;

  document.getElementById('sim-modal-tier-base').innerHTML = renderTierBadge(road.baseline_tier);
  document.getElementById('sim-modal-tier-sim').innerHTML = renderTierBadge(road.simulated_tier);

  // Compute 17 variables comparative breakdown
  const baseConfig = getBaselineSimulationConfig();
  const baseWeights = simCalculateNormalizedWeights(baseConfig);
  const simWeights = simCalculateNormalizedWeights(state.simulation.simConfig);

  const tbody = document.getElementById('sim-modal-factors-body');
  let html = '';
  let topPositiveFactor = null;
  let topNegativeFactor = null;

  for (const v of state.simulation.simConfig.variables) {
    const normVal = feat.normalized_values[v.variable_code] || 0.0;
    const baseEff = baseWeights.effective_weights[v.variable_code] || 0.0;
    const simEff = simWeights.effective_weights[v.variable_code] || 0.0;
    const effDelta = simEff - baseEff;

    const baseContrib = normVal * baseEff;
    const simContrib = normVal * simEff;
    const contribDelta = simContrib - baseContrib;

    if (contribDelta > 0 && (!topPositiveFactor || contribDelta > topPositiveFactor.delta)) {
      topPositiveFactor = { label: v.variable_label, delta: contribDelta };
    }
    if (contribDelta < 0 && (!topNegativeFactor || contribDelta < topNegativeFactor.delta)) {
      topNegativeFactor = { label: v.variable_label, delta: contribDelta };
    }

    const deltaClass = contribDelta > 0.0001
      ? 'text-emerald-700 font-bold bg-emerald-50'
      : contribDelta < -0.0001
      ? 'text-rose-700 font-bold bg-rose-50'
      : 'text-slate-500';

    html += `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2 px-3 font-medium text-slate-800">${escapeHtml(v.variable_label)}</td>
        <td class="py-2 px-2.5 text-slate-500 font-mono text-[10px]">${v.category_code}</td>
        <td class="py-2 px-2.5 text-right font-mono">${normVal.toFixed(4)}</td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-500">${(baseEff * 100).toFixed(2)}%</td>
        <td class="py-2 px-2.5 text-right font-mono font-semibold text-slate-800">${(simEff * 100).toFixed(2)}%</td>
        <td class="py-2 px-2.5 text-right font-mono ${effDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${(effDelta >= 0 ? '+' : '')}${(effDelta * 100).toFixed(2)}%</td>
        <td class="py-2 px-2.5 text-right font-mono text-slate-500">${baseContrib.toFixed(5)}</td>
        <td class="py-2 px-2.5 text-right font-mono font-bold text-sky-800">${simContrib.toFixed(5)}</td>
        <td class="py-2 px-2.5 text-right font-mono px-2 py-0.5 rounded ${deltaClass}">${(contribDelta >= 0 ? '+' : '')}${contribDelta.toFixed(5)}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  // Insight box
  const insightBox = document.getElementById('sim-modal-insight');
  if (insightBox) {
    let narrative = `<strong>Uraian Perubahan:</strong> Ruas ini `;
    if (road.rank_delta > 0) {
      narrative += `mengalami <span class="text-emerald-700 font-bold">kenaikan ${road.rank_delta} peringkat</span> (dari #${road.baseline_rank} ke #${road.simulated_rank}). `;
      if (topPositiveFactor) {
        narrative += `Pendorong utama kenaikan adalah peningkatan bobot pada <strong>${topPositiveFactor.label}</strong> (kontribusi naik +${topPositiveFactor.delta.toFixed(5)}).`;
      }
    } else if (road.rank_delta < 0) {
      narrative += `mengalami <span class="text-rose-700 font-bold">penurunan ${Math.abs(road.rank_delta)} peringkat</span> (dari #${road.baseline_rank} ke #${road.simulated_rank}). `;
      if (topNegativeFactor) {
        narrative += `Penurunan dipicu oleh reduksi kontribusi relatif pada <strong>${topNegativeFactor.label}</strong> (${topNegativeFactor.delta.toFixed(5)}).`;
      }
    } else {
      narrative += `mempertahankan posisi peringkat (#${road.baseline_rank}) karena total kontribusi perubahan antar kategori saling menyeimbangkan.`;
    }
    insightBox.innerHTML = narrative;
  }

  modal.classList.remove('hidden');
};

window.closeSimulationExplainModal = function () {
  document.getElementById('modal-sim-explain')?.classList.add('hidden');
};

// View on GIS Simulation Map
window.viewRoadOnSimulationMap = function (roadKey) {
  setMapColorSource('SIMULATION');
  switchView('peta');
  setTimeout(() => {
    selectRoadOnMap(roadKey);
  }, 400);
};

// Map Color Source Toggle
function setMapColorSource(source) {
  state.simulation.mapColorSource = source;

  const btnBase = document.getElementById('map-btn-source-baseline');
  const btnSim = document.getElementById('map-btn-source-simulation');
  const banner = document.getElementById('map-simulation-banner');

  if (source === 'SIMULATION') {
    btnSim?.classList.add('bg-amber-600', 'text-white');
    btnSim?.classList.remove('bg-slate-100', 'text-slate-700');
    btnBase?.classList.remove('bg-sky-600', 'text-white');
    btnBase?.classList.add('bg-slate-100', 'text-slate-700');
    banner?.classList.remove('hidden');
  } else {
    btnBase?.classList.add('bg-sky-600', 'text-white');
    btnBase?.classList.remove('bg-slate-100', 'text-slate-700');
    btnSim?.classList.remove('bg-amber-600', 'text-white');
    btnSim?.classList.add('bg-slate-100', 'text-slate-700');
    banner?.classList.add('hidden');
  }

  if (state.mapData.countyRoads) {
    applyMapFilters();
  }
}

// Hook up simulation UI listeners
function initSimulationEventListeners() {
  // Preset buttons
  document.getElementById('sim-preset-baseline')?.addEventListener('click', () => window.applySimulationPreset('BASELINE'));
  document.getElementById('sim-preset-pelayanan')?.addEventListener('click', () => window.applySimulationPreset('PELAYANAN'));
  document.getElementById('sim-preset-akses')?.addEventListener('click', () => window.applySimulationPreset('AKSES'));
  document.getElementById('sim-preset-kerusakan')?.addEventListener('click', () => window.applySimulationPreset('KERUSAKAN'));

  // Reset button
  document.getElementById('sim-btn-reset')?.addEventListener('click', window.resetSimulationToBaseline);

  // Go to map button
  document.getElementById('sim-btn-goto-map')?.addEventListener('click', () => {
    setMapColorSource('SIMULATION');
    switchView('peta');
  });

  // Category tabs for variables
  document.getElementById('sim-variable-category-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.sim-cat-tab');
    if (!tab) return;
    state.simulation.activeVariableCategory = tab.getAttribute('data-cat');
    renderSimulationVariables();
  });

  // Table filters
  document.getElementById('sim-filter-search')?.addEventListener('input', (e) => {
    state.simulation.filter.search = e.target.value.trim();
    state.simulation.page = 1;
    renderSimulationTable();
  });

  document.getElementById('sim-filter-district')?.addEventListener('change', (e) => {
    state.simulation.filter.district = e.target.value;
    state.simulation.page = 1;
    renderSimulationTable();
  });

  document.getElementById('sim-filter-movement')?.addEventListener('change', (e) => {
    state.simulation.filter.movement = e.target.value;
    state.simulation.page = 1;
    renderSimulationTable();
  });

  document.getElementById('sim-filter-tier')?.addEventListener('change', (e) => {
    state.simulation.filter.tier = e.target.value;
    state.simulation.page = 1;
    renderSimulationTable();
  });

  // Pagination
  document.getElementById('sim-page-size-select')?.addEventListener('change', (e) => {
    state.simulation.pageSize = parseInt(e.target.value, 10);
    state.simulation.page = 1;
    renderSimulationTable();
  });

  document.getElementById('sim-btn-prev-page')?.addEventListener('click', () => {
    if (state.simulation.page > 1) {
      state.simulation.page--;
      renderSimulationTable();
    }
  });

  document.getElementById('sim-btn-next-page')?.addEventListener('click', () => {
    state.simulation.page++;
    renderSimulationTable();
  });

  // Modal close listeners
  document.getElementById('btn-close-sim-modal')?.addEventListener('click', window.closeSimulationExplainModal);
  document.getElementById('btn-close-sim-modal-bottom')?.addEventListener('click', window.closeSimulationExplainModal);
  document.getElementById('modal-sim-backdrop')?.addEventListener('click', window.closeSimulationExplainModal);
}

// Window Aliases for Compatibility & External Automation
window.openSimExplainModal = window.openSimulationExplainModal;
window.closeSimExplainModal = window.closeSimulationExplainModal;
window.resetSimulationWeights = window.resetSimulationToBaseline;
window.setMapColorSource = setMapColorSource;
window.appState = state;
window.clearRouteTrace = clearRouteTrace;
window.traceNearestFacilityRoute = traceNearestFacilityRoute;
window.loadRoadNearestFacilities = loadRoadNearestFacilities;


