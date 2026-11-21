import { spawn } from 'node:child_process';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000/#asb-costing';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
}

async function runBrowserQA() {
  console.log('================================================================');
  console.log('STARTING CHROME HEADLESS E2E BROWSER QA FOR ASB COSTING MODULE');
  console.log('================================================================\n');

  const remotePort = 9223;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${remotePort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + path.resolve('.tmp-chrome-cdp-costing'),
    APP_URL,
  ]);

  let cdp;
  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const res = await fetch(`http://localhost:${remotePort}/json`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page' && t.url.includes('3000'));
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) throw new Error('Failed to connect to Chrome CDP WebSocket');

    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('[1/10] Waiting for page load and ASB module initialization...');
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(3500);

    const docState = await cdp.eval(`return { url: window.location.href, readyState: document.readyState };`);
    console.log('  Page State:', docState);

    // 1. Verify view is active
    const viewStatus = await cdp.eval(`
      const sec = document.getElementById('view-asb-costing');
      const isVisible = sec && !sec.classList.contains('hidden');
      const scenarioSelect = document.getElementById('asb-scenario-select');
      const totalCostText = document.getElementById('asb-kpi-total-cost')?.textContent;
      const ceilingText = document.getElementById('asb-kpi-ceiling')?.textContent;
      const allocatedText = document.getElementById('asb-kpi-allocated')?.textContent;
      return { isVisible, currentScenario: scenarioSelect?.value, totalCostText, ceilingText, allocatedText };
    `);
    console.log('  [PASS] View Active & Reconciled KPIs:', viewStatus);
    if (!viewStatus.isVisible) throw new Error('view-asb-costing is not visible');
    if (!viewStatus.totalCostText?.includes('784.322.010.000')) {
      throw new Error(`Total cost mismatch! Expected Rp 784.322.010.000, got: ${viewStatus.totalCostText}`);
    }
    if (!viewStatus.allocatedText?.includes('48.789.930.000')) {
      throw new Error(`Allocated cost mismatch! Expected Rp 48.789.930.000, got: ${viewStatus.allocatedText}`);
    }

    // 1B. Verify Methodology Banner toggle
    console.log('[1B/10] Verifying Methodology Notice Toggle (Points A–G)...');
    const methodToggleResult = await cdp.eval(`
      const btnToggle = document.getElementById('asb-btn-toggle-methodology');
      const content = document.getElementById('asb-methodology-content');
      const initiallyHidden = content?.classList.contains('hidden');
      btnToggle?.click();
      await new Promise(r => setTimeout(r, 200));
      const opened = !content?.classList.contains('hidden');
      btnToggle?.click();
      await new Promise(r => setTimeout(r, 200));
      const closed = content?.classList.contains('hidden');
      return { initiallyHidden, opened, closed };
    `);
    console.log('  [PASS] Methodology Notice Toggle:', methodToggleResult);
    if (!methodToggleResult.opened || !methodToggleResult.closed) {
      throw new Error('Methodology notice toggle failed');
    }

    // 2. Verify road table rows
    console.log('[2/10] Verifying Road Table rendering and initial pagination...');
    const tableInfo = await cdp.eval(`
      const rows = document.querySelectorAll('#asb-road-table-body tr');
      const paginationInfo = document.getElementById('asb-table-pagination')?.textContent.trim();
      return { rowCount: rows.length, paginationInfo };
    `);
    console.log('  [PASS] Table rows & pagination:', tableInfo);
    if (tableInfo.rowCount !== 25) throw new Error(`Expected 25 table rows on page 1, got ${tableInfo.rowCount}`);

    // 3. Test filter by dominant ASB type (Fixed dropdown!)
    console.log('[3/10] Testing filter by dominant ASB type D (Rekonstruksi & Timbunan)...');
    const typeFilterResult = await cdp.eval(`
      const typeSelect = document.getElementById('asb-filter-type');
      typeSelect.value = 'D';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const rows = document.querySelectorAll('#asb-road-table-body tr');
      const pagination = document.getElementById('asb-table-pagination')?.textContent.trim();
      return { rowsCount: rows.length, pagination };
    `);
    console.log('  [PASS] Dominant Type D Filter:', typeFilterResult);
    if (typeFilterResult.rowsCount !== 25) throw new Error(`Expected 25 rows for Type D, got ${typeFilterResult.rowsCount}`);

    // Reset filter
    await cdp.eval(`
      const typeSelect = document.getElementById('asb-filter-type');
      typeSelect.value = '';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    `);

    // 4. Test live search filter
    console.log('[4/10] Testing live search for HSS-KAB-001...');
    const searchResult = await cdp.eval(`
      const searchInput = document.getElementById('asb-filter-search');
      searchInput.value = 'HSS-KAB-001';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const rows = document.querySelectorAll('#asb-road-table-body tr');
      const firstRowKey = rows[0]?.querySelector('td:nth-child(2)')?.textContent.trim();
      return { rowsCount: rows.length, firstRowKey };
    `);
    console.log('  [PASS] Live Search Result:', searchResult);
    if (searchResult.rowsCount !== 1 || searchResult.firstRowKey !== 'HSS-KAB-001') {
      throw new Error(`Search failed for HSS-KAB-001: ${JSON.stringify(searchResult)}`);
    }

    // 5. Click "Rincian" button for road detail modal
    console.log('[5/10] Opening Road Detail modal for HSS-KAB-001...');
    const modalOpenResult = await cdp.eval(`
      const btn = document.querySelector('.asb-btn-road-detail');
      btn.click();
      await new Promise(r => setTimeout(r, 800));
      const modal = document.getElementById('asb-road-detail-modal');
      const isModalVisible = modal && !modal.classList.contains('hidden');
      const title = document.getElementById('asb-modal-road-title')?.textContent;
      const segmentsCount = document.querySelectorAll('#asb-modal-segments-tbody tr').length;
      const ahspCount = document.querySelectorAll('#asb-modal-ahsp-tbody tr').length;
      const firstAhspCode = document.querySelector('#asb-modal-ahsp-tbody tr td:nth-child(1)')?.textContent.trim();
      const firstAhspPrice = document.querySelector('#asb-modal-ahsp-tbody tr td:nth-child(5)')?.textContent.trim();
      const firstSegPkg = document.querySelector('#asb-modal-segments-tbody tr:nth-child(1) td:nth-child(8)')?.textContent.trim();
      const firstSegCost = document.querySelector('#asb-modal-segments-tbody tr:nth-child(1) td:nth-child(10)')?.textContent.trim();
      return { isModalVisible, title, segmentsCount, ahspCount, firstAhspCode, firstAhspPrice, firstSegPkg, firstSegCost };
    `);
    console.log('  [PASS] Road Detail Modal:', modalOpenResult);
    if (!modalOpenResult.isModalVisible || modalOpenResult.segmentsCount === 0) {
      throw new Error('Road detail modal failed to display segments');
    }
    if (!modalOpenResult.firstSegPkg?.includes('Penanganan Khusus') && !modalOpenResult.firstSegPkg?.includes('Review')) {
      throw new Error(`Expected manual review package on segment 1 of HSS-KAB-001, got: ${modalOpenResult.firstSegPkg}`);
    }
    if (modalOpenResult.firstAhspCode === '-') {
      throw new Error('AHSP breakdown shows bare "-" without fallback identifier');
    }

    // 6. Test closing modal via Escape key
    console.log('[6/10] Closing modal via Escape key...');
    const escapeResult = await cdp.eval(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const modal = document.getElementById('asb-road-detail-modal');
      return { isHidden: modal?.classList.contains('hidden') };
    `);
    console.log('  [PASS] Modal Escape Dismiss:', escapeResult);
    if (!escapeResult.isHidden) throw new Error('Modal failed to close on Escape key');

    // Reset search
    await cdp.eval(`
      const searchInput = document.getElementById('asb-filter-search');
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    `);

    // 7. Test Subtab 2: Perbandingan Skenario
    console.log('[7/10] Switching to Subtab: Perbandingan Skenario...');
    const comparisonResult = await cdp.eval(`
      const tabBtn = document.querySelector('.asb-subtab-btn[data-tab="perbandingan"]');
      tabBtn.click();
      await new Promise(r => setTimeout(r, 600));
      const panel = document.getElementById('asb-panel-perbandingan');
      const isVisible = panel && !panel.classList.contains('hidden');
      const rows = document.querySelectorAll('#asb-comparison-tbody tr');
      return { isVisible, rowCount: rows.length };
    `);
    console.log('  [PASS] Comparison Subtab:', comparisonResult);
    if (!comparisonResult.isVisible || comparisonResult.rowCount < 2) {
      throw new Error(`Comparison tab failed: ${JSON.stringify(comparisonResult)}`);
    }

    // 8. Test Subtab 4: Katalog AHSP & Division Filter
    console.log('[8/10] Switching to Subtab: Katalog AHSP and testing division filter...');
    const ahspResult = await cdp.eval(`
      const tabBtn = document.querySelector('.asb-subtab-btn[data-tab="katalog-ahsp"]');
      tabBtn.click();
      await new Promise(r => setTimeout(r, 600));
      const divSelect = document.getElementById('ahsp-catalog-div-select');
      divSelect.value = '5';
      divSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 500));
      const rows = document.querySelectorAll('#ahsp-catalog-tbody tr');
      const firstRowDesc = rows[0]?.querySelector('td:nth-child(2)')?.textContent.trim();
      return { rowCount: rows.length, firstRowDesc };
    `);
    console.log('  [PASS] AHSP Catalog Division 5:', ahspResult);
    if (ahspResult.rowCount === 0) throw new Error('AHSP Catalog Division 5 returned 0 rows');

    // 9. Test Subtab 5: Aturan Penanganan R01..R06 & Mapped AHSP Counts
    console.log('[9/10] Switching to Subtab: Aturan Penanganan R01..R06...');
    const rulesResult = await cdp.eval(`
      const tabBtn = document.querySelector('.asb-subtab-btn[data-tab="aturan-r01-r06"]');
      tabBtn.click();
      await new Promise(r => setTimeout(r, 600));
      const rows = document.querySelectorAll('#rules-catalog-tbody tr');
      const counts = [...rows].map(r => r.querySelector('td:nth-child(6)')?.textContent.trim());
      return { rowCount: rows.length, counts };
    `);
    console.log('  [PASS] Rules Catalog & AHSP Counts:', rulesResult);
    if (rulesResult.rowCount !== 6) throw new Error(`Expected 6 rules, got ${rulesResult.rowCount}`);
    if (rulesResult.counts[0] === '0 AHSP') {
      throw new Error('R01 still displays 0 AHSP! Join fix was not applied in DOM.');
    }

    // 10. Test Idempotency: Switch between views multiple times
    console.log('[10/10] Testing view-switching idempotency (Dashboard -> Costing -> Prioritas -> Costing)...');
    const idempotencyResult = await cdp.eval(`
      window.location.hash = '#dashboard';
      await new Promise(r => setTimeout(r, 300));
      window.location.hash = '#asb-costing';
      await new Promise(r => setTimeout(r, 300));
      window.location.hash = '#prioritas';
      await new Promise(r => setTimeout(r, 300));
      window.location.hash = '#asb-costing';
      await new Promise(r => setTimeout(r, 500));

      const sec = document.getElementById('view-asb-costing');
      const isVisible = sec && !sec.classList.contains('hidden');
      const kpiCeiling = document.getElementById('asb-kpi-ceiling')?.textContent;
      return { isVisible, kpiCeiling };
    `);
    console.log('  [PASS] Idempotency view switching:', idempotencyResult);
    if (!idempotencyResult.isVisible) throw new Error('View failed to re-open cleanly');

    console.log('\n================================================================');
    console.log('ALL 10 CHROME HEADLESS E2E TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
    }
  }
}

runBrowserQA().catch((err) => {
  console.error('\nE2E BROWSER QA FAILED:', err);
  process.exit(1);
});
