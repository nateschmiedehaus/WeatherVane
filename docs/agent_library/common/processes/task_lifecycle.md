# Task Lifecycle

How tasks flow from creation to completion.

---

## Lifecycle States

```
┌─────────┐
│ pending │ ─────────────┐
└─────────┘              │
     │                   │
     │ assign            │ block
     ↓                   ↓
┌──────────────┐    ┌─────────┐
│ in_progress  │ ←──│ blocked │
└──────────────┘    └─────────┘
     │          unblock
     │
     │ complete verification loop
     ↓
┌──────┐
│ done │
└──────┘
```

---

## State Definitions

### pending

**Meaning**: Task exists but hasn't been assigned yet

**Conditions**:
- Task created in roadmap
- Dependencies not yet met, OR
- Dependencies met but no agent available

**Who can move to pending**: Atlas (task creation), Orchestrator (stale recovery)

**Next states**:
- `in_progress` (when assigned to agent)
- `blocked` (if blocker discovered before assignment)

---

### in_progress

**Meaning**: Task is actively being worked on by an agent

**Conditions**:
- Agent assigned to task
- All dependencies are `done`
- Agent is actively executing

**Who can move to in_progress**: Orchestrator (task assignment), Agent (self-assignment)

**Next states**:
- `done` (when verification loop complete)
- `blocked` (when blocker encountered)
- `pending` (if stale task recovered)

**Duration limits**:
- **Normal**: 1-4 hours
- **Warning**: >4 hours (may be stale)
- **Critical**: >24 hours (likely stale, auto-recover)

---

### blocked

**Meaning**: Task cannot proceed due to external blocker

**Conditions**:
- Agent encounters blocker (external dependency, unclear requirement, etc.)
- Agent explicitly sets status to `blocked`
- Blocker documented in task metadata or context

**Who can move to blocked**: Agent (when encountering blocker)

**Next states**:
- `in_progress` (when blocker resolved)
- `pending` (if needs reassignment)

**Blocker types**:
1. **External dependency**: Waiting for API key, credentials, etc.
2. **Unclear requirement**: Needs clarification from Atlas/stakeholder
3. **Technical blocker**: Stuck on implementation (escalate to Atlas)
4. **Resource constraint**: Needs more memory, API quota, etc.

---

### done

**Meaning**: Task completed and verified

**Conditions**:
- ALL verification loop steps pass:
  1. Build (0 errors)
  2. Test (all pass, 7/7 coverage)
  3. Audit (0 vulnerabilities)
  4. Runtime (works end-to-end)
  5. Documentation (complete)
- Spec & Plan reviewers approved:
  ```bash
  npm run spec:review -- <TASK-ID>
  npm run plan:review -- <TASK-ID>
  ```
  Approvals logged in `state/analytics/spec_reviews.jsonl` and `plan_reviews.jsonl`.
  See `docs/workflows/AFP_REVIEWER_ROUTINE.md` for the full reviewer + Wave 0 command flow and log locations.
- Daily artifact health audit committed within the last 24 hours (rotate overrides + summary)
- Guardrail monitor (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) reports PASS (or CI guardrail job is green)
- Quality gates pass
- Agent marks as done

**Who can move to done**: Agent (after verification)

**Next states**: None (terminal state)

