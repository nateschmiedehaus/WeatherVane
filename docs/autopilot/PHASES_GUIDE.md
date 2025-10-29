# STRATEGIZE→MONITOR — Phase Guide (Subtasks, Artifacts, Backtracking)

Use this as the canonical checklist for every task, whether running under the Unified Autopilot or standalone agents.

## Summary
- Sequence: STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR
- Enforcement: Evidence-gated transitions + immutable ledger + leases + prompt attestation
- Backtracking: Allowed/required from VERIFY/REVIEW/PR/MONITOR to earlier phases; enforcer records and restarts evidence collection

## Per-Phase Minimums

STRATEGIZE
- Do: Problem statement; approach options; tie to WeatherVane objectives
- Artifacts: `strategy.md` (purpose, risks, constraints)

SPEC
- Do: Quantified acceptance criteria; success metrics; DOD
- Artifacts: `spec.md` (numbers, thresholds) + optional `test_cases.md`

PLAN
- Do: File/function targets; dependency map; time estimates
- Artifacts: `plan.md` + `file_map.json`

THINK
- Do: Alternatives; edge cases; failure modes; risk mitigations
- Artifacts: `edge_cases.md` (or `risks.md`)

IMPLEMENT
- Do: Minimal patch; tests; docs; build locally
- Artifacts: `git_diff.patch`, `modified_files.json`, `design_decisions.md` (optional)

VERIFY
- Do: tests, lint, type, security, license; coverage delta; e2e if applicable
- Artifacts: `test_results.json`, `build_output.log`, `coverage_report.json`

REVIEW
- Do: Rubric (readability, maintainability, perf, security); critical audit
- Artifacts: `review_rubric.json`, `code_quality_score.json`

PR
- Do: Draft PR with template; CI status; risks/rollback
- Artifacts: `pr_url.txt`, `pr_template_filled.md`, `ci_results.json`

MONITOR
- Do: Post-merge smoke; telemetry; anomaly watch; rollback readiness
- Artifacts: `smoke_test_results.json`, `deployment_status.json`

## Backtracking Protocol
- If any of VERIFY/REVIEW/PR/MONITOR fail or surface gaps:
  - Identify earliest impacted phase
  - Enforcer backtracks phase; ledger entry recorded
  - Produce updated artifacts for that phase
  - Re-run all downstream phases with fresh evidence

