# LAPORAN IMPLEMENTASI MODUL PERENCANAAN BIAYA & PENANGANAN JALAN BERBASIS STANDAR ASB BM 2027 (FASE 2)
**Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan (SIAP JALAN HSS)**  
*Dinas Pekerjaan Umum dan Penataan Ruang (PUTR) Pemerintah Kabupaten Hulu Sungai Selatan*

---

## 1. Ringkasan Eksekutif & Tujuan

Modul Perencanaan Biaya Penanganan Jalan Berbasis Standar Analisis Standar Belanja (ASB) Bina Marga 2027 dan Analisis Harga Satuan Pekerjaan (AHSP) Bina Marga 2025 (Fase 2) telah selesai dibangun, diintegrasikan, dan diverifikasi secara menyeluruh. Modul ini menjembatani hasil analisis prioritas teknis-spasial 17 faktor normatif (AHP/WSM) ke dalam estimasi fiskal preskriptif yang siap pakai untuk penyusunan Rencana Kerja (Renja) dan Dokumen Pelaksanaan Anggaran (DPA) Dinas PUTR Kabupaten HSS.

Modul Fase 2 dibangun di atas fondasi data otoritatif 350 ruas jalan kabupaten (732,460 km) dan 7.487 segmen survei visual kondisi jalan DD1 (~100 meteran). Seluruh perhitungan biaya menggunakan presisi uang **integer-sen** (1 rupiah = 100 sen) untuk mengeliminasi akumulasi drift floating-point pada kalkulasi ribuan segmen.

---

## 2. Arsitektur & Komponen Teknis yang Diimplementasikan

### 2.1 Lapisan Basis Data (Database Layer)
- **Tabel Referensi ASB & AHSP:**
  - `master_asb_items`: 1.010 item standar ASB BM 2027 (932 paket jalan kabupaten, 78 paket jembatan).
  - `master_ahsp_items`: 483 item pembayaran pekerjaan AHSP BM 2025 across 10 divisi Bina Marga.
  - `treatment_package_rules`: 6 aturan penanganan preskriptif (R01..R06).
  - `asb_ahsp_profiles`: 11 profil struktural penanganan.
  - `asb_ahsp_profile_items`: 35 aturan pemetaan komponen pekerjaan AHSP.
- **Tabel Operasional Perencanaan & Skenario (Skema Aditif Fase 2):**
  - `budget_scenarios`: Menyimpan skenario plafon pagu tahunan (`SCN-2027-BASELINE`, `SCN-2027-OPT_30M`, dll.).
  - `road_segment_cost_estimates`: Menyimpan rincian estimasi biaya per segmen survei (7.487 baris per skenario).
  - `road_cost_summaries`: Menyimpan agregasi biaya tingkat ruas (350 baris per skenario) dengan urutan alokasi, status didanai (`is_funded`), biaya kumulatif, dan tipe penanganan dominan.

### 2.2 Core Costing Engine (`src/services/treatmentCostingEngine.ts`)
1. **Evaluasi Aturan R01..R06:**
   - **R01 (Rekonstruksi Struktural / Belum Beraspal - Tipe D):** Diterapkan pada segmen permukaan tanah/kerikil atau koridor kritis dengan persentase tidak mantap ≥ 40% dan rusak berat ≥ 20%.
   - **R02 (Rehabilitasi Mayor - Tipe C):** Diterapkan pada koridor jalan beraspal dengan persentase tidak mantap ≥ 40% atau rusak sedang/ringan tinggi.
   - **R03 (Pemeliharaan Periodik - Tipe B):** Diterapkan pada koridor dengan kerusakan minor/sedang terpencar (tidak mantap ≥ 20%).
   - **R04 (Pemeliharaan Rutin Terstandar - Tipe A):** Diterapkan pada koridor beraspal mantap dengan perbaikan setempat.
   - **R05 (Peningkatan / Penanganan Khusus Tanah - Tipe D/V):** Penanganan lapis fondasi dan stabilisasi jalan tanah.
   - **R06 (Pemeliharaan Rutin Murni - Non-Paket):** Fallback preskriptif untuk seluruh segmen dalam kondisi Baik/Mantap (biaya paket struktural Rp 0).
