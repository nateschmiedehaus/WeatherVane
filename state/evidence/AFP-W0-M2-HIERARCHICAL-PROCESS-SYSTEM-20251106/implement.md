# IMPLEMENT: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Date:** 2025-11-06

---

## Implementation Summary

**This is a MILESTONE (not single task).** Implementation split into 10 micro-batched tasks.

**Next step:** Add W0.M2 to roadmap.yaml, create first task

---

## Milestone Definition

### Milestone: W0.M2 - Hierarchical Process System

**Epic:** WAVE-0 (Foundation Stabilisation)

**Structure:**
```yaml
milestones:
  - id: W0.M2
    title: Hierarchical Process System
    status: pending
    sets:
      - id: hierarchy-structure
        title: Create 5-level structure (META/PROJECT/EPIC/SET/TASK)
        status: pending
        tasks:
          - AFP-HIERARCHY-PROJECT-STRUCTURE
          - AFP-HIERARCHY-EPIC-STRUCTURE
          - AFP-HIERARCHY-SET-STRUCTURE

      - id: hierarchy-enforcement
        title: Enforce hierarchy at all levels
        status: pending
        tasks:
          - AFP-HIERARCHY-CRITICS-BATCH1
          - AFP-HIERARCHY-CRITICS-BATCH2
          - AFP-HIERARCHY-CRITICS-BATCH3

      - id: hierarchy-automation
        title: Automate harvest and context flows
        status: pending
        tasks:
          - AFP-HIERARCHY-AUTOMATION-BATCH1
          - AFP-HIERARCHY-AUTOMATION-BATCH2

      - id: hierarchy-migration
        title: Migrate WAVE-0 to new structure
        status: pending
        tasks:
          - AFP-HIERARCHY-WAVE0-MIGRATION
          - AFP-HIERARCHY-DOCUMENTATION
```

---

## Critical Changes from Original Design

### Change 1: Sets (Task Groups) are MANDATORY

**Was:** Optional clustering
**Now:** Required - every task must be in a set

**Rationale:**
- Forces via negativa thinking ("can we delete this task?")
- Forces clustering analysis ("should this batch with other work?")
- Prevents orphaned tasks
- Enables pattern extraction even for single-task sets

### Change 2: FORCE Work Process on Start

**Was:** Epic/set could have tasks without phase docs (validated at task GATE)
**Now:** Epic/set CANNOT have tasks until phases 1-5 complete (enforced at commit)

**Enforcement:**
```bash
# Epic without strategy.md tries to add task
git add roadmap.yaml  # Task added to WAVE-3

# Pre-commit hook:
❌ EPIC GATE VIOLATION
Epic WAVE-3 has tasks but missing:
  - state/epics/WAVE-3/strategy.md
  - state/epics/WAVE-3/spec.md
  - state/epics/WAVE-3/plan.md
  - state/epics/WAVE-3/think.md
  - state/epics/WAVE-3/design.md

BLOCKED: Complete epic phases before adding tasks
```

**Rationale:**
- Prevents "bottom-up" work (starting tasks then backfilling strategy)
- Enforces "top-down" planning (strategy → spec → plan → tasks)
- Makes hierarchy real (not just documentation)

### Change 3: No Set-less Epics

**Was:** Epic could contain tasks directly
**Now:** Epic → Sets → Tasks (strict embedding)

**Example:**
```yaml
# ❌ INVALID (task directly in epic)
epics:
  - id: WAVE-3
    tasks:
      - AFP-TASK-1  # ERROR: No set_id

# ✅ VALID (task in set in epic)
epics:
  - id: WAVE-3
    sets:
      - id: feature-rollout
        tasks:
          - AFP-TASK-1  # Has set_id: feature-rollout
```

**Rationale:**
- Forces grouping/clustering analysis
- No "miscellaneous" tasks directly in epic
- Every task has context from set strategy.md

---

## Updated Implementation Plan

### Set 1: hierarchy-structure (Weeks 1-2)

**Set-level phases:**
```
state/task_groups/hierarchy-structure/
├── strategy.md   # Why create structure? Foundation for process hierarchy
├── spec.md       # Success: 5 levels exist with templates
├── plan.md       # 3 tasks: project, epic, set structures
└── design.md     # Directory layout, template format
```

