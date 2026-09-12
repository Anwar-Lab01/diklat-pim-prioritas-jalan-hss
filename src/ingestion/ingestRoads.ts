import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { parseCsv } from './csvParser.ts';

interface RoadRegistryRow {
  road_id: string;
  road_key: string;
  nomor_ruas: string;
  canonical_name: string;
  display_name: string;
  district_2025: string;
  village_source_qgis: string;
  identity_status: string;
}

interface RoadMasterRow {
  road_id: string;
  road_key: string;
  nomor_ruas: string;
  canonical_name: string;
  display_name: string;
  district_2025: string;
  village_source_qgis: string;
  length_km_2025: string;
  width_m_2025: string;
  identity_status: string;
}

interface RoadAliasRow {
  road_key: string;
  canonical_display_name: string;
  alias_name: string;
  source_system: string;
  alias_role: string;
}

export function ingestRoads(db: DatabaseSync): { insertedRoads: number; insertedAliases: number } {
  const registryCsv = fs.readFileSync(SEED_FILES.roadRegistry, 'utf8');
  const masterCsv = fs.readFileSync(SEED_FILES.roadMaster, 'utf8');
  const aliasesCsv = fs.readFileSync(SEED_FILES.roadAliases, 'utf8');

  const registryRows = parseCsv<RoadRegistryRow>(registryCsv);
  const masterRows = parseCsv<RoadMasterRow>(masterCsv);
  const aliasRows = parseCsv<RoadAliasRow>(aliasesCsv);

  if (registryRows.length !== AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT) {
    throw new Error(
      `Registry row count mismatch: expected ${AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT}, got ${registryRows.length}`
    );
  }

  // Create lookup for master physical attributes
  const masterMap = new Map<string, RoadMasterRow>();
  for (const m of masterRows) {
    masterMap.set(m.road_key, m);
  }

  const insertRoadStmt = db.prepare(`
    INSERT INTO roads (
      road_id,
      road_key,
      nomor_ruas,
      canonical_name,
      display_name,
      district_name,
      village_coverage,
      length_km_official,
      width_m_official,
      identity_status,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(road_key) DO UPDATE SET
      nomor_ruas = excluded.nomor_ruas,
      canonical_name = excluded.canonical_name,
      display_name = excluded.display_name,
      district_name = excluded.district_name,
      village_coverage = excluded.village_coverage,
      length_km_official = excluded.length_km_official,
      width_m_official = excluded.width_m_official,
      identity_status = excluded.identity_status,
      updated_at = datetime('now')
  `);

  let insertedRoads = 0;
  for (const reg of registryRows) {
    const master = masterMap.get(reg.road_key);
    const lengthKm = master ? parseFloat(master.length_km_2025) || 0.0 : 0.0;
    const widthM = master ? parseFloat(master.width_m_2025) || 0.0 : 0.0;
    const district = reg.district_2025 || (master ? master.district_2025 : 'Unknown');
    const village = reg.village_source_qgis || (master ? master.village_source_qgis : '');

    insertRoadStmt.run(
      reg.road_id,
      reg.road_key,
      reg.nomor_ruas,
      reg.canonical_name,
      reg.display_name,
      district,
      village,
      lengthKm,
      widthM,
      reg.identity_status || 'AUTHORITATIVE_V1'
    );
    insertedRoads++;
  }

  // Ingest Aliases
  db.exec('DELETE FROM road_aliases;');
  const insertAliasStmt = db.prepare(`
    INSERT INTO road_aliases (
      road_key,
      alias_type,
      alias_name,
      source_reference
    ) VALUES (?, ?, ?, ?)
  `);

  let insertedAliases = 0;
  for (const a of aliasRows) {
    if (a.road_key && a.alias_name) {
      insertAliasStmt.run(a.road_key, a.source_system, a.alias_name, a.alias_role);
      insertedAliases++;
    }
  }

  return { insertedRoads, insertedAliases };
}
