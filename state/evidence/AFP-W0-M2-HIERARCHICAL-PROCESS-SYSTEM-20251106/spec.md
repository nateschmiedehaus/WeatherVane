# SPEC: AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM

**Task ID:** AFP-W0-M2-HIERARCHICAL-PROCESS-SYSTEM-20251106
**Date:** 2025-11-06

---

## Acceptance Criteria

### Core Deliverables

- [ ] **4-level hierarchy defined:** Project → Epic → Task Group → Task
- [ ] **Consistent phase docs at all levels:** All levels have strategy.md, spec.md, plan.md, think.md, design.md (depth varies by level)
- [ ] **Evidence structure created:** `state/project/`, `state/epics/`, `state/task_groups/` with templates
- [ ] **Hierarchical critics implemented:** VisionCritic (project), OutcomeCritic (epic), ClusterCritic (group), existing task critics
- [ ] **Bidirectional flow automated:** Harvest script (upward), context propagation (downward)
- [ ] **WAVE-0 migrated:** Existing work reorganized into new hierarchy
- [ ] **Documentation complete:** Process guides for each level with examples

### Success Metrics

- [ ] **Task GATE time reduced:** From 2 hours to <30 minutes (patterns decided at higher level)
- [ ] **Architecture centralized:** All project patterns in `state/project/architecture.md` (not scattered)
- [ ] **Pattern propagation automated:** Quarterly harvest script extracts 5-10 patterns
- [ ] **Evidence growth controlled:** <2MB/month (down from current trend)

---

## Functional Requirements

### FR1: Consistent Phase Structure Across All Levels

**All levels use same phase names, different depth:**

```
PROJECT LEVEL (1-3 years, high depth)
├── strategy.md        # Phase 1: Why project exists, stakeholder value (5-10 pages)
├── spec.md            # Phase 2: 3-year outcomes, success metrics (3-5 pages)
├── plan.md            # Phase 3: Architecture, tech stack, constraints (10-20 pages)
├── think.md           # Phase 4: Systemic risks, failure modes (5-10 pages)
└── design.md          # Phase 5: Leadership decision, trade-off analysis (3-5 pages)

EPIC LEVEL (1-3 months, medium depth)
├── strategy.md        # Phase 1: Why epic now, problem urgency (2-3 pages)
├── spec.md            # Phase 2: Capabilities, user value, metrics (1-2 pages)
├── plan.md            # Phase 3: Milestone sequencing, integration approach (2-4 pages)
├── think.md           # Phase 4: Epic-level risks, failure modes (1-2 pages)
└── design.md          # Phase 5: Integration design, shared patterns (2-3 pages)

TASK GROUP LEVEL (1-2 weeks, light depth)
├── strategy.md        # Phase 1: Why group tasks, shared context (0.5-1 page)
├── spec.md            # Phase 2: Group outcomes, batch acceptance (0.5 page)
├── plan.md            # Phase 3: Task sequencing, shared pattern (1 page)
├── think.md           # Phase 4: Group risks, dependencies (0.5 page)
└── design.md          # Phase 5: Pattern specification (1 page)

TASK LEVEL (1-4 hours, minimal depth - EXISTING)
├── strategy.md        # Phase 1: Problem, root cause (0.5 page)
├── spec.md            # Phase 2: Acceptance criteria (0.5 page)
├── plan.md            # Phase 3: Files, LOC, tests (0.5 page)
├── think.md           # Phase 4: Edge cases (0.5 page)
└── design.md          # Phase 5: AFP/SCAS validation (1 page)
```

**Requirement:** Same filenames, same phase sequence, depth scales with scope.

---

### FR2: Project-Level Evidence Structure

**Location:** `state/project/[PROJECT-ID]/`

