# SCREEN & USER FLOW SPECIFICATION v1
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan

**Dokumen Spesifikasi Desain Antarmuka, Layar MVP, & Alur Pengguna**  
**Versi:** 1.0.0 (MVP Release)  
**Status:** Frozen for Implementation  
**Orkestrator Arsitektur:** Antigravity  
**Tanggal:** 12 September 2026  
**Governing Documents:**
- [`reports/PRD_MVP_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/PRD_MVP_V1.md)
- [`reports/APPLICATION_ARCHITECTURE_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/APPLICATION_ARCHITECTURE_V1.md)
- [`reports/SCORING_ENGINE_CONTRACT_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/SCORING_ENGINE_CONTRACT_V1.md)

---

## 1. USER INTERFACE TAXONOMY & GLOBAL NAVIGATION

Antarmuka aplikasi dirancang dengan tata letak navigasi samping (*sidebar navigation*) yang intuitif, profesional, dan responsif:

```
+---------------------------------------------------------------------------------------------------------+
| [LOGO PUTR] SISTEM PENDUKUNG PRIORITAS PENANGANAN JALAN KABUPATEN HSS               [User: Kabid BM v]   |
+-------------------+-------------------------------------------------------------------------------------+
| [NAVIGASI UTAMA]  | [MODE BADGE: OPERATIONAL 2025 (ACTIVE)]                    [Model: Baseline v1]      |
|                   +-------------------------------------------------------------------------------------+
| > 1. Dashboard    |                                                                                     |
|   2. Prioritas    |                                                                                     |
|   3. Peta Spasial |                                                                                     |
|   4. Detail Ruas  |                                   KONTEN UTAMA HALAMAN                              |
|   5. Konfigurasi  |                                                                                     |
|   6. Simulasi     |                                                                                     |
|   7. Versi Model  |                                                                                     |
|   8. Data Source  |                                                                                     |
|   9. Administrasi |                                                                                     |
+-------------------+-------------------------------------------------------------------------------------+
| Versi: MVP 1.0.0  | Status Server: Online | Integritas Data: 350/350 Verified                           |
+-------------------+-------------------------------------------------------------------------------------+
```

---

## 2. DETAILED SCREEN SPECIFICATIONS (9 MVP SCREENS)

### Layar 1: Dashboard Eksekutif
* **Tujuan:** Memberikan gambaran strategis menyeluruh mengenai portofolio jalan kabupaten, kemantapan kondisi terkini, dan profil prioritas penanganan.
* **Pengguna Utama:** Decision-Maker (Kadis/Kabid), Perencana Bappelitbangda.
* **Informasi Kunci:**
  - 4 Kartu Metrik Utama (KPI): Total Ruas (350 ruas), Total Panjang Jaringan (732.46 km), Tingkat Kemantapan (53.64% Mantap / 46.36% Tidak Mantap), Model Aktif Saat Ini.
  - Peta Ringkas Sebaran Ruas Prioritas (Top-35 koridor darurat).
  - Grafik Batang Distribusi Kemantapan per Kecamatan (11 kecamatan).
  - Tabel Ringkas Top-10 Ruas Prioritas Utama dengan skor dan tombol telusur.
* **Aksi Pengguna:**
  - Beralih Mode (Operational 2025 vs Benchmark 2024).
  - Mengklik baris ruas untuk melompat ke Layar 4 (Road Detail).
  - Tombol aksi cepat: "Mulai Simulasi Pembobotan" $\to$ Layar 5.
* **Filter:** Filter Kecamatan, Filter Status Kemantapan (Mantap / Tidak Mantap).
* **State Penting:**
  - *Operational State (Default):* Menampilkan metrik kondisi resmi 2025.
  - *Benchmark State:* Menampilkan penanda visual khusus (*yellow banner*) bahwa data yang ditampilkan adalah data acuan kalibrasi historis.

---

### Layar 2: Road Priority Ranking (Tabel Peringkat Prioritas)
* **Tujuan:** Menyajikan daftar lengkap 350 ruas jalan yang terurut berdasarkan skor prioritas hasil perhitungan mesin normatif.
* **Pengguna Utama:** Seluruh peran (Decision-Maker, Administrator, Read-Only Viewer).
* **Informasi Kunci:**
  - Tabel 350 baris dengan kolom:
    1. Peringkat (`priority_rank`, 1 s.d. 350)
    2. Kunci Ruas (`road_key`, format `HSS-KAB-NNN`)
    3. Nomor Ruas (`nomor_ruas`, SK resmi PU)
    4. Nama Tampilan (`display_name`, nama terdisambiguasi)
    5. Kecamatan (`district_name`)
    6. Panjang Resmi (`length_km_official`)
    7. Status Kemantapan (% Mantap & Indikator Warna: Hijau/Kuning/Merah)
    8. Skor Akhir Prioritas (`final_score`, 4 desimal)
    9. Status Tier (Badge: Top-35, Top-70, Top-105, Reguler)
    10. Aksi (Ikon Mata $\to$ Buka Detail Transparansi)
* **Aksi Pengguna:**
  - Pencarian cepat teks (berdasarkan nama atau nomor ruas).
  - Ekspor data tabel ke format Excel (.xlsx), CSV, atau GeoJSON.
  - Pengurutan dinamis kolom (panjang, kemantapan, skor).
* **Filter:** Kecamatan, Tier Prioritas (Top-35, Top-70, Top-105), Rentang Skor, Status Kemantapan.
* **Empty/Error State:** Jika pencarian tidak menemukan hasil, tampilkan pesan: *"Tidak ada ruas jalan yang cocok dengan kriteria filter."*

---

### Layar 3: Map View (Peta Spasial Web GIS)
* **Tujuan:** Memvisualisasikan sebaran spasial 350 ruas jalan di atas peta dasar Kabupaten Hulu Sungai Selatan dengan konteks spasial dan fasilitas umum.
* **Pengguna Utama:** Decision-Maker, Staf Teknis Bina Marga, Administrator GIS.
* **Informasi Kunci:**
  - Kanvas Peta Leaflet/MapLibre interaktif (pan, zoom, reset view).
  - 350 Linestring Ruas Jalan Kabupaten dengan pewarnaan tematik berdasarkan kuantil prioritas:
    * Merah Pekat: Peringkat 1–35 (Prioritas Sangat Tinggi / Darurat)
    * Oranye: Peringkat 36–70 (Prioritas Tinggi)
    * Kuning: Peringkat 71–105 (Prioritas Menengah)
    * Abu-abu Terang: Peringkat 106–350 (Prioritas Rendah / Pemeliharaan Rutin)
  - Layer Titik Fasilitas Publik (Toggle on/off): RSUD (2), Puskesmas (21), Sekolah (251), Pasar (11).
  - Batas Administrasi Kecamatan (11 kecamatan poligon batas tipis).
* **Aksi Pengguna:**
  - Mengklik linestring jalan: Membuka popup ringkasan (Nama Ruas, Nomor SK, Peringkat, Kemantapan %, Skor Komposit, tombol "Buka Detail Lengkap").
  - Hover linestring: Menyorot ruas (*highlight thickness*) dan menampilkan tooltip nama ruas.
* **Aturan Khusus:** Layer konektor sintetis (`network_connectors.geojson`) **DILARANG KERAS** ditampilkan sebagai kandidat ruas penanganan.

---

### Layar 4: Road Detail (Kartu Transparansi & Explainability)
* **Tujuan:** Menyajikan dekomposisi transparan perhitungan skor satu ruas jalan agar keputusan teknokratis dapat dipertanggungjawabkan dan ditelaah secara matematis.
* **Pengguna Utama:** Seluruh peran (terutama saat sesi pembahasan musrenbang/auditor).
* **Informasi Kunci:**
  - Header Ruas: Kunci Ruas (`road_key`), Nomor SK, Nama Resmi, Nama Tampilan, Wilayah Kecamatan, Desa Terlintasi, Panjang ($L$), Lebar ($W$).
  - Ringkasan Skor: Peringkat Ruas, Skor Akhir Komposit, Nilai Subtotal 4 Kategori.
  - **Tabel Dekomposisi 17 Faktor:**
    * Kolom 1: Kategori & Nama Variabel (17 baris lengkap)
    * Kolom 2: Nilai Mentah Observasi ($X_{\text{raw}}$ beserta satuannya: km, m, jiwa, rasio)
    * Kolom 3: Arah Optimasi (BENEFIT atau COST)
    * Kolom 4: Nilai Normalisasi ($X_{\text{norm}} \in [0.0, 1.0]$)
    * Kolom 5: Bobot Kategori ($W_k^*$)
    * Kolom 6: Bobot Lokal ($w_{k, i}$)
    * Kolom 7: Bobot Efektif ($\Omega_{k, i} = W_k^* \times w_{k, i}$)
    * Kolom 8: Kontribusi Nilai Skor ($C_{k, i} = \Omega_{k, i} \times X_{\text{norm}}$)
  - Kartu Kondisi Fisik 2025: Rincian km & % Kondisi Baik, Sedang, Rusak Ringan, Rusak Berat, Kemantapan.
  - Peta Spasial Mini: Menampilkan segmen ruas yang bersangkutan diapit oleh fasilitas terdekat.
* **Aksi Pengguna:** Tombol Cetak Lembar Penjelasan (Print PDF Card), Tombol Navigasi ke Ruas Sebelumnya/Berikutnya.

---

### Layar 5: Model Configuration & Slider Sandbox
* **Tujuan:** Menyediakan lingkungan simulasi interaktif bagi pengambil keputusan untuk mengeksplorasi skenario pembobotan baru melalui slider hierarkis tanpa merusak model aktif.
* **Pengguna Utama:** Decision-Maker (Kabid/Kadis), Administrator.
* **Informasi Kunci:**
  - Panel Kontrol Hirarkis Level 1 (Bobot Kategori):
    * 4 Slider Kategori: Teknis Jalan, Aksesibilitas, Pelayanan Masyarakat, Spasial & Demografi.
    * Tampilan Nilai Mentah ($W_k$) dan Persentase Proporsional ($W_k^*$).
    * Indikator Total Bobot Kategori: Wajib hijau $100.00\%$ (Auto-balancing aktif).
  - Panel Kontrol Hirarkis Level 2 (Bobot Lokal Anak di dalam Kategori):
    * Accordion 4 Kategori yang dapat diperluas.
    * Slider Variabel Lokal ($w_{k, i}$) dengan auto-balancing internal cabang.
    * Indikator Subtotal Anak: Wajib hijau $100.00\%$.
    * Kolom Nilai Terhitung Bobot Efektif Global ($\Omega_{k, i}$, Read-Only).
* **Aksi Pengguna:**
  - Menggeser slider (memicu kalkulasi reaktif instan $< 10\text{ ms}$).
  - Toggle Lock pada slider tertentu untuk membekukan nilai saat slider lain digeser.
  - Tombol "Reset ke Model Aktif" / "Reset ke Baseline v1".
  - Tombol "Bandingkan Skenario" $\to$ Layar 6.
  - Tombol "Simpan sebagai Draf Baru" (memunculkan modal input nama & deskripsi).

---

### Layar 6: Scenario / Simulation Comparison
* **Tujuan:** Menyajikan perbandingan *head-to-head* antara Model Aktif yang sedang berlaku dengan Model Draf Hasil Simulasi.
* **Pengguna Utama:** Decision-Maker (Kabid/Kadis).
* **Informasi Kunci:**
  - Kartu Ringkasan Komparasi:
    * Bobot Kategori Aktif vs Simulasi.
    * Tingkat Keselarasan Top-105 (Model Aktif vs Simulasi).
    * Jumlah Ruas yang Mengalami Pergeseran Peringkat ($\Delta\text{Rank} \neq 0$).
  - Daftar Ruas dengan Perubahan Peringkat Terbesar:
    * Top 5 Ruas Mengalami Peningkatan Peringkat Tertinggi (Paling diuntungkan oleh kebijakan baru).
    * Top 5 Ruas Mengalami Penurunan Peringkat Terdalam.
  - Tabel Perbandingan Lengkap 350 Ruas dengan kolom: Nama Ruas, Peringkat Aktif, Peringkat Simulasi, $\Delta\text{Rank}$ (badge hijau positif naik / merah negatif turun), Skor Aktif, Skor Simulasi, $\Delta\text{Score}$.
* **Aksi Pengguna:**
  - Filter hanya ruas yang posisinya berubah ($\Delta\text{Rank} \neq 0$).
  - Filter ruas yang keluar/masuk tier Top-105.
  - Tombol "Lanjutkan ke Pengesahan/Aktivasi" $\to$ Layar 7.

---

### Layar 7: Model Versions & Activation
* **Tujuan:** Mengelola repositori seluruh versi model prioritas, melacak histori kebijakan, dan menyediakan antarmuka pengesahan model resmi oleh pimpinan.
* **Pengguna Utama:** Decision-Maker (Otoritas Aktivasi), Administrator (Pemeliharaan).
* **Informasi Kunci:**
  - Daftar Kartu Versi Model:
    1. `Policy Default v1` (Badge: BASELINE_LOCKED, Read-Only, Pembuat: Sistem/Diklat PIM)
    2. `Model Aktif 2025/2026` (Badge: ACTIVE, Tanggal Disahkan, Nama Pejabat Pengesah)
    3. Daftar Model Draf (Badge: DRAFT, Nama Draf, Tanggal Dibuat, Pembuat)
    4. Daftar Model Arsip (Badge: ARCHIVED, Riwayat Model Terdahulu)
  - Detail Konfigurasi Bobot saat kartu model diklik.
* **Aksi Pengguna:**
  - Decision-Maker: Tombol "Aktifkan Model Ini" (Membuka dialog konfirmasi formal yang mewajibkan pengisian catatan pertimbangan kebijakan / *rationale note*).
  - Menggandakan model (*Clone to Draft*) untuk bahan eksperimen baru.
  - Menghapus model berstatus DRAFT (Model BASELINE dan ACTIVE tidak dapat dihapus).

---

### Layar 8: Data Source & Provenance Status
* **Tujuan:** Menyediakan transparansi audit teknokratis mengenai asal-usul, integritas berkas, dan metodologi data dasar yang dikonsumsi oleh aplikasi.
* **Pengguna Utama:** Seluruh peran (Auditor Inspektorat, Analis Data).
* **Informasi Kunci:**
  - Status 350 Ruas Kanonikal: 100% Valid, UUIDv5 Terverifikasi.
  - Status Otoritas Kondisi 2025: Terverifikasi identik terhadap `Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx` (732.460 km).
  - Matriks Status Ketersediaan 17 Variabel (Tabel Provenance):
    * READY (5 variabel: panjang, desa, kecamatan, jalan provinsi, jalan nasional)
    * DERIVABLE (11 variabel: lebar, 3 kondisi, 2 perkerasan, penduduk, 4 fasilitas)
    * METHOD_UNCONFIRMED / DIKLAT POLICY LOCKED (status konfirmasi)
  - Status Integritas Berkas Fisik: SHA-256 Checksum 81 berkas bundle (Semua Matched).
* **Aksi Pengguna:** Tombol "Jalankan Pemeriksaan Ulang Integritas Data" (*Run Health-Check*).

---

### Layar 9: Minimal Admin & Import Log
* **Tujuan:** Antarmuka khusus Administrator untuk memantau integritas crosswalk identitas, memeriksa riwayat log impor, dan mengelola akun pengguna sistem.
* **Pengguna Utama:** Administrator / Data Manager.
* **Informasi Kunci:**
  - Tabel Penelusuran Crosswalk: Pencarian ID lama lintas 4 sistem sumber untuk memastikan tidak ada ruas yang berstatus `UNRESOLVED`.
  - Log Impor Data: Riwayat pembacaan berkas Excel/GeoJSON dengan stempel waktu dan jumlah baris terproses.
  - Manajemen Pengguna Sederhana: Daftar akun dengan peran (Decision-Maker, Admin, Viewer).
* **Aksi Pengguna:** Tambah/Edit Pengguna, Ekspor Log Audit Sistem.

---

## 3. CONCRETE USER FLOW SPECIFICATIONS

### Alur 1: Menginspeksi Peringkat & Memahami Skor Suatu Ruas Jalan
```
[Pengguna Buka Layar 2: Ranking] 
       |
       v
[Melihat Ruas Peringkat 1: "Jl. Pangeran Antasari - Loklua" (Skor 0.6552)]
       |
       v
[Klik Ikon "Detail Transparansi" pada baris ruas]
       |
       v
[Sistem Membuka Layar 4: Road Detail]
       |
       v
[Pengguna Melihat Dekomposisi 17 Faktor]:
 - Panjang 1.80 km (norm: 0.1021) x Eff W: 5.41% -> Kontribusi: +0.0055
 - Rusak Berat 65% (norm: 0.6500) x Eff W: 5.41% -> Kontribusi: +0.0352
 - Jarak RSUD 450 m (norm: 0.9850) x Eff W: 4.81% -> Kontribusi: +0.0474
 - Subtotal Teknis: 0.1820 | Akses: 0.2100 | Pelayanan: 0.1550 | Spasial: 0.1082
 - Total Skor Akhir: 0.6552 (Peringkat 1 dari 350)
       |
       v
[Pengguna Memahami Mengapa Ruas Tersebut Prioritas 1 Tanpa Ragu]
```

### Alur 2: Simulasi Pembobotan Kebijakan oleh Decision-Maker
```
[Kabid Buka Layar 5: Model Config]
       |
       v
[Kabid Ingin Menekankan Aspek Pelayanan Masyarakat (Kesehatan & Pendidikan)]
       |
       v
[Kabid Menggeser Slider Kategori Pelayanan Masyarakat: dari 19.24% naik ke 30.00%]
       |
       v
[Sistem Otomatis Menyeimbangkan Sibling Kategori Lain Secara Proporsional]:
 - Teknis Jalan turun: 37.90% -> 32.85%
 - Aksesibilitas turun: 28.38% -> 24.60%
 - Spasial Demografi turun: 14.48% -> 12.55%
 - Total Kategori Tetap Tepat: 100.00%
 - Bobot Lokal Anak di Dalam Cabang: TETAP TIDAK BERUBAH
       |
       v
[Mesin Skoring Reaktif Klien Menghitung Ulang 350 Ruas dalam 6 ms]
       |
       v
[Kabid Membuka Layar 6: Komparasi Skenario]:
 - Melihat ruas "Menuju RSUD Daha Sejahtera" melompat naik dari Peringkat 42 ke Peringkat 18 (+24)
 - Melihat ruas pelosok tanpa fasilitas turun peringkat secara proporsional
       |
       v
[Kabid Puas dengan Hasil Simulasi, Mengklik "Simpan sebagai Draf: Renstra Kesehatan 2026"]
```

### Alur 3: Pengesahan & Aktivasi Model Resmi
```
[Kepala Dinas / Kabid Membuka Layar 7: Model Versions]
       |
       v
[Memilih Draf: "Renstra Kesehatan 2026"]
       |
       v
[Klik Tombol "Aktifkan Sebagai Model Resmi"]
       |
       v
[Muncul Dialog Konfirmasi Otoritas]:
 - Meminta input catatan kebijakan: "Penyesuaian prioritas DAK 2026 untuk mendukung SPM Kesehatan & RSUD Baru"
       |
       v
[Pengguna Menekan "Konfirmasi Pengesahan"]
       |
       v
[Backend Memvalidasi Hak Akses & Mengunci Status ACTIVE]:
 - Model lama beralih status ke ARCHIVED
 - Model baru resmi menjadi ACTIVE
 - Log audit aktivasi tercatat permanen
       |
       v
[Seluruh Layar Publik & Dashboard Otomatis Memuat Hasil Peringkat Model Baru]
```

---
*Dokumen Spesifikasi Layar & Alur Pengguna v1 ini dibekukan sebagai acuan desain antarmuka dan interaksi pengguna Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan.*
