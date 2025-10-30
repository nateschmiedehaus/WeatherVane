#!/usr/bin/env bash
# Quality Hunting Script
# Proactively searches for quality issues: tech debt, architecture drift, maintainability problems
# Usage: bash scripts/hunt_quality.sh [--report-only]

set -euo pipefail

# Source quality checks library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/quality_checks.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REPORT_ONLY=${REPORT_ONLY:-false}
REPORT_FILE="/tmp/hunt_quality_$$.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --report-only)
      REPORT_ONLY=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--report-only]"
      echo ""
      echo "Proactively hunts for quality issues in the codebase."
      echo ""
      echo "Options:"
      echo "  --report-only     Only generate report, don't create tasks"
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
  "hunt_type": "quality_issues",
  "issues": {
    "tech_debt_hotspots": [],
    "architecture_drift": [],
    "modularization_violations": [],
    "maintainability_issues": []
  },
  "metrics": {},
  "summary": {
    "total_issues": 0,
    "high_priority": 0,
    "medium_priority": 0,
    "low_priority": 0
  }
}
EOF

echo -e "${GREEN}🔍 Hunting for quality issues...${NC}"
echo ""

TOTAL_ISSUES=0
HIGH_PRIORITY=0
MEDIUM_PRIORITY=0
LOW_PRIORITY=0

# ============================================
# TECH DEBT HOTSPOTS
# ============================================
echo -e "${YELLOW}🔥 Identifying tech debt hotspots...${NC}"

# Files with high TODO density
TODO_FILES=$(find_todos)
TODO_COUNT=$(echo "$TODO_FILES" | wc -l)

if [ "$TODO_COUNT" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $TODO_COUNT files with TODOs"

  # Identify hotspots (files with multiple TODOs)
  echo "$TODO_FILES" | sort | uniq -c | sort -rn | head -5 | while read -r count file; do
    if [ "$count" -gt 3 ]; then
      echo -e "    ${RED}•${NC} $file ($count TODOs)"
      HIGH_PRIORITY=$((HIGH_PRIORITY + 1))
      TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    fi
  done
else
  echo -e "  ${GREEN}✓${NC} No TODO hotspots"
fi

# Files changed frequently (high churn = potential tech debt)
if [ -d ".git" ]; then
  HIGH_CHURN=$(git log --since="6 months ago" --name-only --pretty=format: | \
    grep "\.ts$" | grep -v "\.test\.ts$" | sort | uniq -c | sort -rn | head -10 | \
    awk '$1 > 20 {print $0}' | wc -l || echo "0")

  if [ "$HIGH_CHURN" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} $HIGH_CHURN high-churn files (>20 changes in 6 months)"
    MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + HIGH_CHURN))
    TOTAL_ISSUES=$((TOTAL_ISSUES + HIGH_CHURN))
  else
    echo -e "  ${GREEN}✓${NC} No excessive file churn"
  fi
fi

# Long functions (complexity indicator)
COMPLEX_FILES=$(find_complex_files 50)
COMPLEX_COUNT=$(echo "$COMPLEX_FILES" | wc -l)

if [ "$COMPLEX_COUNT" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $COMPLEX_COUNT high-complexity files"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + COMPLEX_COUNT))
  TOTAL_ISSUES=$((TOTAL_ISSUES + COMPLEX_COUNT))
else
  echo -e "  ${GREEN}✓${NC} No excessive complexity"
fi

echo ""

# ============================================
# ARCHITECTURE DRIFT
# ============================================
echo -e "${YELLOW}🏗  Detecting architecture drift...${NC}"

# Layering violations (src/domain importing from src/infra, etc.)
LAYERING_VIOLATIONS=$(grep -rn "from ['\"].*\/infra\/" src/domain/ 2>/dev/null | wc -l || echo "0")
if [ "$LAYERING_VIOLATIONS" -gt 0 ]; then
  echo -e "  ${RED}⚠${NC} $LAYERING_VIOLATIONS layering violations (domain → infra)"
  HIGH_PRIORITY=$((HIGH_PRIORITY + LAYERING_VIOLATIONS))
  TOTAL_ISSUES=$((TOTAL_ISSUES + LAYERING_VIOLATIONS))
else
  echo -e "  ${GREEN}✓${NC} No layering violations"
fi

# God objects (files importing from many other files)
GOD_OBJECTS=$(find src/ tools/wvo_mcp/src/ -name "*.ts" -not -name "*.test.ts" | \
  while read -r file; do
    import_count=$(grep -c "^import.*from" "$file" 2>/dev/null || echo "0")
    if [ "$import_count" -gt 20 ]; then
      echo "$file ($import_count imports)"
    fi
  done | wc -l || echo "0")

if [ "$GOD_OBJECTS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $GOD_OBJECTS potential god objects (>20 imports)"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + GOD_OBJECTS))
  TOTAL_ISSUES=$((TOTAL_ISSUES + GOD_OBJECTS))
