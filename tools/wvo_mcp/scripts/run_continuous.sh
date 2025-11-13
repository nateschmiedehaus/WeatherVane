#!/bin/bash

# Continuous Overnight Runner
# Keeps processing tasks in a loop until manually stopped

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WVO_MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$WVO_MCP_DIR/../.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 WAVE 0.1 CONTINUOUS AUTONOMOUS RUN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will keep running tasks overnight in cycles."
echo "Press Ctrl+C to stop."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Set environment
export WORKSPACE_ROOT="$WORKSPACE_ROOT"
export NODE_ENV=production
export WAVE0_MODE=continuous

# Create logs directory
mkdir -p "$STATE_DIR/logs"

# Save PID for this script
echo $$ > "$STATE_DIR/wave0_continuous.pid"

CYCLE=0
TOTAL_COMPLETED=0
TOTAL_BLOCKED=0
TOTAL_FAILED=0

# Cleanup on exit
trap 'log_info "🛑 Stopping continuous run..."; rm -f "$STATE_DIR/wave0_continuous.pid"; exit 0' INT TERM

while true; do
    CYCLE=$((CYCLE + 1))
    log_info "━━━━━━━━━━ Cycle $CYCLE ━━━━━━━━━━"

    # Run one autonomous cycle
    LOG_FILE="$STATE_DIR/logs/cycle_${CYCLE}_$(date +%Y%m%d_%H%M%S).log"
    node "$WVO_MCP_DIR/dist/wave0/autonomous_runner.js" > "$LOG_FILE" 2>&1

    # Check results from checkpoint
    if [ -f "$STATE_DIR/wave0_checkpoint.json" ]; then
        if command -v jq >/dev/null 2>&1; then
            COMPLETED=$(jq -r '.tasksCompleted // 0' "$STATE_DIR/wave0_checkpoint.json")
            BLOCKED=$(jq -r '.tasksBlocked // 0' "$STATE_DIR/wave0_checkpoint.json")
            FAILED=$(jq -r '.tasksFailed // 0' "$STATE_DIR/wave0_checkpoint.json")

            TOTAL_COMPLETED=$((TOTAL_COMPLETED + COMPLETED))
            TOTAL_BLOCKED=$((TOTAL_BLOCKED + BLOCKED))
            TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

            log_info "Cycle $CYCLE: ✅ $COMPLETED completed, ⚠️  $BLOCKED blocked, ❌ $FAILED failed"
            log_info "Total: ✅ $TOTAL_COMPLETED completed, ⚠️  $TOTAL_BLOCKED blocked, ❌ $FAILED failed"
        fi
    fi

    # Sleep between cycles (5 minutes)
    log_info "💤 Sleeping 5 minutes before next cycle..."
    sleep 300

done