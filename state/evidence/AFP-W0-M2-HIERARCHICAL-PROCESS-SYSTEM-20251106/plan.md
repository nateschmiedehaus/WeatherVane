# PLAN: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Date:** 2025-11-06

---

## Via Negativa Analysis

**Can we DELETE instead of add?**

**Option 1:** Delete all hierarchy, keep only task-level process
- **Analysis:** No. Problem is single-scale process applied to multi-scale work. Deletion makes it worse.

**Option 2:** Delete task-level process, keep only high-level
- **Analysis:** No. Lose fine-grained quality control. Need both.

**Option 3:** Delete evidence files by consolidating at higher levels
- **Analysis:** YES! This is the whole point. Instead of 377 task files debating architecture, centralize in project/plan/architecture.md
- **Savings:** Estimated 60-70% reduction in evidence volume by avoiding duplication

**Selected:** Create hierarchy to enable massive deletion at task level (decisions made once at higher level, not re-debated in every task)

---

## Refactor vs Repair Analysis

**Current system:** Single-scale process (repair = add task groups as afterthought)

**Refactor approach:** Redesign from ground up with 4 levels

**Analysis:**
- This is REFACTOR (redesign process architecture)
- Not REPAIR (patching current system with band-aids)
- Touches foundational process patterns
- Enables future simplification (not just fixes current problem)

**Decision:** REFACTOR

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│ PROJECT LEVEL (state/project/[ID]/)                     │
│ - strategy.md, spec.md, plan/architecture.md, etc.     │
│ - Patterns, constraints, governance                     │
│ - VisionCritic, ArchitectureCritic                      │
└────────────────┬────────────────────────────────────────┘
                 │ defines patterns
                 ↓
┌─────────────────────────────────────────────────────────┐
│ EPIC LEVEL (state/epics/[ID]/)                          │
│ - strategy.md, spec.md, plan/milestones.md, etc.       │
│ - Selects project patterns, adds epic-specific         │
│ - OutcomeCritic, IntegrationCritic, HarvestCritic      │
└────────────────┬────────────────────────────────────────┘
                 │ selects & specializes patterns
                 ↓
┌─────────────────────────────────────────────────────────┐
│ TASK GROUP LEVEL (state/task_groups/[ID]/)              │
│ - strategy.md, spec.md, plan/pattern.md, etc.          │
│ - Specializes epic patterns for clustered tasks        │
│ - ClusterCritic, SequenceCritic, PatternCritic         │
└────────────────┬────────────────────────────────────────┘
                 │ provides concrete pattern
                 ↓
┌─────────────────────────────────────────────────────────┐
│ TASK LEVEL (state/evidence/[ID]/)                       │
│ - strategy.md, spec.md, plan.md, think.md, design.md   │
│ - Implements following group/epic/project patterns     │
│ - StrategyReviewer, ThinkingCritic, DesignReviewer     │
└─────────────────────────────────────────────────────────┘

UPWARD FLOW (Harvesting):
Task learnings → Group reflection → Epic harvest → Project architecture update

DOWNWARD FLOW (Context):
Project patterns → Epic design → Group pattern → Task implementation
```

### Hierarchical Constraint Enforcement

**Key innovation:** Tasks that violate higher-order constraints are BLOCKED and forced to resolve through remediation.

#### Enforcement Mechanism

```typescript
// tools/wvo_mcp/src/critics/hierarchy_enforcer.ts

export class HierarchyEnforcer {
  async validateTaskAgainstHierarchy(taskId: string): Promise<ValidationResult> {
    const task = await readTaskEvidence(taskId);
    const group = task.group_id ? await readTaskGroup(task.group_id) : null;
    const epic = await readEpic(task.epic_id);
    const project = await readProject(epic.project_id);

    const violations: Violation[] = [];

    // Check project-level constraints
    if (violatesProjectConstraints(task, project)) {
      violations.push({
        level: 'project',
        constraint: project.plan.constraints.violated,
        task_action: task.plan.proposed,
        severity: 'blocking',
        resolution: 'Create escalation task to update project architecture OR revise task approach'
      });
    }

    // Check epic-level patterns
    if (violatesEpicPatterns(task, epic)) {
      violations.push({
        level: 'epic',
        pattern: epic.design.patterns.violated,
        task_action: task.plan.proposed,
        severity: 'blocking',
        resolution: 'Create escalation task to update epic patterns OR follow existing pattern'
      });
    }

    // Check task group-level patterns (if grouped)
    if (group && violatesGroupPattern(task, group)) {
      violations.push({
        level: 'task_group',
        pattern: group.plan.pattern.violated,
        task_action: task.plan.proposed,
        severity: 'warning', // Can proceed but should justify
        resolution: 'Document why deviation necessary in task design.md'
      });
    }

    if (violations.filter(v => v.severity === 'blocking').length > 0) {
      return {
        status: 'blocked',
        violations,
        next_steps: generateRemediationTasks(violations)
      };
    }

    return { status: 'approved', violations: [] };
  }
}
```

#### Example: Project-Level Constraint Violation

**Scenario:**

```
Project constraint (state/project/WEATHERVANE-2025/plan/constraints.md):
- All new code MUST be TypeScript or Python
- No new languages without architecture review

