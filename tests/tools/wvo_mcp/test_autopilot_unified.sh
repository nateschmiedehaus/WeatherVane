#!/usr/bin/env bash
#
# Integration tests for autopilot_unified.sh
#
# Tests:
# - Dry-run mode
# - Help message
# - Prerequisites validation
# - Account detection
# - Parameter parsing
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AUTOPILOT_SCRIPT="$ROOT/tools/wvo_mcp/scripts/autopilot_unified.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

#
# Test helpers
#
assert_success() {
  local test_name="$1"
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name"
    ((TESTS_FAILED++))
  fi
}

assert_failure() {
  local test_name="$1"
  if [ $? -ne 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name"
    ((TESTS_FAILED++))
  fi
}

assert_contains() {
  local test_name="$1"
  local haystack="$2"
  local needle="$3"

  if echo "$haystack" | grep -q "$needle"; then
    echo -e "${GREEN}✓ PASS${NC}: $test_name"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}: $test_name"
    echo "  Expected to find: '$needle'"
    echo "  In output: '$haystack'"
    ((TESTS_FAILED++))
  fi
}

#
# Tests
#
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  autopilot_unified.sh Integration Tests${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run once to capture output (faster than multiple runs)
echo "Running dry-run tests..."
DRY_RUN_OUTPUT=$(bash "$AUTOPILOT_SCRIPT" --dry-run 2>&1 || true)

# Test 1: Help message
echo "Test 1: Help message displays correctly"
HELP_OUTPUT=$(bash "$AUTOPILOT_SCRIPT" --help 2>&1 || true)
assert_contains "Help shows usage" "$HELP_OUTPUT" "Usage:"
assert_contains "Help shows --agents option" "$HELP_OUTPUT" "--agents"
assert_contains "Help shows --dry-run option" "$HELP_OUTPUT" "--dry-run"
echo ""

# Test 2: Dry-run mode with default agents
echo "Test 2: Dry-run mode with default agents"
assert_contains "Dry-run shows configuration" "$DRY_RUN_OUTPUT" "Configuration:"
assert_contains "Dry-run shows agents" "$DRY_RUN_OUTPUT" "Agents:"
assert_contains "Dry-run detects accounts" "$DRY_RUN_OUTPUT" "account(s) configured"
echo ""

# Test 3: Dry-run mode with custom agent count
echo "Test 3: Dry-run mode with custom agent count (7 agents)"
AGENT7_OUTPUT=$(bash "$AUTOPILOT_SCRIPT" --agents 7 --dry-run 2>&1 | head -30 || true)
assert_contains "Custom agent count" "$AGENT7_OUTPUT" "Agents:       7"
echo ""

# Test 4: Prerequisites validation
echo "Test 4: Prerequisites validation"
assert_contains "Account manager found" "$DRY_RUN_OUTPUT" "Account manager found"
assert_contains "UnifiedOrchestrator built" "$DRY_RUN_OUTPUT" "UnifiedOrchestrator"
echo ""

# Test 5: Account detection (Codex and Claude)
echo "Test 5: Account detection"
assert_contains "Codex accounts detected" "$DRY_RUN_OUTPUT" "Codex accounts:"
assert_contains "Claude accounts detected" "$DRY_RUN_OUTPUT" "Claude accounts:"
echo ""

# Test 6: Preferred orchestrator option
echo "Test 6: Preferred orchestrator (default claude)"
assert_contains "Claude preferred" "$DRY_RUN_OUTPUT" "Orchestrator: claude"
echo ""

CODEX_PREF_OUTPUT=$(bash "$AUTOPILOT_SCRIPT" --preferred-orchestrator codex --dry-run 2>&1 | head -30 || true)
assert_contains "Codex preferred when specified" "$CODEX_PREF_OUTPUT" "Orchestrator: codex"
echo ""

# Test 7: Account rotation display
echo "Test 7: Account rotation display"
assert_contains "Shows account rotation" "$DRY_RUN_OUTPUT" "Account rotation:"
echo ""

# Test 8: Makefile integration
echo "Test 8: Makefile target exists"
if command -v make >/dev/null 2>&1; then
  MAKE_HELP=$(cd "$ROOT" && make -n autopilot AGENTS=4 2>&1 || true)
  assert_contains "Makefile calls autopilot_unified.sh" "$MAKE_HELP" "autopilot_unified.sh"
else
  echo -e "${YELLOW}⊘ SKIP${NC}: make command not found"
fi
echo ""

#
# Summary
#
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
