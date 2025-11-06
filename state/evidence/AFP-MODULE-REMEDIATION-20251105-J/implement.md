# Implementation Notes

- Added shared stub helper `tools/wvo_mcp/src/orchestrator/__tests__/feature_gate_stub.ts` that materialises a fully-populated `FeatureGatesReader` from a snapshot and optional overrides.
- Updated `context_assembler.feature_gates.test.ts` and `utils/browser.feature_gates.test.ts` to consume the helper instead of handwritten partial mocks.
- Proxy-based override support allows tests to adjust specific methods while keeping the default snapshot in one place.
