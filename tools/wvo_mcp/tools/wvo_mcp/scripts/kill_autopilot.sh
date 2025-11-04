#!/usr/bin/env bash
# Emergency autopilot shutdown
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKSPACE_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"
PID_FILE="$STATE_DIR/worker_pid"

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_error() { echo -e "${RED}ERROR:${NC} $*"; }
log_success() { echo -e "${GREEN}✓${NC} $*"; }
log_warn() { echo -e "${YELLOW}WARN:${NC} $*"; }

echo "=========================================="
echo "Autopilot Emergency Shutdown"
echo "=========================================="

# Kill supervisor
SUPERVISOR_PID=$(pgrep -f "supervise_autopilot.sh" || echo "")
if [ -n "$SUPERVISOR_PID" ]; then
  log "Killing supervisor (PID: $SUPERVISOR_PID)..."
  kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
  sleep 2
  kill -KILL "$SUPERVISOR_PID" 2>/dev/null || true
  log_success "Supervisor killed"
fi

# Kill worker from PID file
if [ -f "$PID_FILE" ]; then
  WORKER_PID=$(cat "$PID_FILE")
  log "Killing worker (PID: $WORKER_PID)..."
  
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    kill -TERM "$WORKER_PID" 2>/dev/null || true
    sleep 5
    kill -KILL "$WORKER_PID" 2>/dev/null || true
    pkill -KILL -P "$WORKER_PID" 2>/dev/null || true
    log_success "Worker killed"
  fi
  
  rm -f "$PID_FILE"
fi

# Kill any remaining processes
pkill -KILL -f "autopilot_unified.js" 2>/dev/null || true

# Kill orphans
ORPHANS=$(pgrep -P 1 -f "wvo_mcp" || echo "")
if [ -n "$ORPHANS" ]; then
  log_warn "Killing orphans: $ORPHANS"
  for PID in $ORPHANS; do
    kill -KILL "$PID" 2>/dev/null || true
  done
fi

# Clean state
rm -f "$STATE_DIR/heartbeat" "$STATE_DIR/worker_pid"

log_success "Shutdown complete"
pgrep -af "autopilot|wvo_mcp" || echo "✓ No processes running"
