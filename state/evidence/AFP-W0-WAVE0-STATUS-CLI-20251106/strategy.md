# Strategy Analysis — AFP-W0-WAVE0-STATUS-CLI-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Purpose

Provide a reliable way to answer “is Wave 0 actually doing anything right now?” without spelunking through multiple logs or running privileged process listings. This unlocks faster triage, tighter VERIFY loops, and fewer escalations when autopilot appears idle.

---

## Hierarchical Context

Checked READMEs and docs before analysis:
- ✅ `state/epics/WAVE-0/README.md` – Restates that WAVE‑0 focuses on stabilising the autopilot foundation and proof loop. Content is still skeletal, highlighting the lack of operational instrumentation.
- ❌ `state/milestones/W0.M1/README.md` – File not present; milestone documentation gap noted.
- ✅ `docs/workflows/AFP_REVIEWER_ROUTINE.md` – Documents current reviewer + Wave 0 workflow; currently tells operators to run `ps aux | grep wave0` and inspect `state/analytics/wave0_runs.jsonl` manually.
- ✅ `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md` – Outlines required telemetry artifacts (wave0_runs.jsonl, proof logs) but no tooling to summarise them.
- ✅ `tools/wvo_mcp/README.md` – Confirms Wave 0 is part of the MCP toolchain; no status CLI exists.

Key insight: guardrails require Wave 0 evidence, yet the workflow forces humans to collect it by hand, which is both slow and error‑prone.

---

## Problem Statement

Operators must inspect multiple files (`state/.wave0.lock`, `state/analytics/wave0_runs.jsonl`, `state/analytics/supervisor_lifecycle.jsonl`) and run privileged `ps` commands just to know whether Wave 0 is running or has executed a task recently. This takes several minutes, is easy to miss (lockfile may be stale), and does not provide a concise answer for stakeholders.

**Stakeholders**
- Atlas / reviewers: waste time validating Wave 0 evidence and may block tasks due to uncertainty.
- Director Dana & autopilot SREs: lack real-time signal to decide whether to restart, investigate, or let Wave 0 soak.
- Builders: cannot quickly demonstrate compliance with Wave 0 verification steps during PLAN/VERIFY.

---

## Root Cause Analysis

1. **No status surface** – Repository lacks any CLI or dashboard summarising Wave 0 telemetry. Evidence: no references to `wave0_status` or similar in repo; docs instruct manual steps only.
2. **Manual log parsing** – Telemetry is spread between JSONL files with no aggregation. Operators must open them manually; there is no canonical “last run” statement.
3. **Process visibility depends on `ps`** – Guardrails instruct `ps aux | grep wave0`, which already required escalated permissions in this environment. This blocks automation and slows humans.
4. **Resulting behaviour** – Questions like “is it doing anything?” become ad-hoc Slack/agent asks, stealing cycles from actual AFP work and delaying remediation loops.

Evidence: recent session needed multiple commands (tail, ps, manual lock inspection) just to answer the question. Similar guidance repeated in `docs/workflows/AFP_REVIEWER_ROUTINE.md` and `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`, confirming the lack of tooling is systemic.

---

## Current State vs Desired State

**Current State**
- Determining Wave 0 status requires manual `ps` (sometimes blocked) plus hand-parsing JSONL files.
- No single command or artifact summarises lock health, process uptime, and latest tasks.
- VERIFY plans cannot reference an automated status command, so compliance evidence is inconsistent.

**Desired State**
- A single repo-native command outputs Wave 0 runner state (lock + PID health) and the most recent task executions (human-readable + JSON for scripts) within seconds.
- Docs point to that command so agents consistently capture the same evidence during PLAN/VERIFY.
- Script runs without elevated permissions by relying on lockfiles and telemetry already committed to the repo.

**Gap**
- Time to answer status: ~5–7 minutes today vs ≤10 seconds with a CLI (≈30x faster).
- Evidence consistency: ad-hoc vs standardised output that can be attached to `state/evidence/<TASK>/verify.md`.
- Risk: stale lock files currently mislead operators; CLI can flag stale locks and recommend cleanup.

---

## Success Criteria

1. `./wave0_status` (or equivalent) reports runner status, lock freshness, and the last ≥3 Wave 0 task executions within 1 second on local hardware.
2. Command exposes a `--json` flag so scripts/agents can capture structured evidence without scraping text.
3. Documentation (`docs/workflows/AFP_REVIEWER_ROUTINE.md`) references the new command in the Wave 0 procedure.
4. Automated test coverage exists for the status collector, including stale-lock detection and log parsing edge cases (validated via `node --test tests/wave0_status.test.js` or equivalent).

---

## Impact Assessment

- **Efficiency:** Reduce Wave 0 triage time by ~5 minutes per inquiry. Even one check per task saves >30 minutes per review cycle.
- **Quality:** Consistent telemetry output lowers false alarms (“Wave 0 is idle”) and highlights real issues faster (stale lock, no recent runs).
- **Risk:** Early detection of stuck runners prevents backlog growth and ensures AFP VERIFY steps remain trustworthy.
- **Strategic:** Establishes a reusable pattern for other autopilot health commands (Wave 1+, critics, etc.) without waiting for external dashboards.

If we do nothing, each future agent must repeat the same manual spelunking, Wave 0 evidence remains diffuse, and compliance checks will continue to require elevated shell commands that may be disallowed. This wastes time and undermines confidence in the autopilot telemetry.

---

## Alignment with AFP/SCAS

- **Via Negativa:** Deletes repeated manual instructions (“tail this log, run ps…”) by replacing them with one command; prevents unnecessary restarts triggered by guesswork.
- **Refactor vs Repair:** Addresses the root cause (lack of status surface) rather than adding more checklist text. We’re building a reusable telemetry reporter instead of another reminder.
- **Complexity Control:** Adds ~1 small script + test while simplifying the operational workflow. Complexity decreases overall because humans stop duplicating effort and the script centralises parsing logic.

The task therefore aligns with AFP’s emphasis on measurable guardrails, rapid feedback, and evolutionary improvements that enable autonomy.
