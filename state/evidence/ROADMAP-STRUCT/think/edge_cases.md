# ROADMAP-STRUCT Think: Edge Cases and Risk Analysis

**Task ID**: ROADMAP-STRUCT
**Phase**: THINK
**Date**: 2025-10-29
**Status**: Complete

---

## Critical Edge Cases

### EC1: Circular Dependency Detection

**Scenario**: A→B→C→A creates infinite loop in dependency resolution
**Risk**: Autopilot hangs or crashes when calculating readiness
**Mitigation**:
- Implement cycle detection with visited set (O(V+E) graph traversal)
- Fail validation early if cycle detected
- Provide clear error: "Circular dependency: TASK-1 → TASK-2 → TASK-1"
**Test**: Create roadmap with known cycle, verify detection

### EC2: Missing Task References

**Scenario**: Task depends on "TASK-99" which doesn't exist
**Risk**: Autopilot fails at runtime when querying dependency
**Mitigation**:
- Validate all task references exist during roadmap load
- Report all missing references (not just first)
- Block plan_next if references missing
**Test**: Add dependency to non-existent task, verify validation fails

### EC3: WSJF Division by Zero

**Scenario**: Task has `effort_hours: 0`
**Risk**: Division by zero in WSJF calculation (value/effort)
**Mitigation**:
- Default effort_hours to 1 if 0 or undefined
- Warn if effort is suspiciously low (<0.5 hours)
**Test**: Task with effort=0, verify defaults to 1

### EC4: Backwards Compatibility Regression

**Scenario**: Old roadmap.yaml (v1) fails to load after migration
**Risk**: Breaking change blocks autopilot
**Mitigation**:
- Auto-detect version (presence of schema_version field)
- Migrate v1 to v2 with sensible defaults
- Keep original v1 roadmap as backup
**Test**: Copy current roadmap, verify still loads

### EC5: Invalid Tool Names

**Scenario**: Task requires "bash_script" but tool is named "cmd_run"
**Risk**: Autopilot starts task without required tool
**Mitigation**:
- Fetch available tools from MCP server at validation time
- Report invalid tools with suggestions (fuzzy match)
- Block task selection if tools unavailable
**Test**: Add invalid tool, verify validation suggests alternatives

### EC6: Status Inconsistency

**Scenario**: Parent epic marked "done" but child tasks still "pending"
**Risk**: Dashboard shows wrong progress
**Mitigation**:
- Auto-calculate epic/milestone status from tasks
- Warn if manual status doesn't match calculated
- Provide "fix status" command
**Test**: Mark epic done with pending tasks, verify warning

### EC7: Effort Estimation Overflow

**Scenario**: Sum of task efforts exceeds parent milestone estimate
**Risk**: Milestone planning inaccurate
**Mitigation**:
- Auto-calculate milestone effort from tasks
- Warn if sum exceeds manual estimate by >20%
- Suggest updating milestone estimate
**Test**: Tasks sum to 10 hours, milestone says 5 hours, verify warning

### EC8: WSJF Tie-Breaking

**Scenario**: Two tasks have identical WSJF score
**Risk**: Non-deterministic task order (different runs give different order)
**Mitigation**:
- Use task ID as secondary sort key (stable sort)
- Ensure same inputs always produce same order
**Test**: Create 2 tasks with identical metadata, verify stable order

### EC9: Partial Metadata

**Scenario**: 50% of tasks have complexity_score, 50% don't
**Risk**: WSJF ranking only considers subset of tasks
**Mitigation**:
- Default missing metadata: complexity=5, effort=2, tools=[]
- Warn if >20% of tasks missing metadata
- Still return all tasks (ranked + unranked)
**Test**: Mix of tasks with/without metadata, verify all returned

### EC10: Large Roadmap Performance

**Scenario**: 1000+ tasks, dependency graph slow
**Risk**: plan_next takes >5 seconds
**Mitigation**:
- Cache dependency graph (only recompute on roadmap change)
- Use adjacency list for O(1) lookups
- Benchmark with 1000-task roadmap
**Test**: Generate 1000-task roadmap, verify queries <10ms

---

## Failure Modes

### FM1: Schema Validation Fails on Load

**Trigger**: Invalid YAML structure or missing required fields
**Impact**: Autopilot cannot load roadmap, all tasks blocked
**Recovery**:
- Log detailed validation errors to console
- Load with warnings (skip invalid tasks)
- Provide repair suggestions

### FM2: CI Validation False Positive

**Trigger**: Validation script reports error but roadmap is valid
**Impact**: PR blocked incorrectly
**Recovery**:
- Manual bypass with explanation required
- Report false positive to improve validation
- Add test case for edge case

### FM3: WSJF Ranking Unstable

