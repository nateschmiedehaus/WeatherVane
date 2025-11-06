# THINK: Hierarchical Work Processes - Edge Cases & Analysis

**Task ID:** AFP-HIERARCHICAL-WORK-PROCESSES-20251105
**Date:** 2025-11-05
**Phase:** THINK (Phase 4 of 10)

---

## Edge Cases

### EC1: Infinite Meta-Review Loops

**Scenario:**
```
Meta-review finds flaw: "Process too slow"
→ Creates remediation task: "Optimize process template"
→ Template updated, process runs faster
→ Meta-review runs again: "Process too fast, might be skipping checks"
→ Creates remediation: "Add more validation"
→ Process slows down
→ Meta-review: "Process too slow"
... infinite loop
```

**Mitigation:**
1. **One-level deep rule**: Meta-review DOES NOT trigger another meta-review
   - Meta-review of meta-review is PROHIBITED
   - Only human quarterly review can review meta-review process itself

2. **Cooldown period**: Template can't be changed more than once per week
   ```typescript
   const canModifyTemplate = (
     template: WorkProcessTemplate,
     now: number
   ): boolean => {
     const WEEK = 7 * 24 * 60 * 60 * 1000;
     const lastChange = template.metadata.lastModified;
     return (now - lastChange) > WEEK;
   };
   ```

3. **Threshold-based triggers**: Only modify if metrics degrade >20%
   - Small fluctuations (5-10%) are noise, don't trigger changes
   - Prevents over-optimization

4. **A/B testing**: New template runs parallel to old, not immediate replacement
   - If new template worse, rollback
   - Prevents oscillation

5. **Change budget**: Max 3 template changes per quarter
   - Forces thoughtful changes, not reactive tweaks

---

### EC2: Conflicting Remediation Tasks

**Scenario:**
```
Task Set Process meta-review: "Tasks too granular, merge T1+T2"
Epic Process meta-review: "Missing tasks, add T3"
Task Set Process (next run): "Too many tasks, delete T3"

Autopilot: Which remediation do I execute first? They conflict!
```

**Mitigation:**
1. **Hierarchical precedence**: Epic-level decisions override task-set level
   - If epic says "add T3", task set can't delete T3
   - Higher level has strategic context

2. **Remediation dependencies**:
   ```typescript
   interface RemediationTask {
     id: string;
     blockedBy?: string[]; // Other remediation IDs that must execute first
     conflicts?: string[]; // Remediation IDs this conflicts with
   }
   ```

3. **Conflict resolution algorithm**:
   ```typescript
   function resolveConflicts(remediations: RemediationTask[]): RemediationTask[] {
     // Sort by level (epic > task set > task)
     const sorted = remediations.sort((a, b) => levelPriority(a) - levelPriority(b));

     // Remove conflicting lower-level remediations
     const resolved: RemediationTask[] = [];
     for (const r of sorted) {
       const hasConflict = resolved.some(existing =>
         existing.conflicts?.includes(r.id) || r.conflicts?.includes(existing.id)
       );
       if (!hasConflict) {
         resolved.push(r);
       } else {
         log.warn(`Skipping ${r.id} due to conflict with higher-level remediation`);
       }
     }
     return resolved;
   }
   ```

4. **Human escalation**: If 3+ remediations conflict, flag for human review

---

### EC3: Template Evolution Degrades Performance

**Scenario:**
```
Template v1.0: Score 90/100
Update to v1.1: Added new validation phase
After 10 executions: Score 75/100 (worse!)

Problem: New phase has high false positive rate
Should we rollback? Auto-rollback or wait for more data?
```

**Mitigation:**
1. **A/B testing with statistical significance**:
   ```typescript
   interface ABTest {
     templateA: WorkProcessTemplate; // Current version
     templateB: WorkProcessTemplate; // New version
     executionsA: WorkProcessResult[];
     executionsB: WorkProcessResult[];

     isSignificant(): boolean {
       // Need at least 10 executions per version
       if (this.executionsA.length < 10 || this.executionsB.length < 10) {
         return false;
       }

       // Calculate p-value for score difference
       const pValue = tTest(
         this.executionsA.map(r => r.metricsCollected.overall_score),
         this.executionsB.map(r => r.metricsCollected.overall_score)
       );

       return pValue < 0.05;
     }

     shouldRollback(): boolean {
       if (!this.isSignificant()) return false;

       const avgScoreA = average(this.executionsA.map(r => r.metricsCollected.overall_score));
       const avgScoreB = average(this.executionsB.map(r => r.metricsCollected.overall_score));

       // Rollback if new version >5% worse
       return (avgScoreB < avgScoreA * 0.95);
     }
   }
   ```

