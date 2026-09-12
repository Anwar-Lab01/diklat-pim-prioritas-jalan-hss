# Diklat PIM Data Seed v5 — Authoritative Road Registry

Versi ini mengunci satu **authoritative road registry** untuk seluruh aplikasi.

## Hasil utama

- Canonical road master: **350/350**
- `road_key`: `HSS-KAB-001` s.d. `HSS-KAB-350`
- Dashboard 2025 ↔ QGIS: **350/350** melalui `NO RUAS == Kd_Inf`
- `dataset_ml_clean.csv` ↔ workbook historis: **350/350 exact source name**
- workbook historis ↔ canonical registry: **350/350 verified**
- 17 variabel normatif ↔ canonical `road_key`: **350/350**
- fuzzy matching: **TIDAK DIGUNAKAN**
- silent fallback: **TIDAK DIGUNAKAN**

## Naming authority

`canonical_name` berasal dari Dashboard 2025.

`display_name` dipakai untuk UI/peta/web. Nama duplikat dikunci sebagai:
- Mawar (Kandangan Utara)
- Mawar (Daha Selatan)
- Musyawarah (Kandangan)
- Musyawarah (Nagara)
- Sekolah Islam (Kandangan Barat)
- Sekolah Islam (Sungai Pinang)

Nama sumber lama tetap dipertahankan di `road_aliases_authoritative.csv`, tetapi **alias tidak pernah menjadi identity key**.

## File utama untuk Codex

1. `authoritative/road_registry_authoritative.csv`
2. `authoritative/source_crosswalk.csv`
3. `authoritative/road_aliases_authoritative.csv`
4. `authoritative/AUTHORITY_CONTRACT.json`
5. `priority/priority_baseline_normative_canonical.csv`
6. `spatial/roads_county.geojson`

Gunakan file authoritative di atas sebagai source-of-truth import.

## Import rule

Jika dataset baru tidak memiliki `road_key`:

1. cocokkan melalui `source_crosswalk.csv` berdasarkan source-system + source-id;
2. jika hanya punya nama, nama harus sudah terdaftar sebagai alias eksplisit;
3. jika tidak ada crosswalk/alias: **REJECT / UNRESOLVED**;
4. jangan fuzzy match dan jangan memilih ruas yang "paling mirip".

