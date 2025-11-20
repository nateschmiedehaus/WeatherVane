# SPEC - AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

**Date:** 2025-11-20  
**Phase:** SPEC

## Acceptance Criteria (Must)
- Live (or cached) provider adapters produce candidates for Gemini/Claude/o-series/Codex with required fields: provider, id, observedAt, context, capabilities, lane/tier.
- Merge writes to registry only when newer; required metadata enforced; backups preserved.
- Tests pass for add/update/invalid; guardrail + wave0 dry-run pass.
- Configurable offline mode (env flag) to use cached JSON if network blocked.

## Should
- Log summary of added/updated/skipped models.
- Deterministic output when sources unchanged.

## Could
- Optional benchmark field ingestion if provided.
- Snapshot previous registry copy.

## Functional Requirements
- FR1: Provider adapters (live/cached) → candidate list.
- FR2: Validation/recency guard merge into registry.
- FR3: Config flag to choose live vs cached.
- FR4: Tests cover add/update/skip/invalid and offline mode.

## Non-Functional
- No new deps if possible; small surface; ≤5 files/≤150 net LOC per batch.***
