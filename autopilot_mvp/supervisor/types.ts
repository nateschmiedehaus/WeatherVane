/**
 * Supervisor Types - MVP Scaffold
 *
 * Core type definitions for the supervisor layer that owns strategic task orchestration.
 * Separates strategic concerns (what to work on, why) from tactical concerns (how to execute).
 */

/**
 * Lifecycle event types emitted by the supervisor for observability.
 */
export type LifecycleEventType =
  | 'task.selected'    // Supervisor decides to work on task
  | 'task.assigned'    // Supervisor assigns task to orchestrator
  | 'task.started'     // Orchestrator confirms execution started
  | 'task.completed'   // Task completed successfully
  | 'task.failed'      // Task execution failed
  | 'task.blocked';    // Task hit blocker

/**
 * Payload for lifecycle events (metadata about the event).
 */
export interface LifecycleEventPayload {
  taskId: string;
  reason?: string;                    // Why this task was selected
  priority?: number;                  // Task priority score (future enhancement)
  metadata?: Record<string, unknown>; // Additional context
}

/**
 * Complete lifecycle event structure (written to JSONL log).
 */
export interface LifecycleEvent {
  timestamp: string;
  type: LifecycleEventType;
  taskId: string;
  reason?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Lease record (prevents duplicate task execution).
 */
export interface Lease {
  taskId: string;
  acquiredAt: number;  // Unix timestamp (ms)
  ttlMs: number;       // Time-to-live (ms)
  ownerId?: string;    // Future: multi-supervisor support
}

/**
 * Supervisor configuration.
 */
export interface SupervisorConfig {
  workspaceRoot: string;
  pollingIntervalMs: number;
  defaultLeaseTtlMs: number;
  telemetryPath?: string;  // Override default lifecycle log path
}
