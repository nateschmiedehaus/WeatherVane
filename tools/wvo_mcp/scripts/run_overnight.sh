#!/bin/bash

# Run Wave 0.1 Overnight Autonomous Execution
# Processes all W0 and W1 tasks while you sleep

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WVO_MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$WVO_MCP_DIR/../.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌙 WAVE 0.1 OVERNIGHT AUTONOMOUS RUN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Stop any existing Wave 0
log_info "Stopping existing Wave 0..."
"$SCRIPT_DIR/stop_wave0.sh" 2>/dev/null || true

# Set environment
export WORKSPACE_ROOT="$WORKSPACE_ROOT"
export NODE_ENV=production
export WAVE0_MODE=autonomous

# Create logs directory
mkdir -p "$STATE_DIR/logs"

# Start autonomous runner in background
log_info "Starting autonomous overnight runner..."
nohup node "$WVO_MCP_DIR/dist/wave0/autonomous_runner.js" \
    > "$STATE_DIR/logs/overnight_$(date +%Y%m%d_%H%M%S).log" \
    2> "$STATE_DIR/logs/overnight_$(date +%Y%m%d_%H%M%S).error.log" &

PID=$!
echo $PID > "$STATE_DIR/wave0_overnight.pid"

# Wait a moment for startup
sleep 2

# Verify it's running
if kill -0 $PID 2>/dev/null; then
    log_info "✅ Overnight runner started successfully (PID: $PID)"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 OVERNIGHT RUN ACTIVE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "PID: $PID"
    echo "Target: WAVE-0 and WAVE-1 tasks"
    echo "Mode: Fully autonomous"
    echo ""
    echo "📊 Monitoring:"
    echo "  Progress: tail -f $STATE_DIR/wave0_checkpoint.json"
    echo "  Logs: tail -f $STATE_DIR/logs/overnight_*.log"
    echo "  Errors: tail -f $STATE_DIR/logs/overnight_*.error.log"
    echo ""
    echo "🛑 Stop: kill $PID"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💤 Sleep well! Wave 0.1 is working through the night."
    echo ""
else
    log_warn "Failed to start overnight runner"
    exit 1
fi