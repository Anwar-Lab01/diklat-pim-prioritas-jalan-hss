# SCORING ENGINE CONTRACT v1
## Sistem Pendukung Prioritas Penanganan Jalan Kabupaten Hulu Sungai Selatan

**Dokumen Kontrak Matematis & Spesifikasi Algoritma Skoring Deterministik**  
**Versi:** 1.0.0 (MVP Release)  
**Status:** Frozen for Implementation  
**Orkestrator Arsitektur:** Antigravity  
**Tanggal:** 12 September 2026  
**Governing Documents:**
- [`reports/PRD_MVP_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/PRD_MVP_V1.md)
- [`reports/PRIORITY_MODEL_SPECIFICATION_V1.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/PRIORITY_MODEL_SPECIFICATION_V1.md)
- [`reports/LOCAL_WEIGHTS_CLOSURE_REPORT.md`](file:///f:/WebApps/6.diklat_pim/diklat_pim_working_bundle_v1/reports/LOCAL_WEIGHTS_CLOSURE_REPORT.md)

---

## 1. DETERMINISTIC PIPELINE LIFECYCLE

Mesin skoring beroperasi secara **deterministik murni (*pure deterministic pipeline*)**. Diberikan observasi data ruas dan konfigurasi bobot model yang sama, mesin wajib menghasilkan nilai kontribusi, skor akhir, dan peringkat yang identik hingga presisi mesin ($0.0\text{ difference}$):

```
+---------------------------------------------------------------------------------------------------------+
|                                    DETERMINISTIC SCORING PIPELINE                                       |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  1. RAW OBSERVATION EXTRACTION (X_raw)                                                                  |
|     - Mode Operasional: Ambil rasio kerusakan 2025 dari road_conditions_2025.csv                        |
|     - Mode Benchmark: Ambil nilai statis kanonikal dari priority_baseline_normative_canonical.csv       |
|                                         |                                                               |
|                                         v                                                               |
|  2. NORMALIZATION & CLAMPING                                                                            |
|     - Terapkan fungsi normalisasi spesifik per variabel: f(X_raw) -> X_norm in [0.0, 1.0]               |
|                                         |                                                               |
|                                         v                                                               |
|  3. WEIGHT NORMALIZATION & EFFECTIVE COMPUTATION                                                        |
|     - Normalized Category Weight: W_k* = W_k / sum(W_j)                                                 |
|     - Local Variable Weight: w_k,i in [0.0, 1.0], where sum_i(w_k,i) = 1.0                             |
|     - Effective Weight: Omega_k,i = W_k* * w_k,i (Read-Only)                                            |
|                                         |                                                               |
|                                         v                                                               |
|  4. FACTOR CONTRIBUTION COMPUTATION                                                                     |
|     - Kontribusi Variabel: C_k,i(r) = Omega_k,i * X_norm_k,i(r)                                         |
|     - Subtotal Kategori: S_k(r) = sum_i(C_k,i(r))                                                       |
|                                         |                                                               |
|                                         v                                                               |
|  5. COMPOSITE FINAL SCORE (Score_r)                                                                     |
|     - Final Score: Score_r = sum_k(S_k(r)) = sum_j=1..17(Omega_j * X_norm_j(r))                         |
|                                         |                                                               |
|                                         v                                                               |
|  6. DETERMINISTIC SORTING & TIE-BREAKING                                                                |
|     - Urutkan Score_r descending (Skor tertinggi = Prioritas 1)                                         |
|     - Jika Score_a == Score_b: Pecahkan seri dengan aturan deterministik bertingkat                    |
|                                         |                                                               |
|                                         v                                                               |
|  7. STRICT BIJECTIVE RANK ASSIGNMENT                                                                    |
|     - Tetapkan peringkat kontigu: Rank in {1, 2, 3, ..., 350}                                           |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. FORMULA NORMALISASI 17 VARIABEL: DUAL-MODE SPECIFICATION

Sistem membedakan secara tegas parameter input antara **Mode Operasional 2025** dengan **Mode Benchmark 2024**:

### Kategori 1: Data Teknis Jalan (7 Variabel)

#### 1. `norm_panjang_ruas` (Panjang Ruas Jalan)
- **Arah Optimasi:** BENEFIT ($L \uparrow \implies \text{Score} \uparrow$)
- **Unit:** km
- **Formula:**
  $$\text{norm\_panjang\_ruas} = \min\left(1.0, \max\left(0.0, \frac{L - 0.060}{17.110 - 0.060}\right)\right) = \frac{L - 0.060}{17.050}$$
- **Data Input:**
  * Mode Operasional: Kolom `PANJANG (KM)` dari Dashboard 2025.
  * Mode Benchmark: Kolom `norm_panjang_ruas` dari baseline kanonikal.

#### 2. `norm_lebar_ruas` (Lebar Perkerasan Jalan)
- **Arah Optimasi:** BENEFIT ($W \uparrow \implies \text{Score} \uparrow$)
- **Unit:** meter
- **Formula (Clamped Min-Max):**
  $$\text{norm\_lebar\_ruas} = \begin{cases} 
  0.0, & \text{jika } W \le 3.0\text{ m} \\ 
  \min\left(1.0, \frac{W - 3.0}{14.0 - 3.0}\right) = \frac{W - 3.0}{11.0}, & \text{jika } W > 3.0\text{ m} 
  \end{cases}$$
- **Data Input:** Nilai `Lbr_Keras` dari atribut survei penampang fisik ruas.

#### 3. `norm_kondisi_sedang` (Proporsi Kerusakan Sedang)
- **Arah Optimasi:** BENEFIT / URGENSI PENANGANAN
- **Unit:** Rasio fraksi $[0.0, 1.0]$
- **Formula:**
  * **Mode Operasional 2025 (Live Condition Authority):**
    $$\text{norm\_kondisi\_sedang} = \frac{\text{sedang\_km\_2025}}{\text{total\_panjang\_km\_2025}} = \frac{\text{sedang\_pct\_2025}}{100}$$
  * **Mode Benchmark (Survey 2024):** Nilai statis `norm_kondisi_sedang` dari baseline kanonikal.

#### 4. `norm_rusak_ringan` (Proporsi Rusak Ringan)
- **Arah Optimasi:** BENEFIT / URGENSI PENANGANAN
- **Unit:** Rasio fraksi $[0.0, 1.0]$
- **Formula:**
  * **Mode Operasional 2025 (Live Condition Authority):**
    $$\text{norm\_rusak\_ringan} = \frac{\text{rusak\_ringan\_km\_2025}}{\text{total\_panjang\_km\_2025}} = \frac{\text{rusak\_ringan\_pct\_2025}}{100}$$
  * **Mode Benchmark (Survey 2024):** Nilai statis `norm_rusak_ringan` dari baseline kanonikal.

#### 5. `norm_rusak_berat` (Proporsi Rusak Berat)
- **Arah Optimasi:** BENEFIT / URGENSI PENANGANAN
- **Unit:** Rasio fraksi $[0.0, 1.0]$
- **Formula:**
  * **Mode Operasional 2025 (Live Condition Authority):**
    $$\text{norm\_rusak\_berat} = \frac{\text{rusak\_berat\_km\_2025}}{\text{total\_panjang\_km\_2025}} = \frac{\text{rusak\_berat\_pct\_2025}}{100}$$
  * **Mode Benchmark (Survey 2024):** Nilai statis `norm_rusak_berat` dari baseline kanonikal.

#### 6. `norm_permukaan_aspal_penmac` (Proporsi Permukaan Aspal/Lapen)
- **Arah Optimasi:** BENEFIT
- **Unit:** Rasio fraksi $[0.0, 1.0]$
- **Formula:**
  $$\text{norm\_permukaan\_aspal\_penmac} = \min\left(1.0, \frac{\text{hotmix\_km} + \text{lapen\_km}}{\text{total\_panjang\_km}}\right)$$

#### 7. `norm_permukaan_beton` (Proporsi Permukaan Rigid Beton)
- **Arah Optimasi:** BENEFIT
- **Unit:** Rasio fraksi $[0.0, 1.0]$
- **Formula:**
  $$\text{norm\_permukaan\_beton} = \min\left(1.0, \frac{\text{beton\_km}}{\text{total\_panjang\_km}}\right)$$

---

### Kategori 2: Data Aksesibilitas (3 Variabel)

#### 8. `norm_koneksi_jalan_provinsi` (Konektivitas Jalan Provinsi)
- **Arah Optimasi:** BENEFIT
- **Unit:** Biner $\{0, 1\}$
- **Formula:** $X_{\text{prov}} \in \{0, 1\}$ (1 jika persimpangan fisik $\le 25\text{ m}$ dari koridor provinsi).

#### 9. `norm_koneksi_jalan_nasional` (Konektivitas Jalan Nasional)
- **Arah Optimasi:** BENEFIT
- **Unit:** Biner $\{0, 1\}$
- **Formula:** $X_{\text{nas}} \in \{0, 1\}$ (1 jika persimpangan fisik $\le 10\text{ m}$ dari koridor nasional).

#### 10. `norm_jarak_ibukota_kabupaten_cost` (Aksesibilitas Pusat Pemkab Kandangan)
- **Arah Optimasi:** COST (Inversi: Semakin dekat = Prioritas semakin tinggi)
- **Unit:** meter (Jarak Jaringan Jalan Terpendek)
- **Formula (Inverted Min-Max):**
  $$\text{norm\_jarak\_ibukota\_kabupaten\_cost} = \min\left(1.0, \max\left(0.0, \frac{47122.1 - d_{\text{ibukota}}}{47122.1 - 257.6}\right)\right) = \frac{47122.1 - d_{\text{ibukota}}}{46864.5}$$
  *Penanganan Pulau Terputus:* Jika graf terputus, gunakan nilai median $d = 8509.5\text{ m} \implies \text{norm} = 0.823920$.

---

### Kategori 3: Data Pelayanan Masyarakat (4 Variabel)

#### 11. `norm_jarak_rsud_cost` (Aksesibilitas Rumah Sakit Umum Daerah)
- **Arah Optimasi:** COST (Inversi)
- **Unit:** meter
- **Formula:**
  $$\text{norm\_jarak\_rsud\_cost} = \min\left(1.0, \max\left(0.0, \frac{43384.5 - d_{\text{rsud}}}{43384.5 - 41.4}\right)\right) = \frac{43384.5 - d_{\text{rsud}}}{43343.1}$$
  *Penanganan Pulau Terputus:* Gunakan median $d = 6375.6\text{ m} \implies \text{norm} = 0.853951$.

#### 12. `norm_jarak_puskesmas_cost` (Aksesibilitas Puskesmas)
- **Arah Optimasi:** COST (Inversi)
- **Unit:** meter
- **Formula:**
  $$\text{norm\_jarak\_puskesmas\_cost} = \min\left(1.0, \max\left(0.0, \frac{21229.7 - d_{\text{puskesmas}}}{21229.7 - 0.0}\right)\right) = \frac{21229.7 - d_{\text{puskesmas}}}{21229.7}$$
  *Penanganan Pulau Terputus:* Gunakan median $d = 2665.5\text{ m} \implies \text{norm} = 0.874429$.

#### 13. `norm_jarak_sd_smp_cost` (Aksesibilitas Pendidikan Dasar)
- **Arah Optimasi:** COST (Inversi)
- **Unit:** meter
- **Formula:**
  $$\text{norm\_jarak\_sd\_smp\_cost} = \min\left(1.0, \max\left(0.0, \frac{8064.6 - d_{\text{sekolah}}}{8064.6 - 0.0}\right)\right) = \frac{8064.6 - d_{\text{sekolah}}}{8064.6}$$
  *Penanganan Pulau Terputus:* Gunakan median $d = 717.75\text{ m} \implies \text{norm} = 0.910897$.

#### 14. `norm_jarak_pasar_cost` (Aksesibilitas Pasar Tradisional)
- **Arah Optimasi:** COST (Inversi)
- **Unit:** meter
- **Formula:**
  $$\text{norm\_jarak\_pasar\_cost} = \min\left(1.0, \max\left(0.0, \frac{d_{\max} - d_{\text{pasar}}}{d_{\max} - 0.0}\right)\right)$$
  *Penanganan Pulau Terputus:* Gunakan median $d = 377.8\text{ m} \implies \text{norm} = 0.979318$.

---

### Kategori 4: Data Spasial & Demografi (3 Variabel)

#### 15. `norm_penduduk_dilayani` (Jumlah Penduduk Terlayani)
- **Arah Optimasi:** BENEFIT
- **Unit:** jiwa
- **Formula:**
  $$\text{norm\_penduduk\_dilayani} = \min\left(1.0, \max\left(0.0, \frac{P - 138}{9090 - 138}\right)\right) = \frac{P - 138}{8952}$$
  *Sumber Nilai:* $P = \sum_{v \in \text{desa\_terlintas}} \text{Pop}(v)$ berbasis tabel lookup populasi historis terverifikasi.

#### 16. `norm_desa_dilalui` (Cakupan Wilayah Desa)
- **Arah Optimasi:** BENEFIT
- **Unit:** desa
- **Formula:**
  $$\text{norm\_desa\_dilalui} = \min\left(1.0, \max\left(0.0, \frac{D - 1}{9 - 1}\right)\right) = \frac{D - 1}{8}$$

#### 17. `norm_kecamatan_dilalui` (Cakupan Wilayah Kecamatan)
- **Arah Optimasi:** BENEFIT
- **Unit:** kecamatan
- **Formula:**
  $$\text{norm\_kecamatan\_dilalui} = \min\left(1.0, \max\left(0.0, \frac{K - 1}{3 - 1}\right)\right) = \frac{K - 1}{2}$$

---

## 3. BOBOT HIRARKIS & PERHITUNGAN KONTRIBUSI FAKTOR

### 3.1 Normalisasi Bobot Kategori (Level 1)
Diberikan 4 nilai input mentah kategori $W_1, W_2, W_3, W_4$:
$$S_W = \sum_{j=1}^4 W_j$$
$$W_k^* = \frac{W_k}{S_W} \quad (\forall k \in \{1..4\})$$

*Nilai Sumber Baseline:*
- $W_1 = 0.378965 \implies W_1^* = \frac{0.378965}{0.999999} \approx 0.378965378965$
- $W_2 = 0.283815 \implies W_2^* = \frac{0.283815}{0.999999} \approx 0.283815283815$
- $W_3 = 0.192412 \implies W_3^* = \frac{0.192412}{0.999999} \approx 0.192412192412$
- $W_4 = 0.144807 \implies W_4^* = \frac{0.144807}{0.999999} \approx 0.144807144807$
- $\sum_{k=1}^4 W_k^* \equiv 1.000000000000$.

### 3.2 Bobot Lokal Anak & Bobot Efektif (Level 2)
Untuk setiap kategori $k$, terdapat $n_k$ variabel anak dengan bobot lokal $w_{k, i}$ yang memenuhi $\sum_{i=1}^{n_k} w_{k, i} = 1.0$.
$$\Omega_{k, i} = W_k^* \times w_{k, i}$$

### 3.3 Dekomposisi Penjelasan Skor Ruas $r$
Untuk setiap ruas jalan $r \in \{1..350\}$:
1. **Kontribusi Faktor Individual:**
   $$C_{k, i}(r) = \Omega_{k, i} \times X^{\text{norm}}_{k, i}(r)$$
2. **Subtotal Kategori:**
   $$\text{Subtotal}_k(r) = \sum_{i=1}^{n_k} C_{k, i}(r)$$
3. **Skor Komposit Akhir:**
   $$\text{FinalScore}(r) = \sum_{k=1}^4 \text{Subtotal}_k(r) = \sum_{j=1}^{17} \Omega_j \cdot X^{\text{norm}}_j(r)$$
   *Invarian Rentang:* $0.00000000 \le \text{FinalScore}(r) \le 1.00000000$.

---

## 4. DETERMINISTIC TIE-BREAKING CONTRACT

Jika terdapat dua atau lebih ruas jalan yang memiliki nilai $\text{FinalScore}$ yang sama persis dalam batas toleransi floating point $\epsilon = 10^{-7}$:
$$|\text{FinalScore}(A) - \text{FinalScore}(B)| \le 10^{-7}$$
Maka mesin skoring wajib memecahkan seri secara berurutan (*cascading deterministic tie-breaker*):

```
+---------------------------------------------------------------------------------------------------+
|                                  DETERMINISTIC TIE-BREAKER CASCADE                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ CRITERION 1: ROAD DAMAGE URGENCY ]                                                             |
|  Bandingkan persentase kemantapan jalan resmi 2025: mantap_pct(A) vs mantap_pct(B).               |
|  Ruas dengan kemantapan LEBIH RENDAH (kerusakan lebih parah) memperoleh peringkat lebih tinggi.  |
|  Contoh: mantap_pct 35.2% > mantap_pct 48.1%.                                                     |
|                                         |                                                         |
|                               (Jika Nilai Sama)                                                   |
|                                         v                                                         |
|  [ CRITERION 2: POPULATION SERVED ]                                                               |
|  Bandingkan jumlah penduduk terlayani: penduduk_dilayani(A) vs penduduk_dilayani(B).              |
|  Ruas dengan penduduk LEBIH BANYAK memperoleh peringkat lebih tinggi.                             |
|                                         |                                                         |
|                               (Jika Nilai Sama)                                                   |
|                                         v                                                         |
|  [ CRITERION 3: OFFICIAL ROAD NUMBER ]                                                            |
|  Bandingkan nomor ruas resmi SK: nomor_ruas(A) vs nomor_ruas(B).                                  |
|  Nomor ruas LEBIH KECIL secara alfabetis menaik (ascending) memperoleh peringkat lebih tinggi.    |
|  Contoh: '012' mengalahkan '045'.                                                                 |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

