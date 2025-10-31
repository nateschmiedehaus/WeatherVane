## Monitor Summary
- Track guardrail health by watching the CI job stages added in `.github/workflows/ci.yml`; loader guard failures surface immediately in CI.
- Re-run `npm run evidence:backfill` after creating new roadmap tasks and attach the resulting report in Verify evidence for those tasks.
- Keep `state/automation/audit_report.json` and related enforcement artifacts refreshed when guard scripts evolve; reviewers should expect updated hashes in future PRs.
