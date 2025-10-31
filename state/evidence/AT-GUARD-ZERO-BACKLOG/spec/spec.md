## Spec: Guardrail enforcement sweep

### Scope
- Run structural policy, risk-oracle coverage, PR metadata, and review audit scripts with explicit output targets.
- Wire risk-oracle coverage to the canonical `state/risk_oracle_map.json` file.
- Ensure `run_integrity_tests.sh` executes the same guard set.
- Capture logs in `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` and ensure `state/automation/*.json` artifacts exist.

### Out of scope
- Updating individual guard logic beyond argument fixes.
- Remediating unrelated CI jobs (e.g., Python tests) unless they block the guard sweep.
