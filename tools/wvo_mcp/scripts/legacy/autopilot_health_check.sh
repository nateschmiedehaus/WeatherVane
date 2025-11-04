#!/bin/bash
# Autopilot Health Check Script
# Usage: ./scripts/autopilot_health_check.sh [quick|full]

set -e

MODE="${1:-full}"
DB="state/orchestrator.db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Autopilot Health Check ($MODE mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

WARNINGS=0
ERRORS=0

# Check 1: Database exists and is readable
echo -n "1. Database accessibility... "
if [ ! -f "$DB" ]; then
  echo -e "${RED}✗ FAIL${NC}"
  echo "   Database not found at $DB"
  ((ERRORS++))
  exit 1
fi
echo -e "${GREEN}✓ PASS${NC}"

# Check 2: Stale in-progress tasks
echo -n "2. Stale in-progress tasks... "
STALE=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM tasks
  WHERE status = 'in_progress'
    AND (assigned_to IS NULL OR assigned_to = '')
    AND started_at IS NOT NULL
    AND (julianday('now') - julianday(started_at/1000, 'unixepoch')) * 24 * 60 > 5;
" 2>/dev/null || echo "ERROR")

if [ "$STALE" = "ERROR" ]; then
  echo -e "${RED}✗ FAIL${NC}"
  echo "   Unable to query database"
  ((ERRORS++))
elif [ "$STALE" -gt 0 ]; then
  echo -e "${YELLOW}⚠ WARNING${NC}"
  echo "   Found $STALE stale task(s) (in_progress with no agent for >5min)"
  echo "   Run: sqlite3 $DB \"UPDATE tasks SET status='pending', assigned_to=NULL, started_at=NULL WHERE status='in_progress' AND (assigned_to IS NULL OR assigned_to='');\""
  ((WARNINGS++))
else
  echo -e "${GREEN}✓ PASS${NC}"
fi