else
  echo -e "  ${GREEN}✓${NC} No god objects detected"
fi

# Tight coupling (bidirectional dependencies)
TIGHT_COUPLING=$(find src/ -name "*.ts" -not -name "*.test.ts" | \
  while read -r file; do
    imports=$(grep -o "from ['\"]\..*['\"]" "$file" 2>/dev/null | \
      sed "s/from ['\"]//g" | sed "s/['\"]//g" || true)

    for import in $imports; do
      import_file=$(dirname "$file")/${import}.ts
      if [ -f "$import_file" ]; then
        reverse=$(grep -o "from ['\"].*$(basename "$file" .ts)['\"]" "$import_file" 2>/dev/null || true)
        if [ -n "$reverse" ]; then
          echo "1"
        fi
      fi
    done
  done | wc -l || echo "0")

if [ "$TIGHT_COUPLING" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $TIGHT_COUPLING bidirectional dependencies"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# MODULARIZATION VIOLATIONS
# ============================================
echo -e "${YELLOW}📦 Checking modularization policy...${NC}"

# File size violations
OVERSIZED_FILES=$(count_oversized_files 500)
if [ "$OVERSIZED_FILES" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $OVERSIZED_FILES files exceed 500 lines"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + OVERSIZED_FILES))
  TOTAL_ISSUES=$((TOTAL_ISSUES + OVERSIZED_FILES))

  # Show worst offenders
  check_file_size 500 | head -5 | while read -r file; do
    lines=$(wc -l < "$file" 2>/dev/null || echo "0")
    echo -e "    ${RED}•${NC} $file ($lines lines)"
  done
else
  echo -e "  ${GREEN}✓${NC} All files within size limit"
fi

# Function size violations (simplified check)
LONG_FUNCTIONS=$(grep -rn "^function\|^const.*= async" src/ tools/wvo_mcp/src/ \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null | \
  awk '{print $1}' | uniq -c | awk '$1 > 50' | wc -l || echo "0")

if [ "$LONG_FUNCTIONS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $LONG_FUNCTIONS potentially long functions"
  LOW_PRIORITY=$((LOW_PRIORITY + LONG_FUNCTIONS))
  TOTAL_ISSUES=$((TOTAL_ISSUES + LONG_FUNCTIONS))
fi

echo ""

# ============================================
# MAINTAINABILITY ISSUES
# ============================================
echo -e "${YELLOW}🔧 Checking maintainability...${NC}"

# Magic numbers
MAGIC_COUNT=$(count_magic_numbers)
if [ "$MAGIC_COUNT" -gt 50 ]; then
  echo -e "  ${YELLOW}⚠${NC} $MAGIC_COUNT potential magic numbers"
  LOW_PRIORITY=$((LOW_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} Magic numbers under control"
fi

# Error handling coverage
ERROR_COVERAGE=$(get_error_handling_coverage)
if [ "$ERROR_COVERAGE" -lt 50 ]; then
  echo -e "  ${YELLOW}⚠${NC} Low error handling coverage: ${ERROR_COVERAGE}%"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} Error handling coverage: ${ERROR_COVERAGE}%"
fi

# Test coverage
TEST_COVERAGE=$(get_test_coverage)
if [ "$TEST_COVERAGE" != "N/A" ]; then
  COVERAGE_INT=${TEST_COVERAGE%.*}
  if [ "$COVERAGE_INT" -lt 80 ]; then
    echo -e "  ${YELLOW}⚠${NC} Test coverage below target: ${TEST_COVERAGE}%"
    MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
  else
    echo -e "  ${GREEN}✓${NC} Test coverage: ${TEST_COVERAGE}%"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} Test coverage data not available"
fi

# Documentation completeness
if ! check_readme; then
  echo -e "  ${YELLOW}⚠${NC} README missing or too short"
  LOW_PRIORITY=$((LOW_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} README present"
fi

# Calculate maintainability index
MAINTAINABILITY_INDEX=$(calculate_maintainability_index)
echo -e "  Maintainability index: $MAINTAINABILITY_INDEX/100"

if [ "$MAINTAINABILITY_INDEX" -lt 65 ]; then
  echo -e "  ${YELLOW}⚠${NC} Maintainability below threshold"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# CODE SMELLS
# ============================================
echo -e "${YELLOW}👃 Detecting code smells...${NC}"

# Duplicate code (simplified - look for identical function names)
DUPLICATE_NAMES=$(grep -rn "^function\|^const.*=" src/ tools/wvo_mcp/src/ \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null | \
  sed 's/.*function \([a-zA-Z0-9_]*\).*/\1/' | \
  sed 's/.*const \([a-zA-Z0-9_]*\).*/\1/' | \
  sort | uniq -d | wc -l || echo "0")

if [ "$DUPLICATE_NAMES" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $DUPLICATE_NAMES duplicate function names (potential duplication)"
  LOW_PRIORITY=$((LOW_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

# Long parameter lists (>5 parameters)
LONG_PARAMS=$(grep -rn "function.*(\(.*,.*\){5,})" src/ tools/wvo_mcp/src/ \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")

if [ "$LONG_PARAMS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $LONG_PARAMS functions with >5 parameters"
  LOW_PRIORITY=$((LOW_PRIORITY + LONG_PARAMS))
  TOTAL_ISSUES=$((TOTAL_ISSUES + LONG_PARAMS))
fi

# Deep nesting (>4 levels)
DEEP_NESTING=$(grep -rn "    .*    .*    .*    .*if\|    .*    .*    .*    .*for" \
  src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")

if [ "$DEEP_NESTING" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $DEEP_NESTING deeply nested blocks"
  MEDIUM_PRIORITY=$((MEDIUM_PRIORITY + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# GENERATE QUALITY METRICS
# ============================================
echo -e "${YELLOW}📊 Generating quality metrics...${NC}"

# Get comprehensive quality report
QUALITY_REPORT=$(generate_quality_report)

# Update report with metrics
if command -v jq &> /dev/null; then
  echo "$QUALITY_REPORT" | jq '.maintainability_index' > /tmp/mi_$$.txt
  jq ".metrics = $QUALITY_REPORT" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Hunt Summary${NC}"
echo -e "  Total issues found: $TOTAL_ISSUES"
echo -e "  ${RED}High priority: $HIGH_PRIORITY${NC}"
echo -e "  ${YELLOW}Medium priority: $MEDIUM_PRIORITY${NC}"
echo -e "  ${YELLOW}Low priority: $LOW_PRIORITY${NC}"
echo -e "  Maintainability index: $MAINTAINABILITY_INDEX/100"
echo ""

# Update report
if command -v jq &> /dev/null; then
  jq ".summary.total_issues = $TOTAL_ISSUES | \
      .summary.high_priority = $HIGH_PRIORITY | \
      .summary.medium_priority = $MEDIUM_PRIORITY | \
      .summary.low_priority = $LOW_PRIORITY" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
fi

# Log to analytics
ANALYTICS_DIR="state/analytics"
mkdir -p "$ANALYTICS_DIR"
if [ -f "$REPORT_FILE" ]; then
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/quality_hunt_runs.jsonl"
fi

# Auto-create FIX tasks if not in report-only mode
if [ "$REPORT_ONLY" = "false" ] && [ "$TOTAL_ISSUES" -gt 0 ]; then
  echo -e "${YELLOW}Creating FIX-QUAL-* tasks...${NC}"
  echo "  Tasks would be created for $TOTAL_ISSUES issues"
  echo "  (Task creation implemented in Phase 3)"
  echo ""
fi

# Exit code
if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo -e "${GREEN}✅ No quality issues found!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${YELLOW}⚠ $TOTAL_ISSUES quality issues found${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"

  # Only fail if high priority issues
  if [ "$HIGH_PRIORITY" -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
fi
