# Design: AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

## Context
Stubbed Scout exists; need live provider discovery/benchmarks to keep routing current per ARCHITECTURE_V2 Model Intelligence.

## Five Forces
- Coherence: reuse registry + merge helper; add adapters.
- Economy: no new deps; cached JSON fallback.
- Locality: limit to scout/merge/tests.
- Visibility: summary logs for adds/updates/skips.
- Evolution: recency/version guards; config for live vs cached.

Pattern: model_scout_recency_merge (live). Leverage: medium; Assurance: unit tests + guardrail + wave0 smoke.

## Via Negativa
Cannot delete registry; minimal additive adapters and validation.

## Alternatives
1) Keep stubs only — rejected (stale).  
2) Full benchmark pipeline now — defer; start with optional benchmark field ingestion.  
Selected: configurable live-or-cached adapters + guarded merge.

## Complexity
Low-medium; manage via validation and small helpers; stay within ≤5 files/≤150 LOC per batch.

## Implementation Plan
- Add adapters in model_scout.ts for provider sources (env-driven); cached fallback.  
- Extend merge helper if needed for benchmark fields (optional).  
- Add tests for live/cached paths and recency/validation.  
- Run: vitest merge tests, guardrail, wave0 dry-run.
- Status note: Cached-source wiring + unit test implemented; live fetch to follow via config in next batch.

## Scope Estimate
- Files: 4 (scout, merge, merge.test, evidence).  
- Net LOC target: ≤150 per batch.
