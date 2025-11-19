# Review — Agent Behavioral Self-Enforcement · Block Cheap Workarounds

## Quality Assessment

- **Evidence completeness:** STRATEGIZE→DESIGN artefacts now contain real reasoning, mid-execution checks logged for phases 1–5, and IMPLEMENT/VERIFY notes capture every command (build, MCP health checks, Wave 0 attempts, guardrail monitor, integrity suite).
- **Guardrails:** `node tools/wvo_mcp/scripts/check_guardrails.mjs` still reports `daily_audit_fresh: fail` because the last Daily Artifact Health audit (`AFP-ARTIFACT-AUDIT-20251116`) is >24 h old. A follow-up audit bundle must be produced before final approval.
- **Tests:** The consolidated integrity suite already failed prior to this work (multiple model/unit tests marked `F`). No new regressions were introduced by the TemplateDetector/PhaseExecutionManager changes, but the suite remains red and needs separate remediation.
- **Autopilot status:** Reranker injection + TemplateDetector relaxations are implemented, but Wave 0 STRATEGIZE still blocks because the MCP worker exits during the first Codex call. Logs captured for three `npm run wave0 --once` attempts; requires separate investigation into worker lifecycle.

## Reviewer Notes / Next Steps

1. Run the Daily Artifact Health audit for 2025‑11‑19 (`node tools/wvo_mcp/scripts/rotate_overrides.mjs` + publish `state/evidence/AFP-ARTIFACT-AUDIT-20251119/summary.md`) so guardrail monitor can succeed.
2. Investigate MCP worker exit (start from `tools/wvo_mcp/src/worker/worker_manager.ts` health checks and `phase_execution_manager.runPhase` transcript handling). STRATEGIZE never records template metrics, so Codex responses are not getting flushed.
3. Integrity suite failures remain global debt; schedule targeted model/test-fix tasks (`tests/model/test_baseline_comparison.py`, `tests/libs/geography/test_geography_mapper.py`, etc.) to return CI to green.
4. Once Wave 0 completes against the cloned state, rerun the autopilot with the canonical `state/` root to regenerate AI-authored artefacts and capture `state/logs/.../critics/template_*.json`.
