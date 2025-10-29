# ROADMAP-STRUCT Spec: Acceptance Criteria and Validation

**Task ID**: ROADMAP-STRUCT
**Phase**: SPEC
**Date**: 2025-10-29
**Status**: Complete

---

## 1. Overview

This spec defines measurable acceptance criteria for the Roadmap Structure Enhancement, ensuring the implementation delivers machine-readable, autopilot-friendly task metadata with automated validation.

**Goal**: Transform `state/roadmap.yaml` from human-optimized prose to machine-readable structured data that enables intelligent task selection, dependency analysis, and automated validation.

---

## 2. Acceptance Criteria (AC)

### AC1: Typed Schemas Defined with Validation

**Criterion**: TypeScript schemas exist for Task, Milestone, Epic, and Roadmap with all required fields and optional metadata.

**Validation**:
```typescript
// File: tools/wvo_mcp/src/roadmap/schemas.ts
import { TaskSchema, MilestoneSchema, EpicSchema, RoadmapSchema } from './schemas.js';

// Verify types compile
const task: TaskSchema = {
  id: 'TEST-1',
  title: 'Test Task',
  status: 'pending',
  complexity_score: 5,
  effort_hours: 2,
  required_tools: ['fs_write', 'bash'],
  dependencies: {
    depends_on: ['TEST-0'],
    blocks: ['TEST-2']
  },
  exit_criteria: [
    { test: 'build', expect: 'pass' },
    { file: 'docs/README.md', expect: 'exists' }
  ]
};

// Verify validation helper exists
import { validateTask, validateRoadmap } from './validators.js';
const errors = validateTask(task);
assert(errors.length === 0, 'Valid task should have no errors');
```

**Success Metric**: TypeScript compiles with 0 errors, all schemas export correctly

**Evidence**: Build passes, type check passes, schema file exists at expected path

---

### AC2: Machine-Readable Dependency Graph Implemented

**Criterion**: Dependency relationships are typed (depends_on, blocks, related_to, produces, consumes) and can be queried programmatically.

**Validation**:
```typescript
// Query: "What tasks depend on TEST-1?"
const dependents = getDependents('TEST-1'); // Returns ['TEST-2', 'TEST-3']

// Query: "What tasks block TEST-4?"
const blockers = getBlockers('TEST-4'); // Returns ['TEST-2', 'TEST-3']

// Query: "What artifacts does TEST-5 produce?"
const artifacts = getProducedArtifacts('TEST-5'); // Returns ['schemas.ts', 'validators.ts']

// Query: "Are there circular dependencies?"
const circular = detectCircularDependencies(); // Returns [] or list of cycles
```

**Success Metric**: Dependency graph API returns correct results for 10 test queries

**Evidence**:
- Unit tests: `src/roadmap/__tests__/dependency_graph.test.ts` (20 tests passing)
- Integration test: Can query dependencies for all tasks in roadmap
- Performance: Graph queries complete in <10ms for 100-task roadmap

---

### AC3: Exit Criteria Structured for Automated Verification

**Criterion**: At least 50% of exit criteria are testable (not prose), and CompletionVerifier can check them automatically.

**Validation**:
```typescript
// Testable criteria types:
const testable: ExitCriterion[] = [
  { test: 'build', expect: 'pass' },             // Run build, check exit code
  { test: 'tests', expect: 'pass' },             // Run tests, check pass/fail
  { test: 'coverage', expect: '>= 80%' },        // Check coverage report
  { file: 'docs/README.md', expect: 'exists' },  // Check file exists
  { file: 'src/schema.ts', expect: 'contains', value: 'export interface' },
  { metric: 'tests_passing', expect: '100%' },   // Check metric value
  { prose: 'Manual review completed' }           // Fallback for manual checks
];

// CompletionVerifier can check automatically
const results = await verifier.checkExitCriteria('TASK-1');
assert(results.automated.length >= results.total * 0.5, 'At least 50% automated');
```

**Success Metric**:
- ≥50% of criteria in roadmap are testable (not prose)
- CompletionVerifier successfully checks 10 test criteria automatically

**Evidence**:
- Roadmap analysis: Count testable vs prose criteria
- CompletionVerifier tests: `src/orchestrator/__tests__/completion_verifier_structured.test.ts`
- Manual verification: Run verifier on 3 real tasks, confirm automated checks work

---

