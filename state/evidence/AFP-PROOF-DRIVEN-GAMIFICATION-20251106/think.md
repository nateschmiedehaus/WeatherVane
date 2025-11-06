# Think: Edge Cases, Failure Modes, and AFP/SCAS Validation

**Task ID:** AFP-PROOF-DRIVEN-GAMIFICATION-20251106
**Phase:** THINK
**Date:** 2025-11-06

## Edge Cases

### Edge Case 1: Task With No Plan.md
**Scenario:** Task exists but plan.md missing or incomplete

**Current Behavior:** Would crash trying to parse proof criteria

**Mitigation:**
```typescript
async parseProofCriteria(taskId: string): Promise<ProofCriteria | null> {
  const planPath = path.join(evidencePath, taskId, 'plan.md');

  if (!fs.existsSync(planPath)) {
    logWarning(`No plan.md found for ${taskId}`);
    return {
      build: true,     // Default: at least check build
      test: true,      // Default: at least run tests
      runtime: [],
      integration: [],
      manual: []
    };
  }

  // ... parse criteria
}
```

**Result:** Graceful degradation to basic checks

### Edge Case 2: Plan.md Has No Proof Criteria Section
**Scenario:** Old task created before proof criteria required

**Mitigation:**
```typescript
if (!planContent.includes('## Proof Criteria')) {
  logWarning(`No proof criteria section in plan.md for ${taskId}`);
  // Use basic default criteria
  return getDefaultCriteria();
}
```

**Result:** Basic verification still happens

### Edge Case 3: Infinite Improvement Loop
**Scenario:** Agent fixes issue A → breaks issue B → fixes B → breaks A → repeat

**Detection:**
```typescript
if (task.stats.iterationCount >= 5) {
  // Escalation protocol
  await createEscalationTask({
    id: `${task.id}-ESCALATION`,
    title: `Escalate: ${task.id} stuck in iteration loop`,
    context: {
      iterations: task.stats.iterationCount,
      lastIssues: task.phases.filter(p => p.type === 'improvement')
        .slice(-10)
        .map(p => p.title)
    },
    priority: 'critical'
  });

  await updateTaskStatus(task.id, 'blocked');
  await notifyHuman(task.id, 'Infinite loop detected');
}
```

**Result:** Human intervention after 5 iterations

### Edge Case 4: All Phases Complete But Task Not Marked Proven
**Scenario:** Bug in phase completion logic, task stuck

**Detection:**
```typescript
const allPhasesComplete = task.phases.every(p => p.status === 'complete');
const taskNotProven = task.status !== 'proven';

if (allPhasesComplete && taskNotProven) {
  logError(`Inconsistent state: ${task.id} has all phases complete but not marked proven`);
  // Auto-fix
  await updateTaskStatus(task.id, 'proven');
  await generateVerifyMd(task.id, { /* evidence from phases */ });
}
```

**Result:** Self-healing for common bug

### Edge Case 5: Build/Test Commands Don't Exist
**Scenario:** Project doesn't have `npm run build` or `npm test`

**Mitigation:**
```typescript
async runBuildCheck(): Promise<CheckResult> {
  try {
    await exec('npm run build');
    return { success: true, message: 'Build passed' };
  } catch (error) {
    // Check if command doesn't exist vs build failed
    if (error.message.includes('Missing script')) {
      logWarning('No build script found, skipping build check');
      return { success: true, message: 'No build script (skipped)', skipped: true };
    }
    return { success: false, message: 'Build failed', error };
  }
}
```

**Result:** Graceful skip if command doesn't exist

### Edge Case 6: Achievement Conditions Never Met
**Scenario:** Agent behavior doesn't match achievement conditions

**Analysis:**
- If no achievements unlock after 10 tasks, achievements may be too hard
- Track unlock rates in analytics
- Adjust conditions or add easier achievements

**Monitoring:**
```typescript
const unlockRate = achievementsUnlocked / tasksCompleted;
if (unlockRate < 0.1) {  // <10% unlock rate
  logWarning('Achievement unlock rate very low, consider adjusting conditions');
}
```

### Edge Case 7: Progress Bar Rendering Issues
**Scenario:** Task has 0 phases (division by zero)

