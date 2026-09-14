import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../db/connection.ts';
import { DemographicsAndSegmentsService } from '../services/demographicsAndSegmentsService.ts';
import { ScoringService } from '../services/scoringService.ts';
import { rankRoads } from '../engine/scoringEngine.ts';
import { PROJECT_ROOT } from '../config/constants.ts';

function assert(condition: boolean, message: string, detail?: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}${detail ? ' -> ' + detail : ''}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

console.log('================================================================');
console.log('STARTING PHASE 5.1A DATA COMPLETION & DD1 RECONCILIATION AUDIT');
console.log('================================================================');

const db = getDatabase();
const demoSegService = new DemographicsAndSegmentsService(db);
const scoringService = new ScoringService(db);

// --- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---
console.log('\n--- 1. MANDATORY BASELINE INVARIANTS NON-REGRESSION ---');
const featureVectors = scoringService.loadRoadFeatureVectors('OPERATIONAL_2025');
const baselineModelConfig = scoringService.loadModelConfig('POLICY_DEFAULT_V1');
const rankedScores = rankRoads(featureVectors, baselineModelConfig);
assert(rankedScores.length === 350, 'Canonical roads count must equal 350');

const top1 = rankedScores.find((s) => s.priority_rank === 1);
assert(top1?.road_key === 'HSS-KAB-025', 'Mandatory rank #1 is HSS-KAB-025', `got ${top1?.road_key}`);
assert(Math.abs(top1!.final_score - 0.649945) < 0.001, 'Mandatory rank #1 score is ~0.649945', `got ${top1?.final_score}`);

const top12 = rankedScores.find((s) => s.priority_rank === 12);
assert(top12?.road_key === 'HSS-KAB-001', 'Mandatory rank #12 is HSS-KAB-001', `got ${top12?.road_key}`);

const rank133 = rankedScores.find((s) => s.priority_rank === 133);
assert(rank133?.road_key === 'HSS-KAB-295', 'Mandatory rank #133 is HSS-KAB-295', `got ${rank133?.road_key}`);

const rank169 = rankedScores.find((s) => s.priority_rank === 169);
assert(rank169?.road_key === 'HSS-KAB-350', 'Mandatory rank #169 is HSS-KAB-350', `got ${rank169?.road_key}`);

const rank245 = rankedScores.find((s) => s.priority_rank === 245);
assert(rank245?.road_key === 'HSS-KAB-013', 'Mandatory rank #245 is HSS-KAB-013', `got ${rank245?.road_key}`);

const top35Count = rankedScores.filter((s) => s.tier_category === 'TOP_35').length;
const top70Count = rankedScores.filter((s) => s.tier_category === 'TOP_70').length;
const top105Count = rankedScores.filter((s) => s.tier_category === 'TOP_105').length;
const regularCount = rankedScores.filter((s) => s.tier_category === 'REGULAR').length;
assert(
  top35Count === 35 && top70Count === 35 && top105Count === 35 && regularCount === 245,
  'Tier partition remains exact {35, 35, 35, 245}',
  `got {${top35Count}, ${top70Count}, ${top105Count}, ${regularCount}}`
);

// --- 2. AUTHORITATIVE 2025 VILLAGE DEMOGRAPHICS AUDIT ---
console.log('\n--- 2. AUTHORITATIVE 2025 VILLAGE DEMOGRAPHICS AUDIT ---');
const demoCountRow = db.prepare('SELECT COUNT(*) as cnt FROM village_demographics').get() as any;
assert(demoCountRow.cnt === 148, 'village_demographics contains exactly 148 canonical village records', `got ${demoCountRow.cnt}`);

const demoTotals = db.prepare(`
  SELECT 
    SUM(households_total) as total_hh,
    SUM(households_male) as total_male,
    SUM(households_female) as total_female
  FROM village_demographics
`).get() as any;

