#!/usr/bin/env bash
set -euo pipefail

echo "[legacy-autopilot-disabled] scripts/autopilot_health_check.sh now lives in tools/wvo_mcp/scripts/legacy/autopilot_health_check.sh."
echo "Use 'make autopilot' or tools/wvo_mcp/scripts/autopilot_unified.sh for Unified Autopilot runs."
exit 1
