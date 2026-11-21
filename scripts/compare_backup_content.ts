import fs from 'node:fs';
import { getDatabase } from '../src/db/connection.ts';

const db = getDatabase();
const backupDb = getDatabase('data/backups/diklat_pim_pre_phase3_2026-11-19T02-57-41-360Z.db');

// Check roads content (excluding created_at, updated_at)
const r1 = db.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, village_coverage, length_km_official, width_m_official, identity_status FROM roads ORDER BY road_key').all();
const r2 = backupDb.prepare('SELECT road_id, road_key, nomor_ruas, canonical_name, display_name, district_name, village_coverage, length_km_official, width_m_official, identity_status FROM roads ORDER BY road_key').all();

console.log('roads content match:', JSON.stringify(r1) === JSON.stringify(r2));

// Check segments content (excluding created_at)
const s1 = db.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, damage_type, condition_class, dominant_condition, segment_status, severity, damage_area_m2, damage_pct, surface_type, road_width_m, recommended_treatment, survey_date, source, source_record_id, segment_geometry FROM treatment_engine_segments ORDER BY segment_id').all();
const s2 = backupDb.prepare('SELECT segment_id, road_key, sta_start_m, sta_end_m, segment_length_m, damage_type, condition_class, dominant_condition, segment_status, severity, damage_area_m2, damage_pct, surface_type, road_width_m, recommended_treatment, survey_date, source, source_record_id, segment_geometry FROM treatment_engine_segments ORDER BY segment_id').all();

console.log('segments content match:', JSON.stringify(s1) === JSON.stringify(s2));
