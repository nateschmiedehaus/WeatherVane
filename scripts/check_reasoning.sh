#!/usr/bin/env bash
# Reasoning Validation Check Script
# Verifies work process compliance, assumptions documented, evidence quality
# Usage: bash scripts/check_reasoning.sh --task TASK_ID [--source manual|autopilot]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
SOURCE=${SOURCE:-manual}
TASK_ID=""
REPORT_FILE=""
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
      echo "Usage: $0 --task TASK_ID [--source manual|autopilot]"
      echo ""
      echo "Reasoning validation verifies work process compliance."
      echo ""
      echo "Options:"
      echo "  --task TASK_ID        Task identifier (required)"
      echo "  --source SOURCE       Execution source: manual or autopilot"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$TASK_ID" ]; then
  echo -e "${RED}Error: --task is required${NC}"
  exit 1
fi

# Security: Validate TASK_ID to prevent path traversal
# Allow only alphanumeric, dashes, underscores, and dots (for version numbers)
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

REPORT_FILE="/tmp/reasoning_report_${TASK_ID}_$$.json"
EVIDENCE_DIR="state/evidence/$TASK_ID"

# Initialize report
cat > "$REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source": "$SOURCE",
  "task_id": "$TASK_ID",
  "checks": {
    "assumptions": {},
    "work_process": {},
    "adversarial_review": {},
    "pre_mortem": {},
    "decisions": {}
  },
  "violations": [],
  "summary": {
    "total_checks": 0,
    "passed_checks": 0,
    "failed_checks": 0
  },
  "status": "pending"
}
EOF

echo -e "${GREEN}🧠 Running reasoning validation checks for task: $TASK_ID${NC}"
echo ""

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
declare -a VIOLATIONS

# Helper function
update_check() {
  local category=$1
  local check=$2
  local status=$3
  local details=$4

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  if [ "$status" = "pass" ]; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    echo -e "  ${GREEN}✓${NC} $check"
  else
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    echo -e "  ${RED}✗${NC} $check: $details"
    VIOLATIONS+=("$category/$check: $details")
  fi
}

# ============================================
# ASSUMPTION VALIDATION
# ============================================
echo -e "${YELLOW}💭 Assumption Validation${NC}"

# Check 1: Assumptions register exists
ASSUMPTIONS_FILE="$EVIDENCE_DIR/think/assumptions.md"
if [ -f "$ASSUMPTIONS_FILE" ]; then
  update_check "assumptions" "register_exists" "pass" "Assumptions register found"

  # Check 2: Register is non-empty
  if [ $(wc -l < "$ASSUMPTIONS_FILE") -gt 20 ]; then
    update_check "assumptions" "register_substantive" "pass" "Register contains content"
  else
    update_check "assumptions" "register_substantive" "fail" "Register too short (<20 lines)"
  fi

  # Check 3: Assumptions have IDs
  ASM_COUNT=$(grep -c "ASM-[0-9]" "$ASSUMPTIONS_FILE" || echo "0")
  if [ "$ASM_COUNT" -gt 0 ]; then
    update_check "assumptions" "assumptions_documented" "pass" "$ASM_COUNT assumptions documented"
  else
    update_check "assumptions" "assumptions_documented" "fail" "No numbered assumptions found"
  fi
else
  update_check "assumptions" "register_exists" "fail" "Assumptions register not found"
  update_check "assumptions" "register_substantive" "fail" "No register to check"
  update_check "assumptions" "assumptions_documented" "fail" "No register to check"
fi

# Check 4: Scan code for undocumented assumptions
# Look for assumption keywords in source code
ASSUMPTION_KEYWORDS="we assume|users will|this should|will always|will never"
UNDOCUMENTED=$(grep -ri "$ASSUMPTION_KEYWORDS" src/ tools/wvo_mcp/src/ --include="*.ts" --exclude="*.test.ts" 2>/dev/null | wc -l | tr -d ' \n' || echo "0")
UNDOCUMENTED=${UNDOCUMENTED:-0}
if [ "$UNDOCUMENTED" -eq 0 ]; then
  update_check "assumptions" "no_undocumented" "pass" "No undocumented assumptions in code"
