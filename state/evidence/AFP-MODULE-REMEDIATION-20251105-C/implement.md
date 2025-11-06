# Implement: AFP-MODULE-REMEDIATION-20251105-C

## Actions Taken
- Added `tools/wvo_mcp/src/orchestrator/feature_gates.ts` with `FeatureGates` facade + snapshot helpers; updated all imports and tests to use extensionless module.
- Implemented `tools/wvo_mcp/src/utils/auth_checker.ts` returning provider auth status, guidance, and proceed/warning helpers.
- Simplified usage-estimator imports (extensionless) and removed obsolete `.js` shims to align TypeScript + runtime resolution.
- Updated Vitest stubs/tests to satisfy new interface contracts and added critic aggregator module.
