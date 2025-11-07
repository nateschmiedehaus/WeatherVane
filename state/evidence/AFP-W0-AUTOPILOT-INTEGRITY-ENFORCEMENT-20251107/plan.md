# PLAN - AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107

**Task:** Autopilot Integrity Enforcement - No Bypasses, Full Quality
**Created:** 2025-11-07T14:22:00Z
**Phase:** PLAN

## Via Negativa - What Can We DELETE?

**Before adding enforcement, let's DELETE the bypass:**

### 1. Delete REVIEW Task Bypass (32 lines)
**File:** `tools/wvo_mcp/src/wave0/autonomous_runner.ts`
**Lines:** 249-276 (and imports if needed)

```typescript
// DELETE THIS ENTIRE BLOCK:
if (task.id.includes('-REVIEW')) {
  logInfo(`Task ${task.id} is a REVIEW task (quality gate) - completing without implementation evidence`);

  const completionDoc = `# REVIEW Complete - ${task.id}...`;
  await fs.writeFile(path.join(evidenceDir, 'completion.md'), completionDoc);
  return { success: true };  // ← THIS IS THE BYPASS
}
```

**Why delete:** This code skips ALL work and marks tasks complete in 0.5 seconds.

**Net LOC:** -32 lines deleted

### 2. Delete Template Fallback Logic (if exists)
**File:** `tools/wvo_mcp/src/wave0/real_mcp_client.ts` or `autonomous_runner.ts`

If there's code that silently falls back to templates when MCP fails, DELETE it.
MCP failure should FAIL THE TASK, not silently generate fake evidence.

**Estimated:** -10 to -20 lines

### 3. Delete Any Other Bypass Patterns
Search for patterns like:
- `return { success: true }` without actual work
- Template string generation instead of MCP calls
- Skipping critic execution

**Total Via Negativa:** ~50 lines DELETED

## Implementation Approach

### Architecture: Enforcement by Removal + Strict Checks

**Not:** "Add more enforcement logic"
**Instead:** "Remove bypasses, let existing critics enforce"

The system ALREADY HAS:
- 5 quality critics (StrategyReviewer, ThinkingCritic, DesignReviewer, TestsCritic, ProcessCritic)
- QualityEnforcer that runs critics
- Pre-commit hooks

**The problem:** Bypass code circumvents these systems.
**The solution:** DELETE the bypass code. That's it.

### Refactor vs Repair

**This is TRUE REFACTOR ✅**

**Why:**
- Removing code that shouldn't exist (bypass)
- Restoring system to designed behavior (critics enforce quality)
- Fixing root cause (bypasses) not symptoms (low quality)
- Net negative LOC (deleting more than adding)

**Not repair because:**
- Not adding workarounds
- Not patching over bypasses
- Not hiding the problem
- Actually removing the faulty code

### Files to Change

**Total: 3 files**

1. **tools/wvo_mcp/src/wave0/autonomous_runner.ts** (~50 lines changed)
   - DELETE: REVIEW task bypass (lines 249-276)
   - ENSURE: executeTaskWithAI always calls real MCP
   - ENSURE: Critics run on every task
   - ENSURE: Task fails if critics fail (no silent continues)

2. **tools/wvo_mcp/src/wave0/real_mcp_client.ts** (~20 lines changed)
   - FIX: MCP connection (investigate why it fails)
   - REMOVE: Any silent fallback to templates
   - ADD: Clear error message if MCP unavailable

3. **tools/wvo_mcp/src/wave0/quality_enforcer.ts** (~10 lines changed)
   - ENSURE: All 5 critics run
   - ENSURE: Task blocked if ANY critic fails
   - ADD: Logging of critic results

**Total files:** 3/5 (within AFP limit)
**Net LOC:** -20 lines (50 deleted, 30 added)

### Implementation Steps

**Step 1: Remove REVIEW Bypass** (15 min)
- Delete lines 249-276 in autonomous_runner.ts
- Remove any references to bypass logic
- Rebuild and verify compilation

**Step 2: Fix MCP Connection** (30-45 min)
- Read real_mcp_client.ts to understand failure
- Check MCP server status
- Fix connection issues OR document blocker
- If MCP can't be fixed now, FAIL tasks instead of template fallback

**Step 3: Enforce Critic Execution** (15 min)
- In quality_enforcer.ts, ensure all 5 critics run
- Block task progression if critics fail
- Log critic results to evidence

**Step 4: Remove Template Fallback** (10 min)
- Search for template generation code
- Replace with MCP calls OR explicit failure
- No silent fallbacks

**Step 5: Verify Gates Work** (10 min)
- Check that GATE phase exists in autonomous_runner
- Ensure design.md required before IMPLEMENT
- Ensure DesignReviewer runs and blocks if fails

**Total estimated time:** 90 minutes

### PLAN-Authored Tests (For VERIFY Phase)

**These tests MUST exist before IMPLEMENT. VERIFY will execute them.**

#### Test 1: REVIEW Task No Longer Bypassed
**File:** `tools/wvo_mcp/src/wave0/__tests__/no_bypass.test.ts` (NEW)

```typescript
describe('Bypass Removal', () => {
  test('REVIEW tasks must complete full AFP lifecycle', async () => {
    const task = {
      id: 'TEST-REVIEW-TASK',
      title: 'Test Review Task',
      status: 'pending'
    };

    const runner = new AutonomousRunner();
    const result = await runner.executeTaskWithAI(task);

    // Must NOT complete in < 1 second (bypass took 0.5 sec)
    expect(result.executionTime).toBeGreaterThan(1000);

    // Must have real evidence, not just completion.md
    expect(fs.existsSync(`state/evidence/${task.id}/strategy.md`)).toBe(true);
    expect(fs.existsSync(`state/evidence/${task.id}/spec.md`)).toBe(true);
    expect(fs.existsSync(`state/evidence/${task.id}/plan.md`)).toBe(true);

    // Evidence must be from MCP, not templates
    const strategy = fs.readFileSync(`state/evidence/${task.id}/strategy.md`, 'utf8');
    expect(strategy).not.toContain('Generic template');
    expect(strategy.length).toBeGreaterThan(500); // Real evidence is longer
  });
});
```

#### Test 2: MCP Integration Required
**File:** `tools/wvo_mcp/src/wave0/__tests__/mcp_required.test.ts` (NEW)

```typescript
describe('MCP Integration', () => {
  test('Task fails if MCP unavailable (no template fallback)', async () => {
    // Simulate MCP connection failure
    const mockMCPClient = {
      connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
    };

    const runner = new AutonomousRunner({ mcpClient: mockMCPClient });
    const task = { id: 'TEST-TASK', title: 'Test', status: 'pending' };

    const result = await runner.executeTaskWithAI(task);

    // Task must FAIL, not silently fall back to templates
    expect(result.success).toBe(false);
    expect(result.error).toContain('MCP');
  });

  test('Evidence generated via MCP, not templates', async () => {
    const runner = new AutonomousRunner();
    const task = { id: 'TEST-TASK-2', title: 'Test', status: 'pending' };

    const result = await runner.executeTaskWithAI(task);

    // Check evidence came from MCP
    const evidence = fs.readFileSync(`state/evidence/${task.id}/strategy.md`, 'utf8');

    // Templates have specific markers
    expect(evidence).not.toContain('Generated by Wave 0.1 Autonomous Runner (AFP-compliant)');
    expect(evidence).not.toContain('Autonomous execution by Wave 0.1');

    // Real MCP evidence has task-specific content
    expect(evidence).toContain(task.title);
    expect(evidence.length).toBeGreaterThan(1000);
  });
});
```

#### Test 3: All Critics Must Approve
**File:** `tools/wvo_mcp/src/wave0/__tests__/critic_enforcement.test.ts` (NEW)

```typescript
describe('Critic Enforcement', () => {
  test('All 5 critics run on completed tasks', async () => {
    const runner = new AutonomousRunner();
    const task = { id: 'TEST-CRITIC', title: 'Test Critics', status: 'pending' };

    const result = await runner.executeTaskWithAI(task);

    // Check all 5 critics ran
    const criticResults = result.criticResults || {};
    expect(criticResults).toHaveProperty('strategy');
    expect(criticResults).toHaveProperty('thinking');
    expect(criticResults).toHaveProperty('design');
    expect(criticResults).toHaveProperty('tests');
    expect(criticResults).toHaveProperty('process');
  });

  test('Task blocks if ANY critic fails', async () => {
    const runner = new AutonomousRunner();

    // Create task with intentionally bad evidence
    const task = {
      id: 'TEST-BAD-EVIDENCE',
      title: 'Bad Evidence Test',
      status: 'pending'
    };

    // Inject bad strategy.md that will fail StrategyReviewer
    const badStrategy = 'This is too short and lacks depth';
    fs.writeFileSync(`state/evidence/${task.id}/strategy.md`, badStrategy);

    const result = await runner.executeTaskWithAI(task);

    // Task must be BLOCKED, not completed
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('critic');
  });
});
```

#### Test 4: GATE Phase Required Before IMPLEMENT
**File:** `tools/wvo_mcp/src/wave0/__tests__/gate_enforcement.test.ts` (NEW)

```typescript
describe('GATE Enforcement', () => {
  test('Cannot proceed to IMPLEMENT without design.md', async () => {
    const runner = new AutonomousRunner();
    const task = { id: 'TEST-GATE', title: 'Test Gate', status: 'pending' };

    // Complete up to THINK phase, but skip GATE
    await runner.executePhase(task, 'STRATEGIZE');
    await runner.executePhase(task, 'SPEC');
    await runner.executePhase(task, 'PLAN');
    await runner.executePhase(task, 'THINK');

    // Attempt IMPLEMENT without GATE
    const result = await runner.executePhase(task, 'IMPLEMENT');

    // Must be blocked
    expect(result.success).toBe(false);
    expect(result.reason).toContain('GATE');
    expect(result.reason).toContain('design.md');
  });

  test('GATE requires DesignReviewer approval', async () => {
    const runner = new AutonomousRunner();
    const task = { id: 'TEST-GATE-2', title: 'Test', status: 'pending' };

    // Create design.md but with low quality (will fail DesignReviewer)
    fs.writeFileSync(`state/evidence/${task.id}/design.md`, 'Bad design');

    const result = await runner.executePhase(task, 'GATE');

    // DesignReviewer must block
    expect(result.approved).toBe(false);
    expect(result.score).toBeLessThan(95);
  });
});
```

#### Test 5: Live-Fire Validation (Manual)
**File:** `state/evidence/AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107/verify.md` (Document in VERIFY phase)

**Manual test steps:**
1. Start autonomous runner: `npm run wave0`
2. Add simple test task to roadmap
3. Monitor execution: `tail -f state/logs/continuous_master.log`
4. Verify:
   - Task completes with all 10 phases
   - All 5 critics run and approve
   - Evidence is real (not templates)
   - Git commit created
   - Quality score ≥95

**Expected:** Task takes 15-30 minutes, produces real evidence, passes all critics.
**If fails:** Document failure, create follow-up task, don't claim this task done.

### Test Exemptions

**None.** All tests must pass before claiming task complete.

This is autopilot work, so live-fire validation (Test 5) is MANDATORY per `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`.

### Risks & Mitigations

**Risk 1: MCP Connection May Not Be Fixable Quickly**
- **Likelihood:** High
- **Impact:** High (blocks entire task)
- **Mitigation:** If MCP can't be fixed in 90 min, STOP and create separate MCP fix task
- **Escalation:** Document MCP issue, mark this task as blocked on MCP

**Risk 2: Removing Bypass May Reveal More Issues**
- **Likelihood:** Medium
- **Impact:** Medium (need additional fixes)
- **Mitigation:** Fix what we can, create follow-up tasks for rest
- **Acceptance:** Better to reveal issues than hide them with bypasses

**Risk 3: Tests May Fail**
- **Likelihood:** High (that's the point)
- **Impact:** Medium (need to fix until pass)
- **Mitigation:** Iterate on fixes until tests pass
- **DO NOT:** Skip tests or claim done with failing tests

### Edge Cases

1. **What if REVIEW tasks genuinely don't need implementation?**
   - Answer: They still need the full AFP lifecycle to DECIDE that
   - Strategy should conclude "this is a quality gate, completion is acknowledgment"
   - Implementation is creating the acknowledgment evidence
   - Full process, simpler content

2. **What if task is docs-only (no code)?**
   - Per PLAN template: Document in PLAN that tests aren't applicable
   - ProcessCritic will accept this if explicitly documented
   - Still need full 10 phases, just VERIFY runs doc review instead of code tests

3. **What if MCP is fundamentally broken?**
   - This task is BLOCKED until MCP works
   - Don't fake it with templates
   - Create "AFP-W0-MCP-CONNECTION-FIX" task
   - Work that task first, then resume this one

4. **What if DesignReviewer is too strict?**
   - Good. That's the point.
   - Do the work to pass it (real design thinking, AFP/SCAS analysis)
   - Remediation loop is expected (2-3 rounds normal)

### Dependencies

**Hard blockers:**
- MCP server must be accessible OR we document blocker
- All 5 critics must be functional (verify they run)
- Git repository accessible
- Pre-commit hooks installed

**Soft dependencies:**
- Test framework working (can write tests later if needed)
- CI system (nice to have, not required)

### Success Metrics

**Code Changes:**
- Net LOC: -20 lines (deletion > addition)
- Files changed: 3/5
- Bypass code: 0 lines remaining

**Quality:**
- Tests: 4 automated + 1 manual (all passing)
- Live-fire: 1 complete task end-to-end
- Critics: 5/5 running and enforcing
- Evidence: Real AI-generated (not templates)

---
Generated: 2025-11-07T14:22:00Z
Phase: PLAN
Task: AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107
Status: Complete

**CRITICAL:** Tests listed above MUST be created before moving to IMPLEMENT.
Tests may start failing/skipped, but they must EXIST.
