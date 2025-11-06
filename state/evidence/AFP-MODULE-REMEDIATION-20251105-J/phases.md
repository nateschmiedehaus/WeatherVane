# AFP-MODULE-REMEDIATION-20251105-J Phase Notes

## STRATEGIZE
- **Problem**: TypeScript tests referencing `FeatureGatesReader` mocks are out-of-sync with the expanded interface, causing TS2740 errors that block builds.
- **Root cause**: Each test defines its own partial stub; new methods added to `FeatureGatesReader` weren’t mirrored.
- **Goal**: Provide a single, fully-typed stub helper and update tests to use it, eliminating duplicated mocks and restoring type safety.

## SPEC
- Create reusable helper exporting a complete `FeatureGatesReader` with override support.
- Update affected tests (`context_assembler.feature_gates.test.ts`, `browser.feature_gates.test.ts`) to use helper.
- Ensure helper lives near orchestrator tests to preserve locality.
- Keep changes within AFP guardrails (≤5 files, ≤150 net LOC).

## PLAN
1. Review existing feature gate interface and current mocks.
2. Add new helper (likely `tools/wvo_mcp/src/orchestrator/__tests__/feature_gate_stub.ts`).
3. Replace inline mocks in both tests with helper usage.
4. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json` to confirm errors resolved.

## THINK
- **Edge cases**: Helper must include all current methods and future defaults; provide sensible fallbacks.
- **Failure modes**: Missing new methods in future – consider exposing underlying snapshot to reduce drift.
- **AFP/SCAS**: Coherence via single stub pattern; economy by deleting duplicate logic.
- **Assumptions**: Only two tests affected; no runtime code depends on these mocks.
