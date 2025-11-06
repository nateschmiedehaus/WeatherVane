# Spec — AFP-GUARDRAIL-HARDENING-20251106

## Acceptance Criteria

1. **Automated Guardrail Monitor**
   - A script/CI workflow runs ProcessCritic, rotation, daily audit checks, and Wave 0 proof validation; it fails on any violation.
   - Monitor outputs structured JSONL in `state/analytics/guardrail_compliance.jsonl`.

2. **Telemetry & Evidence**
   - Daily compliance telemetry appended automatically (date, audit timestamp, proof status, ProcessCritic result).
   - Evidence bundle contains verify logs and CI artefacts for guardrail runs.

3. **Self-Healing Tasks**
   - On guardrail failure, TaskFlow (or Wave 0) opens/reminds the responsible task (e.g., `AFP-AUDIT-REMINDER-<date>`).
   - Follow-up task is logged in `state/evidence/<TASK>/followups.md`.

4. **Regression Protection**
   - Add tests/linters ensuring docs/templates retain PLAN-authored test guidance (no accidental regressions).
   - CI job enforces the guardrails so bypassing local hooks isn’t possible.

## Non-Functional Requirements

- Guardrail monitor must run within reasonable time (aim <5 minutes in CI).
- Must be idempotent; rerunning the monitor doesn’t duplicate tasks or telemetry.
- Adhere to AFP micro-batching and guardrails (≤5 files, ≤150 net LOC per commit).
- Scripts should be cross-platform where possible (Node/TypeScript preferred).

## Out of Scope

- Rewriting the proof system itself (already validated).
- Building dashboards/visualisations beyond JSONL telemetry.
- Replacing existing critics; we’re orchestrating them.
