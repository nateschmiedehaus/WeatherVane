# SPEC: Hierarchical Work Processes with Meta-Review - Requirements

**Task ID:** AFP-HIERARCHICAL-WORK-PROCESSES-20251105
**Date:** 2025-11-05
**Phase:** SPEC (Phase 2 of 10)

---

## Acceptance Criteria

### Hierarchical Work Processes

**Task Set Level Work Process:**
- [ ] AC1: Work process template exists for task sets
- [ ] AC2: Template includes Via Negativa analysis ("Can we DELETE tasks?")
- [ ] AC3: Template includes coherence check ("Do tasks collectively achieve goal?")
- [ ] AC4: Template is enforced (critic or pre-commit hook)
- [ ] AC5: Autopilot can execute task set work process autonomously (95%+ of time)

**Epic Level Work Process:**
- [ ] AC6: Work process template exists for epics
- [ ] AC7: Template includes ROI validation ("Should this epic exist?")
- [ ] AC8: Template includes alternatives analysis (3+ approaches considered)
- [ ] AC9: Template is enforced (critic or periodic audit)
- [ ] AC10: Autopilot can execute epic work process autonomously (90%+ of time)

### Self-Editing Capability

- [ ] AC11: Work processes can propose mutations (add/remove/reorder tasks)
- [ ] AC12: Mutation API exists with guardrails (no cycles, no breaking dependencies)
- [ ] AC13: Mutation log tracks all proposed changes with justifications
- [ ] AC14: Conflict resolution mechanism prevents infinite loops
- [ ] AC15: Validation runs before mutations are committed

### Meta-Review Capability (NEW)

**Automatic Meta-Review:**
- [ ] AC16: Meta-review runs automatically after each process execution
- [ ] AC17: Meta-review logs effectiveness metrics to state/analytics/process_effectiveness.jsonl
- [ ] AC18: Meta-review identifies process flaws (effectiveness, efficiency, coverage)
- [ ] AC19: Meta-review creates remediation tasks when flaws found (automatic, not manual)
- [ ] AC20: Meta-review completes in <30 seconds (immediate review)

**Milestone Meta-Review:**
- [ ] AC21: Deep meta-review runs at meaningful intervals (every 10 task sets, every epic)
- [ ] AC22: Milestone meta-review analyzes patterns across multiple executions
- [ ] AC23: Milestone meta-review proposes template improvements
- [ ] AC24: Milestone meta-review completes in <10 minutes

**Mandatory Remediation:**
- [ ] AC25: Remediation tasks are created IMMEDIATELY when flaws found (not deferred)
- [ ] AC26: Remediation tasks are HIGH PRIORITY in task queue
- [ ] AC27: Process cannot be marked "complete" until remediation task exists
- [ ] AC28: Remediation tasks must be executed before process can run again
- [ ] AC29: Remediation execution is tracked in state/analytics/remediation_log.jsonl

### Open Evolution (NEW)

- [ ] AC30: Work process templates can be updated incrementally (not replaced wholesale)
- [ ] AC31: Template versions are tracked (v1, v2, v3, etc.)
- [ ] AC32: Process improvements are measured (before vs. after metrics)
- [ ] AC33: Template changes are reversible (can roll back if new version worse)
- [ ] AC34: Evolution is gradual (max 20% of template can change per iteration)

### Visibility & Measurement (NEW)

- [ ] AC35: Each work process type has defined success metrics
- [ ] AC36: Metrics are automatically collected during execution
- [ ] AC37: Metrics dashboard shows process effectiveness over time
- [ ] AC38: "Better" is quantitatively defined (not subjective)
- [ ] AC39: Metrics enable comparison (which process template version is better?)
- [ ] AC40: Metrics are work-process-specific (task set metrics ≠ epic metrics)

---

## Functional Requirements

### FR1: Task Set Work Process Template

**Required phases:**
1. **ASSESS**: Review all tasks in set
   - Status check: Which tasks done/pending/blocked
   - Dependency validation: Correct order? Missing dependencies?
2. **VALIDATE**: Verify collective goal
   - Does this task set achieve stated objective?
   - Are any tasks redundant or misaligned?
3. **VIA NEGATIVA**: Identify what to delete
   - Can we DELETE entire tasks?
   - Can we SIMPLIFY by merging tasks?
4. **OPTIMIZE**: Reorder/restructure
   - Better task ordering?
   - Missing tasks to add?
5. **DOCUMENT**: Record decisions
   - Mutations proposed
   - Justifications
