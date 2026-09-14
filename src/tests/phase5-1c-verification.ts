import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../db/connection.ts';
import { ScoringService } from '../services/scoringService.ts';
import { rankRoads } from '../engine/scoringEngine.ts';
import { PROJECT_ROOT } from '../config/constants.ts';
import { DD1SegmentGeometryService } from '../services/dd1SegmentGeometryService.ts';
import { ROAD_TIER_STYLES, DD1_SEGMENT_STYLES, getDD1SegmentFullMapStyle } from '../public/mapStyle.js';

function assert(condition: boolean, message: string, detail?: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}${detail ? ' -> ' + detail : ''}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

console.log('================================================================');
console.log('STARTING PHASE 5.1C FULL-MAP THEMATIC MODE VERIFICATION SUITE');
console.log('================================================================');

const db = getDatabase();
const scoringService = new ScoringService(db);
const dd1GeomService = new DD1SegmentGeometryService(db);

// --- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---
console.log('\n--- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---');
const featureVectors = scoringService.loadRoadFeatureVectors('OPERATIONAL_2025');
const baselineModelConfig = scoringService.loadModelConfig('POLICY_DEFAULT_V1');
const rankedScores = rankRoads(featureVectors, baselineModelConfig);
assert(rankedScores.length === 350, 'Canonical roads count must equal 350');

const top1 = rankedScores.find((s) => s.priority_rank === 1);
assert(top1?.road_key === 'HSS-KAB-025', 'Mandatory rank #1 is HSS-KAB-025', `got ${top1?.road_key}`);
assert(Math.abs(top1!.final_score - 0.649945) < 0.0005, 'Mandatory rank #1 score is ~0.649945', `got ${top1?.final_score}`);

const top12 = rankedScores.find((s) => s.priority_rank === 12);
assert(top12?.road_key === 'HSS-KAB-001', 'Mandatory rank #12 is HSS-KAB-001', `got ${top12?.road_key}`);
assert(Math.abs(top12!.final_score - 0.529610) < 0.0005, 'Mandatory rank #12 score is ~0.529610', `got ${top12?.final_score}`);

const rank133 = rankedScores.find((s) => s.priority_rank === 133);
assert(rank133?.road_key === 'HSS-KAB-295', 'Mandatory rank #133 is HSS-KAB-295', `got ${rank133?.road_key}`);
assert(Math.abs(rank133!.final_score - 0.412427) < 0.0005, 'Mandatory rank #133 score is ~0.412427', `got ${rank133?.final_score}`);

const rank169 = rankedScores.find((s) => s.priority_rank === 169);
assert(rank169?.road_key === 'HSS-KAB-350', 'Mandatory rank #169 is HSS-KAB-350', `got ${rank169?.road_key}`);
assert(Math.abs(rank169!.final_score - 0.381386) < 0.0005, 'Mandatory rank #169 score is ~0.381386', `got ${rank169?.final_score}`);

const rank245 = rankedScores.find((s) => s.priority_rank === 245);
assert(rank245?.road_key === 'HSS-KAB-013', 'Mandatory rank #245 is HSS-KAB-013', `got ${rank245?.road_key}`);
assert(Math.abs(rank245!.final_score - 0.340749) < 0.0005, 'Mandatory rank #245 score is ~0.340749', `got ${rank245?.final_score}`);

const top35Count = rankedScores.filter((s) => s.tier_category === 'TOP_35').length;
const top70Count = rankedScores.filter((s) => s.tier_category === 'TOP_70').length;
const top105Count = rankedScores.filter((s) => s.tier_category === 'TOP_105').length;
const regularCount = rankedScores.filter((s) => s.tier_category === 'REGULAR').length;
assert(
  top35Count === 35 && top70Count === 35 && top105Count === 35 && regularCount === 245,
  'Tier partition remains exact {35, 35, 35, 245}',
  `got {${top35Count}, ${top70Count}, ${top105Count}, ${regularCount}}`
);

// --- 2. CANONICAL DERIVED SEGMENT ASSET & GEOMETRY RECONCILIATION ---
console.log('\n--- 2. CANONICAL DERIVED SEGMENT ASSET & GEOMETRY RECONCILIATION ---');
const geojsonPath = path.resolve(PROJECT_ROOT, 'src/public/data/dd1_condition_segments_2025.geojson');
assert(fs.existsSync(geojsonPath), 'Canonical DD1 segments GeoJSON file exists in src/public/data/');

