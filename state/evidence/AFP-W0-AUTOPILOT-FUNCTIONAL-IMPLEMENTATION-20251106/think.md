# THINK: Wave 0 Autopilot Edge Cases and Failure Modes

**Task ID:** AFP-W0-AUTOPILOT-FUNCTIONAL-IMPLEMENTATION-20251106
**Date:** 2025-11-06
**Author:** Claude Council

---

## Critical Edge Cases

### Edge Case 1: MCP Tool Call Failures
**Scenario:** MCP client fails to call Claude Code tools (network timeout, API error, tool not available)

**Why this matters:**
- Without tool calls, Wave 0 cannot read files, write code, or execute commands
- This is THE critical dependency - everything else depends on MCP working

**How it manifests:**
```typescript
// Attempting to read file for context
const content = await mcp.read('src/index.ts');
// Returns: Error: MCP connection timeout
```

**Detection:**
- MCP client throws exception
- Tool call returns null/undefined
- Timeout after 30 seconds

**Mitigation:**
1. **Retry logic:** 3 attempts with exponential backoff (1s, 2s, 4s)
2. **Fallback:** If MCP completely unavailable, generate shell script for manual execution
3. **Graceful degradation:** Mark task as "blocked" with specific error context
4. **Circuit breaker:** If >5 consecutive MCP failures, halt Wave 0 and alert

---

### Edge Case 2: Circular Dependency Loops
**Scenario:** Task A depends on Task B, which depends on Task C, which depends on Task A

**Why this matters:**
- Wave 0 could get stuck trying to find an executable task
- Infinite loop in task selection logic

**How it manifests:**
```yaml
tasks:
  - id: TASK-A
    dependencies: [TASK-B]
  - id: TASK-B
    dependencies: [TASK-C]
  - id: TASK-C
    dependencies: [TASK-A]  # Circular!
```

**Detection:**
- Track visited tasks during dependency resolution
- If same task appears twice in chain, circular dependency detected

**Mitigation:**
1. **Detection:** Maintain visited set during dependency traversal
2. **Escalation:** Log circular chain to state/escalations/
3. **Skip:** Mark all tasks in cycle as "blocked" with circular dependency note
4. **Continue:** Select different task not in cycle

---

### Edge Case 3: Quality Gate Infinite Remediation
**Scenario:** DesignReviewer consistently blocks Wave 0's design.md, remediation attempts don't improve

**Why this matters:**
- Wave 0 gets stuck in GATE phase indefinitely
- Wastes tokens on futile remediation attempts
- Never progresses to implementation

**How it manifests:**
```
Attempt 1: DesignReviewer blocks (score 5/9)
Attempt 2: DesignReviewer blocks (score 4/9)  # Getting worse!
Attempt 3: DesignReviewer blocks (score 5/9)  # Not improving
```

**Detection:**
- Track quality scores across remediation attempts
- If score doesn't improve after 2 attempts, pattern detected

**Mitigation:**
1. **Max attempts:** Hard limit of 3 remediation attempts
2. **Score tracking:** If score decreases or plateaus, stop early
3. **Context injection:** On attempt 2+, include specific critic feedback in prompt
4. **Escalation:** After 3 failures, create escalation with all attempts documented

---

### Edge Case 4: Git Worktree Already Dirty
**Scenario:** Wave 0 starts but worktree has uncommitted changes from previous work

**Why this matters:**
- Wave 0's changes get mixed with existing uncommitted work
- Cannot isolate Wave 0's contributions
- Risk of committing unrelated changes

**How it manifests:**
```bash
$ git status
Changes not staged for commit:
  modified: src/index.ts  # From manual work
  modified: package.json  # From manual work
# Wave 0 starts and adds more changes...
```

**Detection:**
- Pre-flight check: `git status --porcelain`
- If non-evidence files modified, worktree dirty

**Mitigation:**
1. **Stash:** Auto-stash existing changes before starting
2. **Restore:** After Wave 0 completes, restore stash
3. **Isolation:** Use git worktree for Wave 0 execution (future enhancement)
4. **Abort:** If critical files dirty (roadmap.yaml), abort and request manual cleanup

---

### Edge Case 5: Task Requires Human Decision
**Scenario:** Task involves subjective choice (e.g., "Choose between Library A or Library B")

**Why this matters:**
- Wave 0 cannot make subjective architectural decisions
- Risk of making wrong choice that requires extensive rework

**How it manifests:**
```
Task: "Evaluate and choose between React and Vue for frontend"
Wave 0: ??? (Cannot make this decision autonomously)
```

**Detection:**
- Keywords in task title: "choose", "evaluate", "decide", "compare"
- Multiple valid approaches identified during PLAN phase
- No clear technical criteria for selection

