# Playwright Browser Installation Guard - Edge Cases & Analysis

## Edge Cases

### 1. Partial Browser Installation
**Scenario**: Chromium installed, webkit missing (or vice versa)

**Impact**: Tests configured for webkit will fail

**Detection**: `npx playwright install --dry-run webkit` shows not installed

**Mitigation**: Install both browsers explicitly: `npx playwright install chromium webkit`

**Implementation**: Guard checks each browser individually, installs all required browsers in single command

### 2. Corrupted Browser Installation
**Scenario**: Browser files exist but are corrupted/incomplete

**Impact**: Tests fail with cryptic errors ("Failed to launch browser")

**Detection**: Difficult - Playwright install --dry-run may report "already installed"

**Mitigation**:
- Add `--force` flag option for guard script (reinstall even if present)
- Document troubleshooting: run `npx playwright install --force chromium webkit`

**Implementation**: Guard accepts optional `--force` flag to bypass install check

### 3. Concurrent Installation Attempts
**Scenario**: Multiple CI jobs or developers run guard simultaneously

**Impact**: Race condition - browser download may fail or corrupt

**Detection**: Playwright install failures with "File in use" or "Download failed"

**Mitigation**:
- Playwright handles this internally (atomic operations)
- Guard should retry once on failure
- Use file locking for additional safety (low priority)

**Implementation**: Add retry logic (1 retry with 5s delay)

### 4. Insufficient Disk Space
**Scenario**: Not enough disk space for browser downloads (~300MB per browser)

**Impact**: Installation fails mid-download

**Detection**: `df -h` check before installation

**Mitigation**:
- Check available disk space before installation
- Fail fast with clear error message
- Document minimum space requirement (1GB recommended)

**Implementation**: Add disk space check (require 1GB free before installing)

### 5. Network Timeout/Failure
**Scenario**: CDN slow or unreachable

**Impact**: Browser download times out or fails

**Detection**: Playwright install exits with error

**Mitigation**:
- Retry logic (already planned)
- Increase timeout for CI environments (env var)
- Document offline/air-gapped workaround (manual install)

**Implementation**: Retry once, then fail with network troubleshooting guidance

### 6. Wrong Playwright Version
**Scenario**: Local Playwright version doesn't match project dependency

**Impact**: Browser version mismatch, tests may fail

**Detection**: Compare `npx playwright --version` with `package.json` version

**Mitigation**:
- Use project-local Playwright (`apps/web/node_modules/.bin/playwright`)
- Document version alignment requirement
- Guard uses same Playwright binary as tests

**Implementation**: Guard script uses `PLAYWRIGHT_NODE_MODULES` path from run_playwright.sh

### 7. Permission Issues
**Scenario**: User doesn't have write access to browser cache directory

**Impact**: Installation fails with "Permission denied"

**Detection**: Installation error from Playwright

**Mitigation**:
- Error message includes permission troubleshooting
- Document where browsers are installed (`~/.cache/ms-playwright/`)
- Suggest `sudo` only as last resort (not recommended)

**Implementation**: Catch permission errors, provide clear guidance

### 8. Playwright CLI Not Available
**Scenario**: Playwright not installed or `npx` not in PATH

**Impact**: Guard script fails immediately

**Detection**: `command -v npx playwright` fails

**Mitigation**:
- Clear error message: "Playwright CLI not found"
- Guidance: "Run npm install first"
- Script exits with status 1

**Implementation**: Already handled in run_playwright.sh (lines 10-13), guard reinforces

## Failure Modes

### Failure Mode 1: Guard Hangs Indefinitely
**Cause**: Network timeout, no timeout on `npx playwright install`

**Impact**: CI jobs timeout, developers wait indefinitely

**Prevention**: Add timeout wrapper: `timeout 300 npx playwright install` (5 min max)

**Recovery**: Kill hung process, retry

### Failure Mode 2: Guard Succeeds But Browsers Still Missing
**Cause**: Installation reports success but files not written (disk full, corruption)

**Impact**: Tests fail immediately after "successful" guard run

**Prevention**: Verify browser exists after installation: check executable path

**Recovery**: Manual reinstall with `--force` flag

### Failure Mode 3: Guard Fails But Tests Would Work
**Cause**: False negative (browsers already installed, dry-run check wrong)

**Impact**: Unnecessary installation, developer friction

**Prevention**: Improve detection logic, test thoroughly

**Recovery**: Skip guard with env var: `SKIP_BROWSER_CHECK=1`

### Failure Mode 4: Silent Failure (No Error Message)
**Cause**: Playwright install fails but exit code 0 (bug in Playwright)

**Impact**: Guard reports success, tests fail later

**Prevention**: Parse Playwright output for success indicators

**Recovery**: Check Playwright version, update if buggy

## Alternatives Considered

### Alternative 1: Python Script Instead of Bash
**Pros**: Better error handling, cross-platform, easier testing

**Cons**: Adds Python dependency for simple task, overhead

**Decision**: Stick with bash - simpler, matches existing scripts (run_playwright.sh)

### Alternative 2: JavaScript/Node.js Script
**Pros**: Native to Node.js ecosystem, better Playwright API access

**Cons**: Requires node execution, slower startup

**Decision**: Rejected - bash is faster for simple checks

### Alternative 3: CI-Only Guard (No Local Guard)
**Pros**: Simpler, assumes developers install browsers manually

**Cons**: Poor developer experience, fails goal of "zero manual setup"

**Decision**: Rejected - guard should work locally AND in CI

### Alternative 4: Optional Guard (Opt-In via Flag)
**Pros**: No change to existing workflow, less risk

