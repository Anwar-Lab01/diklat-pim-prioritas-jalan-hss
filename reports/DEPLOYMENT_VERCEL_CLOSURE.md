# LAPORAN CLOSURE DEPLOYMENT VERCEL & GITHUB

**Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan**  
*Diklat Kepemimpinan (PIM) — Deployment Repair Orchestration*

---

## 1. RINGKASAN EKSEKUTIF

Proses perbaikan deployment ke GitHub dan Vercel untuk aplikasi **Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan** telah diselesaikan secara menyeluruh.

* **GitHub Repository**: [https://github.com/Anwar-Lab01/diklat-pim-prioritas-jalan-hss](https://github.com/Anwar-Lab01/diklat-pim-prioritas-jalan-hss)
* **Branch**: `master`
* **Commit SHA Terverifikasi**: `868a674105465f1997813ac4c428deb9d986ff03` (`868a674`)
* **Vercel Deployment ID**: `6407991463`
* **Vercel Deployment Status**: `SUCCESS` (`Deployment has completed`)
* **Active Deployment URL**: [https://diklat-pim-prioritas-jalan-dqv9ey6zx-anwar-lab01s-projects.vercel.app](https://diklat-pim-prioritas-jalan-dqv9ey6zx-anwar-lab01s-projects.vercel.app)
* **Target Domain Produksi**: `https://diklat-pim-prioritas-jalan-hss.vercel.app`
* **Baseline Regresi Otomatis**: **229 / 229 PASS** (Fase 1 s.d. Fase 4.7 tanpa regresi)

---

## 2. DIAGNOSIS MASALAH & SOLUSI TEKNIS

### A. Masalah 1: Ukuran Basis Data dan Ketiadaan DB di Bundle Vercel
* **Penyebab**: Basis data pengembangan lokal `data/diklat_pim.db` berukuran 162 MB akibat akumulasi ~92 sesi pengetesan skoring historis (32.200 baris rincian JSON). GitHub menerapkan batas keras 100 MB per berkas sehingga `data/*.db` di-ignore. Akibatnya, build Vercel tidak memiliki basis data SQLite.
* **Solusi**: Dibuat snapshot generator `scripts/generate_deploy_db.ts` (`npm run db:deploy-snapshot`) yang menghasilkan `data/diklat_pim_deploy.db` berukuran **8,51 MB** (< 20 MB target). Snapshot ini menyalin 100% data master otoritatif (350 ruas jalan, 1.400 crosswalk, 664 alias, 11 kecamatan, 148 desa/kelurahan, 285 fasum, 11.900 observasi 17 variabel) serta hanya 2 eksekusi skoring terbaru (`OPERATIONAL_2025` dan `BENCHMARK_2024` = 700 baris skor), lalu di-`VACUUM`.
* **Git Hygiene**: `.gitignore` tetap mengecualikan `data/diklat_pim.db` (162 MB) dan WAL/SHM, namun secara eksplisit melacak `!data/diklat_pim_deploy.db`.

### B. Masalah 2: Operasi SQLite pada Filesystem Read-Only (Vercel Lambda)
* **Penyebab**: Di lingkungan serverless Vercel (`/var/task`), filesystem bersifat read-only. `node:sqlite` yang menjalankan `PRAGMA journal_mode = WAL;` dan eksekusi skema DDL akan mengalami error write lock.
* **Solusi**:
  1. `src/config/constants.ts`: `DB_PATH` dikonfigurasi dinamis. Jika berada di lingkungan produksi (`NODE_ENV === 'production'`, `VERCEL`, atau jika dev DB lokal tidak ada), sistem otomatis beralih ke `data/diklat_pim_deploy.db`.
  2. `src/db/connection.ts`: Membuka database dengan `{ readOnly: true }` di lingkungan produksi/deploy snapshot, serta melewati perintah WAL pragma dan `schema.sql` DDL.

### C. Masalah 3: Vercel Entrypoint Zero-Config
* **Penyebab**: Entrypoint Vercel memerlukan `src/server.ts` di root level proyek.
* **Solusi**: File tipis `src/server.ts` telah disediakan, mengimpor dan menjalankan `src/server/server.ts`. Runtime lokal maupun Vercel lambda menggunakan entrypoint yang sama tanpa menduplikasi logika Express.

---

## 3. BUKTI VERIFIKASI & PENGUJIAN

### A. Regresi Otomatis Komprehensif (229 / 229 PASS)
```bash
npm run test:all
```
* Phase 1 Verification (Identity, Crosswalk, 2025 Condition Authority): **42 / 42 PASS**
* Phase 2 Verification (Scoring Engine Math, Invariants, Models): **42 / 42 PASS**
* Phase 3 Verification (Reconciliation, Tie-Breaking, Top 105 Audit): **34 / 34 PASS**
* Phase 4 Verification (Spatial Linestrings, Reference Network, Facilities): **33 / 33 PASS**
* Phase 4.5 Verification (GIS UI Hardening, 4-Tier Filtering, Zoom Hierarchy): **24 / 24 PASS**
* Phase 4.6 Verification (Cartographic Hardening, RTRW Symbology, Boundary): **27 / 27 PASS**
* Phase 4.7 Verification (Map Interaction, Desa Popup, Control Panel): **27 / 27 PASS**

### B. Verifikasi Invarian Snapshot Produksi (`scripts/verify_deploy_db.ts`)
* Table `roads`: 350 baris (PASS)
* Table `source_crosswalk`: 1.400 baris (PASS)
* Table `districts`: 11 baris (PASS)
* Table `villages`: 148 baris (PASS)
* Table `public_facilities`: 285 baris (PASS)
* Table `categories`: 4 baris (PASS)
* Table `variable_definitions`: 17 baris (PASS)
* Table `scoring_runs`: 2 baris (PASS)
* Table `road_priority_scores`: 700 baris (PASS)
* Foreign Key Check: 0 violations (PASS)
* **Mandatory Smoke Roads Ranking Invariants**:
  * `HSS-KAB-025` -> **Rank #1** (TOP_35, Final Score: 0.649945) (PASS)
  * `HSS-KAB-001` -> **Rank #12** (TOP_35, Final Score: 0.529610) (PASS)
  * `HSS-KAB-295` -> **Rank #133** (REGULAR, Final Score: 0.412427) (PASS)
  * `HSS-KAB-350` -> **Rank #169** (REGULAR, Final Score: 0.381386) (PASS)
  * `HSS-KAB-013` -> **Rank #245** (REGULAR, Final Score: 0.340749) (PASS)
* **Tier Partition Invariants**:
  * TOP_35: 35 ruas
  * TOP_70: 35 ruas
  * TOP_105: 35 ruas
  * REGULAR: 245 ruas

### C. Verifikasi API Endpoint Server (`scripts/test_server_endpoints.ts`)
* `GET /api/dashboard`: 200 OK, 350 ruas, Top 10 lengkap.
* `GET /api/roads`: 200 OK, 350 data tabular dengan skor & peringkat.
* `GET /api/roads/HSS-KAB-001`: 200 OK, Rank #12, detail 17 faktor terdekomposisi.
* `GET /api/map/roads`: 200 OK, 350 linestring GeoJSON berbobot & berperingkat.
* `GET /api/map/reference-network`: 200 OK, 16 konektor & jalan nasional/provinsi.
* `GET /`: 200 OK HTML Leaflet SPA.

---

## 4. PANDUAN LANGKAH PEMILIK REPOSITORY (VERCEL DASHBOARD)

Aplikasi telah ter-deploy dan berjalan sukses di Vercel. Dua konfigurasi berikut memerlukan akses dashboard pemilik akun `Anwar-Lab01`:

### Langkah 1: Membuka Akses Publik (Nonaktifkan Deployment Protection)
Saat ini request anonim dialihkan ke halaman login (`302 Found -> /login`) oleh fitur proteksi Vercel:
1. Buka [https://vercel.com](https://vercel.com) dan login ke akun **Anwar-Lab01**.
2. Pilih project **diklat-pim-prioritas-jalan**.
3. Masuk ke menu **Settings** -> **Deployment Protection**.
4. Pada bagian **Vercel Authentication**, ubah menjadi **Disabled** (atau matikan toggle Standard Protection).
5. Klik **Save**. Setelah disimpan, seluruh pengunjung publik dapat langsung mengakses aplikasi tanpa login.

### Langkah 2: Menetapkan Domain Alias `diklat-pim-prioritas-jalan-hss.vercel.app`
1. Di halaman project yang sama, masuk ke menu **Settings** -> **Domains**.
2. Masukkan nama domain yang diinginkan: `diklat-pim-prioritas-jalan-hss.vercel.app`.
3. Klik **Add**. Vercel akan otomatis mengarahkan traffic domain tersebut ke deployment production aktif.
*(Alternatif: Pada menu **Settings** -> **General**, nama proyek dapat diganti dari `diklat-pim-prioritas-jalan` menjadi `diklat-pim-prioritas-jalan-hss`)*.

---

## 5. KESIMPULAN & STATUS AKHIR

| Komponen | Status | Keterangan |
|---|---|---|
| Git Remote & Branch | **SYNCED** | `origin/master` terhubung ke `Anwar-Lab01/diklat-pim-prioritas-jalan-hss` |
| Production Database | **BUNDLED** | `data/diklat_pim_deploy.db` (8,51 MB, read-only, FK verified) |
| Server Entrypoint | **VERIFIED** | `src/server.ts` (root zero-config) |
| Automated Tests | **229 / 229 PASS** | 100% lulus tanpa deviasi |
| Vercel Build & Deploy | **SUCCESS** | Deployment `6407991463` status `Completed` |
| Public Access & Alias | **DASHBOARD READY** | Instruksi Deployment Protection & Domain Alias terdokumentasi lengkap |

**VERDICT**: `VERCEL_PRODUCTION_DEPLOYMENT_SUCCESS`
