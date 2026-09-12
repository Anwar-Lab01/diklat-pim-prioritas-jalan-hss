import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

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

export class SpatialService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
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
   * Retrieve all 350 county geometries as a valid GeoJSON FeatureCollection.
   * Guarantees that synthetic network connectors are NOT included.
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
   * Retrieve public facilities as GeoJSON FeatureCollection.
   */
  getPublicFacilitiesGeoJson(typeFilter?: string): {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: { type: 'Point'; coordinates: [number, number] };
      properties: Omit<PublicFacilityEntity, 'latitude' | 'longitude'>;
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
          facility_type: f.facility_type,
          facility_subtype: f.facility_subtype,
          facility_name: f.facility_name,
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
}
