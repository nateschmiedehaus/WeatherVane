# PLAN: w1m1-validation-and-exit

**Set ID:** w1m1-validation-and-exit
**Milestone:** W1.M1
**Epic:** WAVE-1
**Date:** 2025-11-06

---

## Approach

1. Create guardrail test suite (10 violation scenarios)
2. Run tests, verify 100% catch rate
3. Implement governance lock (immutable rules)
4. Validate exit criteria
5. Generate exit report

---

**Files:**
- tools/wvo_mcp/src/__tests__/guardrails.test.ts (~300 LOC)
- tools/wvo_mcp/src/governance/lock.ts (~100 LOC)
- state/evidence/AFP-W1-M1-EXIT-READINESS/exit_report.md

---

**Plan complete:** 2025-11-06
