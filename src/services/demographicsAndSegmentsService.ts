import { DatabaseSync } from 'node:sqlite';

export interface VillageDemographicItem {
  village_id: string;
  village_name: string;
  district_name: string;
  intersection_length_m: number;
  share_of_road_pct: number;
  households_total: number;
  households_male: number;
  households_female: number;
}

export interface RoadDemographicsResult {
  road_key: string;
  metric_label: string;
  survey_year: number;
  source: string;
  source_reference: string;
  village_count: number;
  total_households: number;
  total_households_male: number;
  total_households_female: number;
  villages: VillageDemographicItem[];
}

export interface DD1SegmentItem {
  segment_id: string;
  road_key: string;
  sta_start_m: number;
  sta_end_m: number;
  segment_length_m: number;
  sta_display: string;
  dominant_condition: string;
  condition_label: string;
  segment_status: string;
  status_label: string;
  recommended_treatment: string;
  treatment_label: string;
  surface_type: string;
  road_width_m: number;
  survey_date: string;
}

export interface RoadDD1SegmentsResult {
  road_key: string;
  total_segments: number;
  total_length_m: number;
  has_short_final_segment: boolean;
  last_segment_length_m: number;
  source: string;
  provenance_file: string;
  summary: {
    baik_m: number;
    baik_pct: number;
    sedang_m: number;
    sedang_pct: number;
    rusak_ringan_m: number;
    rusak_ringan_pct: number;
    rusak_berat_m: number;
    rusak_berat_pct: number;
    mantap_m: number;
    mantap_pct: number;
    tidak_mantap_m: number;
    tidak_mantap_pct: number;
  };
  segments: DD1SegmentItem[];
}

export class DemographicsAndSegmentsService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public getRoadDemographics(roadKey: string): RoadDemographicsResult {
    const rows = this.db
      .prepare(`
        SELECT 
          rvi.village_id,
          v.village_name,
          v.district_name,
          rvi.intersection_length_m,
          rvi.share_of_road_pct,
          COALESCE(vd.households_total, 0) as households_total,
          COALESCE(vd.households_male, 0) as households_male,
          COALESCE(vd.households_female, 0) as households_female
        FROM road_village_intersections rvi
        JOIN villages v ON rvi.village_id = v.village_id
        LEFT JOIN village_demographics vd ON rvi.village_id = vd.village_id
        WHERE rvi.road_key = ?
        ORDER BY rvi.intersection_length_m DESC
      `)
      .all(roadKey) as any[];

    let totalHouseholds = 0;
    let totalMale = 0;
    let totalFemale = 0;

    const villages: VillageDemographicItem[] = rows.map((r) => {
      const hTotal = Number(r.households_total);
      const hMale = Number(r.households_male);
      const hFemale = Number(r.households_female);

      totalHouseholds += hTotal;
      totalMale += hMale;
      totalFemale += hFemale;

      return {
        village_id: r.village_id,
        village_name: r.village_name,
        district_name: r.district_name,
        intersection_length_m: Number(r.intersection_length_m),
        share_of_road_pct: Number(r.share_of_road_pct),
        households_total: hTotal,
        households_male: hMale,
        households_female: hFemale,
      };
    });

