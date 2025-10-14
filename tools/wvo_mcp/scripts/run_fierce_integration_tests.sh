#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"
cd "$WORKSPACE_ROOT"

# Rare but fierce: run full app + worker + shared integration suites, lc design system, e2e smoke
PYTHONPATH=.deps:. pytest apps tests -m "not slow" --maxfail=1
npm --prefix tools/wvo_mcp run test --  --runInBand
# Include Playwright if available
if command -v npx >/dev/null && npx --yes playwright --version >/dev/null 2>&1; then
  npx playwright test --config=apps/web/playwright.config.ts
fi
