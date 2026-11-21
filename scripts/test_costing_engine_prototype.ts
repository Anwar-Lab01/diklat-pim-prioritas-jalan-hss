import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

// Load all ASB items for Jalan Kabupaten
const asbItems = db.prepare(`
  SELECT asb_id, package_name, road_width_m, surface_type, unit, unit_price_rp, unit_price_sen
  FROM master_asb_items
  WHERE item_category = 'Jalan Kabupaten'
`).all() as any[];

console.log(`Loaded ${asbItems.length} ASB road items.`);

// Group ASB by Type (A, B, C, D)
const asbByType: Record<string, any[]> = { A: [], B: [], C: [], D: [] };
for (const item of asbItems) {
  const m = (item.package_name || '').match(/Jalan Tipe ([A-Z])/i);
  if (m && asbByType[m[1].toUpperCase()]) {
    asbByType[m[1].toUpperCase()].push(item);
  }
}
for (const [t, list] of Object.entries(asbByType)) {
  console.log(`Type ${t}: ${list.length} candidates, widths: ${[...new Set(list.map(i => i.road_width_m))].sort((a,b)=>a-b).join(', ')}`);
}

// Function to match ASB item for a given asbType and segmentWidth
function matchASBItem(asbType: string, widthM: number): { asb: any; flags: string[] } | null {
  const candidates = asbByType[asbType];
  if (!candidates || candidates.length === 0) return null;

  const flags: string[] = [];
  const roadWidth = (widthM && widthM > 0) ? widthM : 4.5;
  if (!widthM || widthM <= 0) flags.push('default_width_used');

  // Width matching: round up nearest
  let matchedWidth = candidates.filter(i => (i.road_width_m || 0) >= roadWidth).sort((a, b) => (a.road_width_m || 0) - (b.road_width_m || 0));
  if (matchedWidth.length === 0) {
    matchedWidth = [...candidates].sort((a, b) => (b.road_width_m || 0) - (a.road_width_m || 0));
    flags.push('manual_review_width_exceeded');
  }

  const selectedWidth = matchedWidth[0].road_width_m;
  const widthCandidates = matchedWidth.filter(i => i.road_width_m === selectedWidth);

  // Surface preference
  const prefSurface = asbType === 'A' ? 'HRS-WC' : 'HRS-Base';
  let surfaceCandidates = widthCandidates.filter(i => i.surface_type === prefSurface);
  if (surfaceCandidates.length === 0) {
    surfaceCandidates = widthCandidates;
    flags.push('surface_fallback_used');
  }

  return { asb: surfaceCandidates[0], flags };
}

// Test on all 7,487 segments
const segments = db.prepare(`
  SELECT s.segment_id, s.road_key, s.sta_start_m, s.sta_end_m, s.segment_length_m, s.dominant_condition,
         s.surface_type, s.road_width_m, rc.tidak_mantap_pct, rc.rusak_berat_pct, rc.total_panjang_km
  FROM treatment_engine_segments s
  LEFT JOIN road_conditions rc ON s.road_key = rc.road_key AND rc.survey_year = 2025
  ORDER BY s.road_key, s.sta_start_m
`).all() as any[];

let countReady = 0;
let countRoutine = 0;
let countWidthExceeded = 0;
let totalCostSen = 0n;

for (const seg of segments) {
  let ruleId = 'R06';
  let asbType = 'NONE';

  if (seg.dominant_condition === 'baik' || seg.dominant_condition === 'sedang') {
    ruleId = 'R06';
    asbType = 'NONE';
  } else {
    const isUnpaved = seg.surface_type === 'Tanah' || seg.surface_type === 'Kerikil';
    const unpaved_pct = isUnpaved ? 100 : 0;
    const non_mantap_pct = seg.tidak_mantap_pct ?? 100;
    const rusak_berat_pct = seg.rusak_berat_pct ?? 0;

    if (unpaved_pct >= 50 || (non_mantap_pct >= 40 && rusak_berat_pct >= 20)) {
      ruleId = 'R01';
      asbType = 'D';
    } else if (non_mantap_pct >= 40) {
      ruleId = 'R02';
      asbType = 'C';
    } else if (non_mantap_pct >= 25 && rusak_berat_pct >= 10) {
      ruleId = 'R03';
      asbType = 'C';
    } else if (non_mantap_pct >= 25 && rusak_berat_pct < 10) {
      ruleId = 'R04';
      asbType = 'B';
    } else if (non_mantap_pct >= 10 && non_mantap_pct < 25) {
      ruleId = 'R05';
      asbType = 'A';
    } else {
      ruleId = 'R06';
      asbType = 'NONE';
    }
  }

  if (asbType === 'NONE') {
    countRoutine++;
  } else {
    const match = matchASBItem(asbType, seg.road_width_m);
    if (match && match.asb) {
      countReady++;
      if (match.flags.includes('manual_review_width_exceeded')) countWidthExceeded++;
      const costSen = BigInt(match.asb.unit_price_sen) * BigInt(Math.round(seg.segment_length_m));
      totalCostSen += costSen;
    }
  }
}

console.log('--- SEGMENT MATCHING & COSTING RESULTS ---');
console.log(`Total Segments: ${segments.length}`);
console.log(`Routine Maintenance (R06 - Type NONE): ${countRoutine}`);
console.log(`Major ASB Estimated (R01..R05 - Types A/B/C/D): ${countReady}`);
console.log(`Width Exceeded (5.0m max used, flagged): ${countWidthExceeded}`);
console.log(`Total Pagu ASB Network (Sen): ${totalCostSen.toString()}`);
console.log(`Total Pagu ASB Network (Rp): Rp ${(Number(totalCostSen) / 100).toLocaleString('id-ID')}`);

db.close();
