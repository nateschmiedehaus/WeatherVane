# Autopilot Functionality Review Rubric — AT-GUARD-REVIEW

**Task**: Validate Autopilot workflows still operate correctly after Phase -1 enforcement implementation

**Date**: 2025-10-31

---

## Review Scope

This review validates that core Autopilot functionality remains operational after implementing:
- WorkProcessEnforcer (phase transition gating)
- Quality gate integration
- Reasoning validation
- Enforcement level controls (observe/soft/strict)
- Phase lease and ledger systems
- Prompt attestation

---

## Reviewer Rubric

### 1. Planner Dispatch ✅/❌/⚠️

**Criteria**: Planner can dispatch tasks, parse roadmap, and route to appropriate agents

**Tests**:
- [ ] `plan_next` MCP tool returns task list
- [ ] Roadmap parsing works (no parse errors)
- [ ] Priority scheduling operates correctly
- [ ] Task dependencies are respected
- [ ] WIP limits are enforced

**Evidence**:
- Command output from `plan_next`
- Roadmap validation results
- Scheduler logs/telemetry

**Status**: _TO BE TESTED_

---

### 2. Tool Execution ✅/❌/⚠️

**Criteria**: MCP tools execute correctly and return expected results

**Tests**:
- [ ] `autopilot_status` returns system state
- [ ] `wvo_status` returns configuration
- [ ] `fs_read` can read files
- [ ] `cmd_run` executes bash commands
- [ ] Tool routing works (ModelRouter)

**Evidence**:
- Tool execution logs
- Success/failure rates from telemetry
- MCP metrics from integrity suite

**Status**: _TO BE TESTED_

---

### 3. State Transitions ✅/❌/⚠️

**Criteria**: StateGraph manages phase transitions correctly with enforcement gates

**Tests**:
- [ ] Valid transitions succeed (e.g., STRATEGIZE → SPEC)
- [ ] Invalid transitions are blocked
- [ ] Enforcement gates trigger correctly
- [ ] Phase leases are acquired/released
- [ ] Ledger entries are created
- [ ] Telemetry spans are logged

**Evidence**:
- State transition logs (`state/logs/work_process.jsonl`)
- Ledger verification
- StateGraph tests passing
- Enforcement telemetry

**Status**: _TO BE TESTED_

---

### 4. Work Process Enforcement ✅/❌/⚠️

**Criteria**: WorkProcessEnforcer validates work process compliance

**Tests**:
- [ ] Missing evidence blocks transitions
- [ ] Quality gates execute (preflight, gates, reasoning)
- [ ] Enforcement level controls work (observe/soft/strict)
- [ ] Bypass overrides are logged
- [ ] Rollback on failure works

**Evidence**:
- Enforcement logs
- Quality gate reports
- Bypass audit trail
- Enforcement metrics

**Status**: _TO BE TESTED_

---

### 5. Integration Health ✅/❌/⚠️

**Criteria**: All subsystems integrate correctly

**Tests**:
- [ ] Integrity test suite passes (>90% sections)
- [ ] No critical errors in logs
- [ ] Telemetry collection works
- [ ] Database operations succeed
- [ ] File system operations succeed

**Evidence**:
- Integrity suite results (from AT-GUARD-VERIFY)
- Error logs analysis
- Telemetry dashboards
- System health metrics

**Status**: _TO BE TESTED_

---

### 6. Regression Detection ✅/❌/⚠️

**Criteria**: No regressions introduced by enforcement changes

**Tests**:
- [ ] All previous functionality still works
- [ ] No new test failures introduced
- [ ] Performance acceptable (<25% degradation)
- [ ] No breaking changes to MCP API
- [ ] Backward compatibility maintained

**Evidence**:
- Test suite comparisons (before/after)
- Performance metrics
- API compatibility checks

**Status**: _TO BE TESTED_

---

## Review Methodology

For each rubric section:
1. Run specified tests
2. Collect evidence artifacts
3. Mark status: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL
4. Document findings and recommendations
5. Identify follow-up tasks if needed

---

## Success Criteria

**APPROVE** if:
- All critical areas (1-4) are ✅ PASS or ⚠️ PARTIAL with acceptable risks
- Integration Health (5) shows >90% sections passing
- No critical regressions (6)
- Evidence is comprehensive and verifiable

**BLOCK** if:
- Any critical area is ❌ FAIL
- Integrity suite <80% passing
- Critical regressions detected
- Evidence is missing or insufficient

**DEFER** if:
- Partial evidence requires additional testing
- Risks need mitigation plans
- Follow-up tasks must be created first

---

## Review Execution Log

_This section will be populated as tests are executed_

