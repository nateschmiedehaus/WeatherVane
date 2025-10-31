# MONITOR — Follow-up

- During weekly quality reviews, rerun `collect_phase0_baseline.mjs` + `check_phase0_baseline.ts --window-days 14` and confirm docs still match expected output/paths; update screenshots/command tables if CLI evolves.
- Keep parity/capability cadence accurate: ensure capability sweep schedule and parity CLI examples align with twice-weekly checkpoints; adjust docs when cadence changes.
- Monitor enforcement overrides and baseline freshness from `enforcement_metrics.mjs --json`; if thresholds shift, update troubleshooting escalation guidance immediately.
- Track observer prompt updates (pending) to ensure future documentation references any additional telemetry consumers.
