#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${APP_ROOT}/../.." && pwd)"
PLAYWRIGHT_NODE_MODULES="${REPO_ROOT}/tools/wvo_mcp/node_modules"
PLAYWRIGHT_BIN="${PLAYWRIGHT_NODE_MODULES}/.bin/playwright"

if [[ ! -x "${PLAYWRIGHT_BIN}" ]]; then
  echo "Playwright CLI not found at ${PLAYWRIGHT_BIN}" >&2
  exit 1
fi

# Ensure Playwright browsers are installed
echo "[playwright] Ensuring browsers are installed..."
"${REPO_ROOT}/scripts/ensure_playwright_browsers.sh" || {
  echo "Failed to ensure Playwright browsers are installed" >&2
  exit 1
}

EXPORT_DIR="${APP_ROOT}/playwright-export"
DEFAULT_OUT="${APP_ROOT}/out"

pushd "${APP_ROOT}" >/dev/null

rm -rf "${EXPORT_DIR}"
mkdir -p "${EXPORT_DIR}"
rm -rf "${DEFAULT_OUT}"

echo "[playwright] Building production bundle..."
npm run build

if [[ ! -d "${DEFAULT_OUT}" ]]; then
  echo "next build did not produce ${DEFAULT_OUT}" >&2
  exit 1
fi

cp -R "${DEFAULT_OUT}/." "${EXPORT_DIR}"/
rm -rf "${DEFAULT_OUT}"

export NODE_PATH="${PLAYWRIGHT_NODE_MODULES}:${NODE_PATH:-}"
PLAYWRIGHT_BASE_URL="$(python3 - "${EXPORT_DIR}" <<'PY'
import sys
from pathlib import Path
from urllib.parse import urljoin

path = Path(sys.argv[1]).resolve()
print(urljoin(path.as_uri() + '/', './'))
PY
)"
export PLAYWRIGHT_BASE_URL

set +e
node "${PLAYWRIGHT_BIN}" test --config "${APP_ROOT}/playwright.config.cjs" "$@"
RESULT=$?
set -e

rm -rf "${EXPORT_DIR}"

popd >/dev/null

exit ${RESULT}
