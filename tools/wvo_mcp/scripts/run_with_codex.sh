#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

pushd "$WORKSPACE/tools/wvo_mcp" > /dev/null
npm run build
codex mcp add weathervane -- node dist/index.js --workspace "$WORKSPACE"
codex session --profile weathervane_orchestrator
popd > /dev/null
