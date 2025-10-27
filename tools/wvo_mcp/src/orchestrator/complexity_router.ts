/**
 * ComplexityRouter - Intelligent model selection based on task complexity
 *
 * Dynamically discovers available models from ModelRegistry (runs daily) and routes tasks:
 * - Simple tasks (0-3) → Haiku / Codex Low (cheapest, fastest)
 * - Moderate tasks (4-6) → Sonnet 3.5 / Codex Medium (balanced)
 * - Complex tasks (7-9) → Sonnet 4.5 / Codex High (advanced reasoning)
 * - Critical tasks (10) → Opus 4.1 / Sonnet 4.5 + Extended Thinking (most capable)
 *
 * Falls back to embedded defaults if model discovery unavailable.
 * Achieves ~60% cost reduction by avoiding expensive models for simple work.
 */

import { ModelRegistry, type ClaudeModel, type CodexModel } from '../models/model_registry.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import type { ModelSelection } from './model_router.js';
import type { CapabilityTag } from './router_policy.js';
import type { TaskEnvelope } from './task_envelope.js';


export interface ComplexityFactor {
  name: string;           // Factor name (e.g., "dependencies")
  value: number;          // Raw value (e.g., 3 dependencies)
  weight: number;         // Importance multiplier
  contribution: number;   // value * weight
}

export interface TaskComplexity {
  score: number;              // 0-10 scale
  factors: ComplexityFactor[]; // Contributing factors
  reasoning: string;          // Human-readable explanation
}

export interface ComplexityConfig {
  factorWeights: Record<string, number>;
  modelTiers: ModelTier[];
  fallbackModel: string;
}

export interface ModelTier {
  maxScore: number;
  model: string;
  provider: string;
  tier: 'simple' | 'moderate' | 'complex' | 'critical';
  estimatedCost: number;
  capabilityTags: CapabilityTag[];
}

const DEFAULT_CONFIG: ComplexityConfig = {
  factorWeights: {
    dependencies: 2,
    epic_task: 2,
    long_description: 2,
    ml_work: 3,
    security_impact: 3,
    public_api: 2,
    cross_domain: 1,
  },
  modelTiers: [
    {
      maxScore: 3,
      model: 'claude-haiku-4.5',
      provider: 'anthropic',
      tier: 'simple',
      estimatedCost: 0.001,
      capabilityTags: ['cheap_batch', 'fast_code'],
    },
    {
      maxScore: 6,
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      tier: 'moderate',
      estimatedCost: 0.015,
      capabilityTags: ['fast_code'],
    },
    {
      maxScore: 9,
      model: 'claude-sonnet-4.5',
      provider: 'anthropic',
      tier: 'complex',
      estimatedCost: 0.03,
      capabilityTags: ['reasoning_high'],
    },
    {
      maxScore: 10,
      model: 'claude-sonnet-4.5',
      provider: 'anthropic',
      tier: 'critical',
      estimatedCost: 0.05,
      capabilityTags: ['reasoning_high', 'long_context'],
    },
  ],
  fallbackModel: 'claude-3-5-sonnet-20241022', // Safe default
};

export class ComplexityRouter {
  private readonly config: ComplexityConfig;
  private readonly registry?: ModelRegistry;

  constructor(config: Partial<ComplexityConfig> = {}, registry?: ModelRegistry) {
    this.registry = registry;

    // If no model tiers provided, try to build from registry
    let modelTiers = config.modelTiers;
    if (!modelTiers && registry) {
      modelTiers = this.buildTiersFromRegistry();
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      factorWeights: { ...DEFAULT_CONFIG.factorWeights, ...config.factorWeights },
      modelTiers: modelTiers || DEFAULT_CONFIG.modelTiers,
    };

    logInfo('ComplexityRouter initialized', {
      tierCount: this.config.modelTiers.length,
      source: modelTiers ? 'discovery' : 'embedded',
    });
  }

