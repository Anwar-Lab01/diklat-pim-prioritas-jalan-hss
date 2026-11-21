import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { RtrwSpatialService } from './rtrwSpatialService.ts';
import type { RoadSpatialProfileEntity } from './rtrwSpatialService.ts';

export interface RoadNarrativeAvailability {
  road_key: string;
  has_geometry: boolean;
  has_conditions_2025: boolean;
  has_spatial_profile: boolean;
  has_rtrw_breakdown: boolean;
  has_village_intersections: boolean;
  has_household_demographics: boolean;
  has_population_count: boolean; // currently false in authoritative source
  has_nearest_facilities: boolean;
  has_connected_routes: boolean;
  has_priority_score: boolean;
  has_technical_width: boolean;
  has_technical_surface: boolean;
}

export interface RoadNarrativeSections {
  road_key: string;
  nomor_ruas: string;
  road_name: string;
  ringkasan_eksekutif: string; // 1-3 concise paragraphs
  template1_gambaran_umum: {
    title: string;
    text: string;
    attributes: {
      nomor_ruas: string;
      kode_ruas: string;
      nama_resmi: string;
      panjang_resmi_km: number;
      panjang_geometri_km: number | null;
      kecamatan_utama: string;
      status_administrasi: string;
      daftar_desa: string[];
    };
  };
  template2_cakupan_demografi: {
    title: string;
    text: string;
    attributes: {
      jumlah_desa: number;
      jumlah_kecamatan: number;
      daftar_kecamatan: string[];
      daftar_desa: string[];
      total_rumah_tangga: number;
      data_jiwa_status: string;
      indikator_penduduk_terlayani: number | null;
      catatan_metodologi: string;
    };
  };
  template3_tata_ruang_rtrw: {
    title: string;
    text: string;
    attributes: {
      dasar_hukum: string;
      kelas_dominan: string;
      persentase_dominan: number;
      permukiman_pct: number;
      produksi_pct: number;
      lindung_pct: number;
      badan_air_pct: number;
      pariwisata_pct: number;
      tidak_tercakup_pct: number;
      rincian_kelas: Array<{ name: string; macro: string; length_km: number; pct: number }>;
      catatan_peruntukan: string;
    };
  };
  template4_aksesibilitas_pelayanan: {
    title: string;
    text: string;
    attributes: {
      jarak_kandangan: string;
      rsud: { name: string; distance: string; status: 'CONNECTED' | 'DISCONNECTED' | 'UNAVAILABLE' };
      puskesmas: { name: string; distance: string; status: 'CONNECTED' | 'DISCONNECTED' | 'UNAVAILABLE' };
      sekolah: { name: string; distance: string; status: 'CONNECTED' | 'DISCONNECTED' | 'UNAVAILABLE' };
      pasar: { name: string; distance: string; status: 'CONNECTED' | 'DISCONNECTED' | 'UNAVAILABLE' };
      metode_jarak: string;
    };
  };
  template5_kondisi_kemantapan: {
    title: string;
    text: string;
    attributes: {
      tahun_survei: number;
      panjang_total_km: number;
      mantap_km: number;
      mantap_pct: number;
      tidak_mantap_km: number;
      tidak_mantap_pct: number;
      baik_km: number;
      baik_pct: number;
      sedang_km: number;
      sedang_pct: number;
      rusak_ringan_km: number;
      rusak_ringan_pct: number;
      rusak_berat_km: number;
      rusak_berat_pct: number;
      klasifikasi_dominan: string;
    };
  };
  template6_karakteristik_teknis: {
    title: string;
    text: string;
    attributes: {
      lebar_jalan_m: number | null;
      lebar_display: string;
      permukaan_aspal_pct: number | null;
      permukaan_beton_pct: number | null;
      permukaan_display: string;
      status_ruas: string;
    };
  };
  template7_penilaian_prioritas: {
    title: string;
    text: string;
    attributes: {
      model_aktif: string;
      skor_komposit: number;
      peringkat: number;
      total_ruas: number;
      kategori_tier: string;
      label_tier: string;
      top_factors: Array<{
        variable_code: string;
        variable_label: string;
        effective_weight: number;
        contribution: number;
        pct_of_score: number;
      }>;
      penjelasan_metodologis: string;
    };
  };
  template8_kesimpulan_karakteristik: {
    title: string;
    text: string;
  };
  availability: RoadNarrativeAvailability;
  generated_at: string;
}

