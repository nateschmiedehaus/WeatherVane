# PLAN: Hierarchical Work Processes with Meta-Review - Design

**Task ID:** AFP-HIERARCHICAL-WORK-PROCESSES-20251105
**Date:** 2025-11-05
**Phase:** PLAN (Phase 3 of 10)

---

## Via Negativa Analysis

**Can we DELETE instead of add?**

### Option 1: Delete task sets and epics entirely
- Flatten roadmap to just tasks
- **NO** - Loses hierarchical organization that's already working
- User specifically asked for hierarchical work processes

### Option 2: Delete the 10-phase AFP process and replace with unified process
- One work process that adapts to task/set/epic level
- **NO** - Task-level AFP is proven, don't break what works
- Better to ADD hierarchical processes that complement existing AFP

### Option 3: Delete manual roadmap reviews
- Currently humans manually review epics
- Replace with automated hierarchical processes
- **YES** - This is replacement, not addition
- Deletes manual review burden by automating it

### Option 4: Delete existing critic infrastructure and merge with meta-review
- Critics check code quality; meta-review checks process quality
- Can we unify these?
- **NO** - Different domains (code vs. process), keep separate
- Meta-review complements critics, doesn't replace

### Option 5: Simplify by removing meta-review
- Just build hierarchical processes without self-improvement
- **NO** - User explicitly required meta-review and mandatory remediation
- This is CORE requirement, not optional

**Decision:**
- Cannot DELETE our way to this solution
- Must ADD hierarchical processes + meta-review infrastructure
- BUT: We DELETE manual epic review burden (replaced with automated processes)
- AND: Meta-review will DELETE ineffective process phases over time

---

## Refactor vs Repair Analysis

**Are we patching or refactoring root cause?**

**Current "patch" approach:**
- Add more templates, more enforcement, more critics
- This would be layering on top of existing system

