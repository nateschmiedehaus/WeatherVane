#!/usr/bin/env bash
# Pre-Flight Check Script
# Verifies system health before starting work (technical + quality + reasoning)
# Usage: bash scripts/preflight_check.sh [--task TASK_ID] [--source manual|autopilot]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TIMEOUT=${TIMEOUT:-30}
SOURCE=${SOURCE:-manual}
TASK_ID=${TASK_ID:-""}
REPORT_FILE="/tmp/preflight_report_$$.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task)
      TASK_ID="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--task TASK_ID] [--source manual|autopilot]"
      echo ""
      echo "Pre-flight checks verify system health before starting work."
      echo ""
      echo "Options:"
      echo "  --task TASK_ID        Task identifier (for reasoning checks)"
      echo "  --source SOURCE       Execution source: manual or autopilot (default: manual)"
      echo "  --help                Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Security: Validate TASK_ID if provided (prevent path traversal)
if [ -n "$TASK_ID" ]; then
  # Allow only alphanumeric, dashes, underscores, and dots
  if ! [[ "$TASK_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo -e "${RED}Error: Invalid TASK_ID format. Only alphanumeric, dash, underscore, and dot allowed.${NC}"
    echo -e "${RED}Received: $TASK_ID${NC}"
    exit 1
  fi

  # Additional path traversal prevention
  if [[ "$TASK_ID" == *".."* ]] || [[ "$TASK_ID" == /* ]]; then
    echo -e "${RED}Error: TASK_ID contains path traversal characters${NC}"
    exit 1
  fi
fi

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "$SOURCE",
  "task_id": "$TASK_ID",
  "checks": {
    "technical": {},
    "quality": {},
    "reasoning": {}
  },
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0
  },
  "status": "pending"
}
EOF

echo -e "${GREEN}🚀 Running pre-flight checks...${NC}"
echo ""

# Track overall status
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Function to update report
update_report() {
  local category=$1
  local check=$2
  local status=$3
  local message=$4

  # Use jq if available, otherwise append to log
  if command -v jq &> /dev/null; then
    jq ".checks.$category.$check = {\"status\": \"$status\", \"message\": \"$message\"}" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  fi

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  if [ "$status" = "pass" ]; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    echo -e "  ${GREEN}✓${NC} $check"
  else
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    echo -e "  ${RED}✗${NC} $check: $message"
  fi
}

# ============================================
# TECHNICAL CHECKS
# ============================================
echo -e "${YELLOW}📋 Technical Checks${NC}"

# Check 1: Build passes
if timeout 60 npm run build > /dev/null 2>&1; then
  update_report "technical" "build" "pass" "Build succeeded"
else
  update_report "technical" "build" "fail" "Build failed"
fi

# Check 2: Tests pass (fast subset if available)
if npm run test:quick > /dev/null 2>&1 || npm test > /dev/null 2>&1; then
  update_report "technical" "tests" "pass" "Tests passed"
else
  update_report "technical" "tests" "fail" "Tests failed"
fi

# Check 3: Type check passes
if npm run typecheck > /dev/null 2>&1; then
  update_report "technical" "typecheck" "pass" "Type check passed"
else
  update_report "technical" "typecheck" "fail" "Type check failed"
fi

# Check 4: Lint passes
if npm run lint > /dev/null 2>&1; then
  update_report "technical" "lint" "pass" "Lint passed"
else
  update_report "technical" "lint" "fail" "Lint failed"
fi

# Check 5: Git status clean (only for source=autopilot)
if [ "$SOURCE" = "autopilot" ]; then
  if [ -z "$(git status --porcelain)" ]; then
    update_report "technical" "git_status" "pass" "No uncommitted changes"
  else
    update_report "technical" "git_status" "fail" "Uncommitted changes found"
  fi
fi

# Check 6: Dependencies installed
if [ -d "node_modules" ] && [ -d "tools/wvo_mcp/node_modules" ]; then
  update_report "technical" "dependencies" "pass" "Dependencies installed"
else
  update_report "technical" "dependencies" "fail" "Dependencies missing"
fi

echo ""

# ============================================
# QUALITY CHECKS (Basic MVP)
# ============================================
echo -e "${YELLOW}📊 Quality Checks (Basic)${NC}"

# Check 1: No TODOs in production code
TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX" src/ --exclude="*.test.ts" --exclude="*.spec.ts" --exclude-dir=__tests__ 2>/dev/null | wc -l | tr -d ' \n' || echo "0")
TODO_COUNT=${TODO_COUNT:-0}
if [ "$TODO_COUNT" -eq 0 ]; then
  update_report "quality" "todos" "pass" "No TODOs in production code"
else
  update_report "quality" "todos" "fail" "$TODO_COUNT TODOs found in production code"
fi

# Check 2: File size check (basic - files > 500 lines)
LARGE_FILES=$(find src/ -name "*.ts" -not -name "*.test.ts" -not -name "*.generated.ts" -exec wc -l {} + 2>/dev/null | awk '$1 > 500 {print $2}' | wc -l | tr -d ' \n' || echo "0")
LARGE_FILES=${LARGE_FILES:-0}
if [ "$LARGE_FILES" -eq 0 ]; then
  update_report "quality" "file_size" "pass" "No files exceed 500 lines"
else
  update_report "quality" "file_size" "fail" "$LARGE_FILES files exceed 500 lines"
fi

echo ""

# ============================================
# REASONING CHECKS (Basic MVP)
# ============================================
if [ -n "$TASK_ID" ]; then
  echo -e "${YELLOW}🧠 Reasoning Checks (Basic)${NC}"

  EVIDENCE_DIR="state/evidence/$TASK_ID"

  # Check 1: Evidence directory exists
  if [ -d "$EVIDENCE_DIR" ]; then
    update_report "reasoning" "evidence_exists" "pass" "Evidence directory found"

    # Check 2: Key phases present
    REQUIRED_PHASES=("strategize" "spec" "plan" "think")
    MISSING_PHASES=()
    for phase in "${REQUIRED_PHASES[@]}"; do
      if [ ! -d "$EVIDENCE_DIR/$phase" ]; then
        MISSING_PHASES+=("$phase")
      fi
    done

    if [ ${#MISSING_PHASES[@]} -eq 0 ]; then
      update_report "reasoning" "phases" "pass" "All required phases present"
    else
      update_report "reasoning" "phases" "fail" "Missing phases: ${MISSING_PHASES[*]}"
    fi
  else
    update_report "reasoning" "evidence_exists" "fail" "Evidence directory not found"
    update_report "reasoning" "phases" "fail" "Cannot check phases (no evidence dir)"
  fi

  echo ""
fi

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "  Total checks: $TOTAL_CHECKS"
echo -e "  ${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "  ${RED}Failed: $FAILED_CHECKS${NC}"
echo ""

# Update final report
if command -v jq &> /dev/null; then
  jq ".summary.total = $TOTAL_CHECKS | .summary.passed = $PASSED_CHECKS | .summary.failed = $FAILED_CHECKS" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

  if [ $FAILED_CHECKS -eq 0 ]; then
    jq '.status = "pass"' "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  else
    jq '.status = "fail"' "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  fi
fi

# Log to analytics
ANALYTICS_DIR="state/analytics"
mkdir -p "$ANALYTICS_DIR"
if [ -f "$REPORT_FILE" ]; then
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/preflight_runs.jsonl"
fi

# Exit code
if [ $FAILED_CHECKS -eq 0 ]; then
  echo -e "${GREEN}✅ All pre-flight checks passed!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${RED}❌ Pre-flight checks failed!${NC}"
  echo ""
  echo "Please fix the failing checks before proceeding."
  echo "Report saved to: $REPORT_FILE"
  exit 1
fi
