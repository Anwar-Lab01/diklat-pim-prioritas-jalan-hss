import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT } from '../config/constants.ts';

// Interfaces for source data
export interface ASBItemSource {
  asb_id: string;
  no: number;
  kelompok_barang: string;
  kode_barang: string;
  uraian: string;
  spesifikasi: string;
  satuan: string;
  harga_rp: number;
  kelompok_belanja: string;
  treatment_family: string | null;
  surface_type: string | null;
  width_m: number | null;
  layer_thickness_cm: number | null;
}

export interface AHSPItemSource {
  hps_id: string;
  source_row: number | null;
  division_code: number;
  division_name: string;
  payment_code: string | null;
  uraian: string;
  original_satuan: string;
  satuan: string | null;
  harga_rp: number;
  source_reference: string;
  item_family: string;
  quantity_basis: string;
  is_support_item: boolean;
}

export interface SelectionRuleSource {
  rule_id: string;
  priority: number;
  label: string;
  condition: Record<string, any>;
  selected_profile: string;
  confidence?: string;
  rationale?: string;
}

export interface ProfileItemRuleSource {
  rule_id: string;
  description: string;
  division_code: number;
  item_family: string;
  keywords_in_uraian: string[];
  quantity_basis: string;
  role: string;
  confidence?: string;
}

export interface ProfileSource {
  profile_id: string;
  asb_type: string;
  structural_profile: string;
  purpose: string;
  disclaimer: string;
  suggested_item_rules: ProfileItemRuleSource[];
}

