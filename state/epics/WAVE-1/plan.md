# PLAN: WAVE-1 – Governance & AFP Enforcement

**Epic ID:** WAVE-1
**Status:** Pending
**Date:** 2025-11-06

---

## Execution Approach

Execute single milestone with 3 sets:

```
W1.M1: AFP Governance & Enforcement
   ↓
Set A: Governance Foundation (bootstrap, guardrails, ledger)
   ↓
Set B: Enforcement Automation (work process, DesignReviewer, roadmap guardrails)
   ↓
Set C: Validation & Exit (guardrail proof, governance lock, exit readiness)
   ↓
WAVE-1 Complete ✅
```

---

## W1.M1: AFP Governance & Enforcement

### Set A: w1m1-governance-foundation (3 tasks)

**Tasks:**
- AFP-W1-M1-S1-BOOTSTRAP (governance infrastructure)
- AFP-W1-M1-S1-GUARDRAILS (guardrails catalog)
- AFP-W1-M1-S1-LEDGER (decision ledger)

**Deliverables:**
- Governance infrastructure operational
- Guardrails catalog published
- Decision ledger tracking all critical decisions

**Estimated:** ~30 hours

### Set B: w1m1-enforcement-automation (3 tasks)

**Tasks:**
- AFP-W1-M1-S1-WORK-PROCESS-ENFORCE (enforce 10-phase lifecycle)
- AFP-W1-M1-DESIGNREVIEWER-LOOP (DesignReviewer blocks merges)
- AFP-W1-M1-ROADMAP-GUARDRAILS (roadmap schema validation)

**Deliverables:**
- Pre-commit hooks enforce phases
- DesignReviewer blocks on concerns
- Roadmap validates before commit

**Estimated:** ~40 hours

### Set C: w1m1-validation-and-exit (3 tasks)

**Tasks:**
- AFP-W1-M1-S1-GUARDRAIL-PROOF (prove guardrails work)
- AFP-W1-M1-S1-GOVERNANCE-LOCK (lock governance rules)
- AFP-W1-M1-EXIT-READINESS (exit validation)

**Deliverables:**
- Guardrails proven effective
- Governance locked (can't bypass)
- Exit criteria met

**Estimated:** ~25 hours

---

## Integration Tests

### Test 1: Bypass Attempt
- Try to commit without GATE phase
- Should block at pre-commit hook
- Success: Blocked with clear message

### Test 2: DesignReviewer Enforcement
- Submit work with superficial design.md
- DesignReviewer should block
- Success: Merge blocked, concerns listed

### Test 3: Roadmap Validation
- Add task without dependencies
- Should block on schema validation
- Success: Invalid roadmap rejected

---

## Via Negativa Analysis

**Can we DELETE/SIMPLIFY?**

### Option 1: Skip Ledger
- **Saves:** ~8 hours
- **Cost:** No audit trail of decisions
- **Verdict:** ❌ REJECTED (accountability critical)

### Option 2: Manual Enforcement Only
- **Saves:** ~30 hours (no automation)
- **Cost:** Doesn't scale, relies on humans
- **Verdict:** ❌ REJECTED (automation required)

### Option 3: Defer Governance Lock
- **Saves:** ~6 hours
- **Cost:** Can bypass guardrails
- **Verdict:** ❌ REJECTED (security critical)

**Selected:** Complete enforcement (all automation + ledger + lock)

---

## Files Changed Estimate

**New files:** ~15
**Modified files:** ~5
**Total:** ~20 files, ~2000 LOC

---

## Success Criteria

- [ ] Pre-commit hooks enforce all phases
- [ ] DesignReviewer blocks superficial work
- [ ] Roadmap validation blocks invalid structure
- [ ] Guardrail proof demonstrates effectiveness
- [ ] Governance locked (no bypass)
- [ ] Exit criteria validated

---

**Plan complete:** 2025-11-06
**Next phase:** think.md
**Owner:** Director Dana
