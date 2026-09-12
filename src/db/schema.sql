-- ====================================================================
-- SISTEM PENDUKUNG PRIORITAS PENANGANAN JALAN KABUPATEN HULU SUNGAI SELATAN
-- RELATIONAL DDL SCHEMA v1 (SQLite)
-- Strict Domain Separation, Foreign Key Constraints, and Canonical Invariants
-- ====================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------
-- LAYER 1: SOURCE FACTS (DATA DASAR OTORITATIF)
-- --------------------------------------------------------------------

-- 1. Master Ruas Jalan Kanonikal (350 Ruas SK Otoritatif)
CREATE TABLE IF NOT EXISTS roads (
    road_id             TEXT PRIMARY KEY,                     -- UUIDv5 deterministik
    road_key            TEXT NOT NULL UNIQUE,                 -- Kunci kanonikal: HSS-KAB-001 s.d. HSS-KAB-350
    nomor_ruas          TEXT NOT NULL UNIQUE,                 -- Nomor ruas resmi SK: 001 s.d. 350
    canonical_name      TEXT NOT NULL,                        -- Nama sumber resmi Dashboard 2025
    display_name        TEXT NOT NULL UNIQUE,                 -- Nama tampilan UI (termasuk kualifikasi duplikat)
    district_name       TEXT NOT NULL,                        -- Nama kecamatan utama (2025)
    village_coverage    TEXT NOT NULL,                        -- Deskripsi desa terlintasi dari survei
    length_km_official  REAL NOT NULL,                        -- Panjang resmi SK (km)
    width_m_official    REAL NOT NULL,                        -- Lebar perkerasan rata-rata (m)
    identity_status     TEXT NOT NULL DEFAULT 'AUTHORITATIVE_V1',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roads_road_key ON roads(road_key);
CREATE INDEX IF NOT EXISTS idx_roads_nomor_ruas ON roads(nomor_ruas);
CREATE INDEX IF NOT EXISTS idx_roads_district ON roads(district_name);

-- 2. Kamus Alias Nama Ruas (Search Helper Only - Never used as Join Key)
CREATE TABLE IF NOT EXISTS road_aliases (
    alias_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    road_key            TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    alias_type          TEXT NOT NULL,                        -- 'QGIS_NAME', 'HISTORICAL_NAME', 'ML_NAME', 'CANONICAL_NAME'
    alias_name          TEXT NOT NULL,
    source_reference    TEXT
);

CREATE INDEX IF NOT EXISTS idx_aliases_road_key ON road_aliases(road_key);
CREATE INDEX IF NOT EXISTS idx_aliases_name ON road_aliases(alias_name);

-- 3. Kamus Silang Sistem Sumber (1.400 Baris Lintas 4 Sistem Otoritatif)
CREATE TABLE IF NOT EXISTS source_crosswalk (
    crosswalk_id        TEXT PRIMARY KEY,
    source_system       TEXT NOT NULL,                        -- 'dashboard_2025', 'qgis_county_roads', 'historical_normative_workbook', 'dataset_ml_clean'
    source_id           TEXT NOT NULL,                        -- ID pada sistem sumber
    source_name         TEXT NOT NULL,
    road_key            TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    canonical_display   TEXT NOT NULL,
    match_method        TEXT NOT NULL,                        -- 'OFFICIAL_NO_RUAS', 'DETERMINISTIC_CODE', dll
    match_status        TEXT NOT NULL DEFAULT 'VERIFIED',
    CONSTRAINT uq_system_source_id UNIQUE (source_system, source_id)
);

CREATE INDEX IF NOT EXISTS idx_crosswalk_lookup ON source_crosswalk(source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_crosswalk_road_key ON source_crosswalk(road_key);

-- 4. Kondisi Jalan Tahunan Otoritatif (Survei Resmi 2025: 732.460 km)
CREATE TABLE IF NOT EXISTS road_conditions (
    condition_id        TEXT PRIMARY KEY,
    road_key            TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    survey_year         INTEGER NOT NULL,                     -- 2025 (Operational), 2024 (Baseline)
    baik_km             REAL NOT NULL DEFAULT 0.0,
    baik_pct            REAL NOT NULL DEFAULT 0.0,
    sedang_km           REAL NOT NULL DEFAULT 0.0,
    sedang_pct          REAL NOT NULL DEFAULT 0.0,
    rusak_ringan_km     REAL NOT NULL DEFAULT 0.0,
    rusak_ringan_pct    REAL NOT NULL DEFAULT 0.0,
    rusak_berat_km      REAL NOT NULL DEFAULT 0.0,
    rusak_berat_pct     REAL NOT NULL DEFAULT 0.0,
    mantap_km           REAL NOT NULL,
    mantap_pct          REAL NOT NULL,
    tidak_mantap_km     REAL NOT NULL,
    tidak_mantap_pct    REAL NOT NULL,
    total_panjang_km    REAL NOT NULL,
    authority_status    TEXT NOT NULL,                        -- 'FINAL_2025' atau 'HISTORIC_2024'
    source_filename     TEXT NOT NULL,
    source_sheet        TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_road_condition_year UNIQUE (road_key, survey_year)
);

CREATE INDEX IF NOT EXISTS idx_conditions_lookup ON road_conditions(road_key, survey_year);

-- 5. Geometri Spasial Ruas Jalan (350 Linestring Kabupaten WGS84 EPSG:4326)
CREATE TABLE IF NOT EXISTS road_geometries (
    road_id             TEXT PRIMARY KEY REFERENCES roads(road_id) ON DELETE RESTRICT,
    road_key            TEXT NOT NULL UNIQUE REFERENCES roads(road_key) ON DELETE RESTRICT,
    geometry_geojson    TEXT NOT NULL,                        -- GeoJSON Geometry (MultiLineString/LineString)
    geometry_length_m   REAL NOT NULL,                        -- Panjang kalkulasi spasial (meter)
    centroid_lat        REAL NOT NULL,
    centroid_lng        REAL NOT NULL,
    bbox_min_lat        REAL NOT NULL,
    bbox_min_lng        REAL NOT NULL,
    bbox_max_lat        REAL NOT NULL,
    bbox_max_lng        REAL NOT NULL,
    crs_declared        TEXT NOT NULL DEFAULT 'EPSG:4326'
);

CREATE INDEX IF NOT EXISTS idx_geometries_road_key ON road_geometries(road_key);

-- 6. Batas Administrasi Kecamatan (11 Kecamatan Hulu Sungai Selatan)
CREATE TABLE IF NOT EXISTS districts (
    district_id         TEXT PRIMARY KEY,
    district_name       TEXT NOT NULL UNIQUE,
    village_count       INTEGER NOT NULL,
    area_ha             REAL,
    regency_name        TEXT NOT NULL DEFAULT 'Hulu Sungai Selatan',
    province_name       TEXT NOT NULL DEFAULT 'Kalimantan Selatan'
);

-- 7. Batas Administrasi Desa/Kelurahan (148 Desa/Kelurahan)
CREATE TABLE IF NOT EXISTS villages (
    village_id          TEXT PRIMARY KEY,
    village_name        TEXT NOT NULL,
    admin_type          TEXT NOT NULL,                        -- 'Desa' atau 'Kelurahan'
    district_id         TEXT NOT NULL REFERENCES districts(district_id) ON DELETE RESTRICT,
    district_name       TEXT NOT NULL,
    area_ha             REAL
);

CREATE INDEX IF NOT EXISTS idx_villages_district ON villages(district_id);

-- 8. Titik Fasilitas Publik Pelayanan Umum (285 Titik Fasum)
CREATE TABLE IF NOT EXISTS public_facilities (
    facility_id         TEXT PRIMARY KEY,
    facility_type       TEXT NOT NULL,                        -- 'school', 'market', 'hospital', 'puskesmas'
    facility_subtype    TEXT,
    facility_name       TEXT NOT NULL,
    district_name       TEXT,
    village_name        TEXT,
    latitude            REAL NOT NULL,
    longitude           REAL NOT NULL,
    source_layer        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_facilities_type ON public_facilities(facility_type);

-- --------------------------------------------------------------------
-- LAYER 2: DERIVED OBSERVATIONS (OBSERVASI 17 VARIABEL)
-- --------------------------------------------------------------------

-- 9. Kamus 4 Kategori Induk
CREATE TABLE IF NOT EXISTS categories (
    category_code       TEXT PRIMARY KEY,                     -- 'TEKNIS_JALAN', 'AKSESIBILITAS', dll
    category_name       TEXT NOT NULL,
    description         TEXT NOT NULL,
    display_order       INTEGER NOT NULL,
    default_weight_raw  REAL NOT NULL                         -- 0.378965, 0.283815, 0.192412, 0.144807
);

-- 10. Kamus 17 Variabel Normatif
CREATE TABLE IF NOT EXISTS variable_definitions (
    variable_code       TEXT PRIMARY KEY,                     -- 'norm_panjang_ruas', dll
    category_code       TEXT NOT NULL REFERENCES categories(category_code) ON DELETE RESTRICT,
    variable_label      TEXT NOT NULL,
    definition          TEXT NOT NULL,
    optimization_dir    TEXT NOT NULL,                        -- 'BENEFIT' atau 'COST'
    raw_unit            TEXT NOT NULL,                        -- 'km', 'm', 'jiwa', 'rasio', 'biner'
    raw_source_field    TEXT NOT NULL,
    normalization_rule  TEXT NOT NULL,                        -- 'LINEAR_MINMAX', 'CLAMPED_MINMAX', dll
    param_min           REAL,
    param_max           REAL,
    is_recomputable     INTEGER NOT NULL DEFAULT 1,
    display_order       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_var_category ON variable_definitions(category_code);

-- 11. Matriks Observasi 17 Variabel per Ruas (Dual-Mode: 2025 vs 2024)
CREATE TABLE IF NOT EXISTS road_variable_observations (
    observation_id      TEXT PRIMARY KEY,
    road_key            TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    operating_mode      TEXT NOT NULL,                        -- 'OPERATIONAL_2025' atau 'BENCHMARK_2024'
    variable_code       TEXT NOT NULL REFERENCES variable_definitions(variable_code) ON DELETE RESTRICT,
    raw_value           REAL NOT NULL,
    normalized_value    REAL NOT NULL,
    calculated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_road_obs UNIQUE (road_key, operating_mode, variable_code),
    CONSTRAINT chk_norm_range CHECK (normalized_value >= 0.0 AND normalized_value <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_obs_lookup ON road_variable_observations(road_key, operating_mode);

-- --------------------------------------------------------------------
-- LAYER 3: MODEL CONFIGURATION (TATA KELOLA BOBOT & VERSI)
-- --------------------------------------------------------------------

-- 12. Master Model Prioritas
CREATE TABLE IF NOT EXISTS priority_models (
    model_id            TEXT PRIMARY KEY,
    model_code          TEXT NOT NULL UNIQUE,                 -- 'POLICY_DEFAULT_V1', dll
    model_name          TEXT NOT NULL,
    description         TEXT,
    model_lifecycle     TEXT NOT NULL,                        -- 'BASELINE_LOCKED', 'DRAFT', 'ACTIVE', 'ARCHIVED'
    operating_mode      TEXT NOT NULL DEFAULT 'OPERATIONAL_2025',
    is_locked           INTEGER NOT NULL DEFAULT 0,
    created_by_user_id  TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    activated_by_user_id TEXT,
    activated_at        TEXT,
    activation_note     TEXT
);

CREATE INDEX IF NOT EXISTS idx_models_lifecycle ON priority_models(model_lifecycle);

-- 13. Bobot Level 1 Kategori Model
CREATE TABLE IF NOT EXISTS model_category_weights (
    weight_id           TEXT PRIMARY KEY,
    model_id            TEXT NOT NULL REFERENCES priority_models(model_id) ON DELETE CASCADE,
    category_code       TEXT NOT NULL REFERENCES categories(category_code) ON DELETE RESTRICT,
    raw_weight          REAL NOT NULL,                        -- Nilai mentah slider (misal: 0.378965)
    normalized_weight   REAL NOT NULL,                        -- raw_weight / sum(raw_weights)
    is_locked           INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_model_category UNIQUE (model_id, category_code)
);

-- 14. Bobot Level 2 Lokal Variabel Model
CREATE TABLE IF NOT EXISTS model_variable_weights (
    weight_id           TEXT PRIMARY KEY,
    model_id            TEXT NOT NULL REFERENCES priority_models(model_id) ON DELETE CASCADE,
    variable_code       TEXT NOT NULL REFERENCES variable_definitions(variable_code) ON DELETE RESTRICT,
    category_code       TEXT NOT NULL REFERENCES categories(category_code) ON DELETE RESTRICT,
    local_weight        REAL NOT NULL,                        -- Bobot lokal dalam kategori (Sum = 1.0)
    effective_weight    REAL NOT NULL,                        -- normalized_category_weight * local_weight
    is_locked           INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_model_variable UNIQUE (model_id, variable_code)
);
