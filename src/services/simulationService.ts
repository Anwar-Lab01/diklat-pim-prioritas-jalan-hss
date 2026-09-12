import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.ts';
import { ScoringService } from './scoringService.ts';
import { ModelService } from './modelService.ts';
import type { RoadFeatureVector, RankedRoadScore } from '../engine/types.ts';
import { rankRoads } from '../engine/scoringEngine.ts';
import {
  getBaselineSimulationConfig,
  rebalanceCategorySiblings,
  rebalanceVariableSiblings,
  runSimulationComparison,
  explainRoadMovement,
} from '../engine/simulationEngine.ts';
import type {
  SimulationModelConfig,
  RoadComparisonResult,
  ScenarioSummary,
  RoadDetailComparison,
} from '../engine/simulationEngine.ts';

export class SimulationService {
  private db: DatabaseSync;
  private scoringService: ScoringService;
  private modelService: ModelService;

  constructor(db?: DatabaseSync) {
    this.db = db || getDatabase();
    this.scoringService = new ScoringService(this.db);
    this.modelService = new ModelService(this.db);
  }

  /**
   * Provides full initial context for the simulation workspace.
   * Includes baseline model configuration, all 350 feature vectors,
   * and baseline ranked priority scores.
   * ZERO database writes.
   */
  getSimulationContext(
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025'
  ): {
    operatingMode: string;
    modelCode: string;
    baselineConfig: SimulationModelConfig;
    featureVectors: RoadFeatureVector[];
    baselineRankedScores: RankedRoadScore[];
  } {
    const baselineConfig = getBaselineSimulationConfig();
    const featureVectors = this.scoringService.loadRoadFeatureVectors(operatingMode);

    // Get or execute baseline scoring run to guarantee baseline scores exist
    let latestRun = this.scoringService.getLatestScoringRun(operatingMode, 'POLICY_DEFAULT_V1');
    if (!latestRun) {
      this.scoringService.executeScoringRun(operatingMode, 'POLICY_DEFAULT_V1');
      latestRun = this.scoringService.getLatestScoringRun(operatingMode, 'POLICY_DEFAULT_V1');
    }

    // Convert to RankedRoadScore using domain engine
    const baselineScoringConfig = {
      model_id: 'POLICY_DEFAULT_V1',
      model_code: 'POLICY_DEFAULT_V1',
      categories: baselineConfig.categories.map((c) => ({
        category_code: c.category_code,
        category_name: c.category_name,
        raw_weight: c.raw_weight,
        variable_codes: baselineConfig.variables
          .filter((v) => v.category_code === c.category_code)
          .map((v) => v.variable_code),
      })),
      variables: baselineConfig.variables.map((v) => ({
        variable_code: v.variable_code,
        category_code: v.category_code,
        local_weight: v.local_weight,
      })),
    };

    const baselineRankedScores = rankRoads(featureVectors, baselineScoringConfig);

    return {
      operatingMode,
      modelCode: 'POLICY_DEFAULT_V1',
      baselineConfig,
      featureVectors,
      baselineRankedScores,
    };
  }

  /**
   * Pure in-memory stateless simulation calculation.
   * ZERO database writes.
   */
  calculateSimulation(
    simConfig: SimulationModelConfig,
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025'
  ): {
    simulatedRankedScores: RankedRoadScore[];
    comparisons: RoadComparisonResult[];
    summary: ScenarioSummary;
  } {
    const { featureVectors, baselineRankedScores } = this.getSimulationContext(operatingMode);
    return runSimulationComparison(featureVectors, baselineRankedScores, simConfig);
  }

  /**
   * Explains why a specific road moved rank under the given scenario.
   */
  explainRoad(
    roadKey: string,
    simConfig: SimulationModelConfig,
    operatingMode: 'OPERATIONAL_2025' | 'BENCHMARK_2024' = 'OPERATIONAL_2025'
  ): RoadDetailComparison {
    const { featureVectors, baselineRankedScores } = this.getSimulationContext(operatingMode);
    return explainRoadMovement(roadKey, featureVectors, baselineRankedScores, simConfig);
  }
}
