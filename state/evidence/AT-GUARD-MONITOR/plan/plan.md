## Plan
1. Collect recent automation artifacts: `state/automation/{audit_report.json,structural_policy_report.json,oracle_coverage.json,pr_metadata_report.json}`.
2. Execute evidence validators (`npm run validate:roadmap`, `npm run validate:roadmap-evidence -- --json`).
3. Re-run `check_work_process_artifacts` for guardrail tasks to ensure evidence integrity.
4. Review latest CI run (or local equivalent) to confirm guardrail stages succeed; note results.
5. Document findings in `verify/results.md` and `monitor/monitor.md`; summarize in review notes.
