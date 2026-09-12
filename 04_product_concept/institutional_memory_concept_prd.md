# 1. Latar Belakang

Pengelolaan jalan menghasilkan banyak informasi yang berasal dari berbagai sumber dan periode waktu. Informasi tersebut antara lain berupa peta ruas jalan, kondisi kerusakan, wilayah administrasi, fasilitas umum, pola ruang, usulan masyarakat, kebijakan, serta riwayat penanganan.

Dalam praktiknya, informasi tersebut berpotensi tersebar pada berbagai sumber sehingga pengetahuan mengenai suatu ruas jalan tidak selalu mudah ditelusuri secara utuh.

Konsep yang dikembangkan adalah menjadikan **ruas jalan sebagai objek utama institutional memory**.

Setiap ruas jalan menjadi titik penghubung berbagai informasi sehingga institusi dapat melihat bukan hanya kondisi suatu ruas saat ini, tetapi juga **konteks ruang, histori kondisi, histori penanganan, serta keterkaitannya dengan proses kebijakan dan aspirasi masyarakat**.

Catatan awal konsep mencakup peta ruas jalan pada tingkat kabupaten, provinsi, dan nasional; data administrasi desa dan kecamatan; fasilitas seperti rumah sakit, puskesmas, sekolah, dan pasar; pola ruang; policy mapping; serta pemetaan policy pada ruas jalan, desa, dan kecamatan. 

---

# 2. Visi Produk

> **Membangun institutional memory pengelolaan jalan yang terintegrasi secara spasial, temporal, dan kebijakan, dengan ruas jalan sebagai objek utama pengetahuan institusi.**

### Prinsip utama

**Satu ruas jalan → satu konteks → satu histori → satu memory institusi.**

---

# 3. Tujuan

## 3.1 Tujuan utama

Membangun sistem yang memungkinkan informasi mengenai suatu ruas jalan ditelusuri secara terintegrasi berdasarkan:

1. **Lokasi** 
2. **Kondisi** 
3. **Konteks ruang** 
4. **Fasilitas di sekitar** 
5. **Riwayat penanganan** 
6. **Policy mapping** 
7. **Aspirasi atau pengaduan** 
8. **Perubahan dari waktu ke waktu** 

## 3.2 Tujuan strategis

Sistem diharapkan dapat:

-  menjaga pengetahuan institusi agar tidak hilang ketika terjadi pergantian personel; 
-  mendokumentasikan sejarah pengelolaan ruas jalan; 
-  membantu memahami alasan dan konteks suatu penanganan; 
-  mendukung perencanaan dan penentuan prioritas; 
-  mendukung monitoring dan evaluasi; 
-  mempermudah penelusuran kembali informasi lama. 

---

# 4. Konsep Produk

Arsitektur konseptual:

```
```

```
                    INSTITUTIONAL MEMORY
                            │
                            ▼
                    ┌──────────────┐
                    │  RUAS JALAN  │
                    │  AS PRIMARY  │
                    │    OBJECT    │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      SPATIAL          TEMPORAL          POLICY
      CONTEXT          HISTORY           CONTEXT
          │                │                │
          ▼                ▼                ▼
   Pola Ruang        Kondisi Jalan     Musrenbang
   Administrasi      Penanganan        SP4N LAPOR
   Fasilitas         Intervensi        Program
                                      /Kebijakan
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                   KNOWLEDGE / MEMORY
                           │
                           ▼
             PERENCANAAN & KEPUTUSAN
```

---

# 5. Ruang Lingkup

## 5.1 Data ruas jalan

Merupakan **data inti** sistem.

Minimal memuat:

-  ID ruas 
-  nama ruas 
-  status/kategori jalan 
-  panjang ruas 
-  geometri 
-  titik awal 
-  titik akhir 
-  wilayah administratif 
-  kondisi jalan 

Catatan sumber secara eksplisit menyebut peta ruas pada konteks **kabupaten, provinsi, dan nasional**. 

---

# 6. Modul Data Spasial

## 6.1 Administrasi

Data yang dikaitkan dengan ruas:

-  Desa 
-  Kecamatan 

Hubungan spasial:

```
```

```
Ruas Jalan
    ↓
Desa
    ↓
Kecamatan
```

Catatan sumber memang menempatkan **desa dan kecamatan** sebagai bagian dari peta administrasi. 

---

## 6.2 Pola Ruang

Sistem menyediakan layer pola ruang yang dapat dioverlay dengan jaringan jalan.

Contoh konseptual:

```
```

```
             POLA RUANG
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
   Permukiman  Perdagangan  Pertanian
       │          │          │
       └──────────┼──────────┘
                  ▼
             RUAS JALAN
```

### Fungsi

