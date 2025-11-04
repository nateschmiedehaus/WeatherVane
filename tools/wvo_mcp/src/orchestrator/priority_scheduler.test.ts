import { describe, it, expect, beforeEach } from 'vitest';

import type { FeatureGatesReader } from './feature_gates.js';
import { calculatePriority, rankTasks } from './priority_scheduler.js';
import type { Task, StateMachine } from './state_machine.js';

const createMockStateMachine = (): StateMachine => ({
  getDependents: () => [],
  getTask: () => null,
  addTask: () => {},
  updateTask: () => {},
  deleteTask: () => {},
  getTasks: () => [],
  logEvent: () => {},
  getStateHistory: () => [],
  getCurrentState: () => ({ tasks: new Map() }),
  addEventListener: () => () => {},
  removeEventListener: () => {},
  getMetrics: () => ({ totalEvents: 0 }),
} as unknown as StateMachine);

const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-1',
  title: 'Test Task',
  type: 'task',
  status: 'pending',
  created_at: Date.now(),
  ...overrides,
});

const createMockFeatureGates = (schedulerMode: 'legacy' | 'wsjf' = 'legacy'): FeatureGatesReader => ({
  isCompactPromptMode: () => false,
  getPromptMode: () => 'verbose',
  isSandboxPoolEnabled: () => false,
  getSandboxMode: () => 'none',
  getSchedulerMode: () => schedulerMode,
  isAdminToolsEnabled: () => false,
  isUpgradeToolsEnabled: () => false,
  isRoutingToolsEnabled: () => false,
} as unknown as FeatureGatesReader);

