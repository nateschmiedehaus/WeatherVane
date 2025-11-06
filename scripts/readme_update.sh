#!/usr/bin/env bash
# Update README "Recent Changes" section after task completion
# Usage: scripts/readme_update.sh [directory] [task-id]

set -euo pipefail

# Get script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source helper library
source "$SCRIPT_DIR/readme_lib.sh"

# Change to repo root for consistent paths
cd "$REPO_ROOT"

# Parse arguments
DIRECTORY="${1:-.}"
TASK_ID="${2:-$(detect_current_task)}"

# Resolve to absolute path, then make relative to repo root
DIRECTORY=$(realpath --relative-to="$REPO_ROOT" "$DIRECTORY" 2>/dev/null || \
           python3 -c "import os; print(os.path.relpath('$DIRECTORY', '$REPO_ROOT'))" 2>/dev/null || \
           echo "$DIRECTORY")

# Check README exists
if [[ ! -f "$DIRECTORY/README.md" ]]; then
  echo "❌ README not found: $DIRECTORY/README.md"
  echo ""
  echo "   Fix: scripts/readme_init.sh $DIRECTORY"
  exit 1
fi

# Detect changed files in this directory
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep "^$DIRECTORY/" || true)

# If no git changes, check staged files
if [[ -z "$CHANGED_FILES" ]]; then
  CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null | grep "^$DIRECTORY/" || true)
fi

# If still no changes, this might be a new directory
if [[ -z "$CHANGED_FILES" ]]; then
  # Check for untracked files
  CHANGED_FILES=$(git ls-files --others --exclude-standard "$DIRECTORY/" 2>/dev/null || true)
fi

# If still no changes, use README.md as the changed file
if [[ -z "$CHANGED_FILES" ]]; then
  echo "ℹ️  No changes detected in $DIRECTORY"
  echo "   Updating README timestamp only"
  CHANGED_FILES="$DIRECTORY/README.md"
fi

# Prompt for change description
echo "📝 Update README for: $DIRECTORY"
echo ""
echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/   - /'
echo ""

# Read change description (with validation)
while true; do
  read -p "Change description (min 10 chars, use verb + what): " CHANGE_DESC

  # Validate length
  if [[ ${#CHANGE_DESC} -lt 10 ]]; then
    echo "❌ Description too short (minimum 10 characters)"
    echo "   Example: 'Added proof validation layer'"
    continue
  fi

  # Warn about lazy descriptions
  if echo "$CHANGE_DESC" | grep -iE "^(updated|changed|fixed) (stuff|things|code)"; then
    echo "⚠️  Lazy description detected. Use specific verbs:"
    echo "   - Added: New feature/file"
    echo "   - Fixed: Bug fix"
    echo "   - Refactored: Code restructure"
    echo "   - Removed: Deletion"
    read -p "Continue anyway? [y/N]: " confirm
    if [[ "$confirm" != "y" ]]; then
      continue
    fi
  fi

  break
done

# Read impact level
while true; do
  read -p "Impact level [low/medium/high]: " IMPACT

  case "$IMPACT" in
    low|medium|high)
      break
      ;;
    *)
      echo "❌ Invalid impact. Choose: low, medium, or high"
      ;;
  esac
done

# Generate new Recent Changes entry
CURRENT_DATE=$(current_date)

# Create a temp file for the new entry
NEW_ENTRY=$(cat <<EOF

### $TASK_ID - $CHANGE_DESC
- Files: $(echo "$CHANGED_FILES" | tr '\n' ',' | sed 's/,$//' | sed 's/,/, /g')
- Impact: $IMPACT
- Date: $CURRENT_DATE
- See: state/evidence/$TASK_ID/
EOF
)

# Create backup
cp "$DIRECTORY/README.md" "$DIRECTORY/README.md.bak"

# Write the new entry to a temp file (handles multi-line properly)
ENTRY_FILE=$(mktemp)
cat > "$ENTRY_FILE" <<EOF
$NEW_ENTRY
EOF

# Insert new entry after "## Recent Changes" line using sed
# Find the line number of "## Recent Changes"
LINE_NUM=$(grep -n "^## Recent Changes" "$DIRECTORY/README.md.bak" | cut -d: -f1)

if [[ -n "$LINE_NUM" ]]; then
  # Insert the entry file contents after that line
  head -n "$LINE_NUM" "$DIRECTORY/README.md.bak" > "$DIRECTORY/README.md.tmp"
  cat "$ENTRY_FILE" >> "$DIRECTORY/README.md.tmp"
  tail -n +$((LINE_NUM + 1)) "$DIRECTORY/README.md.bak" >> "$DIRECTORY/README.md.tmp"
  mv "$DIRECTORY/README.md.tmp" "$DIRECTORY/README.md"
  rm "$ENTRY_FILE"
else
  echo "❌ ERROR: Could not find '## Recent Changes' section"
  rm "$ENTRY_FILE"
  exit 1
fi

# Update last_updated in YAML frontmatter
sed_inplace "s|^last_updated:.*|last_updated: \"$CURRENT_DATE\"|" "$DIRECTORY/README.md"

# Update last_updated in markdown header
sed_inplace "s|\*\*Last Updated:\*\*.*|\*\*Last Updated:\*\* $CURRENT_DATE|" "$DIRECTORY/README.md"

# Clean up backup and any .bak files created by sed_inplace
rm -f "$DIRECTORY/README.md.bak" "$DIRECTORY/README.md.bak.bak"

# Log event
log_event "README_UPDATE" "$DIRECTORY" "SUCCESS task=$TASK_ID impact=$IMPACT"

echo ""
echo "✅ README updated: $DIRECTORY/README.md"
echo ""
echo "📝 Next steps:"
echo "   1. Review the changes: git diff $DIRECTORY/README.md"
echo "   2. Stage the README: git add $DIRECTORY/README.md"
echo "   3. Commit with your other changes"
echo ""
echo "Recent Changes entry added:"
echo "$NEW_ENTRY"
