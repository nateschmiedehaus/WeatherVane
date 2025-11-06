#!/usr/bin/env bash
# Validate hierarchical documentation (epic/milestone READMEs)
# Usage: scripts/validate_roadmap_docs.sh

set -euo pipefail

# Get script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source helper library
source "$SCRIPT_DIR/readme_lib.sh"

# Change to repo root for consistent paths
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_error() {
  echo -e "${RED}❌ $1${NC}" >&2
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_info() {
  echo -e "${YELLOW}🔍 $1${NC}"
}

log_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check roadmap exists
ROADMAP="state/roadmap.yaml"
if [[ ! -f "$ROADMAP" ]]; then
  log_error "Roadmap not found: $ROADMAP"
  echo "  Hierarchical documentation requires roadmap.yaml to exist"
  exit 2  # Exit code 2 = not found (vs 1 = validation failed)
fi

ERRORS=0

# Extract epic IDs (try yq first, fallback to grep)
if command -v yq >/dev/null 2>&1; then
  EPIC_IDS=$(yq '.epics[].id' "$ROADMAP" 2>/dev/null)
else
  log_warn "yq not found, using grep fallback"
  log_warn "Install yq for better roadmap parsing: brew install yq"
  # Fallback: extract epic IDs using grep
  EPIC_IDS=$(grep -A 2 "^epics:" "$ROADMAP" | grep "  - id:" | sed 's/.*id: //' | tr -d '"' | tr -d "'" || true)
fi

# Validate epics
if [[ -n "$EPIC_IDS" ]]; then
  log_info "Validating epics..."

  for epic_id in $EPIC_IDS; do
    epic_dir="state/epics/$epic_id"
    epic_readme="$epic_dir/README.md"

    if [[ ! -d "$epic_dir" ]]; then
      log_error "Missing epic directory: $epic_dir"
      echo "  → Run: scripts/readme_init.sh $epic_dir [TASK-ID]"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    if [[ ! -f "$epic_readme" ]]; then
      log_error "Missing epic README: $epic_readme"
      echo "  → Run: scripts/readme_init.sh $epic_dir [TASK-ID]"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    # Validate YAML frontmatter
    if ! validate_yaml_frontmatter "$epic_readme" 2>/dev/null; then
      log_error "Invalid YAML in $epic_readme"
      echo "  → Check YAML frontmatter syntax (lines 1-10)"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    # Validate required sections
    if ! validate_readme_structure "$epic_readme" 2>/dev/null; then
      log_error "Invalid structure in $epic_readme"
      echo "  → Missing required sections (Purpose, Recent Changes, Navigation, etc.)"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    log_success "Epic $epic_id"
  done
else
  log_info "No epics found in roadmap (skipping epic validation)"
fi

# Extract milestone IDs
if command -v yq >/dev/null 2>&1; then
  MILESTONE_IDS=$(yq '.epics[].milestones[].id' "$ROADMAP" 2>/dev/null)
else
  # Fallback: extract milestone IDs using grep
  # This is more fragile but works for standard format
  MILESTONE_IDS=$(grep "    - id:" "$ROADMAP" | sed 's/.*id: //' | tr -d '"' | tr -d "'" | grep -v "^epics" || true)
fi

# Validate milestones
if [[ -n "$MILESTONE_IDS" ]]; then
  log_info "Validating milestones..."

  for milestone_id in $MILESTONE_IDS; do
    milestone_dir="state/milestones/$milestone_id"
    milestone_readme="$milestone_dir/README.md"

    if [[ ! -d "$milestone_dir" ]]; then
      log_error "Missing milestone directory: $milestone_dir"
      echo "  → Run: scripts/readme_init.sh $milestone_dir [TASK-ID]"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    if [[ ! -f "$milestone_readme" ]]; then
      log_error "Missing milestone README: $milestone_readme"
      echo "  → Run: scripts/readme_init.sh $milestone_dir [TASK-ID]"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    # Validate YAML frontmatter
    if ! validate_yaml_frontmatter "$milestone_readme" 2>/dev/null; then
      log_error "Invalid YAML in $milestone_readme"
      echo "  → Check YAML frontmatter syntax (lines 1-10)"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    # Validate required sections
    if ! validate_readme_structure "$milestone_readme" 2>/dev/null; then
      log_error "Invalid structure in $milestone_readme"
      echo "  → Missing required sections (Purpose, Recent Changes, Navigation, etc.)"
      ERRORS=$((ERRORS + 1))
      continue
    fi

    log_success "Milestone $milestone_id"
  done
else
  log_info "No milestones found in roadmap (skipping milestone validation)"
fi

# Check for orphan directories (warning, not error)
if [[ -d "state/epics" ]]; then
  ORPHAN_EPICS=$(find state/epics -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read dir; do
    epic_id=$(basename "$dir")
    if ! echo "$EPIC_IDS" | grep -q "$epic_id"; then
      echo "$epic_id"
    fi
  done)

  if [[ -n "$ORPHAN_EPICS" ]]; then
    log_warn "Orphan epic directories (not in roadmap):"
    for orphan in $ORPHAN_EPICS; do
      echo "    state/epics/$orphan"
    done
    echo "  → These directories are not in roadmap.yaml"
    echo "  → Consider removing or adding to roadmap"
  fi
fi

# Summary
echo ""
if [[ $ERRORS -eq 0 ]]; then
  log_success "All hierarchical documentation valid"
  exit 0
else
  log_error "$ERRORS validation error(s) found"
  echo ""
  echo "Quick fixes:"
  echo "  1. Create missing READMEs: scripts/readme_init.sh state/epics/[EPIC-ID] [TASK-ID]"
  echo "  2. Fix YAML syntax: Check frontmatter formatting in README files"
  echo "  3. Add missing sections: Use template as reference (docs/templates/epic_readme_template.md)"
  exit 1
fi
