---
task: AFP-W0-STEP5-MUTATION
owner: codex
updated: 2025-11-10T01:35:00Z
citations:
  - source: verify-run
    reason: executor log shows failing areas
  - source: guardrails-monitor
    reason: backlog of stale audits
reranker_threshold: 0.42
---

## Objective
Deliver real end-steps artifacts (verify log, diff-aware coverage, critics, SCAS) and switch the CI gate from soft to hard mode so regression cannot slip through.

## Constraints
- ≤5 files per commit and ≤150 net LOC.
- All artifacts must land under `state/logs/AFP-W0-STEP5-MUTATION/`.
- Guardrail monitor JSON must show deterministic pass/fail reasons.

## Tactics
1. Regenerate `verify.log` + `coverage.json` using the executor, copy coverage summary to the canonical location, and capture changed files for reference.
2. Run TemplateDetector on this plan, emit the JSON into `critics/template_detector.json`, and record the thresholds chosen by the reranker.
3. Produce Guardrail snapshot data by running the light monitor against roadmap/doc drift evidence; persist the JSON to `critics/guardrails.json`.
4. Execute `check_scas.mjs` to get an attestation with pass=true, then append a one-line summary to `verify.log` for traceability.
5. Update `.github/workflows/end_steps_contract.yml` to remove the soft-pass shim and teach the checker to exit non-zero when requirements are missing.

## Verification
- `node tools/wvo_mcp/dist/executor/verify.js --task AFP-W0-STEP5-MUTATION`
- `node tools/wvo_mcp/scripts/run_template_detector.mjs --task AFP-W0-STEP5-MUTATION --file state/logs/AFP-W0-STEP5-MUTATION/plan/plan.md`
- `node tools/wvo_mcp/scripts/guardrail_snapshot.mjs --task AFP-W0-STEP5-MUTATION`
- `node tools/wvo_mcp/scripts/check_scas.mjs`
