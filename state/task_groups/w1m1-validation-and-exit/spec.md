# SPEC: w1m1-validation-and-exit

**Set ID:** w1m1-validation-and-exit
**Milestone:** W1.M1
**Epic:** WAVE-1
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Guardrail Proof Complete
```bash
# Test 10 violations, all should be caught
npm run test:guardrails
# Output: 10/10 violations blocked ✅
```

### AC2: Governance Locked
```bash
# Try to modify guardrail rules
# Should require approval + logged in ledger
```

### AC3: Exit Readiness
```bash
# All WAVE-1 criteria met
npm run validate:exit WAVE-1
# Output: All criteria ✅
```

---

**Spec complete:** 2025-11-06
