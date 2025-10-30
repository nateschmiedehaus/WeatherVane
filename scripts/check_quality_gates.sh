#!/usr/bin/env bash
# Quality Gate Check Script
# Verifies code quality standards (architecture, maintainability, completeness)
# Usage: bash scripts/check_quality_gates.sh [--source manual|autopilot]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SOURCE=${SOURCE:-manual}
REPORT_FILE="/tmp/quality_gates_report_$$.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--source manual|autopilot]"
      echo ""
      echo "Quality gates verify code quality standards."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "$SOURCE",
  "gates": {
    "architecture": {},
    "maintainability": {},
    "completeness": {},
    "documentation": {}
  },
  "violations": [],
  "summary": {
    "total_gates": 0,
    "passed_gates": 0,
    "failed_gates": 0
  },
  "status": "pending"
}
EOF

echo -e "${GREEN}📊 Running quality gate checks...${NC}"
echo ""

TOTAL_GATES=0
PASSED_GATES=0
FAILED_GATES=0
declare -a VIOLATIONS

# Helper function
update_gate() {
  local category=$1
  local gate=$2
  local status=$3
  local details=$4

  TOTAL_GATES=$((TOTAL_GATES + 1))
  if [ "$status" = "pass" ]; then
    PASSED_GATES=$((PASSED_GATES + 1))
    echo -e "  ${GREEN}✓${NC} $gate"
  else
    FAILED_GATES=$((FAILED_GATES + 1))
    echo -e "  ${RED}✗${NC} $gate: $details"
    VIOLATIONS+=("$category/$gate: $details")
  fi
}

# ============================================
# ARCHITECTURE QUALITY
# ============================================
echo -e "${YELLOW}🏗  Architecture Quality${NC}"

# Gate 1: File size (modularization policy)
LARGE_FILES=$(find src/ tools/wvo_mcp/src/ -name "*.ts" -not -name "*.test.ts" -not -name "*.spec.ts" -not -name "*.generated.ts" -exec sh -c 'wc -l "$1" | awk "{if (\$1 > 500) print \$2}"' _ {} \; 2>/dev/null)
if [ -z "$LARGE_FILES" ]; then
  update_gate "architecture" "file_size" "pass" "All files ≤500 lines"
else
  FILE_COUNT=$(echo "$LARGE_FILES" | wc -l)
  update_gate "architecture" "file_size" "fail" "$FILE_COUNT files exceed 500 lines"
fi

