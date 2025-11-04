/**
 * Phase Budget Calculator
 *
 * Calculates dynamic budgets using three dimensions:
 * - Complexity (Tiny/Small/Medium/Large)
 * - Importance (low/medium/high/critical)
 * - Phase weight (stage-specific resource intensity)
 *
 * Formula: limit = base × complexity_mult × importance_mult × phase_weight
 */

import type { WorkPhase } from '../orchestrator/work_process_enforcer.js';
import { ScopeClass } from './context_budgeting.js';
import { PhaseBudgetConfig, ImportanceTier, loadPhaseBudgetConfig } from './phase_budget_config.js';

export interface PhaseBudget {
  phase: WorkPhase;
  token_limit: number;
  latency_limit_ms: number;
  calculation: {
    base_tokens: number;
    base_latency_ms: number;
    complexity: ScopeClass;
    complexity_mult: number;
    importance: ImportanceTier;
    importance_mult: number;
    phase_weight: number;
  };
}

export interface TaskBudgetOverrides {
  [phase: string]: {
    tokens?: number;
    latency_ms?: number;
  };
}

export interface TaskBudgets {
  phases: Map<WorkPhase, PhaseBudget>;
  total_tokens: number;
  total_latency_ms: number;
  config_hash: string;
}

/**
 * Calculate budget for a single phase
 */
export function calculatePhaseBudget(
  phase: WorkPhase,
  complexity: ScopeClass,
  importance: ImportanceTier,
  config: PhaseBudgetConfig,
  overrides?: TaskBudgetOverrides
): PhaseBudget {
  const base = config.base_budgets[phase];
  const complexityMult = config.complexity_multipliers[complexity];
  const importanceMult = config.importance_multipliers[importance];
  const phaseWeight = config.phase_weights[phase];

  // Apply overrides if present (overrides are absolute, not multiplied)
  const phaseOverride = overrides?.[phase];
  const tokenLimit = phaseOverride?.tokens ?? Math.ceil(base.tokens * complexityMult * importanceMult * phaseWeight);
  const latencyLimit = phaseOverride?.latency_ms ?? Math.ceil(base.latency_ms * complexityMult * importanceMult * phaseWeight);

  return {
    phase,
    token_limit: tokenLimit,
    latency_limit_ms: latencyLimit,
    calculation: {
      base_tokens: base.tokens,
      base_latency_ms: base.latency_ms,
      complexity,
      complexity_mult: complexityMult,
      importance,
      importance_mult: importanceMult,
      phase_weight: phaseWeight,
    },
  };
}

/**
 * Calculate budgets for all phases in a task
 */
export function calculateTaskBudgets(
  complexity: ScopeClass = 'Medium',
  importance: ImportanceTier = 'medium',
  overrides?: TaskBudgetOverrides,
  config?: PhaseBudgetConfig
): TaskBudgets {
  const finalConfig = config || loadPhaseBudgetConfig();

  const phases = [
    'STRATEGIZE',
    'SPEC',
    'PLAN',
    'AFP_ALIGNMENT',
    'THINK',
    'IMPLEMENT',
    'VERIFY',
    'REVIEW',
    'PR',
    'MONITOR'
  ] as WorkPhase[];
  const phaseBudgets = new Map<WorkPhase, PhaseBudget>();

  let totalTokens = 0;
  let totalLatency = 0;

  for (const phase of phases) {
    const budget = calculatePhaseBudget(phase, complexity, importance, finalConfig, overrides);
    phaseBudgets.set(phase, budget);
    totalTokens += budget.token_limit;
    totalLatency += budget.latency_limit_ms;
  }

  return {
    phases: phaseBudgets,
    total_tokens: totalTokens,
    total_latency_ms: totalLatency,
    config_hash: finalConfig.config_hash || 'default',
  };
}

/**
 * Format budget breakdown for debugging/logging
 */
export function formatBudgetBreakdown(budgets: TaskBudgets): string {
  const lines: string[] = [];
  lines.push(`Total Budget: ${budgets.total_tokens} tokens, ${Math.round(budgets.total_latency_ms / 1000)}s`);
  lines.push(`Config Hash: ${budgets.config_hash}`);
  lines.push('');
  lines.push('Phase Budgets:');

  for (const [phase, budget] of budgets.phases.entries()) {
    const calc = budget.calculation;
    lines.push(
      `  ${phase.padEnd(12)}: ${budget.token_limit.toString().padStart(6)} tokens, ${Math.round(budget.latency_limit_ms / 1000).toString().padStart(4)}s ` +
        `(${calc.complexity}/${calc.importance}, ${calc.base_tokens} × ${calc.complexity_mult} × ${calc.importance_mult} × ${calc.phase_weight})`
    );
  }

  return lines.join('\n');
}

/**
 * Estimate remaining budget for incomplete task
 */
export function estimateRemainingBudget(
  budgets: TaskBudgets,
  completedPhases: WorkPhase[]
): { tokens: number; latency_ms: number } {
  let remainingTokens = 0;
  let remainingLatency = 0;

  for (const [phase, budget] of budgets.phases.entries()) {
    if (!completedPhases.includes(phase)) {
      remainingTokens += budget.token_limit;
      remainingLatency += budget.latency_limit_ms;
    }
  }

  return { tokens: remainingTokens, latency_ms: remainingLatency };
}
