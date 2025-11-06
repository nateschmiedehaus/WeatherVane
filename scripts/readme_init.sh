#!/usr/bin/env bash
# Initialize README from template in a directory
# Usage: scripts/readme_init.sh [directory] [task-id]

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

# Check if README already exists
if [[ -f "$DIRECTORY/README.md" ]]; then
  echo "✅ README already exists: $DIRECTORY/README.md"
  echo ""
  echo "Summary:"
  head -30 "$DIRECTORY/README.md"
  exit 0
fi

# Detect template based on directory path
if [[ "$DIRECTORY" =~ ^state/epics/ ]]; then
  TEMPLATE="docs/templates/epic_readme_template.md"
  TYPE="epic"
  EPIC_ID=$(basename "$DIRECTORY")
  # Try to extract epic metadata from roadmap.yaml
  if [[ -f "state/roadmap.yaml" ]]; then
    if command -v yq >/dev/null 2>&1; then
      EPIC_NAME=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .title" state/roadmap.yaml 2>/dev/null || echo "Epic Title")
      DOMAIN=$(yq ".epics[] | select(.id == \"$EPIC_ID\") | .domain" state/roadmap.yaml 2>/dev/null || echo "mcp")
    else
      EPIC_NAME="Epic Title"
      DOMAIN="mcp"
    fi
  else
    EPIC_NAME="Epic Title"
    DOMAIN="mcp"
  fi

elif [[ "$DIRECTORY" =~ ^state/milestones/ ]]; then
  TEMPLATE="docs/templates/milestone_readme_template.md"
  TYPE="milestone"
  MILESTONE_ID=$(basename "$DIRECTORY")
  # Try to extract milestone metadata from roadmap.yaml
  if [[ -f "state/roadmap.yaml" ]]; then
    if command -v yq >/dev/null 2>&1; then
      MILESTONE_NAME=$(yq ".epics[].milestones[] | select(.id == \"$MILESTONE_ID\") | .title" state/roadmap.yaml 2>/dev/null || echo "Milestone Title")
      EPIC_ID=$(yq ".epics[] | select(.milestones[].id == \"$MILESTONE_ID\") | .id" state/roadmap.yaml 2>/dev/null || echo "EPIC-ID")
    else
      MILESTONE_NAME="Milestone Title"
      EPIC_ID="EPIC-ID"
    fi
  else
    MILESTONE_NAME="Milestone Title"
    EPIC_ID="EPIC-ID"
  fi

elif [[ "$DIRECTORY" =~ ^state/task_groups/ ]]; then
  TEMPLATE="docs/templates/task_group_readme_template.md"
  TYPE="task_group"
  GROUP_ID=$(basename "$DIRECTORY")
  # Transform kebab-case to Title Case
  GROUP_NAME=$(echo "$GROUP_ID" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1')
  MILESTONE_ID="MILESTONE-ID"  # Placeholder, user fills in

else
  TEMPLATE="docs/templates/readme_template.md"
  TYPE="directory"
fi

# Check template exists
if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌ Template not found: $TEMPLATE"
  echo "   Make sure you're running from repo root"
  exit 1
fi

# Fill variables
DIRECTORY_PATH="$DIRECTORY"
DIRECTORY_NAME=$(directory_name_from_path "$DIRECTORY")
CURRENT_DATE=$(current_date)

# Create directory if it doesn't exist
mkdir -p "$DIRECTORY"

# Generate README by replacing template variables
if [[ "$TYPE" == "epic" ]]; then
  sed \
    -e "s|{{DIRECTORY_PATH}}|$DIRECTORY_PATH|g" \
    -e "s|{{DIRECTORY_NAME}}|$DIRECTORY_NAME|g" \
    -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
    -e "s|{{TASK_ID}}|$TASK_ID|g" \
    -e "s|{{EPIC_ID}}|$EPIC_ID|g" \
    -e "s|{{EPIC_NAME}}|$EPIC_NAME|g" \
    -e "s|{{DOMAIN}}|$DOMAIN|g" \
    "$TEMPLATE" > "$DIRECTORY/README.md"
elif [[ "$TYPE" == "milestone" ]]; then
  sed \
    -e "s|{{DIRECTORY_PATH}}|$DIRECTORY_PATH|g" \
    -e "s|{{DIRECTORY_NAME}}|$DIRECTORY_NAME|g" \
    -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
    -e "s|{{TASK_ID}}|$TASK_ID|g" \
    -e "s|{{MILESTONE_ID}}|$MILESTONE_ID|g" \
    -e "s|{{MILESTONE_NAME}}|$MILESTONE_NAME|g" \
    -e "s|{{EPIC_ID}}|$EPIC_ID|g" \
    "$TEMPLATE" > "$DIRECTORY/README.md"
elif [[ "$TYPE" == "task_group" ]]; then
  sed \
    -e "s|{{DIRECTORY_PATH}}|$DIRECTORY_PATH|g" \
    -e "s|{{DIRECTORY_NAME}}|$DIRECTORY_NAME|g" \
    -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
    -e "s|{{TASK_ID}}|$TASK_ID|g" \
    -e "s|{{GROUP_ID}}|$GROUP_ID|g" \
    -e "s|{{GROUP_NAME}}|$GROUP_NAME|g" \
    -e "s|{{MILESTONE_ID}}|$MILESTONE_ID|g" \
    "$TEMPLATE" > "$DIRECTORY/README.md"
else
  # Default directory template
  sed \
    -e "s|{{DIRECTORY_PATH}}|$DIRECTORY_PATH|g" \
    -e "s|{{DIRECTORY_NAME}}|$DIRECTORY_NAME|g" \
    -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
    -e "s|{{TASK_ID}}|$TASK_ID|g" \
    "$TEMPLATE" > "$DIRECTORY/README.md"
fi

# Log event
log_event "README_INIT" "$DIRECTORY" "SUCCESS task=$TASK_ID"

echo "✅ README created: $DIRECTORY/README.md"
echo ""
echo "📝 Next steps:"
echo "   1. Edit the 'Purpose' section to describe this directory"
echo "   2. Update 'Modules/Contents' to list key files"
echo "   3. Update 'Integration Points' to document dependencies"
echo "   4. Add this README to your commit"
echo ""
echo "Example:"
echo "   vi $DIRECTORY/README.md"
echo "   git add $DIRECTORY/README.md"