2. **Automatic rollback**:
   - If new version scores <85% of old version → auto-rollback
   - Log rollback reason for learning

3. **Grace period**: New template gets 20 executions before judgment
   - Early executions might be noisy
   - Need stabilization period

4. **Gradual rollout**:
   - Deploy new template to 10% of executions first
   - If metrics good after 5 executions → 50%
   - If still good after 10 more → 100%

---

### EC4: Remediation Task Explosion

**Scenario:**
```
Meta-review finds 10 flaws in single process execution
→ Creates 10 remediation tasks
Next 5 task sets also find 10 flaws each
→ Total: 60 remediation tasks

Roadmap overwhelmed with remediation, can't do actual work!
```

**Mitigation:**
1. **Batching**: Group similar remediation tasks
   ```typescript
   function batchRemediations(tasks: RemediationTask[]): RemediationTask[] {
     const grouped = groupBy(tasks, t => t.type);

     const batched = grouped.map(group => {
       if (group.length === 1) return group[0];

       // Create meta-remediation task
       return {
         id: `BATCH-${group[0].type}-${Date.now()}`,
         title: `Fix ${group.length} ${group[0].type} issues`,
         type: group[0].type,
         description: `Batch remediation for: ${group.map(t => t.id).join(', ')}`,
         priority: maxPriority(group),
         exitCriteria: group.flatMap(t => t.exitCriteria)
       };
     });

     return batched;
   }
   ```

2. **Priority triage**: Only HIGH and CRITICAL remediations create tasks
   - LOW severity: Log for quarterly review, don't create task
   - MEDIUM severity: Batch 5+ into single task

3. **Root cause deduplication**:
   - If 10 remediations all say "false positives in VALIDATE phase"
   - Create 1 remediation: "Fix VALIDATE phase false positives"
   - Not 10 separate tasks

4. **Rate limiting**: Max 5 remediation tasks per process execution
   - If more found, prioritize by severity
   - Defer rest to next execution

---

### EC5: Missing Process Evidence (Enforcement Failure)

**Scenario:**
```
Task set completes, pre-commit hook should block
BUT: Hook didn't run (user used --no-verify)
OR: Hook ran but script failed silently
Result: Task set marked complete without process evidence
```

**Mitigation:**
1. **Multi-layer enforcement**:
   - Layer 1: Pre-commit hook (catches most cases)
   - Layer 2: ProcessEnforcementCritic (catches in CI)
   - Layer 3: Autopilot check before marking task set done
   - Layer 4: Quarterly audit finds all violations

2. **CI enforcement**:
   ```yaml
   # .github/workflows/ci.yml
   - name: Validate Process Compliance
     run: |
       python3 scripts/audit_process_compliance.py
       if [ $? -ne 0 ]; then
         echo "Process compliance violations found!"
         exit 1
       fi
   ```

3. **Autopilot self-check**:
   ```typescript
   async function beforeMarkingTaskSetComplete(taskSetId: string) {
     const evidence = await loadProcessEvidence(taskSetId);

     if (!evidence) {
       console.log(`Running task set process for ${taskSetId}...`);
       const result = await executeTaskSetProcess(taskSetId);
       await saveEvidence(taskSetId, result);
     }

     // Now safe to mark complete
   }
   ```

4. **Audit trail**: Log all task set completions
   - Periodic audit checks for missing evidence
   - Human review of violations

---

### EC6: Autopilot Can't Execute Process (Too Complex)

**Scenario:**
```
Task Set Process template says:
  "Phase 3: Evaluate strategic trade-offs between
   architectural approaches A, B, C considering
   long-term maintainability, team expertise, and
   ecosystem maturity. Provide nuanced analysis."

Autopilot: "This is too vague, I can't execute this."
Automation rate: 45% (target: 95%)
```

