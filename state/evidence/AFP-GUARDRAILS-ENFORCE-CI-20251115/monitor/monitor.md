# Monitor — AFP-GUARDRAILS-ENFORCE-CI-20251115

- **Workflow**: `.github/workflows/guardrails.yml` causes guard check to run on every push/PR.
- **Current status**: guard check fails (missing OWNERS/module manifests). Violations logged to `state/evidence/guardrails/violations.jsonl`.
- **Follow-up**: merge stewardship manifests for `apps/docs/shared/state`; rerun guard check locally before merging this PR.
- **Artifacts**: guardrail run log and violations uploaded as `guardrails-violations` artifact.
