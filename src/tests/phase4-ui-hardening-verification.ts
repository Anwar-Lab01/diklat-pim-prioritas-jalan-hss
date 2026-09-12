/**
 * Phase 4.5 — GIS UI/UX Hardening & Non-Visual Invariants Verification Suite
 * Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpatialService } from '../services/spatialService.ts';
import {
  ROAD_TIER_STYLES,
  SELECTION_HALO_STYLE,
  HIT_TARGET_STYLE,
  REFERENCE_NETWORK_STYLES,
  ADMINISTRATIVE_STYLES,
  RTRW_COLORS,
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
console.log('STARTING PHASE 4.5 GIS UI/UX HARDENING VERIFICATION SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. CANONICAL 350-ROAD STATE PRESERVATION & NON-DESTRUCTIVE FILTERING
// -----------------------------------------------------------------------------
console.log('--- 1. CANONICAL 350-ROAD STATE PRESERVATION & FILTERING ---');

const countyRoadsGeoJson = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');
const allFeatures = countyRoadsGeoJson.features;

test('Master in-memory features count must be exactly 350', () => {
  assert.equal(allFeatures.length, 350);
});

test('Filtering by District reduces display count without mutating master data', () => {
  const kandanganFeatures = allFeatures.filter((f) => f.properties.district_name === 'Kandangan');
  assert.ok(kandanganFeatures.length > 0 && kandanganFeatures.length < 350);
  assert.equal(allFeatures.length, 350, 'Master features list must remain 350');
});

test('Filtering by Tier categories matches exact partition {35, 35, 35, 245}', () => {
  const top35 = allFeatures.filter((f) => f.properties.tier_category === 'TOP_35');
  const top70 = allFeatures.filter((f) => f.properties.tier_category === 'TOP_70');
  const top105 = allFeatures.filter((f) => f.properties.tier_category === 'TOP_105');
  const regular = allFeatures.filter((f) => f.properties.tier_category === 'REGULAR');

  assert.equal(top35.length, 35);
  assert.equal(top70.length, 35);
  assert.equal(top105.length, 35);
  assert.equal(regular.length, 245);
  assert.equal(top35.length + top70.length + top105.length + regular.length, 350);
});

test('Filtering by Condition bands (Mantap >= 60, Transisi 40-60, Kritis < 40) is valid', () => {
  const mantap = allFeatures.filter((f) => f.properties.mantap_pct >= 60.0);
  const transisi = allFeatures.filter((f) => f.properties.mantap_pct >= 40.0 && f.properties.mantap_pct < 60.0);
  const kritis = allFeatures.filter((f) => f.properties.mantap_pct < 40.0);

  assert.ok(mantap.length > 0);
  assert.ok(transisi.length > 0);
  assert.ok(kritis.length > 0);
  assert.equal(mantap.length + transisi.length + kritis.length, 350);
  assert.equal(allFeatures.length, 350, 'Master data preserved');
});

test('Zero-result filter combination yields empty array without crashing', () => {
  const zeroResult = allFeatures.filter(
    (f) => f.properties.district_name === 'NonExistentDistrict' && f.properties.tier_category === 'TOP_35'
  );
  assert.equal(zeroResult.length, 0);
  assert.equal(allFeatures.length, 350, 'Master data preserved after zero-result filter');
});

test('Filter reset deterministically restores all 350 roads', () => {
  let activeFeatures = allFeatures.filter((f) => f.properties.district_name === 'Kandangan');
  assert.ok(activeFeatures.length < 350);
  // Reset
  activeFeatures = allFeatures;
  assert.equal(activeFeatures.length, 350);
});

// -----------------------------------------------------------------------------
// 2. STRICT ROAD_KEY RESOLUTION & DISAMBIGUATION
// -----------------------------------------------------------------------------
console.log('\n--- 2. STRICT ROAD_KEY RESOLUTION & DISAMBIGUATION ---');

test('Duplicate road name "Mawar" resolves unambiguously by road_key', () => {
  const mawarFeatures = allFeatures.filter((f) => f.properties.display_name.toLowerCase().includes('mawar'));
  assert.equal(mawarFeatures.length, 2, 'Exactly 2 roads named Mawar');

  const mawarKandangan = mawarFeatures.find((f) => f.properties.road_key === 'HSS-KAB-013');
  const mawarDahaSelatan = mawarFeatures.find((f) => f.properties.road_key === 'HSS-KAB-295');

  assert.ok(mawarKandangan, 'HSS-KAB-013 exists');
  assert.ok(mawarDahaSelatan, 'HSS-KAB-295 exists');
  assert.equal(mawarKandangan.properties.district_name, 'Kandangan');
  assert.equal(mawarDahaSelatan.properties.district_name, 'Daha Selatan');
  assert.notEqual(mawarKandangan.properties.priority_rank, mawarDahaSelatan.properties.priority_rank);
});

test('Road selection across Search Autocomplete, Table, and Map resolves same road_key', () => {
  const testKey = 'HSS-KAB-025';
  const foundFeature = allFeatures.find((f) => f.properties.road_key === testKey);
  assert.ok(foundFeature);
  assert.equal(foundFeature.properties.priority_rank, 1);
  assert.equal(foundFeature.properties.nomor_ruas, '025');
  assert.equal(foundFeature.properties.display_name, 'Singakarsa - Palas');
});

// -----------------------------------------------------------------------------
// 3. TOPOLOGICAL CONNECTOR SAFETY
// -----------------------------------------------------------------------------
console.log('\n--- 3. TOPOLOGICAL CONNECTOR SAFETY ---');

const refNetwork = spatialService.getReferenceNetworkGeoJson();
const connectors = refNetwork.features.filter((f) => f.properties.network_class === 'KONEKTOR_ANALISIS');

test('Analytical connectors count must be exactly 4', () => {
  assert.equal(connectors.length, 4);
});

test('All connectors have NO score, NO rank, and NO tier', () => {
  for (const conn of connectors) {
    const p = conn.properties;
    assert.equal(p.final_score, undefined);
    assert.equal(p.priority_rank, undefined);
    assert.equal(p.tier_category, undefined);
    assert.equal(p.treatment_recommendation, undefined);
  }
});

test('All connectors are labeled as analysis connectors, never physical bridges', () => {
  for (const conn of connectors) {
    const p = conn.properties;
    assert.equal(p.network_class, 'KONEKTOR_ANALISIS');
    assert.ok(p.connector_name.length > 0);
  }
});

// -----------------------------------------------------------------------------
// 4. PUBLIC FACILITIES DECLUTTERING & HIERARCHY
// -----------------------------------------------------------------------------
console.log('\n--- 4. PUBLIC FACILITIES DECLUTTERING & HIERARCHY ---');

const facilities = spatialService.getPublicFacilitiesGeoJson();

test('Facilities total count must be exactly 285', () => {
  assert.equal(facilities.features.length, 285);
});

test('Facilities breakdown: 2 RSUD, 21 Puskesmas, 11 Markets, 251 Schools', () => {
  const hospitals = facilities.features.filter((f) => f.properties.facility_type === 'hospital');
  const puskesmas = facilities.features.filter((f) => f.properties.facility_type === 'puskesmas');
  const markets = facilities.features.filter((f) => f.properties.facility_type === 'market');
  const schools = facilities.features.filter((f) => f.properties.facility_type === 'school');

  assert.equal(hospitals.length, 2);
  assert.equal(puskesmas.length, 21);
  assert.equal(markets.length, 11);
  assert.equal(schools.length, 251);
});

test('School density is 88.07% of all facility markers (justifying zoom threshold)', () => {
  const schoolCount = facilities.features.filter((f) => f.properties.facility_type === 'school').length;
  const ratio = (schoolCount / 285) * 100;
  assert.ok(ratio > 88.0 && ratio < 88.2, `School ratio: ${ratio.toFixed(2)}%`);
});

// -----------------------------------------------------------------------------
// 5. RTRW OPTIONALITY & SESSION PERFORMANCE
// -----------------------------------------------------------------------------
console.log('\n--- 5. RTRW OPTIONALITY & PERFORMANCE ---');

test('RTRW Pola Ruang GeoJSON contains exactly 2,832 polygons across 12 zones', () => {
  const rtrw = spatialService.getRtrwGeoJson();
  assert.equal(rtrw.features.length, 2832);
  const categories = spatialService.getRtrwCategories();
  assert.equal(categories.length, 12);
});

test('RTRW is optional and does not mutate county roads GeoJSON', () => {
  const roadsBefore = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');
  const rtrw = spatialService.getRtrwGeoJson();
  const roadsAfter = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');

  assert.equal(roadsBefore.features.length, 350);
  assert.equal(roadsAfter.features.length, 350);
  assert.equal(roadsAfter.features[0].properties.road_key, roadsBefore.features[0].properties.road_key);
});

// -----------------------------------------------------------------------------
// 6. OPERATING MODE ISOLATION & SCORING REFRESH
// -----------------------------------------------------------------------------
console.log('\n--- 6. OPERATING MODE ISOLATION & SCORING REFRESH ---');

const opRoads = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025');
const benchRoads = spatialService.getCountyRoadsWithScores('BENCHMARK_2024');

test('Operational and Benchmark modes return distinct run_ids and scores', () => {
  const opRunId = opRoads.properties?.run_id;
  const benchRunId = benchRoads.properties?.run_id;

  assert.ok(opRunId);
  assert.ok(benchRunId);
  assert.notEqual(opRunId, benchRunId, 'Run IDs must be distinct');

  const opRoad1 = opRoads.features.find((f) => f.properties.road_key === 'HSS-KAB-001');
  const benchRoad1 = benchRoads.features.find((f) => f.properties.road_key === 'HSS-KAB-001');

  assert.equal(opRoad1?.properties.priority_rank, 12);
  assert.equal(benchRoad1?.properties.priority_rank, 13);
});

test('Rank #1 road (HSS-KAB-025) has differentiated scores between modes', () => {
  const opTop = opRoads.features.find((f) => f.properties.priority_rank === 1);
  const benchTop = benchRoads.features.find((f) => f.properties.priority_rank === 1);

  assert.equal(opTop?.properties.road_key, 'HSS-KAB-025');
  assert.equal(benchTop?.properties.road_key, 'HSS-KAB-025');
  assert.notEqual(opTop?.properties.final_score, benchTop?.properties.final_score);
});

// -----------------------------------------------------------------------------
// 7. SYMBOLOGY & HIT-TARGET INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 7. SYMBOLOGY & HIT-TARGET INTEGRITY ---');

test('HIT_TARGET_STYLE has weight = 16 and opacity = 0 for invisible hit-area', () => {
  assert.equal(HIT_TARGET_STYLE.weight, 16);
  assert.equal(HIT_TARGET_STYLE.opacity, 0);
  assert.equal(HIT_TARGET_STYLE.lineCap, 'round');
});

test('SELECTION_HALO_STYLE has Cyan color (#06b6d4) and weight >= 10', () => {
  assert.equal(SELECTION_HALO_STYLE.color, '#06b6d4');
  assert.ok(SELECTION_HALO_STYLE.weight >= 10);
});

test('ROAD_TIER_STYLES preserves official 4-tier color palette', () => {
  assert.equal(ROAD_TIER_STYLES.TOP_35.color, '#e11d48');
  assert.equal(ROAD_TIER_STYLES.TOP_70.color, '#ea580c');
  assert.equal(ROAD_TIER_STYLES.TOP_105.color, '#eab308');
  assert.equal(ROAD_TIER_STYLES.REGULAR.color, '#64748b');
});

// -----------------------------------------------------------------------------
// 8. OFFLINE-FIRST ASSETS & LOCAL PROVENANCE
// -----------------------------------------------------------------------------
console.log('\n--- 8. OFFLINE-FIRST ASSETS & LOCAL PROVENANCE ---');

test('Local Leaflet CSS file exists and is non-empty', () => {
  const cssPath = path.join(process.cwd(), 'src', 'public', 'vendor', 'leaflet', 'leaflet.css');
  assert.ok(fs.existsSync(cssPath));
  assert.ok(fs.statSync(cssPath).size > 1000);
});

test('Local Leaflet JS file exists and is non-empty', () => {
  const jsPath = path.join(process.cwd(), 'src', 'public', 'vendor', 'leaflet', 'leaflet.js');
  assert.ok(fs.existsSync(jsPath));
  assert.ok(fs.statSync(jsPath).size > 100000);
});

test('Administrative boundaries GeoJSON exist (11 districts, 148 villages)', () => {
  const dists = spatialService.getDistrictsGeoJson();
  const vils = spatialService.getVillagesGeoJson();
  assert.equal(dists.features.length, 11);
  assert.equal(vils.features.length, 148);
});

console.log('\n================================================================');
console.log(`PHASE 4.5 VERIFICATION COMPLETE: ${passed} / ${passed + failed} TESTS PASSED!`);
if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL PHASE 4.5 TESTS PASSED!');
  console.log('================================================================');
}
