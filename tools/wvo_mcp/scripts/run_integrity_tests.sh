#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

# Activate dedicated AFP test virtualenv when present
VENV_ACT="$ROOT_DIR/state/py/afp-tests/bin/activate"
if [[ -f "$VENV_ACT" ]]; then
  # shellcheck disable=SC1090
  source "$VENV_ACT"
  AFP_TEST_VENV_ACTIVE=1
  VENV_SITE_PACKAGES="$(python - <<'PY'
import site
paths = site.getsitepackages()
print(':'.join(paths))
PY
)"
  if [[ -n "$VENV_SITE_PACKAGES" ]]; then
    if [[ -n "${PYTHONPATH:-}" ]]; then
      export PYTHONPATH="${VENV_SITE_PACKAGES}:${PYTHONPATH}"
    else
      export PYTHONPATH="${VENV_SITE_PACKAGES}"
    fi
  fi
else
  AFP_TEST_VENV_ACTIVE=0
fi

function section() {
  printf '\n== %s ==\n' "$1"
}

section "Python test suite"
if [[ "${AFP_TEST_VENV_ACTIVE}" -eq 1 ]]; then
  pytest tools/wvo_mcp
else
  pytest apps tests
fi

section "Web unit tests"
npm test --prefix apps/web

section "MCP vitest suite"
npm run test --prefix tools/wvo_mcp

section "Metrics sanity check"
python -m shared.observability.metrics --base-dir tmp/metrics

section "All test batches completed"

if [[ "${AFP_TEST_VENV_ACTIVE}" -eq 1 ]]; then
  deactivate || true
fi