else
  update_check "assumptions" "no_undocumented" "fail" "$UNDOCUMENTED potential undocumented assumptions"
fi

echo ""

# ============================================
# WORK PROCESS COMPLIANCE
# ============================================
echo -e "${YELLOW}📋 Work Process Compliance${NC}"

# Check 1: Evidence directory exists
if [ -d "$EVIDENCE_DIR" ]; then
  update_check "work_process" "evidence_dir" "pass" "Evidence directory exists"

  # Check 2: All 9 phases present
  REQUIRED_PHASES=("strategize" "spec" "plan" "think" "implement" "verify" "review" "pr" "monitor")
  MISSING_PHASES=()
  for phase in "${REQUIRED_PHASES[@]}"; do
    if [ ! -d "$EVIDENCE_DIR/$phase" ]; then
      MISSING_PHASES+=("$phase")
    fi
  done

  if [ ${#MISSING_PHASES[@]} -eq 0 ]; then
    update_check "work_process" "all_phases" "pass" "All 9 phases present"
  else
    update_check "work_process" "all_phases" "fail" "Missing: ${MISSING_PHASES[*]}"
  fi

  # Check 3: Evidence quality (non-empty, substantive)
  EMPTY_PHASES=0
  for phase in "${REQUIRED_PHASES[@]}"; do
    if [ -d "$EVIDENCE_DIR/$phase" ]; then
      PHASE_SIZE=$(find "$EVIDENCE_DIR/$phase" -type f -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}' | tr -d ' \n' || echo "0")
      PHASE_SIZE=${PHASE_SIZE:-0}
      if [ "$PHASE_SIZE" -lt 50 ]; then
        EMPTY_PHASES=$((EMPTY_PHASES + 1))
      fi
    fi
  done

  if [ "$EMPTY_PHASES" -eq 0 ]; then
    update_check "work_process" "evidence_quality" "pass" "All phases have substantive content"
  else
    update_check "work_process" "evidence_quality" "fail" "$EMPTY_PHASES phases have minimal content"
  fi
else
  update_check "work_process" "evidence_dir" "fail" "Evidence directory not found"
  update_check "work_process" "all_phases" "fail" "No evidence directory"
  update_check "work_process" "evidence_quality" "fail" "No evidence directory"
fi

echo ""

# ============================================
# ADVERSARIAL REVIEW
# ============================================
echo -e "${YELLOW}🤔 Adversarial Review${NC}"

REVIEW_FILE="$EVIDENCE_DIR/review/adversarial_review.md"
if [ -f "$REVIEW_FILE" ]; then
  update_check "adversarial_review" "review_exists" "pass" "Adversarial review found"

  # Check minimum 10 questions
  QUESTION_COUNT=$(grep -c "^###.*?" "$REVIEW_FILE" || echo "0")
  if [ "$QUESTION_COUNT" -ge 10 ]; then
    update_check "adversarial_review" "min_questions" "pass" "$QUESTION_COUNT questions asked"
  else
    update_check "adversarial_review" "min_questions" "fail" "Only $QUESTION_COUNT questions (need ≥10)"
  fi

  # Check for gaps section
  if grep -q "## Gaps\|## Issues\|## Concerns" "$REVIEW_FILE"; then
    update_check "adversarial_review" "gaps_identified" "pass" "Gaps section present"
  else
    update_check "adversarial_review" "gaps_identified" "fail" "No gaps section found"
  fi
else
  update_check "adversarial_review" "review_exists" "fail" "Adversarial review not found"
  update_check "adversarial_review" "min_questions" "fail" "No review file"
  update_check "adversarial_review" "gaps_identified" "fail" "No review file"
fi

echo ""

# ============================================
# PRE-MORTEM (if complexity ≥8)
# ============================================
echo -e "${YELLOW}🔮 Pre-Mortem Check${NC}"

# Get task complexity from roadmap
COMPLEXITY=0
if [ -f "state/roadmap.yaml" ] && command -v yq &> /dev/null; then
  COMPLEXITY=$(yq ".tasks[] | select(.id == \"$TASK_ID\") | .complexity_score" state/roadmap.yaml 2>/dev/null || echo "0")
fi

PRE_MORTEM_FILE="$EVIDENCE_DIR/think/pre_mortem.md"
if [ "$COMPLEXITY" -ge 8 ]; then
  echo "  Task complexity: $COMPLEXITY (pre-mortem required)"

  if [ -f "$PRE_MORTEM_FILE" ]; then
    update_check "pre_mortem" "exists" "pass" "Pre-mortem found"

    # Check for failure scenarios
    SCENARIO_COUNT=$(grep -c "## Failure Scenario\|### Failure Scenario" "$PRE_MORTEM_FILE" || echo "0")
    if [ "$SCENARIO_COUNT" -ge 5 ]; then
      update_check "pre_mortem" "min_scenarios" "pass" "$SCENARIO_COUNT failure scenarios"
    else
      update_check "pre_mortem" "min_scenarios" "fail" "Only $SCENARIO_COUNT scenarios (need ≥5)"
    fi

    # Check for mitigations
    if grep -q "### Prevention\|### Mitigation" "$PRE_MORTEM_FILE"; then
      update_check "pre_mortem" "mitigations" "pass" "Mitigations documented"
    else
      update_check "pre_mortem" "mitigations" "fail" "No mitigations section"
    fi
  else
    update_check "pre_mortem" "exists" "fail" "Pre-mortem required but not found"
    update_check "pre_mortem" "min_scenarios" "fail" "No pre-mortem file"
    update_check "pre_mortem" "mitigations" "fail" "No pre-mortem file"
  fi
else
  echo "  Task complexity: $COMPLEXITY (pre-mortem not required)"
  update_check "pre_mortem" "not_required" "pass" "Pre-mortem not required for complexity <8"
fi

echo ""

# ============================================
# DECISION DOCUMENTATION
# ============================================
echo -e "${YELLOW}🎯 Decision Documentation${NC}"

# Check for alternatives considered in strategy/spec
STRATEGY_FILE="$EVIDENCE_DIR/strategize/strategy.md"
ALTERNATIVES_MENTIONED=0

if [ -f "$STRATEGY_FILE" ]; then
  if grep -q "## Alternatives\|Alternative [0-9]" "$STRATEGY_FILE"; then
    update_check "decisions" "alternatives" "pass" "Alternatives considered"
    ALTERNATIVES_MENTIONED=1
  fi
fi

if [ "$ALTERNATIVES_MENTIONED" -eq 0 ]; then
  update_check "decisions" "alternatives" "fail" "No alternatives section found"
fi

# Check for trade-offs documented
if [ -f "$STRATEGY_FILE" ]; then
  if grep -qi "trade.?off\|pros.*cons\|advantage.*disadvantage" "$STRATEGY_FILE"; then
    update_check "decisions" "tradeoffs" "pass" "Trade-offs documented"
  else
    update_check "decisions" "tradeoffs" "fail" "No trade-off analysis found"
  fi
else
  update_check "decisions" "tradeoffs" "fail" "No strategy file to check"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Summary${NC}"
echo -e "  Total checks: $TOTAL_CHECKS"
echo -e "  ${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "  ${RED}Failed: $FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -gt 0 ]; then
  echo -e "${RED}Violations:${NC}"
  for violation in "${VIOLATIONS[@]}"; do
    echo -e "  • $violation"
  done
  echo ""
fi

# Update final report
if command -v jq &> /dev/null; then
  jq ".summary.total_checks = $TOTAL_CHECKS | .summary.passed_checks = $PASSED_CHECKS | .summary.failed_checks = $FAILED_CHECKS" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
  mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

  # Add violations
  for violation in "${VIOLATIONS[@]}"; do
    jq ".violations += [\"$violation\"]" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  done

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
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/reasoning_validation_runs.jsonl"
fi

# Exit code
if [ $FAILED_CHECKS -eq 0 ]; then
  echo -e "${GREEN}✅ All reasoning checks passed!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${RED}❌ Reasoning validation failed!${NC}"
  echo ""
  echo "Please address the violations above."
  echo "Report saved to: $REPORT_FILE"
  exit 1
fi
