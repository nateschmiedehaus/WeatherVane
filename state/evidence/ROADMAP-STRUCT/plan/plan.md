# ROADMAP-STRUCT Plan: Implementation Breakdown

**Task ID**: ROADMAP-STRUCT
**Phase**: PLAN
**Date**: 2025-10-29
**Status**: Complete

---

## Summary

**Total Estimate**: 8-11 hours across 5 phases, 23 tasks
**Approach**: Iterative, backwards-compatible implementation with comprehensive testing
**Risk Level**: Medium (structural changes, but backwards compatible)

---

## Implementation Phases

### Phase 1: Schema Definition (2-3 hours, 6 tasks)

**Goal**: Define TypeScript schemas for RoadmapSchema v2.0

**Task 1.1**: Create schema types (45 min)
- **File**: `tools/wvo_mcp/src/roadmap/schemas.ts` (NEW, ~200 lines)
- **Deliverable**: TaskSchema, MilestoneSchema, EpicSchema, RoadmapSchema interfaces
- **Dependencies**: None
- **Verification**: TypeScript compiles, types export correctly

**Task 1.2**: Create dependency types (30 min)
- **File**: `tools/wvo_mcp/src/roadmap/schemas.ts` (+50 lines)
- **Deliverable**: DependencyRelationships, ExitCriterion types
- **Dependencies**: Task 1.1
- **Verification**: Types support depends_on, blocks, related_to, produces, consumes

**Task 1.3**: Create validation helpers (1 hour)
- **File**: `tools/wvo_mcp/src/roadmap/validators.ts` (NEW, ~150 lines)
- **Deliverable**: validateTask(), validateRoadmap(), validation error types
- **Dependencies**: Task 1.1, 1.2
- **Verification**: Can validate task structure, return specific errors

**Task 1.4**: Create dependency graph API (1 hour)
- **File**: `tools/wvo_mcp/src/roadmap/dependency_graph.ts` (NEW, ~200 lines)
- **Deliverable**: getDependents(), getBlockers(), isReady(), detectCircularDeps()
- **Dependencies**: Task 1.2
- **Verification**: Graph queries work, circular deps detected

**Task 1.5**: Write unit tests for schemas (30 min)
- **File**: `tools/wvo_mcp/src/roadmap/__tests__/schemas.test.ts` (NEW, ~100 lines)
- **Deliverable**: 10 tests for type validation
- **Dependencies**: Task 1.1-1.3
- **Verification**: All tests pass

**Task 1.6**: Write unit tests for dependency graph (45 min)
- **File**: `tools/wvo_mcp/src/roadmap/__tests__/dependency_graph.test.ts` (NEW, ~150 lines)
- **Deliverable**: 20 tests for graph queries
- **Dependencies**: Task 1.4
- **Verification**: All tests pass, queries return correct results

---

### Phase 2: Validation Script (1-2 hours, 4 tasks)

**Goal**: Create roadmap validation script for CI

**Task 2.1**: Create validation script (1 hour)
- **File**: `tools/wvo_mcp/scripts/validate_roadmap.ts` (NEW, ~250 lines)
- **Deliverable**: CLI script that validates roadmap.yaml, outputs JSON report
- **Dependencies**: Phase 1 complete
- **Verification**: Script runs, exits 0 for valid, 1 for invalid

**Task 2.2**: Add validation checks (30 min)
- **File**: `tools/wvo_mcp/scripts/validate_roadmap.ts` (+100 lines)
- **Deliverable**: Check circular deps, missing refs, invalid tools, status consistency
- **Dependencies**: Task 2.1
- **Verification**: All 6 validation types work (structural, referential, circular, status, effort, tools)

**Task 2.3**: Write validation tests (30 min)
- **File**: `tools/wvo_mcp/scripts/__tests__/validate_roadmap.test.ts` (NEW, ~200 lines)
- **Deliverable**: 30 tests for all validation scenarios
- **Dependencies**: Task 2.1, 2.2
- **Verification**: All tests pass

**Task 2.4**: Add npm script (5 min)
- **File**: `tools/wvo_mcp/package.json` (+2 lines)
- **Deliverable**: `npm run validate:roadmap` command
- **Dependencies**: Task 2.1
- **Verification**: Command runs successfully

---

### Phase 3: Roadmap Migration (2-3 hours, 5 tasks)

**Goal**: Migrate current roadmap.yaml to v2.0 structure

**Task 3.1**: Add metadata analysis script (30 min)
- **File**: `tools/wvo_mcp/scripts/analyze_roadmap_metadata.ts` (NEW, ~150 lines)
- **Deliverable**: Script that reports metadata coverage (complexity, effort, tools)
- **Dependencies**: Phase 1 complete
- **Verification**: Generates JSON report with coverage stats

