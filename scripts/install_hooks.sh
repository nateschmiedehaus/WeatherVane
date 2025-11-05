#!/bin/bash
# Auto-install git hooks
# Run this automatically on repo setup or periodically

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOK_SOURCE="$REPO_ROOT/.githooks/pre-commit"
HOOK_DEST="$REPO_ROOT/.git/hooks/pre-commit"

echo "🔧 Installing git hooks..."

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Error: Source hook not found at $HOOK_SOURCE"
  exit 1
fi

# Copy and make executable
cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-commit hook installed successfully"
echo "   Location: $HOOK_DEST"
echo ""
echo "   Enforcement active:"
echo "   • Micro-batching limits (≤5 files, ≤150 LOC)"
echo "   • Design evidence requirement (GATE)"
echo "   • StrategyReviewer (strategy.md)"
echo "   • ThinkingCritic (think.md)"
echo "   • DesignReviewer (design.md)"
echo "   • Credential leak detection"
