import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { ScoringService } from './scoringService.ts';

export interface RoadGeometryEntity {
  road_id: string;
  road_key: string;
  geometry_geojson: string;
  geometry_length_m: number;
  centroid_lat: number;
  centroid_lng: number;
  bbox_min_lat: number;
  bbox_min_lng: number;
  bbox_max_lat: number;
  bbox_max_lng: number;
  crs_declared: string;
}

export interface PublicFacilityEntity {
  facility_id: string;
  facility_type: string;
  facility_subtype: string | null;
  facility_name: string;
  district_name: string | null;
  village_name: string | null;
  latitude: number;
  longitude: number;
  source_layer: string;
}

export interface ScoredRoadFeatureProperties {
  road_key: string;
  road_id: string;
  nomor_ruas: string;
  display_name: string;
  canonical_name: string;
  district_name: string;
  length_km: number;
  width_m: number;
  mantap_pct: number;
  tidak_mantap_pct: number;
  baik_km: number;
  sedang_km: number;
  rusak_ringan_km: number;
  rusak_berat_km: number;
  final_score: number;
  priority_rank: number;
  tier_category: 'TOP_35' | 'TOP_70' | 'TOP_105' | 'REGULAR';
  subtotal_teknis: number;
  subtotal_akses: number;
  subtotal_pelayanan: number;
  subtotal_spasial: number;
  run_id: string;
  operating_mode: string;
}

export class SpatialService {
  private db: DatabaseSync;
  private scoringService: ScoringService;

