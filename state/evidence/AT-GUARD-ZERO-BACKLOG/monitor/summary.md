## Monitor Summary
- Keep `state/automation/structural_policy_report.json`, `oracle_coverage.json`, and `pr_metadata_report.json` under version control and refresh them when guard logic evolves.
- Track evidence health via `state/automation/evidence_backfill_report.json`; rerun the backfill script when roadmap tasks are added or migrated.
- Ensure future guard regressions trigger delta notes rather than follow-up tasks (reinforced through META-GUARD-SELF-CORRECT).