6. **META-REVIEW** (NEW): Review this process execution
   - Was this process effective?
   - Any phases wasteful or missing?
   - Create remediation task if needed

**Output:**
- Task set health report
- Proposed mutations
- Process effectiveness metrics
- Remediation tasks (if flaws found)

### FR2: Epic Work Process Template

**Required phases:**
1. **STRATEGIZE**: Validate epic purpose
   - Does this epic solve a ROOT problem or just symptoms?
   - Strategic alignment check
2. **ALTERNATIVES**: Consider 3+ approaches
   - Can we achieve goal without this epic?
   - Different epic structures?
3. **ROI**: Validate investment
   - Cost (LOC, time, complexity)
   - Benefit (metrics, impact)
   - ROI > 10× threshold?
4. **VIA NEGATIVA**: Identify what to delete
   - Can we DELETE entire task sets?
   - Can we merge with existing epics?
5. **STRUCTURE**: Validate task set organization
   - Are task sets coherent?
   - Correct granularity?
6. **DOCUMENT**: Record decisions
   - Mutations proposed
   - Strategic analysis
7. **META-REVIEW** (NEW): Review this process execution
   - Did we catch strategic misalignment early enough?
   - Are our ROI thresholds correct?
   - Should we add/remove validation phases?

**Output:**
- Epic health report
- Structural recommendations
- Process effectiveness metrics
- Remediation tasks (if flaws found)

### FR3: Meta-Review Infrastructure

**Immediate Meta-Review (after each execution):**
```typescript
interface ImmediateMetaReview {
  processType: 'task_set' | 'epic';
  executionId: string;
  timestamp: number;

  // Effectiveness metrics
  issuesFound: number;
  falsePositives: number;
  missedIssues: number; // discovered later

  // Efficiency metrics
  executionTime: number;
  phaseBreakdown: { [phase: string]: number }; // time per phase

  // Coverage metrics
  phasesExecuted: string[];
  phasesSkipped: string[];

  // Flaw detection
  flaws: ProcessFlaw[];

  // Remediation
  remediationNeeded: boolean;
  remediationTasks: RemediationTask[];
}

interface ProcessFlaw {
  type: 'effectiveness' | 'efficiency' | 'coverage' | 'template_design' | 'adoption';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string; // What data shows this is a flaw?
  suggestedFix: string;
}

interface RemediationTask {
  id: string;
  type: 'fix_task' | 'restructure_set' | 'improve_process';
  description: string;
  priority: 'high' | 'critical';
  mustExecuteBefore: string; // "Next process execution"
}
```

**Milestone Meta-Review (periodic deep analysis):**
```typescript
interface MilestoneMetaReview {
  processType: 'task_set' | 'epic';
  reviewPeriod: { start: number; end: number };
  executionsAnalyzed: number;

  // Aggregate metrics
  averageExecutionTime: number;
  averageIssuesFound: number;
  averageFalsePositives: number;

  // Pattern analysis
  patterns: {
    commonFlaws: ProcessFlaw[];
    ineffectivePhases: string[];
    missingCoverage: string[];
  };

  // Template improvement proposals
  templateChanges: TemplateChange[];

  // Comparison
  comparedToVersion: string;
  improvement: { [metric: string]: number }; // % change
}

interface TemplateChange {
  type: 'add_phase' | 'remove_phase' | 'modify_phase' | 'reorder_phases';
  phase: string;
  justification: string;
  expectedImprovement: { [metric: string]: number };
}
```

### FR4: Success Metrics (Work-Process-Specific)

**Task Set Process Metrics:**

```yaml
effectiveness:
  issues_found_rate:
    definition: "Number of real issues caught per task set"
    target: ">= 2 issues per task set"
    measurement: "Count issues in mutations_proposed"

  false_positive_rate:
    definition: "% of flagged issues that were not real problems"
    target: "< 10%"
    measurement: "Compare flagged issues to final mutations committed"

  coverage_score:
    definition: "% of issue types checked (redundancy, misalignment, dependency errors, etc.)"
    target: ">= 90%"
    measurement: "Checklist of issue types, mark which were checked"

efficiency:
  execution_time:
    definition: "Time to run task set process"
    target: "< 2 minutes"
    measurement: "Timestamp end - timestamp start"

  automation_rate:
    definition: "% of executions that completed without human intervention"
    target: ">= 95%"
    measurement: "Count executions with human_intervention: false"

adoption:
  template_clarity:
    definition: "% of executions where autopilot understood all phases"
    target: ">= 98%"
    measurement: "Count errors / total executions"
```

