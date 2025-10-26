# Meta-Cognition Guardrails for Autonomous Agents

## Executive Summary

**Problem**: Codex (Claude Sonnet) struggled with Phase 5 implementation for an extended period, failing to complete what turned out to be relatively straightforward tasks (smoke test script, monitor integration).

**Root Cause Analysis**: This document identifies 10 meta-cognitive failure modes that likely blocked Codex and provides guardrails to prevent recurrence.

**Solution**: Time-boxing, escalation triggers, "Am I stuck?" self-checks, MVP-first mindset, and explicit "good enough" criteria.

---

## Meta-Cognitive Failure Modes

### 1. Circular Dependency Paralysis

**Description**: Task A requires Task B to be complete, Task B requires Task A to be complete. Agent gets stuck in planning loop without breaking the cycle.

**Phase 5 Example**:
- Smoke test script needs monitor integration to verify it works
- Monitor integration needs smoke test script to exist
- Agent loops: "Can't implement smoke test until monitor is ready, can't verify monitor until smoke test exists"

**Symptoms**:
- Planning documents reference "will implement X after Y is ready"
- Multiple incomplete implementations
- No progress despite high activity
- Context fills with circular reasoning

**Guardrails**:

```typescript
// Circular Dependency Breaker Protocol
if (taskRequiresDependency && dependencyRequiresTask) {
  // BREAK THE CYCLE:
  // 1. Implement stub/mock for one component
  // 2. Implement real version of other component
  // 3. Replace stub with real implementation
  // 4. Verify integration

  console.log('CIRCULAR DEPENDENCY DETECTED');
  console.log('Resolution: Implement stub for Component A, build Component B against stub, replace stub');
}
```

**Prevention Rules**:
- When detecting "A needs B AND B needs A", IMMEDIATELY create stub for one
- Stubs are ACCEPTABLE temporary solutions
- Mark stub with TODO and file:line reference
- Replace stub in SAME work session after other component works
- **Never leave work session with stubs in place**

### 2. Perfectionism / Over-Engineering

**Description**: Agent tries to build complete, perfect solution instead of minimal viable implementation.

**Phase 5 Example**:
- Simple smoke test script (127 lines) was sufficient
- Codex may have tried to build comprehensive test framework with:
  - Edge case handling for every scenario
  - Sophisticated error recovery
  - Extensive logging and telemetry
  - Configurable options for every parameter
  - Perfect abstractions and modularity

**Symptoms**:
- Implementation exceeds time estimate by >2x
- Design documents grow longer instead of code being written
- "Just need to add X feature" repeated multiple times
- Scope creep without explicit requirement changes

**Guardrails**:

```markdown
## MANDATORY: MVP-First Protocol

Before implementing ANY feature, define MVP (Minimum Viable Product):

**MVP Checklist**:
- [ ] What's the SIMPLEST version that meets acceptance criteria?
- [ ] What can I cut and still have it work?
- [ ] What can be added LATER if needed?
- [ ] Have I listed "nice to haves" separately from "must haves"?

**Implementation Rule**:
1. Implement MVP ONLY
2. Verify it works
3. STOP unless additional features explicitly required
4. Document "future enhancements" separately

**"Good Enough" Threshold**:
If implementation meets ALL acceptance criteria → STOP
Additional improvements are optional, not required
```

**Prevention Rules**:
- Define MVP before writing ANY code
- Separate "must have" from "nice to have"
- Implement must-haves first
- Only add nice-to-haves if time permits AND they're needed
- **Default to simplest solution, not most sophisticated**

### 3. Unclear Success Criteria

**Description**: Agent doesn't know when task is "done", keeps adding features indefinitely.

**Phase 5 Example**:
- Acceptance criteria: "Monitor state automatically invokes smoke test after task completion"
- Unclear: What defines "invokes"? What if smoke test fails? What's tested?
- Agent may have kept adding features thinking "not complete yet"

**Symptoms**:
- Task marked "almost done" multiple times
- New requirements discovered continuously
- No clear exit condition
- "Just need to add X" without end

