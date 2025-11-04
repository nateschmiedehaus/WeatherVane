#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
REPO_ROOT="$(cd "$ROOT_DIR/.." && pwd)"
cat <<'MSG'
[legacy-autopilot-disabled]
The legacy Bash autopilot has been archived under tools/wvo_mcp/scripts/legacy/autopilot.sh.
Use tools/wvo_mcp/scripts/autopilot_unified.sh (or `make autopilot`) for all Unified Autopilot runs.
MSG
exit 1