**Epic Process Metrics:**

```yaml
effectiveness:
  strategic_misalignment_caught:
    definition: "Number of epics where ROI < 10× was flagged"
    target: "100% of low-ROI epics caught"
    measurement: "Compare flagged epics to actual ROI at completion"

  alternative_exploration:
    definition: "Average number of alternatives considered per epic"
    target: ">= 3 alternatives"
    measurement: "Count alternatives in ALTERNATIVES phase output"

efficiency:
  execution_time:
    definition: "Time to run epic process"
    target: "< 10 minutes"
    measurement: "Timestamp end - timestamp start"

impact:
  epics_deleted:
    definition: "Number of epics deleted due to Via Negativa analysis"
    target: ">= 10% of epics reviewed"
    measurement: "Count DELETE mutations proposed"

  cost_savings:
    definition: "LOC/time saved by deleting unnecessary epics"
    target: "ROI > 100× (process saves far more than it costs)"
    measurement: "Sum LOC in deleted epics / process execution time"
```

**Meta-Review Process Metrics:**

```yaml
effectiveness:
  process_improvements:
    definition: "Number of process template improvements implemented"
    target: ">= 1 improvement per quarter"
    measurement: "Count template changes committed"

  remediation_success_rate:
    definition: "% of remediation tasks that improved metrics"
    target: ">= 80%"
    measurement: "Compare metrics before vs. after remediation"

efficiency:
  meta_review_overhead:
    definition: "% of time spent on meta-review vs. actual work"
    target: "< 5%"
    measurement: "Meta-review time / total process time"

evolution:
  template_improvement_rate:
    definition: "% improvement in key metrics per template version"
    target: ">= 10% improvement per iteration"
    measurement: "Compare v2 vs v1, v3 vs v2, etc."
```

### FR5: Open Evolution Mechanism

**Template Versioning:**
```typescript
interface ProcessTemplate {
  id: string;
  type: 'task_set' | 'epic';
  version: string; // Semver: "1.2.3"
  phases: Phase[];
  metadata: {
    created: number;
    lastModified: number;
    changeLog: Change[];
    metrics: { [metric: string]: number }; // Performance of this version
  };
}

interface Change {
  version: string;
  date: number;
  type: 'add_phase' | 'remove_phase' | 'modify_phase' | 'reorder_phases';
  description: string;
  justification: string;
  expectedImprovement: { [metric: string]: number };
  actualImprovement: { [metric: string]: number }; // Filled in after deployment
}
```

**Incremental Evolution Rules:**
1. **Max 20% change per iteration**: Can't change >20% of phases at once
2. **A/B testing**: New template version runs in parallel with old (50/50 split)
3. **Metrics comparison**: After 10 executions, compare metrics
4. **Rollback if worse**: If metrics degrade >5%, roll back to previous version
5. **Gradual rollout**: If metrics improve, gradually increase to 100% adoption

**Evolution Triggers:**
- Automatic: Metrics degrade >10% from baseline → trigger improvement task
- Milestone: Every 50 executions → trigger deep analysis
- Manual: Human can request process review at any time
- Anomaly: Process fails 3 times in a row → emergency review

### FR6: Visibility Dashboard

**Process Effectiveness Dashboard:**

```
Task Set Process Health

Version: 2.1.3 (deployed 2025-11-01)
Executions: 127

Effectiveness ━━━━━━━━━━ 87% ⚠️  (target: 90%)
  ├─ Issues found: 2.3/set (target: >= 2) ✅
  ├─ False positives: 12% (target: < 10%) ❌
  └─ Coverage: 94% (target: >= 90%) ✅

Efficiency ━━━━━━━━━━━━ 92% ✅  (target: 90%)
  ├─ Avg execution time: 1.8 min (target: < 2 min) ✅
  └─ Automation rate: 96% (target: >= 95%) ✅

Adoption ━━━━━━━━━━━━━ 99% ✅  (target: 98%)
  └─ Template clarity: 99.2% ✅

Overall Score: 93/100 ✅

Recent Improvements:
  - v2.1.3 (2025-11-01): Added dependency validation check → issues found +15%
  - v2.1.2 (2025-10-15): Simplified ASSESS phase → execution time -22%
  - v2.1.0 (2025-10-01): Removed redundant VALIDATE checks → false positives -30%

Active Remediations:
  - AFP-TASKSET-PROCESS-IMPROVE-FALSE-POSITIVES (priority: high)
    Created: 2025-11-05
    Due: Before next milestone review
    Goal: Reduce false positive rate to <10%
```

