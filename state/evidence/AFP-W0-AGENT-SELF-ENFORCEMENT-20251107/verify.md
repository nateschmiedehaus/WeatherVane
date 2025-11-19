# Verify — Agent Behavioral Self-Enforcement · Block Cheap Workarounds

| Check | Command(s) | Result / Evidence |
| --- | --- | --- |
| Build / TypeScript | `cd tools/wvo_mcp && npm run build` | ✅ `tsc --project tsconfig.json` (5s). Confirms TemplateDetector + PhaseExecutionManager compile cleanly. |
| MCP health (plan_next) | `WVO_STATE_ROOT=$REPO/state node scripts/mcp_tool_cli.mjs plan_next '{"minimal":true}'` | ✅ Returned prioritized tasks list (`correlation_id=mcp:plan_next:87ed2f54-...`). |
| MCP health (autopilot_status) | `WVO_STATE_ROOT=$REPO/state node scripts/mcp_tool_cli.mjs autopilot_status '{"minimal":true}'` | ✅ Reported audit telemetry (no consensus yet). |
| Wave 0 live run | `MCP_REQUEST_TIMEOUT_MS=3600000 LLM_CHAT_TIMEOUT_MS=3600000 LLM_CHAT_MAX_ATTEMPTS=1 WVO_STATE_ROOT=$REPO/tmp_wave0_state npm run wave0 -- --epic=WAVE-0 --once` (x3) | ❌ All attempts acquired the lease but the MCP worker exited ~2 min into STRATEGIZE (`{"level":"warning","message":"MCP server exited with code 0"}`) before TemplateDetector logged results. stdout for the latest attempt: `/tmp/wave0_tmp.log` (includes timestamps + PID 30318). Canonical evidence untouched because runs executed against the cloned state snapshot. |
| Guardrail monitor | `node tools/wvo_mcp/scripts/check_guardrails.mjs` | ❌ Fails `daily_audit_fresh`: latest audit bundle `AFP-ARTIFACT-AUDIT-20251116` is ~93 h old. Other checks (process_critic_tests, rotate_overrides dry-run, wave0_proof_evidence) succeeded. Needs new daily audit. |
| Integrity suite | `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` | ❌ Python pytest suite still red (pre-existing regressions). First failures: `tests/apps/model/test_train_all_tenants_cv.py::test_train_all_tenants_cv`, `tests/libs/geography/test_geography_mapper.py::test_coordinate_roundtrip`, `tests/model/test_baseline_comparison.py::*`, `tests/model/test_mmm_lightweight_bayesian.py::*`, `tests/model/test_mmm_robustness.py::*`. Command ran for ~10 min before pytest reported dozens of `F`s; no new regressions introduced here. |

## Manual Observations

- Reranker evidence + KB persistence confirmed in cloned state (e.g., `tmp_wave0_state/logs/.../kb/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107.json` after fallback).
- No canonical `state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107` files were touched by the automation runs; all changes staged in this commit reflect manual AFP artefacts + code updates.