**Task 3.2**: Add complexity_score to all tasks (1 hour)
- **File**: `state/roadmap.yaml` (~100 tasks × 1 field)
- **Deliverable**: All tasks have complexity_score: 1-10
- **Dependencies**: Task 3.1 (for analysis)
- **Verification**: 100% coverage, scores align with task descriptions

**Task 3.3**: Add effort_hours to all tasks (45 min)
- **File**: `state/roadmap.yaml` (~100 tasks × 1 field)
- **Deliverable**: All tasks have effort_hours
- **Dependencies**: Task 3.2
- **Verification**: 100% coverage, estimates reasonable

**Task 3.4**: Add required_tools to all tasks (45 min)
- **File**: `state/roadmap.yaml` (~100 tasks × 1 field)
- **Deliverable**: All tasks have required_tools array
- **Dependencies**: Task 3.3
- **Verification**: 100% coverage, all tools are valid MCP tools

**Task 3.5**: Convert dependencies to typed structure (30 min)
- **File**: `state/roadmap.yaml` (~50 tasks with deps)
- **Deliverable**: Convert `dependencies: [X]` to `dependencies: { depends_on: [X] }`
- **Dependencies**: Task 3.4
- **Verification**: All dependencies typed, validation passes

---

### Phase 4: plan_next Enhancement (2-3 hours, 5 tasks)

**Goal**: Add intelligent task ranking to plan_next

**Task 4.1**: Update RoadmapStore to support v2 (1 hour)
- **File**: `tools/wvo_mcp/src/state/roadmap_store.ts` (+50 lines)
- **Deliverable**: Auto-detect v1 vs v2, migrate v1 to v2 with defaults
- **Dependencies**: Phase 1, Phase 3 complete
- **Verification**: Can load both v1 and v2 roadmaps

**Task 4.2**: Create WSJF ranker (1 hour)
- **File**: `tools/wvo_mcp/src/planner/wsjf_ranker.ts` (NEW, ~150 lines)
- **Deliverable**: calculateReadiness(), calculateValue(), rankTasks()
- **Dependencies**: Phase 1 (dependency_graph)
- **Verification**: Rankings match WSJF formula

**Task 4.3**: Integrate WSJF into plan_next (45 min)
- **File**: `tools/wvo_mcp/src/planner/planner_engine.ts` (+100 lines)
- **Deliverable**: Use WSJF ranker if metadata present, fallback to YAML order
- **Dependencies**: Task 4.1, 4.2
- **Verification**: Returns tasks in WSJF order

**Task 4.4**: Write planner tests (45 min)
- **File**: `tools/wvo_mcp/src/planner/__tests__/planner_engine_intelligence.test.ts` (NEW, ~200 lines)
- **Deliverable**: 15 tests for WSJF ranking
- **Dependencies**: Task 4.3
- **Verification**: All tests pass

**Task 4.5**: Integration test with real roadmap (30 min)
- **File**: `tools/wvo_mcp/src/planner/__tests__/planner_integration.test.ts` (+50 lines)
- **Deliverable**: Load roadmap.yaml, call plan_next, verify WSJF order
- **Dependencies**: Task 4.3, Phase 3
- **Verification**: Tasks ranked correctly

---

### Phase 5: CI Integration & Documentation (1 hour, 3 tasks)

**Goal**: Add CI validation and complete documentation

**Task 5.1**: Create CI workflow (20 min)
- **File**: `.github/workflows/roadmap-validation.yml` (NEW, ~30 lines)
- **Deliverable**: GitHub Actions workflow that runs `npm run validate:roadmap` on PR
- **Dependencies**: Phase 2 complete
- **Verification**: Workflow file valid, runs on roadmap.yaml changes

**Task 5.2**: Test CI workflow (20 min)
- **Test**: Create PR with invalid roadmap, verify CI fails
- **Deliverable**: Evidence that CI catches errors
- **Dependencies**: Task 5.1
- **Verification**: CI fails with clear error message

**Task 5.3**: Update documentation (20 min)
- **Files**: Update `docs/roadmap/STRUCTURE.md` (NEW), `tools/wvo_mcp/README.md` (+section)
- **Deliverable**: Document new schema, validation, WSJF ranking
- **Dependencies**: All phases complete
- **Verification**: Docs explain v2 structure, migration guide, validation usage

---

## Task Summary

**Total Tasks**: 23
**Total Estimate**: 8-11 hours