**Mitigation:**
1. **Template clarity score**:
   ```typescript
   interface TemplateClarityMetrics {
     vaguePhrases: string[]; // "nuanced", "consider", "evaluate"
     concreteSteps: number;  // Explicit, actionable steps
     examples: number;       // Examples provided
     clarityScore: number;   // 0-100
   }

   function assessTemplateClarity(template: WorkProcessTemplate): number {
     const vaguePhrases = countVaguePhrases(template);
     const concreteSteps = countConcreteSteps(template);
     const examples = countExamples(template);

     // Penalize vagueness, reward concreteness + examples
     return Math.max(0, 100 - (vaguePhrases * 10) + (concreteSteps * 5) + (examples * 10));
   }
   ```

2. **Auto-remediation for low clarity**:
   - If clarity score <70 → Create remediation task: "Improve template clarity"
   - Provide examples in remediation
   - Make phases more concrete

3. **Fallback to human**:
   - If autopilot fails phase 3 times → Flag for human execution
   - Human executes, documents HOW → Used to improve template

4. **Metrics-driven improvement**:
   - Track which phases autopilot struggles with
   - Meta-review identifies high-failure phases
   - Remediation: Simplify those phases

---

### EC7: Metrics Collection Failure

**Scenario:**
```
Process executes, but metrics collection code crashes
→ No metrics logged
→ Meta-review can't run (needs metrics)
→ Template doesn't improve (no data)

Result: Process executes but doesn't evolve
```

**Mitigation:**
1. **Graceful degradation**:
   ```typescript
   async function executeProcess(context: WorkProcessContext): Promise<WorkProcessResult> {
     const result: WorkProcessResult = {
       success: false,
       healthReport: '',
       mutationsProposed: [],
       metricsCollected: getDefaultMetrics(),
       metaReview: getDefaultMetaReview(),
       remediationTasks: []
     };

     try {
       // Execute process phases
       result.success = true;
     } catch (error) {
       result.success = false;
       log.error('Process execution failed', error);
     }

     try {
       // Collect metrics (non-blocking)
       result.metricsCollected = await collectMetrics(result);
     } catch (error) {
       log.error('Metrics collection failed', error);
       // Use default metrics, don't fail entire process
     }

     try {
       // Run meta-review
       result.metaReview = await runMetaReview(result);
     } catch (error) {
       log.error('Meta-review failed', error);
       // Log failure, but don't block process completion
     }

     return result;
   }
   ```

2. **Metrics validation**:
   - Before logging, validate metrics are sane
   - Execution time < 0? → Invalid
   - Issues found = NaN? → Invalid
   - Invalid metrics → Use previous execution's metrics

3. **Alerting**:
   - If metrics collection fails 3 times in a row → Alert human
   - Likely a bug in metrics code

4. **Backup metrics**:
   - Always log: execution_time, success/failure
   - These are collected even if sophisticated metrics fail

---

### EC8: Cascading Template Changes

**Scenario:**
```
Task Set Process v1.2 improved → Score goes from 85 to 92
Epic Process references Task Set Process
Epic Process meta-review: "Task set processes improved,
  our template is now outdated"
→ Triggers Epic template update
→ Epic template v2.1 changes how task sets are evaluated
→ Triggers Task Set template update again
... cascading changes across hierarchy
```

**Mitigation:**
1. **Stability period**: After template update, freeze for 2 weeks
   - No further changes during stabilization
   - Collect metrics from stable version

2. **Dependency tracking**:
   ```typescript
   interface TemplateVersion {
     id: string;
     version: string;
     dependencies: {
       templateId: string;
       versionConstraint: string; // Semver range: ">=1.2.0 <2.0.0"
     }[];
   }
   ```

3. **Coordinated updates**: If epic template depends on task set template
   - Epic template updates trigger compatibility check
   - If task set template changed →  test epic template still works
   - If incompatible → Create remediation to update epic template

4. **Versioning strategy**:
   - Semantic versioning: Major.Minor.Patch
   - Major: Breaking change (other templates must update)
   - Minor: New feature (backward compatible)
   - Patch: Bug fix (backward compatible)

5. **Max cascade depth**: Changes can't propagate >2 levels
   - Task set change → Epic update allowed
   - Epic update → Roadmap level update allowed
   - But not: Task set → Epic → Roadmap → ??? (stop at 2)

---

### EC9: Quarterly Review Conflict with Daily Work

**Scenario:**
```
Quarterly meta-review scheduled for Nov 15
Autopilot is in middle of shipping critical feature
Meta-review requires 2 hours of analysis
Blocks autopilot from continuing work

User frustrated: "Why is autopilot reviewing processes
  instead of shipping features?"
```

