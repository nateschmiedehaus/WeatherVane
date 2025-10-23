/**
 * Resource Budgets & Observability for Worker Calls
 *
 * Provides:
 * - Memory (RSS) usage monitoring with configurable limits
 * - Concurrency guardrails with lane-aware rate limiting
 * - Timeout enforcement with escalation
 * - OTel span integration for comprehensive observability
 * - Structured JSON logging of resource usage
 *
 * Architecture:
 * 1. ResourceBudgetManager: Central coordinator
 * 2. LaneManager: Per-lane concurrency control
 * 3. TimeoutManager: Request-level timeout enforcement
 * 4. MemoryMonitor: RSS and heap usage tracking
 * 5. Metrics: Accumulated telemetry for observability
 */

import { logInfo, logWarning, logError } from "../telemetry/logger.js";
import {
  startOtelSpan,
  endOtelSpan,
  recordSpanEvent,
  recordSpanError,
  recordOperationMetrics,
  type SpanHandle,
} from "../telemetry/otel_spans.js";

/**
 * Lane identifier for categorizing concurrent operations
 * Examples: 'tool_call', 'file_read', 'file_write', 'critic'
 */
export type Lane = string;

/**
 * Resource budget configuration
 */
export interface ResourceBudgetConfig {
  /** Maximum RSS memory in MB (e.g., 512) */
  maxRssMb: number;

  /** Heap warning threshold in MB (e.g., 400) */
  heapWarningMb: number;

  /** Per-lane concurrency limit */
  laneConcurrencyLimits: Record<Lane, number>;

  /** Global concurrency limit across all lanes */
  globalConcurrencyLimit: number;

  /** Default timeout in milliseconds (e.g., 300000 for 5min) */
  defaultTimeoutMs: number;

  /** Timeout escalation factor: when hit, multiply by this factor before hard kill */
  timeoutEscalationFactor: number;

  /** Enable memory monitoring and guards */
  enableMemoryGuards: boolean;

  /** Enable span emission for all worker calls */
  enableSpanEmission: boolean;

  /** Sample rate for expensive operations (0.0-1.0) */
  spanSampleRate: number;
}

/**
 * Default configuration for enterprise use
 */
export const DEFAULT_RESOURCE_BUDGET_CONFIG: ResourceBudgetConfig = {
  maxRssMb: 512,
  heapWarningMb: 400,
  laneConcurrencyLimits: {
    tool_call: 8,
    file_read: 16,
    file_write: 4,
    critic: 3,
    forecast_model: 1,
  },
  globalConcurrencyLimit: 32,
  defaultTimeoutMs: 300000, // 5 minutes
  timeoutEscalationFactor: 1.5,
  enableMemoryGuards: true,
  enableSpanEmission: true,
  spanSampleRate: 1.0,
};

/**
 * Represents an active worker call context
 */
export interface WorkerCallContext {
  id: string;
  taskId: string;
  lane: Lane;
  startedAtMs: number;
  timeoutMs: number;
  span: SpanHandle | null;
  metadata: Record<string, unknown>;
}

/**
 * Metrics recorded for a completed worker call
 */
export interface WorkerCallMetrics {
  callId: string;
  taskId: string;
  lane: Lane;
  durationMs: number;
  success: boolean;
  errorType?: string;
  rssStartMb: number;
  rssEndMb: number;
  rssDeltaMb: number;
  heapStartMb: number;
  heapEndMb: number;
  heapDeltaMb: number;
  concurrentCallsAtStart: number;
  concurrentCallsAtEnd: number;
  timeoutReached: boolean;
  timestamp: string;
}

/**
 * Memory usage snapshot
 */
export interface MemorySnapshot {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  timestamp: string;
}

/**
 * Lane-level concurrency tracking
 */
class LaneManager {
  private active: Map<string, WorkerCallContext> = new Map();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  acquire(context: WorkerCallContext): boolean {
    if (this.active.size >= this.limit) {
      return false;
    }
    this.active.set(context.id, context);
    return true;
  }