  // In-memory caches for static GeoJSON files
  private cachedProvincialGeoJson: any = null;
  private cachedNationalGeoJson: any = null;
  private cachedConnectorsGeoJson: any = null;
  private cachedDistrictsGeoJson: any = null;
  private cachedVillagesGeoJson: any = null;
  private cachedRtrwGeoJson: any = null;
  private cachedRtrwCategories: Array<{ nama_pola_ruang: string; feature_count: number }> | null = null;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.scoringService = new ScoringService(this.db);
  }

  /**
   * Retrieve geometry for a single road by canonical road_key.
   */
  getGeometryByRoadKey(roadKey: string): RoadGeometryEntity | null {
    const stmt = this.db.prepare('SELECT * FROM road_geometries WHERE road_key = ?');
    const result = stmt.get(roadKey) as unknown as RoadGeometryEntity | undefined;
    return result || null;
  }

  /**
   * Total count of stored county road geometries (must equal 350).
   */
  getCountyGeometryCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM road_geometries');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  /**
   * Retrieve all 350 county geometries as a valid GeoJSON FeatureCollection (raw geometry without score).
   */
  getAllCountyRoadsGeoJson(): {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: any;
      properties: {
        road_key: string;
        road_id: string;
        nomor_ruas: string;
        display_name: string;
        district_name: string;
        length_km: number;
      };
    }>;
  } {
    const stmt = this.db.prepare(`
      SELECT
        g.road_key,
        g.road_id,
        g.geometry_geojson,
        r.nomor_ruas,
        r.display_name,
        r.district_name,
        r.length_km_official
      FROM road_geometries g
      JOIN roads r ON g.road_key = r.road_key
      ORDER BY r.nomor_ruas ASC
    `);

    const rows = stmt.all() as unknown as Array<{
      road_key: string;
      road_id: string;
      geometry_geojson: string;
      nomor_ruas: string;
      display_name: string;
      district_name: string;
      length_km_official: number;
    }>;

    return {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: JSON.parse(r.geometry_geojson),
        properties: {
          road_key: r.road_key,
          road_id: r.road_id,
          nomor_ruas: r.nomor_ruas,
          display_name: r.display_name,
          district_name: r.district_name,
          length_km: r.length_km_official,
        },
      })),
    };
  }

  /**
   * Retrieve all 350 county road geometries merged with active scoring results and 2025 condition facts.
   * Scoped to the active scoring run for the specified operating mode and model code.
   */
  getCountyRoadsWithScores(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): {
    type: 'FeatureCollection';
    properties: {
      operatingMode: string;
      modelCode: string;
      run_id: string;
      road_count: number;
      crs: string;
    };
    features: Array<{
      type: 'Feature';
      geometry: any;
      properties: ScoredRoadFeatureProperties;
    }>;
  } {
    // 1. Resolve active scoring run
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, modelCode, 'MAP_SERVICE');
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, modelCode);
    }
    if (!latestRun) {
      throw new Error(`SCORING_RUN_UNAVAILABLE for map spatial service [${operatingMode}/${modelCode}]`);
    }

    const runId = latestRun.run.run_id;
    const surveyYear = operatingMode === 'BENCHMARK_2024' ? 2024 : 2025;

    // 2. Query road geometries joined with roads, conditions, and scores
    const stmt = this.db.prepare(`
      SELECT
        g.road_key,
        g.road_id,
        g.geometry_geojson,
        r.nomor_ruas,
        r.display_name,
        r.canonical_name,
        r.district_name,
        r.length_km_official,
        r.width_m_official,
        s.run_id,
        s.priority_rank,
        s.final_score,
        s.tier_category,
        s.subtotal_teknis,
        s.subtotal_akses,
        s.subtotal_pelayanan,
        s.subtotal_spasial,
        COALESCE(c.mantap_pct, 0.0) as mantap_pct,
        COALESCE(c.tidak_mantap_pct, 0.0) as tidak_mantap_pct,
        COALESCE(c.baik_km, 0.0) as baik_km,
        COALESCE(c.sedang_km, 0.0) as sedang_km,
        COALESCE(c.rusak_ringan_km, 0.0) as rusak_ringan_km,
        COALESCE(c.rusak_berat_km, 0.0) as rusak_berat_km
      FROM road_geometries g
      JOIN roads r ON g.road_key = r.road_key
      JOIN road_priority_scores s ON s.road_key = r.road_key AND s.run_id = ?
      LEFT JOIN road_conditions c ON c.road_key = r.road_key AND c.survey_year = ?
      ORDER BY s.priority_rank ASC
    `);

    const rows = stmt.all(runId, surveyYear) as unknown as Array<{
      road_key: string;
      road_id: string;
      geometry_geojson: string;
      nomor_ruas: string;
      display_name: string;
      canonical_name: string;
      district_name: string;
      length_km_official: number;
      width_m_official: number;
      run_id: string;
      priority_rank: number;
      final_score: number;
      tier_category: 'TOP_35' | 'TOP_70' | 'TOP_105' | 'REGULAR';
      subtotal_teknis: number;
      subtotal_akses: number;
      subtotal_pelayanan: number;
      subtotal_spasial: number;
      mantap_pct: number;
      tidak_mantap_pct: number;
      baik_km: number;
      sedang_km: number;
      rusak_ringan_km: number;
      rusak_berat_km: number;
    }>;

    if (rows.length !== AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT) {
      throw new Error(
        `Map county roads count mismatch: expected ${AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT}, got ${rows.length}`
      );
    }

    return {
      type: 'FeatureCollection',
      properties: {
        operatingMode,
        modelCode,
        run_id: runId,
        road_count: rows.length,
        crs: 'EPSG:4326',
      },
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: JSON.parse(r.geometry_geojson),
        properties: {
          road_key: r.road_key,
          road_id: r.road_id,
          nomor_ruas: r.nomor_ruas,
          display_name: r.display_name,
          canonical_name: r.canonical_name,
          district_name: r.district_name,
          length_km: r.length_km_official,
          width_m: r.width_m_official,
          mantap_pct: Math.round(r.mantap_pct * 100) / 100,
          tidak_mantap_pct: Math.round(r.tidak_mantap_pct * 100) / 100,
          baik_km: r.baik_km,
          sedang_km: r.sedang_km,
          rusak_ringan_km: r.rusak_ringan_km,
          rusak_berat_km: r.rusak_berat_km,
          final_score: r.final_score,
          priority_rank: r.priority_rank,
          tier_category: r.tier_category,
          subtotal_teknis: r.subtotal_teknis,
          subtotal_akses: r.subtotal_akses,
          subtotal_pelayanan: r.subtotal_pelayanan,
          subtotal_spasial: r.subtotal_spasial,
          run_id: r.run_id,
          operating_mode: operatingMode,
        },
      })),
    };
  }

  /**
   * Retrieve the complete reference network (4 provincial, 8 national, 4 connectors = 16 features).
   * Explicitly ensures connectors are labeled 'Konektor Jaringan Analisis' and have NO priority/treatment fields.
   */
  getReferenceNetworkGeoJson(): {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: any;
      properties: {
        feature_id: string;
        network_class: 'PROVINSI' | 'NASIONAL' | 'KONEKTOR_ANALISIS';
        network_label: string;
        road_name?: string;
        connector_name?: string;
        is_synthetic: boolean;
        geometry_length_m: number;
        length_km?: string;
        purpose?: string;
      };
    }>;
  } {
    if (!this.cachedProvincialGeoJson) {
      this.cachedProvincialGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.roadsProvincialGeoJson, 'utf8'));
    }
    if (!this.cachedNationalGeoJson) {
      this.cachedNationalGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.roadsNationalGeoJson, 'utf8'));
    }
    if (!this.cachedConnectorsGeoJson) {
      this.cachedConnectorsGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.networkConnectorsGeoJson, 'utf8'));
    }

    const combinedFeatures: any[] = [];

    // 1. Provincial Roads (4 features)
    for (let i = 0; i < this.cachedProvincialGeoJson.features.length; i++) {
      const f = this.cachedProvincialGeoJson.features[i];
      combinedFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          feature_id: `prov-${f.properties.source_object_id || i + 1}`,
          network_class: 'PROVINSI',
          network_label: 'Jalan Provinsi',
          road_name: f.properties.road_name,
          is_synthetic: false,
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1000).toFixed(3),
        },
      });
    }

    // 2. National Roads (8 features)
    for (let i = 0; i < this.cachedNationalGeoJson.features.length; i++) {
      const f = this.cachedNationalGeoJson.features[i];
      combinedFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          feature_id: `nat-${f.properties.source_object_id || i + 1}`,
          network_class: 'NASIONAL',
          network_label: 'Jalan Nasional',
          road_name: f.properties.road_name,
          is_synthetic: false,
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1000).toFixed(3),
        },
      });
    }

    // 3. Synthetic Analytical Connectors (4 features)
    // CRITICAL: NEVER give connectors priority scores, ranks, tier badges, or maintenance treatment semantics!
    for (const f of this.cachedConnectorsGeoJson.features) {
      combinedFeatures.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          feature_id: f.properties.connector_id,
          network_class: 'KONEKTOR_ANALISIS',
          network_label: 'Konektor Jaringan Analisis',
          connector_name: f.properties.connector_name,
          is_synthetic: true,
          purpose: 'network_topology',
          geometry_length_m: f.properties.geometry_length_m,
          length_km: (f.properties.geometry_length_m / 1000).toFixed(3),
        },
      });
    }

    return {
      type: 'FeatureCollection',
      features: combinedFeatures,
    };
  }

  /**
   * Retrieve administrative district boundaries (11 polygons).
   */
  getDistrictsGeoJson(): any {
    if (!this.cachedDistrictsGeoJson) {
      this.cachedDistrictsGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.districtsGeoJson, 'utf8'));
    }
    return this.cachedDistrictsGeoJson;
  }

  /**
   * Retrieve administrative village boundaries (148 polygons).
   */
  getVillagesGeoJson(): any {
    if (!this.cachedVillagesGeoJson) {
      this.cachedVillagesGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.villagesGeoJson, 'utf8'));
    }
    return this.cachedVillagesGeoJson;
  }

  /**
   * Retrieve public facilities as GeoJSON FeatureCollection (285 points).
   */
  getPublicFacilitiesGeoJson(typeFilter?: string): {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: {
        facility_id: string;
        facility_name: string;
        facility_type: string;
        facility_type_label: string;
        facility_subtype: string | null;
        district_name: string | null;
        village_name: string | null;
        source_layer: string;
      };
    }>;
  } {
    let sql = 'SELECT * FROM public_facilities';
    const params: any[] = [];

    if (typeFilter) {
      sql += ' WHERE facility_type = ?';
      params.push(typeFilter);
    }

    sql += ' ORDER BY facility_type ASC, facility_name ASC';

    const stmt = this.db.prepare(sql);
    const rows = (params.length > 0 ? stmt.all(...params) : stmt.all()) as unknown as PublicFacilityEntity[];

    const getLabel = (t: string) => {
      switch (t) {
        case 'hospital':
          return 'RSUD';
        case 'puskesmas':
          return 'Puskesmas';
        case 'school':
          return 'SD / SMP';
        case 'market':
          return 'Pasar Rakyat';
        default:
          return t;
      }
    };

    return {
      type: 'FeatureCollection',
      features: rows.map((f) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.longitude, f.latitude],
        },
        properties: {
          facility_id: f.facility_id,
          facility_name: f.facility_name,
          facility_type: f.facility_type,
          facility_type_label: getLabel(f.facility_type),
          facility_subtype: f.facility_subtype,
          district_name: f.district_name,
          village_name: f.village_name,
          source_layer: f.source_layer,
        },
      })),
    };
  }

  /**
   * Total count of public facilities (must equal 285).
   */
  getPublicFacilityCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM public_facilities');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  /**
   * Retrieve RTRW Pola Ruang categories and feature counts.
   */
  getRtrwCategories(): Array<{ nama_pola_ruang: string; feature_count: number }> {
    if (!this.cachedRtrwCategories) {
      const csv = fs.readFileSync(SEED_FILES.rtrwCategoriesCsv, 'utf8');
      const lines = csv.trim().split('\n').slice(1);
      this.cachedRtrwCategories = lines.map((l) => {
        const [nama, count] = l.split(',');
        return { nama_pola_ruang: nama.trim(), feature_count: parseInt(count.trim(), 10) || 0 };
      });
    }
    return this.cachedRtrwCategories;
  }

  /**
   * Retrieve full RTRW Pola Ruang GeoJSON (2,832 polygons, ~17.5 MB).
   * Cached in memory upon initial request.
   */
  getRtrwGeoJson(): any {
    if (!this.cachedRtrwGeoJson) {
      this.cachedRtrwGeoJson = JSON.parse(fs.readFileSync(SEED_FILES.rtrwPolaRuangGeoJson, 'utf8'));
    }
    return this.cachedRtrwGeoJson;
  }
}

