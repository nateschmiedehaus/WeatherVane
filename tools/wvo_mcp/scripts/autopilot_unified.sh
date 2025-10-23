#!/usr/bin/env bash
#
# Unified Multi-Provider Autopilot
#
# Orchestrates WeatherVane product tasks using a hierarchical agent pool:
# - 1 Orchestrator (Claude Sonnet or Codex High)
# - N-2 Workers (Haiku or Codex Medium/Low based on complexity)
# - 1-2 Critics (Haiku for fast reviews)
#
# Usage:
#   make autopilot AGENTS=5
#   bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents 5
#

set -euo pipefail

#
# Configuration
#
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ACCOUNT_MANAGER="$ROOT/tools/wvo_mcp/scripts/account_manager.py"
MCP_DIST="$ROOT/tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default configuration
AGENT_COUNT=${AGENTS:-5}
MAX_ITERATIONS=${MAX_ITERATIONS:-100}
PREFERRED_ORCHESTRATOR=${PREFERRED_ORCHESTRATOR:-"claude"}
DRY_RUN=${DRY_RUN:-0}
WORKSPACE_ROOT="$ROOT"

# Ensure vendored dependencies (numpy, pandas, shapely, etc.) are available.
export PYTHONPATH="$ROOT/.deps:${PYTHONPATH:-}"

#
# Parse arguments
#
while [[ $# -gt 0 ]]; do
  case $1 in
    --agents)
      if [[ -n "${2:-}" ]]; then
        AGENT_COUNT="$2"
        shift 2
      else
        echo "Error: --agents requires a value"
        exit 1
      fi
      ;;
    --max-iterations)
      if [[ -n "${2:-}" ]]; then
        MAX_ITERATIONS="$2"
        shift 2
      else
        echo "Error: --max-iterations requires a value"
        exit 1
      fi
      ;;
    --preferred-orchestrator)
      if [[ -n "${2:-}" ]]; then
        PREFERRED_ORCHESTRATOR="$2"
        shift 2
      else
        echo "Error: --preferred-orchestrator requires a value"
        exit 1
      fi
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --agents N                 Number of agents to spawn (default: 5)"
      echo "  --max-iterations N         Maximum autopilot iterations (default: 100)"
      echo "  --preferred-orchestrator   Preferred orchestrator provider: claude|codex (default: claude)"
      echo "  --dry-run                  Print configuration without starting"
      echo "  -h, --help                 Show this help"
      echo ""
      echo "Environment:"
      echo "  AGENTS=N                   Same as --agents"
      echo "  DRY_RUN=1                  Same as --dry-run"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

