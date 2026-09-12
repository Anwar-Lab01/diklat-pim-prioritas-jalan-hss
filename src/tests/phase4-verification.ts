import fs from 'fs';
import path from 'path';
import { SpatialService } from '../services/spatialService.ts';
import { ROAD_TIER_STYLES, SELECTION_HALO_STYLE, REFERENCE_NETWORK_STYLES } from '../public/mapStyle.js';

// Test assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`TEST FAILED: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

function extractCoordinates(geom: any): number[][] {
  if (!geom) return [];
  if (geom.type === 'Point') return [geom.coordinates];
  if (geom.type === 'LineString') return geom.coordinates;
  if (geom.type === 'MultiLineString' || geom.type === 'Polygon') return geom.coordinates.flat(1);
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
  if (geom.type === 'GeometryCollection') {
    return geom.geometries.flatMap((g: any) => extractCoordinates(g));
  }
  return [];
}

async function runPhase4Verification() {
  console.log('================================================================');
  console.log('STARTING PHASE 4 WEB GIS AUTOMATED VERIFICATION SUITE');
  console.log('================================================================\n');

  const spatialService = new SpatialService();
  let totalTests = 0;

  // --- TEST GROUP 1: COUNTY ROADS GEOMETRY & IDENTITY INTEGRITY ---
  console.log('--- 1. COUNTY ROADS GEOMETRY & IDENTITY INTEGRITY ---');
  const roadsGeoJson = spatialService.getCountyRoadsWithScores('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

  assert(
    roadsGeoJson.type === 'FeatureCollection',
    'County roads GeoJSON must be a valid FeatureCollection'
  );
  totalTests++;

  assert(
    roadsGeoJson.features.length === 350,
    `County roads count must be exactly 350 (Actual: ${roadsGeoJson.features.length})`
  );
  totalTests++;

  const roadKeys = new Set<string>();
  const roadNumbers = new Set<string>();
  let validGeometries = 0;
  let wgs84CoordsValid = 0;

  for (const f of roadsGeoJson.features) {
    const p = f.properties;
    roadKeys.add(p.road_key);
    roadNumbers.add(p.nomor_ruas);

    // Geometry type check (349 MultiLineString, 1 GeometryCollection)
    if (
      f.geometry &&
      (f.geometry.type === 'LineString' ||
        f.geometry.type === 'MultiLineString' ||
        f.geometry.type === 'GeometryCollection')
    ) {
      validGeometries++;
    }

    // Coordinate range check (HSS region roughly lng [114.5, 115.8], lat [-3.2, -2.2])
    const coords = extractCoordinates(f.geometry);
    const allInBounds = coords.every(
      ([lng, lat]) => lng >= 114.5 && lng <= 115.8 && lat >= -3.2 && lat <= -2.2
    );
    if (allInBounds && coords.length > 0) {
      wgs84CoordsValid++;
    }
  }

  assert(roadKeys.size === 350, 'All 350 roads must have unique road_keys');
  totalTests++;

  assert(roadNumbers.size === 350, 'All 350 roads must have unique nomor_ruas');
  totalTests++;

  assert(
    validGeometries === 350,
    'All 350 roads must have valid MultiLineString or GeometryCollection geometries'
  );
  totalTests++;

  assert(
    wgs84CoordsValid === 350,
    'All 350 roads must have valid WGS84 coordinates within Hulu Sungai Selatan boundary'
  );
  totalTests++;

  // --- TEST GROUP 2: DETERMINISTIC PRIORITY RANKING & MODE ISOLATION ---
  console.log('\n--- 2. DETERMINISTIC PRIORITY RANKING & MODE ISOLATION ---');

  // Check Operational 2025 results
  const topRoad = roadsGeoJson.features.find((f) => f.properties.priority_rank === 1);
  assert(
    topRoad?.properties.road_key === 'HSS-KAB-025',
    `Operational Rank #1 must be HSS-KAB-025 (Singakarsa - Palas) (Actual: ${topRoad?.properties.road_key})`
  );
  totalTests++;

  assert(
    Math.abs((topRoad?.properties.final_score || 0) - 0.649945) < 0.0001,
    `Operational Rank #1 score must be ~0.649945 (Actual: ${topRoad?.properties.final_score})`
  );
  totalTests++;

  // Verified Reconciled Fact: HSS-KAB-001 is Rank #12, Score ~0.529610, Tier TOP_35 in OPERATIONAL_2025
  const road001 = roadsGeoJson.features.find((f) => f.properties.road_key === 'HSS-KAB-001');
  assert(
    road001?.properties.priority_rank === 12,
    `Operational HSS-KAB-001 must be Rank #12 (Actual: ${road001?.properties.priority_rank})`
  );
  totalTests++;

  assert(
    Math.abs((road001?.properties.final_score || 0) - 0.529610) < 0.0001,
    `Operational HSS-KAB-001 score must be ~0.529610 (Actual: ${road001?.properties.final_score})`
  );
  totalTests++;

  assert(
    road001?.properties.tier_category === 'TOP_35',
    `Operational HSS-KAB-001 tier must be TOP_35 (Actual: ${road001?.properties.tier_category})`
  );
  totalTests++;

  // Tier counts
  const top35Count = roadsGeoJson.features.filter((f) => f.properties.tier_category === 'TOP_35').length;
  const top70Count = roadsGeoJson.features.filter((f) => f.properties.tier_category === 'TOP_70').length;
  const top105Count = roadsGeoJson.features.filter((f) => f.properties.tier_category === 'TOP_105').length;
  const regularCount = roadsGeoJson.features.filter((f) => f.properties.tier_category === 'REGULAR').length;

  assert(top35Count === 35, `Tier TOP_35 must contain exactly 35 roads (Actual: ${top35Count})`);
  totalTests++;

  assert(top70Count === 35, `Tier TOP_70 must contain exactly 35 roads (Actual: ${top70Count})`);
  totalTests++;

  assert(top105Count === 35, `Tier TOP_105 must contain exactly 35 roads (Actual: ${top105Count})`);
  totalTests++;

  assert(regularCount === 245, `Tier REGULAR must contain exactly 245 roads (Actual: ${regularCount})`);
  totalTests++;

  assert(
    top35Count + top70Count + top105Count + regularCount === 350,
    'Sum of all tier counts must equal 350'
  );
  totalTests++;

  // Check Benchmark 2024 results mode isolation
  const benchmarkGeoJson = spatialService.getCountyRoadsWithScores('BENCHMARK_2024', 'POLICY_DEFAULT_V1');
  const benchmarkTopRoad = benchmarkGeoJson.features.find((f) => f.properties.priority_rank === 1);
  const benchmarkRoad001 = benchmarkGeoJson.features.find((f) => f.properties.road_key === 'HSS-KAB-001');

  assert(
    benchmarkTopRoad?.properties.road_key === 'HSS-KAB-025',
    `Benchmark Rank #1 is HSS-KAB-025 (Singakarsa - Palas) (Actual: ${benchmarkTopRoad?.properties.road_key})`
  );
  totalTests++;

  assert(
    Math.abs((benchmarkTopRoad?.properties.final_score || 0) - 0.655033) < 0.0001,
    `Benchmark Rank #1 score reflects 2024 condition differences (~0.655033 vs ~0.649945) (Actual: ${benchmarkTopRoad?.properties.final_score})`
  );
  totalTests++;

  assert(
    benchmarkRoad001?.properties.priority_rank === 13,
    `Benchmark HSS-KAB-001 must be Rank #13 (Actual: ${benchmarkRoad001?.properties.priority_rank})`
  );
  totalTests++;

  assert(
    benchmarkGeoJson.properties.run_id !== roadsGeoJson.properties.run_id,
    'Benchmark run_id is strictly isolated from Operational run_id'
  );
  totalTests++;

  // --- TEST GROUP 3: REFERENCE TRANSPORT NETWORK & CONNECTOR SAFETY ---
  console.log('\n--- 3. REFERENCE TRANSPORT NETWORK & CONNECTOR SAFETY ---');
  const refGeoJson = spatialService.getReferenceNetworkGeoJson();

  assert(
    refGeoJson.features.length === 16,
    `Reference network must contain exactly 16 features (Actual: ${refGeoJson.features.length})`
  );
  totalTests++;

  const provFeatures = refGeoJson.features.filter((f) => f.properties.network_class === 'PROVINSI');
  const natFeatures = refGeoJson.features.filter((f) => f.properties.network_class === 'NASIONAL');
  const connFeatures = refGeoJson.features.filter((f) => f.properties.network_class === 'KONEKTOR_ANALISIS');

  assert(provFeatures.length === 4, `Provincial roads count must be 4 (Actual: ${provFeatures.length})`);
  totalTests++;

  assert(natFeatures.length === 8, `National roads count must be 8 (Actual: ${natFeatures.length})`);
  totalTests++;

  assert(connFeatures.length === 4, `Analytical connectors count must be 4 (Actual: ${connFeatures.length})`);
  totalTests++;

  // CONNECTOR SAFETY AUDIT: Non-prioritas, no scores, no rank, no tier
  for (const c of connFeatures) {
    assert(
      c.properties.final_score === undefined &&
        c.properties.priority_rank === undefined &&
        c.properties.tier_category === undefined,
      `Connector ${c.properties.connector_name} must NOT have score, rank, or tier`
    );
    totalTests++;

    assert(
      !c.properties.network_label.toLowerCase().includes('jembatan fisik'),
      `Connector ${c.properties.connector_name} must not be labeled as physical bridge`
    );
    totalTests++;
  }

  // --- TEST GROUP 4: PUBLIC FACILITIES INVENTORY (285 POINTS) ---
  console.log('\n--- 4. PUBLIC FACILITIES INVENTORY (285 POINTS) ---');
  const facGeoJson = spatialService.getPublicFacilitiesGeoJson();

  assert(
    facGeoJson.features.length === 285,
    `Total public facilities must be exactly 285 (Actual: ${facGeoJson.features.length})`
  );
  totalTests++;

  const rsudCount = facGeoJson.features.filter((f) => f.properties.facility_type === 'hospital').length;
  const puskesmasCount = facGeoJson.features.filter((f) => f.properties.facility_type === 'puskesmas').length;
  const schoolCount = facGeoJson.features.filter((f) => f.properties.facility_type === 'school').length;
  const marketCount = facGeoJson.features.filter((f) => f.properties.facility_type === 'market').length;

  assert(rsudCount === 2, `RSUD count must be exactly 2 (Actual: ${rsudCount})`);
  totalTests++;

  assert(puskesmasCount === 21, `Puskesmas count must be exactly 21 (Actual: ${puskesmasCount})`);
  totalTests++;

  assert(schoolCount === 251, `School count must be exactly 251 (Actual: ${schoolCount})`);
  totalTests++;

  assert(marketCount === 11, `Market count must be exactly 11 (Actual: ${marketCount})`);
  totalTests++;

  assert(
    rsudCount + puskesmasCount + schoolCount + marketCount === 285,
    'Sum of facility categories must equal 285'
  );
  totalTests++;

  // Points geometry check
  const allPoints = facGeoJson.features.every((f) => f.geometry && f.geometry.type === 'Point');
  assert(allPoints, 'All 285 facilities must have Point geometry');
  totalTests++;

  // --- TEST GROUP 5: ADMINISTRATIVE BOUNDARIES ---
  console.log('\n--- 5. ADMINISTRATIVE BOUNDARIES ---');
  const districtsGeoJson = spatialService.getDistrictsGeoJson();
  const villagesGeoJson = spatialService.getVillagesGeoJson();

  assert(
    districtsGeoJson.features.length === 11,
    `Districts count must be exactly 11 (Actual: ${districtsGeoJson.features.length})`
  );
  totalTests++;

  assert(
    villagesGeoJson.features.length === 148,
    `Villages count must be exactly 148 (Actual: ${villagesGeoJson.features.length})`
  );
  totalTests++;

  const districtPolygons = districtsGeoJson.features.every(
    (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
  );
  assert(districtPolygons, 'All 11 districts must have Polygon or MultiPolygon geometries');
  totalTests++;

  const villagePolygons = villagesGeoJson.features.every(
    (f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
  );
  assert(villagePolygons, 'All 148 villages must have Polygon or MultiPolygon geometries');
  totalTests++;

  // --- TEST GROUP 6: RTRW SPATIAL PATTERN OVERLAY ---
  console.log('\n--- 6. RTRW SPATIAL PATTERN OVERLAY ---');
  const rtrwCategories = spatialService.getRtrwCategories();
  assert(
    rtrwCategories.length === 12,
    `RTRW Pola Ruang must have exactly 12 categories (Actual: ${rtrwCategories.length})`
  );
  totalTests++;

  const rtrwGeoJson = spatialService.getRtrwGeoJson();
  assert(
    rtrwGeoJson.features.length > 0,
    `RTRW Pola Ruang GeoJSON must contain features (Actual: ${rtrwGeoJson.features.length})`
  );
  totalTests++;

  // --- TEST GROUP 7: SYMBOLOGY & PRESENTATION CONTRACTS ---
  console.log('\n--- 7. SYMBOLOGY & PRESENTATION CONTRACTS ---');
  assert(
    ROAD_TIER_STYLES.TOP_35.color === '#e11d48',
    'TOP_35 style color must be #e11d48 (Rose-600)'
  );
  totalTests++;

  assert(
    ROAD_TIER_STYLES.TOP_70.color === '#ea580c',
    'TOP_70 style color must be #ea580c (Orange-600)'
  );
  totalTests++;

  assert(
    ROAD_TIER_STYLES.TOP_105.color === '#eab308',
    'TOP_105 style color must be #eab308 (Amber-500)'
  );
  totalTests++;

  assert(
    ROAD_TIER_STYLES.REGULAR.color === '#64748b',
    'REGULAR style color must be #64748b (Slate-500)'
  );
  totalTests++;

  assert(
    SELECTION_HALO_STYLE.color === '#06b6d4' && SELECTION_HALO_STYLE.weight >= 10,
    'Selection halo must use Cyan (#06b6d4) with weight >= 10'
  );
  totalTests++;

  assert(
    REFERENCE_NETWORK_STYLES.KONEKTOR_ANALISIS.dashArray === '5, 5',
    'Connector style must use dashed line (5, 5)'
  );
  totalTests++;

  // --- TEST GROUP 8: OFFLINE-FIRST & VENDORED ASSETS ---
  console.log('\n--- 8. OFFLINE-FIRST & VENDORED ASSETS ---');
  const leafletCssPath = path.resolve('src/public/vendor/leaflet/leaflet.css');
  const leafletJsPath = path.resolve('src/public/vendor/leaflet/leaflet.js');

  assert(fs.existsSync(leafletCssPath), 'Leaflet CSS must be vendored locally in src/public/vendor/leaflet/');
  totalTests++;

  assert(fs.existsSync(leafletJsPath), 'Leaflet JS must be vendored locally in src/public/vendor/leaflet/');
  totalTests++;

  console.log('\n================================================================');
  console.log(`PHASE 4 VERIFICATION COMPLETE: ALL ${totalTests} / ${totalTests} TESTS PASSED!`);
  console.log('================================================================\n');
}

runPhase4Verification().catch((err) => {
  console.error('\nFATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
