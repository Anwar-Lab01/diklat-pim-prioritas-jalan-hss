// ====================================================================
// MAP SYMBOLOGY & STYLE CONTRACT (PHASE 4)
// Sistem Pendukung Prioritas Penanganan Jalan Kabupaten HSS
// ====================================================================

export const ROAD_TIER_STYLES = {
  TOP_35: {
    color: '#e11d48', // Rose-600
    weight: 5.5,
    opacity: 0.95,
    label: 'Prioritas Sangat Mendesak (Top 35 / Top 10%)',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    zIndex: 1000,
  },
  TOP_70: {
    color: '#ea580c', // Orange-600
    weight: 4.5,
    opacity: 0.90,
    label: 'Prioritas Tinggi (Rank 36–70 / Top 20%)',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    zIndex: 800,
  },
  TOP_105: {
    color: '#eab308', // Amber-500
    weight: 3.5,
    opacity: 0.85,
    label: 'Prioritas Kebijakan (Rank 71–105 / Top 30%)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    zIndex: 600,
  },
  REGULAR: {
    color: '#64748b', // Slate-500
    weight: 2.0,
    opacity: 0.65,
    label: 'Reguler Jaringan (Rank 106–350)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    zIndex: 400,
  },
};

export const SELECTION_HALO_STYLE = {
  color: '#06b6d4', // Cyan-500
  weight: 12,
  opacity: 0.8,
  lineCap: 'round',
  lineJoin: 'round',
};

export const HIT_TARGET_STYLE = {
  weight: 16,
  opacity: 0,
  lineCap: 'round',
  lineJoin: 'round',
};

export const REFERENCE_NETWORK_STYLES = {
  PROVINSI: {
    color: '#6366f1', // Indigo-500
    weight: 3.5,
    opacity: 0.85,
    dashArray: null,
    label: 'Jalan Provinsi (4 Ruas)',
  },
  NASIONAL: {
    color: '#0f766e', // Teal-700
    weight: 4.5,
    opacity: 0.90,
    dashArray: null,
    label: 'Jalan Nasional (8 Ruas)',
  },
  KONEKTOR_ANALISIS: {
    color: '#94a3b8', // Slate-400
    weight: 2.0,
    opacity: 0.85,
    dashArray: '5, 5',
    label: 'Konektor Jaringan Analisis (4 Titik Topologi)',
  },
};

export const ADMINISTRATIVE_STYLES = {
  kabupaten: {
    color: '#0f172a', // Slate-900 (darkest administrative boundary)
    weight: 3.5, // Visually strongest border (3–4 px)
    opacity: 1.0,
    dashArray: null, // Solid line
    fill: false,
    label: 'Batas Kabupaten Hulu Sungai Selatan',
  },
  districts: {
    color: '#475569', // Slate-600 (medium neutral)
    weight: 1.8, // Thinner than kabupaten (1.5–2 px)
    opacity: 0.85,
    dashArray: '6, 4', // Dashed line
    fill: false,
    label: 'Batas 11 Kecamatan',
  },
  villages: {
    color: '#94a3b8', // Slate-400 (subtle neutral)
    weight: 0.8, // Thin dotted line
    opacity: 0.6,
    dashArray: '2, 4', // Dotted subtle line
    fill: false,
    label: 'Batas 148 Desa/Kelurahan',
  },
};

/**
 * 12 Authoritative Categorical Pola Ruang RTRW Symbology Families
 * Semantic visual families:
 * - Water: Blue family
 * - Settlements: Red / Rose family
 * - Agriculture: Yellow / Golden & Olive / Lime family
 * - Forest: Forest green, medium green & HPK green-brown
 * - Conservation / Sensitive: Deep emerald & Purple-brown
 * - Fisheries: Cyan / Aqua family
 * - Tourism: Magenta / Violet family
 */
