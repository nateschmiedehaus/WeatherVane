## Analysis
- `check_risk_oracle_coverage.ts` requires either `--map` or `--task`; CI invoked it without either, causing ENOENT.
- Integrity harness skipped structural/policy checks entirely, so regressions surfaced only in ad-hoc review.
- Running guards in isolation works; bundling them ensures delta notes remain inside the originating task.
- Running the full integrity suite is expensive, so targeted guard scripts provide faster feedback while the suite runs asynchronously.
