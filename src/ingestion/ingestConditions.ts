import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { parseCsv } from './csvParser.ts';

interface ConditionRow {
  road_key: string;
  nomor_ruas: string;
  year: string;
  baik_km: string;
  baik_pct: string;
  sedang_km: string;
  sedang_pct: string;
  rusak_ringan_km: string;
  rusak_ringan_pct: string;
  rusak_berat_km: string;
  rusak_berat_pct: string;
  mantap_km: string;
  mantap_pct: string;
  tidak_mantap_km: string;
  tidak_mantap_pct: string;
  source_category: string;
  source_file: string;
  source_sheet: string;
  authority_status: string;
}

export function ingestConditions(db: DatabaseSync): {
  insertedConditions: number;
  totalKm: number;
  mantapKm: number;
  tidakMantapKm: number;
} {
  const conditionsCsv = fs.readFileSync(SEED_FILES.roadConditions2025, 'utf8');
  const rows = parseCsv<ConditionRow>(conditionsCsv);

  if (rows.length !== AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT) {
    throw new Error(
      `Condition row count mismatch: expected ${AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT}, got ${rows.length}`
    );
  }

  const insertStmt = db.prepare(`
    INSERT INTO road_conditions (
      condition_id,
      road_key,
      survey_year,
      baik_km,
      baik_pct,
      sedang_km,
      sedang_pct,
      rusak_ringan_km,
      rusak_ringan_pct,
      rusak_berat_km,
      rusak_berat_pct,
      mantap_km,
      mantap_pct,
      tidak_mantap_km,
      tidak_mantap_pct,
      total_panjang_km,
      authority_status,
      source_filename,
      source_sheet
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(road_key, survey_year) DO UPDATE SET
      baik_km = excluded.baik_km,
      baik_pct = excluded.baik_pct,
      sedang_km = excluded.sedang_km,
      sedang_pct = excluded.sedang_pct,
      rusak_ringan_km = excluded.rusak_ringan_km,
      rusak_ringan_pct = excluded.rusak_ringan_pct,
      rusak_berat_km = excluded.rusak_berat_km,
      rusak_berat_pct = excluded.rusak_berat_pct,
      mantap_km = excluded.mantap_km,
      mantap_pct = excluded.mantap_pct,
      tidak_mantap_km = excluded.tidak_mantap_km,
      tidak_mantap_pct = excluded.tidak_mantap_pct,
      total_panjang_km = excluded.total_panjang_km,
      authority_status = excluded.authority_status,
      source_filename = excluded.source_filename,
      source_sheet = excluded.source_sheet
  `);

  let insertedConditions = 0;
  let totalKm = 0;
  let mantapKm = 0;
  let tidakMantapKm = 0;

  for (const row of rows) {
    const surveyYear = parseInt(row.year, 10) || 2025;
    const bKm = parseFloat(row.baik_km) || 0.0;
    const bPct = parseFloat(row.baik_pct) || 0.0;
    const sKm = parseFloat(row.sedang_km) || 0.0;
    const sPct = parseFloat(row.sedang_pct) || 0.0;
    const rrKm = parseFloat(row.rusak_ringan_km) || 0.0;
    const rrPct = parseFloat(row.rusak_ringan_pct) || 0.0;
    const rbKm = parseFloat(row.rusak_berat_km) || 0.0;
    const rbPct = parseFloat(row.rusak_berat_pct) || 0.0;
    const mKm = parseFloat(row.mantap_km) || 0.0;
    const mPct = parseFloat(row.mantap_pct) || 0.0;
    const tmKm = parseFloat(row.tidak_mantap_km) || 0.0;
    const tmPct = parseFloat(row.tidak_mantap_pct) || 0.0;
    const rowTotal = mKm + tmKm;

    totalKm += rowTotal;
    mantapKm += mKm;
    tidakMantapKm += tmKm;

    const hash = crypto
      .createHash('md5')
      .update(`condition:${row.road_key}:${surveyYear}`)
      .digest('hex');
    const conditionId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;

    insertStmt.run(
      conditionId,
      row.road_key,
      surveyYear,
      bKm,
      bPct,
      sKm,
      sPct,
      rrKm,
      rrPct,
      rbKm,
      rbPct,
      mKm,
      mPct,
      tmKm,
      tmPct,
      rowTotal,
      row.authority_status || 'FINAL_2025',
      row.source_file || 'Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx',
      row.source_sheet || 'Data_Analitik'
    );
    insertedConditions++;
  }

  return {
    insertedConditions,
    totalKm: Math.round(totalKm * 1000) / 1000,
    mantapKm: Math.round(mantapKm * 1000) / 1000,
    tidakMantapKm: Math.round(tidakMantapKm * 1000) / 1000,
  };
}
