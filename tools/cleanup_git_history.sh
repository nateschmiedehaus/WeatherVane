#!/usr/bin/env bash
#
# Clean up large files from git history
#
# This script removes runtime files that should never have been committed:
# - state/orchestrator.db (95 MB SQLite database)
# - state/analytics/autopilot_policy_history.jsonl (700 MB log file)
#
# Usage:
#   1. Stop all MCP processes
#   2. Run: bash tools/cleanup_git_history.sh
#   3. Force push: git push --force-with-lease origin main

set -euo pipefail

echo "🧹 Cleaning up git history..."
echo ""

# Stop MCP processes
echo "Stopping MCP processes..."
pkill -9 -f "tools/wvo_mcp/dist" 2>/dev/null || echo "No MCP processes running"
sleep 2

# Commit any pending changes
echo ""
echo "Committing any pending changes..."
git add -A
git commit -m "chore: Pre-cleanup commit" || echo "Nothing to commit"

# Remove large files from history
echo ""
echo "Removing large files from git history (this may take a few minutes)..."
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch state/orchestrator.db state/analytics/autopilot_policy_history.jsonl state/orchestrator.db-shm state/orchestrator.db-wal' \
  --prune-empty -- --all

# Clean up backup refs
echo ""
echo "Cleaning up backup refs..."
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d

# Garbage collect
echo ""
echo "Running garbage collection..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Show results
echo ""
echo "✅ Git history cleaned!"
echo ""
echo "Repository size:"
du -sh .git

echo ""
echo "Next steps:"
echo "  1. Verify with: git log --all --pretty=format:'%H %s' --name-only | grep -E 'orchestrator.db|autopilot_policy_history'"
echo "  2. Push with: git push --force-with-lease origin main"
echo ""
echo "⚠️  WARNING: This rewrites git history. Make sure everyone on your team:"
echo "   - Commits their work"
echo "   - Runs: git fetch && git reset --hard origin/main"
