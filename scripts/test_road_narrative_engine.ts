import { DatabaseSync } from 'node:sqlite';
import { RoadNarrativeService } from '../src/services/roadNarrativeService.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const service = new RoadNarrativeService(db);

console.log('================================================================');
console.log('TESTING ROAD NARRATIVE SERVICE FOR ALL 350 CANONICAL ROADS');
console.log('================================================================');

const batch = service.generateAllNarratives('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

console.log(`Total roads evaluated: ${batch.total_evaluated}`);
console.log(`Success count: ${batch.success_count}`);
console.log(`Failed count: ${batch.failed_count}`);
console.log('Availability Matrix:', batch.availability_matrix);

console.log('\n--- SAMPLE 1: HSS-KAB-001 (Kandangan Kota - Loklua) ---');
const n001 = service.generateNarrative('HSS-KAB-001');
if (n001) {
  console.log('Ringkasan Eksekutif:');
  console.log(n001.ringkasan_eksekutif);
  console.log('\nTemplate 1 (Gambaran Umum):', n001.template1_gambaran_umum.text);
  console.log('\nTemplate 2 (Cakupan & Demografi):', n001.template2_cakupan_demografi.text);
  console.log('\nTemplate 3 (Tata Ruang RTRW):', n001.template3_tata_ruang_rtrw.text);
  console.log('\nTemplate 4 (Aksesibilitas):', n001.template4_aksesibilitas_pelayanan.text);
  console.log('\nTemplate 5 (Kondisi 2025):', n001.template5_kondisi_kemantapan.text);
  console.log('\nTemplate 6 (Karakteristik Teknis):', n001.template6_karakteristik_teknis.text);
  console.log('\nTemplate 7 (Prioritas & Metodologi):', n001.template7_penilaian_prioritas.text);
  console.log('\nTemplate 8 (Kesimpulan):', n001.template8_kesimpulan_karakteristik.text);
}

console.log('\n--- SAMPLE 2: HSS-KAB-025 (Pangeran Antasari - RSUD) ---');
const n025 = service.generateNarrative('HSS-KAB-025');
if (n025) {
  console.log('Ringkasan Eksekutif:\n', n025.ringkasan_eksekutif);
  console.log('\nTemplate 4 (Aksesibilitas):\n', n025.template4_aksesibilitas_pelayanan.text);
  console.log('\nTemplate 7 (Top Factors):\n', n025.template7_penilaian_prioritas.attributes.top_factors);
}

console.log('\n--- SAMPLE 3: HSS-KAB-299 (Disconnected Network / Terputus) ---');
const n299 = service.generateNarrative('HSS-KAB-299');
if (n299) {
  console.log('Template 4 (Aksesibilitas):\n', n299.template4_aksesibilitas_pelayanan.text);
  console.log('Attributes:\n', n299.template4_aksesibilitas_pelayanan.attributes);
}

console.log('\n--- SAMPLE 4: HSS-KAB-183 (Null Kandangan Distance / Center) ---');
const n183 = service.generateNarrative('HSS-KAB-183');
if (n183) {
  console.log('Template 4 (Aksesibilitas):\n', n183.template4_aksesibilitas_pelayanan.text);
}
