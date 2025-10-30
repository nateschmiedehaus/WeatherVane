#!/usr/bin/env bash
# Setup Git Hooks for Quality Assurance
# Installs pre-commit and pre-push hooks to enforce quality standards
# Usage: bash scripts/setup_git_hooks.sh [--install|--uninstall]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
HOOKS_DIR="$WORKSPACE_ROOT/.git/hooks"
ACTION="${1:-install}"

case "$ACTION" in
  --install|install)
    echo -e "${GREEN}🪝 Installing Git hooks for quality assurance...${NC}"
    echo ""

    # Check if .git directory exists
    if [ ! -d "$WORKSPACE_ROOT/.git" ]; then
      echo -e "${RED}Error: Not a git repository${NC}"
      exit 1
    fi

    # Create hooks directory if it doesn't exist
    mkdir -p "$HOOKS_DIR"

    # ============================================
    # PRE-COMMIT HOOK
    # ============================================
    cat > "$HOOKS_DIR/pre-commit" <<'EOF'
#!/usr/bin/env bash
# Pre-Commit Quality Check
# Runs before git commit to catch quality issues early

set -e

echo "🔍 Running pre-commit quality checks..."
echo ""

# Get workspace root
WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"

# Track failures
FAILURES=0

# Quick build check
echo "Building..."
if ! npm run build > /tmp/pre-commit-build.log 2>&1; then
  echo "❌ Build failed"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ Build passed"
fi

# Type check
echo "Type checking..."
if ! npm run typecheck > /tmp/pre-commit-typecheck.log 2>&1; then
  echo "❌ Type check failed"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ Type check passed"
fi

# Lint check
echo "Linting..."
if ! npm run lint > /tmp/pre-commit-lint.log 2>&1; then
  echo "⚠️  Lint failed (non-blocking)"
fi

# Quick quality checks
echo "Quality gates..."
if bash "$WORKSPACE_ROOT/scripts/check_quality_gates.sh" > /tmp/pre-commit-quality.log 2>&1; then
  echo "✅ Quality gates passed"
else
  echo "⚠️  Quality gate failures (non-blocking)"
fi

echo ""

# Exit with error if critical failures
if [ $FAILURES -gt 0 ]; then
  echo "❌ Pre-commit checks failed! Fix errors before committing."
  echo ""
  echo "Logs:"
  echo "  Build: /tmp/pre-commit-build.log"
  echo "  TypeCheck: /tmp/pre-commit-typecheck.log"
  echo ""
  echo "To bypass (not recommended): git commit --no-verify"
  exit 1
fi

echo "✅ All pre-commit checks passed!"
exit 0
EOF

    chmod +x "$HOOKS_DIR/pre-commit"
    echo -e "${GREEN}✅ Installed pre-commit hook${NC}"

    # ============================================
    # PRE-PUSH HOOK
    # ============================================
    cat > "$HOOKS_DIR/pre-push" <<'EOF'
#!/usr/bin/env bash
# Pre-Push Quality Check
# Runs before git push to ensure quality standards

set -e

echo "🔍 Running pre-push quality checks..."
echo ""

# Get workspace root
WORKSPACE_ROOT="$(git rev-parse --show-toplevel)"

# Track failures
FAILURES=0

# Run full test suite
echo "Running tests..."
if ! npm test > /tmp/pre-push-test.log 2>&1; then
  echo "❌ Tests failed"
  FAILURES=$((FAILURES + 1))
else
  echo "✅ Tests passed"
fi

# Security audit
echo "Security audit..."
if ! npm audit --audit-level=high > /tmp/pre-push-audit.log 2>&1; then
  echo "⚠️  Security vulnerabilities found (review recommended)"
fi

# Run failure hunt
echo "Hunting for issues..."
if bash "$WORKSPACE_ROOT/scripts/hunt_failures.sh" --report-only > /tmp/pre-push-hunt.log 2>&1; then
  echo "✅ No critical issues found"
else
  echo "⚠️  Issues detected (review hunt report)"
fi

echo ""

# Exit with error if critical failures
if [ $FAILURES -gt 0 ]; then
  echo "❌ Pre-push checks failed! Fix errors before pushing."
  echo ""
  echo "Logs:"
  echo "  Tests: /tmp/pre-push-test.log"
  echo ""
  echo "To bypass (not recommended): git push --no-verify"
  exit 1
fi

echo "✅ All pre-push checks passed!"
exit 0
EOF

    chmod +x "$HOOKS_DIR/pre-push"
    echo -e "${GREEN}✅ Installed pre-push hook${NC}"

    # ============================================
    # COMMIT-MSG HOOK (Optional)
    # ============================================
    cat > "$HOOKS_DIR/commit-msg" <<'EOF'
#!/usr/bin/env bash
# Commit Message Validation
# Ensures commit messages follow convention

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Check for conventional commit format (optional)
# Pattern: type(scope): description
# Examples: feat(ui): add button, fix(api): handle errors

if echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|style|refactor|test|chore|perf)\(.+\): .+"; then
  exit 0
fi

# Allow merge commits
if echo "$COMMIT_MSG" | grep -qE "^Merge "; then
  exit 0
fi

# Warn but don't block
echo "⚠️  Commit message doesn't follow conventional format"
echo "   Recommended: type(scope): description"
echo "   Example: feat(quality): add pre-commit hooks"
echo ""
exit 0
EOF

    chmod +x "$HOOKS_DIR/commit-msg"
    echo -e "${GREEN}✅ Installed commit-msg hook${NC}"

    echo ""
    echo -e "${GREEN}✅ Git hooks installed successfully!${NC}"
    echo ""
    echo "Installed hooks:"
    echo "  - pre-commit: Build, typecheck, quality gates"
    echo "  - pre-push: Tests, security audit, issue hunt"
    echo "  - commit-msg: Message format validation (warning only)"
    echo ""
    echo "To bypass hooks: use --no-verify flag (not recommended)"
    ;;

  --uninstall|uninstall)
    echo -e "${YELLOW}🗑  Uninstalling Git hooks...${NC}"
    echo ""

    # Remove hooks
    rm -f "$HOOKS_DIR/pre-commit"
    rm -f "$HOOKS_DIR/pre-push"
    rm -f "$HOOKS_DIR/commit-msg"

    echo -e "${GREEN}✅ Git hooks uninstalled${NC}"
    ;;

  --help|help)
    echo "Setup Git Hooks for Quality Assurance"
    echo ""
    echo "Usage: $0 [ACTION]"
    echo ""
    echo "Actions:"
    echo "  install    Install quality assurance git hooks (default)"
    echo "  uninstall  Remove quality assurance git hooks"
    echo "  help       Show this help message"
    echo ""
    echo "Hooks:"
    echo "  pre-commit:  Build, typecheck, quality gates"
    echo "  pre-push:    Tests, security audit, issue hunt"
    echo "  commit-msg:  Message format validation"
    exit 0
    ;;

  *)
    echo -e "${RED}Unknown action: $ACTION${NC}"
    echo "Use --help for usage information"
    exit 1
    ;;
esac