**Required files:**
```
state/project/WEATHERVANE-2025/
├── README.md             # Overview with navigation
│
├── strategy.md           # Phase 1: STRATEGIZE
│   ├── vision            # Why project exists
│   ├── stakeholders      # Who benefits, how
│   └── alignment         # Market/tech landscape fit
│
├── spec.md               # Phase 2: SPEC
│   ├── outcomes          # 3-year success criteria
│   ├── metrics           # How we measure success
│   └── requirements      # Must-have capabilities
│
├── plan.md               # Phase 3: PLAN
│   ├── architecture.md   # System design, patterns
│   ├── tech_stack.md     # Languages, frameworks, tools
│   ├── constraints.md    # AFP/SCAS rules, limits
│   └── phases.md         # Multi-year rollout plan
│
├── think.md              # Phase 4: THINK
│   ├── risks.md          # Systemic threats
│   ├── failure_modes.md  # What could go wrong
│   └── mitigations.md    # How we address each
│
├── design.md             # Phase 5: [GATE]
│   ├── decisions.md      # Key architectural choices
│   ├── tradeoffs.md      # What we sacrificed, why
│   └── alternatives.md   # Paths not taken
│
├── charter.md            # Phase 6: Team principles
├── prototype/            # Phase 7: POC validation
├── ratification.md       # Phase 8: Team consensus
├── rfc.md                # Phase 9: Public docs
└── governance.md         # Phase 10: Evolution policy
```

**Critics:** VisionCritic, ArchitectureCritic, GovernanceCritic

---

### FR3: Epic-Level Evidence Structure

**Location:** `state/epics/[EPIC-ID]/`

**Required files:**
```
state/epics/WAVE-0/
├── README.md             # Overview with milestones
│
├── strategy.md           # Phase 1: STRATEGIZE
│   ├── problem           # What problem solved
│   ├── urgency           # Why now
│   └── alignment         # How fits project vision
│
├── spec.md               # Phase 2: SPEC
│   ├── outcomes          # Capabilities delivered
│   ├── user_value        # Who benefits, how
│   └── metrics           # Success measurements
│
├── plan.md               # Phase 3: PLAN
│   ├── milestones.md     # M1, M2, M3 breakdown
│   ├── sequencing.md     # Order, dependencies
│   └── integration.md    # How milestones connect
│
├── think.md              # Phase 4: THINK
│   ├── risks.md          # Epic-level threats
│   ├── dependencies.md   # External blockers
│   └── failure_modes.md  # What could derail
│
├── design.md             # Phase 5: [GATE]
│   ├── architecture      # Integration approach
│   ├── patterns          # Shared across milestones
│   └── alternatives      # Approaches considered
│
├── allocation.md         # Phase 6: Teams/resources
├── integration_tests.md  # Phase 7: Cross-milestone
├── assessment.md         # Phase 8: Did we succeed?
├── showcase/             # Phase 9: Demo artifacts
└── harvest.md            # Phase 10: Learnings
```

**Critics:** OutcomeCritic, IntegrationCritic, HarvestCritic

---

### FR4: Task Group-Level Evidence Structure

**Location:** `state/task_groups/[GROUP-ID]/`

**Required files:**
```
state/task_groups/proof-system-rollout/
├── README.md             # Overview with task list
│
├── strategy.md           # Phase 1: STRATEGIZE
│   ├── why_grouped       # Why these tasks together
│   └── shared_context    # What they have in common
│
├── spec.md               # Phase 2: SPEC
│   ├── group_outcome     # What batch achieves
│   └── acceptance        # How we know it worked
│
├── plan.md               # Phase 3: PLAN
│   ├── sequence.md       # Task order A→B→C or parallel
│   ├── pattern.md        # Shared implementation approach
│   └── tasks/            # Links to individual tasks
│
├── think.md              # Phase 4: THINK
│   ├── risks             # Group-level risks
│   └── dependencies      # Cross-task blockers
│
├── design.md             # Phase 5: [GATE]
│   ├── pattern_spec      # Concrete shared pattern
│   └── dry_analysis      # Why not duplicate
│
└── reflection.md         # Phase 6: What learned (post-completion)
```

**Critics:** ClusterCritic, SequenceCritic, PatternCritic

---

### FR5: Task-Level Evidence Structure (EXISTING)

**Location:** `state/evidence/[TASK-ID]/`

