# Dependency Graph

Understanding task dependencies is critical for correct execution order and preventing deadlocks.

---

## Overview

**What**: A Directed Acyclic Graph (DAG) representing task dependencies

**Why**: Ensures tasks execute in correct order, prevents circular dependencies

**Structure**:
```
      T1.1.1
       /  \
      /    \
   T1.1.2  T1.1.3
      \    /
       \  /
      T1.1.4
```

---

## DAG Concepts

### Directed Acyclic Graph (DAG)

**Directed**: Dependencies have direction (A → B means "B depends on A")

**Acyclic**: No circular dependencies allowed

**Graph**: Nodes (tasks) connected by edges (dependencies)

**Example**:
```yaml
tasks:
  - id: T1
    dependencies: []        # No dependencies

  - id: T2
    dependencies: [T1]      # T2 depends on T1

  - id: T3
    dependencies: [T1]      # T3 depends on T1

  - id: T4
    dependencies: [T2, T3]  # T4 depends on both T2 and T3
```

**Execution Order**: T1 → (T2 and T3 in parallel) → T4

---

## Dependency Types

### 1. Hard Dependencies

**Definition**: Task cannot start until dependencies complete

**Syntax**:
```yaml
- id: T1.2.2
  title: "Update data model"
  dependencies: [T1.2.1]  # Hard dependency
```

**Effect**: Orchestrator will not assign T1.2.2 until T1.2.1 is `done`

### 2. Soft Dependencies

**Definition**: Preferred order but not required (future feature)

**Syntax** (in metadata):
```yaml
- id: T1.2.3
  title: "Optimize queries"
  metadata:
    soft_dependencies: [T1.2.2]  # Prefer after T1.2.2 but not required
```

**Effect**: Orchestrator prefers to schedule T1.2.3 after T1.2.2, but can schedule earlier if needed

### 3. Blocking Dependencies

**Definition**: Task is blocked by external factor (not another task)

**Status**: Set task to `blocked`

**Example**:
```yaml
- id: T1.3.1
  title: "Integrate payment API"
  status: blocked
  metadata:
    blocker: "Waiting for API credentials from vendor"
```

---

## Dependency Rules

### ✅ Allowed

**Same epic**:
```yaml
- id: T1.1.2
  dependencies: [T1.1.1]  # OK
```

**Different epics**:
```yaml
- id: T2.1.1
  dependencies: [T1.1.3]  # OK - cross-epic dependency
```

**Multiple dependencies**:
```yaml
- id: T1.2.4
  dependencies: [T1.2.1, T1.2.2, T1.2.3]  # OK
```

### ❌ Forbidden

**Circular dependencies**:
```yaml
# ❌ INVALID
- id: T1.1.1
  dependencies: [T1.1.2]

- id: T1.1.2
  dependencies: [T1.1.1]  # Creates cycle!
```

**Self-dependencies**:
```yaml
# ❌ INVALID
- id: T1.1.1
  dependencies: [T1.1.1]  # Cannot depend on self
```

**Cross-milestone dependencies** (discouraged):
```yaml
# ⚠️ AVOID
- id: T2.1.1  # Milestone M2
  dependencies: [T1.1.1]  # Milestone M1
```
(Technically allowed but creates tight coupling between milestones)

---

## Dependency Syntax

### YAML Format

```yaml
tasks:
  - id: T1.1.1
    dependencies: []         # No dependencies (can start immediately)

  - id: T1.1.2
    dependencies: [T1.1.1]  # Single dependency

  - id: T1.1.3
    dependencies:           # Multiple dependencies (verbose form)
      - T1.1.1
      - T1.1.2

  - id: T1.1.4
    dependencies: [T1.1.2, T1.1.3]  # Multiple (compact form)
```

### Database Representation

**Table**: `task_dependencies`

**Schema**:
```sql
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL,         -- The task that has the dependency
  depends_on_task_id TEXT NOT NULL,  -- The task it depends on
  PRIMARY KEY (task_id, depends_on_task_id)
);
```

**Example Data**:
```sql
INSERT INTO task_dependencies VALUES ('T1.1.2', 'T1.1.1');
INSERT INTO task_dependencies VALUES ('T1.1.3', 'T1.1.1');
INSERT INTO task_dependencies VALUES ('T1.1.4', 'T1.1.2');
INSERT INTO task_dependencies VALUES ('T1.1.4', 'T1.1.3');
```

---

## Dependency Resolution

### Algorithm

**Input**: Task to check
**Output**: Boolean (ready to execute?)

**Steps**:
1. Get all dependencies for task
2. Check status of each dependency
3. If ALL dependencies are `done` → task is ready
4. If ANY dependency is not `done` → task is blocked

**Example**:
```
Task T1.1.4 depends on [T1.1.2, T1.1.3]

T1.1.2 status: done ✅
T1.1.3 status: in_progress ❌

Result: T1.1.4 is NOT ready (T1.1.3 still in progress)
```

### Query

**Find ready tasks**:
```sql
SELECT t.*
FROM tasks t
WHERE t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM task_dependencies td
    JOIN tasks dep ON td.depends_on_task_id = dep.id
    WHERE td.task_id = t.id
      AND dep.status != 'done'
  );
```

**Translation**: "Find pending tasks where all dependencies are done"

---

## Dependency Visualization

### Text Format

```
T1.1.1 (done)
├── T1.1.2 (done)
│   └── T1.1.4 (pending)
└── T1.1.3 (in_progress)
    └── T1.1.4 (pending)
```

