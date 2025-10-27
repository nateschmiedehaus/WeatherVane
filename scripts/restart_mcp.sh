#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$ROOT"
LOG_DIR="$ROOT/state/worker_logs"
CLEANUP_SCRIPT="$ROOT/tools/wvo_mcp/scripts/cleanup_workspace.py"

echo "[restart_mcp] Starting MCP restart at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

count_mcp_processes() {
  local matches
  matches=$(pgrep -f "wvo_mcp/dist" 2>/dev/null || true)
  if [ -z "$matches" ]; then
    echo "0"
    return
  fi
  printf '%s\n' "$matches" | wc -l | tr -d '[:space:]'
}

if [ -x "$CLEANUP_SCRIPT" ]; then
  echo "[restart_mcp] Running workspace cleanup script."
  if ! python "$CLEANUP_SCRIPT"; then
    echo "[restart_mcp] Warning: cleanup script reported an error." >&2
  fi
fi

echo "[restart_mcp] Stopping existing MCP workers (if any)."
# Use broader pattern to match all variations (full paths, partial paths)
pkill -f "wvo_mcp/dist" 2>/dev/null || true

# Wait for processes to actually terminate
for i in {1..10}; do
  REMAINING=$(count_mcp_processes)
  if [ "$REMAINING" -gt 0 ]; then
    echo "[restart_mcp] Waiting for $REMAINING processes to terminate..."
    sleep 0.5
  else
    echo "[restart_mcp] All processes terminated gracefully."
    break
  fi
done

# Force kill any stragglers
REMAINING=$(count_mcp_processes)
if [ "$REMAINING" -gt 0 ]; then
  echo "[restart_mcp] Force killing $REMAINING stubborn processes..."
  pkill -9 -f "wvo_mcp/dist" 2>/dev/null || true
  sleep 1
fi

# Final verification: Ensure ALL processes are dead
FINAL_COUNT=$(count_mcp_processes)
if [ "$FINAL_COUNT" -gt 0 ]; then
  echo "[restart_mcp] ERROR: Failed to kill all processes. $FINAL_COUNT remaining:" >&2
  ps aux | grep "wvo_mcp/dist" | grep -v grep >&2
  exit 1
fi

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
