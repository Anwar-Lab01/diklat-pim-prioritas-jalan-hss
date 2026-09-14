import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as turf from '@turf/turf';
import { getDatabase } from '../db/connection.ts';
import { SEED_FILES, AUTHORITY_INVARIANTS } from '../config/constants.ts';
import { parseCsv } from '../ingestion/csvParser.ts';

export interface RoadVillageIntersectionEntity {
  road_key: string;
  village_id: string;
  village_name: string;
  district_id: string;
  district_name: string;
  intersection_length_m: number;
  share_of_road_pct: number;
  traversal_order: number | null;
  is_boundary_ambiguous: number;
  derivation_method: string;
  source_version: string;
  calculated_at: string;
}

export interface RoadDistrictIntersectionEntity {
  road_key: string;
  district_id: string;
  district_name: string;
  intersection_length_m: number;
  share_of_road_pct: number;
  traversal_order: number | null;
  derivation_method: string;
  source_version: string;
  calculated_at: string;
}

export interface FacilitySnapEntity {
  facility_id: string;
  facility_name: string;
  facility_type: string;
  facility_subtype: string | null;
  original_lat: number;
  original_lng: number;
  snapped_lat: number;
  snapped_lng: number;
  snap_distance_m: number;
  network_edge_id: string | null;
  is_suspicious: number;
  network_version: string;
  calculated_at: string;
}

export interface RoadNearestFacilityEntity {
  road_key: string;
  facility_type: string;
  nearest_facility_id: string;
  nearest_facility_name: string;
  network_distance_m: number;
  straight_line_distance_m: number | null;
  road_access_point_geojson: string;
  facility_snap_point_geojson: string;
  facility_snap_distance_m: number;
  route_geometry_geojson: string;
  network_version: string;
  derivation_method: string;
  calculated_at: string;
}

export interface NetworkStats {
  featureCount: number;
  countyCount: number;
  provincialCount: number;
  nationalCount: number;
  connectorCount: number;
  nodeCount: number;
  edgeCount: number;
  connectedComponentsCount: number;
  largestComponentNodes: number;
  largestComponentPct: number;
  networkHash: string;
  topComponentSizes: number[];
  isolatedRoads: Array<{ road_key: string; road_name: string; component_index: number; node_count: number }>;
  topologyAnomalies: string[];
}

interface NetworkEdge {
  to: string;
  dist: number;
  roadKey?: string;
  featureIdx: number;
  p1: [number, number];
  p2: [number, number];
}

interface NetworkNode {
  id: number;
  coord: [number, number];
  neighbors: NetworkEdge[];
  roadKeys: Set<string>;
}

// Priority Queue for Dijkstra
class MinHeap<T> {
  private heap: Array<{ key: number; val: T }> = [];