**Reversal**: If bug found later, create new task (don't reopen)

---

## Lifecycle Operations

### 1. Task Creation

**Who**: Atlas or automated roadmap generation

**Process**:
```yaml
# Add to state/roadmap.yaml
tasks:
  - id: T1.2.5
    title: "Implement weather data caching"
    epic_id: E1
    milestone_id: M1
    status: pending
    priority: high
    complexity: 5
    dependencies: [T1.2.4]
    metadata:
      estimated_hours: 3
      skills_required: ["typescript", "caching"]
```

**Then sync**:
```bash
node scripts/force_roadmap_sync.mjs
```

---

### 2. Task Assignment

**Who**: Orchestrator (via `prefetchTasks`)

**Criteria**:
- Task status is `pending`
- All dependencies are `done`
- Agent available (not at WIP limit)
- Agent capability matches complexity

**Process**:
```typescript
// Orchestrator selects task
const task = await plan_next({ limit: 1 })[0];

// Assign to agent
await plan_update({
  task_id: task.id,
  status: "in_progress"
});

// Agent receives task and starts work
```

---

### 3. Task Execution

**Who**: Agent (Worker)

**Process**:

**a. Start work**:
```typescript
// Log start
logInfo('Starting task', { task_id: 'T1.2.5', agent: 'worker_1' });

// Read task details
const task = await readTask('T1.2.5');

// Understand requirements
// - Read epic/milestone context
// - Check dependencies
// - Review acceptance criteria
```

**b. Complete AFP 10-Phase Planning (BEFORE coding)**:

**CRITICAL: You MUST complete phases 1-5 BEFORE writing ANY code.**

See `MANDATORY_WORK_CHECKLIST.md`, `AGENTS.md`, and `docs/concepts/afp_work_phases.md` for details.

**Phases 1-4: COGNITIVE/THINKING PHASES**
1. **STRATEGIZE**: Understand WHY (not just WHAT) - problem analysis, root cause, goals
2. **SPEC**: Define success criteria, acceptance criteria, requirements
3. **PLAN**: Design approach using AFP/SCAS (via negativa, refactor not patch, files/LOC estimate)
4. **THINK**: Reason through edge cases, failure modes, complexity

**Phase 5: [GATE] - MANDATORY CHECKPOINT**

**⚠️ GATE REVIEWS PHASES 1-4 (YOUR THINKING), NOT IMPLEMENTATION**

**Purpose**: Ensure AFP/SCAS thinking is solid BEFORE you write any code. GATE prevents:
- Jumping to implementation without thinking
- Patching instead of refactoring
- Adding instead of deleting
- Missing alternatives exploration

**For NON-TRIVIAL work (>1 file or >20 LOC)**:

**Step 1: Create design.md from template**
```bash
mkdir -p state/evidence/T1.2.5/
cp docs/templates/design_template.md state/evidence/T1.2.5/design.md
```

**Step 2: Fill in ALL sections (this is your phases 1-4 thinking)**
- Context: Problem, root cause, goal (STRATEGIZE)
- Via Negativa: What can you DELETE/SIMPLIFY? (PLAN)
- Refactor vs Repair: Patching or refactoring root cause? (PLAN)
- Alternatives: 2-3 approaches considered (SPEC/PLAN)
- Complexity: Justified? Mitigated? (THINK)
- Implementation Plan: Files, LOC, risks, testing (PLAN/THINK)

**Step 3: Test with DesignReviewer (BEFORE committing)**
```bash
cd tools/wvo_mcp && npm run gate:review T1.2.5 && cd ../..
```

**Step 4: If BLOCKED (expect this on first try):**

🚨 **CRITICAL: You must GO BACK to phases 1-4 and REDO your thinking**

DesignReviewer will tell you what's wrong with your THINKING:
- "via_negativa_missing" → Go back to PLAN phase, explore deletion
- "insufficient_alternatives" → Go back to SPEC/PLAN, explore options
- "repair_not_refactor" → Go back to STRATEGIZE, find root cause

**DO NOT just edit design.md superficially**

**Remediation process:**
```bash
# 1. Create remediation task
REMED_ID="T1.2.5-REMEDIATION-$(date +%s)"
mkdir -p state/evidence/$REMED_ID

# 2. GO BACK to STRATEGIZE phase
#    - Rethink the problem based on DesignReviewer concerns
#    - Create strategy.md, spec.md, plan.md if they don't exist
#    - Update them based on what you learned

# 3. Do actual research (30-60 min per critical issue)
#    - Examine code for deletion opportunities
#    - Explore alternative approaches
#    - Design full refactors

# 4. Update design.md with revised thinking
#    - Reflect what you learned in remediation
#    - Show specific files examined, alternatives explored

# 5. Re-test
cd tools/wvo_mcp && npm run gate:review T1.2.5 && cd ../..
```

**Step 5: When APPROVED, stage and commit**
```bash
git add state/evidence/T1.2.5/design.md
git commit  # Hook will run DesignReviewer automatically
```

**⚠️ IF YOU SKIP GATE:**
- Pre-commit hook will BLOCK your commit
- You'll have to redo your work after rethinking with AFP/SCAS lens
- You're violating the work process

**For TRIVIAL work (≤1 file, ≤20 LOC)**:
- Document reasoning inline in code comments
- No separate evidence file required

**c. Execute (Phase 6: IMPLEMENT)**:
```typescript
// NOW you can implement (ONLY after GATE approval)
// Implement feature
// Make the PLAN-authored tests pass (no new tests here—return to PLAN if coverage is missing)
// Document changes
// Autopilot work: integrate Wave 0 supervision and keep PLAN's live steps in sync
```

**d. Verify (Phase 7: VERIFY)**:
```typescript
// Complete verification loop (iteratively)
// 1. Build (0 errors)
// 2. Run the tests authored during PLAN (all pass, 7/7 coverage). Need new tests? Go back to PLAN first.
// 3. Audit (0 vulnerabilities)
// 4. Runtime (works end-to-end)
// 5. Documentation (complete)
// Autopilot work: execute Wave 0 live loop exactly as written in PLAN (start Wave 0, observe task completion, capture telemetry)
```

**e. Review (Phase 8: REVIEW)**:

**⚠️ REVIEW IS DIFFERENT FROM GATE**

- **GATE (phase 5)**: Reviews your DESIGN THINKING (phases 1-4) BEFORE implementation
  - Checks: via negativa, refactor vs repair, alternatives, complexity
  - If fails: GO BACK to STRATEGIZE/SPEC/PLAN/THINK and redo

- **REVIEW (phase 8)**: Reviews your IMPLEMENTATION QUALITY (phase 6) AFTER coding
  - Checks: code quality, test coverage, documentation, AFP/SCAS compliance in code
  - If fails: Fix implementation or refactor

**Review checklist (Phase 8)**:
```typescript
// Quality check of implementation
- ✅ Code follows AFP/SCAS principles (no patches, refactored cleanly)
- ✅ Tests are comprehensive (7/7 dimensions)
- ✅ Documentation is complete
- ✅ No technical debt introduced
- ✅ Micro-batching limits respected (≤5 files, ≤150 LOC)
```

**f. Complete (Phase 9-10: PR and MONITOR)**:
```typescript
// Only when ALL verification AND review steps pass
await plan_update({
  task_id: 'T1.2.5',
  status: 'done'
});

logInfo('Task completed', { task_id: 'T1.2.5', duration_minutes: 95 });
```

---

### 4. Task Blocking

**Who**: Agent (when encountering blocker)

**Process**:

**a. Detect blocker**:
```typescript
// Example: API credentials missing
if (!process.env.WEATHER_API_KEY) {
  // Cannot proceed
}
```

**b. Document blocker**:
```typescript
await context_write({
  section: "Blockers",
  content: `T1.2.5 blocked: Missing WEATHER_API_KEY environment variable.
            Tried checking .env, process.env, secret manager - not found anywhere.
            Need stakeholder to provide credentials.`,
  append: true
});
```

**c. Update status**:
```typescript
await plan_update({
  task_id: 'T1.2.5',
  status: 'blocked'
});
```

**d. Escalate** (if stuck >30 min):
```typescript
await context_write({
  section: "Escalations",
  content: "🚨 @Atlas - T1.2.5 blocked >30 min. See Blockers section for details.",
  append: true
});
```

---

### 5. Task Unblocking

**Who**: Atlas, Director Dana, or agent (when blocker resolved)

**Process**:

**a. Resolve blocker**:
```bash
# Example: Credentials provided
export WEATHER_API_KEY="sk_live_abc123"
```

**b. Document resolution**:
```typescript
await context_write({
  section: "Blockers",
  content: "✅ RESOLVED - T1.2.5: API key provided by stakeholder, added to .env",
  append: true
});
```

**c. Update status**:
```typescript
await plan_update({
  task_id: 'T1.2.5',
  status: 'in_progress'  // Back to in_progress
});
```

**d. Resume work**:
```typescript
// Agent continues where they left off
```

---

### 6. Stale Task Recovery

**Who**: Orchestrator (automatic)

**Trigger**: Task in `in_progress` for >10 minutes with no activity

**Process**:
```typescript
// Runs every 5 minutes
const staleThreshold = 10 * 60 * 1000; // 10 minutes
const staleTasks = await findStaleTasks(staleThreshold);

for (const task of staleTasks) {
  logWarn('Recovering stale task', { task_id: task.id, stale_duration_minutes: task.staleDuration });

  await plan_update({
    task_id: task.id,
    status: 'pending'  // Reset to pending
  });
}

// Refetch tasks to fill queue
await prefetchTasks();
```

**Causes of stale tasks**:
- Agent crashed
- Network interruption
- Process killed without cleanup
- Database lock prevented status update

---

## Task Metadata

**Tracked throughout lifecycle**:

```yaml
metadata:
  estimated_hours: 3
  actual_hours: 2.5
  assigned_to: worker_1
  assigned_at: "2025-10-23T10:00:00Z"
  started_at: "2025-10-23T10:05:00Z"
  completed_at: "2025-10-23T12:35:00Z"
  blocked_at: null
  blocker_reason: null
  verification_attempts: 3
  critic_feedback:
    - critic: tests
      status: pass
      timestamp: "2025-10-23T12:30:00Z"
    - critic: security
      status: pass
      timestamp: "2025-10-23T12:32:00Z"
```

---

## Lifecycle Metrics

### Cycle Time

**Definition**: Time from `pending` to `done`

**Formula**: `completed_at - created_at`

**Target**: <4 hours for complexity ≤6 tasks

### Lead Time

**Definition**: Time from creation to `done`

**Formula**: `completed_at - created_at`

**Includes**: Time waiting in queue + cycle time

### Work in Progress (WIP)

**Definition**: Count of tasks in `in_progress`

**Target**: ≤ agent count (1 task per agent)

**Constraint**: WIP limit enforced by orchestrator

### Throughput

**Definition**: Tasks completed per time period

**Formula**: `done_tasks / time_period`

**Target**: 5-10 tasks per day (varies by team size)

---

## Common Issues

### Issue: Tasks stuck in `in_progress`

**Symptom**: Task shows `in_progress` for >24 hours

**Causes**:
- Agent crashed without updating status
- Verification loop taking too long
- Blocker not documented

**Fix**:
- Automatic stale recovery (every 5 min)
- Or manual: `plan_update({ task_id, status: 'pending' })`

### Issue: Tasks prematurely marked `done`

**Symptom**: Bugs found in "completed" tasks

**Root cause**: Verification loop not completed

**Fix**:
- Enforce verification loop (no shortcuts)
- Critic review before marking done
- Add tests for the bug (regression)

### Issue: Too many `blocked` tasks

**Symptom**: >10% of tasks are `blocked`

**Causes**:
- Missing dependencies
- Unclear requirements
- External blockers not resolved

**Fix**:
- Review roadmap for missing dependencies
- Clarify requirements proactively
- Escalate external blockers faster

---

## Best Practices

### 1. Keep Tasks Atomic

**Good**: Task completable in 1-4 hours
**Bad**: Task taking >8 hours

**If too large**: Break into subtasks

### 2. Update Status Promptly

**When starting**: Immediately mark `in_progress`
**When blocked**: Immediately mark `blocked` (don't wait)
**When done**: Mark `done` only after verification loop

### 3. Document Blockers

**Always include**:
- What's blocking you
- What you tried
- What you need to proceed

### 4. Complete Verification Loop

**Before marking `done`**:
- ✅ Build passes
- ✅ Tests pass (7/7 dimensions)
- ✅ Audit passes
- ✅ Runtime works
- ✅ Docs complete

**No shortcuts!**

### 5. Log State Changes

**For debugging and metrics**:
```typescript
logInfo('Task state change', {
  task_id: 'T1.2.5',
  from: 'pending',
  to: 'in_progress',
  agent: 'worker_1',
  timestamp: new Date().toISOString()
});
```

---

## Task Lifecycle Hooks

**Hooks** (future enhancement):

### onTaskAssigned

```typescript
onTaskAssigned(async (task) => {
  // Notify agent
  // Log assignment
  // Start timer
});
```

### onTaskBlocked

```typescript
onTaskBlocked(async (task) => {
  // Alert orchestrator
  // Log blocker
  // Escalate if >30 min
});
```

### onTaskComplete

```typescript
onTaskComplete(async (task) => {
  // Run final quality check
  // Update metrics
  // Trigger dependent tasks
});
```

---

## References

- [Roadmap Management](/docs/agent_library/common/concepts/roadmap_management.md)
- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md)
- [Escalation Protocol](/docs/agent_library/common/concepts/escalation_protocol.md)
- [Blocker Escalation](/docs/agent_library/common/processes/blocker_escalation.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
