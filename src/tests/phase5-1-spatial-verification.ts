import { getDatabase, closeDatabase } from '../db/connection.ts';
import { SpatialDerivationService } from '../services/spatialDerivationService.ts';
import { ScoringService } from '../services/scoringService.ts';
import { SimulationService } from '../services/simulationService.ts';
import { ROAD_TIER_STYLES } from '../public/mapStyle.js';
import { AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { rankRoads } from '../engine/scoringEngine.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failCount++;
  }
}

async function runPhase51Verification() {
  console.log('================================================================');
  console.log('STARTING PHASE 5.1 SPATIAL DERIVATION & ACCESSIBILITY VERIFICATION');
  console.log('================================================================\n');

  const db = getDatabase();
  const derivationService = new SpatialDerivationService(db);
  const scoringService = new ScoringService(db);
  const simulationService = new SimulationService(db);

  // --- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---
  console.log('--- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---');
  const modelConfig = scoringService.loadModelConfig('POLICY_DEFAULT_V1');
  const featureVectors = scoringService.loadRoadFeatureVectors('OPERATIONAL_2025');
  const scoredRoads = rankRoads(featureVectors, modelConfig);
  assert(scoredRoads.length === AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT, 'Canonical roads count must equal 350', `got ${scoredRoads.length}`);

  const rank1 = scoredRoads.find((r) => r.priority_rank === 1);
  assert(rank1?.road_key === 'HSS-KAB-025', 'Mandatory rank #1 is HSS-KAB-025', `got ${rank1?.road_key}`);

  const rank12 = scoredRoads.find((r) => r.priority_rank === 12);
  assert(rank12?.road_key === 'HSS-KAB-001', 'Mandatory rank #12 is HSS-KAB-001', `got ${rank12?.road_key}`);

  const rank133 = scoredRoads.find((r) => r.priority_rank === 133);
  assert(rank133?.road_key === 'HSS-KAB-295', 'Mandatory rank #133 is HSS-KAB-295', `got ${rank133?.road_key}`);

  const rank169 = scoredRoads.find((r) => r.priority_rank === 169);
  assert(rank169?.road_key === 'HSS-KAB-350', 'Mandatory rank #169 is HSS-KAB-350', `got ${rank169?.road_key}`);

  const rank245 = scoredRoads.find((r) => r.priority_rank === 245);
  assert(rank245?.road_key === 'HSS-KAB-013', 'Mandatory rank #245 is HSS-KAB-013', `got ${rank245?.road_key}`);

  const top35 = scoredRoads.filter((r) => r.tier_category === 'TOP_35').length;
  const top70 = scoredRoads.filter((r) => r.tier_category === 'TOP_70').length;
  const top105 = scoredRoads.filter((r) => r.tier_category === 'TOP_105').length;
  const regular = scoredRoads.filter((r) => r.tier_category === 'REGULAR').length;
  assert(top35 === 35 && top70 === 35 && top105 === 35 && regular === 245, 'Tier partition remains exact {35, 35, 35, 245}', `got {${top35}, ${top70}, ${top105}, ${regular}}`);

  // Phase 5 Reset Test
  const simContext = simulationService.getSimulationContext('OPERATIONAL_2025');
  const simResult = simulationService.calculateSimulation(
    simContext.baselineConfig,
    'OPERATIONAL_2025'
  );
  assert(
    simResult.summary.moved_up_count === 0 &&
      simResult.summary.moved_down_count === 0 &&
      simResult.summary.unchanged_count === 350 &&
      simResult.summary.tier_changed_count === 0,
    'Phase 5 reset simulation produces zero movement across all 350 roads'
  );

  // --- 2. ROAD ↔ VILLAGE SPATIAL DERIVATION ---
  console.log('\n--- 2. ROAD ↔ VILLAGE SPATIAL DERIVATION ---');
  const vStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_village_intersections');
  const vCount = (vStmt.get() as any).cnt;
  assert(vCount === 691, 'Total road-village intersection rows equals 691', `got ${vCount}`);

  // Test roads crossing > 2 villages
  const multiVillageStmt = db.prepare(`
    SELECT road_key, COUNT(village_id) as v_cnt
    FROM road_village_intersections
    GROUP BY road_key
    HAVING v_cnt >= 4
  `);
  const roadsCrossing4Plus = multiVillageStmt.all() as any[];
  assert(roadsCrossing4Plus.length >= 30, 'At least 30 roads cross 4 or more villages', `got ${roadsCrossing4Plus.length}`);

  // Point-only touch rule: all recorded intersections have positive length
  const zeroLenStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_village_intersections WHERE intersection_length_m <= 0');
  const zeroLenCount = (zeroLenStmt.get() as any).cnt;
  assert(zeroLenCount === 0, 'Zero-length point-only touches rejected (all intersection lengths > 0)', `got ${zeroLenCount}`);

  // Ambiguous boundary cases identified
  const ambStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_village_intersections WHERE is_boundary_ambiguous = 1');
  const ambCount = (ambStmt.get() as any).cnt;
  assert(ambCount > 0, 'Administrative boundary ambiguous cases identified (< 15m)', `got ${ambCount}`);

  // Test coverage query method
  const roadCoverage = derivationService.getRoadCoverage('HSS-KAB-001');
  assert(roadCoverage.road_key === 'HSS-KAB-001', 'getRoadCoverage returns valid road_key');
  assert(roadCoverage.village_count >= 2, 'HSS-KAB-001 crosses multiple villages (Baluti & Kandangan Kota)', `got ${roadCoverage.village_count}`);
  assert(roadCoverage.district_count === 1, 'HSS-KAB-001 district count is 1 (Kandangan)', `got ${roadCoverage.district_count}`);

  // --- 3. ROAD ↔ DISTRICT SPATIAL DERIVATION ---
  console.log('\n--- 3. ROAD ↔ DISTRICT SPATIAL DERIVATION ---');
  const dStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_district_intersections');
  const dCount = (dStmt.get() as any).cnt;
  assert(dCount === 410, 'Total road-district intersection rows equals 410', `got ${dCount}`);

  const multiDistStmt = db.prepare(`
    SELECT road_key, COUNT(district_id) as d_cnt
    FROM road_district_intersections
    GROUP BY road_key
    HAVING d_cnt > 1
  `);
  const multiDistRoads = multiDistStmt.all() as any[];
  assert(multiDistRoads.length === 57, 'Exactly 57 roads traverse across multiple districts (54 cross 2, 3 cross 3)', `got ${multiDistRoads.length}`);

  // --- 4. NETWORK GRAPH TOPOLOGY & AUDIT ---
  console.log('\n--- 4. NETWORK GRAPH TOPOLOGY & AUDIT ---');
  const netStats = derivationService.getNetworkStats();
  assert(netStats.featureCount === 366, 'Network features count must equal 366', `got ${netStats.featureCount}`);
  assert(netStats.countyCount === 350, 'County roads in network equals 350', `got ${netStats.countyCount}`);
  assert(netStats.provincialCount === 4, 'Provincial roads in network equals 4', `got ${netStats.provincialCount}`);
  assert(netStats.nationalCount === 8, 'National roads in network equals 8', `got ${netStats.nationalCount}`);
  assert(netStats.connectorCount === 4, 'Synthetic connectors in network equals 4', `got ${netStats.connectorCount}`);
  assert(netStats.nodeCount === 27077, 'Network graph node count equals 27077', `got ${netStats.nodeCount}`);
  assert(netStats.edgeCount === 27285, 'Network graph undirected edge count equals 27285', `got ${netStats.edgeCount}`);
  assert(netStats.connectedComponentsCount === 6, 'Network has exactly 6 connected components', `got ${netStats.connectedComponentsCount}`);
  assert(netStats.largestComponentPct > 90.0, 'Main connected component covers > 90% of network', `got ${netStats.largestComponentPct.toFixed(1)}%`);
  assert(netStats.networkHash.length === 16, 'Network hash is reproducible 16-char hex', `got ${netStats.networkHash}`);
  assert(netStats.isolatedRoads.length === 7, 'Identified 7 isolated roads in minor components', `got ${netStats.isolatedRoads.length}`);

  // --- 5. FACILITY SNAPPING INTEGRITY ---
  console.log('\n--- 5. FACILITY SNAPPING INTEGRITY ---');
  const snapStmt = db.prepare('SELECT COUNT(*) as cnt FROM facility_network_snaps');
  const snapCount = (snapStmt.get() as any).cnt;
  assert(snapCount === 285, 'Total snapped public facilities equals 285', `got ${snapCount}`);

  const suspiciousStmt = db.prepare('SELECT COUNT(*) as cnt FROM facility_network_snaps WHERE is_suspicious = 1');
  const suspiciousCount = (suspiciousStmt.get() as any).cnt;
  assert(suspiciousCount === 3, 'Exactly 3 facilities flagged with suspicious snap distance (> 500m)', `got ${suspiciousCount}`);

  // Verify coordinates exist and are non-zero
  const validCoordStmt = db.prepare('SELECT COUNT(*) as cnt FROM facility_network_snaps WHERE snapped_lat != 0 AND snapped_lng != 0');
  const validCoordCount = (validCoordStmt.get() as any).cnt;
  assert(validCoordCount === 285, 'All 285 facilities have valid snapped coordinates', `got ${validCoordCount}`);

  // --- 6. NEAREST-FACILITY ROUTING & RECALCULATION ---
  console.log('\n--- 6. NEAREST-FACILITY ROUTING & RECALCULATION ---');
  const rnfStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_nearest_facilities');
  const rnfCount = (rnfStmt.get() as any).cnt;
  assert(rnfCount === 1400, 'Total road_nearest_facilities equals 1400 (350 roads * 4 categories)', `got ${rnfCount}`);

  // Check categories
  for (const cat of ['hospital', 'puskesmas', 'school', 'market']) {
    const cStmt = db.prepare('SELECT COUNT(*) as cnt FROM road_nearest_facilities WHERE facility_type = ?');
    const cCnt = (cStmt.get(cat) as any).cnt;
    assert(cCnt === 350, `Category '${cat}' evaluated for all 350 roads`);
  }

  // Check resolved vs unresolved counts
  const unresHosp = db.prepare("SELECT COUNT(*) as cnt FROM road_nearest_facilities WHERE facility_type = 'hospital' AND network_distance_m < 0").get() as any;
  assert(unresHosp.cnt === 7, 'RSUD unresolved roads equals 7 (minor disconnected components without hospitals)', `got ${unresHosp.cnt}`);

  const unresSchool = db.prepare("SELECT COUNT(*) as cnt FROM road_nearest_facilities WHERE facility_type = 'school' AND network_distance_m < 0").get() as any;
  assert(unresSchool.cnt === 0, 'School unresolved roads equals 0 (all 350 roads reach a school)', `got ${unresSchool.cnt}`);

  // Check route geometry validity
  const sampleNearest = derivationService.getRoadNearestFacilities('HSS-KAB-025');
  assert(sampleNearest.length === 4, 'HSS-KAB-025 returns 4 nearest facility records', `got ${sampleNearest.length}`);
  const puskesmasNear = sampleNearest.find((f) => f.facility_type === 'puskesmas');
  assert(puskesmasNear !== undefined, 'HSS-KAB-025 has nearest puskesmas');
  const routeGeom = JSON.parse(puskesmasNear!.route_geometry_geojson);
  assert(routeGeom.type === 'LineString', 'Route geometry is valid GeoJSON LineString');
  assert(routeGeom.coordinates.length >= 2, 'Route line has at least 2 vertices', `got ${routeGeom.coordinates.length}`);

  // Automatic Recalculation Test
  const recalcRes = derivationService.recalculateFacilityDistances('puskesmas');
  assert(recalcRes.puskesmas.evaluated === 350, 'recalculateFacilityDistances evaluates all 350 roads');
  assert(recalcRes.puskesmas.resolved === 348, 'recalculateFacilityDistances resolves 348 roads for puskesmas');

  // --- 7. CARTOGRAPHY & CONTRACT SCHEMAS ---
  console.log('\n--- 7. CARTOGRAPHY & CONTRACT SCHEMAS ---');
  assert(ROAD_TIER_STYLES.REGULAR.color === '#475569', 'Regular road stroke color is #475569 (slate-600)');
  assert(ROAD_TIER_STYLES.REGULAR.weight === 3.0, 'Regular road stroke weight is 3.0px');
  assert(ROAD_TIER_STYLES.REGULAR.opacity === 0.90, 'Regular road stroke opacity is 0.90');
  assert(ROAD_TIER_STYLES.REGULAR.label === 'Ruas Kabupaten Lainnya / Di Luar Prioritas Utama', 'Regular road label is exact semantic label');

  // Demographic Contract Check
  const demoTable = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='village_demographics'").get() as any;
  assert(demoTable.cnt === 1, 'Table village_demographics exists in schema');
  const demoRows = db.prepare('SELECT COUNT(*) as cnt FROM village_demographics').get() as any;
  assert(demoRows.cnt === 0, 'Zero fabricated demographic rows in village_demographics (strictly DATA_REQUIRED)');

  // Treatment Engine Contract Check
  const treatTable = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='treatment_engine_segments'").get() as any;
  assert(treatTable.cnt === 1, 'Table treatment_engine_segments exists in schema');
  const treatRows = db.prepare('SELECT COUNT(*) as cnt FROM treatment_engine_segments').get() as any;
  assert(treatRows.cnt === 0, 'Zero fabricated Treatment Engine segment rows (strictly DATA_REQUIRED)');

  // Reconciliation data check
  const reconciliation = derivationService.getDistanceReconciliation();
  assert(reconciliation.length === 350, 'Distance reconciliation covers all 350 canonical roads', `got ${reconciliation.length}`);
  assert(reconciliation[0].status_ibukota === 'DATA_REQUIRED_NO_OFFICIAL_COORDINATE', 'Ibukota Kabupaten status is DATA_REQUIRED_NO_OFFICIAL_COORDINATE');

  console.log('\n================================================================');
  console.log(`PHASE 5.1 VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  closeDatabase();

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase51Verification().catch((err) => {
  console.error('Fatal verification test error:', err);
  process.exit(1);
});