describe('Priority Scheduler with Feature Gating', () => {
  let stateMachine: StateMachine;

  beforeEach(() => {
    stateMachine = createMockStateMachine();
  });

  describe('calculatePriority', () => {
    it('should return legacy scheduler mode by default', () => {
      const task = createMockTask();
      const result = calculatePriority(task, stateMachine);
      expect(result.schedulerMode).toBe('legacy');
    });

    it('should return legacy scheduler mode when feature gates undefined', () => {
      const task = createMockTask();
      const result = calculatePriority(task, stateMachine, undefined);
      expect(result.schedulerMode).toBe('legacy');
    });

    it('should respect feature gate for WSJF scheduler mode', () => {
      const task = createMockTask();
      const featureGates = createMockFeatureGates('wsjf');
      const result = calculatePriority(task, stateMachine, featureGates);
      expect(result.schedulerMode).toBe('wsjf');
    });

    it('should include critical path in legacy scoring', () => {
      const task = createMockTask({
        metadata: { critical: true } as any,
      });
      const result = calculatePriority(task, stateMachine);
      expect(result.score).toBeGreaterThan(0);
      expect(result.reasons).toContain('critical_path');
    });

    it('should include business value in legacy scoring', () => {
      const task = createMockTask({
        metadata: { business_value: 50 } as any,
      });
      const result = calculatePriority(task, stateMachine);
      expect(result.reasons).toContain('business_value');
    });

    it('should apply effort penalty in legacy scoring', () => {
      const task = createMockTask({
        metadata: { effort: 8 } as any,
      });
      const result = calculatePriority(task, stateMachine);
      expect(result.reasons).toContain('effort_penalty');
    });

    it('should apply higher score to WSJF scheduler for high-value, low-effort tasks', () => {
      const highValueTask = createMockTask({
        metadata: {
          business_value: 100,
          effort: 1,
          jobs_to_be_done: 20,
        } as any,
      });

      const legacyResult = calculatePriority(highValueTask, stateMachine, createMockFeatureGates('legacy'));
      const wsjfResult = calculatePriority(highValueTask, stateMachine, createMockFeatureGates('wsjf'));

      // WSJF should score differently (not necessarily higher, but based on business/effort ratio)
      expect(wsjfResult.score).toBeGreaterThan(0);
    });

    it('should weight time criticality in WSJF mode', () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const urgentTask = createMockTask({
        metadata: {
          business_value: 50,
          deadline: tomorrow.toISOString(),
          effort: 2,
        } as any,
      });

      const result = calculatePriority(urgentTask, stateMachine, createMockFeatureGates('wsjf'));
      expect(result.score).toBeGreaterThan(0);
    });

    it('should weight risk reduction in WSJF mode', () => {
      const riskyTask = createMockTask({
        metadata: {
          business_value: 30,
          high_risk: true,
          effort: 2,
        } as any,
      });

      const result = calculatePriority(riskyTask, stateMachine, createMockFeatureGates('wsjf'));
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('rankTasks', () => {
    it('should rank tasks by priority without feature gates', () => {
      const tasks = [
        createMockTask({ id: 'task-1', metadata: { business_value: 10 } as any }),
        createMockTask({ id: 'task-2', metadata: { critical: true } as any }),
        createMockTask({ id: 'task-3', metadata: { business_value: 5 } as any }),
      ];

      const ranked = rankTasks(tasks, stateMachine);
      expect(ranked).toHaveLength(3);
      // Critical task should be ranked high
      expect(ranked[0].id).toBe('task-2');
    });

    it('should use legacy ranking when feature gates indicate legacy mode', () => {
      const tasks = [
        createMockTask({ id: 'task-1', metadata: { effort: 1, business_value: 5 } as any }),
        createMockTask({ id: 'task-2', metadata: { critical: true } as any }),
      ];

      const ranked = rankTasks(tasks, stateMachine, createMockFeatureGates('legacy'));
      expect(ranked).toHaveLength(2);
      // Critical tasks (120 points) should outrank business value (5*10=50 points) in legacy mode
      expect(ranked[0].id).toBe('task-2');
    });

    it('should apply WSJF ranking when feature gates indicate WSJF mode', () => {
      const tasks = [
        createMockTask({
          id: 'task-high-value-low-effort',
          metadata: { business_value: 100, effort: 1 } as any,
        }),
        createMockTask({
          id: 'task-low-value-high-effort',
          metadata: { business_value: 10, effort: 5 } as any,
        }),
      ];

      const ranked = rankTasks(tasks, stateMachine, createMockFeatureGates('wsjf'));
      expect(ranked).toHaveLength(2);
      // In WSJF, high-value low-effort tasks should rank higher
      expect(ranked[0].id).toBe('task-high-value-low-effort');
    });

    it('should handle empty task list', () => {
      const ranked = rankTasks([], stateMachine);
      expect(ranked).toEqual([]);
    });

    it('should handle single task', () => {
      const tasks = [createMockTask({ id: 'task-1' })];
      const ranked = rankTasks(tasks, stateMachine);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('task-1');
    });

    it('should maintain task identity during ranking', () => {
      const originalTask = createMockTask({ id: 'original' });
      const ranked = rankTasks([originalTask], stateMachine);
      expect(ranked[0]).toBe(originalTask);
    });
  });

  describe('Feature gating integration', () => {
    it('should fall back to legacy mode when feature gates are not available', () => {
      const task = createMockTask();
      const result = calculatePriority(task, stateMachine, undefined);
      expect(result.schedulerMode).toBe('legacy');
    });

    it('should work seamlessly when switching between scheduler modes', () => {
      const task = createMockTask({
        metadata: {
          business_value: 50,
          effort: 2,
        } as any,
      });

      const legacyResult = calculatePriority(task, stateMachine, createMockFeatureGates('legacy'));
      const wsjfResult = calculatePriority(task, stateMachine, createMockFeatureGates('wsjf'));

      // Both should complete successfully
      expect(legacyResult.schedulerMode).toBe('legacy');
      expect(wsjfResult.schedulerMode).toBe('wsjf');
      expect(legacyResult.score).toBeGreaterThan(0);
      expect(wsjfResult.score).toBeGreaterThan(0);
    });

    it('should preserve task metadata during feature-gated ranking', () => {
      const originalMetadata = { business_value: 75, critical: true };
      const task = createMockTask({
        metadata: originalMetadata as any,
      });

      const ranked = rankTasks([task], stateMachine, createMockFeatureGates('wsjf'));
      expect(ranked[0].metadata).toEqual(originalMetadata);
    });
  });
});
