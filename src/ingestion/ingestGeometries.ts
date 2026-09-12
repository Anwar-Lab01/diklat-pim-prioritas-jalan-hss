import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';

interface GeoJsonFeature {
  type: string;
  properties: {
    road_key: string;
    road_id: string;
    geometry_length_m?: number;
    length_km_source?: number;
    is_synthetic?: boolean;
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

interface GeoJsonFeatureCollection {
  type: string;
  features: GeoJsonFeature[];
}

function extractCoordinates(geometry: { type: string; coordinates?: any; geometries?: any[] }): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  if (!geometry) return points;

  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    points.push([geometry.coordinates[0], geometry.coordinates[1]]);
  } else if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    for (const pt of geometry.coordinates) {
      points.push([pt[0], pt[1]]); // [lng, lat]
    }
  } else if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    for (const line of geometry.coordinates) {
      for (const pt of line) {
        points.push([pt[0], pt[1]]);
      }
    }
  } else if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    for (const subGeom of geometry.geometries) {
      points.push(...extractCoordinates(subGeom));
    }
  }
  return points;
}

export function ingestGeometries(db: DatabaseSync): { insertedGeometries: number } {
  const rawData = fs.readFileSync(SEED_FILES.roadsCountyGeoJson, 'utf8');
  const geojson: GeoJsonFeatureCollection = JSON.parse(rawData);

  if (geojson.features.length !== AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT) {
    throw new Error(
      `County roads geometry count mismatch: expected ${AUTHORITY_INVARIANTS.CANONICAL_ROAD_COUNT}, got ${geojson.features.length}`
    );
  }

  const insertStmt = db.prepare(`
    INSERT INTO road_geometries (
      road_id,
      road_key,
      geometry_geojson,
      geometry_length_m,
      centroid_lat,
      centroid_lng,
      bbox_min_lat,
      bbox_min_lng,
      bbox_max_lat,
      bbox_max_lng,
      crs_declared
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EPSG:4326')
    ON CONFLICT(road_key) DO UPDATE SET
      geometry_geojson = excluded.geometry_geojson,
      geometry_length_m = excluded.geometry_length_m,
      centroid_lat = excluded.centroid_lat,
      centroid_lng = excluded.centroid_lng,
      bbox_min_lat = excluded.bbox_min_lat,
      bbox_min_lng = excluded.bbox_min_lng,
      bbox_max_lat = excluded.bbox_max_lat,
      bbox_max_lng = excluded.bbox_max_lng
  `);

  let insertedGeometries = 0;

  for (const feature of geojson.features) {
    // Explicit guard: exclude any synthetic connector
    if (feature.properties.is_synthetic) {
      continue;
    }

    const roadKey = feature.properties.road_key;
    const roadId = feature.properties.road_id;
    const geometryLengthM =
      feature.properties.geometry_length_m ||
      (feature.properties.length_km_source ? feature.properties.length_km_source * 1000 : 0.0);

    const points = extractCoordinates(feature.geometry);
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    let sumLng = 0;
    let sumLat = 0;

    for (const [lng, lat] of points) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      sumLng += lng;
      sumLat += lat;
    }

    const centroidLng = points.length > 0 ? sumLng / points.length : 0.0;
    const centroidLat = points.length > 0 ? sumLat / points.length : 0.0;

    insertStmt.run(
      roadId,
      roadKey,
      JSON.stringify(feature.geometry),
      geometryLengthM,
      centroidLat,
      centroidLng,
      minLat,
      minLng,
      maxLat,
      maxLng
    );
    insertedGeometries++;
  }

  return { insertedGeometries };
}
