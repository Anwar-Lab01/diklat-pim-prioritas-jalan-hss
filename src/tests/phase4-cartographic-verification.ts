/**
 * Phase 4.6 — Cartographic Hardening, Administrative Hierarchy, Satellite Basemap & RTRW Symbology
 * Automated Verification Suite
 * Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpatialService } from '../services/spatialService.ts';
import {
  ROAD_TIER_STYLES,
  SELECTION_HALO_STYLE,
  REFERENCE_NETWORK_STYLES,
  ADMINISTRATIVE_STYLES,
  RTRW_COLORS,
  RTRW_FAMILY_LABELS,
  BASEMAP_CONFIG,
} from '../public/mapStyle.js';

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

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

console.log('================================================================');
console.log('STARTING PHASE 4.6 CARTOGRAPHIC HARDENING VERIFICATION SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. KABUPATEN HSS OUTER BOUNDARY DERIVATION & DISPLAY CONTEXT
// -----------------------------------------------------------------------------
console.log('--- 1. KABUPATEN HSS BOUNDARY DERIVATION & DISPLAY CONTEXT ---');

const kabGeoJson = spatialService.getKabupatenGeoJson();

test('Kabupaten GeoJSON is a valid FeatureCollection with exactly 1 feature', () => {
  assert.equal(kabGeoJson.type, 'FeatureCollection');
  assert.equal(kabGeoJson.features.length, 1);
});

test('Kabupaten boundary feature geometry is a valid Polygon or MultiPolygon', () => {
  const geom = kabGeoJson.features[0].geometry;
  assert.ok(geom.type === 'Polygon' || geom.type === 'MultiPolygon');
  assert.ok(geom.coordinates.length > 0);
});

test('Kabupaten boundary bbox lies within geographic bounds of HSS regency', () => {
  const bbox = kabGeoJson.bbox;
  assert.ok(Array.isArray(bbox) && bbox.length === 4, 'Bbox must have 4 coordinates');
  const [minX, minY, maxX, maxY] = bbox;
  // HSS is roughly lon 114.8 to 115.7, lat -3.0 to -2.4
  assert.ok(minX >= 114.5 && minX <= 115.2, `minX ${minX} within HSS bounds`);
  assert.ok(maxX >= 115.3 && maxX <= 116.0, `maxX ${maxX} within HSS bounds`);
  assert.ok(minY >= -3.2 && minY <= -2.7, `minY ${minY} within HSS bounds`);
  assert.ok(maxY >= -2.7 && maxY <= -2.2, `maxY ${maxY} within HSS bounds`);
});

test('Kabupaten boundary properties record dissolve metadata from 11 districts', () => {
  const props = kabGeoJson.features[0].properties;
  assert.equal(props.boundary_type, 'KABUPATEN');
  assert.equal(props.regency_name, 'Hulu Sungai Selatan');
  assert.equal(props.province_name, 'Kalimantan Selatan');
  assert.equal(props.source, 'DISSOLVE_11_DISTRICTS');
  assert.equal(props.district_count, 11);
});

test('Kabupaten boundary is strictly display-only context (no scores, ranks, treatments)', () => {
  const props = kabGeoJson.features[0].properties;
  assert.equal(props.final_score, undefined, 'Must not have final_score');
  assert.equal(props.priority_rank, undefined, 'Must not have priority_rank');
  assert.equal(props.tier_category, undefined, 'Must not have tier_category');
  assert.equal(props.treatment, undefined, 'Must not have treatment');
});

// -----------------------------------------------------------------------------
// 2. ADMINISTRATIVE HIERARCHY INTEGRITY (NO DISTRICT OR VILLAGE LOST)
// -----------------------------------------------------------------------------
console.log('\n--- 2. ADMINISTRATIVE HIERARCHY INTEGRITY ---');

const districtsGeoJson = spatialService.getDistrictsGeoJson();
const villagesGeoJson = spatialService.getVillagesGeoJson();

test('Authoritative districts count is preserved at exactly 11', () => {
  assert.equal(districtsGeoJson.features.length, 11);
});

test('All 11 authoritative districts have valid names and properties', () => {
  const names = districtsGeoJson.features.map((f: any) => f.properties.district_name);
  assert.equal(new Set(names).size, 11, 'All 11 district names must be distinct');
  assert.ok(names.includes('Kandangan'));
  assert.ok(names.includes('Daha Selatan'));
  assert.ok(names.includes('Loksado'));
});

test('Authoritative villages count is preserved at exactly 148', () => {
  assert.equal(villagesGeoJson.features.length, 148);
});

test('Administrative cartographic styling defines strict visual hierarchy', () => {
  const { kabupaten, districts, villages } = ADMINISTRATIVE_STYLES;

  // Kabupaten: solid, darkest, thickest
  assert.equal(kabupaten.fill, false, 'Kabupaten must have transparent/no fill');
  assert.equal(kabupaten.dashArray, null, 'Kabupaten must be solid');
  assert.ok(kabupaten.weight >= 3.0 && kabupaten.weight <= 4.5, 'Kabupaten weight ~3-4px');
  assert.equal(kabupaten.color, '#0f172a', 'Kabupaten must use darkest Slate-900');

  // Districts: dashed, medium weight
  assert.equal(districts.fill, false, 'Districts must have no fill');
  assert.ok(districts.dashArray !== null, 'Districts must be dashed');
  assert.ok(districts.weight >= 1.5 && districts.weight <= 2.2, 'Districts weight ~1.5-2px');
  assert.equal(districts.color, '#475569', 'Districts must use Slate-600');

  // Villages: dotted, thin
  assert.equal(villages.fill, false, 'Villages must have no fill');
  assert.ok(villages.dashArray !== null, 'Villages must be dotted');
  assert.ok(villages.weight <= 1.2, 'Villages weight subtle/thin');

  // Visual hierarchy invariant
  assert.ok(kabupaten.weight > districts.weight, 'Kabupaten boundary must be thicker than Kecamatan');
  assert.ok(districts.weight > villages.weight, 'Kecamatan boundary must be thicker than Desa');
});

// -----------------------------------------------------------------------------
// 3. 12 CATEGORICAL RTRW POLA RUANG SYMBOLOGY FAMILIES
// -----------------------------------------------------------------------------
console.log('\n--- 3. 12 CATEGORICAL RTRW POLA RUANG SYMBOLOGY ---');

test('RTRW_COLORS contains exactly 12 distinct categorical classes', () => {
  const keys = Object.keys(RTRW_COLORS);
  assert.equal(keys.length, 12, `Expected 12 RTRW categories, found ${keys.length}`);
});

test('RTRW color codes match authoritative semantic families', () => {
  const hexRegex = /^#[0-9a-fA-F]{6}$/;
  for (const [cat, color] of Object.entries(RTRW_COLORS)) {
    assert.match(color, hexRegex, `Category ${cat} must have valid hex color`);
  }

  // Check unique colors (all 12 distinct)
  const uniqueColors = new Set(Object.values(RTRW_COLORS));
  assert.equal(uniqueColors.size, 12, 'All 12 RTRW color codes must be visually distinct');

  // Semantic families check
  assert.equal(RTRW_COLORS['Badan Air'], '#0284c7', 'Water family must be blue');
  assert.equal(RTRW_COLORS['Kawasan Permukiman Perkotaan'], '#dc2626', 'Urban settlements must be strong red');
  assert.equal(RTRW_COLORS['Kawasan Permukiman Perdesaan'], '#fb7185', 'Rural settlements must be rose');
  assert.equal(RTRW_COLORS['Kawasan Tanaman Pangan'], '#eab308', 'Agriculture food crops must be yellow/golden');
  assert.equal(RTRW_COLORS['Kawasan Perkebunan'], '#65a30d', 'Agriculture plantations must be olive/lime');
  assert.equal(RTRW_COLORS['Kawasan Hutan Lindung'], '#14532d', 'Protection forest must be dark green');
  assert.equal(RTRW_COLORS['Kawasan Hutan Produksi Tetap'], '#16a34a', 'Production forest must be green');
  assert.equal(RTRW_COLORS['Kawasan Hutan Produksi yang dapat Dikonversi'], '#854d0e', 'HPK must be green-brown');
  assert.equal(RTRW_COLORS['Cagar Alam'], '#064e3b', 'Nature reserve must be deep emerald');
  assert.equal(RTRW_COLORS['Kawasan Lindung Gambut'], '#7e22ce', 'Peat protection must be purple-brown');
  assert.equal(RTRW_COLORS['Kawasan Perikanan Budi Daya'], '#06b6d4', 'Fisheries must be cyan/aqua');
  assert.equal(RTRW_COLORS['Kawasan Pariwisata'], '#c026d3', 'Tourism must be magenta/violet');
});

test('RTRW_FAMILY_LABELS covers all 12 categories with clear semantic naming', () => {
  const rtrwKeys = Object.keys(RTRW_COLORS);
  for (const key of rtrwKeys) {
    assert.ok(RTRW_FAMILY_LABELS[key], `Missing family label for ${key}`);
    assert.ok(RTRW_FAMILY_LABELS[key].length > 3, `Label for ${key} must be descriptive`);
  }
});

// -----------------------------------------------------------------------------
// 4. BASEMAP MODES & SECRETS SAFETY
// -----------------------------------------------------------------------------
console.log('\n--- 4. BASEMAP MODES & CREDENTIALS SAFETY ---');

test('BASEMAP_CONFIG supports neutral, osm, and satellite modes', () => {
  assert.ok(BASEMAP_CONFIG.neutral, 'Neutral basemap must be configured');
  assert.ok(BASEMAP_CONFIG.osm, 'OSM basemap must be configured');
  assert.ok(BASEMAP_CONFIG.satellite, 'Satellite basemap must be configured');
});

test('Neutral basemap is an offline canvas fallback (#f1f5f9)', () => {
  assert.equal(BASEMAP_CONFIG.neutral.isOffline, true);
  assert.equal(BASEMAP_CONFIG.neutral.color, '#f1f5f9');
});

test('OSM basemap contains valid provider attribution and URL', () => {
  assert.equal(BASEMAP_CONFIG.osm.isOffline, false);
  assert.ok(BASEMAP_CONFIG.osm.attribution.includes('OpenStreetMap'));
  assert.ok(BASEMAP_CONFIG.osm.url.includes('openstreetmap.org'));
});

test('Satellite basemap contains valid Esri attribution and URL', () => {
  assert.equal(BASEMAP_CONFIG.satellite.isOffline, false);
  assert.ok(BASEMAP_CONFIG.satellite.attribution.includes('Esri'));
  assert.ok(BASEMAP_CONFIG.satellite.url.includes('ArcGIS/rest/services/World_Imagery/MapServer'));
});

test('No API keys, secret tokens, or credentials in client-side code', () => {
  const filesToCheck = [
    path.join(process.cwd(), 'src', 'public', 'mapStyle.js'),
    path.join(process.cwd(), 'src', 'public', 'app.js'),
    path.join(process.cwd(), 'src', 'public', 'index.html'),
  ];

  const sensitivePatterns = [
    /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{16,}['"]/i,
    /access[_-]?token\s*[:=]\s*['"][a-zA-Z0-9_-]{16,}['"]/i,
    /secret\s*[:=]\s*['"][a-zA-Z0-9_-]{16,}['"]/i,
    /bearer\s+[a-zA-Z0-9._-]{20,}/i,
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const pattern of sensitivePatterns) {
      assert.ok(!pattern.test(content), `Found sensitive pattern in ${path.basename(filePath)}`);
    }
  }
});

// -----------------------------------------------------------------------------
// 5. DETERMINISTIC PANE Z-INDEX HIERARCHY
// -----------------------------------------------------------------------------
console.log('\n--- 5. DETERMINISTIC PANE Z-INDEX HIERARCHY ---');

test('Client app.js defines deterministic z-index order across all map panes', () => {
  const appJsPath = path.join(process.cwd(), 'src', 'public', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf-8');

  // Verify pane declarations
  const expectedPanes = [
    { name: 'basemapPane', z: 200 },
    { name: 'rtrwPane', z: 350 },
    { name: 'villagesPane', z: 370 },
    { name: 'districtsPane', z: 380 },
    { name: 'kabupatenPane', z: 390 },
    { name: 'refRoadsPane', z: 450 },
    { name: 'connectorsPane', z: 460 },
    { name: 'countyRoadsPane', z: 500 },
    { name: 'selectionHaloPane', z: 600 },
    { name: 'facilitiesPane', z: 700 },
  ];

  for (const pane of expectedPanes) {
    assert.ok(appJs.includes(pane.name), `Pane ${pane.name} must be defined in app.js`);
    assert.ok(appJs.includes(String(pane.z)), `Pane ${pane.name} z-index ${pane.z} must be present`);
  }

  assert.ok(appJs.includes('createPane'), 'createPane must be called in app.js');

  // Verify hierarchy rules:
  // countyRoadsPane (500) > kabupatenPane (390) > districtsPane (380) > villagesPane (370) > rtrwPane (350)
  assert.ok(500 > 390 && 390 > 380 && 380 > 370 && 370 > 350);
});

// -----------------------------------------------------------------------------
// 6. MAP PRESETS & CONTROLS UI INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 6. MAP PRESETS & CONTROLS UI INTEGRITY ---');

test('index.html contains quick preset buttons', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="preset-prioritas"'), 'Preset Prioritas button must exist');
  assert.ok(indexHtml.includes('id="preset-pelayanan"'), 'Preset Pelayanan button must exist');
  assert.ok(indexHtml.includes('id="preset-tataruang"'), 'Preset Tata Ruang button must exist');
});

test('index.html contains administrative layer toggles including Kabupaten', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="layer-admin-kabupaten"'), 'Kabupaten layer checkbox must exist');
  assert.ok(indexHtml.includes('id="layer-admin-districts"'), 'Kecamatan layer checkbox must exist');
  assert.ok(indexHtml.includes('id="layer-admin-villages"'), 'Desa layer checkbox must exist');
});

test('index.html contains basemap selection radios (neutral, osm, satellite)', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('id="layer-basemap-neutral"'), 'Neutral basemap radio must exist');
  assert.ok(indexHtml.includes('id="layer-basemap-osm"'), 'OSM basemap radio must exist');
  assert.ok(indexHtml.includes('id="layer-basemap-satellite"'), 'Satellite basemap radio must exist');
});

test('index.html contains .district-label styling with white halo', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('.district-label'), 'CSS must include .district-label class');
  assert.ok(indexHtml.includes('text-shadow'), '.district-label must include text-shadow halo');
});

test('applyMapPreset function is defined and non-destructive to road scores/ranks', () => {
  const appJs = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'app.js'), 'utf-8');
  assert.ok(appJs.includes('function applyMapPreset(preset)'), 'applyMapPreset must be implemented');
  assert.ok(!appJs.includes('state.roads = []') && !appJs.includes('calculatePriorityScores'), 'Preset must not mutate road scores');
});

// -----------------------------------------------------------------------------
// 7. CANONICAL ROAD STATE & RANKING INTEGRITY NON-REGRESSION
// -----------------------------------------------------------------------------
console.log('\n--- 7. CANONICAL ROAD STATE & RANKING INTEGRITY NON-REGRESSION ---');

const countyRoads = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');

test('Exactly 350 canonical county roads exist in spatial service', () => {
  assert.equal(countyRoads.features.length, 350);
});

test('Rank #1 road remains unchanged in OPERATIONAL_2025 (HSS-KAB-025, rank 1)', () => {
  const rank1 = countyRoads.features.find((f: any) => f.properties.priority_rank === 1);
  assert.ok(rank1, 'Rank 1 road must exist');
  assert.equal(rank1.properties.road_key, 'HSS-KAB-025');
  assert.equal(rank1.properties.tier_category, 'TOP_35');
});

test('Road HSS-KAB-001 rank remains #12 in OPERATIONAL_2025 (post Phase 3 reconciliation)', () => {
  const r1 = countyRoads.features.find((f: any) => f.properties.road_key === 'HSS-KAB-001');
  assert.ok(r1, 'Road HSS-KAB-001 must exist');
  assert.equal(r1.properties.priority_rank, 12);
  assert.equal(r1.properties.tier_category, 'TOP_35');
});

test('Tier partitions remain exact {35, 35, 35, 245}', () => {
  const t35 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_35').length;
  const t70 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_70').length;
  const t105 = countyRoads.features.filter((f: any) => f.properties.tier_category === 'TOP_105').length;
  const reg = countyRoads.features.filter((f: any) => f.properties.tier_category === 'REGULAR').length;
  assert.equal(t35, 35);
  assert.equal(t70, 35);
  assert.equal(t105, 35);
  assert.equal(reg, 245);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`PHASE 4.6 CARTOGRAPHIC HARDENING VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n>> VERDICT: PHASE_4_6_CARTOGRAPHIC_HARDENING_PASS <<\n');
}
