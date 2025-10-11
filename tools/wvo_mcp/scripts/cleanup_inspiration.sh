#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSPIRATION_DIR="$ROOT/state/web_inspiration"
DAYS=${1:-7}

if [ ! -d "$INSPIRATION_DIR" ]; then
  exit 0
fi

find "$INSPIRATION_DIR" -type d -mindepth 1 -mtime +"$DAYS" -print0 | while IFS= read -r -d '' dir; do
  rm -rf "$dir"
done

echo "✅ Cleaned web inspiration assets older than $DAYS day(s)"
