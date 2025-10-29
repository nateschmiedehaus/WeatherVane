# ROADMAP-STRUCT Strategy: Roadmap Structure Enhancement for Autopilot Efficiency

**Task ID**: ROADMAP-STRUCT
**Phase**: STRATEGIZE
**Date**: 2025-10-29
**Status**: Complete

---

## 1. Strategic Framing

### Problem Statement

**Current State**: The `state/roadmap.yaml` file is optimized for human readability with prose descriptions, but lacks machine-readable structure for autopilot intelligence.

**Pain Points**:
1. **plan_next tool cannot infer complexity** - No metadata about task difficulty, effort, or required tools
2. **Dependency resolution is manual** - Dependencies are flat string arrays, no typed relationships
3. **Exit criteria are prose** - Cannot be automatically validated or checked
4. **No progress granularity** - Status is binary (pending/in_progress/done), missing nuanced states
5. **Task selection is primitive** - Cannot optimize for effort/value ratio or tool availability
6. **No validation** - Circular dependencies, missing tasks, broken references go undetected

### Why This Matters for Autopilot

Autopilot needs to make intelligent decisions about:
- **Task Selection**: "Which task should I work on next?" (considering complexity, dependencies, tooling)
- **Effort Estimation**: "How long will this take?" (for time-boxing, progress tracking)
- **Dependency Analysis**: "What must complete first?" (avoiding blocked work)
- **Tool Planning**: "Do I have the tools needed?" (fs_write, bash, grep, etc.)
- **Progress Tracking**: "How close am I to milestone completion?" (granular status beyond pending/done)
- **Validation**: "Is the roadmap consistent?" (no circular deps, all references valid)

