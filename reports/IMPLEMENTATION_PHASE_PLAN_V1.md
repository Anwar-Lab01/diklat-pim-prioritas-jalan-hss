# IMPLEMENTATION PHASE PLAN v1
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan

**Dokumen Rencana Tahapan Eksekusi, Modul Rekayasa, & Gerbang Kelulusan (Exit Gates)**  
**Versi:** 1.0.0 (MVP Release)  
**Status:** Frozen for Implementation  
**Orkestrator Arsitektur:** Antigravity  
**Tanggal:** 12 September 2026  
**Governing Documents:**
- [`reports/PRD_MVP_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/PRD_MVP_V1.md)
- [`reports/DATA_MODEL_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/DATA_MODEL_V1.md)
- [`reports/SCORING_ENGINE_CONTRACT_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/SCORING_ENGINE_CONTRACT_V1.md)
- [`reports/APPLICATION_ARCHITECTURE_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/APPLICATION_ARCHITECTURE_V1.md)
- [`reports/SCREEN_AND_USER_FLOW_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/SCREEN_AND_USER_FLOW_V1.md)

---

## 1. IMPLEMENTATION ROADMAP OVERVIEW

Pembangunan aplikasi dibagi menjadi **6 tahapan berpagar (*6 Gated Engineering Phases*)**. Setiap fase memiliki kriteria penerimaan objektif (*Acceptance Tests*), uji asap (*Smoke Checks*), dan gerbang kelulusan (*Exit Gate*) yang wajib terpenuhi sebelum melangkah ke fase berikutnya:

```
+---------------------------------------------------------------------------------------------------------+
|                                      6 GATED ENGINEERING PHASES                                         |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  PHASE 1: Canonical Data Ingestion, Storage & Integrity Baseline                                        |
|  [Exit Gate: 350 roads, 1,400 crosswalks, 2025 conditions loaded with 0 errors]                         |
|                                         |                                                               |
|                                         v                                                               |
|  PHASE 2: Deterministic Scoring Micro-Engine & Mathematical Invariants                                  |
|  [Exit Gate: Pure TS/Python engine passes 100% property-based tests, latensi < 10ms]                    |
|                                         |                                                               |
|                                         v                                                               |
|  PHASE 3: Core Application Shell, Dashboard & Interactive Priority Table                                |
|  [Exit Gate: 350 roads rendered in table, search/filter active, Explainability card working]            |
|                                         |                                                               |
|                                         v                                                               |
|  PHASE 4: Web GIS Spasial Engine & Layer Thematic Mapping                                               |
|  [Exit Gate: 350 road linestrings rendered, priority gradient, popup/filter working, no bridge leaks]   |
|                                         |                                                               |
|                                         v                                                               |
|  PHASE 5: Hierarchical Sliders, Real-Time Simulation & Model Versioning                                 |
|  [Exit Gate: Level 1 & Level 2 auto-balancing without leakage, draft comparison, activation audit log]  |
|                                         |                                                               |
|                                         v                                                               |
|  PHASE 6: End-to-End System Verification, Performance Audit & MVP Release                               |
|  [Exit Gate: Full browser E2E tests pass, zero black-box logic, production ready]                       |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. DETAILED PHASE SPECIFICATIONS

### PHASE 1: Canonical Data Ingestion, Storage & Integrity Baseline
* **Tujuan:** Membangun lapisan persistensi data, mengimpor seluruh dataset kanonikal, dan memverifikasi integritas relasional 350 ruas jalan.
* **Ruang Lingkup Pekerjaan:**
  - Inisialisasi skema basis data SQLite / PostgreSQL sesuai [`DATA_MODEL_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/DATA_MODEL_V1.md).
  - Skrip ETL ingestion untuk:
    * `road_registry_authoritative.csv` $\to$ tabel `roads`.
    * `roads_county.geojson` $\to$ tabel `road_geometries`.
    * `road_conditions_2025.csv` $\to$ tabel `road_conditions`.
    * `public_facilities.geojson` $\to$ tabel `public_facilities`.
    * `source_crosswalk.csv` $\to$ tabel `source_crosswalk`.
    * Matriks 17 variabel $\to$ tabel `road_variable_observations` (Mode 2025 dan Mode 2024).
* **Modul/Berkas yang Terlibat:**
  - `src/lib/db/schema.ts` (Drizzle/Prisma schema DDL)
  - `src/scripts/seed-authoritative-data.ts` (ETL Ingestion script)
  - `src/lib/services/roadIdentityService.ts`
* **Acceptance Tests:**
  - `TEST-P1-01`: Query `SELECT COUNT(*) FROM roads` wajib menghasilkan tepat 350 baris.
  - `TEST-P1-02`: Query `SELECT COUNT(*) FROM source_crosswalk WHERE match_status = 'VERIFIED'` wajib menghasilkan tepat 1.400 baris.
  - `TEST-P1-03`: Total panjang `SUM(total_panjang_km)` pada tabel kondisi 2025 wajib menghasilkan tepat `732.460 km`.
  - `TEST-P1-04`: Seluruh `road_key` pada tabel `road_geometries` cocok 1-to-1 dengan tabel `roads` (0 orphan).
* **Smoke Checks:** Jalankan script verifikasi hash integritas berkas terhadap `BUNDLE_MANIFEST.json`.
* **Exit Gate:** Seluruh 6 tabel Layer 1 & Layer 2 terisi lengkap, 0 error foreign key constraint, dan lulus semua Acceptance Tests Phase 1.

---

### PHASE 2: Deterministic Scoring Micro-Engine & Mathematical Invariants
* **Tujuan:** Membangun mesin skoring deterministik berbasis TypeScript murni yang mengimplementasikan [`SCORING_ENGINE_CONTRACT_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/SCORING_ENGINE_CONTRACT_V1.md).
* **Ruang Lingkup Pekerjaan:**
  - Implementasi modul kalkulasi bobot normalisasi: $W_k^* = W_k / \sum W_j$.
  - Implementasi modul bobot efektif: $\Omega_{k, i} = W_k^* \times w_{k, i}$.
  - Implementasi fungsi agregasi skoring komposit dan subtotal kategori.
  - Implementasi *cascading deterministic tie-breaker* (Urgensi Kemantapan $\to$ Penduduk $\to$ Nomor Ruas).
  - Implementasi logika auto-balancing hierarkis (Level 1 Kategori dan Level 2 Variabel).
* **Modul/Berkas yang Terlibat:**
  - `src/lib/engine/scoringContract.ts`
  - `src/lib/engine/hierarchicalBalancing.ts`
  - `src/lib/engine/tieBreaker.ts`
  - `src/lib/engine/__tests__/scoringEngine.test.ts`
* **Acceptance Tests:**
  - `TEST-P2-01`: Evaluasi skor 350 ruas dengan bobot baseline menghasilkan skor persis sama dengan verifikasi audit ($\Delta < 10^{-12}$).
  - `TEST-P2-02`: Uji auto-balancing boundary: geser slider ke 1.0 dan 0.0 tidak menimbulkan error pembagian nol (*zero-division guard verified*).
  - `TEST-P2-03`: Eksekusi skoring 350 ruas jalan selesai dalam waktu $< 10\text{ milidetik}$ pada CPU standar.
  - `TEST-P2-04`: Peringkat yang dihasilkan membentuk barisan kontigu unik $\{1, 2, 3, \dots, 350\}$ tanpa seri.
* **Smoke Checks:** Jalankan test suite `vitest run src/lib/engine`.
* **Exit Gate:** 100% test coverage pada modul engine, 0 dependensi black-box/ML, dan lolos uji invarian matematis.

---

### PHASE 3: Core Application Shell, Dashboard & Interactive Priority Table
* **Tujuan:** Membangun antarmuka pengguna dasar (Layar 1 Dashboard, Layar 2 Ranking Table, dan Layar 4 Road Detail).
* **Ruang Lingkup Pekerjaan:**
  - Pembangunan layout navigasi global (*sidebar*, *header*, *mode indicator*).
  - Pembangunan Layar 1 (Dashboard Eksekutif): KPI cards, grafik sebaran kemantapan kecamatan, tabel ringkas prioritas.
  - Pembangunan Layar 2 (Tabel Peringkat 350 Ruas): Tabel virtualisasi performa tinggi dengan pencarian, filter kecamatan, dan indikator tier prioritas.
  - Pembangunan Layar 4 (Road Detail & Explainability Card): Tabel dekomposisi transparan 17 faktor dengan kontribusi nilai skor per variabel.
* **Modul/Berkas yang Terlibat:**
  - `src/app/layout.tsx` & `src/components/layout/Sidebar.tsx`
  - `src/app/page.tsx` (Dashboard)
  - `src/app/prioritas/page.tsx` (Priority Ranking Table)
  - `src/app/ruas/[roadKey]/page.tsx` (Road Detail Card)
  - `src/components/explainability/FactorBreakdownTable.tsx`
* **Acceptance Tests:**
  - `TEST-P3-01`: Tabel menampilkan 350 ruas jalan secara utuh tanpa lag saat *scrolling*.
  - `TEST-P3-02`: Pencarian nama ruas "Mawar" menampilkan 2 baris terpisah dengan label kualifikasi `Mawar (Kandangan Utara)` dan `Mawar (Daha Selatan)`.
  - `TEST-P3-03`: Pada Layar 4, jumlah matematis dari kontribusi 17 faktor persis sama dengan skor akhir ruas jalan yang ditampilkan.
* **Smoke Checks:** Verifikasi rendering UI di browser Chrome dan Firefox.
* **Exit Gate:** Tiga layar inti berfungsi mulus, navigasi detail ruas interaktif, dan lolos verifikasi explainability.

---

### PHASE 4: Web GIS Spasial Engine & Layer Thematic Mapping
* **Tujuan:** Mengintegrasikan peta spasial Leaflet/MapLibre (Layar 3 Map View) untuk memvisualisasikan geometri 350 ruas jalan dan fasilitas umum.
* **Ruang Lingkup Pekerjaan:**
  - Integrasi pustaka peta Web GIS (Leaflet + React-Leaflet).
  - Rendering 350 linestring ruas jalan kabupaten dari `road_geometries` dengan gradasi warna prioritas.
  - Implementasi interaksi klik jalan $\to$ popup info ringkas $\to$ link detail ruas.
  - Implementasi overlay layer titik fasilitas publik (RSUD, Puskesmas, Sekolah, Pasar) dengan toggle kontrol.
  - Filter batas administrasi kecamatan pada kanvas peta.
* **Modul/Berkas yang Terlibat:**
  - `src/app/peta/page.tsx`
  - `src/components/map/RoadPriorityMap.tsx`
  - `src/components/map/FacilityOverlayLayers.tsx`
  - `src/lib/services/spatialMapService.ts`
* **Acceptance Tests:**
  - `TEST-P4-01`: Kanvas peta merender tepat 350 linestring jalan tanpa patah koordinat (EPSG:4326).
  - `TEST-P4-02`: Konektor jembatan sintetis (`network_connectors.geojson`) terbukti TIDAK muncul di daftar layer jalan.
  - `TEST-P4-03`: Mengklik ruas jalan pada peta membuka popup dengan nomor ruas dan skor yang identik dengan tabel peringkat.
* **Smoke Checks:** Uji interaksi zoom/pan pada area padat perkotaan Kandangan dan area perairan rawa Daha.
* **Exit Gate:** Peta Web GIS berfungsi cepat, interaksi layer berjalan stabil, dan tidak ada kebocoran geometri sintetis.

---

### PHASE 5: Hierarchical Sliders, Real-Time Simulation & Model Versioning
* **Tujuan:** Membangun antarmuka simulasi pembobotan hierarkis (Layar 5, Layar 6, dan Layar 7) serta manajemen versi model.
* **Ruang Lingkup Pekerjaan:**
  - Pembangunan komponen slider hierarkis Level 1 (Kategori) dan Level 2 (Variabel Lokal) dengan auto-balancing instan.
  - Integrasi *client-side reactive store* (Zustand) untuk memicu pembaruan peringkat instan ($< 10\text{ ms}$).
  - Pembangunan Layar 6 (Scenario Comparison): Komparasi side-by-side Model Aktif vs Simulasi, sorotan pergeseran peringkat ($\Delta\text{Rank}$), dan delta skor.
  - Pembangunan Layar 7 (Model Versions): Repositori draf, riwayat aktivasi model, dan dialog otentikasi pengesahan resmi oleh pimpinan.
* **Modul/Berkas yang Terlibat:**
  - `src/app/konfigurasi/page.tsx`
  - `src/app/simulasi/page.tsx`
  - `src/app/versi-model/page.tsx`
  - `src/components/sliders/CategorySliderGroup.tsx`
  - `src/components/sliders/LocalVariableSliderGroup.tsx`
  - `src/lib/store/usePriorityStore.ts`
* **Acceptance Tests:**
  - `TEST-P5-01`: Perubahan slider kategori merebalance kategori saudara tanpa mengubah nilai bobot lokal anak.
  - `TEST-P5-02`: Simulasi slider tidak memutasi model aktif yang tersimpan di database sebelum tombol aktivasi ditekan.
  - `TEST-P5-03`: Percobaan mengedit atau menghapus model `Policy Default v1` ditolak oleh sistem (*immutable baseline*).
  - `TEST-P5-04`: Aktivasi model baru mewajibkan pengisian catatan justifikasi kebijakan dan mencatat akun pembuat/pengesah.
* **Smoke Checks:** Uji simulasi perubahan bobot ekstrem (0% dan 100%) dan verifikasi pembaruan tabel komparasi.
* **Exit Gate:** Seluruh alur simulasi dan tata kelola versi model berjalan tanpa kebocoran status.

---

### PHASE 6: End-to-End System Verification, Performance Audit & Release Gate
* **Tujuan:** Uji komprehensif seluruh sistem, audit performa lintas peramban, pengujian keamanan, dan verifikasi akhir sebelum serah terima.
* **Ruang Lingkup Pekerjaan:**
  - Penyelesaian Layar 8 (Data Source Provenance) dan Layar 9 (Minimal Admin).
  - Pengujian End-to-End (E2E) otomatis menggunakan Playwright.
  - Uji ekspor laporan (CSV, Excel, GeoJSON).
  - Pemeriksaan kepatuhan independen terhadap 10 kriteria arsitektur.
* **Modul/Berkas yang Terlibat:**
  - `src/app/sumber-data/page.tsx`
  - `src/app/administrasi/page.tsx`
  - `e2e/priority-system.spec.ts`
  - `src/lib/services/exportService.ts`
* **Acceptance Tests:**
  - `TEST-P6-01`: Seluruh skenario pengujian E2E (Dashboard $\to$ Ranking $\to$ Detail $\to$ Simulasi $\to$ Aktivasi) lulus 100%.
  - `TEST-P6-02`: Berkas ekspor CSV/Excel memuat 350 baris dengan nilai skor yang cocok hingga desimal terakhir.
  - `TEST-P6-03`: Waktu pemuatan halaman awal (*First Contentful Paint*) $< 1.5\text{ detik}$.
* **Smoke Checks:** Uji coba skenario pengguna lengkap oleh Decision-Maker fiktif.
* **Exit Gate:** **RELEASE VERDICT PASS: SIAP PRODUKSI MVP.**

---
*Dokumen Rencana Tahapan Implementasi v1 ini disahkan sebagai roadmap teknis eksekusi rekayasa perangkat lunak Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan.*
