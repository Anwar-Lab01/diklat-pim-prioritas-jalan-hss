/**
 * SIAP JALAN HSS — Phase 3: ASB Treatment Selection & Mathematical Budget Optimization Module
 * Deterministic ILP 0-1 Knapsack Solver (Martello-Toth LP Relaxation Bounds),
 * Multi-Ceiling Scenario Simulation, Operational Status Classification,
 * Road Serviceability Impact Analysis, and Complete Auditable Register.
 */

(function () {
  'use strict';

  // Module State
  const state = {
    scenarios: [],
    currentScenarioId: null,
    scenarioDetail: null,
    roadSummaries: [],
    loading: false,
    error: null,
    activeTab: 'rekap-ruas', // 'rekap-ruas' | 'optimasi-matematis' | 'register-tertunda' | 'perbandingan' | 'katalog-asb' | 'katalog-ahsp' | 'aturan-r01-r06'
    filters: {
      search: '',
      district: '',
      isFunded: '',
      dominantType: '',
      opStatus: '',
    },
    pagination: {
      page: 1,
      pageSize: 25,
      total: 0,
    },
    selectedRoadDetail: null,
    catalog: {
      asbSearch: '',
      asbCategory: '',
      asbType: '',
      asbItems: [],
      ahspSearch: '',
      ahspDivision: '',
      ahspItems: [],
      rules: [],
    },
    comparisonData: [],
    optimization: {
      objective: 'PRIORITY_WEIGHTED',
      comparison: null,
    },
    deferred: {
      filterStatus: '',
      items: [],
    },
  };

  const objectiveLabels = {
    GREEDY_BENCHMARK: 'Urutan prioritas',
    PRIORITY_WEIGHTED: 'Manfaat berbobot prioritas',
    MAX_LENGTH: 'Panjang jalan tertangani',
    PRIORITY_RESPECTING: 'Hierarki prioritas',
  };
  const solverStatusLabels = {
    BENCHMARK_GREEDY: 'Alokasi berdasarkan urutan prioritas',
    OPTIMAL: 'Solusi optimal',
    FEASIBLE: 'Solusi layak',
    INFEASIBLE: 'Tidak ada solusi yang memenuhi batasan',
  };

  // Helper Formatters
  function formatRp(val) {
    if (val === undefined || val === null || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Math.round(Number(val)).toLocaleString('id-ID');
  }

  function formatKm(val) {
    if (val === undefined || val === null || isNaN(val)) return '0,00 km';
    return Number(val).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
  }

  function formatPct(val) {
    if (val === undefined || val === null || isNaN(val)) return '0,0%';
    return Number(val).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // API Callers
  async function apiFetch(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        ...options,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Fetch Error [${endpoint}]:`, err);
      throw err;
    }
  }

  // Idempotency Guards
  let isInitialized = false;
  let listenersAttached = false;

  // Public Initialization
  async function initAsbCostingModule(forceReload = false) {
    if (isInitialized && !forceReload) {
      if (!listenersAttached) {
        setupEventListeners();
        listenersAttached = true;
      }
      renderAll();
      return;
    }

    console.log('[ASB Module] Initializing Costing & Mathematical Optimization Module...');
    try {
      showLoading(true);
      await fetchScenarios();
      if (state.scenarios.length > 0) {
        // Default to active scenario or first scenario if not already selected
        if (!state.currentScenarioId || !state.scenarios.some((s) => s.scenario_id === state.currentScenarioId)) {
          const active = state.scenarios.find((s) => s.scenario_status === 'ACTIVE') || state.scenarios[0];
          await selectScenario(active.scenario_id);
        } else {
          await selectScenario(state.currentScenarioId);
        }
      }
      if (!listenersAttached) {
        setupEventListeners();
        listenersAttached = true;
      }
      isInitialized = true;
    } catch (err) {
      showError('Gagal memuat modul ASB: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchScenarios() {
    const res = await apiFetch('/api/costing/scenarios');
    state.scenarios = res.data || [];
    renderScenarioDropdown();
  }

  async function selectScenario(scenarioId) {
    state.currentScenarioId = scenarioId;
    state.pagination.page = 1;
    showLoading(true);
    try {
      const [detailRes, roadsRes] = await Promise.all([
        apiFetch(`/api/costing/scenarios/${scenarioId}`),
        apiFetch(`/api/costing/scenarios/${scenarioId}/roads`),
      ]);
      state.scenarioDetail = detailRes.data;
      state.roadSummaries = roadsRes.data || [];
      state.pagination.total = state.roadSummaries.length;
      renderAll();

      // If active tab requires extra data, refresh it
      if (state.activeTab === 'optimasi-matematis') {
        fetchComparisonMethods();
      } else if (state.activeTab === 'register-tertunda') {
        fetchDeferredRegister();
      } else if (state.activeTab === 'perbandingan') {
        fetchComparisonData();
      }
    } catch (err) {
      showError('Gagal memuat detail skenario: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function recalculateCurrentScenario() {
    if (!state.currentScenarioId) return;
    const btn = document.getElementById('asb-btn-recalculate');
    if (btn) btn.disabled = true;
    showLoading(true);
    try {
      await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/calculate`, {
        method: 'POST',
      });
      await selectScenario(state.currentScenarioId);
      showToast('Kalkulasi skenario berhasil diperbarui!', 'success');
    } catch (err) {
      showError('Gagal melakukan kalkulasi: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
      showLoading(false);
    }
  }

  async function runOptimization(objective) {
    if (!state.currentScenarioId) return;
    const btn = document.getElementById('asb-btn-run-solver');
    if (btn) btn.disabled = true;
    showLoading(true);
    try {
      const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/optimize`, {
        method: 'POST',
        body: JSON.stringify({ objective }),
      });
      await selectScenario(state.currentScenarioId);
      await fetchComparisonMethods();
      showToast(solverStatusLabels[res.data.solver_status] || 'Status alokasi belum tersedia',
        res.data.solver_status === 'INFEASIBLE' ? 'error' : 'success');
    } catch (err) {
      showError('Gagal menjalankan optimasi solver: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
      showLoading(false);
    }
  }

  async function fetchComparisonMethods() {
    if (!state.currentScenarioId) return;
    try {
      const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/compare-methods`);
      state.optimization.comparison = res.data;
      renderComparisonMatrix();
    } catch (err) {
      console.warn('Gagal memuat perbandingan 4 metode:', err.message);
    }
  }

  async function fetchDeferredRegister() {
    if (!state.currentScenarioId) return;
    try {
      showLoading(true);
      const params = new URLSearchParams();
      if (state.deferred.filterStatus) {
        params.set('operational_status', state.deferred.filterStatus);
      }
      const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/deferred-register?${params.toString()}`);
      state.deferred.items = res.data || [];
      renderDeferredTable();
    } catch (err) {
      showError('Gagal memuat register ruas tertunda: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchRoadDetail(roadKey) {
    if (!state.currentScenarioId || !roadKey) return;
    try {
      showLoading(true);
      const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/roads/${roadKey}`);
      state.selectedRoadDetail = res.data;
      renderRoadDetailModal();
    } catch (err) {
      showError('Gagal memuat rincian ruas: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchComparisonData() {
    try {
      showLoading(true);
      const res = await apiFetch('/api/costing/scenarios/compare');
      state.comparisonData = res.data || [];
      renderComparisonTable();
    } catch (err) {
      showError('Gagal memuat perbandingan skenario: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchASBCatalog() {
    try {
      showLoading(true);
      const params = new URLSearchParams();
      if (state.catalog.asbSearch) params.set('search', state.catalog.asbSearch);
      if (state.catalog.asbCategory) params.set('category', state.catalog.asbCategory);
      if (state.catalog.asbType) params.set('type', state.catalog.asbType);
      params.set('limit', '100');

      const res = await apiFetch(`/api/costing/reference/asb?${params.toString()}`);
      state.catalog.asbItems = res.data || [];
      renderASBCatalogTable();
    } catch (err) {
      showError('Gagal memuat katalog ASB: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchAHSPCatalog() {
    try {
      showLoading(true);
      const params = new URLSearchParams();
      if (state.catalog.ahspSearch) params.set('search', state.catalog.ahspSearch);
      if (state.catalog.ahspDivision) params.set('division', state.catalog.ahspDivision);
      params.set('limit', '100');

      const res = await apiFetch(`/api/costing/reference/ahsp?${params.toString()}`);
      state.catalog.ahspItems = res.data || [];
      renderAHSPCatalogTable();
    } catch (err) {
      showError('Gagal memuat katalog AHSP: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  async function fetchRulesCatalog() {
    try {
      showLoading(true);
      const res = await apiFetch('/api/costing/reference/rules');
      state.catalog.rules = res.data || [];
      renderRulesCatalogTable();
    } catch (err) {
      showError('Gagal memuat aturan penanganan: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  // Render Routines
  function renderAll() {
    renderScenarioDropdown();
    renderKpiSummary();
    renderBudgetProgressBar();
    renderRoadTable();
    renderSolverCertificate();
    renderConditionImpact();
    highlightPresetButtons();
  }

  function renderScenarioDropdown() {
    const select = document.getElementById('asb-scenario-select');
    if (!select) return;

    select.innerHTML = state.scenarios
      .map(
        (s) =>
          `<option value="${escapeHtml(s.scenario_id)}" ${
            s.scenario_id === state.currentScenarioId ? 'selected' : ''
          }>${escapeHtml(s.scenario_name)} (${s.budget_year}) [${s.scenario_status}]</option>`
      )
      .join('');
  }

  function renderKpiSummary() {
    const d = state.scenarioDetail;
    if (!d) return;

    const elTotalCost = document.getElementById('asb-kpi-total-cost');
    const elCeiling = document.getElementById('asb-kpi-ceiling');
    const elAllocated = document.getElementById('asb-kpi-allocated');
    const elFundedConstruction = document.getElementById('asb-kpi-funded-construction');
    const elRoutineManual = document.getElementById('asb-kpi-routine-manual');
    const elTreatedLength = document.getElementById('asb-kpi-treated-length');

    if (elTotalCost) elTotalCost.textContent = Number.isFinite(d.total_cost_rp) ? formatRp(d.total_cost_rp) : '—';
    if (elCeiling) elCeiling.textContent = formatRp(d.budget_ceiling_rp);
    if (elAllocated) elAllocated.textContent = formatRp(d.allocated_cost_rp);

    if (elFundedConstruction) {
      const count = d.funded_construction_roads ?? d.funded_roads ?? 0;
      elFundedConstruction.innerHTML = `<span class="text-emerald-800 font-bold">${count}</span> <span class="text-xs text-slate-400 font-normal">ruas</span>`;
    }

    if (elRoutineManual) {
      const routine = d.routine_maintenance_roads ?? 0;
      const manual = d.manual_review_roads ?? 0;
      const total = routine + manual;
      elRoutineManual.innerHTML = `<span class="text-slate-800 font-bold">${total}</span> <span class="text-xs text-slate-400 font-normal">ruas</span>`;
      const elSub = document.getElementById('asb-kpi-routine-manual-subtext');
      if (elSub) {
        elSub.textContent = `${routine} Rutin (R06), ${manual} Review (12m)`;
      }
    }

    if (elTreatedLength) {
      // In scenario detail, treated_length_km is the allocated treated length
      elTreatedLength.textContent = formatKm(d.allocated_treated_length_km ?? d.treated_length_km);
    }

    // Subtitle meta
    const elMeta = document.getElementById('asb-scenario-meta-desc');
    if (elMeta) elMeta.textContent = d.description || 'Estimasi penanganan jalan berdasarkan standar ASB BM 2027.';

    const elSubtext = document.getElementById('asb-kpi-total-cost-subtext');
    if (elSubtext) {
      elSubtext.textContent = `${(d.treated_segments || 0).toLocaleString('id-ID')} segmen ASB, ${d.manual_review_segments || 0} review manual`;
    }
  }

  function renderBudgetProgressBar() {
    const d = state.scenarioDetail;
    if (!d) return;

    const ceiling = d.budget_ceiling_rp || 1;
    const allocated = d.allocated_cost_rp || 0;
    const totalReq = d.total_cost_rp || 0;

    const pctCeilingUsed = Math.min(100, (allocated / ceiling) * 100);
    const pctTotalCovered = Math.min(100, (allocated / totalReq) * 100);

    const barAllocated = document.getElementById('asb-progress-bar-allocated');
    const txtAllocated = document.getElementById('asb-progress-txt-allocated');
    const txtRemaining = document.getElementById('asb-progress-txt-remaining');
    const txtCoverage = document.getElementById('asb-progress-txt-coverage');

    if (barAllocated) barAllocated.style.width = `${pctCeilingUsed.toFixed(1)}%`;
    if (txtAllocated) txtAllocated.textContent = `${formatRp(allocated)} (${pctCeilingUsed.toFixed(1)}% dari plafon)`;
    if (txtRemaining) {
      const remaining = Math.max(0, ceiling - allocated);
      txtRemaining.textContent = `Sisa Plafon: ${formatRp(remaining)}`;
    }
    if (txtCoverage) {
      txtCoverage.textContent = `Cakupan Kebutuhan Indikatif: ${pctTotalCovered.toFixed(1)}%`;
    }
  }

  function renderSolverCertificate() {
    const d = state.scenarioDetail;
    if (!d) return;

    const status = d.solver_status;
    const badge = document.getElementById('asb-solver-status-badge');
    badge.textContent = solverStatusLabels[status] || 'Belum tersedia';
    badge.classList.toggle('text-emerald-300', status === 'OPTIMAL');
    badge.classList.toggle('text-amber-300', status === 'FEASIBLE' || status === 'INFEASIBLE');

    const metrics = document.getElementById('asb-solver-metrics');
    metrics.classList.toggle('hidden', status !== 'OPTIMAL' && status !== 'FEASIBLE');
    document.getElementById('asb-solver-gap').textContent = Number.isFinite(d.solver_gap_pct)
      ? `${d.solver_gap_pct.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%` : '—';
    document.getElementById('asb-solver-nodes').textContent = d.solver_nodes?.toLocaleString('id-ID') ?? '—';
    document.getElementById('asb-solver-runtime').textContent = Number.isFinite(d.solver_runtime_ms)
      ? `${d.solver_runtime_ms.toLocaleString('id-ID')} ms` : '—';

    // Sync radio button
    const objective = d.optimization_objective || 'PRIORITY_WEIGHTED';
    const radio = document.querySelector(`input[name="asb_optimization_objective"][value="${objective}"]`);
    if (radio) {
      radio.checked = true;
      syncObjectiveCardStyles(objective);
    }
  }

  function renderConditionImpact() {
    const d = state.scenarioDetail;
    if (!d) return;

    const elTreatedKm = document.getElementById('asb-impact-treated-km');
    const elTreatedPct = document.getElementById('asb-impact-treated-pct');
    const elRemainingKm = document.getElementById('asb-impact-remaining-km');

    // 336.29 km is authoritative network damaged length eligible for ASB standardization (53.64% mantap 392.89 km, 339.57 km total rusak, 3.28 km review manual)
    const totalDamagedKm = 336.29;
    const treatedKm = d.allocated_treated_length_km ?? d.treated_length_km ?? 0;
    const remainingKm = Math.max(0, totalDamagedKm - treatedKm);
    const pctOfDamaged = (treatedKm / totalDamagedKm) * 100;

    if (elTreatedKm) elTreatedKm.textContent = formatKm(treatedKm);
    if (elTreatedPct) elTreatedPct.textContent = `${pctOfDamaged.toFixed(1)}% dari target ASB (336,29 km)`;
    if (elRemainingKm) elRemainingKm.textContent = formatKm(remainingKm);
  }

  function highlightPresetButtons() {
    const d = state.scenarioDetail;
    if (!d) return;

    const ceiling = d.budget_ceiling_rp;
    document.querySelectorAll('.asb-preset-btn').forEach((btn) => {
      const amt = Number(btn.dataset.amount);
      if (amt === ceiling) {
        btn.classList.add('bg-sky-600', 'text-white', 'border-sky-700', 'shadow-xs');
        btn.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-sky-100');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'border-sky-700', 'shadow-xs');
        btn.classList.add('bg-slate-100', 'text-slate-700', 'hover:bg-sky-100');
      }
    });
  }

  function syncObjectiveCardStyles(selectedObjective) {
    document.querySelectorAll('.asb-opt-card').forEach((card) => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio && radio.value === selectedObjective) {
        card.classList.add('border-sky-400', 'bg-sky-50/50', 'ring-1', 'ring-sky-400');
        card.classList.remove('border-slate-200');
      } else {
        card.classList.remove('border-sky-400', 'bg-sky-50/50', 'ring-1', 'ring-sky-400');
        card.classList.add('border-slate-200');
      }
    });
  }

  function getFilteredRoads() {
    return state.roadSummaries.filter((r) => {
      if (state.filters.district && r.district_name !== state.filters.district) {
        return false;
      }
      if (state.filters.opStatus && r.operational_status !== state.filters.opStatus) {
        return false;
      }
      if (state.filters.isFunded !== '') {
        const fundedNum = Number(state.filters.isFunded);
        if (r.is_funded !== fundedNum) return false;
      }
      if (state.filters.dominantType && r.dominant_asb_type !== state.filters.dominantType) {
        return false;
      }
      if (state.filters.search) {
        const q = state.filters.search.toLowerCase();
        const matchName = (r.road_name || '').toLowerCase().includes(q);
        const matchKey = (r.road_key || '').toLowerCase().includes(q);
        if (!matchName && !matchKey) return false;
      }
      return true;
    });
  }

  function getStatusBadge(operationalStatus, isFunded) {
    switch (operationalStatus) {
      case 'FUNDED_CONSTRUCTION':
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">KONSTRUKSI DIDANAI</span>';
      case 'ROUTINE_MAINTENANCE':
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">PEMELIHARAAN RUTIN (Rp 0)</span>';
      case 'MANUAL_TECHNICAL_REVIEW':
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">REVIEW MANUAL (>5m)</span>';
      case 'DEFERRED_BY_BUDGET':
      default:
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">TERTUNDA ANGGARAN</span>';
    }
  }

  function renderRoadTable() {
    const tbody = document.getElementById('asb-road-table-body');
    if (!tbody) return;

    const filtered = getFilteredRoads();
    state.pagination.total = filtered.length;

    const startIdx = (state.pagination.page - 1) * state.pagination.pageSize;
    const paged = filtered.slice(startIdx, startIdx + state.pagination.pageSize);

    if (paged.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="px-4 py-8 text-center text-sm text-slate-500">
            Tidak ada ruas jalan yang sesuai dengan kriteria filter pencarian.
          </td>
        </tr>
      `;
      renderPaginationControls(0);
      return;
    }

    tbody.innerHTML = paged
      .map((r) => {
        const opStatus = r.operational_status || (r.is_funded === 1 ? 'FUNDED_CONSTRUCTION' : 'DEFERRED_BY_BUDGET');
        const badgeHtml = getStatusBadge(opStatus, r.is_funded);

        const asbTypeLabels = {
          D: 'Tipe D (R01)',
          C: 'Tipe C (R02/R03)',
          B: 'Tipe B (R04)',
          A: 'Tipe A (R05)',
        };
        let asbTypeBadge = r.dominant_asb_type !== 'NONE'
          ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-800">${asbTypeLabels[r.dominant_asb_type] || `Tipe ${escapeHtml(r.dominant_asb_type)}`}</span>`
          : `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Rutin (R06)</span>`;

        if (r.manual_review_segments && r.manual_review_segments > 0) {
          asbTypeBadge += `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 ml-1 block mt-0.5" title="${r.manual_review_segments} segmen lebar > 5m butuh review teknis manual/DED">Review Manual (${r.manual_review_segments} seg)</span>`;
        }

        const allocatedPagu = r.allocated_pagu_rp !== undefined ? r.allocated_pagu_rp : (r.is_funded === 1 ? r.total_pagu_asb_rp : 0);
        const allocatedKm = r.allocated_treated_length_km !== undefined ? r.allocated_treated_length_km : (r.is_funded === 1 ? r.treated_length_km : 0);

        return `
          <tr class="hover:bg-slate-50 border-b border-slate-200 transition-colors ${opStatus === 'FUNDED_CONSTRUCTION' ? 'bg-emerald-50/20' : ''}">
            <td class="px-3 py-2.5 text-xs font-mono font-bold text-center text-slate-600">
              #${r.allocation_rank || '-'}
            </td>
            <td class="px-3 py-2.5 text-xs font-mono font-medium text-slate-700 whitespace-nowrap">
              ${escapeHtml(r.road_key)}
            </td>
            <td class="px-3 py-2.5">
              <div class="text-xs font-bold text-slate-900">${escapeHtml(r.road_name)}</div>
              <div class="text-[11px] text-slate-500">${escapeHtml(r.district_name || 'HSS')}</div>
            </td>
            <td class="px-3 py-2.5 text-xs text-center whitespace-nowrap">
              <span class="font-bold text-sky-700">#${r.priority_rank ?? '-'}</span>
              <span class="text-[10px] text-slate-400 block">${r.composite_score ? r.composite_score.toFixed(4) : '-'}</span>
            </td>
            <td class="px-3 py-2.5 text-xs text-right whitespace-nowrap font-mono text-slate-700">
              ${formatKm(r.total_length_km)}
            </td>
            <td class="px-3 py-2.5 text-xs text-right whitespace-nowrap">
              <div class="font-semibold ${allocatedKm > 0 ? 'text-emerald-700' : 'text-slate-500'}">${formatKm(allocatedKm)}</div>
              <div class="text-[10px] text-slate-400">Kebutuhan: ${formatKm(r.treated_length_km)}</div>
            </td>
            <td class="px-3 py-2.5 text-xs text-center whitespace-nowrap">
              ${asbTypeBadge}
              <span class="text-[10px] text-slate-500 block">${r.treated_segments} segmen ASB</span>
            </td>
            <td class="px-3 py-2.5 text-xs text-right font-medium text-slate-700 whitespace-nowrap font-mono">
              ${formatRp(r.total_pagu_asb_rp)}
            </td>
            <td class="px-3 py-2.5 text-xs text-right font-bold whitespace-nowrap font-mono ${allocatedPagu > 0 ? 'text-emerald-700' : 'text-slate-400'}">
              ${formatRp(allocatedPagu)}
            </td>
            <td class="px-3 py-2.5 text-center whitespace-nowrap">
              ${badgeHtml}
            </td>
            <td class="px-3 py-2.5 text-center whitespace-nowrap">
              <button 
                type="button" 
                class="asb-btn-road-detail px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors shadow-xs"
                data-road-key="${escapeHtml(r.road_key)}"
              >
                Rincian
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    renderPaginationControls(filtered.length);
  }

  function renderPaginationControls(total) {
    const el = document.getElementById('asb-table-pagination');
    if (!el) return;

    const totalPages = Math.max(1, Math.ceil(total / state.pagination.pageSize));
    const currentPage = state.pagination.page;

    const start = total === 0 ? 0 : (currentPage - 1) * state.pagination.pageSize + 1;
    const end = Math.min(total, currentPage * state.pagination.pageSize);

    el.innerHTML = `
      <div class="text-xs text-slate-500">
        Menampilkan <span class="font-bold text-slate-700">${start}</span> - <span class="font-bold text-slate-700">${end}</span> dari <span class="font-bold text-slate-700">${total}</span> ruas
      </div>
      <div class="flex items-center space-x-2">
        <button 
          id="asb-pg-prev" 
          class="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          ${currentPage <= 1 ? 'disabled' : ''}
        >
          &larr; Sebelumnya
        </button>
        <span class="text-xs font-semibold text-slate-700">Halaman ${currentPage} / ${totalPages}</span>
        <button 
          id="asb-pg-next" 
          class="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          ${currentPage >= totalPages ? 'disabled' : ''}
        >
          Selanjutnya &rarr;
        </button>
      </div>
    `;

    const prevBtn = document.getElementById('asb-pg-prev');
    const nextBtn = document.getElementById('asb-pg-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.pagination.page > 1) {
          state.pagination.page--;
          renderRoadTable();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.pagination.page < totalPages) {
          state.pagination.page++;
          renderRoadTable();
        }
      });
    }
  }

  // 4-Method Allocation Matrix Rendering
  function renderComparisonMatrix() {
    const tbody = document.getElementById('asb-solver-comparison-tbody');
    if (!tbody || !state.optimization.comparison) return;

    const data = state.optimization.comparison;
    const methods = data.comparison || Object.values(data.methods || {}).map((m) => ({
      optimization_objective: m.objective_mode || m.optimization_objective,
      budget_ceiling_rp: m.budget_ceiling_rp,
      allocated_cost_rp: m.allocated_cost_rp,
      remaining_ceiling_rp: m.remaining_budget_rp ?? (m.budget_ceiling_rp - m.allocated_cost_rp),
      allocated_treated_length_km: m.treated_length_km ?? m.allocated_treated_length_km ?? 0,
      priority_weighted_score: m.priority_weighted_score,
      funded_construction_roads: m.status_breakdown?.funded_construction_roads ?? m.funded_construction_roads ?? 0,
      routine_maintenance_roads: m.status_breakdown?.routine_maintenance_roads ?? m.routine_maintenance_roads ?? 0,
      manual_review_roads: m.status_breakdown?.manual_review_roads ?? m.manual_review_roads ?? 0,
      solver_status: m.solver_status,
    }));
    const currentObj = data.current_objective || state.optimization.objective || state.scenarioDetail?.optimization_objective;

    tbody.innerHTML = methods
      .map((m) => {
        const isCurrent = m.optimization_objective === currentObj;
        const absorptionPct = m.budget_ceiling_rp > 0 ? (m.allocated_cost_rp / m.budget_ceiling_rp) * 100 : 0;

        return `
          <tr class="hover:bg-slate-50 border-b border-slate-200 transition ${isCurrent ? 'bg-sky-50/60 font-semibold' : ''}">
            <td class="px-3 py-3">
              <div class="font-bold text-slate-900">${objectiveLabels[m.optimization_objective] || 'Metode belum tersedia'}</div>
              ${isCurrent ? '<span class="ml-1 text-[10px] font-bold text-sky-700">● Terpilih Saat Ini</span>' : ''}
            </td>
            <td class="px-3 py-3 text-right font-mono">${formatRp(m.budget_ceiling_rp)}</td>
            <td class="px-3 py-3 text-right font-mono font-bold ${m.allocated_cost_rp > 0 ? 'text-emerald-700' : 'text-slate-600'}">${formatRp(m.allocated_cost_rp)}</td>
            <td class="px-3 py-3 text-right font-mono text-slate-600">${formatRp(m.remaining_ceiling_rp)}</td>
            <td class="px-3 py-3 text-center">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold ${absorptionPct > 98 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                ${absorptionPct.toFixed(1)}%
              </span>
            </td>
            <td class="px-3 py-3 text-right font-mono font-bold text-indigo-700">${formatKm(m.allocated_treated_length_km)}</td>
            <td class="px-3 py-3 text-right font-mono">${(m.priority_weighted_score || 0).toFixed(4)}</td>
            <td class="px-3 py-3 text-center">
              <span class="font-bold text-slate-800">${m.funded_construction_roads} ruas</span>
              <span class="text-[10px] text-slate-400 block">+${(m.routine_maintenance_roads || 0) + (m.manual_review_roads || 0)} rutin/rev</span>
            </td>
            <td class="px-3 py-3 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${m.solver_status === 'OPTIMAL' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                ${solverStatusLabels[m.solver_status] || 'Belum tersedia'}
              </span>
            </td>
            <td class="px-3 py-3 text-center whitespace-nowrap">
              ${
                isCurrent
                  ? '<span class="text-xs text-sky-700 font-bold">Aktif</span>'
                  : `<button type="button" class="asb-btn-apply-method px-2.5 py-1 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-700 text-white shadow-xs transition" data-objective="${m.optimization_objective}">Terapkan</button>`
              }
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Deferred Register Table Rendering
  function renderDeferredTable() {
    const tbody = document.getElementById('asb-deferred-table-body');
    const elCount = document.getElementById('asb-deferred-kpi-count');
    const elCost = document.getElementById('asb-deferred-kpi-cost');
    const elLength = document.getElementById('asb-deferred-kpi-length');

    const items = state.deferred.items;
    const totalCost = items.reduce((acc, r) => acc + (r.total_pagu_asb_rp || 0), 0);
    const totalLength = items.reduce((acc, r) => acc + (r.treated_length_km || 0), 0);

    if (elCount) elCount.textContent = `${items.length} ruas`;
    if (elCost) elCost.textContent = formatRp(totalCost);
    if (elLength) elLength.textContent = formatKm(totalLength);

    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="px-4 py-8 text-center text-sm text-slate-500">
            Tidak ada ruas tertunda dalam kategori filter yang dipilih.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = items
      .map((r) => {
        const badgeHtml = getStatusBadge(r.operational_status, 0);

        let reasonText = '';
        if (r.operational_status === 'MANUAL_TECHNICAL_REVIEW') {
          reasonText = `Lebar rata-rata segmen (${r.avg_width_m || 12}m) melampaui batas standar ASB (maks. 5,0m). Diperlukan Detail Engineering Design (DED) khusus dan kajian struktur tersendiri.`;
        } else if (r.operational_status === 'ROUTINE_MAINTENANCE') {
          reasonText = `Kondisi jalan 100% mantap (Baik/Sedang). Segmen masuk dalam program pemeliharaan rutin preventif (R06) dengan pagu konstruksi mayor Rp 0.`;
        } else {
          reasonText = `Kebutuhan pagu ${formatRp(r.total_pagu_asb_rp)} melampaui sisa pagu plafon yang tersedia. Diprioritaskan pada tahun anggaran berikutnya atau alokasi DAK.`;
        }

        return `
          <tr class="hover:bg-slate-50 border-b border-slate-200 text-xs">
            <td class="px-3 py-2.5 text-center font-mono font-bold text-slate-600">
              #${r.allocation_rank || '-'}
            </td>
            <td class="px-3 py-2.5 font-mono font-medium text-slate-700 whitespace-nowrap">
              ${escapeHtml(r.road_key)}
            </td>
            <td class="px-3 py-2.5">
              <div class="font-bold text-slate-900">${escapeHtml(r.road_name)}</div>
              <div class="text-[11px] text-slate-500">${escapeHtml(r.district_name || 'HSS')}</div>
            </td>
            <td class="px-3 py-2.5 text-right font-mono">${formatKm(r.total_length_km)}</td>
            <td class="px-3 py-2.5 text-right font-mono text-slate-600">${formatKm(r.treated_length_km)}</td>
            <td class="px-3 py-2.5 text-right font-mono font-bold text-slate-800">${formatRp(r.total_pagu_asb_rp)}</td>
            <td class="px-3 py-2.5 text-center whitespace-nowrap">${badgeHtml}</td>
            <td class="px-3 py-2.5 text-slate-600 text-[11px] leading-relaxed max-w-md">${escapeHtml(reasonText)}</td>
            <td class="px-3 py-2.5 text-center whitespace-nowrap">
              <button 
                type="button" 
                class="asb-btn-road-detail px-2.5 py-1 text-xs font-medium rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors shadow-xs"
                data-road-key="${escapeHtml(r.road_key)}"
              >
                Rincian
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Road Detail & Traceability Modal
  function renderRoadDetailModal() {
    const data = state.selectedRoadDetail;
    if (!data) return;

    const modal = document.getElementById('asb-road-detail-modal');
    if (!modal) return;

    const road = data.road;
    const summary = data.summary;
    const segments = data.segments || [];
    const ahsp = data.ahspBreakdown || [];

    // Header info with canonical vs surveyed vs treated lengths (Part A requirement)
    document.getElementById('asb-modal-road-title').textContent = `${road.canonical_name} (${road.road_key})`;
    document.getElementById('asb-modal-road-meta').textContent = `${road.district_name || 'Kabupaten HSS'} · Panjang Resmi SK: ${formatKm(road.length_km_official)} · Panjang DD1 Survei: ${formatKm(road.total_condition_length_km || road.length_km_official)} · Panjang Ditangani: ${formatKm(summary.allocated_treated_length_km ?? summary.treated_length_km)} · Pagu Indikatif: ${formatRp(summary.total_pagu_asb_rp)} · Teralokasi: ${formatRp(summary.allocated_pagu_rp || 0)}`;

    // Condition badges
    const statusBadge = getStatusBadge(summary.operational_status, summary.is_funded);
    document.getElementById('asb-modal-cond-badges').innerHTML = `
      <span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Mantap: ${formatPct(road.mantap_pct)}</span>
      <span class="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Tidak Mantap: ${formatPct(road.tidak_mantap_pct)}</span>
      <span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">Rusak Berat: ${formatPct(road.rusak_berat_pct)}</span>
      <span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Rusak Ringan: ${formatPct(road.rusak_ringan_pct)}</span>
      ${statusBadge}
    `;

    // Render Segments Table
    const tbody = document.getElementById('asb-modal-segments-tbody');
    if (tbody) {
      tbody.innerHTML = segments
        .map((s, idx) => {
          const isManualReview = s.calculation_mode === 'MANUAL_REVIEW_MODE' || (s.adjustment_flags && s.adjustment_flags.includes('MANUAL_REVIEW_WIDTH_EXCEEDED'));
          const isTreated = s.asb_id !== null && s.indicative_cost_rp > 0;
          const isSelected = s.is_selected === 1;

          let bgRow = '';
          let ruleBadge = '';
          let packageHtml = '';
          let costHtml = '';

          if (isManualReview) {
            bgRow = 'bg-amber-50/60 text-slate-900 border-amber-200';
            ruleBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] bg-amber-100 text-amber-900 font-bold border border-amber-300">${escapeHtml(s.rule_id || 'R04')} (Review)</span>`;
            packageHtml = `
              <div class="font-bold text-amber-900">${escapeHtml(s.package_name || 'Penanganan Khusus (Lebar > 5m Butuh Review Manual/DED)')}</div>
              <div class="text-[10px] text-amber-700 font-medium">Lebar ${s.matched_width_m}m melampaui batas standar ASB (maks. 5,0m) · Butuh DED khusus</div>
            `;
            costHtml = `
              <div class="font-bold text-amber-800 whitespace-nowrap font-mono">Rp 0</div>
              <div class="text-[9px] text-amber-600 font-semibold">(Review Teknis/DED)</div>
            `;
          } else if (isTreated) {
            bgRow = isSelected ? 'bg-emerald-50/30' : '';
            ruleBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] bg-sky-100 text-sky-800 font-bold">${escapeHtml(s.rule_id || 'R01')}</span>`;
            const solverBadge = isSelected
              ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 ml-1">x_s = 1 (Teralokasi)</span>'
              : '<span class="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 ml-1">x_s = 0 (Tertunda)</span>';
            packageHtml = `
              <div class="font-semibold text-slate-900 flex items-center">${escapeHtml(s.package_name || '-')} ${solverBadge}</div>
              <div class="text-[10px] text-slate-500 font-mono">Kode ASB: ${escapeHtml(s.asb_id || '-')}</div>
            `;
            costHtml = `<div class="font-bold text-slate-900 whitespace-nowrap font-mono">${formatRp(s.indicative_cost_rp)}</div>`;
          } else {
            bgRow = 'bg-slate-50 text-slate-500';
            ruleBadge = `<span class="px-1.5 py-0.5 rounded text-[11px] bg-slate-200 text-slate-600">R06</span>`;
            packageHtml = `
              <div class="font-semibold text-slate-700">Pemeliharaan Rutin</div>
              <div class="text-[10px] text-slate-400 font-mono">Non-ASB Rekonstruksi Fisik</div>
            `;
            costHtml = `<div class="font-medium text-slate-500 whitespace-nowrap font-mono">Rp 0</div>`;
          }

          return `
            <tr class="border-b border-slate-200 text-xs ${bgRow}">
              <td class="px-2 py-2 text-center font-mono font-semibold">${idx + 1}</td>
              <td class="px-2 py-2 font-mono whitespace-nowrap">
                STA ${(s.sta_start_m || 0).toLocaleString('id-ID')} - ${(s.sta_end_m || 0).toLocaleString('id-ID')}
              </td>
              <td class="px-2 py-2 text-right">${s.segment_length_m} m</td>
              <td class="px-2 py-2 text-right">${s.matched_width_m} m</td>
              <td class="px-2 py-2 text-center capitalize">${escapeHtml(s.dominant_condition || '-')}</td>
              <td class="px-2 py-2 text-center">${escapeHtml(s.matched_surface || s.surface_type || '-')}</td>
              <td class="px-2 py-2 text-center whitespace-nowrap">
                ${ruleBadge}
              </td>
              <td class="px-2 py-2">
                ${packageHtml}
              </td>
              <td class="px-2 py-2 text-right font-mono">${isManualReview ? '<span class="text-slate-400 font-mono">Rp 0</span>' : formatRp(s.unit_price_rp)}</td>
              <td class="px-2 py-2 text-right">
                ${costHtml}
              </td>
            </tr>
          `;
        })
        .join('');
    }

    // Render AHSP Profile Mapping Breakdown
    const ahspContainer = document.getElementById('asb-modal-ahsp-tbody');
    if (ahspContainer) {
      if (ahsp.length === 0) {
        ahspContainer.innerHTML = `
          <tr>
            <td colspan="6" class="px-3 py-4 text-center text-xs text-slate-400">
              Tidak ada rincian profil AHSP khusus untuk paket penanganan rutin.
            </td>
          </tr>
        `;
      } else {
        ahspContainer.innerHTML = ahsp
          .map(
            (item) => `
            <tr class="border-b border-slate-200 text-xs">
              <td class="px-2 py-2 font-mono font-bold text-sky-800">${escapeHtml(item.payment_code || item.ahsp_id || item.rule_identifier || '-')}</td>
              <td class="px-2 py-2">
                <div class="font-semibold text-slate-900">${escapeHtml(item.item_description || item.description)}</div>
                <div class="text-[10px] text-slate-400">Divisi ${item.division_code} · Peran: ${escapeHtml(item.item_role)}</div>
              </td>
              <td class="px-2 py-2 text-center">${escapeHtml(item.ahsp_unit || item.quantity_basis || '-')}</td>
              <td class="px-2 py-2 text-center capitalize">${escapeHtml(item.quantity_basis)}</td>
              <td class="px-2 py-2 text-right font-mono">${item.ahsp_price_rp ? formatRp(item.ahsp_price_rp) : 'Paket ASB (Inklusif)'}</td>
              <td class="px-2 py-2 text-center">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Terpetakan</span>
              </td>
            </tr>
          `
          )
          .join('');
      }
    }

    modal.classList.remove('hidden');
  }

  function closeRoadDetailModal() {
    const modal = document.getElementById('asb-road-detail-modal');
    if (modal) modal.classList.add('hidden');
    state.selectedRoadDetail = null;
  }

  // Modals for Create, Edit, & Duplicate Scenario
  function openCreateScenarioModal() {
    const modal = document.getElementById('asb-create-scenario-modal');
    if (!modal) return;
    const form = document.getElementById('asb-create-scenario-form');
    if (form) form.reset();
    modal.classList.remove('hidden');
  }

  function closeCreateScenarioModal() {
    const modal = document.getElementById('asb-create-scenario-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function handleCreateScenarioSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const code = form.scenario_code.value.trim();
    const name = form.scenario_name.value.trim();
    const year = Number(form.budget_year.value);
    const ceilingRp = Number(form.budget_ceiling_rp.value);
    const desc = form.description.value.trim();

    if (!code || !name || !year) {
      alert('Mohon lengkapi kode skenario, nama skenario, dan tahun anggaran.');
      return;
    }

    showLoading(true);
    try {
      const res = await apiFetch('/api/costing/scenarios', {
        method: 'POST',
        body: JSON.stringify({
          scenario_code: code,
          scenario_name: name,
          budget_year: year,
          budget_ceiling_rp: ceilingRp || 50000000000,
          description: desc,
        }),
      });

      closeCreateScenarioModal();
      showToast('Skenario berhasil dibuat dan dikalkulasi!', 'success');
      await fetchScenarios();
      await selectScenario(res.data.scenario_id);
    } catch (err) {
      alert('Gagal membuat skenario: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  function openEditCeilingModal() {
    const modal = document.getElementById('asb-edit-ceiling-modal');
    if (!modal || !state.scenarioDetail) return;
    const form = document.getElementById('asb-edit-ceiling-form');
    if (form) {
      form.scenario_name.value = state.scenarioDetail.scenario_name || '';
      form.budget_ceiling_rp.value = state.scenarioDetail.budget_ceiling_rp || '';
      form.description.value = state.scenarioDetail.description || '';
      form.scenario_status.value = state.scenarioDetail.scenario_status || 'DRAFT';
    }
    modal.classList.remove('hidden');
  }

  function closeEditCeilingModal() {
    const modal = document.getElementById('asb-edit-ceiling-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function handleEditCeilingSubmit(e) {
    e.preventDefault();
    if (!state.currentScenarioId) return;

    const form = e.target;
    const name = form.scenario_name.value.trim();
    const ceilingRp = Number(form.budget_ceiling_rp.value);
    const desc = form.description.value.trim();
    const status = form.scenario_status.value;

    showLoading(true);
    try {
      await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}`, {
        method: 'PUT',
        body: JSON.stringify({
          scenario_name: name,
          budget_ceiling_rp: ceilingRp,
          description: desc,
          scenario_status: status,
        }),
      });

      closeEditCeilingModal();
      showToast('Plafon dan parameter skenario berhasil diperbarui!', 'success');
      await fetchScenarios();
      await selectScenario(state.currentScenarioId);
    } catch (err) {
      alert('Gagal memperbarui skenario: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  function openDuplicateModal() {
    const modal = document.getElementById('asb-duplicate-scenario-modal');
    if (!modal || !state.scenarioDetail) return;

    const srcName = document.getElementById('asb-dup-source-name');
    if (srcName) srcName.value = `${state.scenarioDetail.scenario_name} (${state.scenarioDetail.scenario_id})`;

    const form = document.getElementById('asb-duplicate-scenario-form');
    if (form) {
      const ceilingB = (state.scenarioDetail.budget_ceiling_rp || 50000000000) / 1000000000;
      form.scenario_name.value = `${state.scenarioDetail.scenario_name} (Simulasi Rp ${ceilingB.toFixed(0)} M)`;
      form.budget_ceiling_rp.value = state.scenarioDetail.budget_ceiling_rp || 50000000000;
      form.optimization_objective.value = state.scenarioDetail.optimization_objective || 'PRIORITY_WEIGHTED';
      form.description.value = `Duplikasi dari ${state.scenarioDetail.scenario_name} untuk simulasi optimasi pagu.`;
    }
    modal.classList.remove('hidden');
  }

  function closeDuplicateModal() {
    const modal = document.getElementById('asb-duplicate-scenario-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function handleDuplicateScenarioSubmit(e) {
    e.preventDefault();
    if (!state.currentScenarioId) return;

    const form = e.target;
    const newName = form.scenario_name.value.trim();
    const ceiling = Number(form.budget_ceiling_rp.value);
    const objective = form.optimization_objective.value;
    const desc = form.description.value.trim();

    if (!newName || isNaN(ceiling) || ceiling <= 0) {
      alert('Nama dan batas plafon harus valid!');
      return;
    }

    showLoading(true);
    try {
      const codeSlug = newName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 18);
      const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({
          scenario_code: `SIM_${codeSlug}_${Date.now().toString().slice(-4)}`,
          scenario_name: newName,
          new_scenario_name: newName,
          budget_ceiling_rp: ceiling,
          optimization_objective: objective,
          description: desc,
        }),
      });

      closeDuplicateModal();
      showToast('Skenario berhasil diduplikasi dan dihitung!', 'success');
      await fetchScenarios();
      await selectScenario(res.data.scenario_id);
    } catch (err) {
      alert('Gagal menduplikasi skenario: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  // Multi-Scenario Comparison Tab
  function renderComparisonTable() {
    const tbody = document.getElementById('asb-comparison-tbody');
    if (!tbody) return;

    const list = state.comparisonData;
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="px-4 py-8 text-center text-sm text-slate-500">
            Tidak ada skenario anggaran untuk dibandingkan.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list
      .map((scn) => {
        const ceiling = scn.budget_ceiling_rp || 0;
        const totalReq = scn.total_cost_rp || 0;
        const allocated = scn.allocated_cost_rp || 0;
        const pctAllocated = ceiling > 0 ? (allocated / ceiling) * 100 : 0;
        const isCurrent = scn.scenario_id === state.currentScenarioId;

        return `
          <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs ${isCurrent ? 'bg-sky-50/50 font-medium' : ''}">
            <td class="px-3 py-3 font-semibold text-slate-900">
              ${escapeHtml(scn.scenario_name)}
              ${isCurrent ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-sky-200 text-sky-800 font-bold">Aktif</span>' : ''}
              <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(scn.scenario_code)} (${scn.budget_year}) [${objectiveLabels[scn.optimization_objective] || 'Metode belum tersedia'}]</div>
            </td>
            <td class="px-3 py-3 text-center">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${
                scn.scenario_status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }">${escapeHtml(scn.scenario_status)}</span>
            </td>
            <td class="px-3 py-3 text-right font-mono font-bold text-slate-900">
              ${formatRp(ceiling)}
            </td>
            <td class="px-3 py-3 text-right font-mono text-slate-700">
              ${formatRp(totalReq)}
            </td>
            <td class="px-3 py-3 text-right font-mono font-bold text-emerald-700">
              ${formatRp(allocated)}
              <span class="text-[10px] text-slate-500 block">${pctAllocated.toFixed(1)}% plafon</span>
            </td>
            <td class="px-3 py-3 text-center">
              <span class="font-bold text-emerald-800">${scn.funded_construction_roads ?? scn.funded_roads ?? 0}</span>
              <span class="text-[10px] text-slate-400 block">${scn.deferred_roads || 0} tertunda</span>
            </td>
            <td class="px-3 py-3 text-right font-mono font-bold text-indigo-700">
              ${formatKm(scn.treated_length_km || 0)}
            </td>
            <td class="px-3 py-3 text-center whitespace-nowrap">
              <button 
                type="button" 
                class="asb-btn-switch-scenario px-2.5 py-1 text-xs font-semibold rounded bg-white hover:bg-sky-50 text-sky-700 border border-slate-300 shadow-xs"
                data-scenario-id="${escapeHtml(scn.scenario_id)}"
              >
                Buka Skenario
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  // Catalogs Rendering
  function renderASBCatalogTable() {
    const tbody = document.getElementById('asb-catalog-tbody');
    if (!tbody) return;

    const list = state.catalog.asbItems;
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada item ASB ditemukan.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (item) => `
        <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs">
          <td class="px-3 py-2 font-mono font-bold text-sky-900">${escapeHtml(item.item_code)}</td>
          <td class="px-3 py-2">
            <div class="font-semibold text-slate-900">${escapeHtml(item.package_name)}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(item.specification || '')}</div>
          </td>
          <td class="px-3 py-2 text-center">${escapeHtml(item.item_category)}</td>
          <td class="px-3 py-2 text-center font-mono">${item.road_width_m ? item.road_width_m + ' m' : '-'}</td>
          <td class="px-3 py-2 text-center">${escapeHtml(item.surface_type || '-')}</td>
          <td class="px-3 py-2 text-center">${escapeHtml(item.unit)}</td>
          <td class="px-3 py-2 text-right font-mono font-bold text-slate-900">${formatRp(item.unit_price_rp)}</td>
        </tr>
      `
      )
      .join('');
  }

  function renderAHSPCatalogTable() {
    const tbody = document.getElementById('ahsp-catalog-tbody');
    if (!tbody) return;

    const list = state.catalog.ahspItems;
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada item AHSP ditemukan.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (item) => `
        <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs">
          <td class="px-3 py-2 font-mono font-bold text-sky-900">${escapeHtml(item.payment_code || item.ahsp_id)}</td>
          <td class="px-3 py-2 font-semibold text-slate-900">${escapeHtml(item.item_description)}</td>
          <td class="px-3 py-2 text-center">${item.division_code} - ${escapeHtml(item.division_name)}</td>
          <td class="px-3 py-2 text-center">${escapeHtml(item.unit || item.original_unit || '-')}</td>
          <td class="px-3 py-2 text-center capitalize">${escapeHtml(item.work_category)}</td>
          <td class="px-3 py-2 text-right font-mono font-bold text-slate-900">${formatRp(item.unit_price_rp)}</td>
        </tr>
      `
      )
      .join('');
  }

  function renderRulesCatalogTable() {
    const tbody = document.getElementById('rules-catalog-tbody');
    if (!tbody) return;

    const list = state.catalog.rules;
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">Tidak ada aturan ditemukan.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (rule) => `
        <tr class="border-b border-slate-200 hover:bg-slate-50 text-xs">
          <td class="px-3 py-2.5 font-mono font-bold text-sky-800 text-center">#${rule.priority_order} (${escapeHtml(rule.rule_id)})</td>
          <td class="px-3 py-2.5 font-bold text-slate-900">${escapeHtml(rule.rule_label)}</td>
          <td class="px-3 py-2.5 text-center">
            <span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800">Tipe ${escapeHtml(rule.asb_type)}</span>
          </td>
          <td class="px-3 py-2.5 font-mono text-[11px] text-slate-700">${escapeHtml(rule.condition_logic)}</td>
          <td class="px-3 py-2.5 text-slate-600 text-[11px]">${escapeHtml(rule.rationale || '-')}</td>
          <td class="px-3 py-2.5 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              ${rule.mapped_ahsp_items_count || 0} AHSP
            </span>
          </td>
        </tr>
      `
      )
      .join('');
  }

  // Switch workspace sub-tabs
  function switchTab(tabId) {
    state.activeTab = tabId;

    // Update tab button classes
    document.querySelectorAll('.asb-subtab-btn').forEach((btn) => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('border-sky-600', 'text-sky-700', 'font-bold');
        btn.classList.remove('border-transparent', 'text-slate-500');
      } else {
        btn.classList.remove('border-sky-600', 'text-sky-700', 'font-bold');
        btn.classList.add('border-transparent', 'text-slate-500');
      }
    });

    // Toggle tab panels
    document.querySelectorAll('.asb-tab-panel').forEach((panel) => {
      if (panel.id === `asb-panel-${tabId}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    // Lazy load data for respective tab
    if (tabId === 'optimasi-matematis') {
      fetchComparisonMethods();
    } else if (tabId === 'register-tertunda') {
      fetchDeferredRegister();
    } else if (tabId === 'perbandingan') {
      fetchComparisonData();
    } else if (tabId === 'katalog-asb') {
      fetchASBCatalog();
    } else if (tabId === 'katalog-ahsp') {
      fetchAHSPCatalog();
    } else if (tabId === 'aturan-r01-r06') {
      fetchRulesCatalog();
    }
  }

  // Event Listeners Wiring
  function setupEventListeners() {
    // Scenario Switcher
    const scenarioSelect = document.getElementById('asb-scenario-select');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        selectScenario(e.target.value);
      });
    }

    // Recalculate Button
    const btnRecalc = document.getElementById('asb-btn-recalculate');
    if (btnRecalc) {
      btnRecalc.addEventListener('click', () => {
        if (confirm('Jalankan ulang kalkulasi ASB dan alokasi plafon untuk skenario ini?')) {
          recalculateCurrentScenario();
        }
      });
    }

    // Export CSV Button
    const btnExport = document.getElementById('asb-btn-export-csv');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        if (state.currentScenarioId) {
          window.location.href = `/api/costing/scenarios/${state.currentScenarioId}/export/csv`;
        }
      });
    }

    // Quick Simulation Preset Buttons
    document.querySelectorAll('.asb-preset-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const amount = Number(btn.dataset.amount);
        if (!amount || !state.currentScenarioId) return;

        const currentCeiling = state.scenarioDetail?.budget_ceiling_rp;
        if (currentCeiling === amount) {
          showToast(`Skenario saat ini sudah menggunakan plafon Rp ${(amount / 1e9).toFixed(0)} Miliar.`, 'info');
          return;
        }

        // Check if there is an existing scenario with this ceiling
        const existing = state.scenarios.find((s) => s.budget_ceiling_rp === amount);
        if (existing) {
          await selectScenario(existing.scenario_id);
          showToast(`Beralih ke skenario ${existing.scenario_name} (Rp ${(amount / 1e9).toFixed(0)} M).`, 'success');
          return;
        }

        // If on protected baseline scenario, duplicate to an isolated simulation scenario to avoid mutating baseline
        if (state.currentScenarioId === 'SCN-2027-BASELINE') {
          if (confirm(`Skenario baseline dilindungi. Buat skenario simulasi baru dengan plafon Rp ${(amount / 1e9).toFixed(0)} Miliar?`)) {
            showLoading(true);
            try {
              const res = await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}/duplicate`, {
                method: 'POST',
                body: JSON.stringify({
                  scenario_code: `SIM_${(amount / 1e9).toFixed(0)}M_${Date.now().toString().slice(-4)}`,
                  scenario_name: `Simulasi Plafon Rp ${(amount / 1e9).toFixed(0)} Miliar`,
                  budget_ceiling_rp: amount,
                  optimization_objective: 'PRIORITY_WEIGHTED',
                  description: `Simulasi plafon Rp ${(amount / 1e9).toFixed(0)} Miliar diduplikasi dari Baseline 2027.`,
                }),
              });
              showToast(`Skenario simulasi Rp ${(amount / 1e9).toFixed(0)} Miliar berhasil dibuat!`, 'success');
              await fetchScenarios();
              await selectScenario(res.data.scenario_id);
            } catch (err) {
              showError('Gagal membuat skenario simulasi: ' + err.message);
            } finally {
              showLoading(false);
            }
          }
          return;
        }

        // Otherwise update current draft scenario ceiling
        if (confirm(`Ubah plafon skenario aktif ke Rp ${(amount / 1e9).toFixed(0)} Miliar dan hitung ulang alokasi?`)) {
          showLoading(true);
          try {
            await apiFetch(`/api/costing/scenarios/${state.currentScenarioId}`, {
              method: 'PUT',
              body: JSON.stringify({
                scenario_name: state.scenarioDetail.scenario_name,
                budget_ceiling_rp: amount,
                description: state.scenarioDetail.description,
                scenario_status: state.scenarioDetail.scenario_status,
              }),
            });
            await recalculateCurrentScenario();
            await fetchScenarios();
          } catch (err) {
            showError('Gagal mengubah plafon: ' + err.message);
          } finally {
            showLoading(false);
          }
        }
      });
    });

    // Run Optimization Solver Button
    const btnRunSolver = document.getElementById('asb-btn-run-solver');
    if (btnRunSolver) {
      btnRunSolver.addEventListener('click', () => {
        const checkedRadio = document.querySelector('input[name="asb_optimization_objective"]:checked');
        const objective = checkedRadio ? checkedRadio.value : 'PRIORITY_WEIGHTED';
        runOptimization(objective);
      });
    }

    // Compare 4 Methods Button
    const btnCompare4 = document.getElementById('asb-btn-compare-4methods');
    if (btnCompare4) {
      btnCompare4.addEventListener('click', async () => {
        await fetchComparisonMethods();
        const container = document.getElementById('asb-comparison-matrix-container');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Radio Objective Change Event
    document.querySelectorAll('input[name="asb_optimization_objective"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        syncObjectiveCardStyles(e.target.value);
      });
    });

    // Objective Card Click
    document.querySelectorAll('.asb-opt-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio && e.target !== radio) {
          radio.checked = true;
          syncObjectiveCardStyles(radio.value);
        }
      });
    });

    // Toggle Methodology Notice
    const btnToggleMethod = document.getElementById('asb-btn-toggle-methodology');
    const methodContent = document.getElementById('asb-methodology-content');
    if (btnToggleMethod && methodContent) {
      btnToggleMethod.addEventListener('click', () => {
        const isHidden = methodContent.classList.contains('hidden');
        if (isHidden) {
          methodContent.classList.remove('hidden');
          btnToggleMethod.textContent = 'Sembunyikan Batasan';
        } else {
          methodContent.classList.add('hidden');
          btnToggleMethod.textContent = 'Lihat Batasan (A–G)';
        }
      });
    }

    // Create Scenario Modal triggers
    const btnOpenCreate = document.getElementById('asb-btn-open-create');
    if (btnOpenCreate) btnOpenCreate.addEventListener('click', openCreateScenarioModal);

    const btnCloseCreate = document.getElementById('asb-btn-close-create');
    if (btnCloseCreate) btnCloseCreate.addEventListener('click', closeCreateScenarioModal);

    const createForm = document.getElementById('asb-create-scenario-form');
    if (createForm) createForm.addEventListener('submit', handleCreateScenarioSubmit);

    // Edit Ceiling Modal triggers
    const btnOpenEdit = document.getElementById('asb-btn-open-edit');
    if (btnOpenEdit) btnOpenEdit.addEventListener('click', openEditCeilingModal);

    const btnCloseEdit = document.getElementById('asb-btn-close-edit');
    if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeEditCeilingModal);

    const editForm = document.getElementById('asb-edit-ceiling-form');
    if (editForm) editForm.addEventListener('submit', handleEditCeilingSubmit);

    // Duplicate Scenario Modal triggers
    const btnOpenDuplicate = document.getElementById('asb-btn-duplicate');
    if (btnOpenDuplicate) btnOpenDuplicate.addEventListener('click', openDuplicateModal);

    const btnCloseDuplicate = document.getElementById('asb-btn-close-duplicate');
    if (btnCloseDuplicate) btnCloseDuplicate.addEventListener('click', closeDuplicateModal);

    const duplicateForm = document.getElementById('asb-duplicate-scenario-form');
    if (duplicateForm) duplicateForm.addEventListener('submit', handleDuplicateScenarioSubmit);

    // Road Detail Modal Close
    const btnCloseDetail = document.getElementById('asb-btn-close-detail');
    if (btnCloseDetail) btnCloseDetail.addEventListener('click', closeRoadDetailModal);

    // Tab buttons
    document.querySelectorAll('.asb-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Delegated actions (Road Detail, Apply Method, Switch Scenario)
    document.addEventListener('click', (e) => {
      const btnDetail = e.target.closest('.asb-btn-road-detail');
      if (btnDetail) {
        const roadKey = btnDetail.dataset.roadKey;
        fetchRoadDetail(roadKey);
      }

      const btnApplyMethod = e.target.closest('.asb-btn-apply-method');
      if (btnApplyMethod) {
        const objective = btnApplyMethod.dataset.objective;
        if (objective) {
          runOptimization(objective);
        }
      }

      const btnSwitchScn = e.target.closest('.asb-btn-switch-scenario');
      if (btnSwitchScn) {
        const scnId = btnSwitchScn.dataset.scenarioId;
        selectScenario(scnId);
        switchTab('rekap-ruas');
      }
    });

    // Table Filters
    const searchInput = document.getElementById('asb-filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value.trim();
        state.pagination.page = 1;
        renderRoadTable();
      });
    }

    const districtFilter = document.getElementById('asb-filter-district');
    if (districtFilter) {
      districtFilter.addEventListener('change', (e) => {
        state.filters.district = e.target.value;
        state.pagination.page = 1;
        renderRoadTable();
      });
    }

    const opStatusFilter = document.getElementById('asb-filter-op-status');
    if (opStatusFilter) {
      opStatusFilter.addEventListener('change', (e) => {
        state.filters.opStatus = e.target.value;
        state.pagination.page = 1;
        renderRoadTable();
      });
    }

    const fundedFilter = document.getElementById('asb-filter-funded');
    if (fundedFilter) {
      fundedFilter.addEventListener('change', (e) => {
        state.filters.isFunded = e.target.value;
        state.pagination.page = 1;
        renderRoadTable();
      });
    }

    const typeFilter = document.getElementById('asb-filter-type');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        state.filters.dominantType = e.target.value;
        state.pagination.page = 1;
        renderRoadTable();
      });
    }

    // Deferred Register Filter
    const deferredFilter = document.getElementById('asb-deferred-filter-status');
    if (deferredFilter) {
      deferredFilter.addEventListener('change', (e) => {
        state.deferred.filterStatus = e.target.value;
        fetchDeferredRegister();
      });
    }

    // Catalog search inputs
    const asbSearch = document.getElementById('asb-catalog-search');
    if (asbSearch) {
      asbSearch.addEventListener('input', (e) => {
        state.catalog.asbSearch = e.target.value.trim();
        fetchASBCatalog();
      });
    }

    const asbCatSelect = document.getElementById('asb-catalog-cat-select');
    if (asbCatSelect) {
      asbCatSelect.addEventListener('change', (e) => {
        state.catalog.asbCategory = e.target.value;
        fetchASBCatalog();
      });
    }

    const ahspSearch = document.getElementById('ahsp-catalog-search');
    if (ahspSearch) {
      ahspSearch.addEventListener('input', (e) => {
        state.catalog.ahspSearch = e.target.value.trim();
        fetchAHSPCatalog();
      });
    }

    const ahspDivSelect = document.getElementById('ahsp-catalog-div-select');
    if (ahspDivSelect) {
      ahspDivSelect.addEventListener('change', (e) => {
        state.catalog.ahspDivision = e.target.value;
        fetchAHSPCatalog();
      });
    }

    // Modal Backdrop Dismiss
    ['asb-road-detail-modal', 'asb-create-scenario-modal', 'asb-edit-ceiling-modal', 'asb-duplicate-scenario-modal'].forEach((modalId) => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.classList.contains('backdrop-blur-xs') || (e.target.parentElement && e.target.parentElement === modal)) {
            modal.classList.add('hidden');
            if (modalId === 'asb-road-detail-modal') state.selectedRoadDetail = null;
          }
        });
      }
    });

    // Modal Escape Key Listener
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const detailModal = document.getElementById('asb-road-detail-modal');
        const createModal = document.getElementById('asb-create-scenario-modal');
        const editModal = document.getElementById('asb-edit-ceiling-modal');
        const dupModal = document.getElementById('asb-duplicate-scenario-modal');
        if (detailModal && !detailModal.classList.contains('hidden')) {
          closeRoadDetailModal();
        } else if (createModal && !createModal.classList.contains('hidden')) {
          closeCreateScenarioModal();
        } else if (editModal && !editModal.classList.contains('hidden')) {
          closeEditCeilingModal();
        } else if (dupModal && !dupModal.classList.contains('hidden')) {
          closeDuplicateModal();
        }
      }
    });
  }

  // UI Utilities
  function showLoading(show) {
    state.loading = show;
    const loader = document.getElementById('asb-loading-indicator');
    if (loader) {
      if (show) loader.classList.remove('hidden');
      else loader.classList.add('hidden');
    }
  }

  function showError(msg) {
    console.error('[ASB Module Error]:', msg);
    alert(msg);
  }

  function showToast(msg, type = 'info') {
    console.log(`[Toast ${type}]: ${msg}`);
  }

  // Export to global scope
  window.AsbCostingModule = {
    init: initAsbCostingModule,
    selectScenario,
    recalculate: recalculateCurrentScenario,
    runOptimization,
    fetchRoadDetail,
    switchTab,
  };
})();