Dengan adanya kriteria ke-3 (nomor ruas resmi SK bersifat unik 350/350), **dijamin 100% secara matematis bahwa tidak akan pernah terjadi peringkat kembar (*no tied ranks*)**.

---

## 5. REPRODUCIBILITY & PROPERTY-BASED TEST SPECIFICATIONS

Setiap implementasi kode mesin skoring wajib lulus rangkaian uji properti berikut sebelum diizinkan masuk ke lingkungan produksi:

1. **Test-01 (Invarian Identitas Partisi):**
   $$\sum_{k=1}^4 \sum_{i=1}^{n_k} \Omega_{k, i} \equiv 1.0 \quad (\text{tolerance } 10^{-12})$$
2. **Test-02 (Invarian Skor Ekstrem Ruas Fiktif):**
   * Jika sebuah ruas memiliki $X^{\text{norm}}_j = 1.0$ untuk seluruh 17 variabel, maka $\text{FinalScore} \equiv 1.00000000$.
   * Jika sebuah ruas memiliki $X^{\text{norm}}_j = 0.0$ untuk seluruh 17 variabel, maka $\text{FinalScore} \equiv 0.00000000$.
3. **Test-03 (Uji Monotonisitas Bobot):**
   Jika bobot suatu variabel $w_j$ dinaikkan dan $X^{\text{norm}}_j(A) > X^{\text{norm}}_j(B)$, maka selisih skor $\text{FinalScore}(A) - \text{FinalScore}(B)$ wajib meningkat atau minimal tetap sama.
4. **Test-04 (Uji Strict Bijective Ranking):**
   Himpunan peringkat seluruh 350 ruas wajib berupa permutasi eksak dari barisan bilangan bulat $\{1, 2, 3, \dots, 350\}$:
   $$\{\text{Rank}(r) \mid r \in \text{Roads}\} = \{1, 2, 3, \dots, 350\}$$
5. **Test-05 (Uji Dekomposisi Penjelasan):**
   Untuk setiap baris ruas pada tabel antarmuka:
   $$\text{FinalScore}(r) - \sum_{k=1}^4 \text{Subtotal}_k(r) \equiv 0.00000000 \quad (\text{tolerance } 10^{-9})$$
   $$\text{Subtotal}_k(r) - \sum_{i=1}^{n_k} C_{k, i}(r) \equiv 0.00000000 \quad (\text{tolerance } 10^{-9})$$

---
*Dokumen Kontrak Skoring v1 ini dibekukan sebagai acuan matematis implementasi kode backend dan komputasi reaktif frontend.*
