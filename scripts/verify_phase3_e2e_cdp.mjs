import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

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
  console.log('STARTING PHASE 3 CHROME HEADLESS E2E BROWSER QA');
  console.log('================================================================\n');

  // 1. Ensure server is running on port 3000
  let serverProc = null;
  try {
    const ping = await fetch('http://localhost:3000/api/models/active').catch(() => null);
    if (!ping || !ping.ok) {
      console.log('Starting local Node.js server on port 3000...');
      serverProc = spawn('node', ['--experimental-strip-types', 'src/server.ts'], {
        stdio: 'pipe',
      });
      await sleep(3000);
    } else {
      console.log('Server is already running on port 3000.');
    }
  } catch (e) {
    console.log('Starting server...');
    serverProc = spawn('node', ['--experimental-strip-types', 'src/server.ts'], {
      stdio: 'pipe',
    });
    await sleep(3000);
  }

  const remotePort = 9225;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${remotePort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    '--user-data-dir=' + path.resolve('.tmp-chrome-cdp-phase3'),
    APP_URL,
  ]);

  let cdp;
  let testScenarioId = null;

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

    console.log('[1/9] Waiting for page load and ASB module initialization...');
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(3000);

    // 1. Verify view is active and baseline KPIs rendered
    const viewStatus = await cdp.eval(`
      const sec = document.getElementById('view-asb-costing');
      const isVisible = sec && !sec.classList.contains('hidden');
      const totalCostText = document.getElementById('asb-kpi-total-cost')?.textContent;
      const ceilingText = document.getElementById('asb-kpi-ceiling')?.textContent;
      const allocatedText = document.getElementById('asb-kpi-allocated')?.textContent;
      const fundedConst = document.getElementById('asb-kpi-funded-construction')?.textContent;
      return { isVisible, totalCostText, ceilingText, allocatedText, fundedConst };
    `);
    console.log('  [PASS] Initial View State:', viewStatus);
    if (!viewStatus.isVisible) throw new Error('view-asb-costing is not visible');
    if (!viewStatus.totalCostText?.includes('784.322.010.000')) {
      throw new Error(`Total cost mismatch! Expected Rp 784.322.010.000, got: ${viewStatus.totalCostText}`);
    }

    // 2. Switch to 🎯 Optimasi Solver (ILP) Tab
    console.log('[2/9] Switching to Subtab: 🎯 Optimasi Solver (ILP)...');
    const solverTabResult = await cdp.eval(`
      const btn = document.querySelector('.asb-subtab-btn[data-tab="optimasi-matematis"]');
      btn?.click();
      await new Promise(r => setTimeout(r, 800));
      const panel = document.getElementById('asb-panel-optimasi-matematis');
      const isVisible = panel && !panel.classList.contains('hidden');
      const comparisonRows = document.querySelectorAll('#asb-solver-comparison-tbody tr').length;
      return { isVisible, comparisonRows };
    `);
    console.log('  [PASS] Solver Subtab & Comparison Matrix:', solverTabResult);
    if (!solverTabResult.isVisible) throw new Error('Optimasi Solver tab panel is not visible');
    if (solverTabResult.comparisonRows !== 4) {
      throw new Error(`Expected exactly 4 comparison rows in #asb-solver-comparison-tbody, got ${solverTabResult.comparisonRows}`);
    }

    // 3. Inspect Comparison Matrix Values
    console.log('[3/9] Verifying 4-Method Comparison Matrix table values...');
    const compTableValues = await cdp.eval(`
      const rows = [...document.querySelectorAll('#asb-solver-comparison-tbody tr')].map(r => ({
        name: r.querySelector('td:nth-child(1) div')?.textContent.trim(),
        ceiling: r.querySelector('td:nth-child(2)')?.textContent.trim(),
        allocated: r.querySelector('td:nth-child(3)')?.textContent.trim(),
        remaining: r.querySelector('td:nth-child(4)')?.textContent.trim(),
        absorption: r.querySelector('td:nth-child(5)')?.textContent.trim(),
        length: r.querySelector('td:nth-child(6)')?.textContent.trim(),
        status: r.querySelector('td:nth-child(8) span')?.textContent.trim()
      }));
      return rows;
    `);
    console.log('  [PASS] Comparison Table Rows:', compTableValues);
    if (compTableValues.length !== 4) throw new Error('Comparison table does not have 4 rows');
    if (!compTableValues[0].allocated?.includes('48.789.930.000')) {
      throw new Error(`Greedy allocated cost mismatch! Expected Rp 48.789.930.000, got: ${compTableValues[0].allocated}`);
    }

    // 4. Open Duplicate Scenario Modal
    console.log('[4/9] Opening Duplicate Scenario modal...');
    const modalOpen = await cdp.eval(`
      const btn = document.getElementById('asb-btn-duplicate');
      btn?.click();
      await new Promise(r => setTimeout(r, 400));
      const modal = document.getElementById('asb-duplicate-scenario-modal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const srcName = document.getElementById('asb-dup-source-name')?.value;
      return { isVisible, srcName };
    `);
    console.log('  [PASS] Duplicate Modal Open:', modalOpen);
    if (!modalOpen.isVisible) throw new Error('Duplicate scenario modal failed to open');

    // 5. Submit Duplicate Form (Rp 75 Miliar + MAX_LENGTH)
    console.log('[5/9] Submitting duplicate scenario form (Rp 75B, Objective B: MAX_LENGTH)...');
    const dupSubmitResult = await cdp.eval(`
      const form = document.getElementById('asb-duplicate-scenario-form');
      form.scenario_name.value = 'Simulasi E2E Rp 75 Miliar';
      form.budget_ceiling_rp.value = '75000000000';
      form.optimization_objective.value = 'MAX_LENGTH';
      form.description.value = 'Pengujian E2E Browser Headless CDP Phase 3';

      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 2000));

      const modal = document.getElementById('asb-duplicate-scenario-modal');
      const isClosed = modal?.classList.contains('hidden');
      const activeScenario = document.getElementById('asb-scenario-select')?.value;
      const kpiCeiling = document.getElementById('asb-kpi-ceiling')?.textContent;
      const kpiAllocated = document.getElementById('asb-kpi-allocated')?.textContent;
      const kpiLength = document.getElementById('asb-kpi-treated-length')?.textContent;
      return { isClosed, activeScenario, kpiCeiling, kpiAllocated, kpiLength };
    `);
    console.log('  [PASS] Duplicate Form Submission Result:', dupSubmitResult);
    if (!dupSubmitResult.isClosed) throw new Error('Duplicate modal failed to close');
    if (!dupSubmitResult.activeScenario.includes('SIM_')) {
      throw new Error(`Expected active scenario to be new SIM_*, got: ${dupSubmitResult.activeScenario}`);
    }
    testScenarioId = dupSubmitResult.activeScenario;

    // 6. Run Solver on New Scenario (Objective A: PRIORITY_WEIGHTED)
    console.log('[6/9] Running solver under Objective A (PRIORITY_WEIGHTED)...');
    const solveResult = await cdp.eval(`
      // Select Objective A
      const radioA = document.querySelector('input[name="asb_optimization_objective"][value="PRIORITY_WEIGHTED"]');
      if (radioA) {
        radioA.checked = true;
        radioA.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const runBtn = document.getElementById('asb-btn-run-solver');
      runBtn.click();
      await new Promise(r => setTimeout(r, 2000));

      const certRibbon = document.getElementById('asb-solver-cert-ribbon')?.textContent;
      const solverStatus = document.getElementById('asb-solver-status-badge')?.textContent;
      const solverGap = document.getElementById('asb-solver-gap')?.textContent;
      const kpiAllocated = document.getElementById('asb-kpi-allocated')?.textContent;
      const kpiFunded = document.getElementById('asb-kpi-funded-construction')?.textContent;
      return { certRibbon, solverStatus, solverGap, kpiAllocated, kpiFunded };
    `);
    console.log('  [PASS] Solver Execution Result:', solveResult);
    if (!solveResult.solverStatus?.includes('OPTIMAL') && !solveResult.solverStatus?.includes('FEASIBLE')) {
      throw new Error(`Unexpected solver status: ${solveResult.solverStatus}`);
    }

    // 7. Switch to 📋 Rekapitulasi Ruas (350) and test Operational Status Filter
    console.log('[7/9] Switching to Rekapitulasi Ruas and filtering by FUNDED_CONSTRUCTION...');
    const filterResult = await cdp.eval(`
      const tabBtn = document.querySelector('.asb-subtab-btn[data-tab="rekap-ruas"]');
      tabBtn.click();
      await new Promise(r => setTimeout(r, 600));

      const filterOp = document.getElementById('asb-filter-op-status');
      filterOp.value = 'FUNDED_CONSTRUCTION';
      filterOp.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));

      const rows = [...document.querySelectorAll('#asb-road-table-body tr')];
      const badges = rows.slice(0, 5).map(r => r.querySelector('td:nth-child(10)')?.textContent.trim());
      const paguTeralokasi = rows.slice(0, 5).map(r => r.querySelector('td:nth-child(9)')?.textContent.trim());
      return { rowCount: rows.length, badges, paguTeralokasi };
    `);
    console.log('  [PASS] Filter FUNDED_CONSTRUCTION Result:', filterResult);
    if (filterResult.rowCount === 0) throw new Error('No rows found for FUNDED_CONSTRUCTION');
    for (const badge of filterResult.badges) {
      if (!badge.includes('KONSTRUKSI DIDANAI')) {
        throw new Error(`Expected KONSTRUKSI DIDANAI badge, got: ${badge}`);
      }
    }

    // 8. Open Road Detail Modal on HSS-KAB-025 and verify 3 Length Distinctions
    console.log('[8/9] Opening Road Detail modal on first row and checking 3 length distinctions...');
    const detailResult = await cdp.eval(`
      const btnDetail = document.querySelector('.asb-btn-road-detail');
      btnDetail.click();
      await new Promise(r => setTimeout(r, 800));

      const modal = document.getElementById('asb-road-detail-modal');
      const isVisible = modal && !modal.classList.contains('hidden');
      const metaText = document.getElementById('asb-modal-road-meta')?.textContent;
      
      // Close with Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const isClosed = modal.classList.contains('hidden');

      return { isVisible, metaText, isClosed };
    `);
    console.log('  [PASS] Road Detail Modal 3-Length Distinction:', detailResult);
    if (!detailResult.metaText?.includes('Panjang Resmi SK') || !detailResult.metaText?.includes('Panjang DD1 Survei') || !detailResult.metaText?.includes('Panjang Ditangani')) {
      throw new Error(`Modal meta does not distinguish official, surveyed, and treated lengths: ${detailResult.metaText}`);
    }

    // 9. Switch to 📑 Register Ruas Tertunda Tab
    console.log('[9/9] Switching to Subtab: 📑 Register Ruas Tertunda...');
    const deferredTabResult = await cdp.eval(`
      const btn = document.querySelector('.asb-subtab-btn[data-tab="register-tertunda"]');
      btn?.click();
      await new Promise(r => setTimeout(r, 1500));
      const panel = document.getElementById('asb-panel-register-tertunda');
      const isVisible = panel && !panel.classList.contains('hidden');
      const kpiCount = document.getElementById('asb-deferred-kpi-count')?.textContent;
      const kpiCost = document.getElementById('asb-deferred-kpi-cost')?.textContent;
      const rows = document.querySelectorAll('#asb-deferred-table-body tr').length;
      return { isVisible, kpiCount, kpiCost, rows };
    `);
    console.log('  [PASS] Deferred Register Subtab:', deferredTabResult);
    if (!deferredTabResult.isVisible) throw new Error('Deferred register panel is not visible');
    if (deferredTabResult.rows === 0) throw new Error('Deferred register table has 0 rows');

    // Take screenshot of optimization workspace
    console.log('\nCapturing screenshot of Phase 3 Optimization Workspace...');
    const ssResult = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssPath = path.resolve('reports/screenshots/phase3_optimization_workspace_e2e.png');
    fs.mkdirSync(path.dirname(ssPath), { recursive: true });
    fs.writeFileSync(ssPath, Buffer.from(ssResult.data, 'base64'));
    console.log('  Saved screenshot to:', ssPath);

    console.log('\n================================================================');
    console.log('ALL 9 PHASE 3 CHROME HEADLESS E2E TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    if (cdp && testScenarioId) {
      try {
        await cdp.eval(`
          const res = await fetch('/api/costing/scenarios/${testScenarioId}', { method: 'DELETE' });
        `);
      } catch {}
    }
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
    }
    if (serverProc) {
      serverProc.kill('SIGKILL');
    }
  }
}

runBrowserQA().catch((err) => {
  console.error('\nE2E BROWSER QA FAILED:', err);
  process.exit(1);
});
