# Strategy — AFP-GUARDRAIL-HARDENING-20251106

**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)  
**Template:** Strategy v1.0

---

## Purpose

The proof-driven redo exposed that guardrails only worked after manual intervention. We need a systemic fix that keeps agents compliant automatically: guardrails should prevent drift, surface violations immediately, and prove compliance continuously, not just when someone happens to check.

---

## Problem Statement

- Plans still require manual policing; if ProcessCritic is disabled or bypassed, the gaps return.
- Daily audit and rotation scripts depend on human discipline.
- Evidence exists, but there’s no automated watcher ensuring telemetry/verify.md are produced for new tasks.
- Meta guardrails (docs, templates, tests) aren’t themselves guarded—updates can regress requirements.

**Goal:** Build a meta-level hardening layer so compliance is enforced automatically and violations generate self-healing work without human prompting.

---

## Current State Insights

- ProcessCritic now detects missing PLAN tests/daily audits, but only when commits run through the critic.
- Wave 0 proof loop produces verify.md, yet nothing ensures each autopilot task is backed by such proof.
- Daily audit checklist updated, but no system checks the audit actually ran for the day.
- Evidence folders exist, though there’s no telemetry summarizing compliance trends.

---

## Desired Outcomes

1. Automated guardrail monitors (CI + local hooks) that fail fast when plans/audits/proof evidence are missing.
2. Compliance telemetry (e.g., JSONL dashboard) tracking daily audit completion, proof runs, ProcessCritic results.
3. Auto-generated follow-up tasks when guardrails trip (TaskFlow integration).
4. Regression tests for docs/templates/critics so requirements can’t be silently removed.

---

## Constraints & Assumptions

- Must stay within AFP micro-batching (≤5 files per commit, ≤150 net LOC); likely break work into sub-commits.
- New automation should run locally and in CI (GitHub Actions or equivalent), so commands must be non-interactive.
- Existing scripts (ProcessCritic, rotate_overrides, Wave 0 proof) remain the source of truth—we’ll orchestrate them, not rewrite entirely.
- We can schedule daily jobs or add TaskFlow autopilot automation if necessary.

---

## Risks

- Overly strict guardrails could block legitimate work (false positives).
- Automations may create noise if we don’t aggregate results cleanly.
- Running Wave 0 proof loops in CI might be slow; we need toggles for smoke vs. full run.

Mitigation ideas captured in THINK.

---

## Success Criteria

1. Compliance monitor script + CI job fails whenever:
   - No daily audit summary exists for the current day.
   - A plan lacking PLAN-authored tests is staged/committed.
   - A new Wave 0/autopilot task lacks verify.md evidence.
2. ProcessCritic tests replicated in CI (and optionally GitHub hook) so bypassing local hooks doesn’t help.
3. Evidence and telemetry summarise compliance status (e.g., daily compliance JSON appended to analytics).
4. TaskFlow autopilot automatically opens remediation tasks when guardrails fail.
