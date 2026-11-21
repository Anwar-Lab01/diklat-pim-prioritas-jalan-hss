import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { PROJECT_ROOT } from '../config/constants.ts';
import { UiDataService } from '../services/uiDataService.ts';
import { ModelService } from '../services/modelService.ts';
import { SpatialService } from '../services/spatialService.ts';
import { SimulationService } from '../services/simulationService.ts';
import { SpatialDerivationService } from '../services/spatialDerivationService.ts';
import { DemographicsAndSegmentsService } from '../services/demographicsAndSegmentsService.ts';
import { DD1SegmentGeometryService } from '../services/dd1SegmentGeometryService.ts';
import { RtrwSpatialService } from '../services/rtrwSpatialService.ts';
import { RoadNarrativeService } from '../services/roadNarrativeService.ts';
import { TreatmentCostingEngine } from '../services/treatmentCostingEngine.ts';
import fs from 'node:fs';

// Global BigInt JSON serialization support for Express res.json
if (!(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    const num = Number(this);
    return Number.isSafeInteger(num) ? num : this.toString();
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  const uiService = new UiDataService();
  const modelService = new ModelService();
  const spatialService = new SpatialService();
  const simulationService = new SimulationService();
  const derivationService = new SpatialDerivationService();
  const demoSegService = new DemographicsAndSegmentsService(derivationService['db']);
  const dd1GeomService = new DD1SegmentGeometryService(derivationService['db']);
  const rtrwSpatialService = new RtrwSpatialService(derivationService['db']);
  const narrativeService = new RoadNarrativeService(derivationService['db']);
  const costingEngine = new TreatmentCostingEngine(derivationService['db']);

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

  // 3A. Road Demographics API (Phase 5.1A: 2025 Household Coverage)
  app.get('/api/roads/:roadKey/demographics', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = demoSegService.getRoadDemographics(roadKey);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3B. Road Condition Segments API (Phase 5.1A: DD1 Condition Segments)
  app.get('/api/roads/:roadKey/segments', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = demoSegService.getRoadDD1Segments(roadKey);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3C. Road Narrative API (PROFIL DAN KARAKTERISTIK RUAS JALAN)
  app.get('/api/roads/:roadKey/narrative', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = narrativeService.generateNarrative(roadKey, mode, modelCode);
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

  // 3D. Batch Road Narratives Audit & Availability Matrix API
  app.get('/api/roads-narratives-audit', (req, res) => {
    try {
      const mode = (req.query.mode as any) || 'OPERATIONAL_2025';
      const modelCode = (req.query.model as string) || 'POLICY_DEFAULT_V1';
      const data = narrativeService.generateAllNarratives(mode, modelCode);
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

  // 6H. Full-Map Authoritative DD1 Road Condition Segments (7,487 Segments)
  app.get('/api/map/dd1-segments', (req, res) => {
    try {
      const geojsonPath = path.resolve(PROJECT_ROOT, 'src/public/data/dd1_condition_segments_2025.geojson');
      if (fs.existsSync(geojsonPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return fs.createReadStream(geojsonPath).pipe(res);
      }
      const data = dd1GeomService.generateDD1SegmentsGeoJson();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(data);
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

  // 7A-1. Unified Spatial Profile (Task 1: SPASIAL DAN AKSESIBILITAS WILAYAH)
  app.get('/api/spatial/roads/:roadKey/spatial-profile', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = rtrwSpatialService.getRoadSpatialProfile(roadKey);
      if (!data) {
        return res.status(404).json({ success: false, error: `ROAD_NOT_FOUND: ${roadKey}` });
      }
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7A-2. Road RTRW Profile & Macro Breakdown
  app.get('/api/spatial/roads/:roadKey/rtrw', (req, res) => {
    try {
      const roadKey = req.params.roadKey;
      const data = rtrwSpatialService.getRoadSpatialProfile(roadKey);
      if (!data) {
        return res.status(404).json({ success: false, error: `ROAD_NOT_FOUND: ${roadKey}` });
      }
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7A-3. Aggregate Network RTRW Overlay Audit
  app.get('/api/spatial/rtrw/audit', (req, res) => {
    try {
      const data = rtrwSpatialService.getNetworkRtrwAudit();
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

  // ====================================================================
  // 8. ASB TREATMENT SELECTION & COSTING PLANNING API (PHASE 2)
  // ====================================================================

  // 8A. List All Scenarios
  app.get('/api/costing/scenarios', (req, res) => {
    try {
      const scenarios = costingEngine.getScenarios();
      res.json({ success: true, total: scenarios.length, data: scenarios });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8B. Scenario Comparison
  app.get('/api/costing/scenarios/comparison', (req, res) => {
    try {
      const comparison = costingEngine.getScenarioComparison();
      res.json({ success: true, total: comparison.length, data: comparison });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8C. Get Scenario Detail & Aggregated Metrics
  app.get('/api/costing/scenarios/:scenarioId', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const detail = costingEngine.getScenarioDetailSummary(scenarioId);
      res.json({ success: true, data: detail });
    } catch (err: any) {
      res.status(err.message.includes('NOT_FOUND') ? 404 : 500).json({ success: false, error: err.message });
    }
  });

  // 8D. Create New Budget Scenario
  app.post('/api/costing/scenarios', (req, res) => {
    try {
      const { scenario_code, scenario_name, budget_year, budget_ceiling_rp, description, scenario_status, allocation_strategy } = req.body;
      if (!scenario_code || !scenario_name || !budget_year) {
        return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS: scenario_code, scenario_name, budget_year required.' });
      }
      const created = costingEngine.createScenario({
        scenario_code,
        scenario_name,
        budget_year: Number(budget_year),
        budget_ceiling_rp: budget_ceiling_rp !== undefined ? Number(budget_ceiling_rp) : undefined,
        description,
        scenario_status,
        allocation_strategy
      });
      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      res.status(err.message.includes('DUPLICATE') ? 409 : 500).json({ success: false, error: err.message });
    }
  });

  // 8E. Update Budget Scenario
  app.put('/api/costing/scenarios/:scenarioId', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const { scenario_name, budget_ceiling_rp, description, scenario_status, allocation_strategy } = req.body;
      const updated = costingEngine.updateScenario(scenarioId, {
        scenario_name,
        budget_ceiling_rp: budget_ceiling_rp !== undefined ? Number(budget_ceiling_rp) : undefined,
        description,
        scenario_status,
        allocation_strategy
      });
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(err.message.includes('NOT_FOUND') ? 404 : 500).json({ success: false, error: err.message });
    }
  });

  // 8F. Delete Budget Scenario
  app.delete('/api/costing/scenarios/:scenarioId', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      costingEngine.deleteScenario(scenarioId);
      res.json({ success: true, message: `Scenario ${scenarioId} successfully deleted.` });
    } catch (err: any) {
      res.status(err.message.includes('PROTECTED') ? 403 : 500).json({ success: false, error: err.message });
    }
  });

  // 8G. Recalculate Scenario Costing
  app.post('/api/costing/scenarios/:scenarioId/calculate', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const result = costingEngine.calculateAndPersistScenario(scenarioId);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(err.message.includes('NOT_FOUND') ? 404 : 500).json({ success: false, error: err.message });
    }
  });

  // 8G-2. Run Mathematical Budget Optimization (Phase 3)
  app.post('/api/costing/scenarios/:scenarioId/optimize', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const { objective, budget_ceiling_rp } = req.body || {};
      const result = costingEngine.runOptimization(
        scenarioId,
        objective || 'PRIORITY_WEIGHTED',
        budget_ceiling_rp !== undefined ? Number(budget_ceiling_rp) : undefined
      );
      // Attach aliases for frontend compatibility
      const responseData = {
        ...result,
        solver_nodes: result.nodes_explored,
        solver_gap_pct: result.optimality_gap_pct,
      };
      res.json({ success: true, data: responseData });
    } catch (err: any) {
      res.status(err.message.includes('NOT_FOUND') ? 404 : 500).json({ success: false, error: err.message });
    }
  });

  // 8G-3. Compare All 4 Allocation Methods (Phase 3)
  app.get('/api/costing/scenarios/:scenarioId/compare-methods', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const ceilingRp = req.query.ceiling_rp !== undefined ? Number(req.query.ceiling_rp) : undefined;
      const result = costingEngine.compareOptimizationMethods(scenarioId, ceilingRp);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(err.message.includes('NOT_FOUND') ? 404 : 500).json({ success: false, error: err.message });
    }
  });

  // 8G-4. Duplicate Scenario (Phase 3)
  app.post('/api/costing/scenarios/:scenarioId/duplicate', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const { scenario_code, scenario_name, new_scenario_name, budget_ceiling_rp, optimization_objective, description } = req.body || {};
      const targetName = (scenario_name || new_scenario_name || '').trim();
      const codeBase = (scenario_code || targetName || `SIM_${Date.now()}`).toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
      const targetCode = codeBase.startsWith('SCN_') || codeBase.startsWith('SIM_') ? codeBase : `SIM_${codeBase}`.slice(0, 30);

      const duplicated = costingEngine.duplicateScenario(
        scenarioId,
        targetCode,
        targetName,
        description,
        budget_ceiling_rp !== undefined ? Number(budget_ceiling_rp) : undefined,
        optimization_objective
      );
      res.status(201).json({ success: true, data: duplicated });
    } catch (err: any) {
      res.status(err.message.includes('DUPLICATE') ? 409 : 500).json({ success: false, error: err.message });
    }
  });

  // 8G-5. Deferred and Excluded Road Register (Phase 3)
  app.get('/api/costing/scenarios/:scenarioId/deferred-register', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const register = costingEngine.getDeferredRoadRegister(scenarioId);
      res.json({ success: true, total: register.length, data: register });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8G-6. Optimization Run History (Phase 3)
  app.get('/api/costing/scenarios/:scenarioId/optimization-history', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const history = costingEngine.getOptimizationHistory(scenarioId);
      res.json({ success: true, total: history.length, data: history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8H. List Road Cost Summaries for Scenario
  app.get('/api/costing/scenarios/:scenarioId/roads', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const district = req.query.district as string | undefined;
      const isFunded = req.query.is_funded !== undefined ? Number(req.query.is_funded) : undefined;
      const operationalStatus = req.query.operational_status as string | undefined;
      const dominantType = req.query.dominant_type as string | undefined;
      const search = req.query.search as string | undefined;

      const roads = costingEngine.getRoadCostSummaries(scenarioId, {
        district,
        isFunded,
        operationalStatus,
        dominantType,
        search
      });
      res.json({ success: true, total: roads.length, data: roads });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8I. Single Road Cost Detail & Segment Breakdown
  app.get('/api/costing/scenarios/:scenarioId/roads/:roadKey', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const roadKey = req.params.roadKey;
      const detail = costingEngine.getRoadCostDetail(scenarioId, roadKey);
      if (!detail) {
        return res.status(404).json({ success: false, error: `ROAD_NOT_FOUND: Road '${roadKey}' not found.` });
      }
      res.json({ success: true, data: detail });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8J. Export Scenario to CSV
  app.get('/api/costing/scenarios/:scenarioId/export/csv', (req, res) => {
    try {
      const scenarioId = req.params.scenarioId;
      const csv = costingEngine.exportScenarioCsv(scenarioId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rencana_biaya_${scenarioId}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8K. Reference: Master ASB Catalog Search
  app.get('/api/costing/reference/asb', (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const category = req.query.category as string | undefined;
      const asbType = req.query.type as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const items = costingEngine.searchASB({ search, category, asbType, limit });
      res.json({ success: true, total: items.length, data: items });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8L. Reference: Master AHSP Catalog Search
  app.get('/api/costing/reference/ahsp', (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const division = req.query.division ? Number(req.query.division) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const items = costingEngine.searchAHSP({ search, division, limit });
      res.json({ success: true, total: items.length, data: items });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8M. Reference: Treatment Rules R01..R06 & Profiles
  app.get('/api/costing/reference/rules', (req, res) => {
    try {
      const rules = costingEngine.getTreatmentRules();
      res.json({ success: true, total: rules.length, data: rules });
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
