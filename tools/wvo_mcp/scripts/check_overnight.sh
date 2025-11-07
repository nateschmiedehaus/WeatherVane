#!/bin/bash

# Check overnight run progress

WORKSPACE_ROOT="/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane"
STATE_DIR="$WORKSPACE_ROOT/state"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌙 OVERNIGHT RUN STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if running
if [ -f "$STATE_DIR/wave0_overnight.pid" ]; then
    PID=$(cat "$STATE_DIR/wave0_overnight.pid")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}✅ Overnight runner is ACTIVE${NC}"
        echo "   PID: $PID"
        echo "   Uptime: $(ps -p $PID -o etime= | xargs)"
    else
        echo -e "${RED}❌ Overnight runner STOPPED${NC}"
        echo "   PID file exists but process is dead"
    fi
else
    echo -e "${RED}❌ Overnight runner NOT RUNNING${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PROGRESS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check checkpoint file
if [ -f "$STATE_DIR/wave0_checkpoint.json" ]; then
    echo ""
    if command -v jq >/dev/null 2>&1; then
        cat "$STATE_DIR/wave0_checkpoint.json" | jq -r '
            "Timestamp: \(.timestamp)",
            "",
            "Tasks Completed: \(.tasksCompleted)",
            "Tasks Blocked:   \(.tasksBlocked)",
            "Tasks Failed:    \(.tasksFailed)",
            "",
            "Total Processed: \(.tasksCompleted + .tasksBlocked + .tasksFailed)"
        '
    else
        cat "$STATE_DIR/wave0_checkpoint.json"
    fi
else
    echo "No checkpoint data yet"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 RECENT ACTIVITY (last 10 lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Show recent log entries
LATEST_LOG=$(ls -t "$STATE_DIR/logs"/overnight_*.log 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
    tail -10 "$LATEST_LOG"
else
    echo "No log files found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 COMMANDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Watch progress:  watch -n 5 $0"
echo "View logs:       tail -f $STATE_DIR/logs/overnight_*.log"
echo "View errors:     tail -f $STATE_DIR/logs/overnight_*.error.log"
if [ -f "$STATE_DIR/wave0_overnight.pid" ]; then
    PID=$(cat "$STATE_DIR/wave0_overnight.pid")
    echo "Stop runner:     kill $PID"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"