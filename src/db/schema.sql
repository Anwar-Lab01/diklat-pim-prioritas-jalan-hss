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

-- --------------------------------------------------------------------
-- LAYER 4: COMPUTED SCORING RESULTS & AUDIT
-- --------------------------------------------------------------------

-- 15. Riwayat Sesi Eksekusi Skoring
CREATE TABLE IF NOT EXISTS scoring_runs (
    run_id              TEXT PRIMARY KEY,
    model_id            TEXT NOT NULL REFERENCES priority_models(model_id) ON DELETE RESTRICT,
    operating_mode      TEXT NOT NULL,                        -- 'OPERATIONAL_2025' atau 'BENCHMARK_2024'
    roads_evaluated     INTEGER NOT NULL DEFAULT 350,
    top105_concordance  REAL,                                 -- Persentase overlap terhadap Top-105 (audit benchmark)
    execution_time_ms   INTEGER NOT NULL,                     -- Waktu komputasi (milidetik)
    run_by_user_id      TEXT NOT NULL,
    executed_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_model ON scoring_runs(model_id);
CREATE INDEX IF NOT EXISTS idx_runs_mode ON scoring_runs(operating_mode);

-- 16. Hasil Peringkat & Dekomposisi 17 Faktor per Ruas
CREATE TABLE IF NOT EXISTS road_priority_scores (
    score_id            TEXT PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES scoring_runs(run_id) ON DELETE CASCADE,
    road_key            TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    final_score         REAL NOT NULL,                        -- Skor komposit [0.0 s.d. 1.0]
    priority_rank       INTEGER NOT NULL,                     -- Peringkat 1 s.d. 350
    tier_category       TEXT NOT NULL,                        -- 'TOP_35', 'TOP_70', 'TOP_105', 'REGULAR'
    subtotal_teknis     REAL NOT NULL,                        -- Kontribusi Kategori 1
    subtotal_akses      REAL NOT NULL,                        -- Kontribusi Kategori 2
    subtotal_pelayanan  REAL NOT NULL,                        -- Kontribusi Kategori 3
    subtotal_spasial    REAL NOT NULL,                        -- Kontribusi Kategori 4
    factor_breakdown    TEXT NOT NULL,                        -- JSON string rincian 17 faktor {variable: {raw, norm, eff, contrib}}
    CONSTRAINT uq_run_road UNIQUE (run_id, road_key),
    CONSTRAINT uq_run_rank UNIQUE (run_id, priority_rank)     -- Garansi tidak ada peringkat kembar (Strict Bijective)
);

CREATE INDEX IF NOT EXISTS idx_scores_rank ON road_priority_scores(run_id, priority_rank);
CREATE INDEX IF NOT EXISTS idx_scores_road ON road_priority_scores(run_id, road_key);

-- --------------------------------------------------------------------
-- DATABASE TRIGGERS: IMMUTABLE BASELINE & LOCKED MODEL PROTECTION
-- --------------------------------------------------------------------

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_model_update
BEFORE UPDATE ON priority_models
FOR EACH ROW
WHEN OLD.is_locked = 1 OR OLD.model_lifecycle = 'BASELINE_LOCKED'
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot modify locked or baseline priority model.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_model_delete
BEFORE DELETE ON priority_models
FOR EACH ROW
WHEN OLD.is_locked = 1 OR OLD.model_lifecycle = 'BASELINE_LOCKED'
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot delete locked or baseline priority model.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_cat_weight_update
BEFORE UPDATE ON model_category_weights
FOR EACH ROW
WHEN (SELECT is_locked FROM priority_models WHERE model_id = OLD.model_id) = 1
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot modify category weights of a locked priority model.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_cat_weight_delete
BEFORE DELETE ON model_category_weights
FOR EACH ROW
WHEN (SELECT is_locked FROM priority_models WHERE model_id = OLD.model_id) = 1
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot delete category weights of a locked priority model.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_var_weight_update
BEFORE UPDATE ON model_variable_weights
FOR EACH ROW
WHEN (SELECT is_locked FROM priority_models WHERE model_id = OLD.model_id) = 1
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot modify variable weights of a locked priority model.');
END;

CREATE TRIGGER IF NOT EXISTS trg_prevent_locked_var_weight_delete
BEFORE DELETE ON model_variable_weights
FOR EACH ROW
WHEN (SELECT is_locked FROM priority_models WHERE model_id = OLD.model_id) = 1
BEGIN
    SELECT RAISE(ABORT, 'LOCKED_MODEL_IMMUTABLE: Cannot delete variable weights of a locked priority model.');
END;

-- --------------------------------------------------------------------
-- LAYER 5: SPATIAL DERIVATION & ACCESSIBILITY FOUNDATION (PHASE 5.1)
-- --------------------------------------------------------------------

-- 18. Relasi Spasial Ruas - Desa Otoritatif (Line-Polygon Intersection)
CREATE TABLE IF NOT EXISTS road_village_intersections (
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    village_id              TEXT NOT NULL REFERENCES villages(village_id) ON DELETE RESTRICT,
    village_name            TEXT NOT NULL,
    district_id             TEXT NOT NULL REFERENCES districts(district_id) ON DELETE RESTRICT,
    district_name           TEXT NOT NULL,
    intersection_length_m   REAL NOT NULL,
    share_of_road_pct       REAL NOT NULL,
    traversal_order         INTEGER,
    is_boundary_ambiguous   INTEGER NOT NULL DEFAULT 0,
    derivation_method       TEXT NOT NULL DEFAULT 'LINE_POLYGON_INTERSECTION',
    source_version          TEXT NOT NULL DEFAULT 'AUTHORITATIVE_V5',
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (road_key, village_id)
);

CREATE INDEX IF NOT EXISTS idx_rvi_road ON road_village_intersections(road_key);
CREATE INDEX IF NOT EXISTS idx_rvi_village ON road_village_intersections(village_id);

-- 19. Relasi Spasial Ruas - Kecamatan Otoritatif
CREATE TABLE IF NOT EXISTS road_district_intersections (
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    district_id             TEXT NOT NULL REFERENCES districts(district_id) ON DELETE RESTRICT,
    district_name           TEXT NOT NULL,
    intersection_length_m   REAL NOT NULL,
    share_of_road_pct       REAL NOT NULL,
    traversal_order         INTEGER,
    derivation_method       TEXT NOT NULL DEFAULT 'LINE_POLYGON_INTERSECTION',
    source_version          TEXT NOT NULL DEFAULT 'AUTHORITATIVE_V5',
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (road_key, district_id)
);

CREATE INDEX IF NOT EXISTS idx_rdi_road ON road_district_intersections(road_key);
CREATE INDEX IF NOT EXISTS idx_rdi_district ON road_district_intersections(district_id);

-- 20. Snap Fasilitas Publik ke Jaringan Jalan (285 Titik)
CREATE TABLE IF NOT EXISTS facility_network_snaps (
    facility_id             TEXT PRIMARY KEY REFERENCES public_facilities(facility_id) ON DELETE RESTRICT,
    facility_name           TEXT NOT NULL,
    facility_type           TEXT NOT NULL,
    facility_subtype        TEXT,
    original_lat            REAL NOT NULL,
    original_lng            REAL NOT NULL,
    snapped_lat             REAL NOT NULL,
    snapped_lng             REAL NOT NULL,
    snap_distance_m         REAL NOT NULL,
    network_edge_id         TEXT,
    is_suspicious           INTEGER NOT NULL DEFAULT 0,
    network_version         TEXT NOT NULL,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fns_type ON facility_network_snaps(facility_type);

-- 21. Fasilitas Terdekat dan Rute Jaringan per Ruas Jalan
CREATE TABLE IF NOT EXISTS road_nearest_facilities (
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    facility_type           TEXT NOT NULL,
    nearest_facility_id     TEXT NOT NULL,
    nearest_facility_name   TEXT NOT NULL,
    network_distance_m      REAL NOT NULL,
    straight_line_distance_m REAL,
    road_access_point_geojson TEXT NOT NULL,
    facility_snap_point_geojson TEXT NOT NULL,
    facility_snap_distance_m REAL NOT NULL,
    route_geometry_geojson  TEXT NOT NULL,
    network_version         TEXT NOT NULL,
    derivation_method       TEXT NOT NULL DEFAULT 'MULTI_SOURCE_DIJKSTRA',
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (road_key, facility_type)
);

CREATE INDEX IF NOT EXISTS idx_rnf_road ON road_nearest_facilities(road_key);
CREATE INDEX IF NOT EXISTS idx_rnf_type ON road_nearest_facilities(facility_type);

-- 22. Kontrak Integrasi Demografi Desa (Data Contract Phase 5.1 & Phase 5.1A)
CREATE TABLE IF NOT EXISTS village_demographics (
    village_id              TEXT PRIMARY KEY REFERENCES villages(village_id) ON DELETE RESTRICT,
    year                    INTEGER NOT NULL,
    population              INTEGER,
    households_total        INTEGER NOT NULL,
    households_male         INTEGER NOT NULL,
    households_female       INTEGER NOT NULL,
    households_kk           INTEGER, -- backward compatibility alias
    source                  TEXT NOT NULL,
    source_reference        TEXT,
    imported_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 23. Kontrak Integrasi Treatment Engine / Data Kondisi Jalan DD1 (Phase 5.1 & Phase 5.1A)
CREATE TABLE IF NOT EXISTS treatment_engine_segments (
    segment_id              TEXT PRIMARY KEY,
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    sta_start_m             REAL NOT NULL,
    sta_end_m               REAL NOT NULL,
    segment_length_m        REAL NOT NULL,
    damage_type             TEXT,
    condition_class         TEXT,
    dominant_condition      TEXT,
    segment_status          TEXT,
    severity                TEXT,
    damage_area_m2          REAL,
    damage_pct              REAL,
    surface_type            TEXT,
    road_width_m            REAL,
    recommended_treatment   TEXT,
    survey_date             TEXT,
    source                  TEXT NOT NULL DEFAULT 'DD1_CONDITION_SURVEY',
    source_record_id        TEXT,
    segment_geometry        TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tes_road_key ON treatment_engine_segments(road_key);
CREATE INDEX IF NOT EXISTS idx_tes_condition ON treatment_engine_segments(dominant_condition);
CREATE INDEX IF NOT EXISTS idx_tes_status ON treatment_engine_segments(segment_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tes_segment_road ON treatment_engine_segments(segment_id, road_key);

-- --------------------------------------------------------------------
-- LAYER 6: SPATIAL CRITERIA RESTRUCTURING & RTRW PROFILES (TASK 1)
-- Kelompok Kriteria: SPASIAL DAN AKSESIBILITAS WILAYAH
-- --------------------------------------------------------------------

-- 24. Interseksi Spasial Ruas - Pola Ruang RTRW Otoritatif (Line-Polygon)
CREATE TABLE IF NOT EXISTS road_rtrw_intersections (
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    rtrw_class_name         TEXT NOT NULL,
    macro_category          TEXT NOT NULL, -- 'PERMUKIMAN', 'PRODUKSI', 'LINDUNG', 'BADAN_AIR', 'PARIWISATA', 'TIDAK_TERCAKUP'
    intersection_length_m   REAL NOT NULL,
    share_of_road_pct       REAL NOT NULL,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (road_key, rtrw_class_name)
);

CREATE INDEX IF NOT EXISTS idx_rri_road ON road_rtrw_intersections(road_key);
CREATE INDEX IF NOT EXISTS idx_rri_macro ON road_rtrw_intersections(macro_category);

-- 25. Profil Spasial dan Aksesibilitas Wilayah per Ruas Jalan (5 Indikator Evaluasi)
CREATE TABLE IF NOT EXISTS road_spatial_profiles (
    road_key                TEXT PRIMARY KEY REFERENCES roads(road_key) ON DELETE RESTRICT,
    jarak_ibukota_kabupaten_m REAL,
    desa_count              INTEGER NOT NULL,
    desa_list               TEXT NOT NULL,
    kecamatan_count         INTEGER NOT NULL,
    kecamatan_list          TEXT NOT NULL,
    permukiman_length_m     REAL NOT NULL,
    permukiman_pct          REAL NOT NULL,
    produksi_length_m       REAL NOT NULL,
    produksi_pct            REAL NOT NULL,
    lindung_length_m        REAL NOT NULL,
    lindung_pct             REAL NOT NULL,
    badan_air_length_m      REAL NOT NULL,
    badan_air_pct           REAL NOT NULL,
    pariwisata_length_m     REAL NOT NULL,
    pariwisata_pct          REAL NOT NULL,
    uncovered_length_m      REAL NOT NULL,
    uncovered_pct           REAL NOT NULL,
    total_length_m          REAL NOT NULL,
    rtrw_breakdown_json     TEXT NOT NULL,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------------
-- LAYER 7: COSTING & BUDGETING REFERENCE (PHASE 1)
-- Independent Costing, ASB/AHSP Master, Treatment Rules & Profiling
-- --------------------------------------------------------------------

-- 26. Master ASB Items (Analisis Standar Belanja Fisik Bina Marga 2027)
CREATE TABLE IF NOT EXISTS master_asb_items (
    asb_id                  TEXT PRIMARY KEY,                     -- 'asb_0001' s.d. 'asb_1010'
    source_row_index        INTEGER NOT NULL,
    item_category           TEXT NOT NULL,                        -- 'Jalan Kabupaten', 'Jembatan pada Jalan Kabupaten'
    item_code               TEXT NOT NULL,                        -- '1.3.04.01.01.0003'
    package_name            TEXT NOT NULL,                        -- 'Jalan Tipe A1'
    specification           TEXT NOT NULL,                        -- Rincian spesifikasi lapis
    unit                    TEXT NOT NULL,                        -- 'Meter', 'Unit'
    unit_price_rp           REAL NOT NULL,                        -- Harga satuan rupiah
    unit_price_sen          INTEGER,                              -- Harga satuan dalam sen (1 Rp = 100 sen) untuk presisi eksak
    expenditure_group       TEXT NOT NULL,                        -- 'Belanja Modal Jalan Kabupaten', dll
    treatment_family        TEXT,
    surface_type            TEXT,                                 -- 'HRS-Base', 'HRS-WC', 'Rigid'
    road_width_m            REAL,                                 -- 1.0 s.d. 5.0
    surface_thickness_cm    REAL,                                 -- Tebal lapis permukaan (cm)
    budget_year             INTEGER NOT NULL DEFAULT 2027,
    source_document         TEXT NOT NULL DEFAULT 'ASB BM 2027.xlsx',
    source_reference        TEXT,
    source_file             TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_asb_category ON master_asb_items(item_category);
CREATE INDEX IF NOT EXISTS idx_asb_width ON master_asb_items(road_width_m);
CREATE INDEX IF NOT EXISTS idx_asb_surface ON master_asb_items(surface_type);

-- 27. Master AHSP Items (Analisis Harga Satuan Pekerjaan Bina Marga 2025)
CREATE TABLE IF NOT EXISTS master_ahsp_items (
    ahsp_id                 TEXT PRIMARY KEY,                     -- 'hps_0001' s.d. 'hps_0483'
    source_row_index        INTEGER NOT NULL,
    division_code           INTEGER NOT NULL,                     -- 1 s.d. 10
    division_name           TEXT NOT NULL,                        -- 'UMUM', 'DRAINASE', 'PERKERASAN ASPAL', dll
    payment_code            TEXT,                                 -- '1.20.(1)', '6.3.(3a)', dll
    item_description        TEXT NOT NULL,                        -- Uraian pekerjaan satuan
    unit                    TEXT,                                 -- 'M1', 'M2', 'M3', 'Ton', dll (null pada item bahan olahan tertentu)
    original_unit           TEXT,
    unit_price_rp           REAL NOT NULL,                        -- Harga satuan rupiah
    unit_price_sen          INTEGER,                              -- Harga satuan dalam sen (1 Rp = 100 sen) untuk presisi eksak
    work_category           TEXT NOT NULL,                        -- 'asphalt_pavement', 'drainage', dll
    quantity_basis          TEXT NOT NULL,                        -- 'length_m', 'area_m2', 'volume_m3', dll
    is_support_item         INTEGER NOT NULL DEFAULT 0,           -- 1 = item pendukung, 0 = item utama
    price_year              INTEGER NOT NULL DEFAULT 2025,
    source_document         TEXT NOT NULL DEFAULT 'SE DJBK No. 182/SE/Dk/2025',
    source_reference        TEXT,
    source_file             TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ahsp_div ON master_ahsp_items(division_code);
CREATE INDEX IF NOT EXISTS idx_ahsp_payment_code ON master_ahsp_items(payment_code);

-- 28. Aturan Pemilihan Paket Penanganan ASB (Rules R01..R06)
CREATE TABLE IF NOT EXISTS treatment_package_rules (
    rule_id                 TEXT PRIMARY KEY,                     -- 'R01' s.d. 'R06'
    priority_order          INTEGER NOT NULL UNIQUE,              -- 1 s.d. 6
    rule_label              TEXT NOT NULL,                        -- Label aturan
    selected_profile        TEXT NOT NULL,                        -- 'base_subbase_fill', 'base_plus_subbase', dll
    asb_type                TEXT NOT NULL,                        -- 'D', 'C', 'B', 'A', 'NONE'
    condition_logic         TEXT NOT NULL,                        -- JSON logika kondisi kriteria
    rationale               TEXT,                                 -- Rationale teknis aturan
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 29. Profil Pemetaan ASB–AHSP (11 Profil Struktural & Pendukung)
CREATE TABLE IF NOT EXISTS asb_ahsp_profiles (
    profile_id              TEXT PRIMARY KEY,                     -- 'profile_asb_a', dll
    asb_type                TEXT NOT NULL,                        -- 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'SUPPORT'
    structural_profile      TEXT NOT NULL,                        -- 'surface_only', 'base_course', dll
    purpose_description     TEXT NOT NULL,                        -- Deskripsi tujuan profil
    disclaimer              TEXT,                                 -- Disclaimer teknis
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 30. Rincian Item pada Profil Pemetaan ASB–AHSP (35 Aturan Rincian)
CREATE TABLE IF NOT EXISTS asb_ahsp_profile_items (
    profile_item_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id              TEXT NOT NULL REFERENCES asb_ahsp_profiles(profile_id) ON DELETE CASCADE,
    ahsp_id                 TEXT REFERENCES master_ahsp_items(ahsp_id) ON DELETE RESTRICT,
    rule_identifier         TEXT NOT NULL,                        -- ID aturan item
    item_role               TEXT NOT NULL,                        -- 'primary', 'support', 'optional'
    quantity_basis          TEXT NOT NULL,                        -- 'length_m', 'width_factor', dll
    description             TEXT NOT NULL,
    division_code           INTEGER NOT NULL,
    is_active               INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_aapi_profile ON asb_ahsp_profile_items(profile_id);
CREATE INDEX IF NOT EXISTS idx_aapi_ahsp ON asb_ahsp_profile_items(ahsp_id);

-- 31. Master Skenario Anggaran (Budget Scenarios - Phase 1.1 / Phase 2)
CREATE TABLE IF NOT EXISTS budget_scenarios (
    scenario_id             TEXT PRIMARY KEY,                     -- 'SCN-2027-BASELINE', 'SCN-2027-OPTIMAL', dll
    scenario_code           TEXT NOT NULL UNIQUE,                -- 'BASELINE_2027', dll
    scenario_name           TEXT NOT NULL,                       -- 'Skenario Pagu Indikatif Baseline 2027'
    budget_year             INTEGER NOT NULL,                    -- 2027
    description             TEXT,                                 -- Keterangan skenario perencanaan
    scenario_status         TEXT NOT NULL DEFAULT 'DRAFT',       -- 'DRAFT', 'ACTIVE', 'ARCHIVED'
    budget_ceiling_rp       REAL DEFAULT 50000000000,            -- Plafon anggaran rupiah (default Rp 50 Miliar)
    budget_ceiling_sen      INTEGER DEFAULT 5000000000000,       -- Plafon anggaran dalam sen
    total_cost_rp           REAL DEFAULT 0,                      -- Total pagu kebutuhan kalkulasi ASB
    total_cost_sen          INTEGER DEFAULT 0,                   -- Total pagu kebutuhan dalam sen
    allocated_cost_rp       REAL DEFAULT 0,                      -- Total biaya terakomodasi dalam plafon
    allocated_cost_sen      INTEGER DEFAULT 0,                   -- Total biaya terakomodasi dalam sen
    allocation_strategy     TEXT DEFAULT 'PRIORITY_RANK_GREEDY', -- Strategi alokasi pagu
    optimization_objective  TEXT DEFAULT 'GREEDY_BENCHMARK',    -- 'GREEDY_BENCHMARK', 'PRIORITY_WEIGHTED', 'MAX_LENGTH', 'PRIORITY_RESPECTING'
    solver_status           TEXT DEFAULT 'BENCHMARK_GREEDY',    -- 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'BENCHMARK_GREEDY'
    solver_nodes            INTEGER DEFAULT 0,
    solver_gap_pct          REAL DEFAULT 0,
    solver_runtime_ms       INTEGER DEFAULT 0,
    treated_length_km       REAL DEFAULT 0,
    priority_weighted_score REAL DEFAULT 0,
    funded_construction_roads INTEGER DEFAULT 0,
    routine_maintenance_roads INTEGER DEFAULT 0,
    manual_review_roads     INTEGER DEFAULT 0,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bs_year ON budget_scenarios(budget_year);
CREATE INDEX IF NOT EXISTS idx_bs_status ON budget_scenarios(scenario_status);

-- 32. Estimasi Biaya Indikatif per Segmen (Struktur Skema Phase 1.1 / Phase 3)
CREATE TABLE IF NOT EXISTS road_segment_cost_estimates (
    estimate_id             TEXT PRIMARY KEY,                     -- 'EST-HSS-KAB-xxx-SEG-xxxx'
    scenario_id             TEXT NOT NULL REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE,
    segment_id              TEXT NOT NULL,
    road_key                TEXT NOT NULL,
    budget_year             INTEGER NOT NULL,
    rule_id                 TEXT REFERENCES treatment_package_rules(rule_id) ON DELETE RESTRICT,
    asb_id                  TEXT REFERENCES master_asb_items(asb_id) ON DELETE RESTRICT,
    matched_width_m         REAL NOT NULL,
    matched_surface         TEXT NOT NULL,
    segment_length_m        REAL NOT NULL,
    unit_price_rp           REAL NOT NULL,
    unit_price_sen          INTEGER NOT NULL,                     -- Presisi integer dalam satuan sen (Rp * 100)
    indicative_cost_rp      REAL NOT NULL,
    indicative_cost_sen     INTEGER NOT NULL,                     -- Presisi integer dalam satuan sen (Rp * 100)
    calculation_mode        TEXT NOT NULL,
    adjustment_flags        TEXT,                                 -- 'MANUAL_REVIEW_WIDTH_EXCEEDED', dll
    is_selected             INTEGER NOT NULL DEFAULT 0,           -- 1 = Dipilih untuk perlakuan fisik
    selection_status        TEXT NOT NULL DEFAULT 'UNSELECTED',   -- 'SELECTED_CONSTRUCTION', 'ROUTINE_MAINTENANCE', 'EXCLUDED_MANUAL_REVIEW', 'DEFERRED_BY_BUDGET'
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (segment_id, road_key) REFERENCES treatment_engine_segments(segment_id, road_key) ON DELETE RESTRICT,
    FOREIGN KEY (road_key) REFERENCES roads(road_key) ON DELETE RESTRICT,
    CONSTRAINT uq_rsce_scenario_segment UNIQUE (scenario_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_rsce_scenario ON road_segment_cost_estimates(scenario_id);
CREATE INDEX IF NOT EXISTS idx_rsce_road ON road_segment_cost_estimates(road_key);
CREATE INDEX IF NOT EXISTS idx_rsce_segment ON road_segment_cost_estimates(segment_id);

-- 33. Rekapitulasi Biaya per Ruas Jalan (Struktur Skema Phase 1.1 / Phase 2.1 / Phase 3)
CREATE TABLE IF NOT EXISTS road_cost_summaries (
    summary_id              TEXT PRIMARY KEY,                     -- 'SUM-2027-HSS-KAB-xxx'
    scenario_id             TEXT NOT NULL REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE,
    road_key                TEXT NOT NULL REFERENCES roads(road_key) ON DELETE RESTRICT,
    budget_year             INTEGER NOT NULL,
    dominant_rule_id        TEXT REFERENCES treatment_package_rules(rule_id) ON DELETE RESTRICT,
    dominant_asb_type       TEXT,
    total_segments          INTEGER NOT NULL,
    treated_segments        INTEGER NOT NULL,
    routine_segments        INTEGER NOT NULL,
    manual_review_segments  INTEGER NOT NULL DEFAULT 0,
    total_length_km         REAL NOT NULL,
    treated_length_km       REAL NOT NULL,
    manual_review_length_km REAL NOT NULL DEFAULT 0,
    total_pagu_asb_rp       REAL NOT NULL,
    total_pagu_asb_sen      INTEGER NOT NULL,                     -- Presisi integer dalam satuan sen (Rp * 100)
    ahsp_reference_rp       REAL,
    ahsp_reference_sen      INTEGER,                              -- Presisi integer dalam satuan sen (Rp * 100)
    is_funded               INTEGER NOT NULL DEFAULT 0,           -- 1 = Terakomodasi dalam antrean prioritas, 0 = Tertunda
    allocation_rank         INTEGER,                              -- Urutan ranking alokasi
    cumulative_cost_rp      REAL DEFAULT 0,                       -- Akumulasi biaya rupiah
    cumulative_cost_sen     INTEGER DEFAULT 0,                    -- Akumulasi biaya sen
    status_summary          TEXT NOT NULL,
    operational_status      TEXT NOT NULL DEFAULT 'DEFERRED_BY_BUDGET', -- 'FUNDED_CONSTRUCTION', 'ROUTINE_MAINTENANCE', 'MANUAL_TECHNICAL_REVIEW', 'DEFERRED_BY_BUDGET', 'INCOMPLETE_ESTIMATE', 'NOT_ELIGIBLE'
    allocated_pagu_rp       REAL DEFAULT 0,
    allocated_pagu_sen      INTEGER DEFAULT 0,
    allocated_treated_segments INTEGER DEFAULT 0,
    allocated_treated_length_km REAL DEFAULT 0,
    selection_rationale     TEXT,
    calculated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT uq_rcs_scenario_road UNIQUE (scenario_id, road_key)
);

CREATE INDEX IF NOT EXISTS idx_rcs_scenario ON road_cost_summaries(scenario_id);
CREATE INDEX IF NOT EXISTS idx_rcs_road ON road_cost_summaries(road_key);
CREATE INDEX IF NOT EXISTS idx_rcs_year ON road_cost_summaries(budget_year);

-- 34. Tabel Riwayat & Komparasi Optimasi Skenario (Phase 3)
CREATE TABLE IF NOT EXISTS scenario_optimizations (
    optimization_id         TEXT PRIMARY KEY,
    scenario_id             TEXT NOT NULL REFERENCES budget_scenarios(scenario_id) ON DELETE CASCADE,
    budget_ceiling_rp       REAL NOT NULL,
    budget_ceiling_sen      INTEGER NOT NULL,
    objective_mode          TEXT NOT NULL,
    solver_name             TEXT NOT NULL,
    solver_status           TEXT NOT NULL,
    nodes_explored          INTEGER NOT NULL DEFAULT 0,
    optimality_gap_pct      REAL NOT NULL DEFAULT 0,
    runtime_ms              INTEGER NOT NULL DEFAULT 0,
    total_cost_rp           REAL NOT NULL,
    total_cost_sen          INTEGER NOT NULL,
    remaining_budget_rp     REAL NOT NULL,
    treated_length_km       REAL NOT NULL,
    priority_weighted_score REAL NOT NULL,
    selected_segments_count INTEGER NOT NULL,
    funded_construction_count INTEGER NOT NULL,
    routine_maintenance_count INTEGER NOT NULL,
    manual_review_count     INTEGER NOT NULL,
    deferred_count          INTEGER NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scn_opt_scenario ON scenario_optimizations(scenario_id);