assert(demoTotals.total_hh === 85142, 'Grand total households equals 85,142', `got ${demoTotals.total_hh}`);
assert(demoTotals.total_male === 63642, 'Grand total male households equals 63,642', `got ${demoTotals.total_male}`);
assert(demoTotals.total_female === 21500, 'Grand total female households equals 21,500', `got ${demoTotals.total_female}`);
assert(demoTotals.total_male + demoTotals.total_female === demoTotals.total_hh, 'Sum of male + female households matches total exactly');

// Check that zero fabricated / null values exist
const invalidRows = db.prepare(`
  SELECT COUNT(*) as cnt FROM village_demographics
  WHERE households_total IS NULL OR households_total <= 0
     OR households_male IS NULL OR households_female IS NULL
`).get() as any;
assert(invalidRows.cnt === 0, 'Zero null, negative, or fabricated records in village_demographics');

// Check foreign key alignment with villages table
const unlinkedVillages = db.prepare(`
  SELECT COUNT(*) as cnt FROM village_demographics vd
  LEFT JOIN villages v ON vd.village_id = v.village_id
  WHERE v.village_id IS NULL
`).get() as any;
assert(unlinkedVillages.cnt === 0, '100% of village_demographics link to canonical villages table');

// --- 3. ROAD HOUSEHOLD SPATIAL AGGREGATION AUDIT ---
console.log('\n--- 3. ROAD HOUSEHOLD SPATIAL AGGREGATION AUDIT ---');
const demo001 = demoSegService.getRoadDemographics('HSS-KAB-001');
assert(demo001.road_key === 'HSS-KAB-001', 'getRoadDemographics returns correct road_key');
assert(demo001.metric_label === 'RUMAH TANGGA', 'Demographic metric is strictly labeled RUMAH TANGGA');
assert(demo001.village_count === 2, 'HSS-KAB-001 traverses exactly 2 villages (Kandangan Kota & Baluti)', `got ${demo001.village_count}`);
assert(demo001.total_households === 4566, 'HSS-KAB-001 serves 4,566 total households', `got ${demo001.total_households}`);
assert(demo001.total_households_male === 3292, 'HSS-KAB-001 male households equals 3,292', `got ${demo001.total_households_male}`);
assert(demo001.total_households_female === 1274, 'HSS-KAB-001 female households equals 1,274', `got ${demo001.total_households_female}`);

const demo025 = demoSegService.getRoadDemographics('HSS-KAB-025');
assert(demo025.total_households > 0, 'HSS-KAB-025 serves positive households count', `got ${demo025.total_households}`);
assert(demo025.villages.length > 0, 'HSS-KAB-025 traverses at least 1 village');

// Verify active scoring norm_penduduk_dilayani was not mutated or replaced
const obsCheck = db.prepare(`
  SELECT COUNT(*) as cnt FROM road_variable_observations
  WHERE variable_code = 'norm_penduduk_dilayani'
`).get() as any;
assert(obsCheck.cnt === 700, 'norm_penduduk_dilayani observations intact (700 rows across operational and benchmark)');

// --- 4. TREATMENT ENGINE / DD1 CONDITION SEGMENTS AUDIT ---
console.log('\n--- 4. TREATMENT ENGINE / DD1 CONDITION SEGMENTS AUDIT ---');
const segCountRow = db.prepare('SELECT COUNT(*) as cnt FROM treatment_engine_segments').get() as any;
assert(segCountRow.cnt === 7487, 'treatment_engine_segments contains exactly 7,487 segment records', `got ${segCountRow.cnt}`);

const segRoadsCount = db.prepare('SELECT COUNT(DISTINCT road_key) as cnt FROM treatment_engine_segments').get() as any;
assert(segRoadsCount.cnt === 350, 'DD1 segments cover all 350 canonical roads', `got ${segRoadsCount.cnt}`);

