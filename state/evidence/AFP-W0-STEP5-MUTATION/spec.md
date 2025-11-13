---
task_id: AFP-W0-STEP5-MUTATION
version: 2025-11-09T22:20:00Z
authors:
  - Codex Autopilot
references:
  - path: AUTOPILOT_MASTER_PLAN_V3.md
    note: Stage 0–3 remediation requirements
  - path: Deep Research Into Quality Control for Agentic Coding.pdf
    note: DRQC doctrine (ledger, critics, live fire)
---

# Specification — Stage 0–2 Foundations

## Problem Statement
Wave 0 autopilot skipped PLAN/VERIFY/critics when attempting AFP-W0-STEP5-MUTATION on 2025‑11‑07. VERIFY artifacts, coverage evidence, reranker outputs, property/mutation/SGAT tests, and KPI telemetry were missing, so ProcessCritic could not gate quality. Without these, Stage 3–5 safety work cannot start.

## Goals
1. Produce deterministic VERIFY outputs (log ≥1 KB, normalized coverage, artifacts catalog) per task.
2. Enforce ProcessCritic coverage intersection and PLAN-authored test requirements.
3. Establish reranker + kb evidence with TemplateDetector relax logic tied to drqc.json.
4. Add property-based tests, mutation stub, and SGAT adversary to keep coverage honest.
5. Capture all artifacts under `state/logs/AFP-W0-STEP5-MUTATION/…` with ledger + validation matrix updates.

## Out of Scope
- Wave 0 orchestration changes outside VERIFY/critics/kb code paths.
- Stage 3+ features (doc guard, KPI telemetry) — handled after Stage 2 commits land.

## Acceptance Criteria
1. **VERIFY harness**
   - `tools/wvo_mcp/vitest.verify.config.ts` scopes to `tests/verify_smoke.test.ts` only.
   - `WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION` writes:
     - `state/logs/AFP-W0-STEP5-MUTATION/verify/verify.log` (≥1 KB, includes vitest banner)
     - `state/logs/AFP-W0-STEP5-MUTATION/verify/coverage.json` using `{files: {path:{pct,hit,found}}, summary}` schema
     - `state/logs/AFP-W0-STEP5-MUTATION/verify/coverage_artifacts/*.json`
2. **ProcessCritic coverage gate**
   - `computeCoverageIntersection` exported from `src/critics/process.ts`
   - Critic logs `changed_files`, `coverage_files`, `intersecting_files`, and fails with `coverage_intersection_empty` when intersection is empty.
3. **Template detector relax**
   - `state/config/drqc.json` defines relaxed-mode requirements (≥3 citations, reranker evidence, drqc_citations, reranker section)
   - TemplateDetector reads drqc.json and only relaxes when all signals present while logging mode (strict/relaxed).
4. **Plan + reranker evidence**
   - `state/evidence/AFP-W0-STEP5-MUTATION/plan.md` documents PLAN-authored tests, citations referencing kb spans, reranker evidence, traceability.
   - `state/logs/AFP-W0-STEP5-MUTATION/kb/<TASK>.json` contains query terms, scored candidates, chosen entries, rationale, and kb_sha256.
5. **Property / Mutation / SGAT**
   - `npm --prefix tools/wvo_mcp run test:pbt` executes deterministic property suite with seeds recorded at `state/logs/AFP-W0-STEP5-MUTATION/pbt/shrinks.json`.
   - `state/logs/AFP-W0-STEP5-MUTATION/verify/mutation.json` documents stub (tool: mutation_stub, score metadata).
   - `state/logs/AFP-W0-STEP5-MUTATION/sgat/*.json` logs adversarial repro (query terms, candidates, expected top file).
6. **Ledger + Validation Matrix**
   - Every micro-commit adds entry to `state/logs/AUDIT_20251109T124202Z/ledger_stageX_stepY.json` with branch, commit, patch path/sha, artifacts.
   - Validation matrix file lists Stage 1/2 checks, commands, artifact paths.
7. **Phase 0–3 Remediation Focus (2025-11-10 delta)**
   - Phase 0: `tools/wvo_mcp/src/executor/verify.ts` must execute vitest verify suite, normalize V8 coverage into `state/logs/<TASK>/coverage/coverage.json`, and emit `verify/verify.log` ≥1024 bytes ending with `SCAS: pass=<bool> files=<n> loc=<n>`. `.github/workflows/verify.yml` pins Node 20, runs `npm ci` at root + `tools/wvo_mcp`, builds, then `npm run verify -- --task CI-VERIFY`, uploading canonical artifacts.
   - Phase 1: `tools/wvo_mcp/scripts/check_scas.mjs` fails closed, falls back to `git merge-base` when BASE invalid, and loads `{max_files,max_net_loc,allow}` budgets from `state/config/drqc.json` (env overrides allowed). Output recorded at `state/logs/<TASK>/attest/scas.json`.
   - Phase 2: `tools/wvo_mcp/scripts/check_end_steps.mjs` only accepts canonical coverage + critics paths and enforces the final SCAS line requirement.
   - Phase 3: TemplateDetector analyzes body-only content, writes outputs to `state/logs/<TASK>/critics/template_detector.json`, and respects `template_detector.relaxed_when` config inside `state/config/drqc.json`.
   - CI consistency: `.github/workflows/{verify.yml,end_steps_contract.yml,contract-tests.yml}` pin Node 20 and run deterministically (TZ=UTC, SOURCE_DATE_EPOCH=1700000000); contract tests recompute critics + SCAS and hash-compare to committed artifacts.

## Constraints & Budgets
- ≤5 files and ≤150 net LOC per commit (hook enforced).
- Two‑Phase Apply & Validate (apply diff, run build+VERIFY+critics, re-apply diff idempotently, archive artifacts, record sha).
- Evidence-only artifacts must be under `state/**` (hook treat as exempt).
- Critics/verify must run locally before every commit; ProcessCritic coverage intersection must be non-empty after Stage 1 work completes.

## Risks & Mitigations
| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| VERIFY still runs full suite | Medium | High | Locked vitest config, manual parity commands, KPI check for number of tests |
| Coverage intersection false positives | Medium | High | Normalize paths, log arrays, manual parity instructions |
| Property tests flaky | Medium | Medium | Deterministic seeds + shrink logging |
| Mutation stub mistaken for real run | Medium | Medium | JSON includes `tool:"mutation_stub"`, ledger TODO to replace |
| Evidence drift | Medium | High | Ledger + validation matrix updates mandatory per commit |
| End-Steps/SCAS bypass persists | Medium | High | Enforce ≥1KB verify log + SCAS trailer, canonical coverage + critics paths, fail-closed SCAS budgets with explicit reasons |

## Deliverables
- spec.md (this file) + strategy/plan/think docs under state/evidence/AFP-W0-STEP5-MUTATION/
- VERIFY config/test + harness updates; coverage intersection, TemplateDetector relax code
- Property test suite, mutation stub script, SGAT test
- Evidence archives (verify log/coverage, critic_results.json, kb JSON, pbt/mutation/sgat JSON, ledger, validation matrix)
