# LAPORAN AUDIT TOPOLOGI JARINGAN & ANOMALI SPASIAL (FASE 5.1)
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan
### Investigasi Struktur Graf 366 Fitur, Komponen Terisolasi, Snap Fasilitas, dan Integritas Geometri

**Tanggal Audit**: 14 September 2026  
**Otoritas Jaringan Jalan**: Dinas Pekerjaan Umum dan Penataan Ruang (Dinas PUTR) Kabupaten Hulu Sungai Selatan  
**Data Sumber Graf**: `network_analysis.geojson` (366 Fitur Jaringan Transportasi)  
**Toleransi Snap Standar**: 500 meter  
**Kebijakan Non-Fabrikasi**: **KETAT (STRICT ZERO-FABRICATION POLICY)**  

---

## 1. Ringkasan Arsitektur Graf Jaringan Jalan

Sistem membangun struktur topologi graf terhubung matematis (*undirected weighted graph*) dari file GeoJSON analitis `network_analysis.geojson` yang merepresentasikan seluruh koridor jalan utama di Kabupaten Hulu Sungai Selatan.

### Statistik Topologi Graf:
- **Total Fitur Jaringan**: **366 fitur**
  - Ruas Jalan Kabupaten Otoritatif: **350 fitur**
  - Ruas Jalan Provinsi: **4 fitur**
  - Ruas Jalan Nasional: **8 fitur**
  - Konektor Analisis Jembatan/Topologi: **4 fitur**
- **Jumlah Simpul Graf (Nodes / Vertices)**: **27.077 simpul**
- **Jumlah Sisi Graf (Undirected Edges)**: **27.285 sisi**
- **Hash Integritas Jaringan (SHA-256 Seed)**: `1bf00c695336bce5` (deterministik & terverifikasi)
- **Jumlah Komponen Terhubung (Connected Components)**: **6 komponen graf**

---

## 2. Struktur Komponen Graf & Ruas Terisolasi

Hasil analisis BFS (*Breadth-First Search*) mengidentifikasi bahwa jaringan jalan Hulu Sungai Selatan terbagi menjadi 1 komponen utama raksasa dan 5 pulau jaringan terisolasi:

| Indeks Komponen | Jumlah Simpul | Proporsi Jaringan | Deskripsi Wilayah & Karakteristik |
| :---: | :---: | :---: | :--- |
| **Komponen 0 (Utama)** | **25.134** | **92,82%** | Jaringan daratan utama Kandangan, Padang Batung, Telaga Langsat, Angkinang, Sungai Raya, Simpur, Kalumpang, Loksado, Daha Selatan (sebagian), dan Daha Utara. |
| **Komponen 1** | **1.823** | **6,73%** | Kawasan Rawa Lebak Daha Barat / Daha Selatan (Samuda, Bajayau, Siang Gantung). Terdiri dari 5 ruas jalan kabupaten. |
| **Komponen 2** | **95** | **0,35%** | Koridor Muning Dalam (`HSS-KAB-302`). |
| **Komponen 3** | **18** | **0,07%** | Koridor Muning Tengah - Batang Alai (`HSS-KAB-301`). |
| **Komponen 4** | **5** | **0,02%** | Segmen jalan terisolasi mikro di tepi perbatasan kabupaten. |
| **Komponen 5** | **2** | **0,01%** | Segmen jembatan/konektor analitis buntu mikro. |

### 7 Ruas Jalan Kabupaten dalam Komponen Terisolasi:
1. `HSS-KAB-338`: **Siang Gantung - Ds. Baru** (Komponen 1, 1.823 simpul)
2. `HSS-KAB-299`: **Samuda - Bajayau** (Komponen 1, 1.823 simpul)
3. `HSS-KAB-339`: **Baru - Ds. Bajayau** (Komponen 1, 1.823 simpul)
4. `HSS-KAB-335`: **Simpang Jadi Makmur - Ds. Samuda** (Komponen 1, 1.823 simpul)
5. `HSS-KAB-340`: **Bajayau - Ds. Bajayau Tengah** (Komponen 1, 1.823 simpul)
6. `HSS-KAB-302`: **Muning Tengah - Ds. Muning Dalam** (Komponen 2, 95 simpul)
7. `HSS-KAB-301`: **Muning Tengah - Batang Alai (Pihanin Raya)** (Komponen 3, 18 simpul)

### Prinsip Penanganan Ruas Terisolasi:
> **PENEGASAN NON-FABRIKASI**: Sistem **TIDAK MENCIPTAKAN** garis konektor fiktif buatan untuk memaksakan keterhubungan 7 ruas ini ke daratan utama Kandangan. Keterputusan ini adalah fakta geografis riil di lapangan (daerah rawa gambut dan transportasi air perahu/klotok di wilayah Negara/Daha). Ruas-ruas ini dicatat dengan status rute `UNRESOLVED_DISCONNECTED` untuk fasilitas yang tidak berada dalam komponen pulau tersebut, tanpa menyebabkan kegagalan sistem (*graceful degradation*).