**Mitigation:**
1. **Detection:** Flag subjective tasks during task selection
2. **Skip:** Mark as "blocked - requires human decision"
3. **Document:** Create decision template in evidence/
4. **Escalate:** Log to state/escalations/ with options analyzed

---

### Edge Case 6: Phase Content Generation Fails
**Scenario:** Wave 0 cannot generate meaningful content for a phase (e.g., STRATEGIZE returns empty)

**Why this matters:**
- Evidence files exist but contain no real analysis
- Quality gates will fail on empty content
- Defeats purpose of autopilot

**How it manifests:**
```typescript
const strategyContent = await executeStrategize(task, mcp);
// Returns: "" or "Error generating strategy"
```

**Detection:**
- Phase executor returns empty string
- Content length < 100 characters (too short)
- Content contains only template placeholders

**Mitigation:**
1. **Retry:** One retry with different prompt approach
2. **Fallback:** Use more detailed template with specific questions
3. **Mark incomplete:** Update phase status to "blocked" not "done"
4. **Continue:** Try to proceed with other phases (some value better than none)

---

### Edge Case 7: Build/Test Failures After Implementation
**Scenario:** Wave 0 makes code changes that break build or tests

**Why this matters:**
- Repository left in broken state
- Blocks all other work
- Violates "do no harm" principle

**How it manifests:**
```bash
# After Wave 0 implementation
$ npm run build
ERROR: TypeScript compilation failed
$ npm test
FAIL: 15 tests failing
```

**Detection:**
- Run build after IMPLEMENT phase
- Run tests after build passes
- Check exit codes

**Mitigation:**
1. **Rollback:** Git reset to pre-implementation state
2. **Retry:** One attempt to fix compilation errors
3. **Minimal change:** Reduce scope to smallest working change
4. **Test isolation:** Run tests in isolated environment first

---

### Edge Case 8: Evidence Already Exists
**Scenario:** Task has existing evidence from previous attempt

**Why this matters:**
- Risk of overwriting human-created evidence
- Confusion about which evidence is current
- Lost work from previous attempts

**How it manifests:**
```
state/evidence/TASK-123/ already exists with:
  - strategy.md (created by human)
  - plan.md (created by human)
Wave 0 about to overwrite...
```

**Detection:**
- Check if evidence directory exists
- Check if files have substantial content (>500 chars)
- Check metadata.json for execution_mode

**Mitigation:**
1. **Backup:** Move existing evidence to .backup/ subdirectory
2. **Merge:** Attempt to preserve human sections, add Wave 0 sections
3. **Version:** Add version suffix (TASK-123-wave0-v2)
4. **Skip:** If high-quality human evidence exists, mark task done

---

### Edge Case 9: Task Dependencies Not in Roadmap
**Scenario:** Task declares dependencies on IDs that don't exist

**Why this matters:**
- Cannot determine if task is ready to execute
- Dependency validation fails
- Task stuck in blocked state

**How it manifests:**
```yaml
- id: TASK-123
  dependencies: [TASK-999]  # TASK-999 doesn't exist!
```

**Detection:**
- Parse all task IDs from roadmap
- Check each dependency against ID set
- Flag missing dependencies

**Mitigation:**
1. **Warning:** Log missing dependencies
2. **Assume ready:** Treat missing dependencies as "done" (optimistic)
3. **Document:** Note in evidence that dependencies unresolved
4. **Escalate:** Add to monitor.md for human cleanup

---

### Edge Case 10: Token Budget Exhaustion
**Scenario:** Wave 0 consumes excessive tokens on deep analysis

**Why this matters:**
- Cost overrun
- Rate limiting
- Incomplete task execution

**How it manifests:**
```
Token usage:
- STRATEGIZE: 50k tokens (reading 20 files)
- SPEC: 30k tokens
- PLAN: 40k tokens
- Total: 200k+ tokens for one task!
```

**Detection:**
- Track tokens per phase
- Monitor cumulative usage
- Alert if >100k tokens per task

**Mitigation:**
1. **Limits:** Cap file reads to 5 per phase
2. **Sampling:** Read first 100 lines of large files
3. **Caching:** Reuse file contents across phases
4. **Circuit breaker:** Abort if token usage exceeds budget

---

## Failure Modes

### Failure Mode 1: Complete MCP Unavailability
**Description:** MCP client cannot be initialized or all tool calls fail

**Likelihood:** Low (MCP is core infrastructure)
**Impact:** Critical (Wave 0 cannot function)