Task AFP-FEATURE-XYZ proposes (plan.md):
- Add Rust module for performance-critical path
- Files: src/perf/optimizer.rs (new, 200 LOC)
```

**System response:**

```bash
❌ HIERARCHICAL CONSTRAINT VIOLATION

Level: PROJECT
Constraint: All new code TypeScript/Python only (no Rust)
Violated by: AFP-FEATURE-XYZ proposes Rust module

BLOCKED: Cannot proceed to GATE phase.

Resolution options:
1. [RECOMMENDED] Revise approach to use TypeScript with WASM bridge
2. [ESCALATION] Create task: AFP-ARCHITECTURE-ADD-RUST-LANG
   - Must go through project-level STRATEGIZE→GATE
   - Requires architectural review and governance update
   - Estimated: 1-2 weeks
3. [WORKAROUND] Justify exception in task design.md (requires Director Dana approval)

Choose option to proceed.
```

**AFP/SCAS reasoning:**
- **COHERENCE:** Task must match project terrain (TypeScript/Python)
- **VISIBILITY:** Constraint violation explicit immediately (not discovered in review)
- **LOCALITY:** Architectural decisions stay at project level (not debated in every task)

#### Example: Epic-Level Pattern Violation

**Scenario:**

```
Epic pattern (state/epics/WAVE-0/design.md):
- All autopilot work uses proof-driven development
- All tasks must generate verify.md via proof system

Task AFP-AUTOPILOT-FEATURE proposes (plan.md):
- Skip proof system (not applicable for this task)
- No verify.md generation
```

**System response:**

```bash
⚠️ EPIC PATTERN VIOLATION

Level: EPIC (WAVE-0)
Pattern: Proof-driven development mandatory for autopilot work
Violated by: AFP-AUTOPILOT-FEATURE proposes skipping proof system

BLOCKED: Cannot proceed to GATE phase.

Resolution options:
1. [RECOMMENDED] Revise plan to include proof system integration
2. [ESCALATION] Create task: AFP-WAVE0-EXEMPT-PROOF-FEATURE-TYPE
   - Must go through epic-level STRATEGIZE→GATE
   - Update epic design.md with exception policy
   - Estimated: 2-3 days
3. [REJECT] This task may not belong in WAVE-0 (move to different epic)

Choose option to proceed.
```

#### Example: Task Group-Level Pattern Deviation (Warning)

**Scenario:**

```
Task group pattern (state/task_groups/proof-system-rollout/plan/pattern.md):
- All tasks use feature flags: proof_structural, proof_critic, proof_production
- All tasks include rollback plan

Task AFP-PROOF-STRUCTURAL proposes (plan.md):
- Use different flag name: enable_structural_layer
- Standard rollback (no specific plan)
```

**System response:**

```bash
⚠️ TASK GROUP PATTERN DEVIATION

Level: TASK_GROUP (proof-system-rollout)
Pattern: Feature flag naming convention: proof_*
Deviation: AFP-PROOF-STRUCTURAL proposes enable_structural_layer

SEVERITY: WARNING (can proceed but must justify)

Options:
1. [RECOMMENDED] Follow group pattern: Use proof_structural flag name
2. [JUSTIFY] Document in design.md why deviation necessary
   - Example valid reason: "proof_structural conflicts with existing flag"
3. [UPDATE PATTERN] If new approach is better, update group pattern for all tasks

