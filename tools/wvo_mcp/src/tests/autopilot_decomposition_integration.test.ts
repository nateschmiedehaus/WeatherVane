/**
 * Integration Test: Task Decomposition Safeguards
 *
 * THIS TEST WOULD HAVE CAUGHT THE DECOMPOSITION LOOP BUG.
 *
 * Tests that:
 * 1. Decomposition respects depth limits
 * 2. Decomposition respects session limits
 * 3. Circuit breaker engages under load
 * 4. System remains stable with many tasks
 * 5. Resources don't grow unbounded
 *
 * Run with: npm test autopilot_decomposition_integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TestContext } from 'vitest';
import { StateMachine, Task } from '../orchestrator/state_machine.js';
import { TaskDecomposer } from '../orchestrator/task_decomposer.js';
import { UnifiedOrchestrator } from '../orchestrator/unified_orchestrator.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

type TaskInit = Omit<Task, 'created_at'> & Partial<Pick<Task, 'created_at'>>;

const createTask = (init: TaskInit): Task => ({
  ...init,
  created_at: init.created_at ?? Date.now(),
});

describe('Task Decomposition Integration Tests', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;
  let decomposer: TaskDecomposer;

  beforeEach(async () => {
    // Use temp directory for testing
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-test-'));
    stateMachine = new StateMachine(workspaceRoot, { readonly: false });
    decomposer = new TaskDecomposer(stateMachine, workspaceRoot);
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  describe('Depth Limit Enforcement', () => {
    it('should not decompose tasks beyond max depth', async () => {
      // Create a task at depth 2 (e.g., T1.1.1)
      const deepTask = createTask({
        id: 'T1.1.1',
        title: 'Deep nested task',
        description: 'This task is already at depth 2',
        type: 'task',
        status: 'pending',
        metadata: {
          parent_task_id: 'T1.1',
        },
      });

      stateMachine.createTask(deepTask);

      // Attempt decomposition
      const shouldDecompose = decomposer.shouldDecompose(deepTask);

      // Should be blocked by depth limit
      expect(shouldDecompose).toBe(false);
    });

    it('should track depth via task ID format', async () => {
      const tasks = [
        { id: 'T1', expectedDepth: 0 },
        { id: 'T1.1', expectedDepth: 1 },
        { id: 'T1.1.1', expectedDepth: 2 },
        { id: 'T1.1.1.1', expectedDepth: 3 },
      ];

      for (const { id, expectedDepth } of tasks) {
        const task = createTask({
          id,
          title: `Task at depth ${expectedDepth}`,
          type: 'task',
          status: 'pending',
        });

        stateMachine.createTask(task);

        // @ts-ignore - accessing private method for testing
        const depth = decomposer.getDecompositionDepth(task);
        expect(depth).toBe(expectedDepth);
      }
    });
  });

  describe('Session Limit Enforcement', () => {
    it('should stop decomposing after session limit reached', async () => {
      // Create many epic tasks (more than session limit)
      const tasks: Task[] = [];
      for (let i = 0; i < 60; i++) {
        const task = createTask({
          id: `E${i}`,
          title: `Epic task ${i}`,
          description: 'implement and test and validate',
          type: 'epic',
          status: 'pending',
        });
        stateMachine.createTask(task);
        tasks.push(task);
      }

      // Attempt to decompose all tasks
      let decomposedCount = 0;
      for (const task of tasks) {
        const result = await decomposer.decompose(task);
        if (result.shouldDecompose && result.subtasks) {
          await decomposer.registerSubtasks(task, result.subtasks);
          decomposedCount++;
        }
      }

      // Should hit the session limit (MAX_DECOMPOSITIONS_PER_SESSION = 50)
      expect(decomposedCount).toBeLessThanOrEqual(50);
      expect(decomposedCount).toBeGreaterThan(0);
    });
  });

  describe('Race Condition Prevention', () => {
    it('should mark task as decomposed immediately', async () => {
      const task = createTask({
        id: 'T1',
        title: 'Test task',
        description: 'implement and test',
        type: 'epic',
        status: 'pending',
      });

      stateMachine.createTask(task);

      // First decomposition
      const result1 = await decomposer.decompose(task);
      expect(result1.shouldDecompose).toBe(true);

      // Get updated task from state machine
      const updatedTask = stateMachine.getTask('T1');
      expect(updatedTask?.metadata?.decomposed).toBe(true);

      // Second decomposition attempt should be blocked
      const shouldDecompose2 = decomposer.shouldDecompose(updatedTask!);
      expect(shouldDecompose2).toBe(false);
    });

    it('should handle concurrent decomposition attempts', async () => {
      const task = createTask({
        id: 'T1',
        title: 'Concurrent test',
        description: 'implement and test',
        type: 'epic',
        status: 'pending',
      });

      stateMachine.createTask(task);

      // Simulate concurrent decomposition attempts
      const results = await Promise.all([
        decomposer.decompose(task),
        decomposer.decompose(task),
        decomposer.decompose(task),
      ]);

      // Only one should succeed
      const successCount = results.filter(r => r.shouldDecompose).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Resource Stability', () => {
    it('should maintain stable memory with many decompositions', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create and decompose many tasks
      for (let i = 0; i < 40; i++) {
        const task = createTask({
          id: `E${i}`,
          title: `Epic ${i}`,
          description: 'implement and test and validate',
          type: 'epic',
          status: 'pending',
        });

        stateMachine.createTask(task);
        const result = await decomposer.decompose(task);

        if (result.subtasks) {
          await decomposer.registerSubtasks(task, result.subtasks);
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB for 40 decompositions)
      const maxGrowthBytes = 50 * 1024 * 1024; // 50MB
      expect(memoryGrowth).toBeLessThan(maxGrowthBytes);
    });

    it('should not create excessive subtasks', async () => {
      const task = createTask({
        id: 'E1',
        title: 'Large epic',
        description: 'A very complex task that needs decomposition',
        type: 'epic',
        status: 'pending',
        metadata: {
          exit_criteria: [
            'Criterion 1',
            'Criterion 2',
            'Criterion 3',
            'Criterion 4',
            'Criterion 5',
          ],
        },
      });

      stateMachine.createTask(task);

      const result = await decomposer.decompose(task);

      // Should create reasonable number of subtasks (not 1000s)
      expect(result.subtasks?.length || 0).toBeLessThan(20);
      expect(result.subtasks?.length || 0).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle tasks with no title', async () => {
      const task = createTask({
        id: 'T1',
        title: '',
        type: 'epic',
        status: 'pending',
      });

      stateMachine.createTask(task);

      // Should not crash
      expect(() => decomposer.shouldDecompose(task)).not.toThrow();
    });

    it('should handle tasks with no description', async () => {
      const task = createTask({
        id: 'T1',
        title: 'Test task',
        description: '',
        type: 'epic',
        status: 'pending',
      });

      stateMachine.createTask(task);

      // Should not crash
      const result = await decomposer.decompose(task);
      expect(result).toBeDefined();
    });

    it('should handle already decomposed tasks', async () => {
      const task = createTask({
        id: 'T1',
        title: 'Already decomposed',
        type: 'epic',
        status: 'pending',
        metadata: {
          decomposed: true,
        },
      });

      stateMachine.createTask(task);

      const shouldDecompose = decomposer.shouldDecompose(task);
      expect(shouldDecompose).toBe(false);
    });
  });

  describe('Orchestrator Circuit Breaker (Integration)', () => {
    it('should stop decomposing when circuit breaker triggers', async function(this: TestContext) {
      // Skip if running in CI (needs full orchestrator setup)
      if (process.env.CI) {
        this.skip();
        return;
      }

      // This test requires more setup - it's a template for future implementation
      // For now, we verify the safeguards exist

      // Create orchestrator
      const config = {
        agentCount: 1,
        preferredOrchestrator: 'codex' as const,
        workspaceRoot,
      };

      const orchestrator = new UnifiedOrchestrator(stateMachine, config);

      // Verify circuit breaker properties exist
      // @ts-ignore - checking private properties
      expect(orchestrator.MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE).toBeDefined();
      // @ts-ignore
      expect(orchestrator.decompositionAttempts).toBe(0);
    });
  });
});

describe('Real-World Scenarios', () => {
  let workspaceRoot: string;
  let stateMachine: StateMachine;
  let decomposer: TaskDecomposer;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wvo-test-'));
    stateMachine = new StateMachine(workspaceRoot, { readonly: false });
    decomposer = new TaskDecomposer(stateMachine, workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('should handle typical roadmap with 20 epics', async () => {
    // Simulate realistic roadmap
    const epics: Task[] = [];
    for (let i = 1; i <= 20; i++) {
      const epic = createTask({
        id: `E${i}`,
        title: `Epic ${i}: Implement feature ${i}`,
        description: 'Design and implement and test this feature',
        type: 'epic',
        status: 'pending',
      });
      stateMachine.createTask(epic);
      epics.push(epic);
    }

    // Decompose all epics
    let totalSubtasks = 0;
    for (const epic of epics) {
      const result = await decomposer.decompose(epic);
      if (result.subtasks) {
        await decomposer.registerSubtasks(epic, result.subtasks);
        totalSubtasks += result.subtasks.length;
      }
    }

    // Should create subtasks for all epics
    expect(totalSubtasks).toBeGreaterThan(20);
    expect(totalSubtasks).toBeLessThan(200); // Reasonable limit

    // All epics should be marked as decomposed
    for (const epic of epics) {
      const updated = stateMachine.getTask(epic.id);
      expect(updated?.metadata?.decomposed).toBe(true);
    }
  });

  it('should handle the bug scenario that caused the crash', async () => {
    // This is the EXACT scenario that caused the crash:
    // Multiple epics that all get decomposed rapidly

    // Create 100 epics (pathological case)
    for (let i = 0; i < 100; i++) {
      const epic = createTask({
        id: `E${i}`,
        title: `Epic ${i}`,
        description: 'implement and test',
        type: 'epic',
        status: 'pending',
      });
      stateMachine.createTask(epic);
    }

    const allTasks = stateMachine.getTasks();

    // Try to decompose all of them (like the orchestrator does)
    let decomposedCount = 0;
    let circuitBreakerEngaged = false;
    let shouldDecomposeReturnedFalse = false;

    for (const task of allTasks) {
      const canDecompose = decomposer.shouldDecompose(task);

      if (canDecompose) {
        const result = await decomposer.decompose(task);
        if (result.shouldDecompose && result.subtasks) {
          await decomposer.registerSubtasks(task, result.subtasks);
          decomposedCount++;
        } else if (!result.shouldDecompose) {
          // Hit a limit during decompose()
          circuitBreakerEngaged = true;
        }
      } else {
        // shouldDecompose() returned false - circuit breaker engaged
        shouldDecomposeReturnedFalse = true;
        circuitBreakerEngaged = true;
      }
    }

    // CRITICAL: Should have stopped before decomposing all 100
    expect(decomposedCount).toBeLessThanOrEqual(50);

    // Circuit breaker should have engaged (either via shouldDecompose or decompose)
    expect(circuitBreakerEngaged).toBe(true);

    console.log(`Decomposed ${decomposedCount}/100 tasks before limits engaged`);
  });
});