#
# Validate prerequisites
#
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  WeatherVane Unified Autopilot${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Configuration:"
echo "  Agents:       $AGENT_COUNT"
echo "  Orchestrator: $PREFERRED_ORCHESTRATOR (preferred)"
echo "  Max Iters:    $MAX_ITERATIONS"
echo "  Workspace:    $WORKSPACE_ROOT"
echo ""

if [ ! -f "$ACCOUNT_MANAGER" ]; then
  echo -e "${RED}✗ Account manager not found: $ACCOUNT_MANAGER${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Account manager found${NC}"

if [ ! -f "$MCP_DIST" ]; then
  echo -e "${RED}✗ UnifiedOrchestrator not built: $MCP_DIST${NC}"
  echo "  Run: cd tools/wvo_mcp && npm run build"
  exit 1
fi
echo -e "${GREEN}✓ UnifiedOrchestrator built${NC}"

# Run maintenance (log rotation, DB cleanup, etc.)
MAINTENANCE_SCRIPT="$SCRIPT_DIR/maintenance.sh"
if [ -f "$MAINTENANCE_SCRIPT" ] && [ "${WVO_SKIP_MAINTENANCE:-0}" != "1" ]; then
  echo ""
  bash "$MAINTENANCE_SCRIPT" || echo -e "${YELLOW}⚠️  Maintenance had issues, continuing...${NC}"
fi

# Git handling mode (default: auto-commit operational files)
GIT_HANDLER_MODE="${WVO_GIT_MODE:-auto}"

# Backward compatibility flags
if [ "${WVO_AUTOPILOT_ALLOW_DIRTY:-0}" = "1" ]; then
  # Old flag: allow dirty worktree = use auto mode
  GIT_HANDLER_MODE="auto"
fi
if [ "${WVO_AUTOPILOT_ENFORCE_CLEAN:-0}" = "1" ]; then
  # Old flag: enforce clean = use strict mode
  GIT_HANDLER_MODE="strict"
fi

# Run smart git handler
GIT_HANDLER_SCRIPT="$SCRIPT_DIR/autopilot_git_handler.sh"
if [ -f "$GIT_HANDLER_SCRIPT" ]; then
  echo ""
  if ! bash "$GIT_HANDLER_SCRIPT" "$GIT_HANDLER_MODE"; then
    # Git handler failed (likely in strict mode with dirty worktree)
    exit 1
  fi
  # Git handler prints its own status message, no need to repeat it here
else
  # Fallback: simple git status check if handler doesn't exist
  echo -e "${YELLOW}⚠️  Git handler not found, using basic check${NC}"
  if ! status=$(cd "$ROOT" && git status --porcelain 2>/dev/null); then
    echo -e "${RED}✗ Failed to determine git status${NC}"
    exit 1
  fi

  if [ -n "$status" ]; then
    if [ "$GIT_HANDLER_MODE" = "strict" ]; then
      echo -e "${RED}✗ Git worktree has uncommitted changes${NC}"
      echo "$status"
      exit 1
    else
      echo -e "${YELLOW}! Git worktree dirty; continuing with caution${NC}"
      echo "$status" | head -20
    fi
  else
    echo -e "${GREEN}✓ Git worktree clean${NC}"
  fi
fi

# Check auth status
echo ""
echo "Checking account authentication..."

set +e
CODEX_ACCOUNTS=$(python3 "$ACCOUNT_MANAGER" list codex 2>&1)
CODEX_STATUS=$?
set -e
if [ "$CODEX_STATUS" -ne 0 ]; then
  echo -e "${YELLOW}⚠️  Unable to load Codex account configuration (PyYAML missing?)${NC}"
  echo "$CODEX_ACCOUNTS"
  DEFAULT_CODEX_HOME="$ROOT/.accounts/codex/codex_personal"
  if [ ! -d "$DEFAULT_CODEX_HOME" ]; then
    DEFAULT_CODEX_HOME="$ROOT/.codex"
  fi
  if [ -d "$DEFAULT_CODEX_HOME" ]; then
    CODEX_ACCOUNTS=$(printf '[{\"id\":\"fallback\",\"home\":\"%s\"}]\n' "$DEFAULT_CODEX_HOME")
    CODEX_COUNT=1
    echo "  → Falling back to $DEFAULT_CODEX_HOME"
  else
    echo -e "${RED}✗ No Codex account directory found. Install PyYAML (pip install pyyaml) or configure state/accounts.yaml."
    exit 1
  fi
else
  CODEX_COUNT=$(echo "$CODEX_ACCOUNTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
fi

set +e
CLAUDE_ACCOUNTS=$(python3 "$ACCOUNT_MANAGER" list claude 2>&1)
CLAUDE_STATUS=$?
set -e
if [ "$CLAUDE_STATUS" -ne 0 ]; then
  echo -e "${YELLOW}⚠️  Unable to load Claude account configuration (PyYAML missing?)${NC}"
  echo "$CLAUDE_ACCOUNTS"
  DEFAULT_CLAUDE_DIR="$ROOT/.accounts/claude/claude_primary"
  if [ -d "$DEFAULT_CLAUDE_DIR" ]; then
    CLAUDE_ACCOUNTS=$(printf '[{\"id\":\"fallback\",\"env\":{\"CLAUDE_CONFIG_DIR\":\"%s\"}}]\n' "$DEFAULT_CLAUDE_DIR")
    CLAUDE_COUNT=1
    echo "  → Falling back to $DEFAULT_CLAUDE_DIR"
  else
    CLAUDE_ACCOUNTS='[]'
    CLAUDE_COUNT=0
  fi
else
  CLAUDE_COUNT=$(echo "$CLAUDE_ACCOUNTS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
fi

echo "  Codex accounts:  $CODEX_COUNT"
echo "  Claude accounts: $CLAUDE_COUNT"

if [ "$CODEX_COUNT" -eq 0 ] && [ "$CLAUDE_COUNT" -eq 0 ]; then
  echo -e "${RED}✗ No accounts configured${NC}"
  echo "  Configure accounts in: state/accounts.yaml"
  exit 1
fi

TOTAL_ACCOUNTS=$((CODEX_COUNT + CLAUDE_COUNT))
echo -e "${GREEN}✓ $TOTAL_ACCOUNTS account(s) configured${NC}"

#
# Dry run mode
#
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo -e "${YELLOW}DRY RUN - Configuration validated${NC}"
  echo ""
  echo "Would spawn:"
  echo "  - 1 orchestrator ($PREFERRED_ORCHESTRATOR preferred)"
  echo "  - $((AGENT_COUNT - 2)) workers (round-robin providers)"
  echo "  - 1 critic (Haiku preferred)"
  echo ""
  echo "Account rotation:"
  if [ "$CODEX_COUNT" -gt 0 ]; then
    echo "$CODEX_ACCOUNTS" | python3 -c "
import sys, json
accounts = json.load(sys.stdin)
for acc in accounts:
    print(f\"  - Codex: {acc.get('label', acc['id'])} ({acc.get('email', 'unknown')})\")
"
  fi
  if [ "$CLAUDE_COUNT" -gt 0 ]; then
    echo "$CLAUDE_ACCOUNTS" | python3 -c "
import sys, json
accounts = json.load(sys.stdin)
for acc in accounts:
    print(f\"  - Claude: {acc.get('label', acc['id'])} ({acc.get('email', 'unknown')})\")
"
  fi
  exit 0
fi

#
# Start UnifiedOrchestrator
#
echo ""
echo -e "${BLUE}━━━ Starting UnifiedOrchestrator ━━━${NC}"
echo ""

# Get account paths
CODEX_HOME=""
CLAUDE_CONFIG_DIR=""

if [ "$CODEX_COUNT" -gt 0 ]; then
  CODEX_FIRST=$(echo "$CODEX_ACCOUNTS" | python3 -c "
import sys, json
accounts = json.load(sys.stdin)
if accounts:
    print(accounts[0]['home'])
" 2>/dev/null || echo "")
  CODEX_HOME="$CODEX_FIRST"
fi

if [ "$CLAUDE_COUNT" -gt 0 ]; then
  CLAUDE_FIRST=$(echo "$CLAUDE_ACCOUNTS" | python3 -c "
import sys, json
accounts = json.load(sys.stdin)
if accounts:
    env = accounts[0].get('env', {})
    print(env.get('CLAUDE_CONFIG_DIR', ''))
" 2>/dev/null || echo "")
  CLAUDE_CONFIG_DIR="$CLAUDE_FIRST"
fi

# Export for Node.js
export CODEX_HOME
export CLAUDE_CONFIG_DIR
export AGENT_COUNT
export PREFERRED_ORCHESTRATOR
export WORKSPACE_ROOT
export MAX_ITERATIONS

echo "Starting orchestrator with:"
if [ -n "$CODEX_HOME" ]; then
  echo "  CODEX_HOME=$CODEX_HOME"
fi
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  echo "  CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR"
fi
echo ""

# Run the orchestrator with live telemetry (pipe through formatter for human-readable output)
STREAM_BUFFER="$(mktemp -t wvo_autopilot_stream.XXXXXX)"
cleanup_stream() {
  rm -f "$STREAM_BUFFER"
}
trap cleanup_stream EXIT

set +e
node - <<'NODE_SCRIPT' 2>&1 | tee "$STREAM_BUFFER" | node tools/wvo_mcp/scripts/format_telemetry.mjs
const { UnifiedOrchestrator } = require(process.env.MCP_DIST || './tools/wvo_mcp/dist/orchestrator/unified_orchestrator.js');
const { StateMachine } = require('./tools/wvo_mcp/dist/orchestrator/state_machine.js');

async function main() {
  // StateMachine constructor takes workspaceRoot as first param
  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
  const stateMachine = new StateMachine(workspaceRoot);

  const orchestrator = new UnifiedOrchestrator(stateMachine, {
    agentCount: parseInt(process.env.AGENT_COUNT || '5'),
    preferredOrchestrator: process.env.PREFERRED_ORCHESTRATOR || 'claude',
    workspaceRoot,
    codexHome: process.env.CODEX_HOME || undefined,
    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR || undefined,
  });

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', async () => {
    await orchestrator.stop();
    await stateMachine.close();
    process.exit(0);
  });

  await orchestrator.start();

  // Use the runContinuous() method - handles all task assignment automatically
  try {
    await orchestrator.runContinuous();
  } catch (error) {
    console.error('ERROR:', error.message);
  }

  await orchestrator.stop();
  await stateMachine.close();
}

main().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
NODE_SCRIPT
PIPE_STATUS=${PIPESTATUS[0]}
set -e

if [ "$PIPE_STATUS" -ne 0 ]; then
  if grep -q 'No providers authenticated' "$STREAM_BUFFER"; then
    cat <<'EOF'
🚫 Unified Autopilot could not find any authenticated providers.

Please authenticate the configured accounts, for example:
  CODEX_HOME=.accounts/codex/codex_personal codex login
  CODEX_HOME=.accounts/codex/codex_client codex login    # if present in state/accounts.yaml
  CLAUDE_CONFIG_DIR=.accounts/claude/claude_primary claude login

Re-run the autopilot command once at least one provider reports a successful login.
EOF
  fi
  exit "$PIPE_STATUS"
fi

echo ""
echo -e "${GREEN}✓ Autopilot session complete${NC}"