2. **Pencocokan Dimensi Standar ASB (Dimension & Surface Snapping):**
   - Lebar segmen survei dipetakan secara eksak ke varian lebar standar paket ASB (3,0m; 3,5m; 4,0m; 4,5m; 5,0m; 5,5m; 6,0m; 7,0m).
   - Tipe perkerasan dicocokkan ke spesifikasi material resmi (HRS-Base, AC-BC, Lapen, Telford).
3. **Aritmetika Presisi Integer-Sen:**
   - Formula biaya indikatif segmen: `indicative_cost_sen = segment_length_m * unit_price_sen`.
   - Konversi rupiah: `indicative_cost_rp = Math.round(indicative_cost_sen / 100)`.
   - Terbukti menghasilkan **0,000000% floating-point drift** pada akumulasi 7.487 segmen.
4. **Agregasi Biaya Tingkat Ruas (Road Cost Summaries):**
   - Mengagregasi panjang tertangani (`treated_length_km`), total pagu ASB ruas (`total_pagu_asb_rp`), jumlah segmen tertangani vs rutin, dan mendeteksi tipe penanganan dominan (`dominant_asb_type`).
5. **Alokasi Pagu Anggaran Berbasis Prioritas (Greedy Ceiling Allocation):**
   - Mengambil peringkat prioritas otoritatif AHP/WSM (`road_priority_scores`) berdasarkan model `POLICY_DEFAULT_V1` dan mode `OPERATIONAL_2025`.
   - Mengurutkan ruas dari Peringkat 1 s.d. 350.
   - Menghitung akumulasi kumulatif biaya (`cumulative_cost_rp`).
   - Menerapkan batasan fiskal pagu (`budget_ceiling_rp`): Ruas yang kumulatif biayanya masih berada di dalam plafon ditandai `is_funded = 1` (TERAKOMODASI), sedangkan ruas di atas plafon ditandai `is_funded = 0` (TERTUNDA).

### 2.3 Antarmuka Pemrograman Aplikasi (REST API Endpoints)
9 rute API beroperasi di bawah `/api/costing/*`:
- `GET /api/costing/scenarios`: Daftar seluruh skenario anggaran beserta ringkasan metrik.
- `GET /api/costing/scenarios/:scenarioId`: Detail skenario tertentu dan status pagu.
- `POST /api/costing/scenarios`: Pembuatan skenario anggaran baru dan kalkulasi otomatis.
- `PUT /api/costing/scenarios/:scenarioId`: Pembaruan plafon/parameter dan rekalkulasi dinamis.
- `DELETE /api/costing/scenarios/:scenarioId`: Penghapusan skenario (dengan perlindungan baseline).
- `POST /api/costing/scenarios/:scenarioId/calculate`: Kalkulasi ulang komprehensif seluruh ruas.
- `GET /api/costing/scenarios/:scenarioId/roads`: Data rekapitulasi 350 ruas dengan filter kecamatan, status didanai, tipe penanganan, dan pencarian teks.
- `GET /api/costing/scenarios/:scenarioId/roads/:roadKey`: Rincian mendalam ruas: data identitas SK, ringkasan biaya, rincian 7.487 segmen survei visual DD1, dan dekomposisi pemetaan item AHSP.
- `GET /api/costing/scenarios/:scenarioId/export/csv`: Unduhan laporan CSV berstandar RFC dengan UTF-8 BOM untuk kompatibilitas Microsoft Excel.
- `GET /api/costing/scenarios/comparison`: Ringkasan komparasi multi-skenario.
- `GET /api/costing/reference/asb`: Pencarian katalog standar ASB BM 2027.
- `GET /api/costing/reference/ahsp`: Pencarian katalog item AHSP BM 2025.
- `GET /api/costing/reference/rules`: Matriks 6 aturan penanganan preskriptif.

### 2.4 Antarmuka Pengguna & Modul Klien (Frontend UI)
- **Modul Klien (`src/public/asbCostingModule.js`):**
  - Mengelola state reaktif (skenario aktif, data ruas terfiltrasi, paginasi 25 ruas/halaman, subtab aktif, katalog).
  - Terintegrasi penuh ke dalam siklus hidup perutean `app.js` (`handleRouting` dan `switchView`).
