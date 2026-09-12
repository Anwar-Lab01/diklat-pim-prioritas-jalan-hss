import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { parseCsv } from './csvParser.ts';

interface DistrictMasterRow {
  district_id: string;
  district_name: string;
  village_count: string;
  area_ha_source: string;
  regency_name: string;
  province_name: string;
}

interface VillageMasterRow {
  village_id: string;
  village_name: string;
  admin_type: string;
  district_id: string;
  district_name: string;
  area_ha_source: string;
}

interface PublicFacilityFeature {
  type: string;
  properties: {
    facility_id: string;
    facility_type: string;
    facility_subtype?: string;
    facility_name: string;
    district_name?: string;
    village_name?: string;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
}

interface PublicFacilityGeoJson {
  type: string;
  features: PublicFacilityFeature[];
}

export function ingestAdminAndFacilities(db: DatabaseSync): {
  insertedDistricts: number;
  insertedVillages: number;
  insertedFacilities: number;
} {
  // 1. Ingest Districts
  const districtCsv = fs.readFileSync(SEED_FILES.districtsMaster, 'utf8');
  const districtRows = parseCsv<DistrictMasterRow>(districtCsv);

  const insertDistrictStmt = db.prepare(`
    INSERT INTO districts (
      district_id,
      district_name,
      village_count,
      area_ha,
      regency_name,
      province_name
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(district_id) DO UPDATE SET
      district_name = excluded.district_name,
      village_count = excluded.village_count,
      area_ha = excluded.area_ha,
      regency_name = excluded.regency_name,
      province_name = excluded.province_name
  `);

  let insertedDistricts = 0;
  for (const d of districtRows) {
    insertDistrictStmt.run(
      d.district_id,
      d.district_name,
      parseInt(d.village_count, 10) || 0,
      parseFloat(d.area_ha_source) || null,
      d.regency_name || 'Hulu Sungai Selatan',
      d.province_name || 'Kalimantan Selatan'
    );
    insertedDistricts++;
  }

  // 2. Ingest Villages
  const villageCsv = fs.readFileSync(SEED_FILES.villagesMaster, 'utf8');
  const villageRows = parseCsv<VillageMasterRow>(villageCsv);

  const insertVillageStmt = db.prepare(`
    INSERT INTO villages (
      village_id,
      village_name,
      admin_type,
      district_id,
      district_name,
      area_ha
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(village_id) DO UPDATE SET
      village_name = excluded.village_name,
      admin_type = excluded.admin_type,
      district_id = excluded.district_id,
      district_name = excluded.district_name,
      area_ha = excluded.area_ha
  `);

  let insertedVillages = 0;
  for (const v of villageRows) {
    insertVillageStmt.run(
      v.village_id,
      v.village_name,
      v.admin_type || 'Desa',
      v.district_id,
      v.district_name,
      parseFloat(v.area_ha_source) || null
    );
    insertedVillages++;
  }

  // 3. Ingest Public Facilities
  const facilitiesRaw = fs.readFileSync(SEED_FILES.publicFacilitiesGeoJson, 'utf8');
  const facilitiesGeoJson: PublicFacilityGeoJson = JSON.parse(facilitiesRaw);

  const insertFacilityStmt = db.prepare(`
    INSERT INTO public_facilities (
      facility_id,
      facility_type,
      facility_subtype,
      facility_name,
      district_name,
      village_name,
      latitude,
      longitude,
      source_layer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(facility_id) DO UPDATE SET
      facility_type = excluded.facility_type,
      facility_subtype = excluded.facility_subtype,
      facility_name = excluded.facility_name,
      district_name = excluded.district_name,
      village_name = excluded.village_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      source_layer = excluded.source_layer
  `);

  let insertedFacilities = 0;
  for (const f of facilitiesGeoJson.features) {
    const coords = f.geometry.coordinates;
    const lng = coords[0];
    const lat = coords[1];

    insertFacilityStmt.run(
      f.properties.facility_id,
      f.properties.facility_type,
      f.properties.facility_subtype || null,
      f.properties.facility_name,
      f.properties.district_name || null,
      f.properties.village_name || null,
      lat,
      lng,
      'public_facilities.geojson'
    );
    insertedFacilities++;
  }

  return { insertedDistricts, insertedVillages, insertedFacilities };
}
