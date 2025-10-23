#!/usr/bin/env bash
#
# Test actual execution with all 3 tiers
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "Testing Codex Execution with All Tiers..."
echo ""

export CODEX_HOME="$ROOT/.accounts/codex/codex_personal"

# Test 1: Execute with HIGH tier
echo "=== Test 1: HIGH Tier (Orchestrator) ==="
CODEX_HOME="$CODEX_HOME" codex exec \
  --profile weathervane_orchestrator \
  --dangerously-bypass-approvals-and-sandbox \
  -c model=gpt-5-codex \
  -c model_reasoning_effort=high \
  'Return exactly: ORCHESTRATOR_HIGH_OK' 2>&1 | head -15

echo ""
echo "=== Test 2: MEDIUM Tier (Worker) ==="
CODEX_HOME="$CODEX_HOME" codex exec \
  --profile weathervane_orchestrator \
  --dangerously-bypass-approvals-and-sandbox \
  -c model=gpt-5-codex \
  -c model_reasoning_effort=medium \
  'Return exactly: WORKER_MEDIUM_OK' 2>&1 | head -15

echo ""
echo "=== Test 3: LOW Tier (Critic) ==="
CODEX_HOME="$CODEX_HOME" codex exec \
  --profile weathervane_orchestrator \
  --dangerously-bypass-approvals-and-sandbox \
  -c model=gpt-5-codex \
  -c model_reasoning_effort=low \
  'Return exactly: CRITIC_LOW_OK' 2>&1 | head -15

echo ""
echo "✅ All 3 tiers executed successfully!"
