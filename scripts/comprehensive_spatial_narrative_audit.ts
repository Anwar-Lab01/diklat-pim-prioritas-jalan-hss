import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('================================================================');
console.log('PHASE A: COMPREHENSIVE SPATIAL DATA AUDIT FOR 350 ROADS');
console.log('================================================================');

// 1. Road Network & Road Geometry
const roadGeoms = db.prepare(`
  SELECT 
    r.road_key,
    r.nomor_ruas,
    r.canonical_name,
    r.district_name,
    r.length_km_official,
    r.width_m_official,
    g.geometry_length_m,
    g.geometry_geojson,
    g.centroid_lat,
    g.centroid_lng,
    g.crs_declared
  FROM roads r
  LEFT JOIN road_geometries g ON r.road_key = g.road_key
  ORDER BY r.road_key ASC
`).all() as any[];

console.log(`\n--- 1. ROAD NETWORK & GEOMETRY (Count: ${roadGeoms.length}) ---`);
let geomNullCount = 0;
let lengthDeltaCount = 0;
let maxDeltaPct = 0;
for (const r of roadGeoms) {
  if (!r.geometry_geojson) geomNullCount++;
  const geomKm = r.geometry_length_m ? r.geometry_length_m / 1000 : 0;
  const delta = Math.abs(geomKm - r.length_km_official);
  const deltaPct = r.length_km_official > 0 ? (delta / r.length_km_official) * 100 : 0;
  if (deltaPct > 20) lengthDeltaCount++;
  if (deltaPct > maxDeltaPct) maxDeltaPct = deltaPct;
}
console.log(`- Total canonical roads: ${roadGeoms.length}`);
console.log(`- Roads missing geometry: ${geomNullCount}`);
console.log(`- CRS declared: ${roadGeoms[0]?.crs_declared}`);
console.log(`- Roads with >20% delta between official and geometry length: ${lengthDeltaCount}`);
console.log(`- Max delta pct: ${maxDeltaPct.toFixed(2)}%`);

// 2. Administrative Coverage
console.log(`\n--- 2. ADMINISTRATIVE COVERAGE AUDIT ---`);
const villageIntersections = db.prepare(`
  SELECT 
    r.road_key,
    COUNT(rvi.village_id) as total_intersections,
    COUNT(DISTINCT rvi.village_id) as unique_villages,
    COUNT(DISTINCT rvi.district_id) as unique_districts,
    GROUP_CONCAT(DISTINCT rvi.village_name) as village_names,
    GROUP_CONCAT(DISTINCT rvi.district_name) as district_names
  FROM roads r
  LEFT JOIN road_village_intersections rvi ON r.road_key = rvi.road_key
  GROUP BY r.road_key
`).all() as any[];

let zeroVillageCount = 0;
let multiDistrictCount = 0;
for (const v of villageIntersections) {
  if (v.unique_villages === 0) zeroVillageCount++;
  if (v.unique_districts > 1) multiDistrictCount++;
}
console.log(`- Total roads audited for villages: ${villageIntersections.length}`);
console.log(`- Roads with 0 intersected villages: ${zeroVillageCount}`);
console.log(`- Roads traversing multiple districts: ${multiDistrictCount}`);

// 3. Demographic Information Audit
console.log(`\n--- 3. DEMOGRAPHIC INFORMATION AUDIT ---`);
const villageDemoRows = db.prepare(`
  SELECT 
    v.village_id,
    v.village_name,
    v.district_name,
    vd.year,
    vd.population,
    vd.households_total,
    vd.households_male,
    vd.households_female,
    vd.households_kk,
    vd.source,
    vd.source_reference
  FROM villages v
  LEFT JOIN village_demographics vd ON v.village_id = vd.village_id
`).all() as any[];

const demoPopNonNull = villageDemoRows.filter(r => r.population !== null && r.population > 0);
const demoHouseholdsNonNull = villageDemoRows.filter(r => r.households_total !== null && r.households_total > 0);

console.log(`- Total authoritative villages: ${villageDemoRows.length}`);
console.log(`- Villages with non-null population in village_demographics: ${demoPopNonNull.length}`);
console.log(`- Villages with households_total in village_demographics: ${demoHouseholdsNonNull.length}`);
console.log(`- Source reference: ${villageDemoRows[0]?.source} / ${villageDemoRows[0]?.source_reference} (Year: ${villageDemoRows[0]?.year})`);

