import type { Task } from './state_machine.js';
import type { AssembledContext } from './context_assembler.js';
import type { ModelManager } from '../models/model_manager.js';

export type ReasoningLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface CodexPresetPerformance {
  sampleSize: number;
  successRate: number;
  avgQuality: number;
  avgTotalTokens: number;
  avgCostUSD?: number;
}

export interface CodexOperationalSnapshot {
  mode?: 'balance' | 'stabilize' | 'accelerate';
  failureRate?: number;
  rateLimitCodex?: number;
  queueLength?: number;
  presetStats?: Record<string, CodexPresetPerformance>;
}

export interface ModelSelection {
  presetId: string;
  modelSlug: string;
  reasoning?: ReasoningLevel;
  profile: 'low' | 'medium' | 'high';
  rationale: string;
  description: string;
}

interface CodexPreset {
  id: string;
  label: string;
  modelSlug: string;
  reasoning?: ReasoningLevel;
  profile: 'low' | 'medium' | 'high';
  description: string;
}

const CODEX_PRESETS: Record<string, CodexPreset> = {
  'gpt-5-codex-low': {
    id: 'gpt-5-codex-low',
    label: 'gpt-5-codex low',
    modelSlug: 'gpt-5-codex',
    reasoning: 'low',
    profile: 'low',
    description: 'Fastest responses with limited reasoning',
  },
  'gpt-5-codex-medium': {
    id: 'gpt-5-codex-medium',
    label: 'gpt-5-codex medium',
    modelSlug: 'gpt-5-codex',
    reasoning: 'medium',
    profile: 'medium',
    description: 'Adjusts reasoning depth based on task complexity',
  },
  'gpt-5-codex-high': {
    id: 'gpt-5-codex-high',
    label: 'gpt-5-codex high',
    modelSlug: 'gpt-5-codex',
    reasoning: 'high',
    profile: 'high',
    description: 'Maximum reasoning depth for complex or ambiguous problems',
  },
  'gpt-5-minimal': {
    id: 'gpt-5-minimal',
    label: 'gpt-5 minimal',
    modelSlug: 'gpt-5',
    reasoning: 'minimal',
    profile: 'low',
    description: 'Non-coding minimal reasoning for quick summaries',
  },
  'gpt-5-medium': {
    id: 'gpt-5-medium',
    label: 'gpt-5 medium',
    modelSlug: 'gpt-5',
    reasoning: 'medium',
    profile: 'medium',
    description: 'Balanced general model for narrative/product work',
  },
  'gpt-5-high': {
    id: 'gpt-5-high',
    label: 'gpt-5 high',
    modelSlug: 'gpt-5',
    reasoning: 'high',
    profile: 'high',
    description: 'Deep reasoning general model for strategy or documentation',
  },
};

interface SelectionPlan {
  preset: string;
  fallback: string;
  rationale: string;
  critical: boolean;
}

export function selectCodexModel(
  task: Task,
  context: AssembledContext,
  operational?: CodexOperationalSnapshot,
  modelManager?: ModelManager
): ModelSelection {
  const complexity = task.estimated_complexity ?? 5;
  const hasCodeContext = Boolean(context.filesToRead && context.filesToRead.length > 0);
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

  const documentationTask = !hasCodeContext && /doc|documentation|story|ux|design|write|report|summary/.test(text);
  const strategicTask = containsArchitectureKeywords(task) || task.type === 'epic';
  const needsReview = task.status === 'needs_review';
  const followUp = task.status === 'needs_improvement';

  if (documentationTask) {
    return adjustForOperations({
      preset: complexity >= 7 ? 'gpt-5-high' : 'gpt-5-medium',
      fallback: 'gpt-5-medium',
      rationale: 'Documentation-focused task',
      critical: complexity >= 7,
    }, operational, modelManager);
  }

  if (needsReview || strategicTask) {
    return adjustForOperations({
      preset: 'gpt-5-codex-high',
      fallback: 'gpt-5-codex-medium',
      rationale: needsReview ? 'Reviewing changes with deep reasoning' : 'Strategic architecture task',
      critical: true,
    }, operational, modelManager);
  }

  if (complexity >= 7 || context.relevantConstraints.length > 3) {
    return adjustForOperations({
      preset: 'gpt-5-codex-high',
      fallback: 'gpt-5-codex-medium',
      rationale: 'High complexity implementation',
      critical: true,
    }, operational, modelManager);
  }

  if (followUp || complexity <= 3) {
    return adjustForOperations({
      preset: 'gpt-5-codex-low',
      fallback: 'gpt-5-codex-medium',
      rationale: 'Low complexity fix or follow-up',
      critical: false,
    }, operational, modelManager);
  }

  return adjustForOperations({
    preset: 'gpt-5-codex-medium',
    fallback: 'gpt-5-codex-low',
    rationale: 'Default balanced coding workload',
    critical: false,
  }, operational, modelManager);
}

