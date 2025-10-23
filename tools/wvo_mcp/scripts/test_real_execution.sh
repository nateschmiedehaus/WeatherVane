#!/usr/bin/env bash
#
# REAL Execution Test - Proves Codex and Claude actually work
#
# This script executes REAL commands with your authenticated accounts
# to prove the unified autopilot will work.
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "══════════════════════════════════════════════════"
echo "  REAL Execution Test - Codex & Claude"
echo "══════════════════════════════════════════════════"
echo ""

# Test prompt - simple JSON response
TEST_PROMPT='Return exactly this JSON and nothing else: {"status": "online", "provider": "PROVIDER_NAME", "test": "success"}'

CODEX_HOME_PERSONAL="$ROOT/.accounts/codex/codex_personal"
CODEX_HOME_CLIENT="$ROOT/.accounts/codex/codex_client"
CLAUDE_CONFIG_DIR="$ROOT/.accounts/claude/claude_primary"

echo "━━━ Testing Codex Personal Account ━━━"
echo ""
echo "Account: natems6@gmail.com"
echo "CODEX_HOME: $CODEX_HOME_PERSONAL"
echo "Model: gpt-4o-mini (fast test)"
echo ""
echo "Executing test prompt..."

CODEX_PERSONAL_OUTPUT=$(CODEX_HOME="$CODEX_HOME_PERSONAL" timeout 30 codex exec \
  --model "gpt-4o-mini" \
  --profile "weathervane_orchestrator" \
  --dangerously-bypass-approvals-and-sandbox \
  "Return exactly this JSON: {\"status\": \"online\", \"provider\": \"codex_personal\", \"test\": \"success\"}" 2>&1 || echo "FAILED")

if echo "$CODEX_PERSONAL_OUTPUT" | grep -q "success"; then
  echo -e "${GREEN}✓ Codex Personal: WORKING${NC}"
  echo "Output:"
  echo "$CODEX_PERSONAL_OUTPUT" | head -5
else
  echo -e "${RED}✗ Codex Personal: FAILED${NC}"
  echo "Output:"
  echo "$CODEX_PERSONAL_OUTPUT"
fi

echo ""
echo "━━━ Testing Codex Client Account ━━━"
echo ""
echo "Account: nate@schmiedehaus.com"
echo "CODEX_HOME: $CODEX_HOME_CLIENT"
echo "Model: gpt-4o-mini"
echo ""
echo "Executing test prompt..."

CODEX_CLIENT_OUTPUT=$(CODEX_HOME="$CODEX_HOME_CLIENT" timeout 30 codex exec \
  --model "gpt-4o-mini" \
  --profile "weathervane_orchestrator" \
  --dangerously-bypass-approvals-and-sandbox \
  "Return exactly this JSON: {\"status\": \"online\", \"provider\": \"codex_client\", \"test\": \"success\"}" 2>&1 || echo "FAILED")

if echo "$CODEX_CLIENT_OUTPUT" | grep -q "success"; then
  echo -e "${GREEN}✓ Codex Client: WORKING${NC}"
  echo "Output:"
  echo "$CODEX_CLIENT_OUTPUT" | head -5
else
  echo -e "${RED}✗ Codex Client: FAILED${NC}"
  echo "Output:"
  echo "$CODEX_CLIENT_OUTPUT"
fi

echo ""
echo "━━━ Testing Claude Account ━━━"
echo ""
echo "Account: nathanielschmiedehaus"
echo "CLAUDE_CONFIG_DIR: $CLAUDE_CONFIG_DIR"
echo "Model: claude-3-haiku-20240307 (fast test)"
echo ""
echo "Executing test prompt..."

# Claude requires different invocation - checking if we can use exec
if claude --help 2>&1 | grep -q "exec"; then
  CLAUDE_OUTPUT=$(CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" timeout 30 claude exec \
    --model "claude-3-haiku-20240307" \
    "Return exactly this JSON: {\"status\": \"online\", \"provider\": \"claude\", \"test\": \"success\"}" 2>&1 || echo "FAILED")
else
  echo -e "${YELLOW}⚠ Claude CLI does not support 'exec' command${NC}"
  echo "This is expected - Claude Code uses a different execution model."
  echo "Testing via Node.js API call instead..."

  # Alternative: Test via MCP tool
  CLAUDE_OUTPUT=$(node -e "
    const { ClaudeExecutor } = require('$ROOT/tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');
    const executor = new ClaudeExecutor('$CLAUDE_CONFIG_DIR');

    (async () => {
      try {
        const result = await executor.exec(
          'claude-3-haiku-20240307',
          'Return exactly this JSON: {\"status\": \"online\", \"provider\": \"claude\", \"test\": \"success\"}'
        );
        console.log(JSON.stringify(result));
      } catch (err) {
        console.log('ERROR:', err.message);
      }
    })();
  " 2>&1 || echo "FAILED")
fi

if echo "$CLAUDE_OUTPUT" | grep -q "success"; then
  echo -e "${GREEN}✓ Claude: WORKING${NC}"
  echo "Output:"
  echo "$CLAUDE_OUTPUT" | head -5
else
  echo -e "${RED}✗ Claude: FAILED${NC}"
  echo "Output:"
  echo "$CLAUDE_OUTPUT"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  Summary"
echo "══════════════════════════════════════════════════"
echo ""

# Check results
CODEX_PERSONAL_OK=0
CODEX_CLIENT_OK=0
CLAUDE_OK=0

if echo "$CODEX_PERSONAL_OUTPUT" | grep -q "success"; then
  CODEX_PERSONAL_OK=1
fi

if echo "$CODEX_CLIENT_OUTPUT" | grep -q "success"; then
  CODEX_CLIENT_OK=1
fi

if echo "$CLAUDE_OUTPUT" | grep -q "success"; then
  CLAUDE_OK=1
fi

if [ $CODEX_PERSONAL_OK -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Codex Personal (natems6@gmail.com): VERIFIED"
else
  echo -e "${RED}✗${NC} Codex Personal: FAILED - Check auth or API quota"
fi

if [ $CODEX_CLIENT_OK -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Codex Client (nate@schmiedehaus.com): VERIFIED"
else
  echo -e "${RED}✗${NC} Codex Client: FAILED - Check auth or API quota"
fi

if [ $CLAUDE_OK -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Claude (nathanielschmiedehaus): VERIFIED"
else
  echo -e "${RED}✗${NC} Claude: FAILED - Check auth or API quota"
fi

echo ""

TOTAL_WORKING=$((CODEX_PERSONAL_OK + CODEX_CLIENT_OK + CLAUDE_OK))

if [ $TOTAL_WORKING -eq 3 ]; then
  echo -e "${GREEN}✓ SUCCESS: All 3 providers working!${NC}"
  echo "  Unified autopilot is ready for production use."
  exit 0
elif [ $TOTAL_WORKING -gt 0 ]; then
  echo -e "${YELLOW}⚠ PARTIAL: $TOTAL_WORKING/3 providers working${NC}"
  echo "  Autopilot will work with reduced capacity."
  echo "  Fix failing providers for full capability."
  exit 2
else
  echo -e "${RED}✗ FAILED: No providers working${NC}"
  echo "  Check authentication, API keys, and quota limits."
  exit 1
fi
