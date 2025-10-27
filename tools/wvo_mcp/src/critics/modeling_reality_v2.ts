/**
 * ModelingReality_v2 Critic - Enforces World-Class ML Quality Standards
 *
 * This critic enforces objective, quantitative thresholds on ML model quality.
 * It FAILS any task that doesn't meet world-class standards with no subjective judgment.
 *
 * Key principles:
 * 1. Objective truth over task completion
 * 2. Reproducible validation required
 * 3. Always compare to baselines
 * 4. Explicit limitations mandatory
 * 5. Critics enforce excellence, not just correctness
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ModelMetrics {
  out_of_sample_r2?: number;
  validation_r2?: number;
  test_r2?: number;
  mape?: number;
  weather_elasticity?: {
    temperature?: number;
    precipitation?: number;
    humidity?: number;
  };
  baseline_comparison?: {
    naive_mape?: number;
    seasonal_mape?: number;
    linear_mape?: number;
    model_mape?: number;
  };
}

export interface ValidationReport {
  task_id: string;
  tenant_id?: string;
  model_type: string;
  metrics: ModelMetrics;
  thresholds_passed: {
    r2: boolean;
    elasticity_signs: boolean;
    no_overfitting: boolean;
    beats_baseline: boolean;
  };
  overall_status: 'PASS' | 'FAIL';
  failures?: string[];
}

export interface CriticResult {
  passed: boolean;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  details: {
    thresholds_checked: number;
    thresholds_passed: number;
    failures: string[];
    recommendations: string[];
  };
}

export class ModelingRealityV2Critic {
  private workspaceRoot: string;

  // World-class quality thresholds
  private readonly THRESHOLDS = {
    MIN_R2_WEATHER_SENSITIVE: 0.50,
    MIN_R2_NON_SENSITIVE: 0.30,
    WORLD_CLASS_R2: 0.60,
    MAX_MAPE: 0.20, // 20%
    MIN_BASELINE_IMPROVEMENT: 1.10, // 10% better
    MAX_OVERFIT_GAP: 0.10, // val R² and test R² within 0.10
  };

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Main critic evaluation method
   */
  async evaluate(taskId: string, artifactPaths: string[]): Promise<CriticResult> {
    const failures: string[] = [];
    const recommendations: string[] = [];
    let thresholds_checked = 0;
    let thresholds_passed = 0;

    try {
      // Check if this is a modeling task
      if (!this.isModelingTask(taskId)) {
        return {
          passed: true,
          severity: 'info',
          message: `Task ${taskId} is not a modeling task, skipping ModelingReality critic`,
          details: {
            thresholds_checked: 0,
            thresholds_passed: 0,
            failures: [],
            recommendations: []
          }
        };
      }

      // Find validation report artifact
      const validationReportPath = this.findValidationReport(artifactPaths);
      if (!validationReportPath) {
        failures.push('No validation_report.json found in artifacts');
        recommendations.push('Create validation report with model metrics');

        return {
          passed: false,
          severity: 'blocking',
          message: `FAIL: Task ${taskId} missing required validation report`,
          details: {
            thresholds_checked: 1,
            thresholds_passed: 0,
            failures,
            recommendations
          }
        };
      }

      // Load validation report
      const report = await this.loadValidationReport(validationReportPath);

      // Check R² threshold
      thresholds_checked++;
      const r2Check = this.checkR2Threshold(report, taskId);
      if (r2Check.passed) {
        thresholds_passed++;
      } else {
        failures.push(r2Check.failure!);
        recommendations.push(r2Check.recommendation!);
      }

      // Check weather elasticity signs
      thresholds_checked++;
      const elasticityCheck = this.checkWeatherElasticitySigns(report, taskId);
      if (elasticityCheck.passed) {
        thresholds_passed++;
      } else {
        failures.push(elasticityCheck.failure!);
        recommendations.push(elasticityCheck.recommendation!);
      }

      // Check baseline comparison
      thresholds_checked++;
      const baselineCheck = this.checkBaselineComparison(report);
      if (baselineCheck.passed) {
        thresholds_passed++;
      } else {
        failures.push(baselineCheck.failure!);
        recommendations.push(baselineCheck.recommendation!);
      }

      // Check overfitting
      thresholds_checked++;
      const overfitCheck = this.checkOverfitting(report);
      if (overfitCheck.passed) {
        thresholds_passed++;
      } else {
        failures.push(overfitCheck.failure!);
        recommendations.push(overfitCheck.recommendation!);
      }

      // Check MAPE
      if (report.metrics.mape !== undefined) {
        thresholds_checked++;
        const mapeCheck = this.checkMAPE(report);
        if (mapeCheck.passed) {
          thresholds_passed++;
        } else {
          failures.push(mapeCheck.failure!);
          recommendations.push(mapeCheck.recommendation!);
        }
      }

      // Overall verdict
      const passed = failures.length === 0;
      const passRate = (thresholds_passed / thresholds_checked * 100).toFixed(1);

      return {
        passed,
        severity: passed ? 'info' : 'blocking',
        message: passed
          ? `✅ PASS: Task ${taskId} meets world-class quality standards (${passRate}% thresholds passed)`
          : `❌ FAIL: Task ${taskId} does not meet quality thresholds (${passRate}% passed, ${failures.length} failures)`,
        details: {
          thresholds_checked,
          thresholds_passed,
          failures,
          recommendations
        }
      };

    } catch (error) {
      return {
        passed: false,
        severity: 'blocking',
        message: `ERROR: Critic evaluation failed for ${taskId}: ${error}`,
        details: {
          thresholds_checked,
          thresholds_passed,
          failures: [...failures, error instanceof Error ? error.message : String(error)],
          recommendations: ['Fix critic evaluation error before retrying']
        }
      };
    }
  }

  private isModelingTask(taskId: string): boolean {
    return taskId.startsWith('T12.') || taskId.startsWith('T13.5.') || taskId.startsWith('T-MLR-');
  }

  private findValidationReport(artifactPaths: string[]): string | null {
    for (const artifactPath of artifactPaths) {
      if (artifactPath.includes('validation_report.json')) {
        return path.join(this.workspaceRoot, artifactPath);
      }
    }
    return null;
  }

  private async loadValidationReport(filePath: string): Promise<ValidationReport> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as ValidationReport;
  }

  private checkR2Threshold(report: ValidationReport, taskId: string): { passed: boolean; failure?: string; recommendation?: string } {
    const r2 = report.metrics.out_of_sample_r2 || report.metrics.test_r2;

    if (r2 === undefined) {
      return {
        passed: false,
        failure: 'No out-of-sample R² reported',
        recommendation: 'Add test_r2 or out_of_sample_r2 to validation report'
      };
    }

    // Determine if weather-sensitive based on task ID
    const isWeatherSensitive = taskId.includes('weather') || taskId.includes('PoC') || taskId.includes('MMM');
    const threshold = isWeatherSensitive ? this.THRESHOLDS.MIN_R2_WEATHER_SENSITIVE : this.THRESHOLDS.MIN_R2_NON_SENSITIVE;

    if (r2 < threshold) {
      return {
        passed: false,
        failure: `R² = ${r2.toFixed(3)} < ${threshold} (threshold for ${isWeatherSensitive ? 'weather-sensitive' : 'non-sensitive'} models)`,
        recommendation: `Improve model to achieve R² > ${threshold}. Current: ${r2.toFixed(3)}. World-class: > ${this.THRESHOLDS.WORLD_CLASS_R2}`
      };
    }

    if (r2 < 0) {
      return {
        passed: false,
        failure: `R² = ${r2.toFixed(3)} is NEGATIVE (worse than predicting the mean)`,
        recommendation: 'Model is fundamentally broken. Debug feature engineering, check for data leakage, validate train/test split'
      };
    }

    return { passed: true };
  }

  private checkWeatherElasticitySigns(report: ValidationReport, taskId: string): { passed: boolean; failure?: string; recommendation?: string } {
    if (!report.metrics.weather_elasticity) {
      return {
        passed: false,
        failure: 'No weather elasticity coefficients reported',
        recommendation: 'Extract and report weather elasticity coefficients (temperature, precipitation, humidity)'
      };
    }

    const elasticity = report.metrics.weather_elasticity;
    const tenant = report.tenant_id || 'unknown';

    // Determine expected signs based on tenant type (heuristic)
    let expectedSigns: { temp?: 'positive' | 'negative'; precip?: 'positive' | 'negative' } = {};

    if (tenant.includes('extreme') || tenant.includes('winter') || tenant.includes('ski')) {
      expectedSigns = { temp: 'negative', precip: 'positive' }; // Cold weather products
    } else if (tenant.includes('summer') || tenant.includes('sunglasses') || tenant.includes('ice_cream')) {
      expectedSigns = { temp: 'positive', precip: 'negative' }; // Warm weather products
    } else if (tenant.includes('rain') || tenant.includes('umbrella')) {
      expectedSigns = { precip: 'positive' }; // Rain products
    }

    // Check signs
    const signErrors: string[] = [];

    if (expectedSigns.temp && elasticity.temperature !== undefined) {
      const actualSign = elasticity.temperature >= 0 ? 'positive' : 'negative';
      if (actualSign !== expectedSigns.temp) {
        signErrors.push(`Temperature coefficient ${elasticity.temperature.toFixed(3)} has wrong sign (expected ${expectedSigns.temp})`);
      }
    }

    if (expectedSigns.precip && elasticity.precipitation !== undefined) {
      const actualSign = elasticity.precipitation >= 0 ? 'positive' : 'negative';
      if (actualSign !== expectedSigns.precip) {
        signErrors.push(`Precipitation coefficient ${elasticity.precipitation.toFixed(3)} has wrong sign (expected ${expectedSigns.precip})`);
      }
    }

    if (signErrors.length > 0) {
      return {
        passed: false,
        failure: `Weather elasticity signs incorrect: ${signErrors.join('; ')}`,
        recommendation: 'Review product category and ensure weather features have correct directional impact'
      };
    }

    return { passed: true };
  }

  private checkBaselineComparison(report: ValidationReport): { passed: boolean; failure?: string; recommendation?: string } {
    if (!report.metrics.baseline_comparison) {
      return {
        passed: false,
        failure: 'No baseline comparison provided',
        recommendation: 'Compare model to naive, seasonal, and linear baselines'
      };
    }

    const baseline = report.metrics.baseline_comparison;
    const model_mape = baseline.model_mape || report.metrics.mape;

    if (!model_mape) {
      return {
        passed: false,
        failure: 'Model MAPE not reported',
        recommendation: 'Calculate and report model MAPE for baseline comparison'
      };
    }

    // Check improvement over each baseline
    const improvements: { baseline: string; passed: boolean; improvement: number }[] = [];

    if (baseline.naive_mape) {
      const improvement = baseline.naive_mape / model_mape;
      improvements.push({ baseline: 'naive', passed: improvement >= this.THRESHOLDS.MIN_BASELINE_IMPROVEMENT, improvement });
    }

    if (baseline.seasonal_mape) {
      const improvement = baseline.seasonal_mape / model_mape;
      improvements.push({ baseline: 'seasonal', passed: improvement >= this.THRESHOLDS.MIN_BASELINE_IMPROVEMENT, improvement });
    }

    if (baseline.linear_mape) {
      const improvement = baseline.linear_mape / model_mape;
      improvements.push({ baseline: 'linear', passed: improvement >= this.THRESHOLDS.MIN_BASELINE_IMPROVEMENT, improvement });
    }

    const failed = improvements.filter(i => !i.passed);
    if (failed.length > 0) {
      const details = failed.map(f => `${f.baseline}: ${(f.improvement * 100).toFixed(1)}% (need >${this.THRESHOLDS.MIN_BASELINE_IMPROVEMENT * 100}%)`).join(', ');
      return {
        passed: false,
        failure: `Model doesn't beat all baselines: ${details}`,
        recommendation: `Improve model to beat all baselines by at least ${(this.THRESHOLDS.MIN_BASELINE_IMPROVEMENT - 1) * 100}%`
      };
    }

    return { passed: true };
  }

  private checkOverfitting(report: ValidationReport): { passed: boolean; failure?: string; recommendation?: string } {
    const val_r2 = report.metrics.validation_r2;
    const test_r2 = report.metrics.test_r2 || report.metrics.out_of_sample_r2;

    if (val_r2 === undefined || test_r2 === undefined) {
      return {
        passed: false,
        failure: 'Missing validation_r2 or test_r2 for overfitting check',
        recommendation: 'Report both validation and test R² to check for overfitting'
      };
    }

    const gap = Math.abs(test_r2 - val_r2);
    if (gap > this.THRESHOLDS.MAX_OVERFIT_GAP) {
      return {
        passed: false,
        failure: `Overfitting detected: |test R² (${test_r2.toFixed(3)}) - val R² (${val_r2.toFixed(3)})| = ${gap.toFixed(3)} > ${this.THRESHOLDS.MAX_OVERFIT_GAP}`,
        recommendation: 'Model is overfitting. Add regularization, reduce features, or increase training data'
      };
    }

    return { passed: true };
  }

  private checkMAPE(report: ValidationReport): { passed: boolean; failure?: string; recommendation?: string } {
    const mape = report.metrics.mape;

    if (mape === undefined) {
      return { passed: true }; // MAPE is optional
    }

    if (mape > this.THRESHOLDS.MAX_MAPE) {
      return {
        passed: false,
        failure: `MAPE = ${(mape * 100).toFixed(1)}% > ${(this.THRESHOLDS.MAX_MAPE * 100).toFixed(0)}% threshold`,
        recommendation: `Improve forecast accuracy to achieve MAPE < ${(this.THRESHOLDS.MAX_MAPE * 100).toFixed(0)}%`
      };
    }

    return { passed: true };
  }
}

/**
 * Main critic execution function
 */
export async function runModelingRealityCritic(
  workspaceRoot: string,
  taskId: string,
  artifactPaths: string[]
): Promise<CriticResult> {
  const critic = new ModelingRealityV2Critic(workspaceRoot);
  return await critic.evaluate(taskId, artifactPaths);
}
