# Design: AFP-PROOF-DRIVEN-GAMIFICATION-20251106-REDO

> **Purpose:** Capture design thinking before re-implementing proof-driven Wave 0 with gamification under tightened guardrails.

---

## Context

Existing proof/gamification modules were merged without tests or live validation. Wave 0 runner references them but no evidence shows the integration working. Process docs now require PLAN-authored tests and daily audits; this design ensures the implementation respects those guardrails and produces verifiable artefacts.

---

## Scope Estimate

- Files to change: approximately 10 (new tests, minor proof fixes, roadmap entry, evidence docs).
- Estimated LOC delta: about +250 / -20 overall.
- Micro-batching: limit each commit to ≤5 files and ≤150 net LOC via the four-bundle plan outlined below.

---

## Five Forces Check

### COHERENCE
- Reviewed `tools/wvo_mcp/src/prove/*.ts`, `wave0/runner.ts`, `wave0/task_executor.ts` to align with existing patterns.
- Existing telemetry/logger utilities reused; no new logging framework introduced.

### ECONOMY
- Scope limited to tests + small fixes; avoid large refactors.
- Reuse proof components rather than building new orchestrators.

### LOCALITY
- Proof unit tests live alongside proof modules.
- Wave 0 integration tests live under `wave0/__tests__/`.
- Roadmap edits isolated to single validation task; clean-up after run.

### VISIBILITY
- Tests assert verify.md creation, telemetry entries, and achievement stats.
- Evidence captures command outputs so reviewers see the proof.

### EVOLUTION
- Proof system becomes a proven pattern once tests + live run succeed.
- Achievements/self-improvement provide hooks for future Wave upgrades.

**Leverage level:** High — affects Wave 0 autonomy confidence; warrants comprehensive tests and evidence.

---

## Via Negativa

- No new modules introduced; focus on hardening existing code.
- Delete/trim any placeholder TODO comments encountered during test writing.
- Avoid expanding roadmap beyond the single validation task (delete after run).

---

## Refactor vs Repair

- Strategy is a repair/hardening pass: add tests, fix integration edges, produce proof artefacts.
- If tests expose deeper architectural issues, prefer refactor inside module rather than patching call sites.

---

## Alternatives Considered

### Alternative 1 — Pure Documentation Update (Deletion/Simplification)
- **What:** Declare the existing proof integration “good enough” and simply document expectations.
- **Pros:** Zero code churn, immediate compliance on paper.
- **Cons:** No real proof, guardrails still untested, undermines policy changes.
- **Why rejected:** Fails strategic goal of demonstrating working automation.

### Alternative 2 — Full Wave 0 Refactor (Refactoring Approach)
- **What:** Rewrite Wave 0 with real agent execution and task orchestration.
- **Pros:** Moves closer to long-term architecture.
- **Cons:** Massive scope, high risk of introducing regressions, exceeds AFP limits.
- **Why rejected:** Disproportionate to the goal of validating existing stack.

### Alternative 3 — Selected Approach (Targeted Tests + Single Live Run)
- **What:** Add deterministic tests, fix gaps revealed, and run one live proof loop.
- **Pros:** Demonstrates system end to end, manageable within guardrails, produces concrete evidence.
- **Cons:** Still minimal compared to production pipeline, requires careful staging.
- **Why chosen:** Balances effort vs. confidence, aligns with AFP guardrails.

---

## Complexity Impact

- Additional tests increase coverage without raising runtime complexity.
- Minor code fixes expected (e.g., ensure proof integration exports testable functions).
- Wave 0 run remains single-threaded; no concurrency introduced.

---

## Implementation Plan Snapshot

- Add Vitest suites (`prove/proof_system.test.ts`, `prove/phase_manager.test.ts`, `wave0/wave0_integration.test.ts`).
- Ensure ProofIntegration exposes hooks for tests (e.g., dependency injection of proof runner).
- Append validation task `AFP-W0-VALIDATE-PROOF-LOOP` to roadmap.
- Execute PLAN-authored tests + live run; capture verify.md, telemetry, achievements.
- Update implement/verify/review evidence with commands/outcomes.

### Scope Estimate & Micro-Batching
- **Files touched:** ≈10 (new test files, small proof fixes, roadmap entry, evidence docs).
- **Estimated LOC delta:** +250 / -20 overall; each staged commit ≤150 net LOC.
- **Commit batching:**
  1. Proof unit tests + supporting exports.
  2. Wave 0 integration test + minor runtime adjustments.
  3. Roadmap validation task + telemetry artefacts.
  4. Evidence updates (implement/verify/review, audit summary).

---

## Risks & Mitigations

1. **Tests flake due to async timers**
   - Mitigation: use fake timers/mocks; set deterministic timeouts.
2. **Wave 0 run leaves stale roadmap edits**
   - Mitigation: update roadmap status back to `done` after VERIFY; document in review.
3. **ProofIntegration writes outside evidence scope**
   - Mitigation: point to task-specific directories; assert path usage in tests.

---

## Testing Strategy

- Unit: proof system, phase manager, self improvement, progress tracker.
- Integration: Wave 0 hitting proof integration and returning proven/unproven.
- Manual: one Wave 0 run recorded via telemetry + verify.md.
- Guardrails: ProcessCritic, rotation script, daily audit.
