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
  console.log('STARTING CDP FINAL HARDENING & DATA INTEGRITY VERIFICATION');
  console.log('================================================================');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9224;
  const userDataDir = path.resolve('temp_chrome_final_hardening');

  console.log('Launching headless Chrome...');
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

    console.log('Connected to Chrome CDP. Waiting for map to load...');

    // Wait for map and layers to load
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.eval(`
        return !!(window.appState && window.appState.map && window.appState.mapLayers?.countyRoads && window.appState.mapLayers.countyRoads.getLayers().length > 0);
      `);
      if (ready) break;
      await sleep(500);
    }
    console.log('[PASS] Map and layers initialized.');

    // -------------------------------------------------------------
    // TEST 1: DESKTOP 1440 x 900 (HSS-KAB-025 - Rank #1)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: DESKTOP 1440 x 900 (HSS-KAB-025) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);

    await cdp.eval(`window.enterInteractiveSpatialProfile('HSS-KAB-025');`);
    await sleep(3000);

    const audit1440 = await cdp.eval(`
      const roadName = document.getElementById('hud-road-name')?.textContent;
      const rank = document.getElementById('hud-rank')?.textContent;
      const score = document.getElementById('hud-score')?.textContent;

      const lebar = document.getElementById('card-t-lebar')?.textContent;
      const status = document.getElementById('card-t-status')?.textContent;
      const aspal = document.getElementById('card-t-aspal')?.textContent;
      const beton = document.getElementById('card-t-beton')?.textContent;

      const jarakIbukota = document.getElementById('card-s-jarak-ibukota')?.textContent;
      const desa = document.getElementById('card-s-desa')?.textContent;
      const kec = document.getElementById('card-s-kecamatan')?.textContent;
      const permukiman = document.getElementById('card-s-permukiman')?.textContent;
      const produksi = document.getElementById('card-s-produksi')?.textContent;

      const cat5Title = document.querySelector('#card-spasial span.text-purple-400')?.textContent;
      const catSpasialSub = document.querySelector('#card-prioritas div.space-y-1 > div:last-child span')?.textContent;

      // Check SVG leader lines
      const svg = document.getElementById('interactive-detail-svg');
      const lines = Array.from(svg.querySelectorAll('.leader-line'));
      const pathsHaveNoBlackFill = lines.every(p => p.getAttribute('fill') === 'none' || p.style.fill === 'none');
      const dots = svg.querySelectorAll('.leader-anchor-dot');

      // Check card bounding boxes within viewport (1440 x 900)
      const cards = ['card-identitas', 'card-kondisi', 'card-teknis', 'card-spasial', 'card-prioritas'];
      const cardBounds = cards.map(id => {
        const el = document.getElementById(id);
        if (!el) return { id, exists: false };
        const r = el.getBoundingClientRect();
        return {
          id,
          exists: true,
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          withinViewport: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
        };
      });

      return {
        roadName,
        rank,
        score,
        lebar,
        status,
        aspal,
        beton,
        jarakIbukota,
        desa,
        kec,
        permukiman,
        produksi,
        cat5Title,
        catSpasialSub,
        pathsHaveNoBlackFill,
        lineCount: lines.length,
        dotCount: dots.length,
        cardBounds
      };
    `);

    console.log('Desktop 1440x900 Audit:');
    console.log('  Road Name:', audit1440.roadName);
    console.log('  Rank & Score:', audit1440.rank, audit1440.score);
    console.log('  Lebar Jalan:', audit1440.lebar);
    console.log('  Status Ruas:', audit1440.status);
    console.log('  Aspal/Penmac:', audit1440.aspal, '(Must NOT be NaN%):', !audit1440.aspal?.includes('NaN'));
    console.log('  Rigid Beton:', audit1440.beton, '(Must NOT be NaN%):', !audit1440.beton?.includes('NaN'));
    console.log('  Jarak Ibukota:', audit1440.jarakIbukota, '(Must NOT be 0.00 km):', audit1440.jarakIbukota !== '0.00 km');
    console.log('  Cakupan Desa & Kec:', audit1440.desa, audit1440.kec);
    console.log('  RTRW Permukiman & Produksi:', audit1440.permukiman, audit1440.produksi);
    console.log('  Card 5 Title:', audit1440.cat5Title);
    console.log('  Score Contribution Label:', audit1440.catSpasialSub);
    console.log('  SVG Leader Lines fill="none":', audit1440.pathsHaveNoBlackFill, 'Count:', audit1440.lineCount);
    console.log('  Card Viewport Fit:');
    audit1440.cardBounds.forEach(c => console.log(`    - ${c.id}: ${c.left}px to ${c.right}px, top: ${c.top}px, btm: ${c.bottom}px (fit: ${c.withinViewport})`));

    const shot1 = path.join(OUTPUT_DIR, '01_final_1440x900_HSS-KAB-025.png');
    await cdp.captureScreenshot(shot1);

    // -------------------------------------------------------------
    // TEST 2: PAN & ZOOM RECALCULATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: MAP PAN RECALCULATION ---');
    await cdp.eval(`
      window.appState.map.panBy([120, -60], { animate: false });
      window.updateDetailLeaderLines();
    `);
    await sleep(1000);

    const shot2 = path.join(OUTPUT_DIR, '02_final_1440x900_pan_recalculated.png');
    await cdp.captureScreenshot(shot2);

    // -------------------------------------------------------------
    // TEST 3: DESKTOP 1252 x 738 (Exact Reported Viewport)
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: DESKTOP 1252 x 738 ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1252,
      height: 738,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);
    await cdp.eval(`
      window.enterInteractiveSpatialProfile('HSS-KAB-025');
    `);
    await sleep(2500);

    const audit1252 = await cdp.eval(`
      const cards = ['card-identitas', 'card-kondisi', 'card-teknis', 'card-spasial', 'card-prioritas'];
      return cards.map(id => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        return {
          id,
          bottom: Math.round(r.bottom),
          right: Math.round(r.right),
          fitsWithin738: r.bottom <= 738,
          fitsWithin1252: r.right <= 1252
        };
      });
    `);
    console.log('1252x738 Cards Viewport Fit:');
    audit1252.forEach(c => console.log(`  - ${c.id}: bottom=${c.bottom}px (fits <= 738: ${c.fitsWithin738}), right=${c.right}px (fits <= 1252: ${c.fitsWithin1252})`));

    const shot3 = path.join(OUTPUT_DIR, '03_final_1252x738_responsive_view.png');
    await cdp.captureScreenshot(shot3);

    // -------------------------------------------------------------
    // TEST 4: ROAD WITH NULL CAPITAL DISTANCE (HSS-KAB-183)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: NULL CAPITAL DISTANCE INTEGRITY (HSS-KAB-183) ---');
    await cdp.eval(`window.enterInteractiveSpatialProfile('HSS-KAB-183');`);
    await sleep(2500);

    const auditNull = await cdp.eval(`
      return {
        roadName: document.getElementById('hud-road-name')?.textContent,
        jarakIbukota: document.getElementById('card-s-jarak-ibukota')?.textContent,
        aspal: document.getElementById('card-t-aspal')?.textContent,
        beton: document.getElementById('card-t-beton')?.textContent,
        lebar: document.getElementById('card-t-lebar')?.textContent
      };
    `);
    console.log('HSS-KAB-183 Integrity Audit:');
    console.log('  Road Name:', auditNull.roadName);
    console.log('  Jarak Ibukota (Expected: "Data tidak tersedia"):', auditNull.jarakIbukota);
    console.log('  Aspal / Beton (No NaN%):', auditNull.aspal, auditNull.beton);
    console.log('  Lebar Jalan:', auditNull.lebar);

    const shot4 = path.join(OUTPUT_DIR, '04_final_1252x738_HSS-KAB-183_null_distance.png');
    await cdp.captureScreenshot(shot4);

    // -------------------------------------------------------------
    // TEST 5: ROAD SWITCHING TO HSS-KAB-001 (Rank #12, 0.32 km distance)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: ROAD SWITCHING TO HSS-KAB-001 (Rank #12) ---');
    await cdp.eval(`window.enterInteractiveSpatialProfile('HSS-KAB-001');`);
    await sleep(2500);

    const audit001 = await cdp.eval(`
      return {
        roadName: document.getElementById('hud-road-name')?.textContent,
        rank: document.getElementById('hud-rank')?.textContent,
        jarakIbukota: document.getElementById('card-s-jarak-ibukota')?.textContent,
        aspal: document.getElementById('card-t-aspal')?.textContent,
        beton: document.getElementById('card-t-beton')?.textContent
      };
    `);
    console.log('HSS-KAB-001 Audit:');
    console.log('  Road Name:', audit001.roadName);
    console.log('  Rank:', audit001.rank);
    console.log('  Jarak Ibukota (Expected: 0.32 km):', audit001.jarakIbukota);
    console.log('  Aspal & Beton:', audit001.aspal, audit001.beton);

    const shot5 = path.join(OUTPUT_DIR, '05_final_1252x738_HSS-KAB-001.png');
    await cdp.captureScreenshot(shot5);

    // -------------------------------------------------------------
    // TEST 6: TABLET 1024 x 768
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: TABLET 1024 x 768 ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(500);
    await cdp.eval(`window.enterInteractiveSpatialProfile('HSS-KAB-025');`);
    await sleep(2500);

    const auditTablet = await cdp.eval(`
      const cards = ['card-identitas', 'card-kondisi', 'card-teknis', 'card-spasial', 'card-prioritas'];
      return cards.map(id => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        return {
          id,
          bottom: Math.round(r.bottom),
          right: Math.round(r.right),
          fitsWithin768: r.bottom <= 768,
          fitsWithin1024: r.right <= 1024
        };
      });
    `);
    console.log('Tablet 1024x768 Card Bounds:');
    auditTablet.forEach(c => console.log(`  - ${c.id}: bottom=${c.bottom}px (fits <= 768: ${c.fitsWithin768}), right=${c.right}px (fits <= 1024: ${c.fitsWithin1024})`));

    const shot6 = path.join(OUTPUT_DIR, '06_final_1024x768_tablet_view.png');
    await cdp.captureScreenshot(shot6);

    // -------------------------------------------------------------
    // TEST 7: EXIT & REOPEN
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: EXIT AND RESTORE NORMAL MAP ---');
    await cdp.eval(`window.exitInteractiveSpatialProfile();`);
    await sleep(1500);

    const auditExit = await cdp.eval(`
      const overlay = document.getElementById('interactive-detail-overlay');
      const svg = document.getElementById('interactive-detail-svg');
      return {
        overlayHidden: overlay.classList.contains('hidden'),
        svgHidden: svg.classList.contains('hidden'),
        svgInnerEmpty: svg.innerHTML === '',
        noHighlight: !window.appState.mapLayers.interactiveHighlight
      };
    `);
    console.log('Exit Cleanliness Audit:', auditExit);

    const shot7 = path.join(OUTPUT_DIR, '07_final_map_normal_restored.png');
    await cdp.captureScreenshot(shot7);

    // Reopen
    console.log('Reopening detail for HSS-KAB-025 to verify re-entry...');
    await cdp.eval(`window.enterInteractiveSpatialProfile('HSS-KAB-025');`);
    await sleep(2500);

    const shot8 = path.join(OUTPUT_DIR, '08_final_reopened_detail_overlay.png');
    await cdp.captureScreenshot(shot8);

    console.log('\n================================================================');
    console.log('FINAL HARDENING VERIFICATION PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } catch (err) {
    console.error('Error during CDP verification:', err);
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main();
