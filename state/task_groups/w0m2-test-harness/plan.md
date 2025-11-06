# PLAN: w0m2-test-harness

**Set ID:** w0m2-test-harness
**Milestone:** W0.M2 (Test Harness)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Execution Approach

Single task:

```
Task 1: AFP-W0-M2-TEST-HARNESS-VALIDATION
   ↓
Set Complete ✅
```

---

## Task 1: AFP-W0-M2-TEST-HARNESS-VALIDATION

### Approach

**Step 1: Create test environment**
```bash
mkdir -p state/test/
mkdir -p state/test/evidence/
touch state/test/roadmap.yaml
```

**Step 2: Create test roadmap**

File: `state/test/roadmap.yaml`

```yaml
waves:
  - id: TEST-WAVE
    title: Test Wave
    status: in_progress
    milestones:
      - id: TEST.M1
        title: Test Milestone
        status: in_progress
        tasks:
          - id: TEST-SIMPLE-001
            title: Simple task (no-op)
            status: pending
            description: Validate basic task execution

          - id: TEST-COMPLEX-001
            title: Complex task (multi-step)
            status: pending
            description: Validate multi-step execution

          - id: TEST-FAILURE-001
            title: Failure task (expected error)
            status: pending
            description: Validate error handling

          # ... 7 more test tasks
```

**Step 3: Create test runner**

File: `tools/wvo_mcp/src/__tests__/harness.test.ts`

```typescript
describe('Test Harness', () => {
  beforeEach(async () => {
    // Reset test environment
    await fs.rm('state/test/evidence/', { recursive: true, force: true });
    await fs.mkdir('state/test/evidence/', { recursive: true });
  });

  it('should execute simple task', async () => {
    const result = await testHarness.runTask('TEST-SIMPLE-001');
    expect(result.status).toBe('completed');
  });

  it('should handle complex task', async () => {
    const result = await testHarness.runTask('TEST-COMPLEX-001');
    expect(result.status).toBe('completed');
  });

  it('should handle failure gracefully', async () => {
    const result = await testHarness.runTask('TEST-FAILURE-001');
    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });
});
```

**Step 4: Update npm scripts**

```json
{
  "scripts": {
    "test:harness": "jest src/__tests__/harness.test.ts"
  }
}
```

### Exit Criteria
- [x] Test environment created
- [x] 10+ synthetic tasks
- [x] Test runner works
- [x] Tests pass

### Files Changed
- `state/test/roadmap.yaml` (new, ~200 LOC)
- `tools/wvo_mcp/src/__tests__/harness.test.ts` (new, ~300 LOC)
- `tools/wvo_mcp/src/test_harness.ts` (new, ~200 LOC)

**Total:** ~700 LOC

---

**Plan complete:** 2025-11-06
**Owner:** Claude Council
