#!/usr/bin/env bash
# Quality Watch Mode
# Continuously monitors for quality issues and reports them
# Usage: bash scripts/watch_quality.sh [--interval SECONDS]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
INTERVAL=${INTERVAL:-300}  # Default: 5 minutes
PID_FILE="/tmp/watch_quality_$$.pid"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"
STATE_FILE="/tmp/watch_quality_state.json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--interval SECONDS]"
      echo ""
      echo "Continuously monitors codebase for quality issues."
      echo ""
      echo "Options:"
      echo "  --interval SECONDS    Check interval (default: 300)"
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

echo -e "${GREEN}🔍 Starting quality watch mode (PID: $$)${NC}"
echo -e "  Interval: ${INTERVAL}s"
echo -e "  Workspace: $WORKSPACE_ROOT"
echo ""

# Initialize state
cat > "$STATE_FILE" <<EOF
{
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_check": null,
  "checks_run": 0,
  "issues_found": {
    "total": 0,
    "technical": 0,
    "quality": 0,
    "reasoning": 0
  },
  "detections": []
}
EOF

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping watch mode...${NC}"

  if [ -f "$PID_FILE" ]; then
    rm "$PID_FILE"
  fi

  # Print summary
  if command -v jq &> /dev/null && [ -f "$STATE_FILE" ]; then
    echo ""
    echo "Watch Session Summary:"
    jq '.checks_run, .issues_found' "$STATE_FILE" 2>/dev/null || true
  fi

  exit 0
}

trap cleanup SIGINT SIGTERM

# Watch loop
CHECK_NUM=0

while true; do
  CHECK_NUM=$((CHECK_NUM + 1))
  CHECK_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Check #$CHECK_NUM at $CHECK_TIME${NC}"
  echo ""

  # Track issues found this check
  ISSUES_THIS_CHECK=0

  # ============================================
  # BUILD CHECK
  # ============================================
  echo -e "${YELLOW}Building...${NC}"
  if ! npm run build > /tmp/watch_build_$$.log 2>&1; then
    echo -e "  ${RED}✗${NC} Build failed"
    ISSUES_THIS_CHECK=$((ISSUES_THIS_CHECK + 1))

    # Log detection
    if command -v jq &> /dev/null; then
      jq ".detections += [{\"time\": \"$CHECK_TIME\", \"type\": \"build_failure\"}]" "$STATE_FILE" > "$STATE_FILE.tmp"
      mv "$STATE_FILE.tmp" "$STATE_FILE"
    fi
  else
    echo -e "  ${GREEN}✓${NC} Build passed"
  fi

  # ============================================
  # TYPE CHECK
  # ============================================
  echo -e "${YELLOW}Type checking...${NC}"
  if ! npm run typecheck > /tmp/watch_typecheck_$$.log 2>&1; then
    ERROR_COUNT=$(grep -c "error TS" /tmp/watch_typecheck_$$.log || echo "0")
    echo -e "  ${RED}✗${NC} Type errors: $ERROR_COUNT"
    ISSUES_THIS_CHECK=$((ISSUES_THIS_CHECK + 1))

    if command -v jq &> /dev/null; then
      jq ".detections += [{\"time\": \"$CHECK_TIME\", \"type\": \"type_error\", \"count\": $ERROR_COUNT}]" "$STATE_FILE" > "$STATE_FILE.tmp"
      mv "$STATE_FILE.tmp" "$STATE_FILE"
    fi
  else
    echo -e "  ${GREEN}✓${NC} No type errors"
  fi

  # ============================================
  # LINT CHECK
  # ============================================
  echo -e "${YELLOW}Linting...${NC}"
  if ! npm run lint > /tmp/watch_lint_$$.log 2>&1; then
    ERROR_COUNT=$(grep -c "error" /tmp/watch_lint_$$.log || echo "0")
    echo -e "  ${YELLOW}⚠${NC} Lint errors: $ERROR_COUNT"
    ISSUES_THIS_CHECK=$((ISSUES_THIS_CHECK + 1))
  else
    echo -e "  ${GREEN}✓${NC} Lint passed"
  fi

  # ============================================
  # QUALITY GATES
  # ============================================
  echo -e "${YELLOW}Checking quality gates...${NC}"
  if ! bash scripts/check_quality_gates.sh > /tmp/watch_quality_$$.log 2>&1; then
    echo -e "  ${YELLOW}⚠${NC} Quality gate failures"
    ISSUES_THIS_CHECK=$((ISSUES_THIS_CHECK + 1))

    if command -v jq &> /dev/null; then
      jq ".detections += [{\"time\": \"$CHECK_TIME\", \"type\": \"quality_gate\"}]" "$STATE_FILE" > "$STATE_FILE.tmp"
      mv "$STATE_FILE.tmp" "$STATE_FILE"
    fi
  else
    echo -e "  ${GREEN}✓${NC} Quality gates passed"
  fi

  # ============================================
  # UPDATE STATE
  # ============================================
  if command -v jq &> /dev/null; then
    jq ".last_check = \"$CHECK_TIME\" | .checks_run += 1 | .issues_found.total += $ISSUES_THIS_CHECK" "$STATE_FILE" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi

  # Summary
  if [ "$ISSUES_THIS_CHECK" -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed${NC}"
  else
    echo -e "${RED}❌ Found $ISSUES_THIS_CHECK issues${NC}"
  fi

  echo ""
  echo -e "${YELLOW}Next check in ${INTERVAL}s...${NC}"
  echo ""

  # Sleep until next check
  sleep "$INTERVAL"
done
