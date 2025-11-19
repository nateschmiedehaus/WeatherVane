# MONITOR - AFP-AUTOPILOT-ARCH-20251119

**Focus:** Track follow-ups and ongoing risks after delivering the alignment doc.

## Items to Monitor
- Integrity suite failures (76 fails, 1 error) across modeling/feature_builder/privacy/MCP tool tests; coordinate with owners before rerun.
- Repository dirtiness blocking PR; need clean branch or guidance to isolate changes.
- Execution metadata gap noted in daily audit (AFP-W0-AGENT-SELF-ENFORCEMENT-20251107 lacking metadata.json); confirm owner action or create follow-up task.
- Adoption of alignment doc: ensure orchestration backlog captures planner/spec/think agent automation and preview/policy hooks.
- Auto-stash artifacts created during push (stash@{0..2}) and permission-denied deletions for `state/logs/*` and `tmp_wave0_state/logs/*`; avoid losing logs and resolve permissions before future auto-pushes.
- Clean-room snapshot `tmp_wave0_state/` left to preserve curated evidence for Wave 0; remove only when no longer needed.

## Next Checks
- Rerun guardrail monitor after any remediation or PR staging to confirm continued pass state.
- Verify integrity tests again once upstream issues addressed.
- Daily Artifact Health audit already logged for 2025-11-19; continue daily cadence.
- Track and execute these follow-ups:
  1. Investigate MCP worker exit during STRATEGIZE (instrument `tools/wvo_mcp/src/worker/worker_manager.ts` and `phase_execution_manager.runPhase` for Codex CLI exits; confirm transcripts/KB files written) before rerunning Wave 0 on canonical state.
  2. Coordinate modeling/QA owners to fix long-standing pytest failures (e.g., `tests/apps/model/test_train_all_tenants_cv.py`, `tests/model/test_baseline_comparison.py`) and rerun `tools/wvo_mcp/scripts/run_integrity_tests.sh` after fixes.
  3. Maintain clean-room `tmp_wave0_state/` until evidence safety confirmed; plan removal once safe.
