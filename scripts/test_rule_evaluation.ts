import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

const db = new DatabaseSync(path.resolve('data/diklat_pim.db'));

// Load all roads and road_conditions
const roadConditions = db.prepare(`
  SELECT rc.road_key, rc.tidak_mantap_pct, rc.rusak_berat_pct, rc.rusak_ringan_pct, rc.baik_pct, rc.sedang_pct,
         r.length_km_official, r.width_m_official
  FROM road_conditions rc
  JOIN roads r ON rc.road_key = r.road_key
  WHERE rc.survey_year = 2025
`).all() as any[];

const roadCondMap = new Map<string, any>();
for (const rc of roadConditions) {
  roadCondMap.set(rc.road_key, rc);
}

// Load all 7,487 segments
const segments = db.prepare(`
  SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, dominant_condition, segment_status,
         surface_type, road_width_m, recommended_treatment
  FROM treatment_engine_segments
  ORDER BY road_key, sta_start_m
`).all() as any[];

console.log(`Loaded ${segments.length} segments and ${roadConditions.length} road condition records.`);

// Method 1: Direct Segment Evaluation with Corridor Context
const ruleCountsMethod1: Record<string, number> = { R01: 0, R02: 0, R03: 0, R04: 0, R05: 0, R06: 0, NO_RULE: 0 };
const ruleCountsMethod2: Record<string, number> = { R01: 0, R02: 0, R03: 0, R04: 0, R05: 0, R06: 0, NO_RULE: 0 };

for (const seg of segments) {
  const rc = roadCondMap.get(seg.road_key);
  const isUnpaved = seg.surface_type === 'Tanah' || seg.surface_type === 'Kerikil';
  
  // Method 1: Segment condition mapped to rules
  // R01: unpaved OR (rusak berat with high corridor damage)
  // R02: rusak berat paved without deep fill
  // R03: rusak berat moderate
  // R04: rusak ringan with base course
  // R05: rusak ringan surface only
  // R06: mantap (sedang / baik)
  let rule1 = 'NO_RULE';
  if (seg.dominant_condition === 'baik' || seg.dominant_condition === 'sedang') {
    rule1 = 'R06';
  } else if (isUnpaved) {
    rule1 = 'R01';
  } else if (seg.dominant_condition === 'rusak_berat') {
    if (rc && rc.tidak_mantap_pct >= 40 && rc.rusak_berat_pct >= 20) {
      rule1 = 'R01';
    } else {
      rule1 = 'R02';
    }
  } else if (seg.dominant_condition === 'rusak_ringan') {
    if (rc && rc.tidak_mantap_pct >= 25) {
      rule1 = 'R04';
    } else {
      rule1 = 'R05';
    }
  }
  ruleCountsMethod1[rule1]++;

  // Method 2: Pure Road-Corridor Rule applied to segments needing treatment
  let rule2 = 'NO_RULE';
  if (seg.dominant_condition === 'baik' || seg.dominant_condition === 'sedang') {
    rule2 = 'R06';
  } else {
    // Use the corridor's R01..R05 rule for segments needing treatment
    const unpaved_pct = isUnpaved ? 100 : (rc ? ((rc.kerikil_km || 0) + (rc.tanah_km || 0)) / (rc.total_panjang_km || 1) * 100 : 0);
    const non_mantap_pct = rc ? rc.tidak_mantap_pct : 100;
    const rusak_berat_pct = rc ? rc.rusak_berat_pct : 0;

    if (unpaved_pct >= 50 || (non_mantap_pct >= 40 && rusak_berat_pct >= 20)) {
      rule2 = 'R01';
    } else if (non_mantap_pct >= 40) {
      rule2 = 'R02';
    } else if (non_mantap_pct >= 25 && rusak_berat_pct >= 10) {
      rule2 = 'R03';
    } else if (non_mantap_pct >= 25 && rusak_berat_pct < 10) {
      rule2 = 'R04';
    } else if (non_mantap_pct >= 10 && non_mantap_pct < 25) {
      rule2 = 'R05';
    } else {
      rule2 = 'R06';
    }
  }
  ruleCountsMethod2[rule2]++;
}

console.log('--- Method 1 (Segment Condition + Corridor Thresholds) ---');
console.log(ruleCountsMethod1);

console.log('--- Method 2 (Road Corridor Package Applied to Distressed Segments) ---');
console.log(ruleCountsMethod2);

db.close();