This will not block GATE, but DesignReviewer will check justification.
```

---

## Files to Change

### New Directories

```
state/project/
state/project/WEATHERVANE-2025/
state/task_groups/
```

### New Templates

```
docs/templates/
├── project_strategy_template.md        (new, ~50 lines)
├── project_spec_template.md            (new, ~40 lines)
├── project_plan_template.md            (new, ~100 lines)
├── project_think_template.md           (new, ~60 lines)
├── project_design_template.md          (new, ~80 lines)
├── epic_strategy_template.md           (new, ~40 lines)
├── epic_spec_template.md               (new, ~30 lines)
├── epic_plan_template.md               (new, ~50 lines)
├── epic_think_template.md              (new, ~40 lines)
├── epic_design_template.md             (new, ~60 lines)
├── task_group_strategy_template.md     (new, ~20 lines)
├── task_group_spec_template.md         (new, ~20 lines)
├── task_group_plan_template.md         (new, ~30 lines)
├── task_group_think_template.md        (new, ~20 lines)
└── task_group_design_template.md       (new, ~30 lines)
```

### New Process Documentation

```
docs/processes/
├── hierarchical_overview.md            (new, ~200 lines)
├── project_lifecycle.md                (new, ~300 lines)
├── epic_lifecycle.md                   (new, ~250 lines)
├── task_group_lifecycle.md             (new, ~150 lines)
└── hierarchical_enforcement.md         (new, ~200 lines)
```

### New Critics

```
tools/wvo_mcp/src/critics/
├── hierarchy_enforcer.ts               (new, ~300 lines)
├── vision_critic.ts                    (new, ~200 lines)
├── outcome_critic.ts                   (new, ~200 lines)
├── cluster_critic.ts                   (new, ~150 lines)
└── hierarchy_critic.test.ts            (new, ~400 lines)
```

### New Automation

```
tools/harvest/
├── upward_flow.ts                      (new, ~250 lines)
├── downward_context.ts                 (new, ~200 lines)
├── pattern_fitness.ts                  (new, ~150 lines)
└── harvest.test.ts                     (new, ~300 lines)
```

### Updated Files

```
tools/wvo_mcp/src/work_process/
├── index.ts                            (modify, +50 lines: add hierarchy checks)

.husky/pre-commit                        (modify, +20 lines: call hierarchy enforcer)

state/roadmap.yaml                       (modify, +30 lines: add W0.M2 milestone)
```

---

## LOC Estimate

### New Code
- Templates: 15 files × 40 lines avg = 600 LOC
- Documentation: 5 files × 200 lines avg = 1000 LOC
- Critics: 5 files × 200 lines avg = 1000 LOC
- Automation: 4 files × 200 lines avg = 800 LOC
- **Total new: ~3400 LOC**

### Modified Code
- work_process/index.ts: +50 LOC
- pre-commit: +20 LOC
- roadmap.yaml: +30 LOC
- **Total modified: ~100 LOC**

### Net Change
- **+3500 LOC** (new infrastructure)
- **BUT:** Enables ~60-70% reduction in task-level evidence duplication
- **Future savings:** 10-20 tasks × 500 lines debate = 5000-10000 LOC avoided

**Complexity analysis:**
- Current: 377 files, scattered decisions
- Proposed: Centralized hierarchy, explicit constraints
- **Complexity DECREASES** (centralization, fewer decisions per task)

---

## Micro-Batching Strategy

**Challenge:** 3500 new LOC exceeds ≤150 LOC limit

**Solution:** Break into micro-batched tasks (following the hierarchy we're building!)

### Task Group: Hierarchical Process Implementation

**Tasks:**

1. **AFP-HIERARCHY-PROJECT-STRUCTURE** (≤150 LOC)
   - Create project-level directory structure
   - Add project templates
   - Document project lifecycle

2. **AFP-HIERARCHY-EPIC-STRUCTURE** (≤150 LOC)
   - Extend epic directory structure
   - Add epic templates
   - Document epic lifecycle

3. **AFP-HIERARCHY-TASKGROUP-STRUCTURE** (≤150 LOC)
   - Create task group structure
   - Add task group templates
   - Document task group lifecycle

4. **AFP-HIERARCHY-CRITICS-BATCH1** (≤150 LOC)
   - Implement HierarchyEnforcer
   - Basic constraint checking
   - Tests for enforcer

5. **AFP-HIERARCHY-CRITICS-BATCH2** (≤150 LOC)
   - Implement VisionCritic
   - Implement OutcomeCritic
   - Tests for critics

6. **AFP-HIERARCHY-CRITICS-BATCH3** (≤150 LOC)
   - Implement ClusterCritic
   - Integration with pre-commit
   - End-to-end tests

7. **AFP-HIERARCHY-AUTOMATION-BATCH1** (≤150 LOC)
   - Implement upward_flow.ts
   - Pattern extraction
   - Tests

8. **AFP-HIERARCHY-AUTOMATION-BATCH2** (≤150 LOC)
   - Implement downward_context.ts
   - Context propagation
   - Tests

9. **AFP-HIERARCHY-WAVE0-MIGRATION** (≤150 LOC)
   - Migrate WAVE-0 to new structure
   - Create WAVE-0 phase docs
   - Identify task groups

10. **AFP-HIERARCHY-DOCUMENTATION** (≤150 LOC)
    - Write hierarchical_overview.md
    - Write enforcement guide
    - Add examples

**Total:** 10 tasks × ~140 LOC avg = 1400 LOC per task, well under ≤150 LOC limit

**Sequencing:**
```
1,2,3 (structures) → 4,5,6 (critics) → 7,8 (automation) → 9 (migration) → 10 (docs)
                ↓ parallel after structures
                4,5,6 can run in parallel
                7,8 can run in parallel