**By Phase**:
- Phase 1: 6 tasks, 2-3 hours (Schema Definition)
- Phase 2: 4 tasks, 1-2 hours (Validation Script)
- Phase 3: 5 tasks, 2-3 hours (Roadmap Migration)
- Phase 4: 5 tasks, 2-3 hours (plan_next Enhancement)
- Phase 5: 3 tasks, 1 hour (CI Integration)

**Critical Path**:
1. Phase 1 (schemas) → Phase 2 (validation) → Phase 3 (migration) → Phase 4 (plan_next) → Phase 5 (CI)
2. No parallelization opportunities (each phase depends on previous)

---

## Verification Strategy

### Build Verification
```bash
npm run build          # 0 errors expected
npm run typecheck      # All types valid
```

### Test Verification
```bash
npm test -- schemas.test.ts             # 10 tests pass
npm test -- dependency_graph.test.ts    # 20 tests pass
npm test -- validate_roadmap.test.ts    # 30 tests pass
npm test -- planner_engine_intelligence.test.ts  # 15 tests pass
# Total: 75 new tests
```

### Integration Verification
```bash
npm run validate:roadmap               # Exits 0
node scripts/analyze_roadmap_metadata.ts  # 100% coverage
npm test -- planner_integration.test.ts   # plan_next returns WSJF order
```

### Manual Verification
1. Load current roadmap.yaml → No errors (backwards compat)
2. Call plan_next → Tasks in WSJF order (not YAML order)
3. Create PR with invalid roadmap → CI fails
4. Check metadata report → All tasks have complexity_score, effort_hours, required_tools

---

## Risk Mitigation

### Risk 1: Breaking Existing Autopilot
**Mitigation**: Backwards-compatible migration (v1 still loads)
**Test**: Run autopilot dry-run with v1 roadmap before/after

### Risk 2: WSJF Algorithm Incorrect
**Mitigation**: Unit tests with known inputs/outputs, compare to manual calculation
**Test**: 15 tests cover edge cases (blocked tasks, missing metadata, etc.)

### Risk 3: Migration Effort Underestimated
**Mitigation**: Metadata can be added gradually (fallback to defaults)
**Test**: Roadmap with 50% metadata should still work

### Risk 4: Circular Dependency Detection False Positives
**Mitigation**: Test with known circular deps, ensure algorithm correct
**Test**: Create test roadmap with A→B→C→A, verify detected

---

## Files to Create (9 new files)

1. `tools/wvo_mcp/src/roadmap/schemas.ts` (~250 lines)
2. `tools/wvo_mcp/src/roadmap/validators.ts` (~150 lines)
3. `tools/wvo_mcp/src/roadmap/dependency_graph.ts` (~200 lines)
4. `tools/wvo_mcp/src/roadmap/__tests__/schemas.test.ts` (~100 lines)
5. `tools/wvo_mcp/src/roadmap/__tests__/dependency_graph.test.ts` (~150 lines)
6. `tools/wvo_mcp/scripts/validate_roadmap.ts` (~350 lines)
7. `tools/wvo_mcp/scripts/__tests__/validate_roadmap.test.ts` (~200 lines)
8. `tools/wvo_mcp/scripts/analyze_roadmap_metadata.ts` (~150 lines)
9. `tools/wvo_mcp/src/planner/wsjf_ranker.ts` (~150 lines)
10. `tools/wvo_mcp/src/planner/__tests__/planner_engine_intelligence.test.ts` (~200 lines)
11. `.github/workflows/roadmap-validation.yml` (~30 lines)
12. `docs/roadmap/STRUCTURE.md` (~300 lines)

**Total New Code**: ~2,230 lines

## Files to Modify (3 files)

1. `state/roadmap.yaml` (add metadata to ~100 tasks)
2. `tools/wvo_mcp/src/state/roadmap_store.ts` (+50 lines)
3. `tools/wvo_mcp/src/planner/planner_engine.ts` (+100 lines)
4. `tools/wvo_mcp/package.json` (+2 lines)
5. `tools/wvo_mcp/README.md` (+50 lines)

---

## Success Metrics (Repeat from SPEC)

**Track for 10 Tasks Post-Implementation**:
1. Task Selection Time: <5 seconds (target)
2. Blocked Task Rate: <5% (target)
3. Effort Estimation Error: <20% (target)
4. Tool Availability: 0% tasks missing tools (target)
5. Roadmap Errors: 100% caught in CI (target)

---

**Next Phase**: THINK - Analyze edge cases, failure modes, and mitigation strategies
**Blocking Issues**: None
**Ready to Continue**: Yes
