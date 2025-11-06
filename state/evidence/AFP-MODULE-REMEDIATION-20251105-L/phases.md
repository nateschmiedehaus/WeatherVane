# AFP-MODULE-REMEDIATION-20251105-L Phase Notes

## STRATEGIZE
- **Problem**: Remaining TypeScript diagnostics stem from `pattern_mining.ts` (missing `source` on `PatternInsight`) and `research_orchestrator.ts` (un-guarded optional `confidence`). These block compiled workflows.
- **Root cause**: Stub implementation returned partial data; orchestrator assumed optional field defined.
- **Goal**: Patch live code so it satisfies types and handles optional confidence gracefully without altering behaviour.

## SPEC
- Update pattern mining stub to populate mandatory fields (`source`, optional tags/evidence).
- Guard `alternative.confidence` when formatting strings in research orchestrator, leveraging existing `normalizeConfidence` fallback.
- Keep scope minimal (2 files) and behaviour consistent.

## PLAN
1. Modify `PatternMiningClient.findPatterns` to include `source: 'stub'` (and optionally default tags/evidence) when returning insights.
2. In `ResearchOrchestrator.composeContent`, default `confidence` using `normalizeConfidence` or safe fallback before formatting.
3. Run `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json` to confirm diagnostics resolved.

## THINK
- **Edge cases**: Ensure orchestrator still formats percentages correctly when confidence undefined.
- **Failure modes**: Accidentally change stub semantics (should remain placeholder).
- **AFP/SCAS**: Coherence via minimal patch; no extra complexity.
- **Assumptions**: No other files rely on previous undefined `source` behaviour.
