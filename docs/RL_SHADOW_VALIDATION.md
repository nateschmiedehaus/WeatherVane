# RL Shadow Mode Validation – 2025-10-13

This note captures the current evidence for exiting roadmap task `T4.1.8` when the allocator critic remains sandbox-gated.

## Evidence collected
- Ran `python scripts/validate_rl_shadow.py --print-summary` to regenerate and validate the simulation report (`experiments/rl/shadow_mode.json`). The fallback harness enforces the same guardrails as the allocator critic and completed without errors.
- Safety metrics confirmed: baseline fraction `0.20`, max variant fraction `0.50`, guardrail violations `0`, disabled variants `[]`.
- Stress test asserts the risky policy is disabled after a single guardrail breach (`risk_off_disabled = true`) while leaving other variants untouched.
- API surface verified by `PYTHONPATH=.deps:. pytest tests/test_allocator_routes.py -k shadow`, ensuring the FastAPI endpoint serves the refreshed report.

## Outstanding requirement
- The allocator critic remains skipped because the capability profile is constrained (`state/critics/allocator.json`). Continue polling for an elevated profile or obtain stakeholder approval to accept the fallback harness evidence.

## Next actions
1. Re-run the allocator critic when capability gating lifts and attach the passing report to close `T4.1.8`.
2. If access remains restricted, share this note and the regenerated report with product/ML stakeholders for formal sign-off.
