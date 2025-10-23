#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT"
LOG_DIR="$ROOT/state/worker_logs"
CLEANUP_SCRIPT="$ROOT/tools/wvo_mcp/scripts/cleanup_workspace.py"

echo "[restart_mcp] Starting MCP restart at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ -x "$CLEANUP_SCRIPT" ]; then
  echo "[restart_mcp] Running workspace cleanup script."
  if ! python "$CLEANUP_SCRIPT"; then
    echo "[restart_mcp] Warning: cleanup script reported an error." >&2
  fi
fi

echo "[restart_mcp] Stopping existing MCP workers (if any)."
pkill -f "tools/wvo_mcp/dist/index.js" 2>/dev/null || true
pkill -f "tools/wvo_mcp/dist/index-claude.js" 2>/dev/null || true
pkill -f "tools/wvo_mcp/dist/worker/worker_entry.js" 2>/dev/null || true

# Wait for processes to actually terminate
for i in {1..10}; do
  if pgrep -f "tools/wvo_mcp/dist/index.js" >/dev/null 2>&1; then
    sleep 0.5
  else
    break
  fi
done

# Force kill any stragglers
pkill -9 -f "tools/wvo_mcp/dist/index.js" 2>/dev/null || true
sleep 1

echo "[restart_mcp] Rebuilding MCP distribution."
npm run build --prefix "$ROOT/tools/wvo_mcp" >/dev/null
if [ ! -f "$ROOT/tools/wvo_mcp/dist/index.js" ]; then
  echo "[restart_mcp] ERROR: MCP entry missing after rebuild (expected tools/wvo_mcp/dist/index.js)." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
WORKER_LOG="$LOG_DIR/worker_$(date -u +"%Y%m%dT%H%M%SZ").log"
echo "[restart_mcp] Launching MCP worker (log: $WORKER_LOG)."
nohup node "$ROOT/tools/wvo_mcp/dist/index.js" --workspace "$WORKSPACE" >>"$WORKER_LOG" 2>&1 &
WORKER_PID=$!
echo "$WORKER_PID" > "$ROOT/state/worker_pid"

# Verify worker is still running after 2 seconds
sleep 2
if kill -0 "$WORKER_PID" 2>/dev/null; then
  echo "[restart_mcp] MCP worker started and verified (pid=$WORKER_PID)."
  exit 0
else
  echo "[restart_mcp] ERROR: Worker exited immediately. Check log: $WORKER_LOG" >&2
  tail -20 "$WORKER_LOG" >&2 || true
  exit 1
fi
