# Playwright Browser Installation Guard - Specification

## Problem Statement

Playwright tests fail with "Browser executable not found" when browsers (chromium, webkit) are not installed. This causes:
- CI job failures on fresh environments
- Developer onboarding friction (tests fail immediately after checkout)
- Time wasted debugging missing browser errors
- Inconsistent test environments

Current state:
- `apps/web/scripts/run_playwright.sh` checks if Playwright CLI exists but NOT if browsers are installed
- `tools/wvo_mcp/src/utils/browser.ts` shows error guidance but doesn't auto-fix
- No automated browser installation before test execution

## Solution

Create an idempotent guard script that:
1. Checks if required browsers are installed
2. Installs missing browsers automatically
3. Integrates seamlessly into test commands
4. Works in both local dev and CI environments

## Acceptance Criteria

### 1. Guard Script Functionality
- [ ] Script detects if chromium browser is installed
- [ ] Script detects if webkit browser is installed
- [ ] Script installs missing browsers via `npx playwright install`
- [ ] Script is idempotent (safe to run multiple times, no-op if already installed)
- [ ] Script exits with 0 on success, non-zero on failure
- [ ] Script provides clear output (what it's checking, what it's installing)

### 2. Integration
- [ ] Guard integrated into `apps/web/scripts/run_playwright.sh` (runs before tests)
- [ ] Guard integrated into Makefile test targets (if applicable)
- [ ] Guard integrated into `package.json` test:ui script
- [ ] CI environments call guard before Playwright tests
- [ ] Guard runs quickly (<5s if browsers already installed, <60s if installing)

### 3. Error Handling
- [ ] Clear error messages if installation fails
- [ ] Handles network failures gracefully
- [ ] Handles disk space issues gracefully
- [ ] Fails fast (doesn't retry indefinitely)

### 4. Documentation
- [ ] README or docs explain browser installation requirement
- [ ] Error messages point to troubleshooting docs
- [ ] Manual installation instructions provided as fallback

### 5. Testing
- [ ] Tested with browsers already installed (no-op, fast)
- [ ] Tested with browsers missing (installs correctly)
- [ ] Tested on macOS (primary development platform)
- [ ] Tested in CI environment (if available)

## Success Metrics

1. **Zero browser-not-found failures** after guard is in place
2. **Fast no-op check**: <5 seconds when browsers already installed
3. **Developer onboarding**: New developers can run tests without manual browser setup
4. **CI reliability**: 100% pass rate on fresh CI environments (no browser install errors)

## Definition of Done

- [ ] Guard script created at `scripts/ensure_playwright_browsers.sh`
- [ ] Script integrated into `apps/web/scripts/run_playwright.sh`
- [ ] Script tested with both installed and missing browsers
- [ ] Documentation updated (README or docs/PLAYWRIGHT.md)
- [ ] All acceptance criteria verified
- [ ] No new failures in existing Playwright tests
- [ ] Commit includes evidence of successful test run

## Non-Goals

- Installing browsers for other test frameworks (only Playwright)
- Supporting browsers beyond chromium/webkit (current project requirements)
- Cross-platform support beyond macOS (nice-to-have, not required for Phase 0)
- Automated browser updates (out of scope for this task)

## Related Files

- `apps/web/scripts/run_playwright.sh` - Main test runner
- `apps/web/playwright.config.cjs` - Playwright configuration
- `tools/wvo_mcp/src/utils/browser.ts` - Browser manager (shows error guidance)
- `apps/web/package.json` - Test scripts

## Dependencies

- Playwright CLI available (already satisfied: v1.56.1)
- `npx playwright install` command works (verified)
- Network access for browser downloads (CI requirement)
