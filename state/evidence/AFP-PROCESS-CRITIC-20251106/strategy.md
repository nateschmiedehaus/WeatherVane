# Strategy Analysis — AFP-PROCESS-CRITIC-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Purpose

Provide automated enforcement (ProcessCritic) ensuring PLAN contains authored tests (no placeholders/deferrals) and VERIFY does not introduce new tests without revisiting PLAN. Move the policy from “documentation only” into guardrails that block non-compliant work.

---

## Problem Statement

**Problem:** Agents still stage commits that (a) defer tests (“deferred to future sprint”), (b) mark tests as N/A without justification, or (c) add new tests late with no PLAN update—undermining the PLAN-before-VERIFY policy.

**Stakeholders:** Autopilot agents and reviewers (blocked early instead of discovering gaps during VERIFY), plus downstream teams relying on trustworthy tasks. Council needs a reliable enforcement lever.

---

## Root Cause

Policy updates alone rely on humans; no critic inspects PLAN artefacts or staged tests. Without automation, diligence varies and policies regress.

**Evidence:** 
- Several plan docs contain “deferred unit tests to future,” allowing tasks to proceed without tests.
- `AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION` claimed integration complete but shipped zero supervisor changes.
- Pre-commit currently enforces only files/LOC.

---

## Current vs Desired State

**Current:** Policy documented with manual review; agents can still defer tests or add them post-implementation with no automated guard.

**Desired:** ProcessCritic blocks commits (and MCP runs) when PLAN lacks concrete tests, defers them, or when new tests appear without plan references. Docs explain remediation.

**Gap:** No critic, no CLI integration, no hook, no tests, limited communication beyond AGENTS.md.

---

## Success Criteria

1. Critic flags missing/placeholder/deferral/N/A-without-docs cases.
2. Critic detects new test files lacking PLAN references unless the plan already lists them.
3. Pre-commit + MCP integration returns actionable guidance; agents get blocked before merge.
4. Vitest suite covers pass/fail pathways.
5. Agent docs (AGENTS.md, Claude setup) mention enforcement so no one is surprised.

---

## Impact

- **Quality:** Tests authored before implementation; prevents “integration” tasks with zero code.
- **Risk:** Reduces regression leaks by eliminating late-stage test authoring.
- **Efficiency:** Reviewers spend less time policing policy manually.
- **Strategic:** Enables autonomous enforcement (agents + autopilot) of AFP phases.

---

## Via Negativa / Simplification

- Reuse existing critic infrastructure & pre-commit pipeline.
- Limit scope to presence/timing signals (not deep semantic coverage).

---

## Risks & Mitigations

- False positives: require explicit docs-only justification when marking tests N/A.
- Performance: cache plan docs and short-circuit when nothing is staged.
- Adoption: broadcast enforcement in AGENTS + Claude setup so expectations are clear.

---

## Dependencies

- Access to phase artefacts path conventions.
- Pre-commit hook integration mechanism (existing in repo).

---

## Open Questions

1. How to keep plan cache fresh when multiple tasks staged simultaneously?
2. Should ProcessCritic enforce “files to change” alignment with staged code (potential follow-up)?
3. Do we need configurable allowlists for exceptional cases (e.g., hotfix bypass)?

---

## Recommendation

Proceed with ProcessCritic implementation via structured micro-tasks (design → critic implementation → hook integration → documentation).

---

**Strategy Complete:** 2025-11-06  
**Next Phase:** SPEC
