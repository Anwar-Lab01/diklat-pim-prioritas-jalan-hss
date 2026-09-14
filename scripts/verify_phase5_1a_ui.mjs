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
      expression: `(() => { ${expression} })()`,
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
  console.log('--- STARTING CDP LOCAL VERIFICATION FOR PHASE 5.1A ---');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const port = 9222;
  const userDataDir = path.resolve('temp_chrome_p51a');

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
    for (let i = 0; i < 20; i++) {
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
    await sleep(2500);

    // Set viewport
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Select HSS-KAB-001
    console.log('Opening road detail for HSS-KAB-001...');
    await cdp.eval(`
      window.openRoadDetail('HSS-KAB-001');
      window.selectRoadOnMap('HSS-KAB-001');
    `);
    await sleep(1500);

    // Check Demographics UI State
    const demoUi = await cdp.eval(`
      const badge = document.getElementById('d-households-summary-badge')?.textContent.trim();
      const total = document.getElementById('d-households-total')?.textContent.trim();
      const male = document.getElementById('d-households-male')?.textContent.trim();
      const female = document.getElementById('d-households-female')?.textContent.trim();
      const listCount = document.querySelectorAll('#d-households-villages-list > div').length;
      return { badge, total, male, female, listCount };
    `);
    console.log('Demographics UI State:', demoUi);

    // Check Segments UI State
    const segUiBefore = await cdp.eval(`
      const badge = document.getElementById('d-segments-summary-badge')?.textContent.trim();
      const totalLen = document.getElementById('d-segments-total-len')?.textContent.trim();
      const segCount = document.querySelectorAll('#d-segments-list > div').length;
      const baikStat = document.getElementById('d-seg-stat-baik')?.textContent.trim();
      const sedangStat = document.getElementById('d-seg-stat-sedang')?.textContent.trim();
      return { badge, totalLen, segCount, baikStat, sedangStat };
    `);
    console.log('Segments UI State (before toggle):', segUiBefore);

    // Click Toggle Segments on Map
    console.log('Toggling DD1 segments on Leaflet map...');
    await cdp.eval(`
      const btn = document.getElementById('btn-toggle-dd1-segments');
      if (btn) btn.click();
    `);
    await sleep(1000);

    const mapSegmentsCount = await cdp.eval(`
      if (window.appState && window.appState.mapLayers && window.appState.mapLayers.dd1Segments) {
        return window.appState.mapLayers.dd1Segments.getLayers().length;
      }
      return 0;
    `);
    console.log(`Rendered DD1 segments on Leaflet map: ${mapSegmentsCount} polylines`);

    // Scroll drawer body to Section F and G
    await cdp.eval(`
      const drawerBody = document.querySelector('#road-detail-drawer .overflow-y-auto');
      const secF = document.getElementById('d-households-total');
      if (secF) {
        secF.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    `);
    await sleep(600);

    // Capture screenshot
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshot.data, 'base64');
    const outPath = path.join(OUTPUT_DIR, 'phase5_1a_webgis_segments.png');
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot to: ${outPath} (${buffer.length} bytes)`);

    // Verify assertions
    if (!demoUi.total.includes('4.566') && !demoUi.total.includes('4566')) {
      throw new Error(`Unexpected households total: ${demoUi.total}`);
    }
    if (demoUi.listCount !== 2) {
      throw new Error(`Expected 2 villages in demographic breakdown, got ${demoUi.listCount}`);
    }
    if (mapSegmentsCount !== 6) {
      throw new Error(`Expected 6 segment polylines rendered on map, got ${mapSegmentsCount}`);
    }

    console.log('--- ALL CDP LOCAL CHECKS PASSED! ---');
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('CDP Verification Failed:', err);
  process.exit(1);
});
