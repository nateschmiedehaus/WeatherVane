# AFP-MODULE-REMEDIATION-20251105-G Phase Notes

## STRATEGIZE
- **Problem**: Autopilot orchestration regressed after module pruning; TypeScript build now fails (TS2307) because `executor/command_runner` module is missing, breaking critic execution, session shell commands, and ML meta-critic fallback.
- **Root cause**: Previous cleanup removed the command runner and associated inventory reporting without rebuilding a guardrailed replacement. Missing module coverage is ad-hoc, so regressions surface late.
- **Goal**: Deliver a hardened command runner aligned with AFP guardrails and re-establish an automated, hierarchical inventory of missing modules focused on Autopilot surfaces (no WeatherVane tasks), so gaps surface early and remediation can be scheduled autonomously.

## SPEC
- Restore `runCommand` with guardrail enforcement (allow-list, workspace safety, tracing, dry-run awareness) returning `CommandResult` and surfacing guardrail violations as first-class errors.
- Update all Autopilot imports/tests to use the restored module without `.js` suffix ambiguity and keep runtime compatibility.
- Extend the module index generator to emit an automated missing-module inventory grouped by subsystem (executor, critics, orchestrator, etc.) and persist it under `state/analytics`, ensuring follow-ups stay Autopilot-only.
- Refresh `followups.md` so the new remediation task is tracked and future subtasks can be appended without manual approval, keeping AFP/SCAS separation from WeatherVane scope.
- Keep within ≤5 source files touched and ≤150 net LOC while preferring reuse of existing patterns (e.g., guardrails + tracing).

## PLAN
1. Review existing executor guardrails and tracing helpers to mirror behaviour in new command runner; study graveyard reference for baseline expectations.
2. Implement `src/executor/command_runner.ts` that enforces guardrails, captures telemetry via `withSpan`, respects optional environment/timeout, and normalizes outputs.
3. Update critic + session imports/tests to reference the new module (extensionless) and adjust mocks.
4. Enhance `scripts/generate_module_index.ts` to also run a TypeScript compile scan, capture missing-module diagnostics, aggregate them by subsystem, and emit Markdown/JSON inventory under `state/analytics/inventory/`.
5. Update `followups.md` to register task `AFP-MODULE-REMEDIATION-20251105-G` as active so enforcement tooling sees it.
6. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json` and rerun module inventory to verify zero missing modules, attaching outputs to evidence.

## THINK
- **Edge cases**: Guardrails must treat dry-run (fail on writes) and escalate disallowed commands with clear messaging. Command runner should sanitize workspace path, propagate stderr/stdout even on failures, and map `execa` failures into `CommandResult` for critics expecting rejections.
- **Failure modes**: Inventory generation could fail if `tsc` command exits non-zero; script should still emit diagnostic file with errors captured. Need to ensure directories exist before writing to state.
- **AFP/SCAS validation**: Reuses existing guardrail abstractions (coherence), enforces allow-list (economy via no new capabilities), keeps executor concerns localized (locality), surfaces guardrail violations explicitly (visibility), and records inventory to measure new pattern fitness over time (evolution).
- **Assumptions**: `execa` already a dependency; TypeScript output format stable enough to parse error code + path; writing to `state/analytics` acceptable for automation outputs.
