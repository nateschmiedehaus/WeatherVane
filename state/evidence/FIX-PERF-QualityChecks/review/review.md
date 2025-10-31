# Review Notes — FIX-PERF-QualityChecks (Rev 2)

- Verified the new preflight CLI is the only entrypoint (`scripts/preflight_check.sh` delegates) and that WorkProcessEnforcer consumes the scoped JSON output + caching without regression.
- Benchmarks show preflight now runs in ≈14 s with scoped commands (ruff exit-zero, web lint/typecheck, vitest smoke); quality gates remain ≈11 s and reasoning benchmark continues to report missing artifacts as expected for this task.
- Documentation for operators (WORK_PROCESS, QUALITY_INTEGRATION_TROUBLESHOOTING, CLAUDE.md) now references the CLI (`--status`, `--full`) and explains how scope detection works.
- Risk oracle map updated (`preflight_scope_mismatch`) and all policy checks (determinism, structural policy, performance regression, delta notes, follow-up classifier) succeeded.
- Roadmap evidence validator still flags the historical backlog of tasks lacking evidence metadata; no new regressions from this change—tracked in VERIFY results as an outstanding repo-wide issue.
