/**
 * LifecycleTelemetry - Strategic Task Lifecycle Events
 *
 * Emits lifecycle events for supervisor decisions to JSONL log.
 * Enables observability at the strategic level (what task was selected, why).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logError } from '../../tools/wvo_mcp/src/telemetry/logger.js';
export class LifecycleTelemetry {
    constructor(workspaceRoot, relativePath = 'state/analytics/supervisor_lifecycle.jsonl') {
        this.logPath = path.join(workspaceRoot, relativePath);
    }
    /**
     * Emit lifecycle event (append to JSONL log).
     *
     * @param eventType - Type of lifecycle event
     * @param payload - Event payload (taskId, reason, metadata)
     */
    async emit(eventType, payload) {
        const event = {
            timestamp: new Date().toISOString(),
            type: eventType,
            taskId: payload.taskId,
            reason: payload.reason,
            priority: payload.priority,
            metadata: payload.metadata,
        };
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(this.logPath), { recursive: true });
            // Append event to JSONL (newline-delimited JSON)
            await fs.appendFile(this.logPath, JSON.stringify(event) + '\n', 'utf-8');
        }
        catch (error) {
            // Log error but don't crash supervisor (telemetry is non-critical)
            logError('Failed to emit lifecycle event', {
                error: error instanceof Error ? error.message : String(error),
                eventType,
                taskId: payload.taskId,
            });
        }
    }
}
