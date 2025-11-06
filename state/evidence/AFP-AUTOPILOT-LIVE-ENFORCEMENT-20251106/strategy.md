# Strategy Analysis — AFP-AUTOPILOT-LIVE-ENFORCEMENT-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Purpose

Autopilot tasks (e.g., supervisor integration) shipped without running Wave 0 live loops despite policy intent. We must close the gap with documentation and mechanical enforcement so every autopilot feature plans and executes a live Wave 0 test before VERIFY.

---

## Problem Statement

**Problem:** Autopilot feature tasks can currently complete with only unit tests or build checks; live Wave 0 validation is optional in practice. PLAN documents often defer tests (“deferred to future”), and nothing blocks commits when autopilot code changes without updating PLAN.

**Stakeholders:** Autopilot agents (need reliable guardrails), reviewers, leadership expecting real autonomy proof, downstream users relying on supervisor/agent orchestration.

---

## Root Cause Analysis

- Policy lives only in text; no critic enforces Wave 0 live testing.
- ProcessCritic ensured tests exist, but not that autopilot tasks list live Wave 0 steps.
- No hook forces plan updates when touching autopilot code; tasks can merge without Wave 0 evidence.

Evidence:
- `state/evidence/AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION/plan.md` lacked Wave 0 steps.
- Task transcript showed supervisor integration incomplete despite “integration” status.
- No critic references Wave 0 keywords or autopilot directories.

---

## Current vs Desired State

**Current:**
- PLAN may contain placeholder or deferred tests for autopilot work.
- Commits touching `autopilot_mvp/` or `wave0/` can merge without updating PLAN.
- Documentation mentions Wave 0 in passing, but enforcement is manual.

**Desired:**
- PLAN for any autopilot task lists explicit Wave 0 live run steps (commands + telemetry).
- Pre-commit/MCP critic blocks commits touching autopilot code unless plan updates staged.
- Process docs clearly state “live Wave 0 test required” and VERIFY executes those steps.
- Existing supervisor integration plan updated to include live testing instructions.

**Gap:** Lack of mechanical guardrail and authoritative documentation.

---

## Success Criteria

1. ProcessCritic fails when PLAN defers/omits Wave 0 steps for autopilot tasks.
2. ProcessCritic fails when autopilot code staged without plan updates.
3. Docs (AGENTS, checklists, Claude guide, verification loop) explicitly mandate Wave 0 live testing.
4. Supervisor integration PLAN updated with explicit live loop steps.
5. Vitest + manual smoke demonstrate critic behaviour.

---

## Impact Assessment

- **Quality:** Guarantees every autopilot feature validates end-to-end behaviour, not just builds.
- **Risk Reduction:** Prevents “integration” claims without actual Wave 0 runs.
- **Operational Guardrail:** Agents are blocked early with actionable errors.
- **Strategic:** Aligns with autonomy goals; leadership receives trustworthy evidence.

---

## Via Negativa / Simplification

- Reuse ProcessCritic rather than new system; extend heuristics.
- Avoid additional frameworks; leverage existing pre-commit hook and CLI.

---

## Risks & Mitigations

- False positives (non-autopilot docs mention “autopilot”). → Combined keyword detection + docs-only exemption.
- Keyword drift (new scripts). → Document list location and update process.
- Performance slowdown. → Cache plan docs, short-circuit when no staged diffs.
- Developers bypass hook. → Critic runs server-side via `critics_run`.

---

## Dependencies & Constraints

- Git staged info accessible (same as ProcessCritic).
- Wave 0 commands documented and stable.
- Pre-commit must remain lightweight (<2s target).
- Touches >5 files (docs + guardrail) but required to keep policy consistent.

---

## Recommendation

Proceed immediately—this is a safety-critical policy hole. Implement ProcessCritic enhancement, update docs/templates, and patch supervisor plan so the requirement is living and enforced.

---

**Strategy Complete:** 2025-11-06  
**Next Phase:** SPEC
