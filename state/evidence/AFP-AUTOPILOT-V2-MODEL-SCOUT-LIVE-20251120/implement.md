# IMPLEMENT - AFP-AUTOPILOT-V2-MODEL-SCOUT-LIVE-20251120

**Status:** ✅ Live/cached Scout wiring added  
**Phase window:** 2025-11-20

## Changes
1) Added cached-source support and validation in `model_scout.ts` with configurable env `WVO_SCOUT_SOURCE`; falls back to stubs with warnings.  
2) Added conversion to merge candidates using existing merge helper; logging for cache load/fallback.  
3) Added unit tests `model_scout.test.ts` for cached load and fallback behavior.

## Notes
- No new dependencies.  
- Long-term: add real provider fetch/benchmark sources via config in follow-up batches.
