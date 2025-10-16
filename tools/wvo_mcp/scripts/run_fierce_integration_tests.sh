#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"
cd "$WORKSPACE_ROOT"

# Lightweight mode for sandbox/CI environments that cannot run the full pytest + Playwright stack.
if [[ "${INTEGRATION_FURY_LITE:-}" == "1" ]]; then
  echo "[integration_fury] running lightweight checks"
  npm --prefix tools/wvo_mcp run build >/dev/null
  npm --prefix tools/wvo_mcp run test -- src/tests/consensus_engine.test.ts >/dev/null
  exit 0
fi

# Rare but fierce: run full app + worker + shared integration suites, lc design system, e2e smoke
PYTHONPATH=.deps:. pytest apps tests -m "not slow" --maxfail=1
npm --prefix tools/wvo_mcp run test --  --runInBand
# Include Playwright if available
if command -v npx >/dev/null && npx --yes playwright --version >/dev/null 2>&1; then
  npx playwright test --config=apps/web/playwright.config.ts
fi
