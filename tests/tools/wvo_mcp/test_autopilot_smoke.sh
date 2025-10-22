#!/usr/bin/env bash
#
# Smoke test for autopilot_unified.sh
#
# Quick validation that the script works correctly
#

set -uo pipefail  # Removed -e to allow conditional test failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AUTOPILOT_SCRIPT="$ROOT/tools/wvo_mcp/scripts/autopilot_unified.sh"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━ autopilot_unified.sh Smoke Test ━━━${NC}"
echo ""

# Test 1: Help works
echo "1. Testing --help..."
if bash "$AUTOPILOT_SCRIPT" --help | grep -q "Usage:"; then
  echo -e "${GREEN}✓ PASS${NC}: Help message works"
else
  echo -e "${RED}✗ FAIL${NC}: Help message failed"
  exit 1
fi

# Test 2: Dry-run works
echo "2. Testing --dry-run..."
if bash "$AUTOPILOT_SCRIPT" --dry-run | grep -q "DRY RUN"; then
  echo -e "${GREEN}✓ PASS${NC}: Dry-run works"
else
  echo -e "${RED}✗ FAIL${NC}: Dry-run failed"
  exit 1
fi

# Test 3: Custom agent count
echo "3. Testing custom AGENTS parameter..."
if bash "$AUTOPILOT_SCRIPT" --agents 7 --dry-run | grep -q "Agents:       7"; then
  echo -e "${GREEN}✓ PASS${NC}: Custom agent count works"
else
  echo -e "${RED}✗ FAIL${NC}: Custom agent count failed"
  exit 1
fi

# Test 4: Account detection
echo "4. Testing account detection..."
if bash "$AUTOPILOT_SCRIPT" --dry-run | grep -q "account(s) configured"; then
  echo -e "${GREEN}✓ PASS${NC}: Account detection works"
else
  echo -e "${RED}✗ FAIL${NC}: Account detection failed"
  exit 1
fi

# Test 5: Makefile target
echo "5. Testing Makefile target..."
if command -v make >/dev/null 2>&1; then
  if cd "$ROOT" && make -n autopilot AGENTS=4 2>&1 | grep -q "autopilot_unified.sh"; then
    echo -e "${GREEN}✓ PASS${NC}: Makefile target works"
  else
    echo -e "${RED}✗ FAIL${NC}: Makefile target failed"
    exit 1
  fi
else
  echo -e "${BLUE}⊘ SKIP${NC}: make not installed"
fi

echo ""
echo -e "${GREEN}━━━ All Smoke Tests Passed! ━━━${NC}"
