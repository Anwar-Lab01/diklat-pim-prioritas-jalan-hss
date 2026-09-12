/**
 * Automated Screenshot Capture for Phase 4.6 Visual QA
 * Uses Headless Chrome with Chrome DevTools Protocol (CDP)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('reports', 'screenshots');
const APP_URL = 'http://localhost:3000/#peta';
const PORT = 9222;

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
    const wrapped = `(() => { ${expression} })()`;
    const res = await this.send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      quality: 95,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`  [SAVED] ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Launching headless Chrome...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1920,1080',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    APP_URL,
  ]);

  let cdp = null;

  try {
    let tabs = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        tabs = await fetchJson(`http://localhost:${PORT}/json/list`);
        if (tabs && tabs.length > 0) break;
      } catch (e) {}
    }

    if (!tabs || tabs.length === 0) {
      throw new Error('Failed to connect to Chrome DevTools Protocol');
    }

    const targetTab = tabs.find((t) => t.type === 'page') || tabs[0];
    console.log(`Connected to page: ${targetTab.title || targetTab.url}`);

    cdp = new CDPClient(targetTab.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Wait for map initialization in client
    console.log('Waiting for map to initialize in client...');
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const isReady = await cdp.eval('return Boolean(window.appState && window.appState.mapInitialized && document.querySelector(".leaflet-pane"))');
      if (isReady) break;
    }

    // Ensure map tab is active and centered
    await cdp.eval(`
      document.getElementById('nav-peta')?.click();
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(2000);

    console.log('Beginning 9-scenario screenshot capture sequence...\n');

    // SCENARIO 1: Neutral basemap + Kabupaten/Kecamatan
    console.log('1. Capturing 01_neutral_basemap_admin.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-neutral')?.click();
      const kabEl = document.getElementById('layer-admin-kabupaten');
      const distEl = document.getElementById('layer-admin-districts');
      const vilEl = document.getElementById('layer-admin-villages');
      const roadEl = document.getElementById('layer-roads-county');
      const rtrwEl = document.getElementById('layer-rtrw');
      if (kabEl && !kabEl.checked) { kabEl.checked = true; kabEl.dispatchEvent(new Event('change')); }
      if (distEl && !distEl.checked) { distEl.checked = true; distEl.dispatchEvent(new Event('change')); }
      if (vilEl && vilEl.checked) { vilEl.checked = false; vilEl.dispatchEvent(new Event('change')); }
      if (roadEl && roadEl.checked) { roadEl.checked = false; roadEl.dispatchEvent(new Event('change')); }
      if (rtrwEl && rtrwEl.checked) { rtrwEl.checked = false; rtrwEl.dispatchEvent(new Event('change')); }
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(1500);
    await cdp.captureScreenshot('01_neutral_basemap_admin.png');

    // SCENARIO 2: OSM + Kabupaten/Kecamatan
    console.log('2. Capturing 02_osm_basemap_admin.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-osm')?.click();
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(2500);
    await cdp.captureScreenshot('02_osm_basemap_admin.png');

    // SCENARIO 3: Satellite + Kabupaten/Kecamatan
    console.log('3. Capturing 03_satellite_basemap_admin.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-satellite')?.click();
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(3500);
    await cdp.captureScreenshot('03_satellite_basemap_admin.png');

    // SCENARIO 4: RTRW on neutral basemap
    console.log('4. Capturing 04_rtrw_neutral_basemap.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-neutral')?.click();
      const rtrwEl = document.getElementById('layer-rtrw');
      if (rtrwEl && !rtrwEl.checked) {
        rtrwEl.checked = true;
        rtrwEl.dispatchEvent(new Event('change'));
      }
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    // Wait for RTRW layer to fetch and render
    console.log('  Waiting for RTRW layer polygons...');
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const rtrwLoaded = await cdp.eval('return Boolean(window.appState && window.appState.mapLayers.rtrw)');
      if (rtrwLoaded) break;
    }
    await sleep(2000);
    await cdp.captureScreenshot('04_rtrw_neutral_basemap.png');

    // SCENARIO 5: RTRW on satellite imagery
    console.log('5. Capturing 05_rtrw_satellite_imagery.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-satellite')?.click();
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(3500);
    await cdp.captureScreenshot('05_rtrw_satellite_imagery.png');

    // SCENARIO 6: Priority roads + RTRW
    console.log('6. Capturing 06_priority_roads_rtrw.png...');
    await cdp.eval(`
      const roadEl = document.getElementById('layer-roads-county');
      if (roadEl && !roadEl.checked) {
        roadEl.checked = true;
        roadEl.dispatchEvent(new Event('change'));
      }
      document.getElementById('map-btn-fit-hss')?.click();
    `);
    await sleep(2500);
    await cdp.captureScreenshot('06_priority_roads_rtrw.png');

    // SCENARIO 7: Full RTRW categorical legend
    console.log('7. Capturing 07_full_rtrw_categorical_legend.png...');
    await cdp.eval(`
      const legendBody = document.getElementById('map-legend-body');
      if (legendBody) {
        legendBody.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    `);
    await sleep(1500);
    await cdp.captureScreenshot('07_full_rtrw_categorical_legend.png');

    // SCENARIO 8: Kabupaten vs Kecamatan line hierarchy at close zoom
    console.log('8. Capturing 08_kabupaten_vs_kecamatan_close_zoom.png...');
    await cdp.eval(`
      document.getElementById('layer-basemap-osm')?.click();
      const rtrwEl = document.getElementById('layer-rtrw');
      if (rtrwEl && rtrwEl.checked) {
        rtrwEl.checked = false;
        rtrwEl.dispatchEvent(new Event('change'));
      }
      // Focus on eastern boundary between Padang Batung and Telaga Langsat / Loksado
      window.appState.map.setView([-2.745, 115.35], 13);
    `);
    await sleep(2500);
    await cdp.captureScreenshot('08_kabupaten_vs_kecamatan_close_zoom.png');

    // SCENARIO 9: Desa boundary enabled at close zoom
    console.log('9. Capturing 09_desa_boundary_close_zoom.png...');
    await cdp.eval(`
      const vilEl = document.getElementById('layer-admin-villages');
      if (vilEl && !vilEl.checked) {
        vilEl.checked = true;
        vilEl.dispatchEvent(new Event('change'));
      }
      // Focus around Kandangan center
      window.appState.map.setView([-2.70, 115.28], 14);
    `);
    await sleep(2500);
    await cdp.captureScreenshot('09_desa_boundary_close_zoom.png');

    console.log('\nAll 9 visual review screenshots captured successfully in reports/screenshots/!');
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error('Screenshot capture script error:', err);
  process.exit(1);
});
