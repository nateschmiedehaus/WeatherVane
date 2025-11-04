# Monitor — INTENT-GUARD-ENFORCE-20251113

- **PR**: https://github.com/nateschmiedehaus/WeatherVane/pull/10 (open).
- **Workflow**: `.github/workflows/guardrails.yml` now runs `npm ci` + `npm run check:guardrails` on push/PR.
- **Script Outcome**: current run surfaces missing stewardship manifests for `apps/docs/shared/state` (see `verify/check_guardrails.txt`); matches triage blockers.
- **Follow-up**: once stewardship manifests land (INTENT-APPS-STEWARDSHIP-20251114 et al.), guard check should pass and workflow will turn green.
- **Monitoring**: keep PR open until steward manifests PRs merge; rerun guard check locally before merge.
