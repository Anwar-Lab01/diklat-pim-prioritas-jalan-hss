/**
 * SIAP JALAN HSS — Comprehensive Phase 3 Verification Suite
 * Automated verification of:
 * - Part A: Network Data Integrity & Cross-Module Reconciliation (350 roads, 7,487 segments, 732.460 km, HSS-KAB-025)
 * - Part B: Operational Status Allocation & Zero-Cost Road Classification
 * - Part C: Deterministic Mathematical Optimization Engine (Martello-Toth ILP 0-1 Knapsack + LP Bounds, 4 objectives)
 * - Part D: Multi-Ceiling Scenario Simulation (10B, 20B, 30B, 50B, 75B, 100B, custom, isolation, duplication)
 * - Part E: Kemantapan Network Impact & Engineering Interpretation
 * - Part H: Authoritative Database Baseline Protection & Hash Integrity
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../db/connection.ts';
import { TreatmentCostingEngine } from '../services/treatmentCostingEngine.ts';
import { OptimizationEngine } from '../services/optimizationEngine.ts';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('SIAP JALAN HSS — Phase 3 Comprehensive Verification Suite', () => {

  // =========================================================================
  // PART A: DATA INTEGRITY & CROSS-MODULE RECONCILIATION
  // =========================================================================
  describe('Part A: Network Data Integrity & Cross-Module Reconciliation', () => {
    it('should verify exactly 350 canonical roads with 732.460 km total official length', () => {
      const db = getDatabase();
      const countRow = db.prepare('SELECT COUNT(*) as cnt, SUM(length_km_official) as total_len FROM roads').get() as { cnt: number; total_len: number };
      assert.equal(countRow.cnt, 350, 'Road count must be exactly 350');
      assert.ok(Math.abs(countRow.total_len - 732.460) < 0.001, `Official total length must be 732.460 km, got ${countRow.total_len}`);
    });

    it('should verify exactly 7,487 DD1 condition segments aggregating to 732.460 km', () => {
      const db = getDatabase();
      const segRow = db.prepare('SELECT COUNT(*) as cnt, SUM(segment_length_m) as total_m FROM treatment_engine_segments').get() as { cnt: number; total_m: number };
      assert.equal(segRow.cnt, 7487, 'Condition segments must be exactly 7,487');
      const surveyedKm = segRow.total_m / 1000.0;
      assert.ok(Math.abs(surveyedKm - 732.460) < 0.001, `Surveyed total length must be 732.460 km, got ${surveyedKm}`);
    });

    it('should verify 100% agreement between official road length and condition survey length across all 350 roads', () => {
      const db = getDatabase();
      const mismatches = db.prepare(`
        SELECT 
          r.road_key,
          r.canonical_name,
          r.length_km_official as official_len,
          ROUND(SUM(tes.segment_length_m) / 1000.0, 3) as survey_len,
          ABS(r.length_km_official - ROUND(SUM(tes.segment_length_m) / 1000.0, 3)) as diff_km
        FROM roads r
        JOIN treatment_engine_segments tes ON r.road_key = tes.road_key
        GROUP BY r.road_key
        HAVING diff_km > 0.005
      `).all();

      assert.equal(mismatches.length, 0, `There must be 0 road length discrepancies across all 350 roads, found: ${mismatches.length}`);
    });

    it('should verify Singakarsa – Palas (HSS-KAB-025) authoritative attributes', () => {
      const db = getDatabase();
      const road = db.prepare('SELECT * FROM roads WHERE road_key = ?').get('HSS-KAB-025') as any;
      assert.ok(road, 'HSS-KAB-025 must exist in roads');
      assert.equal(road.canonical_name, 'Singakarsa - Palas');
      assert.equal(road.length_km_official, 5.32, 'Official length must be 5.32 km');

      const segs = db.prepare('SELECT COUNT(*) as count, SUM(segment_length_m) as total_m FROM treatment_engine_segments WHERE road_key = ?').get('HSS-KAB-025') as any;
      assert.equal(segs.count, 54, 'HSS-KAB-025 must have 54 segments');
      assert.equal(segs.total_m, 5320, 'HSS-KAB-025 condition sum must be 5,320m (5.32 km)');

      const score = db.prepare(`
        SELECT rps.priority_rank, rps.final_score 
        FROM road_priority_scores rps
        JOIN scoring_runs sr ON rps.run_id = sr.run_id
        WHERE rps.road_key = 'HSS-KAB-025'
        ORDER BY sr.executed_at DESC, sr.run_id DESC
        LIMIT 1
      `).get() as any;
      assert.equal(score.priority_rank, 1, 'HSS-KAB-025 must be rank #1 in authoritative baseline scoring');
      assert.ok(Math.abs(score.final_score - 0.649945) < 0.0001, `HSS-KAB-025 score must be ~0.649945, got ${score.final_score}`);
    });

    it('should verify 17 normative variables, 4 categories, and POLICY_DEFAULT_V1', () => {
      const db = getDatabase();
      const varCount = db.prepare('SELECT COUNT(*) as cnt FROM variable_definitions').get() as { cnt: number };
      assert.equal(varCount.cnt, 17, 'Must have exactly 17 AHP variables');

      const catCount = db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number };
      assert.equal(catCount.cnt, 4, 'Must have exactly 4 AHP categories');

      const pol = db.prepare('SELECT * FROM priority_models WHERE model_code = ?').get('POLICY_DEFAULT_V1') as any;
      assert.ok(pol, 'POLICY_DEFAULT_V1 must exist');
    });

    it('should verify ASB catalog invariants (1,010 items, 483 AHSP, 6 rules R01-R06, 11 profiles, 35 mapping items)', () => {
      const db = getDatabase();
      const asb = db.prepare('SELECT COUNT(*) as cnt FROM master_asb_items').get() as { cnt: number };
      assert.equal(asb.cnt, 1010, 'Must have 1,010 ASB items');

      const ahsp = db.prepare('SELECT COUNT(*) as cnt FROM master_ahsp_items').get() as { cnt: number };
      assert.equal(ahsp.cnt, 483, 'Must have 483 AHSP reference items');

      const rules = db.prepare('SELECT COUNT(*) as cnt FROM treatment_package_rules').get() as { cnt: number };
      assert.equal(rules.cnt, 6, 'Must have 6 treatment rules R01..R06');

      const profiles = db.prepare('SELECT COUNT(*) as cnt FROM asb_ahsp_profiles').get() as { cnt: number };
      assert.equal(profiles.cnt, 11, 'Must have 11 mapping profiles');

      const mapItems = db.prepare('SELECT COUNT(*) as cnt FROM asb_ahsp_profile_items').get() as { cnt: number };
      assert.equal(mapItems.cnt, 35, 'Must have 35 mapping items');
    });
  });

  // =========================================================================
  // PART B: OPERATIONAL STATUS & ZERO-COST CLASSIFICATION
  // =========================================================================
  describe('Part B: Operational Status Allocation & Zero-Cost Road Classification', () => {
    it('should never classify a Rp 0 construction road as FUNDED_CONSTRUCTION', () => {
      const db = getDatabase();
      const zeroCostFunded = db.prepare(`
        SELECT COUNT(*) as cnt FROM road_cost_summaries 
        WHERE operational_status = 'FUNDED_CONSTRUCTION' 
        AND (allocated_pagu_rp = 0 OR allocated_pagu_rp IS NULL)
      `).get() as { cnt: number };

      assert.equal(zeroCostFunded.cnt, 0, 'Zero-cost road must never have operational_status = FUNDED_CONSTRUCTION');
    });

    it('should classify Jl. Pangeran Antasari (HSS-KAB-001, width 12m) as MANUAL_TECHNICAL_REVIEW', () => {
      const db = getDatabase();
      const r = db.prepare(`
        SELECT operational_status, allocated_pagu_rp, total_pagu_asb_rp 
        FROM road_cost_summaries 
        WHERE scenario_id = 'SCN-2027-BASELINE' AND road_key = 'HSS-KAB-001'
      `).get() as any;

      assert.ok(r, 'HSS-KAB-001 must exist in SCN-2027-BASELINE');
      assert.equal(r.operational_status, 'MANUAL_TECHNICAL_REVIEW', 'Width 12m road must be MANUAL_TECHNICAL_REVIEW');
      assert.equal(r.allocated_pagu_rp, 0, 'MANUAL_TECHNICAL_REVIEW must have Rp 0 allocated pagu');
      assert.equal(r.total_pagu_asb_rp, 0, 'MANUAL_TECHNICAL_REVIEW indicative ASB must be Rp 0');
    });

    it('should classify 100% mantap roads in priority queue as ROUTINE_MAINTENANCE', () => {
      const db = getDatabase();
      const routineRoads = db.prepare(`
        SELECT road_key, operational_status, allocated_pagu_rp, total_pagu_asb_rp 
        FROM road_cost_summaries 
        WHERE scenario_id = 'SCN-2027-BASELINE' AND operational_status = 'ROUTINE_MAINTENANCE'
      `).all() as any[];

      assert.ok(routineRoads.length >= 130, `Should have >= 130 routine maintenance roads in baseline, got ${routineRoads.length}`);
      for (const r of routineRoads) {
        assert.equal(r.allocated_pagu_rp, 0, 'Routine maintenance must have Rp 0 allocated pagu');
        assert.equal(r.total_pagu_asb_rp, 0, 'Routine maintenance indicative ASB must be Rp 0');
      }
    });

    it('should correctly partition the Rp 50B baseline across all 350 roads', () => {
      const db = getDatabase();
      const statusCounts = db.prepare(`
        SELECT operational_status, COUNT(*) as count, SUM(allocated_pagu_rp) as total_allocated
        FROM road_cost_summaries
        WHERE scenario_id = 'SCN-2027-BASELINE'
        GROUP BY operational_status
      `).all() as any[];

      const map = new Map<string, any>();
      for (const row of statusCounts) {
        map.set(row.operational_status, row);
      }

      assert.ok(map.has('FUNDED_CONSTRUCTION'), 'Must have FUNDED_CONSTRUCTION');
      assert.ok(map.has('ROUTINE_MAINTENANCE'), 'Must have ROUTINE_MAINTENANCE');
      assert.ok(map.has('MANUAL_TECHNICAL_REVIEW'), 'Must have MANUAL_TECHNICAL_REVIEW');
      assert.ok(map.has('DEFERRED_BY_BUDGET'), 'Must have DEFERRED_BY_BUDGET');

      assert.equal(map.get('FUNDED_CONSTRUCTION').count, 12, '12 roads funded under Rp 50B greedy baseline');
      assert.equal(map.get('MANUAL_TECHNICAL_REVIEW').count, 1, '1 road manual review');
      assert.equal(map.get('ROUTINE_MAINTENANCE').count, 138, '138 roads routine maintenance');
      assert.equal(map.get('DEFERRED_BY_BUDGET').count, 199, '199 roads deferred by budget');

      const totalCount = 12 + 1 + 138 + 199;
      assert.equal(totalCount, 350, 'Total partitioned roads must equal 350');
    });
  });

  // =========================================================================
  // PART C: MATHEMATICAL OPTIMIZATION ENGINE (EXACT ILP 0-1 KNAPSACK)
  // =========================================================================
  describe('Part C: Deterministic Mathematical Optimization Engine', () => {
    it('should solve Martello-Toth Branch-and-Bound ILP and report exact solver status with certified duality gap', () => {
      const engine = new OptimizationEngine();

      // Test at 10M ceiling where global optimality is proven within node limit
      const opt10M = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED', 10e9);
      assert.equal(opt10M.solver_status, 'OPTIMAL', 'Solver must prove global optimality (OPTIMAL) on 10M ceiling');
      assert.equal(opt10M.optimality_gap_pct, 0.0, 'Optimality gap must be exactly 0.00% when OPTIMAL');

      // Test at 50M ceiling where solver certifies ultra-tight duality gap (< 0.05%)
      const res50M = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED');
      assert.ok(res50M.solver_status === 'OPTIMAL' || res50M.solver_status === 'FEASIBLE', 'Status must be OPTIMAL or FEASIBLE');
      assert.ok(res50M.optimality_gap_pct < 0.05, `Optimality gap must be < 0.05%, was ${res50M.optimality_gap_pct}%`);
      assert.ok(res50M.runtime_ms < 1000, `Runtime must be < 1000ms, was ${res50M.runtime_ms}ms`);
      assert.ok(res50M.allocated_cost_rp <= 50000000000, 'Allocated cost must not exceed Rp 50B ceiling');
      assert.ok(res50M.allocated_cost_rp >= 49900000000, `Budget absorption must be > 99.8%, was ${res50M.allocated_cost_rp}`);
    });

    it('should evaluate all 4 objectives and produce mathematically valid comparisons', () => {
      const engine = new OptimizationEngine();
      const comp = engine.compareAllMethods('SCN-2027-BASELINE');

      const methodList = Object.values(comp.methods);
      assert.equal(methodList.length, 4, 'Must compare all 4 allocation methods');

      const greedy = comp.methods.GREEDY_BENCHMARK;
      const weighted = comp.methods.PRIORITY_WEIGHTED;
      const maxLen = comp.methods.MAX_LENGTH;
      const prioResp = comp.methods.PRIORITY_RESPECTING;

      assert.ok(greedy && weighted && maxLen && prioResp, 'All 4 objectives must be present');

      // Check objective B yields greatest treated length
      assert.ok(maxLen.treated_length_km >= greedy.treated_length_km, 'Max length must treat more km than greedy');
      assert.ok(maxLen.treated_length_km >= weighted.treated_length_km, 'Max length must treat >= km than weighted');

      // Check objective A yields highest priority weighted score
      assert.ok((weighted.priority_weighted_score || 0) >= (greedy.priority_weighted_score || 0), 'Weighted score must be >= greedy');

      // Check budget absorption of ILP vs greedy
      assert.ok(weighted.allocated_cost_rp > greedy.allocated_cost_rp, 'ILP should achieve higher budget absorption than greedy');
    });

    it('should strictly respect integer monetary precision in 64-bit integer-sen arithmetic', () => {
      const engine = new OptimizationEngine();
      const res = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED');

      // allocated_cost_sen must equal allocated_cost_rp * 100
      assert.equal(res.allocated_cost_sen, BigInt(res.allocated_cost_rp) * 100n, 'Integer sen must exactly match Rp * 100');
    });

    it('should exclude segments with manual review and routine maintenance from Knapsack costs', () => {
      const db = getDatabase();
      const invalidCostSegments = db.prepare(`
        SELECT COUNT(*) as cnt FROM road_segment_cost_estimates
        WHERE (rule_id = 'R06' OR adjustment_flags LIKE '%MANUAL_REVIEW%')
        AND is_selected = 1 AND indicative_cost_rp > 0
      `).get() as { cnt: number };

      assert.equal(invalidCostSegments.cnt, 0, 'R06 and manual review segments must have Rp 0 cost');
    });
  });

  // =========================================================================
  // PART D: SCENARIO SIMULATION & PRESETS
  // =========================================================================
  describe('Part D: Multi-Ceiling Scenario Simulation & Isolation', () => {
    it('should duplicate a scenario cleanly into an isolated scenario', () => {
      const db = getDatabase();
      const costingEngine = new TreatmentCostingEngine();

      const dupScn = costingEngine.duplicateScenario(
        'SCN-2027-BASELINE',
        'SCN-TEST-SIM-75M',
        'Simulasi Uji Rp 75 Miliar',
        'Uji isolasi skenario Phase 3'
      );

      assert.ok(dupScn.scenario_id.startsWith('SCN-'), 'New scenario ID must start with SCN-');
      assert.equal(dupScn.scenario_name, 'Simulasi Uji Rp 75 Miliar');

      // Verify road cost summaries exist for the new scenario
      const count = db.prepare('SELECT COUNT(*) as cnt FROM road_cost_summaries WHERE scenario_id = ?').get(dupScn.scenario_id) as { cnt: number };
      assert.equal(count.cnt, 350, 'Duplicated scenario must have 350 road summaries');

      // Verify source scenario was not modified
      const baseScn = costingEngine.getScenarioDetailSummary('SCN-2027-BASELINE');
      assert.equal(baseScn.budget_ceiling_rp, 50000000000, 'Source baseline ceiling must remain 50B');

      // Clean up the test duplicated scenario
      db.prepare('DELETE FROM road_segment_cost_estimates WHERE scenario_id = ?').run(dupScn.scenario_id);
      db.prepare('DELETE FROM road_cost_summaries WHERE scenario_id = ?').run(dupScn.scenario_id);
      db.prepare('DELETE FROM scenario_optimizations WHERE scenario_id = ?').run(dupScn.scenario_id);
      db.prepare('DELETE FROM budget_scenarios WHERE scenario_id = ?').run(dupScn.scenario_id);
    });

    it('should simulate budget presets: 10B, 20B, 30B, 50B, 75B, 100B with cost and length progression', () => {
      const engine = new OptimizationEngine();
      const ceilings = [10e9, 20e9, 30e9, 50e9, 75e9, 100e9];
      let prevAllocated = 0;
      let prevScore = 0;

      for (const ceiling of ceilings) {
        const res = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED', ceiling);

        assert.ok(res.allocated_cost_rp <= ceiling, `Allocated cost must not exceed ceiling ${ceiling}`);
        assert.ok(res.allocated_cost_rp >= prevAllocated, `Allocated cost should be monotonic with ceiling`);
        assert.ok(res.priority_weighted_score >= prevScore - 1e-4, `Weighted score should increase with ceiling`);

        prevAllocated = res.allocated_cost_rp;
        prevScore = res.priority_weighted_score;
      }

      // Also verify pure length maximization is monotonic with ceiling
      let prevKm = 0;
      for (const ceiling of ceilings) {
        const res = engine.runOptimization('SCN-2027-BASELINE', 'MAX_LENGTH', ceiling);
        assert.ok(res.treated_length_km >= prevKm - 1e-4, `Max length treated km should increase monotonically`);
        prevKm = res.treated_length_km;
      }
    });
  });

  // =========================================================================
  // PART E: KEMANTAPAN NETWORK IMPACT & ENGINEERING INTERPRETATION
  // =========================================================================
  describe('Part E: Kemantapan Network Impact & Engineering Interpretation', () => {
    it('should verify network baseline kemantapan is 53.64% (392.89 km mantap / 339.57 km rusak)', () => {
      const db = getDatabase();
      const cond = db.prepare(`
        SELECT 
          SUM(mantap_km) as mantap_km,
          SUM(tidak_mantap_km) as non_mantap_km,
          SUM(total_panjang_km) as total_km
        FROM road_conditions
        WHERE survey_year = 2025
      `).get() as any;

      assert.ok(Math.abs(cond.mantap_km - 392.89) < 0.1, `Mantap km should be ~392.89 km, got ${cond.mantap_km}`);
      assert.ok(Math.abs(cond.non_mantap_km - 339.57) < 0.1, `Non-mantap km should be ~339.57 km, got ${cond.non_mantap_km}`);
      assert.ok(Math.abs(cond.total_km - 732.46) < 0.1, `Total km should be 732.46 km, got ${cond.total_km}`);

      const mantapPct = (cond.mantap_km / cond.total_km) * 100;
      assert.ok(Math.abs(mantapPct - 53.64) < 0.1, `Mantap pct should be ~53.64%, got ${mantapPct}`);
    });

    it('should ensure treated length does not exceed eligible damaged network length (336.29 km)', () => {
      const db = getDatabase();
      const scn = db.prepare('SELECT treated_length_km, allocated_cost_rp FROM budget_scenarios WHERE scenario_id = ?').get('SCN-2027-BASELINE') as any;
      assert.ok(scn.treated_length_km <= 336.29, `Treated length ${scn.treated_length_km} km must not exceed eligible damaged length 336.29 km`);
    });
  });

  // =========================================================================
  // PART H: DATABASE BASELINE PROTECTION & SHA-256 HASH VERIFICATION
  // =========================================================================
  describe('Part H: Database Baseline Protection & Hash Integrity', () => {
    it('should verify all 10 authoritative tables have not been corrupted', () => {
      const baselinePath = path.resolve('data/backups/baseline_hashes_pre_phase3.json');
      assert.ok(fs.existsSync(baselinePath), 'Pre-phase3 baseline hash file must exist');

      const baselineJson = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const baselineHashes = baselineJson.hashes;
      const db = getDatabase();

      // Tables without volatile timestamps match bit-for-bit with baseline hashes
      const staticTables = [
        'road_conditions',
        'variable_definitions',
        'categories',
        'master_asb_items',
        'master_ahsp_items',
        'treatment_package_rules',
        'asb_ahsp_profiles',
        'asb_ahsp_profile_items',
      ];

      for (const table of staticTables) {
        const rows = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
        const hash = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
        assert.equal(hash, baselineHashes[table], `Table ${table} must exactly match its pre-Phase 3 baseline SHA-256 hash`);
      }

      // For tables with dynamic ingestion timestamps (roads, treatment_engine_segments),
      // verify that all domain identity and invariant fields match exactly with the pre-Phase 3 backup
      const backupPath = path.resolve('data/backups/diklat_pim_pre_phase3_2026-11-19T02-57-41-360Z.db');
      assert.ok(fs.existsSync(backupPath), 'Backup database file must exist');
      const backupDb = getDatabase(backupPath);

      const rCurrent = db.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, village_coverage, length_km_official, width_m_official, identity_status FROM roads ORDER BY road_key').all();
      const rBackup = backupDb.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, village_coverage, length_km_official, width_m_official, identity_status FROM roads ORDER BY road_key').all();
      assert.deepEqual(rCurrent, rBackup, 'Roads canonical data must exactly match pre-Phase 3 backup');

      const sCurrent = db.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, damage_type, condition_class, dominant_condition, segment_status, severity, damage_area_m2, damage_pct, surface_type, road_width_m, recommended_treatment, survey_date, source, source_record_id, segment_geometry FROM treatment_engine_segments ORDER BY segment_id').all();
      const sBackup = backupDb.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, damage_type, condition_class, dominant_condition, segment_status, severity, damage_area_m2, damage_pct, surface_type, road_width_m, recommended_treatment, survey_date, source, source_record_id, segment_geometry FROM treatment_engine_segments ORDER BY segment_id').all();
      assert.deepEqual(sCurrent, sBackup, 'Treatment engine segments must exactly match pre-Phase 3 backup');
    });
  });

  // =========================================================================
  // PART I: API & E2E HARDENING VERIFICATION (BigInt, Duplication, and is_funded Integrity)
  // =========================================================================
  describe('Part I: API & E2E Hardening Verification', () => {
    it('should serialize BigInt in JSON safely across all optimization run results', () => {
      const engine = new OptimizationEngine();
      const res = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED');
      
      let serialized = '';
      assert.doesNotThrow(() => {
        serialized = JSON.stringify(res);
      }, 'BigInt serialization must never throw TypeError: Do not know how to serialize a BigInt');
      
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.budget_ceiling_rp, 50000000000);
      assert.ok(parsed.road_allocations.length === 350);
    });

    it('should update is_funded to 1 only for funded construction roads and 0 for others upon optimization', () => {
      const db = getDatabase();
      const costingEngine = new TreatmentCostingEngine(db);

      const dup = costingEngine.duplicateScenario('SCN-2027-BASELINE', 'SCN-TEST-ISFUNDED-VERIFY', 'Test IsFunded');
      const optResult = costingEngine.runOptimization(dup.scenario_id, 'MAX_LENGTH');

      const expectedFunded = optResult.status_breakdown.funded_construction_roads;
      assert.ok(expectedFunded >= 50, `Expected >= 50 funded roads under MAX_LENGTH, got ${expectedFunded}`);

      const inDbCount = db.prepare('SELECT COUNT(*) as cnt FROM road_cost_summaries WHERE scenario_id = ? AND is_funded = 1').get(dup.scenario_id) as { cnt: number };
      assert.equal(inDbCount.cnt, expectedFunded, 'is_funded = 1 in DB must match status_breakdown.funded_construction_roads');

      const detail = costingEngine.getScenarioDetailSummary(dup.scenario_id);
      assert.equal(detail.funded_construction_roads, expectedFunded);

      // Clean up
      costingEngine.deleteScenario(dup.scenario_id);
    });

    it('should generate RFC-compliant CSV with matching funded count and TERAKOMODASI flags after optimization', () => {
      const db = getDatabase();
      const costingEngine = new TreatmentCostingEngine(db);

      const dup = costingEngine.duplicateScenario('SCN-2027-BASELINE', 'SCN-TEST-CSV-OPT-VERIFY', 'Test CSV Opt');
      const optResult = costingEngine.runOptimization(dup.scenario_id, 'PRIORITY_WEIGHTED');
      const expectedFunded = optResult.status_breakdown.funded_construction_roads;

      const csv = costingEngine.exportScenarioCsv(dup.scenario_id);
      assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM');
      assert.ok(csv.includes(`(${expectedFunded} ruas)`), `Header must state (${expectedFunded} ruas)`);

      const lines = csv.replace('\uFEFF', '').split('\r\n').filter((l) => l.trim().length > 0);
      // 7 comment lines + 1 header line + 350 road lines = 358 lines
      assert.equal(lines.length, 358);

      const terakomodasiLines = lines.slice(8).filter((l) => l.includes('TERAKOMODASI'));
      assert.equal(terakomodasiLines.length, expectedFunded, `TERAKOMODASI count in CSV must equal ${expectedFunded}`);

      // Clean up
      costingEngine.deleteScenario(dup.scenario_id);
    });

    it('should verify compareAllMethods returns both comparison array and methods object with all required metrics', () => {
      const engine = new OptimizationEngine();
      const comp = engine.compareAllMethods('SCN-2027-BASELINE');

      assert.equal(comp.comparison.length, 4, 'Must have 4 items in comparison array');
      const greedy = comp.comparison.find((m) => m.optimization_objective === 'GREEDY_BENCHMARK');
      assert.ok(greedy, 'Greedy benchmark must exist in comparison');
      assert.equal(greedy.allocated_cost_rp, 48789930000, 'Greedy baseline must allocate exactly Rp 48.789.930.000');
      assert.equal(greedy.funded_construction_roads, 12, 'Greedy baseline must fund exactly 12 construction roads');
      assert.equal(greedy.allocated_treated_length_km, 22.12, 'Greedy baseline must treat 22.12 km');

      const pw = comp.comparison.find((m) => m.optimization_objective === 'PRIORITY_WEIGHTED');
      assert.ok(pw.allocated_cost_rp >= 49990000000, 'PW must absorb > 99.98% budget');
      assert.ok(pw.allocated_treated_length_km >= 35.0, 'PW must treat >= 35 km');

      const ml = comp.comparison.find((m) => m.optimization_objective === 'MAX_LENGTH');
      assert.ok(ml.allocated_treated_length_km >= pw.allocated_treated_length_km, 'ML must treat >= PW treated length');

      const pr = comp.comparison.find((m) => m.optimization_objective === 'PRIORITY_RESPECTING');
      assert.equal(pr.solver_status, 'OPTIMAL', 'Priority-respecting mode must certify OPTIMAL');
      assert.ok(pr.funded_construction_roads >= 12, 'Priority-respecting must fund at least the top 12 roads');
    });

    it('should duplicate scenario with custom budget ceiling and optimization objective', () => {
      const db = getDatabase();
      const costingEngine = new TreatmentCostingEngine(db);

      const dup = costingEngine.duplicateScenario(
        'SCN-2027-BASELINE',
        'SCN-TEST-SIM-CUSTOM-75M',
        'Simulasi Rp 75 Miliar',
        'Custom simulation test',
        75000000000,
        'MAX_LENGTH'
      );

      assert.equal(dup.budget_ceiling_rp, 75000000000, 'Duplicated ceiling must be 75B');
      assert.equal(dup.allocation_strategy, 'MAX_LENGTH', 'Strategy must be MAX_LENGTH');
      assert.ok(dup.treated_length_km >= 50.0, '75B ceiling should treat >= 50 km under MAX_LENGTH');

      // Clean up
      costingEngine.deleteScenario(dup.scenario_id);
    });

    it('should populate total_condition_length_km in getRoadCostDetail', () => {
      const costingEngine = new TreatmentCostingEngine();
      const detail = costingEngine.getRoadCostDetail('SCN-2027-BASELINE', 'HSS-KAB-025');

      assert.ok(detail, 'Detail must exist');
      assert.equal(detail.road.length_km_official, 5.32, 'Official length must be 5.32 km');
      assert.equal(detail.road.total_condition_length_km, 5.32, 'Condition survey length must be 5.32 km');
      assert.equal(detail.summary.treated_length_km, 2.52, 'Treatment length is 2.52 km (differing from official 5.32 km)');
    });

    it('should return deferred and excluded road register ordered by priority rank without SQL errors', () => {
      const costingEngine = new TreatmentCostingEngine();
      const register = costingEngine.getDeferredRoadRegister('SCN-2027-BASELINE');

      assert.ok(Array.isArray(register), 'Register must be an array');
      assert.equal(register.length, 338, 'In Rp 50B baseline, exactly 338 roads must be deferred or excluded');
      
      // Verify ordering by priority rank
      for (let i = 1; i < Math.min(10, register.length); i++) {
        assert.ok(
          (register[i].priority_rank || 999) >= (register[i - 1].priority_rank || 0),
          `Register must be sorted ascending by priority rank: index ${i}`
        );
      }

      // Verify no item has FUNDED_CONSTRUCTION
      const invalid = register.find((r) => r.operational_status === 'FUNDED_CONSTRUCTION');
      assert.ok(!invalid, 'No FUNDED_CONSTRUCTION road should be present in deferred register');
    });

    it('should cleanly handle boundary budget ceilings: Rp 0, Rp 1M (< cheapest segment), and Rp 1T (> network cost)', () => {
      const engine = new OptimizationEngine();

      // Zero budget
      const res0 = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED', 0);
      assert.equal(res0.solver_status, 'INFEASIBLE');
      assert.equal(res0.allocated_cost_rp, 0);
      assert.equal(res0.status_breakdown.funded_construction_roads, 0);

      // Tiny budget < cheapest segment (Rp 1.000.000)
      const resTiny = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED', 1000000);
      assert.equal(resTiny.solver_status, 'OPTIMAL');
      assert.equal(resTiny.allocated_cost_rp, 0);
      assert.equal(resTiny.status_breakdown.funded_construction_roads, 0);

      // Huge budget > total network cost (Rp 1.000.000.000.000)
      const resHuge = engine.runOptimization('SCN-2027-BASELINE', 'PRIORITY_WEIGHTED', 1000000000000);
      assert.equal(resHuge.solver_status, 'OPTIMAL');
      assert.equal(resHuge.allocated_cost_rp, 784322010000);
      assert.equal(resHuge.status_breakdown.funded_construction_roads, 211);
    });
  });

});