**Failure sequence:**
1. MCP client initialization fails
2. Fallback to CLI attempts fail
3. No way to read files or execute commands
4. Wave 0 completely non-functional

**Recovery:**
1. Log detailed diagnostics
2. Create shell script with intended commands
3. Escalate to human with recovery instructions
4. Mark task as "blocked - infrastructure failure"

---

### Failure Mode 2: Cascading Quality Gate Failures
**Description:** One bad phase causes all subsequent phases to fail quality checks

**Likelihood:** Medium
**Impact:** High (no tasks complete successfully)

**Failure sequence:**
1. STRATEGIZE generates poor analysis
2. SPEC based on poor strategy also fails
3. PLAN based on poor spec fails
4. Entire pipeline contaminated

**Recovery:**
1. Detect pattern (3+ consecutive phase failures)
2. Reset to clean state
3. Use enhanced prompts with examples
4. If still failing, escalate for prompt tuning

---

### Failure Mode 3: Repository Corruption
**Description:** Git operations leave repository in corrupted state

**Likelihood:** Low (with git hygiene)
**Impact:** Critical (blocks all work)

**Failure sequence:**
1. Concurrent git operations create index.lock
2. Partial commit leaves objects dangling
3. Git fsck fails
4. Repository unusable

**Recovery:**
1. Immediate halt of Wave 0
2. Run git recovery commands
3. Restore from backup if needed
4. Add additional git safety checks

---

### Failure Mode 4: Infinite Task Selection Loop
**Description:** Task selection logic loops forever, never finding executable task

**Likelihood:** Low
**Impact:** High (Wave 0 hangs)

**Failure sequence:**
1. All pending tasks have unmet dependencies
2. Selection logic keeps searching
3. Never times out
4. Wave 0 appears frozen

**Recovery:**
1. Add timeout to task selection (30 seconds)
2. If no task found in time limit, log state
3. Mark Wave 0 as "no executable tasks"
4. Clean exit

---

### Failure Mode 5: Evidence Explosion
**Description:** Evidence files grow unbounded, consuming excessive disk space

**Likelihood:** Medium
**Impact:** Medium (disk space, performance)

**Failure sequence:**
1. Deep analysis generates 10MB+ evidence per task
2. 100 tasks = 1GB+ evidence
3. Disk space exhausted
4. Slow repository operations

**Recovery:**
1. Cap evidence file sizes (1MB per file)
2. Truncate with continuation markers
3. Archive old evidence (>30 days)
4. Monitor disk usage

---

## Complexity Analysis

### Algorithmic Complexity

**Task Selection:** O(n) where n = number of tasks
- Must scan all tasks to find pending
- Must check dependencies for each
- Optimization: Index by status on load

**Dependency Resolution:** O(d * t) where d = max dependency depth, t = tasks
- Must traverse dependency chain
- Detect cycles requires visited set
- Optimization: Memoize resolution results

**Evidence Generation:** O(f * p) where f = files read, p = phases
- Each phase reads multiple files
- Content generation scales with input
- Optimization: Cache file contents

**Quality Gate Validation:** O(1) per phase
- Fixed cost per critic execution
- Remediation adds constant factor (max 3)
- No scaling issues

### Cognitive Complexity

**For Developers:**
- **Learning curve:** Medium (must understand AFP phases, MCP integration, critics)
- **Debugging difficulty:** Medium (distributed across phases, async operations)
- **Modification difficulty:** Low (phases are modular, clear interfaces)

**For Users:**
- **Configuration complexity:** Low (environment variables, simple options)
- **Monitoring complexity:** Low (tail logs, check status)
- **Troubleshooting complexity:** Medium (need to understand AFP phases)

**Cyclomatic Complexity Targets:**
- Phase executors: ≤10 per function
- Task selection: ≤15 (dependency logic)
- Main orchestration: ≤20 (error handling paths)

---

## Monitoring and Observability

### Key Metrics to Track

**Execution Metrics:**
- Task completion rate (target: >90% for standard tasks)
- Phase success rate per phase
- Average execution time per task
- Token usage per task

**Quality Metrics:**
- DesignReviewer approval rate
- ProcessCritic validation rate
- Remediation attempt frequency
- Evidence quality scores

**Infrastructure Metrics:**
- MCP success rate
- Git operation success rate
- Memory usage
- Disk usage growth

### Failure Detection

**Real-time Signals:**
```jsonl
// state/analytics/wave0_runs.jsonl
{"taskId":"TASK-123","phase":"GATE","status":"failed","attempts":3,"escalated":true}
```

**Alert Triggers:**
- 3 consecutive task failures
- MCP unavailable for >5 minutes
- Token usage >200k per task
- Disk usage >1GB growth per day

