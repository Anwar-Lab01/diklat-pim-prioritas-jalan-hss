import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000/#asb-costing';

async function captureSolver() {
  const serverProc = spawn('node', ['--experimental-strip-types', 'src/server.ts'], { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2500));

  const remotePort = 9226;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${remotePort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,1200',
    '--user-data-dir=' + path.resolve('.tmp-chrome-cdp-phase3-solver'),
    APP_URL
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const res = await fetch(`http://localhost:${remotePort}/json`);
        const targets = await res.json();
        const page = targets.find(t => t.type === 'page' && t.url.includes('3000'));
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
    }

    if (!wsUrl) throw new Error('Could not find chrome target');

    const ws = new WebSocket(wsUrl);
    await new Promise(r => { ws.onopen = r; });
    let id = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const curId = id++;
        const handler = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await new Promise(r => setTimeout(r, 3000));

    // Click on solver subtab
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.asb-subtab-btn[data-tab="optimasi-matematis"]');
        btn?.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 2000));

    const ss = await send('Page.captureScreenshot', { format: 'png' });
    const ssPath = path.resolve('reports/screenshots/phase3_solver_tab_view.png');
    fs.writeFileSync(ssPath, Buffer.from(ss.data, 'base64'));
    console.log('Saved solver tab screenshot to:', ssPath);
  } finally {
    chromeProc.kill('SIGKILL');
    serverProc.kill('SIGKILL');
  }
}

captureSolver().catch(console.error);
