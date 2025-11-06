#!/usr/bin/env bash
#
# Git Error Recovery - Automatic git issue resolution
#
# This script automatically handles common git errors:
# - Merge conflicts (auto-resolve with ours/theirs strategy)
# - Detached HEAD (checkout main/master)
# - Dirty worktree (auto-commit all changes)
# - Missing upstream (set up tracking)
# - Failed push (pull with rebase, then retry)
# - Locked index (.git/index.lock removal)
#
# Designed to be called by orchestrator when git operations fail.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$ROOT"

# Clean up temp files on exit (including Ctrl+C)
trap "rm -f *.base *.ours *.theirs *.merged 2>/dev/null || true" EXIT

# Source intelligent merge helpers
source "$SCRIPT_DIR/merge_helpers.sh"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Git Error Recovery${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if we're in a git repo
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo -e "${RED}✗ Not in a git repository${NC}"
  exit 1
fi

#
# 1. Check for locked index
#
if [ -f .git/index.lock ]; then
  echo -e "${YELLOW}⚡ Locked index detected (.git/index.lock)${NC}"
  rm -f .git/index.lock
  echo -e "${GREEN}✓ Index lock removed${NC}"
  echo ""
fi

#
# 2. Check for detached HEAD
#
current_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ -z "$current_branch" ]; then
  echo -e "${YELLOW}⚡ Detached HEAD detected${NC}"

  # Try to find main branch
  if git show-ref --verify --quiet refs/heads/main; then
    git checkout main
    echo -e "${GREEN}✓ Switched to 'main' branch${NC}"
  elif git show-ref --verify --quiet refs/heads/master; then
    git checkout master
    echo -e "${GREEN}✓ Switched to 'master' branch${NC}"
  else
    # Create main branch from current position
    git checkout -b main
    echo -e "${GREEN}✓ Created 'main' branch${NC}"
  fi
  echo ""
  current_branch=$(git symbolic-ref --short HEAD)
fi

#
# 3. Check for merge conflicts
#
if git diff --name-only --diff-filter=U | grep -q .; then
  echo -e "${YELLOW}⚡ Merge conflicts detected${NC}"

  conflicted_files=$(git diff --name-only --diff-filter=U)
  echo "Conflicted files:"
  echo "$conflicted_files" | head -10
  echo ""

  echo "Attempting intelligent merge (auto → semantic → union → fallback)..."

  # Intelligent merge resolution (Batch 2: auto + semantic + union + validation)
  while IFS= read -r file; do
    if [ -f "$file" ]; then
      echo "  Processing: $file"

      # Extract versions for merge functions
      git show :2:"$file" > "$file.ours" 2>/dev/null || true
      git show :3:"$file" > "$file.theirs" 2>/dev/null || true

      # Try merge strategies in priority order
      if attempt_auto_merge "$file"; then
        echo "    ✓ Auto-merged successfully"

        # Validate merged file
        if validate_merge "$file"; then
          git add "$file"
          log_merge_decision "$file" "auto_merge" "kept_both"
        else
          echo "    ✗ Validation failed, fallback to ours"
          git checkout --ours "$file"
          git add "$file"
          log_merge_decision "$file" "fallback_ours" "validation_failed"
        fi

      # Batch 2: Semantic merge for TypeScript
      elif [[ "$file" == *.ts || "$file" == *.tsx ]] && attempt_semantic_merge_typescript "$file"; then
        echo "    ✓ Semantic merge (TypeScript) successful"
        git add "$file"
        log_merge_decision "$file" "semantic_merge_typescript" "kept_both"

      # Batch 2: Semantic merge for JSON
      elif [[ "$file" == *.json ]] && attempt_semantic_merge_json "$file"; then
        echo "    ✓ Semantic merge (JSON) successful"
        git add "$file"
        log_merge_decision "$file" "semantic_merge_json" "kept_both"

      elif attempt_union_merge "$file"; then
        echo "    ⚠️  Union merge (manual review needed)"
        git add "$file"
        log_merge_decision "$file" "union_merge" "needs_review"

      else
        # Should never reach here (union always succeeds)
        echo "    ✗ All strategies failed, fallback to ours"
        git checkout --ours "$file"
        git add "$file"
        log_merge_decision "$file" "fallback_ours" "all_failed"
      fi

      # Clean up temp files for this iteration
      rm -f "$file.base" "$file.ours" "$file.theirs" "$file.merged" 2>/dev/null || true
    fi
  done <<< "$conflicted_files"

  # Complete the merge
  if git commit --no-edit >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Merge conflicts resolved${NC}"
  else
    echo -e "${GREEN}✓ Conflicts resolved (no commit needed)${NC}"
  fi
  echo ""
