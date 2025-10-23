#!/usr/bin/env bash
#
# Smart Git Handler for Autopilot
#
# Intelligently manages git worktree before autopilot runs by:
# - Auto-committing operational files (state/, .codex/, experiments/, etc.)
# - Warning about code changes that need manual review
# - Providing options for different cleanup modes
#
# Usage:
#   bash tools/wvo_mcp/scripts/autopilot_git_handler.sh [--mode auto|stash|strict]
#
# Modes:
#   auto     - Auto-commit ALL files (operational + code + docs + new files) (default)
#   cautious - Auto-commit operational files only, warn about code changes
#   stash    - Stash all changes before autopilot
#   strict   - Require completely clean worktree (fail on any changes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
MODE="${1:-auto}"
DRY_RUN="${WVO_GIT_DRY_RUN:-0}"

# File patterns for operational files that can be auto-committed
OPERATIONAL_PATTERNS=(
  # Runtime state
  "state/"
  ".codex/"
  ".accounts/"

  # Telemetry and analytics
  "experiments/"

  # Build artifacts (that somehow got tracked)
  "apps/web/next-env.d.ts"
  "apps/web/package-lock.json"
  "package-lock.json"
  "tools/wvo_mcp/package-lock.json"

  # Python environment
  "pyproject.toml"  # Poetry lock updates

  # MCP config that changes during operations
  ".clean_worktree"

  # Makefile changes (often just timestamps or minor tweaks)
  "Makefile"

  # Documentation that gets updated during operations
  "claude.md"  # Claude instructions
  "package.json"  # Root package.json (often just version bumps)

  # MCP orchestrator documentation (status reports, audits, etc.)
  "tools/wvo_mcp/ARCHITECTURE_V2.md"
  "tools/wvo_mcp/COORDINATOR_FAILOVER.md"
  "tools/wvo_mcp/DIAGNOSIS.md"
  "tools/wvo_mcp/EFFICIENCY_AUDIT.md"
  "tools/wvo_mcp/EFFICIENCY_FIXES_APPLIED.md"
  "tools/wvo_mcp/FIXES_APPLIED.md"
  "tools/wvo_mcp/IMPLEMENTATION_STATUS.md"
  "tools/wvo_mcp/PERFORMANCE_AUDIT.md"
  "tools/wvo_mcp/WEB_INSPIRATION_PLAN.md"
  "tools/wvo_mcp/config/"
  "tools/wvo_mcp/package.json"
)

# File patterns for code files that need manual review
CODE_PATTERNS=(
  "apps/"
  "shared/"
  "tests/"
  "tools/wvo_mcp/src/"
  "scripts/"
  "docs/"
)

