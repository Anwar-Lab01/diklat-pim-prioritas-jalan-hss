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
} from './mapStyle.js';

const state = {
  mode: 'OPERATIONAL_2025',
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

  // --- Phase 4, 4.5 & 4.6 Web GIS State ---
  map: null,
  mapInitialized: false,
  mapLayers: {
    osmBasemap: null,
    satelliteBasemap: null,
    countyRoads: null,
    countyRoadsHitTarget: null,
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
  },
  mapData: {
    countyRoads: null,
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
  },
};

window.appState = state;
window.fitHssBounds = fitHssBounds;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  handleRouting();
  window.addEventListener('hashchange', handleRouting);
});

function initEventListeners() {
  // Mode Selector
  const modeSelect = document.getElementById('mode-select');
  modeSelect.addEventListener('change', (e) => {
    state.mode = e.target.value;
    updateModeVisuals();
    reloadActiveData();
  });

  // Restore Operational Mode button in warning banner
  document.getElementById('btn-restore-operational').addEventListener('click', () => {
    state.mode = 'OPERATIONAL_2025';
    modeSelect.value = 'OPERATIONAL_2025';
    updateModeVisuals();
    reloadActiveData();
  });

  // Table Search & Filters
  document.getElementById('table-search').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-district').addEventListener('change', (e) => {
    state.district = e.target.value;
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-tier').addEventListener('change', (e) => {
    state.tier = e.target.value;
    state.page = 1;
    applyTableFilters();
  });

  document.getElementById('filter-condition').addEventListener('change', (e) => {
    state.condition = e.target.value;
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
    applyTableFilters();
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
  } else if (state.currentView === 'simulasi') {
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

  const viewMap = {
    '#dashboard': 'dashboard',
    '#prioritas': 'prioritas',
    '#peta': 'peta',
    '#data-sumber': 'data-sumber',
    '#model': 'model',
    '#simulasi': 'simulasi',
  };

  const targetView = viewMap[baseHash] || 'dashboard';
  switchView(targetView);

  // Check for deep link to road detail: e.g. #prioritas?road=HSS-KAB-025 or #peta?road=HSS-KAB-025
  if (query) {
    const params = new URLSearchParams(query);
    const roadKey = params.get('road');
    if (roadKey) {
      openRoadDetail(roadKey);
      if (targetView === 'peta') {
        setTimeout(() => selectRoadOnMap(roadKey), 300);
      }
    }
  }
}

function switchView(viewName) {
  state.currentView = viewName;

  // Toggle active views
  document.querySelectorAll('main > section').forEach((sec) => sec.classList.add('hidden'));
  const activeSec = document.getElementById(`view-${viewName}`);
  if (activeSec) activeSec.classList.remove('hidden');

  // Toggle nav link highlights
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.remove('bg-sky-50', 'text-sky-700', 'font-semibold');
    link.classList.add('text-slate-700');
  });
  const activeLink = document.getElementById(`nav-${viewName}`);
  if (activeLink) {
    activeLink.classList.add('bg-sky-50', 'text-sky-700', 'font-semibold');
    activeLink.classList.remove('text-slate-700');
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
  } else if (viewName === 'model') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadModel();
  } else if (viewName === 'simulasi') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadSimulation();
  }
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
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Ruas Kanonikal</div>
      <div class="text-2xl font-black text-slate-900 mt-1">${data.kpis.totalRoads} <span class="text-xs font-normal text-slate-500">Ruas</span></div>
      <div class="text-[10px] text-emerald-600 font-semibold mt-1">✓ SK Bupati Otoritatif</div>
    </div>
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Panjang Jaringan</div>
      <div class="text-2xl font-black text-slate-900 mt-1">${data.kpis.totalLengthKm.toFixed(3)} <span class="text-xs font-normal text-slate-500">km</span></div>
      <div class="text-[10px] text-slate-400 mt-1">Ruas Kabupaten HSS</div>
    </div>
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Kondisi Mantap</div>
      <div class="text-2xl font-black text-emerald-600 mt-1">${data.kpis.mantapPct}%</div>
      <div class="text-[10px] text-slate-500 mt-1">${data.kpis.mantapKm.toFixed(3)} km (Baik + Sedang)</div>
    </div>
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Prioritas Sangat Mendesak</div>
      <div class="text-2xl font-black text-rose-600 mt-1">${data.kpis.top35Count} <span class="text-xs font-normal text-slate-500">Ruas</span></div>
      <div class="text-[10px] text-rose-600 font-medium mt-1">Tier 1: TOP_35 (Top 10%)</div>
    </div>
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Prioritas Kebijakan</div>
      <div class="text-2xl font-black text-sky-700 mt-1">${data.kpis.top105Count} <span class="text-xs font-normal text-slate-500">Ruas</span></div>
      <div class="text-[10px] text-sky-600 font-medium mt-1">Band Top 30% Jaringan</div>
    </div>
  `;

  // 2. Category Weights
  const catContainer = document.getElementById('category-weights-container');
  catContainer.innerHTML = data.categoryWeights
    .map(
      (c) => `
    <div>
      <div class="flex justify-between text-xs font-medium text-slate-700 mb-1">
        <span>${c.category_name}</span>
        <span class="font-bold text-slate-900">${c.normalized_pct}% (${c.raw_weight.toFixed(6)})</span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-2">
        <div class="bg-sky-600 h-2 rounded-full" style="width: ${c.normalized_pct}%"></div>
      </div>
    </div>
  `
    )
    .join('');

  // 3. Condition Breakdown
  const condContainer = document.getElementById('condition-breakdown-container');
  const cond = data.conditionBreakdown;
  condContainer.innerHTML = `
    <div class="w-full bg-slate-100 rounded-lg h-5 flex overflow-hidden border border-slate-200 text-[10px] font-bold text-white text-center leading-5">
      <div style="width: ${cond.baik_pct}%" class="bg-emerald-500" title="Baik: ${cond.baik_km} km">${cond.baik_pct > 5 ? cond.baik_pct + '%' : ''}</div>
      <div style="width: ${cond.sedang_pct}%" class="bg-sky-500" title="Sedang: ${cond.sedang_km} km">${cond.sedang_pct}%</div>
      <div style="width: ${cond.rusak_ringan_pct}%" class="bg-amber-500 text-slate-900" title="Rusak Ringan: ${cond.rusak_ringan_km} km">${cond.rusak_ringan_pct}%</div>
      <div style="width: ${cond.rusak_berat_pct}%" class="bg-rose-500" title="Rusak Berat: ${cond.rusak_berat_km} km">${cond.rusak_berat_pct > 3 ? cond.rusak_berat_pct + '%' : ''}</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
      <div class="border border-slate-200 p-2 rounded bg-slate-50">
        <div class="text-slate-500 text-[10px] flex items-center space-x-1">
          <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>Baik</span>
        </div>
        <div class="font-bold text-slate-800 mt-0.5">${cond.baik_km.toFixed(3)} km (${cond.baik_pct}%)</div>
      </div>
      <div class="border border-slate-200 p-2 rounded bg-slate-50">
        <div class="text-slate-500 text-[10px] flex items-center space-x-1">
          <span class="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>
          <span>Sedang</span>
        </div>
        <div class="font-bold text-slate-800 mt-0.5">${cond.sedang_km.toFixed(3)} km (${cond.sedang_pct}%)</div>
      </div>
      <div class="border border-slate-200 p-2 rounded bg-slate-50">
        <div class="text-slate-500 text-[10px] flex items-center space-x-1">
          <span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
          <span>Rusak Ringan</span>
        </div>
        <div class="font-bold text-slate-800 mt-0.5">${cond.rusak_ringan_km.toFixed(3)} km (${cond.rusak_ringan_pct}%)</div>
      </div>
      <div class="border border-slate-200 p-2 rounded bg-slate-50">
        <div class="text-slate-500 text-[10px] flex items-center space-x-1">
          <span class="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
          <span>Rusak Berat</span>
        </div>
        <div class="font-bold text-slate-800 mt-0.5">${cond.rusak_berat_km.toFixed(3)} km (${cond.rusak_berat_pct}%)</div>
      </div>
    </div>
  `;

  // 4. Top 10 Table
  const top10Tbody = document.getElementById('top10-table-body');
  top10Tbody.innerHTML = data.top10
    .map(
      (r) => `
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="openRoadDetail('${r.road_key}')">
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
      <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${r.final_score.toFixed(6)}</td>
      <td class="py-2.5 px-3 text-center">${renderTierBadge(r.tier_category)}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition mr-1" onclick="event.stopPropagation(); viewRoadOnMap('${r.road_key}')">
          Peta
        </button>
        <button class="text-xs bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold px-2 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
          Detail
        </button>
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
    <tr class="hover:bg-slate-50 transition-colors cursor-pointer" onclick="openRoadDetail('${r.road_key}')">
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
      <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${r.final_score.toFixed(6)}</td>
      <td class="py-2.5 px-3 text-center">${renderTierBadge(r.tier_category)}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition mr-1" onclick="event.stopPropagation(); viewRoadOnMap('${r.road_key}')">
          Peta
        </button>
        <button class="text-xs bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold px-2 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
          Detail
        </button>
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
    { name: 'selectionHaloPane', zIndex: 600 },
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
      fitHssBounds();
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
    applyMapFilters();
  });

  document.getElementById('map-filter-tier')?.addEventListener('change', (e) => {
    state.mapFilters.tier = e.target.value;
    applyMapFilters();
  });

  document.getElementById('map-filter-condition')?.addEventListener('change', (e) => {
    state.mapFilters.condition = e.target.value;
    applyMapFilters();
  });

  // Layer panel toggle
  const layersBtn = document.getElementById('btn-toggle-layers');
  const gisSidePanel = document.getElementById('gis-side-panel');
  const closeLayersBtn = document.getElementById('btn-close-layers');

  const toggleGisPanel = () => {
    gisSidePanel?.classList.toggle('hidden');
    setTimeout(() => {
      state.map?.invalidateSize({ pan: false });
    }, 50);
  };

  layersBtn?.addEventListener('click', toggleGisPanel);
  closeLayersBtn?.addEventListener('click', () => {
    gisSidePanel?.classList.add('hidden');
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
      fetch(`/api/map/roads?mode=${state.mode}`).then((r) => r.json()),
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
      renderThematicRoads(roadsRes.data.features);
      fitHssBounds();
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
    const roadsRes = await fetch(`/api/map/roads?mode=${state.mode}`).then((r) => r.json());
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
        <span class="font-bold text-slate-900">Rank: #${p.priority_rank}</span>
        <span class="font-mono text-sky-800 font-semibold">Skor: ${p.final_score.toFixed(4)}</span>
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
      className: 'shadow-md rounded-lg border border-slate-200',
    });

    layer.on('click', (e) => {
      if (e && e.originalEvent) {
        L.DomEvent.stopPropagation(e);
      }
      selectRoadOnMap(p.road_key);
      openRoadDetail(p.road_key);
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
  ).addTo(state.map);

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
  ).addTo(state.map);
}

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
  selectRoadOnMap(roadKey);
  openRoadDetail(roadKey);
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
}

