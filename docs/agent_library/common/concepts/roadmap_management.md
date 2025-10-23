# Roadmap Management

The roadmap is WeatherVane's single source of truth for task planning, prioritization, and execution tracking.

---

## Overview

**Location**: `state/roadmap.yaml`

**Structure**:
```
Roadmap
├── Milestones (M1, M2, ...)
│   ├── Epics (E1, E2, ...)
│   │   └── Tasks (T1.1.1, T1.1.2, ...)
```

**Hierarchy**: Milestones → Epics → Tasks

---

## Milestones

**What**: Major project phases or releases

**Example**:
```yaml
milestones:
  - id: M1
    name: "MVP Launch"
    description: "Core weather-aware ad optimization working end-to-end"
    target_date: "2025-12-31"
    status: in_progress
```

**Key Fields**:
- `id`: Unique identifier (M1, M2, ...)
- `name`: Short, memorable name
- `description`: What gets delivered
- `target_date`: Deadline (YYYY-MM-DD)
- `status`: pending | in_progress | completed

---

## Epics

**What**: Large features or initiatives spanning multiple tasks

**Example**:
```yaml
epics:
  - id: E1
    name: "Weather Data Integration"
    description: "Ingest, cache, and serve weather data from Open-Meteo"
    milestone_id: M1
    owner: Atlas
    priority: high
    status: in_progress
```

**Key Fields**:
- `id`: Unique identifier (E1, E2, ...)
- `name`: Feature/initiative name
- `milestone_id`: Parent milestone
- `owner`: Who's responsible (Atlas, Director Dana, etc.)
- `priority`: high | medium | low
- `status`: pending | in_progress | completed | blocked

**Priority Levels**:
- **High**: Critical path, blocks other work
- **Medium**: Important but not blocking
- **Low**: Nice to have, can defer

---

## Tasks

**What**: Atomic units of work (completable in 1-4 hours)

**Example**:
```yaml
tasks:
  - id: T1.1.1
    title: "Implement Open-Meteo API client"
    epic_id: E1
    milestone_id: M1
    status: pending
    priority: high
    complexity: 5
    assigned_to: worker_1
    dependencies: []
    metadata:
      estimated_hours: 2
      skills_required: ["typescript", "api_integration"]
```

**Key Fields**:
- `id`: Unique identifier (T1.1.1, T1.1.2, ...)
- `title`: Clear, actionable description
- `epic_id`: Parent epic
- `milestone_id`: Parent milestone
- `status`: pending | in_progress | blocked | done
- `priority`: high | medium | low
- `complexity`: 1-10 (affects agent assignment)
- `assigned_to`: Which agent is working on it
- `dependencies`: Tasks that must complete first

**Task Numbering**: `T<epic>.<sequence>.<subtask>`
- Example: T1.2.3 = Epic 1, 2nd feature, 3rd subtask

---

## Task Lifecycle

```
┌─────────┐
│ pending │ ─────────────┐
└─────────┘              │
     │                   │
     │ (assigned)        │ (blocked)
     ↓                   ↓
┌──────────────┐    ┌─────────┐
│ in_progress  │ ←──│ blocked │
└──────────────┘    └─────────┘
     │
     │ (verification loop complete)
     ↓
┌──────┐
│ done │
└──────┘
```

**State Definitions**:

- **pending**: Not yet started, waiting to be assigned
- **in_progress**: Actively being worked on
- **blocked**: Stuck, can't proceed without intervention
- **done**: Completed and verified

---

## Dependencies

**Purpose**: Ensure tasks execute in correct order

**Syntax**:
```yaml
tasks:
  - id: T1.1.2
    title: "Add caching layer"
    dependencies: [T1.1.1]  # Requires API client first
```

**Types**:

1. **Hard dependencies**: Must complete first
   ```yaml
   dependencies: [T1.1.1]
   ```

2. **Soft dependencies**: Preferred order but not required
   ```yaml
   metadata:
     soft_dependencies: [T1.2.1]
   ```

**Dependency Rules**:
- ✅ Can depend on tasks in same or different epics
- ✅ Can depend on multiple tasks
- ❌ Cannot create circular dependencies
- ❌ Cannot depend on tasks in later milestones

---

## Priority & Scheduling

**Priority Algorithm** (used by orchestrator):

1. **Blocking tasks**: High priority, unblocking other work
2. **Milestone proximity**: Tasks for soonest milestone
3. **Epic priority**: Tasks in high-priority epics
4. **Task priority**: Individual task priority
5. **Complexity**: Prefer simpler tasks when tied

**Example**:
```
Task A: M1, Epic E1 (high), Priority high, Complexity 3
Task B: M1, Epic E2 (medium), Priority high, Complexity 5
Task C: M2, Epic E3 (high), Priority high, Complexity 2

Execution order: A → C → B
(A wins: same milestone, higher epic priority, lower complexity)
```

---

## Roadmap Operations

### View Next Tasks

```typescript
plan_next({ limit: 5 })
```

Returns top 5 prioritized tasks ready to execute (dependencies met).

### Update Task Status