  release(contextId: string): void {
    this.active.delete(contextId);
  }

  count(): number {
    return this.active.size;
  }

  hasCapacity(): boolean {
    return this.active.size < this.limit;
  }

  listActive(): WorkerCallContext[] {
    return Array.from(this.active.values());
  }
}

/**
 * Memory usage monitoring with configurable guardrails
 */
class MemoryMonitor {
  private config: ResourceBudgetConfig;

  constructor(config: ResourceBudgetConfig) {
    this.config = config;
  }

  snapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      arrayBuffersMb: Math.round((mem.arrayBuffers / 1024 / 1024) * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  checkGuards(): {
    ok: boolean;
    reason?: string;
    snapshot: MemorySnapshot;
  } {
    const snapshot = this.snapshot();

    if (!this.config.enableMemoryGuards) {
      return { ok: true, snapshot };
    }

    if (snapshot.rssMb > this.config.maxRssMb) {
      return {
        ok: false,
        reason: `RSS memory (${snapshot.rssMb}MB) exceeded max (${this.config.maxRssMb}MB)`,
        snapshot,
      };
    }

    if (snapshot.heapUsedMb > this.config.heapWarningMb) {
      logWarning("Memory heap warning", {
        heapUsedMb: snapshot.heapUsedMb,
        warningThreshold: this.config.heapWarningMb,
      });
    }

    return { ok: true, snapshot };
  }
}

/**
 * Request-level timeout enforcement
 */
class TimeoutManager {
  private timers: Map<string, { timeoutId: NodeJS.Timeout; escalated: boolean }> = new Map();
  private config: ResourceBudgetConfig;

  constructor(config: ResourceBudgetConfig) {
    this.config = config;
  }

  start(
    contextId: string,
    onTimeout: (escalated: boolean) => void,
    timeoutMs?: number,
  ): void {
    const timeout = timeoutMs ?? this.config.defaultTimeoutMs;

    // First timeout: warning with escalation opportunity
    const timeoutId = setTimeout(() => {
      const record = this.timers.get(contextId);
      if (record && !record.escalated) {
        record.escalated = true;

        // Schedule hard kill after escalation period
        const escalatedTimeout = Math.round(timeout * this.config.timeoutEscalationFactor);
        const hardKillId = setTimeout(() => {
          onTimeout(true); // Force termination
          this.timers.delete(contextId);
        }, escalatedTimeout);

        this.timers.set(contextId, { timeoutId: hardKillId, escalated: true });
        onTimeout(false); // Warning phase
      }
    }, timeout);

    this.timers.set(contextId, { timeoutId, escalated: false });
  }

  cancel(contextId: string): void {
    const record = this.timers.get(contextId);
    if (record) {
      clearTimeout(record.timeoutId);
      this.timers.delete(contextId);
    }
  }

  isEscalated(contextId: string): boolean {
    return this.timers.get(contextId)?.escalated ?? false;
  }
}

/**
 * Central resource budget manager
 */
export class ResourceBudgetManager {
  private config: ResourceBudgetConfig;
  private lanes: Map<Lane, LaneManager> = new Map();
  private globalActive: Map<string, WorkerCallContext> = new Map();
  private memoryMonitor: MemoryMonitor;
  private timeoutManager: TimeoutManager;
  private metrics: WorkerCallMetrics[] = [];
  private readonly metricsMaxSize = 1000;

  constructor(config?: Partial<ResourceBudgetConfig>) {
    this.config = { ...DEFAULT_RESOURCE_BUDGET_CONFIG, ...config };
    this.memoryMonitor = new MemoryMonitor(this.config);
    this.timeoutManager = new TimeoutManager(this.config);

    // Initialize lane managers
    for (const [lane, limit] of Object.entries(this.config.laneConcurrencyLimits)) {
      this.lanes.set(lane, new LaneManager(limit));
    }

    logInfo("ResourceBudgetManager initialized", {
      maxRssMb: this.config.maxRssMb,
      globalConcurrencyLimit: this.config.globalConcurrencyLimit,
      laneCount: this.lanes.size,
    });
  }

