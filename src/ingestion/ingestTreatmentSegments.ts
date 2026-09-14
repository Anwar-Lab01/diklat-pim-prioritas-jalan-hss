import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../config/constants.ts';

export interface RawSegment {
  road_key: string;
  canonical_road_name: string;
  raw_road_name: string;
  nomor_ruas: string;
  segment_index: number;
  sta_start_m: number;
  sta_end_m: number;
  panjang_m: number;
  dominant_condition: string;
  segment_status: string;
  jenis_penanganan_norm: string;
  surface_label: string;
  lebar_m: number;
  tahun_survei: number;
}

export interface SegmentFilePayload {
  metadata: {
    source_file: string;
    generated_at: string;
    total_segments: number;
    unique_roads: number;
    validation_status: string;
    note: string;
  };
  segments: RawSegment[];
}

export function ingestTreatmentSegments(db: DatabaseSync): {
  insertedSegments: number;
  totalRoads: number;
  totalLengthM: number;
  breakdownM: {
    baik: number;
    sedang: number;
    rusak_ringan: number;
    rusak_berat: number;
  };
} {
  const candidates = [
    'F:/WebApps/temporary/diklatpim/dd2_damage_segments.json',
    path.resolve(
      PROJECT_ROOT,
      '01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/conditions/dd2_damage_segments.json'
    ),
  ];

  let jsonPath = candidates.find((p) => fs.existsSync(p));
  if (!jsonPath) {
    throw new Error(
      `TREATMENT_SEGMENTS_FILE_NOT_FOUND: neither temporary staging nor authoritative seed file found.`
    );
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const payload: SegmentFilePayload = JSON.parse(raw);
  const segments = payload.segments || [];

  if (segments.length !== 7487) {
    throw new Error(`SEGMENT_COUNT_MISMATCH: expected 7,487 segments, got ${segments.length}`);
  }

  // Clear existing
  db.exec('DELETE FROM treatment_engine_segments;');

  const insertStmt = db.prepare(`
    INSERT INTO treatment_engine_segments (
      segment_id,
      road_key,
      sta_start_m,
      sta_end_m,
      segment_length_m,
      damage_type,
      condition_class,
      dominant_condition,
      segment_status,
      severity,
      damage_area_m2,
      damage_pct,
      surface_type,
      road_width_m,
      recommended_treatment,
      survey_date,
      source,
      source_record_id,
      segment_geometry,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const uniqueRoads = new Set<string>();
  let totalLengthM = 0;
  const breakdownM = {
    baik: 0,
    sedang: 0,
    rusak_ringan: 0,
    rusak_berat: 0,
  };

  for (const s of segments) {
    const canonicalRoadKey = 'HSS-KAB-' + s.nomor_ruas.padStart(3, '0');
    const segmentId = `${canonicalRoadKey}-SEG-${String(s.segment_index).padStart(4, '0')}`;
    
    uniqueRoads.add(canonicalRoadKey);
    totalLengthM += s.panjang_m;
    if (s.dominant_condition === 'baik') breakdownM.baik += s.panjang_m;
    else if (s.dominant_condition === 'sedang') breakdownM.sedang += s.panjang_m;
    else if (s.dominant_condition === 'rusak_ringan') breakdownM.rusak_ringan += s.panjang_m;
    else if (s.dominant_condition === 'rusak_berat') breakdownM.rusak_berat += s.panjang_m;

    insertStmt.run(
      segmentId,
      canonicalRoadKey,
      s.sta_start_m,
      s.sta_end_m,
      s.panjang_m,
      s.dominant_condition, // damage_type
      s.dominant_condition, // condition_class
      s.dominant_condition, // dominant_condition
      s.segment_status,     // segment_status
      s.segment_status,     // severity
      s.panjang_m * s.lebar_m, // damage_area_m2 approximation
      null,                 // damage_pct
      s.surface_label,      // surface_type
      s.lebar_m,            // road_width_m
      s.jenis_penanganan_norm, // recommended_treatment
      String(s.tahun_survei),
      'DD1_CONDITION_SURVEY',
      String(s.segment_index),
      null                  // segment_geometry
    );
  }

  return {
    insertedSegments: segments.length,
    totalRoads: uniqueRoads.size,
    totalLengthM,
    breakdownM,
  };
}
