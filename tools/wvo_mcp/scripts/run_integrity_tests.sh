#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

function section() {
  printf '\n== %s ==\n' "$1"
}

section "Python test suite"
pytest apps tests

section "Web unit tests"
npm test --prefix apps/web

section "MCP vitest suite"
npm run test --prefix tools/wvo_mcp

section "Metrics sanity check"
python -m shared.observability.metrics --base-dir tmp/metrics

section "All test batches completed"