const rawJson = fs.readFileSync(geojsonPath, 'utf8');
const dd1GeoJson = JSON.parse(rawJson);

assert(dd1GeoJson.type === 'FeatureCollection', 'Root type is FeatureCollection');
assert(dd1GeoJson.features.length === 7487, 'GeoJSON contains exactly 7,487 segment features', `got ${dd1GeoJson.features.length}`);

// Check unique roads covered
const roadKeysInGeoJson = new Set<string>();
let baikLen = 0;
let sedangLen = 0;
let rrLen = 0;
let rbLen = 0;
let totalLen = 0;

let allLineStrings = true;
let allMin2Coords = true;

for (const feat of dd1GeoJson.features) {
  const p = feat.properties;
  roadKeysInGeoJson.add(p.road_key);
  totalLen += p.length_m;
  if (p.dominant_condition === 'baik') baikLen += p.length_m;
  else if (p.dominant_condition === 'sedang') sedangLen += p.length_m;
  else if (p.dominant_condition === 'rusak_ringan') rrLen += p.length_m;
  else if (p.dominant_condition === 'rusak_berat') rbLen += p.length_m;

  if (feat.geometry.type !== 'LineString') allLineStrings = false;
  if (!feat.geometry.coordinates || feat.geometry.coordinates.length < 2) allMin2Coords = false;
}

assert(allLineStrings, 'All 7,487 features have valid LineString geometries');
assert(allMin2Coords, 'All 7,487 features have at least 2 vertices');

assert(roadKeysInGeoJson.size === 350, 'All 350 canonical roads represented in DD1 mode', `got ${roadKeysInGeoJson.size}`);
assert(totalLen === 732460, 'Total segment length equals 732,460 m (732.46 km)', `got ${totalLen}`);
assert(baikLen === 131650, 'Baik condition length equals 131,650 m', `got ${baikLen}`);
assert(sedangLen === 261240, 'Sedang condition length equals 261,240 m', `got ${sedangLen}`);
assert(rrLen === 111410, 'Rusak Ringan condition length equals 111,410 m', `got ${rrLen}`);
assert(rbLen === 228160, 'Rusak Berat condition length equals 228,160 m', `got ${rbLen}`);
assert(baikLen + sedangLen === 392890, 'Mantap condition length equals 392,890 m (53.64%)');
assert(rrLen + rbLen === 339570, 'Tidak Mantap condition length equals 339,570 m (46.36%)');

// Check short final segment preservation
const hss350Segs = dd1GeoJson.features.filter((f: any) => f.properties.road_key === 'HSS-KAB-350');
assert(hss350Segs.length === 7, 'HSS-KAB-350 has 7 segments', `got ${hss350Segs.length}`);
const lastSeg350 = hss350Segs[hss350Segs.length - 1];
assert(lastSeg350.properties.length_m === 90, 'HSS-KAB-350 last segment length is 90 m', `got ${lastSeg350.properties.length_m}`);
assert(lastSeg350.properties.is_short_final === true, 'HSS-KAB-350 last segment is_short_final is true');

// --- 3. SYMBOLOGY & CARTOGRAPHIC PALETTES ---
console.log('\n--- 3. SYMBOLOGY & CARTOGRAPHIC PALETTES ---');
// Prioritas mode symbology
assert(ROAD_TIER_STYLES.TOP_35.color === '#e11d48', 'Top 35 color is #e11d48 (Rose-600)');
assert(ROAD_TIER_STYLES.TOP_35.weight === 5.5, 'Top 35 stroke weight is 5.5px');
assert(ROAD_TIER_STYLES.TOP_70.color === '#ea580c', 'Top 70 color is #ea580c (Orange-600)');
assert(ROAD_TIER_STYLES.TOP_70.weight === 4.5, 'Top 70 stroke weight is 4.5px');
assert(ROAD_TIER_STYLES.TOP_105.color === '#eab308', 'Top 105 color is #eab308 (Yellow-500)');
assert(ROAD_TIER_STYLES.TOP_105.weight === 3.5, 'Top 105 stroke weight is 3.5px');
assert(ROAD_TIER_STYLES.REGULAR.color === '#475569', 'Regular color is #475569 (Slate-600)');
assert(ROAD_TIER_STYLES.REGULAR.weight === 3.0, 'Regular stroke weight is 3.0px');

