import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../src/server/server.ts';

async function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        }
      });
      res.on('error', reject);
    });
  });
}

async function main() {
  console.log('--- TESTING SERVER ENDPOINTS AGAINST DEPLOYMENT DB ---');
  process.env.DB_PATH = 'data/diklat_pim_deploy.db';

  const app = createServer();
  const server = app.listen(3344);

  try {
    const base = 'http://localhost:3344';

    // 1. Dashboard
    console.log('Testing GET /api/dashboard...');
    const dash = await fetchJson(`${base}/api/dashboard`);
    assert.strictEqual(dash.success, true);
    assert.strictEqual(dash.data.kpis.totalRoads, 350);
    assert.strictEqual(dash.data.top10.length, 10);
    assert.strictEqual(dash.data.top10[0].road_key, 'HSS-KAB-025');
    console.log('  ✓ /api/dashboard OK');

    // 2. Roads Table
    console.log('Testing GET /api/roads...');
    const roads = await fetchJson(`${base}/api/roads`);
    assert.strictEqual(roads.success, true);
    assert.strictEqual(roads.total, 350);
    assert.strictEqual(roads.data[0].road_key, 'HSS-KAB-025');
    console.log('  ✓ /api/roads OK (350 roads)');

    // 3. Road Detail
    console.log('Testing GET /api/roads/HSS-KAB-001...');
    const road001 = await fetchJson(`${base}/api/roads/HSS-KAB-001`);
    assert.strictEqual(road001.success, true);
    assert.strictEqual(road001.data.identity.road_key, 'HSS-KAB-001');
    assert.strictEqual(road001.data.priorityResult.priority_rank, 12);
    console.log('  ✓ /api/roads/HSS-KAB-001 OK (Rank #12)');

    // 4. Map Roads GeoJSON
    console.log('Testing GET /api/map/roads...');
    const mapRoads = await fetchJson(`${base}/api/map/roads`);
    assert.strictEqual(mapRoads.success, true);
    assert.strictEqual(mapRoads.total, 350);
    assert.strictEqual(mapRoads.data.features.length, 350);
    console.log('  ✓ /api/map/roads OK (350 features)');

    // 5. Reference Network
    console.log('Testing GET /api/map/reference-network...');
    const refNet = await fetchJson(`${base}/api/map/reference-network`);
    assert.strictEqual(refNet.success, true);
    assert.strictEqual(refNet.total, 16);
    console.log('  ✓ /api/map/reference-network OK (16 features)');

    // 6. Root SPA index.html
    console.log('Testing GET / ...');
    const indexHtml = await fetchJson(`${base}/`);
    assert.ok(typeof indexHtml === 'string' && indexHtml.includes('Sistem Pendukung Prioritas Penanganan Jalan'));
    console.log('  ✓ GET / HTML OK');

    console.log('\n>> ALL SERVER API ENDPOINT CHECKS PASSED <<');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('Server endpoint test failed:', err);
  process.exit(1);
});
