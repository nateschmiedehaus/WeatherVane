#!/usr/bin/env bash
# Reasoning Hunting Script
# Proactively searches for reasoning flaws: undocumented assumptions, fabricated evidence, skipped thinking
# Usage: bash scripts/hunt_reasoning.sh [--report-only] [--all-tasks]

set -euo pipefail

# Source reasoning checks library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/reasoning_checks.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REPORT_ONLY=${REPORT_ONLY:-false}
ALL_TASKS=${ALL_TASKS:-false}
REPORT_FILE="/tmp/hunt_reasoning_$$.json"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(pwd)}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --report-only)
      REPORT_ONLY=true
      shift
      ;;
    --all-tasks)
      ALL_TASKS=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--report-only] [--all-tasks]"
      echo ""
      echo "Proactively hunts for reasoning flaws in task evidence."
      echo ""
      echo "Options:"
      echo "  --report-only     Only generate report, don't create tasks"
      echo "  --all-tasks       Check all tasks (default: only recent)"
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
  "hunt_type": "reasoning_issues",
  "issues": {
    "undocumented_assumptions": [],
    "fabricated_evidence": [],
    "skipped_phases": [],
    "low_quality_evidence": [],
    "missing_adversarial_review": [],
    "missing_pre_mortem": []
  },
  "tasks_checked": [],
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
EOF

echo -e "${GREEN}🔍 Hunting for reasoning flaws...${NC}"
echo ""

TOTAL_ISSUES=0
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

# ============================================
# IDENTIFY TASKS TO CHECK
# ============================================
echo -e "${YELLOW}📋 Identifying tasks to check...${NC}"

TASKS_TO_CHECK=()

if [ "$ALL_TASKS" = "true" ]; then
  # Check all tasks with evidence directories
  while IFS= read -r task_dir; do
    task_id=$(basename "$task_dir")
    TASKS_TO_CHECK+=("$task_id")
  done < <(find state/evidence/ -maxdepth 1 -type d -not -name "evidence" 2>/dev/null || true)
else
  # Check only recently active tasks (modified in last 7 days)
  while IFS= read -r task_dir; do
    if [ -n "$(find "$task_dir" -mtime -7 2>/dev/null)" ]; then
      task_id=$(basename "$task_dir")
      TASKS_TO_CHECK+=("$task_id")
    fi
  done < <(find state/evidence/ -maxdepth 1 -type d -not -name "evidence" 2>/dev/null || true)
fi

echo -e "  Found ${#TASKS_TO_CHECK[@]} tasks to check"
echo ""

