#!/usr/bin/env bash
#
# Resource Guard - Prevents system overload
#
# Checks system resources before starting autopilot
# Prevents concurrent autopilot runs
# Monitors and enforces resource limits
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

LOCKFILE="$ROOT/state/.autopilot.lock"
MAX_CONCURRENT_CLAUDE=2
MIN_FREE_MEMORY_MB=500
MAX_CPU_PERCENT=80

#
# Check if autopilot is already running
#
check_concurrent() {
    if [ -f "$LOCKFILE" ]; then
        LOCK_PID=$(cat "$LOCKFILE")
        if ps -p "$LOCK_PID" > /dev/null 2>&1; then
            echo -e "${RED}✗ Autopilot already running (PID: $LOCK_PID)${NC}"
            echo ""
            echo "To force start (dangerous):"
            echo "  rm $LOCKFILE"
            echo ""
            return 1
        else
            # Stale lockfile
            echo -e "${YELLOW}⚠️  Removing stale lockfile (PID $LOCK_PID not found)${NC}"
            rm -f "$LOCKFILE"
        fi
    fi
    return 0
}

#
# Check Claude CLI instance count
#
check_claude_instances() {
    CLAUDE_COUNT=$(ps aux | grep -c "[c]laude" || true)
    if [ "$CLAUDE_COUNT" -ge "$MAX_CONCURRENT_CLAUDE" ]; then
        echo -e "${RED}✗ Too many Claude CLI instances running ($CLAUDE_COUNT/$MAX_CONCURRENT_CLAUDE)${NC}"
        echo ""
        echo "Active Claude processes:"
        ps aux | grep "[c]laude" | awk '{printf "  PID %s: %s%% CPU, %s MB RAM\n", $2, $3, int($6/1024)}'
        echo ""
        echo "Close other Claude sessions before starting autopilot."
        return 1
    fi
    return 0
}

#
# Check system memory
#
check_memory() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        FREE_MB=$(vm_stat | awk '/Pages free/ {print int($3 * 4096 / 1048576)}')
        TOTAL_MB=$(sysctl -n hw.memsize | awk '{print int($1/1048576)}')
        USED_PERCENT=$(( (TOTAL_MB - FREE_MB) * 100 / TOTAL_MB ))

        echo "Memory: ${FREE_MB} MB free / ${TOTAL_MB} MB total (${USED_PERCENT}% used)"

        if [ "$FREE_MB" -lt "$MIN_FREE_MEMORY_MB" ]; then
            echo -e "${RED}✗ Insufficient free memory (${FREE_MB} MB < ${MIN_FREE_MEMORY_MB} MB)${NC}"
            echo ""
            echo "Free up memory by:"
            echo "  - Closing unused applications"
            echo "  - Restarting your computer"
            return 1
        fi
    else
        # Linux
        FREE_MB=$(free -m | awk '/^Mem:/ {print $4}')
        TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
        USED_PERCENT=$(( (TOTAL_MB - FREE_MB) * 100 / TOTAL_MB ))

        echo "Memory: ${FREE_MB} MB free / ${TOTAL_MB} MB total (${USED_PERCENT}% used)"

        if [ "$FREE_MB" -lt "$MIN_FREE_MEMORY_MB" ]; then
            echo -e "${RED}✗ Insufficient free memory (${FREE_MB} MB < ${MIN_FREE_MEMORY_MB} MB)${NC}"
            return 1
        fi
    fi

    echo -e "${GREEN}✓ Memory OK${NC}"
    return 0
}

#
# Check CPU load
#
check_cpu() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - use top
        CPU_IDLE=$(top -l 2 -n 0 -F -s 1 | tail -1 | awk '/CPU usage/ {print int($7)}')
        CPU_USED=$((100 - CPU_IDLE))

        echo "CPU: ${CPU_USED}% busy"

        if [ "$CPU_USED" -ge "$MAX_CPU_PERCENT" ]; then
            echo -e "${YELLOW}⚠️  High CPU usage (${CPU_USED}% >= ${MAX_CPU_PERCENT}%)${NC}"
            echo ""
            echo "Top CPU processes:"
            ps aux | sort -nrk 3,3 | head -5 | awk '{printf "  PID %s: %s%% CPU - %s\n", $2, $3, $11}'
            echo ""
            echo "Consider closing heavy applications before starting autopilot."
            # Warning only, don't fail
        fi
    else
        # Linux
        CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
        echo "CPU: Load average ${CPU_LOAD}"
    fi

    echo -e "${GREEN}✓ CPU check complete${NC}"
    return 0
}

#
# Create lockfile
#
create_lock() {
    echo $$ > "$LOCKFILE"

    # Cleanup on exit
    trap "rm -f $LOCKFILE" EXIT INT TERM
}

#
# Main
#
main() {
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  Resource Guard${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Run all checks
    local failed=0

    check_concurrent || failed=1
    check_claude_instances || failed=1
    check_memory || failed=1
    check_cpu || true  # CPU is warning only

    echo ""

    if [ "$failed" -eq 1 ]; then
        echo -e "${RED}━━━ Resource guard FAILED ━━━${NC}"
        return 1
    fi

    create_lock

    echo -e "${GREEN}━━━ Resource guard PASSED ━━━${NC}"
    echo ""
    return 0
}

main "$@"