### AC4: Autopilot Metadata Added (Complexity, Effort, Tools)

**Criterion**: All tasks have `complexity_score` (1-10), `effort_hours`, and `required_tools` for intelligent task selection.

**Validation**:
```typescript
// Check all tasks have metadata
const tasks = roadmap.getAllTasks();
const withMetadata = tasks.filter(t =>
  t.complexity_score !== undefined &&
  t.effort_hours !== undefined &&
  t.required_tools !== undefined
);

assert(withMetadata.length === tasks.length, 'All tasks have metadata');

// Verify complexity_score maps to model tier
const haiku = tasks.filter(t => t.complexity_score! <= 3);   // Simple
const sonnet = tasks.filter(t => t.complexity_score! >= 4 && t.complexity_score! <= 7); // Medium
const opus = tasks.filter(t => t.complexity_score! >= 8);    // Complex

// Verify required_tools are valid MCP tool names
const allTools = tasks.flatMap(t => t.required_tools || []);
const validTools = ['fs_read', 'fs_write', 'cmd_run', 'bash', 'grep', 'plan_next'];
const invalidTools = allTools.filter(tool => !validTools.includes(tool));
assert(invalidTools.length === 0, 'All tools are valid');
```

**Success Metric**:
- 100% of tasks have `complexity_score`, `effort_hours`, `required_tools`
- All `required_tools` are valid MCP tool names
- Complexity scores map to model tiers (0-3=haiku, 4-7=sonnet, 8-10=opus)

**Evidence**:
- Roadmap metadata report: `scripts/analyze_roadmap_metadata.ts` shows 100% coverage
- Validation script: `npm run validate:roadmap` passes
- Tool validation: All tools exist in MCP server registry

---

### AC5: plan_next Enhanced to Use New Structure

**Criterion**: `plan_next` returns tasks ranked by readiness*value/effort (WSJF), not YAML order.

**Validation**:
```typescript
// Before: YAML order
const tasksBefore = await plan_next({ limit: 5 });
// Returns: [TASK-1, TASK-2, TASK-3, TASK-4, TASK-5] (YAML order)

// After: Intelligence order (WSJF)
const tasksAfter = await plan_next({ limit: 5 });
// Returns tasks sorted by: (readiness * priority_weight) / effort_hours

// Test case: High-value, low-effort task should rank higher than low-value, high-effort
const highValue = { complexity: 3, effort_hours: 1, priority: 'critical', deps_met: true };
const lowValue = { complexity: 8, effort_hours: 8, priority: 'low', deps_met: true };

const ranked = rankTasks([highValue, lowValue]);
assert(ranked[0] === highValue, 'High-value, low-effort task ranks first');
```

**Success Metric**:
- plan_next returns tasks in WSJF order (not YAML order)
- High-readiness, high-value, low-effort tasks rank first
- Blocked tasks (dependencies not met) are filtered out
- Tasks without required tools are filtered or ranked lower

**Evidence**:
- Unit tests: `src/planner/__tests__/planner_engine_intelligence.test.ts` (15 tests)
- Integration test: Call plan_next with 10 tasks, verify order matches WSJF
- Regression test: YAML-order fallback works if metadata missing (backwards compatible)

---

### AC6: Roadmap Validation Script Passes CI

**Criterion**: Validation script catches all structural errors (circular deps, missing refs, invalid types) and runs in CI on every roadmap.yaml change.

**Validation**:
```bash
# Run validation manually
npm run validate:roadmap

# Expected output (valid roadmap):
✅ Roadmap structure valid
✅ No circular dependencies
✅ All task references exist
✅ All tool names are valid
✅ All exit criteria have valid format
✅ Status values are valid

# Expected output (invalid roadmap):
❌ Roadmap validation failed:
  - Circular dependency: TASK-1 → TASK-2 → TASK-1
  - Missing task reference: TASK-3 depends on non-existent TASK-99
  - Invalid tool: TASK-4 requires 'invalid_tool' (not in MCP registry)
  - Invalid status: TASK-5 has status 'in-progress' (should be 'in_progress')

Exit code: 1
```

**Success Metric**:
- Validation script exits 0 for valid roadmap
- Validation script exits 1 and reports specific errors for invalid roadmap
- CI runs validation on every PR that modifies roadmap.yaml
- Validation completes in <5 seconds for 100-task roadmap

