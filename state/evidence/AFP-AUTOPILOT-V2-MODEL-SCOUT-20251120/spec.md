# SPEC - AFP-AUTOPILOT-V2-MODEL-SCOUT-20251120

**Phase:** SPEC  
**Date:** 2025-11-20

## Acceptance Criteria (Must)
- Scout job can be invoked (manual or scheduled) to refresh model registry with new entries for Gemini/Claude/Codex/o-series and others.
- Registry updates include metadata: provider, model_id, released/observed_at, context window, capability tags (reasoning/coding/vision/speed), default lane.
- Safety gating: new entries require mandatory fields and are merged without clobbering existing scores unless newer.
- Tests exist and pass for registry merge/update and Scout dry-run.
- Evidence/critics captured; branch push-ready.

## Should
- Configurable sources (provider list/URLs) via env or config.
- Idempotent run; produces deterministic registry when no changes.
- Emits log/summary of added/updated models.

## Could
- Benchmark hook to ingest external scores.
- Disk snapshots/backups of previous registry state.

## Functional Requirements
- FR1: Scout scans provider source list and builds candidate models.
- FR2: Registry merge function inserts or updates models by provider+name with recency check.
- FR3: Router/registry accessor returns latest by lane using updated entries.
- FR4: Tests cover insert/update/no-op cases and required field validation.

## Non-Functional
- Minimal deps; mock data acceptable if live fetch unavailable.
- ≤5 files/≤150 net LOC per batch.
