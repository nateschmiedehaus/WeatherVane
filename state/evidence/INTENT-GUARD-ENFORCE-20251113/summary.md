# Summary — INTENT-GUARD-ENFORCE-20251113

- Added `tools/scripts/check_guardrails.mjs` and npm script `check:guardrails` to verify dep/tools policy files and stewardship manifests.
- Configured GitHub workflow `.github/workflows/guardrails.yml` to run `npm ci` and the guardrail check on push/PR.
- Guardrail check currently reports missing OWNERS/module files for several modules (apps/docs/shared/state); logged for follow-up micro-PRs.
