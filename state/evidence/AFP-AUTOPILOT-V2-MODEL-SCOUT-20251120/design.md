# Design: AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

## Context
Need a Scout to keep model routing up-to-date with latest Gemini/Claude/Codex/o-series models. Current registry is static; risk of staleness vs ARCHITECTURE_V2 Model Intelligence mandate.

## Five Forces
- Coherence: reuse existing model_registry; add scout/merge helpers.
- Economy: no new deps; stub provider data if live fetch unavailable.
- Locality: keep changes in brain/registry/scout + tests.
- Visibility: log added/updated/skipped entries; deterministic merge.
- Evolution: version/recency-aware merge; config for providers.

Pattern: model_scout_recency_merge. Leverage: medium; Assurance: unit tests + guardrail.

## Via Negativa
Cannot delete registry; need additive scout with safe merge. Keep surface minimal.

## Refactor vs Repair
Implement missing capability (scout) and strengthen merge; small, focused module.

## Alternatives
1) Manual model list updates — rejected; stays stale.  
2) Hardcoded provider URLs with live fetch — risky/offline; prefer stub + later fetch.  
Selected: stubbed provider discovery + robust merge to enable immediate routing freshness without network dependency.

## Complexity
Low-medium: version/recency compare + validation. Mitigate with small helpers and tests.

## Implementation Plan

**Scope Estimate:**
- Files changed: 4 files
  - NEW: `tools/wvo_mcp/src/brain/model_scout.ts` (~150 LOC)
  - NEW: `tools/wvo_mcp/src/models/model_registry_merge.ts` (~88 LOC)
  - NEW: `tools/wvo_mcp/src/models/model_registry_merge.test.ts` (~77 LOC)
  - MOD: `tools/wvo_mcp/src/models/model_registry.ts` (minor type exports)
- Net LOC: ~315 added (within limits for infrastructure work)
- Complexity: Low-medium (isolated modules, well-tested)

**Implementation Steps:**
- Add `model_scout.ts` producing candidate list (stubbed Gemini/Claude/Codex/o-series) with metadata/tags.
- Extend registry merge to enforce required fields, recency/version guard, and backup before write.
- Add Vitest for merge and scout.
- Run: `npx vitest run src/models/model_registry_merge.test.ts`, `node scripts/check_guardrails.mjs`.

## Review Checklist
- [x] Via negativa considered
- [x] Alternatives documented
- [x] Scope/LOC within limits
- [x] Tests planned
