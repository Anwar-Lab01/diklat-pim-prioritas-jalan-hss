import fs from 'node:fs';
import { parseCsv } from '../src/ingestion/csvParser.ts';
import { SEED_FILES } from '../src/config/constants.ts';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/diklat_pim.db');
const content = fs.readFileSync(SEED_FILES.roadContextHistoryCsv, 'utf8');
const rows = parseCsv<any>(content);

const roads = db.prepare('SELECT road_key, nomor_ruas, display_name FROM roads').all() as any[];

const cwHist = db.prepare(`
  SELECT road_key, source_id
  FROM source_crosswalk
  WHERE source_system = 'historical_normative_workbook'
`).all() as any[];

const cwMl = db.prepare(`
  SELECT road_key, source_id
  FROM source_crosswalk
  WHERE source_system = 'dataset_ml_clean'
`).all() as any[];

const histByNo = new Map<string, any>(rows.map(r => [r.no, r]));
const histByMlId = new Map<string, any>(rows.map(r => [r.source_ml_road_id, r]));

import { UiDataService } from '../src/services/uiDataService.ts';

const ui = new UiDataService(db);
const obs = db.prepare(`
  SELECT variable_code, raw_value, normalized_value
  FROM road_variable_observations
  WHERE road_key = 'HSS-KAB-025' AND operating_mode = 'OPERATIONAL_2025'
`).all();
console.table(obs);




















