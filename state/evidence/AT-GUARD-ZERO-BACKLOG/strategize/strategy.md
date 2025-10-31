## Strategy: Close guardrail enforcement backlog

### Why now
- Integrity harness and CI reported repeated failures across structural policy, risk-oracle coverage, PR metadata, and review audit despite loader fix.
- Guardrail rollout requires a zero-deferral policy; outstanding failures block Phase 0 readiness.

### Problem framing
- Individual guard scripts succeed when run with the correct inputs, but automation lacked consistent wiring (`--map` flag, consolidated runs).
- Evidence artifacts were missing, preventing WorkProcessEnforcer from proving compliance.

### Approach
- Standardize invocation arguments and surface them in both CI and integrity harness.
- Capture outputs under `state/automation/` so Verify/Monitor phases can assert parity.
- Document the enforcement sweep to discourage deferrals.
