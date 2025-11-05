# Plan – Task 13 OUTCOME-LOG (2025-11-05)

1. **Codebase Recon (Think Prep)**
   - Inspect existing telemetry helpers (`appendToJSONL`, if missing create).
   - Document available fields in `AgentCoordinator.handleExecutionResult`, `QualityMonitor`, `ExecutionOutcome`.
   - Audit `task.metadata` usage to understand where estimates may live.

2. **Module Scaffolding**
   - Create `tools/wvo_mcp/src/analytics/` directory if absent.
   - Implement `task_outcome_logger.ts` with interfaces, normalization helpers, and `logTaskOutcome()` (fs append + workspace root detection).
   - Add associated unit tests under `tools/wvo_mcp/src/analytics/__tests__/`.

3. **Outcome Builder Integration**
   - Add helper(s) near orchestrator (e.g., `buildTaskOutcome` inside a new file) to translate orchestrator state into `TaskOutcome`.
   - Extend `AgentCoordinator.handleExecutionResult` to gather metadata, compute budgets, call builder, and log outcome behind `FeatureGates.isOutcomeLoggingEnabled()`.
   - Ensure function remains readable (extract sub-functions when necessary).

4. **CLI Analyzer**
   - Create `tools/wvo_mcp/scripts/analyze_outcomes.ts` (tsx) to stream JSONL and print success metrics.
   - Add npm script `analyze:outcomes` hooking into the new CLI.

5. **Validation**
   - Update feature flag definitions (`feature_gates.ts`) and document env var.
   - Run targeted unit tests + `npm run lint -- --quiet` + `npm run build`.
   - Craft sample JSON entry (by invoking builder in test or manual harness) and capture analyzer output into evidence directory.

6. **Evidence & Wrap-up**
   - Summarize outcomes, note any unresolved fields (e.g., guardrail adjustments) for future tasks.
   - Prepare next steps for Task 14 if no blockers.

