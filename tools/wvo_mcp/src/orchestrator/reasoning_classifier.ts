import type { Task } from './state_machine.js';
import type { AssembledContext } from './context_assembler.js';

export type ReasoningLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface ReasoningSignal {
  reason: string;
  weight: number;
}

export interface ReasoningDecision {
  level: ReasoningLevel;
  score: number;
  confidence: number;
  signals: ReasoningSignal[];
  override?: 'metadata' | 'status' | 'manual';
}

interface OverrideResult {
  level: ReasoningLevel;
  source: 'metadata' | 'manual' | 'status';
  reason: string;
}

type MetadataRecord = Record<string, unknown>;

/**
 * Infer the reasoning level required for a task using lightweight heuristics.
 * The goal is to dynamically adapt reasoning depth for each task rather than
 * relying on a static preset or global toggle.
 */
export function inferReasoningRequirement(task: Task, context: AssembledContext): ReasoningDecision {
  const override = extractMetadataOverride(task.metadata);
  if (override) {
    return {
      level: override.level,
      score: levelToScore(override.level),
      confidence: 0.95,
      signals: [{ reason: override.reason, weight: levelToScore(override.level) }],
      override: override.source,
    };
  }

  const signals: ReasoningSignal[] = [];
  let score = 0;

  const text = `${task.title} ${task.description ?? ''}`.toLowerCase();
  const complexity = task.estimated_complexity ?? 5;
  const complexityKey = `estimated complexity ${complexity}/10`;
  if (complexity >= 8) {
    score += addSignal(signals, 1.6, `${complexityKey} (very high)`);
  } else if (complexity >= 7) {
    score += addSignal(signals, 1.0, `${complexityKey} (high)`);
  } else if (complexity <= 2) {
    score += addSignal(signals, -0.9, `${complexityKey} (very low)`);
  } else if (complexity <= 3) {
    score += addSignal(signals, -0.6, `${complexityKey} (low)`);
  }

  switch (task.status) {
    case 'needs_review':
      score += addSignal(signals, 1.4, 'status needs_review');
      break;
    case 'needs_improvement':
      score += addSignal(signals, 0.7, 'status needs_improvement follow-up');
      break;
    case 'blocked':
      score += addSignal(signals, 0.4, 'status blocked');
      break;
    default:
      break;
  }

  if (task.type === 'epic') {
    score += addSignal(signals, 1.4, 'task type epic');
  } else if (task.type === 'story') {
    score += addSignal(signals, 0.2, 'task type story');
  }

  applyKeywordSignals(text, signals);

  const decisionsCount = context.relevantDecisions?.length ?? 0;
  if (decisionsCount >= 4) {
    score += addSignal(signals, 0.9, `${decisionsCount} relevant decisions`);
  } else if (decisionsCount >= 2) {
    score += addSignal(signals, 0.4, `${decisionsCount} relevant decisions`);
  }

  const constraintsCount = context.relevantConstraints?.length ?? 0;
  if (constraintsCount >= 4) {
    score += addSignal(signals, 0.8, `${constraintsCount} active constraints`);
  } else if (constraintsCount >= 2) {
    score += addSignal(signals, 0.4, `${constraintsCount} active constraints`);
  }

  const issuesCount = context.qualityIssuesInArea?.length ?? 0;
  if (issuesCount >= 4) {
    score += addSignal(signals, 0.8, `${issuesCount} quality issues in area`);
  } else if (issuesCount >= 1) {
    score += addSignal(signals, 0.5, `${issuesCount} quality issues in area`);
  }

  const filesToRead = context.filesToRead?.length ?? 0;
  if (filesToRead >= 6) {
    score += addSignal(signals, 0.6, `${filesToRead} files in context`);
  } else if (filesToRead >= 3) {
    score += addSignal(signals, 0.3, `${filesToRead} files in context`);
  }

  const relatedTasks = context.relatedTasks ?? [];
  const relatedHighComplexity = relatedTasks.filter(
    (related) => (related.estimated_complexity ?? 5) >= 7
  ).length;
  if (relatedHighComplexity >= 2) {
    score += addSignal(signals, 0.7, 'multiple related high-complexity tasks');
  } else if (relatedHighComplexity === 1) {
    score += addSignal(signals, 0.3, 'related high-complexity task');
  }

  const relatedBlocked = relatedTasks.filter((related) => related.status === 'blocked').length;
  if (relatedBlocked > 0) {
    score += addSignal(signals, 0.4, 'related blocked tasks present');
  }

  const projectPhase = context.projectPhase?.toLowerCase() ?? '';
  if (projectPhase.includes('architecture') || projectPhase.includes('discovery')) {
    score += addSignal(signals, 0.4, `project phase ${context.projectPhase}`);
  }

  const qualityTrend = context.velocityMetrics?.qualityTrendOverall;
  if (qualityTrend === 'declining') {
    score += addSignal(signals, 0.3, 'quality trend declining');
  }

  const metadata = task.metadata as MetadataRecord | undefined;
  if (metadata) {
    const riskLevel = extractRiskLevel(metadata);
    if (riskLevel === 'high' || riskLevel === 'critical') {
      score += addSignal(signals, 0.8, `risk level ${riskLevel}`);
    } else if (riskLevel === 'medium') {
      score += addSignal(signals, 0.4, 'risk level medium');
    } else if (riskLevel === 'low') {
      score += addSignal(signals, -0.3, 'risk level low');
    }

    if (metadata['requires_research'] === true || metadata['deep_analysis'] === true) {
      score += addSignal(signals, 0.6, 'metadata requests deep analysis');
    }
  }

  const level = mapScoreToLevel(score);
  const confidence = computeConfidence(signals);
  const sortedSignals = signals.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  return {
    level,
    score: round(score),
    confidence,
    signals: sortedSignals,
  };
}

