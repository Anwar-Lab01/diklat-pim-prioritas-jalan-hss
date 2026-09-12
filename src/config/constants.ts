import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../../');

export const DB_DIR = path.resolve(PROJECT_ROOT, 'data');
export const DEPLOY_DB_PATH = path.resolve(DB_DIR, 'diklat_pim_deploy.db');
export const DEFAULT_DEV_DB_PATH = path.resolve(DB_DIR, 'diklat_pim.db');

export const DB_PATH = process.env.DB_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DB_PATH)
  : (process.env.NODE_ENV === 'production' || process.env.VERCEL || !fs.existsSync(DEFAULT_DEV_DB_PATH))
    ? DEPLOY_DB_PATH
    : DEFAULT_DEV_DB_PATH;

export const SEED_BASE_DIR = path.resolve(
  PROJECT_ROOT,
  '01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry'
);

export const SEED_FILES = {
  roadRegistry: path.resolve(SEED_BASE_DIR, 'authoritative/road_registry_authoritative.csv'),
  roadMaster: path.resolve(SEED_BASE_DIR, 'master/road_master.csv'),
  roadAliases: path.resolve(SEED_BASE_DIR, 'authoritative/road_aliases_authoritative.csv'),
  sourceCrosswalk: path.resolve(SEED_BASE_DIR, 'authoritative/source_crosswalk.csv'),
  roadConditions2025: path.resolve(SEED_BASE_DIR, 'conditions/road_conditions_2025.csv'),
  roadsCountyGeoJson: path.resolve(SEED_BASE_DIR, 'spatial/roads_county.geojson'),
  roadsProvincialGeoJson: path.resolve(SEED_BASE_DIR, 'spatial/roads_provincial.geojson'),
  roadsNationalGeoJson: path.resolve(SEED_BASE_DIR, 'spatial/roads_national.geojson'),
  networkConnectorsGeoJson: path.resolve(SEED_BASE_DIR, 'spatial/network_connectors.geojson'),
  rtrwPolaRuangGeoJson: path.resolve(SEED_BASE_DIR, 'spatial/rtrw_pola_ruang.geojson'),
  rtrwCategoriesCsv: path.resolve(SEED_BASE_DIR, 'spatial/rtrw_pola_ruang_categories.csv'),
  publicFacilitiesGeoJson: path.resolve(SEED_BASE_DIR, 'facilities/public_facilities.geojson'),
  districtsGeoJson: path.resolve(SEED_BASE_DIR, 'administration/districts.geojson'),
  districtsMaster: path.resolve(SEED_BASE_DIR, 'administration/district_master.csv'),
  villagesGeoJson: path.resolve(SEED_BASE_DIR, 'administration/villages.geojson'),
  villagesMaster: path.resolve(SEED_BASE_DIR, 'administration/village_master.csv'),
  priorityBaselineCanonical: path.resolve(
    SEED_BASE_DIR,
    'priority/priority_baseline_normative_canonical.csv'
  ),
};

export const AUTHORITY_INVARIANTS = {
  CANONICAL_ROAD_COUNT: 350,
  CANONICAL_KEY_PREFIX: 'HSS-KAB-',
  CANONICAL_RANGE_START: 1,
  CANONICAL_RANGE_END: 350,
  CROSSWALK_COUNT: 1400,
  TOTAL_LENGTH_KM_2025: 732.460,
  MANTAP_KM_2025: 392.890,
  TIDAK_MANTAP_KM_2025: 339.570,
  DISTRICT_COUNT: 11,
  VILLAGE_COUNT: 148,
  PUBLIC_FACILITY_COUNT: 285,
  PROVINCIAL_ROAD_COUNT: 4,
  NATIONAL_ROAD_COUNT: 8,
  CONNECTOR_COUNT: 4,
  REFERENCE_NETWORK_TOTAL: 16,
  CATEGORY_COUNT: 4,
  VARIABLE_COUNT: 17,
};

export interface RawCategoryDefinition {
  category_code: string;
  category_name: string;
  description: string;
  display_order: number;
  default_weight_raw: number;
}

export const CATEGORY_DEFINITIONS: RawCategoryDefinition[] = [
  {
    category_code: 'TEKNIS_JALAN',
    category_name: 'Data Teknis Jalan',
    description: 'Karakteristik fisik penampang jalan, kondisi kerusakan permukaan, dan tipe lapis perkerasan.',
    display_order: 1,
    default_weight_raw: 0.378965,
  },
  {
    category_code: 'AKSESIBILITAS',
    category_name: 'Data Aksesibilitas',
    description: 'Konektivitas ke simpul jaringan jalan provinsi/nasional dan akses ke ibukota kabupaten (Kandangan).',
    display_order: 2,
    default_weight_raw: 0.283815,
  },
  {
    category_code: 'PELAYANAN_MASYARAKAT',
    category_name: 'Data Pelayanan Masyarakat',
    description: 'Aksesibilitas jaringan jalan terhadap fasilitas kesehatan primer/rujukan, pendidikan, dan pasar.',
    display_order: 3,
    default_weight_raw: 0.192412,
  },
  {
    category_code: 'SPASIAL_DEMOGRAFI',
    category_name: 'Data Spasial & Demografi',
    description: 'Beban populasi penduduk terlayani serta jangkauan lintas batas administratif desa dan kecamatan.',
    display_order: 4,
    default_weight_raw: 0.144807,
  },
];