function adjustForOperations(
  plan: SelectionPlan,
  operational?: CodexOperationalSnapshot,
  modelManager?: ModelManager
): ModelSelection {
  const notes: string[] = [];
  let presetId = plan.preset;

  if (operational) {
    const ratePressure = operational.rateLimitCodex ?? 0;
    const queueLength = operational.queueLength ?? 0;
    const presetStats = operational.presetStats ?? {};
    const currentStats = presetStats[presetId];
    const fallbackStats = presetStats[plan.fallback];

    if (!plan.critical && ratePressure >= 2) {
      presetId = 'gpt-5-codex-low';
      notes.push('Rate-limit pressure detected; prioritising low preset');
    } else if (!plan.critical && operational.mode === 'stabilize' && presetProfile(presetId) === 'high') {
      presetId = plan.fallback;
      notes.push('Stabilize mode; reducing reasoning depth to conserve tokens');
    } else if (plan.critical && operational.mode === 'accelerate' && presetProfile(presetId) === 'medium') {
      presetId = 'gpt-5-codex-high';
      notes.push('Accelerate mode; boosting reasoning for critical work');
    } else if (!plan.critical && queueLength > 5 && presetProfile(presetId) === 'high') {
      presetId = plan.fallback;
      notes.push('High queue volume; favouring throughput');
    }

    if (currentStats && currentStats.sampleSize >= 4) {
      if (!plan.critical && currentStats.successRate < 0.58) {
        presetId = plan.fallback;
        notes.push(`Recent success rate ${formatPercent(currentStats.successRate)} below 58%; falling back`);
      }
      if (plan.critical && currentStats.successRate < 0.62 && plan.preset !== 'gpt-5-codex-high') {
        presetId = 'gpt-5-codex-high';
        notes.push(`Critical work success ${formatPercent(currentStats.successRate)}; forcing high preset`);
      }
      if (plan.critical && currentStats.avgQuality < 0.82 && plan.preset !== 'gpt-5-codex-high') {
        presetId = 'gpt-5-codex-high';
        notes.push(`Critical work quality ${currentStats.avgQuality.toFixed(2)} < 0.82; boosting preset`);
      }
      if (!plan.critical && currentStats.avgTotalTokens > 9000) {
        presetId = plan.fallback;
        notes.push(`Average token usage ${Math.round(currentStats.avgTotalTokens)} > 9000; conserving tokens`);
      }
    }

    if (
      !plan.critical &&
      currentStats &&
      fallbackStats &&
      currentStats.sampleSize >= 4 &&
      fallbackStats.sampleSize >= 4
    ) {
      const tokenDelta = currentStats.avgTotalTokens - fallbackStats.avgTotalTokens;
      if (tokenDelta > 3000 && fallbackStats.successRate >= currentStats.successRate - 0.05) {
        presetId = plan.fallback;
        notes.push(
          `Fallback preset succeeds with comparable quality using ~${Math.round(tokenDelta)} fewer tokens`
        );
      }
    }
  }

  return buildSelection(presetId, plan.rationale, notes, modelManager);
}

function buildSelection(
  presetId: string,
  rationale: string,
  notes: string[] = [],
  modelManager?: ModelManager
): ModelSelection {
  const preset = CODEX_PRESETS[presetId] ?? CODEX_PRESETS['gpt-5-codex-medium'];
  const rationaleText = notes.length ? `${rationale}; ${notes.join('; ')}` : rationale;

  // Update cost from model registry if available
  let costInfo = '';
  if (modelManager) {
    const cost = modelManager.getModelCost('codex', preset.modelSlug);
    if (cost) {
      costInfo = ` (cost: $${cost.input}/$${cost.output}/Mtok)`;
    }
  }

  return {
    presetId: preset.id,
    modelSlug: preset.modelSlug,
    reasoning: preset.reasoning,
    profile: preset.profile,
    rationale: rationaleText + costInfo,
    description: preset.description,
  };
}

function presetProfile(presetId: string): 'low' | 'medium' | 'high' {
  return CODEX_PRESETS[presetId]?.profile ?? CODEX_PRESETS['gpt-5-codex-medium'].profile;
}

function containsArchitectureKeywords(task: Task): boolean {
  const keywords = ['design', 'architecture', 'strategy', 'methodology', 'approach', 'orchestrator', 'review', 'plan'];
  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  return keywords.some((word) => text.includes(word));
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${Math.round(value * 100)}%`;
}
