import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT, DB_DIR } from '../src/config/constants.ts';

const SOURCE_DB = path.resolve(DB_DIR, 'diklat_pim.db');
const TARGET_DB = path.resolve(DB_DIR, 'diklat_pim_deploy.db');
const SCHEMA_FILE = path.resolve(PROJECT_ROOT, 'src/db/schema.sql');

async function main() {
  console.log('--- GENERATING COMPACT DEPLOYMENT DATABASE SNAPSHOT ---');
  console.log(`Source DB: ${SOURCE_DB}`);
  console.log(`Target DB: ${TARGET_DB}`);

  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`SOURCE_DB_NOT_FOUND: ${SOURCE_DB} does not exist.`);
  }

  if (fs.existsSync(TARGET_DB)) {
    console.log(`Removing existing target DB: ${TARGET_DB}`);
    fs.unlinkSync(TARGET_DB);
  }

  // Also remove any existing wal/shm if present
  if (fs.existsSync(`${TARGET_DB}-wal`)) fs.unlinkSync(`${TARGET_DB}-wal`);
  if (fs.existsSync(`${TARGET_DB}-shm`)) fs.unlinkSync(`${TARGET_DB}-shm`);

  const srcDb = new DatabaseSync(SOURCE_DB, { readOnly: true });
  const tgtDb = new DatabaseSync(TARGET_DB);

  // Initialize schema on target
  tgtDb.exec('PRAGMA foreign_keys = OFF;'); // Disable FK during bulk copy
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  tgtDb.exec(schemaSql);

  // 1. Authoritative tables to copy in full
  const fullCopyTables = [
    'categories',
    'districts',
    'villages',
    'public_facilities',
    'roads',
    'road_aliases',
    'road_conditions',
    'road_geometries',
    'variable_definitions',
    'road_variable_observations',
    'priority_models',
    'model_category_weights',
    'model_variable_weights',
    'source_crosswalk',
  ];

  for (const table of fullCopyTables) {
    const rows = srcDb.prepare(`SELECT * FROM ${table}`).all() as Record<string, any>[];
    if (rows.length === 0) {
      console.log(`Table ${table}: 0 rows (skipped)`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const insertStmt = tgtDb.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    );

    tgtDb.exec('BEGIN TRANSACTION;');
    for (const row of rows) {
      insertStmt.run(...columns.map((c) => row[c]));
    }
    tgtDb.exec('COMMIT;');

    console.log(`Table ${table}: copied ${rows.length} rows`);
  }

  // 2. Select latest scoring runs for OPERATIONAL_2025 and BENCHMARK_2024
  const latestOperationalRun = srcDb
    .prepare(
      `SELECT * FROM scoring_runs WHERE operating_mode = 'OPERATIONAL_2025' ORDER BY executed_at DESC LIMIT 1`
    )
    .get() as Record<string, any> | undefined;

  const latestBenchmarkRun = srcDb
    .prepare(
      `SELECT * FROM scoring_runs WHERE operating_mode = 'BENCHMARK_2024' ORDER BY executed_at DESC LIMIT 1`
    )
    .get() as Record<string, any> | undefined;

  const runIdsToKeep: string[] = [];
  const scoringRunsToInsert: Record<string, any>[] = [];

  if (latestOperationalRun) {
    runIdsToKeep.push(latestOperationalRun.run_id);
    scoringRunsToInsert.push(latestOperationalRun);
    console.log(
      `Selected latest OPERATIONAL_2025 run: ${latestOperationalRun.run_id} (${latestOperationalRun.executed_at})`
    );
  }

  if (latestBenchmarkRun) {
    runIdsToKeep.push(latestBenchmarkRun.run_id);
    scoringRunsToInsert.push(latestBenchmarkRun);
    console.log(
      `Selected latest BENCHMARK_2024 run: ${latestBenchmarkRun.run_id} (${latestBenchmarkRun.executed_at})`
    );
  }

  if (scoringRunsToInsert.length > 0) {
    const runCols = Object.keys(scoringRunsToInsert[0]);
    const runPlaceholders = runCols.map(() => '?').join(', ');
    const runInsert = tgtDb.prepare(
      `INSERT INTO scoring_runs (${runCols.join(', ')}) VALUES (${runPlaceholders})`
    );

    tgtDb.exec('BEGIN TRANSACTION;');
    for (const run of scoringRunsToInsert) {
      runInsert.run(...runCols.map((c) => run[c]));
    }
    tgtDb.exec('COMMIT;');
    console.log(`Table scoring_runs: inserted ${scoringRunsToInsert.length} runs`);

    // Insert scores for these selected runs
    let totalScoresCopied = 0;
    for (const runId of runIdsToKeep) {
      const scores = srcDb
        .prepare(`SELECT * FROM road_priority_scores WHERE run_id = ?`)
        .all(runId) as Record<string, any>[];

      if (scores.length > 0) {
        const scoreCols = Object.keys(scores[0]);
        const scorePlaceholders = scoreCols.map(() => '?').join(', ');
        const scoreInsert = tgtDb.prepare(
          `INSERT INTO road_priority_scores (${scoreCols.join(', ')}) VALUES (${scorePlaceholders})`
        );

        tgtDb.exec('BEGIN TRANSACTION;');
        for (const score of scores) {
          scoreInsert.run(...scoreCols.map((c) => score[c]));
        }
        tgtDb.exec('COMMIT;');
        totalScoresCopied += scores.length;
      }
    }
    console.log(`Table road_priority_scores: inserted ${totalScoresCopied} score records`);
  }

  // Enable foreign keys back & verify integrity
  tgtDb.exec('PRAGMA foreign_keys = ON;');
  const fkCheck = tgtDb.prepare('PRAGMA foreign_key_check;').all();
  if (fkCheck.length > 0) {
    console.error('Foreign key check failed!', fkCheck);
    throw new Error(`Foreign key check failed with ${fkCheck.length} violations`);
  }
  console.log('Foreign key check PASSED with 0 violations.');

  // Optimize & Vacuum
  console.log('Running VACUUM and optimize...');
  tgtDb.exec('PRAGMA optimize;');
  tgtDb.exec('VACUUM;');

  srcDb.close();
  tgtDb.close();

  const stats = fs.statSync(TARGET_DB);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`Snapshot generated successfully: ${TARGET_DB} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error('Failed to generate deploy db:', err);
  process.exit(1);
});
