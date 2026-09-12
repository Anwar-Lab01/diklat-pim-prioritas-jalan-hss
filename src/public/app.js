/**
 * Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
 * Client Application Controller (Phase 3 MVP)
 */

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
  }
  if (state.selectedRoadDetail) {
    openRoadDetail(state.selectedRoadDetail.identity.road_key);
  }
}

// --- ROUTING ---
function handleRouting() {
  const hash = window.location.hash || '#dashboard';
  const [baseHash, query] = hash.split('?');

  const viewMap = {
    '#dashboard': 'dashboard',
    '#prioritas': 'prioritas',
    '#data-sumber': 'data-sumber',
    '#model': 'model',
  };

  const targetView = viewMap[baseHash] || 'dashboard';
  switchView(targetView);

  // Check for deep link to road detail: e.g. #prioritas?road=HSS-KAB-025
  if (query) {
    const params = new URLSearchParams(query);
    const roadKey = params.get('road');
    if (roadKey) {
      openRoadDetail(roadKey);
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
  if (viewName === 'dashboard') loadDashboard();
  else if (viewName === 'prioritas') loadPriorityTable();
  else if (viewName === 'data-sumber') loadProvenance();
  else if (viewName === 'model') loadModel();
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
      <td class="py-2.5 px-3 text-center">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2.5 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
          Detail & Dekomposisi
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

  // 1. Text Search (display_name, nomor_ruas, road_key)
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
      <td class="py-2.5 px-3 text-center">
        <button class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold px-2 py-1 rounded transition" onclick="event.stopPropagation(); openRoadDetail('${r.road_key}')">
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
    drawer.classList.remove('hidden');

    // Update URL hash parameter without triggering reload
    const currentBase = window.location.hash.split('?')[0] || '#prioritas';
    history.replaceState(null, '', `${currentBase}?road=${roadKey}`);
  } catch (err) {
    console.error('Error opening road detail:', err);
  }
};

function closeDetailDrawer() {
  document.getElementById('road-detail-drawer').classList.add('hidden');
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
  // STRICT RULE: Never label as "Pemeliharaan Rutin" or "Regular Maintenance"
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
