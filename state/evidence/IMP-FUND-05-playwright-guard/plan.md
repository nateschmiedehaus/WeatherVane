# Playwright Browser Installation Guard - Implementation Plan

## Implementation Steps

### Step 1: Create Guard Script (`scripts/ensure_playwright_browsers.sh`)
**Estimate**: 30 minutes

Create bash script that:
1. Checks if Playwright CLI is available
2. Detects if chromium/webkit browsers are installed
3. Installs missing browsers via `npx playwright install`
4. Exits with appropriate status codes

**Logic**:
```bash
# Check if playwright is available
command -v npx playwright &>/dev/null || exit 1

# Check browser installation status
npx playwright install --dry-run chromium 2>&1 | grep -q "is already installed"
CHROMIUM_INSTALLED=$?

npx playwright install --dry-run webkit 2>&1 | grep -q "is already installed"
WEBKIT_INSTALLED=$?

# Install missing browsers
if [ $CHROMIUM_INSTALLED -ne 0 ] || [ $WEBKIT_INSTALLED -ne 0 ]; then
  npx playwright install chromium webkit --with-deps
fi
```

### Step 2: Integrate Guard into `apps/web/scripts/run_playwright.sh`
**Estimate**: 15 minutes

Modify `run_playwright.sh` to call guard before running tests:
- Add call to `ensure_playwright_browsers.sh` after line 12 (after Playwright CLI check)
- Exit if guard fails
- Add informative logging

**File**: `apps/web/scripts/run_playwright.sh`
**Location**: After line 13 (after Playwright CLI check)

**Changes**:
```bash
# After existing Playwright CLI check
echo "[playwright] Ensuring browsers are installed..."
"${REPO_ROOT}/scripts/ensure_playwright_browsers.sh" || {
  echo "Failed to ensure Playwright browsers are installed" >&2
  exit 1
}
```

### Step 3: Check for Makefile Integration
**Estimate**: 10 minutes

Search for Makefile targets that run Playwright tests:
```bash
grep -r "playwright\|test:ui" Makefile* 2>/dev/null
```

If found, add guard call to those targets.

### Step 4: Document Browser Installation Requirements
**Estimate**: 15 minutes

Create or update documentation:
- Option A: Add section to existing README
- Option B: Create `docs/PLAYWRIGHT.md` with troubleshooting guide

Content:
- What browsers are required (chromium, webkit)
- Automatic vs manual installation
- Troubleshooting common issues (network, disk space)
- Manual installation command: `npx playwright install`

### Step 5: Test Guard Script
**Estimate**: 20 minutes

Test scenarios:
1. **Browsers already installed**: Verify no-op, fast execution (<5s)
2. **Browsers missing**: Manually remove browsers, verify installation works
3. **Playwright CLI missing**: Verify graceful failure
4. **Network failure**: Verify error message

**Test commands**:
```bash
# Test 1: Browsers installed (no-op)
time ./scripts/ensure_playwright_browsers.sh

# Test 2: Browsers missing (simulate by checking a non-installed browser)
npx playwright install --dry-run firefox  # Should trigger installation logic

# Test 3: Run full test suite
cd apps/web && npm run test:ui
```

### Step 6: Verify Integration
**Estimate**: 10 minutes

Run integration tests:
```bash
# Test via package.json script
cd apps/web && npm run test:ui

# Verify guard is called before tests
# Check logs for "Ensuring browsers are installed" message
```

## File/Function Mapping

### New Files
1. **scripts/ensure_playwright_browsers.sh** (NEW, ~50 lines)
   - Function: Check and install Playwright browsers
   - Entry point for browser installation guard
   - Used by: `apps/web/scripts/run_playwright.sh`, CI scripts

2. **docs/PLAYWRIGHT.md** (NEW, optional, ~100 lines)
   - Documentation for browser requirements
   - Troubleshooting guide
   - Manual installation instructions

### Modified Files
1. **apps/web/scripts/run_playwright.sh** (MODIFY, lines 13-20)
   - Add guard call after Playwright CLI check
   - Add error handling for guard failure
   - Add informative logging

2. **Makefile** (MODIFY if exists, TBD based on Step 3)
   - Add guard call to Playwright test targets
   - Ensure CI uses guard

### Existing Files (Reference only)
1. **apps/web/playwright.config.cjs** (READ ONLY)
   - Reference for required browsers (chromium, webkit)
   - No changes needed

2. **tools/wvo_mcp/src/utils/browser.ts** (READ ONLY)
   - Reference for browser management patterns
   - No changes needed (error guidance already exists)

3. **apps/web/package.json** (READ ONLY)
   - Reference for test:ui script
   - No changes needed (script already calls run_playwright.sh)

## Dependencies

- **Playwright CLI**: Already installed (v1.56.1) ✅
- **npx**: Available in Node.js environment ✅
- **bash**: Available on macOS/Linux ✅
- **Network access**: Required for browser downloads (CI environment)

## Timeline

| Step | Task | Estimate | Dependencies |
|------|------|----------|--------------|
| 1 | Create guard script | 30 min | None |
| 2 | Integrate into run_playwright.sh | 15 min | Step 1 |
| 3 | Check/update Makefile | 10 min | Step 1 |
| 4 | Write documentation | 15 min | None |
| 5 | Test guard script | 20 min | Step 1, 2 |
| 6 | Verify integration | 10 min | Step 1-5 |
| **Total** | | **100 min** | **~1.5 hours** |

## Risk Mitigation

### Risk 1: Browser installation fails in CI
**Mitigation**: Test guard in CI environment, add network retry logic

### Risk 2: Guard adds too much latency
**Mitigation**: Ensure idempotent check is fast (<5s), only install if missing

### Risk 3: Disk space issues
**Mitigation**: Add disk space check before installation, fail with clear error

### Risk 4: Breaking existing tests
**Mitigation**: Test guard with existing test suite before committing

## Success Criteria Verification Plan

After implementation, verify:
1. ✅ Run `time ./scripts/ensure_playwright_browsers.sh` → <5s if already installed
2. ✅ Remove browsers, run guard → installs successfully
3. ✅ Run `cd apps/web && npm run test:ui` → tests pass
4. ✅ Check logs → "Ensuring browsers are installed" message present
5. ✅ Verify no new test failures introduced
6. ✅ Documentation includes troubleshooting section

## Integration Points

```
scripts/ensure_playwright_browsers.sh (NEW)
  ↑
  │ called by
  │
apps/web/scripts/run_playwright.sh (MODIFIED)
  ↑
  │ called by
  │
apps/web/package.json::test:ui (NO CHANGE)
  ↑
  │ used by
  │
Developer/CI environment
```

## Rollback Plan

If guard causes issues:
1. Remove guard call from `run_playwright.sh` (revert lines 14-18)
2. Document manual installation requirement in README
3. Keep `ensure_playwright_browsers.sh` as optional utility script

Rollback is low-risk because:
- Guard is additive (doesn't change existing logic)
- Can be disabled by commenting out one function call
- No changes to Playwright configuration or tests