```typescript
plan_update({ task_id: "T1.1.1", status: "in_progress" })
plan_update({ task_id: "T1.1.1", status: "done" })
```

### Add New Task

Edit `state/roadmap.yaml` directly:
```yaml
tasks:
  - id: T1.1.4
    title: "New task description"
    epic_id: E1
    milestone_id: M1
    status: pending
    priority: medium
    complexity: 4
    dependencies: [T1.1.3]
```

Then sync to database:
```bash
node scripts/force_roadmap_sync.mjs
```

---

## Roadmap Health Metrics

### Completion Rate

**Formula**: `(done_tasks / total_tasks) * 100`

**Target**: 85%+ for completed milestones

### Velocity

**Formula**: `tasks_completed_per_week`

**Use**: Predict completion dates

### Blocker Rate

**Formula**: `(blocked_tasks / total_tasks) * 100`

**Target**: <10%

### Dependency Sync

**Formula**: `(table_dependencies / yaml_dependencies)`

**Target**: 95-100% (healthy sync)

**Check**:
```bash
node scripts/diagnose_dependency_sync.mjs
```

---

## Common Issues

### Issue: Tasks stuck in `in_progress`

**Symptom**: Tasks never complete, WIP limit maxed out

**Causes**:
- Agent crashed during execution
- Network interruption
- Verification loop not completed

**Fix**:
```typescript
// Orchestrator auto-recovers stale tasks every 5 minutes
// Or manually:
plan_update({ task_id: "T1.1.1", status: "pending" })
```

### Issue: Dependencies not syncing

**Symptom**: Tasks execute out of order

**Diagnosis**:
```bash
node scripts/diagnose_dependency_sync.mjs
```

**Fix**:
```bash
node scripts/force_roadmap_sync.mjs
```

### Issue: Too many blocked tasks

**Symptom**: Blocker rate >10%

**Root Causes**:
- Missing dependencies
- Unclear requirements
- Technical blockers

**Actions**:
1. Review blocked tasks: `grep -r "status: blocked" state/roadmap.yaml`
2. For each blocked task:
   - Is the blocker documented?
   - Can it be unblocked?
   - Should it be deferred?
3. Update roadmap or escalate

---

## Best Practices

### 1. Keep Tasks Atomic

**Good** (1-4 hours):
```yaml
- id: T1.1.1
  title: "Implement API client for Open-Meteo"

- id: T1.1.2
  title: "Add caching layer"

- id: T1.1.3
  title: "Write tests for API client"
```

**Bad** (too large):
```yaml
- id: T1.1.1
  title: "Implement entire weather data integration"
```

### 2. Use Clear Titles

**Good**:
- "Implement Open-Meteo API client"
- "Add 5-minute caching for weather data"
- "Fix memory leak in data processing"

**Bad**:
- "Weather stuff"
- "Fix bug"
- "Updates"

### 3. Set Accurate Complexity

**Complexity Scale**:
- **1-3**: Simple (workers can do autonomously)
- **4-6**: Moderate (workers with guidance)
- **7-8**: Complex (may need Atlas involvement)
- **9-10**: Very complex (Atlas leads, workers assist)

### 4. Document Dependencies

**Always specify dependencies** to prevent out-of-order execution:

```yaml
- id: T1.2.1
  title: "Add database migration"
  dependencies: []

- id: T1.2.2
  title: "Update data model"
  dependencies: [T1.2.1]  # Must migrate first

- id: T1.2.3
  title: "Update API to use new model"
  dependencies: [T1.2.2]  # Must update model first
```

### 5. Keep Roadmap Synced

**After any YAML changes**:
```bash
node scripts/force_roadmap_sync.mjs
```

**Verify sync**:
```bash
node scripts/diagnose_dependency_sync.mjs
```

---

## Roadmap Governance

### Who Can Edit?

- **Atlas**: Can edit anything (milestones, epics, tasks)
- **Director Dana**: Can edit task metadata (priority, assignments)
- **Workers**: Should request changes via context or escalation
- **Critics**: Advisory only, cannot edit directly

### Change Process

1. **Small changes** (task status, metadata):
   - Update directly via `plan_update`

2. **Medium changes** (new tasks, priority changes):
   - Edit `roadmap.yaml`
   - Sync to database
   - Log change in context

3. **Large changes** (milestones, epic restructure):
   - Propose in context
   - Get Atlas approval
   - Edit `roadmap.yaml`
   - Sync and announce

### Backup & Recovery

**Roadmap is version controlled**:
```bash
git log state/roadmap.yaml  # View history
git diff HEAD~1 state/roadmap.yaml  # See last change
git checkout HEAD~1 state/roadmap.yaml  # Revert if needed
```

**Database can be rebuilt from YAML**:
```bash
node scripts/force_roadmap_sync.mjs
```

---

## References

- [Dependency Graph](/docs/agent_library/common/concepts/dependency_graph.md)
- [Task Lifecycle](/docs/agent_library/common/processes/task_lifecycle.md)
- [Escalation Protocol](/docs/agent_library/common/concepts/escalation_protocol.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
