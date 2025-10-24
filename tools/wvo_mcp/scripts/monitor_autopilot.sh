#!/bin/bash
# Autopilot Resource Monitor
# Tracks all the metrics we fixed to verify no crashes/leaks

WORKSPACE="/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane"
LOG_FILE="$WORKSPACE/state/analytics/autopilot_monitor.log"
DURATION=${1:-300}  # Default 5 minutes

echo "=== Autopilot Resource Monitor ===" | tee -a "$LOG_FILE"
echo "Start time: $(date)" | tee -a "$LOG_FILE"
echo "Duration: ${DURATION}s" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

for i in $(seq 1 $((DURATION / 10))); do
    echo "--- Check $i at $(date) ---" | tee -a "$LOG_FILE"

    # 1. WAL file size
    if [ -f "$WORKSPACE/state/orchestrator.db-wal" ]; then
        WAL_SIZE=$(ls -lh "$WORKSPACE/state/orchestrator.db-wal" | awk '{print $5}')
        echo "WAL file size: $WAL_SIZE" | tee -a "$LOG_FILE"
    else
        echo "WAL file: Not found or 0 bytes" | tee -a "$LOG_FILE"
    fi

    # 2. Process count
    PROC_COUNT=$(ps aux | grep "node.*wvo" | grep -v grep | wc -l | tr -d ' ')
    echo "MCP processes: $PROC_COUNT" | tee -a "$LOG_FILE"

    # 3. Memory usage
    MEM_USAGE=$(ps aux | grep "node.*wvo" | grep -v grep | awk '{sum+=$6} END {print sum/1024 " MB"}')
    echo "Memory usage: $MEM_USAGE" | tee -a "$LOG_FILE"

    # 4. Health report
    if [ -f "$WORKSPACE/state/analytics/autopilot_health_report.json" ]; then
        HEALTH_SIZE=$(ls -lh "$WORKSPACE/state/analytics/autopilot_health_report.json" | awk '{print $5}')
        HEALTH_TIME=$(ls -l "$WORKSPACE/state/analytics/autopilot_health_report.json" | awk '{print $6, $7, $8}')
        echo "Health report: $HEALTH_SIZE (modified: $HEALTH_TIME)" | tee -a "$LOG_FILE"
    else
        echo "Health report: Not found" | tee -a "$LOG_FILE"
    fi

    # 5. PID lock
    if [ -f "$WORKSPACE/state/.mcp.pid" ]; then
        PID_CONTENT=$(cat "$WORKSPACE/state/.mcp.pid")
        echo "PID lock: $PID_CONTENT" | tee -a "$LOG_FILE"
    else
        echo "PID lock: Not found" | tee -a "$LOG_FILE"
    fi

    echo "" | tee -a "$LOG_FILE"
    sleep 10
done

echo "=== Monitor Complete at $(date) ===" | tee -a "$LOG_FILE"
