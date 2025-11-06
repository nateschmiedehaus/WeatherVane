# STRATEGIZE — AFP-OVERRIDE-ROTATION-20251106

**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)  
**Template:** Strategy v1.0

---

## Purpose

We just restored discipline around tracking overrides and evidence, but the override ledger (`state/overrides.jsonl`) will keep growing and the repo can easily accumulate new untracked artifacts. This remediation task ensures we have a durable mechanism—both process and tooling—to rotate override logs and audit artifacts on a cadence so the problem does not recur.

---

## Problem Statement

- Override entries append forever; no pruning or archival plan.
- No automated reminder or tooling to perform daily artifact health checks.
- Without structure, agents might truncate override logs manually or forget to audit evidence, reintroducing drift and undermining AFP/SCAS compliance.

**Goal:** Deliver a maintainable rotation workflow plus scheduled audits so override history remains reviewable without bloat and the workspace stays clean.

---

## Current State & Evidence

- `state/overrides.jsonl` currently has 11 entries (small but unbounded).
- Doc updates now mandate Git discipline, yet there is no operational owner for periodic verification.
- Prior tasks (AFP-LEGACY-ARTIFACTS-20251106) flagged rotation/audit follow-up in review.

---

## Desired Outcomes

1. Automated or documented procedure to rotate overrides (e.g., archive monthly to timestamped files under `state/analytics/overrides/`).
2. Scheduled **daily** artifact health audit (every ≤24 hours) with checklist + task template so critics can enforce it.
3. ProcessCritic (or similar) awareness of rotation/audit completion, preventing agents from bypassing; failure if latest daily audit >24h old.

---

## Constraints & Assumptions

- Must stay within AFP guardrails (≤5 files/≤150 LOC per change set).
- Rotation must not destroy historical data; archival needs to be lossless and reviewable via Git.
- Daily audit should integrate with existing tooling (`tools/wvo_mcp/scripts/...`) or roadmap processes and be automatable (manual fallback acceptable).

---

## Success Metrics

- Override ledger never exceeds configurable threshold before rotation kicks in.
- Every 24 hours produces a committed audit artifact summarizing state/evidence inventory status.
- ProcessCritic or Git hook fails when rotation/audit evidence missing for the last 24-hour window.

---

## Risks

- Over-rotating could fragment history and make investigations harder.
- Missing automation may leave rotation manual—agents forget to run it.
- Critics may become too strict, blocking unrelated work if audit artifacts lag.

Mitigations captured in THINK phase.

---

## Next Steps

1. SPEC: Define acceptance criteria for rotation cadence, archival format, and audit deliverables.
2. PLAN: Outline tooling updates (scripts + critic enforcement + documentation).
3. THINK: Stress-test for failure modes (e.g., concurrent rotations, missing credentials).
4. DESIGN: Confirm architecture and via negativa (reuse existing log rotation scripts if possible).