**Current Autopilot Behavior**:
- `plan_next` returns tasks in YAML order (no intelligence)
- No complexity-based routing (all tasks treated equally)
- No effort estimation (can't predict time budget)
- No tool validation (may start task without required tools)
- No dependency warnings (may hit blockers mid-work)

### Success Metrics

1. **Intelligence**: plan_next returns tasks ranked by effort/value/readiness (not just YAML order)
2. **Validation**: Roadmap validation script catches all structural errors (circular deps, missing refs)
3. **Granularity**: Task status includes: pending, ready, in_progress, blocked, needs_review, done
4. **Effort Accuracy**: Autopilot estimates match actual time within 20% (measured over 10 tasks)
5. **Tool Compatibility**: Autopilot checks tool availability before starting tasks
6. **Backwards Compatible**: Existing roadmap.yaml still loads (gradual migration)

---

## 2. Impacted Autopilot Workflows

### A. Task Selection (plan_next MCP tool)

**Current**: Sequential YAML parsing, returns first N pending tasks
**Gap**: No intelligence about task complexity, effort, or readiness
**Impact**: Autopilot may pick hard tasks first, blocking on dependencies, or starting without required tools

**Enhancement Needed**:
- Read `complexity_score: 1-10` (0-3 = haiku, 4-7 = sonnet, 8-10 = opus)
- Read `effort_hours: N` for time-boxing
- Read `required_tools: [fs_write, bash, grep]` for tool validation
- Read `readiness_score` (0-1, based on dependency completion)
- Return tasks sorted by: `readiness * (value / effort)` (WSJF-inspired)

### B. Dependency Resolution (plan_next, task_scheduler)

**Current**: Flat `dependencies: [TASK-1, TASK-2]` array
**Gap**: No typed relationships (blocks vs depends_on vs related_to)
**Impact**: Cannot distinguish blocking vs soft dependencies

**Enhancement Needed**:
- `depends_on: [TASK-1]` - Must complete first (hard blocker)
- `blocks: [TASK-3]` - This task blocks another (forward dependency)
- `related_to: [TASK-4]` - Same domain, but not blocking
- `produces: [schema.ts]` - Output artifacts
- `consumes: [types.ts]` - Input artifacts (check if exists)

### C. Exit Criteria Validation (CompletionVerifier)

**Current**: Exit criteria are prose strings, cannot be checked automatically
**Gap**: CompletionVerifier cannot verify completion programmatically
**Impact**: Tasks claimed "done" without verifying all criteria

**Enhancement Needed**:
- Structure exit criteria as testable predicates:
  - `{ test: "build", expect: "pass" }`
  - `{ test: "coverage", expect: ">= 80%" }`
  - `{ file: "docs/README.md", expect: "exists" }`
  - `{ metric: "tests_passing", expect: "100%" }`
- CompletionVerifier can automatically check each predicate before marking done

### D. Progress Tracking (roadmap_tracker, unified_orchestrator)

**Current**: 3 states: pending, in_progress, done
**Gap**: No granularity for "ready to start", "blocked", "needs review"
**Impact**: Cannot distinguish "waiting for dependencies" from "actively stuck"

**Enhancement Needed**:
- Add states: `ready` (deps met), `blocked` (external dependency), `needs_review` (PR open), `archived` (canceled)
- Autopilot can query `ready` tasks for immediate work
- Dashboard shows true progress (not just pending/done binary)

### E. Roadmap Validation (CI, integrity_tests)

**Current**: No validation, errors discovered at runtime
**Gap**: Circular dependencies, missing task references, broken IDs
**Impact**: Autopilot starts work on invalid task, fails mid-execution

**Enhancement Needed**:
- Validation script: `scripts/validate_roadmap.ts`
- Checks: circular deps, missing task IDs, valid status values, dependency existence
- Run in CI: `npm run validate:roadmap` (fails build if invalid)
- Run in autopilot: Validate before plan_next (catch issues early)

---

## 3. Solution Approach

### Phase 1: Schema Definition (2-3 hours)

**Deliverable**: `tools/wvo_mcp/src/roadmap/schemas.ts`

**Schemas**:
```typescript
export interface TaskSchema {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'in_progress' | 'blocked' | 'needs_review' | 'done' | 'archived';

  // Metadata for autopilot intelligence
  complexity_score?: number; // 1-10 (0-3=haiku, 4-7=sonnet, 8-10=opus)
  effort_hours?: number; // Estimated time
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  required_tools?: string[]; // ['fs_write', 'bash', 'grep']

  // Typed dependencies
  dependencies?: {
    depends_on?: string[]; // Must complete first
    blocks?: string[]; // This task blocks these
    related_to?: string[]; // Same domain
    produces?: string[]; // Output artifacts
    consumes?: string[]; // Input artifacts
  };

  // Testable exit criteria
  exit_criteria?: Array<
    | { test: string; expect: string } // e.g., { test: "build", expect: "pass" }
    | { file: string; expect: "exists" | "contains" }
    | { metric: string; expect: string }
    | { prose: string } // Fallback for manual checks
  >;

  // Existing fields
  description?: string;
  owner?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  domain?: 'product' | 'mcp';

  // Cross-item integration
  contract_version?: string; // API version this task implements/uses
  related_items?: { type: 'epic' | 'milestone'; id: string }[];
}

export interface EpicSchema {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'done';
  description?: string;
  domain: 'product' | 'mcp';

  // Epic-level metadata
  strategic_value?: 'high' | 'medium' | 'low'; // Business impact
  estimated_effort_hours?: number; // Sum of task efforts
  completion_percentage?: number; // Auto-calculated from tasks

  milestones: MilestoneSchema[];
}

export interface MilestoneSchema {
  id: string;
  title: string;
  status?: 'pending' | 'in_progress' | 'done';
  description?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';

  // Milestone-level metadata
  target_date?: string; // ISO date
  estimated_effort_hours?: number; // Sum of task efforts

  tasks: TaskSchema[];
}

export interface RoadmapSchema {
  schema_version: '2.0'; // For migration tracking
  epics: EpicSchema[];
}
```

**Why**: Type-safe, explicit contracts, enables validation

### Phase 2: Validation Script (1-2 hours)

**Deliverable**: `tools/wvo_mcp/scripts/validate_roadmap.ts`

**Validations**:
1. **Structural**: All required fields present, valid types
2. **Referential Integrity**: All task IDs referenced in dependencies exist
3. **Circular Dependencies**: Detect dependency cycles (graph algorithm)
4. **Status Consistency**: Parent milestone/epic status matches child tasks
5. **Effort Consistency**: Sum of task efforts matches epic estimate
6. **Tool Availability**: Required tools are valid MCP tool names
7. **Exit Criteria**: Testable criteria have valid test/expect format

**Output**: JSON report with errors/warnings, exit code 1 if invalid

### Phase 3: Migration (2-3 hours)

**Deliverable**: Migrated `state/roadmap.yaml` with new structure

**Approach**: Backwards-compatible migration
1. Add optional fields first (complexity_score, effort_hours, required_tools)
2. Migrate dependencies to typed structure (depends_on, blocks, etc.)
3. Convert exit_criteria prose to testable predicates (where possible)
4. Add new statuses (ready, needs_review, archived) where applicable
5. Validate migrated roadmap

**Fallback**: If migration fails, keep old structure (gradual migration)

### Phase 4: plan_next Enhancement (2-3 hours)

**Deliverable**: Enhanced `tools/wvo_mcp/src/planner/planner_engine.ts`

**New Logic**:
```typescript
// 1. Filter tasks by readiness (deps met + required tools available)
const readyTasks = tasks.filter(t =>
  allDependenciesMet(t) && allToolsAvailable(t)
);

// 2. Calculate readiness score (0-1)
const scored = readyTasks.map(t => ({
  ...t,
  readiness: calculateReadiness(t), // Based on deps completion
  value: calculateValue(t), // Based on priority + strategic_value
  effort: t.effort_hours || estimateEffort(t.complexity_score)
}));

// 3. Sort by WSJF (Weighted Shortest Job First)
scored.sort((a, b) => {
  const wsjfA = (a.readiness * a.value) / a.effort;
  const wsjfB = (b.readiness * b.value) / b.effort;
  return wsjfB - wsjfA; // Higher WSJF first
});

return scored.slice(0, limit);
```

**Benefits**: Intelligent task selection, tool validation, effort-aware

### Phase 5: Roadmap Linter (CI Integration) (1 hour)

**Deliverable**: `.github/workflows/roadmap-validation.yml`

**CI Check**:
```yaml
- name: Validate Roadmap
  run: npm run validate:roadmap
```

**When**: On every PR that modifies `state/roadmap.yaml`

**Why**: Catch errors early, maintain integrity

---

## 4. Risk Analysis

### Risk 1: Breaking Existing Autopilot

**Mitigation**: Backwards-compatible migration (optional fields first)
**Validation**: Run autopilot dry-run before/after migration

### Risk 2: Complex Testable Criteria

**Problem**: Not all exit criteria can be made testable
**Mitigation**: Keep `prose` field for manual checks, migrate gradually

### Risk 3: Circular Dependency Detection

**Problem**: Graph algorithm complexity (O(V+E))
**Mitigation**: Cache dependency graph, only recompute on roadmap change

### Risk 4: Tool Name Validation

**Problem**: Tool names may change over time
**Mitigation**: Fetch available tools from MCP server at validation time

---

## 5. Success Criteria

### Acceptance Criteria (AC)

**AC1**: Typed schemas defined with validation
**Verify**: TypeScript compiles, all required fields present

**AC2**: Machine-readable dependency graph implemented
**Verify**: Can query "What depends on TASK-1?" programmatically

**AC3**: Exit criteria structured for automated verification
**Verify**: CompletionVerifier can check at least 50% of criteria automatically

**AC4**: Autopilot metadata added (complexity, effort, tools)
**Verify**: All tasks have `complexity_score` and `required_tools`

**AC5**: plan_next enhanced to use new structure
**Verify**: Returns tasks sorted by readiness/value/effort (not YAML order)

**AC6**: Roadmap validation script passes CI
**Verify**: `npm run validate:roadmap` exits 0 for valid roadmap

**AC7**: Backwards compatible
**Verify**: Old roadmap.yaml still loads, autopilot still runs

### Measurement Plan

**Before/After Metrics**:
1. **Task Selection Time**: Time from "plan_next" to task start (should decrease)
2. **Blocked Task Rate**: % tasks blocked mid-work (should decrease from better dep checking)
3. **Effort Estimation Error**: |actual - estimated| / actual (target: <20%)
4. **Tool Availability**: % tasks started without required tools (target: 0%)
5. **Roadmap Errors**: # validation errors caught in CI (target: catch all before runtime)

**Collection**: Track for 10 tasks post-migration, compare to 10 tasks pre-migration

---

## 6. Integration Points

### A. plan_next MCP Tool

**File**: `tools/wvo_mcp/src/planner/planner_engine.ts`
**Change**: Use TaskSchema, calculate readiness/WSJF, sort by intelligence
**Test**: `plan_next` returns tasks with highest readiness*value/effort first

### B. CompletionVerifier

**File**: `tools/wvo_mcp/src/orchestrator/completion_verifier.ts`
**Change**: Parse testable exit_criteria, run checks automatically
**Test**: Can verify `{ test: "build", expect: "pass" }` by running build

### C. RoadmapStore

**File**: `tools/wvo_mcp/src/state/roadmap_store.ts`
**Change**: Parse RoadmapSchema (v2), validate on load
**Test**: Can load both old (v1) and new (v2) roadmap.yaml

### D. CI Validation

**File**: `.github/workflows/roadmap-validation.yml`
**Change**: Add validation step on roadmap.yaml changes
**Test**: PR with invalid roadmap fails CI

---

## 7. Timeline

**Total Estimate**: 8-11 hours

- **Phase 1**: Schema Definition (2-3 hours)
- **Phase 2**: Validation Script (1-2 hours)
- **Phase 3**: Migration (2-3 hours)
- **Phase 4**: plan_next Enhancement (2-3 hours)
- **Phase 5**: CI Integration (1 hour)

**Phased Rollout**:
- Week 1: Schemas + Validation (backwards compatible)
- Week 2: Migration (add metadata to existing tasks)
- Week 3: plan_next Enhancement (use new structure)
- Week 4: Monitor metrics, tune WSJF algorithm

---

## 8. Future Enhancements (Out of Scope)

**Not Included in This Task**:
1. **Task Clustering**: Auto-group related tasks (separate task)
2. **Effort Learning**: ML model to predict effort (requires data collection)
3. **Dynamic Roadmap**: Auto-generate tasks from backlogs (complex feature)
4. **Multi-Roadmap**: Support multiple roadmaps (mcp vs product) (low priority)
5. **Visual Roadmap**: Web UI for roadmap editing (separate project)

**Why Deferred**: Keep scope manageable, deliver core value first

---

## 9. Autopilot Functionality Links

**This Enhancement Affects**:
1. **plan_next** - Task selection intelligence (primary)
2. **task_scheduler** - Dependency-aware scheduling (secondary)
3. **completion_verifier** - Automated exit criteria checking (secondary)
4. **unified_orchestrator** - Progress tracking with granular status (secondary)
5. **CI validation** - Pre-deployment roadmap integrity (tertiary)

**Workflow**:
1. User adds task to roadmap with `complexity_score: 5`, `effort_hours: 2`, `required_tools: [fs_write]`
2. Autopilot calls `plan_next` → returns task ranked by readiness*value/effort
3. Autopilot checks `required_tools` → validates fs_write is available
4. Autopilot completes task → `completion_verifier` checks exit criteria automatically
5. CI validates roadmap → catches circular deps, missing refs

---

## 10. References

- **Current Roadmap**: `state/roadmap.yaml`
- **Current Types**: `tools/wvo_mcp/src/utils/types.ts` (lines 1-80)
- **Current plan_next**: `tools/wvo_mcp/src/planner/planner_engine.ts`
- **User Request**: "make roadmap tasks better structured in autopilot for use by autopilot for efficency and effectiveness and future proofing and better system compatability"
- **WSJF Algorithm**: Weighted Shortest Job First (Agile/SAFe framework)

---

**Status**: Strategy complete, ready for SPEC phase
**Next Phase**: Define detailed acceptance criteria and validation mapping
**Blocking Issues**: None
