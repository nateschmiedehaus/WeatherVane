# Mandatory Test Protocol - NO EXCEPTIONS

## The Problem

Agents claim features are "tested" without actually running them end-to-end. Unit tests pass, but critical bugs (like the decomposition loop crash) slip through because **no one actually ran the damn thing**.

## The Solution: Automated Test Gates That Block Deployment

### 1. Pre-Commit Test Hook (Enforced)

**Location:** `.git/hooks/pre-commit`

```bash
#!/bin/bash
# MANDATORY: Runs before EVERY commit
# Blocks commit if tests fail

echo "🔍 Running mandatory test suite..."

# Check 1: Build must succeed
npm run build || {
  echo "❌ BUILD FAILED - commit blocked"
  exit 1
}

# Check 2: Unit tests must pass
npm test || {
  echo "❌ UNIT TESTS FAILED - commit blocked"
  exit 1
}

# Check 3: Integration tests must pass
npm run test:integration || {
  echo "❌ INTEGRATION TESTS FAILED - commit blocked"
  exit 1
}

echo "✅ All tests passed - commit allowed"
```

**This is ENFORCED, not optional.**

### 2. Integration Test Suite (Required for All Features)

**Location:** `tests/integration/autopilot_integration.test.ts`

Every major feature MUST have integration tests that:

#### A. Actually Run the Feature End-to-End
```typescript
describe('Autopilot Decomposition', () => {
  it('should not exceed decomposition limits', async () => {
    // Setup: Create 100 epic tasks
    const tasks = createManyEpicTasks(100);

    // Execute: Run actual autopilot (not mocked)
    const orchestrator = new UnifiedOrchestrator(...);
    await orchestrator.start();

    // Monitor: Track decompositions
    const decompositionCount = trackDecompositions();

    // Assert: Must stay under limit
    expect(decompositionCount).toBeLessThan(MAX_DECOMPOSITION_LIMIT);
  });

  it('should trigger circuit breaker under load', async () => {
    // Create pathological case: tasks that all want to decompose
    const tasks = createDecomposableTasksChain(200);

    // Run autopilot
    const result = await runAutopilot(tasks);

    // Verify circuit breaker engaged
    expect(result.circuitBreakerTriggered).toBe(true);
    expect(result.systemStable).toBe(true);
  });
});
```

#### B. Monitor Resource Consumption
```typescript
it('should not consume excessive memory', async () => {
  const initialMemory = process.memoryUsage().heapUsed;

  // Run autopilot for 5 minutes
  await runAutopilotWithTimeout(5 * 60 * 1000);

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;

  // Assert: Memory growth < 500MB (configurable)
  expect(memoryGrowth).toBeLessThan(500 * 1024 * 1024);
});

it('should not spawn runaway processes', async () => {
  const initialProcesses = countProcesses('worker_entry');

  await runAutopilotWithTimeout(2 * 60 * 1000);

  const finalProcesses = countProcesses('worker_entry');

  // Assert: Process count stayed reasonable
  expect(finalProcesses - initialProcesses).toBeLessThan(10);
});
```

#### C. Test Failure Modes
```typescript
it('should gracefully handle decomposition depth exceeded', async () => {
  const deeplyNestedTask = createTaskWithDepth(10);

  const result = await decomposer.decompose(deeplyNestedTask);

  expect(result.shouldDecompose).toBe(false);
  expect(result.reason).toContain('Max decomposition depth');
});
```

### 3. Chaos Testing (Weekly Automated)

**Location:** `tests/chaos/autopilot_stress.test.ts`

Runs automatically every week in CI. Tests pathological cases:

```typescript
describe('Autopilot Chaos Tests', () => {
  it('100 concurrent epic tasks', async () => {
    // Worst case: all tasks want to decompose at once
    const tasks = Array(100).fill(null).map(() => createEpicTask());

    const result = await runAutopilotWithTasks(tasks);

    // System must remain stable
    expect(result.crashed).toBe(false);
    expect(result.circuitBreakersWorked).toBe(true);
  });

  it('rapid task creation loop', async () => {
    // Pathological: tasks that create more tasks
    const selfReplicatingTask = createSelfReplicatingTask();

    const result = await runAutopilotWithTasks([selfReplicatingTask]);

    // Must stop replication
    expect(result.totalTasksCreated).toBeLessThan(1000);
  });

  it('memory leak detection', async () => {
    // Run for 30 minutes with monitoring
    const monitor = new ResourceMonitor();

    await runAutopilotWithMonitoring(30 * 60 * 1000, monitor);

    // Check for memory leaks
    expect(monitor.hasMemoryLeak()).toBe(false);
  });
});
```

### 4. Test Verification Checklist (Manual Sign-Off Required)

