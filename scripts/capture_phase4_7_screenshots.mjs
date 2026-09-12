/**
 * Automated Screenshot Capture for Phase 4.7 Visual QA
 * Uses Headless Chrome with Chrome DevTools Protocol (CDP)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('reports', 'screenshots');
const APP_URL = 'http://localhost:3000/#peta';
const PORT = 9223;

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

  console.log('Launching headless Chrome for Phase 4.7 Visual QA...');
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
    let endpoints = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        endpoints = await fetchJson(`http://127.0.0.1:${PORT}/json`);
        if (endpoints && endpoints.length > 0) break;
      } catch {}
    }

    if (!endpoints || endpoints.length === 0) {
      throw new Error('Failed to connect to Chrome remote debugging port');
    }

    const pageTarget = endpoints.find((e) => e.type === 'page') || endpoints[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('Waiting for map and data initialization...');
    await sleep(4000);

    // -------------------------------------------------------------------------
    // SCENARIO 1: Open Layer Controls Panel displaying Group 7 Interaksi Peta
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 1: Controls Panel with Interaksi Peta ---');
    await cdp.eval(`
      const panel = document.getElementById('map-layers-panel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.scrollTop = panel.scrollHeight; // Scroll down to show Group 7
      }
    `);
    await sleep(600);
    await cdp.captureScreenshot('10_popup_controls_panel.png');

    // -------------------------------------------------------------------------
    // SCENARIO 2: Village Click Popup with Authoritative Information
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 2: Village Click Popup with Authoritative Identity ---');
    await cdp.eval(`
      // Close panel
      document.getElementById('map-layers-panel')?.classList.add('hidden');

      // Enable village boundary layer
      const vilCheckbox = document.getElementById('layer-admin-villages');
      if (vilCheckbox && !vilCheckbox.checked) {
        vilCheckbox.checked = true;
        vilCheckbox.dispatchEvent(new Event('change'));
      }

      // Find Amawang Kanan or first village feature and trigger click
      const villagesLayer = window.appState.mapLayers.villages;
      if (villagesLayer) {
        let targetLayer = null;
        villagesLayer.eachLayer((l) => {
          if (!targetLayer && l.feature?.properties?.village_name === 'Amawang Kanan') {
            targetLayer = l;
          }
        });
        if (!targetLayer) {
          villagesLayer.eachLayer((l) => {
            if (!targetLayer) targetLayer = l;
          });
        }
        if (targetLayer) {
          const bounds = targetLayer.getBounds();
          const center = bounds.getCenter();
          window.appState.map.setView(center, 13);
          setTimeout(() => {
            targetLayer.fire('click', { latlng: center });
          }, 300);
        }
      }
    `);
    await sleep(1500);
    await cdp.captureScreenshot('11_village_popup_authoritative_info.png');

    // -------------------------------------------------------------------------
    // SCENARIO 3: Presentation Mode (Popup OFF + Tooltip OFF = Zero Floating Boxes)
    // Road selected with cyan halo + explainability drawer open
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 3: Presentation Mode (Clean Map, Zero Floating Info) ---');
    await cdp.eval(`
      // Turn off popup master and tooltip master
      const popupMaster = document.getElementById('popup-master');
      const tooltipMaster = document.getElementById('tooltip-master');

      if (popupMaster) {
        popupMaster.checked = false;
        popupMaster.dispatchEvent(new Event('change'));
      }
      if (tooltipMaster) {
        tooltipMaster.checked = false;
        tooltipMaster.dispatchEvent(new Event('change'));
      }

      // Close any open popup
      window.appState.map.closePopup();

      // Select road HSS-KAB-025 (Rank #1) and open detail drawer
      window.selectRoadOnMap('HSS-KAB-025');
      window.openRoadDetail('HSS-KAB-025');
    `);
    await sleep(1500);
    await cdp.captureScreenshot('12_presentation_mode_clean.png');

    // -------------------------------------------------------------------------
    // SCENARIO 4: Master Popup OFF Suppresses Popups, Subordinates Disabled, Road Selection Active
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 4: Popup Master Suppressed with Subordinates Disabled ---');
    await cdp.eval(`
      // Open layer panel to show disabled subordinate checkboxes
      const panel = document.getElementById('map-layers-panel');
      if (panel) {
        panel.classList.remove('hidden');
        panel.scrollTop = panel.scrollHeight;
      }
    `);
    await sleep(600);
    await cdp.captureScreenshot('13_popup_suppression_and_subordinates_disabled.png');

    console.log('\nAll Phase 4.7 QA screenshots captured successfully!');
  } finally {
    if (cdp) cdp.close();
    chromeProcess.kill('SIGKILL');
  }
}

run().catch((err) => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