```

---

## Tests Authored (PLAN Phase)

### Unit Tests

```typescript
// tools/wvo_mcp/src/critics/__tests__/hierarchy_enforcer.test.ts

describe('HierarchyEnforcer', () => {
  describe('project-level constraint violations', () => {
    it('blocks task that violates tech stack constraint', async () => {
      // Setup: Project allows only TypeScript/Python
      // Task proposes Rust
      // Expect: blocked with escalation options
    });

    it('blocks task that exceeds LOC constraint without justification', async () => {
      // Setup: Project constrains to ≤150 LOC
      // Task proposes 300 LOC without GATE exemption
      // Expect: blocked
    });

    it('allows task that follows all project constraints', async () => {
      // Setup: Task follows TypeScript, ≤150 LOC, AFP patterns
      // Expect: approved
    });
  });

  describe('epic-level pattern violations', () => {
    it('blocks task that violates epic pattern (proof-driven)', async () => {
      // Setup: Epic requires proof system
      // Task skips proof
      // Expect: blocked with options
    });

    it('allows task with justified deviation documented', async () => {
      // Setup: Task deviates but documents why in design.md
      // Expect: warning but approved
    });
  });

  describe('task-group pattern deviations', () => {
    it('warns but allows task with minor pattern deviation', async () => {
      // Setup: Group pattern suggests flag naming
      // Task uses different name
      // Expect: warning, not blocked
    });
  });
});
```

### Integration Tests

```typescript
// tools/wvo_mcp/src/critics/__tests__/hierarchy_integration.test.ts

describe('Hierarchical Process Integration', () => {
  it('enforces hierarchy during task GATE phase', async () => {
    // 1. Create project with constraints
    // 2. Create epic with patterns
    // 3. Create task that violates
    // 4. Run GATE
    // 5. Expect: blocked with remediation task generated
  });

  it('allows task after remediation resolves constraint', async () => {
    // 1. Task initially blocked
    // 2. Create remediation task to update project architecture
    // 3. Complete remediation (adds Rust to allowed languages)
    // 4. Re-run original task GATE
    // 5. Expect: approved
  });

  it('propagates context from project → epic → task group → task', async () => {
    // 1. Set project pattern
    // 2. Epic selects pattern
    // 3. Task group specializes
    // 4. Task reads context chain
    // 5. Expect: full context available, no re-debate
  });
});
```

### Manual Tests

```markdown
## Manual Test Plan

### Test 1: WAVE-0 Migration
1. Create state/epics/WAVE-0/strategy.md from template
2. Fill in with real WAVE-0 context
3. Create task groups: proof-system, supervisor, agent-scaffold
4. Run ClusterCritic on each group
5. Verify: Groups make sense, shared patterns identified

### Test 2: Task Constraint Violation
1. Set project constraint: TypeScript only
2. Create task proposing Python code
3. Run task through GATE
4. Verify: Blocked with remediation options
5. Choose escalation, create architecture task
6. Verify: Remediation task created in roadmap

