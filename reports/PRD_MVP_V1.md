# PRODUCT REQUIREMENTS DOCUMENT (PRD) — MVP v1
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan

**Dokumen Spesifikasi Kebutuhan Produk (Product Requirements Document)**  
**Versi:** 1.0.0 (MVP Release)  
**Status:** Frozen for Implementation  
**Orkestrator Arsitektur:** Antigravity  
**Tanggal:** 12 September 2026  
**Governing Documents:**
- [`00_START_HERE/START_HERE.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/00_START_HERE/START_HERE.md)
- [`00_START_HERE/AUTHORITY_SUMMARY.json`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/00_START_HERE/AUTHORITY_SUMMARY.json)
- [`reports/PRIORITY_MODEL_SPECIFICATION_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/PRIORITY_MODEL_SPECIFICATION_V1.md)
- [`reports/LOCAL_WEIGHTS_CLOSURE_REPORT.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/LOCAL_WEIGHTS_CLOSURE_REPORT.md)

---

## 1. EXECUTIVE SUMMARY & PROBLEM STATEMENT

### 1.1 Latar Belakang & Masalah
Pemerintah Kabupaten Hulu Sungai Selatan melalui Dinas Pekerjaan Umum dan Tata Ruang (PUTR) mengelola **350 ruas jalan kabupaten** dengan total panjang **732.460 km**. Berdasarkan audit kondisi resmi tahun 2025, tingkat kemantapan jalan daerah berada pada angka **53.64% (392.890 km mantap)** dan **46.36% (339.570 km tidak mantap)** yang memerlukan intervensi penanganan fisik (pemeliharaan berkala, rehabilitasi, atau rekonstruksi).

Dalam siklus perencanaan anggaran daerah (APBD/DAK), penentuan urutan prioritas penanganan jalan kerap menghadapi kendala:
1. **Kurangnya Transparansi dan Keterjelasan (*Explainability*):** Keputusan prioritas masa lalu seringkali dipersepsikan sebagai proses *black-box*, di mana para pemangku kepentingan sulit memahami mengapa suatu ruas diprioritaskan di atas ruas lainnya.
2. **Ketiadaan Simulasi Kebijakan Real-Time:** Pimpinan (Bupati, Kepala Dinas, Kepala Bidang Bina Marga) tidak memiliki alat bantu untuk menyimulasikan dampak perubahan bobot kebijakan (misalnya jika pemerintah ingin lebih menekankan akses fasilitas kesehatan Puskesmas/RSUD dibandingkan simpul ekonomi) terhadap pergeseran daftar prioritas secara instan.
3. **Risiko Integritas Data & Identitas Ruas:** Inkonsistensi penggunaan nama ruas jalan di masa lalu menimbulkan risiko salah sasaran intervensi (seperti ditemukannya fenomena *name collision swapping* pada ruas kembar di sistem terdahulu).

### 1.2 Visi & Nilai Produk
Membangun **Sistem Pendukung Keputusan Penanganan Jalan yang Otoritatif, Transparan, dan Dapat Disimulasikan secara Real-Time** yang menjawab 3 pertanyaan pokok kepemimpinan:
1. **Ruas jalan mana saja yang harus diprioritaskan untuk ditangani?**
2. **Mengapa ruas jalan tersebut berada pada peringkat prioritas tersebut?** (Dekomposisi transparan kontribusi 17 variabel normatif dan 4 kategori).
3. **Bagaimana urutan prioritas berubah ketika pimpinan mengubah bobot kebijakan?** (Simulasi slider hierarkis tanpa merusak model aktif atau baseline kebijakan).

> [!IMPORTANT]
> **Prinsip Produk Utama:**  
> Sistem ini adalah **Sistem Pendukung Keputusan (*Decision Support System*)**, **BUKAN Pengambil Keputusan Otonom (*Autonomous Decision Maker*)**. Rekomendasi peringkat yang dihasilkan berfungsi sebagai masukan teknokratis berdasar data bagi pengambil keputusan yang sah.

---

## 2. GOALS & NON-GOALS (MVP BOUNDARY)

### 2.1 Sasaran Produk MVP (In-Scope Goals)
1. **Manajemen Registri 350 Ruas Kanonikal:** Mengunci integritas identitas 350 ruas jalan menggunakan kunci kanonikal unik `road_key` (`HSS-KAB-001` s.d. `HSS-KAB-350`), nomor ruas resmi SK (`001` s.d. `350`), dan UUIDv5.
2. **Mesin Skoring Normatif 17 Variabel Deterministik:** Menghitung skor prioritas jalan secara transparan, eksak, dan matematis tanpa dependensi *black-box*.
3. **Model Pembobotan Hirarkis 2-Level:**
   - Level 1: 4 Bobot Kategori (Teknis Jalan, Aksesibilitas, Pelayanan Masyarakat, Spasial & Demografi) yang saling auto-balancing menjaga total 100%.
   - Level 2: Bobot Lokal Variabel di dalam tiap kategori yang saling auto-balancing menjaga total 100%.
   - Bobot Efektif Global terhitung otomatis ($\Omega_{k,i} = W_k \times w_{k,i}$).
4. **Dual Operating Modes (Mode Ganda):**
   - **Operational 2025 Mode (Default):** Memanfaatkan Otoritas Kondisi Jalan 2025 (`road_conditions_2025.csv`) untuk perencanaan APBD/DAK tahun berjalan.
   - **Baseline / Benchmark Mode (Audit):** Memanfaatkan baseline normatif survei 2024 untuk membandingkan keselarasan model terhadap label acuan historis (`label_top105`).
5. **Dekomposisi Penjelasan Skor (Explainability Engine):** Menyediakan rincian faktor per ruas: nilai mentah, nilai normalisasi, bobot lokal, bobot efektif, kontribusi nilai, subtotal kategori, dan skor akhir.
6. **Visualisasi Spasial Web GIS:** Menampilkan sebaran geometri 350 ruas jalan kabupaten pada peta digital dengan tematik gradasi warna prioritas, konteks kemantapan jalan, filter kecamatan, dan overlay fasilitas publik.
7. **Simulasi Skenario & Tata Kelola Versi Model:** Mendukung pembuatan model draf, simulasi pergeseran peringkat (*rank delta*), penyimpanan versi skenario, serta pengaktifan model resmi oleh pimpinan.

### 2.2 Batasan Eksplisit Non-Goals (Strictly Deferred Post-MVP)
Fitur-fitur berikut **SECARA EKSPLISIT DILUAR RUANG LINGKUP MVP**:
- ❌ **Machine Learning Prediction Engine:** Tidak ada pelatihan atau inferensi model ML (Random Forest, XGBoost, Neural Network) dalam kalkulasi skoring operasional MVP.
- ❌ **Analisis Standar Biaya (ASB) & Anggaran:** Tidak menghitung pagu indikatif, HPS, atau estimasi biaya penanganan berbasis item pekerjaan dalam MVP.
- ❌ **Optimasi Anggaran Multi-Objektif (Knapsack Solver):** Tidak ada optimasi pemotongan portofolio berbasis pagu anggaran belanja daerah.
- ❌ **Full Treatment Engine:** Tidak mengimplementasikan penentuan jenis penanganan preservasi vs rekonstruksi per segmen STA kecil.
- ❌ **Pemodelan Penurunan Kondisi (Pavement Deterioration Forecasting):** Tidak ada prediksi kurva degradasi struktural jalan lintas tahun.
- ❌ **Integrasi Eksternal SP4N-LAPOR & Aspirasi Musrenbang:** Penggabungan keluhan masyarakat dan usulan musrenbang ditunda ke Fase 2.
- ❌ **Aplikasi Mobile Survei Lapangan:** Tidak mencakup aplikasi mobile pencatatan kondisi SDI / survei lapangan.
- ❌ **Full Institutional Memory Knowledge Graph:** Fitur repositori dokumen historis pengadaan/kontrak masa lalu ditunda ke pengembangan lanjutan.

---

## 3. USER PERSONAS & ROLE-BASED ACCESS CONTROL (RBAC)

Sistem menetapkan 3 peran pengguna minimal tanpa kompleksitas birokrasi berlebih:

```
+---------------------------------------------------------------------------------------------------+
|                                     ROLE ACCESS MATRIX (RBAC)                                     |
+--------------------------------------+--------------------+-------------------+-------------------+
| Kemampuan / Hak Akses                | Decision-Maker     | Administrator     | Read-Only Viewer  |
|                                      | (Kabid / Kadis)    | (Data Manager)    | (Staf / Publik)   |
+--------------------------------------+--------------------+-------------------+-------------------+
| Melihat Daftar Peringkat Prioritas   | [x] Ya             | [x] Ya            | [x] Ya            |
| Melihat Peta Spasial & Detail Ruas   | [x] Ya             | [x] Ya            | [x] Ya            |
| Mengganti Mode (Operasional / Audit) | [x] Ya             | [x] Ya            | [x] Ya            |
| Melakukan Simulasi Slider Bobot      | [x] Ya (Simulasi)  | [x] Ya (Simulasi) | [ ] Tidak         |
| Menyimpan Model Draf (*Save Draft*)  | [x] Ya             | [x] Ya            | [ ] Tidak         |
| Mengesahkan/Mengaktifkan Model Resmi | [x] Ya (Otoritas)  | [ ] Tidak         | [ ] Tidak         |
| Mengimpor / Memperbarui Data Sumber  | [ ] Tidak          | [x] Ya (Otoritas) | [ ] Tidak         |
| Mengelola Akun Pengguna & Audit Log  | [ ] Tidak          | [x] Ya (Otoritas) | [ ] Tidak         |
| Mengekspor Hasil (CSV, Excel, GeoJSON)| [x] Ya            | [x] Ya            | [x] Ya            |
+--------------------------------------+--------------------+-------------------+-------------------+
```

### 3.1 Profil Pengguna
1. **Decision-Maker (Kepala Bidang Bina Marga / Kepala Dinas PUTR):**
   - *Tujuan:* Menelaah peringkat jalan usulan, menyimulasikan pembobotan kebijakan sesuai prioritas RPJMD/Renstra, dan menetapkan satu model resmi (*Active Model*) sebagai acuan penyusunan rencana kerja penanganan jalan.
2. **Administrator / Data Manager (Analis Jalan & Jembatan / Admin GIS):**
   - *Tujuan:* Menjaga kemutakhiran data kondisi jalan tahunan, mengelola crosswalk identitas ruas, memvalidasi geometri spasial, memantau integritas sistem, dan memelihara versi model draf.
3. **Read-Only Viewer (Perencana Bappelitbangda / Staf Teknis / Publik Terbatas):**
   - *Tujuan:* Mengakses hasil perangkingan prioritas resmi yang telah disahkan pimpinan, menelaah alasan penanganan melalui kartu dekomposisi ruas, dan mengunduh laporan PDF/Excel.

---

## 4. MODEL SPECIFICATION & GOVERNANCE RULES

### 4.1 Otoritas Bobot Kategori (Level 1)
Mengacu pada ketentuan otoritatif, bobot dasar 4 kategori ditetapkan sebagai berikut:
- **Data Teknis Jalan ($W_1$):** `0.378965` (Proporsi Baku: $37.8965\%$)
- **Data Aksesibilitas ($W_2$):** `0.283815` (Proporsi Baku: $28.3815\%$)
- **Data Pelayanan Masyarakat ($W_3$):** `0.192412` (Proporsi Baku: $19.2412\%$)
- **Data Spasial & Demografi ($W_4$):** `0.144807` (Proporsi Baku: $14.4807\%$)
- *Jumlah Mentah:* $0.378965 + 0.283815 + 0.192412 + 0.144807 = 0.999999$.
- *Kaidah Normalisasi Komputasi:*  
  Sistem **TIDAK MEMUTASI** angka dasar sumber, melainkan menerapkan normalisasi runtime dinamis:
  $$W_k^* = \frac{W_k}{\sum_{j=1}^4 W_j}$$
  Sehingga $\sum W_k^* \equiv 1.0000000000$ pada presisi mesin IEEE 754 tanpa distorsi pembagian.

### 4.2 Status Bobot Lokal Variabel (Level 2)
Berdasarkan hasil audit forensik, tidak ditemukan catatan historis koefisien bobot lokal tersendiri pada data warisan. Oleh karena itu:
- Pembagian bobot setara di dalam kategori resmi diberi label:  
  $$\mathbf{POLICY\_DEFAULT\_V1}\quad \text{atau} \quad \mathbf{NEUTRAL\_LOCAL\_WEIGHT\_DEFAULT}$$
- Bobot lokal default:
  * Kategori Teknis Jalan (7 variabel): masing-masing $w_{1,i} = 1/7 \approx 0.142857$
  * Kategori Aksesibilitas (3 variabel): masing-masing $w_{2,i} = 1/3 \approx 0.333333$
  * Kategori Pelayanan Masyarakat (4 variabel): masing-masing $w_{3,i} = 1/4 = 0.250000$
  * Kategori Spasial & Demografi (3 variabel): masing-masing $w_{4,i} = 1/3 \approx 0.333333$
- Bobot lokal ini berstatus sebagai nilai awal (*default seed*) yang dapat diubah dan disesuaikan oleh pengguna yang berwenang melalui slider interaktif.

### 4.3 Penetapan Variabel Pasar Tradisional
`norm_jarak_pasar_cost` dikunci secara definitif di bawah kategori **Data Pelayanan Masyarakat** (merefleksikan fungsi pasar sebagai fasilitas sosial pelayanan kebutuhan dasar masyarakat dalam Permen PUPR 19/2011).

### 4.4 Penanganan `label_top105`
`label_top105` diperlakukan murni sebagai **Tolok Ukur Acuan / Pembanding Historis (*Benchmark Reference Field*)**. Kolom ini **DILARANG KERAS** digunakan sebagai variabel input skoring operasional. Fungsinya murni sebagai visualisator tingkat keselarasan (*concordance rate*) antara model yang disimulasikan pengguna dengan portofolio historis masa lalu.

---

## 5. FUNCTIONAL REQUIREMENTS & ACCEPTANCE CRITERIA

### Modul 1: Manajemen Identitas & Registri Ruas Jalan (FR-ID)
* **FR-ID-01 (Kunci Utama Kanonikal):** Sistem wajib menggunakan `road_key` (format `HSS-KAB-NNN`) dan `road_id` (UUIDv5) sebagai satu-satunya identitas pengenal ruas di seluruh modul database, kalkulasi, dan URL antarmuka.
* **FR-ID-02 (Larangan Join Berbasis Nama):** Sistem dilarang keras melakukan operasi penggabungan (*join*), pemetaan (*mapping*), atau pemadanan data kondisi/spasial berbasis nama teks jalan semata.
* **FR-ID-03 (Penolakan Fuzzy Matching):** Impor data eksternal tidak boleh menggunakan algoritma pencocokan kemiripan string (*fuzzy string matching*). Data yang tidak cocok pada `road_key` atau tabel crosswalk resmi wajib ditolak dengan status `UNRESOLVED`.
* **FR-ID-04 (Disambiguasi Nama Tampilan):** Sistem wajib menampilkan nama ruas jalan yang telah disambiguasi secara geografis (`display_name`) untuk 3 pasang ruas kembar (Mawar, Musyawarah, Sekolah Islam).

### Modul 2: Mesin Skoring & Pembobotan Hirarkis (FR-SC)
* **FR-SC-01 (Dua Mode Operasi Terpisah):**
  - *Operational Mode (Default):* Menghitung nilai kerusakan (`norm_kondisi_sedang`, `norm_rusak_ringan`, `norm_rusak_berat`) secara dinamis dari persentase kerusakan kondisi resmi 2025 (`road_conditions_2025.csv`).
  - *Benchmark Mode:* Menggunakan nilai 17 variabel normatif statis dari `priority_baseline_normative_canonical.csv` untuk mereplikasi audit model dasar.
* **FR-SC-02 (Kalkulasi Bobot Efektif Terisolasi):**
  $$\Omega_{k,i} = W_k^* \times w_{k,i}$$
  Bobot efektif bersifat *read-only* dan tidak dapat diedit secara langsung oleh pengguna.
* **FR-SC-03 (Auto-Balancing Kategori Level 1):**
  Ketika pengguna menggeser slider kategori $m$ menjadi $W'_m$, seluruh kategori saudara ($j \neq m$) otomatis menyeimbangkan diri:
  $$W'_j = W_j \times \frac{1 - W'_m}{1 - W_m}$$
  Nilai bobot lokal anak ($w_{k,i}$) di seluruh cabang tidak boleh terdistorsi atau berubah.
* **FR-SC-04 (Auto-Balancing Variabel Level 2):**
  Ketika pengguna menggeser slider variabel $a$ di dalam kategori $m$ menjadi $w'_{m,a}$, variabel saudara di dalam kategori yang sama ($b \neq a$) otomatis menyeimbangkan diri:
  $$w'_{m,b} = w_{m,b} \times \frac{1 - w'_{m,a}}{1 - w_{m,a}}$$
  Bobot kategori induk $W_m$ dan variabel di kategori lain tidak boleh mengalami perubahan (tanpa kebocoran antar-cabang).
* **FR-SC-05 (Deterministic Tie-Breaking):**
  Jika dua ruas jalan menghasilkan skor akhir yang identik (selisih $< 10^{-6}$), sistem wajib memecahkan seri secara deterministik dengan aturan urutan:
  1. Persentase Kemantapan Jalan lebih rendah (urgensi kerusakan lebih tinggi diprioritaskan).
  2. Jumlah Penduduk Terlayani lebih tinggi.
  3. Nomor Ruas Resmi SK (`nomor_ruas`) secara urut menaik (*ascending*).

### Modul 3: Simulasi Skenario & Tata Kelola Model (FR-MOD)
* **FR-MOD-01 (Simulasi Non-Destruktif):** Modifikasi slider bobot pada layar simulasi wajib berjalan secara lokal dalam memori/draf sesi. Simulasi dilarang mengubah model aktif yang sedang berjalan sebelum pengguna menekan tombol simpan/aktifkan.
* **FR-MOD-02 (Proteksi Baseline Abadi):** Model acuan `Policy Default v1` bersifat *read-only* permanen dan terkunci (*LOCKED*), tidak dapat ditimpa (*overwrite*) atau dihapus (*delete*).
* **FR-MOD-03 (Pelacakan Delta Simulasi):** Layar simulasi wajib menyajikan perbandingan *side-by-side* secara *real-time*:
  - Peringkat Aktif vs Peringkat Simulasi.
  - Pergeseran Peringkat ($\Delta \text{Rank} = \text{Rank}_{\text{active}} - \text{Rank}_{\text{sim}}$).
  - Selisih Skor ($\Delta \text{Score} = \text{Score}_{\text{sim}} - \text{Score}_{\text{active}}$).
  - Persentase keselarasan terhadap Top-105.
* **FR-MOD-04 (Audit Trail Aktivasi):** Saat Decision-Maker mengesahkan model baru, sistem wajib merekam: `model_id`, `version_number`, `created_by`, `activated_by`, `activated_at`, konfigurasi bobot lengkap, serta catatan justifikasi kebijakan (*rationale note*).

### Modul 4: Antarmuka Web GIS & Visualisasi Spasial (FR-GIS)
* **FR-GIS-01 (Render Geometri Kanonikal):** Peta memuat 350 fitur linestring ruas jalan kabupaten dari `roads_county.geojson` menggunakan relasi `road_key`.
* **FR-GIS-02 (Pewarnaan Tematik Berbasis Prioritas):** Ruas jalan diwarnai secara gradasi berdasarkan kuantil peringkat prioritas (misal: Tier 1 Top-35 Merah Tua, Tier 2 36-70 Oranye, Tier 3 71-105 Kuning, dan Netral Abu-abu/Biru).
* **FR-GIS-03 (Isolasi Konektor Jembatan Sintetis):** Geometri `network_connectors.geojson` (4 jembatan penghubung topologi rawa/sungai) dilarang keras dirender sebagai kandidat ruas jalan penanganan.
* **FR-GIS-04 (Interaktivitas Peta-ke-Detail):** Mengklik ruas jalan pada peta wajib membuka kartu info ringkas dan menyediakan navigasi langsung ke layar Detail Ruas Jalan.
* **FR-GIS-05 (Filter Wilayah Spasial):** Peta mendukung filter batas kecamatan dan pencarian cepat berdasarkan nama ruas/nomor ruas.

---

## 6. USER EXPERIENCE & SCREEN ARCHITECTURE (9 MVP SCREENS)

```
                                    +-----------------------+
                                    |     1. DASHBOARD      |
                                    +-----------+-----------+
                                                |
         +--------------------+-----------------+--------------------+--------------------+
         |                    |                                      |                    |
         v                    v                                      v                    v
+-----------------+  +-----------------+                    +-----------------+  +-----------------+
| 2. PRIORITY     |  | 3. MAP VIEW     |                    | 5. MODEL CONFIG |  | 8. DATA SOURCE  |
|    RANKING LIST |  |    (WEB GIS)    |                    |    & SIMULATION |  |    PROVENANCE   |
+--------+--------+  +--------+--------+                    +--------+--------+  +-----------------+
         |                    |                                      |                    |
         +----------+---------+                                      v                    v
                    |                                       +-----------------+  +-----------------+
                    v                                       | 6. SCENARIO     |  | 9. MINIMAL      |
         +--------------------+                             |    COMPARISON   |  |    ADMIN / AUDIT|
         | 4. ROAD DETAIL     |                             +--------+--------+  +-----------------+
         |    (EXPLAINABILITY)|                                      |
         +--------------------+                             +--------v--------+
                                                            | 7. MODEL        |
                                                            |    VERSIONS     |
                                                            +-----------------+
```

Daftar 9 layar MVP yang wajib dibangun:
1. **Layar 1: Dashboard Eksekutif:** Menampilkan KPI ringkasan jaringan (350 ruas, 732.46 km), agregat kemantapan jalan resmi 2025, model prioritas yang sedang aktif, sebaran prioritas per kecamatan, dan tautan aksi cepat.
2. **Layar 2: Road Priority Ranking (Tabel Peringkat Prioritas):** Tabel interaktif berisi 350 ruas terurut peringkat 1 s.d. 350 dengan informasi nomor ruas, nama tampilan, kecamatan, panjang, kemantapan, skor komposit, serta tombol aksi inspeksi.
3. **Layar 3: Map View (Peta Spasial Web GIS):** Peta interaktif Leaflet/MapLibre menampilkan linestring ruas jalan dengan pewarnaan gradasi prioritas, filter kecamatan, toggle overlay fasilitas umum (RSUD, Puskesmas, Sekolah, Pasar), dan popup ringkasan ruas.
4. **Layar 4: Road Detail (Kartu Transparansi & Explainability):** Layar kunci transparansi yang membedah perhitungan skor satu ruas jalan secara lengkap: nilai mentah, nilai normalisasi, bobot lokal, bobot efektif, kontribusi nilai, subtotal kategori, serta histori kemantapan tahunan.
5. **Layar 5: Model Configuration & Slider Sandbox:** Antarmuka interaktif slider hierarkis Level 1 (Kategori) dan Level 2 (Variabel) yang dilengkapi auto-balancing instan untuk menyusun draf skenario baru.
6. **Layar 6: Scenario / Simulation Comparison:** Layar komparasi *side-by-side* antara Model Aktif vs Model Simulasi, menyoroti pergeseran peringkat (*rank delta*), ruas yang naik/turun drastis, dan tingkat kesesuaian Top-105.
7. **Layar 7: Model Versions & Activation:** Repositori riwayat versi model (Baseline Normatif v1, Draf Pengguna, Model Aktif, Model Arsip) dengan metadata pembuat, tanggal aktivasi, catatan kebijakan, dan tombol aktivasi bagi pimpinan yang berwenang.
8. **Layar 8: Data Source & Provenance Status:** Panel audit transparansi data yang menampilkan status ketersediaan ke-17 variabel, sumber otoritatif berkas fisik, cap waktu pembaruan, dan status integritas kriptografis berkas.
9. **Layar 9: Minimal Admin & Import Log:** Layar kelola data untuk Administrator yang memvalidasi berkas unggahan baru, menampilkan laporan verifikasi crosswalk, serta riwayat log audit sistem.

---

## 7. KRITERIA KEBERHASILAN (SUCCESS CRITERIA)

| Metrik Evaluasi | Target Kinerja MVP | Metode Verifikasi |
|---|---|---|
| **Latensi Kalkulasi Skoring** | $< 50\text{ milidetik}$ untuk 350 ruas | Uji performa pembaruan peringkat saat slider digeser secara kontinu |
| **Presisi Matematis** | $100\%$ reproduktifitas skor ($\Delta < 10^{-6}$) | Pengujian unit antara nilai skor tabel dengan penjumlahan manual displayed factors |
| **Integritas Relasi Ruas** | $0$ error pemetaan ($350/350$ konsisten) | Peta GIS, tabel peringkat, dan kartu detail merujuk pada `road_key` yang sama persis |
| **Keamanan Model Aktif** | $0$ kebocoran perubahan draf ke model aktif | Simulasi pengguna tanpa hak tidak mengubah tabel peringkat pengguna publik |
| **Tingkat Adopsi Keputusan** | $\ge 80\%$ keselarasan rencana kerja dinas | Dokumen usulan penanganan APBD 2026 mengacu pada peringkat model aktif sistem |

---
*Dokumen PRD MVP v1 ini disahkan sebagai batas acuan implementasi rekayasa perangkat lunak Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan.*