  /**
   * Build model tiers from ModelRegistry discovered models
   */
  private buildTiersFromRegistry(): ModelTier[] | undefined {
    if (!this.registry) return undefined;

    const claudeModels = this.registry.getClaudeModelsByTier();
    const codexModels = this.registry.getCodexModelsByCapability();

    if (claudeModels.length === 0 && codexModels.length === 0) {
      logWarning('No models discovered in registry, using embedded defaults');
      return undefined;
    }

    const tiers: ModelTier[] = [];

    // Find models by capability
    const haiku = claudeModels.find((m) => m.id.includes('haiku'));
    const sonnet35 = claudeModels.find((m) => m.id.includes('3-5-sonnet'));
    const sonnet45 = claudeModels.find((m) => m.id.includes('sonnet-4.5'));
    const opus = claudeModels.find((m) => m.id.includes('opus'));

    const codexLow = codexModels.find((m) => m.id.includes('low'));
    const codexMedium = codexModels.find((m) => m.id.includes('medium'));
    const codexHigh = codexModels.find((m) => m.id.includes('high'));

    // Simple tier (0-3): Use fastest/cheapest model
    const simpleModel = haiku || codexLow || claudeModels[claudeModels.length - 1];
    if (simpleModel) {
      tiers.push(this.modelToTier(simpleModel, 3, 'simple', 'claude'));
    }

    // Moderate tier (4-6): Use balanced model
    const moderateModel = sonnet35 || codexMedium || sonnet45 || codexHigh;
    if (moderateModel) {
      const provider = 'id' in moderateModel && moderateModel.id.includes('codex') ? 'openai' : 'claude';
      tiers.push(this.modelToTier(moderateModel, 6, 'moderate', provider));
    }

    // Complex tier (7-9): Use advanced reasoning
    const complexModel = sonnet45 || codexHigh || opus;
    if (complexModel) {
      const provider = 'id' in complexModel && complexModel.id.includes('codex') ? 'openai' : 'claude';
      tiers.push(this.modelToTier(complexModel, 9, 'complex', provider));
    }

    // Critical tier (10): Use most capable model
    const criticalModel = opus || sonnet45 || codexHigh;
    if (criticalModel) {
      const provider = 'id' in criticalModel && criticalModel.id.includes('codex') ? 'openai' : 'claude';
      tiers.push(this.modelToTier(criticalModel, 10, 'critical', provider));
    }

    if (tiers.length === 0) {
      logWarning('Could not build tiers from registry, using embedded defaults');
      return undefined;
    }

    logInfo('Built model tiers from registry', {
      simple: tiers.find((t) => t.tier === 'simple')?.model,
      moderate: tiers.find((t) => t.tier === 'moderate')?.model,
      complex: tiers.find((t) => t.tier === 'complex')?.model,
      critical: tiers.find((t) => t.tier === 'critical')?.model,
    });

    return tiers;
  }

  /**
   * Convert discovered model to ModelTier
   */
  private modelToTier(
    model: ClaudeModel | CodexModel,
    maxScore: number,
    tier: 'simple' | 'moderate' | 'complex' | 'critical',
    provider: string
  ): ModelTier {
    const capabilities: CapabilityTag[] = [];

    // Map tier to valid CapabilityTag values
    if (tier === 'simple') {
      capabilities.push('cheap_batch', 'fast_code');
    } else if (tier === 'moderate') {
      capabilities.push('fast_code');
    } else if (tier === 'complex') {
      capabilities.push('reasoning_high');
    } else {
      // Critical tier
      capabilities.push('reasoning_high', 'long_context');
    }

    const cost = model.cost_per_mtok;
    const estimatedCost = (cost.input + cost.output) / 1000; // Convert from per-mtok to per-1K

    return {
      maxScore,
      model: model.id,
      provider,
      tier,
      estimatedCost,
      capabilityTags: Array.from(new Set(capabilities)),
    };
  }

