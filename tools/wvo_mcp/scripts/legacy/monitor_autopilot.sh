#!/usr/bin/env bash
#
# Autopilot Monitor - Real-time visibility into what agents are doing
#
# Displays:
# - Active tasks and their status
# - Agent activity (which agents are working on what)
# - Decomposition metrics (prevent runaway loops)
# - System resource usage (CPU, memory)
# - Error counts and warnings
#
# Usage: bash scripts/monitor_autopilot.sh

set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_FILE="${LOG_FILE:-/tmp/wvo_autopilot.log}"
STATE_DIR="$ROOT/state"
TELEMETRY_DIR="$ROOT/state/telemetry"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Clear screen and move cursor to top
clear_screen() {
  printf "\033[2J\033[H"
}

# Print header
print_header() {
  echo -e "${BOLD}${CYAN}======================================"
  echo -e "  WeatherVane Autopilot Monitor"
  echo -e "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo -e "======================================${NC}\n"
}

# Check decomposition metrics (CRITICAL for preventing runaway loops)
check_decomposition_health() {
  echo -e "${BOLD}${YELLOW}Decomposition Health Check:${NC}"

  # Count decomposition attempts in last minute from logs
  if [ -f "$LOG_FILE" ]; then
    local decomp_count=$(grep -c "Attempting task decomposition" "$LOG_FILE" 2>/dev/null || echo "0")
    local circuit_breaker=$(grep -c "circuit breaker triggered" "$LOG_FILE" 2>/dev/null || echo "0")

    if [ "$circuit_breaker" -gt 0 ]; then
      echo -e "  ${RED}⚠️  CIRCUIT BREAKER TRIGGERED${NC}"
      echo -e "  ${RED}   Runaway decomposition detected and stopped${NC}"
    elif [ "$decomp_count" -gt 50 ]; then
      echo -e "  ${YELLOW}⚠️  High decomposition rate: $decomp_count attempts${NC}"
    else
      echo -e "  ${GREEN}✓${NC} Decomposition rate: $decomp_count attempts (healthy)"
    fi
  else
    echo -e "  ${YELLOW}⚠️${NC} Log file not found at $LOG_FILE"
  fi
  echo ""
}

# Show active tasks
show_active_tasks() {
  echo -e "${BOLD}${BLUE}Active Tasks:${NC}"

  if [ -f "$STATE_DIR/roadmap.yaml" ]; then
    # Count tasks by status
    local pending=$(grep -c "status: pending" "$STATE_DIR/roadmap.yaml" 2>/dev/null || echo "0")
    local in_progress=$(grep -c "status: in_progress" "$STATE_DIR/roadmap.yaml" 2>/dev/null || echo "0")
    local blocked=$(grep -c "status: blocked" "$STATE_DIR/roadmap.yaml" 2>/dev/null || echo "0")
    local done=$(grep -c "status: done" "$STATE_DIR/roadmap.yaml" 2>/dev/null || echo "0")

    echo -e "  Pending:     ${YELLOW}$pending${NC}"
    echo -e "  In Progress: ${BLUE}$in_progress${NC}"
    echo -e "  Blocked:     ${RED}$blocked${NC}"
    echo -e "  Done:        ${GREEN}$done${NC}"

    # Show current in-progress tasks
    if [ "$in_progress" -gt 0 ]; then
      echo -e "\n  ${BOLD}Current Work:${NC}"
      grep -B2 "status: in_progress" "$STATE_DIR/roadmap.yaml" 2>/dev/null | \
        grep "^  - id:" | \
        sed 's/  - id: /    • /' || echo "    (none visible)"
    fi
  else
    echo -e "  ${YELLOW}⚠️${NC} Roadmap file not found"
  fi
  echo ""
}

