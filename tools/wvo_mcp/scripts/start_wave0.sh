#!/bin/bash

# Wave 0.1 Start Script
# Starts the Wave 0.1 autonomous system

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

# Check if Wave 0 is already running
if [ -f "$STATE_DIR/wave0.pid" ]; then
    PID=$(cat "$STATE_DIR/wave0.pid")
    if kill -0 $PID 2>/dev/null; then
        log_warn "Wave 0.1 is already running (PID: $PID)"
        exit 0
    else
        log_info "Removing stale PID file"
        rm -f "$STATE_DIR/wave0.pid"
    fi
fi

# Ensure build is up to date
log_info "Building Wave 0.1..."
cd "$WVO_MCP_DIR"
npm run build >/dev/null 2>&1

# Set environment variables
export WAVE0_MODE=production
export NODE_ENV=production
export WORKSPACE_ROOT="$WORKSPACE_ROOT"
export STATE_DIR="$STATE_DIR"
export DEBUG=""

# Create necessary directories
mkdir -p "$STATE_DIR/evidence"
mkdir -p "$STATE_DIR/analytics"

# Start Wave 0 in background
log_info "Starting Wave 0.1..."
nohup node "$WVO_MCP_DIR/dist/wave0/simple_runner.js" \
    > "$STATE_DIR/wave0.log" \
    2> "$STATE_DIR/wave0.error.log" &

PID=$!
echo $PID > "$STATE_DIR/wave0.pid"

# Wait a moment for startup
sleep 2

# Verify it's running
if kill -0 $PID 2>/dev/null; then
    log_info "Wave 0.1 started successfully (PID: $PID)"
    log_info "Logs: $STATE_DIR/wave0.log"
    log_info "Errors: $STATE_DIR/wave0.error.log"
    log_info "Dashboard: $STATE_DIR/wave0_dashboard.html"
else
    log_error "Wave 0.1 failed to start"
    rm -f "$STATE_DIR/wave0.pid"
    tail -20 "$STATE_DIR/wave0.error.log"
    exit 1
fi

# Show initial status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 WAVE 0.1 IS RUNNING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "PID: $PID"
echo "Mode: production"
echo "Version: 0.1.0"
echo ""
echo "Monitor with: $SCRIPT_DIR/status_wave0.sh"
echo "Stop with: $SCRIPT_DIR/stop_wave0.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"