**Guardrails**:

```markdown
## MANDATORY: Define Exit Criteria BEFORE Implementation

At SPEC stage, answer:

**Done Criteria** (ALL must be true):
- [ ] Feature X does Y when Z occurs
- [ ] Tests pass: [list specific tests]
- [ ] Build passes with 0 errors
- [ ] Documentation complete: [list docs]
- [ ] Edge cases handled: [list cases]

**NOT Done Criteria** (explicitly out of scope):
- [ ] Future enhancement A
- [ ] Nice-to-have B
- [ ] Optimization C (unless performance requirement)

**Exit Rule**:
When ALL "Done Criteria" met → STOP implementation
Review done criteria before proceeding to next task
```

**Prevention Rules**:
- Write EXPLICIT exit criteria at SPEC stage
- Include acceptance criteria from requirements
- List edge cases that MUST be handled
- Document what's OUT OF SCOPE
- Check exit criteria before claiming "done"
- If unsure if done → ASK USER, don't keep adding features

### 4. Missing Escalation Triggers

**Description**: Agent doesn't recognize "I'm stuck" and continues iterating without asking for help.

**Phase 5 Example**:
- Codex worked on Phase 5 "for quite a long time"
- No escalation despite lack of progress
- Should have escalated after N hours or M iterations

**Symptoms**:
- Same error appears >3 times
- Fix A breaks B, fix B breaks A (regression loop)
- No progress after multiple hours
- Context filled with failed attempts

**Guardrails**:

```markdown
## MANDATORY: Escalation Protocol

**Escalate IMMEDIATELY if ANY condition true**:

1. **Time-Box Exceeded**
   - Estimated 2 hours, now at 4 hours → ESCALATE
   - Rule: 2x time estimate = escalation threshold

2. **Iteration Loop Detected**
   - Same fix attempted >3 times → ESCALATE
   - Fix A breaks B, fix B breaks A → ESCALATE

3. **No Progress Signal**
   - No tests passing after 3 attempts → ESCALATE
   - Build still failing after 5 fixes → ESCALATE

4. **Circular Dependency**
   - A needs B, B needs A, no stub strategy working → ESCALATE

5. **Requirements Ambiguity**
   - Can't determine if implementation meets acceptance criteria → ESCALATE
   - Multiple valid interpretations of requirement → ESCALATE

6. **Context Overload**
   - Context filled with >3 failed approaches → ESCALATE
   - Can't remember what was tried → ESCALATE

**Escalation Format**:
```
@user - Escalation: [Brief Problem Statement]

**Time Invested**: X hours (estimate was Y hours)

**Attempts**:
1. [Approach 1] → [Result/Why it failed]
2. [Approach 2] → [Result/Why it failed]
3. [Approach 3] → [Result/Why it failed]

**Blockers**:
- [Specific blocker 1]
- [Specific blocker 2]

**Hypothesis**: [What I think the root cause is]

**Recommendation**: [Proposed solution or request for guidance]
```
```

**Prevention Rules**:
- Set time estimate at SPEC stage
- Check time every 30 minutes
- If exceeding 2x estimate → STOP and escalate
- Track iterations (maintain counter)
- If >3 identical failures → STOP and escalate
- **Never iterate >5 times without escalation**

### 5. Integration Theater

**Description**: Agent claims integration is complete but never actually verified it works end-to-end.

**Phase 5 Example**:
- Monitor runner may have LOOKED like it integrated smoke tests
- But never actually RAN the integrated system end-to-end
- "Integration complete" without runtime verification

**Symptoms**:
- Code calls integration point but doesn't use output
- Tests mock integration instead of testing real integration
- Integration "complete" but no end-to-end smoke test
- Documentation describes integration but no evidence it works

**Guardrails**:

