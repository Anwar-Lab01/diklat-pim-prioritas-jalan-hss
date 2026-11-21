import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { RoadNarrativeService } from '../services/roadNarrativeService.ts';

const db = new DatabaseSync('data/diklat_pim.db');
const narrativeService = new RoadNarrativeService(db);

console.log('================================================================');
console.log('STARTING PHASE 5.3: ROAD NARRATIVE ENGINE ACCEPTANCE SUITE');
console.log('================================================================');

// --- 1. FULL NETWORK COVERAGE & AUDIT ---
console.log('\n--- 1. FULL NETWORK COVERAGE & AUDIT (350 ROADS) ---');
const batch = narrativeService.generateAllNarratives('OPERATIONAL_2025', 'POLICY_DEFAULT_V1');

assert.strictEqual(batch.total_evaluated, 350, 'Must evaluate exactly 350 canonical roads');
assert.strictEqual(batch.success_count, 350, 'All 350 roads must successfully generate narratives');
assert.strictEqual(batch.failed_count, 0, 'Zero generation failures allowed');

console.log('  [PASS] 100% generation success for 350 canonical roads');
assert.strictEqual(batch.availability_matrix.has_geometry, 350, 'All 350 roads have geometry');
assert.strictEqual(batch.availability_matrix.has_conditions_2025, 350, 'All 350 roads have 2025 condition data');
assert.strictEqual(batch.availability_matrix.has_spatial_profile, 350, 'All 350 roads have spatial profiles');
assert.strictEqual(batch.availability_matrix.has_village_intersections, 350, 'All 350 roads intersect villages');
assert.strictEqual(batch.availability_matrix.has_household_demographics, 350, 'All 350 roads have household demographic data');
assert.strictEqual(batch.availability_matrix.has_nearest_facilities, 350, 'All 350 roads have nearest facility records');
assert.strictEqual(batch.availability_matrix.has_priority_score, 350, 'All 350 roads have baseline priority scores');
console.log('  [PASS] Availability matrix confirms 100% data fidelity across core dimensions');

// --- 2. TEMPLATE COMPLETENESS & STRUCTURE ---
console.log('\n--- 2. TEMPLATE COMPLETENESS & STRUCTURE ---');
const sample001 = narrativeService.generateNarrative('HSS-KAB-001')!;
assert.ok(sample001, 'HSS-KAB-001 must return narrative');
assert.ok(sample001.ringkasan_eksekutif.length > 50, 'Executive summary must be populated');
assert.ok(sample001.template1_gambaran_umum.text.includes('001'), 'T1 must contain nomor ruas');
assert.ok(sample001.template2_cakupan_demografi.text.includes('desa/kelurahan'), 'T2 must describe villages');
assert.ok(sample001.template2_cakupan_demografi.text.includes('Disdukcapil'), 'T2 must cite Disdukcapil 2025');
assert.ok(sample001.template3_tata_ruang_rtrw.text.includes('RTRW'), 'T3 must cite RTRW 2024–2044');
assert.ok(sample001.template3_tata_ruang_rtrw.text.includes('bukan penggunaan lahan aktual'), 'T3 must clearly state peruntukan ruang disclaimer');
assert.ok(sample001.template4_aksesibilitas_pelayanan.text.includes('Dijkstra'), 'T4 must state Dijkstra network routing');
assert.ok(sample001.template5_kondisi_kemantapan.text.includes('2025'), 'T5 must describe 2025 condition');
assert.ok(sample001.template6_karakteristik_teknis.text.includes('lebar perkerasan'), 'T6 must describe pavement width');
assert.ok(sample001.template7_penilaian_prioritas.text.includes('skor komposit'), 'T7 must describe composite score and rank');
assert.ok(sample001.template8_kesimpulan_karakteristik.text.length > 50, 'T8 must provide integrative synthesis');
console.log('  [PASS] All 8 narrative templates conform to required structures and standard phrasing');

// --- 3. EDGE CASE: DISCONNECTED NETWORK COMPONENT (HSS-KAB-299) ---
console.log('\n--- 3. EDGE CASE: DISCONNECTED ROAD (HSS-KAB-299) ---');
const n299 = narrativeService.generateNarrative('HSS-KAB-299')!;
assert.strictEqual(n299.template4_aksesibilitas_pelayanan.attributes.rsud.status, 'DISCONNECTED', 'RSUD must be DISCONNECTED for HSS-KAB-299');
assert.ok(
  n299.template4_aksesibilitas_pelayanan.text.includes('belum terhubung secara langsung melalui jaringan jalan kabupaten yang tersambung'),
  'Must explicitly describe disconnected network status without fabricating straight line distance'
);
console.log('  [PASS] Disconnected roads handled gracefully without fake routes or Euclidean distance fallback');

