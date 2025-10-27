import type { PriorityQueueStore } from "../state/priority_queue_store.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import type { HeavyTaskQueueItem, TaskPriority } from "../utils/types.js";

/**
 * Priority Queue Dispatcher
 *
 * Routes tasks to appropriate priority lane based on execution context:
 * - URGENT: Interactive user requests, real-time API calls (blocking)
 * - NORMAL: Regular background operations, most ML/analytics work
 * - BACKGROUND: Batch operations, data exports, non-blocking work
 *
 * Guarantees:
 * 1. Interactive tasks always get priority (urgent lane has highest semaphore)
 * 2. Respects per-lane concurrency limits
 * 3. Enforces worker concurrency caps (blue/green guardrail)
 */
export class PriorityQueueDispatcher {
  constructor(
    private readonly queue: PriorityQueueStore,
    private readonly maxWorkers: number = 10
  ) {}

  /**
   * Classify a task's priority based on execution context
   */
  classifyPriority(context: {
    isInteractive: boolean;
    isCritical: boolean;
    estimatedDurationMs?: number;
  }): TaskPriority {
    // Interactive tasks always go to urgent lane
    if (context.isInteractive) {
      return "urgent";
    }

    // Critical operations (infrastructure, security) use normal lane
    if (context.isCritical) {
      return "normal";
    }

    // Long-running batch operations use background lane
    if (context.estimatedDurationMs && context.estimatedDurationMs > 60000) {
      return "background";
    }

    // Default to normal for regular work
    return "normal";
  }

  /**
   * Dispatch a task to the queue with automatic priority classification
   */
  async dispatchTask(input: {
    summary: string;
    command?: string;
    notes?: string;
    id?: string;
    priority?: TaskPriority;
    isInteractive?: boolean;
    isCritical?: boolean;
    estimatedDurationMs?: number;
  }): Promise<HeavyTaskQueueItem> {
    const isInteractive = input.isInteractive ?? false;
    const priority = this.resolvePriority({
      explicitPriority: input.priority,
      isInteractive,
      isCritical: input.isCritical ?? false,
      estimatedDurationMs: input.estimatedDurationMs,
    });

    logInfo(
      `Dispatching task to ${priority} lane: ${input.summary}`,
      {
        priority,
        isInteractive,
        priority_source: input.priority ? "explicit" : "classifier",
      }
    );

    return this.queue.enqueue({
      summary: input.summary,
      command: input.command,
      notes: input.notes,
      id: input.id,
      priority,
    });
  }

  /**
   * Get next batch of tasks to execute
   * Returns tasks sorted by priority, respecting concurrency limits
   */
  async getNextBatch(maxTasks: number = 10): Promise<HeavyTaskQueueItem[]> {
    // Enforce worker concurrency cap first
    const { enforced, released } = await this.queue.enforceWorkerCap(this.maxWorkers);

    if (released > 0) {
      logWarning(
        `Worker capacity exceeded: released ${released} tasks`,
        { maxWorkers: this.maxWorkers }
      );
    }

    // Get next batch respecting priority and semaphore limits
    return this.queue.getNextBatch(maxTasks);
  }

  /**
   * Start executing a task
   * Called when task transitions from queued to running
   */
  async startTask(taskId: string): Promise<HeavyTaskQueueItem | null> {
    const task = await this.queue.startTask(taskId);
    if (task) {
      logInfo(`Task started: ${task.summary}`, { taskId, priority: task.priority });
    }
    return task;
  }

  /**
   * Complete a task and record execution metrics
   */
  async completeTask(
    taskId: string,
    durationMs: number,
    notes?: string
  ): Promise<HeavyTaskQueueItem | null> {
    const task = await this.queue.completeTask(taskId, durationMs, notes);
    if (task) {
      logInfo(`Task completed: ${task.summary}`, {
        taskId,
        priority: task.priority,
        durationMs,
      });
    }
    return task;
  }

  /**
   * Cancel a task with reason
   */
  async cancelTask(taskId: string, reason?: string): Promise<HeavyTaskQueueItem | null> {
    const task = await this.queue.cancelTask(taskId, reason);
    if (task) {
      logWarning(`Task cancelled: ${task.summary}`, {
        taskId,
        priority: task.priority,
        reason,
      });
    }
    return task;
  }

  /**
   * Get queue status and metrics
   */
  async getStatus() {
    const metrics = await this.queue.getMetrics();
    const nextBatch = await this.getNextBatch(5);

    return {
      queue_metrics: metrics,
      next_batch: nextBatch.map((t) => ({
        id: t.id,
        summary: t.summary,
        priority: t.priority,
        status: t.status,
      })),
      max_workers: this.maxWorkers,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify interactive task priority guarantee
   * Used by critic tests to ensure correctness
   */
  async verifyInteractivePriority(): Promise<{ valid: boolean; violations: string[] }> {
    const metrics = await this.queue.getMetrics();
    const violations: string[] = [];

    // Check that urgent lane has capacity for interactive tasks
    if (metrics.concurrency_usage.urgent.current >= metrics.concurrency_usage.urgent.limit) {
      violations.push("Urgent lane is at capacity - may block interactive tasks");
    }

    // Check that no urgent tasks are stuck in queued state for too long
    const queue = await this.queue.list();
    const urgentQueued = queue.filter((t) => t.priority === "urgent" && t.status === "queued");

    for (const task of urgentQueued) {
      const queuedMs = new Date().getTime() - new Date(task.created_at).getTime();
      if (queuedMs > 5000) {
        // > 5 seconds
        violations.push(
          `Urgent task queued for ${queuedMs}ms (id: ${task.id}): ${task.summary}`
        );
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  private resolvePriority(input: {
    explicitPriority?: TaskPriority;
    isInteractive: boolean;
    isCritical: boolean;
    estimatedDurationMs?: number;
  }): TaskPriority {
    if (input.isInteractive) {
      if (input.explicitPriority && input.explicitPriority !== "urgent") {
        logWarning("Interactive task requested non-urgent priority. Overriding to urgent.", {
          requested_priority: input.explicitPriority,
        });
      }
      return "urgent";
    }

    if (input.explicitPriority) {
      return input.explicitPriority;
    }

    return this.classifyPriority({
      isInteractive: input.isInteractive,
      isCritical: input.isCritical,
      estimatedDurationMs: input.estimatedDurationMs,
    });
  }
}
