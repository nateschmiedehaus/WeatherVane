import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  HeavyTaskQueueItem,
  HeavyTaskStatus,
  HeavyTaskUpdateInput,
  TaskPriority,
  PriorityQueueMetrics,
  PriorityLaneStats,
} from "../utils/types.js";

/**
 * Semaphore-based concurrency limiter for priority lanes
 */
class LaneSemaphore {
  private running: number = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly laneName: TaskPriority
  ) {}

  async acquire(): Promise<void> {
    if (this.running >= this.maxConcurrent) {
      // In a production system, this would use async waiting
      // For now, we just return immediately and let the dispatcher handle backpressure
      return;
    }
    this.running++;
  }

  release(): void {
    this.running = Math.max(0, this.running - 1);
  }

  getCurrentLoad(): number {
    return this.running;
  }

  getMaxCapacity(): number {
    return this.maxConcurrent;
  }

  isAtCapacity(): boolean {
    return this.running >= this.maxConcurrent;
  }
}

/**
 * Priority Queue Store with 3 lanes: urgent, normal, background
 * Implements semaphore-based concurrency limits per lane
 * Interactive tasks (urgent) always get priority
 */
export class PriorityQueueStore {
  private readonly filePath: string;
  private readonly semaphores: Record<TaskPriority, LaneSemaphore>;

  // Default concurrency limits per lane
  // Urgent: 5 (interactive tasks, critical work)
  // Normal: 3 (regular background work)
  // Background: 1 (batch operations, lowest priority)
  private readonly defaultLimits: Record<TaskPriority, number> = {
    urgent: 5,
    normal: 3,
    background: 1,
  };