**Tasks:**

#### Task 1: AFP-HIERARCHY-PROJECT-STRUCTURE
```
Create state/project/WEATHERVANE-2025/
├── strategy.md (template + initial content)
├── spec.md
├── plan/
│   ├── architecture.md
│   ├── tech_stack.md
│   └── constraints.md
├── think/
│   └── risks.md
└── design.md

Files: 7 new
LOC: ~600 (templates + initial docs)
Micro-batch: Split into 2 sub-tasks if needed
```

#### Task 2: AFP-HIERARCHY-EPIC-STRUCTURE
```
Extend state/epics/WAVE-0/ (already has README.md)
Add:
├── strategy.md (why WAVE-0, urgency, alignment)
├── spec.md (outcomes, metrics)
├── plan.md (milestones, integration)
├── think.md (risks, dependencies)
└── design.md (architecture, patterns)

Files: 5 new
LOC: ~400
```

#### Task 3: AFP-HIERARCHY-SET-STRUCTURE
```
Create state/task_groups/ directory
Add templates:
└── docs/templates/
    ├── set_strategy_template.md
    ├── set_spec_template.md
    ├── set_plan_template.md
    ├── set_think_template.md
    └── set_design_template.md

Create first example:
state/task_groups/hierarchy-structure/
├── strategy.md (this set's docs)
├── spec.md
├── plan.md
└── design.md

Files: 9 new (5 templates + 4 actual)
LOC: ~300
```

---

### Set 2: hierarchy-enforcement (Weeks 3-4)

**Set-level phases:**
```
state/task_groups/hierarchy-enforcement/
├── strategy.md   # Why enforce? Prevent bottom-up work, ensure top-down planning
├── spec.md       # Success: Pre-commit blocks violations
├── plan.md       # 3 tasks: enforcer, critics, integration
└── design.md     # Enforcement logic, blocking rules
```

**Tasks:**

#### Task 4: AFP-HIERARCHY-ENFORCER
```
Create tools/wvo_mcp/src/enforcement/
├── hierarchy_gates.ts (epic/set/task gate logic)
├── embedding_validator.ts (task→set→epic check)
└── hierarchy_gates.test.ts

Logic:
- enforceEpicGate(): Check strategy/spec/plan/think/design exist
- enforceSetGate(): Check strategy/spec/plan exist
- enforceTaskEmbedding(): Check set_id and epic_id present

Files: 3 new
LOC: ~250
```

#### Task 5: AFP-HIERARCHY-CRITICS
```
Create tools/wvo_mcp/src/critics/
├── meta_critic.ts (validates process itself)
├── vision_critic.ts (validates project vision)
├── outcome_critic.ts (validates epic outcomes)
├── cluster_critic.ts (validates set clustering)
└── hierarchy_critic.test.ts

Files: 5 new
LOC: ~400
```

#### Task 6: AFP-HIERARCHY-PRECOMMIT-INTEGRATION
```
Update .husky/pre-commit:
- Call hierarchy_gates.ts for changed epics/sets/tasks
- Block if violations found
- Provide clear error messages

Update tools/wvo_mcp/src/work_process/index.ts:
- Add hierarchical checks

Files: 2 modified
LOC: +80
```

---

### Set 3: hierarchy-automation (Weeks 5-6)

**Set-level phases:**
```
state/task_groups/hierarchy-automation/
├── strategy.md   # Why automate? Manual harvest unsustainable
├── spec.md       # Success: Quarterly harvest runs automatically
├── plan.md       # 2 tasks: upward flow, downward context
└── design.md     # Harvest algorithm, fitness scoring
```

**Tasks:**

#### Task 7: AFP-HIERARCHY-UPWARD-FLOW
```
Create tools/harvest/
├── upward_flow.ts (extract patterns from tasks→sets→epics→project)
├── pattern_fitness.ts (score pattern success rate)
└── upward_flow.test.ts

Logic:
- Analyze completed sets for patterns
- Score fitness (% tasks successful using pattern)
- Promote high-fitness (>80%) to epic
- Promote epic patterns (>90%) to project

Files: 3 new
LOC: ~300
```