const segLengthTotals = db.prepare(`
  SELECT 
    SUM(segment_length_m) as total_m,
    SUM(CASE WHEN dominant_condition = 'baik' THEN segment_length_m ELSE 0 END) as baik_m,
    SUM(CASE WHEN dominant_condition = 'sedang' THEN segment_length_m ELSE 0 END) as sedang_m,
    SUM(CASE WHEN dominant_condition = 'rusak_ringan' THEN segment_length_m ELSE 0 END) as rr_m,
    SUM(CASE WHEN dominant_condition = 'rusak_berat' THEN segment_length_m ELSE 0 END) as rb_m
  FROM treatment_engine_segments
`).get() as any;

assert(Math.round(segLengthTotals.total_m) === 732460, 'Total segment length equals 732,460 m (732.46 km)', `got ${segLengthTotals.total_m}`);
assert(Math.round(segLengthTotals.baik_m) === 131650, 'Baik condition length equals 131,650 m', `got ${segLengthTotals.baik_m}`);
assert(Math.round(segLengthTotals.sedang_m) === 261240, 'Sedang condition length equals 261,240 m', `got ${segLengthTotals.sedang_m}`);
assert(Math.round(segLengthTotals.rr_m) === 111410, 'Rusak Ringan condition length equals 111,410 m', `got ${segLengthTotals.rr_m}`);
assert(Math.round(segLengthTotals.rb_m) === 228160, 'Rusak Berat condition length equals 228,160 m', `got ${segLengthTotals.rb_m}`);

const mantapM = segLengthTotals.baik_m + segLengthTotals.sedang_m;
const tidakMantapM = segLengthTotals.rr_m + segLengthTotals.rb_m;
assert(Math.round(mantapM) === 392890, 'Mantap condition length equals 392,890 m (392.89 km)');
assert(Math.round(tidakMantapM) === 339570, 'Tidak Mantap condition length equals 339,570 m (339.57 km)');

// Short final segment audit
const seg350Res = demoSegService.getRoadDD1Segments('HSS-KAB-350');
assert(seg350Res.total_segments === 7, 'HSS-KAB-350 has 7 segments', `got ${seg350Res.total_segments}`);
assert(seg350Res.has_short_final_segment === true, 'HSS-KAB-350 has_short_final_segment is true');
assert(seg350Res.last_segment_length_m === 90, 'HSS-KAB-350 last segment length is 90 m', `got ${seg350Res.last_segment_length_m}`);

// --- 5. DD2 TO DD1 TERMINOLOGY AUDIT ---
console.log('\n--- 5. DD2 TO DD1 TERMINOLOGY AUDIT ---');
const indexHtmlContent = fs.readFileSync(path.resolve(PROJECT_ROOT, 'src/public/index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.resolve(PROJECT_ROOT, 'src/public/app.js'), 'utf8');

// Ensure zero user-facing "DD2" strings in UI text
const indexHtmlDD2Matches = [...indexHtmlContent.matchAll(/DD2/gi)];
assert(indexHtmlDD2Matches.length === 0, 'src/public/index.html has 0 occurrences of DD2', `found ${indexHtmlDD2Matches.length}`);

// app.js should not contain user-facing DD2 strings (except provenance notes)
const appJsDD2UserFacing = [...appJsContent.matchAll(/>[^<]*DD2[^<]*</gi)];
assert(appJsDD2UserFacing.length === 0, 'src/public/app.js has 0 user-facing DD2 template occurrences', `found ${appJsDD2UserFacing.length}`);

assert(indexHtmlContent.includes('Data Kondisi Jalan per Segmen (DD1)'), 'index.html contains exact DD1 section header');
assert(indexHtmlContent.includes('btn-toggle-dd1-segments'), 'index.html contains DD1 segment toggle button');

console.log('\n================================================================');
console.log('PHASE 5.1A VERIFICATION COMPLETE: ALL 26 AUDIT CHECKS PASSED!');
console.log('>> VERDICT: PHASE_5_1A_DATA_COMPLETION_PASS <<');
console.log('================================================================\n');