**Mitigation:**
```typescript
function renderProgressBar(completed: number, total: number): string {
  if (total === 0) {
    return '░░░░░░░░░░ 0% (0/0)';  // Handle empty task
  }

  const percentage = Math.round((completed / total) * 100);
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;

  return `${"█".repeat(filled)}${"░".repeat(empty)} ${percentage}% (${completed}/${total})`;
}
```

### Edge Case 8: Concurrent Phase Execution
**Scenario:** Two agents try to complete same phase simultaneously

**Mitigation:**
```typescript
// Use existing LeaseManager
async completePhase(taskId: string, phaseId: string, result: PhaseResult): Promise<void> {
  const leaseAcquired = await this.leaseManager.acquireLease(`${taskId}.${phaseId}`);

  if (!leaseAcquired) {
    logWarning(`Phase ${phaseId} already being completed by another agent`);
    return;
  }

  try {
    // ... complete phase
  } finally {
    await this.leaseManager.releaseLease(`${taskId}.${phaseId}`);
  }
}
```

**Result:** Only one agent can complete phase at a time

### Edge Case 9: verify.md Generation Fails
**Scenario:** File system error, permission issue, disk full

**Mitigation:**
```typescript
async generateVerifyMd(taskId: string, evidence: Evidence): Promise<void> {
  try {
    const content = formatVerifyMd(evidence);
    await fs.writeFile(verifyPath, content);
  } catch (error) {
    logError(`Failed to generate verify.md for ${taskId}`, error);
    // Store evidence in analytics as fallback
    await recordVerificationEvidence(taskId, evidence);
    // Don't block task completion
  }
}
```

**Result:** Evidence captured even if file write fails

### Edge Case 10: Proof Takes Too Long
**Scenario:** Runtime checks run indefinitely (infinite loop in code)

**Mitigation:**
```typescript
async runRuntimeChecks(criteria: RuntimeCriteria[]): Promise<CheckResult[]> {
  const TIMEOUT = 5 * 60 * 1000;  // 5 minute timeout

  return Promise.race([
    Promise.all(criteria.map(c => runCheck(c))),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Runtime checks timed out')), TIMEOUT)
    )
  ]).catch(error => {
    return [{
      success: false,
      message: 'Runtime checks timed out after 5 minutes',
      error
    }];
  });
}
```

**Result:** Proof fails gracefully after timeout

## Failure Modes

### Failure Mode 1: Agent Writes Trivial Proof Criteria
**Problem:** Agent writes "Build passes" and nothing else, easy to game

**Detection:** DesignReviewer (future Phase 2) checks criteria quality

**Immediate Mitigation:**
```typescript
// In parseProofCriteria
if (criteria.total < 3) {
  logWarning(`Only ${criteria.total} proof criteria found, expected ≥3`);
  // Add default criteria
  criteria.test = true;
  criteria.build = true;
  criteria.runtime.push({
    description: 'No errors in execution',
    command: 'node dist/index.js --dry-run'
  });
}
```

**Long-term:** GATE enforcement via DesignReviewer

### Failure Mode 2: Positive Language Feels Patronizing
**Problem:** Agents find "Great job!" messages annoying