**Evidence**:
- CI workflow: `.github/workflows/roadmap-validation.yml` exists and runs
- Unit tests: `scripts/__tests__/validate_roadmap.test.ts` (30 tests)
- PR test: Create PR with invalid roadmap, confirm CI fails with clear error

---

### AC7: Backwards Compatible

**Criterion**: Existing roadmap.yaml (v1) still loads and autopilot still runs without modification.

**Validation**:
```typescript
// Old format (v1) - prose descriptions, flat dependencies
const oldRoadmap = {
  epics: [{
    id: 'E-1',
    milestones: [{
      tasks: [{
        id: 'TASK-1',
        title: 'Old task',
        status: 'pending',
        dependencies: ['TASK-0'], // Flat array
        exit_criteria: ['Build passes', 'Tests pass'] // Prose
      }]
    }]
  }]
};

// New format (v2) - structured metadata, typed dependencies
const newRoadmap = {
  schema_version: '2.0',
  epics: [{
    id: 'E-1',
    milestones: [{
      tasks: [{
        id: 'TASK-1',
        title: 'New task',
        status: 'pending',
        complexity_score: 5,
        effort_hours: 2,
        dependencies: { depends_on: ['TASK-0'] }, // Typed
        exit_criteria: [{ test: 'build', expect: 'pass' }] // Testable
      }]
    }]
  }]
};

// Both load successfully
const v1 = await RoadmapStore.read('old_roadmap.yaml');
const v2 = await RoadmapStore.read('new_roadmap.yaml');

assert(v1.epics.length > 0, 'v1 roadmap loads');
assert(v2.epics.length > 0, 'v2 roadmap loads');
```

**Success Metric**:
- RoadmapStore can load both v1 and v2 roadmaps
- plan_next works with both formats (uses defaults if metadata missing)
- No breaking changes to autopilot workflows

**Evidence**:
- Migration test: Copy current roadmap.yaml → old_roadmap.yaml, verify still loads
- Autopilot test: Run autopilot dry-run with v1 roadmap, confirm no errors
- Fallback test: plan_next returns YAML order if WSJF metadata missing

---

## 3. Validation Mapping

### How Each AC Will Be Verified

| AC | Verification Method | Tools/Scripts | Pass Criteria | Evidence Location |
|----|---------------------|---------------|---------------|-------------------|
| AC1 | TypeScript compilation + unit tests | `npm run build`, vitest | 0 errors, schemas export | `dist/src/roadmap/schemas.js` |
| AC2 | Dependency graph API tests | vitest, integration tests | 20 tests pass, queries < 10ms | `src/roadmap/__tests__/dependency_graph.test.ts` |
| AC3 | CompletionVerifier checks | Unit tests + manual verification | ≥50% criteria automated | `src/orchestrator/__tests__/completion_verifier_structured.test.ts` |
| AC4 | Metadata coverage analysis | `scripts/analyze_roadmap_metadata.ts` | 100% coverage | `state/analytics/roadmap_metadata_report.json` |
| AC5 | plan_next ranking tests | Unit + integration tests | Tasks in WSJF order | `src/planner/__tests__/planner_engine_intelligence.test.ts` |
| AC6 | CI validation workflow | GitHub Actions | Exits 0 for valid, 1 for invalid | `.github/workflows/roadmap-validation.yml` |
| AC7 | Backwards compatibility tests | Load v1 roadmap, run autopilot | No errors, autopilot runs | `state/evidence/ROADMAP-STRUCT/verify/backwards_compat_test.md` |

---

## 4. Integration Contracts

### Contract 1: RoadmapStore → Schemas

**Interface**: RoadmapStore loads and validates RoadmapSchema
**Contract**:
```typescript
class RoadmapStore {
  async read(): Promise<RoadmapSchema> {
    const yaml = await fs.readFile(this.filePath, 'utf8');
    const doc = YAML.parse(yaml);

    // Auto-detect version
    const version = doc.schema_version || '1.0';

    if (version === '2.0') {
      return validateRoadmap(doc); // Returns RoadmapSchema or throws
    } else {
      return migrateV1toV2(doc); // Converts v1 to v2 with defaults
    }
  }
}
```

**Test**: Load both v1 and v2 roadmaps, verify correct schema returned

---

### Contract 2: Planner → Dependency Graph