// Check norm_penduduk_dilayani in road_variable_observations
const popObs = db.prepare(`
  SELECT 
    MIN(raw_value) as min_raw,
    MAX(raw_value) as max_raw,
    AVG(raw_value) as avg_raw,
    COUNT(*) as total_obs,
    COUNT(CASE WHEN raw_value > 0 THEN 1 END) as positive_obs
  FROM road_variable_observations
  WHERE variable_code = 'norm_penduduk_dilayani' AND operating_mode = 'OPERATIONAL_2025'
`).get() as any;
console.log(`- Priority variable 'norm_penduduk_dilayani' observations:`, popObs);

// 4. RTRW & Land-Use Spatial Overlay
console.log(`\n--- 4. RTRW 12-CLASS OVERLAY AUDIT ---`);
const rtrwClasses = db.prepare(`
  SELECT 
    rtrw_class_name,
    macro_category,
    COUNT(DISTINCT road_key) as roads_count,
    SUM(intersection_length_m) as total_len_m,
    AVG(share_of_road_pct) as avg_pct
  FROM road_rtrw_intersections
  GROUP BY rtrw_class_name, macro_category
  ORDER BY total_len_m DESC
`).all() as any[];
console.table(rtrwClasses);

const rtrwProfiles = db.prepare(`
  SELECT 
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN permukiman_pct > 0 THEN 1 END) as has_permukiman,
    COUNT(CASE WHEN produksi_pct > 0 THEN 1 END) as has_produksi,
    COUNT(CASE WHEN lindung_pct > 0 THEN 1 END) as has_lindung,
    COUNT(CASE WHEN badan_air_pct > 0 THEN 1 END) as has_badan_air,
    COUNT(CASE WHEN pariwisata_pct > 0 THEN 1 END) as has_pariwisata,
    COUNT(CASE WHEN uncovered_pct > 0 THEN 1 END) as has_uncovered,
    COUNT(CASE WHEN permukiman_pct = 100 THEN 1 END) as pure_permukiman,
    COUNT(CASE WHEN produksi_pct = 100 THEN 1 END) as pure_produksi
  FROM road_spatial_profiles
`).get() as any;
console.log(`- RTRW Spatial Profile aggregate stats:`, rtrwProfiles);

// 5. Accessibility & Public Facilities Audit
console.log(`\n--- 5. ACCESSIBILITY & PUBLIC FACILITIES AUDIT ---`);
const facilityTypes = db.prepare(`
  SELECT 
    facility_type,
    COUNT(*) as total_facilities,
    COUNT(DISTINCT district_name) as district_coverage
  FROM public_facilities
  GROUP BY facility_type
`).all() as any[];
console.table(facilityTypes);

const nearestFacSummary = db.prepare(`
  SELECT 
    facility_type,
    COUNT(*) as road_count,
    COUNT(CASE WHEN network_distance_m >= 0 THEN 1 END) as connected_count,
    COUNT(CASE WHEN network_distance_m < 0 THEN 1 END) as disconnected_count,
    MIN(CASE WHEN network_distance_m >= 0 THEN network_distance_m END) as min_dist_m,
    MAX(CASE WHEN network_distance_m >= 0 THEN network_distance_m END) as max_dist_m,
    AVG(CASE WHEN network_distance_m >= 0 THEN network_distance_m END) as avg_dist_m
  FROM road_nearest_facilities
  GROUP BY facility_type
`).all() as any[];
console.table(nearestFacSummary);

// 6. 17 Priority Indicators & Scores Audit
console.log(`\n--- 6. PRIORITY MODEL & INVARIANTS AUDIT ---`);
const scoreStats = db.prepare(`
  SELECT 
    COUNT(*) as total_scores,
    MIN(final_score) as min_score,
    MAX(final_score) as max_score,
    AVG(final_score) as avg_score,
    COUNT(CASE WHEN tier_category = 'TOP_35' THEN 1 END) as top_35_count,
    COUNT(CASE WHEN tier_category = 'TOP_70' THEN 1 END) as top_70_count,
    COUNT(CASE WHEN tier_category = 'TOP_105' THEN 1 END) as top_105_count,
    COUNT(CASE WHEN tier_category = 'REGULAR' THEN 1 END) as regular_count
  FROM road_priority_scores
  WHERE run_id = (SELECT run_id FROM scoring_runs WHERE operating_mode = 'OPERATIONAL_2025' AND model_id = (SELECT model_id FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1') ORDER BY executed_at DESC LIMIT 1)
`).get() as any;
console.log(`- Baseline Scores (POLICY_DEFAULT_V1):`, scoreStats);

console.log('\nAudit complete.');
