# LAPORAN PENUTUPAN FASE 5.1: PONDASI DERIVASI SPASIAL & AKSESIBILITAS JARINGAN JALAN
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
### (Dokumentasi Otoritatif Implementasi Topologi Graf, Perutean Multi-Source Dijkstra, dan Visualisasi Rute GIS)

**Tanggal Verifikasi**: 14 September 2026  
**Otoritas Teknis**: Dinas Pekerjaan Umum dan Penataan Ruang (Dinas PUTR) Kabupaten Hulu Sungai Selatan  
**Pengembang Sistem**: Tim Pengembang Diklat PIM / Antigravity Deployment Orchestrator  
**Repositori GitHub**: [https://github.com/Anwar-Lab01/diklat-pim-prioritas-jalan-hss](https://github.com/Anwar-Lab01/diklat-pim-prioritas-jalan-hss)  
**Cabang**: `master`  
**Deployment Produksi Vercel**: [https://diklat-pim-prioritas-jalan-hss.vercel.app](https://diklat-pim-prioritas-jalan-hss.vercel.app)  
**Status Pengujian Regresi Otomatis**: **LULUS PENUH (257 / 257 UJI SUKSES, 0 GAGAL)**  
**Keputusan Otoritatif (Verdict)**: **`PHASE_5_1_SPATIAL_DERIVATION_PASS_WITH_DATA_REQUIRED`**

---

## A. Ringkasan Eksekutif & Konteks Proyek

Fase 5.1 berhasil membangun pondasi analitis spasial (*Spatial Derivation & Network Accessibility Foundation*) berbasis data riil untuk 350 ruas jalan kabupaten di Kabupaten Hulu Sungai Selatan. Pondasi ini merealisasikan integrasi spasial antara geometri ruas jalan, batas administratif (desa dan kecamatan), serta jaringan transportasi multimoda dengan sebaran fasilitas publik (RSUD, Puskesmas, Sekolah, dan Pasar).

### Pencapaian Inti Fase 5.1:
1. **Derivasi Administratif Riil**:
   Menghitung irisan spasial riil ruas jalan terhadap batas 148 desa (691 relasi irisan) dan 11 kecamatan (410 relasi irisan), mengidentifikasi ruas-ruas lintas wilayah tanpa asumsi perkiraan.
2. **Topologi Graf Jaringan Utuh (366 Fitur)**:
   Membangun graf jaringan jalan multimoda (kabupaten, provinsi, nasional, dan konektor analitis) berbobot metrik dengan 27.077 simpul dan 27.285 sisi serta hash integritas SHA-256 yang deterministik.
3. **Penambatan Fasilitas & Perutean Multi-Source Dijkstra**:
   Menambatkan 285 fasilitas publik ke jaringan jalan dan menghitung jarak tempuh jaringan riil beserta geometri rute (*LineString*) dari 350 ruas jalan ke fasilitas terdekat.
4. **Upgrade Kartografi & Route Tracing Interaktif**:
   Meningkatkan keterbacaan visual ruas non-prioritas dengan warna Slate-600 (`#475569`), tebal 3.0px, dan opasitas 90%. Menghadirkan fitur pelacakan rute interaktif (*interactive route tracing*) pada panel detail ruas dan peta Leaflet pada pane khusus (z-index 550).
5. **Kontrak Data Bersih & Non-Fabrikasi (Data Required)**:
   Menyediakan skema tabel untuk demografi desa dan treatment engine tanpa merekayasa data palsu (0 baris, status eksplisit `DATA_REQUIRED`). Menetapkan status Ibukota Kabupaten sebagai `DATA_REQUIRED_NO_OFFICIAL_COORDINATE`.
6. **Perlindungan Penuh Model Aktif (`POLICY_DEFAULT_V1`)**:
   Seluruh derivasi baru bersifat terisolasi dan **TIDAK MENGUBAH** skor prioritas, peringkat, atau alokasi tier baseline.

---

## B. Lingkungan & Identitas Git

- **Repositori**: `Anwar-Lab01/diklat-pim-prioritas-jalan-hss`
- **Cabang**: `master`
- **Baseline Git Awal**: `606438b`
- **Lingkungan Kerja**: Windows 10 x64, Node.js v24.11.1, TypeScript 5.9.3, SQLite 3 (node:sqlite experimental & better-sqlite3 compatible)
- **Status Basis Data**:
  - `data/diklat_pim.db` (Lokal Pengembang) terstruktur penuh.
  - `data/diklat_pim_deploy.db` (Snapshot Produksi Vercel ~8,8 MB) sinkron 100%.

---

## C. Verifikasi Invarian Baseline Otoritatif

Pengujian regresi memverifikasi bahwa ranking operasional `OPERATIONAL_2025` dan formula `POLICY_DEFAULT_V1` tetap 100% presisi dan tidak bergeser sedikit pun:

| Kode Ruas | Nama Resmi Otoritatif Ruas Jalan | Kecamatan | Peringkat Wajib | Skor Baseline | Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `HSS-KAB-025` | Singakarsa - Palas | Kandangan | **#1** | ~0.649945 | **PASS** |
| `HSS-KAB-001` | Pangeran Antasari - Loklua | Kandangan | **#12** | ~0.529610 | **PASS** |
| `HSS-KAB-295` | Mawar (Daha Selatan) | Daha Selatan | **#133** | ~0.412427 | **PASS** |
| `HSS-KAB-350` | Keramat Sakti - Ds. Tebing Tinggi | Simpur | **#169** | ~0.381386 | **PASS** |
| `HSS-KAB-013` | Mawar (Kandangan Utara) | Kandangan | **#245** | ~0.340749 | **PASS** |

- **Distribusi Tier Wajib**:
  - `TOP_35`: Tepat 35 ruas (Peringkat 1–35)
  - `TOP_70`: Tepat 35 ruas (Peringkat 36–70)
  - `TOP_105`: Tepat 35 ruas (Peringkat 71–105)
  - `REGULAR`: Tepat 245 ruas (Peringkat 106–350)
  - Total Ruas: **350 ruas** (100% lengkap)
- **Uji Reset Simulasi Fase 5**: Menghasilkan delta peringkat 0 pada seluruh 350 ruas jalan.

---

## D. Ekstensi Skema Basis Data

Sebanyak 6 tabel baru ditambahkan ke dalam skema basis data (`src/db/schema.sql`) dan telah diaplikasikan ke kedua berkas basis data SQLite:

```sql
-- 1. Irisan Spasial Ruas Jalan - Desa
CREATE TABLE IF NOT EXISTS road_village_intersections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  road_key TEXT NOT NULL,
  village_id TEXT,
  village_name TEXT NOT NULL,
  district_name TEXT NOT NULL,
  intersection_length_m REAL NOT NULL,
  percentage_of_road REAL NOT NULL,
  is_primary INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (road_key) REFERENCES roads(road_key)
);

-- 2. Irisan Spasial Ruas Jalan - Kecamatan
CREATE TABLE IF NOT EXISTS road_district_intersections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  road_key TEXT NOT NULL,
  district_name TEXT NOT NULL,
  intersection_length_m REAL NOT NULL,
  percentage_of_road REAL NOT NULL,
  is_primary INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (road_key) REFERENCES roads(road_key)
);

-- 3. Penambatan Fasilitas Publik ke Sisi Jaringan Jalan
CREATE TABLE IF NOT EXISTS facility_network_snaps (
  facility_id TEXT PRIMARY KEY,
  facility_name TEXT NOT NULL,
  facility_type TEXT NOT NULL,
  orig_lon REAL NOT NULL,
  orig_lat REAL NOT NULL,
  snapped_lon REAL NOT NULL,
  snapped_lat REAL NOT NULL,
  snap_distance_m REAL NOT NULL,
  nearest_edge_id TEXT,
  nearest_road_name TEXT,
  suspicious_snap INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Rute dan Jarak Jaringan Fasilitas Terdekat
CREATE TABLE IF NOT EXISTS road_nearest_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  road_key TEXT NOT NULL,
  facility_type TEXT NOT NULL,
  nearest_facility_id TEXT NOT NULL,
  nearest_facility_name TEXT NOT NULL,
  network_distance_m REAL NOT NULL,
  straight_line_distance_m REAL,
  road_access_point_geojson TEXT,
  facility_snap_point_geojson TEXT,
  snap_offset_m REAL,
  route_geometry_geojson TEXT,
  network_graph_hash TEXT,
  routing_algorithm TEXT DEFAULT 'MULTI_SOURCE_DIJKSTRA',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (road_key) REFERENCES roads(road_key)
);

-- 5. Data Demografi Desa (Kontrak Data Bersih - Menunggu Data Resmi BPS)
CREATE TABLE IF NOT EXISTS village_demographics (
  village_id TEXT PRIMARY KEY,
  village_name TEXT NOT NULL,
  district_name TEXT NOT NULL,
  population_total INTEGER,
  households_total INTEGER,
  density_per_km2 REAL,
  source_year INTEGER,
  source_document TEXT,
  ingestion_status TEXT DEFAULT 'DATA_REQUIRED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Segmentasi Fisik Treatment Engine (Kontrak Data Bersih - Menunggu SK/Survei Detail)
CREATE TABLE IF NOT EXISTS treatment_engine_segments (
  segment_id TEXT PRIMARY KEY,
  road_key TEXT NOT NULL,
  sta_start_m REAL NOT NULL,
  sta_end_m REAL NOT NULL,
  length_m REAL NOT NULL,
  pavement_type TEXT NOT NULL,
  surface_condition TEXT NOT NULL,
  iri_estimated REAL,
  recommended_treatment TEXT NOT NULL,
  estimated_cost_idr REAL NOT NULL,
  ingestion_status TEXT DEFAULT 'DATA_REQUIRED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (road_key) REFERENCES roads(road_key)
);
```

---

## E. Integrasi Pipeline Ingesti Otoritatif

Langkah `[7/7]` ditambahkan secara mulus ke dalam pipeline master ingesti (`src/ingestion/ingestAuthoritativeData.ts`) dan generator berkas produksi (`scripts/generate_deploy_db.ts`):

1. **Irisan Desa**: **691 baris** tercatat.
   - 350 ruas jalan kabupaten berpotongan dengan poligon 148 desa.
   - Sebanyak 32 ruas jalan melintasi 4 atau lebih desa (contoh: ruas jalan kolektor antar-kecamatan).
   - Irisan titik/nol meter difilter sepenuhnya.
2. **Irisan Kecamatan**: **410 baris** tercatat.
   - Tepat 57 ruas jalan melintasi lebih dari 1 kecamatan (54 ruas melintasi 2 kecamatan, 3 ruas melintasi 3 kecamatan).
3. **Penambatan Fasilitas**: **285 fasilitas** tertambat.
   - Tepat 3 fasilitas ditandai sebagai `suspicious_snap` (> 500 m) karena letak geografis di pedalaman Meratus.
4. **Matriks Fasilitas Terdekat**: **1.400 baris** ($350 \times 4$ kategori: RSUD, Puskesmas, Sekolah, Pasar).
   - Seluruh 350 ruas berhasil dievaluasi secara lengkap.

---

## F. Arsitektur Layanan Spasial (`SpatialDerivationService`)

Berkas `src/services/spatialDerivationService.ts` diimplementasikan dengan komponen-komponen berikut:
- **Graph Builder**: Mengonversi fitur garis GeoJSON menjadi simpul koordinat terkuantisasi (presisi 6 desimal $\approx 0,1$ meter) dan sisi berbobot jarak permukaan bumi (rumus Haversine).
- **Connected Components Analyzer**: Algoritma BFS untuk mempartisi graf ke dalam komponen-komponen terhubung dan mendeteksi pulau terisolasi.
- **Facility Snapper**: Proyeksi ortogonal titik fasilitas ke ruas garis sisi graf terdekat dengan penghitungan offset jarak.
- **Multi-Source Reverse Dijkstra**: Algoritma perutean dari seluruh titik fasilitas terdekat secara simultan menuju simpul-simpul ruas jalan kabupaten dengan pencatatan pohon perutean (*predecessor map*) untuk rekonstruksi jalur.
- **Route Geometry Tracing**: Menghasilkan GeoJSON `LineString` dari titik akses jalan menuju titik snap fasilitas.
- **Recalculation Service**: Memungkinkan rekalkulasi dinamis per kategori fasilitas.

---

## G. Statistik Topologi Graf & Komponen Terhubung

- **Total Fitur Jaringan**: 366 (350 kabupaten, 4 provinsi, 8 nasional, 4 konektor analitis).
- **Simpul Graf**: 27.077 simpul.
- **Sisi Graf**: 27.285 sisi.
- **Jumlah Komponen Graf**: 6 komponen.
- **Komponen 0 (Utama)**: 25.134 simpul (92,82% dari seluruh jaringan).
- **7 Ruas Terisolasi**:
  - Komponen 1 (1.823 simpul): `HSS-KAB-338`, `HSS-KAB-299`, `HSS-KAB-339`, `HSS-KAB-335`, `HSS-KAB-340` (Kawasan Rawa Lebak Daha).
  - Komponen 2 (95 simpul): `HSS-KAB-302` (Muning Dalam).
  - Komponen 3 (18 simpul): `HSS-KAB-301` (Muning Tengah - Batang Alai).
- **Anomali Geometri**: Fitur `net-0316` (`HSS-KAB-186`, Jl. Rel Angkinang - TMMD Angkinang) memiliki tipe `GeometryCollection`, ditangani secara otomatis dengan mengekstrak seluruh bagian garisnya.
- **Kebijakan Non-Fabrikasi**: Tidak ada jembatan atau konektor fiktif yang ditambahkan ke dalam data.

---

## H. Audit Penambatan Fasilitas & Perutean

- **Total Fasilitas Ditambatkan**: 285 titik (2 RSUD, 21 Puskesmas, 11 Pasar, 251 Sekolah).
- **Fasilitas Snap Mencurigakan (> 500 m)**: Tepat 3 sekolah di lereng Pegunungan Meratus Kecamatan Loksado:
  1. `school-30302061`: SDN 2 Haratai (7.816,6 m)
  2. `school-30302062`: SD Kecil Malinau (6.108,3 m)
  3. `school-30302047`: SDN Kamawakan (2.425,8 m)
- **Status Keterjangkauan Fasilitas**:
  - **Sekolah (SD/SMP)**: 350 / 350 ruas terjangkau (0 ruas terputus).
  - **Puskesmas**: 348 / 350 ruas terjangkau (2 ruas terputus di Muning).
  - **Pasar**: 348 / 350 ruas terjangkau (2 ruas terputus di Muning).
  - **RSUD**: 343 / 350 ruas terjangkau (7 ruas terputus pada 3 komponen rawa terisolasi).

---

## I. Mesin Rekalkulasi Jarak Fasilitas

Layanan menyediakan fungsi `recalculateFacilityDistances(facilityType?)` yang dapat dipanggil via API `POST /api/spatial/recalculate`. Pengujian verifikasi membuktikan:
- Rekalkulasi kategori `puskesmas` mengevaluasi 350 ruas jalan secara deterministik dalam waktu < 2 detik.
- Mengembalikan ringkasan status `{ evaluated: 350, resolved: 348, unresolved: 2 }`.

---

## J. Pembaruan Kartografi GIS & Visualisasi Route Tracing

### 1. Upgrade Kartografi Ruas Non-Prioritas (Section J):
- **Warna Garis (Stroke)**: Slate-600 (`#475569`).
- **Ketebalan Garis (Weight)**: 3.0 px.
- **Opasitas Garis (Opacity)**: 0.90 (90%).
- **Label Simbologi**: `"Ruas Kabupaten Lainnya / Di Luar Prioritas Utama"`.
- *Dampak Visual*: Ruas jalan non-prioritas kini terlihat tegas dan jelas di atas peta kontras tanpa menenggelamkan garis prioritas Top 35/70/105.

### 2. Panel Rute Interaktif (*Route Tracing Pane*):
- **Pane Leaflet Mandiri**: `routeTracingPane` dengan `z-index: 550` (di atas layer jalan 500 dan di bawah marker seleksi).
- **Gaya Garis Rute**: Violet `#8b5cf6`, tebal 4.5 px, garis putus-putus (`dashArray: '6, 6'`).
- **Titik Akses Jalan**: Lingkaran Cyan `#06b6d4`, radius 6 px.
- **Titik Fasilitas Tujuan**: Lingkaran Violet `#8b5cf6`, radius 7 px.
- **Integrasi Drawer**: Pada `#road-detail-drawer`:
  - Ditambahkan **Bagian A.2 (Cakupan Administratif)**: Menampilkan desa dan kecamatan yang dilintasi beserta panjang dan persentasenya.
  - Ditambahkan **Bagian C.2 (Aksesibilitas Fasilitas & Rute Jaringan)**: 4 tombol fasilitas (`RSUD`, `Puskesmas`, `Sekolah`, `Pasar`) untuk memicu pelacakan rute interaktif, kartu ringkasan rute, dan tombol *Hapus Jejak Rute*.
  - Ditambahkan **Bagian F (Status Kontrak Data)**: Menampilkan status data demografi dan treatment engine.

---

## K. Kontrak Data Bersih: Demografi & Treatment Engine

Sesuai instruksi audit integritas data ketat:
1. **`village_demographics`**:
   - Memiliki skema tabel lengkap siap pakai.
   - Berisi tepat **0 baris** (tidak ada angka populasi palsu atau tebakan).
   - Status: `DATA_REQUIRED` (menunggu data resmi BPS Kabupaten Hulu Sungai Selatan).
2. **`treatment_engine_segments`**:
   - Memiliki skema tabel lengkap siap pakai.
   - Berisi tepat **0 baris** (tidak ada segmen perlakuan palsu atau asumsi biaya fiktif).
   - Status: `DATA_REQUIRED` (menunggu hasil survei teknis kondisi rinci dari Dinas PUTR).

---

## L. Status Otoritatif Ibukota Kabupaten

- **Layer Fasilitas Publik**: Tidak memiliki koordinat titik resmi untuk Ibukota Kabupaten (Kandangan).
- **Status Sistem**: Ditetapkan secara eksplisit sebagai `DATA_REQUIRED_NO_OFFICIAL_COORDINATE`.
- **Integritas**: Sistem tidak membuat titik sembarang di pusat kota Kandangan.

---

## M. Temuan Rekonsiliasi Jarak Fasilitas

Perbandingan antara jarak historis impor dan jarak rute jaringan membuktikan:
- **Jarak Euclidean Historis vs Rute Jaringan**:
  Rute jaringan jalan nyata secara konsisten mencerminkan jalur riil berbelok dengan deviasi yang logis terhadap estimasi garis lurus.
- **Kelengkapan Fasilitas**:
  Dataset fasilitas 285 titik mengidentifikasi fasilitas publik terdekat yang lebih dekat daripada data historis lama pada sejumlah ruas (delta negatif), memperlihatkan peningkatan mutu data spasial.
- **Status Model**: Jarak baru disimpan untuk analisis dan tidak mengubah skoring baseline aktif.

---

## N. Verifikasi Endpoint API Spasial

Sebanyak 6 endpoint baru diverifikasi berfungsi penuh (HTTP 200) dengan payload JSON standar:
1. `GET /api/spatial/roads/:roadKey/coverage`: Mengembalikan daftar desa dan kecamatan yang dilintasi ruas jalan beserta panjangnya.
2. `GET /api/spatial/roads/:roadKey/nearest-facilities`: Mengembalikan data 4 fasilitas terdekat beserta geometri rute GeoJSON LineString.
3. `GET /api/spatial/network/stats`: Mengembalikan statistik graf 366 fitur, simpul, sisi, dan daftar 7 ruas terisolasi.
4. `GET /api/spatial/facilities/snaps`: Mengembalikan daftar 285 fasilitas tertambat dan penanda snap mencurigakan.
5. `POST /api/spatial/recalculate`: Memicu rekalkulasi rute terdekat secara deterministik.
6. `GET /api/spatial/reconciliation`: Mengembalikan komparasi jarak impor vs jarak kalkulasi untuk 350 ruas jalan.

---

## O. Hasil Pengujian Regresi Lengkap

Pengujian menyeluruh dijalankan menggunakan perintah `npm run test:all`:

```text
================================================================
RINGKASAN HASIL REGRESI SUITE LENGKAP (FASE 1 s/d FASE 5.1):
================================================================
  ✓ Ingestion Pipeline Suite (Phase 1)             : LULUS
  ✓ Reconciled Scoring & Explainability (Phase 3)   : 53 / 53 LULUS
  ✓ Web GIS Core Automated Suite (Phase 4)          : 53 / 53 LULUS
  ✓ Web GIS UI Hardening Suite (Phase 4.5)          : 24 / 24 LULUS
  ✓ Web GIS Cartographic Hardening (Phase 4.6)      : 27 / 27 LULUS
  ✓ Web GIS Interaction & Click Hierarchy (Phase 4.7): 27 / 27 LULUS
  ✓ Simulasi Skenario Bobot Kebijakan (Phase 5)     : 19 / 19 LULUS
  ✓ Spatial Derivation & Network Routing (Phase 5.1): 54 / 54 LULUS
----------------------------------------------------------------
TOTAL PENGUJIAN REGRESI: 257 / 257 LULUS PENUH (100% PASS, 0 FAIL)
================================================================
```

---

## P. Verifikasi Runtime Lokal & Bundle Vercel

- **Kompilasi Bundle Vercel (`api/index.js`)**:
  Proses `npm run build` berhasil mengompilasi seluruh modul TypeScript dan aset frontend ke dalam berkas tunggal `api/index.js` (305 kB) tanpa peringatan (*zero warnings*).
- **Kompabilitas Serverless**:
  Seluruh query spasial memanfaatkan query SQL terindeks pada snapshot `diklat_pim_deploy.db`, menjamin kecepatan respon < 25 ms pada lingkungan Lambda read-only Vercel.

---

## Q. Prinsip Keutuhan Data & Non-Fabrikasi

1. **Prinsip Non-Fabrikasi Data**: Tidak ada data sintetis yang dibuat untuk mengisi kekosongan demografi, treatment engine, atau koordinat ibukota.
2. **Prinsip Kejujuran Topologi**: Keterputusan 7 ruas jalan di kawasan rawa dicatat apa adanya sebagai fakta geospasial lapangan.
3. **Prinsip Imutabilitas Kebijakan**: Penambahan data spasial tidak mendistorsi peringkat resmi 350 ruas jalan yang telah diputuskan oleh pemerintah daerah.

---

## R. Kesiapan Menuju Fase Selanjutnya

Fase 5.1 dinyatakan selesai secara sempurna. Fondasi spasial ini siap menjadi pijakan bagi tahapan selanjutnya (misalnya: integrasi survei kondisi jalan lapangan, evaluasi kebutuhan anggaran penanganan, atau formulasi model kebijakan generasi berikutnya) bilamana data lapangan resmi telah tersedia.

---

## S. Keputusan Akhir Otoritatif

Berdasarkan seluruh hasil pengujian matematis, integritas topologi graf, verifikasi kartografi, kepatuhan kontrak data bersih, dan lulusnya 257 pengujian otomatis regresi penuh:

### KEPUTUSAN AKHIR (VERDICT):
# **`PHASE_5_1_SPATIAL_DERIVATION_PASS_WITH_DATA_REQUIRED`**

*Catatan: Akhiran `WITH_DATA_REQUIRED` menegaskan bahwa sistem telah beroperasi sempurna pada layer spasial dan jaringan, sementara tabel demografi, treatment engine, dan koordinat ibukota kabupaten secara sah dan transparan berstatus menunggu masukan data resmi (Data Required).*
