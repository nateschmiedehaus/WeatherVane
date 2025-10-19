/**
 * Tests for LoopDetector
 *
 * Validates all three loop detection patterns and recovery actions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopDetector } from '../orchestrator/loop_detector.js';
import type { StateMachine } from '../orchestrator/state_machine.js';

// Mock StateMachine
const createMockStateMachine = (): StateMachine => {
  const tasks = new Map();
  const contextEntries: any[] = [];

  return {
    getTask: vi.fn((id: string) => tasks.get(id)),
    transition: vi.fn(async (id: string, status: string, metadata?: any) => {
      const task = tasks.get(id) || { id, status: 'pending' };
      task.status = status;
      task.metadata = metadata;
      tasks.set(id, task);
    }),
    addContextEntry: vi.fn((entry: any) => {
      contextEntries.push(entry);
    }),
    _tasks: tasks,
    _contextEntries: contextEntries,
  } as any;
};

describe('LoopDetector', () => {
  let stateMachine: StateMachine;
  let loopDetector: LoopDetector;

  beforeEach(() => {
    stateMachine = createMockStateMachine();
    loopDetector = new LoopDetector(stateMachine, {
      maxAttempts: 3,
      attemptWindow: 3600000, // 1 hour
      enableAutoUnblock: true,
      maxAttemptsBeforeForceNext: 5,
    });
  });

  describe('Pattern 1: Completed Task Revisit', () => {
    it('should detect when autopilot revisits a completed task', () => {
      // Simulate 4 attempts on a completed task
      for (let i = 0; i < 4; i++) {
        loopDetector.recordAttempt(
          'T3.4.2',
          'done',
          [],
          ['Implemented dashboard.tsx', 'Added tests'],
          `session_${i}`
        );
      }

      const result = loopDetector.detectLoop('T3.4.2');

      expect(result.isLooping).toBe(true);
      expect(result.loopType).toBe('completed_task_revisit');
      expect(result.taskId).toBe('T3.4.2');
      expect(result.attemptCount).toBe(4);
      expect(result.recommendation).toBe('force_next');
      expect(result.evidence).toHaveLength(3); // Last 3 attempts
    });

    it('should not detect loop with only 2 attempts', () => {
      for (let i = 0; i < 2; i++) {
        loopDetector.recordAttempt(
          'T3.4.2',
          'done',
          [],
          ['Work done'],
          `session_${i}`
        );
      }

      const result = loopDetector.detectLoop('T3.4.2');

      expect(result.isLooping).toBe(false);
      expect(result.loopType).toBe('none');
    });

    it('should not detect loop if status changes between attempts', () => {
      loopDetector.recordAttempt('T3.4.2', 'in_progress', [], [], 'session_1');
      loopDetector.recordAttempt('T3.4.2', 'done', [], ['Work'], 'session_2');
      loopDetector.recordAttempt('T3.4.2', 'done', [], ['Work'], 'session_3');

      const result = loopDetector.detectLoop('T3.4.2');

      // Not all attempts have same status, so no loop
      expect(result.isLooping).toBe(false);
    });
  });

  describe('Pattern 2: Blocked Task Spin', () => {
    it('should detect when task spins on same blockers', () => {
      const blockers = ['critic:design_system unavailable', 'missing auth'];

      for (let i = 0; i < 3; i++) {
        loopDetector.recordAttempt(
          'T3.4.3',
          'blocked',
          blockers,
          [],
          `session_${i}`
        );
      }

      const result = loopDetector.detectLoop('T3.4.3');

      expect(result.isLooping).toBe(true);
      expect(result.loopType).toBe('blocked_task_spin');
      expect(result.taskId).toBe('T3.4.3');
      expect(result.attemptCount).toBe(3);
      expect(result.recommendation).toBe('unblock_authority');
    });

    it('should not detect loop if blockers change', () => {
      loopDetector.recordAttempt('T3.4.3', 'blocked', ['blocker A'], [], 'session_1');
      loopDetector.recordAttempt('T3.4.3', 'blocked', ['blocker B'], [], 'session_2');
      loopDetector.recordAttempt('T3.4.3', 'blocked', ['blocker C'], [], 'session_3');

      const result = loopDetector.detectLoop('T3.4.3');

      // Blockers are different, so progress is being made
      expect(result.isLooping).toBe(false);
    });

    it('should escalate instead of unblock when auto-unblock disabled', () => {
      const noAutoUnblock = new LoopDetector(stateMachine, {
        enableAutoUnblock: false,
      });

      const blockers = ['critic:design_system unavailable'];
      for (let i = 0; i < 3; i++) {
        noAutoUnblock.recordAttempt(
          'T3.4.3',
          'blocked',
          blockers,
          [],
          `session_${i}`
        );
      }

      const result = noAutoUnblock.detectLoop('T3.4.3');

      expect(result.recommendation).toBe('escalate');
    });
  });

  describe('Pattern 3: No Progress Repeat', () => {
    it('should detect when same work is repeated', () => {
      const work = ['Read config.yaml', 'Parse dependencies'];

      for (let i = 0; i < 5; i++) {
        loopDetector.recordAttempt(
          'T7.1.2',
          'in_progress',
          [],
          work,
          `session_${i}`
        );
      }

      const result = loopDetector.detectLoop('T7.1.2');

      expect(result.isLooping).toBe(true);
      expect(result.loopType).toBe('no_progress_repeat');
      expect(result.attemptCount).toBe(5);
      expect(result.recommendation).toBe('force_next'); // After 5 attempts
    });

    it('should escalate before maxAttemptsBeforeForceNext', () => {
      const work = ['Same work'];

      for (let i = 0; i < 3; i++) {
        loopDetector.recordAttempt(
          'T7.1.2',
          'in_progress',
          [],
          work,
          `session_${i}`
        );
      }

      const result = loopDetector.detectLoop('T7.1.2');

      expect(result.isLooping).toBe(true);
      expect(result.recommendation).toBe('escalate'); // Only 3 attempts, not 5 yet
    });

    it('should not detect loop if work progresses', () => {
      loopDetector.recordAttempt('T7.1.2', 'in_progress', [], ['Work A'], 'session_1');
      loopDetector.recordAttempt('T7.1.2', 'in_progress', [], ['Work A', 'Work B'], 'session_2');
      loopDetector.recordAttempt('T7.1.2', 'in_progress', [], ['Work A', 'Work B', 'Work C'], 'session_3');

      const result = loopDetector.detectLoop('T7.1.2');

      // Work is progressing, so no loop
      expect(result.isLooping).toBe(false);
    });
  });

  describe('Recovery: Force Next', () => {
    it('should mark task as done and add directive', async () => {
      // Setup: completed task loop
      for (let i = 0; i < 4; i++) {
        loopDetector.recordAttempt('T3.4.2', 'done', [], ['Work'], `session_${i}`);
      }

      const result = loopDetector.detectLoop('T3.4.2');
      await loopDetector.applyRecovery(result);

      // Should add context entry with force_next directive
      const contextEntries = (stateMachine as any)._contextEntries;
      const directive = contextEntries.find((e: any) =>
        e.topic === 'loop_recovery_directive'
      );

      expect(directive).toBeDefined();
      expect(directive.content).toContain('DO NOT revisit this task');
      expect(directive.content).toContain('SELECT NEXT TASK');
      expect(directive.metadata.directive).toBe('force_next');
    });

    it('should clear attempt history after recovery', async () => {
      for (let i = 0; i < 4; i++) {
        loopDetector.recordAttempt('T3.4.2', 'done', [], ['Work'], `session_${i}`);
      }

      const result = loopDetector.detectLoop('T3.4.2');
      await loopDetector.applyRecovery(result);

      // Attempts should be cleared
      const status = loopDetector.getStatus();
      expect(status['T3.4.2']).toBeUndefined();
    });
  });

  describe('Recovery: Unblock Authority', () => {
    it('should grant unblock authority with explicit permissions', async () => {
      const blockers = ['critic:design_system unavailable', 'missing token'];

      for (let i = 0; i < 3; i++) {
        loopDetector.recordAttempt('T3.4.3', 'blocked', blockers, [], `session_${i}`);
      }

      const result = loopDetector.detectLoop('T3.4.3');
      await loopDetector.applyRecovery(result);

      const contextEntries = (stateMachine as any)._contextEntries;
      const authority = contextEntries.find((e: any) =>
        e.topic === 'unblock_authority'
      );

      expect(authority).toBeDefined();
      expect(authority.content).toContain('UNBLOCK AUTHORITY GRANTED');
      expect(authority.content).toContain('FULL AUTHORITY');
      expect(authority.content).toContain('Make necessary architectural changes');
      expect(authority.content).toContain('Skip unavailable dependencies');
      expect(authority.metadata.directive).toBe('unblock_authority');
      expect(authority.metadata.blockers).toEqual(blockers);
    });
  });

  describe('Recovery: Escalate', () => {
    it('should escalate and mark task as blocked', async () => {
      // Disable auto-unblock to force escalation
      const escalatingDetector = new LoopDetector(stateMachine, {
        enableAutoUnblock: false,
      });

      const blockers = ['persistent blocker'];
      for (let i = 0; i < 3; i++) {
        escalatingDetector.recordAttempt('T6.2.3', 'blocked', blockers, [], `session_${i}`);
      }

      const result = escalatingDetector.detectLoop('T6.2.3');
      await escalatingDetector.applyRecovery(result);

      // Should add escalation entry
      const contextEntries = (stateMachine as any)._contextEntries;
      const escalation = contextEntries.find((e: any) =>
        e.topic === 'loop_escalation'
      );

      expect(escalation).toBeDefined();
      expect(escalation.content).toContain('ESCALATION');
      expect(escalation.content).toContain('Human intervention required');

      // Should mark task as blocked
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'T6.2.3',
        'blocked',
        expect.objectContaining({
          reason: 'escalated_after_loop',
          loopAttempts: 3,
        })
      );
    });
  });

  describe('Status and Observability', () => {
    it('should track attempt counts per task', () => {
      loopDetector.recordAttempt('T1', 'in_progress', [], [], 'session_1');
      loopDetector.recordAttempt('T1', 'in_progress', [], [], 'session_2');
      loopDetector.recordAttempt('T2', 'blocked', ['blocker'], [], 'session_3');

      const status = loopDetector.getStatus();

      expect(status['T1']).toBeDefined();
      expect(status['T1'].attemptCount).toBe(2);
      expect(status['T2']).toBeDefined();
      expect(status['T2'].attemptCount).toBe(1);
    });

    it('should clean old attempts outside time window', () => {
      const oldTimestamp = Date.now() - 7200000; // 2 hours ago
      const detector = new LoopDetector(stateMachine, {
        attemptWindow: 3600000, // 1 hour window
      });

      // Manually add old attempt
      (detector as any).attempts.set('T1', [
        {
          taskId: 'T1',
          timestamp: oldTimestamp,
          status: 'in_progress',
          blockers: [],
          completedWork: [],
          sessionId: 'old_session',
        },
      ]);

      // Add new attempt - should clean old one
      detector.recordAttempt('T1', 'in_progress', [], [], 'new_session');

      const status = detector.getStatus();
      expect(status['T1'].attemptCount).toBe(1); // Only new attempt
    });
  });

  describe('Edge Cases', () => {
    it('should handle null currentTaskId', () => {
      const result = loopDetector.detectLoop(null);

      expect(result.isLooping).toBe(false);
      expect(result.loopType).toBe('none');
    });

    it('should handle task with no attempts', () => {
      const result = loopDetector.detectLoop('never_attempted_task');

      expect(result.isLooping).toBe(false);
      expect(result.loopType).toBe('none');
    });

    it('should handle empty blockers array', () => {
      for (let i = 0; i < 3; i++) {
        loopDetector.recordAttempt('T1', 'blocked', [], [], `session_${i}`);
      }

      const result = loopDetector.detectLoop('T1');

      // Empty blockers don't count as blocked_task_spin
      expect(result.loopType).not.toBe('blocked_task_spin');
    });

    it('should clear all attempts', () => {
      loopDetector.recordAttempt('T1', 'in_progress', [], [], 'session_1');
      loopDetector.recordAttempt('T2', 'blocked', ['b'], [], 'session_2');

      loopDetector.clear();

      const status = loopDetector.getStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });
  });
});