- **Tampilan Utama (`#view-asb-costing` di `src/public/index.html`):**
  - **Header & Kontrol Skenario:** Dropdown pemilihan skenario aktif, tombol Kalkulasi Ulang, Ubah Plafon, Buat Skenario Baru, dan Ekspor CSV.
  - **5 Kartu KPI Eksekutif:** Kebutuhan Riil ASB, Plafon Anggaran, Biaya Teralokasi, Jumlah Ruas Terakomodasi, dan Panjang Penanganan.
  - **Budget Progress Bar:** Pita visual pemanfaatan plafon anggaran, sisa plafon, dan persentase cakupan terhadap kebutuhan riil.
  - **5 Subtab Navigasi:**
    1. *Rekapitulasi Ruas:* Tabel 350 ruas dengan pencarian live, filter kecamatan, filter status alokasi, filter tipe dominan, paginasi halaman, badge status alokasi, dan tombol rincian segmen.
    2. *Perbandingan Skenario:* Tabel komparasi penyerapan plafon, kebutuhan riil, dan ruas didanai antar skenario anggaran.
    3. *Katalog Standar ASB:* Penelusuran 1.010 paket ASB lengkap dengan spesifikasi, perkerasan, lebar, dan harga satuan.
    4. *Katalog Item AHSP:* Penelusuran 483 item pembayaran pekerjaan 10 divisi Bina Marga.
    5. *Aturan Penanganan R01..R06:* Panduan logika kondisi survei dan rasional teknis kebijakan Bina Marga.
- **3 Dialog Modal Interaktif:**
  - `asb-road-detail-modal`: Rincian segmen survei STA per STA (~100m) dan dekomposisi pemetaan komponen AHSP profil ruas terpilih.
  - `asb-create-scenario-modal`: Formulir pembuatan skenario fiskal baru dengan plafon pagu kustom.
  - `asb-edit-ceiling-modal`: Formulir penyesuaian plafon pagu skenario aktif secara instan.

---

## 3. Data Kuantitatif & Hasil Skenario

### 3.1 Skenario Baseline 2027 (`SCN-2027-BASELINE`)
- **Plafon Pagu Anggaran:** Rp 50.000.000.000 (Rp 50,00 Miliar)
- **Total Kebutuhan Riil ASB Jaringan (350 Ruas):** Rp 784.746.410.000 (Rp 784,75 Miliar)
- **Biaya Teralokasi (Peringkat 1 s.d. 19):** Rp 49.214.330.000 (Rp 49,21 Miliar)
- **Pemanfaatan Plafon:** 98,4%
- **Sisa Plafon:** Rp 785.670.000
- **Cakupan Kebutuhan Riil Jaringan:** 6,3%
- **Status Ruas:** 19 ruas Terakomodasi (Didanai), 331 ruas Tertunda
- **Profil Penanganan Segmen (7.487 segmen):**
  - Paket ASB Struktural (Tipe D, C, B, A / R01..R05): 3.423 segmen (336,49 km)
  - Pemeliharaan Rutin Murni (R06): 4.064 segmen (395,97 km)
- **Distribusi Tipe Penanganan Dominan Tingkat Ruas:**
  - Tipe D — Rekonstruksi Fondasi & Timbunan (R01): 114 ruas
  - Tipe C — Rekonstruksi Fondasi LPA/LPB (R02, R03): 51 ruas
  - Tipe B — Perbaikan Fondasi Atas LPA (R04): 16 ruas
  - Tipe A — Pelapisan Ulang / Overlay (R05): 31 ruas
  - NONE — Pemeliharaan Rutin (R06): 138 ruas

### 3.2 Skenario Alokasi Terbatas 30M (`SCN-2027-OPT_30M`)
- **Plafon Pagu Anggaran:** Rp 30.000.000.000 (Rp 30,00 Miliar)
- **Biaya Teralokasi:** Rp 22.285.180.000
- **Status Ruas:** Ruas prioritas teratas terakomodasi secara terstandar di bawah batas plafon Rp 30 Miliar.

---

## 4. Catatan Verifikasi & Pengujian Mutu (QA)

