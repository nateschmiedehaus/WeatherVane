/**
 * Metrics Collector for Autopilot Performance Tracking
 *
 * Collects quality, efficiency, learning, and system health metrics
 * with comprehensive tagging for segmented analysis.
 *
 * Design:
 * - Streaming JSONL writes for real-time metrics
 * - Tags enable segmentation by task type, complexity, agent, etc.
 * - Low overhead (<5% of task execution time)
 * - Graceful degradation if disabled
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TaskEnvelope } from '../orchestrator/task_envelope.js';

import { logDebug, logWarning } from './logger.js';

/**
 * Tags for metric segmentation
 * Enables analysis like: "Feature tasks cost 2x more than bug tasks"
 */
export interface MetricsTags {
  // Task characteristics
  taskId: string;
  taskType: 'feature' | 'bug' | 'docs' | 'refactor' | 'test' | 'unknown';
  taskTypeConfidence: number; // 0-1
  complexityTier: 'low' | 'medium' | 'high' | 'critical';
  complexityScore: number; // Raw 0-10 score
  epic?: string;
  milestone?: string;

  // Execution context
  agentType?: 'planner' | 'thinker' | 'implementer' | 'reviewer' | 'critical';
  processStage?: 'spec' | 'plan' | 'think' | 'implement' | 'verify' | 'review' | 'pr' | 'monitor';
  modelProvider: 'codex' | 'claude' | 'unknown';
  modelTier?: string; // e.g., "codex-5-sonnet", "claude-sonnet-4"

  // File/code characteristics
  primaryLanguage?: 'typescript' | 'python' | 'markdown' | 'yaml' | 'shell' | 'other';
  filesModified?: number;
  linesChanged?: number;

  // Tools used
  toolsUsed?: string[]; // ['grep', 'read', 'bash', 'edit']

  // Autopilot features
  usedComplexityRouter: boolean;
  usedWIPController: boolean;
  usedThinkStage: boolean;
  usedResolutionEngine: boolean;
}

/**
 * Quality metrics: Are we doing good work?
 */
export interface QualityMetrics {
  taskSucceeded: boolean;
  firstPassReview: boolean; // Passed review on first attempt?
  iterationCount: number; // Loops through SPEC→MONITOR
  testCoverageDelta: number; // % change in coverage
  regressionIntroduced: boolean; // Broke existing tests?
  rubricScores?: {
    resolution_proof: number;
    design: number;
    performance_security: number;
    maintainability: number;
    executive_quality: number;
  };
  integrationFailures?: number; // # times integration verification failed
}

/**
 * Efficiency metrics: Are we fast and cheap?
 */
export interface EfficiencyMetrics {
  durationMs: number; // Wall clock time
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  retryOverheadTokens: number; // Tokens wasted on failed attempts
  queueWaitTimeMs?: number; // Time waiting for WIP slot
  modelSelectionOptimal?: boolean; // Was tier choice correct?
  contextEfficiency?: number; // Ratio of context to generation tokens
}

/**
 * Learning metrics: What should we optimize?
 */
export interface LearningMetrics {
  blockerType?: string; // From blocker taxonomy
  escalationReason?: string; // Why escalated to human?
  errorPattern?: string; // Common error message
  phaseDuration?: Record<string, number>; // Time per SPEC/PLAN/etc
}

/**
 * System health metrics: Is infrastructure reliable?
 */
export interface SystemHealthMetrics {
  providerAvailable: boolean;
  rateLimitHit: boolean;
  circuitBreakerTripped: boolean;
  queueDepth?: number;
  tokenBudgetRemaining?: number;
  qualityGraphCorpusSize?: number; // Number of task vectors in corpus
}

/**
 * Complete metrics record (written to JSONL)
 */
export interface MetricsRecord {
  timestamp: string;
  tags: MetricsTags;
  quality: QualityMetrics;
  efficiency: EfficiencyMetrics;
  learning: LearningMetrics;
  systemHealth: SystemHealthMetrics;
}

/**
 * Task type inference keywords
 */
const TASK_TYPE_KEYWORDS = {
  feature: ['add', 'implement', 'create', 'new', 'build', 'develop'],
  bug: ['fix', 'resolve', 'correct', 'repair', 'patch', 'debug'],
  docs: ['document', 'readme', 'docs', 'comment', 'guide'],
  refactor: ['refactor', 'restructure', 'cleanup', 'simplify', 'reorganize'],
  test: ['test', 'coverage', 'spec', 'validate', 'verify'],
};

/**
 * Infer task type from title and labels
 */
