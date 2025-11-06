# Design: AFP-MODULE-REMEDIATION-20251105-C

## Feature Gates
- Wrap `LiveFlagsReader` with `FeatureGates` providing strongly typed helpers (prompt mode, sandbox mode, scheduler, toggles, numeric gates).
- Expose a `FeatureGatesSnapshot` for diagnostics/export.
- Normalize string flags via helper functions (`truthy`, `toNumber`) with sensible defaults (compact prompt, legacy scheduler, research layer enabled).

## Auth Checker
- Provide `AuthChecker` class returning provider status summary (`codex`, `claude_code`).
- Heuristics: check env-provided directories (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`) and `state/accounts.yaml` contents.
- Surface guidance + warnings so callers can inform users; allow progress when at least one provider authenticated.

## Usage Estimator References
- Prefer extensionless imports so TypeScript resolves `.ts` modules directly; remove legacy `.js` shim.

## Testing Strategy
- Re-enable Vitest suites covering feature gating (`feature_gates.test.ts`, context + browser variants) and aggregator critic tests after type refactors.
- TypeScript compile as regression check (known outstanding modules noted for future subtasks).
