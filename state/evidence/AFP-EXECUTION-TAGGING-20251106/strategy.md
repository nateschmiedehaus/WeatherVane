# Strategy — AFP-EXECUTION-TAGGING-20251106

**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)  
**Template:** Strategy v1.0

---

## Purpose

We need a reliable way to tell whether a task was completed by Wave 0 autopilot or by a human (manual/interactive mode). Today, evidence bundles look identical regardless of who executed the task, which makes audits and telemetry ambiguous. This strategy introduces an explicit execution-mode tag so compliance tooling, reviewers, and analytics can differentiate automation from manual work.

---

## Problem Statement

- Evidence folders (`state/evidence/<TASK-ID>/`) do not record execution mode.
- Wave 0 tasks appear the same as manually completed tasks.
- ProcessCritic/guardrails cannot enforce different policies for manual vs. autopilot work without knowing the mode.

**Goal:** Provide a lightweight tagging mechanism embedded in the repo so every task clearly states `execution_mode: manual|autopilot`, with Wave 0 tagging itself automatically and humans tagging via a helper script.

---

## Current State

- Wave 0 runner updates roadmap/task status but writes no metadata about execution.
- Manual agents finish tasks and capture verify/review docs but nothing marks them manual.
- No standard metadata file exists in evidence bundles beyond the documents we already collect.

---

## Desired Outcomes

1. `state/evidence/<TASK-ID>/metadata.json` (or equivalent) always contains `execution_mode`.
2. Wave 0 autopilot writes `execution_mode: autopilot` automatically after it completes a task.
3. Manual agents run a simple script to mark `execution_mode: manual`.
4. Docs/checklists reflect the new step so compliance tooling (e.g., guardrail monitor) can enforce it later.

---

## Constraints & Assumptions

- Keep additions minimal (≤5 files per commit, ≤150 net LOC).
- Metadata format should be JSON for easy machine parsing.
- Manual tagging must be ergonomic (single command).
- Wave 0 change should not destabilise existing execution flow.

---

## Risks

- Agents might forget to run the manual tagging script → mitigated by documentation and future guardrail integration.
- Metadata file might collide with other tooling → use simple JSON append/merge logic.
- Wave 0 update must be robust even if metadata file pre-exists or is malformed.

---

## Success Criteria

- Metadata file automatically written/updated during Wave 0 runs.
- Manual script allows quick tagging, with documentation instructing agents to use it.
- Execution mode tag visible in evidence directories and available for future guardrails/analytics.