    return {
      road_key: roadKey,
      metric_label: 'RUMAH TANGGA',
      survey_year: 2025,
      source: 'DISDUKCAPIL_HSS_2025',
      source_reference: 'DATA JUMLAH RUMAH TANGGA.xlsx',
      village_count: villages.length,
      total_households: totalHouseholds,
      total_households_male: totalMale,
      total_households_female: totalFemale,
      villages,
    };
  }

  public getRoadDD1Segments(roadKey: string): RoadDD1SegmentsResult {
    const rows = this.db
      .prepare(`
        SELECT 
          segment_id,
          road_key,
          sta_start_m,
          sta_end_m,
          segment_length_m,
          condition_class,
          dominant_condition,
          segment_status,
          severity,
          recommended_treatment,
          surface_type,
          road_width_m,
          survey_date,
          source,
          source_record_id
        FROM treatment_engine_segments
        WHERE road_key = ?
        ORDER BY sta_start_m ASC
      `)
      .all(roadKey) as any[];

    let totalLengthM = 0;
    let baikM = 0;
    let sedangM = 0;
    let rusakRinganM = 0;
    let rusakBeratM = 0;
    let mantapM = 0;
    let tidakMantapM = 0;

    const conditionMap: Record<string, string> = {
      baik: 'Baik',
      sedang: 'Sedang',
      rusak_ringan: 'Rusak Ringan',
      rusak_berat: 'Rusak Berat',
    };

    const treatmentMap: Record<string, string> = {
      routine: 'Pemeliharaan Rutin',
      periodic: 'Pemeliharaan Berkala',
      holding: 'Rehabilitasi / Penanganan Mendesak',
      reconstruction: 'Rekonstruksi',
    };

    const formatSta = (m: number) => {
      const km = Math.floor(m / 1000);
      const rem = Math.round(m % 1000);
      return `${km}+${String(rem).padStart(3, '0')}`;
    };

    const segments: DD1SegmentItem[] = rows.map((r) => {
      const start = Number(r.sta_start_m);
      const end = Number(r.sta_end_m);
      const len = Number(r.segment_length_m);
      const cond = String(r.dominant_condition || r.condition_class || 'sedang').toLowerCase();
      const status = String(r.segment_status || r.severity || 'mantap').toLowerCase();
      const treatment = String(r.recommended_treatment || 'routine').toLowerCase();

      totalLengthM += len;
      if (cond === 'baik') baikM += len;
      else if (cond === 'sedang') sedangM += len;
      else if (cond === 'rusak_ringan') rusakRinganM += len;
      else if (cond === 'rusak_berat') rusakBeratM += len;

      if (status === 'mantap') mantapM += len;
      else tidakMantapM += len;

      return {
        segment_id: r.segment_id,
        road_key: r.road_key,
        sta_start_m: start,
        sta_end_m: end,
        segment_length_m: len,
        sta_display: `STA ${formatSta(start)} - ${formatSta(end)}`,
        dominant_condition: cond,
        condition_label: conditionMap[cond] || cond,
        segment_status: status,
        status_label: status === 'mantap' ? 'Mantap' : 'Tidak Mantap',
        recommended_treatment: treatment,
        treatment_label: treatmentMap[treatment] || treatment,
        surface_type: r.surface_type || 'Aspal',
        road_width_m: Number(r.road_width_m || 0),
        survey_date: r.survey_date || '2025',
      };
    });

    const safeTotal = totalLengthM > 0 ? totalLengthM : 1;
    const lastSeg = segments[segments.length - 1];
    const lastSegLen = lastSeg ? lastSeg.segment_length_m : 0;
    const hasShortFinal = lastSegLen > 0 && lastSegLen < 100;

    return {
      road_key: roadKey,
      total_segments: segments.length,
      total_length_m: totalLengthM,
      has_short_final_segment: hasShortFinal,
      last_segment_length_m: lastSegLen,
      source: 'DD1_CONDITION_SURVEY',
      provenance_file: 'dd2_damage_segments.json',
      summary: {
        baik_m: baikM,
        baik_pct: Number(((baikM / safeTotal) * 100).toFixed(2)),
        sedang_m: sedangM,
        sedang_pct: Number(((sedangM / safeTotal) * 100).toFixed(2)),
        rusak_ringan_m: rusakRinganM,
        rusak_ringan_pct: Number(((rusakRinganM / safeTotal) * 100).toFixed(2)),
        rusak_berat_m: rusakBeratM,
        rusak_berat_pct: Number(((rusakBeratM / safeTotal) * 100).toFixed(2)),
        mantap_m: mantapM,
        mantap_pct: Number(((mantapM / safeTotal) * 100).toFixed(2)),
        tidak_mantap_m: tidakMantapM,
        tidak_mantap_pct: Number(((tidakMantapM / safeTotal) * 100).toFixed(2)),
      },
      segments,
    };
  }
}