```markdown
## MANDATORY: Integration Verification Protocol

**Integration is NOT complete until ALL verified**:

1. **Programmatic Verification**
   - Create `scripts/verify_<system>_integration.sh`
   - Automated checks: called? output used? tests exist?
   - Must exit 0 before claiming integration complete

2. **Runtime Verification**
   - Actually RUN the integrated system end-to-end
   - Not mocked, not stubbed - REAL integration
   - Capture output, verify expected behavior

3. **Integration Tests**
   - Write test that proves data flows through integration
   - Test must verify output is USED, not just called
   - Example: `expect(result).toContain(integratedSystemOutput)`

4. **Evidence Package**
   - Verification script output
   - Integration test results
   - Runtime execution logs
   - Screenshot/recording if applicable

**See**: `docs/CLAUDE.md` § "Programmatic Integration Verification"
```

**Prevention Rules**:
- Never claim "integration complete" without runtime verification
- Create verification script for every integration
- Integration tests must prove data flows end-to-end
- Run integrated system, don't just check that code compiles
- **If you can't prove it works → it's not integrated**

### 6. Analysis Paralysis

**Description**: Agent spends excessive time planning perfect architecture instead of implementing.

**Phase 5 Example**:
- Smoke test script is straightforward: run build, run tests, check health
- May have spent hours designing "the right abstraction"
- Over-analyzed trade-offs instead of implementing simple solution

**Symptoms**:
- Multiple design documents without code
- Comparisons of 5+ approaches
- Perfect abstraction sought before writing code
- More time planning than implementing

**Guardrails**:

```markdown
## MANDATORY: Time-Boxed Planning

**Planning Time Limits**:
- Small task (< 100 lines): 15 minutes planning
- Medium task (100-500 lines): 30 minutes planning
- Large task (>500 lines): 1 hour planning
- If planning exceeds limit → START IMPLEMENTING

**Planning Deliverables**:
- List of files to create/modify
- List of functions to implement
- Acceptance criteria
- MVP scope definition
- **NOT REQUIRED**: Perfect architecture, every edge case, all optimizations

**Implementation Rule**:
- Start with simplest approach
- Refactor AFTER it works (if needed)
- Don't optimize prematurely
- **Prefer working code over perfect design**
```

**Prevention Rules**:
- Set 30-minute timer for planning
- When timer expires → START CODING
- Implement simplest version first
- Refactor only if needed
- **Done is better than perfect**

### 7. Missing "Good Enough" Detection

**Description**: Agent doesn't recognize when implementation is sufficient, continues improving indefinitely.

**Phase 5 Example**:
- Smoke test script works, passes tests, meets acceptance criteria
- But agent keeps adding "just one more feature"
- Never declares "this is good enough"

**Symptoms**:
- Feature creep without new requirements
- Continuous refactoring without bugs to fix
- "Could be better" without "good enough" check
- No stopping condition

**Guardrails**:

```markdown
## MANDATORY: "Good Enough" Checklist

**After each implementation, CHECK**:

**Acceptance Criteria** (from SPEC):
- [ ] Does implementation meet ALL acceptance criteria?

**Quality Gates**:
- [ ] Build passes (0 errors)?
- [ ] All tests pass?
- [ ] npm audit clean?
- [ ] Runtime verification passed?

**Edge Cases** (from SPEC):
- [ ] All required edge cases handled?

**Documentation**:
- [ ] Code documented?
- [ ] Integration points clear?

**If ALL checkboxes true → IMPLEMENTATION IS GOOD ENOUGH**

**Stop Rule**:
- If good enough → STOP implementing
- If not good enough → identify specific gap, fix ONLY that gap
- If "could be better" but meets criteria → STOP

**Future Improvements**:
- Document in "Future Enhancements" section
- Create follow-up task if needed
- Do NOT implement now
```

**Prevention Rules**:
- Run "Good Enough" checklist after implementation
- If meets acceptance criteria → STOP
- Distinguish "required" from "optional" improvements
- **Ship when criteria met, not when perfect**

### 8. Context Overflow / History Blindness

**Description**: After many iterations, context fills with failed attempts, obscuring simple solution.

**Phase 5 Example**:
- After hours of work, context contains:
  - 10 failed smoke test implementations
  - 5 different monitor integration approaches
  - Extensive error logs
