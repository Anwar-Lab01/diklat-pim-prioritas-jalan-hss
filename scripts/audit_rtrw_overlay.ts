import fs from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { PROJECT_ROOT, SEED_FILES } from '../src/config/constants.ts';

const macroMap: Record<string, string> = {
  'Kawasan Permukiman Perdesaan': 'PERMUKIMAN',
  'Kawasan Permukiman Perkotaan': 'PERMUKIMAN',
  'Kawasan Perkebunan': 'PRODUKSI',
  'Kawasan Tanaman Pangan': 'PRODUKSI',
  'Kawasan Hutan Produksi Tetap': 'PRODUKSI',
  'Kawasan Hutan Produksi yang dapat Dikonversi': 'PRODUKSI',
  'Kawasan Perikanan Budi Daya': 'PRODUKSI',
  'Kawasan Hutan Lindung': 'LINDUNG',
  'Kawasan Lindung Gambut': 'LINDUNG',
  'Cagar Alam': 'LINDUNG',
  'Badan Air': 'BADAN_AIR',
  'Kawasan Pariwisata': 'PARIWISATA',
  'Area Tidak Tercakup': 'TIDAK_TERCAKUP',
};

console.time('Load datasets');
const rtrw = JSON.parse(fs.readFileSync(SEED_FILES.rtrwPolaRuangGeoJson, 'utf8'));
const roads = JSON.parse(fs.readFileSync(SEED_FILES.roadsCountyGeoJson, 'utf8'));
console.timeEnd('Load datasets');

console.time('Index RTRW');
const GRID_SIZE = 0.02; // ~2.2 km grid cell
const grid = new Map<string, any[]>();
function getCellKeys(bbox: number[]) {
  const minX = Math.floor(bbox[0] / GRID_SIZE);
  const maxX = Math.floor(bbox[2] / GRID_SIZE);
  const minY = Math.floor(bbox[1] / GRID_SIZE);
  const maxY = Math.floor(bbox[3] / GRID_SIZE);
  const keys: string[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      keys.push(x + ':' + y);
    }
  }
  return keys;
}

const rtrwFeatures = rtrw.features.map((f: any, i: number) => {
  const bbox = turf.bbox(f);
  const item = { id: i, feature: f, name: f.properties.nama_objek, bbox };
  const keys = getCellKeys(bbox);
  for (const k of keys) {
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(item);
  }
  return item;
});
console.timeEnd('Index RTRW');

console.time('Overlay 350 roads');
let totalNetworkM = 0;
const networkMacroM: Record<string, number> = {
  PERMUKIMAN: 0,
  PRODUKSI: 0,
  LINDUNG: 0,
  BADAN_AIR: 0,
  PARIWISATA: 0,
  TIDAK_TERCAKUP: 0,
};
const networkDetailM: Record<string, number> = {};
const perRoadSummary: Record<string, any> = {};

for (const road of roads.features) {
  const roadKey = road.properties.road_key;
  const geom = road.geometry;
  const multiCoords =
    geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
  const classMeters: Record<string, number> = {};
  const macroMeters: Record<string, number> = {
    PERMUKIMAN: 0,
    PRODUKSI: 0,
    LINDUNG: 0,
    BADAN_AIR: 0,
    PARIWISATA: 0,
    TIDAK_TERCAKUP: 0,
  };
  let roadTotalM = 0;

  for (const lineCoords of multiCoords) {
    if (!lineCoords || lineCoords.length < 2) continue;
    const line = turf.lineString(lineCoords);
    const lenKm = turf.length(line, { units: 'kilometers' });
    const lenM = lenKm * 1000;
    const numSteps = Math.max(2, Math.ceil(lenM / 15)); // 15m sampling
    const stepLen = lenM / numSteps;

    for (let s = 0; s < numSteps; s++) {
      const dKm = ((s + 0.5) / numSteps) * lenKm;
      const pt = turf.along(line, dKm);
      const coords = pt.geometry.coordinates;
      const cellKey = Math.floor(coords[0] / GRID_SIZE) + ':' + Math.floor(coords[1] / GRID_SIZE);
      const cellCandidates = grid.get(cellKey) || [];

      let matchedName = 'Area Tidak Tercakup';
      for (const c of cellCandidates) {
        if (coords[0] >= c.bbox[0] && coords[0] <= c.bbox[2] && coords[1] >= c.bbox[1] && coords[1] <= c.bbox[3]) {
          if (turf.booleanPointInPolygon(pt, c.feature)) {
            matchedName = c.name;
            break;
          }
        }
      }
      const macro = macroMap[matchedName] || 'TIDAK_TERCAKUP';
      networkMacroM[macro] = (networkMacroM[macro] || 0) + stepLen;
      networkDetailM[matchedName] = (networkDetailM[matchedName] || 0) + stepLen;
      classMeters[matchedName] = (classMeters[matchedName] || 0) + stepLen;
      macroMeters[macro] = (macroMeters[macro] || 0) + stepLen;
      roadTotalM += stepLen;
      totalNetworkM += stepLen;
    }
  }

  perRoadSummary[roadKey] = {
    total_length_m: roadTotalM,
    macro_meters: macroMeters,
    macro_pct: {
      PERMUKIMAN: roadTotalM > 0 ? (macroMeters.PERMUKIMAN / roadTotalM) * 100 : 0,
      PRODUKSI: roadTotalM > 0 ? (macroMeters.PRODUKSI / roadTotalM) * 100 : 0,
      LINDUNG: roadTotalM > 0 ? (macroMeters.LINDUNG / roadTotalM) * 100 : 0,
      BADAN_AIR: roadTotalM > 0 ? (macroMeters.BADAN_AIR / roadTotalM) * 100 : 0,
      PARIWISATA: roadTotalM > 0 ? (macroMeters.PARIWISATA / roadTotalM) * 100 : 0,
      TIDAK_TERCAKUP: roadTotalM > 0 ? (macroMeters.TIDAK_TERCAKUP / roadTotalM) * 100 : 0,
    },
    class_breakdown: Object.entries(classMeters).map(([name, m]) => ({
      name,
      macro: macroMap[name] || 'TIDAK_TERCAKUP',
      length_m: Math.round(m * 100) / 100,
      pct: roadTotalM > 0 ? Math.round((m / roadTotalM) * 10000) / 100 : 0,
    })),
  };
}
console.timeEnd('Overlay 350 roads');

console.log('\n=== NETWORK RTRW OVERLAY TOTALS ===');
console.log('Total Road Length Analyzed:', (totalNetworkM / 1000).toFixed(3), 'km');
for (const [macro, m] of Object.entries(networkMacroM)) {
  console.log(`  ${macro}: ${(m / 1000).toFixed(3)} km (${((m / totalNetworkM) * 100).toFixed(2)}%)`);
}
console.log('\n=== DETAIL RTRW CLASSES ===');
for (const [cls, m] of Object.entries(networkDetailM)) {
  console.log(`  ${cls}: ${(m / 1000).toFixed(3)} km (${((m / totalNetworkM) * 100).toFixed(2)}%)`);
}

// Sample inspection
console.log('\n=== SAMPLE HSS-KAB-001 ===', JSON.stringify(perRoadSummary['HSS-KAB-001'], null, 2));
console.log('\n=== SAMPLE HSS-KAB-025 ===', JSON.stringify(perRoadSummary['HSS-KAB-025'], null, 2));