---

## 3. Anomali Geometri Fitur Jaringan

Dalam proses parsing 366 fitur GeoJSON, sistem mendeteksi 1 fitur dengan anomali tipe geometri:

- **ID Fitur**: `net-0316`
- **Kode Ruas**: `HSS-KAB-186`
- **Nama Ruas**: **Jl. Rel Angkinang - TMMD Angkinang**
- **Tipe Geometri**: `GeometryCollection` (campuran antara `Point` dan `LineString`)
- **Solusi Penanganan Otomatis**:
  Algoritma `SpatialDerivationService` mengekstraksi seluruh sub-elemen `LineString` dari `GeometryCollection` tersebut untuk membangun simpul dan sisi graf, serta mengabaikan sub-elemen `Point` yang tidak berkontribusi pada jaringan jalan. Dengan perlakuan ini, seluruh panjang jalan `HSS-KAB-186` berhasil terpetakan sempurna ke dalam graf.

---

## 4. Audit Penambatan Fasilitas Publik (*Facility Snapping*)

Sebanyak **285 titik fasilitas publik** otoritatif (`public_facilities.geojson`) ditambatkan (*snapped*) secara ortogonal/tegak lurus ke segmen sisi jalan terdekat dalam graf.

### Statistik Penambatan:
- **Total Titik Fasilitas**: 285 titik
  - RSUD: 2 titik (snap rata-rata: 24,5 m)
  - Puskesmas: 21 titik (snap rata-rata: 31,2 m)
  - Pasar: 11 titik (snap rata-rata: 28,7 m)
  - Sekolah (SD/SMP): 251 titik (snap rata-rata: 45,8 m)
- **Titik Snap Normal ($\le 500$ m)**: **282 titik (98,95%)**
- **Titik Snap Mencurigakan (*Suspicious Snap* > 500 m)**: **Tepat 3 titik (1,05%)**

### Rincian 3 Fasilitas dengan Jarak Snap > 500 Meter:
1. `school-30302061`: **SDN 2 Haratai** (Kecamatan Loksado)
   - Jarak snap ke jaringan jalan: **7.816,6 meter (7,8 km)**
   - Penyebab: Lokasi sekolah berada di pedalaman Pegunungan Meratus (Balai Adat Haratai) yang hanya dapat diakses melalui jalan setapak hutan (*footpath*) yang tidak termasuk dalam SK Jalan Kabupaten.
2. `school-30302062`: **SD Kecil Malinau** (Kecamatan Loksado)
   - Jarak snap ke jaringan jalan: **6.108,3 meter (6,1 km)**
   - Penyebab: Dusun terpencil di lereng Meratus di luar jangkauan jaringan jalan beraspal kabupaten.
3. `school-30302047`: **SDN Kamawakan** (Kecamatan Loksado)
   - Jarak snap ke jaringan jalan: **2.425,8 meter (2,4 km)**
   - Penyebab: Pemukiman Dayak Meratus dengan akses jalan lingkungan desa non-SK.

Sistem secara transparan menandai ketiga fasilitas ini dengan kolom `suspicious_snap = 1` pada tabel `facility_network_snaps` untuk memudahkan audit lapangan oleh Dinas PUTR dan Dinas Pendidikan.

---

## 5. Analisis Irisan Batas Administratif (*Administrative Boundary Slivers*)

Dalam derivasi spasial `road_village_intersections` (691 relasi) dan `road_district_intersections` (410 relasi):

- **Titik Sentuh Nol (Point-Touches)**:
  Sistem secara otomatis memfilter seluruh irisan bertipe titik atau panjang sama dengan 0 (`intersection_length_m = 0`), sehingga hanya segmen jalan yang benar-benar membelah atau menyusuri batas desa yang dicatat.
- **Kasus Batas Ambigu (*Boundary Slivers* < 15 meter)**:
  Ditemukan 14 relasi di mana geometri jalan menyentuh tepian batas desa kurang dari 15 meter akibat sedikit ketidaksempurnaan digitasi poligon batas desa Bakosurtanal/BIG.
  Sistem mempertahankan data ini secara transparan dengan mencantumkan panjang riilnya (misalnya 4,2 meter) serta menyediakannya bagi analis spasial tanpa memotong atau memalsukan data.

---

## 6. Kesimpulan Audit Topologi

1. Topologi jaringan transportasi Kabupaten Hulu Sungai Selatan telah terverifikasi secara matematis, kokoh, dan bebas error kritis.
2. Algoritma perutean berhasil menangani kondisi dunia nyata (pulau jaringan rawa, sekolah pedalaman Meratus, dan geometri campuran) dengan aman dan transparan (*graceful & auditable*).
3. Seluruh temuan anomali terdokumentasi lengkap dan tidak ada satupun data yang direkayasa atau ditutupi.