# Show agent activity
show_agent_activity() {
  echo -e "${BOLD}${GREEN}Agent Activity:${NC}"

  if [ -f "$LOG_FILE" ]; then
    # Get recent agent executions (last 10)
    echo -e "  ${BOLD}Recent Agent Actions (last 10):${NC}"
    grep -E "Executing task|Task decomposed|Pre-flight" "$LOG_FILE" 2>/dev/null | \
      tail -10 | \
      sed 's/^/    /' || echo "    (no recent activity)"
  else
    echo -e "  ${YELLOW}⚠️${NC} No log file found"
  fi
  echo ""
}

# Show system resources
show_system_resources() {
  echo -e "${BOLD}${MAGENTA}System Resources:${NC}"

  # Memory usage
  local mem_usage=$(ps aux | grep -E "(node|codex|claude)" | grep -v grep | \
    awk '{sum+=$6} END {printf "%.1f", sum/1024}' 2>/dev/null || echo "0")
  echo -e "  Memory (MCP processes): ${mem_usage} MB"

  # CPU usage
  local cpu_usage=$(ps aux | grep -E "(node|codex|claude)" | grep -v grep | \
    awk '{sum+=$3} END {printf "%.1f", sum}' 2>/dev/null || echo "0")
  echo -e "  CPU (MCP processes):    ${cpu_usage}%"

  # Process count
  local process_count=$(ps aux | grep -E "(worker_entry|autopilot)" | grep -v grep | wc -l | tr -d ' ')

  if [ "$process_count" -gt 10 ]; then
    echo -e "  ${RED}⚠️  Process count: $process_count (possible runaway)${NC}"
  else
    echo -e "  Process count:          $process_count"
  fi
  echo ""
}

# Show errors and warnings
show_errors() {
  echo -e "${BOLD}${RED}Recent Errors & Warnings:${NC}"

  if [ -f "$LOG_FILE" ]; then
    local error_count=$(grep -c "ERROR\|ERRO\|circuit breaker" "$LOG_FILE" 2>/dev/null || echo "0")
    local warning_count=$(grep -c "WARNING\|WARN\|Max decomposition" "$LOG_FILE" 2>/dev/null || echo "0")

    echo -e "  Errors:   ${RED}$error_count${NC}"
    echo -e "  Warnings: ${YELLOW}$warning_count${NC}"

    if [ "$error_count" -gt 0 ]; then
      echo -e "\n  ${BOLD}Last 5 errors:${NC}"
      grep -E "ERROR|ERRO|circuit breaker" "$LOG_FILE" 2>/dev/null | \
        tail -5 | \
        sed 's/^/    /' || echo "    (none)"
    fi
  else
    echo -e "  ${YELLOW}⚠️${NC} No log file to check"
  fi
  echo ""
}

# Show quick stats
show_stats() {
  echo -e "${BOLD}${CYAN}Quick Stats:${NC}"

  if [ -f "$TELEMETRY_DIR/usage.jsonl" ]; then
    local total_ops=$(wc -l < "$TELEMETRY_DIR/usage.jsonl" 2>/dev/null || echo "0")
    echo -e "  Total operations logged: $total_ops"
  fi

  echo ""
}

# Emergency stop function
emergency_stop() {
  echo -e "\n${RED}${BOLD}!!! EMERGENCY STOP INITIATED !!!${NC}\n"
  echo -e "Killing all autopilot and worker processes..."
  pkill -9 -f "worker_entry" 2>/dev/null || true
  pkill -9 -f "autopilot" 2>/dev/null || true
  pkill -9 -f "unified_orchestrator" 2>/dev/null || true
  echo -e "${GREEN}✓ Processes stopped${NC}\n"
  exit 0
}

# Trap Ctrl+C for emergency stop
trap emergency_stop INT

# Main monitoring loop
main() {
  echo -e "${YELLOW}Starting autopilot monitor...${NC}"
  echo -e "Press ${BOLD}Ctrl+C${NC} to stop all processes and exit\n"
  sleep 2

  while true; do
    clear_screen
    print_header
    check_decomposition_health
    show_active_tasks
    show_agent_activity
    show_system_resources
    show_errors
    show_stats

    echo -e "${CYAN}Refreshing in 5 seconds... (Ctrl+C to stop all processes)${NC}"
    sleep 5
  done
}

main
