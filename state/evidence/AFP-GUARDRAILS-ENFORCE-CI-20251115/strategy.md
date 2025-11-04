# Strategy — AFP-GUARDRAILS-ENFORCE-CI-20251115

## Objective
- Ensure dependency and tools policies exist and are enforceable.
- Begin publishing guardrail violations for Adaptive Budgets.

## Approach
1. Restore `meta/dep_rules.yaml` and `meta/tools_policy.yaml` with minimal defaults.
2. Extend guardrail script to emit `state/evidence/guardrails/violations.jsonl`.
3. Update guardrail workflow to archive violations artifact.
4. Record evidence under `state/evidence/AFP-GUARDRAILS-ENFORCE-CI-20251115/verify/`.

## Constraints
- ≤ 2 new files; minimal LOC.
- No suppression lists; prefer fail-fast reporting.

## Exit
- Guardrail script reports missing stewardship, but publishes JSONL.
- Workflow upload artifact; summary + monitor detail next remediation steps.
