#!/usr/bin/env bash
#
# Autopilot Supervisor - Ensures autopilot never crashes your computer
#
# Responsibilities:
# - Start autopilot with resource limits (memory, CPU, FDs)
# - Monitor heartbeat (detect hung processes)
# - Auto-restart on crash with exponential backoff
# - Pre-flight checks (disk space, memory available)
# - Clean shutdown handling
#
# Exit codes:
# 0 - Clean shutdown (supervisor stops)
# 1 - Startup check failed (supervisor exits)
# 100 - Fatal error (supervisor exits, no restart)
#

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Configuration (load from JSON if needed, or use defaults)
WORKSPACE="$ROOT"
HEARTBEAT_FILE="$WORKSPACE/state/heartbeat"
PID_FILE="$WORKSPACE/state/worker_pid"
CONFIG_FILE="$WORKSPACE/tools/wvo_mcp/config/safety_limits.json"

# Default limits (overridden by config file if present)
MEMORY_LIMIT_MB=2048
NICE_LEVEL=5
FD_LIMIT=1024
MAX_CRASHES=6
HEARTBEAT_TIMEOUT=90
BACKOFF_RESET_RUNTIME=300

# Load config if available
if [ -f "$CONFIG_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    MEMORY_LIMIT_MB=$(jq -r '.memory.max_tree_rss_mb // 2048' "$CONFIG_FILE")
    FD_LIMIT=$(jq -r '.file_descriptors.soft_limit // 1024' "$CONFIG_FILE")
    MAX_CRASHES=$(jq -r '.supervisor.max_crashes // 6' "$CONFIG_FILE")
    HEARTBEAT_TIMEOUT=$(jq -r '.supervisor.heartbeat_timeout_seconds // 90' "$CONFIG_FILE")
    BACKOFF_RESET_RUNTIME=$(jq -r '.supervisor.backoff_reset_runtime_seconds // 300' "$CONFIG_FILE")
  fi
fi

# Backoff sequence (seconds)
BACKOFF_SECONDS=(1 2 4 8 16)

# State
CRASH_COUNT=0
LAST_START_TIME=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Cleanup handler
cleanup() {
  echo -e "${BLUE}Supervisor received signal, cleaning up...${NC}"

  # Kill autopilot if still running
  if [ -n "${AUTOPILOT_PID:-}" ]; then
    echo -e "${YELLOW}Killing autopilot process (PID $AUTOPILOT_PID)...${NC}"
    bash "$SCRIPT_DIR/kill_autopilot.sh" 2>/dev/null || true
  fi

  echo -e "${GREEN}Supervisor exiting${NC}"
  exit 0
}

trap cleanup INT TERM HUP

# Pre-flight check: Disk space
check_disk_space() {
  local disk_usage
  disk_usage=$(df -h "$WORKSPACE" | tail -1 | awk '{print $5}' | sed 's/%//')

  if [ "$disk_usage" -gt 90 ]; then
    echo -e "${RED}❌ Disk usage ${disk_usage}% exceeds 90% threshold${NC}"
    echo -e "${YELLOW}Free up disk space before starting autopilot${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Disk space OK (${disk_usage}% used)${NC}"
  return 0
}

# Pre-flight check: Available memory
check_memory_available() {
  local free_mb

  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS: vm_stat gives page counts, convert to MB
    local pages_free
    pages_free=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
    free_mb=$((pages_free * 4096 / 1024 / 1024))
  else
    # Linux: free command
    free_mb=$(free -m | grep Mem | awk '{print $4}')
  fi

  if [ "$free_mb" -lt 500 ]; then
    echo -e "${RED}❌ Only ${free_mb}MB free memory (need 500MB minimum)${NC}"
    return 1
  fi

  echo -e "${GREEN}✓ Memory available: ${free_mb}MB${NC}"
  return 0
}

# Check heartbeat age
check_heartbeat() {
  if [ ! -f "$HEARTBEAT_FILE" ]; then
    # No heartbeat yet (process starting up)
    return 0
  fi

  local heartbeat
  heartbeat=$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "")

  if [ -z "$heartbeat" ]; then
    return 0
  fi

  # Calculate age (seconds since heartbeat)
  local heartbeat_time
  local current_time
  local age

  # Parse ISO 8601 timestamp
  if [[ "$OSTYPE" == "darwin"* ]]; then
    heartbeat_time=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${heartbeat:0:19}" +%s 2>/dev/null || echo "0")
  else
    heartbeat_time=$(date -d "${heartbeat:0:19}" +%s 2>/dev/null || echo "0")
  fi

  current_time=$(date +%s)
  age=$((current_time - heartbeat_time))

  if [ "$age" -gt "$HEARTBEAT_TIMEOUT" ]; then
    echo -e "${RED}❌ Heartbeat stale (${age}s old, limit ${HEARTBEAT_TIMEOUT}s)${NC}"
    return 1
  fi

  return 0
}