**Files (unchanged):**
```
state/evidence/AFP-TASK-001/
├── strategy.md           # Phase 1: Problem, root cause
├── spec.md               # Phase 2: Acceptance criteria
├── plan.md               # Phase 3: Files, LOC, tests
├── think.md              # Phase 4: Edge cases
├── design.md             # Phase 5: AFP/SCAS validation
├── implement.md          # Phase 6: Code changes
├── verify.md             # Phase 7: Test results
├── review.md             # Phase 8: Quality check
└── monitor.md            # Phase 10: Post-deployment
```

**Critics (existing):** StrategyReviewer, ThinkingCritic, DesignReviewer, ProcessCritic

---

### FR6: Mandatory Work Process on Start (GATE Enforcement)

**CRITICAL:** Epic/Set MUST complete phases 1-5 BEFORE any child work begins

#### Epic Start Enforcement

```bash
# Attempt to create task in epic without phases
roadmap.yaml:
  epics:
    - id: WAVE-3
      title: New Epic
      milestones: []  # Empty, no strategy.md exists

# Attempt to add task:
git add roadmap.yaml  # Task T3.1 added to WAVE-3

# Pre-commit hook:
❌ EPIC GATE VIOLATION

Epic WAVE-3 has tasks but missing required phase docs:
  - state/epics/WAVE-3/strategy.md (MISSING)
  - state/epics/WAVE-3/spec.md (MISSING)
  - state/epics/WAVE-3/plan.md (MISSING)
  - state/epics/WAVE-3/think.md (MISSING)
  - state/epics/WAVE-3/design.md (MISSING)

BLOCKED: Complete epic phases 1-5 before adding tasks.

To fix:
1. Create epic phase docs using templates
2. Run: npm run epic:review WAVE-3
3. Once approved, retry commit
```

#### Set Start Enforcement

```bash
# Attempt to create task in set without phases
state/task_groups/new-feature-set/
  # No strategy.md, spec.md, etc.

# Task references set:
state/evidence/AFP-TASK-X/plan.md:
  set_id: new-feature-set

# Pre-commit hook:
❌ SET GATE VIOLATION

Set new-feature-set has tasks but missing required phase docs:
  - state/task_groups/new-feature-set/strategy.md (MISSING)
  - state/task_groups/new-feature-set/spec.md (MISSING)
  - state/task_groups/new-feature-set/plan.md (MISSING)

BLOCKED: Complete set phases 1-3 before adding tasks.

To fix:
1. Create set phase docs using templates
2. Run: npm run set:review new-feature-set
3. Once approved, retry commit
```

#### Enforcement Logic

```typescript
// tools/wvo_mcp/src/enforcement/hierarchy_gates.ts

export async function enforceEpicGate(epicId: string): Promise<GateResult> {
  const epic = await readEpic(epicId);
  const requiredDocs = ['strategy.md', 'spec.md', 'plan.md', 'think.md', 'design.md'];
  const missing = requiredDocs.filter(doc => !exists(`state/epics/${epicId}/${doc}`));

  if (missing.length > 0 && epic.tasks.length > 0) {
    return {
      status: 'blocked',
      reason: `Epic ${epicId} has ${epic.tasks.length} tasks but missing phase docs: ${missing.join(', ')}`,
      fix: 'Complete epic phases 1-5 before adding tasks'
    };
  }

  return { status: 'approved' };
}

export async function enforceSetGate(setId: string): Promise<GateResult> {
  const set = await readTaskGroup(setId);
  const requiredDocs = ['strategy.md', 'spec.md', 'plan.md'];  // Lighter for sets
  const missing = requiredDocs.filter(doc => !exists(`state/task_groups/${setId}/${doc}`));

  if (missing.length > 0 && set.tasks.length > 0) {
    return {
      status: 'blocked',
      reason: `Set ${setId} has ${set.tasks.length} tasks but missing phase docs: ${missing.join(', ')}`,
      fix: 'Complete set phases 1-3 before adding tasks'
    };
  }

  return { status: 'approved' };
}

export async function enforceTaskEmbedding(taskId: string): Promise<GateResult> {
  const task = await readTask(taskId);

  if (!task.set_id) {
    return {
      status: 'blocked',
      reason: `Task ${taskId} not embedded in a set`,
      fix: 'Create set and assign task.set_id'
    };
  }

  if (!task.epic_id) {
    return {
      status: 'blocked',
      reason: `Task ${taskId} not embedded in an epic`,
      fix: 'Assign task.epic_id'
    };
  }

  return { status: 'approved' };
}
```

