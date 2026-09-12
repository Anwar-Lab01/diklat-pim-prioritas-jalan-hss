import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';

export interface CategoryEntity {
  category_code: string;
  category_name: string;
  description: string;
  display_order: number;
  default_weight_raw: number;
}

export interface VariableDefinitionEntity {
  variable_code: string;
  category_code: string;
  variable_label: string;
  definition: string;
  optimization_dir: 'BENEFIT' | 'COST';
  raw_unit: string;
  raw_source_field: string;
  normalization_rule: string;
  param_min: number | null;
  param_max: number | null;
  is_recomputable: number;
  display_order: number;
}

export interface ModelWeightSummary {
  model_id: string;
  model_code: string;
  model_name: string;
  model_lifecycle: string;
  is_locked: number;
  category_weights: Array<{
    category_code: string;
    raw_weight: number;
    normalized_weight: number;
  }>;
  variable_weights: Array<{
    variable_code: string;
    category_code: string;
    local_weight: number;
    effective_weight: number;
  }>;
}

export class ModelService {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
  }

  /**
   * Retrieve all 4 normative categories.
   */
  getCategories(): CategoryEntity[] {
    const stmt = this.db.prepare('SELECT * FROM categories ORDER BY display_order ASC');
    return stmt.all() as unknown as CategoryEntity[];
  }

  /**
   * Retrieve all 17 normative variable definitions.
   * Guarantees label_top105 is not included.
   */
  getVariables(categoryCode?: string): VariableDefinitionEntity[] {
    let sql = 'SELECT * FROM variable_definitions';
    const params: any[] = [];
    if (categoryCode) {
      sql += ' WHERE category_code = ?';
      params.push(categoryCode);
    }
    sql += ' ORDER BY display_order ASC';

    const stmt = this.db.prepare(sql);
    return (params.length > 0 ? stmt.all(...params) : stmt.all()) as unknown as VariableDefinitionEntity[];
  }

  /**
   * Retrieve baseline model POLICY_DEFAULT_V1 and its locked hierarchical weights.
   */
  getBaselineModel(): ModelWeightSummary | null {
    const modelStmt = this.db.prepare(
      "SELECT * FROM priority_models WHERE model_code = 'POLICY_DEFAULT_V1'"
    );
    const model = modelStmt.get() as unknown as any;
    if (!model) return null;

    const catStmt = this.db.prepare(
      'SELECT category_code, raw_weight, normalized_weight FROM model_category_weights WHERE model_id = ? ORDER BY category_code ASC'
    );
    const catWeights = catStmt.all(model.model_id) as unknown as Array<{
      category_code: string;
      raw_weight: number;
      normalized_weight: number;
    }>;

    const varStmt = this.db.prepare(
      'SELECT variable_code, category_code, local_weight, effective_weight FROM model_variable_weights WHERE model_id = ? ORDER BY variable_code ASC'
    );
    const varWeights = varStmt.all(model.model_id) as unknown as Array<{
      variable_code: string;
      category_code: string;
      local_weight: number;
      effective_weight: number;
    }>;

    return {
      model_id: model.model_id,
      model_code: model.model_code,
      model_name: model.model_name,
      model_lifecycle: model.model_lifecycle,
      is_locked: model.is_locked,
      category_weights: catWeights,
      variable_weights: varWeights,
    };
  }

  /**
   * Retrieve road variable observations for a specific road and operating mode.
   */
  getRoadObservations(
    roadKey: string,
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025'
  ): Array<{
    variable_code: string;
    raw_value: number;
    normalized_value: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT variable_code, raw_value, normalized_value
      FROM road_variable_observations
      WHERE road_key = ? AND operating_mode = ?
      ORDER BY variable_code ASC
    `);
    return stmt.all(roadKey, operatingMode) as unknown as Array<{
      variable_code: string;
      raw_value: number;
      normalized_value: number;
    }>;
  }
}
