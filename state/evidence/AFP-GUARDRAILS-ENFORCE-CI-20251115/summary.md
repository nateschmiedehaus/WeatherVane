# Summary — AFP-GUARDRAILS-ENFORCE-CI-20251115

- Restored `meta/dep_rules.yaml` and `meta/tools_policy.yaml` with minimal governance defaults.
- Updated guardrail script to emit violations JSONL; local run highlights missing stewardship manifests.
- CI workflow `.github/workflows/guardrails.yml` now uploads `guardrails-violations` artifact and fails if guard check reports issues.
