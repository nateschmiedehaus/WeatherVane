# Think Phase

## Risks & Mitigations
- **Python bootstrap failure**: wheel cache missing or incompatible; set `INTEGRITY_PREFER_WHEELS=0` fallback, document time cost.
- **Telemetry scripts require secrets**: some dashboards may expect credentials; verify they support local mode (`--json-only`) and capture warnings as acceptable.
- **Long runtime**: script touches multiple suites (pytest, vitest, smokes). Plan adequate time; if stage duration excessive, note in monitor.
- **Environment contamination**: script modifies `state/automation`; ensure artifacts collected but avoid git commits.
- **Partial failure**: if single stage fails (e.g., `app_smoke_e2e.sh` needing services), decide whether to fix or escalate.

## Key Questions
- Does WorkProcessEnforcer telemetry surface in the generated logs? → check `state/automation` outputs for enforcement counters.
- Are there pre-existing failures in script? → review prior runs if available (`state/automation` logs) before executing.

## Mitigation Steps
- Run script with `tee` to capture logs even on failure.
- Prepare to rerun individual failing stages manually if necessary (e.g., re-run vitest) for diagnostics.
- After execution, ensure large generated files (videos) not duplicated unnecessarily; reference rather than copy if required.
