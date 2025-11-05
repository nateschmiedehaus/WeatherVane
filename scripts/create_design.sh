#!/bin/bash
# Create design.md from template for a given task ID
# Usage: bash scripts/create_design.sh [TASK-ID]

set -e

if [ -z "$1" ]; then
  echo "Usage: bash scripts/create_design.sh [TASK-ID]"
  echo "Example: bash scripts/create_design.sh AFP-CACHE-FIX-20251105"
  exit 1
fi

TASK_ID="$1"
EVIDENCE_DIR="state/evidence/$TASK_ID"
DESIGN_FILE="$EVIDENCE_DIR/design.md"
TEMPLATE="docs/templates/design_template.md"

# Check if template exists
if [ ! -f "$TEMPLATE" ]; then
  echo "❌ Error: Template not found at $TEMPLATE"
  exit 1
fi

# Create evidence directory if it doesn't exist
mkdir -p "$EVIDENCE_DIR"

# Check if design.md already exists
if [ -f "$DESIGN_FILE" ]; then
  echo "⚠️  Warning: $DESIGN_FILE already exists"
  read -p "Overwrite? (y/N): " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# Copy template and replace [TASK-ID] placeholder
sed "s/\[TASK-ID\]/$TASK_ID/g" "$TEMPLATE" > "$DESIGN_FILE"

# Replace [YYYY-MM-DD] with today's date
TODAY=$(date +%Y-%m-%d)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\[YYYY-MM-DD\]/$TODAY/g" "$DESIGN_FILE"
else
  # Linux
  sed -i "s/\[YYYY-MM-DD\]/$TODAY/g" "$DESIGN_FILE"
fi

echo "✅ Created: $DESIGN_FILE"
echo ""
echo "Next steps:"
echo "1. Edit the file and fill in your design thinking"
echo "2. Be honest about trade-offs and alternatives"
echo "3. Stage it: git add $DESIGN_FILE"
echo "4. DesignReviewer will provide feedback on AFP/SCAS alignment"
echo ""
echo "Opening in editor..."

# Try to open in editor (fallback to echo if no editor found)
if [ -n "$EDITOR" ]; then
  $EDITOR "$DESIGN_FILE"
elif command -v code &> /dev/null; then
  code "$DESIGN_FILE"
elif command -v vim &> /dev/null; then
  vim "$DESIGN_FILE"
else
  echo "No editor found. Edit manually: $DESIGN_FILE"
fi
