import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { DEPLOY_DB_PATH } from '../src/config/constants.ts';

function main() {
  console.log('--- VERIFYING DEPLOYMENT DATABASE INVARIANTS ---');
  console.log(`Testing DB: ${DEPLOY_DB_PATH}`);

  const db = new DatabaseSync(DEPLOY_DB_PATH, { readOnly: true });

  // 1. Table row counts
  const expectedCounts: Record<string, number> = {
    roads: 350,
    source_crosswalk: 1400,
    districts: 11,
    villages: 148,
    public_facilities: 285,
    categories: 4,
    variable_definitions: 17,
    scoring_runs: 2,
    road_priority_scores: 700,
  };

  for (const [table, expected] of Object.entries(expectedCounts)) {
    const res = db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
    assert.strictEqual(res.count, expected, `Table ${table} expected ${expected} rows, got ${res.count}`);
    console.log(`  ✓ Table ${table}: ${res.count} rows (PASS)`);
  }

  // 2. Check latest OPERATIONAL_2025 run
  const run = db.prepare(`
    SELECT run_id FROM scoring_runs
    WHERE operating_mode = 'OPERATIONAL_2025'
    ORDER BY executed_at DESC LIMIT 1
  `).get() as { run_id: string };

  console.log(`  ✓ Latest OPERATIONAL_2025 run_id: ${run.run_id}`);

  // 3. Smoke road ranking checks
  const checks: Array<[string, number]> = [
    ['HSS-KAB-025', 1],
    ['HSS-KAB-001', 12],
    ['HSS-KAB-013', 245],
    ['HSS-KAB-295', 133],
    ['HSS-KAB-350', 169],
  ];

  for (const [roadKey, expectedRank] of checks) {
    const row = db.prepare(`
      SELECT priority_rank, final_score, tier_category
      FROM road_priority_scores
      WHERE run_id = ? AND road_key = ?
    `).get(run.run_id, roadKey) as { priority_rank: number; final_score: number; tier_category: string };

    assert.ok(row, `Road ${roadKey} not found in scores`);
    assert.strictEqual(
      row.priority_rank,
      expectedRank,
      `Road ${roadKey} expected rank ${expectedRank}, got ${row.priority_rank}`
    );
    console.log(
      `  ✓ Invariant Check: ${roadKey} -> Rank #${row.priority_rank} (${row.tier_category}, Score: ${row.final_score.toFixed(6)}) (PASS)`
    );
  }

  // 4. Check tier distribution
  const tiers = db.prepare(`
    SELECT tier_category, count(*) as c
    FROM road_priority_scores
    WHERE run_id = ?
    GROUP BY tier_category
    ORDER BY priority_rank ASC
  `).all(run.run_id) as Array<{ tier_category: string; c: number }>;

  const tierMap = Object.fromEntries(tiers.map((t) => [t.tier_category, t.c]));
  assert.strictEqual(tierMap['TOP_35'], 35, 'TOP_35 must have 35 roads');
  assert.strictEqual(tierMap['TOP_70'], 35, 'TOP_70 must have 35 roads');
  assert.strictEqual(tierMap['TOP_105'], 35, 'TOP_105 must have 35 roads');
  assert.strictEqual(tierMap['REGULAR'], 245, 'REGULAR must have 245 roads');
  console.log('  ✓ Tier distribution: { TOP_35: 35, TOP_70: 35, TOP_105: 35, REGULAR: 245 } (PASS)');

  db.close();
  console.log('\n>> ALL DEPLOYMENT DATABASE CHECKS PASSED SUCCESSFULLY <<');
}

main();
