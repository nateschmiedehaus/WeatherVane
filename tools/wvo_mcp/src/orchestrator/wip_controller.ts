/**
 * WIP Controller - Slot-Based Work-In-Progress Management
 *
 * Simplified WIP enforcement for Phase 4 using slot reservation pattern.
 * Based on existing WIPLimitEnforcer but streamlined for StateGraph needs.
 *
 * Limits:
 * - Per-worker: Max 2 tasks per worker (configurable)
 * - Global: Max 12 tasks system-wide for 6 workers (configurable)
 *
 * Philosophy:
 * - Start fewer tasks, finish more tasks
 * - Lower WIP = faster cycle time via Little's Law
 * - Explicit slot reservation prevents race conditions
 *
 * Inspired by: src/orchestrator/wip_limits.ts (WIPLimitEnforcer)
 */

import { logInfo, logWarning, logDebug } from '../telemetry/logger.js';

export interface WIPConfig {
  perWorkerLimit: number; // Max tasks per worker (default: 2)
  globalLimit: number; // Max tasks system-wide (default: 12)
  queueLimit: number; // Max queued tasks (default: 50)
}

export interface WIPStatus {
  current: number; // Tasks in progress
  limit: number; // Global limit
  available: number; // Slots available
  queued: number; // Tasks waiting
  perWorker: Record<string, number>; // Worker ID → task count
  atLimit: boolean; // True if at global limit
}

const DEFAULT_CONFIG: WIPConfig = {
  perWorkerLimit: 2,
  globalLimit: 12,
  queueLimit: 50,
};

export class WIPController {
  private readonly config: WIPConfig;
  private readonly slots: Map<string, string>; // taskId → workerId
  private readonly queue: string[]; // Queued task IDs

  constructor(config: Partial<WIPConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.slots = new Map();
    this.queue = [];

    logInfo('WIPController initialized', {
      perWorkerLimit: this.config.perWorkerLimit,
      globalLimit: this.config.globalLimit,
      queueLimit: this.config.queueLimit,
    });
  }

  /**
   * Check if system can accept a new task
   */
  canAcceptTask(): boolean {
    const current = this.slots.size;
    const canAccept = current < this.config.globalLimit;

    logDebug('WIP capacity check', {
      current,
      limit: this.config.globalLimit,
      available: this.config.globalLimit - current,
      canAccept,
    });

    return canAccept;
  }

  /**
   * Reserve a WIP slot for a task
   * Returns true if reserved, false if limits would be violated
   */
  reserveSlot(taskId: string, workerId: string): boolean {
    // Check if already reserved
    if (this.slots.has(taskId)) {
      logWarning('Task already has reserved slot', { taskId, workerId });
      return false;
    }

    // Check global limit
    if (this.slots.size >= this.config.globalLimit) {
      logDebug('Global WIP limit reached, cannot reserve', {
        taskId,
        current: this.slots.size,
        limit: this.config.globalLimit,
      });
      return false;
    }

    // Check per-worker limit
    const workerTaskCount = this.getWorkerTaskCount(workerId);
    if (workerTaskCount >= this.config.perWorkerLimit) {
      logDebug('Worker at WIP limit, cannot reserve', {
        workerId,
        current: workerTaskCount,
        limit: this.config.perWorkerLimit,
      });
      return false;
    }

    // Reserve the slot
    this.slots.set(taskId, workerId);

    logInfo('WIP slot reserved', {
      taskId,
      workerId,
      current: this.slots.size,
      limit: this.config.globalLimit,
      workerTasks: workerTaskCount + 1,
      workerLimit: this.config.perWorkerLimit,
    });

    return true;
  }

  /**
   * Release a WIP slot when task completes
   */
  releaseSlot(taskId: string): void {
    const workerId = this.slots.get(taskId);

    if (!workerId) {
      logWarning('Attempted to release non-existent slot', { taskId });
      return;
    }

    this.slots.delete(taskId);

    logInfo('WIP slot released', {
      taskId,
      workerId,
      current: this.slots.size,
      limit: this.config.globalLimit,
      available: this.config.globalLimit - this.slots.size,
    });
  }

  /**
   * Add task to queue when WIP limit reached
   */
  enqueueTask(taskId: string): boolean {
    if (this.queue.length >= this.config.queueLimit) {
      logWarning('Queue limit reached, cannot enqueue', {
        taskId,
        queueLength: this.queue.length,
        queueLimit: this.config.queueLimit,
      });
      return false;
    }

    this.queue.push(taskId);

    logDebug('Task enqueued', {
      taskId,
      queueLength: this.queue.length,
      queueLimit: this.config.queueLimit,
    });

    return true;
  }

  /**
   * Dequeue next task when slot becomes available
   */
  dequeueTask(): string | undefined {
    const taskId = this.queue.shift();

    if (taskId) {
      logDebug('Task dequeued', {
        taskId,
        remainingInQueue: this.queue.length,
      });
    }

    return taskId;
  }

  /**
   * Get current WIP status
   */
  getStatus(): WIPStatus {
    const current = this.slots.size;
    const available = Math.max(0, this.config.globalLimit - current);

    // Count tasks per worker
    const perWorker: Record<string, number> = {};
    for (const workerId of this.slots.values()) {
      perWorker[workerId] = (perWorker[workerId] || 0) + 1;
    }

    return {
      current,
      limit: this.config.globalLimit,
      available,
      queued: this.queue.length,
      perWorker,
      atLimit: current >= this.config.globalLimit,
    };
  }

  /**
   * Get queued task IDs
   */
  getQueuedTasks(): string[] {
    return [...this.queue];
  }

  /**
   * Get number of tasks for a specific worker
   */
  getWorkerTaskCount(workerId: string): number {
    let count = 0;
    for (const wId of this.slots.values()) {
      if (wId === workerId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if a worker can accept more tasks
   */
  canWorkerAcceptTask(workerId: string): boolean {
    const count = this.getWorkerTaskCount(workerId);
    return count < this.config.perWorkerLimit;
  }

  /**
   * Clear all slots (for testing/reset)
   */
  reset(): void {
    this.slots.clear();
    this.queue.length = 0;
    logInfo('WIP controller reset', {
      slots: 0,
      queue: 0,
    });
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WIPConfig>): void {
    const oldConfig = { ...this.config };
    Object.assign(this.config, newConfig);

    logInfo('WIP configuration updated', {
      old: oldConfig,
      new: this.config,
    });
  }
}