**Mitigation:**
1. **Background execution**: Quarterly review runs asynchronously
   - Doesn't block autopilot's main work
   - Results published when complete

2. **Scheduling**: Run quarterly reviews during low-activity periods
   - Weekends or off-hours
   - Not during critical ship windows

3. **Incremental review**: Don't review all templates at once
   - Week 1 of quarter: Review task set templates
   - Week 2: Review epic templates
   - Week 3: Review meta-review process
   - Week 4: Synthesize and plan improvements

4. **Opt-out for emergencies**:
   - If autopilot is in critical mode (P0 incident, deadline)
   - Defer quarterly review by 1 week

---

### EC10: Human Override of Remediation

**Scenario:**
```
Meta-review creates remediation: "Fix false positive in VALIDATE phase"
Human reviews, disagrees: "That's not a false positive, that's a real issue"
→ Marks remediation as "won't fix"

Next meta-review: Creates same remediation again
→ Infinite loop of human rejecting, meta-review recreating
```

**Mitigation:**
1. **Rejection log**:
   ```typescript
   interface RejectedRemediation {
     id: string;
     reason: string;
     rejectedBy: string;
     rejectedAt: number;
     preventRecurrence: boolean; // Don't propose this again
   }
   ```

2. **Meta-review learns from rejections**:
   ```typescript
   function shouldProposeRemediation(
     flaw: ProcessFlaw,
     history: RejectedRemediation[]
   ): boolean {
     // Check if similar remediation was rejected
     const rejected = history.find(r =>
       r.flawType === flaw.type &&
       r.targetPhase === flaw.targetPhase &&
       similarity(r.description, flaw.description) > 0.8
     );

     if (rejected && rejected.preventRecurrence) {
       log.info(`Skipping remediation (previously rejected): ${rejected.reason}`);
       return false;
     }

     return true;
   }
   ```

3. **Feedback loop**: Human rejection updates meta-review criteria
   - "Don't flag X as false positive, it's intentional"
   - Meta-review incorporates this in future executions

4. **Escalation**: If human rejects same remediation 3 times
   - Meta-review stops proposing it
   - Quarterly review investigates: Is meta-review wrong? Or is human wrong?

---

## Failure Modes

### FM1: Enforcement Infrastructure Breaks

**Failure:** Pre-commit hook script has bug, always returns exit 0

**Impact:** All task sets marked complete without process evidence

**Detection:**
- Quarterly audit finds 50 task sets missing evidence
- Alert: "Process compliance dropped from 100% to 20%"

**Recovery:**
1. Fix hook script bug
2. Identify all task sets completed during bug period
3. Run retroactive process reviews
4. Create remediation tasks for violations

**Prevention:**
- Test pre-commit hooks in CI
- Hook script has its own tests
- Monthly audit as early warning

---

### FM2: Mutation API Bug Creates Invalid Roadmap

**Failure:** Bug in cycle detection allows circular dependencies

**Impact:** Roadmap becomes unexecutable, autopilot deadlocks

**Detection:**
- Autopilot attempts task, detects circular dependency
- Build fails: "Roadmap validation error"

**Recovery:**
1. Rollback roadmap to last valid snapshot
2. Disable mutation API until bug fixed
3. Manual review of recent mutations
4. Re-apply valid mutations

**Prevention:**
- Extensive unit tests for cycle detection
- Daily roadmap validation in CI
- Mutation dry-run mode for testing

---

### FM3: Meta-Review Always Finds Flaws (False Positives)

**Failure:** Meta-review flaw detection too sensitive, flags everything

**Impact:** 100% of executions create remediation tasks, overwhelming

**Detection:**
- Remediation task creation rate spikes to 10 per execution
- Manual review: "These aren't real flaws"

**Recovery:**
1. Adjust meta-review sensitivity thresholds
2. Delete spurious remediation tasks
3. Re-calibrate flaw detection

**Prevention:**
- A/B test meta-review changes
- Human review of first 10 meta-review executions
- Precision/recall metrics for flaw detection

---

### FM4: Template Evolution Stagnates

**Failure:** No template improvements for 6 months

**Impact:** Processes don't improve, metrics stagnate