**Trigger**: Readiness calculation changes mid-execution
**Impact**: Different plan_next calls return different order
**Recovery**:
- Snapshot dependency state at start of ranking
- Use deterministic tie-breaking (task ID)
- Log when rankings change

### FM4: Migration Data Loss

**Trigger**: v1→v2 migration loses information
**Impact**: Tasks missing metadata, autopilot less intelligent
**Recovery**:
- Keep v1 backup before migration
- Report all migrations with defaults
- Manual review of migrated roadmap

### FM5: Tool Validation Network Failure

**Trigger**: Cannot fetch available tools from MCP server
**Impact**: Cannot validate required_tools
**Recovery**:
- Use cached tool list from last successful fetch
- Warn but don't block validation
- Default to allowing all tools

---

## Race Conditions

### RC1: Concurrent Roadmap Updates

**Scenario**: Two agents try to update same task status simultaneously
**Risk**: Lost updates, inconsistent state
**Mitigation**:
- Use file-based locking (fs.open with O_EXCL)
- Retry with exponential backoff (3 attempts)
- Report lock conflicts to user

### RC2: Validation During Plan_Next

**Scenario**: Roadmap changes while plan_next is ranking tasks
**Risk**: Rankings based on stale data
**Mitigation**:
- Snapshot roadmap at start of plan_next
- Detect if roadmap changed (compare file mtime)
- Re-rank if stale

---

## Security Considerations

### S1: Malicious YAML Injection

**Scenario**: Attacker adds task with exploit in description field
**Risk**: Code execution via YAML deserialization
**Mitigation**:
- Use safe YAML parser (yaml.load with safe schema)
- Validate all string fields (max length, no code)
- Sanitize before rendering in UI

### S2: Path Traversal in Artifacts

**Scenario**: Task produces: ["../../../etc/passwd"]
**Risk**: Access files outside workspace
**Mitigation**:
- Validate artifact paths are relative
- Ensure paths resolve within workspace
- Block ".." and absolute paths

---

## Performance Optimization Opportunities

### P1: Dependency Graph Caching

**Current**: Rebuild graph on every plan_next call
**Optimized**: Cache graph, invalidate on roadmap change
**Benefit**: 10x speedup for repeated plan_next calls

### P2: Lazy Validation

**Current**: Validate entire roadmap on load
**Optimized**: Validate only accessed tasks
**Benefit**: Faster startup for large roadmaps

### P3: Incremental Ranking

**Current**: Re-rank all tasks on every plan_next
**Optimized**: Only re-rank if dependencies changed
**Benefit**: 5x speedup when roadmap stable

---

## Monitoring and Alerting

### M1: Validation Failure Rate

**Metric**: % of roadmap loads that fail validation
**Alert**: If >5%, investigate common errors
**Action**: Improve validation error messages

### M2: WSJF Ranking Time

**Metric**: p95 latency of plan_next with WSJF
**Alert**: If >100ms, investigate performance
**Action**: Profile and optimize hot paths

### M3: Metadata Coverage

**Metric**: % tasks with full metadata
**Alert**: If <80%, tasks may not rank correctly
**Action**: Add missing metadata to roadmap

### M4: Circular Dependency Detection

**Metric**: # circular deps detected
**Alert**: If any detected, fix roadmap
**Action**: Break cycles manually

---

## Testing Strategy

### Unit Tests (75 tests)
- Schemas: 10 tests
- Dependency graph: 20 tests
- Validation: 30 tests
- WSJF ranking: 15 tests

### Integration Tests (10 tests)
- Load v1/v2 roadmaps
- plan_next with real roadmap
- CI validation workflow
- Backwards compatibility

### Stress Tests (5 tests)
- 1000-task roadmap performance
- 100-task circular dependency detection
- Concurrent roadmap updates
- Large dependency fan-out (1 task blocks 50)
- Metadata coverage edge cases

### Regression Tests (5 tests)
- Current roadmap still loads
- Autopilot dry-run still runs
- plan_next returns tasks (YAML order fallback)
- No breaking changes to existing workflows

---

## Rollback Plan

### If Migration Fails
1. Restore v1 roadmap from backup
2. Revert RoadmapStore changes
3. Continue with v1 until issues resolved

### If WSJF Breaks plan_next
1. Feature flag to disable WSJF (use YAML order)
2. Fix ranking algorithm
3. Re-enable WSJF after tests pass

### If Validation Too Strict
1. Downgrade errors to warnings
2. Allow roadmap to load with warnings
3. Fix validation logic incrementally

---

**Status**: Edge case analysis complete, risks identified with mitigations
**Next Phase**: IMPLEMENT - Build schemas, validators, and migration
**Blocking Issues**: None
**Ready to Continue**: Yes - All risks have mitigations, comprehensive test plan defined
