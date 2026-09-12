import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

export interface RoadEntity {
  road_id: string;
  road_key: string;
  nomor_ruas: string;
  canonical_name: string;
  display_name: string;
  district_name: string;
  village_coverage: string;
  length_km_official: number;
  width_m_official: number;
  identity_status: string;
  created_at: string;
  updated_at: string;
}

export class RoadService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Authoritative lookup by canonical road_key (e.g. 'HSS-KAB-001')
   */
  getRoadByKey(roadKey: string): RoadEntity | null {
    if (!roadKey || !roadKey.startsWith('HSS-KAB-')) {
      return null;
    }
    const stmt = this.db.prepare('SELECT * FROM roads WHERE road_key = ?');
    const result = stmt.get(roadKey) as unknown as RoadEntity | undefined;
    return result || null;
  }

  /**
   * Authoritative lookup by deterministic UUIDv5 road_id
   */
  getRoadById(roadId: string): RoadEntity | null {
    if (!roadId) return null;
    const stmt = this.db.prepare('SELECT * FROM roads WHERE road_id = ?');
    const result = stmt.get(roadId) as unknown as RoadEntity | undefined;
    return result || null;
  }

  /**
   * Authoritative lookup by official SK nomor_ruas (e.g. '001')
   */
  getRoadByNomorRuas(nomorRuas: string): RoadEntity | null {
    if (!nomorRuas) return null;
    const formatted = nomorRuas.padStart(3, '0');
    const stmt = this.db.prepare('SELECT * FROM roads WHERE nomor_ruas = ?');
    const result = stmt.get(formatted) as unknown as RoadEntity | undefined;
    return result || null;
  }

  /**
   * Retrieve all 350 canonical roads
   */
  getAllRoads(): RoadEntity[] {
    const stmt = this.db.prepare('SELECT * FROM roads ORDER BY nomor_ruas ASC');
    return stmt.all() as unknown as RoadEntity[];
  }

  /**
   * Total count of canonical roads
   */
  getRoadCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM roads');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  /**
   * Search roads via explicit search helpers (road_key, nomor_ruas, display_name, or aliases).
   * NOTE: For UI autocomplete/filtering ONLY. Joins must NEVER rely on free text.
   */
  searchRoads(query: string): RoadEntity[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const stmt = this.db.prepare(`
      SELECT DISTINCT r.*
      FROM roads r
      LEFT JOIN road_aliases a ON r.road_key = a.road_key
      WHERE r.road_key LIKE ?
         OR r.nomor_ruas LIKE ?
         OR r.display_name LIKE ?
         OR r.canonical_name LIKE ?
         OR a.alias_name LIKE ?
      ORDER BY r.nomor_ruas ASC
      LIMIT 50
    `);

    const pattern = `%${trimmed}%`;
    return stmt.all(pattern, pattern, pattern, pattern, pattern) as unknown as RoadEntity[];
  }
}
