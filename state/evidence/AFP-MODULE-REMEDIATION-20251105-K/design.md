# Design: AFP-MODULE-REMEDIATION-20251105-K

> Provide typed ML task fixtures so aggregator tests satisfy `MLTaskSummary` contract.

---

## Context
- `MLTaskSummary` now requires numerous fields (report_path, deliverables, quality metrics, critic results, etc.).
- Tests still create minimal objects, triggering TS2740 and blocking builds.
- We need a reusable factory to centralise defaults, ensuring tests remain readable and type-safe.

---

## Five Forces
- **Coherence:** Similar patterns exist (e.g., feature gate stub). Implement `createTaskSummary` within the test or dedicated helper.
- **Economy:** Replace repeated object literals with a single factory; net LOC decrease.
- **Locality:** Keep helper in test file to avoid exporting test-only utilities widely.
- **Visibility:** Defaults documented in helper; tests override relevant fields explicitly.
- **Evolution:** Future interface changes require updating one helper.

**Leverage:** Medium (test-only but unblocks TypeScript build). Verification via `npx tsc --noEmit`.

---

## Via Negativa
- Considered deleting the classification tests; rejected because they verify aggregator behaviour.
- No simpler fix than adapting fixtures.

---

## Alternatives
1. Inline the required fields manually – repetitive, error-prone.
2. Mock aggregator to bypass TypeScript – undermines coverage.
3. **Selected:** introduce factory helper with defaults, override per test.

---

## Complexity
- Decreases: centralised creation.
- No runtime impact.

---

## Implementation Plan
1. Add helper inside test file:
   ```ts
   function createSummary(overrides: Partial<MLTaskSummary>): MLTaskSummary { ... }
   ```
   Provide base object with empty arrays/maps, default `report_path`, etc.
2. Update arrays to `createSummary({ id: 'TASK_SUCCESS', ... })`.
3. Ensure `completion_path` matches previous values for assertions.
4. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`.

**Scope:** Single test file. Estimated LOC: +40 (helper) −60 ( old literals) ≈ −20 net.

---

## Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope within guardrails
- [x] Edge cases + tests planned

---

**Design Date:** 2025-11-06
**Author:** Codex
