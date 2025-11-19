# MONITOR - AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107

**Status:** ⚠️ Active follow-up required (Wave 0 proof integration)

## Key telemetry hooks now available
- `state/analytics/phase_kpis.jsonl` → captures per-phase durations + MCP call counts (ingested by Operator Monitor).
- `state/evidence/<TASK>/critic_results.json` → includes Strategy/Thinking/Design/Test/Process verdicts for every automated check (previously empty).
- `tools/wvo_mcp/logs/wave0/*.jsonl` → still highlight missing strategize evidence when TaskExecutor runs against real tasks.

## Outstanding signals to watch
1. **Wave 0 proof failures**
   - Symptom: ProofSystem emits `Proof unproven ... Build discovered` and tasks remain `blocked`.
   - Source: `tools/e2e_test_harness/run_e2e_tests.mjs` output (see VERIFY).
   - Mitigation: Replace the placeholder `TaskExecutor.performImplementation` with the PhaseExecutionManager/llm_chat stack so strategize/spec/plan artefacts exist.
2. **Harness runtime / exit behaviour**
   - With `WAVE0_SINGLE_RUN=1` the suite exits quickly, but the overall `npm test` command is still bound by git hook enforcement (micro-batching rejection). Track the hook logs and consider skipping the auto‑commit when running in CI to avoid misleading timeouts.
3. **Proof gap (E2E-GOL-T1)**
   - Symptom: ProofSystem now runs and reports real discoveries (`Proof unproven for E2E-GOL-T1` with “Build failed”).
   - Source: `e2e_latest.log` + `/tmp/e2e_test_state/logs`.
   - Mitigation: Implement the actual Game-of-Life pipeline or document proof criteria / skip list so ProofSystem can mark it proven.
4. **Integrity bundle / NumPy vendoring**
   - Symptom: `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` aborts with `ImportError: No module named 'numpy._core._multiarray_umath'`.
   - Source: RUN_INTEGRITY log (same as FOUNDATION-FIX-NUMPY-VENDOR-001).
   - Mitigation: Finish the roadmap task to rebuild NumPy wheels or re-point PYTHONPATH away from `.deps/numpy`. Until then TestsCritic will keep seeing a red integrity suite.

## Follow-up plan
| ID | Description | Owner | Status |
|----|-------------|-------|--------|
| W0-E2E-PROOF | Wire `TaskExecutor` into `PhaseExecutionManager` so Wave 0 produces real AFP content (strategize/spec/plan) and proof can succeed. | Codex | 🟡 In progress (blocked harness exposes the gap). |
| W0-E2E-AUTO | Re-run `npm test` inside `tools/e2e_test_harness` once W0-E2E-PROOF merges; require ≥95 % pass rate before declaring "debut complete". | Codex | ⏳ pending proof fix |
| FOUNDATION-FIX-NUMPY-VENDOR-001 | Remove `.deps/numpy` from PYTHONPATH and rebuild the pinned wheel so the integrity bundle can run. | Foundation squad | 🔴 blocking integrity suite |

## Metrics to log post-merge
- Number of blocked Wave 0 tasks per run (expect 0 once proof gap is closed).
- Time to generate each phase (from `phase_kpis.jsonl`) – watch for regressions >30 % vs current delays.
- Critic violation counts – should trend toward 0 for auto-generated evidence.