- Simple solution buried under history

**Symptoms**:
- Can't remember what was tried
- Repeating approaches that already failed
- Difficulty finding relevant information
- Context length warnings

**Guardrails**:

```markdown
## MANDATORY: Context Reset Protocol

**Trigger Context Reset if ANY true**:
- 3+ failed approaches documented
- Context length >10k tokens
- Can't remember what was tried
- Repeating failed approaches

**Reset Procedure**:
1. **Summarize Progress**:
   - What worked
   - What failed and why
   - Current blocker
   - Next approach

2. **Create Checkpoint**:
   - Save summary to file
   - Commit working code (even if incomplete)
   - Document state in context.md

3. **Start Fresh Session**:
   - Read checkpoint
   - Ignore old context
   - Approach problem with fresh perspective

4. **Escalate if Reset Doesn't Help**:
   - If 2 resets don't solve problem → ESCALATE TO USER
```

**Prevention Rules**:
- Limit context to current approach only
- Don't include all failed attempts in context
- Checkpoint after each failed approach
- Reset context after 3 failures
- **Fresh start beats historical baggage**

### 9. "Am I Repeating Work?" Blindness

**Description**: Agent doesn't recognize it's repeating the same failed approach.

**Phase 5 Example**:
- Try to implement smoke script → fails
- Try different implementation → fails
- Try FIRST implementation again → fails
- Cycle repeats without recognition

**Symptoms**:
- Same error message appears multiple times
- Same code pattern attempted repeatedly
- No learning from failures
- Infinite loop without detection

**Guardrails**:

```markdown
## MANDATORY: Iteration Tracking

**Maintain Iteration Log**:
```typescript
interface IterationLog {
  attempt: number;
  approach: string;
  result: 'success' | 'failure';
  error?: string;
  timestamp: string;
}

const iterations: IterationLog[] = [];

function recordIteration(approach: string, result: 'success' | 'failure', error?: string) {
  iterations.push({ attempt: iterations.length + 1, approach, result, error, timestamp: new Date().toISOString() });

  // Check for repeated failures
  const recentFailures = iterations.slice(-3);
  if (recentFailures.every(i => i.result === 'failure')) {
    console.log('⚠️  3 consecutive failures detected');
    checkForRepeatedApproaches(recentFailures);
  }
}

function checkForRepeatedApproaches(iterations: IterationLog[]) {
  const approaches = iterations.map(i => i.approach);
  const repeated = approaches.filter((a, i) => approaches.indexOf(a) !== i);

  if (repeated.length > 0) {
    console.log('❌ REPEATED APPROACH DETECTED');
    console.log('You tried this before and it failed:');
    console.log(repeated);
    console.log('ESCALATE TO USER - trying same approach repeatedly');
  }
}
```

**Before Each Attempt**:
- [ ] Have I tried this approach before?
- [ ] If yes, why will it work this time?
- [ ] If no new information → don't repeat, escalate
```

**Prevention Rules**:
- Document each approach before attempting
- Check if approach was tried before
- If repeating → must have new information justifying retry
- If no new information → ESCALATE instead of retry
- **Never try same approach >2 times**

### 10. No Progress Tracking / Velocity Awareness

**Description**: Agent doesn't track if making progress, doesn't notice when velocity drops to zero.

**Phase 5 Example**:
- Hour 1: Planned smoke test
- Hour 2: Implemented smoke test
- Hour 3: Fixed error 1
- Hour 4: Fixed error 2
- Hour 5: Fixed error 3
- Hour 6: Fixed error 4
- Agent doesn't notice: "I've been fixing errors for 4 hours without shipping"

**Symptoms**:
- High activity, no deliverables
- Many commits, no progress
- Busy work without outcomes
- Time passes without task completion

**Guardrails**:

```markdown
## MANDATORY: Progress Tracking

**Track Progress Every 30 Minutes**:

```typescript
interface ProgressCheckpoint {
  timestamp: string;
  elapsed: number; // minutes
  completed: string[]; // What's done
  inProgress: string; // Current task
  blockers: string[]; // What's blocking
  nextMilestone: string; // Next goal
  velocityOK: boolean; // Making progress?
}

