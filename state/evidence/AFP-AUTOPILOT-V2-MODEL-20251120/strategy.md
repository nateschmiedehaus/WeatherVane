# Strategy Analysis — AFP-AUTOPILOT-V2-MODEL-20251120

**Date:** 2025-11-20
**Author:** Codex

## Purpose
Implement Model Intelligence from ARCHITECTURE_V2: dynamic registry, routing lanes (Fast/Standard/Deep) using latest models (Gemini 3 / Claude 3.5 / o3), and a Scout hook to keep models fresh.

## Problem
Current model registry covers only Claude/Codex; routing lanes and latest models are not encoded. Autopilot risks stale model choices and can’t target Fast/Standard/Deep paths per architecture.

## Root Causes
- Registry schema missing new providers (Gemini, o3) and capability tagging.
- Manager lacks lane selection helpers.
- No Scout hook for periodic discovery of new models/benchmarks.
 - On-disk registry is stale (2025-10-16) and overrides seeds; no freshness enforcement tied to lane selection.
 - No governance for “latest model” detection cadence; discovery limited to legacy providers.

## Desired Outcome
- Updated registry schema with capabilities and latest models seeded.
- Lane selectors (Fast/Standard/Deep) available for router/agents.
- Scout/discovery hook to refresh registry (even if stubbed for now).
- Tests proving lane selection and registry defaults.
 - Defined cadence and mechanism for pulling “latest” models (via Scout, TTL, and merge) so lanes stay current.

## Success Criteria
1) Registry includes latest models (Gemini 3, Claude 3.5 Sonnet/Haiku, Gemini 2.0 Pro/Flash, o3) with capability tags.
2) Lane helpers return correct model IDs for Fast/Standard/Deep with fallback.
3) Scout/discovery hook exists and doesn’t regress current flow; stale disk registry cannot block seeds/merge.
4) Unit tests for lane selection and registry defaults pass.
5) Evidence + critics + commit/push complete on feature branch.
6) A defined plan for continuous discovery (TTL + Scout runbook) is documented.

## Impact
- Better routing and future-proofed model choices.
- Reduced staleness via Scout hook.
- Alignment with ARCHITECTURE_V2 and SCAS (adaptation/feedback).
