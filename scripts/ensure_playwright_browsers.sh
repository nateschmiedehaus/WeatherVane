#!/usr/bin/env bash
#
# Playwright Browser Installation Guard
#
# Ensures Playwright browsers (chromium, webkit) are installed before running tests.
# Idempotent - safe to run multiple times (no-op if already installed).
#
# Usage:
#   ./scripts/ensure_playwright_browsers.sh
#   SKIP_BROWSER_CHECK=1 ./scripts/ensure_playwright_browsers.sh  # skip check
#
# Exit codes:
#   0 - Success (browsers installed or already present)
#   1 - Playwright CLI not found
#   2 - Browser installation failed

set -euo pipefail

# Allow skipping via environment variable
if [[ "${SKIP_BROWSER_CHECK:-}" == "1" ]]; then
  echo "[playwright-guard] Skipping browser check (SKIP_BROWSER_CHECK=1)"
  exit 0
fi

# Check if Playwright CLI is available
if ! command -v npx &>/dev/null; then
  echo "ERROR: npx not found. Please install Node.js first." >&2
  exit 1
fi

if ! npx playwright --version &>/dev/null; then
  echo "ERROR: Playwright CLI not found. Run 'npm install' first." >&2
  exit 1
fi

echo "[playwright-guard] Ensuring browsers are installed..."

# Playwright handles idempotency internally - it will skip if browsers already installed
# Run installation (no-op if browsers already present)
if npx playwright install chromium webkit --with-deps; then
  echo "[playwright-guard] ✓ Browsers ready"
else
  EXIT_CODE=$?
  echo "ERROR: Browser installation failed (exit code: $EXIT_CODE)" >&2
  echo "Troubleshooting:" >&2
  echo "  - Check network connection" >&2
  echo "  - Ensure sufficient disk space (1GB+ recommended)" >&2
  echo "  - Try manual installation: npx playwright install chromium webkit" >&2
  exit 2
fi

exit 0
