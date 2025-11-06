#!/usr/bin/env bash
# Shared helper functions for README automation scripts

set -euo pipefail

# Detect current task ID from latest evidence bundle or git branch
detect_current_task() {
  # Try to get from latest evidence bundle
  if [[ -d "state/evidence" ]]; then
    local latest=$(ls -t state/evidence/ 2>/dev/null | head -1)
    if [[ -n "$latest" ]]; then
      echo "$latest"
      return 0
    fi
  fi

  # Fallback: Try to extract from current git branch
  local branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ "$branch" =~ (AFP-[A-Z0-9-]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  # Last resort: Generate timestamp-based ID
  echo "AFP-MANUAL-$(date +%Y%m%d-%H%M%S)"
}

# Convert directory path to human-readable name
# Example: tools/wvo_mcp/src/prove → "Prove"
directory_name_from_path() {
  local path="$1"
  # Get basename
  local name=$(basename "$path")
  # Replace underscores with spaces
  name=$(echo "$name" | tr '_' ' ')
  # Capitalize first letter of each word
  name=$(echo "$name" | sed 's/\b\(.\)/\u\1/g')
  echo "$name"
}

# Log event to analytics
log_event() {
  local event_type="$1"
  local target="$2"
  local status="$3"
  local log_file="state/analytics/readme_sync.log"

  # Create log directory if missing
  mkdir -p "$(dirname "$log_file")"

  # ISO 8601 timestamp
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Append log entry
  echo "[$timestamp] $event_type $target $status" >> "$log_file"
}

# Cross-platform in-place sed
sed_inplace() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires -i with extension
    sed -i.bak "$@"
  else
    # Linux works without extension
    sed -i "$@"
  fi
}

# Cross-platform current date in YYYY-MM-DD format
current_date() {
  date -u +"%Y-%m-%d"
}

# Calculate hours since a date
hours_since() {
  local date_str="$1"
  local current_epoch=$(date +%s)

  # Parse date (YYYY-MM-DD format)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    local date_epoch=$(date -j -f "%Y-%m-%d" "$date_str" +%s 2>/dev/null || echo "0")
  else
    local date_epoch=$(date -d "$date_str" +%s 2>/dev/null || echo "0")
  fi

  # Calculate hours difference
  local diff_seconds=$((current_epoch - date_epoch))
  local diff_hours=$((diff_seconds / 3600))

  echo "$diff_hours"
}

# Check if directory should skip README requirement
should_skip_readme_check() {
  local dir="$1"
  case "$dir" in
    "." | ".github" | ".git" | "scripts" | "state" | "docs" | "node_modules" | "dist" | "build" )
      return 0  # Skip these directories
      ;;
    * )
      return 1  # Require README
      ;;
  esac
}

# Validate YAML frontmatter in README
validate_yaml_frontmatter() {
  local readme="$1"

  # Extract frontmatter (between first two --- lines only)
  # Count line numbers of --- markers
  local first_dash=$(grep -n "^---$" "$readme" | head -1 | cut -d: -f1)
  local second_dash=$(grep -n "^---$" "$readme" | head -2 | tail -1 | cut -d: -f1)

  if [[ -z "$first_dash" ]] || [[ -z "$second_dash" ]]; then
    return 1  # No frontmatter found
  fi

  # Extract lines between the two markers (excluding the markers themselves)
  local yaml=$(sed -n "$((first_dash + 1)),$((second_dash - 1))p" "$readme")

  if [[ -z "$yaml" ]]; then
    return 1  # No frontmatter content
  fi

  # Try to validate with yq if available
  if command -v yq >/dev/null 2>&1; then
    echo "$yaml" | yq . >/dev/null 2>&1
    return $?
  fi

  # Fallback: Try with python if available
  if command -v python3 >/dev/null 2>&1; then
    echo "$yaml" | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin)" 2>/dev/null
    return $?
  fi

  # No validator available, assume valid
  return 0
}

# Validate README structure
validate_readme_structure() {
  local readme="$1"

  # Check required sections exist
  grep -q "^## Purpose" "$readme" || {
    echo "❌ README missing required section: Purpose"
    return 1
  }

  grep -q "^## Recent Changes" "$readme" || {
    echo "❌ README missing required section: Recent Changes"
    return 1
  }

  grep -q "^## Navigation" "$readme" || {
    echo "❌ README missing required section: Navigation"
    return 1
  }

  # Validate YAML frontmatter
  validate_yaml_frontmatter "$readme" || {
    echo "❌ README has invalid YAML frontmatter"
    return 1
  }

  return 0
}
