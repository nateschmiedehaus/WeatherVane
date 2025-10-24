/**
 * ModelRouter - Intelligent model selection based on task complexity
 *
 * Routes tasks to appropriate model tiers:
 * - Haiku 4.5: Simple tasks (0-3 complexity) - $0.001/1K tokens
 * - Sonnet 3.5: Standard tasks (4-6 complexity) - $0.015/1K tokens
 * - Sonnet 4.5: Complex tasks (7-9 complexity) - $0.03/1K tokens
 * - Sonnet 4.5 + High Reasoning: Strategic tasks (10 complexity) - $0.05/1K tokens
 *
 * Target: 60% cost reduction through intelligent routing
 */

import type { Task } from './state_machine.js';
import { logDebug } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/tracing.js';

export interface ModelTier {
  name: string;
  model: string;
  costPer1K: number;
  minComplexity: number;
  maxComplexity: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export const MODEL_TIERS: ModelTier[] = [
  {
    name: 'haiku',
    model: 'claude-haiku-4-5',
    costPer1K: 0.001,
    minComplexity: 0,
    maxComplexity: 3,
  },
  {
    name: 'sonnet-4.5',
    model: 'claude-sonnet-4-5',
    costPer1K: 0.015,
    minComplexity: 4,
    maxComplexity: 6,
  },
  {
    name: 'sonnet-4.5',
    model: 'claude-sonnet-4-5',
    costPer1K: 0.03,
    minComplexity: 7,
    maxComplexity: 9,
  },
  {
    name: 'sonnet-4.5-reasoning',
    model: 'claude-sonnet-4-5',
    costPer1K: 0.05,
    minComplexity: 10,
    maxComplexity: 10,
    reasoningEffort: 'high',
  },
];

// Codex model tiers for comparison
export const CODEX_MODEL_TIERS: ModelTier[] = [
  {
    name: 'codex-low',
    model: 'gpt-5-codex-low',
    costPer1K: 0.002,
    minComplexity: 0,
    maxComplexity: 3,
  },
  {
    name: 'codex-medium',
    model: 'gpt-5-codex-medium',
    costPer1K: 0.01,
    minComplexity: 4,
    maxComplexity: 7,
  },
  {
    name: 'codex-high',
    model: 'gpt-5-codex-high',
    costPer1K: 0.03,
    minComplexity: 8,
    maxComplexity: 10,
  },
];

/**
 * Assess task complexity on a 0-10 scale
 *
 * Factors:
 * - Dependencies (+2 per dep)
 * - Epic/milestone scope (+2)
 * - Description length (+2 if >500 chars)
 * - ML/modeling work (+3)
 * - Security-sensitive (+3)
 * - Architecture changes (+3)
 * - API changes (+2)
 */
export function assessTaskComplexity(task: Task): number {
  let score = 0;

  // Base complexity from dependencies
  const dependencies = task.metadata?.dependencies as string[] | undefined;
  if (dependencies && dependencies.length > 0) {
    score += dependencies.length * 2;
  }

  // Epic-level tasks are inherently complex
  if (task.epic_id || task.type === 'epic') {
    score += 2;
  }

  // Long descriptions indicate complexity
  if (task.description && task.description.length > 500) {
    score += 2;
  }

  // Domain-specific complexity
  const domain = task.metadata?.domain as string | undefined;
  const requiresML = task.metadata?.requires_ml as boolean | undefined;
  const affectsSecurity = task.metadata?.affects_security as boolean | undefined;
  const isArchitecture = task.metadata?.is_architecture as boolean | undefined;
  const publicAPI = task.metadata?.public_api as boolean | undefined;

  if (requiresML || domain === 'modeling' || task.id.includes('MLR')) {
    score += 3;
  }

  if (affectsSecurity || task.id.includes('SECURITY')) {
    score += 3;
  }

  if (isArchitecture || task.title?.toLowerCase().includes('architecture')) {
    score += 3;
  }

  if (publicAPI || task.title?.toLowerCase().includes('api')) {
    score += 2;
  }

  // Check exit criteria complexity
  const exitCriteria = task.metadata?.exit_criteria as string[] | undefined;
  if (exitCriteria && exitCriteria.length > 5) {
    score += 1;
  }

  // Keywords that indicate complexity
  const complexKeywords = ['refactor', 'migrate', 'redesign', 'optimize', 'integrate'];
  const title = (task.title || '').toLowerCase();
  const description = (task.description || '').toLowerCase();

  for (const keyword of complexKeywords) {
    if (title.includes(keyword) || description.includes(keyword)) {
      score += 1;
      break; // Only count once
    }
  }

  // Cap at 10
  return Math.min(10, score);
}

/**
 * Select appropriate model based on task complexity
 */
export function selectModelForTask(task: Task, provider: 'codex' | 'claude' = 'claude'): {
  model: string;
  tier: ModelTier;
  complexity: number;
} {
  return withSpan('model.select', (span) => {
    const complexity = assessTaskComplexity(task);
    const tiers = provider === 'codex' ? CODEX_MODEL_TIERS : MODEL_TIERS;

    span?.setAttribute('model.provider', provider);
    span?.setAttribute('model.complexity', complexity);
    span?.setAttribute('task.id', task.id);

    // Find tier that matches complexity
    const tier = tiers.find(
      t => complexity >= t.minComplexity && complexity <= t.maxComplexity
    ) || tiers[tiers.length - 1]; // Fallback to highest tier

    span?.setAttribute('model.name', tier.name);
    span?.setAttribute('model.model', tier.model);
    span?.setAttribute('model.costPer1K', tier.costPer1K);
    if (tier.reasoningEffort) {
      span?.setAttribute('model.reasoningEffort', tier.reasoningEffort);
    }

    logDebug('Model selected for task', {
      taskId: task.id,
      complexity,
      model: tier.model,
      tier: tier.name,
      costPer1K: tier.costPer1K,
    });

    return {
      model: tier.model,
      tier,
      complexity,
    };
  }, {
    attributes: {
      'model.operation': 'selection',
    },
  });
}

/**
 * Estimate cost for a task based on complexity and expected token usage
 */
export function estimateTaskCost(task: Task, provider: 'codex' | 'claude' = 'claude'): {
  estimatedCost: number;
  model: string;
  estimatedTokens: number;
  tier: ModelTier;
} {
  return withSpan('model.estimateCost', (span) => {
    const { model, tier, complexity } = selectModelForTask(task, provider);

    span?.setAttribute('task.id', task.id);
    span?.setAttribute('model.provider', provider);

    // Estimate tokens based on complexity
    // Simple tasks: ~2K tokens, Complex tasks: ~10K tokens
    const baseTokens = 2000;
    const complexityMultiplier = 1 + (complexity * 0.4); // 0-3: 2K-4.8K, 7-9: 6.8K-9.6K, 10: 10K
    const estimatedTokens = Math.round(baseTokens * complexityMultiplier);

    const estimatedCost = (estimatedTokens / 1000) * tier.costPer1K;

    span?.setAttribute('model.estimatedTokens', estimatedTokens);
    span?.setAttribute('model.estimatedCost', estimatedCost);
    span?.setAttribute('model.baseTokens', baseTokens);
    span?.setAttribute('model.complexityMultiplier', complexityMultiplier);

    return {
      estimatedCost,
      model,
      estimatedTokens,
      tier,
    };
  }, {
    attributes: {
      'model.operation': 'cost_estimation',
    },
  });
}

/**
 * Get cost savings report comparing current vs optimal routing
 */
export function analyzeCostSavings(tasks: Task[]): {
  currentCost: number;
  optimizedCost: number;
  savings: number;
  savingsPercent: number;
  breakdown: {
    haiku: number;
    sonnet35: number;
    sonnet45: number;
    reasoning: number;
  };
} {
  let currentCost = 0;
  let optimizedCost = 0;

  const breakdown = {
    haiku: 0,
    sonnet35: 0,
    sonnet45: 0,
    reasoning: 0,
  };

  for (const task of tasks) {
    // Assume current routing uses Sonnet 3.5 for everything
    const currentEstimate = (5000 / 1000) * 0.015; // 5K tokens @ $0.015/1K
    currentCost += currentEstimate;

    // Optimal routing
    const { estimatedCost, tier } = estimateTaskCost(task);
    optimizedCost += estimatedCost;

    // Track breakdown
    if (tier.name === 'haiku') breakdown.haiku++;
    else if (tier.name === 'sonnet-3.5') breakdown.sonnet35++;
    else if (tier.name === 'sonnet-4.5') breakdown.sonnet45++;
    else if (tier.name === 'sonnet-4.5-reasoning') breakdown.reasoning++;
  }

  const savings = currentCost - optimizedCost;
  const savingsPercent = (savings / currentCost) * 100;

  return {
    currentCost,
    optimizedCost,
    savings,
    savingsPercent,
    breakdown,
  };
}
