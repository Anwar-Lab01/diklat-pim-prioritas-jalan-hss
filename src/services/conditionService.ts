import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

export interface RoadConditionEntity {
  condition_id: string;
  road_key: string;
  survey_year: number;
  baik_km: number;
  baik_pct: number;
  sedang_km: number;
  sedang_pct: number;
  rusak_ringan_km: number;
  rusak_ringan_pct: number;
  rusak_berat_km: number;
  rusak_berat_pct: number;
  mantap_km: number;
  mantap_pct: number;
  tidak_mantap_km: number;
  tidak_mantap_pct: number;
  total_panjang_km: number;
  authority_status: string;
  source_filename: string;
  source_sheet: string | null;
  created_at: string;
}

export interface ConditionAggregateSummary {
  road_count: number;
  total_panjang_km: number;
  mantap_km: number;
  mantap_pct: number;
  tidak_mantap_km: number;
  tidak_mantap_pct: number;
  baik_km: number;
  sedang_km: number;
  rusak_ringan_km: number;
  rusak_berat_km: number;
}

export class ConditionService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Retrieve authoritative condition for a specific road and survey year (defaults to 2025).
   */
  getConditionByRoadKey(roadKey: string, surveyYear: number = 2025): RoadConditionEntity | null {
    const stmt = this.db.prepare(
      'SELECT * FROM road_conditions WHERE road_key = ? AND survey_year = ?'
    );
    const result = stmt.get(roadKey, surveyYear) as unknown as RoadConditionEntity | undefined;
    return result || null;
  }

  /**
   * Retrieve all road conditions for a given survey year.
   */
  getAllConditions(surveyYear: number = 2025): RoadConditionEntity[] {
    const stmt = this.db.prepare(
      'SELECT * FROM road_conditions WHERE survey_year = ? ORDER BY road_key ASC'
    );
    return stmt.all(surveyYear) as unknown as RoadConditionEntity[];
  }

  /**
   * Calculate overall aggregate metrics for the network.
   */
  getAggregateSummary(surveyYear: number = 2025): ConditionAggregateSummary {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as road_count,
        ROUND(SUM(total_panjang_km), 3) as total_panjang_km,
        ROUND(SUM(mantap_km), 3) as mantap_km,
        ROUND(SUM(tidak_mantap_km), 3) as tidak_mantap_km,
        ROUND(SUM(baik_km), 3) as baik_km,
        ROUND(SUM(sedang_km), 3) as sedang_km,
        ROUND(SUM(rusak_ringan_km), 3) as rusak_ringan_km,
        ROUND(SUM(rusak_berat_km), 3) as rusak_berat_km
      FROM road_conditions
      WHERE survey_year = ?
    `);

    const row = stmt.get(surveyYear) as unknown as any;
    const totalKm = row.total_panjang_km || 0;
    const mantapKm = row.mantap_km || 0;
    const tidakMantapKm = row.tidak_mantap_km || 0;

    const mantapPct = totalKm > 0 ? Math.round((mantapKm / totalKm) * 10000) / 100 : 0;
    const tidakMantapPct = totalKm > 0 ? Math.round((tidakMantapKm / totalKm) * 10000) / 100 : 0;

    return {
      road_count: row.road_count,
      total_panjang_km: totalKm,
      mantap_km: mantapKm,
      mantap_pct: mantapPct,
      tidak_mantap_km: tidakMantapKm,
      tidak_mantap_pct: tidakMantapPct,
      baik_km: row.baik_km || 0,
      sedang_km: row.sedang_km || 0,
      rusak_ringan_km: row.rusak_ringan_km || 0,
      rusak_berat_km: row.rusak_berat_km || 0,
    };
  }

  /**
   * District-level aggregation of road conditions.
   */
  getConditionByDistrict(surveyYear: number = 2025): Array<{
    district_name: string;
    road_count: number;
    total_km: number;
    mantap_km: number;
    mantap_pct: number;
    tidak_mantap_km: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT
        r.district_name,
        COUNT(r.road_key) as road_count,
        ROUND(SUM(c.total_panjang_km), 3) as total_km,
        ROUND(SUM(c.mantap_km), 3) as mantap_km,
        ROUND(SUM(c.tidak_mantap_km), 3) as tidak_mantap_km
      FROM roads r
      JOIN road_conditions c ON r.road_key = c.road_key AND c.survey_year = ?
      GROUP BY r.district_name
      ORDER BY total_km DESC
    `);

    const rows = stmt.all(surveyYear) as unknown as Array<{
      district_name: string;
      road_count: number;
      total_km: number;
      mantap_km: number;
      tidak_mantap_km: number;
    }>;

    return rows.map((r) => ({
      ...r,
      mantap_pct: r.total_km > 0 ? Math.round((r.mantap_km / r.total_km) * 10000) / 100 : 0,
    }));
  }
}