export function inferTaskType(task: TaskEnvelope): {
  taskType: MetricsTags['taskType'];
  confidence: number;
} {
  // Priority 1: Check labels
  if (task.labels) {
    for (const label of task.labels) {
      const lowerLabel = label.toLowerCase();
      if (lowerLabel.includes('feature')) return { taskType: 'feature', confidence: 0.9 };
      if (lowerLabel.includes('bug')) return { taskType: 'bug', confidence: 0.9 };
      if (lowerLabel.includes('docs')) return { taskType: 'docs', confidence: 0.9 };
      if (lowerLabel.includes('refactor')) return { taskType: 'refactor', confidence: 0.9 };
      if (lowerLabel.includes('test')) return { taskType: 'test', confidence: 0.9 };
    }
  }

  // Priority 2: Check title keywords
  const titleLower = task.title.toLowerCase();
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        return { taskType: type as MetricsTags['taskType'], confidence: 0.7 };
      }
    }
  }

  // Fallback: unknown
  return { taskType: 'unknown', confidence: 0.0 };
}

/**
 * Get current size of quality graph corpus
 *
 * Counts lines in task_vectors.jsonl to track corpus growth.
 * Used for monitoring when corpus approaches pruning limit (2000 vectors).
 *
 * @param workspaceRoot - Root directory containing state/quality_graph
 * @returns Number of vectors in corpus (0 if file doesn't exist)
 */
export async function getQualityGraphCorpusSize(workspaceRoot: string): Promise<number> {
  try {
    const vectorsPath = path.join(workspaceRoot, 'state', 'quality_graph', 'task_vectors.jsonl');

    // File doesn't exist yet (first task before any vectors)
    try {
      await fs.access(vectorsPath);
    } catch {
      return 0;
    }

    // Read file and count non-empty lines
    const content = await fs.readFile(vectorsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    return lines.length;
  } catch (error) {
    logWarning('Failed to get quality graph corpus size', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0; // Graceful degradation
  }
}

/**
 * Metrics Collector
 *
 * Records metrics in streaming JSONL format for real-time analysis.
 */
export class MetricsCollector {
  private metricsPath: string;
  private pendingRecords: MetricsRecord[] = [];
  private batchSize: number;

  constructor(
    private workspaceRoot: string,
    private options: { disabled?: boolean; batchSize?: number } = {}
  ) {
    this.metricsPath = path.join(workspaceRoot, 'state', 'telemetry', 'metrics.jsonl');
    this.batchSize = options.batchSize ?? 1; // Default: write immediately (streaming)
  }

  /**
   * Record a completed task's metrics
   */
  async recordTask(
    tags: MetricsTags,
    quality: QualityMetrics,
    efficiency: EfficiencyMetrics,
    learning: LearningMetrics,
    systemHealth: SystemHealthMetrics
  ): Promise<void> {
    if (this.options.disabled) {
      return;
    }

    try {
      const record: MetricsRecord = {
        timestamp: new Date().toISOString(),
        tags,
        quality,
        efficiency,
        learning,
        systemHealth,
      };

      this.pendingRecords.push(record);

      // Batch writes to reduce I/O
      if (this.pendingRecords.length >= this.batchSize) {
        await this.flush();
      }

      logDebug('MetricsCollector recorded task', {
        taskId: tags.taskId,
        taskType: tags.taskType,
        success: quality.taskSucceeded,
      });
    } catch (error) {
      logWarning('MetricsCollector failed to record task', {
        taskId: tags.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Record a simple counter increment (e.g., violations, errors)
   * Used for lightweight metrics like phase_skips_attempted
   */
  async recordCounter(counterName: string, value: number = 1, metadata?: Record<string, unknown>): Promise<void> {
    if (this.options.disabled) {
      return;
    }

    try {
      const timestamp = new Date().toISOString();

      await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });

      const metricsRecord = {
        timestamp,
        type: 'counter',
        metric: counterName,
        value,
        metadata: metadata ?? {},
      };

      await fs.appendFile(this.metricsPath, JSON.stringify(metricsRecord) + '\n');

      const counterPath = path.join(this.workspaceRoot, 'state', 'telemetry', 'counters.jsonl');
      await fs.mkdir(path.dirname(counterPath), { recursive: true });

      const record = {
        timestamp,
        counter: counterName,
        value,
        metadata: metadata ?? {},
      };

      await fs.appendFile(counterPath, JSON.stringify(record) + '\n');

      logDebug('MetricsCollector recorded counter', { counterName, value });
    } catch (error) {
      logWarning('MetricsCollector failed to record counter', {
        counterName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Flush pending records to disk
   */
  async flush(): Promise<void> {
    if (this.pendingRecords.length === 0) {
      return;
    }

    try {
      await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });

      const lines = this.pendingRecords.map((record) => JSON.stringify(record)).join('\n') + '\n';
      await fs.appendFile(this.metricsPath, lines);

      logDebug('MetricsCollector flushed records', { count: this.pendingRecords.length });
      this.pendingRecords = [];
    } catch (error) {
      logWarning('MetricsCollector failed to flush', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Ensure all pending records are written (call on shutdown)
   */
  async close(): Promise<void> {
    await this.flush();
  }
}
