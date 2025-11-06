# AFP-MODULE-REMEDIATION-20251105-I Phase Notes

## STRATEGIZE
- **Problem**: TypeScript build fails on known baseline errors (ML task aggregator tests, feature gate mocks, pattern mining, research orchestrator optional field). These block compiled workflows and require manual overrides.
- **Root cause**: Type signatures evolved but fixtures/mocks weren’t updated; certain modules (e.g., pattern mining) return partial objects.
- **Goal**: Catalogue each persistent TS error, decide to fix or retire the offending code, and produce an actionable remediation plan aligned with AFP/SCAS principles (via negativa first, unify stubs, or delete obsolete suites).

## SPEC
- Enumerate every TS diagnostic currently emitted by `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`.
- For each, classify resolution approach: delete obsolete test, adapt fixtures, refactor code, or design replacement.
- Recommend sequencing and potential subtasks for implementation.
- Produce evidence artefacts (analysis doc) and update follow-up tracker.

## PLAN
1. Capture current TS diagnostic list via `npx tsc --noEmit`.
2. Inspect each referenced module/test to understand intent and current usage.
3. Assess via negativa opportunities (e.g., if test suites are dead weight) vs. fixes required for live functionality.
4. Document resolution recommendations in `state/evidence/AFP-MODULE-REMEDIATION-20251105-I/analysis.md`.
5. Update follow-ups with new subtasks as needed.

## THINK
- Edge cases: Some diagnostics stem from disabled tests; deleting may be acceptable if functionality moved elsewhere.
- Failure modes: Misclassifying essential bug-checking tests as deletable; need clear criteria (usage, coverage, criticality).
- AFP/SCAS: Prioritize deletion or unification to reduce LOC; align with five forces (coherence, economy, local fixes).
- Assumption: No new errors beyond known list; confirm before finalising.