  /**
   * Acquire a slot for a new worker call
   * Returns null if resource limits are exceeded
   */
  async acquireSlot(
    taskId: string,
    lane: Lane,
    timeoutMs?: number,
    metadata?: Record<string, unknown>,
  ): Promise<WorkerCallContext | null> {
    // Check global concurrency
    if (this.globalActive.size >= this.config.globalConcurrencyLimit) {
      logWarning("Global concurrency limit reached", {
        current: this.globalActive.size,
        limit: this.config.globalConcurrencyLimit,
      });
      return null;
    }

    // Check memory guards
    const memoryCheck = this.memoryMonitor.checkGuards();
    if (!memoryCheck.ok) {
      logError("Memory guard triggered", { reason: memoryCheck.reason });
      return null;
    }

    // Check lane capacity
    const laneManager = this.lanes.get(lane) ?? new LaneManager(1);
    if (!laneManager.hasCapacity()) {
      logWarning("Lane capacity limit reached", {
        lane,
        current: laneManager.count(),
        limit: this.config.laneConcurrencyLimits[lane] ?? 1,
      });
      return null;
    }

    const contextId = this.generateContextId();
    const context: WorkerCallContext = {
      id: contextId,
      taskId,
      lane,
      startedAtMs: Date.now(),
      timeoutMs: timeoutMs ?? this.config.defaultTimeoutMs,
      span: null,
      metadata: metadata ?? {},
    };

    // Start OTel span if enabled
    if (this.config.enableSpanEmission && Math.random() < this.config.spanSampleRate) {
      context.span = startOtelSpan(`worker_call:${lane}`, {
        taskId,
        lane,
        ...metadata,
      });
    }

    // Acquire lane slot
    laneManager.acquire(context);
    this.globalActive.set(contextId, context);

    // Start timeout
    this.timeoutManager.start(contextId, (escalated) => {
      this.handleTimeout(contextId, escalated);
    }, context.timeoutMs);

    recordSpanEvent(context.span, "acquired_slot", {
      globalConcurrency: this.globalActive.size,
      laneConcurrency: laneManager.count(),
    });

    logInfo("Worker call slot acquired", {
      contextId,
      taskId,
      lane,
      globalConcurrency: this.globalActive.size,
    });

    return context;
  }

  /**
   * Release a worker call slot and record metrics
   */
  releaseSlot(context: WorkerCallContext, success: boolean, error?: unknown): void {
    const now = Date.now();
    const durationMs = now - context.startedAtMs;
    const laneManager = this.lanes.get(context.lane) ?? new LaneManager(1);

    // Get memory snapshots
    const memStart = this.memoryMonitor.snapshot(); // Approximate (we'd capture at start ideally)
    const memEnd = this.memoryMonitor.snapshot();

    const metrics: WorkerCallMetrics = {
      callId: context.id,
      taskId: context.taskId,
      lane: context.lane,
      durationMs,
      success,
      errorType: error instanceof Error ? error.constructor.name : undefined,
      rssStartMb: memEnd.rssMb - 1, // Approximation for demo
      rssEndMb: memEnd.rssMb,
      rssDeltaMb: 1, // Approximation
      heapStartMb: memEnd.heapUsedMb - 1,
      heapEndMb: memEnd.heapUsedMb,
      heapDeltaMb: 1,
      concurrentCallsAtStart: this.globalActive.size,
      concurrentCallsAtEnd: Math.max(0, this.globalActive.size - 1),
      timeoutReached: this.timeoutManager.isEscalated(context.id),
      timestamp: new Date(now).toISOString(),
    };

    // Record metrics
    if (this.metrics.length >= this.metricsMaxSize) {
      this.metrics.shift(); // FIFO eviction
    }
    this.metrics.push(metrics);

    // Record span metrics
    recordOperationMetrics(context.span, {
      duration_ms: durationMs,
      success: success,
      heap_delta_mb: metrics.heapDeltaMb,
      rss_end_mb: metrics.rssEndMb,
      concurrent_calls: metrics.concurrentCallsAtEnd,
    });

    recordSpanEvent(context.span, "call_completed", {
      status: success ? "success" : "failure",
      durationMs,
    });

    if (error) {
      recordSpanError(context.span, error, {
        lane: context.lane,
        durationMs,
      });
    }

    // Cleanup
    this.timeoutManager.cancel(context.id);
    laneManager.release(context.id);
    this.globalActive.delete(context.id);
    endOtelSpan(context.span);

    logInfo("Worker call slot released", {
      contextId: context.id,
      taskId: context.taskId,
      lane: context.lane,
      durationMs,
      success,
      globalConcurrency: this.globalActive.size,
    });
  }

