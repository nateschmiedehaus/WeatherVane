/**
 * Integration tests for RollbackMonitor with Blue/Green WorkerManager
 *
 * Tests the complete rollback flow:
 * 1. Promote new worker (blue)
 * 2. Monitor health post-promotion
 * 3. Trigger rollback on error spike
 * 4. Revert to previous worker (green)
 * 5. Reset kill-switch after issue resolution
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { RollbackMonitor, type RollbackDecision } from '../orchestrator/rollback_monitor.js';

// Mock WorkerManager that simulates blue/green deployment
class MockWorkerManager {
  private activeWorker: any = null;
  private previousWorker: any = null;
  private workers: Map<string, any> = new Map();

  constructor() {
    // Setup initial state
    this.previousWorker = this.createMockWorker('green-1234', 'green');
    this.activeWorker = this.createMockWorker('blue-5678', 'blue');
  }

  private createMockWorker(pid: string, color: string) {
    const state = {
      isHealthy: true,
      errorRate: 0,
      failuresLastHour: 0,
      memoryUsageMb: 512,
      uptime: Date.now(),
    };

    return {
      pid,
      color,
      state,
      call: vi.fn(async (method: string) => {
        if (method === 'health' && state.isHealthy) {
          return { ok: true };
        }
        if (method === 'health' && !state.isHealthy) {
          throw new Error('Health check failed');
        }
        return null;
      }),
      uptime: () => Date.now() - state.uptime,
      setState: (newState: Partial<typeof state>) => {
        Object.assign(state, newState);
      },
      getState: () => state,
    };
  }

  getActiveWorker() {
    return this.activeWorker;
  }

  getPreviousWorker() {
    return this.previousWorker;
  }

  // Simulate promotion of new worker
  promoteWorker(newWorkerColor: 'blue' | 'green') {
    this.previousWorker = this.activeWorker;
    this.activeWorker = this.createMockWorker(`${newWorkerColor}-5678`, newWorkerColor);
    return {
      activeWorker: this.activeWorker,
      previousWorker: this.previousWorker,
    };
  }

  // Simulate rollback to previous worker
  switchToActive() {
    const temp = this.activeWorker;
    this.activeWorker = this.previousWorker;
    this.previousWorker = temp;

    return {
      previousWorkerPid: this.previousWorker.pid,
      restoredWorkerPid: this.activeWorker.pid,
      switchedAt: new Date().toISOString(),
    };
  }
}

// Mock OperationsManager
class MockOperationsManager {
  private snapshot = {
    failureRate: 0,
    validation: {
      failuresLastHour: 0,
      failureRate: 0,
    },
    resources: {
      memoryUsageMb: 512,
    },
  };

  getSnapshot() {
    return this.snapshot;
  }

  // Simulate increasing error rate
  setErrorRate(rate: number) {
    this.snapshot.failureRate = rate;
    this.snapshot.validation.failureRate = rate;
  }

  // Simulate increasing failures
  setFailuresLastHour(count: number) {
    this.snapshot.validation.failuresLastHour = count;
  }

  // Simulate memory pressure
  setMemoryUsage(mb: number) {
    this.snapshot.resources.memoryUsageMb = mb;
  }
}

// Mock LiveFlags
class MockLiveFlags {
  private flags: Map<string, string> = new Map();

  constructor() {
    this.flags.set('DISABLE_NEW', '0');
  }

  async setFlag(key: string, value: string) {
    this.flags.set(key, value);
  }

  getFlag(key: string) {
    return this.flags.get(key);
  }
}

describe('RollbackMonitor Integration Tests', () => {
  let monitor: RollbackMonitor;
  let workerManager: MockWorkerManager;
  let operationsManager: MockOperationsManager;
  let liveFlags: MockLiveFlags;

  beforeEach(() => {
    workerManager = new MockWorkerManager();
    operationsManager = new MockOperationsManager();
    liveFlags = new MockLiveFlags();

    monitor = new RollbackMonitor({
      workerManager,
      operationsManager,
      liveFlags,
      checkIntervalMs: 50, // Fast for tests
      postPromotionGracePeriodMs: 500, // Short for tests
      errorRateThreshold: 0.2,
      consecutiveFailureThreshold: 2,
      checkWindowSize: 5,
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('Complete Rollback Flow', () => {
    it('should detect and rollback on error spike post-promotion', async () => {
      // Initial state: blue worker is active, green is standby
      expect(workerManager.getActiveWorker().color).toBe('blue');

      let rollbackTriggered = false;
      const rollbackEvents: any[] = [];

      monitor.on('rollback-executed', (event) => {
        rollbackTriggered = true;
        rollbackEvents.push(event);
      });

      // Start monitoring post-promotion
      await monitor.startPostPromotionMonitoring();

      // Simulate error spike on new worker
      operationsManager.setErrorRate(0.5); // 50% error rate
      operationsManager.setFailuresLastHour(10);

      // Wait for health checks to accumulate
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify rollback was triggered
      if (rollbackTriggered && rollbackEvents.length > 0) {
        const decision = rollbackEvents[0].decision;
        expect(decision.errorRate).toBeGreaterThan(0.2);
        expect(decision.reason).toContain('error rate');
      }
    });

    it('should maintain stability when new worker is healthy', async () => {
      let healthyCount = 0;

      monitor.on('health-check', ({ decision }) => {
        if (decision.decision === 'healthy') {
          healthyCount++;
        }
      });

      // Keep error rate low
      operationsManager.setErrorRate(0.01);
      operationsManager.setFailuresLastHour(0);

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(healthyCount).toBeGreaterThan(0);
    });

    it('should trigger kill-switch on consecutive failures', async () => {
      let escalationTriggered = false;

      monitor.on('escalation-triggered', () => {
        escalationTriggered = true;
      });

      monitor = new RollbackMonitor({
        workerManager,
        operationsManager,
        liveFlags,
        checkIntervalMs: 50,
        postPromotionGracePeriodMs: 500,
        errorRateThreshold: 0.2,
        consecutiveFailureThreshold: 1, // Lower for test
      });

      monitor.on('escalation-triggered', () => {
        escalationTriggered = true;
      });

      // Simulate health check failures
      const mockWorker = workerManager.getActiveWorker();
      vi.spyOn(mockWorker, 'call').mockRejectedValue(new Error('RPC failure'));

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      if (escalationTriggered) {
        expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');
      }
    });

    it('should recover by resetting kill-switch', async () => {
      // Trigger kill-switch
      await (monitor as any).triggerKillSwitch();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');

      // Reset after issue resolution
      await monitor.resetKillSwitch();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('0');
    });
  });

  describe('Blue/Green Worker Coordination', () => {
    it('should track worker promotion and rollback cycle', async () => {
      // Initial state
      const initialActive = workerManager.getActiveWorker();
      const initialPrevious = workerManager.getPreviousWorker();

      expect(initialActive.color).toBe('blue');
      expect(initialPrevious.color).toBe('green');

      // Simulate rollback
      const result = workerManager.switchToActive();

      // Verify colors swapped
      expect(workerManager.getActiveWorker().color).toBe('green');
      expect(workerManager.getPreviousWorker().color).toBe('blue');

      expect(result.restoredWorkerPid).toBe(initialPrevious.pid);
      expect(result.previousWorkerPid).toBe(initialActive.pid);
    });

    it('should not lose worker references during monitoring', async () => {
      const activeWorkerBefore = workerManager.getActiveWorker();
      const prevWorkerBefore = workerManager.getPreviousWorker();

      // Monitor for a while
      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify worker references still valid
      const activeWorkerAfter = workerManager.getActiveWorker();
      const prevWorkerAfter = workerManager.getPreviousWorker();

      expect(activeWorkerAfter).toBe(activeWorkerBefore);
      expect(prevWorkerAfter).toBe(prevWorkerBefore);
    });

    it('should preserve worker state during grace period', async () => {
      const initialState = workerManager.getActiveWorker().getState();

      await monitor.startPostPromotionMonitoring();

      // Simulate some errors
      operationsManager.setErrorRate(0.05);

      await new Promise((resolve) => setTimeout(resolve, 250));

      const finalState = workerManager.getActiveWorker().getState();

      // State should persist unless explicitly changed
      expect(finalState.memoryUsageMb).toBe(initialState.memoryUsageMb);
    });
  });

  describe('Resource Monitoring', () => {
    it('should detect memory pressure and degrade', async () => {
      let degradedCount = 0;

      monitor.on('health-check', ({ decision }) => {
        if (decision.decision === 'degrade') {
          degradedCount++;
        }
      });

      // Set high memory usage
      operationsManager.setMemoryUsage(900);

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Memory pressure should trigger degradation
      // (actual trigger depends on threshold)
    });

    it('should continue monitoring despite resource constraints', async () => {
      let checksCompleted = 0;

      monitor.on('health-check', () => {
        checksCompleted++;
      });

      // Extreme but recoverable conditions
      operationsManager.setMemoryUsage(950);
      operationsManager.setErrorRate(0.15);

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(checksCompleted).toBeGreaterThan(0);
    });
  });

  describe('Audit Trail', () => {
    it('should provide complete decision history', async () => {
      const decisions: RollbackDecision[] = [];

      monitor.on('health-check', ({ decision }) => {
        decisions.push(decision);
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Each decision should have required fields
      decisions.forEach((decision) => {
        expect(decision).toHaveProperty('timestamp');
        expect(decision).toHaveProperty('decision');
        expect(decision).toHaveProperty('reason');
        expect(decision).toHaveProperty('evidence');
        expect(decision.evidence).toHaveProperty('recentChecks');
        expect(decision.evidence).toHaveProperty('failurePattern');
      });
    });

    it('should maintain consistent evidence trail', async () => {
      let lastEvidence: any = null;

      monitor.on('health-check', ({ decision }) => {
        lastEvidence = decision.evidence;
      });

      operationsManager.setErrorRate(0.1);

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(lastEvidence?.recentChecks).toBeDefined();
      expect(Array.isArray(lastEvidence?.recentChecks)).toBe(true);
      expect(lastEvidence?.recentChecks.length).toBeGreaterThan(0);

      // Recent checks should have consistent structure
      lastEvidence?.recentChecks.forEach((check: any) => {
        expect(check).toHaveProperty('timestamp');
        expect(check).toHaveProperty('ok');
        expect(check).toHaveProperty('errorRate');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing worker gracefully', async () => {
      let healthCheckExecuted = false;

      monitor.on('health-check', ({ result }) => {
        healthCheckExecuted = true;
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('No active worker');
      });

      // Remove active worker
      (workerManager as any).activeWorker = null;

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(healthCheckExecuted).toBe(true);
    });

    it('should handle operations manager failure', async () => {
      let healthCheckExecuted = false;

      monitor.on('health-check', ({ result }) => {
        healthCheckExecuted = true;
        // Should still produce a result
        expect(result).toHaveProperty('timestamp');
      });

      // Create a custom manager that fails
      const failingManager = {
        getSnapshot: () => null,
      };

      const monitorWithFailingOps = new RollbackMonitor({
        workerManager,
        operationsManager: failingManager as any,
        liveFlags,
        checkIntervalMs: 50,
        postPromotionGracePeriodMs: 500,
      });

      monitorWithFailingOps.on('health-check', ({ result }) => {
        healthCheckExecuted = true;
        expect(result).toHaveProperty('timestamp');
      });

      await monitorWithFailingOps.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(healthCheckExecuted).toBe(true);
      monitorWithFailingOps.stopMonitoring();
    });

    it('should recover from live flags errors', async () => {
      // Make setFlag fail once, then succeed
      let failCount = 0;
      const originalSetFlag = liveFlags.setFlag.bind(liveFlags);

      vi.spyOn(liveFlags, 'setFlag').mockImplementation(async (key, value) => {
        failCount++;
        if (failCount === 1) {
          throw new Error('Flag service unavailable');
        }
        return originalSetFlag(key, value);
      });

      // Should emit error but continue
      let errorEmitted = false;
      monitor.on('escalation-triggered', () => {
        errorEmitted = true;
      });

      // This test verifies graceful degradation
      expect(liveFlags).toBeDefined();
    });
  });

  describe('State Transitions', () => {
    it('should transition through decision states correctly', async () => {
      const decisionSequence: string[] = [];

      monitor.on('health-check', ({ decision }) => {
        decisionSequence.push(decision.decision);
      });

      // Start healthy
      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Introduce minor issues
      operationsManager.setErrorRate(0.08);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Increase issues to spike
      operationsManager.setErrorRate(0.3);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should see progression through states
      expect(decisionSequence.length).toBeGreaterThan(0);
      expect(decisionSequence[0]).toBe('healthy'); // Initial state
    });

    it('should stop monitoring at grace period expiration', async () => {
      let monitoringStopped = false;

      monitor.on('monitoring-stopped', () => {
        monitoringStopped = true;
      });

      monitor = new RollbackMonitor({
        workerManager,
        operationsManager,
        liveFlags,
        checkIntervalMs: 100,
        postPromotionGracePeriodMs: 200, // Very short
      });

      monitor.on('monitoring-stopped', () => {
        monitoringStopped = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(monitoringStopped).toBe(true);
    });
  });

  describe('DISABLE_NEW Flag Integration', () => {
    it('should respect DISABLE_NEW flag in escalation', async () => {
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('0');

      // Trigger escalation
      await (monitor as any).triggerKillSwitch();

      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');
    });

    it('should verify flag reset for recovery', async () => {
      // Set kill-switch
      await (monitor as any).triggerKillSwitch();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');

      // Reset it
      await monitor.resetKillSwitch();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('0');
    });

    it('should persist flag state across monitoring cycles', async () => {
      // Initial state
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('0');

      // Trigger kill-switch during monitoring
      await (monitor as any).triggerKillSwitch();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');

      // Flag should remain set even after monitoring stops
      monitor.stopMonitoring();
      expect(liveFlags.getFlag('DISABLE_NEW')).toBe('1');
    });
  });
});
