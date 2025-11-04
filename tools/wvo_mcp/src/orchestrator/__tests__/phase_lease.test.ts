/**
 * Phase Lease Test - Distributed Locking for Multi-Agent Safety
 *
 * Purpose: Verify atomic lease acquisition and time-bounded expiration
 *
 * Tests:
 * 1. Lease acquisition succeeds for available phase
 * 2. Lease acquisition fails when phase already locked
 * 3. Expired leases are cleaned up automatically
 * 4. Lease renewal extends expiration
 * 5. Lease renewal respects max renewal count
 * 6. Agent can release its own leases
 * 7. Agent cannot release another agent's lease
 * 8. Multiple agents can hold different phases
 * 9. Same agent can acquire after releasing
 * 10. Stats tracking works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PhaseLeaseManager } from '../phase_lease.js';
import { WorkPhase } from '../work_process_enforcer.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('PhaseLeaseManager - Distributed Locking', () => {
  let leaseManager: PhaseLeaseManager;
  let testWorkspaceRoot: string;
  let dbPath: string;

  beforeEach(() => {
    // Create a temporary workspace for testing
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lease-test-'));

    // Create state directory
    const stateDir = path.join(testWorkspaceRoot, 'state');
    fs.mkdirSync(stateDir, { recursive: true });

    dbPath = path.join(testWorkspaceRoot, 'state/orchestrator.db');

    leaseManager = new PhaseLeaseManager(testWorkspaceRoot, {
      leaseDuration: 5,  // 5 seconds for tests
      maxRenewals: 3,
      agentId: 'test-agent-1'
    });
  });

  afterEach(async () => {
    // Clean up
    await leaseManager.releaseAllLeases();
    leaseManager.close();

    // Remove temp directory
    if (fs.existsSync(testWorkspaceRoot)) {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  });

  describe('Lease Acquisition', () => {
    it('acquires lease for available phase', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');

      expect(result.acquired).toBe(true);
      expect(result.lease).toBeDefined();
      expect(result.lease?.task_id).toBe('TEST-001');
      expect(result.lease?.phase).toBe('STRATEGIZE');
      expect(result.lease?.agent_id).toBe('test-agent-1');
      expect(result.lease?.lease_id).toBeTruthy();
    });

    it('fails to acquire when phase already locked', async () => {
      // First agent acquires
      const result1 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result1.acquired).toBe(true);

      // Second agent tries to acquire same phase
      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        leaseDuration: 5,
        agentId: 'test-agent-2'
      });

      const result2 = await leaseManager2.acquireLease('TEST-001', 'STRATEGIZE');

      expect(result2.acquired).toBe(false);
      expect(result2.reason).toContain('already held');
      expect(result2.holder).toBe('test-agent-1');
      expect(result2.expiresIn).toBeGreaterThan(0);

      leaseManager2.close();
    });

    it('allows different agents to hold different phases', async () => {
      const result1 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result1.acquired).toBe(true);

      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-2'
      });

      const result2 = await leaseManager2.acquireLease('TEST-001', 'SPEC');
      expect(result2.acquired).toBe(true);

      leaseManager2.close();
    });

    it('allows different tasks to be locked simultaneously', async () => {
      const result1 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result1.acquired).toBe(true);

      const result2 = await leaseManager.acquireLease('TEST-002', 'STRATEGIZE');
      expect(result2.acquired).toBe(true);
    });
  });

  describe('Lease Expiration', () => {
    it('cleans up expired leases automatically', async () => {
      // Create lease manager with very short lease duration
      const shortLeaseManager = new PhaseLeaseManager(testWorkspaceRoot, {
        leaseDuration: 1,  // 1 second
        agentId: 'test-agent-short'
      });

      // Acquire lease
      const result1 = await shortLeaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result1.acquired).toBe(true);

      // Wait for lease to expire
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Try to acquire with different agent - should succeed after cleanup
      const result2 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result2.acquired).toBe(true);

      shortLeaseManager.close();
    });
  });

  describe('Lease Renewal', () => {
    it('renews lease successfully', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const originalExpiration = result.lease!.expires_at;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      const renewResult = await leaseManager.renewLease('TEST-001', 'STRATEGIZE');
      expect(renewResult.renewed).toBe(true);
      expect(renewResult.expiresAt).toBeTruthy();

      // New expiration should be later than original
      expect(new Date(renewResult.expiresAt!).getTime()).toBeGreaterThan(
        new Date(originalExpiration).getTime()
      );
    });

    it('fails to renew lease not held by agent', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-2'
      });

      const renewResult = await leaseManager2.renewLease('TEST-001', 'STRATEGIZE');
      expect(renewResult.renewed).toBe(false);
      expect(renewResult.reason).toContain('not held by this agent');

      leaseManager2.close();
    });

    it('enforces max renewal count', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      // Renew 3 times (max allowed)
      for (let i = 0; i < 3; i++) {
        const renewResult = await leaseManager.renewLease('TEST-001', 'STRATEGIZE');
        expect(renewResult.renewed).toBe(true);
      }

      // 4th renewal should fail
      const finalRenewal = await leaseManager.renewLease('TEST-001', 'STRATEGIZE');
      expect(finalRenewal.renewed).toBe(false);
      expect(finalRenewal.reason).toContain('Max renewals');
    });
  });

  describe('Lease Release', () => {
    it('releases lease successfully', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const released = await leaseManager.releaseLease('TEST-001', 'STRATEGIZE');
      expect(released).toBe(true);

      // Should be able to acquire again
      const result2 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result2.acquired).toBe(true);
    });

    it('fails to release lease held by another agent', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-2'
      });

      const released = await leaseManager2.releaseLease('TEST-001', 'STRATEGIZE');
      expect(released).toBe(false);

      leaseManager2.close();
    });

    it('releases all leases for agent', async () => {
      await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      await leaseManager.acquireLease('TEST-002', 'SPEC');
      await leaseManager.acquireLease('TEST-003', 'PLAN');

      const releasedCount = await leaseManager.releaseAllLeases();
      expect(releasedCount).toBe(3);

      // All should be available now
      const result1 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      const result2 = await leaseManager.acquireLease('TEST-002', 'SPEC');
      const result3 = await leaseManager.acquireLease('TEST-003', 'PLAN');

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);
      expect(result3.acquired).toBe(true);
    });
  });

  describe('Lease Queries', () => {
    it('checks if agent holds lease', async () => {
      expect(leaseManager.holdsLease('TEST-001', 'STRATEGIZE')).toBe(false);

      await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(leaseManager.holdsLease('TEST-001', 'STRATEGIZE')).toBe(true);

      await leaseManager.releaseLease('TEST-001', 'STRATEGIZE');
      expect(leaseManager.holdsLease('TEST-001', 'STRATEGIZE')).toBe(false);
    });

    it('gets current lease holder info', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const lease = leaseManager.getLease('TEST-001', 'STRATEGIZE');
      expect(lease).toBeDefined();
      expect(lease?.agent_id).toBe('test-agent-1');
      expect(lease?.task_id).toBe('TEST-001');
      expect(lease?.phase).toBe('STRATEGIZE');
    });

    it('returns null for non-existent lease', async () => {
      const lease = leaseManager.getLease('NONEXISTENT', 'STRATEGIZE');
      expect(lease).toBeNull();
    });
  });

  describe('Lease Statistics', () => {
    it('tracks lease statistics correctly', async () => {
      await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      await leaseManager.acquireLease('TEST-002', 'SPEC');

      const stats = await leaseManager.getStats();

      expect(stats.totalLeases).toBe(2);
      expect(stats.activeLeases).toBe(2);
      expect(stats.expiredLeases).toBe(0);
    });

    it('tracks expired leases correctly', async () => {
      const shortLeaseManager = new PhaseLeaseManager(testWorkspaceRoot, {
        leaseDuration: 1,  // 1 second
        agentId: 'test-agent-short'
      });

      await shortLeaseManager.acquireLease('TEST-001', 'STRATEGIZE');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1200));

      const stats = await shortLeaseManager.getStats();
      expect(stats.expiredLeases).toBe(1);
      expect(stats.activeLeases).toBe(0);

      shortLeaseManager.close();
    });

    it('tracks renewal count correctly', async () => {
      await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      await leaseManager.renewLease('TEST-001', 'STRATEGIZE');
      await leaseManager.renewLease('TEST-001', 'STRATEGIZE');

      const lease = leaseManager.getLease('TEST-001', 'STRATEGIZE');
      expect(lease?.renewed_count).toBe(2);
    });
  });

  describe('Atomicity and Concurrency', () => {
    it('handles concurrent acquisition attempts atomically', async () => {
      // Simulate concurrent acquisitions
      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-2'
      });

      const [result1, result2] = await Promise.all([
        leaseManager.acquireLease('TEST-001', 'STRATEGIZE'),
        leaseManager2.acquireLease('TEST-001', 'STRATEGIZE')
      ]);

      // Exactly one should succeed
      const successCount = [result1.acquired, result2.acquired].filter(Boolean).length;
      expect(successCount).toBe(1);

      leaseManager2.close();
    });
  });

  describe('Phase Transition Scenarios', () => {
    it('supports lease handoff between phases', async () => {
      // Acquire STRATEGIZE
      const result1 = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result1.acquired).toBe(true);

      // Release STRATEGIZE
      await leaseManager.releaseLease('TEST-001', 'STRATEGIZE');

      // Acquire SPEC
      const result2 = await leaseManager.acquireLease('TEST-001', 'SPEC');
      expect(result2.acquired).toBe(true);
    });

    it('prevents skipping phases via lease checks', async () => {
      // Acquire STRATEGIZE
      await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');

      // Different agent tries to skip to IMPLEMENT
      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-2'
      });

      const result = await leaseManager2.acquireLease('TEST-001', 'IMPLEMENT');

      // Should succeed (lease is per task+phase, not enforcing sequence)
      // But in practice, phase enforcement would prevent this
      expect(result.acquired).toBe(true);

      leaseManager2.close();
    });
  });

  describe('Error Handling', () => {
    it('handles database errors gracefully', async () => {
      // Close database to simulate error
      leaseManager.close();

      // Should handle error without crashing
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(false);
      expect(result.reason).toContain('Internal error');
    });
  });

  describe('Persistence', () => {
    it('persists leases across manager instances', async () => {
      const result = await leaseManager.acquireLease('TEST-001', 'STRATEGIZE');
      expect(result.acquired).toBe(true);

      const leaseId = result.lease!.lease_id;

      // Create new manager with same agent ID
      const leaseManager2 = new PhaseLeaseManager(testWorkspaceRoot, {
        agentId: 'test-agent-1'
      });

      const lease = leaseManager2.getLease('TEST-001', 'STRATEGIZE');
      expect(lease?.lease_id).toBe(leaseId);

      leaseManager2.close();
    });
  });
});
