#!/usr/bin/env bash
# Sync marked sections from CLAUDE.md to AGENTS.md
# Usage: bash scripts/sync_agent_docs.sh

set -e

CLAUDE_MD="CLAUDE.md"
AGENTS_MD="AGENTS.md"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔄 Syncing sections from $CLAUDE_MD to $AGENTS_MD..."

# Function to extract section between markers
extract_section() {
  local file="$1"
  local start_marker="$2"
  local end_marker="$3"

  awk "/$start_marker/,/$end_marker/" "$file" | sed '1d;$d'
}

# Function to replace section in file
replace_section() {
  local file="$1"
  local start_marker="$2"
  local end_marker="$3"
  local content_file="$4"

  # Use sed to replace content between markers
  # This approach handles multiline content correctly
  awk -v start="$start_marker" -v end="$end_marker" '
    BEGIN { in_block = 0; }
    $0 ~ start {
      print
      in_block = 1
      next
    }
    $0 ~ end {
      if (in_block) {
        system("cat '"$content_file"'")
        print
        in_block = 0
        next
      }
    }
    !in_block { print }
  ' "$file" > "${file}.tmp"

  mv "${file}.tmp" "$file"
}

# Sync Section 1: Learning System Mandate
echo -e "${YELLOW}  Syncing: Learning System Mandate${NC}"

# Extract content to temp file
TEMP_CONTENT=$(mktemp)
extract_section "$CLAUDE_MD" \
  "<!-- SYNC_START: learning -->" \
  "<!-- SYNC_END: learning -->" > "$TEMP_CONTENT"

replace_section "$AGENTS_MD" \
  "<!-- INJECT_START: learning -->" \
  "<!-- INJECT_END: learning -->" \
  "$TEMP_CONTENT"

rm "$TEMP_CONTENT"

echo -e "${GREEN}✅ Sync complete!${NC}"
echo ""
echo "Modified files:"
echo "  - $AGENTS_MD"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff $AGENTS_MD"
echo "  2. Commit if correct: git add $AGENTS_MD && git commit -m 'docs: sync AGENTS.md from CLAUDE.md'"
