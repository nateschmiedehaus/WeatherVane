
# Modularization & Refactoring Policy

**Thresholds**
- File >500 lines → Mandatory review
- Function >100 lines → Mandatory refactor
- Class >300 lines → Mandatory split

**5‑Step Protocol**
1) Spec: goal (<500 lines), risks, acceptance
2) Plan: modules, ownership, contracts
3) Think: coupling & simpler designs
4) Implement: extract modules with tests
5) Verify: build+tests+benchmarks; document before/after counts

**Docs:** `docs/refactoring/<file>_MODULARIZATION.md` with before/after line counts + rationale.
