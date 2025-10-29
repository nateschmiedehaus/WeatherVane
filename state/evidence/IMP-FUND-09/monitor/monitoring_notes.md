# IMP-FUND-09 · Monitoring Notes

- Daily snapshot files are stored under `state/analytics/process_monitoring/` with timestamped names.
- Review snapshots after each daily run; confirm counts remain stable before promoting to Phase 1.
- If counts spike (e.g., `phase_skips_attempted` > 0), investigate WorkProcessEnforcer regressions.
- After 1-2 weeks of clean snapshots, document readiness to proceed to Phase 1 in roadmap/decision journal.
