#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CLI_BIN=${CLAUDE_BIN:-claude}

pushd "$WORKSPACE/tools/wvo_mcp" > /dev/null
npm run build

if ! command -v "$CLI_BIN" >/dev/null 2>&1; then
  echo "Claude CLI not found (looked for '$CLI_BIN'). Set CLAUDE_BIN to your claude executable." >&2
  exit 1
fi

echo "Registering WeatherVane MCP with Claude Code..."
"$CLI_BIN" mcp add weathervane -- node dist/index-claude.js --workspace "$WORKSPACE"

echo "Starting Claude Code chat session (press Ctrl+C to exit)..."
"$CLI_BIN" chat --mcp weathervane
popd > /dev/null
