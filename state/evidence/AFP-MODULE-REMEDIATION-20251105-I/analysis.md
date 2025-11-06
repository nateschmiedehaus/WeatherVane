# TypeScript Diagnostic Analysis

## Overview
- Command: `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`
- Result: 8 blocking diagnostics across 5 logical areas (ML task aggregator fixtures, pattern mining stub, feature-gate test doubles, research orchestrator fallback).
- Goal: Determine AFP-aligned resolution (delete, refactor, adapt, unify) for each.

## Diagnostic Catalog
| ID | Location | Error | Current Role | Recommended Action |
| -- | -------- | ----- | ------------ | ------------------ |
| 1 | `tools/wvo_mcp/src/critics/__tests__/ml_task_aggregator.test.ts:403/409/415/421` | TS2740 – mock `MLTaskSummary` missing required fields | Active unit tests validating aggregator classification | **Adapt fixtures**: introduce a shared helper that populates new fields with deterministic defaults (e.g., `createTaskSummary({ overrides })`) so tests remain meaningful. Avoid deleting—aggregator critic relies on coverage. |
| 2 | `tools/wvo_mcp/src/intelligence/pattern_mining.ts:28` | TS2741 – `PatternInsight` requires `source` | Stub client used in live code (research orchestrator) | **Fix implementation**: add `source: 'stub'` (and optional evidence array) to satisfy contract. Keeps behaviour explicit. |
| 3 | `tools/wvo_mcp/src/orchestrator/context_assembler.feature_gates.test.ts:10` | TS2740 – feature gate mock lacks new fields | Regression tests for prompt-mode gating | **Unify mocks**: create reusable `createFeatureGatesStub(partial)` in `feature_gates.test_utils.ts` exporting a fully-typed object (all methods returning safe defaults). Prefer reuse over patching each test. |
| 4 | `tools/wvo_mcp/src/orchestrator/research_orchestrator.ts:284` | TS18048 – `alternative.confidence` possibly undefined | Production code building summaries | **Harden logic**: use optional chaining + default (`Math.round((alternative.confidence ?? 0.6) * 100)`) to align with `AlternativeOption` type. |
| 5 | `tools/wvo_mcp/src/utils/browser.feature_gates.test.ts:7` | TS2740 – feature gate mock outdated | Browser helper tests for feature gating | **Reuse stub from item 3** (or same helper). Delete duplicate inline mocks to keep consistency. |

## Prioritised Remediation Plan

1. **Feature gate mock consolidation (Items 3 & 5)**
   - Create `tools/wvo_mcp/src/orchestrator/__tests__/feature_gate_stubs.ts` exporting a complete `FeatureGatesReader` implementation with override support.
   - Update affected tests (context assembler + browser utils) to import the helper.
   - Benefit: removes multiple duplicate mocks, future-proof against interface changes.

2. **ML task aggregator fixtures (Item 1)**
   - Add helper `createSummary(overrides: Partial<MLTaskSummary>)` inside the test file (or shared test util) populating new fields (empty arrays, maps, etc.).
   - Gives us typed fixtures without reworking the aggregator.

3. **Pattern mining stub (Item 2)**
   - One-line addition: include `source: 'stub'` plus optional `tags: ['placeholder']` to clarify status.

4. **Research orchestrator optional confidence (Item 4)**
   - Guard `confidence` when rendering alternatives (`alternative.confidence ?? 0.6`).
   - Consider clamping to `[0,1]` prior to formatting (already handled by `normalizeConfidence`).

## Additional Persistent Failures

Beyond TypeScript diagnostics, Vitest currently fails due to outdated expectations:

| Suite | Cause | Recommended Action |
| ----- | ----- | ------------------ |
| `src/enforcement/__tests__/loc_analyzer.test.ts` | Assertions expect legacy heuristics; analyzer now enforces stricter weights (0.8, 0.5, etc.). | Re-baseline tests against documented behaviour. Decide whether to delete deprecated cases or update fixtures. Consider extracting analyzer spec to a json fixture to avoid duplication. |
| `src/work_process/index.test.ts` | Synthetic tasks missing `strategy.md` evidence cause critic guard to reject transitions. | Provide minimal evidence fixtures for test tasks or adjust harness to stub StrategyReviewer; do **not** delete—this guards AFP compliance. |

Both suites remain valuable (guardrails + work-process enforcement). Recommend dedicated remediation tasks: one to refresh LOC analyzer expectations, another to seed work-process evidence fixtures.

## Suggested Follow-up Tasks

| Task ID (proposed) | Scope |
| ------------------ | ----- |
| AFP-MODULE-REMEDIATION-20251105-J | Implement feature-gate stub helper and update affected tests (items 3 & 5). |
| AFP-MODULE-REMEDIATION-20251105-K | Refresh ML task aggregator fixtures with factory helper (item 1). |
| AFP-MODULE-REMEDIATION-20251105-L | Patch pattern mining stub + research orchestrator fallback (items 2 & 4). |
| AFP-MODULE-REMEDIATION-20251105-M | Rebaseline LOC analyzer tests (Vitest failures). |
| AFP-MODULE-REMEDIATION-20251105-N | Seed work-process evidence fixtures / adjust harness. |

Each should follow AFP micro-batching (≤5 files, ≤150 LOC) and include verification steps (`npx tsc`, targeted Vitest suites).

## Evidence Attachments
- `tsc-errors.log` (captured via `npx tsc --noEmit -p tools/wvo_mcp/tsconfig.json`).
- Analysis authored in this document.