# Check 3: Dependency sync health
echo -n "3. Dependency sync... "
TASKS_WITH_DEPS=$(sqlite3 "$DB" "
  SELECT COUNT(*) FROM tasks
  WHERE metadata LIKE '%\"dependencies\":[%'
    AND metadata NOT LIKE '%\"dependencies\":[]%';
" 2>/dev/null || echo "0")

DEPS_IN_TABLE=$(sqlite3 "$DB" "
  SELECT COUNT(DISTINCT task_id) FROM task_dependencies;
" 2>/dev/null || echo "0")

if [ "$TASKS_WITH_DEPS" -eq 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} (no dependencies)"
elif [ "$DEPS_IN_TABLE" -eq 0 ] && [ "$TASKS_WITH_DEPS" -gt 0 ]; then
  echo -e "${RED}✗ FAIL${NC}"
  echo "   $TASKS_WITH_DEPS tasks have dependencies in metadata but none in task_dependencies table!"
  echo "   Dependencies are NOT synced from YAML to database"
  echo "   Run: node scripts/force_roadmap_sync.mjs"
  ((ERRORS++))
else
  SYNC_RATIO=$(echo "scale=2; $DEPS_IN_TABLE / $TASKS_WITH_DEPS" | bc)
  if [ "$(echo "$SYNC_RATIO < 0.5" | bc)" -eq 1 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "   Sync ratio low: $DEPS_IN_TABLE/$TASKS_WITH_DEPS = $SYNC_RATIO (expected ~1.0)"
    echo "   Some dependencies may not be synced"
    ((WARNINGS++))
  else
    echo -e "${GREEN}✓ PASS${NC} ($SYNC_RATIO sync ratio)"
  fi
fi

# Check 4: Ready tasks availability
echo -n "4. Ready tasks availability... "
PENDING=$(sqlite3 "$DB" "SELECT COUNT(*) FROM tasks WHERE status = 'pending';" 2>/dev/null || echo "0")
READY=$(node -e "
const db = require('better-sqlite3')('$DB');
const StateMachine = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js').StateMachine;
const sm = new StateMachine(db);
console.log(sm.getReadyTasks().length);
db.close();
" 2>/dev/null || echo "ERROR")

if [ "$READY" = "ERROR" ]; then
  echo -e "${YELLOW}⚠ WARNING${NC}"
  echo "   Unable to check ready tasks (state machine not available)"
  ((WARNINGS++))
elif [ "$READY" -eq 0 ] && [ "$PENDING" -gt 0 ]; then
  echo -e "${YELLOW}⚠ WARNING${NC}"
  echo "   $PENDING pending tasks but 0 ready (all blocked by dependencies or filters)"
  ((WARNINGS++))
elif [ "$READY" -gt 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} ($READY ready out of $PENDING pending)"
else
  echo -e "${GREEN}✓ PASS${NC} (no pending tasks)"
fi

# Check 5: Recent completions (throughput check)
if [ "$MODE" = "full" ]; then
  echo -n "5. Recent throughput... "
  COMPLETED_1H=$(sqlite3 "$DB" "
    SELECT COUNT(*) FROM tasks
    WHERE status = 'done'
      AND completed_at IS NOT NULL
      AND completed_at > (unixepoch('now') - 3600) * 1000;
  " 2>/dev/null || echo "0")

  if [ "$COMPLETED_1H" -eq 0 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "   Zero tasks completed in last hour (autopilot may be idle or stuck)"
    ((WARNINGS++))
  elif [ "$COMPLETED_1H" -lt 5 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "   Low throughput: $COMPLETED_1H tasks/hour"
    ((WARNINGS++))
  else
    echo -e "${GREEN}✓ PASS${NC} ($COMPLETED_1H tasks in last hour)"
  fi

  # Check 6: Failed tasks
  echo -n "6. Recent failures... "
  FAILED_1H=$(sqlite3 "$DB" "
    SELECT COUNT(*) FROM tasks
    WHERE status = 'failed'
      AND updated_at > (unixepoch('now') - 3600) * 1000;
  " 2>/dev/null || echo "0")

  if [ "$FAILED_1H" -gt 10 ]; then
    echo -e "${RED}✗ FAIL${NC}"
    echo "   High failure rate: $FAILED_1H failures in last hour"
    ((ERRORS++))
  elif [ "$FAILED_1H" -gt 0 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "   $FAILED_1H task(s) failed in last hour"
    ((WARNINGS++))
  else
    echo -e "${GREEN}✓ PASS${NC} (no failures)"
  fi

  # Check 7: Database size
  echo -n "7. Database size... "
  DB_SIZE=$(du -h "$DB" | cut -f1)
  DB_SIZE_BYTES=$(du -b "$DB" | cut -f1)
  DB_SIZE_MB=$((DB_SIZE_BYTES / 1024 / 1024))

  if [ "$DB_SIZE_MB" -gt 500 ]; then
    echo -e "${RED}✗ FAIL${NC}"
    echo "   Database too large: $DB_SIZE (may need cleanup)"
    ((ERRORS++))
  elif [ "$DB_SIZE_MB" -gt 100 ]; then
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo "   Database growing large: $DB_SIZE"
    ((WARNINGS++))
  else
    echo -e "${GREEN}✓ PASS${NC} ($DB_SIZE)"
  fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Health Check Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✓ ALL CHECKS PASSED${NC}"
  echo ""
  echo "Autopilot is healthy and ready to run."
  exit 0
elif [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}✗ $ERRORS ERROR(S), $WARNINGS WARNING(S)${NC}"
  echo ""
  echo "Autopilot has critical issues that must be fixed before running."
  echo "See above for recommended actions."
  exit 2
else
  echo -e "${YELLOW}⚠ $WARNINGS WARNING(S)${NC}"
  echo ""
  echo "Autopilot has minor issues. Review warnings and consider fixing."
  echo "Safe to proceed with caution."
  exit 1
fi