---

## Non-Functional Requirements

### NFR1: Performance
- Task set work process: <2 minutes (including meta-review)
- Epic work process: <10 minutes (including meta-review)
- Immediate meta-review: <30 seconds
- Milestone meta-review: <10 minutes
- Mutation validation: <5 seconds

### NFR2: Usability
- Templates are easy to understand (examples provided)
- Autopilot can execute without human intervention (95% of cases)
- Mutation justifications are human-readable
- Metrics are visualized (dashboard, not raw JSON)
- Remediation tasks are actionable (clear steps)

### NFR3: Maintainability
- Work process templates are version-controlled
- Templates can evolve incrementally (not replaced wholesale)
- Old template versions can be restored (rollback capability)
- Template changes are documented (change log)
- Metrics track template effectiveness over time

### NFR4: Observability
- All metrics logged to state/analytics/process_effectiveness.jsonl
- Dashboard visualizes metrics over time
- Alerts when metrics degrade >10%
- Comparison view: v1 vs v2 vs v3 metrics
- Remediation log tracks all improvements

### NFR5: Safety
- Template changes go through AFP 10-phase process
- A/B testing before full rollout
- Automatic rollback if metrics degrade
- Max 20% change per iteration (no radical redesigns)
- Human approval required for major changes (>50% of template)

---

## Success Metrics Summary

**Quantitative definition of "better" for each process type:**

### Task Set Process

**Better means:**
1. Finds more real issues (issues_found_rate ↑)
2. Fewer false positives (false_positive_rate ↓)
3. Faster execution (execution_time ↓)
4. Higher automation (automation_rate ↑)
5. Better coverage (coverage_score ↑)

**Overall score:**
```
score = (
  0.30 * effectiveness +
  0.25 * efficiency +
  0.25 * coverage +
  0.20 * adoption
)
```

**Target:** Score >= 90/100

### Epic Process

**Better means:**
1. Catches strategic misalignment (strategic_misalignment_caught = 100%)
2. Considers more alternatives (alternative_exploration >= 3)
3. Deletes unnecessary epics (epics_deleted >= 10%)
4. Massive cost savings (cost_savings ROI > 100×)
5. Faster execution (execution_time < 10 min)

**Overall score:**
```
score = (
  0.40 * effectiveness +
  0.30 * impact +
  0.20 * efficiency +
  0.10 * adoption
)
```

**Target:** Score >= 85/100

### Meta-Review Process

**Better means:**
1. Continuous improvements (process_improvements >= 1/quarter)
2. Remediation works (remediation_success_rate >= 80%)
3. Low overhead (meta_review_overhead < 5%)
4. Templates improve (template_improvement_rate >= 10% per version)

**Overall score:**
```
score = (
  0.40 * effectiveness +
  0.30 * evolution +
  0.30 * efficiency
)
```

**Target:** Score >= 90/100

---

## Out of Scope (for this task)

- Roadmap-level work process (too broad, future work)
- Milestone-level work process (may not be needed)
- Cross-epic coordination (will emerge from epic-level processes)
- Automated epic generation (self-editing adds/removes, doesn't create from scratch)
- Machine learning for process optimization (manual improvement first, ML later)

---

## Dependencies

**Must exist before this task completes:**
- [ ] AFP-ROADMAP-SCHEMA (need roadmap structure definition)
- [ ] AFP-ROADMAP-MUTATION-API (need mutation infrastructure)
- [ ] AFP-ROADMAP-GUARDRAILS (need validation logic)

**Can be built in parallel:**
- AFP-ROADMAP-VALIDATION (pre-commit validation)
- AFP-QUALITY-METRICS (metrics tracking infrastructure already exists here)

---

## User Requirements Incorporated

1. ✅ **Hierarchical work processes** (task set, epic levels)
2. ✅ **Meta-review** (processes review themselves)
3. ✅ **Mandatory remediation** (flaws trigger automatic followup tasks)
4. ✅ **Regular intervals** (immediate + milestone + quarterly reviews)
5. ✅ **Open evolution** (meaningful but not total iteration)
6. ✅ **Clear visibility** (metrics define "better" for each process type)
7. ✅ **Measurable improvement** (before/after metrics, version comparison)

---

**Phase completion date**: 2025-11-05
**Specification author**: Claude Council

**Key insight**: "Better" must be quantitatively defined and work-process-specific. Task set process effectiveness ≠ epic process effectiveness. Meta-review enables continuous, measurable improvement.