Pengguna dapat melihat:

-  ruas yang berada dalam suatu zona; 
-  ruas yang bersinggungan dengan pola ruang; 
-  konteks ruang di sekitar ruas; 
-  perubahan hubungan ruas dengan pola ruang apabila data historis tersedia. 

**Catatan:** detail klasifikasi pola ruang belum ditentukan dalam sumber awal. Karena itu jenis zona/RTRW yang digunakan harus ditetapkan pada tahap desain data.

---

# 7. Modul Fasilitas Publik

Layer fasilitas/fasum dikaitkan dengan ruas jalan.

Sumber awal menyebut:

-  Rumah sakit 
-  Puskesmas 
-  Sekolah 
-  Pasar 

serta fasilitas umum lainnya. 

### Analisis spasial

Contoh:

```
```

```
RUAS JALAN A
     │
     ├── Sekolah: 2
     ├── Puskesmas: 1
     ├── Rumah sakit: 0
     └── Pasar: 1
```

**Radius analisis** seperti 500 m atau 1 km merupakan usulan desain dan belum ditetapkan oleh catatan awal.

---

# 8. Modul Kondisi Jalan

Setiap ruas memiliki kondisi terkini dan, idealnya, histori kondisi.

### Data minimal

-  Tahun survei 
-  Kondisi 
-  Lokasi/STA 
-  Panjang bagian terdampak 
-  Jenis kerusakan 
-  Dokumentasi 
-  Sumber data 

### Konsep temporal

```
```

```
2021 ─── Kondisi Baik
   │
2022 ─── Rusak Ringan
   │
2023 ─── Rusak Berat
   │
2024 ─── Setelah Penanganan
   │
2026 ─── Kondisi Saat Ini
```

**Histori kondisi merupakan pengembangan konseptual dari ide institutional memory**, sedangkan catatan awal secara eksplisit menyebut kondisi kerusakan. 

---

# 9. Modul Historis Penanganan

Ini menjadi **komponen inti institutional memory**.

Setiap tindakan penanganan terhadap ruas dicatat sebagai histori.

### Informasi yang disimpan

-  Tahun 
-  Jenis penanganan 
-  Lokasi/STA 
-  Program/kegiatan 
-  Sumber anggaran 
-  Pelaksana 
-  Volume 
-  Nilai pekerjaan 
-  Hasil penanganan 
-  Dokumentasi 
-  Kondisi sebelum penanganan 
-  Kondisi setelah penanganan 

Sebagian atribut di atas merupakan **usulan pengembangan**, karena catatan awal hanya menyebut keberadaan *historis penanganan*, bukan struktur data detailnya. 

### Tampilan ideal

```
```

```
RUAS JALAN A

2019
Pemeliharaan
       ↓
2021
Rehabilitasi
       ↓
2023
Peningkatan
       ↓
2024
Pemeliharaan
       ↓
2026
Kondisi saat ini
```

Dengan demikian sistem dapat menjawab:

> **Apa yang pernah dilakukan terhadap ruas ini?**

dan:

> **Bagaimana kondisi ruas setelah penanganan tersebut?**

---

# 10. Modul Policy Mapping

Policy mapping merupakan lapisan yang menghubungkan **kebijakan/proses pengambilan keputusan dengan lokasi fisik**.

Catatan awal mencantumkan:

1.  Musrenbang 
2.  [Istilah pada catatan "Polcir/Polcis", masih perlu dikonfirmasi] 
3.  SP4N LAPOR 

dan kemudian menyatakan bahwa policy dipetakan pada:

-  ruas jalan; 
-  desa; 
-  kecamatan.  

### Konsep hubungan

```
```

```
ASPIRASI / POLICY
       │
       ▼
   LOKASI
       │
       ▼
   RUAS JALAN
       │
       ▼
 PENANGANAN
```

Contoh:

**Musrenbang 2025**

→ Usulan peningkatan jalan

→ Lokasi tertentu

→ Ruas Jalan X

→ Masuk proses perencanaan

→ Penanganan

Dengan demikian **policy tidak lagi berdiri sebagai dokumen terpisah dari objek spasialnya**.

---

# 11. Halaman Detail Ruas

Ketika pengguna memilih satu ruas pada peta, sistem menampilkan **Road Memory Profile**.

### Contoh

```
```