#### Pre-commit Hook Integration

```bash
# .husky/pre-commit (added)

# Check epic gates
for epic in $(changed_epics); do
  npx tsx tools/wvo_mcp/src/enforcement/hierarchy_gates.ts --epic $epic
  if [ $? -ne 0 ]; then
    echo "❌ Epic gate violation, see above"
    exit 1
  fi
done

# Check set gates
for set in $(changed_sets); do
  npx tsx tools/wvo_mcp/src/enforcement/hierarchy_gates.ts --set $set
  if [ $? -ne 0 ]; then
    echo "❌ Set gate violation, see above"
    exit 1
  fi
done

# Check task embedding
for task in $(changed_tasks); do
  npx tsx tools/wvo_mcp/src/enforcement/hierarchy_gates.ts --task $task
  if [ $? -ne 0 ]; then
    echo "❌ Task embedding violation, see above"
    exit 1
  fi
done
```

---

### FR7: Bidirectional Flow

#### Upward Flow (Harvesting)

**Quarterly automation:**

```bash
# tools/harvest/upward_flow.sh

# 1. Analyze completed tasks
for task in $(find state/evidence -name "review.md"); do
  extract_patterns $task
  score_fitness $task
done

# 2. Cluster patterns by similarity
group_patterns > state/analytics/pattern_candidates.json

# 3. Promote high-fitness patterns
for pattern in $(high_fitness_patterns); do
  if proven_in_5_tasks; then
    promote_to_task_group $pattern
  fi
done

# 4. Task group → Epic
for group in state/task_groups/*; do
  if group_complete; then
    extract_learnings $group/reflection.md
    update_epic_harvest $epic_id
  fi
done

# 5. Epic → Project
for epic in state/epics/*; do
  if epic_complete; then
    extract_proven_patterns $epic/harvest.md
    update_project_patterns $project_id
  fi
done
```

**Output:** Updated `state/project/WEATHERVANE-2025/plan/architecture.md` with proven patterns

#### Downward Flow (Context)

**Task reads context chain:**

```typescript
// tools/context/downward_flow.ts

async function getContextForTask(taskId: string): Promise<Context> {
  const task = await readTask(taskId);
  const group = await readTaskGroup(task.group_id); // Optional
  const epic = await readEpic(task.epic_id);
  const project = await readProject(epic.project_id);

  return {
    // Project-level (broad)
    patterns: project.plan.architecture.patterns,
    constraints: project.plan.constraints,
    tech_stack: project.plan.tech_stack,

    // Epic-level (medium)
    shared_patterns: epic.design.patterns,
    integration_approach: epic.plan.integration,

    // Task group-level (specific)
    pattern_spec: group?.plan.pattern,
    sequence: group?.plan.sequence,

    // Task implements with full context
  };
}
```

**Output:** Task PLAN references higher-level decisions, doesn't re-debate

---

### FR7: Hierarchical Critics

#### VisionCritic (Project-level)

**Runs:** Annually, when strategy.md changes

**Checks:**
- Is vision articulate and unique?
- Are stakeholders identified with clear value?
- Is vision measurable (can we prove success)?
- Does vision avoid platitudes ("be the best", "world-class")?

**Example failure:**
```
❌ VISION TOO VAGUE
Project vision: "Build world-class AI system"
Problem: Not measurable, not unique
Fix: "Enable 10,000 weather forecasts/day with <1% error using autonomous AI agents by 2027"
```

#### OutcomeCritic (Epic-level)

**Runs:** Per epic, when spec.md changes

**Checks:**
- Are outcomes measurable?
- Do outcomes map to project mission?
- Are metrics defined (not just "improve X")?
- Is user value explicit?

**Example failure:**
```
❌ OUTCOME NOT MEASURABLE
Epic outcome: "Improve autopilot stability"
Problem: "Improve" is vague
Fix: "Autopilot runs 7 days unattended with <3 manual interventions"
```