export class RoadNarrativeService {
  private db: DatabaseSync;
  private rtrwService: RtrwSpatialService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.rtrwService = new RtrwSpatialService(this.db);
  }

  /**
   * Helper formatting for numbers in Indonesian notation
   */
  private formatNumber(val: number, decimals: number = 2): string {
    return val.toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Generate complete structured narrative for a given road key.
   */
  public generateNarrative(
    roadKey: string,
    operatingMode: string = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): RoadNarrativeSections | null {
    // 1. Fetch Road Identity
    const road = this.db
      .prepare(`
        SELECT 
          r.road_id,
          r.road_key,
          r.nomor_ruas,
          r.canonical_name,
          r.display_name,
          r.district_name,
          r.village_coverage,
          r.length_km_official,
          r.width_m_official,
          r.identity_status,
          g.geometry_length_m,
          g.geometry_geojson
        FROM roads r
        LEFT JOIN road_geometries g ON r.road_key = g.road_key
        WHERE r.road_key = ?
      `)
      .get(roadKey) as any;

    if (!road) return null;

    // 2. Fetch Condition 2025
    const cond = this.db
      .prepare(`
        SELECT * FROM road_conditions
        WHERE road_key = ? AND survey_year = 2025
      `)
      .get(roadKey) as any;

    // 3. Fetch Spatial Profile (RTRW, villages, districts, Kandangan distance)
    const spatialProfile = this.rtrwService.getRoadSpatialProfile(roadKey);

    // 4. Fetch Detailed Village Intersections & Households
    const villageRows = this.db
      .prepare(`
        SELECT 
          rvi.village_id,
          rvi.village_name,
          rvi.district_id,
          rvi.district_name,
          rvi.intersection_length_m,
          rvi.share_of_road_pct,
          COALESCE(vd.households_total, 0) as households_total,
          COALESCE(vd.households_male, 0) as households_male,
          COALESCE(vd.households_female, 0) as households_female
        FROM road_village_intersections rvi
        LEFT JOIN village_demographics vd ON rvi.village_id = vd.village_id
        WHERE rvi.road_key = ?
        ORDER BY rvi.intersection_length_m DESC
      `)
      .all(roadKey) as any[];

    // Ensure unique villages
    const uniqueVillageMap = new Map<string, any>();
    const uniqueDistricts = new Set<string>();
    let totalHouseholds = 0;

    for (const v of villageRows) {
      uniqueDistricts.add(v.district_name);
      if (!uniqueVillageMap.has(v.village_id)) {
        uniqueVillageMap.set(v.village_id, v);
        totalHouseholds += Number(v.households_total);
      }
    }
    const uniqueVillages = Array.from(uniqueVillageMap.values());
    const uniqueVillageNames = uniqueVillages.map((v) => v.village_name);
    const uniqueDistrictNames = Array.from(uniqueDistricts);

    // 5. Fetch Nearest Facilities
    const facRows = this.db
      .prepare(`
        SELECT * FROM road_nearest_facilities
        WHERE road_key = ?
      `)
      .all(roadKey) as any[];

    const facMap = new Map<string, any>(facRows.map((f) => [f.facility_type, f]));

    // 6. Fetch Priority Score & Observations
    const scoreRow = this.db
      .prepare(`
        SELECT 
          s.priority_rank,
          s.final_score,
          s.tier_category,
          s.subtotal_teknis,
          s.subtotal_akses,
          s.subtotal_pelayanan,
          s.subtotal_spasial,
          s.factor_breakdown
        FROM road_priority_scores s
        JOIN scoring_runs sr ON s.run_id = sr.run_id
        JOIN priority_models pm ON sr.model_id = pm.model_id
        WHERE s.road_key = ? AND sr.operating_mode = ? AND pm.model_code = ?
        ORDER BY sr.executed_at DESC LIMIT 1
      `)
      .get(roadKey, operatingMode, modelCode) as any;

    const obsRows = this.db
      .prepare(`
        SELECT o.variable_code, o.raw_value, o.normalized_value, v.variable_label, v.category_code
        FROM road_variable_observations o
        JOIN variable_definitions v ON o.variable_code = v.variable_code
        WHERE o.road_key = ? AND o.operating_mode = ?
      `)
      .all(roadKey, operatingMode) as any[];
    const obsMap = new Map<string, any>(obsRows.map((o) => [o.variable_code, o]));

    // Extract Top 3 Factors
    let topFactors: Array<{
      variable_code: string;
      variable_label: string;
      effective_weight: number;
      contribution: number;
      pct_of_score: number;
    }> = [];

    if (scoreRow && scoreRow.factor_breakdown) {
      try {
        const bd = JSON.parse(scoreRow.factor_breakdown);
        const factors: any[] = Array.isArray(bd.factors) ? bd.factors : Object.values(bd.factors || {});
        factors.sort((a, b) => b.contribution - a.contribution);
        topFactors = factors.slice(0, 3).map((f) => {
          const obs = obsMap.get(f.variable_code);
          const pct = scoreRow.final_score > 0 ? (f.contribution / scoreRow.final_score) * 100 : 0;
          return {
            variable_code: f.variable_code,
            variable_label: obs?.variable_label || f.variable_code,
            effective_weight: f.effective_weight,
            contribution: f.contribution,
            pct_of_score: Math.round(pct * 10) / 10,
          };
        });
      } catch {}
    }

    // Availability Profile
    const availability: RoadNarrativeAvailability = {
      road_key: roadKey,
      has_geometry: !!road.geometry_geojson,
      has_conditions_2025: !!cond,
      has_spatial_profile: !!spatialProfile,
      has_rtrw_breakdown: !!(spatialProfile && spatialProfile.rtrw_classes && spatialProfile.rtrw_classes.length > 0),
      has_village_intersections: uniqueVillages.length > 0,
      has_household_demographics: totalHouseholds > 0,
      has_population_count: false, // Authoritative source stores households
      has_nearest_facilities: facRows.length > 0,
      has_connected_routes: facRows.some((f) => f.network_distance_m >= 0),
      has_priority_score: !!scoreRow,
      has_technical_width: road.width_m_official > 0,
      has_technical_surface: obsMap.has('norm_permukaan_aspal_penmac'),
    };

    // Build Templates
    // =========================================================================
    // TEMPLATE 1: GAMBARAN UMUM RUAS
    // =========================================================================
    const geomKm = road.geometry_length_m ? road.geometry_length_m / 1000 : null;
    const roadName = road.display_name || road.canonical_name;
    const distName = road.district_name || 'Kandangan';
    const desaListStr = uniqueVillageNames.length > 0 ? uniqueVillageNames.join(', ') : road.village_coverage;

    let t1Text = `Ruas Jalan ${roadName} (Nomor Ruas: ${road.nomor_ruas}, Kode: ${road.road_key}) memiliki panjang resmi ${this.formatNumber(road.length_km_official)} km dan berada di wilayah administrasi Kecamatan ${distName}.`;
    if (uniqueDistrictNames.length > 1) {
      t1Text += ` Berdasarkan lintasan jaringan, ruas ini menghubungkan lintas kecamatan meliputi Kecamatan ${uniqueDistrictNames.join(' dan Kecamatan ')}.`;
    }
    if (uniqueVillageNames.length > 0) {
      t1Text += ` Berdasarkan data geospasial jaringan jalan, ruas ini melintasi ${uniqueVillageNames.length} desa/kelurahan, yaitu ${desaListStr}.`;
    } else {
      t1Text += ` Cakupan administrasi desa yang tercatat meliputi ${road.village_coverage}.`;
    }
    t1Text += ` Status pengelolaan ruas merupakan jalan kabupaten di bawah kewenangan teknis Pemerintah Kabupaten Hulu Sungai Selatan.`;

    const template1 = {
      title: 'Gambaran Umum Ruas',
      text: t1Text,
      attributes: {
        nomor_ruas: road.nomor_ruas,
        kode_ruas: road.road_key,
        nama_resmi: road.canonical_name,
        panjang_resmi_km: road.length_km_official,
        panjang_geometri_km: geomKm ? Math.round(geomKm * 1000) / 1000 : null,
        kecamatan_utama: distName,
        status_administrasi: 'Jalan Kabupaten',
        daftar_desa: uniqueVillageNames,
      },
    };

    // =========================================================================
    // TEMPLATE 2: CAKUPAN WILAYAH DAN DEMOGRAFI
    // =========================================================================
    let t2Text = `Ruas ini melintasi ${uniqueVillages.length} desa/kelurahan di ${uniqueDistrictNames.length} kecamatan.`;
    if (totalHouseholds > 0) {
      t2Text += ` Akumulasi jumlah rumah tangga pada wilayah desa/kelurahan yang dilalui tercatat sebanyak ${totalHouseholds.toLocaleString('id-ID')} keluarga (KK) berdasarkan data Disdukcapil Kabupaten Hulu Sungai Selatan Tahun 2025.`;
    } else {
      t2Text += ` Data agregat rumah tangga pada desa yang dilintasi tidak tercatat secara lengkap dalam basis data kependudukan 2025.`;
    }

    t2Text += ` Informasi ini mencerminkan keberadaan populasi pada wilayah administratif desa yang dilintasi ruas dan tidak secara otomatis menunjukkan bahwa seluruh rumah tangga tersebut menggantungkan mobilitas hariannya secara eksklusif pada ruas jalan ini.`;

    const popObsVal = obsMap.get('norm_penduduk_dilayani')?.raw_value;
    if (popObsVal !== undefined && popObsVal !== null) {
      t2Text += ` Pada model prioritas penanganan, variabel penduduk terlayani memperhitungkan bobot pelayanan relatif sebesar ${this.formatNumber(popObsVal, 4)} sebagai indikator kemanfaatan publik.`;
    }

    const template2 = {
      title: 'Cakupan Wilayah dan Demografi',
      text: t2Text,
      attributes: {
        jumlah_desa: uniqueVillages.length,
        jumlah_kecamatan: uniqueDistrictNames.length,
        daftar_kecamatan: uniqueDistrictNames,
        daftar_desa: uniqueVillageNames,
        total_rumah_tangga: totalHouseholds,
        data_jiwa_status: 'Data agregat per desa tersedia dalam satuan Rumah Tangga/KK (Disdukcapil 2025)',
        indikator_penduduk_terlayani: popObsVal !== undefined ? popObsVal : null,
        catatan_metodologi:
          'Perhitungan demografi berbasis desa unik yang beririsan dengan geometri ruas jalan.',
      },
    };

    // =========================================================================
    // TEMPLATE 3: KARAKTERISTIK TATA RUANG (RTRW 2024-2044)
    // =========================================================================
    let t3Text = `Berdasarkan Rencana Tata Ruang Wilayah (RTRW) Kabupaten Hulu Sungai Selatan Tahun 2024–2044, `;
    const rtrwClassesList: Array<{ name: string; macro: string; length_km: number; pct: number }> = [];

    let dominantClassName = 'Data tidak tersedia';
    let dominantPct = 0;

    if (spatialProfile && spatialProfile.rtrw_classes && spatialProfile.rtrw_classes.length > 0) {
      const sortedClasses = [...spatialProfile.rtrw_classes].sort((a, b) => b.length_m - a.length_m);
      dominantClassName = sortedClasses[0].name;
      dominantPct = sortedClasses[0].pct;

      for (const c of sortedClasses) {
        rtrwClassesList.push({
          name: c.name,
          macro: c.macro,
          length_km: Math.round((c.length_m / 1000) * 100) / 100,
          pct: Math.round(c.pct * 10) / 10,
        });
      }

      const classSummaries = sortedClasses
        .slice(0, 4)
        .map((c) => `${c.name} sepanjang ${this.formatNumber(c.length_m / 1000)} km (${this.formatNumber(c.pct, 1)}%)`);

      t3Text += `ruas ini didominasi oleh peruntukan ruang ${dominantClassName} dengan porsi ${this.formatNumber(dominantPct, 1)}%. Secara keseluruhan, peruntukan ruang yang beririsan meliputi ${classSummaries.join(', ')}.`;

      if (spatialProfile.lindung_pct > 0) {
        t3Text += ` Ruas ini juga melintasi kawasan lindung seluas ${this.formatNumber(spatialProfile.lindung_pct, 1)}% dari panjang ruas.`;
      }
      if (spatialProfile.badan_air_pct > 0) {
        t3Text += ` Terdapat persilangan dengan badan air/sungai sebesar ${this.formatNumber(spatialProfile.badan_air_pct, 1)}%.`;
      }
    } else {
      t3Text += `informasi profil peruntukan ruang pola ruang belum tersedia pada ruas ini.`;
    }

    t3Text += ` Perlu ditegaskan bahwa data ini menggambarkan peruntukan ruang formal berdasarkan RTRW Kabupaten Hulu Sungai Selatan 2024–2044, bukan penggunaan lahan aktual di lapangan.`;

    const template3 = {
      title: 'Karakteristik Tata Ruang',
      text: t3Text,
      attributes: {
        dasar_hukum: 'RTRW Kabupaten Hulu Sungai Selatan 2024–2044',
        kelas_dominan: dominantClassName,
        persentase_dominan: dominantPct,
        permukiman_pct: spatialProfile?.permukiman_pct || 0,
        produksi_pct: spatialProfile?.produksi_pct || 0,
        lindung_pct: spatialProfile?.lindung_pct || 0,
        badan_air_pct: spatialProfile?.badan_air_pct || 0,
        pariwisata_pct: spatialProfile?.pariwisata_pct || 0,
        tidak_tercakup_pct: spatialProfile?.uncovered_pct || 0,
        rincian_kelas: rtrwClassesList,
        catatan_peruntukan:
          'Informasi merupakan alokasi pola ruang formal RTRW, bukan tutupan lahan aktual.',
      },
    };

    // =========================================================================
    // TEMPLATE 4: AKSESIBILITAS DAN PELAYANAN
    // =========================================================================
    const distKandanganM = spatialProfile?.jarak_ibukota_kabupaten_m;
    let distKandanganDisplay = 'Data tidak tersedia';
    if (distKandanganM !== null && distKandanganM !== undefined) {
      distKandanganDisplay =
        distKandanganM < 1000
          ? `${Math.round(distKandanganM)} meter`
          : `${this.formatNumber(distKandanganM / 1000)} km`;
    }

    const hosp = facMap.get('hospital');
    const pusk = facMap.get('puskesmas');
    const sch = facMap.get('school');
    const mkt = facMap.get('market');

    const formatFac = (fac: any) => {
      if (!fac) return { name: 'Data tidak tersedia', distance: 'Data tidak tersedia', status: 'UNAVAILABLE' as const };
      if (fac.network_distance_m < 0) {
        return {
          name: fac.nearest_facility_name || 'Rute terputus',
          distance: 'Rute tidak terhubung',
          status: 'DISCONNECTED' as const,
        };
      }
      const km = fac.network_distance_m / 1000;
      const dStr = km < 1 ? `${Math.round(fac.network_distance_m)} meter` : `${this.formatNumber(km)} km`;
      return {
        name: fac.nearest_facility_name,
        distance: dStr,
        status: 'CONNECTED' as const,
      };
    };

    const hospObj = formatFac(hosp);
    const puskObj = formatFac(pusk);
    const schObj = formatFac(sch);
    const mktObj = formatFac(mkt);

    let t4Text = `Dari aspek aksesibilitas wilayah, jarak ruas terhadap pusat Ibukota Kabupaten (Kandangan) tercatat sekitar ${distKandanganDisplay}.`;
    t4Text += ` Berdasarkan analisis penelusuran jaringan jalan terpendek (shortest path Dijkstra), `;

    const facSentences: string[] = [];
    if (hospObj.status === 'CONNECTED') {
      facSentences.push(`fasilitas kesehatan rujukan terdekat adalah ${hospObj.name} dengan jarak tempuh jaringan ${hospObj.distance}`);
    } else if (hospObj.status === 'DISCONNECTED') {
      facSentences.push(`fasilitas RSUD belum terhubung secara langsung melalui jaringan jalan kabupaten yang tersambung`);
    }

    if (puskObj.status === 'CONNECTED') {
      facSentences.push(`pelayanan kesehatan primer terdekat adalah ${puskObj.name} sejauh ${puskObj.distance}`);
    }

    if (schObj.status === 'CONNECTED') {
      facSentences.push(`fasilitas pendidikan terdekat adalah ${schObj.name} pada jarak ${schObj.distance}`);
    }

    if (mktObj.status === 'CONNECTED') {
      facSentences.push(`pusat kegiatan ekonomi pasar terdekat adalah ${mktObj.name} sejauh ${mktObj.distance}`);
    }

    t4Text += facSentences.join(', ') + '.';
    t4Text += ` Seluruh jarak dihitung berdasarkan lintasan geometri jalan riil dari titik akses ruas menuju fasilitas publik bersangkutan.`;

    const template4 = {
      title: 'Aksesibilitas dan Pelayanan',
      text: t4Text,
      attributes: {
        jarak_kandangan: distKandanganDisplay,
        rsud: hospObj,
        puskesmas: puskObj,
        sekolah: schObj,
        pasar: mktObj,
        metode_jarak: 'Multi-Source Dijkstra Shortest Path pada Graf Jalan Kabupaten',
      },
    };

    // =========================================================================
    // TEMPLATE 5: KONDISI DAN KEMANTAPAN JALAN
    // =========================================================================
    let t5Text = '';
    let domCondition = 'Data tidak tersedia';

    if (cond) {
      const condArr = [
        { label: 'Baik', km: cond.baik_km, pct: cond.baik_pct },
        { label: 'Sedang', km: cond.sedang_km, pct: cond.sedang_pct },
        { label: 'Rusak Ringan', km: cond.rusak_ringan_km, pct: cond.rusak_ringan_pct },
        { label: 'Rusak Berat', km: cond.rusak_berat_km, pct: cond.rusak_berat_pct },
      ];
      condArr.sort((a, b) => b.km - a.km);
      domCondition = `${condArr[0].label} (${this.formatNumber(condArr[0].pct, 1)}%)`;

      t5Text = `Berdasarkan data kondisi jalan tahun 2025 (Dashboard Analitik Data Jalan 2025), ruas ini memiliki panjang total ${this.formatNumber(cond.total_panjang_km)} km dengan tingkat kemantapan sebesar ${this.formatNumber(cond.mantap_pct, 1)}% (${this.formatNumber(cond.mantap_km)} km mantap).`;
      t5Text += ` Proporsi kerusakan tidak mantap tercatat sebesar ${this.formatNumber(cond.tidak_mantap_pct, 1)}% (${this.formatNumber(cond.tidak_mantap_km)} km).`;
      t5Text += ` Rincian fisik kondisi jalan meliputi: Baik ${this.formatNumber(cond.baik_km)} km (${this.formatNumber(cond.baik_pct, 1)}%), Sedang ${this.formatNumber(cond.sedang_km)} km (${this.formatNumber(cond.sedang_pct, 1)}%), Rusak Ringan ${this.formatNumber(cond.rusak_ringan_km)} km (${this.formatNumber(cond.rusak_ringan_pct, 1)}%), dan Rusak Berat ${this.formatNumber(cond.rusak_berat_km)} km (${this.formatNumber(cond.rusak_berat_pct, 1)}%).`;

      if (cond.mantap_pct >= 90) {
        t5Text += ` Secara umum ruas berada dalam kondisi kemantapan yang prima dan memerlukan pemeliharaan rutin untuk mempertahankan umur layanan.`;
      } else if (cond.mantap_pct >= 60) {
        t5Text += ` Sebagian besar ruas masih berfungsi dengan baik, namun terdapat segmen yang memerlukan penanganan berkala agar kerusakan tidak meluas.`;
      } else {
        t5Text += ` Sebagian besar ruas mengalami penurunan kondisi fisik dan memerlukan penanganan rehabilitasi atau rekonstruksi prioritas.`;
      }
    } else {
      t5Text = `Data kondisi dan kemantapan jalan tahun 2025 belum tersedia untuk ruas ini.`;
    }

    const template5 = {
      title: 'Kondisi dan Kemantapan Jalan',
      text: t5Text,
      attributes: {
        tahun_survei: cond?.survey_year || 2025,
        panjang_total_km: cond?.total_panjang_km || road.length_km_official,
        mantap_km: cond?.mantap_km || 0,
        mantap_pct: cond?.mantap_pct || 0,
        tidak_mantap_km: cond?.tidak_mantap_km || 0,
        tidak_mantap_pct: cond?.tidak_mantap_pct || 0,
        baik_km: cond?.baik_km || 0,
        baik_pct: cond?.baik_pct || 0,
        sedang_km: cond?.sedang_km || 0,
        sedang_pct: cond?.sedang_pct || 0,
        rusak_ringan_km: cond?.rusak_ringan_km || 0,
        rusak_ringan_pct: cond?.rusak_ringan_pct || 0,
        rusak_berat_km: cond?.rusak_berat_km || 0,
        rusak_berat_pct: cond?.rusak_berat_pct || 0,
        klasifikasi_dominan: domCondition,
      },
    };

    // =========================================================================
    // TEMPLATE 6: KARAKTERISTIK TEKNIS
    // =========================================================================
    const aspalObs = obsMap.get('norm_permukaan_aspal_penmac')?.raw_value;
    const betonObs = obsMap.get('norm_permukaan_beton')?.raw_value;

    let lebarDisplay = 'Data tidak tersedia';
    if (road.width_m_official && road.width_m_official > 0) {
      lebarDisplay = `${this.formatNumber(road.width_m_official, 1)} meter`;
    }

    let surfaceDisplay = 'Data tidak tersedia';
    if (aspalObs !== undefined && aspalObs !== null && aspalObs > 0.8) {
      surfaceDisplay = 'Didominasi Perkerasan Aspal / Penetrasi Macadam';
    } else if (betonObs !== undefined && betonObs !== null && betonObs > 0.8) {
      surfaceDisplay = 'Didominasi Perkerasan Kaku (Rigid Beton)';
    } else if (aspalObs !== undefined && betonObs !== undefined) {
      surfaceDisplay = `Campuran (Aspal: ${this.formatNumber((aspalObs || 0) * 100, 1)}%, Beton: ${this.formatNumber((betonObs || 0) * 100, 1)}%)`;
    }

    let t6Text = `Secara teknis, ruas jalan memiliki lebar perkerasan ${lebarDisplay} dengan status klasifikasi sebagai Jalan Kabupaten.`;
    if (surfaceDisplay !== 'Data tidak tersedia') {
      t6Text += ` Jenis permukaan jalan tercatat ${surfaceDisplay.toLowerCase()}.`;
    } else {
      t6Text += ` Informasi komposisi material permukaan jalan belum tercatat secara rinci dalam inventarisasi teknis.`;
    }

    const template6 = {
      title: 'Karakteristik Teknis',
      text: t6Text,
      attributes: {
        lebar_jalan_m: road.width_m_official > 0 ? road.width_m_official : null,
        lebar_display: lebarDisplay,
        permukaan_aspal_pct: aspalObs !== undefined && aspalObs !== null ? Math.round(aspalObs * 100) : null,
        permukaan_beton_pct: betonObs !== undefined && betonObs !== null ? Math.round(betonObs * 100) : null,
        permukaan_display: surfaceDisplay,
        status_ruas: 'Jalan Kabupaten',
      },
    };

    // =========================================================================
    // TEMPLATE 7: HASIL PENILAIAN PRIORITAS
    // =========================================================================
    let t7Text = '';
    const tierLabels: Record<string, string> = {
      TOP_35: 'Prioritas Utama (Top 35)',
      TOP_70: 'Prioritas Tinggi (Top 70)',
      TOP_105: 'Prioritas Menengah (Top 105)',
      REGULAR: 'Penanganan Reguler (Peringkat > 105)',
    };

    if (scoreRow) {
      const tierLabel = tierLabels[scoreRow.tier_category] || scoreRow.tier_category;
      t7Text = `Berdasarkan model penilaian prioritas ${modelCode}, ruas ini memperoleh skor komposit sebesar ${this.formatNumber(scoreRow.final_score, 4)} dan menempati peringkat ${scoreRow.priority_rank} dari total 350 ruas jalan kabupaten, yang menempatkannya pada kelompok ${tierLabel}.`;

      if (topFactors.length > 0) {
        const factorStr = topFactors
          .map((f) => `${f.variable_label} (kontribusi ${this.formatNumber(f.contribution, 4)} atau ${this.formatNumber(f.pct_of_score, 1)}%)`)
          .join(', ');
        t7Text += ` Tiga indikator yang memberikan kontribusi terbesar terhadap pembentukan skor prioritas ruas ini adalah: ${factorStr}.`;
      }

      t7Text += ` Hasil pemeringkatan ini merupakan posisi relatif berdasarkan model multi-kriteria AHP/WSM sebagai instrumen pendukung keputusan (decision support system) dan bukan merupakan penetapan otomatis alokasi anggaran penanganan lapangan.`;
    } else {
      t7Text = `Penilaian prioritas komposit belum dihitung untuk ruas ini.`;
    }

    const template7 = {
      title: 'Hasil Penilaian Prioritas',
      text: t7Text,
      attributes: {
        model_aktif: modelCode,
        skor_komposit: scoreRow?.final_score || 0,
        peringkat: scoreRow?.priority_rank || 0,
        total_ruas: 350,
        kategori_tier: scoreRow?.tier_category || 'REGULAR',
        label_tier: tierLabels[scoreRow?.tier_category || 'REGULAR'] || 'Reguler',
        top_factors: topFactors,
        penjelasan_metodologis:
          'Penilaian menggunakan Multi-Criteria Decision Analysis (AHP/WSM) terhadap 17 indikator teknis dan spasial.',
      },
    };

    // =========================================================================
    // TEMPLATE 8: KESIMPULAN KARAKTERISTIK RUAS
    // =========================================================================
    let t8Text = `Ruas Jalan ${roadName} di Kecamatan ${distName} memiliki arti strategis sebagai penghubung ${uniqueVillages.length} desa dengan total sekitar ${totalHouseholds.toLocaleString('id-ID')} rumah tangga di sekitarnya.`;
    if (dominantClassName !== 'Data tidak tersedia') {
      t8Text += ` Karakteristik tata ruang kawasan didominasi oleh peruntukan ${dominantClassName.toLowerCase()} (${this.formatNumber(dominantPct, 1)}%).`;
    }
    if (cond) {
      t8Text += ` Kondisi fisik saat ini mencatatkan kemantapan sebesar ${this.formatNumber(cond.mantap_pct, 1)}% (${this.formatNumber(cond.mantap_km)} km mantap dari total ${this.formatNumber(cond.total_panjang_km)} km).`;
    }
    if (scoreRow) {
      t8Text += ` Dalam pemeringkatan prioritas kabupaten, ruas ini berada pada peringkat ke-${scoreRow.priority_rank} dengan skor ${this.formatNumber(scoreRow.final_score, 4)} (${tierLabels[scoreRow.tier_category] || scoreRow.tier_category}), dengan kontribusi utama berasal dari faktor ${topFactors[0]?.variable_label || 'teknis'}.`;
    }
    t8Text += ` Integrasi data teknis, spasial, dan konektivitas fasilitas ini memberikan landasan berbasis bukti yang objektif bagi perencanaan dan alokasi program penanganan infrastruktur jalan Kabupaten Hulu Sungai Selatan.`;

    const template8 = {
      title: 'Kesimpulan Karakteristik Ruas',
      text: t8Text,
    };

    // =========================================================================
    // RINGKASAN EKSEKUTIF (1-3 PARAGRAF)
    // =========================================================================
    const ringkasan = [
      `Ruas Jalan ${roadName} (No. Ruas ${road.nomor_ruas}) memiliki panjang resmi ${this.formatNumber(road.length_km_official)} km di Kecamatan ${distName}. Berdasarkan data geospasial, ruas ini melintasi ${uniqueVillages.length} desa/kelurahan dengan cakupan ${totalHouseholds > 0 ? `${totalHouseholds.toLocaleString('id-ID')} rumah tangga (Disdukcapil 2025)` : 'wilayah desa terlintasi'}.`,
      cond
        ? `Tingkat kemantapan jalan tahun 2025 tercatat sebesar ${this.formatNumber(cond.mantap_pct, 1)}% (${this.formatNumber(cond.mantap_km)} km mantap dan ${this.formatNumber(cond.tidak_mantap_km)} km tidak mantap). Berdasarkan pola ruang RTRW 2024–2044, koridor jalan ini didominasi oleh peruntukan ${dominantClassName.toLowerCase()} (${this.formatNumber(dominantPct, 1)}%).`
        : `Koridor jalan didominasi oleh peruntukan pola ruang RTRW ${dominantClassName.toLowerCase()}.`,
      scoreRow
        ? `Pada model prioritas penanganan jalan kabupaten (${modelCode}), ruas ini menempati peringkat ke-${scoreRow.priority_rank} dari 350 ruas dengan skor komposit ${this.formatNumber(scoreRow.final_score, 4)} (${tierLabels[scoreRow.tier_category] || scoreRow.tier_category}).`
        : `Ruas ini tercatat dalam sistem perencanaan jalan Kabupaten Hulu Sungai Selatan.`,
    ].join('\n\n');

    return {
      road_key: roadKey,
      nomor_ruas: road.nomor_ruas,
      road_name: roadName,
      ringkasan_eksekutif: ringkasan,
      template1_gambaran_umum: template1,
      template2_cakupan_demografi: template2,
      template3_tata_ruang_rtrw: template3,
      template4_aksesibilitas_pelayanan: template4,
      template5_kondisi_kemantapan: template5,
      template6_karakteristik_teknis: template6,
      template7_penilaian_prioritas: template7,
      template8_kesimpulan_karakteristik: template8,
      availability,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Batch audit and generate narratives for all 350 canonical roads.
   */
  public generateAllNarratives(
    operatingMode: string = 'OPERATIONAL_2025',
    modelCode: string = 'POLICY_DEFAULT_V1'
  ): {
    total_evaluated: number;
    success_count: number;
    failed_count: number;
    availability_matrix: {
      has_geometry: number;
      has_conditions_2025: number;
      has_spatial_profile: number;
      has_rtrw_breakdown: number;
      has_village_intersections: number;
      has_household_demographics: number;
      has_nearest_facilities: number;
      has_connected_routes: number;
      has_priority_score: number;
      has_technical_width: number;
    };
    results: RoadNarrativeSections[];
  } {
    const roads = this.db.prepare('SELECT road_key FROM roads ORDER BY road_key ASC').all() as Array<{ road_key: string }>;
    const results: RoadNarrativeSections[] = [];

    const matrix = {
      has_geometry: 0,
      has_conditions_2025: 0,
      has_spatial_profile: 0,
      has_rtrw_breakdown: 0,
      has_village_intersections: 0,
      has_household_demographics: 0,
      has_nearest_facilities: 0,
      has_connected_routes: 0,
      has_priority_score: 0,
      has_technical_width: 0,
    };

    let success = 0;
    let failed = 0;

    for (const r of roads) {
      const nar = this.generateNarrative(r.road_key, operatingMode, modelCode);
      if (nar) {
        success++;
        results.push(nar);
        if (nar.availability.has_geometry) matrix.has_geometry++;
        if (nar.availability.has_conditions_2025) matrix.has_conditions_2025++;
        if (nar.availability.has_spatial_profile) matrix.has_spatial_profile++;
        if (nar.availability.has_rtrw_breakdown) matrix.has_rtrw_breakdown++;
        if (nar.availability.has_village_intersections) matrix.has_village_intersections++;
        if (nar.availability.has_household_demographics) matrix.has_household_demographics++;
        if (nar.availability.has_nearest_facilities) matrix.has_nearest_facilities++;
        if (nar.availability.has_connected_routes) matrix.has_connected_routes++;
        if (nar.availability.has_priority_score) matrix.has_priority_score++;
        if (nar.availability.has_technical_width) matrix.has_technical_width++;
      } else {
        failed++;
      }
    }

    return {
      total_evaluated: roads.length,
      success_count: success,
      failed_count: failed,
      availability_matrix: matrix,
      results,
    };
  }
}
