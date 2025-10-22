#!/bin/bash
set -euo pipefail

# mcp_safe_upgrade.sh - Orchestrates canary upgrade harness with shadow validation
#
# Usage:
#   mcp_safe_upgrade.sh [OPTIONS]
#
# Options:
#   -w, --workspace <path>     Workspace root (default: current directory)
#   --skip-install             Skip npm install in canary
#   --skip-tests               Skip npm test in canary
#   --skip-build               Skip npm build steps
#   --keep-staging             Keep staging directory for debugging
#   --promote                  Promote canary to active after validation
#   --allow-dirty              Skip preflight checks (for testing)
#   --id <id>                  Upgrade ID (default: timestamp)
#   --help                     Show this help message

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/../../.."

show_help() {
  sed -n '4,16p' "$0" | sed 's/^# //'
  exit 0
}

# Parse arguments
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# Execute the Node.js implementation
node "${SCRIPT_DIR}/mcp_safe_upgrade.mjs" \
  --workspace "${PROJECT_ROOT}" \
  "${ARGS[@]}"
