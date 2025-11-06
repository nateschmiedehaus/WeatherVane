# Design: AFP-MODULE-REMEDIATION-20251105-V

> **Purpose:** Document design thinking BEFORE implementing so AFP/SCAS constraints stay intact.

---

## Context

Wave 0 is blocked because `npm run test --prefix tools/wvo_mcp` fails in four suites:
1. `domain_expert_reviewer.test.ts` – template keywords + `criticalConcerns` missing.
2. `catalog.test.ts` – guardrail catalog path resolves outside repo, causing ENOENT.
3. `work_process/index.test.ts` – new enforcement requires evidence files, but fixtures create none.
4. `ml_task_aggregator_critic_results.test.ts` – parser never returns `passed` booleans, so tests see `undefined`.

ProofSystem runs this command for every Wave 0 task, so tasks stop at discovery → autopilot never completes work. Goal: restore these suites (without weakening enforcement), keep net LOC ≤150, and prove success via a post-fix Wave 0 run.

---

## Five Forces Check

### COHERENCE – Match the terrain
- [x] Checked patterns in:
  1. `tools/docsync/fs-utils.ts` (root resolution helper)
  2. `tools/wvo_mcp/src/orchestrator/__tests__/feature_gate_stub.ts` (temp fixtures)
  3. `tools/wvo_mcp/src/utils/test_workspace.ts` (workspace utilities)
- Pattern reused: “test helper that finds repo root + temp evidence fixtures,” already proven in other suites.

### ECONOMY – Achieve more with less
- [x] Via negativa explored (see next section). Estimated LOC: +(20 reviewer + 25 guardrail helper + 25 work-process fixtures + 30 ML parser + 20 tests) ≈ +120, deletions ~-10 → net +110 (<150).

### LOCALITY – Related near, unrelated far
- [x] Changes confined to `tools/wvo_mcp/src/{orchestrator,guardrails,work_process,critics}` plus associated tests. No cross-package ripples.

### VISIBILITY – Important obvious, unimportant hidden
- [x] Guardrail helper will throw descriptive error if repo root not found. Reviewer continues to emit explicit `criticalConcerns`. Work-process tests validate sequential transitions and log failures loudly.

### EVOLUTION – Patterns prove fitness
- [x] Reusing proven fixtures + helper patterns ensures future agents can extend them instead of copy/pasting brittle path math.

**Pattern Decision**
- Selected pattern: `workspace-root-helper + temp evidence builder` used elsewhere in repo. Fits because these suites only need deterministic references to repo root artifacts.

**Leverage Classification**
- Level: **High** (guardrails + work-process enforce AFP/SCAS; reviewers gate upstream quality).
- Assurance: Dedicated Vitest suites + full `npm run test` + Wave 0 live run for end-to-end proof.

Commit footer:
```
Pattern: test-fixture-root-resolver
Deleted: none
```

---

## Via Negativa Analysis

- Removing guardrail tests was considered but rejected; we need them to ensure SCAS enforcement.
- Could have relaxed work-process checks inside implementation, but that would undermine AFP. Instead we add lightweight fixtures (empty files) so tests satisfy the contract without removing enforcement.
- Domain reviewer templates could have been simplified by deleting keyword assertions. Rejected because templates are part of spec enforcement; better to reintroduce the expected wording.
- ML critic suite could be skipped temporarily, but ProofSystem would remain red. We will fix parser (or, if absolutely impossible, document deferral with risk analysis—current expectation is to fix).

---

## Refactor vs Repair

- Guardrail + work-process changes are **repairs** (fixing root cause: missing helper/fixtures). Domain reviewer change is a small **refactor** (ensuring templates and aggregation align). ML parser work completes the earlier refactor by mapping aggregator output to typed results.
- `domain_expert_reviewer.ts` >200 LOC; we are not refactoring entire module because bug is localized to template constants + aggregator result object. Rewriting entire reviewer would break guardrails and exceed LOC budget.
- Technical debt introduced: new helper file to locate workspace root. Mitigated by keeping it tiny, unit-tested via catalog suite, and referencing README comment so future devs reuse it.

---

## Alternatives Considered

### Alt 1 – Skip ML critic suite, document defer
- Pros: Focus strictly on blocking suites.
- Cons: `npm run test` still fails → ProofSystem remains blocked. Not acceptable.

### Alt 2 – Set `WORKSPACE_ROOT` env var inside tests
- Pros: No code changes.
- Cons: Hidden configuration; future runs without env var fail again. Harder to reason about in CI.

### Selected Approach – Deterministic helpers + fixture creation + parser wiring
- Ensures tests look like production (no env hacks), keeps enforcement strict, and restores autopilot capability. Aligns with AFP economy/locality (single helper) and SCAS (guardrails remain real).

---

## Complexity Analysis

- **Increase:** Introduce workspace resolver + temp evidence builder. Justified because it eliminates brittle relative paths and allows strict enforcement to stay. Mitigated by keeping helpers <30 LOC and co-locating with tests.
- **Decrease:** Remove hard-coded `../../../../../../` path math and ad-hoc fixture hacks, reducing maintenance burden.
- **Trade-off:** Slightly more helper code for significantly higher reliability/visibility.

---

## Implementation Plan

**Files to change (target ≤5):**
1. `tools/wvo_mcp/src/orchestrator/domain_expert_reviewer.ts` – add keywords + `criticalConcerns` aggregation.
2. `tools/wvo_mcp/src/orchestrator/domain_expert_reviewer.test.ts` – assert new strings + ensure `criticalConcerns` populated.
3. `tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts` (+ optional `tests/workspace_root.ts`) – replace brittle path with helper.
4. `tools/wvo_mcp/src/work_process/index.test.ts` – create temp evidence directories to satisfy enforcer.
5. `tools/wvo_mcp/src/critics/ml_task_aggregator.ts` + `__tests__/ml_task_aggregator_critic_results.test.ts` – wire parser + update fixtures (counts as same concern; ensure total touched files ≤5 by keeping parser change inside existing file and editing test accordingly).

**PLAN-authored tests:** the four Vitest suites listed above (already red; we will turn them green).

**Autopilot scope:** run `npm run wave0 -- --once --epic=WAVE-0` after tests pass; capture log entry in `state/analytics/wave0_runs.jsonl` and mention in verify.md.

**Estimated LOC:** ≈ +110 net. Micro-batching satisfied (≤5 primary files; tests + helper remain within plan).

**Risk & Testing:**
- Edge cases & failure modes covered in think.md (workspace detection, temp dir cleanup, autopilot run). 
- Tests: run individual suites + full `npm run test` + `npm run wave0`. Document outputs in verify.md.

**Assumptions:**
- Work-process enforcer can be pointed at temp workspace (otherwise we fall back to env injection).
- Guardrail catalog file exists at repo root (validated manually).
- Wave 0 still has at least one pending task after repairs; if not, we will queue a synthetic verification task.

---

## Review Checklist
- [x] Via negativa explored
- [x] Large-file refactor considered (not needed beyond localized edits)
- [x] Alternatives documented
- [x] Complexity justified
- [x] Scope/LOC estimated (<150; ≤5 files)
- [x] Edge cases/failure modes analyzed
- [x] Tests defined (four suites + full run + Wave 0)
- [x] Wave 0 verification plan listed

---

## Notes
- Helper naming convention will follow `resolveWorkspaceRoot()` and live adjacent to catalog tests unless we promote it to a shared test util.
- Document autopilot run + follow-up completion in `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md` when done.

**Design Date:** 2025-11-06  
**Author:** Codex

---

## GATE Review Tracking

_Pending reviewer feedback once design reviewer runs._