**Location:** `TESTING_CHECKLIST.md`

Before marking ANY feature as "done", the implementer MUST:

- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Feature actually run end-to-end manually (not mocked)
- [ ] Tested with realistic data volume (100+ items)
- [ ] Tested failure cases (what breaks it?)
- [ ] Resource consumption checked (memory, CPU, processes)
- [ ] Chaos test scenarios considered
- [ ] Rollback plan documented
- [ ] Monitoring/alerting configured

**Signed:** `[Agent Name]` **Date:** `[ISO Date]`

### 5. Automated CI/CD Gates

**Location:** `.github/workflows/test-gates.yml`

```yaml
name: Test Gates (BLOCKING)

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm test
      # BLOCKS merge if fails

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run test:integration
      # BLOCKS merge if fails

  resource-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run test:resources
      # Checks memory/CPU consumption
      # BLOCKS merge if excessive

  chaos-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run test:chaos
      # Only on main branch
      # BLOCKS deploy if fails
```

### 6. Post-Deploy Monitoring (Canary Testing)

After any deployment, automatically run:

```bash
#!/bin/bash
# Canary test: runs autopilot with monitoring for 5 minutes

echo "🐤 Running canary test..."

# Start resource monitor
bash scripts/monitor_autopilot.sh > /tmp/canary_monitor.log 2>&1 &
MONITOR_PID=$!

# Run autopilot with timeout
timeout 300 WVO_AUTOPILOT_ONCE=1 AGENTS=3 make autopilot || {
  kill $MONITOR_PID
  echo "❌ CANARY FAILED - initiating rollback"
  git revert HEAD
  npm run build
  exit 1
}

# Check monitor results
if grep "circuit breaker triggered" /tmp/canary_monitor.log; then
  echo "⚠️ Circuit breaker engaged during canary"
fi

if grep "Process count.*[2-9][0-9]" /tmp/canary_monitor.log; then
  echo "❌ CANARY FAILED - excessive processes"
  exit 1
fi

kill $MONITOR_PID
echo "✅ Canary passed"
```

### 7. Test Coverage Requirements

**Minimum coverage thresholds (enforced):**

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      },
      "critical": {
        "branches": 95,
        "functions": 95,
        "lines": 95,
        "statements": 95
      }
    }
  }
}
```

**Critical paths** (require 95% coverage):
- Task decomposition
- Resource management
- Circuit breakers
- State transitions

### 8. Accountability System

Every commit must include test evidence:

```
commit message format:
feat: Add task decomposition safeguards

Tests:
- Unit: task_decomposer.test.ts (12 tests, all passing)
- Integration: autopilot_integration.test.ts (5 tests, all passing)
- Manual: Ran autopilot with 100 tasks, no crashes
- Resources: Memory stayed under 200MB, 4 processes max
- Chaos: Tested with 200 concurrent tasks, circuit breaker worked

Evidence: state/telemetry/test_run_2025-10-22.jsonl
Monitor log: /tmp/test_monitor_2025-10-22.log

Checklist signed: Claude [2025-10-22]
```

If any section is missing → **commit rejected by hook**.

## Implementation Plan

### Phase 1: Immediate (Today)
1. Create integration test suite for autopilot
2. Add resource monitoring to tests
3. Install pre-commit hook
4. Document test checklist

### Phase 2: This Week
1. Write chaos tests for decomposition
2. Set up CI/CD gates
3. Add canary testing script
4. Enforce coverage thresholds

### Phase 3: Ongoing
1. Weekly chaos test runs
2. Monthly review of test effectiveness
3. Update tests when new bugs found
4. Expand coverage to all critical paths

## Why This Works

### Before (Broken)
- Tests were optional
- Unit tests mocked everything
- No end-to-end validation
- No resource monitoring
- "It compiles" = "it works"

### After (Enforced)
- ✅ Can't commit without tests passing
- ✅ Integration tests run real code
- ✅ Resource limits enforced
- ✅ Chaos tests catch edge cases
- ✅ Canary tests catch regressions
- ✅ Coverage thresholds prevent gaps
- ✅ Accountability via signed checklists

## Example: How This Would Have Caught the Bug

The decomposition loop bug would have been caught at MULTIPLE levels:

1. **Integration test** would show runaway decompositions
2. **Resource test** would show excessive memory/CPU
3. **Chaos test** with 100 tasks would trigger the loop
4. **Canary test** would show system instability
5. **Manual checklist** would require running with realistic load

It would have been **impossible** to commit this bug with these gates in place.

## The Bottom Line

**No more "trust me, I tested it."**

Tests must be:
- Automated
- End-to-end
- Resource-monitored
- Chaos-validated
- Enforced by tooling
- Signed off by implementer

If it's not tested this way, **it's not done**.