#### ClusterCritic (Task Group-level)

**Runs:** Per group, when strategy.md changes

**Checks:**
- Are tasks actually related?
- Is shared context substantial (not forced)?
- Would tasks benefit from shared pattern?
- Could pattern be extracted to avoid duplication?

**Example failure:**
```
❌ FORCED GROUPING
Task group: "November work items"
Tasks: A (database), B (UI), C (docs)
Problem: No shared context, random grouping
Fix: Split into domain-specific groups
```

#### Task-level Critics (Existing)

**No changes needed** - existing critics continue to work

---

## Non-Functional Requirements

### NFR1: Scalability

- Hierarchy must support 10+ epics, 100+ task groups, 1000+ tasks
- Evidence storage: <50MB total (currently 11MB for 377 files)
- Harvest cycle: Complete in <10 minutes (quarterly)

### NFR2: Usability

- New engineer understands strategy in <1 hour (read project/strategy.md)
- Task creator finds relevant patterns in <5 minutes
- Critics provide actionable feedback (not just "blocked")

### NFR3: Maintainability

- Consistent structure across all levels (same phase docs)
- Automated validation (pre-commit hooks)
- Self-documenting (README.md at each level)

### NFR4: Evolution

- Pattern fitness tracked automatically
- Low-fitness patterns auto-deprecated (after 2 quarters <50%)
- New patterns easily added without breaking existing

---

## Out of Scope (This Milestone)

- [ ] ~~Automated pattern extraction (ML-based)~~ → Manual analysis initially
- [ ] ~~Real-time pattern propagation~~ → Quarterly batch only
- [ ] ~~Pattern conflict resolution~~ → Manual escalation for now
- [ ] ~~Multi-project support~~ → Single project (WEATHERVANE-2025) only
- [ ] ~~Historical pattern analysis~~ → Forward-looking only (don't retroactively analyze all 377 tasks)

---

## Dependencies

### Internal
- Existing task-level process (AFP 10-phase)
- Current evidence structure (`state/evidence/`)
- Pre-commit hooks system
- MCP tools (for automation)

### External
- None (self-contained within WeatherVane)

---

## Migration Plan

### Phase 1: Create Structure (Week 1)
1. Create `state/project/WEATHERVANE-2025/` with templates
2. Create `state/task_groups/` directory
3. Extend `state/epics/WAVE-0/` with new phase docs

### Phase 2: Migrate WAVE-0 (Week 2)
1. Create WAVE-0 strategy.md, spec.md, plan.md, think.md, design.md
2. Identify task groups within WAVE-0 (proof-system, supervisor, etc.)
3. Create task group evidence for each

### Phase 3: Implement Critics (Week 3-4)
1. VisionCritic (project-level)
2. OutcomeCritic (epic-level)
3. ClusterCritic (task group-level)
4. Update pre-commit hooks

### Phase 4: Automate Flows (Week 5-6)
1. Harvest script (upward flow)
2. Context propagation (downward flow)
3. Pattern fitness tracking

### Phase 5: Documentation (Week 7)
1. Process guides for each level
2. Examples from WAVE-0 migration
3. Training materials

---

## Validation Criteria

### How we know this spec is complete:

- [ ] All 4 levels defined with evidence structure
- [ ] Phase docs consistent across all levels (strategy/spec/plan/think/design)
- [ ] Critics specified for each level
- [ ] Bidirectional flow mechanisms described
- [ ] Migration plan for WAVE-0 outlined
- [ ] Non-functional requirements specified
- [ ] Out of scope explicitly listed

### How we know implementation succeeded:

- [ ] WAVE-0 successfully migrated to new structure
- [ ] Task GATE time <30 minutes (measured on 10 tasks)
- [ ] Architecture findable in <5 minutes (user study with 3 engineers)
- [ ] Pattern harvest extracts 5-10 patterns from WAVE-0

---

**Spec completed:** 2025-11-06
**Next phase:** PLAN (design implementation approach)
**Reviewers:** Atlas, Director Dana