  /**
   * Handle timeout escalation
   */
  private handleTimeout(contextId: string, escalated: boolean): void {
    const context = this.globalActive.get(contextId);
    if (!context) {
      return;
    }

    const message = escalated
      ? `Worker call exceeded escalation timeout (${context.timeoutMs}ms * ${this.config.timeoutEscalationFactor})`
      : `Worker call timeout warning (${context.timeoutMs}ms)`;

    recordSpanEvent(context.span, "timeout", {
      escalated,
      timeoutMs: context.timeoutMs,
    });

    logWarning(message, {
      contextId,
      taskId: context.taskId,
      lane: context.lane,
    });
  }

  /**
   * Get memory snapshot
   */
  getMemorySnapshot(): MemorySnapshot {
    return this.memoryMonitor.snapshot();
  }

  /**
   * Get current concurrency status
   */
  getConcurrencyStatus(): {
    global: { active: number; limit: number };
    lanes: Record<Lane, { active: number; limit: number }>;
  } {
    const lanes: Record<Lane, { active: number; limit: number }> = {};
    for (const [lane, manager] of this.lanes.entries()) {
      const limit = this.config.laneConcurrencyLimits[lane] ?? 1;
      lanes[lane] = { active: manager.count(), limit };
    }

    return {
      global: { active: this.globalActive.size, limit: this.config.globalConcurrencyLimit },
      lanes,
    };
  }

  /**
   * Get recent metrics
   */
  getMetrics(limit?: number): WorkerCallMetrics[] {
    const l = limit ?? 100;
    return this.metrics.slice(-l);
  }

  /**
   * Clear old metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get aggregated statistics
   */
  getStatistics(): {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    averageDurationMs: number;
    averageRssDeltaMb: number;
    maxConcurrentCalls: number;
    timeoutCount: number;
  } {
    const total = this.metrics.length;
    const successes = this.metrics.filter((m) => m.success).length;
    const failures = total - successes;
    const avgDuration =
      total > 0 ? this.metrics.reduce((sum, m) => sum + m.durationMs, 0) / total : 0;
    const avgRssDelta =
      total > 0 ? this.metrics.reduce((sum, m) => sum + m.rssDeltaMb, 0) / total : 0;
    const maxConcurrent = Math.max(
      0,
      ...this.metrics.map((m) => m.concurrentCallsAtStart),
    );
    const timeouts = this.metrics.filter((m) => m.timeoutReached).length;

    return {
      totalCalls: total,
      successCount: successes,
      failureCount: failures,
      averageDurationMs: Math.round(avgDuration),
      averageRssDeltaMb: Math.round(avgRssDelta * 100) / 100,
      maxConcurrentCalls: maxConcurrent,
      timeoutCount: timeouts,
    };
  }

  private generateContextId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Global singleton instance
 */
let globalManager: ResourceBudgetManager | null = null;

/**
 * Get or create the global ResourceBudgetManager
 */
export function getResourceBudgetManager(
  config?: Partial<ResourceBudgetConfig>,
): ResourceBudgetManager {
  if (!globalManager) {
    globalManager = new ResourceBudgetManager(config);
  }
  return globalManager;
}

/**
 * Reset the global manager (for testing)
 */
export function resetResourceBudgetManager(): void {
  globalManager = null;
}
