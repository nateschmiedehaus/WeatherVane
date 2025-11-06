# Design: AFP-MODULE-REMEDIATION-20251105-N

> Restore `WorkProcessEnforcer` tests by seeding critic approvals that match the current enforcement rules.

---

## Context
- `tools/wvo_mcp/src/work_process/index.test.ts` exercises sequential phase discipline. After recent critic-approval enforcement landed in `tools/wvo_mcp/src/work_process/critic_verification.ts`, the tests now fail because they reference non-existent evidence files/log entries.
- The enforcer requires real `state/evidence/<task>/strategy.md` / `think.md` plus approved JSONL entries under `state/analytics/{strategy,thinking}_reviews.jsonl` before allowing transitions from `strategize` and `think`.
- Goal: bake representative fixtures into the test harness so the tests reflect actual enforcement behaviour instead of bypassing it.

---

## Five Forces Check
- **Coherence**: Mirror production paths/log formats; no mocking of critic verification.
- **Economy**: Minimal additions (helper to seed approvals + cleanup). Single test file touched.
- **Locality**: Helper lives alongside the tests; evidence/logs created under `state/` are cleaned up after each run.
- **Visibility**: Tests now show how critic approvals gate transitions, improving understanding of enforcement.
- **Evolution**: Central helper (`seedCriticApprovals`) ensures future approval changes only need edits in one place.

**Leverage**: Medium-high. Ensures work-process guardrail tests stay green and meaningful.

---

## Via Negativa
- Deleting the tests or mocking `verifyCriticApprovals` would hide enforcement. Prefer realistic fixtures instead.

---

## Alternatives Considered
1. **Mock `verifyCriticApprovals`** – quick but obscures integration behaviour. Rejected.
2. **Change enforcer to skip approvals in tests** – would introduce test-only code paths. Rejected.
3. **Selected** – Seed evidence/log fixtures within tests and restore state afterwards.

---

## Complexity Analysis
- Helper centralises setup; added code is straightforward.
- Cleanup logic ensures repository state remains stable after tests.

---

## Implementation Plan
1. Extend `index.test.ts` with helper utilities:
   - `seedCriticApprovals(taskId, artifacts)` writes evidence markdown + appends approved entries to the relevant analytics JSONL files.
   - Cache original log contents and restore them in `afterAll`; remove evidence directories in `afterEach`.
   - Map phases to artifact names via `evidencePathForPhase` to avoid mismatched filenames (`strategize` → `strategy.md`).
2. Update tests to use the helper for evidence paths and call `seedCriticApprovals` before transitions (`T-001` seeds strategy+think, `T-002` seeds strategy).
3. Run `npx vitest run src/work_process/index.test.ts` and `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`.

**Scope:** One test file (~+120 / -40 LOC, net < 150). Within AFP guardrails.

---

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope & verification defined
- [x] Edge cases (log restoration, cleanup) addressed

---

**Design Date:** 2025-11-06
**Author:** Codex