**Cons**: Defeats purpose, won't prevent browser-not-found errors

**Decision**: Rejected - guard should be automatic (can skip with env var if needed)

### Alternative 5: Pre-Commit Hook to Check Browsers
**Pros**: Catches missing browsers early

**Cons**: Slows down commits, doesn't help CI

**Decision**: Rejected - guard at test-time is sufficient

### Alternative 6: Docker Container with Browsers Pre-Installed
**Pros**: Guaranteed consistent environment

**Cons**: Massive overhead, slows development

**Decision**: Out of scope - may revisit for CI, but guard still needed locally

### Alternative 7: Cache Browsers in CI
**Pros**: Faster CI runs (no download each time)

**Cons**: Cache invalidation complexity, still need initial install

**Decision**: Orthogonal - can do both (guard + CI cache)

## Mitigations Summary

| Risk | Mitigation | Priority |
|------|-----------|----------|
| Partial installation | Install all browsers explicitly | High |
| Corrupted browsers | Add `--force` flag option | Medium |
| Network failure | Retry logic (1 retry, 5s delay) | High |
| Disk space | Check before install (require 1GB free) | Medium |
| Concurrent installs | Trust Playwright atomic operations | Low |
| Permission issues | Clear error message + troubleshooting | Medium |
| Wrong version | Use project-local Playwright binary | High |
| Timeout | Add 5-minute timeout wrapper | Medium |
| Silent failure | Verify browser exists after install | Medium |
| False negative | Add `SKIP_BROWSER_CHECK=1` escape hatch | Low |

## Implementation Decisions

### Decision 1: Idempotency Strategy
**Options**:
A. Always run `npx playwright install` (slow but reliable)
B. Check if installed first, skip if present (fast but complex)

**Choice**: Option B - Check first with `--dry-run`, only install if missing

**Rationale**: Performance matters (guard runs every test), dry-run is reliable

### Decision 2: Error Handling Philosophy
**Options**:
A. Fail fast (exit on first error)
B. Retry with backoff (resilient but slower)

**Choice**: Hybrid - Retry once for network errors, fail fast for others

**Rationale**: Balance between resilience and speed

### Decision 3: Output Verbosity
**Options**:
A. Silent (only errors)
B. Verbose (all actions)

**Choice**: Verbose - Show what's happening

**Rationale**: Transparency helps debugging, minimal overhead

### Decision 4: Integration Point
**Options**:
A. Modify package.json scripts directly
B. Modify run_playwright.sh wrapper

**Choice**: Option B - Modify run_playwright.sh

**Rationale**: Single integration point, already checked CLI existence

### Decision 5: Documentation Scope
**Options**:
A. Minimal (just error messages)
B. Comprehensive guide (dedicated doc)

**Choice**: Hybrid - Clear inline messages + short troubleshooting section in README

**Rationale**: Balance discoverability and maintenance burden

## Testing Strategy

### Unit Testing (Not Applicable)
Bash scripts typically don't have unit tests, but we'll test behaviors:

### Integration Testing
1. **Test 1: No-Op Performance** (browsers installed)
   - Run guard 10 times
   - Measure average execution time
   - Assert: <5 seconds per run

2. **Test 2: Fresh Installation** (browsers missing)
   - Simulate missing browsers (use different browser like firefox)
   - Run guard
   - Assert: Browsers installed successfully

3. **Test 3: Partial Installation** (one browser missing)
   - Install chromium only
   - Run guard
   - Assert: Webkit gets installed

4. **Test 4: Full Test Suite Integration**
   - Run `npm run test:ui`
   - Assert: Guard runs before tests
   - Assert: Tests pass

5. **Test 5: Network Failure Handling** (manual simulation)
   - Disconnect network
   - Run guard with missing browsers
   - Assert: Clear error message, retry attempted

### Manual Testing Checklist
- [ ] Test on macOS with browsers installed
- [ ] Test on macOS with browsers missing
- [ ] Test with Playwright not installed (should fail gracefully)
- [ ] Test with low disk space (if possible to simulate)
- [ ] Test with `--force` flag (if implemented)
- [ ] Test `SKIP_BROWSER_CHECK=1` escape hatch

## Open Questions

1. **Q**: Should guard install system dependencies (`--with-deps`) or assume they're present?
   **A**: Use `--with-deps` for chromium (required for CI), skip for webkit (optional)

2. **Q**: Should guard cache check results between runs?
   **A**: No - dry-run is fast enough (<1s), caching adds complexity

3. **Q**: Should guard support other browsers (firefox, edge)?
   **A**: Not initially - only chromium/webkit per playwright.config.cjs

4. **Q**: Should guard be part of `npm install` postinstall hook?
   **A**: No - separation of concerns, keep npm install fast

5. **Q**: Should guard detect CI environment and behave differently?
   **A**: Optional - can add `CI=true` awareness for verbose logging

## Assumptions

1. ✅ Playwright CLI is available (satisfied by run_playwright.sh check)
2. ✅ Network access available for browser downloads (CI requirement)
3. ✅ Sufficient disk space (1GB minimum) (check added to guard)
4. ✅ User has write access to browser cache directory (error handled)
5. ✅ Bash available (macOS/Linux standard)
6. ⚠️ Single test runner (no concurrent runs) - acceptable for Phase 0

## Future Improvements (Out of Scope)

- Cross-platform support (Windows PowerShell version)
- CI cache integration (cache browsers between runs)
- Browser update detection (warn if browser version outdated)
- Telemetry (track guard execution time, failures)
- Automatic browser cleanup (remove old versions)
- Parallel browser downloads (faster initial setup)
