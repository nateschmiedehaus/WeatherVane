# Autopilot Git Handler

## Overview

The autopilot now includes an intelligent git handler that automatically manages your working tree before each run. This eliminates the annoying "Git worktree dirty; continuing with caution" warning while keeping you informed about uncommitted changes.

## How It Works

### Automatic File Categorization

The handler categorizes your uncommitted files into three groups:

1. **Operational Files** (auto-committed)
   - `state/` - Runtime state and checkpoints
   - `.codex/` - Codex session logs
   - `.accounts/` - Account configurations
   - `experiments/` - Telemetry and analytics
   - `*package-lock.json` - Dependency lock files
   - `pyproject.toml` - Poetry dependencies
   - `Makefile` - Build configuration
   - `claude.md` - Claude instructions
   - MCP documentation and config files

2. **Code Files** (flagged for manual review)
   - `apps/` - Application code
   - `shared/` - Shared libraries
   - `tests/` - Test files
   - `scripts/` - Build and deployment scripts
   - `docs/` - Product documentation

3. **Unknown Files** (flagged for review)
   - Files that don't match any known pattern

### Modes

The handler supports three modes:

#### 1. Auto Mode (Default)
```bash
make autopilot  # Uses auto mode by default
WVO_GIT_MODE=auto make autopilot
```

**Behavior:**
- Auto-commits operational files with descriptive message
- Warns about code files but continues anyway
- Lists unknown files for your awareness

**Best for:** Normal development workflow where you have uncommitted code changes

#### 2. Stash Mode
```bash
WVO_GIT_MODE=stash make autopilot
```

**Behavior:**
- Stashes ALL changes (including code)
- Creates a named stash: `autopilot-pre-run-TIMESTAMP`
- Leaves working tree completely clean

**Best for:** When you want a pristine worktree and will restore changes later

**To restore:**
```bash
git stash pop
```

#### 3. Strict Mode
```bash
WVO_GIT_MODE=strict make autopilot
```

**Behavior:**
- Fails if ANY files are uncommitted
- Forces you to manually commit or stash before running

**Best for:** Production or critical runs where you want explicit control

### Backward Compatibility

Old environment variables still work:
```bash
WVO_AUTOPILOT_ALLOW_DIRTY=1  # Maps to auto mode
WVO_AUTOPILOT_ENFORCE_CLEAN=1  # Maps to strict mode
```

## Usage Examples

### Example 1: Normal Development Workflow

```bash
# You're working on features with 500+ uncommitted files
$ make autopilot AGENTS=5

# Handler automatically:
# 1. Auto-commits 122 operational files
# 2. Warns about 506 code files
# 3. Continues autopilot normally
```

### Example 2: Clean Slate for Testing

```bash
# Stash everything for a clean test run
$ WVO_GIT_MODE=stash make autopilot AGENTS=3

# After testing, restore your work
$ git stash pop
```

### Example 3: Production Deploy

```bash
# Ensure completely clean worktree
$ WVO_GIT_MODE=strict make autopilot AGENTS=5

# Will fail if any changes exist
# Forces you to commit first
```

## Manual Operation

You can also run the handler manually:

```bash
# Auto-commit operational files
$ bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto

# Stash all changes
$ bash tools/wvo_mcp/scripts/autopilot_git_handler.sh stash

# Check status (strict mode, no changes)
$ bash tools/wvo_mcp/scripts/autopilot_git_handler.sh strict

# Dry run (see what would happen)
$ WVO_GIT_DRY_RUN=1 bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto
```

## Customization

### Adding Operational File Patterns

Edit `tools/wvo_mcp/scripts/autopilot_git_handler.sh`:

```bash
OPERATIONAL_PATTERNS=(
  # ... existing patterns ...

  # Your custom patterns
  "my_operational_dir/"
  "my_config.yaml"
)
```

### Adding Code File Patterns

```bash
CODE_PATTERNS=(
  # ... existing patterns ...

  # Your custom patterns
  "my_code_dir/"
)
```

## What Gets Auto-Committed

When operational files are auto-committed, the handler creates a commit with:

**Commit Message Format:**
```
chore(autopilot): Auto-commit operational state

Operational files updated during normal autopilot operations:
- State files: 45 files
- Codex sessions: 12 files
- Account configs: 3 files
- Experiments: 52 files
- Build artifacts: 10 files

Total: 122 operational files

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Troubleshooting

### "Git worktree has 500+ remaining changes"

This is normal if you have uncommitted code. The handler:
- ✅ Auto-committed operational files
- ⚠️ Flagged code files for manual review
- ✅ Continues autopilot anyway

**Action:** Review your code changes and commit them when ready. Autopilot will continue working.

### "Git handler not found"

The handler script is missing. Autopilot falls back to basic git checking.

**Fix:**
```bash
# The handler should be at:
ls -la tools/wvo_mcp/scripts/autopilot_git_handler.sh

# If missing, restore from git or pull latest changes
```

### "Failed to determine git status"

You're not in a git repository or git is not installed.

**Fix:**
```bash
# Verify git is working
git status

# If git is broken, fix it first
```

## Benefits

1. **No More Noise**: Operational files (state/, .codex/, etc.) are auto-committed silently
2. **Stay Informed**: You're still warned about code changes
3. **Flexible**: Choose the right mode for your workflow
4. **Safe**: Never auto-commits actual code without your permission
5. **Traceable**: Auto-commits have clear, descriptive messages

## Security Note

The handler never auto-commits files matching these patterns (from .gitignore):
- `**/.env*` - Environment variables
- `**/credentials.json` - API credentials
- `**/*.pem`, `**/*.key` - Private keys
- Files in `.accounts/` or `.claude/` (ignored directories)

These files are excluded by `.gitignore` and won't be tracked by git even if modified.