**Detection:**
- Quarterly review: "No template changes in 6 months"
- Metrics plateau

**Recovery:**
1. Manual template audit
2. Force meta-review to be more aggressive
3. Lower thresholds for proposing improvements

**Prevention:**
- Target: At least 1 improvement per quarter
- If no improvements → Meta-review is too conservative
- Quarterly review investigates why no improvements

---

## Complexity Analysis

### Current Complexity (before this change)

**Work processes:**
- 1 process type (task-level AFP)
- No meta-review
- No self-editing

**Cyclomatic complexity:**
- Process execution: ~10
- Total: ~10

### Proposed Complexity (after this change)

**Work processes:**
- 3 process types (task, task set, epic)
- Meta-review for each
- Self-editing via mutation API
- Template evolution

**Cyclomatic complexity:**
- Process execution (hierarchical): ~25
- Mutation validation: ~20
- Meta-review analysis: ~30
- Template evolution: ~15
- Enforcement: ~10
- Total: ~100

**Complexity increase:** 10 → 100 (10× increase)

**Justification:**

1. **High ROI**: 1500 LOC enables:
   - Full autonomy (self-editing + self-improvement)
   - Continuous process improvement (meta-review)
   - Strategic validation (epic-level thinking)
   - ROI: ~100× (manages 100,000+ LOC roadmap)

2. **Necessary complexity**:
   - Self-improvement inherently complex (meta-cognitive loop)
   - Can't achieve user's goals with simpler approach
   - Complexity isolated in dedicated modules

3. **Well-tested**:
   - Extensive unit tests (validation, metrics, flaw detection)
   - Integration tests (end-to-end flows)
   - A/B testing for template evolution
   - Mitigates complexity risk

4. **Gradual rollout**:
   - Week 1-2: Foundation (mutation API)
   - Week 3-4: Execution (process templates)
   - Week 5-6: Enforcement
   - Week 7-8: Meta-review
   - Phased approach reduces risk

**Complexity budget:**
- Mutation API: 250 LOC, complexity ~20 → acceptable (critical path)
- Hierarchical executor: 300 LOC, complexity ~25 → acceptable
- Meta-review: 200 LOC, complexity ~30 → high but necessary
- Enforcement: 200 LOC, complexity ~10 → minimal

**Total acceptable**: Critical capability, high ROI, well-tested, isolated

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation | Residual Risk |
|------|----------|------------|------------|---------------|
| Infinite meta-review loops | High | Medium | One-level deep, cooldown, thresholds | Low |
| Conflicting remediations | Medium | High | Hierarchical precedence, conflict resolution | Low |
| Template evolution degrades | High | Medium | A/B testing, auto-rollback | Low |
| Remediation task explosion | Medium | High | Batching, triage, rate limiting | Medium |
| Enforcement failure | High | Low | Multi-layer enforcement, CI validation | Low |
| Autopilot can't execute | Medium | High | Template clarity score, fallback to human | Medium |
| Metrics collection fails | Medium | Medium | Graceful degradation, validation | Low |
| Cascading template changes | Low | Low | Stability period, dependency tracking | Very Low |
| Quarterly review blocks work | Low | Medium | Background execution, scheduling | Low |
| Human override loop | Low | Low | Rejection log, learn from feedback | Very Low |
| Mutation API bugs | High | Low | Extensive tests, daily validation | Low |
| Meta-review false positives | Medium | Medium | Sensitivity tuning, human review | Medium |
| Template stagnation | Low | Medium | Quarterly audit, targets | Low |

**Overall risk:** MEDIUM
- High-impact risks mitigated (infinite loops, degradation, bugs)
- Residual risks: Remediation task volume, autopilot execution difficulty
- Acceptable for high-value capability

---

## Performance Analysis

**Task Set Process (with meta-review):**
- Load template: 10ms
- Execute phases (5 phases): 5× 15s = 75s
- Collect metrics: 5s
- Run meta-review: 15s
- Total: ~95s (target: <120s) ✅

**Epic Process (with meta-review):**
- Load template: 10ms
- Execute phases (6 phases): 6× 60s = 360s
- Collect metrics: 10s
- Run meta-review: 30s
- Total: ~400s = 6.7 min (target: <10 min) ✅

**Quarterly Meta-Review:**
- Analyze 50 task set executions: 5 min
- Analyze 5 epic executions: 10 min
- Synthesize improvements: 20 min
- Generate report: 5 min
- Total: 40 min (target: <2 hours) ✅

