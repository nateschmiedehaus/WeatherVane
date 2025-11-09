---
task_id: AFP-W0-STEP5-MUTATION
title: Stage 0–2 Autopilot Remediation Plan
owners:
  - Codex Autopilot
citations:
  - file: AUTOPILOT_MASTER_PLAN_V3.md
    start_line: 1
    end_line: 200
    sha256: 9c2cfa41711f9e8c7b05805c91cdf330e91cfda3536965dad76d8ce13ad83a2f
  - file: Deep Research Into Quality Control for Agentic Coding.pdf
    start_line: 1
    end_line: 200
    sha256: 6b4b4512c2a614a719722456dbe40fa030c4b8a18ad830ec3b8ea91bad1b6de0
drqc_citations:
  - ref: drqc-doctrine-live-fire
    quote: "Evidence must be ledgered, cited, and re-runnable; no compliance theater."
    rationale: Binds PLAN to DRQC doctrine for TemplateDetector relax mode.
---

# Goals
1. Reconstitute Stage 0 evidence (strategy/spec/plan/think + patch archive) so hooks enforce phases.
2. Standardize VERIFY outputs (log ≥1 KB, coverage JSON, artifacts list) scoped to smoke test only.
3. Enforce ProcessCritic coverage intersection + PLAN-authored test requirements.
4. Deliver reranker evidence + kb JSON to unlock TemplateDetector relaxed mode.
5. Add property-based testing, mutation stub, and SGAT adversary for Stage 2 completeness.
6. Record every artifact in state/logs/AFP-W0-STEP5-MUTATION and the audit ledger / validation matrix.

# Non-Goals
- Wave 0 stage 4+ safety harness (prompt governance, red-team) — handled later.
- Refactors outside VERIFY/critics/kb/test scope (e.g., wave0 executors) unless required for coverage.

# Approach
| Step | Description | Files/Artifacts |
| --- | --- | --- |
| 0 | Seed spec/plan docs + archive Stage 0–3 patches as tar+sha under `state/evidence/AFP-W0-STEP5-MUTATION/` | spec.md, plan.md, patch tarball, manual parity notes |
| 1a | Add vitest verify config + deterministic smoke test touching utils/config + verify/process helpers | tools/wvo_mcp/vitest.verify.config.ts, tools/wvo_mcp/tests/verify_smoke.test.ts |
| 1b | Update VERIFY harness (export normalizeCoverageShape, ensure artifacts) | tools/wvo_mcp/src/executor/verify.ts |
| 1c | Implement coverage intersection gate | tools/wvo_mcp/src/critics/process.ts, critic_results.json |
| 1d | Wire TemplateDetector relaxed mode via drqc.json | tools/wvo_mcp/src/critics/template_detector.ts, state/config/drqc.json |
| 2a | Add property-based test harness and seeds | tools/wvo_mcp/vitest.pbt.config.ts, tools/wvo_mcp/tests/reranker_property.test.ts, state/logs/.../pbt/shrinks.json |
| 2b | Mutation stub script + verify/mutation.json | tools/wvo_mcp/scripts/mutation_stub.mjs, state/logs/.../verify/mutation.json |
| 2c | SGAT adversary test + repro log | tools/wvo_mcp/tests/reranker_sgat.test.ts, state/logs/.../sgat/*.json |

# PLAN-Authored Tests (For VERIFY Phase)
- `VERIFY smoke`: `npm --prefix tools/wvo_mcp run build` then `WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION` (assert log ≥1 KB, coverage JSON produced)
- `ProcessCritic coverage gate`: `node tools/wvo_mcp/scripts/run_process_critic.mjs --task AFP-W0-STEP5-MUTATION` (expect non-empty intersection once smoke hits verify.ts & process.ts)
- `Property harness`: `npm --prefix tools/wvo_mcp run test:pbt` (deterministic seeds recorded)
- `Mutation stub`: `WVO_STATE_ROOT=$PWD/state node tools/wvo_mcp/scripts/mutation_stub.mjs --task AFP-W0-STEP5-MUTATION` (creates mutation.json with stub metadata)
- `SGAT repro`: `npm --prefix tools/wvo_mcp run test:pbt --rerun-only tests/reranker_sgat.test.ts` (guards reranker path weighting)
- `DocSync + LKL`: `node tools/autopilot/scripts/lkl_gen.mjs --dirs tools/wvo_mcp/src/utils,tools/wvo_mcp/src/critics` (refresh LOCAL_KB.yaml, proves Autopilot doc pipeline before committing helper scripts)
- `Wave 0 live smoke`: `npm --prefix tools/wvo_mcp run wave0 && ps aux | grep wave0` (prove Autopilot loop actually runs before helper scripts land; capture TaskFlow output in state/logs/AFP-W0-STEP5-MUTATION/wave0/)

# Milestones & Timeline
1. **Day 0:** Seed spec/plan + patch archive; update manual_parity/audit_summary.
2. **Day 0–1:** Stage 1 micro-commits (verify config, harness, coverage gate, TemplateDetector relax). Ledger + validation matrix updated per commit.
3. **Day 1:** Stage 2 micro-commits (property test, mutation stub, SGAT). KPI + evidence paths recorded.
4. **Day 1+:** Stage 3 integration branch with Validation Matrix (steps 7–9) once Stage 1–2 green.

# Risks & Mitigations
- **Hook violations**: Worktree still dirty (tracked M files). *Mitigation:* Evidence-only commit to relocate patch bundles + Stage 0 docs, then micro-commits touching ≤5 files.
- **Coverage gate flapping**: If VERIFY misses changed file, ProcessCritic blocks next commit. *Mitigation:* Smoke test exercises verify.ts/process.ts directly.
- **Test flakiness**: PBT/SGAT failing due to randomness. *Mitigation:* Seeds pinned in drqc.json; shrinks logged.
- **Evidence sprawl**: Without ledger/matrix updates, audits fail. *Mitigation:* Add ledger + manual parity steps to every Two-Phase loop.

# Traceability
- Reranker evidence stored at `state/logs/AFP-W0-STEP5-MUTATION/kb/AFP-W0-STEP5-MUTATION.json` (cite path in PLAN + TemplateDetector relax).
- Validation Matrix: `state/logs/AFP-W0-STEP5-MUTATION/validation_matrix_stage1.md` (Stage 1) and equivalent for Stage 2.
- Ledger entries: `state/logs/AUDIT_20251109T124202Z/ledger_stage1_step*.json`, `ledger_stage2_step*.json`.

# Manual Parity
Documented commands (build, VERIFY, ProcessCritic, PBT, mutation stub, SGAT) recorded in `state/logs/AUDIT_20251109T124202Z/manual_parity.md` per step so humans can replay.
