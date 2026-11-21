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

  async captureScreenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Saved screenshot: ${filePath}`);
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  console.log('================================================================');
  console.log('STARTING CDP VISUAL VERIFICATION FOR TASK 1 & TASK 2');
  console.log('================================================================');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9223;
  const userDataDir = path.resolve('temp_chrome_detail_overlay');

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
    for (let i = 0; i < 30; i++) {
      try {
        version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
        break;
      } catch {
        await sleep(300);
      }
    }
    if (!version) throw new Error('Failed to connect to Chrome debug port');

    const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error('No page target available');

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    console.log('Connected to Chrome CDP. Waiting for map and application to load...');
    
    // Wait until appState and countyRoads layer are ready
    let layersReady = false;
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.eval(`
        return !!(window.appState && window.appState.map && window.appState.mapLayers?.countyRoads && window.appState.mapLayers.countyRoads.getLayers().length > 0);
      `);
      if (ready) {
        layersReady = true;
        break;
      }
      await sleep(500);
    }
    console.log(`[PASS] Map and county road layers initialized: ${layersReady}`);

    const shot1 = path.join(OUTPUT_DIR, '01_map_normal_prioritas.png');
    await cdp.captureScreenshot(shot1);

    // 2. Emulate Road Click & Show Quick Popup on HSS-KAB-025 (Rank #1)
    console.log('\n--- TESTING ROAD CLICK POPUP (HSS-KAB-025) ---');
    const popupShown = await cdp.eval(`
      const roadsLayer = window.appState.mapLayers.countyRoads;
      const targetLayer = roadsLayer.getLayers().find(l => l.feature?.properties?.road_key === 'HSS-KAB-025');
      if (!targetLayer) return { success: false, error: 'Layer HSS-KAB-025 not found' };
      const bounds = targetLayer.getBounds();
      const center = bounds.getCenter();
      window.showRoadQuickPopup('HSS-KAB-025', center);
      return { success: true, center };
    `);
    console.log('Popup triggered:', popupShown);
    await sleep(1000);

    const shot2 = path.join(OUTPUT_DIR, '02_road_quick_popup_HSS-KAB-025.png');
    await cdp.captureScreenshot(shot2);

    // 3. Enter Interactive Spatial Profile Overlay
    console.log('\n--- TESTING INTERACTIVE SPATIAL ROAD PROFILE (HSS-KAB-025) ---');
    const profileEntered = await cdp.eval(`
      window.enterInteractiveSpatialProfile('HSS-KAB-025');
      return { success: true };
    `);
    console.log('Interactive profile entered. Waiting for animations and cards...');
    await sleep(2500);

    // Verify Cards and Content
    const overlayAudit = await cdp.eval(`
      const overlay = document.getElementById('interactive-detail-overlay');
      const isVisible = overlay && !overlay.classList.contains('hidden');
      const hud = document.getElementById('detail-hud-bar');
      const hudRoadName = document.getElementById('hud-road-name')?.textContent;
      const hudRoadScore = document.getElementById('hud-road-score')?.textContent;
      
      const cards = {
        identitas: !!document.getElementById('card-identitas'),
        kondisi: !!document.getElementById('card-kondisi'),
        teknis: !!document.getElementById('card-teknis'),
        spasial: !!document.getElementById('card-spasial'),
        prioritas: !!document.getElementById('card-prioritas')
      };

      const spatialDist = document.getElementById('card-s-jarak-ibukota')?.textContent;
      const spatialVillages = document.getElementById('card-s-desa')?.textContent;
      const spatialDistricts = document.getElementById('card-s-kecamatan')?.textContent;
      const rtrwPermukiman = document.getElementById('card-s-permukiman')?.textContent;
      const rtrwProduksi = document.getElementById('card-s-produksi')?.textContent;
      const rtrwLindung = document.getElementById('card-s-lindung')?.textContent;
      const rtrwBadanAir = document.getElementById('card-s-badan-air')?.textContent;

      const priorityRank = document.getElementById('card-p-rank')?.textContent;
      const priorityScore = document.getElementById('card-p-score')?.textContent;

      const hudScore = document.getElementById('hud-score')?.textContent;

      const svgLines = document.querySelectorAll('.leader-line');
      const svgDots = document.querySelectorAll('.leader-anchor-dot');

      return {
        isVisible,
        hudRoadName,
        hudScore,
        priorityRank,
        priorityScore,
        cards,
        spatialDist,
        spatialVillages,
        spatialDistricts,
        rtrwPermukiman,
        rtrwProduksi,
        rtrwLindung,
        rtrwBadanAir,
        lineCount: svgLines.length,
        dotCount: svgDots.length
      };
    `);

    console.log('Overlay State Audit:');
    console.log('  - Is Visible:', overlayAudit.isVisible);
    console.log('  - HUD Road Name:', overlayAudit.hudRoadName);
    console.log('  - HUD Score:', overlayAudit.hudScore);
    console.log('  - Priority Rank:', overlayAudit.priorityRank);
    console.log('  - Priority Score:', overlayAudit.priorityScore);
    console.log('  - Cards Rendered:', overlayAudit.cards);
    console.log('  - Spatial: Jarak ke Ibukota:', overlayAudit.spatialDist);
    console.log('  - Spatial: Cakupan Desa:', overlayAudit.spatialVillages);
    console.log('  - Spatial: Cakupan Kecamatan:', overlayAudit.spatialDistricts);
    console.log('  - Spatial: RTRW Permukiman:', overlayAudit.rtrwPermukiman);
    console.log('  - Spatial: RTRW Produksi:', overlayAudit.rtrwProduksi);
    console.log('  - Spatial: RTRW Lindung:', overlayAudit.rtrwLindung);
    console.log('  - Spatial: RTRW Badan Air:', overlayAudit.rtrwBadanAir);
    console.log('  - SVG Leader Lines Count:', overlayAudit.lineCount);
    console.log('  - SVG Anchor Dots Count:', overlayAudit.dotCount);

    const shot3 = path.join(OUTPUT_DIR, '03_interactive_spatial_profile_HSS-KAB-025.png');
    await cdp.captureScreenshot(shot3);

    // 4. Switch to Another Road (HSS-KAB-001 - Rank #12)
    console.log('\n--- TESTING ROAD SWITCHING (HSS-KAB-001) ---');
    await cdp.eval(`
      window.enterInteractiveSpatialProfile('HSS-KAB-001');
    `);
    await sleep(2500);

    const switchAudit = await cdp.eval(`
      return {
        hudRoadName: document.getElementById('hud-road-name')?.textContent,
        hudScore: document.getElementById('hud-score')?.textContent,
        spatialDist: document.getElementById('card-s-jarak-ibukota')?.textContent,
        spatialVillages: document.getElementById('card-s-desa')?.textContent,
        rtrwPermukiman: document.getElementById('card-s-permukiman')?.textContent,
        rtrwProduksi: document.getElementById('card-s-produksi')?.textContent,
        lineCount: document.querySelectorAll('.leader-line').length
      };
    `);
    console.log('Switch Audit for HSS-KAB-001:', switchAudit);

    const shot4 = path.join(OUTPUT_DIR, '04_interactive_spatial_profile_HSS-KAB-001.png');
    await cdp.captureScreenshot(shot4);

    // 5. Exit Interactive Spatial Profile
    console.log('\n--- TESTING EXIT INTERACTIVE PROFILE ---');
    await cdp.eval(`
      window.exitInteractiveSpatialProfile();
    `);
    await sleep(1500);

    const exitAudit = await cdp.eval(`
      const overlay = document.getElementById('interactive-detail-overlay');
      const isHidden = overlay && overlay.classList.contains('hidden');
      const lineCount = document.querySelectorAll('.leader-line').length;
      const highlight = !!window.interactiveHighlight;
      return { isHidden, lineCount, hasHighlight: highlight };
    `);
    console.log('Exit Audit:', exitAudit);

    const shot5 = path.join(OUTPUT_DIR, '05_map_restored_after_exit.png');
    await cdp.captureScreenshot(shot5);

    // 6. Responsive Mobile/Tablet Test (1024x768)
    console.log('\n--- TESTING RESPONSIVE VIEW (1024x768) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);
    await cdp.eval(`
      window.enterInteractiveSpatialProfile('HSS-KAB-025');
    `);
    await sleep(2500);

    const shot6 = path.join(OUTPUT_DIR, '06_interactive_spatial_profile_tablet_1024x768.png');
    await cdp.captureScreenshot(shot6);

    console.log('\n================================================================');
    console.log('CDP VISUAL VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
  } catch (err) {
    console.error('Error during CDP verification:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    // clean temp dir
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
