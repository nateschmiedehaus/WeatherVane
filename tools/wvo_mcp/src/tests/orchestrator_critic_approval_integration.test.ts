/**
 * Integration test for OrchestratorLoop with critic approval enforcement
 *
 * Tests the full workflow:
 * 1. Task execution in orchestrator loop
 * 2. Critic approval validation via PolicyEngine
 * 3. Task state transitions based on critic results
 * 4. Proper handling of tasks with and without critic requirements
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { OrchestratorLoop } from '../orchestrator/orchestrator_loop.js';
import { QualityMonitor } from '../orchestrator/quality_monitor.js';
import { StateMachine } from '../orchestrator/state_machine.js';
import type { Task } from '../orchestrator/state_machine.js';
import { TaskScheduler } from '../orchestrator/task_scheduler.js';

describe('OrchestratorLoop - Critic Approval Integration', () => {
  let stateMachine: StateMachine;
  let scheduler: TaskScheduler;
  let qualityMonitor: QualityMonitor;
  let orchestrator: OrchestratorLoop;
  let testCounter = 0;

  beforeEach(async () => {
    // Create in-memory state machine for testing (unique for each test)
    testCounter++;
    const workspaceRoot = `/tmp/test-workspace-${testCounter}-${Date.now()}`;
    stateMachine = new StateMachine(workspaceRoot, { readonly: false });
    scheduler = new TaskScheduler(stateMachine);
    qualityMonitor = new QualityMonitor(stateMachine);

    orchestrator = new OrchestratorLoop(stateMachine, scheduler, qualityMonitor, {
      dryRun: false,
      tickInterval: 100,
      enableTelemetry: true,
    });
  });

  afterEach(async () => {
    if (orchestrator.isRunning()) {
      await orchestrator.stop();
    }
  });

  describe('Task execution with critic approval', () => {
    it('should block task completion if required critics have not been evaluated', async () => {
      // Create a T12 task (requires modeling_reality_v2 and data_quality)
      const taskId = 'T12.0.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Test data quality task',
        description: 'Task requiring critic approval',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      // Execute the task manually
      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      // Task should still be in_progress (awaiting critics), not done
      const updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('in_progress');
    });

    it('should transition task to needs_improvement if any required critic fails', async () => {
      const taskId = 'T12.0.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Test data quality task',
        description: 'Task requiring critic approval',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      // Simulate critic evaluation - one passes, one fails
      const policy = orchestrator['policy'];
      policy.recordCriticResult(taskId, 'modeling_reality_v2', true);
      policy.recordCriticResult(taskId, 'data_quality', false, 'data quality below threshold');

      // Execute the task
      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      // Task should transition to needs_improvement
      const updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('needs_improvement');
      expect(updatedTask.metadata).toBeDefined();
      expect(updatedTask.metadata?.critic_approval_status).toBeDefined();
    });

    it('should complete task if all required critics pass', async () => {
      const taskId = 'T12.0.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Test data quality task',
        description: 'Task requiring critic approval',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      // Simulate critic evaluation - both pass
      const policy = orchestrator['policy'];
      policy.recordCriticResult(taskId, 'modeling_reality_v2', true);
      policy.recordCriticResult(taskId, 'data_quality', true);

      // Execute the task
      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      // Task should transition to done
      const updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('done');
    });

    it('should allow tasks without critic requirements to complete immediately', async () => {
      const taskId = 'UNKNOWN.1.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Task without critic requirements',
        description: 'No critics needed',
        type: 'task',
        status: 'pending',
        estimated_complexity: 1,
      });

      // Execute the task
      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      // Task should complete without critic approval
      const updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('done');
    });

    it('should handle T13 tasks requiring 3 critics', async () => {
      const taskId = 'T13.2.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Test causal modeling task',
        description: 'Task requiring 3 critics',
        type: 'task',
        status: 'pending',
        estimated_complexity: 3,
      });

      const policy = orchestrator['policy'];

      // First attempt: only 2 critics pass
      policy.recordCriticResult(taskId, 'modeling_reality_v2', true);
      policy.recordCriticResult(taskId, 'academic_rigor', true);

      let task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      let updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('needs_improvement'); // Missing causal critic

      // Simulate fixing the issue and re-running
      policy.recordCriticResult(taskId, 'causal', true);

      // Reset to in_progress for second attempt
      await stateMachine.transition(taskId, 'pending');
      task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('done'); // All critics now pass
    });

    it('should handle T-MLR pattern tasks', async () => {
      const taskId = 'T-MLR-4.2';
      stateMachine.createTask({
        id: taskId,
        title: 'Test MLR task',
        description: 'Task matching T-MLR pattern',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      const policy = orchestrator['policy'];
      const requiredCritics = policy.getRequiredCritics(taskId);

      // T-MLR should require modeling_reality_v2 and academic_rigor
      expect(requiredCritics).toContain('modeling_reality_v2');
      expect(requiredCritics).toContain('academic_rigor');

      // Both pass
      policy.recordCriticResult(taskId, 'modeling_reality_v2', true);
      policy.recordCriticResult(taskId, 'academic_rigor', true);

      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      const updatedTask = stateMachine.getTask(taskId)!;
      expect(updatedTask.status).toBe('done');
    });
  });

  describe('Policy configuration validation', () => {
    it('should have critic approval enabled', () => {
      const config = orchestrator['policy'].getConfig();
      expect(config.criticApprovalRequired).toBe(true);
    });

    it('should have correct critic patterns configured', () => {
      const config = orchestrator['policy'].getConfig();
      expect(config.criticApprovalPatterns).toBeDefined();
      expect(config.criticApprovalPatterns['T12.*']).toContain('modeling_reality_v2');
      expect(config.criticApprovalPatterns['T12.*']).toContain('data_quality');
      expect(config.criticApprovalPatterns['T13.*']).toContain('causal');
      expect(config.criticApprovalPatterns['T-MLR-*']).toBeDefined();
    });

    it('should return correct required critics for each task pattern', () => {
      const policy = orchestrator['policy'];

      const t12Critics = policy.getRequiredCritics('T12.0.1');
      expect(t12Critics).toEqual(['modeling_reality_v2', 'data_quality']);

      const t13Critics = policy.getRequiredCritics('T13.2.1');
      expect(t13Critics).toEqual(['modeling_reality_v2', 'academic_rigor', 'causal']);

      const mlrCritics = policy.getRequiredCritics('T-MLR-4.2');
      expect(mlrCritics).toEqual(['modeling_reality_v2', 'academic_rigor']);

      const unknownCritics = policy.getRequiredCritics('UNKNOWN.1.1');
      expect(unknownCritics).toEqual([]);
    });
  });

  describe('Integration with state machine and scheduler', () => {
    it('should record context entries for tasks pending critic approval', async () => {
      const taskId = 'T12.0.1';
      stateMachine.createTask({
        id: taskId,
        title: 'Test task',
        description: 'Pending critics',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      const task = stateMachine.getTask(taskId)!;
      await orchestrator['executeTask'](task);

      const context = stateMachine.getContextEntries({ topic: 'task_pending_critic_approval' });

      expect(context.length).toBeGreaterThan(0);
      expect((context[0].metadata as Record<string, unknown>).taskId).toBe(taskId);
    });

    it('should handle multiple tasks independently', async () => {
      // Create two tasks with different critic requirements
      const task1Id = 'T12.0.1';
      const task2Id = 'T13.2.1';

      stateMachine.createTask({
        id: task1Id,
        title: 'T12 task',
        type: 'task',
        status: 'pending',
        estimated_complexity: 2,
      });

      stateMachine.createTask({
        id: task2Id,
        title: 'T13 task',
        type: 'task',
        status: 'pending',
        estimated_complexity: 3,
      });

      const policy = orchestrator['policy'];

      // Task 1: complete all critics
      policy.recordCriticResult(task1Id, 'modeling_reality_v2', true);
      policy.recordCriticResult(task1Id, 'data_quality', true);

      // Task 2: only partial critics
      policy.recordCriticResult(task2Id, 'modeling_reality_v2', true);

      const task1 = stateMachine.getTask(task1Id)!;
      const task2 = stateMachine.getTask(task2Id)!;

      await orchestrator['executeTask'](task1);
      await orchestrator['executeTask'](task2);

      const updated1 = stateMachine.getTask(task1Id)!;
      const updated2 = stateMachine.getTask(task2Id)!;

      expect(updated1.status).toBe('done'); // All critics passed
      expect(updated2.status).toBe('needs_improvement'); // Missing critics
    });
  });

  describe('Critic approval status tracking', () => {
    it('should track critic results in policy engine', () => {
      const taskId = 'T12.0.1';
      const policy = orchestrator['policy'];

      let status = policy.getCriticApprovalStatus(taskId);
      expect(status).toBeNull();

      policy.recordCriticResult(taskId, 'modeling_reality_v2', true);

      status = policy.getCriticApprovalStatus(taskId);
      expect(status).not.toBeNull();
      expect(status!.passedCritics.has('modeling_reality_v2')).toBe(true);
      expect(status!.allApproved).toBe(false); // Still need data_quality
    });

    it('should allow retrying failed critics', () => {
      const taskId = 'T12.0.1';
      const policy = orchestrator['policy'];

      policy.recordCriticResult(taskId, 'data_quality', false, 'initial failure');

      let status = policy.getCriticApprovalStatus(taskId);
      expect(status!.failedCritics.has('data_quality')).toBe(true);

      // Retry and pass
      policy.recordCriticResult(taskId, 'data_quality', true);

      status = policy.getCriticApprovalStatus(taskId);
      expect(status!.passedCritics.has('data_quality')).toBe(true);
      expect(status!.failedCritics.has('data_quality')).toBe(false);
    });
  });
});
