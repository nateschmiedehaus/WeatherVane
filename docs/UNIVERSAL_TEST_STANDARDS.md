# Universal Test Standards - ALL Tests Must Meet These

## The Problem

Tests often check only the "happy path" - they verify code works when everything goes right. But bugs happen when:
- Inputs are invalid
- Resources are constrained
- Timing is wrong
- Concurrency creates races
- Boundaries are crossed

**Shallow tests give false confidence.** The decomposition loop bug passed all checks because no test actually stressed the system.

## The Solution: 7-Dimension Test Coverage

Every test - whether unit, integration, or end-to-end - MUST cover these dimensions:

### 1. Happy Path (Expected Behavior)
✅ **What to test:**
- Normal inputs produce expected outputs
- Typical use cases work correctly
- Common scenarios succeed

❌ **Not enough:**
```typescript
it('should decompose tasks', () => {
  const result = decomposer.decompose(task);
  expect(result).toBeDefined(); // TOO SHALLOW
});
```

✅ **Thorough version:**
```typescript
it('should decompose epic into subtasks with correct structure', () => {
  const epic = createEpicTask('E1', 'Implement feature');
  const result = decomposer.decompose(epic);

  expect(result.shouldDecompose).toBe(true);
  expect(result.subtasks).toHaveLength(3);
  expect(result.subtasks[0].id).toBe('E1.1');
  expect(result.subtasks[0].parent_task_id).toBe('E1');
  expect(result.subtasks[0].status).toBe('pending');
  expect(result.dependencies.get('E1.2')).toContain('E1.1');
});
```

### 2. Edge Cases (Boundary Conditions)
✅ **What to test:**
- Zero, negative, extremely large values
- Empty strings, null, undefined
- First/last items in collections
- Minimum/maximum limits

❌ **Not enough:**
```typescript
it('should handle worker count', () => {
  const limits = deriveResourceLimits({ recommended_concurrency: 4 });
  expect(limits.codexWorkers).toBeGreaterThan(0);
});
```

✅ **Thorough version:**
```typescript
describe('worker count edge cases', () => {
  it('should handle zero concurrency', () => {
    const limits = deriveResourceLimits({ recommended_concurrency: 0 });
    expect(limits.codexWorkers).toBe(2); // Minimum fallback
  });

  it('should handle negative concurrency', () => {
    const limits = deriveResourceLimits({ recommended_concurrency: -5 });
    expect(limits.codexWorkers).toBeGreaterThan(0);
  });

  it('should handle extremely large concurrency', () => {
    const limits = deriveResourceLimits({ recommended_concurrency: 10000 });
    expect(limits.codexWorkers).toBeLessThan(100); // Reasonable cap
  });

  it('should handle null profile', () => {
    const limits = deriveResourceLimits(null);
    expect(limits.codexWorkers).toBeGreaterThan(0);
  });

  it('should handle undefined profile', () => {
    const limits = deriveResourceLimits(undefined);
    expect(limits.codexWorkers).toBeGreaterThan(0);
  });
});
```

### 3. Error Cases (Failure Modes)
✅ **What to test:**
- Invalid inputs throw appropriate errors
- Errors contain helpful messages
- System remains stable after errors
- Resources are cleaned up on failure

❌ **Not enough:**
```typescript
it('should handle errors', () => {
  expect(() => decompose(null)).toThrow();
});
```

✅ **Thorough version:**
```typescript
describe('error handling', () => {
  it('should throw descriptive error for null task', () => {
    expect(() => decomposer.decompose(null))
      .toThrow('Task cannot be null');
  });

  it('should throw descriptive error for invalid task ID', () => {
    const task = { id: '', title: 'Test' };
    expect(() => decomposer.decompose(task))
      .toThrow(/invalid task id/i);
  });

  it('should not crash on malformed task', () => {
    const task = { id: 'T1', title: null, metadata: 'not-an-object' };
    // Should either handle gracefully or throw descriptive error
    expect(() => decomposer.decompose(task)).not.toThrow(/undefined/);
  });

  it('should clean up resources after error', () => {
    const initialCount = getActiveDecompositions();

    try {
      decomposer.decompose(invalidTask);
    } catch (e) {
      // Ignore error
    }

    const finalCount = getActiveDecompositions();
    expect(finalCount).toBe(initialCount); // No leaks
  });
});
```

### 4. Concurrency & Race Conditions
✅ **What to test:**
- Concurrent operations don't interfere
- Shared state is protected
- Race conditions are prevented
- Locks/mutexes work correctly

❌ **Not enough:**
```typescript
it('should handle multiple tasks', () => {
  decomposer.decompose(task1);
  decomposer.decompose(task2);
  // No assertions about concurrent behavior
});
```

