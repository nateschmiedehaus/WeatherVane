# Strategy Analysis — AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

**Date:** 2025-11-20  
**Author:** Codex

## Problem Statement
Model routing is at risk of staleness. Architecture V2 requires the Autopilot to “always know the latest models,” but the registry is currently static/manual. Without a Scout, routing can miss newer Gemini/Claude/Codex/o-series releases, degrading cost/latency/quality.

## Root Cause (5 Whys)
1) Why stale? No automated discovery process.  
2) Why no automation? Registry built as a seed, not a service.  
3) Why not service? No scheduled scout or provider adapters.  
4) Why not adapters? Network fetch was deferred; reliance on manual updates.  
5) Why risky now? Model landscape changes monthly; manual upkeep is unsustainable and violates ARCHITECTURE_V2 Model Intelligence mandate.

## Goal
Continuously source, validate, and merge the latest LLM variants (Gemini, Claude, Codex/o-series, others) into the registry with capability tags and recency/quality signals so the router always operates on current options.

## Success Criteria
1) Scout can be invoked (manual or scheduled) to produce candidate models for at least Gemini/Claude/Codex/o-series with release/observed timestamps and capability tags (reasoning/coding/speed/context).  
2) Registry merge enforces required metadata and only upgrades entries when newer/better; preserves older if candidate is stale/invalid.  
3) Tests cover insert/update/no-op and candidate validation; guardrail passes.  
4) Router helpers can fetch “best for lane” using updated registry without code edit.  
5) Evidence/critics complete; branch ready to push.

## Impact Assessment
- Quality: Better routing to latest/best models → higher success rates, lower latency/cost when fast lanes improve.  
- Reliability: Removes manual drift; reduces risk of routing to deprecated models.  
- Velocity: Operators no longer hand-edit model lists; automation keeps pace with market.  
- Risk if not done: Router becomes obsolete; wasted budget on suboptimal models; architecture non-compliant.

## Constraints / Scope
- ≤5 files, ≤150 net LOC per batch; prefer stubs over new deps if live fetch is risky.  
- No destructive changes to registry; additive/merge only with backups.  
- Network may be unavailable → allow stubbed provider data; document.

## Alignment
- ARCHITECTURE_V2 Section 2.11 “Model Intelligence (Meta-Orchestration)” and user request to include Gemini + always-latest discovery.  
- SCAS: feedback (scout logs), adaptation (configurable providers), redundancy (version + timestamp guards), visibility (summary of additions/updates).

## Risks
- Overwriting good entries with worse/older data.  
- Unbounded registry growth and clutter.  
- Malformed provider data corrupting registry.  
- Router mismatch if schema changes.  
- Operational: concurrent writers, file corruption, or lack of backups.

## Mitigations (high level)
- Recency/version guard; required-field validation; provider allowlist.  
- Optional cap/cleanup deferred; keep backups before write.  
- Schema validation and fail-fast on malformed candidates.  
- Keep scout output compatible with current registry schema; add adapter layer if schema evolves.  
- Single-writer expectation; atomic write (temp + rename) if feasible.