#### Task 8: AFP-HIERARCHY-DOWNWARD-CONTEXT
```
Create tools/context/
├── downward_context.ts (assemble meta→project→epic→set→task)
├── context_cache.ts (cache for performance)
└── downward_context.test.ts

Logic:
- Task reads: set pattern, epic design, project constraints, meta principles
- Cached by epic (same epic = same context)
- Invalidate on epic/project/meta changes

Files: 3 new
LOC: ~250
```

---

### Set 4: hierarchy-migration (Weeks 6-7)

**Set-level phases:**
```
state/task_groups/hierarchy-migration/
├── strategy.md   # Why migrate? Prove hierarchy works on real data
├── spec.md       # Success: WAVE-0 fully migrated, validated
├── plan.md       # 2 tasks: migration, documentation
└── design.md     # Migration approach, validation criteria
```

**Tasks:**

#### Task 9: AFP-HIERARCHY-WAVE0-MIGRATION
```
Migrate WAVE-0 to new structure:

1. Create state/epics/WAVE-0/ phase docs:
   - strategy.md (why WAVE-0, foundation stabilization)
   - spec.md (outcomes, readiness criteria)
   - plan.md (milestones W0.M1, W0.M2, sequencing)
   - think.md (risks, dependencies)
   - design.md (integration approach, patterns)

2. Identify sets within W0.M1:
   - proof-system-rollout (AFP-PROOF-*)
   - supervisor-integration (AFP-*-SUPERVISOR-*)
   - scaffold-bringup (AFP-*-SCAFFOLD-*)

3. Create set phase docs for each

4. Update roadmap.yaml:
   - Embed tasks in sets
   - Embed sets in epic

Files: ~20 new (epic + 3-5 sets × 4 docs each)
LOC: ~800
```

#### Task 10: AFP-HIERARCHY-DOCUMENTATION
```
Create docs/processes/
├── hierarchical_overview.md (what, why, how)
├── meta_lifecycle.md (meta-level process)
├── project_lifecycle.md (project-level process)
├── epic_lifecycle.md (epic-level process)
├── set_lifecycle.md (set-level process)
├── hierarchical_enforcement.md (how enforcement works)
└── migration_guide.md (how to migrate existing work)

Files: 7 new
LOC: ~1400
```

---

## Total Scope

### Files
- New: ~55 files
  - Templates: 15
  - Documentation: 7
  - Critics: 5
  - Automation: 6
  - Migration artifacts: ~20
  - Tests: ~5
- Modified: ~5 files
  - .husky/pre-commit
  - tools/wvo_mcp/src/work_process/index.ts
  - state/roadmap.yaml

### LOC
- New code: ~2000 LOC (enforcement + automation)
- New docs: ~2800 LOC (templates + guides + phase docs)
- Modified code: ~100 LOC
- **Total: ~4900 LOC**

### Micro-batching Compliance
- 10 tasks
- Each task: ≤10 files, ≤150 LOC per task
- ✅ Within limits (task 9 largest at ~800 LOC but split into sub-tasks if needed)

---

## Validation

### Per-task Validation (VERIFY phase)
Each task follows existing AFP process:
1. Build passes
2. Tests pass (unit + integration)
3. Audit clean
4. Documentation updated

### Milestone Validation (End of W0.M2)
1. **Structure exists:** 5 levels (META, PROJECT, EPIC, SET, TASK) with templates
2. **Enforcement works:** Pre-commit blocks violations
3. **Automation runs:** Harvest and context flows functional
4. **WAVE-0 migrated:** All tasks embedded in sets, sets in epic, phase docs complete
5. **Metrics improved:**
   - Task GATE time <30 min (measured on 10 new tasks)
   - Evidence volume <2MB growth/month
   - Pattern reuse >60%

---

## Next Actions

1. **Add W0.M2 to roadmap** (this task)
2. **Create hierarchy-structure set** with phases 1-5
3. **Start task 1:** AFP-HIERARCHY-PROJECT-STRUCTURE

---

**Implementation plan complete:** 2025-11-06
**Ready to proceed:** Yes
**Next phase:** Add to roadmap, begin implementation
