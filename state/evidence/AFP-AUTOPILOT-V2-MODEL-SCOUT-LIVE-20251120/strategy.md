# Strategy Analysis — AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

**Date:** 2025-11-20  
**Author:** Codex

## Problem
Model Scout is stubbed (static candidates). ARCHITECTURE_V2 demands continuous discovery for Gemini/Claude/o-series/Codex. Without live updates, routing drifts, costs rise, and quality drops as newer models appear.

## Root Cause
No provider adapters or benchmark ingestion were built; reliance on stubs came from network/schema uncertainty and missing cached source design.

## Goal
Add live provider discovery (configurable fetch or cached JSON fallback) and optional benchmark ingestion, feeding the registry with recency/version guards, capability tags, and lanes to keep routing current automatically.

## Success Criteria
1) Provider adapters (live or cached) for Gemini/Claude/o-series/Codex emit validated candidates (provider/id/observedAt/context/capabilities/lane).  
2) Registry merge only upgrades when newer; required metadata enforced; backups preserved.  
3) Tests cover add/update/invalid/cached-mode; guardrail + wave0 dry-run pass.  
4) Offline flag selects cached data when network blocked.  
5) Logs summarize adds/updates/skips.

## Impact
Quality: fresher routing choices improve accuracy and token ROI; Reliability: reduced drift/staleness; Cost/Latency: newer fast models used automatically; Compliance: aligns with Model Intelligence mandate. If not done: router becomes obsolete, wasted spend on older models, higher error rates. Rough impact: avoiding a one-month lag on fast models could save ~10-20% latency/cost on “fast” lane traffic. Adding reasoning-latest models can avoid rework on complex tasks (hours saved per week).

## Scope/Constraints
- ≤5 files, ≤150 net LOC per batch; no new deps if possible.  
- Use config-driven sources; if network blocked, support cached JSON and document.

## Risks
- Provider schema drift; network failures; overwrite risk; untrusted data; empty fetch overwriting registry. Mitigate via validation, recency guard, allowlist, backups, and refusing empty-input overwrite.
- Time/cost to add real adapters; keep batches small and use cached mode when blocked.

## Alignment (AFP/SCAS)
- AFP: keeps routing in sync with model landscape; supports Model Intelligence node.  
- SCAS: feedback (logs), redundancy (recency+validation), adaptation (live/cached flag), visibility (summary), graceful degradation (cached mode).
- Human-in-the-loop: cached mode + logs enable reviewers to audit new models before promotion if desired.

## Recommendation
Proceed now; high value, contained scope; enables continuous routing accuracy.
***
