import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { parseCsv } from './csvParser.ts';

interface CrosswalkRow {
  source_system: string;
  source_id: string;
  source_name: string;
  road_key: string;
  canonical_display_name: string;
  match_method: string;
  match_status: string;
}

export function ingestCrosswalk(db: DatabaseSync): { insertedCrosswalks: number } {
  const crosswalkCsv = fs.readFileSync(SEED_FILES.sourceCrosswalk, 'utf8');
  const rows = parseCsv<CrosswalkRow>(crosswalkCsv);

  if (rows.length !== AUTHORITY_INVARIANTS.CROSSWALK_COUNT) {
    throw new Error(
      `Crosswalk row count mismatch: expected ${AUTHORITY_INVARIANTS.CROSSWALK_COUNT}, got ${rows.length}`
    );
  }

  const insertStmt = db.prepare(`
    INSERT INTO source_crosswalk (
      crosswalk_id,
      source_system,
      source_id,
      source_name,
      road_key,
      canonical_display,
      match_method,
      match_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_system, source_id) DO UPDATE SET
      source_name = excluded.source_name,
      road_key = excluded.road_key,
      canonical_display = excluded.canonical_display,
      match_method = excluded.match_method,
      match_status = excluded.match_status
  `);

  let insertedCrosswalks = 0;
  for (const row of rows) {
    // Generate deterministic UUIDv5-like crosswalk ID
    const hash = crypto
      .createHash('md5')
      .update(`${row.source_system}:${row.source_id}`)
      .digest('hex');
    const crosswalkId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;

    insertStmt.run(
      crosswalkId,
      row.source_system,
      row.source_id,
      row.source_name,
      row.road_key,
      row.canonical_display_name,
      row.match_method,
      row.match_status || 'VERIFIED'
    );
    insertedCrosswalks++;
  }

  return { insertedCrosswalks };
}