export const RTRW_COLORS = {
  'Badan Air': '#0284c7', // Strong blue (Sky-600)
  'Kawasan Permukiman Perkotaan': '#dc2626', // Strong red / coral (Red-600)
  'Kawasan Permukiman Perdesaan': '#fb7185', // Lighter red / rose (Rose-400)
  'Kawasan Tanaman Pangan': '#eab308', // Yellow / golden (Amber-500)
  'Kawasan Perkebunan': '#65a30d', // Olive / lime-green (Lime-600)
  'Kawasan Hutan Lindung': '#14532d', // Dark forest green (Green-900)
  'Kawasan Hutan Produksi Tetap': '#16a34a', // Medium green (Green-600)
  'Kawasan Hutan Produksi yang dapat Dikonversi': '#854d0e', // Green-brown secondary forest (Amber-800)
  'Cagar Alam': '#064e3b', // Deep conservation green (Emerald-900)
  'Kawasan Lindung Gambut': '#7e22ce', // Purple/brown distinctive tone (Purple-700)
  'Kawasan Perikanan Budi Daya': '#06b6d4', // Cyan / aqua (Cyan-500)
  'Kawasan Pariwisata': '#c026d3', // Magenta / violet (Fuchsia-600)
};

export const RTRW_FAMILY_LABELS = {
  'Badan Air': 'Air (Badan Air)',
  'Kawasan Permukiman Perkotaan': 'Permukiman (Perkotaan)',
  'Kawasan Permukiman Perdesaan': 'Permukiman (Perdesaan)',
  'Kawasan Tanaman Pangan': 'Pertanian (Tanaman Pangan)',
  'Kawasan Perkebunan': 'Pertanian (Perkebunan)',
  'Kawasan Hutan Lindung': 'Kehutanan (Hutan Lindung)',
  'Kawasan Hutan Produksi Tetap': 'Kehutanan (Hutan Produksi Tetap)',
  'Kawasan Hutan Produksi yang dapat Dikonversi': 'Kehutanan (HPK)',
  'Cagar Alam': 'Konservasi (Cagar Alam)',
  'Kawasan Lindung Gambut': 'Konservasi (Lindung Gambut)',
  'Kawasan Perikanan Budi Daya': 'Perikanan (Budi Daya)',
  'Kawasan Pariwisata': 'Pariwisata',
};

export const BASEMAP_CONFIG = {
  neutral: {
    id: 'neutral',
    label: 'Latar Netral',
    isOffline: true,
    color: '#f1f5f9',
  },
  osm: {
    id: 'osm',
    label: 'Peta Jalan',
    isOffline: false,
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | Dinas PUTR Kab. HSS',
    maxZoom: 19,
  },
  satellite: {
    id: 'satellite',
    label: 'Citra Satelit',
    isOffline: false,
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
};

/**
 * Returns Leaflet DivIcon with SVG markup for public facilities.
 */
export function createFacilityIcon(facilityType) {
  if (typeof L === 'undefined') return null;

  switch (facilityType) {
    case 'hospital': // RSUD
      return L.divIcon({
        className: 'facility-icon-hospital',
        html: `
          <div class="w-6 h-6 rounded-md bg-rose-600 text-white shadow-md border-2 border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform" title="RSUD">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M19 10.5h-5.5V5c0-.55-.45-1-1-1h-1c-.55 0-1 .45-1 1v5.5H5c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h5.5V19c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-5.5H19c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1z"/>
            </svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
      });

    case 'puskesmas': // Puskesmas
      return L.divIcon({
        className: 'facility-icon-puskesmas',
        html: `
          <div class="w-5 h-5 rounded-full bg-emerald-600 text-white shadow-md border-2 border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform" title="Puskesmas">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
            </svg>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

    case 'school': // SD / SMP
      return L.divIcon({
        className: 'facility-icon-school',
        html: `
          <div class="w-4 h-4 rounded-full bg-sky-600 text-white shadow-sm border border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform" title="Sekolah (SD/SMP)">
            <svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3z M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
            </svg>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
      });

    case 'market': // Pasar
      return L.divIcon({
        className: 'facility-icon-market',
        html: `
          <div class="w-5 h-5 rounded-full bg-amber-500 text-slate-900 shadow-md border-2 border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform" title="Pasar Rakyat">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 6H6v-4h6v4z"/>
            </svg>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
      });

    default:
      return L.divIcon({
        className: 'facility-icon-default',
        html: `<div class="w-3 h-3 rounded-full bg-slate-400 border border-white"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
  }
}

