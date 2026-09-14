import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT } from '../config/constants.ts';
import { getDatabase } from '../db/connection.ts';

export interface DD1SegmentFeatureProperties {
  segment_id: string;
  road_key: string;
  nomor_ruas: string;
  nama_ruas: string;
  priority_rank: number | null;
  priority_tier: string | null;
  sta_start_m: number;
  sta_end_m: number;
  sta_label: string;
  length_m: number;
  is_short_final: boolean;
  dominant_condition: 'baik' | 'sedang' | 'rusak_ringan' | 'rusak_berat';
  segment_status: 'mantap' | 'tidak_mantap';
  treatment: string;
  surface: string;
  road_width_m: number;
  survey_year: number;
}

export interface DD1SegmentGeoJson {
  type: 'FeatureCollection';
  properties: {
    description: string;
    condition_standard: string;
    total_segments: number;
    total_roads: number;
    total_length_m: number;
    generated_at: string;
  };
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'LineString';
      coordinates: Array<[number, number]>;
    };
    properties: DD1SegmentFeatureProperties;
  }>;
}

export class DD1SegmentGeometryService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  private extractLines(geom: any): Array<Array<[number, number]>> {
    if (geom.type === 'LineString') return [geom.coordinates];
    if (geom.type === 'MultiLineString') return geom.coordinates;
    if (geom.type === 'GeometryCollection') {
      const lines: Array<Array<[number, number]>> = [];
      for (const g of geom.geometries) {
        if (g.type === 'LineString') lines.push(g.coordinates);
        if (g.type === 'MultiLineString') lines.push(...g.coordinates);
      }
      return lines;
    }
    return [];
  }

  private haversineM(c1: [number, number], c2: [number, number]): number {
    const R = 6371000;
    const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
    const dLon = ((c2[0] - c1[0]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((c1[1] * Math.PI) / 180) * Math.cos((c2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Generates a deterministic GeoJSON FeatureCollection of all 7,487 condition segments
   * using proportional STA slicing along the canonical road geometries.
   */
  public generateDD1SegmentsGeoJson(): DD1SegmentGeoJson {
    // 1. Resolve active operational scoring run to attach contextual priority ranking
    const latestRun = this.db.prepare(`
      SELECT r.run_id 
      FROM scoring_runs r 
      JOIN priority_models m ON r.model_id = m.model_id 
      WHERE r.operating_mode = 'OPERATIONAL_2025' AND m.model_code = 'POLICY_DEFAULT_V1' 
      ORDER BY r.executed_at DESC LIMIT 1
    `).get() as { run_id: string } | undefined;

    const runId = latestRun ? latestRun.run_id : null;

    // 2. Fetch canonical roads and geometries
    const roads = this.db.prepare(`
      SELECT 
        g.road_key, 
        g.geometry_geojson, 
        r.nomor_ruas, 
        r.canonical_name, 
        r.display_name, 
        s.priority_rank, 
        s.tier_category 
      FROM road_geometries g 
      JOIN roads r ON g.road_key = r.road_key 
      LEFT JOIN road_priority_scores s ON s.road_key = r.road_key AND s.run_id = ?
      ORDER BY r.nomor_ruas ASC
    `).all(runId) as Array<{
      road_key: string;
      geometry_geojson: string;
      nomor_ruas: string;
      canonical_name: string;
      display_name: string;
      priority_rank: number | null;
      tier_category: string | null;
    }>;

    // 3. Fetch all 7,487 condition segments
    const segments = this.db.prepare(`
      SELECT 
        road_key, 
        segment_id, 
        sta_start_m, 
        sta_end_m, 
        segment_length_m, 
        dominant_condition, 
        segment_status, 
        recommended_treatment, 
        surface_type, 
        road_width_m, 
        survey_date 
      FROM treatment_engine_segments 
      ORDER BY road_key, sta_start_m ASC
    `).all() as Array<{
      road_key: string;
      segment_id: string;
      sta_start_m: number;
      sta_end_m: number;
      segment_length_m: number;
      dominant_condition: string;
      segment_status: string;
      recommended_treatment: string;
      surface_type: string;
      road_width_m: number;
      survey_date: string;
    }>;

    // 4. Index roads and flatten coordinates
    const roadMap = new Map<string, {
      road_key: string;
      nomor_ruas: string;
      display_name: string;
      priority_rank: number | null;
      tier_category: string | null;
      coords: Array<[number, number]>;
    }>();

    for (const r of roads) {
      const geom = JSON.parse(r.geometry_geojson);
      const lines = this.extractLines(geom);
      const coords = lines.reduce((acc, cur) => acc.concat(cur), [] as Array<[number, number]>);
      roadMap.set(r.road_key, {
        road_key: r.road_key,
        nomor_ruas: r.nomor_ruas,
        display_name: r.display_name,
        priority_rank: r.priority_rank,
        tier_category: r.tier_category,
        coords,
      });
    }

    // 5. Group segments by road_key
    const segsByRoad = new Map<string, typeof segments>();
    for (const seg of segments) {
      if (!segsByRoad.has(seg.road_key)) segsByRoad.set(seg.road_key, []);
      segsByRoad.get(seg.road_key)!.push(seg);
    }

    let totalLengthM = 0;
    const features: DD1SegmentGeoJson['features'] = [];

    // 6. Proportional STA slicing for each road
    for (const [roadKey, roadSegs] of segsByRoad.entries()) {
      const road = roadMap.get(roadKey);
      if (!road) continue;
      const rawCoords = road.coords;
      if (rawCoords.length < 2) continue;

      // Cumulative Haversine distances along vertices
      const cumDist = [0];
      for (let i = 1; i < rawCoords.length; i++) {
        cumDist[i] = cumDist[i - 1] + this.haversineM(rawCoords[i - 1], rawCoords[i]);
      }
      const totalGeoLength = cumDist[cumDist.length - 1];
      if (totalGeoLength <= 0) continue;

      const maxSta = roadSegs[roadSegs.length - 1].sta_end_m;
      if (maxSta <= 0) continue;

      const interpolatePoint = (dist: number): [number, number] => {
        if (dist <= 0) return [Number(rawCoords[0][0].toFixed(6)), Number(rawCoords[0][1].toFixed(6))];
        if (dist >= totalGeoLength) {
          const last = rawCoords[rawCoords.length - 1];
          return [Number(last[0].toFixed(6)), Number(last[1].toFixed(6))];
        }
        let idx = 1;
        while (idx < cumDist.length && cumDist[idx] < dist) idx++;
        const segLen = cumDist[idx] - cumDist[idx - 1];
        const segFrac = segLen > 0 ? (dist - cumDist[idx - 1]) / segLen : 0;
        const p0 = rawCoords[idx - 1];
        const p1 = rawCoords[idx];
        const lng = p0[0] + (p1[0] - p0[0]) * segFrac;
        const lat = p0[1] + (p1[1] - p0[1]) * segFrac;
        return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
      };

      for (let sIdx = 0; sIdx < roadSegs.length; sIdx++) {
        const seg = roadSegs[sIdx];
        const len = Number(seg.segment_length_m);
        totalLengthM += len;

        // Proportional STA fractions: start_fraction = sta_start_m / road_max_sta_m
        const startFrac = seg.sta_start_m / maxSta;
        const endFrac = seg.sta_end_m / maxSta;
        const targetStart = startFrac * totalGeoLength;
        const targetEnd = endFrac * totalGeoLength;

        const coords: Array<[number, number]> = [interpolatePoint(targetStart)];
        for (let i = 0; i < rawCoords.length; i++) {
          if (cumDist[i] > targetStart && cumDist[i] < targetEnd) {
            coords.push([Number(rawCoords[i][0].toFixed(6)), Number(rawCoords[i][1].toFixed(6))]);
          }
        }
        coords.push(interpolatePoint(targetEnd));

        const isShort = sIdx === roadSegs.length - 1 && len < 100;
        const staStartKm = Math.floor(seg.sta_start_m / 1000);
        const staStartRem = Math.round(seg.sta_start_m % 1000);
        const staEndKm = Math.floor(seg.sta_end_m / 1000);
        const staEndRem = Math.round(seg.sta_end_m % 1000);
        const staLabel = `STA ${staStartKm}+${String(staStartRem).padStart(3, '0')} - ${staEndKm}+${String(staEndRem).padStart(3, '0')}`;

        const cond = (String(seg.dominant_condition).toLowerCase() || 'sedang') as any;
        const status = (String(seg.segment_status).toLowerCase() || 'mantap') as any;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            segment_id: seg.segment_id,
            road_key: road.road_key,
            nomor_ruas: road.nomor_ruas,
            nama_ruas: road.display_name,
            priority_rank: road.priority_rank,
            priority_tier: road.tier_category,
            sta_start_m: seg.sta_start_m,
            sta_end_m: seg.sta_end_m,
            sta_label: staLabel,
            length_m: len,
            is_short_final: isShort,
            dominant_condition: cond,
            segment_status: status,
            treatment: seg.recommended_treatment || 'Pemeliharaan Rutin',
            surface: seg.surface_type || 'Aspal',
            road_width_m: Number(seg.road_width_m) || 4.0,
            survey_year: 2025,
          },
        });
      }
    }

    return {
      type: 'FeatureCollection',
      properties: {
        description: 'Authoritative DD1 Road Condition Segments (100m interval)',
        condition_standard: 'DD1',
        total_segments: features.length,
        total_roads: segsByRoad.size,
        total_length_m: totalLengthM,
        generated_at: new Date().toISOString(),
      },
      features,
    };
  }

  /**
   * Generates and writes the canonical static GeoJSON file into src/public/data/
   */
  public writeCanonicalGeoJsonFile(): { filePath: string; totalSegments: number; byteSize: number } {
    const geojson = this.generateDD1SegmentsGeoJson();
    const dataDir = path.resolve(PROJECT_ROOT, 'src/public/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const targetPath = path.join(dataDir, 'dd1_condition_segments_2025.geojson');
    const content = JSON.stringify(geojson);
    fs.writeFileSync(targetPath, content, 'utf8');

    return {
      filePath: targetPath,
      totalSegments: geojson.features.length,
      byteSize: Buffer.byteLength(content),
    };
  }
}
