#!/usr/bin/env bash
# Health Check Daemon
# Monitors system health and generates health reports
# Usage: bash scripts/health_daemon.sh [--interval SECONDS] [--alerts]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
INTERVAL=${INTERVAL:-600}  # Default: 10 minutes
ENABLE_ALERTS=${ENABLE_ALERTS:-false}
PID_FILE="/tmp/health_daemon_$$.pid"
HEALTH_FILE="state/analytics/health_status.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --alerts)
      ENABLE_ALERTS=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--interval SECONDS] [--alerts]"
      echo ""
      echo "Monitors system health and generates health reports."
      echo ""
      echo "Options:"
      echo "  --interval SECONDS    Check interval (default: 600)"
      echo "  --alerts              Enable alert notifications"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Write PID
echo $$ > "$PID_FILE"

echo -e "${GREEN}💊 Starting health check daemon (PID: $$)${NC}"
echo -e "  Interval: ${INTERVAL}s"
echo -e "  Alerts: $ENABLE_ALERTS"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping health daemon...${NC}"

  if [ -f "$PID_FILE" ]; then
    rm "$PID_FILE"
  fi

  exit 0
}

trap cleanup SIGINT SIGTERM

# Health check functions

check_build_health() {
  if timeout 60 npm run build > /dev/null 2>&1; then
    echo "pass"
  else
    echo "fail"
  fi
}

check_test_health() {
  if timeout 120 npm test > /dev/null 2>&1; then
    echo "pass"
  else
    echo "fail"
  fi
}

check_typecheck_health() {
  if timeout 60 npm run typecheck > /dev/null 2>&1; then
    echo "pass"
  else
    echo "fail"
  fi
}

check_lint_health() {
  if timeout 30 npm run lint > /dev/null 2>&1; then
    echo "pass"
  else
    echo "fail"
  fi
}

check_mcp_health() {
  # Check if MCP server is responsive
  if command -v curl &> /dev/null; then
    if curl -s -f -m 5 "http://localhost:3000/health" > /dev/null 2>&1; then
      echo "pass"
    else
      echo "fail"
    fi
  else
    echo "unknown"
  fi
}

check_disk_space() {
  # Check if disk space > 10%
  local available=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')

  if [ "$available" -lt 90 ]; then
    echo "pass"
  else
    echo "fail"
  fi
}

check_memory_usage() {
  # Check if memory usage reasonable (macOS specific)
  if command -v vm_stat &> /dev/null; then
    local free=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
    local total=$(vm_stat | grep "Pages" | head -1 | awk '{print $2}' | sed 's/\.//')

    if [ "$free" -gt 10000 ]; then
      echo "pass"
    else
      echo "warn"
    fi
  else
    echo "unknown"
  fi
}

check_process_health() {
  # Check if critical processes are running
  local issues=0

  # Check for zombie processes
  local zombies=$(ps aux | grep -c "<defunct>" || echo "0")
  if [ "$zombies" -gt 0 ]; then
    issues=$((issues + 1))
  fi

  if [ "$issues" -eq 0 ]; then
    echo "pass"
  else
    echo "warn"
  fi
}

# Health check loop
CHECK_NUM=0

while true; do
  CHECK_NUM=$((CHECK_NUM + 1))
  CHECK_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Health Check #$CHECK_NUM at $CHECK_TIME${NC}"
  echo ""

  # Run all health checks
  BUILD_HEALTH=$(check_build_health)
  TEST_HEALTH=$(check_test_health)
  TYPECHECK_HEALTH=$(check_typecheck_health)
  LINT_HEALTH=$(check_lint_health)
  MCP_HEALTH=$(check_mcp_health)
  DISK_HEALTH=$(check_disk_space)
  MEMORY_HEALTH=$(check_memory_usage)
  PROCESS_HEALTH=$(check_process_health)

  # Print results
  print_check() {
    local name=$1
    local status=$2

    case "$status" in
      pass)
        echo -e "  ${GREEN}✓${NC} $name"
        ;;
      fail)
        echo -e "  ${RED}✗${NC} $name"
        ;;
      warn)
        echo -e "  ${YELLOW}⚠${NC} $name"
        ;;
      unknown)
        echo -e "  ${YELLOW}?${NC} $name (unable to check)"
        ;;
    esac
  }

  echo "Core Systems:"
  print_check "Build" "$BUILD_HEALTH"
  print_check "Tests" "$TEST_HEALTH"
  print_check "TypeCheck" "$TYPECHECK_HEALTH"
  print_check "Lint" "$LINT_HEALTH"

  echo ""
  echo "Services:"
  print_check "MCP Server" "$MCP_HEALTH"

  echo ""
  echo "Resources:"
  print_check "Disk Space" "$DISK_HEALTH"
  print_check "Memory" "$MEMORY_HEALTH"
  print_check "Processes" "$PROCESS_HEALTH"

  # Calculate overall health score
  TOTAL_CHECKS=8
  PASSED=0

  for status in "$BUILD_HEALTH" "$TEST_HEALTH" "$TYPECHECK_HEALTH" "$LINT_HEALTH" "$MCP_HEALTH" "$DISK_HEALTH" "$MEMORY_HEALTH" "$PROCESS_HEALTH"; do
    if [ "$status" = "pass" ]; then
      PASSED=$((PASSED + 1))
    fi
  done

  HEALTH_SCORE=$((PASSED * 100 / TOTAL_CHECKS))

  echo ""
  echo -e "Overall Health: $HEALTH_SCORE%"

  # Determine health status
  if [ "$HEALTH_SCORE" -ge 80 ]; then
    HEALTH_STATUS="healthy"
    echo -e "${GREEN}✅ System is healthy${NC}"
  elif [ "$HEALTH_SCORE" -ge 60 ]; then
    HEALTH_STATUS="degraded"
    echo -e "${YELLOW}⚠ System is degraded${NC}"
  else
    HEALTH_STATUS="unhealthy"
    echo -e "${RED}❌ System is unhealthy${NC}"
  fi

  # Generate health report
  mkdir -p "$(dirname "$HEALTH_FILE")"

  cat > "$HEALTH_FILE" <<EOF
{
  "timestamp": "$CHECK_TIME",
  "check_number": $CHECK_NUM,
  "health_score": $HEALTH_SCORE,
  "status": "$HEALTH_STATUS",
  "checks": {
    "build": "$BUILD_HEALTH",
    "tests": "$TEST_HEALTH",
    "typecheck": "$TYPECHECK_HEALTH",
    "lint": "$LINT_HEALTH",
    "mcp_server": "$MCP_HEALTH",
    "disk_space": "$DISK_HEALTH",
    "memory": "$MEMORY_HEALTH",
    "processes": "$PROCESS_HEALTH"
  }
}
EOF

  # Log to JSONL
  cat "$HEALTH_FILE" >> "state/analytics/health_checks.jsonl"

  # Send alerts if enabled
  if [ "$ENABLE_ALERTS" = "true" ] && [ "$HEALTH_STATUS" != "healthy" ]; then
    echo ""
    echo -e "${YELLOW}📨 Alert: System health is $HEALTH_STATUS ($HEALTH_SCORE%)${NC}"

    # TODO: Integrate with alerting system (Slack, email, etc.)
    # For now, just log
    echo "Alert would be sent to monitoring system" > /tmp/health_alert_$$.log
  fi

  echo ""
  echo -e "${YELLOW}Next check in ${INTERVAL}s...${NC}"
  echo ""

  # Sleep until next check
  sleep "$INTERVAL"
done
