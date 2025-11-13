#!/bin/bash

# Wave 0.1 Status Script
# Shows the current status of Wave 0.1 autonomous system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WVO_MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_ROOT="$(cd "$WVO_MCP_DIR/../.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status symbols
CHECK="✅"
CROSS="❌"
WARN="⚠️"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 WAVE 0.1 STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if running
if [ -f "$STATE_DIR/wave0.pid" ]; then
    PID=$(cat "$STATE_DIR/wave0.pid")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}$CHECK Wave 0.1 is RUNNING${NC}"
        echo "   PID: $PID"

        # Get process info
        PS_INFO=$(ps -p $PID -o %cpu,%mem,etime | tail -1)
        echo "   CPU: $(echo $PS_INFO | awk '{print $1}')%"
        echo "   Memory: $(echo $PS_INFO | awk '{print $2}')%"
        echo "   Uptime: $(echo $PS_INFO | awk '{print $3}')"
    else
        echo -e "${RED}$CROSS Wave 0.1 is NOT RUNNING${NC}"
        echo "   Stale PID file found"
    fi
else
    echo -e "${RED}$CROSS Wave 0.1 is NOT RUNNING${NC}"
    echo "   No PID file found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check key files
FILES=(
    "$STATE_DIR/wave0.log:Main log"
    "$STATE_DIR/wave0.error.log:Error log"
    "$STATE_DIR/wave0_config.json:Configuration"
    "$STATE_DIR/wave0_metrics.json:Metrics"
    "$STATE_DIR/wave0_dashboard.html:Dashboard"
)

for FILE_INFO in "${FILES[@]}"; do
    IFS=':' read -r FILE DESC <<< "$FILE_INFO"
    if [ -f "$FILE" ]; then
        SIZE=$(ls -lh "$FILE" | awk '{print $5}')
        echo -e "${GREEN}$CHECK${NC} $DESC ($SIZE)"
    else
        echo -e "${YELLOW}$WARN${NC} $DESC (missing)"
    fi
done

# Check for clones
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 CLONES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLONE_COUNT=$(ps aux | grep -c "wave0-clone-" | grep -v grep)
if [ $CLONE_COUNT -gt 0 ]; then
    echo -e "${YELLOW}$WARN Active clones: $CLONE_COUNT${NC}"
    ps aux | grep "wave0-clone-" | grep -v grep | head -3
else
    echo -e "${GREEN}$CHECK No active clones${NC}"
fi

# Check metrics if available
if [ -f "$STATE_DIR/wave0_metrics.json" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📈 METRICS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Use Python to parse JSON if available
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json
import sys

try:
    with open('$STATE_DIR/wave0_metrics.json', 'r') as f:
        data = json.load(f)
        current = data.get('current', {})

        print(f\"Tasks Completed: {current.get('tasksCompleted', 0)}\")
        print(f\"Quality Score: {current.get('qualityScore', 0)}/100\")
        print(f\"Throughput: {current.get('throughput', 0):,.0f} ops/sec\")
        print(f\"Memory: {current.get('memory', {}).get('heapUsed', 0) / 1024 / 1024:.1f} MB\")

        providers = current.get('providers', {})
        if providers:
            print(f\"\nProvider Usage:\")
            for name, info in providers.items():
                print(f\"  {name}: {info.get('tokensUsed', 0):,} tokens\")
except Exception as e:
    print(f\"Error reading metrics: {e}\")
" 2>/dev/null || echo "Unable to parse metrics"
    else
        echo "Python not available - cannot parse metrics"
    fi
fi

# Show recent logs
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 RECENT ACTIVITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$STATE_DIR/wave0.log" ]; then
    tail -5 "$STATE_DIR/wave0.log" 2>/dev/null | head -5
else
    echo "No log file available"
fi

# Show errors if any
if [ -f "$STATE_DIR/wave0.error.log" ] && [ -s "$STATE_DIR/wave0.error.log" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${RED}⚠️ RECENT ERRORS${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    tail -3 "$STATE_DIR/wave0.error.log" 2>/dev/null
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 CONTROLS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Start:  $SCRIPT_DIR/start_wave0.sh"
echo "Stop:   $SCRIPT_DIR/stop_wave0.sh"
echo "Logs:   tail -f $STATE_DIR/wave0.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"