# Restart logic with exponential backoff
should_restart() {
  local exit_code=$1

  # Don't restart on clean shutdown (0, 143=SIGTERM)
  if [ "$exit_code" -eq 0 ] || [ "$exit_code" -eq 143 ]; then
    echo -e "${GREEN}✓ Clean shutdown (exit $exit_code), not restarting${NC}"
    return 1
  fi

  # Don't restart on fatal error (100)
  if [ "$exit_code" -eq 100 ]; then
    echo -e "${RED}❌ Fatal error (exit 100), manual intervention required${NC}"
    return 1
  fi

  # Check if too many crashes
  if [ "$CRASH_COUNT" -ge "$MAX_CRASHES" ]; then
    echo -e "${RED}❌ Too many crashes ($CRASH_COUNT), giving up${NC}"
    echo -e "${YELLOW}Check logs in state/analytics/ for details${NC}"
    return 1
  fi

  # Calculate backoff
  local backoff_index
  backoff_index=$((CRASH_COUNT < ${#BACKOFF_SECONDS[@]} ? CRASH_COUNT : ${#BACKOFF_SECONDS[@]} - 1))
  local backoff=${BACKOFF_SECONDS[$backoff_index]}

  echo -e "${YELLOW}⏳ Crash #$((CRASH_COUNT + 1)) (exit $exit_code), waiting ${backoff}s before restart...${NC}"
  sleep "$backoff"

  CRASH_COUNT=$((CRASH_COUNT + 1))
  return 0
}

# Main supervisor loop
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  WeatherVane Autopilot Supervisor${NC}"
echo -e "${BLUE}  Ensuring safe operation with resource limits${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Pre-flight checks (only once at startup)
echo -e "${BLUE}Running pre-flight checks...${NC}"

if ! check_disk_space; then
  exit 1
fi

if ! check_memory_available; then
  exit 1
fi

echo -e "${GREEN}✓ All pre-flight checks passed${NC}"
echo ""

# Main loop
while true; do
  # Reset crash counter if last run was successful (>5 min)
  CURRENT_TIME=$(date +%s)

  if [ "$LAST_START_TIME" -gt 0 ]; then
    RUNTIME=$((CURRENT_TIME - LAST_START_TIME))

    if [ "$RUNTIME" -gt "$BACKOFF_RESET_RUNTIME" ]; then
      if [ "$CRASH_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Successful run (${RUNTIME}s), resetting crash counter${NC}"
        CRASH_COUNT=0
      fi
    fi
  fi

  LAST_START_TIME=$CURRENT_TIME

  # Start autopilot with resource limits
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}Starting autopilot with safety limits:${NC}"
  echo -e "  Memory limit: ${MEMORY_LIMIT_MB}MB"
  echo -e "  CPU priority: nice +${NICE_LEVEL}"
  echo -e "  File descriptors: ${FD_LIMIT}"
  echo -e "  Heartbeat timeout: ${HEARTBEAT_TIMEOUT}s"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Set resource limits
  ulimit -n "$FD_LIMIT" 2>/dev/null || echo -e "${YELLOW}Warning: Could not set FD limit${NC}"
  ulimit -v $((MEMORY_LIMIT_MB * 1024)) 2>/dev/null || echo -e "${YELLOW}Warning: Could not set virtual memory limit${NC}"

  # Start autopilot
  cd "$WORKSPACE/tools/wvo_mcp" || exit 1

  nice -n "$NICE_LEVEL" node \
    --max-old-space-size="$MEMORY_LIMIT_MB" \
    dist/src/orchestrator/autopilot_unified.js \
    "$@" &

  AUTOPILOT_PID=$!

  echo -e "${GREEN}✓ Autopilot started (PID $AUTOPILOT_PID)${NC}"
  echo ""

  # Monitor heartbeat
  while kill -0 "$AUTOPILOT_PID" 2>/dev/null; do
    if ! check_heartbeat; then
      echo -e "${RED}❌ Heartbeat check failed, killing stuck process${NC}"

      # Try graceful kill first
      kill -TERM "$AUTOPILOT_PID" 2>/dev/null || true

      sleep 10

      # Force kill if still alive
      if kill -0 "$AUTOPILOT_PID" 2>/dev/null; then
        echo -e "${YELLOW}Force killing stuck process${NC}"
        kill -KILL "$AUTOPILOT_PID" 2>/dev/null || true
      fi

      break
    fi

    sleep 60
  done

  # Wait for exit and capture code
  set +e
  wait "$AUTOPILOT_PID"
  EXIT_CODE=$?
  set -e

  echo ""
  echo -e "${YELLOW}Autopilot exited with code $EXIT_CODE${NC}"

  # Decide whether to restart
  if ! should_restart "$EXIT_CODE"; then
    break
  fi

  echo ""
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Supervisor exiting${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

exit 0
