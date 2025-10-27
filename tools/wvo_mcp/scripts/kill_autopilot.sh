#!/usr/bin/env bash
#
# Kill autopilot and clean up all resources
#
# Usage:
#   bash tools/wvo_mcp/scripts/kill_autopilot.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PID_FILE="$ROOT/state/worker_pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "$PID_FILE" ]; then
  echo -e "${YELLOW}No autopilot running (PID file not found: $PID_FILE)${NC}"
  exit 0
fi

# Read PID from file (supports both JSON and plain PID formats)
# Try jq first for robust JSON parsing, fallback to cat for plain PID
if command -v jq >/dev/null 2>&1; then
  PID=$(jq -r '.pid' "$PID_FILE" 2>/dev/null || cat "$PID_FILE")
else
  # Fallback: try to extract from JSON manually, then try plain format
  PID=$(grep -o '"pid"[[:space:]]*:[[:space:]]*[0-9]*' "$PID_FILE" | tail -1 | grep -o '[0-9]*' || cat "$PID_FILE")
fi

if [ -z "$PID" ]; then
  echo -e "${RED}Invalid PID file format${NC}"
  rm -f "$PID_FILE"
  exit 1
fi

# Check if process is actually running
if ! kill -0 "$PID" 2>/dev/null; then
  echo -e "${YELLOW}Autopilot process (PID $PID) is not running - cleaning up stale PID file${NC}"
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping autopilot (PID $PID)..."

# Send SIGTERM to process group (negative PID kills entire group)
kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true

# Wait up to 5 seconds for graceful shutdown
for i in {1..5}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo -e "${GREEN}✓ Autopilot stopped gracefully (PID $PID)${NC}"
    rm -f "$PID_FILE"
    exit 0
  fi
  echo -n "."
  sleep 1
done
echo ""

# Process didn't die gracefully, force kill
echo -e "${YELLOW}Graceful shutdown timed out, force killing...${NC}"
kill -9 -- -"$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null || true

# Wait 1 more second
sleep 1

if ! kill -0 "$PID" 2>/dev/null; then
  echo -e "${GREEN}✓ Autopilot force-killed (PID $PID)${NC}"
else
  echo -e "${RED}✗ Failed to kill autopilot process (PID $PID)${NC}"
  echo "  Try: sudo kill -9 $PID"
  exit 1
fi

rm -f "$PID_FILE"
