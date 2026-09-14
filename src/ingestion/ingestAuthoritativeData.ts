import { getDatabase, closeDatabase, withTransaction } from '../db/connection.ts';
import { ingestRoads } from './ingestRoads.ts';
import { ingestCrosswalk } from './ingestCrosswalk.ts';
import { ingestConditions } from './ingestConditions.ts';
import { ingestGeometries } from './ingestGeometries.ts';
import { ingestAdminAndFacilities } from './ingestAdminAndFacilities.ts';
import { seedModelDefinitions } from './seedModelDefinitions.ts';
import { SpatialDerivationService } from '../services/spatialDerivationService.ts';

export function runMasterIngestion(dbPath?: string): {
  success: boolean;
  stats: Record<string, any>;
} {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('STARTING CANONICAL DATA INGESTION PIPELINE (PHASE 1)');
  console.log('================================================================');

  const db = getDatabase(dbPath);

  const result = withTransaction(db, () => {
    console.log('[1/6] Ingesting canonical roads and aliases...');
    const roadStats = ingestRoads(db);
    console.log(`      ✓ Roads: ${roadStats.insertedRoads}, Aliases: ${roadStats.insertedAliases}`);

    console.log('[2/6] Ingesting cross-system crosswalks...');
    const crosswalkStats = ingestCrosswalk(db);
    console.log(`      ✓ Crosswalk records: ${crosswalkStats.insertedCrosswalks}`);

    console.log('[3/6] Ingesting authoritative 2025 road conditions...');
    const conditionStats = ingestConditions(db);
    console.log(
      `      ✓ Conditions: ${conditionStats.insertedConditions} records, Total: ${conditionStats.totalKm} km (Mantap: ${conditionStats.mantapKm} km, Tidak Mantap: ${conditionStats.tidakMantapKm} km)`
    );

    console.log('[4/6] Ingesting county road geometries...');
    const geometryStats = ingestGeometries(db);
    console.log(`      ✓ Geometries: ${geometryStats.insertedGeometries} county road features (synthetic connectors excluded)`);

    console.log('[5/6] Ingesting administrative boundaries and public facilities...');
    const adminStats = ingestAdminAndFacilities(db);
    console.log(
      `      ✓ Districts: ${adminStats.insertedDistricts}, Villages: ${adminStats.insertedVillages}, Facilities: ${adminStats.insertedFacilities}`
    );

    console.log('[6/6] Seeding model categories, 17 variables, baseline weights, and observations...');
    const modelStats = seedModelDefinitions(db);
    console.log(
      `      ✓ Categories: ${modelStats.insertedCategories}, Variables: ${modelStats.insertedVariables}, Models: ${modelStats.insertedModels}`
    );
    console.log(
      `      ✓ Category Weights: ${modelStats.insertedCategoryWeights}, Variable Weights: ${modelStats.insertedVariableWeights}, Observations: ${modelStats.insertedObservations}`
    );

    console.log('[7/7] Computing spatial derivations and network accessibility foundation (Phase 5.1)...');
    const spatialDerivationService = new SpatialDerivationService(db);
    const adminDerivStats = spatialDerivationService.ingestAdminIntersections();
    const snapStats = spatialDerivationService.snapAllFacilities();
    const facilityDistStats = spatialDerivationService.recalculateFacilityDistances();
    console.log(
      `      ✓ Intersections: ${adminDerivStats.insertedVillages} villages, ${adminDerivStats.insertedDistricts} districts; Snaps: ${snapStats.totalSnapped}; Nearest Routes: 1400`
    );

    return {
      roadStats,
      crosswalkStats,
      conditionStats,
      geometryStats,
      adminStats,
      modelStats,
      spatialDerivationStats: {
        adminDerivStats,
        snapStats,
        facilityDistStats,
      },
    };
  });

  const durationMs = Date.now() - startTime;
  console.log('================================================================');
  console.log(`CANONICAL INGESTION COMPLETED SUCCESSFULLY IN ${durationMs}ms`);
  console.log('================================================================');

  return {
    success: true,
    stats: {
      ...result,
      durationMs,
    },
  };
}

// Direct execution entrypoint
if (process.argv[1]?.endsWith('ingestAuthoritativeData.ts')) {
  try {
    runMasterIngestion();
  } catch (error) {
    console.error('INGESTION FAILED:', error);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