**Mutation commit:**
- Validate: 100ms
- Write roadmap.yaml: 50ms
- Log: 10ms
- Total: ~160ms (target: <5s) ✅

**Overall performance:** All targets met

---

## Testing Strategy

### Unit Tests

**Mutation validation:**
- ✅ Detect cycles (A → B → A)
- ✅ Detect orphans (delete task with dependents)
- ✅ Validate task set deletion (cascade)
- ✅ Detect conflicts (parallel mutations)
- ✅ Enforce guardrails (max tasks, exit criteria)

**Meta-review analysis:**
- ✅ Calculate effectiveness metrics (issues found, false positives)
- ✅ Calculate efficiency metrics (execution time, automation rate)
- ✅ Detect flaws (effectiveness, efficiency, coverage)
- ✅ Generate remediation tasks

**Template evolution:**
- ✅ A/B testing logic
- ✅ Statistical significance check
- ✅ Auto-rollback when degraded
- ✅ Gradual rollout

### Integration Tests

**End-to-end flows:**
1. Task set completion → auto-trigger process → mutations → remediation
2. Epic validation → strategic analysis → Via Negativa → mutations
3. Meta-review → flaw detection → remediation task creation → roadmap update
4. Template evolution → A/B test → metrics comparison → rollout

**Enforcement:**
- Pre-commit hook blocks without evidence
- ProcessEnforcementCritic catches violations
- Autopilot self-check before marking complete

**Edge cases:**
- Infinite loop prevention (cooldown works)
- Conflict resolution (hierarchical precedence works)
- Remediation batching (no explosion)

### Manual Tests

**Autopilot scenarios:**
1. Autopilot completes task set → runs process autonomously
2. Autopilot identifies redundant tasks → proposes deletion
3. Meta-review finds process flaw → creates remediation
4. Autopilot executes remediation → template improves

**Human review:**
- Review proposed mutations for quality
- Verify remediation tasks are actionable
- Check meta-review identified real flaws

### Load Tests

**Scale:**
- 100 task sets process concurrently
- 1000 mutations in history
- 50 template evolution cycles
- Verify: No crashes, performance within targets

---

## Alternatives Re-evaluation

**After edge case analysis, should we reconsider alternatives?**

### Alternative 1: No meta-review (simpler)
- Pros: 50% less complexity, no infinite loop risk
- Cons: Processes don't improve, defeats user's core requirement
- **Decision:** Still rejected (user explicitly required meta-review)

### Alternative 2: Manual meta-review (quarterly human review)
- Pros: No automation complexity, human judgment
- Cons: Doesn't scale, slow feedback, human bottleneck
- **Decision:** Hybrid approach - automated immediate + human quarterly

### Alternative 3: Simplified metrics (just execution time + success rate)
- Pros: Easy to collect, no complex analysis
- Cons: Can't measure effectiveness (issues found, false positives, coverage)
- **Decision:** Still rejected (need rich metrics for improvement)

### Alternative 4: Defer epic-level process (start with task set only)
- Pros: 40% less scope, prove value first
- Cons: Incomplete solution
- **Decision:** ACCEPT for v1 - Build task set process first, epic second
  - Task 1-2: Task set process + meta-review
  - Task 3-4: Epic process (later sprint)

**Revised Phasing:**
- **v1 (Week 1-4):** Task set process + meta-review + enforcement
- **v2 (Week 5-6):** Epic process (after validating task set works)
- **v3 (Week 7+):** Quarterly deep review, template evolution at scale

---

## Next Steps

1. **GATE**: Create design.md with AFP/SCAS validation
2. **IMPLEMENT**: Execute in phases (v1 → v2 → v3)
3. **VERIFY**: Test edge cases extensively, especially:
   - Infinite loop prevention
   - Conflict resolution
   - Remediation batching
   - Template evolution rollback
4. **MONITOR**: Track first 50 executions closely
5. **ITERATE**: Apply meta-review to meta-review (quarterly)

---

**Phase completion date**: 2025-11-05
**Analysis by**: Claude Council

**Key insight**: Edge cases around meta-review loops and template evolution are manageable with proper guardrails (cooldown, A/B testing, hierarchical precedence). Biggest risk is remediation task explosion → mitigated by batching and triage.