function addSignal(signals: ReasoningSignal[], weight: number, reason: string): number {
  signals.push({ reason, weight: round(weight) });
  return weight;
}

function applyKeywordSignals(text: string, signals: ReasoningSignal[]): void {
  const keywordSets: Array<{ weight: number; reason: string; patterns: RegExp[] }> = [
    {
      weight: 1.2,
      reason: 'strategic/architecture keywords',
      patterns: [
        /\barchitecture\b/,
        /\barchitect\b/,
        /strateg/i,
        /\bblueprint\b/,
        /\broadmap\b/,
        /\bplan\b/,
        /\badr\b/,
      ],
    },
    {
      weight: 0.9,
      reason: 'analysis/investigation keywords',
      patterns: [
        /\binvestigat/i,
        /\bdiagnos/i,
        /\broot cause\b/,
        /\bforensic\b/,
        /\baudit\b/,
        /\bassess/i,
        /\bresearch\b/,
        /\bexplor/i,
        /\bmodel\b/,
        /\bforecast\b/,
      ],
    },
    {
      weight: 0.6,
      reason: 'refactor/rewrite keywords',
      patterns: [/\brefactor\b/, /\brewrite\b/, /\brestructur/i, /\bmodern/i],
    },
    {
      weight: -0.6,
      reason: 'documentation keywords',
      patterns: [
        /\bdocument/i,
        /\breadme\b/,
        /\bcopy\b/,
        /\bcontent\b/,
        /\bstory\b/,
        /\breport\b/,
        /\bdoc\b/,
      ],
    },
    {
      weight: -0.7,
      reason: 'trivial/change hygiene keywords',
      patterns: [
        /\btypo\b/,
        /\bwhitespace\b/,
        /\blint\b/,
        /\bformat\b/,
        /\bprettier\b/,
        /\brename\b/,
        /\bchore\b/,
        /\bminor fix\b/,
      ],
    },
  ];

  for (const { weight, reason, patterns } of keywordSets) {
    if (patterns.some((pattern) => pattern.test(text))) {
      addSignal(signals, weight, reason);
    }
  }
}

function mapScoreToLevel(score: number): ReasoningLevel {
  if (score >= 2) {
    return 'high';
  }
  if (score >= 0.75) {
    return 'medium';
  }
  if (score >= -1) {
    return 'low';
  }
  return 'minimal';
}

function computeConfidence(signals: ReasoningSignal[]): number {
  if (signals.length === 0) {
    return 0.4;
  }

  const totalMagnitude = signals.reduce((sum, signal) => sum + Math.abs(signal.weight), 0);
  const bounded = Math.min(0.95, 0.35 + totalMagnitude * 0.08 + signals.length * 0.03);
  return round(Math.max(0.35, bounded));
}

function extractMetadataOverride(metadata: unknown): OverrideResult | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as MetadataRecord;
  const candidates = [
    record['reasoning_level'],
    record['reasoningLevel'],
    record['reasoning'],
    record['reasoning_mode'],
    record['reasoningMode'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (isReasoningLevel(normalized)) {
        return {
          level: normalized,
          source: 'metadata',
          reason: `metadata reasoning_level=${normalized}`,
        };
      }
    }
  }

  const requireKeys = ['requires_reasoning', 'needs_reasoning', 'force_reasoning'];
  for (const key of requireKeys) {
    const value = record[key];
    if (value === true) {
      return {
        level: 'high',
        source: 'metadata',
        reason: `metadata ${key}=true`,
      };
    }
    if (typeof value === 'string' && isReasoningLevel(value.trim().toLowerCase())) {
      const normalized = value.trim().toLowerCase() as ReasoningLevel;
      return {
        level: normalized,
        source: 'metadata',
        reason: `metadata ${key}=${normalized}`,
      };
    }
  }

  return null;
}

function extractRiskLevel(metadata: MetadataRecord): 'low' | 'medium' | 'high' | 'critical' | null {
  const candidates = [
    metadata['risk'],
    metadata['risk_level'],
    metadata['riskLevel'],
    metadata['impact_level'],
    metadata['impactLevel'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
        return normalized as 'low' | 'medium' | 'high' | 'critical';
      }
      if (normalized.includes('critical')) {
        return 'critical';
      }
      if (normalized.includes('high')) {
        return 'high';
      }
      if (normalized.includes('medium')) {
        return 'medium';
      }
      if (normalized.includes('low')) {
        return 'low';
      }
    }
  }
  return null;
}

function isReasoningLevel(candidate: string): candidate is ReasoningLevel {
  return candidate === 'minimal' || candidate === 'low' || candidate === 'medium' || candidate === 'high';
}

function levelToScore(level: ReasoningLevel): number {
  switch (level) {
    case 'high':
      return 2.4;
    case 'medium':
      return 1.1;
    case 'low':
      return -0.2;
    case 'minimal':
    default:
      return -1.6;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