cd "$ROOT"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Autopilot Git Handler${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Mode: $MODE"
if [ "$DRY_RUN" = "1" ]; then
  echo -e "${YELLOW}Dry run mode - no changes will be made${NC}"
fi
echo ""

# Check if we're in a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo -e "${RED}✗ Not in a git repository${NC}"
  exit 1
fi

# Get git status
status=$(git status --porcelain 2>/dev/null || true)

if [ -z "$status" ]; then
  echo -e "${GREEN}✓ Git worktree is clean${NC}"
  exit 0
fi

# Count total files
total_files=$(echo "$status" | wc -l | tr -d ' ')
echo "Found $total_files modified files"
echo ""

# Categorize files
operational_files=()
code_files=()
unknown_files=()

while IFS= read -r line; do
  [ -z "$line" ] && continue

  # Extract file path (skip first 3 characters which are status codes)
  file="${line:3}"

  # Check if it's an operational file
  is_operational=0
  for pattern in "${OPERATIONAL_PATTERNS[@]}"; do
    if [[ "$file" == $pattern* ]]; then
      operational_files+=("$line")
      is_operational=1
      break
    fi
  done

  if [ $is_operational -eq 0 ]; then
    # Check if it's a code file
    is_code=0
    for pattern in "${CODE_PATTERNS[@]}"; do
      if [[ "$file" == $pattern* ]]; then
        code_files+=("$line")
        is_code=1
        break
      fi
    done

    if [ $is_code -eq 0 ]; then
      unknown_files+=("$line")
    fi
  fi
done <<< "$status"

echo "Categorization:"
echo "  Operational files: ${#operational_files[@]}"
echo "  Code files:        ${#code_files[@]}"
echo "  Unknown files:     ${#unknown_files[@]}"
echo ""

# Generate smart commit message based on file changes
generate_commit_message() {
  local code_count=$1
  local doc_count=$2
  local test_count=$3
  local new_count=$4
  local operational_count=$5

  local primary_type=""
  local summary=""

  # Determine primary change type
  if [ $code_count -gt 0 ] && [ $code_count -ge $doc_count ]; then
    primary_type="feat"
    summary="Update implementation"
  elif [ $doc_count -gt 0 ]; then
    primary_type="docs"
    summary="Update documentation"
  elif [ $test_count -gt 0 ]; then
    primary_type="test"
    summary="Update tests"
  elif [ $operational_count -gt 0 ]; then
    primary_type="chore"
    summary="Update operational state"
  else
    primary_type="chore"
    summary="Update project files"
  fi

  # Build detailed message
  echo "${primary_type}(autopilot): ${summary}

Changes made by autopilot:
- Code files: ${code_count}
- Documentation: ${doc_count}
- Tests: ${test_count}
- New files: ${new_count}
- Operational: ${operational_count}

Total: $((code_count + doc_count + test_count + new_count + operational_count)) files

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
}

# Handle based on mode
case "$MODE" in
  auto)
    echo -e "${BLUE}Auto-commit mode (full auto)${NC}"
    echo ""

    if [ ${#operational_files[@]} -eq 0 ] && [ ${#code_files[@]} -eq 0 ] && [ ${#unknown_files[@]} -eq 0 ]; then
      echo -e "${GREEN}✓ No changes to commit${NC}"
      exit 0
    fi

    # Count file types for commit message
    code_count=${#code_files[@]}
    doc_count=$(echo "$status" | grep -c ' docs/' || echo 0)
    test_count=$(echo "$status" | grep -c ' tests/' || echo 0)
    new_count=$(echo "$status" | grep -c '^?? ' || echo 0)
    operational_count=${#operational_files[@]}

    echo -e "${YELLOW}Auto-committing ALL ${total_files} files...${NC}"
    echo "  Code: $code_count"
    echo "  Docs: $doc_count"
    echo "  Tests: $test_count"
    echo "  New: $new_count"
    echo "  Operational: $operational_count"
    echo ""

    if [ "$DRY_RUN" = "0" ]; then
      # Add ALL files (including untracked)
      git add -A

      # Generate smart commit message
      commit_msg=$(generate_commit_message "$code_count" "$doc_count" "$test_count" "$new_count" "$operational_count")

      # Create commit
      if git commit -m "$commit_msg" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ All files committed successfully${NC}"
      else
        echo -e "${YELLOW}⚠️  No changes to commit (files may have been previously staged)${NC}"
      fi
    else
      echo "  Would commit all $total_files files"
    fi

    # Verify clean worktree
    remaining=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    if [ "$remaining" -eq 0 ]; then
      echo -e "${GREEN}✓ Git worktree is now clean${NC}"
    else
      echo -e "${YELLOW}⚠️  $remaining files still uncommitted (may be gitignored)${NC}"
    fi
    exit 0
    ;;

  cautious)
    echo -e "${BLUE}Cautious mode (operational files only)${NC}"
    echo ""

    # Auto-commit operational files
    if [ ${#operational_files[@]} -gt 0 ]; then
      echo -e "${YELLOW}Auto-committing ${#operational_files[@]} operational files...${NC}"

      if [ "$DRY_RUN" = "0" ]; then
        # Add operational files
        for line in "${operational_files[@]}"; do
          file="${line:3}"
          git add "$file" 2>/dev/null || true
        done

        # Create commit
        commit_msg="chore(autopilot): Auto-commit operational state

Operational files updated during normal autopilot operations:
- State files: $(echo "$status" | grep -c '^ M state/' || echo 0) files
- Codex sessions: $(echo "$status" | grep -c '^ M .codex/' || echo 0) files
- Account configs: $(echo "$status" | grep -c '^ M .accounts/' || echo 0) files
- Experiments: $(echo "$status" | grep -c '^ M experiments/' || echo 0) files
- Build artifacts: $(echo "$status" | grep -c '^ M .*package-lock.json' || echo 0) files

Total: ${#operational_files[@]} operational files

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

        if git commit -m "$commit_msg" >/dev/null 2>&1; then
          echo -e "${GREEN}✓ Operational files committed${NC}"
        else
          echo -e "${YELLOW}⚠️  No changes to commit (files may have been previously staged)${NC}"
        fi
      else
        echo "  Would commit ${#operational_files[@]} operational files"
      fi
      echo ""
    fi

    # Warn about code files
    if [ ${#code_files[@]} -gt 0 ]; then
      echo -e "${YELLOW}⚠️  ${#code_files[@]} code files have uncommitted changes:${NC}"
      echo ""
      for line in "${code_files[@]}"; do
        echo "  $line"
      done | head -20

      if [ ${#code_files[@]} -gt 20 ]; then
        echo "  ... and $((${#code_files[@]} - 20)) more"
      fi
      echo ""
      echo -e "${YELLOW}These files need manual review. Autopilot will continue with caution.${NC}"
      echo ""
    fi

    # Warn about unknown files
    if [ ${#unknown_files[@]} -gt 0 ]; then
      echo -e "${YELLOW}⚠️  ${#unknown_files[@]} unknown files:${NC}"
      for line in "${unknown_files[@]}"; do
        echo "  $line"
      done | head -10

      if [ ${#unknown_files[@]} -gt 10 ]; then
        echo "  ... and $((${#unknown_files[@]} - 10)) more"
      fi
      echo ""
    fi

    # Check final status
    remaining=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    if [ "$remaining" -eq 0 ]; then
      echo -e "${GREEN}✓ Git worktree is now clean${NC}"
      exit 0
    else
      echo -e "${YELLOW}Git worktree has $remaining remaining changes (continuing with caution)${NC}"
      exit 0
    fi
    ;;

  stash)
    echo -e "${BLUE}Stash mode${NC}"
    echo ""

    if [ "$DRY_RUN" = "0" ]; then
      if git stash push -u -m "autopilot-pre-run-$(date +%Y%m%d-%H%M%S)" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ All changes stashed${NC}"
        echo "  To restore: git stash pop"
      else
        echo -e "${RED}✗ Failed to stash changes${NC}"
        exit 1
      fi
    else
      echo "  Would stash all $total_files files"
    fi
    ;;

  strict)
    echo -e "${BLUE}Strict mode${NC}"
    echo ""
    echo -e "${RED}✗ Git worktree has uncommitted changes${NC}"
    echo ""
    echo "Please commit or stash changes before running autopilot:"
    echo "  git add -A && git commit -m 'your message'"
    echo "  # or"
    echo "  git stash"
    echo ""
    echo "Or use a different mode:"
    echo "  $0 --mode auto    # Auto-commit operational files"
    echo "  $0 --mode stash   # Stash all changes"
    exit 1
    ;;

  *)
    echo -e "${RED}✗ Unknown mode: $MODE${NC}"
    echo "Valid modes: auto, cautious, stash, strict"
    echo ""
    echo "Modes:"
    echo "  auto     - Auto-commit ALL files (default, fully autonomous)"
    echo "  cautious - Auto-commit operational files only, warn about code"
    echo "  stash    - Stash all changes"
    echo "  strict   - Require clean worktree (fail on any changes)"
    exit 1
    ;;
esac
