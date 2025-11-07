#!/bin/bash

# Wave 0.1 Stop Script
# Gracefully stops the Wave 0.1 autonomous system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WVO_MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$WVO_MCP_DIR/../.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Wave 0 is running
if [ ! -f "$STATE_DIR/wave0.pid" ]; then
    log_warn "Wave 0.1 is not running (no PID file)"
    exit 0
fi

PID=$(cat "$STATE_DIR/wave0.pid")

# Check if process exists
if ! kill -0 $PID 2>/dev/null; then
    log_warn "Wave 0.1 is not running (PID $PID not found)"
    rm -f "$STATE_DIR/wave0.pid"
    exit 0
fi

# Graceful shutdown
log_info "Stopping Wave 0.1 (PID: $PID)..."
kill -TERM $PID 2>/dev/null

# Wait for shutdown (up to 10 seconds)
TIMEOUT=10
COUNTER=0
while kill -0 $PID 2>/dev/null && [ $COUNTER -lt $TIMEOUT ]; do
    sleep 1
    COUNTER=$((COUNTER + 1))
    echo -n "."
done
echo ""

# Force kill if still running
if kill -0 $PID 2>/dev/null; then
    log_warn "Graceful shutdown failed, forcing..."
    kill -9 $PID 2>/dev/null
    sleep 1
fi

# Clean up
rm -f "$STATE_DIR/wave0.pid"

# Kill any orphaned clones
log_info "Cleaning up clones..."
pkill -f "wave0-clone-" 2>/dev/null || true
rm -rf /tmp/wave0-clone-* 2>/dev/null || true

log_info "Wave 0.1 stopped successfully"

# Show final log entries
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Final log entries:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
tail -10 "$STATE_DIR/wave0.log" 2>/dev/null || echo "No logs available"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"