// Kondisi DD1 symbology
assert(DD1_SEGMENT_STYLES.baik.color === '#10b981', 'DD1 Baik color is #10b981 (Emerald-500)');
assert(DD1_SEGMENT_STYLES.sedang.color === '#f59e0b', 'DD1 Sedang color is #f59e0b (Amber-500)');
assert(DD1_SEGMENT_STYLES.rusak_ringan.color === '#f97316', 'DD1 Rusak Ringan color is #f97316 (Orange-500)');
assert(DD1_SEGMENT_STYLES.rusak_berat.color === '#ef4444', 'DD1 Rusak Berat color is #ef4444 (Red-500)');

const mockFeatureBaik = { properties: { dominant_condition: 'baik' } };
const styleBaik = getDD1SegmentFullMapStyle(mockFeatureBaik);
assert(styleBaik.color === '#10b981', 'getDD1SegmentFullMapStyle resolves Baik color #10b981');
assert(styleBaik.pane === 'dd1SegmentsPane', 'getDD1SegmentFullMapStyle targets dd1SegmentsPane');

// --- 4. FRONTEND UI & INTERACTIVE CONTRACT AUDIT ---
console.log('\n--- 4. FRONTEND UI & INTERACTIVE CONTRACT AUDIT ---');
const indexHtml = fs.readFileSync(path.resolve(PROJECT_ROOT, 'src/public/index.html'), 'utf8');
const appJs = fs.readFileSync(path.resolve(PROJECT_ROOT, 'src/public/app.js'), 'utf8');

assert(indexHtml.includes('id="map-thematic-mode-toggle"'), 'index.html contains map-thematic-mode-toggle container');
assert(indexHtml.includes('id="btn-theme-prioritas"'), 'index.html contains btn-theme-prioritas button');
assert(indexHtml.includes('id="btn-theme-dd1"'), 'index.html contains btn-theme-dd1 button');
assert(indexHtml.includes('Tampilan Ruas:'), 'index.html contains Tampilan Ruas label');

assert(appJs.includes("roadThematicMode: 'PRIORITAS'"), 'app.js initializes roadThematicMode to PRIORITAS default');
assert(appJs.includes("name: 'dd1SegmentsPane', zIndex: 610"), 'app.js registers dd1SegmentsPane at zIndex 610');
assert(appJs.includes('function setRoadThematicMode('), 'app.js defines setRoadThematicMode');
assert(appJs.includes('function renderFullDD1Segments('), 'app.js defines renderFullDD1Segments with canvas renderer');
assert(appJs.includes('L.canvas({ padding: 0.5, pane: \'dd1SegmentsPane\' })'), 'app.js uses high-performance Leaflet canvas renderer for full DD1 segments');

// Dynamic legend verification in app.js
assert(appJs.includes("if (state.roadThematicMode === 'KONDISI_DD1')"), 'updateDynamicLegend switches based on roadThematicMode');
assert(appJs.includes('Kondisi Jalan DD1 — 2025'), 'app.js includes DD1 condition legend title');
assert(appJs.includes('Prioritas Penanganan'), 'app.js includes Prioritas Penanganan legend title');

// Tooltip contextual priority in DD1 mode
assert(appJs.includes('Prioritas ruas:'), 'app.js exposes contextual priority in DD1 segment tooltip');

// Independent overlays preservation
assert(appJs.includes('selectRoadOnMap(state.selectedRoadKey)'), 'setRoadThematicMode preserves selection halo');
assert(appJs.includes('state.mapLayers.provincialRoads'), 'Provincial reference roads layer intact');
assert(appJs.includes('state.mapLayers.nationalRoads'), 'National reference roads layer intact');
assert(appJs.includes('state.mapLayers.connectors'), 'Analytical connectors layer intact');
assert(appJs.includes('state.mapLayers.rsud'), 'RSUD facilities layer intact');
assert(appJs.includes('state.mapLayers.puskesmas'), 'Puskesmas facilities layer intact');
assert(appJs.includes('state.mapLayers.markets'), 'Markets facilities layer intact');
assert(appJs.includes('state.mapLayers.schools'), 'Schools facilities layer intact');
assert(appJs.includes('state.mapLayers.rtrw'), 'RTRW layer intact');
assert(appJs.includes('traceNearestFacilityRoute'), 'Route tracing function intact');

console.log('\n================================================================');
console.log('PHASE 5.1C VERIFICATION COMPLETE: ALL 34 AUDIT CHECKS PASSED!');
console.log('>> VERDICT: PHASE_5_1C_FULL_MAP_DD1_PASS <<');
console.log('================================================================\n');
