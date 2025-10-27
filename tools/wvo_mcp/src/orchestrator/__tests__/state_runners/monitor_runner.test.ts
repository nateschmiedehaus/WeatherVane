/**
 * Monitor Runner - Behavior Tests
 *
 * Tests verify BEHAVIOR, not implementation details.
 * Pattern: Arrange → Act → Assert on outcomes
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ModelSelection } from '../../model_router.js';
import { runMonitor, type MonitorRunnerDeps } from '../../state_runners/monitor_runner.js';
import type { RunnerContext } from '../../state_runners/runner_types.js';
import type { SupervisorAgent } from '../../supervisor.js';

describe('MonitorRunner - Behavior Tests', () => {
  let context: RunnerContext;
  let deps: MonitorRunnerDeps;
  let supervisor: SupervisorAgent;
  let runAppSmoke: ReturnType<typeof vi.fn>;
  let clearMemory: ReturnType<typeof vi.fn>;
  let clearRouter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = {
      task: {
        id: 'TEST-1',
        title: 'Test task',
        priorityTags: ['p0'],
      },
      attemptNumber: 1,
    };

    const modelSelection: ModelSelection = {
      model: 'codex-5-high',
      provider: 'anthropic',
      capabilityTags: ['reasoning_high'],
      source: 'policy' as const,
      reason: 'test',
    };

    supervisor = {
      monitor: vi.fn(() => ({
        status: 'complete',
        model: modelSelection,
      })),
    } as unknown as SupervisorAgent;

    runAppSmoke = vi.fn(() =>
      Promise.resolve({
        success: true,
        log: 'Smoke tests passed',
        command: ['bash', 'scripts/app_smoke_e2e.sh'],
        durationMs: 2500,
        mode: 'script',
      })
    );
    clearMemory = vi.fn();
    clearRouter = vi.fn();

    deps = {
      supervisor,
      runAppSmoke,
      clearMemory,
      clearRouter,
    };
  });

  // 1. HAPPY PATH - What should happen
  describe('when smoke test passes', () => {
    it('produces monitor artifact with smoke result', async () => {
      const result = await runMonitor(context, deps);

      expect(result.artifacts.monitor).toBeDefined();
      expect((result.artifacts.monitor as any).smoke.success).toBe(true);
      expect((result.artifacts.monitor as any).smoke.log).toContain('Smoke tests passed');
    });

    it('invokes smoke runner with task metadata', async () => {
      await runMonitor(context, deps);

      expect(runAppSmoke).toHaveBeenCalledWith({ taskId: 'TEST-1', attempt: 1 });
    });

    it('returns nextState=null (task complete)', async () => {
      const result = await runMonitor(context, deps);

      expect(result.nextState).toBeNull();
    });

    it('returns success=true', async () => {
      const result = await runMonitor(context, deps);

      expect(result.success).toBe(true);
    });

    it('includes completion note', async () => {
      const result = await runMonitor(context, deps);

      expect(result.notes).toContain('Monitor succeeded, task complete.');
    });

    it('includes model selection', async () => {
      const result = await runMonitor(context, deps);

      expect(result.modelSelection).toBeDefined();
      expect(result.modelSelection?.model).toBe('codex-5-high');
    });

    it('clears task from memory', async () => {
      await runMonitor(context, deps);

      expect(clearMemory).toHaveBeenCalledWith('TEST-1');
    });

    it('clears task from router', async () => {
      await runMonitor(context, deps);

      expect(clearRouter).toHaveBeenCalledWith('TEST-1');
    });
  });

  // 2. SMOKE TEST FAILURE PATH
  describe('when smoke test fails', () => {
    beforeEach(() => {
      runAppSmoke.mockResolvedValue({
        success: false,
        log: 'Smoke tests failed',
        command: ['bash', 'scripts/app_smoke_e2e.sh'],
        durationMs: 1800,
        mode: 'script',
      });
    });

    it('transitions to plan state', async () => {
      const result = await runMonitor(context, deps);

      expect(result.nextState).toBe('plan');
    });

    it('returns success=false', async () => {
      const result = await runMonitor(context, deps);

      expect(result.success).toBe(false);
    });

    it('requires plan delta', async () => {
      const result = await runMonitor(context, deps);

      expect(result.requirePlanDelta).toBe(true);
    });

    it('includes failure note', async () => {
      const result = await runMonitor(context, deps);

      expect(result.notes).toContain('App smoke failed; forcing plan delta.');
    });

    it('includes smoke failure in artifact', async () => {
      const result = await runMonitor(context, deps);

      expect((result.artifacts.monitor as any).smoke.success).toBe(false);
    });

    it('does NOT clear memory when smoke fails', async () => {
      await runMonitor(context, deps);

      expect(clearMemory).not.toHaveBeenCalled();
    });

    it('does NOT clear router when smoke fails', async () => {
      await runMonitor(context, deps);

      expect(clearRouter).not.toHaveBeenCalled();
    });
  });

  // 3. ERROR PATHS
  describe('when supervisor throws error', () => {
    it('propagates error', async () => {
      supervisor.monitor = vi.fn(() => {
        throw new Error('Supervisor crashed');
      });

      await expect(runMonitor(context, deps)).rejects.toThrow('Supervisor crashed');
    });
  });

  describe('when runAppSmoke throws error', () => {
    it('propagates error', async () => {
      runAppSmoke.mockRejectedValue(new Error('Smoke test crashed'));

      await expect(runMonitor(context, deps)).rejects.toThrow('Smoke test crashed');
    });
  });

  // 4. EDGE CASES
  describe('edge cases', () => {
    it('handles smoke test with no output', async () => {
      runAppSmoke.mockResolvedValue({
        success: true,
        log: '',
        command: ['bash', 'scripts/app_smoke_e2e.sh'],
        durationMs: 120,
        mode: 'script',
      });

      const result = await runMonitor(context, deps);

      expect(result.success).toBe(true);
      expect((result.artifacts.monitor as any).smoke.log).toBe('');
    });

    it('handles smoke test with detailed output', async () => {
      const detailedOutput = 'Test 1: pass\nTest 2: pass\nTest 3: pass';
      runAppSmoke.mockResolvedValue({
        success: true,
        log: detailedOutput,
        command: ['bash', 'scripts/app_smoke_e2e.sh'],
        durationMs: 320,
        mode: 'script',
      });

      const result = await runMonitor(context, deps);

      expect(result.success).toBe(true);
      expect((result.artifacts.monitor as any).smoke.log).toBe(detailedOutput);
    });

    it('handles high attempt number', async () => {
      context.attemptNumber = 99;

      const result = await runMonitor(context, deps);

      expect(result.success).toBe(true);
    });

    it('handles task without priority tags', async () => {
      context.task.priorityTags = undefined;

      const result = await runMonitor(context, deps);

      expect(result.success).toBe(true);
    });

    it('cleans up in correct order (memory then router)', async () => {
      const callOrder: string[] = [];
      clearMemory.mockImplementation(() => callOrder.push('memory'));
      clearRouter.mockImplementation(() => callOrder.push('router'));

      await runMonitor(context, deps);

      expect(callOrder).toEqual(['memory', 'router']);
    });
  });
});
