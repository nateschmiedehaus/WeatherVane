/**
 * Phase Budget Configuration Loader
 *
 * Loads and validates budget configuration from config/phase_budgets.yaml
 * with fallback to hardcoded defaults.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createHash } from 'node:crypto';
import type { WorkPhase } from '../orchestrator/work_process_enforcer.js';
import { ScopeClass } from './context_budgeting.js';

export type ImportanceTier = 'low' | 'medium' | 'high' | 'critical';

export interface PhaseBudgetLimits {
  tokens: number;
  latency_ms: number;
}

export interface BudgetMultipliers {
  complexity_multipliers: Record<ScopeClass, number>;
  importance_multipliers: Record<ImportanceTier, number>;
  phase_weights: Record<WorkPhase, number>;
}

export interface StopLossConfig {
  enabled: boolean;
  cumulative_token_threshold: number;
  cumulative_latency_threshold: number;
  per_phase_threshold: number;
  allow_completion_threshold: number;
}

export interface PhaseBudgetConfig {
  base_budgets: Record<string, PhaseBudgetLimits>; // Use string to support both UPPERCASE and lowercase
  complexity_multipliers: Record<ScopeClass, number>;
  importance_multipliers: Record<ImportanceTier, number>;
  phase_weights: Record<string, number>;
  stop_loss: StopLossConfig;
  config_hash?: string; // SHA256 of config for versioning
}

// Hardcoded defaults (fallback if config file missing)
const DEFAULT_CONFIG: PhaseBudgetConfig = {
  base_budgets: {
    STRATEGIZE: { tokens: 3000, latency_ms: 60000 },
    SPEC: { tokens: 1500, latency_ms: 40000 },
    PLAN: { tokens: 2000, latency_ms: 50000 },
    AFP_ALIGNMENT: { tokens: 2200, latency_ms: 60000 },
    THINK: { tokens: 4000, latency_ms: 90000 },
    IMPLEMENT: { tokens: 3500, latency_ms: 120000 },
    VERIFY: { tokens: 2500, latency_ms: 60000 },
    REVIEW: { tokens: 2000, latency_ms: 50000 },
    PR: { tokens: 1500, latency_ms: 30000 },
    MONITOR: { tokens: 1000, latency_ms: 20000 },
  },
  complexity_multipliers: {
    Tiny: 0.5,
    Small: 0.8,
    Medium: 1.0,
    Large: 1.5,
  },
  importance_multipliers: {
    low: 0.7,
    medium: 1.0,
    high: 1.5,
    critical: 2.0,
  },
  phase_weights: {
    STRATEGIZE: 1.5,
    SPEC: 1.0,
    PLAN: 1.2,
    AFP_ALIGNMENT: 1.3,
    THINK: 1.5,
    IMPLEMENT: 1.0,
    VERIFY: 0.8,
    REVIEW: 1.0,
    PR: 0.6,
    MONITOR: 0.6,
  },
  stop_loss: {
    enabled: true,
    cumulative_token_threshold: 1.2,
    cumulative_latency_threshold: 1.2,
    per_phase_threshold: 1.5,
    allow_completion_threshold: 1.1,
  },
};

let cachedConfig: PhaseBudgetConfig | null = null;

/**
 * Load phase budget configuration from file with validation
 */
export function loadPhaseBudgetConfig(configPath?: string): PhaseBudgetConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const finalPath = configPath || path.join(workspaceRoot, 'config', 'phase_budgets.yaml');

  try {
    const configContent = fs.readFileSync(finalPath, 'utf8');
    const config = yaml.load(configContent) as PhaseBudgetConfig;

    // Validate config
    validatePhaseBudgetConfig(config);

    // Calculate config hash for versioning (synchronous)
    config.config_hash = createHash('sha256').update(configContent).digest('hex').slice(0, 16);

    cachedConfig = config;
    return config;
  } catch (error) {
    console.warn(`Failed to load phase budget config from ${finalPath}, using defaults:`, error);
    cachedConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

/**
 * Validate phase budget configuration
 */
function validatePhaseBudgetConfig(config: any): asserts config is PhaseBudgetConfig {
  // Check all required phases present (both UPPERCASE and lowercase supported)
  const phases = ['STRATEGIZE', 'SPEC', 'PLAN', 'AFP_ALIGNMENT', 'THINK', 'IMPLEMENT', 'VERIFY', 'REVIEW', 'PR', 'MONITOR'];
  for (const phase of phases) {
    if (!config.base_budgets?.[phase]) {
      throw new Error(`Missing base budget for phase: ${phase}`);
    }
    if (typeof config.base_budgets[phase].tokens !== 'number' || config.base_budgets[phase].tokens <= 0) {
      throw new Error(`Invalid token budget for phase ${phase}`);
    }
    if (typeof config.base_budgets[phase].latency_ms !== 'number' || config.base_budgets[phase].latency_ms <= 0) {
      throw new Error(`Invalid latency budget for phase ${phase}`);
    }
  }

  // Check complexity multipliers
  const complexityTiers: ScopeClass[] = ['Tiny', 'Small', 'Medium', 'Large'];
  for (const tier of complexityTiers) {
    const mult = config.complexity_multipliers?.[tier];
    if (typeof mult !== 'number' || mult <= 0 || mult > 10) {
      throw new Error(`Invalid complexity multiplier for ${tier}: ${mult} (must be 0 < mult <= 10)`);
    }
  }

  // Check importance multipliers
  const importanceTiers: ImportanceTier[] = ['low', 'medium', 'high', 'critical'];
  for (const tier of importanceTiers) {
    const mult = config.importance_multipliers?.[tier];
    if (typeof mult !== 'number' || mult <= 0 || mult > 10) {
      throw new Error(`Invalid importance multiplier for ${tier}: ${mult} (must be 0 < mult <= 10)`);
    }
  }

  // Check phase weights
  for (const phase of phases) {
    const weight = config.phase_weights?.[phase];
    if (typeof weight !== 'number' || weight <= 0 || weight > 10) {
      throw new Error(`Invalid phase weight for ${phase}: ${weight} (must be 0 < weight <= 10)`);
    }
  }

  // Check stop_loss config
  if (!config.stop_loss) {
    throw new Error('Missing stop_loss configuration');
  }
  if (typeof config.stop_loss.cumulative_token_threshold !== 'number' || config.stop_loss.cumulative_token_threshold <= 1) {
    throw new Error('Invalid cumulative_token_threshold');
  }
}

/**
 * Reload configuration (for runtime updates)
 */
export function reloadPhaseBudgetConfig(configPath?: string): PhaseBudgetConfig {
  cachedConfig = null;
  return loadPhaseBudgetConfig(configPath);
}

/**
 * Get default configuration (for testing)
 */
export function getDefaultConfig(): PhaseBudgetConfig {
  return { ...DEFAULT_CONFIG };
}