**Interpretation**:
- T1.1.1 is complete
- T1.1.2 is complete (depended on T1.1.1)
- T1.1.3 is in progress (depended on T1.1.1)
- T1.1.4 is waiting (depends on both T1.1.2 and T1.1.3, but T1.1.3 not done yet)

### Graph Format

```
     [T1.1.1]
        ✅
       /  \
      /    \
[T1.1.2]  [T1.1.3]
   ✅        ⏳
     \      /
      \    /
    [T1.1.4]
       ⏸️
```

Legend:
- ✅ = done
- ⏳ = in_progress
- ⏸️ = pending (blocked by dependencies)

---

## Common Patterns

### Sequential Chain

**Pattern**: Each task depends on previous

```yaml
- id: T1
  dependencies: []
- id: T2
  dependencies: [T1]
- id: T3
  dependencies: [T2]
- id: T4
  dependencies: [T3]
```

**Execution**: T1 → T2 → T3 → T4 (no parallelism)

**Use When**: Order matters (e.g., database migrations)

### Parallel Fan-Out

**Pattern**: Multiple tasks depend on one

```yaml
- id: T1
  dependencies: []
- id: T2
  dependencies: [T1]
- id: T3
  dependencies: [T1]
- id: T4
  dependencies: [T1]
```

**Execution**: T1 → (T2, T3, T4 in parallel)

**Use When**: Independent tasks after shared setup

### Fan-In

**Pattern**: One task depends on multiple

```yaml
- id: T1
  dependencies: []
- id: T2
  dependencies: []
- id: T3
  dependencies: []
- id: T4
  dependencies: [T1, T2, T3]
```

**Execution**: (T1, T2, T3 in parallel) → T4

**Use When**: Combining results from parallel work

### Diamond

**Pattern**: Fan-out then fan-in

```yaml
- id: T1
  dependencies: []
- id: T2
  dependencies: [T1]
- id: T3
  dependencies: [T1]
- id: T4
  dependencies: [T2, T3]
```

**Execution**: T1 → (T2, T3 in parallel) → T4

**Use When**: Parallel branches then integration

---

## Dependency Anti-Patterns

### ❌ Over-Serialization

**Problem**: Tasks forced to run sequentially when they could be parallel

```yaml
# Bad: Unnecessary serialization
- id: T1
  dependencies: []
- id: T2
  dependencies: [T1]  # Doesn't actually need T1
- id: T3
  dependencies: [T2]  # Doesn't actually need T2
```

**Fix**: Remove unnecessary dependencies
```yaml
# Good: Parallel execution
- id: T1
  dependencies: []
- id: T2
  dependencies: []  # Can run in parallel with T1
- id: T3
  dependencies: []  # Can run in parallel with T1, T2
```

### ❌ Hidden Dependencies

**Problem**: Dependencies exist but not declared

```yaml
# Bad: T2 actually needs T1 but not declared
- id: T1
  title: "Create database schema"
  dependencies: []

- id: T2
  title: "Insert data into database"
  dependencies: []  # WRONG - needs schema first!
```

**Fix**: Declare all dependencies
```yaml
# Good: Dependencies explicit
- id: T2
  title: "Insert data into database"
  dependencies: [T1]  # Correct - schema must exist first
```

### ❌ Circular Dependencies

**Problem**: A depends on B, B depends on A

```yaml
# ❌ INVALID - Creates deadlock
- id: T1
  dependencies: [T2]
- id: T2
  dependencies: [T1]
```

**Fix**: Break the cycle (often requires task decomposition)
```yaml
# Good: Break into 3 tasks
- id: T1_setup
  dependencies: []
- id: T2
  dependencies: [T1_setup]
- id: T1_finalize
  dependencies: [T2]
```

---

## Dependency Debugging

### Check Sync Status

```bash
node scripts/diagnose_dependency_sync.mjs
```

**Output**:
```
Data Sources:
  YAML tasks with dependencies:     46 tasks (138 dependencies)
  Table tasks with dependencies:    46 tasks (138 dependencies)

Sync Ratio: 1.00 (table / yaml)
  ✓ Excellent sync (≥95%)

✓ All YAML dependencies are synced to table
```

### Find Circular Dependencies

```sql
-- Detect circular dependencies
WITH RECURSIVE dep_chain AS (
  SELECT task_id, depends_on_task_id, 1 as depth
  FROM task_dependencies

  UNION ALL

  SELECT dc.task_id, td.depends_on_task_id, dc.depth + 1
  FROM dep_chain dc
  JOIN task_dependencies td ON dc.depends_on_task_id = td.task_id
  WHERE dc.depth < 10
)
SELECT *
FROM dep_chain
WHERE task_id = depends_on_task_id;  -- Found a cycle!
```

### Find Orphaned Dependencies

```sql
-- Dependencies referencing non-existent tasks
SELECT td.task_id, td.depends_on_task_id
FROM task_dependencies td
LEFT JOIN tasks t ON td.depends_on_task_id = t.id
WHERE t.id IS NULL;
```

---

## Dependency Sync

### Why Sync Matters

**Problem**: Dependencies in `roadmap.yaml` must be synced to `task_dependencies` table

**Risk**: If out of sync, tasks execute in wrong order

### How to Sync

**Automatic**: Orchestrator syncs on startup

**Manual**:
```bash
node scripts/force_roadmap_sync.mjs
```

### Verify Sync

```bash
node scripts/diagnose_dependency_sync.mjs
```

**Healthy**: Sync ratio ≥95%
**Unhealthy**: Sync ratio <80%

---

## References

- [Roadmap Management](/docs/agent_library/common/concepts/roadmap_management.md)
- [Task Lifecycle](/docs/agent_library/common/processes/task_lifecycle.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
