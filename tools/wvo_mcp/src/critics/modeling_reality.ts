/**
 * ModelingReality Critic - Enforces Quantitative ML Quality Standards
 *
 * This critic validates that all ML modeling work meets objective, quantitative thresholds:
 * - R² > 0.50 for weather-sensitive models
 * - Correct weather elasticity signs
 * - Baseline comparison (model beats naive, seasonal, linear)
 * - No overfitting (validation R² ≈ test R²)
 * - MAPE < 20% where applicable
 *
 * Key principle: No subjective judgment. Failures are objective, measurable defects.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Critic, type CriticOptions } from "./base.js";
import { logDebug, logError, logInfo } from "../telemetry/logger.js";
import { ModelingRealityV2Critic, type CriticResult as V2CriticResult } from "./modeling_reality_v2.js";

export class ModelingRealityCritic extends Critic {
  private v2Critic: ModelingRealityV2Critic;

  constructor(workspaceRoot: string, options: CriticOptions = {}) {
    super(workspaceRoot, options);
    this.v2Critic = new ModelingRealityV2Critic(workspaceRoot);
  }

  protected getCriticKey(): string {
    return 'modeling_reality';
  }

  protected command(_profile: string): string | null {
    // Legacy fallback for direct execution mode
    // In modern orchestration, run() method is used instead
    return null;
  }

  /**
   * Override run() to use integrated v2 critic
   */
  async run(profile: string): Promise<import("./base.js").CriticResult> {
    try {
      // Extract modeling task info from environment or pass-through
      const taskId = process.env.TASK_ID || 'unknown';
      const artifactPathsEnv = process.env.ARTIFACT_PATHS || '[]';
      let artifactPaths: string[] = [];

      try {
        artifactPaths = JSON.parse(artifactPathsEnv);
      } catch (e) {
        logDebug('Could not parse ARTIFACT_PATHS env var, using empty array');
        artifactPaths = [];
      }

      logInfo('ModelingReality critic evaluating task', {
        taskId,
        artifactCount: artifactPaths.length,
        profile
      });

      // Run v2 critic
      const v2Result = await this.v2Critic.evaluate(taskId, artifactPaths);

      // Convert v2 result to base.CriticResult
      const message = v2Result.message;
      const stdout = this.formatResult(v2Result);
      const passed = v2Result.passed;

      if (passed) {
        return this.pass(message, {
          ...v2Result.details,
          critic_version: 'v2_integrated'
        });
      } else {
        return this.fail(message, {
          ...v2Result.details,
          critic_version: 'v2_integrated'
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('ModelingReality critic failed with error', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      return this.fail(`ModelingReality critic evaluation error: ${errorMessage}`, {
        error: errorMessage
      });
    }
  }

  /**
   * Format v2 result for display
   */
  private formatResult(result: V2CriticResult): string {
    const lines: string[] = [
      result.message,
      '',
      `Severity: ${result.severity}`,
      `Thresholds checked: ${result.details.thresholds_checked}`,
      `Thresholds passed: ${result.details.thresholds_passed}`,
      ''
    ];

    if (result.details.failures.length > 0) {
      lines.push('Failures:');
      result.details.failures.forEach(f => lines.push(`  - ${f}`));
      lines.push('');
    }

    if (result.details.recommendations.length > 0) {
      lines.push('Recommendations:');
      result.details.recommendations.forEach(r => lines.push(`  - ${r}`));
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Production alias that publishes results under `critic:modeling_reality_v2`.
 * Keeps legacy `modeling_reality` key available while rolling out the v2 critic.
 */
export class ModelingRealityV2OrchestratorCritic extends ModelingRealityCritic {
  protected getCriticKey(): string {
    return 'modeling_reality_v2';
  }
}