```
┌─────────────────────────────────────┐
│ RUAS JALAN: JL. 001                 │
├─────────────────────────────────────┤
│ IDENTITAS                           │
│ Status      : Kabupaten             │
│ Panjang     : 12,5 km               │
│ Desa        : Desa A, Desa B        │
│ Kecamatan   : Kecamatan X           │
├─────────────────────────────────────┤
│ KONDISI SAAT INI                    │
│ Rusak Sedang                        │
├─────────────────────────────────────┤
│ POLA RUANG                          │
│ Permukiman                          │
│ Perdagangan/Jasa                   │
│ Pertanian                           │
├─────────────────────────────────────┤
│ FASILITAS                           │
│ Sekolah       2                     │
│ Puskesmas     1                     │
│ Pasar         1                     │
├─────────────────────────────────────┤
│ HISTORIS PENANGANAN                 │
│ 2019  Pemeliharaan                  │
│ 2021  Rehabilitasi                  │
│ 2023  Peningkatan                   │
│ 2024  Pemeliharaan                  │
├─────────────────────────────────────┤
│ POLICY & ASPIRASI                   │
│ Musrenbang                          │
│ SP4N LAPOR                          │
│ Program terkait                     │
└─────────────────────────────────────┘
```

Ini adalah **konsep tampilan**, bukan struktur final yang sudah ditetapkan.

---

# 12. User Story

### Sebagai pengelola jalan

> Saya ingin memilih suatu ruas jalan pada peta sehingga saya dapat melihat seluruh informasi yang berkaitan dengan ruas tersebut.

### Sebagai perencana

> Saya ingin melihat kondisi ruas sekaligus pola ruang dan fasilitas di sekitarnya sehingga saya dapat memahami konteks kebutuhan penanganannya.

### Sebagai pejabat/pengambil keputusan

> Saya ingin mengetahui histori penanganan suatu ruas sehingga saya dapat memahami apa yang telah dilakukan sebelumnya.

### Sebagai staf baru

> Saya ingin menelusuri sejarah suatu ruas sehingga saya tidak bergantung sepenuhnya pada pengetahuan personal pegawai sebelumnya.

### Sebagai evaluator

> Saya ingin melihat hubungan antara kondisi, penanganan, dan hasilnya sehingga saya dapat melakukan evaluasi berdasarkan histori.

---

# 13. Functional Requirements

| IDRequirementPrioritas |                                                           |        |
| ---------------------- | --------------------------------------------------------- | ------ |
| FR-01                  | Sistem dapat menampilkan peta ruas jalan                  | Must   |
| FR-02                  | Sistem dapat menampilkan batas administrasi               | Must   |
| FR-03                  | Sistem dapat menampilkan kondisi jalan                    | Must   |
| FR-04                  | Sistem dapat melakukan spatial overlay                    | Must   |
| FR-05                  | Sistem dapat menampilkan pola ruang                       | Must   |
| FR-06                  | Sistem dapat menampilkan fasilitas publik                 | Should |
| FR-07                  | Sistem dapat menyimpan histori kondisi                    | Should |
| FR-08                  | Sistem dapat menyimpan histori penanganan                 | Must   |
| FR-09                  | Sistem dapat menampilkan timeline penanganan              | Must   |
| FR-10                  | Sistem dapat menghubungkan policy/aspirasi dengan ruas    | Must   |
| FR-11                  | Sistem dapat menampilkan detail suatu ruas                | Must   |
| FR-12                  | Sistem dapat melakukan pencarian ruas                     | Must   |
| FR-13                  | Sistem dapat melakukan filter berdasarkan wilayah/kondisi | Should |
| FR-14                  | Sistem dapat menampilkan dokumentasi histori              | Should |
| FR-15                  | Sistem mencatat sumber data setiap informasi              | Must   |

---

# 14. Non-Functional Requirements

### Data integrity

Informasi harus memiliki sumber dan waktu data yang jelas.

### Traceability

Setiap informasi penting dapat ditelusuri kembali ke sumber atau rekam historinya.

### Spatial accuracy

Geometri dan hubungan spasial harus memiliki standar akurasi yang ditentukan.

### Security

Akses terhadap data tertentu harus dapat dibatasi berdasarkan kewenangan.

### Scalability

Sistem harus mampu menambahkan ruas, histori, dan layer baru tanpa mengubah konsep dasar.

### Maintainability

Data harus dapat diperbarui secara berkala oleh unit pengelola.

---

# 15. Arsitektur Data Konseptual

Menurut gue ini bagian yang sangat penting.

```
```

```
                    ROAD_SEGMENT
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 ADMINISTRATIVE     ROAD_CONDITION    ROAD_TREATMENT
        │                │                │
        ▼                ▼                ▼
 Desa/Kecamatan       Timeline         Timeline
                                          │
        ┌───────────────┼──────────────────┘
        │               │
        ▼               ▼
   LAND_USE         PUBLIC_FACILITY
        │               │
        └───────┬───────┘
                ▼
          POLICY_MAPPING
                │
       ┌────────┼─────────┐
       ▼        ▼         ▼
   Musrenbang  LAPOR   Program
                │
                ▼
       INSTITUTIONAL MEMORY
```

