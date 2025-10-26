import type { Task } from './state_machine.js';
import type { AssembledContext } from './context_assembler.js';
import type { ModelManager } from '../models/model_manager.js';
import {
  inferReasoningRequirement,
  type ReasoningDecision,
  type ReasoningLevel,
} from './reasoning_classifier.js';

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
  'codex-5-low': {
    id: 'codex-5-low',
    label: 'codex-5 low',
    modelSlug: 'codex-5',
    reasoning: 'low',
    profile: 'low',
    description: 'Fastest responses with limited reasoning',
  },
  'codex-5-medium': {
    id: 'codex-5-medium',
    label: 'codex-5 medium',
    modelSlug: 'codex-5',
    reasoning: 'medium',
    profile: 'medium',
    description: 'Adjusts reasoning depth based on task complexity',
  },
  'codex-5-high': {
    id: 'codex-5-high',
    label: 'codex-5 high',
    modelSlug: 'codex-5',
    reasoning: 'high',
    profile: 'high',
    description: 'Maximum reasoning depth for complex or ambiguous problems',
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

  const reasoningDecision = inferReasoningRequirement(task, context);
  let desiredLevel: ReasoningLevel = reasoningDecision.level;
  const adjustments: string[] = [];

  if (complexity >= 7) {
    const upgraded = ensureMinimumLevel(desiredLevel, 'medium');
    if (upgraded !== desiredLevel) {
      adjustments.push('complexity floor enforced');
      desiredLevel = upgraded;
    }
  }

  if (!documentationTask && complexity >= 8 && desiredLevel !== 'high') {
    desiredLevel = 'high';
    adjustments.push('complexity >= 8 escalation');
  }

  if (needsReview && desiredLevel !== 'high') {
    desiredLevel = 'high';
    adjustments.push('review workflow escalation');
  }

  if (strategicTask && desiredLevel !== 'high') {
    desiredLevel = 'high';
    adjustments.push('strategic/architecture emphasis');
  }

  if (!documentationTask && (context.relevantConstraints?.length ?? 0) > 3 && desiredLevel === 'low') {
    desiredLevel = 'medium';
    adjustments.push('constraint density requires additional reasoning');
  }

  if (documentationTask) {
    adjustments.push('documentation focus (prefers lightweight codex preset)');
  }

  if (followUp && desiredLevel === 'medium' && complexity <= 4) {
    desiredLevel = 'low';
    adjustments.push('follow-up fix prefers lean reasoning');
  }

  const rationaleSummary = formatReasoningSummary(reasoningDecision, desiredLevel);
  const rationaleParts = [rationaleSummary, ...adjustments];

  const plan = documentationTask
    ? buildDocumentationPlan(desiredLevel, rationaleParts.join('; '), complexity)
    : buildCodingPlan(desiredLevel, rationaleParts.join('; '), {
        followUp,
        highComplexity: complexity >= 7,
      });

  return adjustForOperations(plan, operational, modelManager);
}

const LEVEL_ORDER: ReasoningLevel[] = ['minimal', 'low', 'medium', 'high'];

function ensureMinimumLevel(current: ReasoningLevel, minimum: ReasoningLevel): ReasoningLevel {
  if (LEVEL_ORDER.indexOf(current) >= LEVEL_ORDER.indexOf(minimum)) {
    return current;
  }
  return minimum;
}

function formatReasoningSummary(decision: ReasoningDecision, finalLevel: ReasoningLevel): string {
  const baseLevel =
    decision.level === finalLevel ? finalLevel : `${decision.level} -> ${finalLevel}`;
  const topSignals = decision.signals.slice(0, 3).map((signal) => signal.reason);
  const signalsText = topSignals.length > 0 ? topSignals.join(', ') : 'no dominant signals';
  const overrideText = decision.override ? `, override=${decision.override}` : '';

  return `dynamic reasoning score ${formatNumber(decision.score)} -> ${baseLevel} (confidence ${formatNumber(decision.confidence)}${overrideText}); signals: ${signalsText}`;
}

function buildCodingPlan(
  level: ReasoningLevel,
  rationale: string,
  options: { followUp: boolean; highComplexity: boolean }
): SelectionPlan {
  switch (level) {
    case 'high':
      return {
        preset: 'codex-5-high',
        fallback: 'codex-5-medium',
        rationale,
        critical: true,
      };
    case 'medium':
      return {
        preset: 'codex-5-medium',
        fallback: 'codex-5-low',
        rationale,
        critical: options.highComplexity,
      };
    case 'low':
    case 'minimal':
    default:
      return {
        preset: 'codex-5-low',
        fallback: 'codex-5-medium',
        rationale,
        critical: false,
      };
  }
}

function buildDocumentationPlan(
  level: ReasoningLevel,
  rationale: string,
  complexity: number
): SelectionPlan {
  if (complexity >= 8) {
    level = 'high';
  } else if (complexity <= 4) {
    level = 'low';
  }

  switch (level) {
    case 'high':
      return {
        preset: 'codex-5-high',
        fallback: 'codex-5-medium',
        rationale,
        critical: true,
      };
    case 'medium':
      return {
        preset: 'codex-5-medium',
        fallback: 'codex-5-low',
        rationale,
        critical: complexity >= 6,
      };
    case 'low':
    case 'minimal':
    default:
      return {
        preset: 'codex-5-low',
        fallback: 'codex-5-medium',
        rationale,
        critical: false,
      };
  }
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
      presetId = 'codex-5-low';
      notes.push('Rate-limit pressure detected; prioritising low preset');
    } else if (!plan.critical && operational.mode === 'stabilize' && presetProfile(presetId) === 'high') {
      presetId = plan.fallback;
      notes.push('Stabilize mode; reducing reasoning depth to conserve tokens');
    } else if (plan.critical && operational.mode === 'accelerate' && presetProfile(presetId) === 'medium') {
      presetId = 'codex-5-high';
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
      if (plan.critical && currentStats.successRate < 0.62 && plan.preset !== 'codex-5-high') {
        presetId = 'codex-5-high';
        notes.push(`Critical work success ${formatPercent(currentStats.successRate)}; forcing high preset`);
      }
      if (plan.critical && currentStats.avgQuality < 0.82 && plan.preset !== 'codex-5-high') {
        presetId = 'codex-5-high';
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
  const preset = CODEX_PRESETS[presetId] ?? CODEX_PRESETS['codex-5-medium'];
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
  return CODEX_PRESETS[presetId]?.profile ?? CODEX_PRESETS['codex-5-medium'].profile;
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

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') : 'n/a';
}
