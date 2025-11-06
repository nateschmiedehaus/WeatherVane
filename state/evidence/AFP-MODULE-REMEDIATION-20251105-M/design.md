# Design: AFP-MODULE-REMEDIATION-20251105-M

> Update LOC analyzer tests to reflect current heuristics.

---

## Context
- LOC analyzer now treats core logic with 0.8x multiplier, templates/docs differently, and via negativa credits at 0.5x, etc.
- Tests still expect legacy values, causing 13 failures.
- Need to rebaseline without weakening enforcement.

---

## Five Forces
- **Coherence:** Align tests with implementation while preserving guardrail intentions. Use existing analyzer spec as source of truth.
- **Economy:** Adjust expectations rather than rewriting analyzer.
- **Locality:** Single test file update.
- **Visibility:** Document new expectations (inline comments) where heuristics non-obvious.
- **Evolution:** Reusable helper to compute expected values reduces drift.

**Leverage:** High – suite enforces smart LOC guardrails. Verification via targeted Vitest, TypeScript unchanged.

---

## Via Negativa
- Considered deleting flaky tests; rejected – they enforce critical guardrail behaviour.

---

## Alternatives
1. Patch analyzer to match old expectations – would revert intended behaviour. Rejected.
2. Stub analyzer output – reduces coverage. Rejected.
3. **Selected:** Rebaseline tests to match documented heuristics, possibly computing values programmatically.

---

## Complexity
- Decreases by consolidating expectation logic into helper functions.

---

## Implementation Plan
1. Read `tools/wvo_mcp/src/enforcement/loc_analyzer.ts` to confirm coefficients.
2. Update tests to compute expected LOC using analyzer constants (import or replicate from module).
3. Adjust AC tests to assert new statuses (warning, strong-warning, blocked) based on current thresholds.
4. Run `npx vitest run src/enforcement/__tests__/loc_analyzer.test.ts` and ensure pass.

Scope: single test file; expected net -LOC after cleanup.

---

## Checklist
- [x] Via negativa considered
- [x] Alternatives listed
- [x] Scope & verification defined

---

**Design Date:** 2025-11-06
**Author:** Codex