export interface RawVariableDefinition {
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
  local_weight_default: number;
  display_order: number;
}

export const VARIABLE_DEFINITIONS: RawVariableDefinition[] = [
  // Kategori 1: Data Teknis Jalan (7 Variabel, Local Weight = 1/7)
  {
    variable_code: 'norm_panjang_ruas',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Panjang Ruas Jalan',
    definition: 'Panjang bentang fisik ruas jalan SK.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'km',
    raw_source_field: 'PANJANG (KM)',
    normalization_rule: 'LINEAR_MINMAX',
    param_min: 0.060,
    param_max: 17.110,
    local_weight_default: 1.0 / 7.0,
    display_order: 1,
  },
  {
    variable_code: 'norm_lebar_ruas',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Lebar Perkerasan Jalan',
    definition: 'Lebar perkerasan rata-rata badan jalan.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'm',
    raw_source_field: 'Lbr_Keras',
    normalization_rule: 'CLAMPED_MINMAX',
    param_min: 3.0,
    param_max: 14.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 2,
  },
  {
    variable_code: 'norm_kondisi_sedang',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Proporsi Rusak Sedang',
    definition: 'Persentase segmen dalam kondisi rusak sedang yang membutuhkan pemeliharaan berkala.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'rasio',
    raw_source_field: 'sedang_pct',
    normalization_rule: 'PERCENTAGE_RATIO',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 3,
  },
  {
    variable_code: 'norm_rusak_ringan',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Proporsi Rusak Ringan',
    definition: 'Persentase segmen dalam kondisi rusak ringan yang membutuhkan pemeliharaan rutin.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'rasio',
    raw_source_field: 'rusak_ringan_pct',
    normalization_rule: 'PERCENTAGE_RATIO',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 4,
  },
  {
    variable_code: 'norm_rusak_berat',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Proporsi Rusak Berat',
    definition: 'Persentase segmen dalam kondisi rusak berat yang membutuhkan rehabilitasi/rekonstruksi.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'rasio',
    raw_source_field: 'rusak_berat_pct',
    normalization_rule: 'PERCENTAGE_RATIO',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 5,
  },
  {
    variable_code: 'norm_permukaan_aspal_penmac',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Proporsi Permukaan Aspal / Penetran Macadam',
    definition: 'Persentase lapis permukaan beraspal (Hotmix atau Lapen).',
    optimization_dir: 'BENEFIT',
    raw_unit: 'rasio',
    raw_source_field: 'surface_asphalt_pct_source',
    normalization_rule: 'PERCENTAGE_RATIO',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 6,
  },
  {
    variable_code: 'norm_permukaan_beton',
    category_code: 'TEKNIS_JALAN',
    variable_label: 'Proporsi Permukaan Rigid Beton',
    definition: 'Persentase lapis permukaan kaku beton semen (rigid pavement).',
    optimization_dir: 'BENEFIT',
    raw_unit: 'rasio',
    raw_source_field: 'surface_rigid_pct_source',
    normalization_rule: 'PERCENTAGE_RATIO',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 7.0,
    display_order: 7,
  },

  // Kategori 2: Data Aksesibilitas (3 Variabel, Local Weight = 1/3)
  {
    variable_code: 'norm_koneksi_jalan_provinsi',
    category_code: 'AKSESIBILITAS',
    variable_label: 'Konektivitas Jalan Provinsi',
    definition: 'Indikator keterhubungan langsung dengan jaringan jalan provinsi.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'biner',
    raw_source_field: 'koneksi_jalan_provinsi',
    normalization_rule: 'BINARY_FLAG',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 3.0,
    display_order: 8,
  },
  {
    variable_code: 'norm_koneksi_jalan_nasional',
    category_code: 'AKSESIBILITAS',
    variable_label: 'Konektivitas Jalan Nasional',
    definition: 'Indikator keterhubungan langsung dengan jaringan koridor nasional trans-Kalimantan.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'biner',
    raw_source_field: 'koneksi_jalan_nasional',
    normalization_rule: 'BINARY_FLAG',
    param_min: 0.0,
    param_max: 1.0,
    local_weight_default: 1.0 / 3.0,
    display_order: 9,
  },
  {
    variable_code: 'norm_jarak_ibukota_kabupaten_cost',
    category_code: 'AKSESIBILITAS',
    variable_label: 'Aksesibilitas Ibukota Kabupaten (Kandangan)',
    definition: 'Jarak rute terpendek jaringan jalan menuju pusat pemerintahan di Kandangan.',
    optimization_dir: 'COST',
    raw_unit: 'meter',
    raw_source_field: 'jarak_ibukota_kabupaten',
    normalization_rule: 'INVERTED_MINMAX',
    param_min: 257.6,
    param_max: 47122.1,
    local_weight_default: 1.0 / 3.0,
    display_order: 10,
  },

  // Kategori 3: Data Pelayanan Masyarakat (4 Variabel, Local Weight = 1/4)
  {
    variable_code: 'norm_jarak_rsud_cost',
    category_code: 'PELAYANAN_MASYARAKAT',
    variable_label: 'Aksesibilitas Rumah Sakit Umum Daerah',
    definition: 'Jarak jaringan jalan terpendek menuju fasilitas RSUD rujukan tingkat kabupaten.',
    optimization_dir: 'COST',
    raw_unit: 'meter',
    raw_source_field: 'jarak_rsud',
    normalization_rule: 'INVERTED_MINMAX',
    param_min: 41.4,
    param_max: 43384.5,
    local_weight_default: 0.25,
    display_order: 11,
  },
  {
    variable_code: 'norm_jarak_puskesmas_cost',
    category_code: 'PELAYANAN_MASYARAKAT',
    variable_label: 'Aksesibilitas Puskesmas',
    definition: 'Jarak jaringan jalan terpendek menuju fasilitas kesehatan tingkat pertama (Puskesmas).',
    optimization_dir: 'COST',
    raw_unit: 'meter',
    raw_source_field: 'jarak_puskesmas',
    normalization_rule: 'INVERTED_MINMAX',
    param_min: 0.0,
    param_max: 21229.7,
    local_weight_default: 0.25,
    display_order: 12,
  },
  {
    variable_code: 'norm_jarak_sd_smp_cost',
    category_code: 'PELAYANAN_MASYARAKAT',
    variable_label: 'Aksesibilitas Pendidikan Dasar (SD/SMP)',
    definition: 'Jarak jaringan jalan terpendek menuju fasilitas sekolah dasar atau menengah pertama.',
    optimization_dir: 'COST',
    raw_unit: 'meter',
    raw_source_field: 'jarak_sd_smp',
    normalization_rule: 'INVERTED_MINMAX',
    param_min: 0.0,
    param_max: 8064.6,
    local_weight_default: 0.25,
    display_order: 13,
  },
  {
    variable_code: 'norm_jarak_pasar_cost',
    category_code: 'PELAYANAN_MASYARAKAT',
    variable_label: 'Aksesibilitas Pasar Tradisional',
    definition: 'Jarak jaringan jalan terpendek menuju titik pasar rakyat/sentra ekonomi lokal.',
    optimization_dir: 'COST',
    raw_unit: 'meter',
    raw_source_field: 'jarak_pasar',
    normalization_rule: 'INVERTED_MINMAX',
    param_min: 0.0,
    param_max: 18270.0,
    local_weight_default: 0.25,
    display_order: 14,
  },

  // Kategori 4: Data Spasial & Demografi (3 Variabel, Local Weight = 1/3)
  {
    variable_code: 'norm_penduduk_dilayani',
    category_code: 'SPASIAL_DEMOGRAFI',
    variable_label: 'Penduduk Terlayani',
    definition: 'Jumlah agregat penduduk pada desa/kelurahan yang dilintasi ruas jalan.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'jiwa',
    raw_source_field: 'penduduk_dilayani',
    normalization_rule: 'LINEAR_MINMAX',
    param_min: 138.0,
    param_max: 9090.0,
    local_weight_default: 1.0 / 3.0,
    display_order: 15,
  },
  {
    variable_code: 'norm_desa_dilalui',
    category_code: 'SPASIAL_DEMOGRAFI',
    variable_label: 'Cakupan Desa Terlintasi',
    definition: 'Jumlah wilayah desa/kelurahan yang dilintasi secara fisik oleh ruas jalan.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'desa',
    raw_source_field: 'desa_dilalui',
    normalization_rule: 'LINEAR_MINMAX',
    param_min: 1.0,
    param_max: 9.0,
    local_weight_default: 1.0 / 3.0,
    display_order: 16,
  },
  {
    variable_code: 'norm_kecamatan_dilalui',
    category_code: 'SPASIAL_DEMOGRAFI',
    variable_label: 'Cakupan Kecamatan Terlintasi',
    definition: 'Jumlah wilayah kecamatan yang dilintasi oleh bentang ruas jalan.',
    optimization_dir: 'BENEFIT',
    raw_unit: 'kecamatan',
    raw_source_field: 'kecamatan_dilalui',
    normalization_rule: 'LINEAR_MINMAX',
    param_min: 1.0,
    param_max: 3.0,
    local_weight_default: 1.0 / 3.0,
    display_order: 17,
  },
];
