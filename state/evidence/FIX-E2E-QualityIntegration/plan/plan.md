# Plan — FIX-E2E-QualityIntegration

1. **Research harness options**
   - Inspect existing WorkProcessEnforcer tests (e.g., state_graph_work_process_enforcement) for reusable fixtures.
   - Identify minimal set of dependencies (metric collector, roadmap node, task model).
2. **Design test scaffolding**
   - Create helper to set up temp workspace with script fixtures (pass/fail) shared with integration tests.
   - Create stub WorkProcessEnforcer environment (or reuse existing test helper) to run phases.
3. **Implement tests**
   - Scenario A: enforce mode, all checks pass — expect no rejection, confirm telemetry and successful transitions.
   - Scenario B: enforce mode, failing quality gate — expect rejection, block transition, recordProcessRejection spy called, telemetry flagged.
   - Scenario C: observe mode with failing script — expect no block, but warnings/telemetry.
4. **Run targeted Vitest suite**
   - `npm --prefix tools/wvo_mcp run test -- orchestrator/__tests__/[new_e2e_test].ts`
5. **Policy checks**
   - `node --import tsx tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task FIX-E2E-QualityIntegration ...`
   - `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task FIX-E2E-QualityIntegration`
6. **Update evidence & roadmap**
   - Populate VERIFY/REVIEW/PR/monitor docs, set task to `done` in roadmap with produces/consumes metadata.