**Root cause:**
- Roadmap structure exists but has no cognitive framework at set/epic levels
- Work processes are task-scoped when they should be multi-level
- No mutation capability (read-only processes)
- **No meta-cognitive capability (processes can't improve themselves)**

**Refactor approach:**
- REFACTOR roadmap.yaml to include work process metadata (process version, metrics, execution log)
- REFACTOR work process concept to be hierarchy-aware AND self-improving
- ADD mutation API as new primitive
- ADD meta-review as new primitive

**Decision:**
- This IS a refactor (changing fundamental model)
- Not patching existing code, building new capability
- Acceptable complexity increase (high ROI: enables full autonomy + continuous improvement)

---

## Architecture Design

### Component 1: Work Process Schema

**File:** `shared/schemas/work_process_schema.ts`

**Purpose:** Define work processes at each level + meta-review structure

```typescript
// Base work process structure
interface WorkProcessPhase {
  id: string;
  name: string;
  purpose: string;
  required_outputs: string[];
  validation_criteria: string[];
  estimated_time_seconds: number;
}

interface WorkProcessTemplate {
  id: string;
  type: 'task' | 'task_set' | 'epic';
  version: string; // Semver: "1.2.3"
  name: string;
  phases: WorkProcessPhase[];
  triggers: ProcessTrigger[];
  enforcement: EnforcementLevel;
  metrics: ProcessMetrics;
  changelog: TemplateChange[];
}

interface ProcessTrigger {
  type: 'on_completion' | 'on_start' | 'periodic' | 'manual';
  condition: string; // e.g., "all tasks complete", "every 10 executions"
}

enum EnforcementLevel {
  REQUIRED = 'required',      // Pre-commit hook blocks without evidence
  RECOMMENDED = 'recommended', // Warning if skipped
  OPTIONAL = 'optional'        // No enforcement
}

// Meta-review structure
interface MetaReviewResult {
  executionId: string;
  processType: 'task_set' | 'epic';
  processVersion: string;
  timestamp: number;

  // Metrics collected
  metrics: {
    execution_time_seconds: number;
    issues_found: number;
    false_positives: number;
    coverage_score: number; // 0-100
    automation_rate: number; // 0-1
  };

  // Flaw detection
  flaws: ProcessFlaw[];

  // Remediation
  remediationNeeded: boolean;
  remediationTasks: RemediationTaskSpec[];

  // Template feedback
  phaseEffectiveness: { [phaseId: string]: number }; // 0-100
  suggestedImprovements: TemplateChange[];
}

interface ProcessFlaw {
  type: 'effectiveness' | 'efficiency' | 'coverage' | 'template_design' | 'adoption';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string;
  impact: string;
  suggestedFix: string;
}

interface RemediationTaskSpec {
  id: string;
  title: string;
  type: 'fix_task' | 'restructure_set' | 'improve_process' | 'refactor_epic';
  description: string;
  priority: 'high' | 'critical';
  mustExecuteBefore: string; // "next_process_execution" | "milestone_review"
  dependencies: string[];
  exitCriteria: string[];
}

interface TemplateChange {
  version: string;
  date: number;
  changeType: 'add_phase' | 'remove_phase' | 'modify_phase' | 'reorder_phases';
  phase: string;
  description: string;
  justification: string;
  expectedImprovement: { [metric: string]: number };
  actualImprovement?: { [metric: string]: number }; // Filled after deployment
}

// Process metrics definition
interface ProcessMetrics {
  effectiveness: {
    issues_found_rate: MetricDefinition;
    false_positive_rate: MetricDefinition;
    coverage_score: MetricDefinition;
  };
  efficiency: {
    execution_time: MetricDefinition;
    automation_rate: MetricDefinition;
  };
  impact?: {
    deletions_proposed?: MetricDefinition;
    cost_savings_roi?: MetricDefinition;
  };
}

interface MetricDefinition {
  name: string;
  description: string;
  target: number | string;
  unit: string;
  calculation: string;
}
```

**LOC estimate:** ~200 LOC (comprehensive type definitions)

---

### Component 2: Roadmap Mutation API

**File:** `tools/wvo_mcp/src/orchestrator/roadmap_mutations.ts`

**Purpose:** Safe mutations to roadmap structure + audit logging

```typescript
interface MutationProposal {
  id: string;
  type: 'add_task' | 'remove_task' | 'reorder_tasks' |
        'add_task_set' | 'remove_task_set' | 'merge_task_sets' |
        'restructure_epic' | 'remove_epic';
  target: string;  // Task/set/epic ID
  payload: any;    // Mutation-specific data
  justification: string;
  proposedBy: string;  // Process name or agent
  timestamp: number;
  processExecutionId?: string; // Link to process that proposed this
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  impact: MutationImpact;
}

interface MutationImpact {
  tasksAffected: number;
  dependenciesBroken: boolean;
  cyclesCreated: boolean;
  estimatedLOCChange: number;
  riskLevel: 'low' | 'medium' | 'high';
}

class RoadmapMutator {
  // Core mutation operations
  async validate(proposal: MutationProposal): Promise<ValidationResult>;
  async commit(proposal: MutationProposal): Promise<boolean>;
  async undo(mutationId: string): Promise<boolean>;

  // Audit trail
  async getHistory(filter?: MutationFilter): Promise<MutationProposal[]>;
  async getImpactAnalysis(proposal: MutationProposal): Promise<MutationImpact>;

  // Conflict resolution
  async detectConflicts(proposals: MutationProposal[]): Promise<Conflict[]>;
  async resolveConflict(conflict: Conflict): Promise<MutationProposal>;
}

// Validation logic
class MutationValidator {
  // Dependency graph validation
  validateDependencies(mutation: MutationProposal, roadmap: Roadmap): ValidationResult;

  // Cycle detection
  detectCycles(roadmap: Roadmap): string[];

  // Guardrails enforcement
  enforceGuardrails(mutation: MutationProposal): ValidationResult;
  // - Max tasks per mutation: 10
  // - Exit criteria required
  // - Rate limiting: 100 mutations/day
}
```

**Implementation approach:**
- Read roadmap.yaml
- Apply mutation in-memory
- Validate (dependency check, cycle detection, guardrails)
- If valid, write back to roadmap.yaml
- Log mutation to state/mutations.jsonl
- Update roadmap metadata (last_modified, mutation_count)

**LOC estimate:** ~250 LOC (complex validation logic)

---

### Component 3: Work Process Executors

**File:** `tools/wvo_mcp/src/work_process/hierarchical_executor.ts`

**Purpose:** Execute work processes at each level + meta-review

```typescript
interface WorkProcessContext {
  level: 'task_set' | 'epic';
  targetId: string;
  roadmap: Roadmap;
  mutator: RoadmapMutator;
  template: WorkProcessTemplate;
}

interface WorkProcessResult {
  executionId: string;
  success: boolean;
  healthReport: string;
  mutationsProposed: MutationProposal[];
  metricsCollected: ProcessMetrics;
  metaReview: MetaReviewResult;
  remediationTasks: RemediationTaskSpec[];
}

class HierarchicalWorkProcessExecutor {
  // Main execution
  async executeTaskSetProcess(taskSetId: string): Promise<WorkProcessResult>;
  async executeEpicProcess(epicId: string): Promise<WorkProcessResult>;

  // Generic executor
  async execute(context: WorkProcessContext): Promise<WorkProcessResult>;

  // Phase execution
  private async executePhase(
    phase: WorkProcessPhase,
    context: WorkProcessContext
  ): Promise<PhaseResult>;

  // Meta-review execution
  private async executeMetaReview(
    result: WorkProcessResult,
    template: WorkProcessTemplate
  ): Promise<MetaReviewResult>;

  // Remediation task creation
  private async createRemediationTasks(
    flaws: ProcessFlaw[],
    context: WorkProcessContext
  ): Promise<RemediationTaskSpec[]>;
}

// Meta-review analyzer
class MetaReviewAnalyzer {
  // Effectiveness analysis
  analyzeEffectiveness(result: WorkProcessResult): EffectivenessScore;

  // Efficiency analysis
  analyzeEfficiency(result: WorkProcessResult): EfficiencyScore;

  // Coverage analysis
  analyzeCoverage(result: WorkProcessResult): CoverageScore;

  // Flaw detection
  detectFlaws(result: WorkProcessResult, template: WorkProcessTemplate): ProcessFlaw[];

  // Template improvement suggestions
  suggestTemplateImprovements(
    executionHistory: WorkProcessResult[],
    currentTemplate: WorkProcessTemplate
  ): TemplateChange[];
}
```

**Implementation approach:**
- Load work process template for level
- Execute each phase in sequence
- Collect metrics during execution
- Run immediate meta-review after completion
- Generate remediation tasks if flaws found
- Return comprehensive results

**LOC estimate:** ~300 LOC (including meta-review logic)

---

### Component 4: Enforcement Infrastructure

**File 1:** `.git/hooks/pre-commit` (extend existing)

**Purpose:** Enforce hierarchical processes at commit time

```bash
#!/bin/bash

# Existing AFP checks
check_afp_compliance()

# NEW: Hierarchical process enforcement
check_task_set_completion() {
  # If last task in set is marked "done", check for task set evidence

  # Find task sets with all tasks complete but no process evidence
  task_sets_without_evidence=$(python3 scripts/find_incomplete_task_sets.py)

  if [ -n "$task_sets_without_evidence" ]; then
    echo "❌ BLOCKED: Task sets completed without running work process"
    echo ""
    echo "The following task sets have all tasks complete but no process evidence:"
    echo "$task_sets_without_evidence"
    echo ""
    echo "You must run the task set work process before committing:"
    echo "  npm run process:task-set <TASK_SET_ID>"
    echo ""
    echo "This will:"
    echo "  - Validate task set coherence"
    echo "  - Identify redundancies or gaps"
    echo "  - Run meta-review"
    echo "  - Create remediation tasks if needed"
    exit 1
  fi
}

check_epic_validation() {
  # If epic status changes to "shipping", check for epic evidence

  epics_without_evidence=$(python3 scripts/find_unvalidated_epics.py)

  if [ -n "$epics_without_evidence" ]; then
    echo "❌ BLOCKED: Epics shipping without strategic validation"
    echo ""
    echo "The following epics are marked for shipping but lack epic process evidence:"
    echo "$epics_without_evidence"
    echo ""
    echo "You must run the epic work process before shipping:"
    echo "  npm run process:epic <EPIC_ID>"
    echo ""
    echo "This ensures:"
    echo "  - Strategic alignment validated"
    echo "  - ROI > 10× confirmed"
    echo "  - Alternatives considered"
    echo "  - Via negativa analysis complete"
    exit 1
  fi
}

check_remediation_tasks() {
  # If meta-review created remediation tasks, they must be added to roadmap

  pending_remediations=$(python3 scripts/find_pending_remediations.py)

  if [ -n "$pending_remediations" ]; then
    echo "⚠️  WARNING: Pending remediation tasks found"
    echo ""
    echo "Meta-review identified issues requiring remediation:"
    echo "$pending_remediations"
    echo ""
    echo "These must be added to roadmap.yaml before next process execution"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
}

# Run all checks
check_task_set_completion
check_epic_validation
check_remediation_tasks
```

**File 2:** `scripts/find_incomplete_task_sets.py`

```python
#!/usr/bin/env python3
import yaml
from pathlib import Path

def find_incomplete_task_sets():
    """Find task sets with all tasks complete but no process evidence."""
    with open('state/roadmap.yaml') as f:
        roadmap = yaml.safe_load(f)

    incomplete = []
    for epic in roadmap.get('epics', []):
        for milestone in epic.get('milestones', []):
            for task_set in milestone.get('task_sets', []):
                tasks = task_set.get('tasks', [])
                all_complete = all(t['status'] == 'done' for t in tasks)

                # Check for process evidence
                evidence_path = f"state/evidence/{task_set['id']}-PROCESS/meta_review.json"
                has_evidence = Path(evidence_path).exists()

                if all_complete and not has_evidence:
                    incomplete.append({
                        'id': task_set['id'],
                        'title': task_set['title'],
                        'task_count': len(tasks)
                    })

    return incomplete

if __name__ == '__main__':
    incomplete = find_incomplete_task_sets()
    for ts in incomplete:
        print(f"{ts['id']}: {ts['title']} ({ts['task_count']} tasks)")
```

**File 3:** `tools/wvo_mcp/src/critics/process_enforcement_critic.ts`

**Purpose:** MCP critic that validates process compliance

```typescript
export class ProcessEnforcementCritic implements Critic {
  name = 'ProcessEnforcementCritic';

  async review(taskId: string): Promise<CriticResult> {
    const roadmap = await this.loadRoadmap();
    const taskSet = this.findTaskSetForTask(taskId, roadmap);

    if (!taskSet) {
      return { approved: true, concerns: [] };
    }

    // Check if task set is complete
    const allTasksComplete = taskSet.tasks.every(t => t.status === 'done');

    if (allTasksComplete) {
      // Check for process evidence
      const evidence = await this.loadProcessEvidence(taskSet.id);

      if (!evidence) {
        return {
          approved: false,
          concerns: [
            `Task set ${taskSet.id} is complete but lacks work process evidence`,
            `You must run: npm run process:task-set ${taskSet.id}`,
            `This will validate coherence, identify gaps, and run meta-review`
          ]
        };
      }

      // Check for pending remediation tasks
      const metaReview = evidence.metaReview;
      if (metaReview.remediationNeeded && metaReview.remediationTasks.length > 0) {
        const tasksInRoadmap = metaReview.remediationTasks.every(rt =>
          this.taskExistsInRoadmap(rt.id, roadmap)
        );

        if (!tasksInRoadmap) {
          return {
            approved: false,
            concerns: [
              `Meta-review found ${metaReview.remediationTasks.length} issues requiring remediation`,
              `Remediation tasks must be added to roadmap.yaml:`,
              ...metaReview.remediationTasks.map(rt => `  - ${rt.id}: ${rt.title}`)
            ]
          };
        }
      }
    }

    return { approved: true, concerns: [] };
  }
}
```

**LOC estimate:** ~200 LOC (enforcement scripts + critic)

---

### Component 5: Process Templates

**File 1:** `docs/templates/task_set_process_template.md`

```markdown
# Task Set Work Process: [Task Set ID]

**Task Set:** [Name]
**Execution ID:** [UUID]
**Date:** [YYYY-MM-DD]
**Template Version:** 1.0.0

---

## Phase 1: ASSESS

**Purpose:** Review all tasks in this set

**Tasks in set:**
- [ ] Task ID - Title - Status (done/pending/blocked)
- [ ] Task ID - Title - Status
- [ ] Task ID - Title - Status

**Dependencies:**
- All dependencies satisfied? YES/NO
- Correct ordering? YES/NO
- Missing dependencies? [List]

**Issues found:** [Count]

---

## Phase 2: VALIDATE

**Purpose:** Verify this set achieves its collective goal

**Task set objective:** [What is this set trying to achieve?]

**Collective assessment:**
- Do these tasks achieve the objective? YES/NO
- Are any tasks redundant? YES/NO (if yes, list which)
- Are any tasks misaligned? YES/NO (if yes, explain)

**Issues found:** [Count]

---

## Phase 3: VIA NEGATIVA

**Purpose:** Identify what to DELETE or SIMPLIFY

**Can we DELETE:**
- Entire tasks? [List candidates with justification]
- Redundant work? [List overlap between tasks]
- Complexity? [What can be simplified?]

**Deletions proposed:** [Count]

---

## Phase 4: OPTIMIZE

**Purpose:** Reorder/restructure for better execution

**Reordering:**
- Current order: [T1, T2, T3]
- Better order: [T3, T1, T2] (if applicable)
- Justification: [Why this order is better]

**Missing tasks:**
- Task to add: [Description]
- Justification: [Why needed]

**Mutations proposed:** [Count]

---

## Phase 5: DOCUMENT

**Purpose:** Record decisions and proposals

**Mutations proposed:**
1. [type] - [description] - [justification]
2. [type] - [description] - [justification]

**Mutations committed:** [IDs of mutations actually applied]

**Mutations rejected:** [IDs + reasons]

---

## Phase 6: META-REVIEW

**Purpose:** Review this process execution

### Metrics Collected

- Execution time: [X] seconds (target: < 120 seconds)
- Issues found: [X] (target: >= 2)
- False positives: [X]% (target: < 10%)
- Coverage score: [X]% (target: >= 90%)
- Automation rate: [X]% (target: >= 95%)

### Flaw Detection

**Flaws found:** [Count]

1. [Flaw type] - [Severity] - [Description]
   - Evidence: [What shows this is a flaw?]
   - Impact: [How does this affect quality?]
   - Suggested fix: [How to remediate?]

### Remediation Tasks

**Remediation needed:** YES/NO

**Tasks created:**
1. [Task ID] - [Title] - [Priority]
   - Must execute before: [Condition]
   - Exit criteria: [How to verify fixed]

### Template Feedback

**Phase effectiveness:**
- ASSESS: [X]% effective (useful? wasteful?)
- VALIDATE: [X]% effective
- VIA_NEGATIVA: [X]% effective
- OPTIMIZE: [X]% effective
- DOCUMENT: [X]% effective

**Suggested template improvements:**
- [Change type] - [Phase] - [Description] - [Expected improvement]

---

## Summary

- **Overall score:** [X]/100
- **Process effective:** YES/NO
- **Remediation required:** YES/NO
- **Template version adequate:** YES/NO

**Next actions:**
1. [Action required]
2. [Action required]
```

**File 2:** `docs/templates/epic_process_template.md`

(Similar structure but with strategic phases: STRATEGIZE, ALTERNATIVES, ROI, VIA_NEGATIVA, STRUCTURE, DOCUMENT, META-REVIEW)

**LOC estimate:** ~200 LOC total (both templates)

---

### Component 6: Roadmap Structure Changes

**File:** `state/roadmap.yaml` (schema changes)

**Add process metadata to task sets and epics:**

```yaml
epics:
  - id: E-EXAMPLE
    milestones:
      - id: M-EXAMPLE-1
        task_sets:
          - id: TS-EXAMPLE-SET
            title: Example Task Set
            status: pending

            # NEW: Work process metadata
            work_process:
              template_id: task-set-coherence-v1
              template_version: "1.2.3"
              last_execution:
                execution_id: "exec-uuid-123"
                timestamp: 1699228800
                result: "passed"
                score: 92
                evidence_path: "state/evidence/TS-EXAMPLE-SET-PROCESS/"
              metrics:
                total_executions: 5
                average_score: 89
                issues_found_total: 12
                remediation_tasks_created: 3
              next_review:
                type: "on_completion"
                due: null  # When last task completes

            tasks:
              - id: T-EXAMPLE-1
                title: Example Task
                status: done
                # ... existing task fields

      # NEW: Epic-level process metadata
      work_process:
        template_id: epic-strategic-validation-v1
        template_version: "2.1.0"
        last_execution:
          execution_id: "exec-uuid-456"
          timestamp: 1699142400
          result: "passed_with_concerns"
          score: 87
          evidence_path: "state/evidence/E-EXAMPLE-PROCESS/"
        next_review:
          type: "milestone"
          due: 1699315200  # After 10 task sets or quarterly
```

**File:** `docs/ROADMAP.md` (update documentation)

Add section:

```markdown
## Hierarchical Work Processes

WeatherVane employs work processes at three levels:

### Task Level (Existing)
- **Process:** AFP 10-Phase (STRATEGIZE → MONITOR)
- **Purpose:** Ensure individual tasks are well-designed and implemented
- **Enforcement:** Pre-commit hooks, critics

### Task Set Level (New)
- **Process:** Coherence Review (ASSESS → VALIDATE → VIA_NEGATIVA → OPTIMIZE → DOCUMENT → META-REVIEW)
- **Purpose:** Ensure groups of tasks collectively achieve objectives
- **Enforcement:** Required before marking task set complete
- **Metrics:** Issues found, false positives, coverage, execution time

### Epic Level (New)
- **Process:** Strategic Validation (STRATEGIZE → ALTERNATIVES → ROI → VIA_NEGATIVA → STRUCTURE → DOCUMENT → META-REVIEW)
- **Purpose:** Validate epic solves right problem, ROI > 10×, strategic alignment
- **Enforcement:** Required before epic ships
- **Metrics:** Strategic misalignment caught, alternatives considered, cost savings

### Meta-Review
All work processes include mandatory meta-review phase that:
- Analyzes process effectiveness
- Identifies process flaws
- Creates remediation tasks automatically
- Suggests template improvements
- Tracks metrics for continuous improvement

See: `docs/work_process/HIERARCHICAL_PROCESSES.md` for full documentation
```

**File:** `CLAUDE.md` (update agent guidance)

Add to work process section:

```markdown
## Hierarchical Work Process Execution

When working on tasks, you must execute appropriate work process based on scope:

### Task Set Completion Trigger
When last task in a set completes:
1. Automatically trigger task set work process
2. Run all 6 phases (ASSESS → META-REVIEW)
3. Create remediation tasks if flaws found
4. Cannot mark task set "done" until:
   - Process evidence exists
   - Remediation tasks in roadmap

### Epic Shipping Trigger
Before marking epic as shipped:
1. Run epic work process
2. Validate strategic alignment, ROI > 10×
3. Consider 3+ alternatives
4. Run Via Negativa (can we DELETE task sets?)
5. Meta-review process effectiveness
6. Create remediation tasks

### Meta-Review Execution
After EVERY process execution:
1. Collect metrics (time, issues found, coverage)
2. Identify flaws (effectiveness, efficiency, coverage)
3. If flaws found → Create remediation tasks (MANDATORY)
4. Suggest template improvements
5. Log to state/analytics/process_effectiveness.jsonl

### Enforcement
- Pre-commit hook blocks if process not run
- ProcessEnforcementCritic validates compliance
- Autopilot cannot proceed without remediation
```

**LOC estimate:** ~100 LOC (documentation + YAML schema changes)

---

## Files to Change/Create

### NEW FILES (8 total):

1. `shared/schemas/work_process_schema.ts` (~200 LOC)
   - Type definitions for work processes, meta-review, metrics

2. `tools/wvo_mcp/src/orchestrator/roadmap_mutations.ts` (~250 LOC)
   - Mutation API with validation and guardrails

3. `tools/wvo_mcp/src/work_process/hierarchical_executor.ts` (~300 LOC)
   - Work process execution + meta-review logic

4. `tools/wvo_mcp/src/critics/process_enforcement_critic.ts` (~150 LOC)
   - MCP critic for process compliance

5. `scripts/find_incomplete_task_sets.py` (~50 LOC)
   - Pre-commit helper script

6. `scripts/find_unvalidated_epics.py` (~50 LOC)
   - Pre-commit helper script

7. `docs/templates/task_set_process_template.md` (~100 LOC)
   - Task set work process template

8. `docs/templates/epic_process_template.md` (~100 LOC)
   - Epic work process template

### MODIFIED FILES (4 total):

9. `.git/hooks/pre-commit` (+100 LOC)
   - Add hierarchical process enforcement

10. `state/roadmap.yaml` (+50 LOC)
    - Add work_process metadata to task sets/epics

11. `docs/ROADMAP.md` (+100 LOC)
    - Document hierarchical processes

12. `CLAUDE.md` (+50 LOC)
    - Update agent work process guidance

**TOTAL:** 12 files, ~1500 LOC

---

## Task Breakdown Strategy

**⚠️ EXCEEDS MICRO-BATCHING LIMITS:**
- Limit: ≤5 files, ≤150 LOC per task
- Actual: 12 files, 1500 LOC
- **Must split into multiple sub-tasks**

### Task 1: Foundation - Schema + Mutation API
**Files:**
- `shared/schemas/work_process_schema.ts` (200 LOC)
- `tools/wvo_mcp/src/orchestrator/roadmap_mutations.ts` (250 LOC)

**Total:** 2 files, 450 LOC

**Purpose:** Core infrastructure for work processes and mutations

**Deliverables:**
- TypeScript types for work processes
- Mutation API with validation
- Unit tests for mutation validation

### Task 2: Execution + Meta-Review
**Files:**
- `tools/wvo_mcp/src/work_process/hierarchical_executor.ts` (300 LOC)
- `docs/templates/task_set_process_template.md` (100 LOC)
- `docs/templates/epic_process_template.md` (100 LOC)

**Total:** 3 files, 500 LOC

**Purpose:** Work process execution engine + templates

**Deliverables:**
- Hierarchical executor
- Meta-review analyzer
- Process templates with examples
- Integration tests

### Task 3: Enforcement
**Files:**
- `tools/wvo_mcp/src/critics/process_enforcement_critic.ts` (150 LOC)
- `scripts/find_incomplete_task_sets.py` (50 LOC)
- `scripts/find_unvalidated_epics.py` (50 LOC)
- `.git/hooks/pre-commit` (+100 LOC)

**Total:** 4 files, 350 LOC

**Purpose:** Enforcement mechanisms

**Deliverables:**
- ProcessEnforcementCritic
- Pre-commit hook enforcement
- Helper scripts
- End-to-end enforcement tests

### Task 4: Documentation + Integration
**Files:**
- `state/roadmap.yaml` (+50 LOC)
- `docs/ROADMAP.md` (+100 LOC)
- `CLAUDE.md` (+50 LOC)

**Total:** 3 files, 200 LOC

**Purpose:** Documentation + roadmap integration

**Deliverables:**
- Updated roadmap structure
- Documentation
- Integration with existing systems
- Deployment guide

---

## Dependencies

**Must exist before Task 1:**
- [ ] AFP-ROADMAP-SCHEMA (roadmap structure types)

**Must exist before Task 2:**
- [ ] Task 1 complete (schema + mutation API)

**Must exist before Task 3:**
- [ ] Task 2 complete (executor + templates)

**Must exist before Task 4:**
- [ ] Tasks 1-3 complete

**Can build in parallel:**
- Documentation can start early
- Templates can be drafted early

---

## Integration Strategy

### With Existing AFP
- Task-level AFP: No changes, continues as-is
- Hierarchical processes: NEW, complementary
- Meta-review: Applies to all levels

### With Autopilot
Autopilot learns to:
1. Detect task set completion → Run task set process
2. Detect epic shipping → Run epic process
3. Parse process evidence → Extract mutations
4. Create remediation tasks → Add to roadmap
5. Execute remediation → High priority

### With Critics
- Existing critics: Unchanged (review code)
- ProcessEnforcementCritic: NEW (review process compliance)
- Meta-review: NEW (review process effectiveness)

### With Roadmap
- Roadmap.yaml gains work_process metadata
- Process evidence stored in state/evidence/
- Mutations logged to state/mutations.jsonl
- Metrics logged to state/analytics/process_effectiveness.jsonl

---

## Testing Strategy

### Unit Tests
- Mutation validation (cycles, dependencies, guardrails)
- Meta-review flaw detection
- Metrics calculation
- Template parsing

### Integration Tests
- End-to-end: Task set completion → process → mutations → remediation
- Enforcement: Pre-commit hook blocks without evidence
- Meta-review: Flaws found → remediation tasks created
- Template evolution: v1 → v2 with A/B testing

### Manual Tests
- Autopilot executes task set process autonomously
- Meta-review identifies real process flaws
- Remediation tasks are actionable
- Enforcement blocks incomplete processes

### Load Tests
- 100 task sets, concurrent process execution
- Verify: Performance < targets, no crashes
- Metrics collection doesn't degrade performance

---

## Rollout Plan

### Week 1: Foundation
- Implement schema + mutation API
- Unit tests pass
- Integration tests for mutations

### Week 2: Execution
- Implement hierarchical executor
- Implement meta-review analyzer
- Create process templates
- Integration tests pass

### Week 3: Enforcement
- Implement ProcessEnforcementCritic
- Add pre-commit hooks
- Helper scripts
- End-to-end tests pass

### Week 4: Documentation + Deployment
- Update roadmap.yaml
- Write documentation
- Integration guide for autopilot
- Deploy to production
- Monitor first executions

### Week 5+: Meta-Review Iteration
- Gather metrics from real executions
- First meta-reviews identify flaws
- Create remediation tasks
- Improve templates based on data
- Quarterly deep review

---

## Next Steps

1. **THINK**: Edge cases, infinite loops, conflicts
2. **GATE**: Design validation with AFP/SCAS analysis
3. **IMPLEMENT**: Execute Tasks 1-4 in sequence
4. **VERIFY**: Test all components
5. **REVIEW**: Quality check
6. **DEPLOY**: Roll out to production
7. **MONITOR**: Track first meta-reviews

---

**Phase completion date**: 2025-11-05
**Architect**: Claude Council

**Key insight:** Enforcement is CRITICAL. Without it, hierarchical processes become optional bureaucracy. Pre-commit hooks + critics + mandatory remediation ensure processes are executed and improved continuously.