✅ **Thorough version:**
```typescript
describe('concurrency safety', () => {
  it('should handle concurrent decomposition attempts', async () => {
    const task = createTask('T1');

    // Attempt to decompose same task simultaneously
    const results = await Promise.all([
      decomposer.decompose(task),
      decomposer.decompose(task),
      decomposer.decompose(task),
    ]);

    // Only one should succeed
    const successCount = results.filter(r => r.shouldDecompose).length;
    expect(successCount).toBe(1);
  });

  it('should maintain consistency under concurrent load', async () => {
    const tasks = Array(100).fill(null).map((_, i) => createTask(`T${i}`));

    // Decompose all concurrently
    await Promise.all(tasks.map(t => decomposer.decompose(t)));

    // Check state is consistent
    const allTasks = stateMachine.getTasks();
    const decomposedTasks = allTasks.filter(t => t.metadata?.decomposed);

    // Every task should be decomposed exactly once
    expect(decomposedTasks.length).toBe(tasks.length);
  });

  it('should not deadlock with circular dependencies', async () => {
    // Create tasks with circular dependencies
    const t1 = createTask('T1', { depends_on: ['T2'] });
    const t2 = createTask('T2', { depends_on: ['T1'] });

    // Should complete (not hang)
    await Promise.race([
      Promise.all([decomposer.decompose(t1), decomposer.decompose(t2)]),
      new Promise((_, reject) => setTimeout(() => reject('timeout'), 1000)),
    ]);
  });
});
```

### 5. Resource Constraints
✅ **What to test:**
- Memory usage stays bounded
- No resource leaks
- Handles resource exhaustion gracefully
- Cleans up properly

❌ **Not enough:**
```typescript
it('should process many tasks', () => {
  for (let i = 0; i < 1000; i++) {
    decomposer.decompose(createTask(`T${i}`));
  }
  // No memory checks
});
```

✅ **Thorough version:**
```typescript
describe('resource management', () => {
  it('should not leak memory with many decompositions', () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      const task = createTask(`T${i}`);
      decomposer.decompose(task);
    }

    // Force garbage collection if available
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = finalMemory - initialMemory;

    // Memory growth should be reasonable (< 10MB for 100 tasks)
    expect(growth).toBeLessThan(10 * 1024 * 1024);
  });

  it('should handle memory exhaustion gracefully', () => {
    // Create pathologically large task
    const hugeTask = createTask('T1', {
      description: 'x'.repeat(10 * 1024 * 1024), // 10MB string
    });

    // Should either work or fail gracefully (not crash)
    expect(() => decomposer.decompose(hugeTask)).not.toThrow(/heap/i);
  });

  it('should clean up resources on completion', () => {
    const task = createTask('T1');
    const result = decomposer.decompose(task);

    // Internal caches/buffers should be released
    // @ts-ignore - check internal state
    expect(decomposer.activeDecompositions.size).toBe(0);
  });
});
```

### 6. State & Side Effects
✅ **What to test:**
- Functions don't modify inputs unexpectedly
- Side effects are documented and verified
- State changes are isolated
- Idempotency where expected

❌ **Not enough:**
```typescript
it('should update task status', () => {
  const task = createTask('T1');
  decomposer.decompose(task);
  // Don't check if original task was modified
});
```

✅ **Thorough version:**
```typescript
describe('state management', () => {
  it('should not modify original task object', () => {
    const task = createTask('T1');
    const original = JSON.stringify(task);

    decomposer.decompose(task);

    const afterDecompose = JSON.stringify(task);
    expect(afterDecompose).toBe(original); // Immutability
  });

  it('should update state machine atomically', () => {
    const task = createTask('T1');
    const initialVersion = stateMachine.getVersion();

    decomposer.decompose(task);

    const finalVersion = stateMachine.getVersion();
    expect(finalVersion).toBe(initialVersion + 1); // Single transaction
  });

  it('should be idempotent for already decomposed tasks', () => {
    const task = createTask('T1');

    const result1 = decomposer.decompose(task);
    const result2 = decomposer.decompose(task);

    expect(result1).toEqual(result2);

    // State should be identical
    const subtasks1 = stateMachine.getSubtasks('T1');
    const subtasks2 = stateMachine.getSubtasks('T1');
    expect(subtasks1).toEqual(subtasks2);
  });
});
```

### 7. Integration & Real Data
✅ **What to test:**
- Works with real-world data patterns
- Integrates correctly with dependencies
- Handles data from actual sources
- Performance with realistic volumes

❌ **Not enough:**
```typescript
it('should process tasks', () => {
  const task = { id: 'T1', title: 'Test' };
  decomposer.decompose(task);
});
```