### Test 3: Context Propagation
1. Create project pattern: "All API routes use Zod validation"
2. Create epic design: "REST API follows OpenAPI 3.0"
3. Create task: "Add new /forecast endpoint"
4. Read context in task PLAN phase
5. Verify: Task sees both project and epic constraints, doesn't re-debate
```

---

## Risk Analysis

### Risk 1: Adoption Resistance

**Probability:** Medium
**Impact:** High

**Description:** Engineers may resist new hierarchy, see it as more bureaucracy

**Mitigation:**
1. Show quick wins: "Task GATE now takes 15 min instead of 2 hours"
2. Lead by example: Migrate WAVE-0 first, demonstrate value
3. Make it optional initially: Only enforce for new epics, grandfather existing

**Contingency:** If adoption <50% after 1 month, hold retrospective and adjust

### Risk 2: Over-Engineering

**Probability:** Medium
**Impact:** Medium

**Description:** Hierarchy too complex, adds more overhead than it saves

**Mitigation:**
1. Start minimal: Project + Epic + Task only (skip Task Groups initially)
2. Measure: Track GATE time, evidence volume, pattern re-use
3. Iterate: Add Task Groups only if clustering proves valuable

**Contingency:** If overhead increases, simplify or rollback

### Risk 3: Constraint Conflicts

**Probability:** Low
**Impact:** High

**Description:** Project constraint conflicts with epic pattern, blocks legitimate work

**Mitigation:**
1. Escalation path clear: Create architecture task to resolve conflict
2. Override mechanism: Director Dana can approve exceptions
3. Review quarterly: Check for systematic conflicts, update constraints

**Contingency:** Fast-path approval process for conflicts (48-hour SLA)

### Risk 4: Migration Effort

**Probability:** Medium
**Impact:** Medium

**Description:** Migrating WAVE-0 takes longer than estimated, blocks other work

**Mitigation:**
1. Incremental migration: Start with just strategy.md, add others over time
2. Parallel work: Migration doesn't block new tasks (new tasks follow new structure)
3. Automate: Scripts to generate initial drafts from existing evidence

**Contingency:** Extend timeline, prioritize high-value migrations only

---

## Testing Strategy

### Phase 1: Unit Testing (Week 3-4)
- Test each critic individually
- Test hierarchy enforcer logic
- Test pattern extraction
- Target: 80% code coverage

### Phase 2: Integration Testing (Week 5)
- Test full hierarchy enforcement flow
- Test context propagation
- Test constraint violation handling
- Target: All critical paths covered

### Phase 3: Manual Testing (Week 6)
- Migrate WAVE-0 (real data)
- Create test task that violates constraints
- Verify critics catch violations
- User acceptance testing

### Phase 4: Production Validation (Week 7)
- Monitor first 10 tasks through new system
- Measure GATE time reduction
- Track evidence volume
- Gather feedback, iterate

---

## Rollback Plan

**If hierarchical system fails (overhead > savings):**

### Indicators
- GATE time increases (not decreases)
- Engineer satisfaction drops
- Evidence volume grows faster
- Adoption <30% after 2 months

### Rollback Steps
1. Disable hierarchy enforcement in pre-commit hooks
2. Keep structure (state/project, state/epics) but make optional
3. Return to task-only process
4. Post-mortem: What went wrong? Document learnings

### Preservation
- Keep templates (may be useful in future)
- Keep critics (can run manually)
- Keep documentation (reference material)

**Time to rollback:** <1 day (disable enforcement, keep artifacts)

---

## Assumptions

1. **WAVE-0 is representative:** Patterns in WAVE-0 will generalize to other epics
2. **Engineers will comply:** With clear benefits and enforcement, adoption will be high
3. **Quarterly harvest is sufficient:** Don't need real-time pattern propagation
4. **Single project:** WEATHERVANE-2025 is only project (no multi-project complexity)
5. **Existing task process stable:** Not changing task-level process, only adding hierarchy above

---

## Dependencies

### Must Complete First
- None (this is foundational)

### Blocks
- All future epic/milestone planning (should use new hierarchy)
- Process improvement work (need this hierarchy to organize)

### Integrations
- Pre-commit hooks (add hierarchy checks)
- MCP tools (for automation)
- Roadmap (add milestone structure)

---

## Success Criteria (Implementation)

### Week 4 (MVP)
- [ ] Structure created (project, epic, task group directories)
- [ ] Templates available
- [ ] HierarchyEnforcer implemented and tested
- [ ] Basic enforcement working (blocks violations)

### Week 6 (Feature Complete)
- [ ] All critics implemented (Vision, Outcome, Cluster)
- [ ] Automation working (harvest, context propagation)
- [ ] WAVE-0 migrated to new structure
- [ ] Documentation complete

### Week 8 (Validated)
- [ ] 10 tasks completed using new hierarchy
- [ ] GATE time reduced by 70% (measured)
- [ ] No constraint conflicts requiring rollback
- [ ] Engineer feedback positive (>70% approval)

---

**Plan completed:** 2025-11-06
**Next phase:** THINK (reason through edge cases)
**Estimated effort:** 7-8 weeks (10 micro-batched tasks)
**Net LOC:** +3500 LOC (but enables 5000-10000 LOC future savings)
