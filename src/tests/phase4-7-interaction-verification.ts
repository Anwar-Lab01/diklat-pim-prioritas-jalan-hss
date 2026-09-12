/**
 * Phase 4.7 — Map Interaction, Desa/Kelurahan Info & Popup Control Hardening
 * Automated Verification Suite
 * Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpatialService } from '../services/spatialService.ts';

const spatialService = new SpatialService();

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('================================================================');
console.log('STARTING PHASE 4.7 MAP INTERACTION & POPUP CONTROL VERIFICATION');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. AUTHORITATIVE DESA / KELURAHAN IDENTITY & METADATA
// -----------------------------------------------------------------------------
console.log('--- 1. DESA / KELURAHAN AUTHORITATIVE IDENTITY ---');

const villagesGeoJson = spatialService.getVillagesGeoJson();

test('Authoritative villages count must be exactly 148', () => {
  assert.equal(villagesGeoJson.features.length, 148);
});

test('All 148 villages must have required authoritative identity properties', () => {
  const missingProperties: string[] = [];
  for (const f of villagesGeoJson.features) {
    const p = f.properties;
    if (!p.village_name || !p.district_name || !p.village_id || !p.admin_type) {
      missingProperties.push(p.village_name || 'UNKNOWN');
    }
  }
  assert.equal(missingProperties.length, 0, `Features missing required fields: ${missingProperties.join(', ')}`);
});

test('Village admin_type must strictly be either "Desa" or "Kelurahan"', () => {
  const validTypes = new Set(['Desa', 'Kelurahan']);
  for (const f of villagesGeoJson.features) {
    assert.ok(validTypes.has(f.properties.admin_type), `Invalid admin_type ${f.properties.admin_type} for ${f.properties.village_name}`);
  }
});

test('All 11 authoritative districts must be represented in the village collection', () => {
  const districtSet = new Set<string>();
  for (const f of villagesGeoJson.features) {
    districtSet.add(f.properties.district_name);
  }
  assert.equal(districtSet.size, 11, `Expected 11 districts, found: ${districtSet.size}`);
});

test('Authoritative village area_ha_source must be positive numbers where defined', () => {
  for (const f of villagesGeoJson.features) {
    if (f.properties.area_ha_source !== undefined && f.properties.area_ha_source !== null) {
      assert.ok(f.properties.area_ha_source > 0, `Invalid area for ${f.properties.village_name}`);
    }
  }
});

// -----------------------------------------------------------------------------
// 2. CLIENT-SIDE POPUP & TOOLTIP CONTROLS UI SPECIFICATION
// -----------------------------------------------------------------------------
console.log('\n--- 2. POPUP & TOOLTIP CONTROLS UI SPECIFICATION ---');

const indexHtmlPath = path.resolve('src/public/index.html');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

test('index.html contains Group 7: Interaksi Peta section', () => {
  assert.ok(indexHtml.includes('7. Interaksi Peta'), 'Missing Group 7 header in index.html');
});

test('index.html contains popup-master master toggle checkbox', () => {
  assert.ok(indexHtml.includes('id="popup-master"'), 'Missing popup-master checkbox');
  assert.ok(indexHtml.includes('Aktifkan Popup'), 'Missing Aktifkan Popup label');
});

test('index.html contains all 4 subordinate category popup checkboxes', () => {
  assert.ok(indexHtml.includes('id="popup-administrasi"'), 'Missing popup-administrasi checkbox');
  assert.ok(indexHtml.includes('id="popup-fasilitas"'), 'Missing popup-fasilitas checkbox');
  assert.ok(indexHtml.includes('id="popup-jaringan"'), 'Missing popup-jaringan checkbox');
  assert.ok(indexHtml.includes('id="popup-rtrw"'), 'Missing popup-rtrw checkbox');
});

test('index.html subordinate popup checkboxes are enclosed in popup-subordinates container', () => {
  assert.ok(indexHtml.includes('id="popup-subordinates"'), 'Missing popup-subordinates wrapper div');
});

test('index.html contains tooltip-master toggle checkbox', () => {
  assert.ok(indexHtml.includes('id="tooltip-master"'), 'Missing tooltip-master checkbox');
  assert.ok(indexHtml.includes('Tooltip Ringkas'), 'Missing Tooltip Ringkas label');
});

test('index.html contains CSS rule .tooltips-hidden for non-destructive tooltip hiding', () => {
  assert.ok(indexHtml.includes('.tooltips-hidden .leaflet-tooltip'), 'Missing .tooltips-hidden CSS rule');
  assert.ok(indexHtml.includes('display: none !important;'), 'Missing display: none !important in tooltip hiding rule');
});

// -----------------------------------------------------------------------------
// 3. APPLICATION JAVASCRIPT IMPLEMENTATION CONTRACTS
// -----------------------------------------------------------------------------
console.log('\n--- 3. CLIENT CONTROLLER LOGIC IN APP.JS ---');

const appJsPath = path.resolve('src/public/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

test('app.js defines popupSettings with master and 4 subordinate categories in state', () => {
  assert.ok(appJs.includes('popupSettings:'), 'Missing popupSettings in state');
  assert.ok(appJs.includes('masterEnabled: true'), 'Missing masterEnabled in popupSettings');
  assert.ok(appJs.includes('administrasi: true'), 'Missing administrasi in popupSettings');
  assert.ok(appJs.includes('fasilitas: true'), 'Missing fasilitas in popupSettings');
  assert.ok(appJs.includes('jaringanReferensi: true'), 'Missing jaringanReferensi in popupSettings');
  assert.ok(appJs.includes('polaRuangRtrw: true'), 'Missing polaRuangRtrw in popupSettings');
});

test('app.js defines tooltipSettings in state with enabled: true default', () => {
  assert.ok(appJs.includes('tooltipSettings:'), 'Missing tooltipSettings in state');
  assert.ok(appJs.includes('enabled: true'), 'Missing enabled in tooltipSettings');
});

test('app.js renderVillages binds click popup with authoritative properties', () => {
  assert.ok(appJs.includes('Kecamatan: <strong>${escapeHtml(kecamatan)}</strong>'), 'Village popup missing kecamatan');
  assert.ok(appJs.includes('Kode Wilayah: <span class="font-mono">${escapeHtml(kode)}</span>'), 'Village popup missing kode wilayah');
  assert.ok(appJs.includes('Luas: ${luas}'), 'Village popup missing luas');
});

test('app.js renderVillages checks popupSettings guards before showing popup', () => {
  assert.ok(
    appJs.includes('!state.popupSettings.masterEnabled || !state.popupSettings.administrasi'),
    'Village click handler missing popupSettings guard'
  );
});

test('app.js renderVillages enforces close-zoom threshold (>= 12) on tooltipopen', () => {
  assert.ok(
    appJs.includes('state.map.getZoom() < 12'),
    'Village tooltip missing close-zoom threshold check'
  );
});

test('app.js renderReferenceNetwork connectors checks popupSettings guards', () => {
  assert.ok(
    appJs.includes('!state.popupSettings.masterEnabled || !state.popupSettings.jaringanReferensi'),
    'Connectors click handler missing popupSettings guard'
  );
});

test('app.js renderFacilities checks popupSettings guards', () => {
  assert.ok(
    appJs.includes('!state.popupSettings.masterEnabled || !state.popupSettings.fasilitas'),
    'Facilities click handler missing popupSettings guard'
  );
});

test('app.js loadRtrwLayer checks popupSettings guards on polygon click', () => {
  assert.ok(
    appJs.includes('!state.popupSettings.masterEnabled || !state.popupSettings.polaRuangRtrw'),
    'RTRW click handler missing popupSettings guard'
  );
});

test('app.js wires popup and tooltip control listeners in initMapControls', () => {
  assert.ok(appJs.includes("popupMaster?.addEventListener('change'"), 'Missing popupMaster event listener');
  assert.ok(appJs.includes("tooltipMaster?.addEventListener('change'"), 'Missing tooltipMaster event listener');
  assert.ok(appJs.includes('syncPopupControlsUI'), 'Missing syncPopupControlsUI function');
  assert.ok(appJs.includes('updateTooltipVisibility'), 'Missing updateTooltipVisibility function');
});

// -----------------------------------------------------------------------------
// 4. INTERACTION ORDER & SELECTION INDEPENDENCE CONTRACTS
// -----------------------------------------------------------------------------
console.log('\n--- 4. INTERACTION ORDER & SELECTION INDEPENDENCE ---');

test('Pane z-index hierarchy ensures road pane (500) is strictly above village pane (370)', () => {
  const villagesPaneIndex = appJs.indexOf("{ name: 'villagesPane', zIndex: 370 }");
  const countyRoadsPaneIndex = appJs.indexOf("{ name: 'countyRoadsPane', zIndex: 500 }");
  assert.ok(villagesPaneIndex > 0, 'Missing villagesPane definition');
  assert.ok(countyRoadsPaneIndex > 0, 'Missing countyRoadsPane definition');
});

test('County road click handler stops propagation to prevent underlying village click collision', () => {
  assert.ok(
    appJs.includes('L.DomEvent.stopPropagation(e)'),
    'Road click handler must stop event propagation'
  );
});

test('Road selection functions (selectRoadOnMap, clearRoadSelection) exist and do NOT depend on popups', () => {
  assert.ok(appJs.includes('window.selectRoadOnMap = function'), 'Missing window.selectRoadOnMap');
  assert.ok(appJs.includes('window.clearRoadSelection = function'), 'Missing window.clearRoadSelection');
  // clearRoadSelection should never clear popupSettings or touch popups
  const clearSelectionFn = appJs.substring(
    appJs.indexOf('window.clearRoadSelection = function'),
    appJs.indexOf('window.viewRoadOnMap = async function')
  );
  assert.ok(!clearSelectionFn.includes('popupSettings'), 'clearRoadSelection must not mutate popupSettings');
});

// -----------------------------------------------------------------------------
// 5. CANONICAL ROAD DATA & SCORING NON-REGRESSION
// -----------------------------------------------------------------------------
console.log('\n--- 5. CANONICAL ROAD DATA & SCORING NON-REGRESSION ---');

const countyRoads = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');

test('Canonical county roads count remains exactly 350', () => {
  assert.equal(countyRoads.features.length, 350);
});

test('Rank #1 road remains unchanged in OPERATIONAL_2025 (HSS-KAB-025)', () => {
  const topRoad = countyRoads.features.find((f: any) => f.properties.priority_rank === 1);
  assert.ok(topRoad, 'Missing rank 1 road');
  assert.equal(topRoad.properties.road_key, 'HSS-KAB-025');
  assert.equal(topRoad.properties.tier_category, 'TOP_35');
});

test('Road HSS-KAB-001 rank remains #12 in OPERATIONAL_2025', () => {
  const road001 = countyRoads.features.find((f: any) => f.properties.road_key === 'HSS-KAB-001');
  assert.ok(road001, 'Missing road HSS-KAB-001');
  assert.equal(road001.properties.priority_rank, 12);
  assert.equal(road001.properties.tier_category, 'TOP_35');
});

test('Tier partitions remain exact {35, 35, 35, 245}', () => {
  const top35 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_35').length;
  const top70 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_70').length;
  const top105 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_105').length;
  const regular = countyRoads.features.filter((f: any) => f.properties.tier_category === 'REGULAR').length;

  assert.equal(top35, 35);
  assert.equal(top70, 35);
  assert.equal(top105, 35);
  assert.equal(regular, 245);
  assert.equal(top35 + top70 + top105 + regular, 350);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`PHASE 4.7 INTERACTION VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  console.error(`>> VERDICT: PHASE_4_7_TARGETED_FIX_REQUIRED (${failed} failures) <<`);
  process.exit(1);
} else {
  console.log('>> VERDICT: PHASE_4_7_MAP_INTERACTION_PASS <<');
  process.exit(0);
}