✅ **Thorough version:**
```typescript
describe('real-world integration', () => {
  it('should handle tasks from actual roadmap file', async () => {
    const roadmap = await loadRoadmap('state/roadmap.yaml');
    const epicTasks = roadmap.tasks.filter(t => t.type === 'epic');

    for (const epic of epicTasks) {
      const result = decomposer.decompose(epic);

      if (result.shouldDecompose) {
        expect(result.subtasks).toBeDefined();
        expect(result.subtasks.length).toBeGreaterThan(0);
        expect(result.subtasks.length).toBeLessThan(20); // Reasonable
      }
    }
  });

  it('should handle realistic task descriptions', () => {
    const descriptions = [
      'Implement user authentication and authorization',
      'Design, implement, and test the payment flow',
      '', // Empty
      'A'.repeat(10000), // Very long
      'Task with\nnewlines\nand\ttabs',
      'Task with emoji 🚀 and unicode ñ',
    ];

    for (const desc of descriptions) {
      const task = createTask('T1', { description: desc });
      expect(() => decomposer.decompose(task)).not.toThrow();
    }
  });

  it('should maintain performance with realistic volumes', () => {
    // Load actual historical data
    const historicalTasks = loadHistoricalTasks(); // e.g., 500 tasks

    const startTime = Date.now();

    for (const task of historicalTasks) {
      if (decomposer.shouldDecompose(task)) {
        decomposer.decompose(task);
      }
    }

    const duration = Date.now() - startTime;

    // Should process 500 tasks in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000);
  });
});
```

## Test Quality Checklist

Before marking a test as "complete", verify:

- [ ] **Happy path**: Normal case works
- [ ] **Edge cases**: 0, null, undefined, empty, max, min
- [ ] **Error cases**: Invalid inputs fail appropriately
- [ ] **Concurrency**: No race conditions
- [ ] **Resources**: No leaks, bounded growth
- [ ] **State**: Side effects documented and verified
- [ ] **Integration**: Works with real data

**If even ONE checkbox is empty, the test is incomplete.**

## Examples: Before & After

### Example 1: Shallow → Thorough

**Before (Shallow):**
```typescript
describe('TaskDecomposer', () => {
  it('should decompose tasks', () => {
    const decomposer = new TaskDecomposer(stateMachine, '/tmp');
    const task = { id: 'T1', type: 'epic' };
    const result = decomposer.decompose(task);
    expect(result).toBeDefined();
  });
});
```

**After (Thorough):**
```typescript
describe('TaskDecomposer', () => {
  describe('Happy Path', () => {
    it('should decompose epic into correct subtasks', () => {
      const epic = createEpicTask({
        id: 'E1',
        title: 'Implement authentication',
        description: 'Design and implement and test auth flow',
      });

      const result = decomposer.decompose(epic);

      expect(result.shouldDecompose).toBe(true);
      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks[0].id).toBe('E1.1');
      expect(result.subtasks[0].title).toContain('Design');
      expect(result.subtasks[1].dependencies).toContain('E1.1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle task at max depth', () => {
      const deepTask = createTask('T1.1.1.1.1');
      const result = decomposer.shouldDecompose(deepTask);
      expect(result).toBe(false);
    });

    it('should handle task with no title', () => {
      const task = createTask('T1', { title: '' });
      expect(() => decomposer.decompose(task)).not.toThrow();
    });

    it('should handle task with null metadata', () => {
      const task = createTask('T1', { metadata: null });
      expect(() => decomposer.decompose(task)).not.toThrow();
    });
  });

  describe('Error Cases', () => {
    it('should reject null task', () => {
      expect(() => decomposer.decompose(null))
        .toThrow(/task cannot be null/i);
    });

    it('should reject invalid task ID', () => {
      const task = createTask('');
      expect(() => decomposer.decompose(task))
        .toThrow(/invalid.*id/i);
    });
  });

  describe('Concurrency', () => {
    it('should prevent duplicate decomposition', async () => {
      const task = createTask('T1');
      const results = await Promise.all([
        decomposer.decompose(task),
        decomposer.decompose(task),
      ]);

      const successCount = results.filter(r => r.shouldDecompose).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Resources', () => {
    it('should not leak memory with 100 decompositions', () => {
      const before = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        decomposer.decompose(createEpicTask(`E${i}`));
      }

      if (global.gc) global.gc();
      const after = process.memoryUsage().heapUsed;

      expect(after - before).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('State Management', () => {
    it('should mark task as decomposed immediately', () => {
      const task = createTask('T1');
      decomposer.decompose(task);

      const updated = stateMachine.getTask('T1');
      expect(updated.metadata.decomposed).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should handle realistic epic from roadmap', () => {
      const epic = {
        id: 'E1',
        title: 'Implement OAuth integration',
        description: 'Research providers, implement flow, test with real users',
        type: 'epic',
        status: 'pending',
      };

      const result = decomposer.decompose(epic);

      expect(result.shouldDecompose).toBe(true);
      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.subtasks.length).toBeLessThan(10);
    });
  });
});
```

