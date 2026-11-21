import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');

console.log('=== COMPREHENSIVE 350 ROADS RECONCILIATION ===\n');

// 1. Get latest operational scoring run
const latestRun = db.prepare(`
  SELECT sr.run_id, sr.executed_at, sr.operating_mode, pm.model_code
  FROM scoring_runs sr
  JOIN priority_models pm ON sr.model_id = pm.model_id
  WHERE pm.model_code = 'POLICY_DEFAULT_V1' AND sr.operating_mode = 'OPERATIONAL_2025'
  ORDER BY sr.executed_at DESC, sr.run_id DESC
  LIMIT 1
`).get() as any;

console.log('Authoritative Latest Scoring Run:', latestRun);

// 2. Fetch all data per road
const query = `
  SELECT 
    r.road_key,
    r.nomor_ruas,
    r.canonical_name,
    r.length_km_official,
    r.width_m_official,
    rc.total_panjang_km as condition_length_km,
    rc.mantap_km,
    rc.tidak_mantap_km,
    rc.rusak_ringan_km,
    rc.rusak_berat_km,
    rg.geometry_length_m / 1000.0 as geometry_length_km,
    COALESCE(ts.seg_count, 0) as segment_count,
    COALESCE(ts.seg_length_km, 0) as segment_length_km,
    rps.priority_rank,
    rps.final_score as composite_score,
    rcs.total_length_km as rcs_total_length_km,
    rcs.treated_length_km as rcs_treated_length_km,
    rcs.manual_review_length_km as rcs_manual_review_length_km,
    rcs.total_pagu_asb_rp as rcs_pagu_rp,
    rcs.is_funded as rcs_is_funded,
    rcs.status_summary as rcs_status_summary
  FROM roads r
  LEFT JOIN road_conditions rc ON r.road_key = rc.road_key AND rc.survey_year = 2025
  LEFT JOIN road_geometries rg ON r.road_key = rg.road_key
  LEFT JOIN (
    SELECT road_key, COUNT(*) as seg_count, SUM(segment_length_m)/1000.0 as seg_length_km
    FROM treatment_engine_segments
    GROUP BY road_key
  ) ts ON r.road_key = ts.road_key
  LEFT JOIN road_priority_scores rps ON r.road_key = rps.road_key AND rps.run_id = ?
  LEFT JOIN road_cost_summaries rcs ON r.road_key = rcs.road_key AND rcs.scenario_id = 'SCN-2027-BASELINE'
  ORDER BY r.road_key ASC
`;

const rows = db.prepare(query).all(latestRun.run_id) as any[];

console.log(`Loaded ${rows.length} roads.`);

let diffOfficialVsCondition = 0;
let diffOfficialVsSegment = 0;
let diffOfficialVsGeometry = 0;
let zeroCostFundedCount = 0;
let totalOfficialLength = 0;
let totalConditionLength = 0;
let totalSegmentLength = 0;

const lengthDiscrepancies: any[] = [];
const zeroCostFundedRoads: any[] = [];

for (const r of rows) {
  totalOfficialLength += r.length_km_official;
  totalConditionLength += (r.condition_length_km || 0);
  totalSegmentLength += (r.segment_length_km || 0);

  const diffCond = Math.abs(r.length_km_official - (r.condition_length_km || 0));
  if (diffCond > 0.001) {
    diffOfficialVsCondition++;
    lengthDiscrepancies.push({
      road_key: r.road_key,
      name: r.canonical_name,
      official: r.length_km_official,
      condition: r.condition_length_km,
      segment: r.segment_length_km
    });
  }

  const diffSeg = Math.abs(r.length_km_official - (r.segment_length_km || 0));
  if (diffSeg > 0.001) {
    diffOfficialVsSegment++;
  }

  if (r.rcs_is_funded === 1 && r.rcs_pagu_rp === 0) {
    zeroCostFundedCount++;
    zeroCostFundedRoads.push({
      road_key: r.road_key,
      name: r.canonical_name,
      rank: r.priority_rank,
      score: r.composite_score,
      pagu_rp: r.rcs_pagu_rp,
      status: r.rcs_status_summary
    });
  }
}

console.log('\n--- NETWORK METRIC AGGREGATION ---');
console.log(`Total Official Length: ${totalOfficialLength.toFixed(3)} km (Target: 732.460 km)`);
console.log(`Total Condition Survey Length: ${totalConditionLength.toFixed(3)} km`);
console.log(`Total DD1 Segment Length: ${totalSegmentLength.toFixed(3)} km`);
console.log(`Official vs Condition Discrepancies (> 0.001 km): ${diffOfficialVsCondition}`);
console.log(`Official vs Segment Discrepancies (> 0.001 km): ${diffOfficialVsSegment}`);

if (lengthDiscrepancies.length > 0) {
  console.log('Sample Length Discrepancies:', lengthDiscrepancies.slice(0, 5));
} else {
  console.log('ALL 350 ROADS have 100% PERFECT length agreement between official and condition survey!');
}

console.log('\n--- ZERO-COST ROADS CLASSIFIED AS FUNDED IN SCN-2027-BASELINE ---');
console.log(`Count: ${zeroCostFundedCount}`);
console.log(zeroCostFundedRoads);
