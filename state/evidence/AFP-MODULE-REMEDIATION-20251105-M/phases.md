# AFP-MODULE-REMEDIATION-20251105-M Phase Notes

## STRATEGIZE
- **Problem**: `npm run test --prefix tools/wvo_mcp` fails due to outdated expectations in `src/enforcement/__tests__/loc_analyzer.test.ts` after LOC weighting rules changed.
- **Root cause**: Analyzer heuristics (core logic weight, via negativa credit, progressive enforcement thresholds) evolved, but tests still assert legacy values.
- **Goal**: Rebaseline tests to match current analyzer behaviour, ensuring they capture intended guardrails without false positives.

## SPEC
- Inspect analyzer implementation to confirm current multipliers and thresholds.
- Update assertions/fixtures accordingly; prefer deriving expected values via analyzer rather than magic numbers where possible.
- Keep tests meaningful (verify credits/debits, thresholds, AC scenarios).

## PLAN
1. Review `loc_analyzer.ts` to record current weights.
2. Run individual test (`npx vitest run src/enforcement/__tests__/loc_analyzer.test.ts`) to view failures and expected values.
3. Adjust test data/expectations to align with implementation, documenting rationale in comments if non-obvious.
4. Re-run targeted Vitest and full TypeScript compile.

## THINK
- Edge cases: ensure tests still detect warnings/blocks when exceeding LOC limits.
- Failure modes: Accepting incorrect behaviour by blindly copying actual outputs; instead verify logic matches spec (e.g., 0.8 multiplier for core logic).
- AFP/SCAS: Maintain guardrail coverage to avoid regressions; micro-batch (single test file + optional comments).
- Assumptions: Implementation is correct; only expectations stale.