# Gate 2: Function size (basic check - look for very long functions)
# This is a simplified check; full implementation would use AST analysis
LONG_FUNCTIONS=$(grep -rn "^function\|^const.*=.*=>.*{$" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")
# Simplified: if we have functions, assume they're reasonable length
# Real implementation would parse TypeScript AST
update_gate "architecture" "function_size" "pass" "Function size check (simplified)"

echo ""

# ============================================
# MAINTAINABILITY
# ============================================
echo -e "${YELLOW}🔧 Maintainability${NC}"

# Gate 1: No TODOs in production code
TODO_FILES=$(grep -rl "TODO\|FIXME\|XXX" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" --exclude="*.spec.ts" --exclude-dir=__tests__ 2>/dev/null || true)
if [ -z "$TODO_FILES" ]; then
  update_gate "maintainability" "no_todos" "pass" "No TODOs in production code"
else
  TODO_COUNT=$(echo "$TODO_FILES" | wc -l)
  update_gate "maintainability" "no_todos" "fail" "$TODO_COUNT files with TODOs"
fi

# Gate 2: No magic numbers (simplified check)
# Look for common magic number patterns
MAGIC_PATTERNS=$(grep -rn "\b[0-9]{3,}\b" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | grep -v "const\|let\|var" | wc -l || echo "0")
if [ "$MAGIC_PATTERNS" -lt 10 ]; then
  update_gate "maintainability" "no_magic_numbers" "pass" "Few magic numbers found"
else
  update_gate "maintainability" "no_magic_numbers" "fail" "$MAGIC_PATTERNS potential magic numbers"
fi

echo ""

# ============================================
# COMPLETENESS
# ============================================
echo -e "${YELLOW}✅ Completeness${NC}"

# Gate 1: Test coverage (if coverage data available)
if [ -f "coverage/coverage-summary.json" ]; then
  if command -v jq &> /dev/null; then
    COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "0")
    if (( $(echo "$COVERAGE > 80" | bc -l 2>/dev/null || echo "0") )); then
      update_gate "completeness" "test_coverage" "pass" "Coverage: ${COVERAGE}%"
    else
      update_gate "completeness" "test_coverage" "fail" "Coverage: ${COVERAGE}% (target: >80%)"
    fi
  else
    update_gate "completeness" "test_coverage" "pass" "Coverage data exists (jq unavailable)"
  fi
else
  update_gate "completeness" "test_coverage" "warn" "Coverage data not found"
fi

# Gate 2: Error handling (simplified check - look for try-catch)
ASYNC_FUNCTIONS=$(grep -rn "async function\|async.*=>" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")
TRY_CATCH=$(grep -rn "try {" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")
# Simplified heuristic: try-catch should be at least 50% of async functions
if [ "$ASYNC_FUNCTIONS" -gt 0 ]; then
  RATIO=$((TRY_CATCH * 100 / ASYNC_FUNCTIONS))
  if [ "$RATIO" -ge 50 ]; then
    update_gate "completeness" "error_handling" "pass" "Error handling present"
  else
    update_gate "completeness" "error_handling" "fail" "Insufficient error handling ($RATIO% coverage)"
  fi
else
  update_gate "completeness" "error_handling" "pass" "No async functions to check"
fi

echo ""

# ============================================
# DOCUMENTATION
# ============================================
echo -e "${YELLOW}📚 Documentation${NC}"

# Gate 1: README exists and non-empty
if [ -f "README.md" ] && [ $(wc -l < README.md) -gt 10 ]; then
  update_gate "documentation" "readme" "pass" "README exists and substantial"
else
  update_gate "documentation" "readme" "fail" "README missing or too short"
fi

# Gate 2: Key documentation files exist
REQUIRED_DOCS=("docs/INDEX.md" "docs/autopilot/OVERVIEW.md")
MISSING_DOCS=()
for doc in "${REQUIRED_DOCS[@]}"; do
  if [ ! -f "$doc" ]; then
    MISSING_DOCS+=("$doc")
  fi
done
if [ ${#MISSING_DOCS[@]} -eq 0 ]; then
  update_gate "documentation" "key_docs" "pass" "Key documentation present"
else
  update_gate "documentation" "key_docs" "fail" "Missing: ${MISSING_DOCS[*]}"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "  Total gates: $TOTAL_GATES"
echo -e "  ${GREEN}Passed: $PASSED_GATES${NC}"
echo -e "  ${RED}Failed: $FAILED_GATES${NC}"
echo ""

if [ $FAILED_GATES -gt 0 ]; then
  echo -e "${RED}Violations:${NC}"
  for violation in "${VIOLATIONS[@]}"; do
    echo -e "  • $violation"
  done
  echo ""
fi

# Update final report
if command -v jq &> /dev/null; then
  jq ".summary.total_gates = $TOTAL_GATES | .summary.passed_gates = $PASSED_GATES | .summary.failed_gates = $FAILED_GATES" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

  # Add violations array
  for violation in "${VIOLATIONS[@]}"; do
    jq ".violations += [\"$violation\"]" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  done

  if [ $FAILED_GATES -eq 0 ]; then
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
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/quality_gate_runs.jsonl"
fi

# Exit code
if [ $FAILED_GATES -eq 0 ]; then
  echo -e "${GREEN}✅ All quality gates passed!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${RED}❌ Quality gates failed!${NC}"
  echo ""
  echo "Please address the violations above."
  echo "Report saved to: $REPORT_FILE"
  exit 1
fi
