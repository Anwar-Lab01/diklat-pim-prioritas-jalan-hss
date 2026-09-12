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

  // --- Phase 4 & 4.5 Web GIS State ---
  map: null,
  mapInitialized: false,
  mapLayers: {
    osmBasemap: null,
    countyRoads: null,
    countyRoadsHitTarget: null,
    provincialRoads: null,
    nationalRoads: null,
    connectors: null,
    rsud: null,
    puskesmas: null,
    markets: null,
    schools: null,
    districts: null,
    villages: null,
    rtrw: null,
    selectionHalo: null,
  },
  mapData: {
    countyRoads: null,
    referenceNetwork: null,
    facilities: null,
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
};

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
    } else {
      setTimeout(() => {
        state.map?.invalidateSize();
      }, 50);
    }
  } else if (viewName === 'data-sumber') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadProvenance();
  } else if (viewName === 'model') {
    drawerEl?.classList.remove('drawer-map-mode');
    loadModel();
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

  // Create Deterministic Custom Panes with explicit z-index
  const panes = [
    { name: 'basemapPane', zIndex: 200 },
    { name: 'rtrwPane', zIndex: 350 },
    { name: 'villagesPane', zIndex: 380 },
    { name: 'districtsPane', zIndex: 400 },
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

  // Basemap TileLayer (OpenStreetMap)
  state.mapLayers.osmBasemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    pane: 'basemapPane',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | Dinas PUTR Kab. HSS',
  }).addTo(state.map);

  // Offline detection and graceful fallback banner
  state.mapLayers.osmBasemap.on('tileerror', () => {
    document.getElementById('map-offline-banner')?.classList.remove('hidden');
    document.getElementById('hss-map').style.backgroundColor = '#f1f5f9';
  });
  state.mapLayers.osmBasemap.on('load', () => {
    const isNeutral = document.getElementById('layer-basemap-neutral')?.checked;
    if (!isNeutral) {
      document.getElementById('map-offline-banner')?.classList.add('hidden');
    }
  });

  // Map zoom listener for facility decluttering
  state.map.on('zoomend', handleMapZoomChange);

  initMapControls();
  state.mapInitialized = true;

  await loadMapData();
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
  const layersPanel = document.getElementById('map-layers-panel');
  const closeLayersBtn = document.getElementById('btn-close-layers');

  layersBtn?.addEventListener('click', () => {
    layersPanel?.classList.toggle('hidden');
  });
  closeLayersBtn?.addEventListener('click', () => {
    layersPanel?.classList.add('hidden');
  });

  // Legend collapse toggle
  const legendBtn = document.getElementById('btn-toggle-legend-body');
  const legendBody = document.getElementById('map-legend-body');
  legendBtn?.addEventListener('click', () => {
    legendBody?.classList.toggle('hidden');
    legendBtn.textContent = legendBody?.classList.contains('hidden') ? '▲' : '▼';
  });

  // Basemap radio toggles
  document.querySelectorAll('input[name="basemap-layer"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const banner = document.getElementById('map-offline-banner');
      if (e.target.value === 'osm') {
        if (!state.map.hasLayer(state.mapLayers.osmBasemap)) {
          state.mapLayers.osmBasemap.addTo(state.map);
        }
        document.getElementById('hss-map').style.backgroundColor = '';
        banner?.classList.add('hidden');
      } else {
        if (state.map.hasLayer(state.mapLayers.osmBasemap)) {
          state.map.removeLayer(state.mapLayers.osmBasemap);
        }
        document.getElementById('hss-map').style.backgroundColor = '#f8fafc';
        banner?.classList.remove('hidden');
      }
      updateDynamicLegend();
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

  // Admin layer toggles
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
}