**ROAD\_SEGMENT/ID RUAS** menjadi *primary anchor*.

Ini penting supaya data tidak hanya terhubung berdasarkan nama. Kalau nama jalan berubah atau penamaan berbeda antar-dokumen, identitas ruas tetap menjadi referensi utama.

---

# 16. Alur Sistem

```
```

```
DATA DARI BERBAGAI SUMBER
          ↓
     STANDARDISASI
          ↓
      INTEGRASI DATA
          ↓
    SPATIAL OVERLAY
          ↓
   HUBUNGKAN DENGAN
      RUAS JALAN
          ↓
  TAMBAHKAN DIMENSI
       TEMPORAL
          ↓
   POLICY MAPPING
          ↓
 INSTITUTIONAL MEMORY
          ↓
 ANALISIS & VISUALISASI
          ↓
PERENCANAAN / KEPUTUSAN /
MONITORING / EVALUASI
```

---

# 17. MVP

Kalau ini benar-benar mau dibangun, **jangan langsung bikin seluruh alam semesta GIS**.

MVP sebaiknya:

### Phase 1

**Road Memory Core**

-  Peta ruas 
-  ID ruas 
-  administrasi 
-  kondisi jalan 
-  detail ruas 
-  histori penanganan 
-  timeline 

### Phase 2

**Spatial Context**

-  pola ruang 
-  fasilitas publik 
-  spatial overlay 

### Phase 3

**Policy Memory**

-  Musrenbang 
-  SP4N LAPOR 
-  policy/program terkait 
-  hubungan policy → lokasi → ruas 

### Phase 4

**Analysis**

-  analisis prioritas 
-  tren kondisi 
-  evaluasi penanganan 
-  analisis keterkaitan pola ruang dan kebutuhan jalan 

Phase 4 sebaiknya **jangan dianggap bagian wajib MVP**, karena analitik tanpa data dasar yang bersih hanya menghasilkan angka dengan percaya diri. Manusia sudah cukup banyak melakukan itu secara manual.

---

# 18. Indikator Keberhasilan

Beberapa KPI yang bisa dipakai:

### Data

-  Persentase ruas yang telah memiliki ID unik. 
-  Persentase ruas yang memiliki data kondisi. 
-  Persentase ruas yang memiliki histori penanganan. 
-  Persentase ruas yang telah terhubung dengan data administrasi. 
-  Persentase ruas yang telah memiliki konteks pola ruang. 

### Institutional Memory

-  Waktu yang diperlukan untuk menemukan histori suatu ruas. 
-  Persentase informasi historis yang dapat ditelusuri. 
-  Pengurangan ketergantungan terhadap informasi personal pegawai. 
-  Persentase penanganan yang memiliki rekam jejak lengkap. 

### Decision Support

-  Penggunaan sistem dalam proses perencanaan. 
-  Jumlah analisis/perencanaan yang menggunakan data sistem. 
-  Kemampuan menelusuri hubungan **kondisi → penanganan → hasil**. 

---

# 19. Nilai Strategis

Yang dijual oleh produk ini **bukan teknologinya**.

Nilainya adalah:

### Dari

> **Data yang tersebar**

menjadi

> **Informasi yang terintegrasi**

menjadi

> **Pengetahuan institusi**

menjadi

> **Institutional Memory**

menjadi

> **Dasar pengambilan keputusan yang berkelanjutan.**

Dan secara konseptual, **ruas jalan menjadi "unit memory" institusi**.

---

# 20. Kalimat inti PRD

Kalau harus diringkas menjadi satu paragraf:

> **Sistem Institutional Memory Berbasis Peta Ruas Jalan merupakan sistem yang mengintegrasikan informasi spasial, kondisi jalan, pola ruang, fasilitas publik, historis penanganan, serta policy mapping dengan ruas jalan sebagai objek utama. Integrasi tersebut memungkinkan institusi merekonstruksi konteks dan perjalanan suatu ruas jalan dari waktu ke waktu, sehingga pengetahuan yang sebelumnya tersebar dan bergantung pada individu dapat terdokumentasi, ditelusuri, dan dimanfaatkan untuk mendukung perencanaan, pengambilan keputusan, monitoring, serta evaluasi secara berkelanjutan.**

**Ini menurut gue sudah menjadi PRD konseptual yang cukup solid.** Yang belum boleh kita kunci sekarang justru detail seperti sumber data spesifik, struktur database final, definisi *Polcir/Polcis* di catatan lo, metode overlay, dan aturan akses. Itu harus ditentukan setelah arsitektur bisnisnya disepakati, bukan ditebak dari tulisan tangan manusia yang bahkan OCR saja menyerah.