function checkProgress(checkpoints: ProgressCheckpoint[]): void {
  const recent = checkpoints.slice(-3); // Last 90 minutes

  // Check: Are we completing tasks?
  const tasksCompleted = recent.reduce((sum, c) => sum + c.completed.length, 0);
  if (tasksCompleted === 0) {
    console.log('⚠️  NO TASKS COMPLETED IN 90 MINUTES');
    console.log('Current activity: fixing errors, refactoring, planning');
    console.log('RECOMMENDATION: Escalate or pivot approach');
  }

  // Check: Are blockers growing?
  const blockerGrowth = recent[2].blockers.length - recent[0].blockers.length;
  if (blockerGrowth > 0) {
    console.log('⚠️  BLOCKERS INCREASING');
    console.log('Started with', recent[0].blockers.length, 'now have', recent[2].blockers.length);
    console.log('RECOMMENDATION: Escalate blockers to user');
  }
}
```

**Progress Checklist** (every 30 min):
- [ ] What did I complete in last 30 min?
- [ ] Am I closer to "done" than 30 min ago?
- [ ] Are new blockers appearing?
- [ ] If no progress → why? what's blocking?
- [ ] If blocked >90 min → ESCALATE
```

**Prevention Rules**:
- Set 30-minute timer
- Check progress at each timer
- If no completions in 90 min → ESCALATE
- Track velocity (completions per hour)
- **If velocity = 0 for >1 hour → ESCALATE**

---

## Integration into Agent Documentation

These guardrails should be integrated into:

### agent.md Updates

**Stage 0: STRATEGIZE** (add):
```markdown
**Meta-Cognitive Pre-Flight Checks**:
- [ ] Have I defined MVP vs nice-to-have?
- [ ] Do I have explicit exit criteria?
- [ ] Have I set time-box for this task?
- [ ] Do I know when to escalate?
- [ ] Am I attempting something I tried before?
```

**Stage 4: IMPLEMENT** (add):
```markdown
**Circular Dependency Protocol**:
If A needs B AND B needs A → implement stub for one, build other, replace stub

**Progress Tracking**:
Every 30 minutes:
- What's done?
- What's blocking?
- Am I making progress?
- If velocity = 0 for 90 min → ESCALATE
```

**Stage 5: VERIFY** (add):
```markdown
**Integration Verification**:
- [ ] Created verification script?
- [ ] Ran integrated system end-to-end?
- [ ] Integration tests prove data flows?
- [ ] Evidence package complete?
```

**Stage 6: REVIEW** (add):
```markdown
**"Good Enough" Checklist**:
- [ ] All acceptance criteria met?
- [ ] All quality gates passed?
- [ ] All required edge cases handled?
- If YES to all → STOP implementing

**Escalation Check**:
- [ ] Did I exceed 2x time estimate?
- [ ] Did I repeat same fix >3 times?
- [ ] Did I have 0 progress for >90 min?
- If YES to any → should have ESCALATED
```

### CLAUDE.md Updates

**Operational Checklist** (add):
```markdown
- **Meta-cognitive awareness**: Run progress check every 30 minutes. If no deliverables in 90 min → escalate.
- **Iteration tracking**: Before retrying approach, confirm it wasn't already attempted. Max 3 iterations before escalation.
- **Time-boxing**: If task exceeds 2x estimate → escalate with summary of attempts and blockers.
```

**Decision Framework** (add):
```markdown
- **Escalation triggers**: Circular dependencies unsolved after stub strategy, >3 identical failures, >90 min without progress, context overflow requiring reset.
- **Progress velocity**: Track completions per hour. If velocity drops to 0 for >1 hour → investigate blocker or escalate.
```

---

## Monitoring and Enforcement

### Automated Checks

