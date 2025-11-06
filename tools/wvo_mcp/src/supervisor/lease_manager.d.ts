/**
 * LeaseManager - MVP In-Memory Implementation
 *
 * Prevents duplicate task execution by managing task leases.
 * MVP uses in-memory Map (single-process only).
 * Future: Replace with distributed lock (Redis SET NX, etcd).
 */
export declare class LeaseManager {
    private readonly leases;
    private readonly defaultTtlMs;
    constructor(defaultTtlMs?: number);
    /**
     * Acquire lease for a task (prevents duplicate execution).
     *
     * @param taskId - Task identifier
     * @param ttlMs - Lease time-to-live (defaults to 30 minutes)
     * @returns true if lease acquired, false if already leased
     */
    acquireLease(taskId: string, ttlMs?: number): Promise<boolean>;
    /**
     * Release lease for a task (allow other supervisors to acquire).
     *
     * @param taskId - Task identifier
     */
    releaseLease(taskId: string): Promise<void>;
    /**
     * Renew lease for a task (extend TTL).
     *
     * @param taskId - Task identifier
     * @returns true if renewed, false if lease doesn't exist
     */
    renewLease(taskId: string): Promise<boolean>;
    /**
     * Release all leases (for graceful shutdown).
     */
    releaseAll(): Promise<void>;
    /**
     * Check if task has active lease (for testing/debugging).
     *
     * @param taskId - Task identifier
     * @returns true if lease exists and not expired
     */
    hasLease(taskId: string): boolean;
}
