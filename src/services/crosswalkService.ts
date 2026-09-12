import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

export interface CrosswalkEntity {
  crosswalk_id: string;
  source_system: string;
  source_id: string;
  source_name: string;
  road_key: string;
  canonical_display: string;
  match_method: string;
  match_status: string;
}

export class CrosswalkService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Resolve an external source system ID strictly to canonical road_key.
   * Prohibits fuzzy matching and silent fallbacks.
   */
  resolveSourceId(sourceSystem: string, sourceId: string): string | null {
    if (!sourceSystem || !sourceId) return null;
    const stmt = this.db.prepare(
      'SELECT road_key FROM source_crosswalk WHERE source_system = ? AND source_id = ?'
    );
    const row = stmt.get(sourceSystem, sourceId) as unknown as { road_key: string } | undefined;
    return row ? row.road_key : null;
  }

  /**
   * Strict resolver that throws if the source ID cannot be resolved.
   */
  resolveSourceIdStrict(sourceSystem: string, sourceId: string): string {
    const roadKey = this.resolveSourceId(sourceSystem, sourceId);
    if (!roadKey) {
      throw new Error(
        `UNRESOLVED_SOURCE_ID: No canonical mapping found for system '${sourceSystem}' and source_id '${sourceId}'. Fuzzy matching and silent fallback are prohibited.`
      );
    }
    return roadKey;
  }

  /**
   * Get all crosswalk records for a given canonical road_key.
   */
  getCrosswalksForRoad(roadKey: string): CrosswalkEntity[] {
    const stmt = this.db.prepare(
      'SELECT * FROM source_crosswalk WHERE road_key = ? ORDER BY source_system ASC'
    );
    return stmt.all(roadKey) as unknown as CrosswalkEntity[];
  }

  /**
   * Get total count of verified crosswalk records.
   */
  getCrosswalkCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM source_crosswalk');
    const row = stmt.get() as unknown as { count: number };
    return row.count;
  }

  /**
   * Retrieve all crosswalk records across the four systems.
   */
  getAllCrosswalks(): CrosswalkEntity[] {
    const stmt = this.db.prepare(
      'SELECT * FROM source_crosswalk ORDER BY source_system ASC, source_id ASC'
    );
    return stmt.all() as unknown as CrosswalkEntity[];
  }
}
