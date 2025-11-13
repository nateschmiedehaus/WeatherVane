#!/usr/bin/env bash
# Restart MCP server (rebuild SQLite, restart processes)

set -e

cd "$(dirname "$0")/.."

echo "=== Restarting MCP Server ==="

# 1. Kill existing MCP processes
pkill -f "node.*mcp" || true
pkill -f "node.*plan_next|autopilot_status" || true

# 2. Rebuild better-sqlite3 for current Node
echo "Rebuilding better-sqlite3..."
node scripts/ensure-sqlite-build.mjs

# 3. Rebuild TypeScript
echo "Rebuilding TypeScript..."
npm run build

# 4. Test MCP tools
echo "Testing MCP tools..."
./plan_next '{"minimal":true}' --raw > /dev/null 2>&1 && echo "✅ MCP tools working" || echo "❌ MCP tools broken"

echo "=== MCP Server Ready ==="
