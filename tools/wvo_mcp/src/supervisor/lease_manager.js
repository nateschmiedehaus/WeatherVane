/**
 * LeaseManager - MVP In-Memory Implementation
 *
 * Prevents duplicate task execution by managing task leases.
 * MVP uses in-memory Map (single-process only).
 * Future: Replace with distributed lock (Redis SET NX, etcd).
 */
import { logInfo, logWarning } from '../../tools/wvo_mcp/src/telemetry/logger.js';
export class LeaseManager {
    constructor(defaultTtlMs = 30 * 60 * 1000) {
        this.leases = new Map();
        this.defaultTtlMs = defaultTtlMs;
    }
    /**
     * Acquire lease for a task (prevents duplicate execution).
     *
     * @param taskId - Task identifier
     * @param ttlMs - Lease time-to-live (defaults to 30 minutes)
     * @returns true if lease acquired, false if already leased
     */
    async acquireLease(taskId, ttlMs) {
        const existingLease = this.leases.get(taskId);
        // Check if lease expired (allow reacquisition)
        if (existingLease) {
            const elapsed = Date.now() - existingLease.acquiredAt;
            if (elapsed < existingLease.ttlMs) {
                logWarning('Lease acquisition failed: already leased', { taskId, elapsed, ttl: existingLease.ttlMs });
                return false; // Still valid
            }
            // Expired, can acquire
            logInfo('Expired lease detected, removing', { taskId, elapsed, ttl: existingLease.ttlMs });
            this.leases.delete(taskId);
        }
        // Acquire new lease
        const lease = {
            taskId,
            acquiredAt: Date.now(),
            ttlMs: ttlMs ?? this.defaultTtlMs,
        };
        this.leases.set(taskId, lease);
        logInfo('Lease acquired', { taskId, ttlMs: lease.ttlMs });
        return true;
    }
    /**
     * Release lease for a task (allow other supervisors to acquire).
     *
     * @param taskId - Task identifier
     */
    async releaseLease(taskId) {
        if (this.leases.has(taskId)) {
            this.leases.delete(taskId);
            logInfo('Lease released', { taskId });
        }
    }
    /**
     * Renew lease for a task (extend TTL).
     *
     * @param taskId - Task identifier
     * @returns true if renewed, false if lease doesn't exist
     */
    async renewLease(taskId) {
        const lease = this.leases.get(taskId);
        if (!lease) {
            logWarning('Lease renewal failed: not found', { taskId });
            return false;
        }
        lease.acquiredAt = Date.now(); // Reset timer
        logInfo('Lease renewed', { taskId, ttlMs: lease.ttlMs });
        return true;
    }
    /**
     * Release all leases (for graceful shutdown).
     */
    async releaseAll() {
        const count = this.leases.size;
        this.leases.clear();
        logInfo('All leases released', { count });
    }
    /**
     * Check if task has active lease (for testing/debugging).
     *
     * @param taskId - Task identifier
     * @returns true if lease exists and not expired
     */
    hasLease(taskId) {
        const lease = this.leases.get(taskId);
        if (!lease)
            return false;
        // Check if expired
        const elapsed = Date.now() - lease.acquiredAt;
        if (elapsed >= lease.ttlMs) {
            // Expired, remove
            this.leases.delete(taskId);
            return false;
        }
        return true;
    }
}
