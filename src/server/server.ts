import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { PROJECT_ROOT } from '../config/constants.ts';
import { UiDataService } from '../services/uiDataService.ts';
import { ModelService } from '../services/modelService.ts';
import { SpatialService } from '../services/spatialService.ts';
import { SimulationService } from '../services/simulationService.ts';
import { SpatialDerivationService } from '../services/spatialDerivationService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  const uiService = new UiDataService();
  const modelService = new ModelService();
  const spatialService = new SpatialService();
  const simulationService = new SimulationService();
  const derivationService = new SpatialDerivationService();

  app.use(express.json());

  // CORS headers for development/testing
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 1. Dashboard API
  app.get('/api/dashboard', (req, res) => {
    try {
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = uiService.getDashboardData(mode, modelCode);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. 350-Road Priority Table API
  app.get('/api/roads', (req, res) => {
    try {
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = uiService.getPriorityTableData(mode, modelCode);
      res.json({ success: true, total: data.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Single Road Detail / 17-Factor Explainability API
  app.get('/api/roads/:roadKey', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = uiService.getRoadDetailData(roadKey, mode, modelCode);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: `ROAD_NOT_FOUND: Road with key '${roadKey}' does not exist.`,
        });
      }
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Data Provenance & Verification Checklist API
  app.get('/api/provenance', (req, res) => {
    try {
      const data = uiService.getProvenanceData();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Active Model Baseline Definition API
  app.get('/api/model', (req, res) => {
    try {
      const baseline = modelService.getBaselineModel();
      const categories = modelService.getCategories();
      const variables = modelService.getVariables();
      res.json({
        success: true,
        data: {
          model: baseline,
          categories,
          variables,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5B. Simulation Scenario APIs (Phase 5 - Stateless & In-Memory)
  // 5B-1. Get full simulation context (baseline config, feature vectors, baseline scores)
  app.get('/api/simulation/context', (req, res) => {
    try {
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const data = simulationService.getSimulationContext(mode);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5B-2. Pure stateless in-memory simulation calculation
  app.post('/api/simulation/calculate', (req, res) => {
    try {
      const { config, mode } = req.body;
      if (!config || !config.categories || !config.variables) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD: Missing config with categories and variables.',
        });
      }
      const data = simulationService.calculateSimulation(config, mode || 'OPERATIONAL_2025');
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5B-3. Single road comparative explainability
  app.post('/api/simulation/explain', (req, res) => {
    try {
      const { roadKey, config, mode } = req.body;
      if (!roadKey || !config) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD: Missing roadKey or config.',
        });
      }
      const data = simulationService.explainRoad(roadKey, config, mode || 'OPERATIONAL_2025');
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Web GIS Map APIs (Phase 4)
  // 6A. County Roads with Spatial Geometries & Active Scoring Run
  app.get('/api/map/roads', (req, res) => {
    try {
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = spatialService.getCountyRoadsWithScores(mode, modelCode);
      res.json({ success: true, total: data.features.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6B. Reference Transport Network (Provincial, National & Analytical Connectors)
  app.get('/api/map/reference-network', (req, res) => {
    try {
      const data = spatialService.getReferenceNetworkGeoJson();
      res.json({ success: true, total: data.features.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6C. Public Facilities (285 points: RSUD, Puskesmas, Sekolah, Pasar)
  app.get('/api/map/facilities', (req, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const data = spatialService.getPublicFacilitiesGeoJson(typeFilter);
      res.json({ success: true, total: data.features.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6D. Administrative District Boundaries (11 Kecamatan)
  app.get('/api/map/districts', (req, res) => {
    try {
      const data = spatialService.getDistrictsGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6D-1. Derived Kabupaten Hulu Sungai Selatan Boundary (Display Context)
  app.get('/api/map/kabupaten', (req, res) => {
    try {
      const data = spatialService.getKabupatenGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6D-2. Basemap Provider Configurations
  app.get('/api/map/basemap-config', (req, res) => {
    try {
      const satelliteTileUrl = process.env.SATELLITE_TILE_URL ||
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      const satelliteAttribution = process.env.SATELLITE_ATTRIBUTION ||
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

      res.json({
        success: true,
        data: {
          neutral: {
            id: 'neutral',
            label: 'Latar Netral',
            isOffline: true,
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
            url: satelliteTileUrl,
            attribution: satelliteAttribution,
            maxZoom: 19,
          },
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6E. Administrative Village Boundaries (148 Desa/Kelurahan)
  app.get('/api/map/villages', (req, res) => {
    try {
      const data = spatialService.getVillagesGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6F. RTRW Pola Ruang Categories
  app.get('/api/map/rtrw/categories', (req, res) => {
    try {
      const data = spatialService.getRtrwCategories();
      res.json({ success: true, total: data.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6G. RTRW Pola Ruang GeoJSON Overlay (On-demand)
  app.get('/api/map/rtrw', (req, res) => {
    try {
      const data = spatialService.getRtrwGeoJson();
      res.json({ success: true, total: data.features?.length || 0, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7A. Road Administrative Coverage (Desa & Kecamatan yang dilalui)
  app.get('/api/spatial/roads/:roadKey/coverage', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = derivationService.getRoadCoverage(roadKey);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7B. Road Nearest Facilities & Route Geometries
  app.get('/api/spatial/roads/:roadKey/nearest-facilities', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = derivationService.getRoadNearestFacilities(roadKey);
      res.json({ success: true, total: data.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7C. Network Graph Topology & Statistics
  app.get('/api/spatial/network/stats', (req, res) => {
    try {
      const data = derivationService.getNetworkStats();
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7D. Facility Network Snaps (285 Facilities)
  app.get('/api/spatial/facilities/snaps', (req, res) => {
    try {
      const type = req.query.type as string | undefined;
      const db = derivationService['db'];
      let sql = 'SELECT * FROM facility_network_snaps';
      const params: any[] = [];
      if (type) {
        sql += ' WHERE facility_type = ?';
        params.push(type);
      }
      sql += ' ORDER BY facility_type ASC, snap_distance_m ASC';
      const stmt = db.prepare(sql);
      const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
      res.json({ success: true, total: rows.length, data: rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7E. Recalculate Nearest Facility Distances Engine
  app.post('/api/spatial/recalculate', (req, res) => {
    try {
      const facilityType = req.body?.facilityType;
      const results = derivationService.recalculateFacilityDistances(facilityType);
      res.json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7F. Reconciliation of Imported vs Network-Calculated Distances
  app.get('/api/spatial/reconciliation', (req, res) => {
    try {
      const data = derivationService.getDistanceReconciliation();
      res.json({ success: true, total: data.length, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Serve static UI assets
  const publicDir = path.resolve(PROJECT_ROOT, 'src/public');
  app.use(express.static(publicDir));

  // SPA fallback to index.html for non-API GET requests
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3000;
  const app = createServer();
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`SISTEM PENDUKUNG PRIORITAS PENANGANAN JALAN KABUPATEN HSS (MVP)`);
    console.log(`Server aktif di: http://localhost:${PORT}`);
    console.log(`Mode Operasional Default: OPERATIONAL_2025`);
    console.log(`Model Aktif: POLICY_DEFAULT_V1 (350 Ruas Kanonikal Terverifikasi)`);
    console.log(`================================================================`);
  });
}
