#!/usr/bin/env bash
# Failure Hunting Script
# Proactively searches for technical failures, flaky tests, dead code, and security issues
# Usage: bash scripts/hunt_failures.sh [--report-only] [--fix-auto]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REPORT_ONLY=${REPORT_ONLY:-false}
FIX_AUTO=${FIX_AUTO:-false}
REPORT_FILE="/tmp/hunt_failures_$$.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --report-only)
      REPORT_ONLY=true
      shift
      ;;
    --fix-auto)
      FIX_AUTO=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--report-only] [--fix-auto]"
      echo ""
      echo "Proactively hunts for technical failures in the codebase."
      echo ""
      echo "Options:"
      echo "  --report-only     Only generate report, don't create tasks"
      echo "  --fix-auto        Automatically fix simple issues"
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
  "hunt_type": "technical_failures",
  "issues": {
    "flaky_tests": [],
    "dead_code": [],
    "security_vulnerabilities": [],
    "type_errors": [],
    "lint_errors": [],
    "import_errors": [],
    "unused_dependencies": []
  },
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
EOF

echo -e "${GREEN}🔍 Hunting for technical failures...${NC}"
echo ""

TOTAL_ISSUES=0
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

# ============================================
# FLAKY TEST DETECTION
# ============================================
echo -e "${YELLOW}🧪 Detecting flaky tests...${NC}"

# Run tests 3 times and compare results
FLAKY_TESTS=()
TEST_RUN_1=$(npm test --silent 2>&1 | grep "PASS\|FAIL" | sort || true)
TEST_RUN_2=$(npm test --silent 2>&1 | grep "PASS\|FAIL" | sort || true)
TEST_RUN_3=$(npm test --silent 2>&1 | grep "PASS\|FAIL" | sort || true)

