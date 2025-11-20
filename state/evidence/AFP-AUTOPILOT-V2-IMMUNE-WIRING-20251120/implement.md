# IMPLEMENT - AFP-AUTOPILOT-V2-IMMUNE-WIRING-20251120

**Phase window:** 2025-11-20  
**Status:** ✅ Gate+kpi wiring hardened; wave0 lock stale cleanup added

## Changes
1) Wave0 lock hardening (`tools/wvo_mcp/src/wave0/runner.ts`)
   - Added lock TTL resolution, PID-alive check, and stale-lock autoclean on startup.
   - Exported `resolveLockStatus` helper for observability/testing.
2) Wave0 lock tests (`tools/wvo_mcp/src/wave0/runner.test.ts`)
   - Coverage for missing lock, dead PID, expired TTL, and active lock cases.
3) Evidence updates
   - PLAN/SPEC/THINK/DESIGN revised for lock handling; mid_execution_checks added.

## Notes
- No new dependencies; ≤5 functional files touched.
- Stale `.wave0.lock` now removed automatically; live locks continue to block safely.
