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
  console.log('SIAP JALAN HSS — RESTORE PUBLIC FACILITY NETWORK ROUTING TEST');
  console.log('================================================================');

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARTIFACTS_SCREENSHOTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_SCREENSHOTS_DIR, { recursive: true });
  }

  const port = 9225;
  const userDataDir = path.resolve('temp_chrome_facility_routing');

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
    await cdp.send('CSS.enable');

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

    // -------------------------------------------------------------
    // TEST 1: Open Interactive Spatial Profile for HSS-KAB-025 & Verify Facility Distances
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Select HSS-KAB-025 and Enter Interactive Spatial Profile ---');
    const profileInfo = await cdp.eval(`
      await window.enterInteractiveSpatialProfile('HSS-KAB-025');
      // Wait for facilities to fetch
      await new Promise((res) => setTimeout(res, 800));

      const hospDist = document.getElementById('card-badge-dist-hospital')?.textContent;
      const hospName = document.getElementById('card-name-dist-hospital')?.textContent;
      const puskDist = document.getElementById('card-badge-dist-puskesmas')?.textContent;
      const puskName = document.getElementById('card-name-dist-puskesmas')?.textContent;
      const schDist = document.getElementById('card-badge-dist-school')?.textContent;
      const mktDist = document.getElementById('card-badge-dist-market')?.textContent;

      return { hospDist, hospName, puskDist, puskName, schDist, mktDist };
    `);
    console.log('Card 5 Facility Accessibility Info:', profileInfo);

    // -------------------------------------------------------------
    // TEST 2: Trace RSUD (Hospital) Route
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Trace Hospital (RSUD) Route ---');
    const hospTraceResult = await cdp.eval(`
      document.getElementById('btn-card-trace-hospital').click();
      await new Promise((res) => setTimeout(res, 600));

      const hud = document.getElementById('interactive-route-hud');
      const isHudVisible = hud && !hud.classList.contains('hidden');
      const facName = document.getElementById('route-hud-facility-name')?.textContent;
      const netDist = document.getElementById('route-hud-network-dist')?.textContent;
      const straightDist = document.getElementById('route-hud-straight-dist')?.textContent;
      const snapDist = document.getElementById('route-hud-snap-dist')?.textContent;
      const hasRouteLayer = Boolean(window.appState?.mapLayers?.routeTrace);
      const isTracingActive = window.appState?.isRouteTracingActive;
      const svgLinesHidden = document.getElementById('interactive-detail-svg')?.innerHTML === '';

      return {
        isHudVisible,
        facName,
        netDist,
        straightDist,
        snapDist,
        hasRouteLayer,
        isTracingActive,
        svgLinesHidden,
      };
    `);
    console.log('Hospital Trace Result:', hospTraceResult);
    await sleep(400);
    await cdp.captureScreenshot('01_facility_routing_hospital_HSS-KAB-025.png');

    // -------------------------------------------------------------
    // TEST 3: Switch Seamlessly to Puskesmas
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Switch Seamlessly to Puskesmas ---');
    const puskTraceResult = await cdp.eval(`
      document.getElementById('btn-card-trace-puskesmas').click();
      await new Promise((res) => setTimeout(res, 600));

      const facName = document.getElementById('route-hud-facility-name')?.textContent;
      const netDist = document.getElementById('route-hud-network-dist')?.textContent;
      const activeType = window.appState?.activeTracedFacilityType;

      return { facName, netDist, activeType };
    `);
    console.log('Puskesmas Trace Result:', puskTraceResult);
    await sleep(400);
    await cdp.captureScreenshot('02_facility_routing_puskesmas_HSS-KAB-025.png');

    // -------------------------------------------------------------
    // TEST 4: Switch Seamlessly to Sekolah
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Switch Seamlessly to Sekolah ---');
    const schTraceResult = await cdp.eval(`
      document.getElementById('btn-card-trace-school').click();
      await new Promise((res) => setTimeout(res, 600));

      const facName = document.getElementById('route-hud-facility-name')?.textContent;
      const netDist = document.getElementById('route-hud-network-dist')?.textContent;
      const activeType = window.appState?.activeTracedFacilityType;

      return { facName, netDist, activeType };
    `);
    console.log('Sekolah Trace Result:', schTraceResult);
    await sleep(400);
    await cdp.captureScreenshot('03_facility_routing_school_HSS-KAB-025.png');

    // -------------------------------------------------------------
    // TEST 5: Switch Seamlessly to Pasar
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Switch Seamlessly to Pasar ---');
    const mktTraceResult = await cdp.eval(`
      document.getElementById('btn-card-trace-market').click();
      await new Promise((res) => setTimeout(res, 600));

      const facName = document.getElementById('route-hud-facility-name')?.textContent;
      const netDist = document.getElementById('route-hud-network-dist')?.textContent;
      const activeType = window.appState?.activeTracedFacilityType;

      return { facName, netDist, activeType };
    `);
    console.log('Pasar Trace Result:', mktTraceResult);
    await sleep(400);
    await cdp.captureScreenshot('04_facility_routing_market_HSS-KAB-025.png');

    // -------------------------------------------------------------
    // TEST 6: Close Route ("✕ Tutup Rute") and Return to Road Profile
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Close Route ("✕ Tutup Rute") ---');
    const closeResult = await cdp.eval(`
      document.getElementById('btn-close-route-hud').click();
      await new Promise((res) => setTimeout(res, 800));

      const hud = document.getElementById('interactive-route-hud');
      const isHudHidden = hud.classList.contains('hidden');
      const hasRouteLayer = Boolean(window.appState?.mapLayers?.routeTrace);
      const isTracingActive = window.appState?.isRouteTracingActive;
      const svgHasLines = document.getElementById('interactive-detail-svg')?.innerHTML.length > 50;

      return { isHudHidden, hasRouteLayer, isTracingActive, svgHasLines };
    `);
    console.log('Close Route Result:', closeResult);
    await sleep(400);
    await cdp.captureScreenshot('05_route_closed_detail_restored.png');

    // -------------------------------------------------------------
    // TEST 7: Disconnected Network Handling (HSS-KAB-299)
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Disconnected Network Test (HSS-KAB-299) ---');
    const disconnectedResult = await cdp.eval(`
      await window.enterInteractiveSpatialProfile('HSS-KAB-299');
      await new Promise((res) => setTimeout(res, 800));

      const hospBadge = document.getElementById('card-badge-dist-hospital')?.textContent;
      const hospName = document.getElementById('card-name-dist-hospital')?.textContent;

      // Click to trace disconnected hospital
      document.getElementById('btn-card-trace-hospital').click();
      await new Promise((res) => setTimeout(res, 400));

      const hud = document.getElementById('interactive-route-hud');
      const isHudVisible = hud && !hud.classList.contains('hidden');
      const hudBadge = document.getElementById('route-hud-type-badge')?.textContent;
      const hudNetDist = document.getElementById('route-hud-network-dist')?.textContent;
      const hasRouteLayer = Boolean(window.appState?.mapLayers?.routeTrace);

      return { hospBadge, hospName, isHudVisible, hudBadge, hudNetDist, hasRouteLayer };
    `);
    console.log('Disconnected Route Result:', disconnectedResult);
    await sleep(400);
    await cdp.captureScreenshot('06_disconnected_network_graceful_handling.png');

    // -------------------------------------------------------------
    // TEST 8: Tablet Viewport (1024x768) with Active Route (HSS-KAB-001)
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Tablet Viewport (1024x768) Routing Test ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);

    const tabletResult = await cdp.eval(`
      window.appState.map.invalidateSize();
      await window.enterInteractiveSpatialProfile('HSS-KAB-001');
      await new Promise((res) => setTimeout(res, 800));

      // Trace RSUD
      document.getElementById('btn-card-trace-hospital').click();
      await new Promise((res) => setTimeout(res, 600));

      const facName = document.getElementById('route-hud-facility-name')?.textContent;
      const netDist = document.getElementById('route-hud-network-dist')?.textContent;

      return { facName, netDist };
    `);
    console.log('Tablet Route Result:', tabletResult);
    await sleep(400);
    await cdp.captureScreenshot('07_tablet_facility_routing_1024x768.png');

    // -------------------------------------------------------------
    // TEST 9: Exit Detail & Restore Normal Map
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Exit Interactive Detail & Restore Normal Map ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(300);

    const exitResult = await cdp.eval(`
      window.exitInteractiveSpatialProfile();
      await new Promise((res) => setTimeout(res, 400));

      const overlay = document.getElementById('interactive-detail-overlay');
      const isOverlayHidden = overlay.classList.contains('hidden');
      const hasRouteLayer = Boolean(window.appState?.mapLayers?.routeTrace);
      const isInteractiveMode = window.appState?.isInteractiveDetailMode;

      return { isOverlayHidden, hasRouteLayer, isInteractiveMode };
    `);
    console.log('Exit Result:', exitResult);
    await sleep(400);
    await cdp.captureScreenshot('08_normal_map_restored.png');

    console.log('\n================================================================');
    console.log('ALL FACILITY ROUTING RESTORATION CDP TESTS COMPLETED SUCCESSFULLY!');
    console.log('================================================================');

  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main();
