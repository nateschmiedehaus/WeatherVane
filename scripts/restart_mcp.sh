#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

npm run build --prefix "$REPO_ROOT/tools/wvo_mcp"

pkill -f "node .*tools/wvo_mcp/dist/index" || true
pkill -f "node .*tools/wvo_mcp/dist/index-claude" || true

npm run start:codex --prefix "$REPO_ROOT/tools/wvo_mcp" -- --workspace "$REPO_ROOT" >/tmp/mcp-codex.log 2>&1 &
npm run start:claude --prefix "$REPO_ROOT/tools/wvo_mcp" -- --workspace "$REPO_ROOT" >/tmp/mcp-claude.log 2>&1 &
