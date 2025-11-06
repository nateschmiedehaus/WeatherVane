# Spec: AFP-MODULE-REMEDIATION-20251105-C

## Requirements
- Restore the missing orchestrator and utils modules so `.js` imports resolve:
  - Provide a feature-gate facade consumed by orchestrator, browser, and guardrail tooling (`FeatureGates` + `FeatureGatesReader`).
  - Provide an authentication checker consumed by workers, orchestrator runtime, and CLI entrypoints (`AuthChecker`).
  - Ensure usage estimator references resolve (bridge or refactor as needed).
- Update dependent code/tests to compile against the restored interfaces.

## Non-Functional Requirements
- Keep implementation within AFP guardrails (≤150 LOC per file, no new deps).
- Prefer deterministic defaults; fall back to live flags/env where data missing.
- Maintain deterministic behaviour in absence of live flags to support unit tests.

## Success Criteria
- All orchestrator/worker entrypoints import the new helpers without `.js` suffixes.
- `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json` reports no missing-module errors tied to these utilities.
- Feature-gate and auth-related Vitest suites execute green with the new modules.