**Interface**: Planner queries dependency graph for readiness calculation
**Contract**:
```typescript
interface DependencyGraph {
  getDependents(taskId: string): string[]; // Who depends on this?
  getBlockers(taskId: string): string[];   // What blocks this?
  isReady(taskId: string): boolean;        // All blockers complete?
  detectCircularDeps(): string[][];        // Returns cycles
}

// Planner uses:
const ready = tasks.filter(t => graph.isReady(t.id));
```

**Test**: Query graph for 10 tasks, verify correct readiness

---

### Contract 3: CompletionVerifier → Testable Criteria

**Interface**: CompletionVerifier checks exit criteria automatically
**Contract**:
```typescript
interface CompletionVerifier {
  async checkExitCriteria(taskId: string): Promise<{
    total: number;
    automated: number;
    manual: number;
    passed: number;
    failed: number;
    results: Array<{ criterion: ExitCriterion; passed: boolean; message?: string }>;
  }>;
}

// Can check:
// - { test: 'build', expect: 'pass' } → Run build, check exit code
// - { test: 'tests', expect: 'pass' } → Run tests, check results
// - { file: 'path/to/file', expect: 'exists' } → Check file exists
// - { metric: 'coverage', expect: '>= 80%' } → Parse coverage report
```

**Test**: Check 10 testable criteria, verify automated checks work

---

### Contract 4: CI → Validation Script

**Interface**: CI runs validation on roadmap changes
**Contract**:
```yaml
# .github/workflows/roadmap-validation.yml
on:
  pull_request:
    paths:
      - 'state/roadmap.yaml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run validate:roadmap
        # Exits 0 if valid, 1 if errors
```

**Test**: Create PR with invalid roadmap, confirm CI fails

---

### Contract 5: plan_next → WSJF Ranker

**Interface**: plan_next uses WSJF algorithm for task ranking
**Contract**:
```typescript
function rankTasks(tasks: TaskSchema[]): TaskSchema[] {
  return tasks.map(t => ({
    ...t,
    readiness: calculateReadiness(t), // 0-1 based on deps
    value: calculateValue(t),         // Based on priority
    effort: t.effort_hours || estimateEffort(t.complexity_score)
  })).sort((a, b) => {
    const wsjfA = (a.readiness * a.value) / a.effort;
    const wsjfB = (b.readiness * b.value) / b.effort;
    return wsjfB - wsjfA; // Higher WSJF first
  });
}
```

**Test**: Rank 10 tasks with varying metadata, verify WSJF order

---

## 5. Non-Functional Requirements

### Performance

- **Roadmap Load Time**: <100ms for 100-task roadmap
- **Dependency Query Time**: <10ms per query
- **Validation Time**: <5 seconds for 100-task roadmap
- **plan_next Ranking Time**: <50ms for 50 tasks

### Reliability

- **Backwards Compatibility**: 100% of existing roadmaps load without error
- **Validation Accuracy**: 100% of structural errors detected (no false negatives)
- **WSJF Consistency**: Same inputs always produce same ranking order

### Maintainability

- **Code Coverage**: ≥80% for all new schema/validation code
- **Documentation**: All schemas have JSDoc comments with examples
- **Migration Path**: Clear upgrade guide from v1 to v2

---

## 6. Out of Scope (Not in This Spec)

**Explicitly NOT Included**:
1. **Task Clustering**: Auto-grouping related tasks (future enhancement)
2. **Effort Learning**: ML-based effort prediction (requires data collection)
3. **Dynamic Roadmap**: Auto-generation of tasks (complex feature)
4. **Visual Roadmap Editor**: Web UI for editing (separate project)
5. **Multi-Roadmap Support**: Product vs MCP roadmaps (low priority)

**Why**: Keep scope focused on core structure enhancement

---

## 7. Acceptance Test Plan

### Test Suite 1: Schema Validation (AC1)

**Test Cases**:
1. Valid task with all required fields → No errors
2. Task missing `id` → Error: "id is required"
3. Task with invalid `status` → Error: "status must be pending|ready|in_progress|blocked|needs_review|done|archived"
4. Task with `complexity_score` > 10 → Error: "complexity_score must be 1-10"
5. Task with invalid `required_tools` → Error: "tool 'invalid' not in MCP registry"

**Pass Criteria**: All 5 tests pass

---

### Test Suite 2: Dependency Graph (AC2)

