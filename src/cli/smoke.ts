import { getDatabase, closeDatabase } from '../db/connection.ts';
import { RoadService } from '../services/roadService.ts';
import { CrosswalkService } from '../services/crosswalkService.ts';
import { ConditionService } from '../services/conditionService.ts';
import { SpatialService } from '../services/spatialService.ts';
import { ModelService } from '../services/modelService.ts';

export function inspectRoad(roadKeyInput: string) {
  const roadKey = roadKeyInput.trim().toUpperCase();

  const db = getDatabase();
  const roadSvc = new RoadService(db);
  const crosswalkSvc = new CrosswalkService(db);
  const conditionSvc = new ConditionService(db);
  const spatialSvc = new SpatialService(db);
  const modelSvc = new ModelService(db);

  const road = roadSvc.getRoadByKey(roadKey);
  if (!road) {
    console.error(`\n[ERROR] Road not found for canonical key: '${roadKey}'`);
    console.error('Note: Searches MUST use canonical road_key (e.g. HSS-KAB-001). Name-based queries are forbidden as identity keys.\n');
    process.exit(1);
  }

  const crosswalks = crosswalkSvc.getCrosswalksForRoad(roadKey);
  const condition = conditionSvc.getConditionByRoadKey(roadKey, 2025);
  const geometry = spatialSvc.getGeometryByRoadKey(roadKey);
  const observationsOp = modelSvc.getRoadObservations(roadKey, 'OPERATIONAL_2025');
  const observationsBench = modelSvc.getRoadObservations(roadKey, 'BENCHMARK_2024');

  console.log('\n' + '='.repeat(70));
  console.log(`CANONICAL ROAD INSPECTION PROFILE: ${road.road_key}`);
  console.log('='.repeat(70));

  // 1. CANONICAL IDENTITY
  console.log('\n[1] CANONICAL IDENTITY (SK BUPATI OTORITATIF)');
  console.log(`  • Road Key          : ${road.road_key}`);
  console.log(`  • UUIDv5 Road ID    : ${road.road_id}`);
  console.log(`  • Nomor Ruas Resmi  : ${road.nomor_ruas}`);
  console.log(`  • Canonical Name    : ${road.canonical_name}`);
  console.log(`  • Display Name      : ${road.display_name}`);
  console.log(`  • Kecamatan (2025)  : ${road.district_name}`);
  console.log(`  • Desa Terlintasi   : ${road.village_coverage || '(Tidak terdata)'}`);
  console.log(`  • Panjang Resmi     : ${road.length_km_official.toFixed(3)} km`);
  console.log(`  • Lebar Rata-rata   : ${road.width_m_official.toFixed(2)} m`);
  console.log(`  • Status Identitas  : ${road.identity_status}`);

  // 2. 2025 ROAD CONDITION AUTHORITY
  console.log('\n[2] CONDITION AUTHORITY (SURVEI FISIK RESMI 2025)');
  if (condition) {
    console.log(`  • Status Dokumen    : ${condition.authority_status} (${condition.source_filename})`);
    console.log(`  • Total Panjang     : ${condition.total_panjang_km.toFixed(3)} km`);
    console.log(
      `  • Kondisi Mantap    : ${condition.mantap_km.toFixed(3)} km (${condition.mantap_pct.toFixed(2)}%)`
    );
    console.log(
      `  • Tidak Mantap      : ${condition.tidak_mantap_km.toFixed(3)} km (${condition.tidak_mantap_pct.toFixed(2)}%)`
    );
    console.log(
      `  • Rincian Kerusakan : Baik=${condition.baik_km.toFixed(3)} km | Sedang=${condition.sedang_km.toFixed(3)} km | Rusak Ringan=${condition.rusak_ringan_km.toFixed(3)} km | Rusak Berat=${condition.rusak_berat_km.toFixed(3)} km`
    );
  } else {
    console.log('  (Tidak ada rekaman kondisi 2025)');
  }

  // 3. SPATIAL GEOMETRY
  console.log('\n[3] SPATIAL GEOMETRY SUMMARY (EPSG:4326)');
  if (geometry) {
    const geojsonObj = JSON.parse(geometry.geometry_geojson);
    console.log(`  • Tipe Geometri     : ${geojsonObj.type}`);
    console.log(`  • Panjang Spasial   : ${geometry.geometry_length_m.toFixed(1)} meter`);
    console.log(`  • Koordinat Titik   : Lat ${geometry.centroid_lat.toFixed(6)}, Lng ${geometry.centroid_lng.toFixed(6)}`);
    console.log(
      `  • Bounding Box      : [${geometry.bbox_min_lat.toFixed(4)}, ${geometry.bbox_min_lng.toFixed(4)}] s.d. [${geometry.bbox_max_lat.toFixed(4)}, ${geometry.bbox_max_lng.toFixed(4)}]`
    );
    console.log(`  • Geometri Sintetis : BUKAN (Konektor jembatan sintetis tereksklusi)`);
  } else {
    console.log('  (Tidak ada rekaman geometri spasial)');
  }

  // 4. CROSS-SYSTEM CROSSWALK
  console.log('\n[4] CROSS-SYSTEM CROSSWALK MAPPINGS (4 SISTEM SUMBER)');
  if (crosswalks.length > 0) {
    for (const cw of crosswalks) {
      console.log(
        `  • [${cw.source_system.padEnd(28)}] ID: ${cw.source_id.padEnd(10)} | Metode: ${cw.match_method.padEnd(20)} | Status: ${cw.match_status}`
      );
      console.log(`    Nama Sumber: "${cw.source_name}"`);
    }
  } else {
    console.log('  (Tidak ada pemetaan crosswalk)');
  }

  // 5. 17 VARIABLE OBSERVATIONS (SAMPLE OPERATIONAL VS BENCHMARK)
  console.log('\n[5] OBSERVASI 17 VARIABEL (PERBANDINGAN DUAL-MODE)');
  const opMap = new Map(observationsOp.map((o) => [o.variable_code, o]));
  const benchMap = new Map(observationsBench.map((o) => [o.variable_code, o]));

  const sampleVars = [
    'norm_panjang_ruas',
    'norm_kondisi_sedang',
    'norm_rusak_ringan',
    'norm_rusak_berat',
    'norm_jarak_rsud_cost',
    'norm_jarak_ibukota_kabupaten_cost',
    'norm_penduduk_dilayani',
  ];

  console.log('  Variable Code                    | Operasional 2025 | Benchmark 2024');
  console.log('  ---------------------------------+------------------+---------------');
  for (const v of sampleVars) {
    const op = opMap.get(v);
    const bench = benchMap.get(v);
    const opVal = op ? op.normalized_value.toFixed(4) : 'N/A';
    const benchVal = bench ? bench.normalized_value.toFixed(4) : 'N/A';
    console.log(`  ${v.padEnd(32)} | ${opVal.padStart(16)} | ${benchVal.padStart(14)}`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// CLI entrypoint
const targetRoad = process.argv[2] || 'HSS-KAB-001';
try {
  inspectRoad(targetRoad);
} finally {
  closeDatabase();
}