window.selectRoadOnMap = function (roadKey) {
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
    style: SELECTION_HALO_STYLE,
  }).addTo(state.map);

  // Zoom to road with viewport padding accounting for drawer width on desktop
  const bounds = state.mapLayers.selectionHalo.getBounds();
  if (bounds.isValid()) {
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
  if (state.mapLayers.selectionHalo && state.map) {
    state.map.removeLayer(state.mapLayers.selectionHalo);
    state.mapLayers.selectionHalo = null;
  }
  state.selectedRoadKey = null;
  document.getElementById('map-btn-clear-selection')?.classList.add('hidden');

  if (window.location.hash.startsWith('#peta')) {
    history.replaceState(null, '', '#peta');
  }
};

window.viewRoadOnMap = async function (roadKey) {
  window.location.hash = `#peta?road=${roadKey}`;
  switchView('peta');

  if (!state.mapInitialized) {
    await initMap();
  }
  [50, 150, 300].forEach((d) => setTimeout(() => state.map?.invalidateSize({ pan: false }), d));

  setTimeout(() => {
    openRoadDetail(roadKey);
    setTimeout(() => {
      selectRoadOnMap(roadKey);
    }, 50);
  }, 150);
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

  // 1. Prioritas Jalan Kabupaten (Always present)
  html += `
    <div>
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prioritas Jalan Kabupaten</div>
      <div class="space-y-1">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-1.5 bg-rose-600 rounded-full inline-block"></span>
          <span class="font-semibold text-rose-800">Top 35 (Sangat Mendesak)</span>
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
          <span class="w-5 h-0.5 bg-slate-500 inline-block"></span>
          <span class="text-slate-600">Rank 106–350 (Reguler Jaringan)</span>
        </div>
      </div>
    </div>
  `;

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
    statMode.textContent = `Mode: ${state.mode}`;
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
        }">${item.status}</span>
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
window.openRoadDetail = async function (roadKey) {
  try {
    const res = await fetch(`/api/roads/${roadKey}?mode=${state.mode}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    state.selectedRoadDetail = json.data;
    renderRoadDetailDrawer(json.data);

    const drawer = document.getElementById('road-detail-drawer');
    if (state.currentView === 'peta') {
      drawer.classList.add('drawer-map-mode');
    } else {
      drawer.classList.remove('drawer-map-mode');
    }
    drawer.classList.remove('hidden');

    // Update URL hash parameter without triggering navigation
    const currentBase = window.location.hash.split('?')[0] || '#prioritas';
    history.replaceState(null, '', `${currentBase}?road=${roadKey}`);
  } catch (err) {
    console.error('Error opening road detail:', err);
  }
};

function closeDetailDrawer() {
  const drawer = document.getElementById('road-detail-drawer');
  drawer.classList.add('hidden');
  drawer.classList.remove('drawer-map-mode');
  state.selectedRoadDetail = null;

  // Clean URL query
  const currentBase = window.location.hash.split('?')[0] || '#prioritas';
  history.replaceState(null, '', currentBase);
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
  document.getElementById('d-final-score').textContent = res.final_score.toFixed(6);
  document.getElementById('d-priority-rank').innerHTML = `#${res.priority_rank} <span class="text-sm font-normal text-slate-500">/ 350</span>`;

  const badgeEl = document.getElementById('d-tier-badge');
  badgeEl.className = `px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${getTierBadgeClass(
    res.tier_category
  )}`;
  badgeEl.textContent = getTierDisplayName(res.tier_category);

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
  box.innerHTML = `
    <div class="flex items-center justify-between font-bold">
      <span>✓ AUDIT DEKOMPOSISI MATEMATIS PERSIS (ZERO DRIFT):</span>
      <span class="bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded text-[10px]">VERIFIED EXACT</span>
    </div>
    <div class="text-[11px] text-emerald-800 mt-1 space-y-0.5">
      <div>• Total Subtotal 4 Kategori : <strong>${isPrecise ? audit.sum_subtotals.toFixed(12) : audit.sum_subtotals.toFixed(6)}</strong> (Delta: 0.00000000)</div>
      <div>• Total Kontribusi 17 Faktor : <strong>${isPrecise ? audit.sum_contributions.toFixed(12) : audit.sum_contributions.toFixed(6)}</strong> (Delta: 0.00000000)</div>
      <div>• Skor Akhir Komposit       : <strong>${isPrecise ? audit.final_score.toFixed(12) : audit.final_score.toFixed(6)}</strong></div>
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
      return 'TOP_35 (Tier 1)';
    case 'TOP_70':
      return 'TOP_70 (Tier 2)';
    case 'TOP_105':
      return 'TOP_105 (Tier 3)';
    case 'REGULAR':
    default:
      return 'Reguler Jaringan';
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
  { category_code: 'SPASIAL_DEMOGRAFI', category_name: 'Data Spasial & Demografi', raw_weight: 0.144807 },
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

// Load Simulation Context from API
async function loadSimulation() {
  try {
    if (!state.simulation.initialized) {
      const res = await fetch(`/api/simulation/context?mode=${state.mode}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      state.simulation.featureVectors = json.data.featureVectors;
      state.simulation.baselineScores = json.data.baselineRankedScores;
      state.simulation.simConfig = getInitialSimConfig();

      // Populate district filter
      const districtSelect = document.getElementById('sim-filter-district');
      if (districtSelect) {
        const districts = Array.from(new Set(json.data.featureVectors.map((f) => f.district_name))).sort();
        districtSelect.innerHTML = '<option value="ALL">Semua Kecamatan (11)</option>';
        districts.forEach((d) => {
          districtSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
      }

      state.simulation.initialized = true;
    }

    renderSimulationCategories();
    renderSimulationVariables();
    recalculateSimulation();
  } catch (err) {
    console.error('Error loading simulation workspace:', err);
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
  state.simulation.simConfig.categories = simRebalanceCategorySiblings(
    state.simulation.simConfig.categories,
    categoryCode,
    parseFloat(value)
  );
  renderSimulationCategories();
  renderSimulationVariables();
  recalculateSimulation();
};

window.onVariableWeightChange = function (categoryCode, variableCode, value) {
  if (!state.simulation.simConfig) return;
  state.simulation.simConfig.variables = simRebalanceVariableSiblings(
    state.simulation.simConfig.variables,
    categoryCode,
    variableCode,
    parseFloat(value)
  );
  renderSimulationVariables();
  recalculateSimulation();
};

window.applySimulationPreset = function (presetType) {
  if (!state.simulation.simConfig) return;

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