  constructor(
    private readonly stateRoot: string,
    customLimits?: Partial<Record<TaskPriority, number>>
  ) {
    this.filePath = path.join(this.stateRoot, "priority_queue.json");

    const limits = { ...this.defaultLimits, ...customLimits };
    this.semaphores = {
      urgent: new LaneSemaphore(limits.urgent, "urgent"),
      normal: new LaneSemaphore(limits.normal, "normal"),
      background: new LaneSemaphore(limits.background, "background"),
    };
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  private async readRaw(): Promise<HeavyTaskQueueItem[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as HeavyTaskQueueItem[] | null;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch {
      return [];
    }
  }

  private async write(queue: HeavyTaskQueueItem[]): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, JSON.stringify(queue, null, 2), "utf-8");
  }

  /**
   * Get all queued tasks sorted by priority (urgent first, then normal, then background)
   * and by creation time within each priority
   */
  async list(): Promise<HeavyTaskQueueItem[]> {
    const queue = await this.readRaw();
    return this.sortByPriority(queue);
  }

  /**
   * Get next available tasks respecting priority and concurrency limits
   * Returns tasks ready to execute, ordered by priority
   */
  async getNextBatch(maxTasks: number = 10): Promise<HeavyTaskQueueItem[]> {
    const queue = await this.readRaw();
    const queuedTasks = queue.filter((t) => t.status === "queued");
    const sorted = this.sortByPriority(queuedTasks);

    const batch: HeavyTaskQueueItem[] = [];

    // Try to fill batch respecting priority and semaphore limits
    for (const task of sorted) {
      if (batch.length >= maxTasks) break;

      const semaphore = this.semaphores[task.priority];
      if (!semaphore.isAtCapacity()) {
        batch.push(task);
      }
    }

    return batch;
  }

  /**
   * Enqueue a new task with optional priority hint
   * If no priority specified, defaults to "normal"
   * Interactive tasks should use "urgent" priority
   */
  async enqueue(input: {
    summary: string;
    command?: string;
    notes?: string;
    id?: string;
    status?: HeavyTaskStatus;
    priority?: TaskPriority;
  }): Promise<HeavyTaskQueueItem> {
    const queue = await this.readRaw();
    const now = new Date().toISOString();
    const priority = input.priority ?? "normal";

    const item: HeavyTaskQueueItem = {
      id: input.id ?? randomUUID(),
      summary: input.summary,
      command: input.command,
      notes: input.notes,
      status: input.status ?? "queued",
      priority,
      created_at: now,
      updated_at: now,
    };

    queue.push(item);
    await this.write(queue);
    return item;
  }

  /**
   * Update task status and track execution metrics
   */
  async updateStatus(update: HeavyTaskUpdateInput): Promise<HeavyTaskQueueItem | null> {
    const queue = await this.readRaw();
    const index = queue.findIndex((item) => item.id === update.id);
    if (index === -1) {
      return null;
    }

    const current = queue[index];

    // Release semaphore if task is transitioning away from "running"
    if (current.status === "running" && update.status && update.status !== "running") {
      this.semaphores[current.priority].release();
    }

    const next: HeavyTaskQueueItem = {
      ...current,
      status: update.status ?? current.status,
      notes: update.notes ?? current.notes,
      command: update.command ?? current.command,
      execution_start_time: update.execution_start_time ?? current.execution_start_time,
      execution_duration_ms: update.execution_duration_ms ?? current.execution_duration_ms,
      updated_at: new Date().toISOString(),
    };

    queue[index] = next;
    await this.write(queue);
    return next;
  }

  /**
   * Mark a task as running and acquire semaphore
   */
  async startTask(taskId: string): Promise<HeavyTaskQueueItem | null> {
    const queue = await this.readRaw();
    const index = queue.findIndex((item) => item.id === taskId);
    if (index === -1) {
      return null;
    }

    const task = queue[index];
    const semaphore = this.semaphores[task.priority];

    // Acquire semaphore for this lane
    await semaphore.acquire();

    const now = new Date().toISOString();
    const updated: HeavyTaskQueueItem = {
      ...task,
      status: "running",
      execution_start_time: now,
      updated_at: now,
    };

    queue[index] = updated;
    await this.write(queue);
    return updated;
  }

  /**
   * Complete a task and release semaphore
   */
  async completeTask(
    taskId: string,
    durationMs: number,
    notes?: string
  ): Promise<HeavyTaskQueueItem | null> {
    const queue = await this.readRaw();
    const index = queue.findIndex((item) => item.id === taskId);
    if (index === -1) {
      return null;
    }

    const task = queue[index];
    this.semaphores[task.priority].release();

    const updated: HeavyTaskQueueItem = {
      ...task,
      status: "completed",
      execution_duration_ms: durationMs,
      notes: notes ?? task.notes,
      updated_at: new Date().toISOString(),
    };

    queue[index] = updated;
    await this.write(queue);
    return updated;
  }

  /**
   * Cancel a task and release semaphore if running
   */
  async cancelTask(taskId: string, reason?: string): Promise<HeavyTaskQueueItem | null> {
    const queue = await this.readRaw();
    const index = queue.findIndex((item) => item.id === taskId);
    if (index === -1) {
      return null;
    }

    const task = queue[index];

    // Release semaphore if task was running
    if (task.status === "running") {
      this.semaphores[task.priority].release();
    }

    const updated: HeavyTaskQueueItem = {
      ...task,
      status: "cancelled",
      notes: reason ? `${task.notes ?? ""}${task.notes ? "\n" : ""}Cancelled: ${reason}` : task.notes,
      updated_at: new Date().toISOString(),
    };

    queue[index] = updated;
    await this.write(queue);
    return updated;
  }

  /**
   * Get metrics for queue status and lane utilization
   */
  async getMetrics(): Promise<PriorityQueueMetrics> {
    const queue = await this.readRaw();

    const byPriority: Record<TaskPriority, PriorityLaneStats> = {
      urgent: this.getStatsForLane(queue, "urgent"),
      normal: this.getStatsForLane(queue, "normal"),
      background: this.getStatsForLane(queue, "background"),
    };

    const concurrencyUsage: Record<TaskPriority, { current: number; limit: number }> = {
      urgent: {
        current: this.semaphores.urgent.getCurrentLoad(),
        limit: this.semaphores.urgent.getMaxCapacity(),
      },
      normal: {
        current: this.semaphores.normal.getCurrentLoad(),
        limit: this.semaphores.normal.getMaxCapacity(),
      },
      background: {
        current: this.semaphores.background.getCurrentLoad(),
        limit: this.semaphores.background.getMaxCapacity(),
      },
    };

    return {
      total_tasks: queue.length,
      by_priority: byPriority,
      concurrency_usage: concurrencyUsage,
    };
  }

  /**
   * Enforce worker concurrency cap (blue/green guardrail)
   * Prevents exceeding maximum concurrent tasks across all lanes
   */
  async enforceWorkerCap(maxWorkers: number): Promise<{ enforced: boolean; released: number }> {
    const running = (await this.list()).filter((t) => t.status === "running");

    if (running.length <= maxWorkers) {
      return { enforced: true, released: 0 };
    }

    // If over capacity, cancel background tasks first, then normal, then urgent (least preferable)
    const toCancel = running.sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        background: 0,
        normal: 1,
        urgent: 2,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const excess = toCancel.length - maxWorkers;
    for (let i = 0; i < excess; i++) {
      await this.cancelTask(
        toCancel[i].id,
        `Worker capacity exceeded (${running.length} > ${maxWorkers})`
      );
    }

    return { enforced: true, released: excess };
  }

  /**
   * Private helper: sort tasks by priority (urgent > normal > background) and creation time
   */
  private sortByPriority(tasks: HeavyTaskQueueItem[]): HeavyTaskQueueItem[] {
    const priorityOrder: Record<TaskPriority, number> = {
      urgent: 0,
      normal: 1,
      background: 2,
    };

    return tasks.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Within same priority, sort by creation time (oldest first)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  /**
   * Private helper: get stats for a specific lane
   */
  private getStatsForLane(queue: HeavyTaskQueueItem[], lane: TaskPriority): PriorityLaneStats {
    const laneItems = queue.filter((t) => t.priority === lane);

    const completed = laneItems.filter((t) => t.status === "completed");
    const avgWaitTime =
      completed.length > 0
        ? completed.reduce((sum, t) => {
            const start = new Date(t.created_at).getTime();
            const end = new Date(t.updated_at).getTime();
            return sum + (end - start);
          }, 0) / completed.length
        : 0;

    return {
      lane,
      queued_count: laneItems.filter((t) => t.status === "queued").length,
      running_count: laneItems.filter((t) => t.status === "running").length,
      completed_count: laneItems.filter((t) => t.status === "completed").length,
      cancelled_count: laneItems.filter((t) => t.status === "cancelled").length,
      avg_wait_time_ms: avgWaitTime,
      total_processed: laneItems.filter((t) => t.status === "completed").length,
    };
  }
}