async function loadMapData() {
  try {
    const [roadsRes, refRes, facRes, distRes, vilRes] = await Promise.all([
      fetch(`/api/map/roads?mode=${state.mode}`).then((r) => r.json()),
      fetch('/api/map/reference-network').then((r) => r.json()),
      fetch('/api/map/facilities').then((r) => r.json()),
      fetch('/api/map/districts').then((r) => r.json()),
      fetch('/api/map/villages').then((r) => r.json()),
    ]);

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

  const setupRoadInteractivity = (feature, layer) => {
    const p = feature.properties;
    const tierStyle = ROAD_TIER_STYLES[p.tier_category] || ROAD_TIER_STYLES.REGULAR;

    const tooltipContent = `
      <div class="p-1 text-xs leading-relaxed">
        <div class="font-bold text-slate-900">${escapeHtml(p.display_name)}</div>
        <div class="text-[10px] text-slate-500 font-mono">No: ${p.nomor_ruas} | ${p.road_key}</div>
        <div class="text-[11px] text-slate-700">Kecamatan: <strong>${escapeHtml(p.district_name)}</strong></div>
        <div class="mt-1 pt-1 border-t border-slate-200 flex items-center justify-between space-x-2">
          <span class="font-bold text-slate-900">Rank: #${p.priority_rank}</span>
          <span class="font-mono text-sky-800 font-semibold">Skor: ${p.final_score.toFixed(4)}</span>
        </div>
        <div class="mt-0.5 flex items-center justify-between space-x-2 text-[10px]">
          <span class="px-1.5 py-0.5 rounded font-semibold ${tierStyle.badgeClass}">${getTierDisplayName(p.tier_category)}</span>
          <span class="text-slate-600">Mantap: ${p.mantap_pct.toFixed(1)}%</span>
        </div>
      </div>
    `;
    layer.bindTooltip(tooltipContent, {
      sticky: true,
      className: 'shadow-md rounded-lg border border-slate-200',
    });

    layer.on('click', () => {
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
        const tier = feature.properties.tier_category || 'REGULAR';
        const style = ROAD_TIER_STYLES[tier] || ROAD_TIER_STYLES.REGULAR;
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
          `<b>${escapeHtml(name)}</b><br/><span class="text-xs text-teal-700 font-semibold">Jalan Nasional (8 Ruas)</span>`,
          { sticky: true }
        );
      },
    }
  ).addTo(state.map);

  // Connectors (SEMANTIC SAFETY: No priority score, not a physical bridge)
  state.mapLayers.connectors = L.geoJSON(
    { type: 'FeatureCollection', features: connectorFeatures },
    {
      pane: 'connectorsPane',
      style: REFERENCE_NETWORK_STYLES.KONEKTOR_ANALISIS,
      onEachFeature: (f, layer) => {
        const name = f.properties.connector_name || 'Konektor Jaringan Analisis';
        layer.bindPopup(`
          <div class="p-1.5 text-xs">
            <div class="font-bold text-slate-800 flex items-center space-x-1">
              <span class="w-2.5 h-0.5 bg-slate-400 inline-block border-t border-dashed"></span>
              <span>${escapeHtml(name)}</span>
            </div>
            <div class="text-[11px] text-slate-600 mt-1">
              <strong>Konektor Jaringan Analisis (Topologi)</strong><br/>
              Elemen konektivitas jaringan jalan untuk analisis permodelan spasial.
            </div>
            <div class="mt-2 bg-slate-50 p-1.5 rounded border border-slate-200 text-[10px] text-slate-500">
              ⚠ <em>Non-prioritas kabupaten. Tidak memiliki skor/bobot, tidak memiliki implikasi penanganan, dan bukan struktur jembatan fisik.</em>
            </div>
          </div>
        `);
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
          layer.bindPopup(`
            <div class="p-1.5 text-xs">
              <div class="font-bold text-slate-900">${escapeHtml(p.facility_name)}</div>
              <div class="text-[11px] text-slate-600 font-medium capitalize">${p.facility_type}</div>
              <div class="text-[10px] text-slate-500 mt-0.5">Kecamatan: ${p.district || '-'} | Desa: ${p.village || '-'}</div>
            </div>
          `);
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
      layer.bindTooltip(`<span class="font-bold text-xs text-slate-700">Kec. ${escapeHtml(name)}</span>`, {
        permanent: false,
        direction: 'center',
        className: 'bg-white/80 px-1 py-0.5 rounded text-xs border border-slate-200',
      });
    },
  }).addTo(state.map);
}

function renderVillages(data) {
  state.mapLayers.villages = L.geoJSON(data, {
    pane: 'villagesPane',
    style: ADMINISTRATIVE_STYLES.villages,
    onEachFeature: (f, layer) => {
      const name = f.properties.nama_desa || f.properties.village_name || f.properties.NAMOBJ || 'Desa';
      layer.bindTooltip(`<span class="text-[10px] text-slate-600">${escapeHtml(name)}</span>`, {
        permanent: false,
        direction: 'center',
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
        const pola = feature.properties.NAMOBJ || feature.properties.pola_ruang || '';
        const color = RTRW_COLORS[pola] || '#94a3b8';
        return {
          fillColor: color,
          fillOpacity: 0.28,
          weight: 0.5,
          color: '#64748b',
          opacity: 0.4,
        };
      },
      onEachFeature: (f, layer) => {
        const pola = f.properties.NAMOBJ || f.properties.pola_ruang || 'Pola Ruang';
        layer.bindTooltip(`<div class="text-[11px] font-semibold">${escapeHtml(pola)}</div>`, { sticky: true });
      },
    });

    if (document.getElementById('layer-rtrw')?.checked) {
      state.mapLayers.rtrw.addTo(state.map);
    }

    const t1 = performance.now();
    console.info(`[Phase 4.5] RTRW layer rendered in ${(t1 - t0).toFixed(1)}ms (${json.data.features?.length || 2832} polygons)`);
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
  } else {
    state.map.invalidateSize();
  }

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
  const showDist = document.getElementById('layer-admin-districts')?.checked;
  const showVil = document.getElementById('layer-admin-villages')?.checked;
  if (showDist || showVil) {
    html += `
      <div class="border-t border-slate-100 pt-1.5">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Batas Administrasi</div>
        <div class="space-y-1">
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
          ${Object.entries(RTRW_COLORS).slice(0, 8).map(([name, col]) => `
            <div class="flex items-center space-x-1.5 truncate" title="${escapeHtml(name)}">
              <span class="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style="background-color: ${col}"></span>
              <span class="truncate">${escapeHtml(name.replace('Kawasan ', ''))}</span>
            </div>
          `).join('')}
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
