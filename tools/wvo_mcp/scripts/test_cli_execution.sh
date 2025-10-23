#!/usr/bin/env bash
#
# Test if CLI execution actually works
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

echo "Testing Codex CLI execution..."
export CODEX_HOME="$ROOT/.accounts/codex/codex_personal"

# Test 1: Can we run codex exec at all?
echo "Test 1: Basic codex exec test"
set +e
OUTPUT=$(CODEX_HOME="$CODEX_HOME" codex exec \
  --profile weathervane_orchestrator \
  --model gpt-5-codex-medium \
  --dangerously-bypass-approvals-and-sandbox \
  "Print exactly: TEST_OK" 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Codex exec succeeded"
  echo "Output: $OUTPUT"
else
  echo "❌ Codex exec failed with exit code $EXIT_CODE"
  echo "Error: $OUTPUT"
fi

echo ""
echo "Testing Claude CLI execution..."
export CLAUDE_CONFIG_DIR="$ROOT/.accounts/claude/claude_primary"

# Test 2: Can we run claude at all?
echo "Test 2: Basic claude test"
set +e
OUTPUT=$(CLAUDE_CONFIG_DIR="$CLAUDE_CONFIG_DIR" claude \
  --print \
  --model claude-3-5-sonnet-20241022 \
  "Print exactly: TEST_OK" 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Claude succeeded"
  echo "Output: $OUTPUT"
else
  echo "❌ Claude failed with exit code $EXIT_CODE"
  echo "Error: $OUTPUT"
fi

echo ""
echo "Summary:"
echo "- If both failed with auth errors, auth is broken"
echo "- If both succeeded, the issue is elsewhere"
echo "- Check for interactive prompts or hanging"