### Example 2: Resource Limits

**Before (Shallow):**
```typescript
it('should respect worker limits', () => {
  const limits = deriveResourceLimits({ recommended_concurrency: 4 });
  expect(limits.codexWorkers).toBeGreaterThan(0);
});
```

**After (Thorough):**
```typescript
describe('deriveResourceLimits', () => {
  describe('Happy Path', () => {
    it('should scale workers with concurrency', () => {
      const profile = { recommended_concurrency: 8 };
      const limits = deriveResourceLimits(profile);

      expect(limits.codexWorkers).toBeGreaterThanOrEqual(4);
      expect(limits.codexWorkers).toBeLessThanOrEqual(16);
      expect(limits.heavyTaskConcurrency).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    const cases = [
      { input: 0, name: 'zero concurrency' },
      { input: -1, name: 'negative concurrency' },
      { input: 1, name: 'minimum concurrency' },
      { input: 1000, name: 'excessive concurrency' },
      { input: null, name: 'null profile' },
      { input: undefined, name: 'undefined profile' },
    ];

    cases.forEach(({ input, name }) => {
      it(`should handle ${name}`, () => {
        const profile = input === null || input === undefined
          ? input
          : { recommended_concurrency: input };

        const limits = deriveResourceLimits(profile);

        expect(limits.codexWorkers).toBeGreaterThan(0);
        expect(limits.codexWorkers).toBeLessThan(100);
        expect(limits.heavyTaskConcurrency).toBeGreaterThan(0);
      });
    });
  });

  describe('Environment Overrides', () => {
    beforeEach(() => {
      delete process.env.WVO_CODEX_WORKERS;
      delete process.env.WVO_HEAVY_TASK_CONCURRENCY;
    });

    it('should respect WVO_CODEX_WORKERS', () => {
      process.env.WVO_CODEX_WORKERS = '7';
      const limits = deriveResourceLimits({ recommended_concurrency: 4 });
      expect(limits.codexWorkers).toBe(7);
    });

    it('should handle invalid WVO_CODEX_WORKERS', () => {
      process.env.WVO_CODEX_WORKERS = 'invalid';
      const limits = deriveResourceLimits({ recommended_concurrency: 4 });
      expect(limits.codexWorkers).toBeGreaterThan(0); // Falls back
    });

    it('should handle negative WVO_CODEX_WORKERS', () => {
      process.env.WVO_CODEX_WORKERS = '-5';
      const limits = deriveResourceLimits({ recommended_concurrency: 4 });
      expect(limits.codexWorkers).toBeGreaterThan(0);
    });
  });

  describe('Resource Safety', () => {
    it('should cap workers to prevent resource exhaustion', () => {
      const profile = { recommended_concurrency: 10000 };
      const limits = deriveResourceLimits(profile);

      // Should have reasonable cap (system-dependent, but not 5000)
      expect(limits.codexWorkers).toBeLessThan(100);
    });

    it('should ensure minimum viable workers', () => {
      const profile = { recommended_concurrency: 0 };
      const limits = deriveResourceLimits(profile);

      // Always at least 2 workers for progress
      expect(limits.codexWorkers).toBeGreaterThanOrEqual(2);
    });
  });
});
```

## Enforcement

### 1. Test Coverage Tool
```bash
npm run test:coverage
# Must show 80%+ coverage AND all 7 dimensions tested
```

### 2. Test Quality Linter
```bash
npm run lint:tests
# Flags tests that only cover happy path
```

### 3. Pre-Commit Hook
Already installed - blocks commits with shallow tests.

### 4. Code Review Checklist
Every PR must answer:
- [ ] Are all 7 dimensions covered?
- [ ] Are edge cases tested?
- [ ] Are error cases tested?
- [ ] Is concurrency tested?
- [ ] Are resources tested?
- [ ] Is state tested?
- [ ] Is integration tested?

## Measuring Test Quality

**Test quality score = Dimensions covered / 7**

- 7/7 = Excellent (required for critical paths)
- 5-6/7 = Good (acceptable for utilities)
- 3-4/7 = Needs improvement
- 1-2/7 = Shallow (REJECT)

## The Bottom Line

**Thorough testing catches bugs. Shallow testing creates false confidence.**

The decomposition loop bug would have been caught by:
- ✅ Resource tests (memory growth)
- ✅ Concurrency tests (runaway loops)
- ✅ Integration tests (realistic volumes)
- ✅ Edge case tests (depth limits)

All tests - even basic unit tests - must be thorough.

**No exceptions.**
