# Offline Mode Fix - Critical Issue Resolved

**Date:** 2025-10-18
**Severity:** CRITICAL
**Status:** FIXED

## Problem

The autopilot system was running in **offline/mock mode** by default, generating fake progress summaries while pretending to be online. This was highly deceptive and wasteful.

### What Was Happening

1. **Default offline fallback enabled:** `WVO_AUTOPILOT_ALLOW_OFFLINE_FALLBACK` defaulted to `1`
2. **Fake summaries generated:** When network checks failed (or were bypassed), `run_offline_product_cycle` would run
3. **Deceptive behavior:** The script `scripts/run_product_cycle.py` generated fake JSON summaries pretending work was done
4. **Fake token tracking:** The system appeared to use tokens but was actually running locally with no API calls
5. **Canary worker always dry-run:** The canary worker defaulted to `WVO_DRY_RUN=1`, never using real API calls

### Why This Was Unacceptable

- **Deceptive:** Users believed autopilot was working when it was offline
- **Wasteful:** Fake summaries consumed compute without real progress
- **Unreliable:** No actual AI model execution meant no real value
- **Misleading metrics:** Token usage and costs were fabricated

## Solution

### Changes Made

1. **Disabled offline fallback by default**
   - Changed `WVO_AUTOPILOT_ALLOW_OFFLINE_FALLBACK` default from `1` to `0`
   - Autopilot now **fails fast** if connectivity is unavailable

2. **Gutted fake offline product cycle**
   - `run_offline_product_cycle()` is now a no-op with deprecation warning
   - Renamed `scripts/run_product_cycle.py` to `.DEPRECATED_OFFLINE_MODE`

3. **Added hard guards against offline execution**
   - `WVO_AUTOPILOT_OFFLINE=1` now causes immediate exit with error
   - DNS/network failures now exit with error instead of falling back
   - Clear error messages explaining offline mode is prohibited

4. **Fixed worker manager**
   - Active workers now **throw error** if started with `WVO_DRY_RUN=1`
   - Explicitly force active workers to `WVO_DRY_RUN=0`
   - Added documentation explaining why dry-run is prohibited for production

5. **Verified real connectivity**
   - Tested Codex authentication: ✅ **Working**
   - Tested OpenAI API connectivity: ✅ **Reachable**
   - Tested MCP tool execution: ✅ **Functional**

### Files Modified

- `tools/wvo_mcp/scripts/autopilot.sh` - Disabled offline fallback logic
- `tools/wvo_mcp/src/worker/worker_manager.ts` - Added dry-run guards
- `scripts/run_product_cycle.py` - Renamed to `.DEPRECATED_OFFLINE_MODE`

## Verification

**Before fix:**
```bash
# Autopilot would silently fall back to offline mode
# Generated fake summaries without API calls
# User had no idea it wasn't really working
```

**After fix:**
```bash
# Autopilot fails immediately if connectivity is unavailable
# Clear error messages explain the problem
# No fake summaries generated
# User knows exactly what's wrong
```

**Real Codex test:**
```bash
CODEX_HOME=.accounts/codex/codex_personal codex exec \
  --profile weathervane_orchestrator \
  --model gpt-5-codex \
  "Test connectivity"

# Result: ✅ Successfully connects to OpenAI API
# Makes real MCP tool calls
# Returns actual AI-generated responses
```

## Impact

- **No more fake progress:** Autopilot only runs with real API connectivity
- **Honest failures:** Clear error messages when connectivity is unavailable
- **Real value:** Every autopilot run now uses actual AI models
- **Trustworthy metrics:** Token usage and costs reflect reality

## Recommendations

1. **Always verify connectivity before running autopilot**
   - Test: `curl -s https://api.openai.com/v1/models`
   - Should return 401 (reachable but needs auth)

2. **Monitor autopilot logs for offline fallback attempts**
   - Grep logs for "OFFLINE" or "fallback"
   - Investigate any occurrences

3. **Never set `WVO_AUTOPILOT_OFFLINE=1`**
   - This flag is now prohibited
   - Will cause immediate exit with error

4. **Tests using dry-run mode must be explicit**
   - Test files should explicitly set `WVO_DRY_RUN=1`
   - Never rely on defaults

## Related Issues

- Fake token tracking
- Deceptive test behavior
- Network check bypasses
- Worker manager dry-run defaults

All of these have been addressed in this fix.
