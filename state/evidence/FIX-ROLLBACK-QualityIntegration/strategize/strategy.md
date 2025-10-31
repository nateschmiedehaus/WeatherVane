# Strategy — FIX-ROLLBACK-QualityIntegration

## Mission Connection / Why Now
- Quality integration is now wired directly into the work loop; once it flips to enforce/observe, runaway failures without an explicit kill-switch jeopardise the "fully autonomous" charter. We need deterministic rollback so operations can keep autonomy online while we remediate.
- Roadmap exit criteria demand a documented rollback plan before guardrails roll out broadly. Delivering this now keeps Mission 01 aligned with the "no hidden regressions" principle.

## Reality Check / Current State
- WorkProcessEnforcer instantiates the integration when a config object is provided. Today there is no runtime override—disabling quality checks requires code edits.
- Telemetry from `state/analytics/*.jsonl` exists but there’s no consolidated view or success-rate threshold for operational decisions (e.g., success rate <85%).
- There is no documented command sequence for disabling/re-enabling the integration, leaving operators with ad‑hoc manual steps.

## Strategic Options Considered
1. **Hard-code env flag checks inside WorkProcessQualityIntegration** — simple but opaque; encourages snowflake behaviour across environments.
2. **Introduce config file + toggle CLI** — explicit, auditable, plays nicely with automation and evidence capture; enables both disable and re-enable flows.
3. **Route through LiveFlags** — fits existing gating but adds latency (flag propagation) and risks stale cached state unless we add cache invalidation.
4. **Keep manual instructions only** — no change risk, but contradicts Mission 01 acceptance criteria (script + test) and keeps rollback brittle.
5. **Integrate rollback into ResilienceManager** — future-proof but overkill for immediate need; adds cross-component coupling.

## Chosen Direction
- Implement a persisted override (`state/config/quality_integration.json`) with defaults that keep quality checks enabled in shadow/enforce, so autopilot boots with guardrails on.
- Provide a CLI (`quality_integration_toggle.ts`) that writes the override (`--disable`/`--enable`), satisfying “rollback script” + “re-enable procedure”.
- Extend OrchestratorRuntime to load overrides and pass structured config into WorkProcessEnforcer.
- Add a monitoring command that summarises success rates from `preflight/quality_gates/reasoning` logs, producing `state/analytics/quality_checks_dashboard.json`. This anchors the "<85% success rate" trigger in data.
- Document the full decision tree (triggers, rollback steps, verification after rollback, re-enable). Update WORK_PROCESS docs to mention the script + dashboard.

## Risks & Kill Signals
- **Config drift**: new file could fall out of sync if multiple scripts touch it. Mitigation: tests around load/save + CLI handles both enable/disable.
- **Operators forget to re-enable**: documentation must include re-enable command, and monitor should expose current state. Consider linking to live flag / config in dashboard output.
- **Telemetry gaps**: if the dashboard sees no data (e.g., logs missing), rollback trigger logic might misfire. We’ll surface warnings in the report and mark status as "insufficient data".
- **Performance**: enabling integration by default increases runtime. Accept for now; Mission 01 performance slice already captured the current baseline and highlighted preflight cost.

## Success Criteria
- Operators can run a single command to disable quality checks and another to re-enable, without editing code.
- Dashboard script returns success-rate stats and flags when rates drop below 85%.
- Documentation clearly states when to rollback, how to execute, how to verify rollback, and how to re-enable once fixes land.
