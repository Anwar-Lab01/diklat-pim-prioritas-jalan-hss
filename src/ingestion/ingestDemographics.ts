import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../config/constants.ts';

export interface DemographicRecord {
  village_id: string;
  village_name: string;
  district_name: string;
  year: number;
  households_total: number;
  households_male: number;
  households_female: number;
  metric_label: string;
  source: string;
  source_reference: string;
}

export function ingestDemographics(db: DatabaseSync): {
  insertedVillages: number;
  totalHouseholds: number;
  totalMale: number;
  totalFemale: number;
} {
  const seedJsonPath = path.resolve(
    PROJECT_ROOT,
    '01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/demographics/village_demographics_2025.json'
  );

  if (!fs.existsSync(seedJsonPath)) {
    throw new Error(`DEMOGRAPHIC_SEED_NOT_FOUND: ${seedJsonPath} does not exist`);
  }

  const raw = fs.readFileSync(seedJsonPath, 'utf8');
  const records: DemographicRecord[] = JSON.parse(raw);

  if (records.length !== 148) {
    throw new Error(`DEMOGRAPHIC_RECORD_COUNT_MISMATCH: expected 148 records, got ${records.length}`);
  }

  // Clear existing
  db.exec('DELETE FROM village_demographics;');

  const insertStmt = db.prepare(`
    INSERT INTO village_demographics (
      village_id,
      year,
      households_total,
      households_male,
      households_female,
      households_kk,
      source,
      source_reference,
      imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  let totalHouseholds = 0;
  let totalMale = 0;
  let totalFemale = 0;

  for (const r of records) {
    insertStmt.run(
      r.village_id,
      r.year,
      r.households_total,
      r.households_male,
      r.households_female,
      r.households_total, // households_kk backward compatibility alias
      r.source,
      r.source_reference
    );
    totalHouseholds += r.households_total;
    totalMale += r.households_male;
    totalFemale += r.households_female;
  }

  return {
    insertedVillages: records.length,
    totalHouseholds,
    totalMale,
    totalFemale,
  };
}
