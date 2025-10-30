# THINK: Assumptions Register

**Task**: FIX-INTEGRATION-WorkProcessEnforcer
**Date**: 2025-10-30
**Phase**: THINK

---

## Assumptions

### A1: Script Availability
**Assumption**: Quality check scripts (preflight_check.sh, check_quality_gates.sh, check_reasoning.sh) are available and executable

**Evidence**:
- WORK-PROCESS-FAILURES task created these scripts
- Located in scripts/ directory
- Confirmed executable permissions

**Risk if Wrong**: Integration will fail immediately (script not found)

**Validation**: Check file existence in constructor, throw clear error if missing

**ID**: A1

---

### A2: JSON Output Format
**Assumption**: Quality check scripts output valid JSON to stdout

**Evidence**:
- WORK-PROCESS-FAILURES implementation uses JSON output
- Scripts write to /tmp/*_report_*.json

**Risk if Wrong**: Parsing will fail, quality checks won't work

**Validation**: Try-catch JSON.parse, log parse errors, fail-safe to non-blocking

**ID**: A2

---

### A3: Script Execution Time
**Assumption**: Quality checks complete within timeout (30s/15s/20s) under normal conditions

**Evidence**:
- Manual testing during WORK-PROCESS-FAILURES showed <30s
- No evidence of pathological slowness

**Risk if Wrong**: Frequent timeouts, fail-safe mode bypasses checks

**Validation**: Monitor timeout rate in telemetry, increase limits if >5%

**ID**: A3

---

### A4: Fail-Safe Is Acceptable
**Assumption**: It's better to allow bad work through (fail-safe) than to block autopilot on quality check failures

**Evidence**:
- AUTOPILOT_MISSION.md: "fail-safe always" - errors should degrade gracefully
- Shadow mode first allows tuning before blocking

**Risk if Wrong**: Quality violations slip through, defeating purpose

**Validation**: Shadow mode period reveals false positive rate, tune before enforce mode

**ID**: A4

---

### A5: Workspace Root Is Correct
**Assumption**: workspaceRoot parameter points to repository root where scripts are located

**Evidence**:
- WorkProcessEnforcer receives workspaceRoot from session
- Session reads from config

**Risk if Wrong**: Script paths won't resolve, execution fails

**Validation**: Normalize paths with path.resolve(), verify scripts exist

**ID**: A5

---

### A6: Single Autopilot Instance
**Assumption**: Only one autopilot instance runs at a time (no concurrent quality checks on same task)

**Evidence**:
- Current architecture is single-instance
- No multi-agent coordination yet

**Risk if Wrong**: Race conditions in telemetry writes, report file collisions

**Validation**: No mitigation needed for current architecture, document assumption

**ID**: A6

---

### A7: Scripts Are Idempotent
**Assumption**: Running quality check multiple times on same task doesn't change state or cause issues

**Evidence**:
- Scripts are read-only analyzers, don't modify code
- Telemetry appends (doesn't overwrite)

**Risk if Wrong**: Re-running checks causes problems

**Validation**: Test running same check twice, verify no issues

**ID**: A7

---

### A8: Telemetry Never Blocks
**Assumption**: Telemetry logging failures don't block quality checks or phase transitions

**Evidence**:
- MetricsCollector uses try-catch internally
- Telemetry is fire-and-forget

**Risk if Wrong**: Disk full or permission errors block autopilot

**Validation**: Wrap telemetry calls in try-catch, log errors to console

**ID**: A8

---

### A9: Mode Configuration Is Static
**Assumption**: Quality check mode (shadow/observe/enforce) doesn't change during session

**Evidence**:
- Config loaded once at WorkProcessEnforcer construction
- No dynamic mode switching planned

**Risk if Wrong**: Behavior inconsistent within session

**Validation**: Document that mode is session-static, restart required to change

**ID**: A9

---

### A10: Task ID Is Sufficient Context
**Assumption**: taskId parameter is enough to locate evidence directory and run checks

**Evidence**:
- Quality check scripts accept taskId parameter
- Evidence path convention: state/evidence/{taskId}/

**Risk if Wrong**: Scripts can't find task evidence

**Validation**: Ensure taskId passed correctly, scripts log error if not found

**ID**: A10

---

## Design Decisions

### D1: Fail-Safe Defaults
**Decision**: Timeouts and errors default to non-blocking (fail-safe)

**Alternatives Considered**:
1. **Fail-closed**: Block on any error → REJECTED (breaks autopilot)
2. **Fail-safe**: Log and continue → SELECTED (preserves velocity)
3. **Conditional**: Block only in enforce mode → POSSIBLE (future enhancement)

**Rationale**:
- Autopilot velocity is critical for mission
- Shadow mode period allows tuning before enforcing
- Better to miss some issues than halt all work

**Trade-offs**:
- ✅ Autopilot remains operational during integration issues
- ❌ Quality violations might slip through during errors

**ID**: D1

---

### D2: Progressive Rollout via Feature Flags
**Decision**: Use mode: 'shadow' | 'observe' | 'enforce' for gradual adoption

**Alternatives Considered**:
1. **Binary on/off**: enabled: true/false → REJECTED (no tuning period)
2. **Progressive modes**: shadow → observe → enforce → SELECTED
3. **Per-check control**: enable preflight but not quality gates → POSSIBLE (over-complex)

**Rationale**:
- Reduces risk of disruptive false positives
- Allows measurement before enforcement
- Standard industry practice (shadow, canary, rollout)

**Trade-offs**:
- ✅ Low-risk deployment
- ❌ Slower to full enforcement

**ID**: D2

---

### D3: Generic Check Runner
**Decision**: Single runCheck() method handles all check types

**Alternatives Considered**:
1. **Specialized methods**: runPreflightScript, runQualityScript, etc. → REJECTED (duplication)
2. **Generic runner**: One method with parameters → SELECTED
3. **External service**: Quality checks as microservice → REJECTED (over-engineering)

**Rationale**:
- DRY principle (Don't Repeat Yourself)
- Timeout/error handling consistent across all checks
- Easy to add new check types

**Trade-offs**:
- ✅ Less code duplication
- ✅ Consistent behavior
- ❌ Slightly more complex interface

**ID**: D3

---

### D4: Synchronous Integration
**Decision**: Quality checks run synchronously during phase transition (block until complete or timeout)

**Alternatives Considered**:
1. **Synchronous**: Wait for check to complete → SELECTED
2. **Async**: Start check, poll for results → REJECTED (complexity, latency)
3. **Background**: Run checks after transition → REJECTED (defeats purpose)

**Rationale**:
- Checks must complete before phase transition
- Complexity of async polling not justified
- Timeouts prevent excessive blocking

**Trade-offs**:
- ✅ Simple implementation
- ✅ Clear blocking semantics
- ❌ Phase transitions slightly slower

**ID**: D4

---

### D5: Telemetry to JSONL
**Decision**: Log quality check results to state/analytics/*.jsonl (not structured DB)

**Alternatives Considered**:
1. **JSONL files**: Append JSON lines → SELECTED
2. **SQLite database**: Structured queries → REJECTED (overkill for MVP)
3. **No telemetry**: Just console logs → REJECTED (can't analyze)

**Rationale**:
- Consistent with existing telemetry approach
- Simple append-only writes (no locking)
- Easy to analyze with jq/grep

**Trade-offs**:
- ✅ Simple, proven approach
- ✅ No DB dependencies
- ❌ Harder to query (no SQL)

**ID**: D5

---

### D6: Per-Phase Hooks
**Decision**: Separate checks at each phase (preflight before IMPLEMENT, quality gates before VERIFY, reasoning before MONITOR)

**Alternatives Considered**:
1. **Per-phase**: Different checks at each phase → SELECTED
2. **All-at-once**: Run all checks before every phase → REJECTED (slow, redundant)
3. **On-demand**: Manual trigger only → REJECTED (defeats autonomy)

**Rationale**:
- Each phase has different quality needs
- Pre-flight checks foundation before implementation
- Quality gates check implementation before verification
- Reasoning validates complete work process before completion

**Trade-offs**:
- ✅ Appropriate checks at appropriate times
- ✅ Minimal overhead (only what's needed)
- ❌ More integration points to maintain

**ID**: D6

---

## Edge Cases

### E1: Script Not Found
**Scenario**: Quality check script doesn't exist at expected path

**Handling**:
- Check script existence in constructor
- Throw clear error: "Quality check script not found: {path}"
- Provide remediation: "Run WORK-PROCESS-FAILURES task or disable quality checks"

**Test**: Unit test with invalid scriptPath

---

### E2: Script Exits with Non-Zero Code
**Scenario**: Script encounters error and exits with code >0

**Handling**:
- Catch error from execSync/spawn
- Log error message and exit code
- Fail-safe: return non-blocking result
- Record error in telemetry

**Test**: Unit test with mock failing script

---

### E3: Script Outputs Invalid JSON
**Scenario**: Script writes malformed JSON to stdout

**Handling**:
- Try JSON.parse with try-catch
- Log parse error with partial output
- Fail-safe: return non-blocking result
- Telemetry records parse failure

**Test**: Unit test with mock script outputting invalid JSON

---

### E4: Script Times Out
**Scenario**: Script runs longer than timeoutMs

**Handling**:
- Kill script process (SIGTERM → SIGKILL)
- Log timeout event with duration
- Fail-safe: return non-blocking result with timedOut=true
- Telemetry records timeout

**Test**: Unit test with mock slow script

---

### E5: Concurrent Phase Transitions
**Scenario**: Two phase transitions attempted simultaneously for same task

**Handling**:
- **Current**: No protection (A6 assumes single instance)
- **Future**: Phase leases prevent concurrent transitions
- **Impact**: Minimal (checks are read-only)

**Test**: N/A for current implementation

---

### E6: Disk Full (Telemetry Write Fails)
**Scenario**: state/analytics/*.jsonl write fails due to disk space

**Handling**:
- Wrap telemetry writes in try-catch
- Log error to console (not telemetry, as that's failing)
- Don't block phase transition
- Alert operator to disk issue

**Test**: Manual test with read-only analytics directory

---

### E7: Evidence Directory Missing
**Scenario**: state/evidence/{taskId} doesn't exist when running reasoning validation

**Handling**:
- Script checks directory existence
- Returns validation failure with clear message
- Blocking in enforce mode (missing evidence is real failure)
- Logged to telemetry

**Test**: Integration test with non-existent task ID

---

### E8: Script Hangs (No Output)
**Scenario**: Script enters infinite loop, no output, no exit

**Handling**:
- Timeout still applies (SIGTERM → SIGKILL)
- Fail-safe: timeout returns non-blocking result
- Telemetry records hang with timeout event

**Test**: Unit test with mock hanging script (sleep infinity)

---

### E9: Permissions Error
**Scenario**: Script not executable (chmod -x)

**Handling**:
- execSync throws EACCES error
- Catch error, log permission issue
- Fail-safe: return non-blocking result
- Provide remediation in error message

**Test**: Manual test with non-executable script

---

### E10: Workspace Root Mismatch
**Scenario**: workspaceRoot points to wrong directory (scripts not found there)

**Handling**:
- Normalize path with path.resolve()
- Check script existence in constructor
- Throw error if scripts not found at expected paths
- Clear error message with expected vs actual paths

**Test**: Unit test with invalid workspaceRoot

---

## Alternative Approaches Rejected

### Alternative 1: Pre-Commit Hooks Only
**Approach**: Use Git hooks instead of autopilot integration

**Why Rejected**:
- Doesn't help autopilot autonomy (manual commits still)
- Can be bypassed with --no-verify
- Not integrated into work process flow

---

### Alternative 2: External Quality Service
**Approach**: Run quality checks as separate microservice, poll for results

**Why Rejected**:
- Over-engineering for current scale
- Adds latency (async communication)
- Complexity not justified by benefits
- Increases operational burden

---

### Alternative 3: Inline Checks (No Scripts)
**Approach**: Rewrite all quality checks as TypeScript in WorkProcessEnforcer

**Why Rejected**:
- Duplicates WORK-PROCESS-FAILURES implementation
- Harder to maintain (two codebases)
- Scripts are reusable for manual mode
- Would take >3 hours to reimplement

---

### Alternative 4: Always Enforce (No Shadow Mode)
**Approach**: Skip shadow/observe modes, go straight to enforcement

**Why Rejected**:
- High risk of false positives blocking work
- No tuning period
- Could break autopilot immediately
- Violates gradual rollout best practices

---

## Deferred Decisions

### Deferred 1: Performance Optimization
**Decision Deferred**: Caching check results, parallel execution, result memoization

**Rationale**:
- Measure first, optimize later
- Timeouts aggressive enough for MVP
- Can optimize if telemetry shows issues

**Revisit**: After 1 week shadow mode monitoring

---

### Deferred 2: Check Tuning
**Decision Deferred**: Adjusting quality gate thresholds (file size limits, coverage targets, etc.)

**Rationale**:
- Shadow mode will reveal false positive rate
- Tuning without data is premature
- Existing thresholds from WORK-PROCESS-FAILURES are reasonable defaults

**Revisit**: After shadow mode analysis

---

### Deferred 3: Learning System Integration
**Decision Deferred**: Feeding quality check results into learning system for gate improvement

**Rationale**:
- Learning system is Phase 7 work (separate epic)
- Telemetry provides data, integration can happen later
- Doesn't block MVP

**Revisit**: FIX-LEARNING-* tasks (separate epic)

---

### Deferred 4: UI for False Positive Review
**Decision Deferred**: Dashboard for reviewing/overriding false positive detections

**Rationale**:
- Can use JSONL files with jq for now
- Dashboard enhancement is post-MVP
- Doesn't block core integration

**Revisit**: Dashboard improvement backlog

---

## Mitigation Tasks (Pre-Mortem Derived)

**Note**: Pre-mortem analysis in separate file (pre_mortem.md) may generate mitigation tasks (Task 0.x numbering)

**Example Mitigation Tasks** (from pre-mortem analysis):
- Task 0.1: Add timeout monitoring alert (if timeout rate >10%)
- Task 0.2: Add false positive tracking dashboard
- Task 0.3: Add check-disable emergency procedure doc
- Task 0.4: Add performance benchmarking for checks
- Task 0.5: Add check result cache (if performance issues emerge)

**These will be defined after pre-mortem analysis**

---

## Definition of "Done" for Assumptions Phase

This assumptions register is complete when:
1. ✅ All assumptions identified with evidence and risk assessment
2. ✅ Assumptions have IDs for reference (A1-A10)
3. ✅ Design decisions documented with alternatives and trade-offs
4. ✅ Design decisions have IDs for reference (D1-D6)
5. ✅ Edge cases identified with handling strategy (E1-E10)
6. ✅ Alternative approaches documented with rejection rationale
7. ✅ Deferred decisions documented with revisit triggers

**Status**: ✅ COMPLETE

---

**Next Document**: pre_mortem.md - analyze failure scenarios and mitigations
