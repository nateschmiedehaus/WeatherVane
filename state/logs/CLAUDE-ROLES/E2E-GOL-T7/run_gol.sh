#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$SCRIPT_DIR/gol_ui.html"
if command -v open >/dev/null 2>&1; then
  open "$HTML"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$HTML"
else
  echo "Open $HTML in your browser"
fi
