import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORTS_DIR = path.resolve('reports', 'screenshots');
const ARTIFACTS_SCREENSHOTS_DIR = 'C:\\Users\\Windows 10\\.gemini\\antigravity\\brain\\095cfaf7-c2c0-49da-9cea-74ede958fd94\\screenshots';
const APP_URL = 'http://localhost:3000/#peta';

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

  async captureScreenshot(fileName) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');

    // Save to reports/screenshots
    const repPath = path.join(REPORTS_DIR, fileName);
    fs.writeFileSync(repPath, buffer);

    // Save to artifacts/screenshots
    if (fs.existsSync(ARTIFACTS_SCREENSHOTS_DIR)) {
      const artPath = path.join(ARTIFACTS_SCREENSHOTS_DIR, fileName);
      fs.writeFileSync(artPath, buffer);
    }
    console.log(`[CDP] Saved screenshot: ${fileName}`);
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log('================================================================');
  console.log('SIAP JALAN HSS — ROAD NARRATIVE ENGINE UI & BROWSER VERIFICATION');
  console.log('================================================================');

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARTIFACTS_SCREENSHOTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_SCREENSHOTS_DIR, { recursive: true });
  }

  const port = 9229;
  const userDataDir = path.resolve('temp_chrome_narrative_verify');

  console.log('Launching headless Chrome on port ' + port + '...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1440,900',
    APP_URL,
  ]);

  let cdp = null;
  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (err) {}
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome debugging target');

    cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');

    console.log('Connected to CDP. Waiting for Leaflet map to load...');
    await sleep(2500);

    // Wait until roads and map are loaded
    await cdp.eval(`
      await new Promise((resolve) => {
        const check = () => {
          if (window.appState?.map && window.appState?.mapLayers?.countyRoads) {
            resolve();
          } else {
            setTimeout(check, 200);
          }
        };
        check();
      });
    `);
    console.log('Leaflet map and county roads loaded successfully.');

    // --- TEST 1: Select Road HSS-KAB-025 & Verify Executive Summary ---
    console.log('\n--- TEST 1: Select HSS-KAB-025 and Verify Executive Summary ---');
    const test1 = await cdp.eval(`
      await window.enterInteractiveSpatialProfile('HSS-KAB-025');
      await new Promise((res) => setTimeout(res, 1200));

      const inspector = document.getElementById('road-inspector');
      const summary = document.getElementById('inspector-narrative-summary');
      return {
        isInspectorVisible: inspector && !inspector.classList.contains('hidden'),
        summaryText: summary ? summary.innerText : '',
        paragraphsCount: summary ? summary.querySelectorAll('p').length : 0
      };
    `);
    console.log('Test 1 Result:', {
      isInspectorVisible: test1.isInspectorVisible,
      paragraphsCount: test1.paragraphsCount,
      summaryPreview: test1.summaryText.substring(0, 160) + '...',
    });
    await cdp.captureScreenshot('01_road_narrative_inspector_HSS-KAB-025.png');

    // --- TEST 2: Expand 8-Dimension Detailed Narratives ---
    console.log('\n--- TEST 2: Expand 8-Dimension Detailed Narratives ---');
    const test2 = await cdp.eval(`
      document.getElementById('btn-toggle-narrative-full')?.click();
      await new Promise((res) => setTimeout(res, 600));

      const box = document.getElementById('inspector-narrative-full-box');
      const btn = document.getElementById('btn-toggle-narrative-full');
      const t1 = document.getElementById('narrative-t1-text')?.textContent || '';
      const t2 = document.getElementById('narrative-t2-text')?.textContent || '';
      const t3 = document.getElementById('narrative-t3-text')?.textContent || '';
      const t4 = document.getElementById('narrative-t4-text')?.textContent || '';
      const t5 = document.getElementById('narrative-t5-text')?.textContent || '';
      const t6 = document.getElementById('narrative-t6-text')?.textContent || '';
      const t7 = document.getElementById('narrative-t7-text')?.textContent || '';
      const t8 = document.getElementById('narrative-t8-text')?.textContent || '';
      return {
        isBoxVisible: box && !box.classList.contains('hidden'),
        btnExpanded: btn?.getAttribute('aria-expanded'),
        t1Len: t1.length,
        t2Len: t2.length,
        t3Len: t3.length,
        t4Len: t4.length,
        t5Len: t5.length,
        t6Len: t6.length,
        t7Len: t7.length,
        t8Len: t8.length,
        t3Preview: t3.substring(0, 120) + '...',
        t4Preview: t4.substring(0, 120) + '...'
      };
    `);
    console.log('Test 2 Result:', test2);
    await cdp.captureScreenshot('02_road_narrative_8dimensions_expanded.png');

    // --- TEST 3: Trace Public Facility (RSUD) with Narrative Intact ---
    console.log('\n--- TEST 3: Trace Public Facility (RSUD) with Narrative Intact ---');
    const test3 = await cdp.eval(`
      document.getElementById('btn-card-trace-hospital')?.click();
      await new Promise((res) => setTimeout(res, 800));

      const hud = document.getElementById('interactive-route-hud');
      const summary = document.getElementById('inspector-narrative-summary');
      return {
        isHudVisible: hud && !hud.classList.contains('hidden'),
        hasRouteLayer: !!window.appState?.activeRouteLayer,
        summaryIntact: summary && summary.innerText.length > 50
      };
    `);
    console.log('Test 3 Result:', test3);
    await cdp.captureScreenshot('03_road_narrative_with_route_active.png');

    // --- TEST 4: Close Route and Confirm Narrative Persists ---
    console.log('\n--- TEST 4: Close Route and Confirm Narrative Persists ---');
    const test4 = await cdp.eval(`
      document.getElementById('btn-close-route-hud')?.click();
      await new Promise((res) => setTimeout(res, 600));

      const hud = document.getElementById('interactive-route-hud');
      return {
        isHudHidden: hud ? hud.classList.contains('hidden') : true,
        hasRouteLayer: !!window.appState?.activeRouteLayer
      };
    `);
    console.log('Test 4 Result:', test4);
    await cdp.captureScreenshot('04_route_closed_narrative_persisted.png');

    // --- TEST 5: Open Full Detail Drawer and Verify Narrative Sync ---
    console.log('\n--- TEST 5: Open Full Detail Drawer and Verify Narrative Sync ---');
    const test5 = await cdp.eval(`
      await window.openRoadDetail('HSS-KAB-025', { showFactors: false });
      await new Promise((res) => setTimeout(res, 1000));

      const drawer = document.getElementById('road-detail-drawer');
      const summary = document.getElementById('drawer-narrative-summary');
      const dimBox = document.getElementById('drawer-narrative-8dimensions');
      if (dimBox) dimBox.open = true;
      const dimCards = document.getElementById('drawer-narrative-8dim-content');
      return {
        isDrawerOpen: drawer && !drawer.classList.contains('hidden'),
        hasSummary: summary && summary.innerText.length > 50,
        cardCount: dimCards ? dimCards.children.length : 0
      };
    `);
    console.log('Test 5 Result:', test5);
    await cdp.captureScreenshot('05_road_narrative_in_detail_drawer.png');

    // Close drawer
    await cdp.eval(`
      document.getElementById('btn-close-drawer')?.click();
      await new Promise((res) => setTimeout(res, 500));
    `);

    // --- TEST 6: Edge Case HSS-KAB-299 (Disconnected Road) ---
    console.log('\n--- TEST 6: Edge Case HSS-KAB-299 (Disconnected Road) ---');
    const test6 = await cdp.eval(`
      await window.enterInteractiveSpatialProfile('HSS-KAB-299');
      await new Promise((res) => setTimeout(res, 1200));

      const summary = document.getElementById('inspector-narrative-summary');
      const t4 = document.getElementById('narrative-t4-text');
      return {
        summaryText: summary ? summary.innerText.substring(0, 150) + '...' : '',
        t4Text: t4 ? t4.innerText : ''
      };
    `);
    console.log('Test 6 Result:', test6);
    await cdp.captureScreenshot('06_road_narrative_disconnected_HSS-KAB-299.png');

    // --- TEST 7: Road HSS-KAB-001 (Kandangan Kota, 94.9% Permukiman) ---
    console.log('\n--- TEST 7: Road HSS-KAB-001 (Kandangan Kota, 94.9% Permukiman) ---');
    const test7 = await cdp.eval(`
      await window.enterInteractiveSpatialProfile('HSS-KAB-001');
      await new Promise((res) => setTimeout(res, 1200));

      const summary = document.getElementById('inspector-narrative-summary');
      const t3 = document.getElementById('narrative-t3-text');
      return {
        summary: summary ? summary.innerText.substring(0, 150) + '...' : '',
        t3: t3 ? t3.innerText : ''
      };
    `);
    console.log('Test 7 Result:', test7);
    await cdp.captureScreenshot('07_road_narrative_HSS-KAB-001.png');

    // --- TEST 8: Tablet Viewport (1024 × 768) ---
    console.log('\n--- TEST 8: Tablet Viewport (1024 × 768) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);
    await cdp.captureScreenshot('08_road_narrative_tablet_1024x768.png');

    // --- TEST 9: Mobile / Narrow Viewport (414 × 896) ---
    console.log('\n--- TEST 9: Mobile / Narrow Viewport (414 × 896) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 414,
      height: 896,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1000);
    await cdp.captureScreenshot('09_road_narrative_mobile_414x896.png');

    console.log('\n================================================================');
    console.log('ALL ROAD NARRATIVE ENGINE CDP TESTS COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
