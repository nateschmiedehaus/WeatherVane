# SPEC - AFP-AUTOPILOT-ARCH-20251119

**Task:** Autopilot AFP-to-agent architecture mapping  
**Date:** 2025-11-19  
**Phase:** SPEC  
**Author:** Codex

## Acceptance Criteria (Must)
1. Architecture doc exists under `docs/orchestration/` mapping all 10 AFP phases to agent roles, tools/critics, sandboxes/policies, inputs/outputs, and telemetry/evidence pathways.
2. Comparison matrix clearly contrasts ideal autonomous setup vs current instituted process (guardrails, critics, Wave0 expectations) with at least 5 prioritized gaps and recommended actions/owners/time horizons.
3. Plan includes deployment/validation hooks for web changes (preview env expectation, integrity tests, Wave0 live testing references) to keep alignment with existing guardrails.
4. Task evidence complete: AFP phase docs (strategy/spec/plan/think/design/implement/verify/review/monitor) recorded for this task with critics executed where required.

## Should Have
1. Phased rollout recommendation (near/mid-term) with risk mitigations and metrics to watch.
2. Policy/secret and FS guardrail alignment recommendations (allow/deny lists, PII/CVE scans) explicitly tied to VERIFY.
3. Via-negativa opportunities called out (what manual ceremony could be deleted once automation lands).

## Could Have
1. Hooks for cost/latency budgeting or token pressure visible to orchestrator.
2. Example agent loop for one phase (e.g., PLAN or VERIFY) to illustrate automation pattern.

## Non-Functional Requirements
- Keep footprint lean (target ≤5 non-evidence files touched; ≤150 net LOC across non-evidence code/docs).
- Maintain ASCII text; keep doc skimmable with tables/bullets.
- Respect AFP guardrails: no bypasses, critics run, daily audit fresh, guardrail monitor passes.

## Out of Scope
- Implementing the automation itself (code changes to Wave0/autonomous_runner).
- Changing roadmap intake or policy enforcement logic beyond recommendations.

## Assumptions / Dependencies
- Existing guardrail scripts available: `tools/wvo_mcp/scripts/run_integrity_tests.sh`, `node tools/wvo_mcp/scripts/check_guardrails.mjs`, Wave0 live testing (`npm run wave0`).
- Current process constraints (≤5 files, ≤150 net LOC) remain in force for implementation phases; plan should respect or propose split when required.