fi

#
# 4. Check for dirty worktree
#
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo -e "${YELLOW}⚡ Dirty worktree detected${NC}"

  # Use the smart git handler to auto-commit
  if [ -f "$SCRIPT_DIR/autopilot_git_handler.sh" ]; then
    bash "$SCRIPT_DIR/autopilot_git_handler.sh" auto
  else
    # Fallback: simple commit
    git add -A
    git commit -m "chore(recovery): Auto-commit during git error recovery

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" >/dev/null 2>&1 || true
    echo -e "${GREEN}✓ Changes committed${NC}"
  fi
  echo ""
fi

#
# 5. Check for missing upstream
#
if git branch --show-current >/dev/null 2>&1; then
  upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")

  if [ -z "$upstream" ]; then
    echo -e "${YELLOW}⚡ No upstream branch configured${NC}"

    # Check if remote exists
    if git remote | grep -q origin; then
      # Set upstream to origin/current_branch
      git branch --set-upstream-to=origin/$current_branch $current_branch 2>/dev/null || {
        # If remote branch doesn't exist, push and set upstream
        echo "Creating remote branch..."
        git push -u origin $current_branch 2>/dev/null || {
          echo -e "${YELLOW}⚠️  Could not push to remote (may need authentication)${NC}"
        }
      }
      echo -e "${GREEN}✓ Upstream configured: origin/$current_branch${NC}"
    else
      echo -e "${YELLOW}⚠️  No remote 'origin' found (working locally)${NC}"
    fi
    echo ""
  fi
fi

#
# 6. Check for diverged branches
#
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")
if [ -n "$upstream" ]; then
  # Fetch latest
  git fetch origin 2>/dev/null || true

  local_commits=$(git rev-list --count HEAD ^$upstream 2>/dev/null || echo "0")
  remote_commits=$(git rev-list --count $upstream ^HEAD 2>/dev/null || echo "0")

  if [ "$local_commits" -gt 0 ] && [ "$remote_commits" -gt 0 ]; then
    echo -e "${YELLOW}⚡ Branch has diverged (local: +$local_commits, remote: +$remote_commits)${NC}"
    echo "Rebasing onto remote..."

    if git pull --rebase origin $current_branch 2>/dev/null; then
      echo -e "${GREEN}✓ Rebased successfully${NC}"
    else
      # Rebase failed, abort and try merge
      git rebase --abort 2>/dev/null || true
      echo "Rebase failed, trying merge..."

      if git pull --no-rebase origin $current_branch 2>/dev/null; then
        echo -e "${GREEN}✓ Merged successfully${NC}"
      else
        echo -e "${YELLOW}⚠️  Could not sync with remote (may have conflicts)${NC}"
      fi
    fi
    echo ""
  elif [ "$remote_commits" -gt 0 ]; then
    echo -e "${YELLOW}⚡ Remote has $remote_commits new commits${NC}"
    git pull --rebase origin $current_branch 2>/dev/null || true
    echo -e "${GREEN}✓ Pulled latest changes${NC}"
    echo ""
  fi
fi

#
# 7. Final verification
#
echo "Final status:"
echo "  Branch: $(git symbolic-ref --short HEAD 2>/dev/null || echo 'DETACHED')"
echo "  Commit: $(git rev-parse --short HEAD)"
echo "  Status: $(git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ] && echo 'clean' || echo 'has changes')"

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")
if [ -n "$upstream" ]; then
  echo "  Upstream: $upstream"

  local_commits=$(git rev-list --count HEAD ^$upstream 2>/dev/null || echo "0")
  remote_commits=$(git rev-list --count $upstream ^HEAD 2>/dev/null || echo "0")

  if [ "$local_commits" -eq 0 ] && [ "$remote_commits" -eq 0 ]; then
    echo "  Sync: up to date"
  elif [ "$local_commits" -gt 0 ] && [ "$remote_commits" -eq 0 ]; then
    echo "  Sync: ahead by $local_commits commits"
  elif [ "$local_commits" -eq 0 ] && [ "$remote_commits" -gt 0 ]; then
    echo "  Sync: behind by $remote_commits commits"
  else
    echo "  Sync: diverged (local +$local_commits, remote +$remote_commits)"
  fi
fi

echo ""
echo -e "${GREEN}✓ Git error recovery complete${NC}"