### Recovery Procedures

**Standard Recovery Flow:**
1. Detect failure (exception, timeout, quality gate)
2. Log detailed context
3. Attempt automated recovery (retry, rollback)
4. If recovery fails, escalate
5. Mark task status appropriately
6. Continue with next task

**Emergency Procedures:**
- **Repository corruption:** Halt immediately, alert human
- **Token exhaustion:** Pause Wave 0, wait for budget reset
- **Infinite loop:** Kill process, investigate logs
- **MCP down:** Switch to manual mode

---

## Defensive Programming Strategies

### Input Validation
```typescript
// Validate task before execution
if (!task.id || !task.title) {
  throw new Error('Invalid task: missing required fields');
}

// Validate MCP responses
const content = await mcp.read(file);
if (!content || content.length === 0) {
  logger.warn(`Empty file read: ${file}`);
  return DEFAULT_CONTENT;
}
```

### Error Boundaries
```typescript
// Wrap each phase in error boundary
try {
  return await executePhase(task, mcp);
} catch (error) {
  logger.error(`Phase failed: ${phase}`, error);
  return handlePhaseError(phase, error);
}
```

### Timeout Protection
```typescript
// Timeout long operations
const result = await Promise.race([
  mcp.read(file),
  timeout(30000, 'MCP read timeout')
]);
```

### State Validation
```typescript
// Validate state transitions
if (phase.status === 'done') {
  throw new Error(`Cannot re-execute completed phase: ${phase.name}`);
}
```

### Resource Cleanup
```typescript
// Always cleanup resources
try {
  await acquireLease(taskId);
  await executeTask(task);
} finally {
  await releaseLease(taskId);
}
```

---

## Testing Edge Cases

### Test Coverage Requirements

**Unit Test Coverage:**
- Each edge case must have dedicated test
- Each failure mode must have recovery test
- Each mitigation must be validated

**Integration Test Coverage:**
- Full task execution with MCP failures
- Quality gate remediation loops
- Git operations with dirty worktree
- Token budget enforcement

**Example Edge Case Test:**
```typescript
describe('Edge Case: MCP Failures', () => {
  it('should retry MCP calls with backoff', async () => {
    const mcp = new MCPClient();
    let attempts = 0;
    jest.spyOn(mcp, 'read').mockImplementation(() => {
      attempts++;
      if (attempts < 3) throw new Error('Network error');
      return 'success';
    });

    const result = await executeWithRetry(() => mcp.read('file.ts'));
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should escalate after max retries', async () => {
    const mcp = new MCPClient();
    jest.spyOn(mcp, 'read').mockRejectedValue(new Error('Permanent failure'));

    const task = await executeTask(testTask, mcp);
    expect(task.status).toBe('blocked');
    expect(fs.existsSync(`state/escalations/${testTask.id}-escalation.md`)).toBe(true);
  });
});
```

---

## Critical Success Factors

### What Must Go Right

1. **MCP integration works reliably** - This is the foundation
2. **Phase executors generate real content** - Not placeholders
3. **Quality gates provide actionable feedback** - Not just pass/fail
4. **Git operations maintain repository integrity** - Never corrupt
5. **Failure recovery is graceful** - No crashes, clean escalation

### What Must Not Happen

1. **Repository corruption** - Absolute showstopper
2. **Infinite loops** - Must have timeouts everywhere
3. **Token explosion** - Must have budget controls
4. **Evidence loss** - Never overwrite human work without backup
5. **Silent failures** - Every error must be logged and handled

### Early Warning Signs

**Wave 0 is struggling if:**
- Task completion rate <50%
- Average task time >45 minutes
- Remediation attempts >2 per task average
- Token usage >150k per task
- Escalation rate >30%

**Immediate intervention needed if:**
- Repository corruption detected
- MCP unavailable >10 minutes
- 5 consecutive task failures
- Token budget exhausted
- Git index.lock persists

---

**Think phase complete:** 2025-11-06
**Next phase:** GATE (design.md with AFP/SCAS analysis)
**Owner:** Claude Council

---

## Summary

This THINK analysis identifies 10 critical edge cases and 5 failure modes that could prevent Wave 0 from functioning correctly. Each has specific detection and mitigation strategies. The most critical risks are:

1. **MCP integration failures** - Would completely prevent Wave 0 from working
2. **Quality gate infinite loops** - Could trap Wave 0 in remediation
3. **Repository corruption** - Would block all work
4. **Token exhaustion** - Would halt execution due to cost

With proper defensive programming, timeout protection, and graceful error handling, these risks can be managed. The key is to fail fast, fail safely, and always provide clear escalation paths when automation cannot proceed.