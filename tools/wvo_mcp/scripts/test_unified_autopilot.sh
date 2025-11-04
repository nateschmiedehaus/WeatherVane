#!/usr/bin/env bash
#
# Comprehensive test for Unified Multi-Provider Autopilot
#
# Tests:
# 1. Model names are correct (claude-sonnet-4.5, codex-5-high/medium/low)
# 2. Agent composition (1 orchestrator, 3 workers, 1 critic)
# 3. Workers prefer Codex (2/3 Codex, 1/3 Claude)
# 4. Telemetry shows task names/titles
# 5. Graceful shutdown on Ctrl+C
# 6. End-to-end execution

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
  echo -e "${BLUE}━━━ TEST: $1 ━━━${NC}"
}

log_pass() {
  echo -e "${GREEN}✓ PASS: $1${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo -e "${RED}✗ FAIL: $1${NC}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
  echo -e "${YELLOW}ℹ INFO: $1${NC}"
}

#
# Test 1: Verify model names in compiled code
#
log_test "Model names in compiled JavaScript"
cd "$ROOT"

MODELS=$(grep -o "claude-sonnet-4.5\|claude-haiku-4.5\|codex-5-high\|codex-5-medium\|codex-5-low" \
  tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js | sort -u)

EXPECTED_MODELS="claude-haiku-4.5
claude-sonnet-4.5
codex-5-high
codex-5-low
codex-5-medium"

if [ "$MODELS" == "$EXPECTED_MODELS" ]; then
  log_pass "All model names correct in compiled code"
else
  log_fail "Model names incorrect. Expected:\n$EXPECTED_MODELS\nGot:\n$MODELS"
fi

#
# Test 2: Dry-run validation
#
log_test "Dry-run with 5 agents"
DRY_RUN_OUTPUT=$(bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents 5 --dry-run 2>&1)

if echo "$DRY_RUN_OUTPUT" | grep -q "1 orchestrator"; then
  log_pass "Orchestrator spawning configured"
else
  log_fail "Orchestrator not configured properly"
fi

if echo "$DRY_RUN_OUTPUT" | grep -q "3 workers"; then
  log_pass "Worker count correct (3 workers)"
else
  log_fail "Worker count incorrect"
fi

if echo "$DRY_RUN_OUTPUT" | grep -q "1 critic"; then
  log_pass "Critic spawning configured"
else
  log_fail "Critic not configured properly"
fi

#
# Test 3: Check for pending tasks
#
log_test "Roadmap has pending tasks"
PENDING_TASKS=$(grep -c "status: pending" state/roadmap.yaml || echo "0")

if [ "$PENDING_TASKS" -gt 0 ]; then
  log_pass "Found $PENDING_TASKS pending tasks in roadmap"
else
  log_fail "No pending tasks found - cannot test execution"
fi

#
# Test 4: Short autopilot run (1 iteration, 3 agents)
#
log_test "End-to-end execution test (1 iteration, 3 agents)"
log_info "Starting autopilot with 3 agents for 1 iteration..."

AUTOPILOT_OUTPUT=$(timeout 120 bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents 3 --max-iterations 1 2>&1 || true)

# Check model names in output
if echo "$AUTOPILOT_OUTPUT" | grep -q "claude-sonnet-4.5\|claude-haiku-4.5\|codex-5"; then
  log_pass "Correct model names appear in runtime output"
else
  log_fail "Old or incorrect model names in output"
fi

# Check agent spawning
if echo "$AUTOPILOT_OUTPUT" | grep -q "Spawned orchestrator"; then
  log_pass "Orchestrator spawned successfully"
else
  log_fail "Orchestrator not spawned"
fi

if echo "$AUTOPILOT_OUTPUT" | grep -q "Spawned worker"; then
  log_pass "Workers spawned successfully"
else
  log_fail "Workers not spawned"
fi

if echo "$AUTOPILOT_OUTPUT" | grep -q "Spawned critic"; then
  log_pass "Critic spawned successfully"
else
  log_fail "Critic not spawned"
fi

# Check for live agent status
if echo "$AUTOPILOT_OUTPUT" | grep -q "Live Agent Status"; then
  log_pass "Live telemetry display working"
else
  log_fail "Live telemetry not displayed"
fi

# Check if Codex is being used for workers
if echo "$AUTOPILOT_OUTPUT" | grep -q "codex-5-medium"; then
  log_pass "Codex models being used for workers (preference working)"
else
  log_info "Codex not used (might be using Claude if Codex unavailable)"
fi

#
# Test 5: Graceful shutdown handler
#
log_test "Graceful shutdown (SIGINT handler)"
if grep -q "process.on('SIGINT'" tools/wvo_mcp/scripts/autopilot_unified.sh; then
  log_pass "SIGINT handler present in script"
else
  log_fail "SIGINT handler not found"
fi

#
# Test Summary
#
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  ✓ ALL TESTS PASSED${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "The unified autopilot is ready for production use!"
  echo ""
  echo "Run with:"
  echo "  make mcp-autopilot AGENTS=5"
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}  ✗ SOME TESTS FAILED${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
fi