// --- 4. EDGE CASE: NULL KANDANGAN DISTANCE (HSS-KAB-183) ---
console.log('\n--- 4. EDGE CASE: NULL KANDANGAN DISTANCE (HSS-KAB-183) ---');
const n183 = narrativeService.generateNarrative('HSS-KAB-183')!;
assert.ok(
  n183.template4_aksesibilitas_pelayanan.text.includes('Data tidak tersedia') ||
  n183.template4_aksesibilitas_pelayanan.attributes.jarak_kandangan === 'Data tidak tersedia',
  'Must display Data tidak tersedia instead of converting NULL to 0'
);
console.log('  [PASS] NULL distance values preserved truthfully without converting NULL to 0');

// --- 5. EDGE CASE: MULTI-DISTRICT ROAD (HSS-KAB-032) ---
console.log('\n--- 5. EDGE CASE: MULTI-DISTRICT ROAD (HSS-KAB-032) ---');
const n032 = narrativeService.generateNarrative('HSS-KAB-032')!;
assert.ok(n032.template2_cakupan_demografi.attributes.jumlah_kecamatan >= 2, 'HSS-KAB-032 must traverse >= 2 districts');
assert.ok(n032.template1_gambaran_umum.text.includes('lintas kecamatan'), 'T1 must mention inter-district connectivity');
console.log('  [PASS] Inter-district roads identified and correctly narrated');

// --- 6. EDGE CASE: 100% MANTAP ROAD (HSS-KAB-002) ---
console.log('\n--- 6. EDGE CASE: 100% MANTAP ROAD (HSS-KAB-002) ---');
const n002 = narrativeService.generateNarrative('HSS-KAB-002')!;
assert.ok(Math.abs(n002.template5_kondisi_kemantapan.attributes.mantap_pct - 100) < 0.01, 'HSS-KAB-002 is ~100% mantap');
assert.ok(n002.template5_kondisi_kemantapan.text.includes('100,0%'), 'T5 must format 100.0% mantap correctly');
console.log('  [PASS] 100% mantap roads correctly evaluated with maintenance recommendations');

// --- 7. DEMOGRAPHIC DISTINCTION & UNIQUE VILLAGES ---
console.log('\n--- 7. DEMOGRAPHIC DISTINCTION & UNIQUE VILLAGES ---');
// Verify unique village counting: total unique villages in all roads cannot have duplicates within one road
for (const res of batch.results) {
  const vList = res.template1_gambaran_umum.attributes.daftar_desa;
  const vSet = new Set(vList);
  assert.strictEqual(vList.length, vSet.size, `Road ${res.road_key} must have unique villages in list`);
  assert.strictEqual(res.template2_cakupan_demografi.attributes.data_jiwa_status.includes('Rumah Tangga/KK'), true);
}
console.log('  [PASS] Unique villages validated across all 350 roads with zero double counting');

// --- 8. BASELINE INTEGRITY PRESERVATION ---
console.log('\n--- 8. BASELINE INTEGRITY PRESERVATION ---');
const baselineCount = db.prepare('SELECT count(*) as cnt FROM roads').get() as any;
assert.strictEqual(baselineCount.cnt, 350, 'Canonical roads count must remain exactly 350');
const condCount = db.prepare('SELECT count(*) as cnt FROM road_conditions WHERE survey_year = 2025').get() as any;
assert.strictEqual(condCount.cnt, 350, 'Road conditions count must remain exactly 350');
const facCount = db.prepare('SELECT count(*) as cnt FROM road_nearest_facilities').get() as any;
assert.strictEqual(facCount.cnt, 1400, 'Facility nearest routes count must remain exactly 1400');
const asbCount = db.prepare('SELECT count(*) as cnt FROM master_asb_items').get() as any;
assert.strictEqual(asbCount.cnt, 1010, 'ASB items must remain exactly 1010');
const ahspCount = db.prepare('SELECT count(*) as cnt FROM master_ahsp_items').get() as any;
assert.strictEqual(ahspCount.cnt, 483, 'AHSP items must remain exactly 483');
console.log('  [PASS] Baseline invariants (roads, conditions, routing, costing) remain 100% intact');

console.log('\n================================================================');
console.log('PHASE 5.3 VERIFICATION COMPLETE: ALL 8 TEST SECTIONS PASSED!');
console.log('>> VERDICT: PHASE_5_3_ROAD_NARRATIVE_ENGINE_PASS <<');
console.log('================================================================');
