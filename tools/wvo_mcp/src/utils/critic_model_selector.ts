/**
 * Critic Model Selector - Selects appropriate models for critic execution
 *
 * This module:
 * - Loads critic model preferences from configuration
 * - Selects models based on critic domain expertise
 * - Considers model availability and quota pressure
 * - Provides fallback strategies
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ModelManager } from '../models/model_manager.js';
import type { UsageEstimator } from '../limits/usage_estimator.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

export interface CriticModelPreference {
  preferred_provider: 'claude' | 'codex';
  preferred_model: string;
  reasoning_level?: 'minimal' | 'low' | 'medium' | 'high';
  rationale: string;
  fallback_provider: 'claude' | 'codex';
  fallback_model: string;
}

export interface CriticModelPreferences {
  preferences: Record<string, CriticModelPreference>;
  default: CriticModelPreference;
  selection_strategy: {
    description: string;
    rules: string[];
  };
}

export interface ModelSelectionResult {
  provider: 'claude' | 'codex';
  model: string;
  reasoning_level?: 'minimal' | 'low' | 'medium' | 'high';
  rationale: string;
  is_preferred: boolean;
  selection_reason: string;
}

export class CriticModelSelector {
  private preferences: CriticModelPreferences | null = null;
  private readonly preferencesPath: string;

  constructor(
    private readonly workspaceRoot: string,
    private readonly modelManager?: ModelManager,
    private readonly usageEstimator?: UsageEstimator
  ) {
    this.preferencesPath = path.join(
      workspaceRoot,
      'tools',
      'wvo_mcp',
      'config',
      'critic_model_preferences.json'
    );
  }

  /**
   * Load critic model preferences
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.preferencesPath, 'utf-8');
      this.preferences = JSON.parse(content) as CriticModelPreferences;
      logInfo('Loaded critic model preferences', {
        critics: Object.keys(this.preferences.preferences).length,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      const code = err?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        logInfo('Critic model preferences not found; using embedded defaults', {
          path: this.preferencesPath,
        });
      } else {
        logWarning('Failed to load critic model preferences', {
          path: this.preferencesPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Use embedded defaults
      this.preferences = this.getEmbeddedDefaults();
    }
  }

  /**
   * Select model for a critic
   */
  selectForCritic(criticName: string): ModelSelectionResult {
    if (!this.preferences) {
      throw new Error('Preferences not loaded. Call load() first.');
    }

    const preference = this.preferences.preferences[criticName] ?? this.preferences.default;

    // Check if preferred model is available
    if (this.modelManager) {
      const preferredAvailable = this.modelManager.isModelAvailable(
        preference.preferred_provider,
        preference.preferred_model
      );

      const fallbackAvailable = this.modelManager.isModelAvailable(
        preference.fallback_provider,
        preference.fallback_model
      );

      // Check quota pressure
      let quotaOverride = false;
      if (this.usageEstimator) {
        const estimate = this.usageEstimator.estimateTask(
          `Run ${criticName} critic`,
          2000 // Assume moderate token usage
        );

        const recommendation = this.usageEstimator.recommendProvider(
          estimate,
          [
            { provider: 'claude', account: 'default' },
            { provider: 'codex', account: 'default' },
          ]
        );

        const recommendedProvider = recommendation.preferred_provider;
        const fallbackProvider = recommendation.fallback_provider;
        const quotaPressure = recommendation.quota_pressure;

        const shouldSwitchToRecommended =
          recommendedProvider !== preference.preferred_provider;
        const shouldSwitchToFallback =
          !shouldSwitchToRecommended &&
          (quotaPressure === 'critical' || quotaPressure === 'high') &&
          fallbackProvider !== null &&
          fallbackProvider !== preference.preferred_provider;

        const overrideProvider = shouldSwitchToRecommended
          ? recommendedProvider
          : shouldSwitchToFallback
          ? (fallbackProvider as 'claude' | 'codex')
          : null;

        if (overrideProvider) {
          quotaOverride = true;

          // Try to use best available model from recommended provider
          const bestModel = this.modelManager.getBestModel(overrideProvider);
          if (bestModel) {
            return {
              provider: overrideProvider,
              model: bestModel,
              reasoning_level: preference.reasoning_level,
              rationale: `Quota override (${overrideProvider}): ${recommendation.reasoning}. Original: ${preference.rationale}`,
              is_preferred: false,
              selection_reason: 'quota_pressure',
            };
          }
        }
      }

      // Preferred model available
      if (preferredAvailable && !quotaOverride) {
        return {
          provider: preference.preferred_provider,
          model: preference.preferred_model,
          reasoning_level: preference.reasoning_level,
          rationale: preference.rationale,
          is_preferred: true,
          selection_reason: 'preferred_available',
        };
      }

      // Fallback available
      if (fallbackAvailable && !quotaOverride) {
        return {
          provider: preference.fallback_provider,
          model: preference.fallback_model,
          reasoning_level: preference.reasoning_level,
          rationale: `Fallback: ${preference.rationale}`,
          is_preferred: false,
          selection_reason: 'fallback_available',
        };
      }

      // Use best available model from preferred provider
      const bestPreferred = this.modelManager.getBestModel(preference.preferred_provider);
      if (bestPreferred) {
        return {
          provider: preference.preferred_provider,
          model: bestPreferred,
          reasoning_level: preference.reasoning_level,
          rationale: `Best available from ${preference.preferred_provider}: ${preference.rationale}`,
          is_preferred: false,
          selection_reason: 'best_from_preferred_provider',
        };
      }

      // Use best available model from fallback provider
      const bestFallback = this.modelManager.getBestModel(preference.fallback_provider);
      if (bestFallback) {
        return {
          provider: preference.fallback_provider,
          model: bestFallback,
          reasoning_level: preference.reasoning_level,
          rationale: `Best available from ${preference.fallback_provider}: ${preference.rationale}`,
          is_preferred: false,
          selection_reason: 'best_from_fallback_provider',
        };
      }
    }

    // No model manager or no models available - return preference as-is
    return {
      provider: preference.preferred_provider,
      model: preference.preferred_model,
      reasoning_level: preference.reasoning_level,
      rationale: preference.rationale,
      is_preferred: true,
      selection_reason: 'no_registry_check',
    };
  }

  /**
   * Get all preferences
   */
  getAllPreferences(): CriticModelPreferences | null {
    return this.preferences;
  }

  /**
   * Get preference for specific critic
   */
  getPreference(criticName: string): CriticModelPreference | null {
    if (!this.preferences) {
      return null;
    }
    return this.preferences.preferences[criticName] ?? this.preferences.default;
  }

  /**
   * Embedded default preferences (fallback if file not found)
   */
  private getEmbeddedDefaults(): CriticModelPreferences {
    return {
      preferences: {
        allocator: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-high',
          reasoning_level: 'high',
          rationale: 'Budget allocation requires deep numerical reasoning',
          fallback_provider: 'claude',
          fallback_model: 'claude-opus-4.1',
        },
        security: {
          preferred_provider: 'claude',
          preferred_model: 'claude-opus-4.1',
          rationale: 'Security analysis requires careful reasoning',
          fallback_provider: 'codex',
          fallback_model: 'codex-5-high',
        },
        design_system: {
          preferred_provider: 'claude',
          preferred_model: 'claude-opus-4.1',
          rationale: 'UX/design requires visual understanding',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
        tests: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-medium',
          reasoning_level: 'medium',
          rationale: 'Test generation benefits from code understanding and systematic coverage',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
        build: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-low',
          reasoning_level: 'low',
          rationale: 'Build verification is straightforward, does not need deep reasoning',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
        causal: {
          preferred_provider: 'claude',
          preferred_model: 'claude-opus-4.1',
          reasoning_level: 'high',
          rationale: 'Causal inference requires deep reasoning about counterfactuals and mechanisms',
          fallback_provider: 'codex',
          fallback_model: 'codex-5-high',
        },
        forecast_stitch: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-high',
          reasoning_level: 'high',
          rationale: 'Forecast stitching involves complex temporal reasoning and numerical optimization',
          fallback_provider: 'claude',
          fallback_model: 'claude-opus-4.1',
        },
        cost_perf: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-medium',
          reasoning_level: 'medium',
          rationale: 'Cost/performance analysis benefits from numerical optimization',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
        typecheck: {
          preferred_provider: 'codex',
          preferred_model: 'codex-5-low',
          reasoning_level: 'low',
          rationale: 'Type checking is mechanical and does not need high reasoning',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
        org_pm: {
          preferred_provider: 'claude',
          preferred_model: 'claude-opus-4.1',
          reasoning_level: 'high',
          rationale: 'Strategic product management needs deep contextual understanding',
          fallback_provider: 'claude',
          fallback_model: 'claude-sonnet-4.5',
        },
      },
      default: {
        preferred_provider: 'codex',
        preferred_model: 'codex-5-medium',
        reasoning_level: 'medium',
        rationale: 'Default to Codex for general-purpose analysis',
        fallback_provider: 'claude',
        fallback_model: 'claude-sonnet-4.5',
      },
      selection_strategy: {
        description: 'Model selection strategy',
        rules: [
          'Check if preferred model is available',
          'Fall back to fallback model if needed',
          'Consider quota pressure',
        ],
      },
    };
  }

  /**
   * Generate report of critic-to-model mappings
   */
  generateReport(): string {
    if (!this.preferences) {
      return 'Preferences not loaded';
    }

    const lines: string[] = [];
    lines.push('# Critic Model Preferences\n');

    for (const [criticName, pref] of Object.entries(this.preferences.preferences)) {
      const selection = this.selectForCritic(criticName);
      const isAvailable = this.modelManager?.isModelAvailable(
        selection.provider,
        selection.model
      );

      lines.push(`## ${criticName}`);
      lines.push(`- Preferred: ${pref.preferred_provider}/${pref.preferred_model}`);
      lines.push(`- Selected: ${selection.provider}/${selection.model}`);
      lines.push(`- Available: ${isAvailable ?? 'unknown'}`);
      lines.push(`- Reason: ${selection.selection_reason}`);
      lines.push(`- Rationale: ${selection.rationale}\n`);
    }

    return lines.join('\n');
  }
}