**Test Cases**:
1. Query dependents of task with 2 dependents → Returns 2 task IDs
2. Query blockers of task with 1 blocker → Returns 1 task ID
3. Check readiness of task with all blockers complete → Returns true
4. Check readiness of task with 1 blocker incomplete → Returns false
5. Detect circular dep: A→B→A → Returns [[A, B, A]]

**Pass Criteria**: All 5 queries return correct results

---

### Test Suite 3: Automated Criteria (AC3)

**Test Cases**:
1. Check `{ test: 'build', expect: 'pass' }` → Runs build, returns pass/fail
2. Check `{ file: 'README.md', expect: 'exists' }` → Checks file, returns exists/not exists
3. Check `{ metric: 'coverage', expect: '>= 80%' }` → Parses report, returns pass/fail
4. Count automated vs manual criteria → At least 50% automated
5. Prose criterion `{ prose: 'Manual check' }` → Returns manual (not automated)

**Pass Criteria**: All automated checks work, ≥50% criteria automated

---

### Test Suite 4: Metadata Coverage (AC4)

**Test Cases**:
1. Count tasks with `complexity_score` → 100% coverage
2. Count tasks with `effort_hours` → 100% coverage
3. Count tasks with `required_tools` → 100% coverage
4. Verify all `required_tools` are valid → 0 invalid tools
5. Verify complexity maps to tiers → All tasks correctly classified

**Pass Criteria**: 100% metadata coverage, 0 invalid tools

---

### Test Suite 5: plan_next Intelligence (AC5)

**Test Cases**:
1. High-value, low-effort task ranks higher than low-value, high-effort
2. Blocked task (deps not met) is filtered out
3. Task without required tools ranks lower or is filtered
4. Tasks with same WSJF are stable-sorted (deterministic order)
5. Backwards compatibility: Tasks without metadata use YAML order

**Pass Criteria**: All 5 ranking tests pass

---

### Test Suite 6: Validation Script (AC6)

**Test Cases**:
1. Valid roadmap → Exits 0, reports no errors
2. Circular dep roadmap → Exits 1, reports cycle
3. Missing task reference → Exits 1, reports missing ID
4. Invalid tool name → Exits 1, reports invalid tool
5. CI test: PR with invalid roadmap → CI fails

**Pass Criteria**: All 5 validation tests pass, CI integration works

---

### Test Suite 7: Backwards Compatibility (AC7)

**Test Cases**:
1. Load v1 roadmap (current format) → No errors
2. Load v2 roadmap (new format) → No errors
3. plan_next with v1 roadmap → Returns tasks (YAML order fallback)
4. Autopilot dry-run with v1 roadmap → Completes without errors
5. Mixed v1/v2 roadmap → Loads and processes correctly

**Pass Criteria**: All 5 compatibility tests pass

---

## 8. Monitoring and Metrics

### Post-Deployment Metrics

**Track for 10 Tasks**:
1. **Task Selection Time**: Time from plan_next call to task start
   - **Target**: <5 seconds (was 10-15 seconds)
2. **Blocked Task Rate**: % tasks blocked mid-work due to missing dependencies
   - **Target**: <5% (was 15-20%)
3. **Effort Estimation Error**: |actual - estimated| / actual
   - **Target**: <20% (was 50%+)
4. **Tool Availability**: % tasks started without required tools
   - **Target**: 0% (was 10%)
5. **Roadmap Errors**: # validation errors caught in CI vs runtime
   - **Target**: 100% caught in CI (was 50% runtime)

### Collection Method

- **Log**: `state/telemetry/roadmap_metrics.jsonl`
- **Dashboard**: Grafana dashboard showing trends
- **Alert**: Slack notification if metrics regress

---

## 9. Sign-Off Checklist

**Before Marking SPEC Complete**:

- [ ] All 7 acceptance criteria defined with measurable pass/fail
- [ ] Validation mapping table complete (how to verify each AC)
- [ ] Integration contracts specified (5 contracts)
- [ ] Test suites defined (7 suites, 35 tests total)
- [ ] Non-functional requirements specified (performance, reliability)
- [ ] Out-of-scope explicitly documented
- [ ] Monitoring metrics defined
- [ ] Evidence locations specified for each AC

**Status**: ✅ All checklist items complete

---

**Next Phase**: PLAN - Break down implementation into sequenced tasks with estimates and dependencies
**Blocking Issues**: None
**Ready to Continue**: Yes
