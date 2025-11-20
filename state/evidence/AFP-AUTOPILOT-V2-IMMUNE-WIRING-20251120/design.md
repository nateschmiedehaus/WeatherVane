# Design: AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

## Context
Gatekeeper exists but not wired into git/CI workflow. Need to enforce branch protection, commit regex, and CI gate per ARCHITECTURE_V2 Immune System.

## Five Forces
- Coherence: reuse gatekeeper + existing scripts.
- Economy: minimal hook/integration; no new deps.
- Locality: touch immune scripts/tests only.
- Visibility: clear logs on allow/block.
- Evolution: configurable branches/CI command.

Pattern: immune_gate_integration. Leverage: medium. Assurance: tests + guardrail.

## Via Negativa
No deletion possible; wiring required. Keep changes minimal.

## Refactor vs Repair
Refine/wire existing module; additive hooks.

## Alternatives
1) Full git hook scripts (pre-push/commit-msg) — direct enforcement but adds maintenance; acceptable if minimal.
2) Orchestrator-only call — lighter but misses local pushes. Selected: small hook script invoking Gatekeeper; optional CI call.

## Complexity
Low-medium: small script + tests. Mitigate with clear messages and config.

## Implementation Plan
- Add hook/integration script to call Gatekeeper for branch/commit/CI.
- Update/extend gatekeeper tests for new wiring paths.
- Ensure guardrail references Gatekeeper (doc or code).
- Run tests: vitest gatekeeper, guardrail monitor, commit:check, wave0 dry-run (log lock).

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope/LOC within limits
- [x] Tests planned