if [ ${#TASKS_TO_CHECK[@]} -eq 0 ]; then
  echo -e "${YELLOW}No tasks found to check${NC}"
  exit 0
fi

# ============================================
# CHECK EACH TASK
# ============================================

for task_id in "${TASKS_TO_CHECK[@]}"; do
  echo -e "${YELLOW}Checking task: $task_id${NC}"

  # Skip if not ready for reasoning checks
  if ! is_task_ready_for_reasoning_checks "$task_id"; then
    echo -e "  ${YELLOW}⊘${NC} Not ready for reasoning checks"
    echo ""
    continue
  fi

  TASK_ISSUES=0

  # ============================================
  # ASSUMPTION VALIDATION
  # ============================================

  # Check if assumptions register exists
  if ! assumptions_register_exists "$task_id"; then
    echo -e "  ${RED}✗${NC} Missing assumptions register"
    CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    TASK_ISSUES=$((TASK_ISSUES + 1))
  else
    # Check if substantive
    if ! check_assumptions_substantive "$task_id" 20; then
      echo -e "  ${YELLOW}⚠${NC} Assumptions register too short"
      MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
      TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
      TASK_ISSUES=$((TASK_ISSUES + 1))
    fi

    # Check if assumptions are documented with IDs
    ASM_COUNT=$(count_assumptions "$task_id")
    if [ "$ASM_COUNT" -eq 0 ]; then
      echo -e "  ${RED}✗${NC} No numbered assumptions (ASM-001, etc.)"
      HIGH_COUNT=$((HIGH_COUNT + 1))
      TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
      TASK_ISSUES=$((TASK_ISSUES + 1))
    else
      echo -e "  ${GREEN}✓${NC} $ASM_COUNT assumptions documented"
    fi

    # Validate assumption structure
    ASM_VALIDATION=$(validate_assumption_structure "$task_id")
    if command -v jq &> /dev/null; then
      ASM_VALID=$(echo "$ASM_VALIDATION" | jq -r '.valid')
      if [ "$ASM_VALID" != "true" ]; then
        echo -e "  ${YELLOW}⚠${NC} Assumption structure incomplete"
        MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
        TASK_ISSUES=$((TASK_ISSUES + 1))
      fi
    fi
  fi

  # Check for undocumented assumptions in code
  UNDOCUMENTED_COUNT=$(count_undocumented_assumptions)
  if [ "$UNDOCUMENTED_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} $UNDOCUMENTED_COUNT potential undocumented assumptions in code"
    LOW_COUNT=$((LOW_COUNT + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    TASK_ISSUES=$((TASK_ISSUES + 1))
  fi

  # ============================================
  # WORK PROCESS COMPLIANCE
  # ============================================

  # Check for missing phases
  MISSING_PHASES=$(get_missing_phases "$task_id")
  if [ -n "$MISSING_PHASES" ]; then
    echo -e "  ${RED}✗${NC} Missing phases: $MISSING_PHASES"
    CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
    TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    TASK_ISSUES=$((TASK_ISSUES + 1))
  else
    echo -e "  ${GREEN}✓${NC} All 9 phases present"
  fi

  # Check evidence quality
  LOW_QUALITY_COUNT=$(count_low_quality_phases "$task_id")
  if [ "$LOW_QUALITY_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} $LOW_QUALITY_COUNT phases with low-quality evidence"
    MEDIUM_COUNT=$((MEDIUM_COUNT + LOW_QUALITY_COUNT))
    TOTAL_ISSUES=$((TOTAL_ISSUES + LOW_QUALITY_COUNT))
    TASK_ISSUES=$((TASK_ISSUES + LOW_QUALITY_COUNT))
  fi

  # ============================================
  # ADVERSARIAL REVIEW
  # ============================================

  ADV_VALIDATION=$(validate_adversarial_review "$task_id")
  if command -v jq &> /dev/null; then
    ADV_VALID=$(echo "$ADV_VALIDATION" | jq -r '.valid')
    ADV_QUESTIONS=$(echo "$ADV_VALIDATION" | jq -r '.question_count')

    if [ "$ADV_VALID" != "true" ]; then
      if [ "$ADV_QUESTIONS" -eq 0 ]; then
        echo -e "  ${RED}✗${NC} Missing adversarial review"
        HIGH_COUNT=$((HIGH_COUNT + 1))
      else
        echo -e "  ${YELLOW}⚠${NC} Adversarial review incomplete ($ADV_QUESTIONS < 10 questions)"
        MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
      fi
      TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
      TASK_ISSUES=$((TASK_ISSUES + 1))
    else
      echo -e "  ${GREEN}✓${NC} Adversarial review complete ($ADV_QUESTIONS questions)"
    fi
  fi

  # ============================================
  # PRE-MORTEM (if required)
  # ============================================

  PRE_MORTEM_VALIDATION=$(validate_pre_mortem "$task_id")
  if command -v jq &> /dev/null; then
    PM_REQUIRED=$(echo "$PRE_MORTEM_VALIDATION" | jq -r '.required')

    if [ "$PM_REQUIRED" = "true" ]; then
      PM_VALID=$(echo "$PRE_MORTEM_VALIDATION" | jq -r '.valid')

      if [ "$PM_VALID" != "true" ]; then
        PM_REASON=$(echo "$PRE_MORTEM_VALIDATION" | jq -r '.reason // "incomplete"')

        if [ "$PM_REASON" = "pre_mortem_not_found" ]; then
          echo -e "  ${RED}✗${NC} Missing required pre-mortem (complexity ≥8)"
          CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
        else
          echo -e "  ${YELLOW}⚠${NC} Pre-mortem incomplete"
          MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
        fi
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
        TASK_ISSUES=$((TASK_ISSUES + 1))
      else
        PM_SCENARIOS=$(echo "$PRE_MORTEM_VALIDATION" | jq -r '.scenario_count')
        echo -e "  ${GREEN}✓${NC} Pre-mortem complete ($PM_SCENARIOS scenarios)"
      fi
    fi
  fi

  # ============================================
  # DECISION DOCUMENTATION
  # ============================================

  DECISION_VALIDATION=$(validate_decision_documentation "$task_id")
  if command -v jq &> /dev/null; then
    DECISION_VALID=$(echo "$DECISION_VALIDATION" | jq -r '.valid')

    if [ "$DECISION_VALID" != "true" ]; then
      echo -e "  ${YELLOW}⚠${NC} Decision documentation incomplete (missing alternatives/trade-offs)"
      MEDIUM_COUNT=$((MEDIUM_COUNT + 1))
      TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
      TASK_ISSUES=$((TASK_ISSUES + 1))
    else
      echo -e "  ${GREEN}✓${NC} Decisions documented with alternatives and trade-offs"
    fi
  fi

  # ============================================
  # EVIDENCE QUALITY SCORING
  # ============================================

  # Score key evidence files
  EVIDENCE_FILES=(
    "state/evidence/$task_id/strategize/strategy.md"
    "state/evidence/$task_id/spec/spec.md"
    "state/evidence/$task_id/think/assumptions.md"
  )

  LOW_QUALITY_EVIDENCE=0

  for evidence_file in "${EVIDENCE_FILES[@]}"; do
    if [ -f "$evidence_file" ]; then
      QUALITY_SCORE=$(score_evidence_quality "$evidence_file")

      if command -v jq &> /dev/null; then
        SCORE=$(echo "$QUALITY_SCORE" | jq -r '.score')
        IS_TEMPLATED=$(echo "$QUALITY_SCORE" | jq -r '.is_templated')

        # Check if score is below threshold (0.8)
        if command -v bc &> /dev/null; then
          BELOW_THRESHOLD=$(echo "$SCORE < 0.8" | bc -l)
          if [ "$BELOW_THRESHOLD" = "1" ]; then
            echo -e "  ${YELLOW}⚠${NC} Low quality evidence: $(basename "$evidence_file") (score: $SCORE)"
            LOW_QUALITY_EVIDENCE=$((LOW_QUALITY_EVIDENCE + 1))
          fi
        fi

        # Critical if templated
        if [ "$IS_TEMPLATED" = "true" ]; then
          echo -e "  ${RED}✗${NC} Templated evidence detected: $(basename "$evidence_file")"
          CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
          TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
          TASK_ISSUES=$((TASK_ISSUES + 1))
        fi
      fi
    fi
  done

  if [ "$LOW_QUALITY_EVIDENCE" -gt 0 ]; then
    LOW_COUNT=$((LOW_COUNT + LOW_QUALITY_EVIDENCE))
    TOTAL_ISSUES=$((TOTAL_ISSUES + LOW_QUALITY_EVIDENCE))
    TASK_ISSUES=$((TASK_ISSUES + LOW_QUALITY_EVIDENCE))
  fi

  # Task summary
  if [ "$TASK_ISSUES" -eq 0 ]; then
    echo -e "  ${GREEN}✅ No reasoning issues${NC}"
  else
    echo -e "  ${RED}Found $TASK_ISSUES reasoning issues${NC}"
  fi

  echo ""
done

# ============================================
# CROSS-TASK ANALYSIS
# ============================================
echo -e "${YELLOW}🔗 Cross-task analysis...${NC}"

# Check for assumption inconsistencies across tasks
# (Simplified: look for conflicting assumptions)
ASSUMPTION_FILES=$(find state/evidence/ -name "assumptions.md" 2>/dev/null || true)
ASSUMPTION_COUNT=$(echo "$ASSUMPTION_FILES" | wc -l)

if [ "$ASSUMPTION_COUNT" -gt 1 ]; then
  echo -e "  Analyzed $ASSUMPTION_COUNT assumption registers"
  # TODO: Deep analysis of conflicting assumptions
  # For now, just note the count
else
  echo -e "  ${YELLOW}⚠${NC} Only $ASSUMPTION_COUNT task with assumptions"
fi

echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Hunt Summary${NC}"
echo -e "  Tasks checked: ${#TASKS_TO_CHECK[@]}"
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

  # Add tasks_checked array
  for task in "${TASKS_TO_CHECK[@]}"; do
    jq ".tasks_checked += [\"$task\"]" "$REPORT_FILE" > "${REPORT_FILE}.tmp"
    mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
  done
fi

# Log to analytics
ANALYTICS_DIR="state/analytics"
mkdir -p "$ANALYTICS_DIR"
if [ -f "$REPORT_FILE" ]; then
  cat "$REPORT_FILE" >> "$ANALYTICS_DIR/reasoning_hunt_runs.jsonl"
fi

# Auto-create FIX tasks if not in report-only mode
if [ "$REPORT_ONLY" = "false" ] && [ "$TOTAL_ISSUES" -gt 0 ]; then
  echo -e "${YELLOW}Creating FIX-REASON-* tasks...${NC}"
  echo "  Tasks would be created for $TOTAL_ISSUES issues"
  echo "  (Task creation implemented in Phase 3)"
  echo ""
fi

# Exit code
if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo -e "${GREEN}✅ No reasoning flaws found!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo -e "${RED}⚠ $TOTAL_ISSUES reasoning issues found!${NC}"
  echo ""
  echo "Report saved to: $REPORT_FILE"

  # Only fail if critical or high issues
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
fi