# Simple flaky detection: if results differ across runs
if [ "$TEST_RUN_1" != "$TEST_RUN_2" ] || [ "$TEST_RUN_2" != "$TEST_RUN_3" ]; then
  echo -e "  ${RED}⚠${NC} Potential flaky tests detected"
  FLAKY_TESTS+=("Inconsistent test results across runs")
  HIGH_COUNT=$((HIGH_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} No flaky tests detected"
fi

# Check for tests with .skip or .only
SKIPPED_TESTS=$(grep -rn "\.skip\|\.only\|it\.skip\|describe\.skip" src/ tools/wvo_mcp/src/ --include="*.test.ts" 2>/dev/null | wc -l || echo "0")
if [ "$SKIPPED_TESTS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $SKIPPED_TESTS skipped/focused tests found"
  MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# DEAD CODE DETECTION
# ============================================
echo -e "${YELLOW}💀 Detecting dead code...${NC}"

# Unused exports (simplified)
UNUSED_EXPORTS=$(grep -rn "export function\|export const\|export class" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" | \
  while read -r line; do
    export_name=$(echo "$line" | sed -n 's/.*export \(function\|const\|class\) \([a-zA-Z0-9_]*\).*/\2/p')
    if [ -n "$export_name" ]; then
      import_count=$(grep -r "import.*$export_name" src/ tools/wvo_mcp/src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
      if [ "$import_count" -eq 0 ]; then
        echo "$line"
      fi
    fi
  done | wc -l || echo "0")

if [ "$UNUSED_EXPORTS" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $UNUSED_EXPORTS potentially unused exports"
  LOW_COUNT=$((LOW_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} No obvious unused exports"
fi

# Unreachable code after return
UNREACHABLE=$(grep -rn "return.*\n.*[^}]" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")
if [ "$UNREACHABLE" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $UNREACHABLE potential unreachable code blocks"
  MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# SECURITY VULNERABILITIES
# ============================================
echo -e "${YELLOW}🔒 Scanning for security vulnerabilities...${NC}"

# npm audit
if npm audit --audit-level=moderate --json > /tmp/npm_audit_$$.json 2>/dev/null; then
  CRITICAL_VULNS=0
  HIGH_VULNS=0

  if command -v jq &> /dev/null; then
    CRITICAL_VULNS=$(jq '.metadata.vulnerabilities.critical // 0' /tmp/npm_audit_$$.json)
    HIGH_VULNS=$(jq '.metadata.vulnerabilities.high // 0' /tmp/npm_audit_$$.json)
  fi

  if [ "$CRITICAL_VULNS" -gt 0 ]; then
    echo -e "  ${RED}⚠${NC} $CRITICAL_VULNS CRITICAL vulnerabilities"
    CRITICAL_COUNT=$((CRITICAL_COUNT + CRITICAL_VULNS))
    TOTAL_ISSUES=$((TOTAL_ISSUES + CRITICAL_VULNS))
  fi

  if [ "$HIGH_VULNS" -gt 0 ]; then
    echo -e "  ${RED}⚠${NC} $HIGH_VULNS HIGH vulnerabilities"
    HIGH_COUNT=$((HIGH_COUNT + HIGH_VULNS))
    TOTAL_ISSUES=$((TOTAL_ISSUES + HIGH_VULNS))
  fi

  if [ "$CRITICAL_VULNS" -eq 0 ] && [ "$HIGH_VULNS" -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} No critical/high vulnerabilities"
  fi
fi

# Hardcoded secrets detection (simple patterns)
SECRETS=$(grep -rn "password\s*=\|api_key\s*=\|secret\s*=\|token\s*=" src/ tools/wvo_mcp/src/ \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null | \
  grep -v "process.env\|config\|import" | wc -l || echo "0")

if [ "$SECRETS" -gt 0 ]; then
  echo -e "  ${RED}⚠${NC} $SECRETS potential hardcoded secrets"
  CRITICAL_COUNT=$((CRITICAL_COUNT + SECRETS))
  TOTAL_ISSUES=$((TOTAL_ISSUES + SECRETS))
fi

echo ""

# ============================================
# TYPE ERRORS
# ============================================
echo -e "${YELLOW}📝 Checking for type errors...${NC}"

if npm run typecheck > /tmp/typecheck_$$.log 2>&1; then
  echo -e "  ${GREEN}✓${NC} No type errors"
else
  TYPE_ERROR_COUNT=$(grep -c "error TS" /tmp/typecheck_$$.log || echo "0")
  echo -e "  ${RED}⚠${NC} $TYPE_ERROR_COUNT type errors"
  HIGH_COUNT=$((HIGH_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# LINT ERRORS
# ============================================
echo -e "${YELLOW}🔍 Checking for lint errors...${NC}"

if npm run lint > /tmp/lint_$$.log 2>&1; then
  echo -e "  ${GREEN}✓${NC} No lint errors"
else
  LINT_ERROR_COUNT=$(grep -c "error" /tmp/lint_$$.log || echo "0")
  if [ "$LINT_ERROR_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} $LINT_ERROR_COUNT lint errors"
    MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
  fi
fi

echo ""

# ============================================
# IMPORT ERRORS
# ============================================
echo -e "${YELLOW}📦 Checking for import errors...${NC}"

# Circular dependencies (simplified)
CIRCULAR=$(find src/ tools/wvo_mcp/src/ -name "*.ts" -not -name "*.test.ts" | \
  while read -r file; do
    imports=$(grep -o "from ['\"]\..*['\"]" "$file" 2>/dev/null | sed "s/from ['\"]//g" | sed "s/['\"]//g" || true)
    for import in $imports; do
      # Resolve relative import
      import_file=$(dirname "$file")/$import
      if [ -f "$import_file.ts" ]; then
        reverse_imports=$(grep -o "from ['\"]\..*['\"]" "$import_file.ts" 2>/dev/null || true)
        if echo "$reverse_imports" | grep -q "$(basename "$file" .ts)"; then
          echo "$file <-> $import_file.ts"
        fi
      fi
    done
  done | sort -u | wc -l || echo "0")

if [ "$CIRCULAR" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $CIRCULAR potential circular dependencies"
  MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
else
  echo -e "  ${GREEN}✓${NC} No circular dependencies detected"
fi

# Missing imports (TypeScript will catch most, but check for dynamic requires)
DYNAMIC_REQUIRES=$(grep -rn "require(" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l || echo "0")
if [ "$DYNAMIC_REQUIRES" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC} $DYNAMIC_REQUIRES dynamic require() calls (prefer static imports)"
  LOW_COUNT=$((LOW_COUNT + 1))
  TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
fi

echo ""

# ============================================
# UNUSED DEPENDENCIES
# ============================================
echo -e "${YELLOW}📚 Checking for unused dependencies...${NC}"

# Check package.json dependencies against actual imports
if [ -f "package.json" ] && command -v jq &> /dev/null; then
  DEPS=$(jq -r '.dependencies | keys[]' package.json 2>/dev/null || true)
  UNUSED_DEPS=0

  for dep in $DEPS; do
    # Skip certain packages that don't need explicit imports
    case "$dep" in
      "@types/"*|"eslint-"*|"prettier"*|"typescript"|"ts-node")
        continue
        ;;
    esac

    # Check if dependency is imported anywhere
    IMPORT_COUNT=$(grep -r "from ['\"]$dep" src/ tools/wvo_mcp/src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")
    REQUIRE_COUNT=$(grep -r "require(['\"]$dep" src/ tools/wvo_mcp/src/ --include="*.ts" 2>/dev/null | wc -l || echo "0")

    if [ "$IMPORT_COUNT" -eq 0 ] && [ "$REQUIRE_COUNT" -eq 0 ]; then
      UNUSED_DEPS=$((UNUSED_DEPS + 1))
    fi
  done

  if [ "$UNUSED_DEPS" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} $UNUSED_DEPS potentially unused dependencies"
    LOW_COUNT=$((LOW_COUNT + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
  else
    echo -e "  ${GREEN}✓${NC} No obviously unused dependencies"
  fi
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Hunt Summary${NC}"
echo -e "  Total issues found: $TOTAL_ISSUES"
echo -e "  ${RED}Critical: $CRITICAL_COUNT${NC}"
echo -e "  ${RED}High: $HIGH_COUNT${NC}"
echo -e "  ${YELLOW}Medium: $MEDIUM_COUNT${NC}"
echo -e "  ${YELLOW}Low: $LOW_COUNT${NC}"
echo ""

# Update report
if command -v jq &> /dev/null; then
  jq ".summary.total_issues = $TOTAL_ISSUES | \
      .summary.critical = $CRITICAL_COUNT | \
      .summary.high = $HIGH_COUNT | \
      .summary.medium = $MEDIUM_COUNT | \
      .summary.low = $LOW_COUNT" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
fi

# Log to analytics
ANALYTICS_DIR="state/analytics"
mkdir -p "$ANALYTICS_DIR"
if [ -f "$REPORT_FILE" ]; then
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/failure_hunt_runs.jsonl"
fi

# Auto-create FIX tasks if not in report-only mode
if [ "$REPORT_ONLY" = "false" ] && [ "$TOTAL_ISSUES" -gt 0 ]; then
  echo -e "${YELLOW}Creating FIX-TECH-* tasks...${NC}"

  # This would call the task creator (Phase 3)
  # For now, just log intention
  echo "  Tasks would be created for $TOTAL_ISSUES issues"
  echo "  (Task creation implemented in Phase 3)"
  echo ""
fi

# Exit code
if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo -e "${GREEN}✅ No technical failures found!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${RED}⚠ $TOTAL_ISSUES technical issues found!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"

  # Only fail if critical or high issues
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
fi
