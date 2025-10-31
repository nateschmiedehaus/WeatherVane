## Verify Results — FIX-PERF-QualityChecks (Rev 2)

| Command | Status | Notes |
| --- | --- | --- |
| `npm --prefix tools/wvo_mcp run build` | ✅ | TypeScript project builds cleanly after wiring the new preflight CLI and tests. |
| `npm --prefix tools/wvo_mcp run test -- orchestrator/__tests__/orchestrator_runtime_quality_integration.test.ts scripts/__tests__/preflight.test.ts utils/__tests__/quality_integration_config.test.ts scripts/__tests__/quality_integration_toggle.test.ts scripts/__tests__/quality_checks_dashboard.test.ts` | ✅ | Confirms runtime loads overrides, CLI helpers behave as expected, and regression suites remain green. |
| `node --import tsx tools/wvo_mcp/scripts/benchmark_quality_checks.ts -- --checks preflight --iterations 1 --task FIX-PERF-QualityChecks --output state/evidence/FIX-PERF-QualityChecks/verify/preflight_benchmark` | ✅ | Scoped preflight (ruff exit-zero + web lint/typecheck + vitest smoke) now completes in ≈14 s on a dirty workspace; report stored in evidence. |
| `node --import tsx tools/wvo_mcp/scripts/benchmark_quality_checks.ts -- --checks quality_gates,reasoning --iterations 1 --task FIX-PERF-QualityChecks --output state/evidence/FIX-PERF-QualityChecks/verify/quality_reasoning_benchmark` | ⚠️ | Quality gates stay ≈11 s; reasoning validation fails as expected because this task intentionally lacks completed review artifacts (documented in report for transparency). |
| `node tools/wvo_mcp/scripts/check_performance_regressions.ts` | ✅ | No regression detected; existing baseline remains valid. |
| `node tools/wvo_mcp/scripts/check_determinism.ts --task FIX-PERF-QualityChecks --output state/evidence/FIX-PERF-QualityChecks/verify/determinism_check.json` | ✅ | Determinism smoke passes against the rebuilt dist bundle. |
| `node --import tsx tools/wvo_mcp/scripts/check_structural_policy.ts --task FIX-PERF-QualityChecks --output state/evidence/FIX-PERF-QualityChecks/verify/structural_policy_report.json` | ✅ | Structural policy satisfied after CLI/module updates. |
| `node --import tsx tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task FIX-PERF-QualityChecks --output state/evidence/FIX-PERF-QualityChecks/verify/oracle_coverage.json` | ✅ | Risk→oracle mapping updated (`preflight_scope_mismatch`) and passes coverage enforcement. |
| `node --import tsx tools/wvo_mcp/scripts/check_delta_notes.ts` | ✅ | No unresolved delta notes. |
| `node --import tsx tools/wvo_mcp/scripts/classify_follow_ups.ts --enforce` | ✅ | Follow-up classifier shows no pending items. |
| `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task FIX-PERF-QualityChecks` | ✅ | Evidence set contains the required STRATEGIZE→MONITOR artifacts. |
| `npm --prefix tools/wvo_mcp run validate:roadmap-evidence -- --json > state/evidence/FIX-PERF-QualityChecks/verify/roadmap_evidence_report.json` | ⚠️ | Validator still reports the pre-existing backlog of roadmap entries missing metadata (2,500+ errors); no new regressions introduced by this task. |
