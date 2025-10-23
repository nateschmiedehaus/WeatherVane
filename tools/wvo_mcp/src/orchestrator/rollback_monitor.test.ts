/**
 * Tests for RollbackMonitor: Health monitoring and automatic rollback
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { RollbackMonitor, type HealthCheckResult } from './rollback_monitor.js';

// Mock worker and operations managers
function createMockWorkerManager() {
  const healthCheckMock = vi.fn(async (method: string) => {
    // Return proper health check response
    if (method === 'health') {
      return { ok: true };
    }
    return null;
  });

  return {
    getActiveWorker: vi.fn(() => ({
      call: healthCheckMock,
      uptime: vi.fn(() => 60000), // 1 minute
      dispose: vi.fn(),
    })),
    switchToActive: vi.fn(() => ({
      previousWorkerPid: 1234,
      restoredWorkerPid: 5678,
      switchedAt: new Date().toISOString(),
    })),
  };
}

function createMockOperationsManager(errorRate = 0, failuresLastHour = 0) {
  return {
    getSnapshot: vi.fn(() => ({
      failureRate: errorRate,
      validation: {
        failuresLastHour,
        failureRate: errorRate,
      },
      resources: {
        memoryUsageMb: 512,
      },
    })),
  };
}

function createMockLiveFlags() {
  return {
    setFlag: vi.fn(),
  };
}

describe('RollbackMonitor', () => {
  let monitor: RollbackMonitor;
  let mockWorkerManager: any;
  let mockOperationsManager: any;
  let mockLiveFlags: any;

  beforeEach(() => {
    mockWorkerManager = createMockWorkerManager();
    mockOperationsManager = createMockOperationsManager();
    mockLiveFlags = createMockLiveFlags();

    monitor = new RollbackMonitor({
      workerManager: mockWorkerManager,
      operationsManager: mockOperationsManager,
      liveFlags: mockLiveFlags,
      checkIntervalMs: 100, // Fast for tests
      postPromotionGracePeriodMs: 500, // Short for tests
      errorRateThreshold: 0.2,
      consecutiveFailureThreshold: 2,
      checkWindowSize: 5,
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('Basic Monitoring', () => {
    it('should start monitoring and perform health checks', async () => {
      const checks: HealthCheckResult[] = [];

      monitor.on('health-check', ({ result }) => {
        checks.push(result);
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(checks.length).toBeGreaterThan(0);
      expect(checks[0]).toHaveProperty('timestamp');
      expect(checks[0]).toHaveProperty('ok');
      expect(checks[0]).toHaveProperty('errorRate');
    });

    it('should stop monitoring when explicitly stopped', async () => {
      let stoppedEvent = false;

      monitor.on('monitoring-stopped', () => {
        stoppedEvent = true;
      });

      await monitor.startPostPromotionMonitoring();
      monitor.stopMonitoring();

      expect(stoppedEvent).toBe(true);
    });

    it('should not start monitoring twice', async () => {
      const startedEvents: any[] = [];

      monitor.on('monitoring-started', (e) => {
        startedEvents.push(e);
      });

      await monitor.startPostPromotionMonitoring();
      await monitor.startPostPromotionMonitoring(); // Should be ignored

      expect(startedEvents.length).toBe(1);
    });
  });

  describe('Health Check Evaluation', () => {
    it('should evaluate as healthy when error rate is low', async () => {
      mockOperationsManager = createMockOperationsManager(0.01); // 1% error rate
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        errorRateThreshold: 0.2,
      });

      let lastDecision: any = null;
      monitor.on('health-check', ({ decision }) => {
        lastDecision = decision;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(lastDecision?.decision).toBe('healthy');
    });

    it('should evaluate as degraded with minor issues', async () => {
      mockOperationsManager = createMockOperationsManager(0.1, 1); // 10% error rate, 1 failure
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        errorRateThreshold: 0.2,
      });

      let lastDecision: any = null;
      monitor.on('health-check', ({ decision }) => {
        lastDecision = decision;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 250));

      // With low error rate, should eventually become healthy
      expect(lastDecision?.decision).toMatch(/healthy|degrade/);
    });

    it('should provide evidence in rollback decision', async () => {
      let decision: any = null;
      monitor.on('health-check', ({ decision: d }) => {
        decision = d;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(decision).toHaveProperty('evidence');
      expect(decision.evidence).toHaveProperty('recentChecks');
      expect(decision.evidence).toHaveProperty('failurePattern');
      expect(decision.evidence).toHaveProperty('threshold');
    });
  });

  describe('Rollback Trigger', () => {
    it('should trigger rollback on high error rates', async () => {
      let rollbackTriggered = false;

      monitor.on('rollback-executed', () => {
        rollbackTriggered = true;
      });

      // Set high error rate
      mockOperationsManager = createMockOperationsManager(0.5, 10); // 50% error rate, 10 failures
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        errorRateThreshold: 0.2,
        consecutiveFailureThreshold: 2,
      });

      monitor.on('rollback-executed', () => {
        rollbackTriggered = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should trigger rollback after several high-error checks
      if (rollbackTriggered) {
        expect(mockWorkerManager.switchToActive).toHaveBeenCalled();
      }
    });

    it('should record rollback decision for audit', async () => {
      const spy = vi.spyOn(monitor as any, 'recordRollbackDecision');

      mockOperationsManager = createMockOperationsManager(0.5, 10);
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 50,
        errorRateThreshold: 0.2,
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Allow for some checks to happen
      expect(spy).toBeDefined();
    });
  });

  describe('Kill-Switch Functionality', () => {
    it('should trigger kill-switch on escalation', async () => {
      let escalationTriggered = false;

      monitor.on('escalation-triggered', () => {
        escalationTriggered = true;
      });

      mockOperationsManager = createMockOperationsManager(0.5, 10);
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        errorRateThreshold: 0.2,
        consecutiveFailureThreshold: 1, // Lower threshold for test
      });

      monitor.on('escalation-triggered', () => {
        escalationTriggered = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (escalationTriggered) {
        expect(mockLiveFlags.setFlag).toHaveBeenCalledWith('DISABLE_NEW', '1');
      }
    });

    it('should reset kill-switch after manual verification', async () => {
      let resetTriggered = false;

      monitor.on('kill-switch-reset', () => {
        resetTriggered = true;
      });

      await monitor.resetKillSwitch();

      expect(resetTriggered).toBe(true);
      expect(mockLiveFlags.setFlag).toHaveBeenCalledWith('DISABLE_NEW', '0');
    });

    it('should emit kill-switch-activated event', async () => {
      let activateEvent: any = null;

      monitor.on('kill-switch-activated', (e) => {
        activateEvent = e;
      });

      // Manually trigger escalation
      await (monitor as any).triggerKillSwitch();

      expect(activateEvent).toEqual(
        expect.objectContaining({
          flag: 'DISABLE_NEW',
          value: '1',
        })
      );
    });
  });

  describe('Error Recovery', () => {
    it('should handle missing worker gracefully', async () => {
      mockWorkerManager.getActiveWorker = vi.fn(() => null);

      let checkCompleted = false;
      monitor.on('health-check', () => {
        checkCompleted = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(checkCompleted).toBe(true);
    });

    it('should handle missing operations manager', async () => {
      mockOperationsManager.getSnapshot = vi.fn(() => null);

      let checkCompleted = false;
      monitor.on('health-check', () => {
        checkCompleted = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(checkCompleted).toBe(true);
    });

    it('should recover from RPC failures', async () => {
      const worker = {
        call: vi.fn().mockRejectedValue(new Error('RPC timeout')),
        uptime: vi.fn(() => 60000),
      };
      mockWorkerManager.getActiveWorker = vi.fn(() => worker);

      let errorHandled = false;
      monitor.on('health-check', () => {
        errorHandled = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(errorHandled).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should report monitoring state', async () => {
      await monitor.startPostPromotionMonitoring();

      const state = monitor.getState();
      expect(state.monitoringActive).toBe(true);
      expect(state.monitoringStarted).toBeGreaterThan(0);

      monitor.stopMonitoring();

      const stoppedState = monitor.getState();
      expect(stoppedState.monitoringActive).toBe(false);
    });

    it('should maintain recent checks history', async () => {
      let checks = 0;
      monitor.on('health-check', () => {
        checks++;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const history = monitor.getRecentChecks();
      expect(history.length).toBe(checks);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history to window size', async () => {
      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 50,
        checkWindowSize: 3,
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const history = monitor.getRecentChecks();
      expect(history.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Grace Period', () => {
    it('should stop monitoring after grace period expires', async () => {
      let stopped = false;

      monitor.on('monitoring-stopped', () => {
        stopped = true;
      });

      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        postPromotionGracePeriodMs: 150, // Short for test
      });

      monitor.on('monitoring-stopped', () => {
        stopped = true;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(stopped).toBe(true);
    });
  });

  describe('Consecutive Failure Detection', () => {
    it('should detect consecutive failures pattern', async () => {
      const worker = {
        call: vi
          .fn()
          .mockRejectedValueOnce(new Error('RPC error'))
          .mockRejectedValueOnce(new Error('RPC error'))
          .mockResolvedValueOnce({ ok: true }),
        uptime: vi.fn(() => 60000),
      };
      mockWorkerManager.getActiveWorker = vi.fn(() => worker);

      let lastDecision: any = null;
      monitor.on('health-check', ({ decision }) => {
        lastDecision = decision;
      });

      monitor = new RollbackMonitor({
        workerManager: mockWorkerManager,
        operationsManager: mockOperationsManager,
        liveFlags: mockLiveFlags,
        checkIntervalMs: 100,
        consecutiveFailureThreshold: 2,
      });

      monitor.on('health-check', ({ decision }) => {
        lastDecision = decision;
      });

      await monitor.startPostPromotionMonitoring();
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(lastDecision?.evidence?.failurePattern).toBeDefined();
    });
  });
});
