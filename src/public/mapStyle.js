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
  districts: {
    color: '#475569', // Slate-600
    weight: 1.5,
    dashArray: '4, 4',
    fill: true,
    fillColor: '#0284c7',
    fillOpacity: 0.03,
  },
  villages: {
    color: '#94a3b8', // Slate-400
    weight: 0.8,
    dashArray: '2, 3',
    fill: false,
  },
};

export const RTRW_COLORS = {
  'Kawasan Perkebunan': '#a3e635',
  'Kawasan Tanaman Pangan': '#fde047',
  'Kawasan Permukiman Perdesaan': '#fed7aa',
  'Kawasan Permukiman Perkotaan': '#fca5a5',
  'Badan Air': '#67e8f9',
  'Kawasan Hutan Produksi Tetap': '#86efac',
  'Kawasan Hutan Lindung': '#4ade80',
  'Kawasan Perikanan Budi Daya': '#7dd3fc',
  'Kawasan Pariwisata': '#d8b4fe',
  'Kawasan Hutan Produksi yang dapat Dikonversi': '#bbf7d0',
  'Kawasan Lindung Gambut': '#c084fc',
  'Cagar Alam': '#22c55e',
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

