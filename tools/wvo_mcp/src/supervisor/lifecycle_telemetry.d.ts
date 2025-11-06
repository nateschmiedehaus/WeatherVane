/**
 * LifecycleTelemetry - Strategic Task Lifecycle Events
 *
 * Emits lifecycle events for supervisor decisions to JSONL log.
 * Enables observability at the strategic level (what task was selected, why).
 */
import type { LifecycleEventPayload, LifecycleEventType } from './types.js';
export declare class LifecycleTelemetry {
    private readonly logPath;
    constructor(workspaceRoot: string, relativePath?: string);
    /**
     * Emit lifecycle event (append to JSONL log).
     *
     * @param eventType - Type of lifecycle event
     * @param payload - Event payload (taskId, reason, metadata)
     */
    emit(eventType: LifecycleEventType, payload: LifecycleEventPayload): Promise<void>;
}