```typescript
// tools/wvo_mcp/src/orchestrator/meta_cognition_monitor.ts

export class MetaCognitionMonitor {
  private iterations: Map<string, number> = new Map();
  private startTime: Map<string, number> = new Map();
  private lastProgress: Map<string, number> = new Map();

  /**
   * Check if agent should escalate based on meta-cognitive signals
   */
  shouldEscalate(taskId: string, context: TaskContext): EscalationSignal | null {
    // Check 1: Time-box exceeded
    const elapsed = Date.now() - this.startTime.get(taskId)!;
    const estimate = context.estimatedMinutes * 60 * 1000;
    if (elapsed > estimate * 2) {
      return {
        reason: 'time-box-exceeded',
        details: `Task estimated ${context.estimatedMinutes}min, now at ${elapsed / 60000}min`,
        recommendation: 'Escalate with summary of blockers',
      };
    }

    // Check 2: Iteration loop
    const iterationCount = this.iterations.get(taskId) ?? 0;
    if (iterationCount > 3) {
      return {
        reason: 'iteration-loop',
        details: `Task has ${iterationCount} iterations without success`,
        recommendation: 'Escalate with attempted approaches',
      };
    }

    // Check 3: No progress
    const lastProgressTime = this.lastProgress.get(taskId) ?? this.startTime.get(taskId)!;
    const timeSinceProgress = Date.now() - lastProgressTime;
    if (timeSinceProgress > 90 * 60 * 1000) {
      return {
        reason: 'no-progress',
        details: `No progress for ${timeSinceProgress / 60000}min`,
        recommendation: 'Escalate with current blocker',
      };
    }

    return null;
  }

  recordIteration(taskId: string): void {
    const count = this.iterations.get(taskId) ?? 0;
    this.iterations.set(taskId, count + 1);
  }

  recordProgress(taskId: string): void {
    this.lastProgress.set(taskId, Date.now());
  }
}
```

### Dashboard Integration

Add to observability dashboard (Phase 8):
- **Meta-cognition alerts**: Tasks exceeding time-box, iteration loops, no progress
- **Escalation metrics**: How often agents escalate vs push through blockers
- **Velocity tracking**: Completions per hour, identify zero-velocity periods
- **Pattern detection**: Repeated approaches, circular dependencies

---

## Case Study: Phase 5 Smoke Test Implementation

**What Codex Likely Did** (failure mode):
1. Started planning comprehensive smoke test framework
2. Got stuck on circular dependency (smoke test ↔ monitor integration)
3. Attempted multiple implementations without verification
4. Fixed errors repeatedly without checking if repeating same fix
5. Context filled with failed attempts
6. No escalation despite hours of work
7. Never defined "good enough" criteria

**What Should Have Happened** (with guardrails):
1. **STRATEGIZE**: Define MVP smoke test (just 5 checks, exit codes)
2. **SPEC**: Exit criteria = "script exists, monitor calls it, tests pass"
3. **PLAN**: Time-box = 2 hours (estimate)
4. **IMPLEMENT**: Create minimal script first
5. **VERIFY**: Run end-to-end, verify integration
6. **30-min check**: Progress? Yes → continue. No → escalate.
7. **REVIEW**: Meets exit criteria? Yes → DONE

**Result**: Task completed in ~1 hour instead of multiple sessions.

---

## Summary of Guardrails

1. **Circular Dependency Breaker**: Implement stubs to break cycles
2. **MVP-First Protocol**: Define and implement minimum viable product
3. **Explicit Exit Criteria**: Know when you're done
4. **Escalation Triggers**: Time-box, iterations, no progress
5. **Integration Verification**: Programmatic checks, runtime verification
6. **Time-Boxed Planning**: Limit planning time, start coding
7. **"Good Enough" Checklist**: Stop when acceptance criteria met
8. **Context Reset**: Fresh start after 3 failures
9. **Iteration Tracking**: Detect repeated approaches
10. **Progress Monitoring**: Track velocity, escalate if zero

**Core Principle**: **Bias toward action over analysis. Ship working code over perfect design. Escalate early over iterate endlessly.**

---

**Status**: Meta-cognitive guardrails defined. Next: integrate into agent.md and CLAUDE.md.
