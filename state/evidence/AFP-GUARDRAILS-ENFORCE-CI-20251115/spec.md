# Spec — AFP-GUARDRAILS-ENFORCE-CI-20251115

## Deliverables
- `meta/dep_rules.yaml` and `meta/tools_policy.yaml` committed.
- Guardrail script emits violations JSONL file at `state/evidence/guardrails/violations.jsonl`.
- Workflow uploads `guardrails-violations` artifact.
- Evidence directory:
  - `commands.txt` (`node tools/scripts/check_guardrails.mjs`).
  - `violations.jsonl` copy.
  - Summary + monitor describing status.

## Validation
- Run guardrail script locally; capture output & JSONL.
- Lint JSON via `jq`.
- Ensure git status clean after commit.
