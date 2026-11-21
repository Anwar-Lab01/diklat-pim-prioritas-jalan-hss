import { DatabaseSync } from 'node:sqlite';
import { RtrwSpatialService } from '../src/services/rtrwSpatialService.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const svc = new RtrwSpatialService(db);
console.log('Recomputing RTRW & Spatial Profiles with authoritative distance...');
const res = svc.computeAndStoreRtrwIntersections();
console.log('Processed:', res.roadsProcessed, 'network length km:', (res.totalNetworkM / 1000).toFixed(2));

const sampleKeys = ['HSS-KAB-025', 'HSS-KAB-001', 'HSS-KAB-010', 'HSS-KAB-183', 'HSS-KAB-340', 'HSS-KAB-350'];
for (const k of sampleKeys) {
  const p = svc.getRoadSpatialProfile(k);
  console.log(`Key: ${k}, Name: ${p?.road_name}, Jarak: ${p?.jarak_ibukota_kabupaten_m} m (${p?.jarak_ibukota_kabupaten_m !== null ? (p!.jarak_ibukota_kabupaten_m / 1000).toFixed(2) + ' km' : 'NULL / Data tidak tersedia'})`);
}
