import { DatabaseSync } from 'node:sqlite';

export interface ASBRecord {
  asb_id: string;
  source_row_index: number;
  item_category: string;
  item_code: string;
  package_name: string;
  specification: string;
  unit: string;
  unit_price_rp: number;
  unit_price_sen: number;
  expenditure_group: string;
  treatment_family: string | null;
  surface_type: string | null;
  road_width_m: number | null;
  surface_thickness_cm: number | null;
  budget_year: number;
  source_document: string;
  source_reference: string | null;
  source_file: string | null;
  is_active: number;
  created_at: string;
}

export interface AHSPRecord {
  ahsp_id: string;
  source_row_index: number;
  division_code: number;
  division_name: string;
  payment_code: string | null;
  item_description: string;
  unit: string | null;
  original_unit: string | null;
  unit_price_rp: number;
  unit_price_sen: number;
  work_category: string;
  quantity_basis: string;
  is_support_item: number;
  price_year: number;
  source_document: string;
  source_reference: string | null;
  source_file: string | null;
  is_active: number;
  created_at: string;
}

export interface TreatmentRuleRecord {
  rule_id: string;
  priority_order: number;
  rule_label: string;
  selected_profile: string;
  asb_type: string;
  condition_logic: string;
  rationale: string | null;
  is_active: number;
  created_at: string;
}

export interface ProfileRecord {
  profile_id: string;
  asb_type: string;
  structural_profile: string;
  purpose_description: string;
  disclaimer: string | null;
  is_active: number;
  created_at: string;
}

export interface ProfileItemRecord {
  profile_item_id: number;
  profile_id: string;
  ahsp_id: string | null;
  rule_identifier: string;
  item_role: string;
  quantity_basis: string;
  description: string;
  division_code: number;
  is_active: number;
}

export interface BudgetScenarioRecord {
  scenario_id: string;
  scenario_code: string;
  scenario_name: string;
  budget_year: number;
  description: string | null;
  scenario_status: string;
  created_at: string;
  updated_at: string;
}

export class CostingReferenceService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // Precision & Currency Conversion Utilities
  static rpToSen(rp: number): number {
    return Math.round(rp * 100);
  }

  static senToRp(sen: number): number {
    return sen / 100;
  }

  static formatRp(rp: number): string {
    return 'Rp ' + Number(rp).toLocaleString('id-ID');
  }

  static formatSen(sen: number): string {
    const rp = sen / 100;
    return 'Rp ' + rp.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ASB
  getASBCount(): number {
    const row = this.db.prepare('SELECT count(*) as cnt FROM master_asb_items;').get() as { cnt: number };
    return row.cnt;
  }

  getASBItemById(asbId: string): ASBRecord | null {
    const row = this.db.prepare('SELECT * FROM master_asb_items WHERE asb_id = ?;').get(asbId) as ASBRecord | undefined;
    return row || null;
  }

  getASBItemsByCategory(category: string): ASBRecord[] {
    return this.db.prepare('SELECT * FROM master_asb_items WHERE item_category = ? ORDER BY source_row_index;').all(category) as unknown as ASBRecord[];
  }

  // AHSP
  getAHSPCount(): number {
    const row = this.db.prepare('SELECT count(*) as cnt FROM master_ahsp_items;').get() as { cnt: number };
    return row.cnt;
  }

  getAHSPItemById(ahspId: string): AHSPRecord | null {
    const row = this.db.prepare('SELECT * FROM master_ahsp_items WHERE ahsp_id = ?;').get(ahspId) as AHSPRecord | undefined;
    return row || null;
  }

  getAHSPItemsByDivision(divisionCode: number): AHSPRecord[] {
    return this.db.prepare('SELECT * FROM master_ahsp_items WHERE division_code = ? ORDER BY source_row_index;').all(divisionCode) as unknown as AHSPRecord[];
  }

  // Treatment Rules
  getTreatmentRules(): TreatmentRuleRecord[] {
    return this.db.prepare('SELECT * FROM treatment_package_rules ORDER BY priority_order;').all() as unknown as TreatmentRuleRecord[];
  }

  getTreatmentRuleById(ruleId: string): TreatmentRuleRecord | null {
    const row = this.db.prepare('SELECT * FROM treatment_package_rules WHERE rule_id = ?;').get(ruleId) as TreatmentRuleRecord | undefined;
    return row || null;
  }

  // Profiles
  getProfiles(): ProfileRecord[] {
    return this.db.prepare('SELECT * FROM asb_ahsp_profiles ORDER BY profile_id;').all() as unknown as ProfileRecord[];
  }

  getProfileById(profileId: string): ProfileRecord | null {
    const row = this.db.prepare('SELECT * FROM asb_ahsp_profiles WHERE profile_id = ?;').get(profileId) as ProfileRecord | undefined;
    return row || null;
  }

  getProfileItemsByProfileId(profileId: string): ProfileItemRecord[] {
    return this.db.prepare('SELECT * FROM asb_ahsp_profile_items WHERE profile_id = ? ORDER BY profile_item_id;').all(profileId) as unknown as ProfileItemRecord[];
  }

  getTotalProfileItemsCount(): number {
    const row = this.db.prepare('SELECT count(*) as cnt FROM asb_ahsp_profile_items;').get() as { cnt: number };
    return row.cnt;
  }

  // Budget Scenarios (Phase 1.1)
  getScenarios(): BudgetScenarioRecord[] {
    return this.db.prepare('SELECT * FROM budget_scenarios ORDER BY budget_year DESC, scenario_id ASC;').all() as unknown as BudgetScenarioRecord[];
  }

  getScenarioById(scenarioId: string): BudgetScenarioRecord | null {
    const row = this.db.prepare('SELECT * FROM budget_scenarios WHERE scenario_id = ?;').get(scenarioId) as BudgetScenarioRecord | undefined;
    return row || null;
  }

  getScenarioByCode(scenarioCode: string): BudgetScenarioRecord | null {
    const row = this.db.prepare('SELECT * FROM budget_scenarios WHERE scenario_code = ?;').get(scenarioCode) as BudgetScenarioRecord | undefined;
    return row || null;
  }

  createScenario(data: {
    scenario_id: string;
    scenario_code: string;
    scenario_name: string;
    budget_year: number;
    description?: string;
    scenario_status?: string;
  }): BudgetScenarioRecord {
    const insertStmt = this.db.prepare(`
      INSERT INTO budget_scenarios (
        scenario_id,
        scenario_code,
        scenario_name,
        budget_year,
        description,
        scenario_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));
    `);

    insertStmt.run(
      data.scenario_id,
      data.scenario_code,
      data.scenario_name,
      data.budget_year,
      data.description || null,
      data.scenario_status || 'DRAFT'
    );

    return this.getScenarioById(data.scenario_id)!;
  }
}
