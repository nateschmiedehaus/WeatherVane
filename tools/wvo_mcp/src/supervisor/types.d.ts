/**
 * Supervisor Types - MVP Scaffold
 *
 * Core type definitions for the supervisor layer that owns strategic task orchestration.
 * Separates strategic concerns (what to work on, why) from tactical concerns (how to execute).
 */
/**
 * Lifecycle event types emitted by the supervisor for observability.
 */
export type LifecycleEventType = 'task.selected' | 'task.assigned' | 'task.started' | 'task.completed' | 'task.failed' | 'task.blocked';
/**
 * Payload for lifecycle events (metadata about the event).
 */
export interface LifecycleEventPayload {
    taskId: string;
    reason?: string;
    priority?: number;
    metadata?: Record<string, unknown>;
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
    acquiredAt: number;
    ttlMs: number;
    ownerId?: string;
}
/**
 * Supervisor configuration.
 */
export interface SupervisorConfig {
    workspaceRoot: string;
    pollingIntervalMs: number;
    defaultLeaseTtlMs: number;
    telemetryPath?: string;
}
