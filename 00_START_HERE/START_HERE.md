# DIKLAT PIM — WORKING BUNDLE v1

Paket ini adalah **working bundle utama** untuk tahap PRD dan implementasi web app prioritas penanganan jalan.

## Gunakan ini sebagai urutan authority

### 1. Identitas ruas
Source of truth:
`01_authoritative_seed/diklat_pim_data_seed_v5_authoritative_registry/authoritative/road_registry_authoritative.csv`

Canonical identity:
- `road_id` = UUID internal stabil
- `road_key` = `HSS-KAB-001` s.d. `HSS-KAB-350`
- `nomor_ruas` = nomor ruas resmi
- `display_name` = nama yang ditampilkan di UI/peta

**Jangan join berdasarkan nama ruas.**

### 2. Kondisi jalan 2025
Authority:
`Dashboard_Analitik_Data_Jalan_2025_Revisi.xlsx`

Clean operational export:
`01_authoritative_seed/.../conditions/road_conditions_2025.csv`

Status: **FINAL 2025**

### 3. Geometri ruas
Authority:
`ruas_jalan_kabupaten.gpkg`

Clean web export:
`01_authoritative_seed/.../spatial/roads_county.geojson`

### 4. Batas administrasi
Authority:
`ADMINISTRASI_AR_DESAKEL_HSS.*`

Clean outputs:
- `administration/villages.geojson`
- `administration/districts.geojson`

### 5. Pola ruang
Authority:
`_6306_50KB_RTRW_KABUPATEN_HULUSUNGAISELATAN_2025.gdb.zip`

Clean outputs tersedia dalam folder `spatial/`.

### 6. Fasilitas pelayanan
Sources:
- SD/SMP
- Puskesmas
- RSUD
- Pasar

Clean combined output:
`facilities/public_facilities.geojson`

### 7. Network analysis
Authority:
`network_jalan_jembatan_terbaru.gpkg`

`jembatan_penghubung.gpkg` adalah **synthetic topology connector**, bukan inventaris aset jembatan.

### 8. Baseline normatif 17 variabel
Canonical mapping:
`priority/priority_baseline_normative_canonical.csv`

Sudah mapped 350/350 ke `road_key`.

## Aturan import keras

1. Jika ada `road_key`, gunakan langsung.
2. Jika source punya ID yang terdaftar, gunakan `source_crosswalk.csv`.
3. Nama hanya boleh dipakai melalui alias yang sudah terdaftar eksplisit.
4. Tidak boleh fuzzy matching.
5. Tidak boleh silent fallback.
6. Jika tidak bisa dipetakan: `UNRESOLVED` dan hentikan import record tersebut.

## Jangan gunakan

- Seed v1–v4 sebagai source-of-truth implementasi.
- Legacy Treatment Engine road_key sebagai canonical identity.
- `OBJECTID` GPKG ruas sebagai key.
- Nama ruas sebagai join key.

## Reference code

`03_reference_code/` hanya referensi arsitektur/UI dari Treatment Engine.
Jangan copy kompleksitas ML/ASB/optimization ke MVP kecuali secara eksplisit dibutuhkan.

## Product direction

`04_product_concept/institutional_memory_concept_prd.md` adalah visi jangka panjang.
MVP Diklat PIM saat ini fokus pada **sistem prioritas penanganan jalan** dengan coefficient model yang configurable.

