import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORTS_DIR = path.resolve('reports', 'screenshots');
const APP_URL = process.env.APP_URL || 'http://localhost:4318/#peta';

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
    
    fs.writeFileSync(path.join(REPORTS_DIR, fileName), buffer);
    console.log(`[CDP] Saved screenshot: ${fileName}`);
  }

  close() {
    this.ws.close();
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hss-inspector-chrome-'));
const chrome = spawn(process.env.CHROME_PATH || CHROME_PATH, [
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--headless=new',
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
], { stdio: 'ignore', windowsHide: true });
let cdp;
try {
  const wait = async (predicate, label, attempts = 120) => {
    for (let i = 0; i < attempts; i++) {
      const value = await predicate();
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const portFile = path.join(profile, 'DevToolsActivePort');
  await wait(() => fs.existsSync(portFile), 'Chrome debugging port');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  cdp = new CDPClient(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const exceptions = [];
  cdp.ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') console.error(msg.params.args.map(arg => arg.description || arg.value).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.exception?.description);
  });
  const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  const read = code => cdp.eval(`return (${code})`);
  const until = (code, label) => wait(() => read(code), label);
  const click = async selector => {
    const rect = await cdp.eval(`
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) throw new Error('Missing control: ' + ${JSON.stringify(selector)});
      target.scrollIntoView({block:'nearest'});
      if (target.getBoundingClientRect().top < (document.querySelector('body > header')?.offsetHeight ?? 0) && !target.closest('body > header, [role=dialog]')) {
        target.scrollIntoView({block:'center'});
      }
      const r = target.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    `);
    const hit = await read(`document.elementFromPoint(${rect.x},${rect.y})?.closest(${JSON.stringify(selector)}) != null`);
    assert.ok(hit, `Control obstructed: ${selector} at ${JSON.stringify(rect)}`);
    await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', ...rect, button:'left', clickCount:1 });
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', ...rect, button:'left', clickCount:1 });
  };
  const selectRoad = async key => {
    await click('#map-search-input');
    await cdp.send('Input.insertText', { text:key });
    await until('Boolean(document.querySelector("#map-search-autocomplete [onclick]"))', 'search suggestion');
    await click('#map-search-autocomplete [onclick]');
    await until(`appState.interactiveDetailRoadKey === "${key}" && !appState.nearestFacilitiesLoading`, key);
    await cdp.eval(`const input = document.getElementById('map-search-input'); input.value=''; input.dispatchEvent(new Event('input', {bubbles:true}));`);
  };
  const capture = async filename => {
    await cdp.eval("document.getElementById('map-container').scrollIntoView({block:'start'});");
    await sleep(600);
    await cdp.captureScreenshot(filename);
  };
  await viewport(1440, 900);
  await cdp.send('Page.navigate', { url:APP_URL });
  await until('window.appState?.mapData.countyRoads?.features.length === 350', '350 roads');
  await selectRoad('HSS-KAB-025');
  assert.match(await read('document.querySelector("#card-c-baik").textContent'), /km/);
  assert.equal(await read('document.querySelector("#card-kondisi").open'), true);
  await capture('road-inspector-desktop.png');

  for (const type of ['hospital', 'puskesmas', 'school', 'market']) {
    await click(`#btn-card-trace-${type}`);
    assert.equal(await read(`appState.activeTracedFacilityType === "${type}" && appState.mapLayers.routeTrace.getLayers().length >= 3`), true);
    assert.match(await read('document.querySelector("#route-hud-network-dist").textContent'), /km/);
  }
  await capture('road-inspector-network-route.png');
  await click('#btn-close-route-hud');
  assert.equal(await read('!appState.mapLayers.routeTrace && appState.selectedRoadKey === "HSS-KAB-025"'), true);

  await click('#card-spasial > summary');
  await click('#card-spasial details > summary');
  await until('document.querySelector("#card-s-rtrw-breakdown").textContent.trim().length > 0', 'RTRW intersection');
  await click('#inspector-rtrw-layer');
  await until('appState.mapLayers.rtrw && appState.map.hasLayer(appState.mapLayers.rtrw)', 'RTRW map overlay');
  assert.equal(await read('document.querySelector("#inspector-rtrw-layer").getAttribute("aria-pressed")'), 'true');
  await capture('road-inspector-rtrw.png');
  await click('#inspector-rtrw-layer');
  await click('#card-prioritas > summary');
  await click('#hud-btn-drawer');
  await until('!document.querySelector("#road-detail-drawer").classList.contains("hidden") && document.querySelectorAll("#d-factors-body tr").length === 17', '17 factors');
  assert.equal(await read('document.activeElement.id'), 'drawer-factor-section');
  await click('#btn-close-drawer');

  await viewport(1024, 768);
  await selectRoad('HSS-KAB-299');
  await click('#btn-card-trace-hospital');
  assert.equal(await read('!appState.mapLayers.routeTrace && appState.selectedRoadKey === "HSS-KAB-299"'), true);
  assert.match(await read('document.querySelector("#route-hud-network-dist").textContent'), /tidak terhubung/);
  await capture('road-inspector-tablet-disconnected.png');

  await viewport(390, 844);
  await selectRoad('HSS-KAB-001');
  await click('#btn-card-trace-school');
  assert.equal(await read('appState.activeTracedFacilityType'), 'school');
  assert.equal(await read('document.querySelector("#road-inspector").getBoundingClientRect().top >= document.querySelector("#hss-map").getBoundingClientRect().bottom - 1'), true);
  assert.equal(await read('document.documentElement.scrollWidth === document.documentElement.clientWidth'), true);
  await capture('road-inspector-narrow.png');

  await click('#hud-btn-close');
  assert.equal(await read('!appState.selectedRoadKey && !appState.mapLayers.routeTrace && !document.querySelector("#map-container").classList.contains("inspection-open")'), true);
  if (await read('!document.querySelector("#gis-side-panel").classList.contains("hidden")')) await click('#btn-close-layers');
  await click('#btn-toggle-layers');
  await until('!document.querySelector("#gis-side-panel").classList.contains("hidden")', 'layers controls');
  await click('#btn-close-layers');
  await cdp.eval(`const select=document.getElementById('map-filter-tier'); select.value='TOP_35'; select.dispatchEvent(new Event('change', {bubbles:true}));`);
  await until('appState.mapFilters.tier === "TOP_35" && appState.mapLayers.countyRoads.getLayers().length === 35', 'tier filter');
  await click('#btn-theme-dd1');
  await until('appState.roadThematicMode === "KONDISI_DD1" && appState.mapLayers.fullDd1Segments && appState.map.hasLayer(appState.mapLayers.fullDd1Segments)', 'DD1 thematic layer');
  await click('#btn-theme-prioritas');
  await until('appState.roadThematicMode === "PRIORITAS"', 'priority thematic layer');
  await click('#btn-mobile-nav');
  await click('#mobile-navigation [data-view="dashboard"]');
  await until('appState.currentView === "dashboard"', 'mobile navigation');
  await click('#btn-mobile-nav');
  await click('#mobile-navigation [data-view="simulasi"]');
  await until('appState.currentView === "simulasi" && document.querySelector("#proposal-save-button").offsetParent !== null', 'planning workspace');
  assert.deepEqual(exceptions, []);
  console.log('PASS: road search, conditions, RTRW, factors, four routes, disconnected state, three layouts, filters, thematic layers and planning navigation.');
} finally {
  cdp?.close();
  chrome.kill();
}