  push(key: number, val: T) {
    this.heap.push({ key, val });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: number; val: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(idx: number) {
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.heap[idx].key < this.heap[parentIdx].key) {
        const temp = this.heap[idx];
        this.heap[idx] = this.heap[parentIdx];
        this.heap[parentIdx] = temp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number) {
    const len = this.heap.length;
    while ((idx << 1) + 1 < len) {
      let left = (idx << 1) + 1;
      let right = left + 1;
      let smallest = idx;

      if (left < len && this.heap[left].key < this.heap[smallest].key) {
        smallest = left;
      }
      if (right < len && this.heap[right].key < this.heap[smallest].key) {
        smallest = right;
      }
      if (smallest !== idx) {
        const temp = this.heap[idx];
        this.heap[idx] = this.heap[smallest];
        this.heap[smallest] = temp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

export class SpatialDerivationService {
  private db: DatabaseSync;
  private networkData: any = null;
  private nodes: Map<string, NetworkNode> = new Map();
  private roadNodesMap: Map<string, Set<string>> = new Map();
  private networkHash: string = '';
  private networkStatsCache: NetworkStats | null = null;
  private facilitySnapsCache: Map<string, FacilitySnapEntity> = new Map();

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Helper to format coordinate key with precision ~1.1m (5 decimal places)
   */
  private coordKey(coord: [number, number]): string {
    return `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
  }

  /**
   * Extract all 2D Line coordinate chains from any GeoJSON geometry type
   */
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

  /**
   * Lazy-load network and build the in-memory graph
   */
  public ensureNetworkGraph(): void {
    if (this.nodes.size > 0 && this.networkHash) return;

    if (!fs.existsSync(SEED_FILES.networkAnalysisGeoJson)) {
      throw new Error(`Network file not found at: ${SEED_FILES.networkAnalysisGeoJson}`);
    }

    const raw = fs.readFileSync(SEED_FILES.networkAnalysisGeoJson, 'utf8');
    this.networkData = JSON.parse(raw);

    // Compute deterministic SHA-256 hash of the authoritative network file
    this.networkHash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);

    let edgeCount = 0;
    let countyCount = 0;
    let provCount = 0;
    let natCount = 0;
    let connCount = 0;
    const anomalies: string[] = [];

    for (let fIdx = 0; fIdx < this.networkData.features.length; fIdx++) {
      const f = this.networkData.features[fIdx];
      const p = f.properties;
      const roadKey = p.road_key || undefined;

      if (p.source_layer === 'ruas_kabupaten_reproject') countyCount++;
      else if (p.source_layer === 'ruas_provinsi_reproject') provCount++;
      else if (p.source_layer === 'ruas_nasioanl_reproject') natCount++;
      else if (p.source_layer === 'jembatan_penghubung') connCount++;

      if (f.geometry.type === 'GeometryCollection') {
        anomalies.push(`Feature ${p.network_feature_id} (${p.road_name || roadKey}) has GeometryCollection geometry`);
      }

      const lines = this.extractLines(f.geometry);
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = line[i] as [number, number];
          const p2 = line[i + 1] as [number, number];
          const k1 = this.coordKey(p1);
          const k2 = this.coordKey(p2);
          if (k1 === k2) continue; // Skip zero-length segment

          if (!this.nodes.has(k1)) {
            this.nodes.set(k1, { id: this.nodes.size, coord: p1, neighbors: [], roadKeys: new Set() });
          }
          if (!this.nodes.has(k2)) {
            this.nodes.set(k2, { id: this.nodes.size, coord: p2, neighbors: [], roadKeys: new Set() });
          }

          const dMeters = turf.distance(turf.point(p1), turf.point(p2), { units: 'kilometers' }) * 1000;

          this.nodes.get(k1)!.neighbors.push({ to: k2, dist: dMeters, roadKey, featureIdx: fIdx, p1, p2 });
          this.nodes.get(k2)!.neighbors.push({ to: k1, dist: dMeters, roadKey, featureIdx: fIdx, p1: p2, p2: p1 });
          edgeCount++;

          if (roadKey) {
            this.nodes.get(k1)!.roadKeys.add(roadKey);
            this.nodes.get(k2)!.roadKeys.add(roadKey);

            if (!this.roadNodesMap.has(roadKey)) this.roadNodesMap.set(roadKey, new Set());
            this.roadNodesMap.get(roadKey)!.add(k1);
            this.roadNodesMap.get(roadKey)!.add(k2);
          }
        }
      }
    }

    // Identify connected components using BFS
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const [k] of this.nodes.entries()) {
      if (visited.has(k)) continue;
      const comp: string[] = [];
      const queue = [k];
      visited.add(k);

      while (queue.length > 0) {
        const currKey = queue.shift()!;
        comp.push(currKey);
        const currNode = this.nodes.get(currKey)!;
        for (const edge of currNode.neighbors) {
          if (!visited.has(edge.to)) {
            visited.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      components.push(comp);
    }

    components.sort((a, b) => b.length - a.length);

    // Identify which roads are in smaller/isolated components
    const isolatedRoads: Array<{ road_key: string; road_name: string; component_index: number; node_count: number }> = [];
    if (components.length > 1) {
      for (let cIdx = 1; cIdx < components.length; cIdx++) {
        const compSet = new Set(components[cIdx]);
        const compRoads = new Set<string>();
        for (const nodeKey of compSet) {
          const n = this.nodes.get(nodeKey);
          if (n) {
            for (const rk of n.roadKeys) compRoads.add(rk);
          }
        }
        for (const rk of compRoads) {
          isolatedRoads.push({
            road_key: rk,
            road_name: this.getRoadName(rk),
            component_index: cIdx + 1,
            node_count: components[cIdx].length,
          });
        }
      }
    }

    this.networkStatsCache = {
      featureCount: this.networkData.features.length,
      countyCount,
      provincialCount: provCount,
      nationalCount: natCount,
      connectorCount: connCount,
      nodeCount: this.nodes.size,
      edgeCount,
      connectedComponentsCount: components.length,
      largestComponentNodes: components[0]?.length || 0,
      largestComponentPct: components[0] ? (components[0].length / this.nodes.size) * 100 : 0,
      networkHash: this.networkHash,
      topComponentSizes: components.slice(0, 10).map((c) => c.length),
      isolatedRoads,
      topologyAnomalies: anomalies,
    };
  }

  private getRoadName(roadKey: string): string {
    const row = this.db.prepare('SELECT display_name FROM roads WHERE road_key = ?').get(roadKey) as
      | { display_name: string }
      | undefined;
    return row?.display_name || roadKey;
  }

  public getNetworkStats(): NetworkStats {
    this.ensureNetworkGraph();
    return this.networkStatsCache!;
  }

  /**
   * Ingest authoritative Road-Village and Road-District intersections
   */
  public ingestAdminIntersections(): { insertedVillages: number; insertedDistricts: number } {
    const villageCsv = fs.readFileSync(SEED_FILES.roadVillageIntersectionsCsv, 'utf8');
    const villageRows = parseCsv<any>(villageCsv);

    const districtCsv = fs.readFileSync(SEED_FILES.roadDistrictIntersectionsCsv, 'utf8');
    const districtRows = parseCsv<any>(districtCsv);

    // 1. Ingest Road-Village Intersections
    const insertVillageStmt = this.db.prepare(`
      INSERT INTO road_village_intersections (
        road_key,
        village_id,
        village_name,
        district_id,
        district_name,
        intersection_length_m,
        share_of_road_pct,
        traversal_order,
        is_boundary_ambiguous,
        derivation_method,
        source_version,
        calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(road_key, village_id) DO UPDATE SET
        intersection_length_m = excluded.intersection_length_m,
        share_of_road_pct = excluded.share_of_road_pct,
        traversal_order = excluded.traversal_order,
        is_boundary_ambiguous = excluded.is_boundary_ambiguous
    `);

    // Calculate total length per road from intersections to get share_pct
    const roadVillageLengths: Record<string, number> = {};
    for (const r of villageRows) {
      const len = parseFloat(r.intersection_length_m) || 0;
      roadVillageLengths[r.road_key] = (roadVillageLengths[r.road_key] || 0) + len;
    }

    let insertedVillages = 0;
    for (let i = 0; i < villageRows.length; i++) {
      const r = villageRows[i];
      const len = parseFloat(r.intersection_length_m) || 0;
      const totalLen = roadVillageLengths[r.road_key] || len || 1;
      const sharePct = Math.round((len / totalLen) * 10000) / 100;
      // Identify ambiguous boundary cases: very short intersections (< 15 meters) or shared border alignments
      const isAmbiguous = len > 0 && len < 15.0 ? 1 : 0;

      insertVillageStmt.run(
        r.road_key,
        r.village_id,
        r.village_name,
        r.district_id,
        r.district_name,
        len,
        sharePct,
        null,
        isAmbiguous,
        'LINE_POLYGON_INTERSECTION',
        'AUTHORITATIVE_V5'
      );
      insertedVillages++;
    }

    // 2. Ingest Road-District Intersections
    const insertDistrictStmt = this.db.prepare(`
      INSERT INTO road_district_intersections (
        road_key,
        district_id,
        district_name,
        intersection_length_m,
        share_of_road_pct,
        traversal_order,
        derivation_method,
        source_version,
        calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(road_key, district_id) DO UPDATE SET
        intersection_length_m = excluded.intersection_length_m,
        share_of_road_pct = excluded.share_of_road_pct,
        traversal_order = excluded.traversal_order
    `);

    const roadDistrictLengths: Record<string, number> = {};
    for (const r of districtRows) {
      const len = parseFloat(r.intersection_length_m) || 0;
      roadDistrictLengths[r.road_key] = (roadDistrictLengths[r.road_key] || 0) + len;
    }

    let insertedDistricts = 0;
    for (const r of districtRows) {
      const len = parseFloat(r.intersection_length_m) || 0;
      const totalLen = roadDistrictLengths[r.road_key] || len || 1;
      const sharePct = Math.round((len / totalLen) * 10000) / 100;

      insertDistrictStmt.run(
        r.road_key,
        r.district_id,
        r.district_name,
        len,
        sharePct,
        null,
        'LINE_POLYGON_INTERSECTION',
        'AUTHORITATIVE_V5'
      );
      insertedDistricts++;
    }

    return { insertedVillages, insertedDistricts };
  }

  /**
   * Snap all 285 public facilities to the network and record snap coordinates and perpendicular distances.
   */
  public snapAllFacilities(): { totalSnapped: number; suspiciousCount: number } {
    this.ensureNetworkGraph();

    const stmt = this.db.prepare('SELECT * FROM public_facilities');
    const facilities = stmt.all() as any[];

    const insertSnapStmt = this.db.prepare(`
      INSERT INTO facility_network_snaps (
        facility_id,
        facility_name,
        facility_type,
        facility_subtype,
        original_lat,
        original_lng,
        snapped_lat,
        snapped_lng,
        snap_distance_m,
        network_edge_id,
        is_suspicious,
        network_version,
        calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(facility_id) DO UPDATE SET
        snapped_lat = excluded.snapped_lat,
        snapped_lng = excluded.snapped_lng,
        snap_distance_m = excluded.snap_distance_m,
        is_suspicious = excluded.is_suspicious,
        network_version = excluded.network_version
    `);

    let suspiciousCount = 0;
    let totalSnapped = 0;

    for (const fac of facilities) {
      const fPt = turf.point([fac.longitude, fac.latitude]);
      let minD = Infinity;
      let nearestCoord: [number, number] = [fac.longitude, fac.latitude];

      for (let fIdx = 0; fIdx < this.networkData.features.length; fIdx++) {
        const feat = this.networkData.features[fIdx];
        const lines = this.extractLines(feat.geometry);
        for (const coords of lines) {
          for (let i = 0; i < coords.length - 1; i++) {
            const seg = turf.lineString([coords[i], coords[i + 1]]);
            const ptOnLine = turf.nearestPointOnLine(seg, fPt);
            const d = (ptOnLine.properties.dist || 0) * 1000;
            if (d < minD) {
              minD = d;
              nearestCoord = ptOnLine.geometry.coordinates as [number, number];
            }
          }
        }
      }

      const isSuspicious = minD > 500 ? 1 : 0;
      if (isSuspicious) suspiciousCount++;

      const snapEntity: FacilitySnapEntity = {
        facility_id: fac.facility_id,
        facility_name: fac.facility_name,
        facility_type: fac.facility_type,
        facility_subtype: fac.facility_subtype,
        original_lat: fac.latitude,
        original_lng: fac.longitude,
        snapped_lat: nearestCoord[1],
        snapped_lng: nearestCoord[0],
        snap_distance_m: Math.round(minD * 100) / 100,
        network_edge_id: null,
        is_suspicious: isSuspicious,
        network_version: this.networkHash,
        calculated_at: new Date().toISOString(),
      };

      insertSnapStmt.run(
        snapEntity.facility_id,
        snapEntity.facility_name,
        snapEntity.facility_type,
        snapEntity.facility_subtype,
        snapEntity.original_lat,
        snapEntity.original_lng,
        snapEntity.snapped_lat,
        snapEntity.snapped_lng,
        snapEntity.snap_distance_m,
        snapEntity.network_edge_id,
        snapEntity.is_suspicious,
        snapEntity.network_version
      );

      this.facilitySnapsCache.set(fac.facility_id, snapEntity);
      totalSnapped++;
    }

    return { totalSnapped, suspiciousCount };
  }

  /**
   * Multi-Source Dijkstra for a specific facility category.
   * Target facility types:
   * - 'hospital' (RSUD, 2 points)
   * - 'puskesmas' (21 points)
   * - 'school' (SD/SMP, 251 points)
   * - 'market' (Pasar, 11 points)
   */
  public computeNearestFacilitiesForType(facilityType: string): {
    evaluatedRoads: number;
    resolvedRoads: number;
    unresolvedRoads: number;
  } {
    this.ensureNetworkGraph();

    // 1. Fetch snapped facilities of this type
    const snapsStmt = this.db.prepare('SELECT * FROM facility_network_snaps WHERE facility_type = ?');
    const snaps = snapsStmt.all(facilityType) as unknown as FacilitySnapEntity[];

    if (snaps.length === 0) {
      // If snaps not computed yet, run snapping
      this.snapAllFacilities();
    }

    const facilitySnaps = snapsStmt.all(facilityType) as unknown as FacilitySnapEntity[];
    if (facilitySnaps.length === 0) {
      throw new Error(`No facilities found for type: ${facilityType}`);
    }

    // 2. Prepare Multi-Source Dijkstra
    const dist = new Map<string, number>();
    const nearestFacMap = new Map<string, FacilitySnapEntity>();
    const parent = new Map<string, { fromNode: string; edgeP1: [number, number]; edgeP2: [number, number] }>();
    const pq = new MinHeap<string>();

    for (const snap of facilitySnaps) {
      const snapCoord: [number, number] = [snap.snapped_lng, snap.snapped_lat];
      const snapKey = this.coordKey(snapCoord);

      // Connect snap point to graph: find exact node or nearest node
      let closestNodeKey = snapKey;
      let minSnapToNodeDist = Infinity;

      if (this.nodes.has(snapKey)) {
        closestNodeKey = snapKey;
        minSnapToNodeDist = 0;
      } else {
        // Find closest graph node within 20m or smallest
        for (const [k, n] of this.nodes.entries()) {
          const d = turf.distance(turf.point(snapCoord), turf.point(n.coord), { units: 'kilometers' }) * 1000;
          if (d < minSnapToNodeDist) {
            minSnapToNodeDist = d;
            closestNodeKey = k;
          }
        }
      }

      const initialDist = snap.snap_distance_m + (minSnapToNodeDist < Infinity ? minSnapToNodeDist : 0);
      if (!dist.has(closestNodeKey) || initialDist < dist.get(closestNodeKey)!) {
        dist.set(closestNodeKey, initialDist);
        nearestFacMap.set(closestNodeKey, snap);
        pq.push(initialDist, closestNodeKey);
      }
    }

    // Run Dijkstra relaxation
    while (pq.size > 0) {
      const top = pq.pop()!;
      const d = top.key;
      const uKey = top.val;

      if (d > (dist.get(uKey) || Infinity)) continue;

      const uNode = this.nodes.get(uKey);
      if (!uNode) continue;

      const currentFac = nearestFacMap.get(uKey)!;

      for (const edge of uNode.neighbors) {
        const vKey = edge.to;
        const newDist = d + edge.dist;

        if (newDist < (dist.get(vKey) || Infinity)) {
          dist.set(vKey, newDist);
          nearestFacMap.set(vKey, currentFac);
          parent.set(vKey, { fromNode: uKey, edgeP1: edge.p1, edgeP2: edge.p2 });
          pq.push(newDist, vKey);
        }
      }
    }

    // 3. For each canonical road (350 roads), find minimum distance node and trace route
    const roadsStmt = this.db.prepare('SELECT road_key, display_name FROM roads ORDER BY road_key ASC');
    const roads = roadsStmt.all() as Array<{ road_key: string; display_name: string }>;

    const insertNearestStmt = this.db.prepare(`
      INSERT INTO road_nearest_facilities (
        road_key,
        facility_type,
        nearest_facility_id,
        nearest_facility_name,
        network_distance_m,
        straight_line_distance_m,
        road_access_point_geojson,
        facility_snap_point_geojson,
        facility_snap_distance_m,
        route_geometry_geojson,
        network_version,
        derivation_method,
        calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(road_key, facility_type) DO UPDATE SET
        nearest_facility_id = excluded.nearest_facility_id,
        nearest_facility_name = excluded.nearest_facility_name,
        network_distance_m = excluded.network_distance_m,
        straight_line_distance_m = excluded.straight_line_distance_m,
        road_access_point_geojson = excluded.road_access_point_geojson,
        facility_snap_point_geojson = excluded.facility_snap_point_geojson,
        facility_snap_distance_m = excluded.facility_snap_distance_m,
        route_geometry_geojson = excluded.route_geometry_geojson,
        network_version = excluded.network_version
    `);

    let evaluatedRoads = 0;
    let resolvedRoads = 0;
    let unresolvedRoads = 0;

    for (const r of roads) {
      evaluatedRoads++;
      const roadNodes = this.roadNodesMap.get(r.road_key);

      let bestNodeKey: string | null = null;
      let minRoadDist = Infinity;

      if (roadNodes && roadNodes.size > 0) {
        for (const nKey of roadNodes) {
          const d = dist.get(nKey);
          if (d !== undefined && d < minRoadDist) {
            minRoadDist = d;
            bestNodeKey = nKey;
          }
        }
      }

      if (bestNodeKey && minRoadDist < Infinity) {
        resolvedRoads++;
        const targetFac = nearestFacMap.get(bestNodeKey)!;
        const accessNode = this.nodes.get(bestNodeKey)!;
        const accessCoord = accessNode.coord;
        const facSnapCoord: [number, number] = [targetFac.snapped_lng, targetFac.snapped_lat];

        // Trace route coordinates from bestNodeKey to facility
        const routeCoords: Array<[number, number]> = [accessCoord];
        let curr = bestNodeKey;
        const visitedRoute = new Set<string>();

        while (parent.has(curr) && !visitedRoute.has(curr)) {
          visitedRoute.add(curr);
          const pInfo = parent.get(curr)!;
          routeCoords.push(pInfo.edgeP1);
          curr = pInfo.fromNode;
        }
        routeCoords.push(facSnapCoord);

        // Straight-line distance
        const straightLineKm = turf.distance(turf.point(accessCoord), turf.point([targetFac.original_lng, targetFac.original_lat]), {
          units: 'kilometers',
        });
        const straightLineM = Math.round(straightLineKm * 1000 * 10) / 10;

        const routeGeoJson = {
          type: 'LineString',
          coordinates: routeCoords,
        };

        const accessPtGeoJson = {
          type: 'Point',
          coordinates: accessCoord,
        };

        const facSnapPtGeoJson = {
          type: 'Point',
          coordinates: facSnapCoord,
        };

        insertNearestStmt.run(
          r.road_key,
          facilityType,
          targetFac.facility_id,
          targetFac.facility_name,
          Math.round(minRoadDist * 10) / 10,
          straightLineM,
          JSON.stringify(accessPtGeoJson),
          JSON.stringify(facSnapPtGeoJson),
          targetFac.snap_distance_m,
          JSON.stringify(routeGeoJson),
          this.networkHash,
          'MULTI_SOURCE_DIJKSTRA'
        );
      } else {
        unresolvedRoads++;
        // Disconnected component: record with null/unresolved status
        const defaultPt = { type: 'Point', coordinates: [115.25, -2.78] };
        const emptyLine = { type: 'LineString', coordinates: [] };

        insertNearestStmt.run(
          r.road_key,
          facilityType,
          'UNRESOLVED_DISCONNECTED',
          'Rute Jaringan Terputus / Tidak Terkoneksi',
          -1,
          null,
          JSON.stringify(defaultPt),
          JSON.stringify(defaultPt),
          0,
          JSON.stringify(emptyLine),
          this.networkHash,
          'DISCONNECTED_COMPONENT'
        );
      }
    }

    return { evaluatedRoads, resolvedRoads, unresolvedRoads };
  }

  /**
   * Recalculate nearest-facility distances deterministically across all facility types
   */
  public recalculateFacilityDistances(facilityType?: string): Record<string, { evaluated: number; resolved: number; unresolved: number }> {
    const typesToRun = facilityType ? [facilityType] : ['hospital', 'puskesmas', 'school', 'market'];
    const results: Record<string, any> = {};

    for (const t of typesToRun) {
      const stats = this.computeNearestFacilitiesForType(t);
      results[t] = {
        evaluated: stats.evaluatedRoads,
        resolved: stats.resolvedRoads,
        unresolved: stats.unresolvedRoads,
      };
    }

    return results;
  }

  /**
   * Retrieve administrative coverage for a road
   */
  public getRoadCoverage(roadKey: string): {
    road_key: string;
    road_name: string;
    villages: RoadVillageIntersectionEntity[];
    districts: RoadDistrictIntersectionEntity[];
    village_count: number;
    district_count: number;
  } {
    const roadStmt = this.db.prepare('SELECT display_name FROM roads WHERE road_key = ?');
    const roadRow = roadStmt.get(roadKey) as { display_name: string } | undefined;

    const vStmt = this.db.prepare(`
      SELECT * FROM road_village_intersections
      WHERE road_key = ?
      ORDER BY intersection_length_m DESC
    `);
    const villages = vStmt.all(roadKey) as unknown as RoadVillageIntersectionEntity[];

    const dStmt = this.db.prepare(`
      SELECT * FROM road_district_intersections
      WHERE road_key = ?
      ORDER BY intersection_length_m DESC
    `);
    const districts = dStmt.all(roadKey) as unknown as RoadDistrictIntersectionEntity[];

    return {
      road_key: roadKey,
      road_name: roadRow?.display_name || roadKey,
      villages,
      districts,
      village_count: villages.length,
      district_count: districts.length,
    };
  }

  /**
   * Retrieve nearest facilities and routes for a road
   */
  public getRoadNearestFacilities(roadKey: string): RoadNearestFacilityEntity[] {
    const stmt = this.db.prepare(`
      SELECT * FROM road_nearest_facilities
      WHERE road_key = ?
      ORDER BY facility_type ASC
    `);
    return stmt.all(roadKey) as unknown as RoadNearestFacilityEntity[];
  }

  /**
   * Retrieve comparison between imported historical distance vs network-calculated distance
   */
  public getDistanceReconciliation(): Array<{
    road_key: string;
    display_name: string;
    district_name: string;
    imported_rsud_m: number | null;
    calculated_rsud_m: number | null;
    delta_rsud_m: number | null;
    imported_puskesmas_m: number | null;
    calculated_puskesmas_m: number | null;
    delta_puskesmas_m: number | null;
    imported_sd_smp_m: number | null;
    calculated_sd_smp_m: number | null;
    delta_sd_smp_m: number | null;
    imported_pasar_m: number | null;
    calculated_pasar_m: number | null;
    delta_pasar_m: number | null;
    imported_ibukota_m: number | null;
    status_ibukota: string;
  }> {
    const csvContent = fs.readFileSync(SEED_FILES.roadContextHistoryCsv, 'utf8');
    const histRows = parseCsv<any>(csvContent);
    const histMap = new Map<string, any>();
    for (const row of histRows) {
      histMap.set(row.no, row);
    }

    const roadsStmt = this.db.prepare(`
      SELECT r.road_key, r.nomor_ruas, r.display_name, r.district_name
      FROM roads r
      ORDER BY r.nomor_ruas ASC
    `);
    const roads = roadsStmt.all() as Array<{
      road_key: string;
      nomor_ruas: string;
      display_name: string;
      district_name: string;
    }>;

    const calcStmt = this.db.prepare(`
      SELECT road_key, facility_type, network_distance_m
      FROM road_nearest_facilities
    `);
    const calcRows = calcStmt.all() as Array<{
      road_key: string;
      facility_type: string;
      network_distance_m: number;
    }>;

    const calcMap = new Map<string, Record<string, number>>();
    for (const cr of calcRows) {
      if (!calcMap.has(cr.road_key)) calcMap.set(cr.road_key, {});
      calcMap.get(cr.road_key)![cr.facility_type] = cr.network_distance_m;
    }

    const reconciliation: any[] = [];

    for (const r of roads) {
      // Find historical record by nomor_ruas
      const hist = histMap.get(r.nomor_ruas) || histMap.get(parseInt(r.nomor_ruas, 10).toString()) || {};
      const calc = calcMap.get(r.road_key) || {};

      const impRsud = hist.jarak_rsud_m !== undefined && hist.jarak_rsud_m !== '' ? parseFloat(hist.jarak_rsud_m) : null;
      const calcRsud = calc.hospital !== undefined && calc.hospital >= 0 ? calc.hospital : null;
      const deltaRsud = impRsud !== null && calcRsud !== null ? Math.round((calcRsud - impRsud) * 10) / 10 : null;

      const impPusk = hist.jarak_puskesmas_m !== undefined && hist.jarak_puskesmas_m !== '' ? parseFloat(hist.jarak_puskesmas_m) : null;
      const calcPusk = calc.puskesmas !== undefined && calc.puskesmas >= 0 ? calc.puskesmas : null;
      const deltaPusk = impPusk !== null && calcPusk !== null ? Math.round((calcPusk - impPusk) * 10) / 10 : null;

      const impSchool = hist.jarak_sd_smp_m !== undefined && hist.jarak_sd_smp_m !== '' ? parseFloat(hist.jarak_sd_smp_m) : null;
      const calcSchool = calc.school !== undefined && calc.school >= 0 ? calc.school : null;
      const deltaSchool = impSchool !== null && calcSchool !== null ? Math.round((calcSchool - impSchool) * 10) / 10 : null;

      const impPasar = hist.jarak_pasar_m !== undefined && hist.jarak_pasar_m !== '' ? parseFloat(hist.jarak_pasar_m) : null;
      const calcPasar = calc.market !== undefined && calc.market >= 0 ? calc.market : null;
      const deltaPasar = impPasar !== null && calcPasar !== null ? Math.round((calcPasar - impPasar) * 10) / 10 : null;

      const impIbukota = hist.jarak_ibukota_m !== undefined && hist.jarak_ibukota_m !== '' ? parseFloat(hist.jarak_ibukota_m) : null;

      reconciliation.push({
        road_key: r.road_key,
        display_name: r.display_name,
        district_name: r.district_name,
        imported_rsud_m: impRsud,
        calculated_rsud_m: calcRsud,
        delta_rsud_m: deltaRsud,
        imported_puskesmas_m: impPusk,
        calculated_puskesmas_m: calcPusk,
        delta_puskesmas_m: deltaPusk,
        imported_sd_smp_m: impSchool,
        calculated_sd_smp_m: calcSchool,
        delta_sd_smp_m: deltaSchool,
        imported_pasar_m: impPasar,
        calculated_pasar_m: calcPasar,
        delta_pasar_m: deltaPasar,
        imported_ibukota_m: impIbukota,
        status_ibukota: 'DATA_REQUIRED_NO_OFFICIAL_COORDINATE',
      });
    }

    return reconciliation;
  }
}
