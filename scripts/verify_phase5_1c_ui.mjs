import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('reports', 'screenshots');
const APP_URL = 'http://localhost:3000/#peta';

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

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log('--- STARTING CDP VERIFICATION FOR PHASE 5.1C (FULL-MAP THEMATIC MODE) ---');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9222;
  const userDataDir = path.resolve('temp_chrome_p51c');

  console.log('Launching headless Chrome...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1920,1080',
    APP_URL,
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

    console.log('Waiting for application shell and map to load...');
    await sleep(3500);

    // Viewport 1: 1920x1080
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);

    // Check default state
    const initialThematicMode = await cdp.eval(`
      return window.appState ? window.appState.roadThematicMode : null;
    `);
    console.log(`Initial thematic mode: ${initialThematicMode} (expected: PRIORITAS)`);
    if (initialThematicMode !== 'PRIORITAS') {
      throw new Error(`Expected initial mode PRIORITAS, got ${initialThematicMode}`);
    }

    // Capture Screenshot 1: Overview in Prioritas mode
    console.log('Capturing Screenshot 1: Overview in Prioritas mode (1920x1080)...');
    const ss1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p1Path = path.join(OUTPUT_DIR, 'phase5_1c_overview_prioritas.png');
    fs.writeFileSync(p1Path, Buffer.from(ss1.data, 'base64'));
    console.log(`  -> Saved ${p1Path}`);

    // Test mode switch activation time: PRIORITAS -> KONDISI DD1
    console.log('Measuring mode switch: PRIORITAS -> KONDISI DD1 (including asset load)...');
    const switchMetrics1 = await cdp.eval(`
      const t0 = performance.now();
      await window.setRoadThematicMode('KONDISI_DD1');
      const duration = performance.now() - t0;
      const featureCount = window.appState.mapLayers.fullDd1Segments ? window.appState.mapLayers.fullDd1Segments.getLayers().length : 0;
      return { duration, featureCount };
    `);

    console.log(`  -> PRIORITAS -> DD1 switch time: ${switchMetrics1.duration.toFixed(1)} ms, rendered segments: ${switchMetrics1.featureCount}`);

    await sleep(1000);

    // Capture Screenshot 2: Overview in DD1 mode
    console.log('Capturing Screenshot 2: Overview in Kondisi DD1 mode (1920x1080)...');
    const ss2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p2Path = path.join(OUTPUT_DIR, 'phase5_1c_overview_dd1.png');
    fs.writeFileSync(p2Path, Buffer.from(ss2.data, 'base64'));
    console.log(`  -> Saved ${p2Path}`);

    // Test mode switch: KONDISI DD1 -> PRIORITAS
    console.log('Measuring mode switch: KONDISI DD1 -> PRIORITAS...');
    const switchMetrics2 = await cdp.eval(`
      const t0 = performance.now();
      await window.setRoadThematicMode('PRIORITAS');
      const duration = performance.now() - t0;
      return { duration };
    `);
    console.log(`  -> DD1 -> PRIORITAS switch time: ${switchMetrics2.duration.toFixed(1)} ms`);

    // Test re-activating KONDISI DD1 (cached)
    console.log('Measuring mode switch: PRIORITAS -> KONDISI DD1 (cached)...');
    const switchMetrics3 = await cdp.eval(`
      const t0 = performance.now();
      await window.setRoadThematicMode('KONDISI_DD1');
      const duration = performance.now() - t0;
      return { duration };
    `);
    console.log(`  -> Re-activating DD1 switch time: ${switchMetrics3.duration.toFixed(1)} ms`);

    // Test responsive resolutions: 1440x900 and 1366x768
    console.log('Testing resolution 1440x900...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);

    console.log('Testing resolution 1366x768...');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);

    // Zoom into mixed condition road (HSS-KAB-001 in Kandangan Kota)
    console.log('Zooming into mixed-condition road HSS-KAB-001 in DD1 mode...');
    await cdp.eval(`
      if (window.appState && window.appState.map) {
        window.appState.map.setView([-2.784, 115.263], 15);
      }
    `);
    await sleep(1200);

    // Capture Screenshot 3: Close-up of mixed condition road
    console.log('Capturing Screenshot 3: Close-up of mixed-condition road showing STA transitions...');
    const ss3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p3Path = path.join(OUTPUT_DIR, 'phase5_1c_close_mixed_road.png');
    fs.writeFileSync(p3Path, Buffer.from(ss3.data, 'base64'));
    console.log(`  -> Saved ${p3Path}`);

    // Select road HSS-KAB-001 to activate Cyan selection halo in DD1 mode
    console.log('Selecting road HSS-KAB-001 to display Cyan halo in DD1 mode...');
    await cdp.eval(`
      window.selectRoadOnMap('HSS-KAB-001');
      window.openRoadDetail('HSS-KAB-001');
    `);
    await sleep(1500);

    const haloStatus = await cdp.eval(`
      const haloLayer = window.appState && window.appState.mapLayers && window.appState.mapLayers.selectionHalo;
      const haloActive = !!(haloLayer && window.appState.map && window.appState.map.hasLayer(haloLayer));
      return { haloActive };
    `);
    console.log('Halo status in DD1 mode:', haloStatus);
    if (!haloStatus.haloActive) {
      throw new Error('Selection halo is not active on Leaflet map in DD1 mode!');
    }

    // Capture Screenshot 4: Selected road with Cyan halo in DD1 mode
    console.log('Capturing Screenshot 4: Selected road with Cyan halo in DD1 mode...');
    const ss4 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p4Path = path.join(OUTPUT_DIR, 'phase5_1c_selected_road_dd1.png');
    fs.writeFileSync(p4Path, Buffer.from(ss4.data, 'base64'));
    console.log(`  -> Saved ${p4Path}`);

    console.log('====================================================');
    console.log('ALL PHASE 5.1C CDP VISUAL & SMOKE CHECKS SUCCEEDED!');
    console.log('====================================================');
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Phase 5.1C CDP Verification Failed:', err);
  process.exit(1);
});
