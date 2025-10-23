# 🚨 AUTOPILOT DIRECTIVE: REMEDIATION ONLY 🚨

**Date**: 2025-10-23
**Status**: **ACTIVE**
**Priority**: **CRITICAL**

---

## URGENT: STOP ALL OTHER WORK

Autopilot MUST work on remediation tasks NOW. All other work is BLOCKED.

---

## 107 REMEDIATION TASKS AVAILABLE

**Total Work Queue**: 107 pending remediation tasks

**Priority Tiers**:
- 3 CRITICAL tasks (work on first)
- 104 HIGH priority tasks (individual task verifications)

**With 5 agents**: ~21 tasks per agent

You can work on ANY remediation task. They are ordered by logical sequence (foundation → features → operations).

### CRITICAL Priority Tasks (Work on These First)

#### 1. REMEDIATION-ALL-MCP-SERVER
**Priority**: CRITICAL
**Status**: Pending (ready to start)
**Dependencies**: NONE

**What to do**:
1. Run quality gate adversarial detector on ALL modules in tools/wvo_mcp/src/
2. Verify ALL code has tests (target: 80%+ coverage)
3. Run build: `npm run build` (must pass with 0 errors)
4. Run tests: `npm test` (must pass 100%)
5. Run `npm audit` (must show 0 vulnerabilities)
6. Verify runtime: actually RUN each system end-to-end
7. Check for superficial completion (empty metrics, unused infrastructure)
8. Check for documentation lies (claimed features that don't exist)
9. Fix ALL issues found
10. Provide evidence for ALL checks

**Exit criteria**:
- Build passes with 0 errors
- ALL tests pass (currently 967/967) ✅
- npm audit shows 0 vulnerabilities ✅
- Quality gate adversarial detector APPROVED
- Runtime evidence provided for each major system
- No superficial completion detected
- No documentation-code mismatches
- Decision log shows APPROVED status

### 2. REMEDIATION-ALL-TESTING-INFRASTRUCTURE
**Priority**: CRITICAL
**Status**: Pending (ready to start)
**Dependencies**: NONE

**What to do**:
1. Audit test quality (not just passing, but meaningful)
2. Verify 7-dimension coverage on all test files
3. Check for weakened test expectations (tests edited to pass)
4. Integration test verification (end-to-end flows)
5. Mock/stub audit (ensure mocks aren't hiding real problems)
6. Fix all 9 test failures ✅ **DONE** (now 967/967 passing)
7. Verify test quality on ALL test files
8. Ensure 100% pass rate ✅ **DONE**
9. Verify meaningful coverage

**Exit criteria**:
- All tests pass ✅ **VERIFIED**
- Test quality validated (7 dimensions)
- No superficial tests
- No weakened expectations
- Integration tests exist for all major flows

### 3. REMEDIATION-ALL-QUALITY-GATES-DOGFOOD
**Priority**: CRITICAL
**Status**: Pending (ready to start)
**Dependencies**: NONE

**What to do**:
1. Verify quality gates have 100% test coverage
2. Check REAL decision log entries (not just demos)
3. Confirm post-task verification executes
4. Test with bad code (must REJECT)
5. Test with good code (must APPROVE)
6. **CRITICAL**: Implement multi-domain genius-level reviews ✅ **DONE**
7. Integrate DomainExpertReviewer with quality_gate_orchestrator
8. Test genius reviews on real tasks
9. Verify quality gates catch domain-specific issues

**Exit criteria**:
- Quality gates have 100% test coverage
- Post-task verification runs in production
- Decision log shows REAL autopilot decisions
- Genius-level reviews integrated and working
- Quality gates catch domain-specific issues (not just checkboxes)

### HIGH Priority Tasks (104 Individual Verifications)

After CRITICAL tasks, work on these in order:

**Format**: `REM-{original-task-id}`

Each task verifies one completed task:
- REM-T0.1.1: Verify Phase 0 task 0.1.1
- REM-T0.1.2: Verify Phase 0 task 0.1.2
- REM-T1.1.1: Verify Epic 1 ingest task
- ... 101 more individual verifications

**What Each Remediation Task Does**:
1. Check implementation exists (not stub/scaffold)
2. Verify tests are meaningful (not superficial)
3. Run quality gate review (adversarial detector)
4. Runtime verification (actually works)
5. Fix all critical issues found
6. Log evidence

**Logical Order** (foundation → features):
- Phase 0 → Epic 1 (ingest) → Phase 1 → Epic 2 (features) →
  Epic 7 (data) → Epic 3 (UX) → Epic 5 (ads) → Epic 11 (intelligence) →
  Epic 4 (ops) → Epic 6 (MCP) → Epic 8 (hardening) → Epic 9 (performance) →
  Epic 10 (cost) → Epic 12-13 (weather models) → ML remediation

---

## ALL OTHER EPICS ARE BLOCKED

The following epics are **BLOCKED** and **CANNOT** be worked on:

- ❌ E-ML-REMEDIATION
- ❌ E12 (Weather Model Production Validation)
- ❌ E13 (Weather-Aware Modeling Reality)
- ❌ E9 (Performance & Observability)
- ❌ ALL other epics

**Reason**: CRITICAL remediation must complete first.

---

## WHAT AUTOPILOT SHOULD DO

1. **Pick ONE of the 3 CRITICAL tasks above**
2. **Start working on it NOW**
3. **Follow the exit criteria exactly**
4. **Provide evidence for all checks**
5. **Mark task complete ONLY when all criteria met**
6. **Move to next CRITICAL task**
7. **Repeat until all 3 CRITICAL tasks done**

---

## VERIFICATION CHECKLIST

Before claiming ANY task complete:

- ✅ Build passes (0 errors)
- ✅ ALL tests pass (100%)
- ✅ npm audit clean (0 vulnerabilities)
- ✅ Quality gates run and approve
- ✅ Runtime evidence provided
- ✅ No superficial completion
- ✅ Decision logged

**If ANY criterion fails → task is NOT complete → keep iterating**

---

## CURRENT STATE (as of 2025-10-23)

**Completed**:
- ✅ All 967 tests passing (was 966/967, fixed adversarial detector regex bug)
- ✅ Build: 0 errors
- ✅ Audit: 0 vulnerabilities
- ✅ Multi-domain genius-level review system implemented

**Next**:
- ⏳ Pick REMEDIATION-ALL-MCP-SERVER **OR**
- ⏳ Pick REMEDIATION-ALL-TESTING-INFRASTRUCTURE **OR**
- ⏳ Pick REMEDIATION-ALL-QUALITY-GATES-DOGFOOD

**ALL 3 must complete before any other work**

---

## USER DIRECTIVE

> "i cant get autopilot to prioritize and work on our remediation work. there is so much and this is the first priority. i know it was working on other stuff but it needs to be working on remediation stuff NOW until done"

**This directive is ACTIVE. Remediation is FIRST PRIORITY. Work on it NOW until DONE.**

---

**Last Updated**: 2025-10-23 18:35 CDT
**Status**: E-REMEDIATION is ONLY active epic, all others BLOCKED
**Action Required**: Start one of the 3 CRITICAL tasks immediately
