# STRATEGY: w0m1-validation-and-readiness

**Set ID:** w0m1-validation-and-readiness
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Autopilot has been built (supervisor, agents, infrastructure), but needs validation before Wave 0 exit:
- **Roadmap audit:** Does current roadmap actually lead to fast autonomy?
- **Proof loop validation:** Does the proof-driven workflow actually work?
- **Scaffold execution:** Does the complete scaffold (supervisor + agents + infra) execute tasks end-to-end?
- **Exit readiness:** Are all Wave 0 criteria met?

**Current state:**
- Roadmap exists but not validated for autonomy timeline
- Proof-driven workflow designed but not tested
- Individual components built but not integrated
- No exit criteria validation

**Pain points:**
1. **Unclear timeline** - Is 4-week autonomy achievable?
2. **Unproven proof loop** - Does STRATEGIZE → MONITOR actually work?
3. **Integration gaps** - Do all pieces work together?
4. **No exit validation** - Can't confirm readiness

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Built components incrementally without integration testing
- Focused on building, deferred validation
- No formal exit process

**Systemic:**
- Validation treated as optional (not critical path)
- No test-driven development (tests after code)
- Exit criteria not enforced

**The core issue:** **Build-first mentality without validation-driven development**

---

## Goal / Desired Outcome

**Validate Wave 0 is ready:**

### 1. Roadmap Audited for Fast Autonomy
- Review current roadmap structure
- Validate ≤4 week path to autonomy exists
- Identify blocking dependencies
- Document critical path

**Measurable:** Audit report confirms ≤4 week autonomy path

### 2. Proof Loop Validated
- Execute full proof-driven workflow (STRATEGIZE → MONITOR)
- Confirm all phases work
- Verify evidence generated
- Test with multiple task types

**Measurable:** 3+ tasks completed using proof loop, evidence bundles complete

### 3. Scaffold Execution Validated
- Run complete scaffold (supervisor + agents + infrastructure)
- Autonomous task pickup and execution
- End-to-end integration test
- Performance benchmarks met

**Measurable:** Scaffold executes 5+ tasks autonomously, 0 manual interventions

### 4. Exit Readiness Confirmed
- All Wave 0 criteria validated
- Exit report generated
- Blocking issues documented
- Green light for Wave 1

**Measurable:** Exit report shows all criteria met

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Assumptions → validated facts
- Untested integration → proven end-to-end
- Unclear readiness → explicit exit criteria

**What are we ADDING?**
- Audit process (~100 LOC)
- Validation tests (~200 LOC)
- Exit checklist (~50 LOC)

**Is the addition justified?**
- **Yes:** Prevents building on shaky foundation
- **Yes:** Saves time (catch issues early)
- **Yes:** Provides confidence (exit with proof)

---

## Success Criteria

**Set complete when:**

### Roadmap Audit Complete
- [ ] Audit report generated
- [ ] ≤4 week path confirmed
- [ ] Critical path documented
- [ ] Blocking dependencies identified

### Proof Loop Validated
- [ ] 3+ tasks completed with proof loop
- [ ] All evidence bundles complete
- [ ] All phases work (STRATEGIZE → MONITOR)
- [ ] Performance acceptable

### Scaffold Execution Validated
- [ ] 5+ tasks executed autonomously
- [ ] 0 manual interventions
- [ ] All components integrated
- [ ] Benchmarks met

### Exit Readiness Confirmed
- [ ] All Wave 0 criteria met
- [ ] Exit report complete
- [ ] Green light for Wave 1

---

## Estimated Effort

**Roadmap audit:** 4 hours
**Proof loop validation:** 6 hours
**Scaffold execution:** 4 hours
**Exit readiness:** 4 hours

**Total:** ~18 hours

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M1-ROADMAP-AUDIT, AFP-W0-VALIDATE-PROOF-LOOP, AFP-W0-M1-SCAFFOLD-EXECUTION, AFP-W0-M1-EXIT-READINESS
