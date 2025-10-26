#!/usr/bin/env bash
set -euo pipefail

echo "[legacy-autopilot-disabled] scripts/fix_autopilot_loop.sh now lives in tools/wvo_mcp/scripts/legacy/fix_autopilot_loop.sh."
echo "Use 'make autopilot' or tools/wvo_mcp/scripts/autopilot_unified.sh for Unified Autopilot runs."
exit 1
