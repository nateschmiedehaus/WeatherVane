# Design: AFP-MODULE-REMEDIATION-20251105-J

> **Purpose:** Restore TypeScript build by unifying feature gate test doubles so they satisfy the expanded `FeatureGatesReader` contract.

---

## Context

**Problem:** Recent expansions to `FeatureGatesReader` introduced ~20 methods. Test suites (`context_assembler.feature_gates.test.ts`, `utils/browser.feature_gates.test.ts`) still hand-roll minimal mocks, so TypeScript reports TS2740 errors. Builds fail, and each suite duplicates similar logic.

**Why:** Without a central stub, every interface change requires editing multiple tests. This violates coherence (duplicate patterns) and economy (excess LOC) while blocking compiled workflows.

---

## Five Forces Check

- **Coherence:** Existing CLI/tests use shared helpers (e.g., worker mocks). We'll introduce `createFeatureGatesStub` alongside orchestrator tests so all consumers share it.
- **Economy:** Deletion-first approach: remove inline mocks, replace with single helper. Net LOC expected to drop (~-40 LOC).
- **Locality:** Helper lives under `src/orchestrator/__tests__/`, close to the interface definition and primary consumers.
- **Visibility:** Stub exports are explicit; future additions require editing one location.
- **Evolution:** Pattern encourages reuse; we can track future interface growth by watching the helper.

**Pattern selected:** Shared test factory (existing pattern in other suites).

**Leverage:** Medium-high (restores TypeScript builds; test-only change but crucial for automation). Verification: `npx tsc --noEmit` + targeted Vitest if desired.

---

## Via Negativa

- Considered deleting the feature-gate tests (they’re simple). Rejected: they guard critical behaviour in context assembler/browser manager.
- No alternative deletion path; need to adapt mocks instead.

---

## Alternatives Considered

1. **Patch each test inline** – would reintroduce duplication and drift. Rejected.
2. **Use `FeatureGates` class directly** – requires LiveFlags plumbing; heavy for tests. Rejected.
3. **Selected approach** – create reusable stub with defaults + override support.

---

## Complexity Analysis

- Complexity decreases: single source of truth for test doubles.
- Additional helper is straightforward; no runtime impact.

---

## Implementation Plan

1. Add `tools/wvo_mcp/src/orchestrator/__tests__/feature_gate_stub.ts` exporting:
   ```ts
   export function createFeatureGatesStub(overrides?: Partial<FeatureGatesSnapshot | FeatureGatesReader>): FeatureGatesReader
   ```
   Implementation returns full interface with defaults and merges overrides of functions or snapshot fields.
2. Update `context_assembler.feature_gates.test.ts` to import helper and call `createFeatureGatesStub({ promptMode: 'compact' })` or override methods as needed.
3. Update `utils/browser.feature_gates.test.ts` similarly.
4. Ensure helper also exports `createFeatureGatesSnapshot` if needed for readability.
5. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json` to confirm TS errors cleared.

**Scope:** 3 files touched (new helper + 2 test updates). Estimated LOC: +80 -80 ⇒ net ~0. Within guardrails.

**Testing Strategy:** TypeScript compile is sufficient (tests already cover behaviour; no logic change).

---

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope within AFP limits
- [x] Edge cases considered (future interface growth)
- [x] Verification plan defined

---

**Design Date:** 2025-11-06
**Author:** Codex

---

## GATE Tracking
- DesignReviewer pending (run after implementation).