function resolveSourcePath(relativeOrAbsolutePath: string, fallbackSubpath: string): string {
  const candidates = [
    relativeOrAbsolutePath,
    path.resolve('F:/WebApps/1.ml_apps', fallbackSubpath),
    path.resolve(PROJECT_ROOT, '../1.ml_apps', fallbackSubpath),
    path.resolve(PROJECT_ROOT, '01_authoritative_seed/costing', path.basename(fallbackSubpath)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`SOURCE_FILE_NOT_FOUND: Could not resolve path for ${fallbackSubpath}`);
}

export function ingestMasterASB(db: DatabaseSync): {
  total: number;
  inserted: number;
  skipped: number;
  jalanCount: number;
  jembatanCount: number;
} {
  const filePath = resolveSourcePath(
    'F:/WebApps/1.ml_apps/public/data/asb_unit_prices.json',
    'public/data/asb_unit_prices.json'
  );

  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const items: ASBItemSource[] = payload.items || [];

  if (items.length !== 1010) {
    throw new Error(`ASB_ITEM_COUNT_MISMATCH: Expected 1010 items, found ${items.length}`);
  }

  const checkStmt = db.prepare(`
    SELECT asb_id, unit_price_rp, package_name 
    FROM master_asb_items 
    WHERE asb_id = ?;
  `);

  const insertStmt = db.prepare(`
    INSERT INTO master_asb_items (
      asb_id,
      source_row_index,
      item_category,
      item_code,
      package_name,
      specification,
      unit,
      unit_price_rp,
      unit_price_sen,
      expenditure_group,
      treatment_family,
      surface_type,
      road_width_m,
      surface_thickness_cm,
      budget_year,
      source_document,
      source_reference,
      source_file,
      is_active,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
  `);

  let inserted = 0;
  let skipped = 0;
  let jalanCount = 0;
  let jembatanCount = 0;

  for (const item of items) {
    if (item.kelompok_barang === 'Jalan Kabupaten') jalanCount++;
    else if (item.kelompok_barang === 'Jembatan pada Jalan Kabupaten') jembatanCount++;

    const existing = checkStmt.get(item.asb_id) as { asb_id: string; unit_price_rp: number; package_name: string } | undefined;

    if (existing) {
      if (existing.unit_price_rp === item.harga_rp && existing.package_name === item.uraian) {
        skipped++;
        continue;
      }
      throw new Error(
        `CONFLICT_ASB_DATA: Record ${item.asb_id} exists with differing values (stored price: ${existing.unit_price_rp}, source price: ${item.harga_rp})`
      );
    }

    insertStmt.run(
      item.asb_id,
      item.no,
      item.kelompok_barang,
      item.kode_barang,
      item.uraian,
      item.spesifikasi,
      item.satuan,
      item.harga_rp,
      Math.round(item.harga_rp * 100),
      item.kelompok_belanja,
      item.treatment_family || null,
      item.surface_type || null,
      item.width_m !== undefined ? item.width_m : null,
      item.layer_thickness_cm !== undefined ? item.layer_thickness_cm : null,
      2027,
      'ASB BM 2027.xlsx',
      'Perbup HSS / ASB BM 2027',
      'asb_unit_prices.json',
      1
    );
    inserted++;
  }

  return { total: items.length, inserted, skipped, jalanCount, jembatanCount };
}

export function ingestMasterAHSP(db: DatabaseSync): {
  total: number;
  inserted: number;
  skipped: number;
  divisionsCount: number;
} {
  const filePath = resolveSourcePath(
    'F:/WebApps/1.ml_apps/public/data/hps_unit_prices.json',
    'public/data/hps_unit_prices.json'
  );

  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const items: AHSPItemSource[] = payload.items || [];

  if (items.length !== 483) {
    throw new Error(`AHSP_ITEM_COUNT_MISMATCH: Expected 483 items, found ${items.length}`);
  }

  const checkStmt = db.prepare(`
    SELECT ahsp_id, unit_price_rp, item_description 
    FROM master_ahsp_items 
    WHERE ahsp_id = ?;
  `);

  const insertStmt = db.prepare(`
    INSERT INTO master_ahsp_items (
      ahsp_id,
      source_row_index,
      division_code,
      division_name,
      payment_code,
      item_description,
      unit,
      original_unit,
      unit_price_rp,
      unit_price_sen,
      work_category,
      quantity_basis,
      is_support_item,
      price_year,
      source_document,
      source_reference,
      source_file,
      is_active,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
  `);

  let inserted = 0;
  let skipped = 0;
  const divisions = new Set<number>();

  for (const item of items) {
    divisions.add(item.division_code);
    const existing = checkStmt.get(item.hps_id) as { ahsp_id: string; unit_price_rp: number; item_description: string } | undefined;

    if (existing) {
      if (existing.unit_price_rp === item.harga_rp && existing.item_description === item.uraian) {
        skipped++;
        continue;
      }
      throw new Error(
        `CONFLICT_AHSP_DATA: Record ${item.hps_id} exists with differing values (stored price: ${existing.unit_price_rp}, source price: ${item.harga_rp})`
      );
    }

    insertStmt.run(
      item.hps_id,
      item.source_row || 0,
      item.division_code,
      item.division_name,
      item.payment_code || null,
      item.uraian,
      item.satuan || item.original_satuan,
      item.original_satuan || null,
      item.harga_rp, // Preserve exact float precision
      Math.round(item.harga_rp * 100),
      item.item_family,
      item.quantity_basis,
      item.is_support_item ? 1 : 0,
      2025,
      'SE DJBK No. 182/SE/Dk/2025',
      item.source_reference || 'SE DJBK No. 182/SE/Dk/2025 / AHSP Bina Marga',
      'hps_unit_prices.json',
      1
    );
    inserted++;
  }

  return { total: items.length, inserted, skipped, divisionsCount: divisions.size };
}

export function ingestTreatmentPackageRules(db: DatabaseSync): {
  total: number;
  inserted: number;
  skipped: number;
} {
  const filePath = resolveSourcePath(
    'F:/WebApps/1.ml_apps/public/data/asb_budget_package_rules.json',
    'public/data/asb_budget_package_rules.json'
  );

  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const rules: SelectionRuleSource[] = payload.selection_rules || [];
  const profilesMap: Record<string, { asb_type: string; description: string }> = payload.structural_profiles || {};

  if (rules.length !== 6) {
    throw new Error(`TREATMENT_RULES_COUNT_MISMATCH: Expected 6 rules, found ${rules.length}`);
  }

  const checkStmt = db.prepare(`
    SELECT rule_id, priority_order, selected_profile 
    FROM treatment_package_rules 
    WHERE rule_id = ?;
  `);

  const insertStmt = db.prepare(`
    INSERT INTO treatment_package_rules (
      rule_id,
      priority_order,
      rule_label,
      selected_profile,
      asb_type,
      condition_logic,
      rationale,
      is_active,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
  `);

  let inserted = 0;
  let skipped = 0;

  for (const r of rules) {
    const asbType = profilesMap[r.selected_profile]?.asb_type || (r.selected_profile === 'no_major_asb_package' ? 'NONE' : '');
    const conditionLogicJson = JSON.stringify(r.condition);

    const existing = checkStmt.get(r.rule_id) as { rule_id: string; priority_order: number; selected_profile: string } | undefined;

    if (existing) {
      if (existing.priority_order === r.priority && existing.selected_profile === r.selected_profile) {
        skipped++;
        continue;
      }
      throw new Error(
        `CONFLICT_RULE_DATA: Rule ${r.rule_id} exists with differing profile/priority!`
      );
    }

    insertStmt.run(
      r.rule_id,
      r.priority,
      r.label,
      r.selected_profile,
      asbType,
      conditionLogicJson,
      r.rationale || null,
      1
    );
    inserted++;
  }

  return { total: rules.length, inserted, skipped };
}

export function ingestASBAHSPProfiles(db: DatabaseSync): {
  totalProfiles: number;
  insertedProfiles: number;
  skippedProfiles: number;
  totalProfileItems: number;
  insertedProfileItems: number;
  skippedProfileItems: number;
} {
  const filePath = resolveSourcePath(
    'F:/WebApps/1.ml_apps/public/data/hps_item_profile_rules.json',
    'public/data/hps_item_profile_rules.json'
  );

  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  const profiles: ProfileSource[] = payload.profiles || [];

  if (profiles.length !== 11) {
    throw new Error(`PROFILES_COUNT_MISMATCH: Expected 11 profiles, found ${profiles.length}`);
  }

  const checkProfileStmt = db.prepare(`
    SELECT profile_id, asb_type, structural_profile 
    FROM asb_ahsp_profiles 
    WHERE profile_id = ?;
  `);

  const insertProfileStmt = db.prepare(`
    INSERT INTO asb_ahsp_profiles (
      profile_id,
      asb_type,
      structural_profile,
      purpose_description,
      disclaimer,
      is_active,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
  `);

  const checkItemStmt = db.prepare(`
    SELECT profile_item_id 
    FROM asb_ahsp_profile_items 
    WHERE profile_id = ? AND rule_identifier = ?;
  `);

  const insertItemStmt = db.prepare(`
    INSERT INTO asb_ahsp_profile_items (
      profile_id,
      ahsp_id,
      rule_identifier,
      item_role,
      quantity_basis,
      description,
      division_code,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  let insertedProfiles = 0;
  let skippedProfiles = 0;
  let totalProfileItems = 0;
  let insertedProfileItems = 0;
  let skippedProfileItems = 0;

  for (const p of profiles) {
    const existingProfile = checkProfileStmt.get(p.profile_id) as { profile_id: string; asb_type: string; structural_profile: string } | undefined;

    if (existingProfile) {
      if (existingProfile.asb_type === p.asb_type && existingProfile.structural_profile === p.structural_profile) {
        skippedProfiles++;
      } else {
        throw new Error(`CONFLICT_PROFILE_DATA: Profile ${p.profile_id} exists with differing type!`);
      }
    } else {
      insertProfileStmt.run(
        p.profile_id,
        p.asb_type,
        p.structural_profile,
        p.purpose,
        p.disclaimer || null,
        1
      );
      insertedProfiles++;
    }

    const items = p.suggested_item_rules || [];
    totalProfileItems += items.length;

    for (const item of items) {
      const existingItem = checkItemStmt.get(p.profile_id, item.rule_id);
      if (existingItem) {
        skippedProfileItems++;
        continue;
      }

      insertItemStmt.run(
        p.profile_id,
        null, // ahsp_id is dynamically matched via rule criteria; no hardcoded orphan foreign key
        item.rule_id,
        item.role,
        item.quantity_basis,
        item.description,
        item.division_code,
        1
      );
      insertedProfileItems++;
    }
  }

  if (totalProfileItems !== 35) {
    throw new Error(`PROFILE_ITEMS_COUNT_MISMATCH: Expected 35 profile items, found ${totalProfileItems}`);
  }

  return {
    totalProfiles: profiles.length,
    insertedProfiles,
    skippedProfiles,
    totalProfileItems,
    insertedProfileItems,
    skippedProfileItems
  };
}

export function runCostingReferenceIngestion(db: DatabaseSync): {
  asbStats: ReturnType<typeof ingestMasterASB>;
  ahspStats: ReturnType<typeof ingestMasterAHSP>;
  rulesStats: ReturnType<typeof ingestTreatmentPackageRules>;
  profileStats: ReturnType<typeof ingestASBAHSPProfiles>;
} {
  console.log('--- INGESTING LAYER 7: COSTING & BUDGETING REFERENCE ---');

  // Ingest ASB
  console.log('[1/4] Ingesting Master ASB BM 2027 (1,010 items)...');
  const asbStats = ingestMasterASB(db);
  console.log(`      ✓ ASB items: ${asbStats.inserted} inserted, ${asbStats.skipped} skipped (Jalan: ${asbStats.jalanCount}, Jembatan: ${asbStats.jembatanCount})`);

  // Ingest AHSP
  console.log('[2/4] Ingesting Master AHSP BM 2025 (483 items)...');
  const ahspStats = ingestMasterAHSP(db);
  console.log(`      ✓ AHSP items: ${ahspStats.inserted} inserted, ${ahspStats.skipped} skipped across ${ahspStats.divisionsCount} divisions`);

  // Ingest Treatment Rules
  console.log('[3/4] Ingesting Treatment Selection Rules (6 rules)...');
  const rulesStats = ingestTreatmentPackageRules(db);
  console.log(`      ✓ Treatment rules: ${rulesStats.inserted} inserted, ${rulesStats.skipped} skipped`);

  // Ingest Profiles & Items
  console.log('[4/4] Ingesting ASB-AHSP Profiles & Items (11 profiles, 35 items)...');
  const profileStats = ingestASBAHSPProfiles(db);
  console.log(`      ✓ Profiles: ${profileStats.insertedProfiles} inserted, ${profileStats.skippedProfiles} skipped`);
  console.log(`      ✓ Profile items: ${profileStats.insertedProfileItems} inserted, ${profileStats.skippedProfileItems} skipped`);

  return { asbStats, ahspStats, rulesStats, profileStats };
}