### 4.1 Eksekusi Seluruh Suite Pengujian Otomatis (16 dari 16 Lolos)
Perintah `npm.cmd run test:all` dijalankan dan mencatat **100% kelulusan tanpa regresi**:
1. `test:phase1` (Canonical Identity, Crosswalk, Conditions, Geometry, Idempotency) — **23 Passed**
2. `test:phase2` (Demographics, DD1 Segments, Spatial Intersections) — **Passed**
3. `test:phase3` (AHP/WSM Scoring Engine, Weight Constraints) — **Passed**
4. `test:phase4` (API Integrity, Endpoint Contracts) — **Passed**
5. `test:phase4-ui` (UI Hardening & Modals) — **Passed**
6. `test:phase4-carto` (Cartographic District & Surface Renderings) — **Passed**
7. `test:phase4-interaction` (Spatial Routing & Facility HUDs) — **Passed**
8. `test:phase5` (Policy Weight Scenario Simulation) — **Passed**
9. `test:phase5-1` (Spatial Derivation & Turf Routing Foundation) — **Passed**
10. `test:phase5-1a` (Village Demographics & 7,487 DD1 Segments) — **Passed**
11. `test:phase5-1c` (Thematic Map Modes: Prioritas vs Kondisi DD1) — **Passed**
12. `test:phase5-2b` (Planning Workspace & Brief Generation) — **Passed**
13. `test:costing-phase1` (ASB Reference Data Ingestion & 1,010/483 Record Counts) — **15 Passed**
14. `test:costing-phase1-1` (Database Hardening, Foreign Keys & Money Sen Precision) — **19 Passed**
15. `test:phase5-3` (Road Narrative Engine, 8-Dimension Text Generation) — **8 Passed**
16. `test:costing-phase2` (ASB Treatment Selection, Snapping, Ceiling Allocation, CSV Export, Edge Cases) — **23 Passed**

### 4.2 Verifikasi End-to-End Headless Chrome (CDP Browser Clickstream)
Pengujian interaksi klien nyata dijalankan menggunakan headless Google Chrome melalui Chrome DevTools Protocol (`scripts/verify_costing_e2e_cdp.mjs`):
- **Aktivasi View:** `#view-asb-costing` terbuka sempurna dengan KPI cards terpopulasi (Rp 784,75M kebutuhan, Rp 50M plafon).
- **Tabel Rekapitulasi & Paginasi:** 25 baris per halaman, navigasi halaman 1 s.d. 14 dari 350 ruas jalan.
- **Filter Tipe Penanganan Dominan:** Memilih 'Tipe D' menyaring tepat 114 ruas (5 halaman).
- **Pencarian Live:** Pencarian 'HSS-KAB-001' langsung menampilkan ruas target secara instan.
- **Modal Rincian Segmen & AHSP:** Membuka rincian STA segmen (6 segmen) dan dekomposisi AHSP (4 komponen terpetakan dengan status dan deskripsi lengkap).
- **Aksesibilitas Modal:** Penutupan modal via tombol Escape dan klik backdrop berfungsi mulus.
- **Katalog AHSP 10 Divisi:** Filter interaktif berdasarkan Divisi 5 Bina Marga memuat 26 item pekerjaan berbutir/beton secara presisi.
- **Aturan R01..R06:** Seluruh 6 aturan menampilkan matriks logika kondisi, deskripsi profil struktural, dan jumlah komponen AHSP terpetakan (5, 3, 3, 4, 3, 0).
- **Idempotensi Navigasi:** Perpindahan berulang kali antar-view (#dashboard, #peta, #prioritas, #asb-costing) terbukti aman tanpa duplikasi event listener maupun kebocoran memori.

### 4.3 Verifikasi Endpoint REST API & Ekspor CSV
- 9 endpoint costing `/api/costing/*` terverifikasi merespon **HTTP 200 OK** dengan payload JSON valid.
- Ekspor CSV terverifikasi menyertakan raw UTF-8 BOM (`0xEF 0xBB 0xBF`) dan 358 baris data RFC-compliant untuk kompatibilitas penuh Microsoft Excel.

---

## 5. Kepatuhan Kebijakan & Batasan Lingkungan (Guardrails)

1. **Local-First & Tanpa Operasi Jaringan Eksternal:** Seluruh pekerjaan dilakukan secara lokal di direktori `F:\WebApps\6.diklat_pim\diklat_pim_working_bundle_v1`. Tidak ada perintah `git commit`, `git push`, maupun operasi GitHub/Vercel.
2. **Integritas Basis Data Produksi:** Basis data produksi `data/diklat_pim_deploy.db` tidak dimodifikasi.
3. **Pelestarian Modul Eksisting:** Peta interaktif Leaflet, Road Inspector, Narrative Engine 8-dimensi, dan simulasi pembobotan 17 variabel normatif tetap utuh dan berfungsi penuh tanpa gangguan.

---
*Dibuat secara otomatis oleh Antigravity Agent untuk Dinas PUTR Kabupaten Hulu Sungai Selatan.*