**Analysis:**
- Start with minimal encouragement
- Monitor agent feedback (can't directly measure, but watch for patterns)
- Make encouragement opt-in or adjustable

**Mitigation:**
```typescript
// Config option
const ENCOURAGEMENT_LEVEL = process.env.ENCOURAGEMENT_LEVEL || 'moderate';

function generateEncouragingMessage(phase: TaskPhase): string {
  switch (ENCOURAGEMENT_LEVEL) {
    case 'none':
      return `${phase.title} complete`;
    case 'low':
      return `✅ ${phase.title} complete`;
    case 'moderate':
      return `✅ ${phase.title} complete! Moving to next phase`;
    case 'high':
      return `✅ ${phase.title} complete! Great work! 🎉`;
  }
}
```

### Failure Mode 3: Achievement System Ignored
**Problem:** Agents don't care about achievements

**Detection:** Zero engagement (no references to achievements in logs)

**Mitigation:**
- Achievements are supplementary, not core
- Core benefit is phase decomposition (makes iteration structural)
- If ignored, that's fine - structural changes still work

**Fallback:** Can disable achievements without breaking system

### Failure Mode 4: Phase Decomposition Creates Too Much Overhead
**Problem:** Tracking phases slows down execution significantly

**Detection:** Benchmark shows >1s overhead per task

**Mitigation:**
- Optimize hot paths (phase completion tracking)
- Cache progress calculations
- Lazy-load phase history

**Performance Target:** <100ms overhead per phase completion

### Failure Mode 5: Wave 0 Integration Breaks Existing Tasks
**Problem:** Backward compatibility failure

**Detection:** Existing tasks fail after integration

**Mitigation:**
```typescript
// In Wave 0 runner
if (task.phases && task.phases.length > 0) {
  // New: phase-based execution
  await this.phaseExecutor.execute(task);
} else {
  // Old: legacy execution
  await this.legacyExecutor.execute(task);
}
```

**Result:** Both execution paths supported during migration

### Failure Mode 6: verify.md Over-Engineering
**Problem:** Auto-generated verify.md is too verbose, loses signal

**Example:**
```markdown
# Verification (2000 lines of logs)
...
```

**Mitigation:**
- Summarize instead of dumping raw logs
- Include only failures and key metrics
- Link to full logs in analytics

**Format:**
```markdown
# Verification Evidence

**Status:** PROVEN ✅

## Summary
- Build: ✅ Passed in 8.2s
- Tests: ✅ 47/47 passed
- Runtime: ✅ All checks passed

## Details
[See full logs](../../state/analytics/proof-${taskId}-${timestamp}.log)
```

### Failure Mode 7: Improvement Phases Too Granular
**Problem:** 20 issues found → 20 separate improvement phases → overwhelming

**Mitigation:**
```typescript
function generateImprovementPhases(discoveries: Discovery[]): TaskPhase[] {
  // Group related issues
  const grouped = groupBySeverityAndFile(discoveries);

  if (grouped.length > 10) {
    // Create batch phases
    return [{
      id: 'batch-improvements',
      title: `Fix ${discoveries.length} discovered issues`,
      type: 'improvement',
      context: { issues: discoveries }
    }];
  }

  // Individual phases for <10 issues
  return discoveries.map(d => ({
    id: `improve-${d.id}`,
    title: `Fix: ${d.title}`,
    type: 'improvement',
    context: { issue: d }
  }));
}
```

**Result:** Batch improvements if too many issues

### Failure Mode 8: False Proven Status
**Problem:** All checks pass but code is actually broken

**Analysis:**
- This is why we need Layer 2 (multi-critic validation)
- This is why we need Layer 3 (production feedback)
- Layer 1 can't solve this alone

**Mitigation (This Task):**
- Make proof criteria comprehensive (multiple check types)
- Log proof evidence for audit
- Track "false proven" in future production feedback system

**Long-term:** Production feedback loop marks tasks "false proven" if they fail

### Failure Mode 9: Agent Skips Improvement Phases
**Problem:** Agent marks improvement phase complete without actually fixing

**Detection:**
```typescript
// In completePhase
if (phase.type === 'improvement') {
  // Verify issue is actually fixed
  const originalIssue = phase.context.issue;
  const stillExists = await checkIfIssueExists(originalIssue);

  if (stillExists) {
    return {
      success: false,
      message: `Issue "${originalIssue.title}" still exists`,
      blocked: true
    };
  }
}
```

**Result:** Can't complete improvement phase if issue still exists

### Failure Mode 10: Progress Bar Doesn't Render in All Terminals
**Problem:** Unicode characters (█ ░) don't display correctly

**Mitigation:**
```typescript
function renderProgressBar(completed: number, total: number): string {
  const supportsUnicode = process.stdout.isTTY &&
                          !process.env.TERM?.includes('dumb');

  if (supportsUnicode) {
    // Unicode progress bar
    return `${"█".repeat(filled)}${"░".repeat(empty)} ${percentage}%`;
  } else {
    // ASCII fallback
    return `${"#".repeat(filled)}${"-".repeat(empty)} ${percentage}%`;
  }
}
```

## AFP/SCAS Validation

### Via Negativa ✅

**What We're Deleting:**
- ❌ Separate VERIFY phase (merged into PROVE)
- ❌ "done" status (replaced with "proven")
- ❌ Manual verify.md creation (auto-generated)
- ❌ Enforcement mechanisms (structural instead)
- ❌ Trust-based verification (system-based instead)

**What We're Adding:**
- ✅ Phase decomposition system (enables iteration)
- ✅ Auto-verification system (removes manual work)
- ✅ Progress tracking (provides visibility)
- ✅ Achievement system (optional gamification)

**Net Complexity:**
- Code LOC: +1030 (new system)
- Process phases: -1 (10 → 9 phases)
- Manual steps: -several (no manual verify.md, no manual remediation tasks)
- Enforcement overhead: -significant (no hooks, no checklists to remember)

**Verdict:** Adding infrastructure to DELETE process complexity. Net positive for via negativa.

### Simplicity ✅

**Process Simplicity:**
- Fewer phases (9 vs 10)
- Clear progression (pending → discovering → improving → proven)
- No ambiguity ("proven" is objective)

**Technical Simplicity:**
- Concerns separated (phase mgmt, proof, visualization, achievements)
- Each module <250 LOC (manageable)
- Clear interfaces between components

**User Simplicity:**
- No manual verification steps
- Automatic remediation task creation
- Clear "what to do next"

**Verdict:** Simpler process, slightly more complex implementation. Net positive.

### Clarity ✅

**Status Clarity:**
- "proven" > "done" (objective vs subjective)
- "discovering" > "unproven" (positive vs negative)
- "improving" > "remediation" (forward vs backward)

**Progress Clarity:**
- Always know: "4/6 steps complete"
- Always know: what's done, what's current, what's next
- No ambiguity about completion

**Criteria Clarity:**
- Defined upfront in PLAN
- Objective checks (build, test, runtime)
- Clear pass/fail

**Verdict:** Significantly clearer than current system.

### Autonomy ✅

**Agent Autonomy:**
- Self-verifying (system runs checks)
- Self-documenting (evidence auto-generated)
- Self-motivating (gamification optional but helpful)

**System Autonomy:**
- Auto-generates improvement phases
- Auto-creates remediation tasks
- Auto-tracks progress

**Human Involvement:**
- Reduced to: write proof criteria in PLAN
- No manual verification
- No manual enforcement

**Verdict:** Much more autonomous.

### Sustainability ✅

**Process Sustainability:**
- No enforcement fatigue (built into design)
- No discipline required (structural)
- No manual verification (automatic)

**Technical Sustainability:**
- Modular design (easy to maintain)
- Clear boundaries (easy to extend)
- Backward compatible (migration path)

**Quality Sustainability:**
- 78% → 0% verification gap
- Maintained by design, not discipline
- Scales with more agents/tasks

**Verdict:** Highly sustainable.

### Antifragility ✅

**Gains from Disorder:**
- Proof failures → improvement phases (forced fixing)
- Iteration → more completions → better feeling (psychological benefit)
- Multiple criteria → finds more bugs → higher quality

**Learning from Failure:**
- (This task) Failures create work (can't ignore)
- (Future Phase 2) Failures improve critics (training data)
- (Future Phase 3) Production failures mark "false proven" (institutional memory)

**Resilience:**
- Multiple check types (build, test, runtime)
- Graceful degradation (missing commands skipped)
- Self-healing (inconsistent state auto-fixed)

**Verdict:** Antifragile at Layer 1, more antifragile with Layers 2-3.

## Complexity Analysis

### Cyclomatic Complexity
- Phase manager: ~15 (manageable)
- Proof system: ~20 (manageable, core logic)
- Discovery reframer: ~5 (simple)
- Progress tracker: ~10 (simple)
- Achievement system: ~12 (manageable)

**All modules below threshold (<25).**

### Cognitive Complexity
- Agent mental model: Simpler (phases = progress, not obstacles)
- User mental model: Simpler (proven = objective)
- Developer mental model: Moderate (new system to learn)

**Net cognitive load reduction for primary users (agents).**

### Essential vs Accidental Complexity
- Essential: Verification must happen (can't delete)
- Essential: Agents need motivation (psychology is real)
- Accidental: Manual steps (DELETED)
- Accidental: Enforcement overhead (DELETED)

**This task reduces accidental complexity.**

## Pre-Mortem Analysis

**"This failed because..."**

### Scenario 1: "Agents still don't iterate"
**Reason:** Gamification insufficient, structural enforcement weak

**Prevention:**
- Make proof execution automatic (can't skip)
- Make improvement phases mandatory (can't mark done)
- Monitor actual behavior with Wave 0

**Recovery:** Strengthen structural enforcement in iteration

### Scenario 2: "Too much overhead, slows down tasks 50%"
**Reason:** Performance not optimized

**Prevention:**
- Benchmark during implementation
- Optimize hot paths (phase tracking)
- Use caching

**Recovery:** Profile and optimize specific bottlenecks

### Scenario 3: "verify.md is still missing for some tasks"
**Reason:** Edge cases not handled, generation fails silently

**Prevention:**
- Comprehensive error handling
- Fallback to analytics if file write fails
- Monitor verify.md generation rate

**Recovery:** Add monitoring, fix edge cases

### Scenario 4: "Agents find it patronizing"
**Reason:** Language too enthusiastic

**Prevention:**
- Start with moderate encouragement
- Make it configurable
- Monitor feedback

**Recovery:** Tune down language, make opt-in

### Scenario 5: "Integration breaks Wave 0"
**Reason:** Backward compatibility failure

**Prevention:**
- Thorough integration testing
- Support both old and new execution paths
- Gradual rollout

**Recovery:** Rollback, fix compatibility, redeploy

## Mitigations Summary

| Risk | Mitigation |
|------|------------|
| Missing plan.md | Graceful default criteria |
| No proof criteria section | Default build + test checks |
| Infinite iteration loop | Escalation after 5 iterations |
| Inconsistent task state | Self-healing detection |
| Missing npm commands | Graceful skip with warning |
| Low achievement unlock rate | Adjust conditions based on data |
| Progress bar rendering issues | Handle edge cases (0 phases, etc) |
| Concurrent phase execution | Use existing LeaseManager |
| verify.md generation failure | Store in analytics as fallback |
| Proof timeout | 5 minute timeout, graceful failure |
| Trivial proof criteria | DesignReviewer validation (future) |
| Patronizing language | Configurable encouragement level |
| Ignored achievements | Supplementary, not core |
| Performance overhead | Benchmarking, optimization |
| Backward compatibility | Support both execution paths |
| Over-verbose verify.md | Summarize, link to full logs |
| Too many improvement phases | Batch if >10 issues |
| False proven status | Layer 2 + 3 (future phases) |
| Skipped improvement phases | Verify issue actually fixed |
| Terminal compatibility | Unicode + ASCII fallback |

## Decision Points

### Decision 1: Encouragement Level Default
**Options:**
- None (just facts)
- Low (checkmarks only)
- Moderate (positive but not enthusiastic)
- High (very encouraging)

**Choice:** Moderate (positive but professional)
**Rationale:** Balance between motivation and professionalism

### Decision 2: Achievement Unlock Difficulty
**Options:**
- Easy (1-2 iterations)
- Moderate (3-5 iterations)
- Hard (5+ iterations)

**Choice:** Moderate (3-5 iterations)
**Rationale:** Should feel achievable but not trivial

### Decision 3: Batch Improvement Threshold
**Options:**
- Never batch (always individual phases)
- Batch if >5 issues
- Batch if >10 issues
- Always batch

**Choice:** Batch if >10 issues
**Rationale:** <10 issues is manageable individually, >10 is overwhelming

### Decision 4: Proof Timeout Duration
**Options:**
- 1 minute
- 5 minutes
- 10 minutes
- No timeout

**Choice:** 5 minutes
**Rationale:** Balance between catching hangs and allowing realistic tests

### Decision 5: Escalation Iteration Count
**Options:**
- 3 iterations
- 5 iterations
- 10 iterations
- Never escalate

**Choice:** 5 iterations
**Rationale:** Gives agent reasonable attempts, prevents infinite loops

## Next Steps

This THINK phase is complete. Ready for:
- GATE: Create design.md with via negativa, alternatives, complexity analysis
- Validate design with DesignReviewer (expect iteration)
- Proceed to IMPLEMENT after design approved

## References

- strategy.md: Root cause analysis
- spec.md: Requirements
- plan.md: Implementation plan
- MANDATORY_VERIFICATION_LOOP.md: Iteration protocol