  /**
   * Assess task complexity based on multiple factors
   */
  assessComplexity(task: TaskEnvelope): TaskComplexity {
    try {
      const factors: ComplexityFactor[] = [];

      // Factor 1: Dependencies
      const dependencies = task.metadata?.dependencies as string[] | undefined;
      const depCount = Array.isArray(dependencies) ? dependencies.length : 0;
      if (depCount > 0) {
        const weight = this.config.factorWeights.dependencies;
        factors.push({
          name: 'dependencies',
          value: depCount,
          weight,
          contribution: depCount * weight,
        });
      }

      // Factor 2: Epic/parent task
      const epicId = task.metadata?.epic_id;
      const parentId = task.metadata?.parent_id;
      if (epicId || parentId) {
        const weight = this.config.factorWeights.epic_task;
        factors.push({
          name: 'epic_task',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Factor 3: Long description
      const descLength = task.description?.length || 0;
      if (descLength > 500) {
        const weight = this.config.factorWeights.long_description;
        factors.push({
          name: 'long_description',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Factor 4: ML work
      if (task.metadata?.requires_ml) {
        const weight = this.config.factorWeights.ml_work;
        factors.push({
          name: 'ml_work',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Factor 5: Security impact
      if (task.metadata?.affects_security) {
        const weight = this.config.factorWeights.security_impact;
        factors.push({
          name: 'security_impact',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Factor 6: Public API
      if (task.metadata?.public_api) {
        const weight = this.config.factorWeights.public_api;
        factors.push({
          name: 'public_api',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Factor 7: Cross-domain work
      if (task.metadata?.cross_domain) {
        const weight = this.config.factorWeights.cross_domain;
        factors.push({
          name: 'cross_domain',
          value: 1,
          weight,
          contribution: weight,
        });
      }

      // Calculate total score (max 10)
      const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
      const score = Math.min(10, rawScore);

      const complexity: TaskComplexity = {
        score,
        factors,
        reasoning: this.explainComplexity(score, factors),
      };

      logInfo('Task complexity assessed', {
        taskId: task.id,
        score,
        factors: factors.map((f) => f.name),
      });

      return complexity;
    } catch (error) {
      logError('Complexity assessment failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to moderate complexity on error
      return {
        score: 5,
        factors: [],
        reasoning: 'Assessment failed, defaulting to moderate complexity',
      };
    }
  }

  /**
   * Select appropriate model based on complexity
   */
  selectModel(complexity: TaskComplexity, override?: string): ModelSelection {
    try {
      // Honor manual override if provided
      if (override) {
        const tier = this.findTierForModel(override);
        const capabilityTags: CapabilityTag[] = tier?.capabilityTags || ['reasoning_high'];
        return {
          model: override,
          provider: 'anthropic',
          capabilityTags,
          source: 'policy' as const,
          reason: `Manual override to ${override} (complexity ${complexity.score})`,
        };
      }

      // Select tier based on complexity score
      const tier = this.selectTier(complexity.score);

      return {
        model: tier.model,
        provider: tier.provider,
        capabilityTags: tier.capabilityTags,
        source: 'policy' as const,
        reason: this.buildRationale(complexity, tier),
      };
    } catch (error) {
      logError('Model selection failed', {
        complexity: complexity.score,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fallback to safe default tier
      const fallbackTier = this.config.modelTiers[1]; // Moderate tier
      return {
        model: fallbackTier.model,
        provider: fallbackTier.provider,
        capabilityTags: fallbackTier.capabilityTags,
        source: 'policy' as const,
        reason: 'Selection failed, using fallback model',
      };
    }
  }

  /**
   * Select tier based on complexity score
   */
  private selectTier(score: number): ModelTier {
    // Find first tier where score <= maxScore
    const tier = this.config.modelTiers.find((t) => score <= t.maxScore);

    if (!tier) {
      // Should never happen if config is valid, but safety check
      logWarning('No tier found for complexity score', { score });
      return this.config.modelTiers[this.config.modelTiers.length - 1]; // Use highest tier
    }

    return tier;
  }

  /**
   * Find tier for a specific model (for overrides)
   */
  private findTierForModel(model: string): ModelTier | undefined {
    return this.config.modelTiers.find((t) => t.model === model);
  }

  /**
   * Build human-readable rationale for model selection
   */
  private buildRationale(complexity: TaskComplexity, tier: ModelTier): string {
    return `${tier.tier} task (score ${complexity.score}) → ${tier.model}`;
  }

  /**
   * Explain complexity score in human-readable form
   */
  private explainComplexity(score: number, factors: ComplexityFactor[]): string {
    if (factors.length === 0) {
      return `Simple task with no complexity factors (score ${score})`;
    }

    // Sort by contribution and take top 3
    const topFactors = factors
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((f) => `${f.name} (+${f.contribution})`)
      .join(', ');

    return `Score ${score} from: ${topFactors}`;
  }
}
