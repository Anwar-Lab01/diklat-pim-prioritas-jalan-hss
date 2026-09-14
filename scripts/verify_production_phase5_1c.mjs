import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('reports', 'screenshots');
const PRODUCTION_URL = 'https://diklat-pim-prioritas-jalan-hss.vercel.app/#peta';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.consoleErrors = [];

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Console.messageAdded') {
        const text = msg.params?.message?.text || '';
        const level = msg.params?.message?.level;
        if (level === 'error') {
          this.consoleErrors.push(`[Console Error] ${text}`);
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text;
        this.consoleErrors.push(`[Runtime Exception] ${desc}`);
      }

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

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log('================================================================');
  console.log('STARTING RIGOROUS VERCEL PRODUCTION VERIFICATION (PHASE 5.1C)');
  console.log(`Target: ${PRODUCTION_URL}`);
  console.log('================================================================\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9226;
  const userDataDir = path.resolve('temp_chrome_prod_p51c');

  console.log('Launching headless Chrome to load Vercel production...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1920,1080',
    PRODUCTION_URL,
  ]);

  let cdp = null;
  try {
    let version = null;
    for (let i = 0; i < 25; i++) {
      try {
        version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
        break;
      } catch {
        await sleep(300);
      }
    }
    if (!version) throw new Error('Failed to connect to Chrome debug port');

    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Console.enable');
    await cdp.send('Runtime.enable');

    console.log('Waiting for Vercel production to load shell, data, and Leaflet map...');
    await sleep(6000);

    // Set viewport 1920x1080
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);

    // Check 1: Default map mode = PRIORITAS
    console.log('\n--- CHECK 1: DEFAULT MAP THEMATIC MODE ---');
    const initialMode = await cdp.eval(`
      return window.appState ? window.appState.roadThematicMode : null;
    `);
    console.log(`  Initial thematic mode: ${initialMode}`);
    if (initialMode !== 'PRIORITAS') {
      throw new Error(`Expected default mode PRIORITAS, got ${initialMode}`);
    }
    console.log('  [PASS] Default map mode is PRIORITAS');

    // Check 2 & 3: Switch to Kondisi DD1 & all 7,487 segment asset loads
    console.log('\n--- CHECK 2 & 3: SWITCH TO KONDISI DD1 & 7,487 SEGMENTS LOAD ---');
    const dd1SwitchResult = await cdp.eval(`
      const t0 = performance.now();
      await window.setRoadThematicMode('KONDISI_DD1');
      const duration = performance.now() - t0;
      const layer = window.appState && window.appState.mapLayers && window.appState.mapLayers.fullDd1Segments;
      const count = layer ? layer.getLayers().length : 0;
      const isOnMap = !!(layer && window.appState.map && window.appState.map.hasLayer(layer));
      return { duration, count, isOnMap };
    `);
    console.log(`  Mode switched in ${dd1SwitchResult.duration.toFixed(1)} ms`);
    console.log(`  Rendered DD1 segments on Leaflet canvas: ${dd1SwitchResult.count}`);
    console.log(`  Is layer active on Leaflet map: ${dd1SwitchResult.isOnMap}`);
    if (dd1SwitchResult.count !== 7487) {
      throw new Error(`Expected 7487 DD1 segments, got ${dd1SwitchResult.count}`);
    }
    if (!dd1SwitchResult.isOnMap) {
      throw new Error('DD1 segments layer is not attached to map in DD1 mode');
    }
    console.log('  [PASS] Switch to Kondisi DD1 rendered all 7,487 segments on Leaflet canvas');

    // Check 4: Switch back to Prioritas
    console.log('\n--- CHECK 4: SWITCH BACK TO PRIORITAS ---');
    const prioritasSwitchResult = await cdp.eval(`
      const t0 = performance.now();
      await window.setRoadThematicMode('PRIORITAS');
      const duration = performance.now() - t0;
      const countyLayer = window.appState && window.appState.mapLayers && window.appState.mapLayers.countyRoads;
      const isOnMap = !!(countyLayer && window.appState.map && window.appState.map.hasLayer(countyLayer));
      const mode = window.appState.roadThematicMode;
      return { duration, isOnMap, mode };
    `);
    console.log(`  Mode switched back in ${prioritasSwitchResult.duration.toFixed(1)} ms, active mode: ${prioritasSwitchResult.mode}`);
    if (prioritasSwitchResult.mode !== 'PRIORITAS' || !prioritasSwitchResult.isOnMap) {
      throw new Error('Failed to switch back to PRIORITAS mode');
    }
    console.log('  [PASS] Switch back to Prioritas successfully restores county roads');

    // Check 5, 6, 7: Query the five mandatory roads on production
    console.log('\n--- CHECK 5, 6, 7: LOCKED OPERATIONAL_2025 BASELINE SCORES & RANKS ---');
    const roadsData = await cdp.eval(`
      const targetKeys = ['HSS-KAB-025', 'HSS-KAB-001', 'HSS-KAB-295', 'HSS-KAB-350', 'HSS-KAB-013'];
      const results = {};
      for (const k of targetKeys) {
        const res = await fetch('/api/roads/' + k);
        const json = await res.json();
        results[k] = json.data.priorityResult;
      }
      return results;
    `);

    const expected = {
      'HSS-KAB-025': { rank: 1, score: 0.649945, tier: 'TOP_35' },
      'HSS-KAB-001': { rank: 12, score: 0.529610, tier: 'TOP_35' },
      'HSS-KAB-295': { rank: 133, score: 0.412427, tier: 'REGULAR' },
      'HSS-KAB-350': { rank: 169, score: 0.381386, tier: 'REGULAR' },
      'HSS-KAB-013': { rank: 245, score: 0.340749, tier: 'REGULAR' },
    };

    for (const [key, exp] of Object.entries(expected)) {
      const act = roadsData[key];
      console.log(`  Road ${key}: final_score=${act.final_score.toFixed(6)} (exp: ${exp.score}), rank=${act.priority_rank} (exp: ${exp.rank}), tier=${act.tier_category}`);
      if (act.priority_rank !== exp.rank) {
        throw new Error(`Rank mismatch for ${key}: expected ${exp.rank}, got ${act.priority_rank}`);
      }
      if (Math.abs(act.final_score - exp.score) > 0.0005) {
        throw new Error(`Score mismatch for ${key}: expected ~${exp.score}, got ${act.final_score}`);
      }
      if (act.tier_category !== exp.tier) {
        throw new Error(`Tier mismatch for ${key}: expected ${exp.tier}, got ${act.tier_category}`);
      }
    }
    console.log('  [PASS] All 5 mandatory roads match locked OPERATIONAL_2025 baseline exactly!');

    // Check 8: Route tracing still works
    console.log('\n--- CHECK 8: NETWORK ROUTE TRACING FUNCTIONALITY ---');
    const routeTracingResult = await cdp.eval(`
      await window.openRoadDetail('HSS-KAB-025');
      await window.selectRoadOnMap('HSS-KAB-025');
      
      // Wait for nearest facilities data to load
      for (let i = 0; i < 30; i++) {
        if (!window.appState.nearestFacilitiesLoading && (window.appState.currentRoadNearestFacilities || []).length > 0) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      // Trigger route tracing
      if (typeof window.traceNearestFacilityRoute === 'function') {
        window.traceNearestFacilityRoute('puskesmas');
      }
      await new Promise((r) => setTimeout(r, 400));

      const routeLayer = window.appState && window.appState.mapLayers && (window.appState.mapLayers.routeTrace || window.appState.mapLayers.routeTracing);
      const isRouteActive = !!(routeLayer && window.appState.map && window.appState.map.hasLayer(routeLayer));
      return { isRouteActive };
    `);
    console.log('  Route tracing layer active on Leaflet map:', routeTracingResult.isRouteActive);
    if (!routeTracingResult.isRouteActive) {
      throw new Error('Route tracing failed to render route polyline on production map');
    }
    console.log('  [PASS] Route tracing is fully functional on production');

    // Check 9: Browser console errors
    console.log('\n--- CHECK 9: BROWSER CONSOLE ERROR AUDIT ---');
    console.log(`  Total captured console errors: ${cdp.consoleErrors.length}`);
    if (cdp.consoleErrors.length > 0) {
      console.error('  Detected console errors:', cdp.consoleErrors);
      throw new Error(`Found ${cdp.consoleErrors.length} browser console errors on production`);
    }
    console.log('  [PASS] Zero browser console errors on live Vercel production');

    // Capture production screenshot
    console.log('\nCapturing live production screenshot...');
    const ss = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const prodPath = path.join(OUTPUT_DIR, 'phase5_1c_production_verified.png');
    fs.writeFileSync(prodPath, Buffer.from(ss.data, 'base64'));
    console.log(`  Saved screenshot to: ${prodPath}`);

    console.log('\n================================================================');
    console.log('>>> VERCEL PRODUCTION VERIFICATION: ALL 9 CHECKS PASSED! <<<');
    console.log('================================================================\n');
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Production Verification Failed:', err);
  process.exit(1);
});
