#!/usr/bin/env bash
#
# Manual Validation Script for Unified Autopilot
#
# Run this script to validate the unified autopilot implementation
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Unified Multi-Provider Autopilot Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$ROOT"

echo "Step 1: Testing --help"
bash tools/wvo_mcp/scripts/autopilot_unified.sh --help
echo ""

echo "Step 2: Testing --dry-run with default agents (5)"
bash tools/wvo_mcp/scripts/autopilot_unified.sh --dry-run
echo ""

echo "Step 3: Testing --dry-run with custom agents (7)"
bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents 7 --dry-run
echo ""

echo "Step 4: Testing Makefile target (dry-run)"
echo "Running: make autopilot AGENTS=3 DRY_RUN=1"
DRY_RUN=1 make autopilot AGENTS=3 || true
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Validation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "1. To run the autopilot with 5 agents:"
echo "   make autopilot AGENTS=5"
echo ""
echo "2. Or run directly:"
echo "   bash tools/wvo_mcp/scripts/autopilot_unified.sh --agents 5"
echo ""
echo "3. To customize orchestrator preference:"
echo "   bash tools/wvo_mcp/scripts/autopilot_unified.sh --preferred-orchestrator codex"
echo ""
