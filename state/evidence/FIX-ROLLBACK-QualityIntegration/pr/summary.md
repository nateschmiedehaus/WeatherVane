# PR Summary

- Wire `OrchestratorRuntime` and `OrchestratorLoop` to load the persisted quality-integration override and initialize `WorkProcessEnforcer` with the correct telemetry + config.
- Extend `quality_checks_dashboard.ts` with a `--status` option for human-readable summaries and document the correct CLI paths in the rollback playbook.
- Add unit coverage for the runtime override handling.
