import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { UiDataService } from '../services/uiDataService.ts';
import { ModelService } from '../services/modelService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  const uiService = new UiDataService();
  const modelService = new ModelService();

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

  // Serve static UI assets
  const publicDir = path.join(__dirname, '../public');
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
