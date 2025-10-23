# Git Automation - Fully Autonomous Git Management

## Problem

Previous autopilot behavior was **semi-autonomous**:
- ✅ Auto-committed operational files (state/, .codex/, etc.)
- ❌ Only **warned** about code files
- ❌ Required manual intervention for git issues
- ❌ Not truly autonomous

**You said:** "It's ok it gives me these updates but it has to through the orchestrator handle these things so all conceivable git options are DONE. It's useless to me to have an agent just tell me about these things without resolving them automatically."

**We agree!** Autopilot should handle **everything** automatically.

## Solution: Full Git Automation

### Auto-Commit Modes

| Mode     | Behavior                                          | Use Case                    |
|----------|---------------------------------------------------|-----------------------------|
| **auto** | Auto-commit ALL files (code, docs, tests, new)    | **Default, fully autonomous** |
| cautious | Auto-commit operational only, warn about code     | Conservative mode           |
| stash    | Stash all changes before autopilot                | Temporary backup            |
| strict   | Require clean worktree (fail on any changes)      | CI/CD, strict workflows     |

**New default:** `auto` mode - commits **everything** without warnings.

### What It Auto-Commits

**Everything:**
- ✅ Code files (`apps/`, `shared/`, `tools/`)
- ✅ Documentation (`docs/`, `*.md`)
- ✅ Tests (`tests/`)
- ✅ New files (untracked)
- ✅ Configuration (`*.json`, `*.yaml`)
- ✅ Operational state (`state/`, `.codex/`, `.accounts/`)
- ✅ Data files (`storage/`, `*.parquet`)

**Smart commit messages:**
- Analyzes file types
- Generates appropriate commit type (feat/docs/test/chore)
- Includes file counts per category
- Uses conventional commit format

Example:
```
feat(autopilot): Update implementation

Changes made by autopilot:
- Code files: 48
- Documentation: 14
- Tests: 3
- New files: 37
- Operational: 3

Total: 105 files

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

## Usage

### Autopilot (automatic)

```bash
# Default: auto mode (commits everything)
make autopilot AGENTS=5

# Explicit mode
WVO_GIT_MODE=auto make autopilot AGENTS=5

# Old behavior (warn only)
WVO_GIT_MODE=cautious make autopilot AGENTS=5
```

### Manual Invocation

```bash
# Commit all changes
bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto

# Dry run (see what would be committed)
WVO_GIT_DRY_RUN=1 bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto

# Old cautious mode
bash tools/wvo_mcp/scripts/autopilot_git_handler.sh cautious
```

### TypeScript API

```typescript
import { GitRecovery } from "./utils/git_recovery";

const git = new GitRecovery(workspaceRoot);

// Check if recovery needed
if (await git.needsRecovery()) {
  // Auto-recover from any git issues
  await git.recoverWithLogging();
}

// Auto-commit all changes
await git.autoCommit();

// Get status
const status = await git.getStatus();
console.log(`Branch: ${status.branch}`);
console.log(`Clean: ${status.clean}`);
console.log(`Ahead: ${status.ahead}, Behind: ${status.behind}`);

// Get human-readable message
const msg = await git.getStatusMessage();
console.log(msg);
// => "Branch: main - ahead by 3 - has uncommitted changes"
```

## Git Error Recovery

The system now **automatically handles** all common git errors:

### 1. Locked Index
```
Problem: .git/index.lock exists (previous operation crashed)
Solution: Delete .git/index.lock
```

### 2. Detached HEAD
```
Problem: HEAD is not on any branch
Solution: Checkout main/master (or create it)
```

### 3. Merge Conflicts
```
Problem: Unresolved merge conflicts
Solution: Auto-resolve using "ours" strategy (keep local changes)
```

### 4. Dirty Worktree
```
Problem: Uncommitted changes blocking operations
Solution: Auto-commit all changes with smart message
```

### 5. Missing Upstream
```
Problem: Local branch has no remote tracking
Solution: Set upstream to origin/<branch> (create if needed)
```

### 6. Diverged Branches
```
Problem: Local and remote have diverged
Solution: Rebase onto remote (or merge if rebase fails)
```

### 7. Behind Remote
```
Problem: Remote has new commits
Solution: Pull with rebase
```

All of these happen **automatically** - no user intervention required.

## Integration with Orchestrator

The orchestrator uses git automation at multiple points:

### 1. Pre-flight Check (before starting)
```typescript
// In autopilot_unified.sh
bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto
```

This ensures a clean worktree before autopilot starts.

### 2. Error Recovery (during execution)
```typescript
import { GitRecovery } from "./utils/git_recovery";

// In orchestrator loop
try {
  await someGitOperation();
} catch (error) {
  if (error.message.includes("git")) {
    // Auto-recover
    const git = new GitRecovery(this.workspaceRoot);
    await git.recoverWithLogging();

    // Retry operation
    await someGitOperation();
  }
}
```

### 3. Periodic Cleanup (every N tasks)
```typescript
// After completing 10 tasks
if (completedTasks % 10 === 0) {
  const git = new GitRecovery(workspaceRoot);

  if (await git.needsRecovery()) {
    await git.recoverWithLogging();
  }
}
```

### 4. Manual Tool Call (MCP server)
```typescript
// In tool_router.ts
case "git_recovery": {
  const git = new GitRecovery(workspaceRoot);
  const result = await git.recoverWithLogging();
  return { success: result };
}
```

## Behavior Changes

### Before (Semi-Autonomous)
```
Found 77 modified files:
  Operational files: 3
  Code files:        48
  Unknown files:     26

Auto-committing 3 operational files...
✓ Operational files committed

⚠️  48 code files have uncommitted changes:
   M apps/model/mmm_lightweight_weather.py
   M docs/ARCHITECTURE.md
   ...

These files need manual review. Autopilot will continue with caution.
```

**Result:** Autopilot continues but files remain uncommitted. User must manually commit later.

### After (Fully Autonomous)
```
Found 77 modified files:
  Operational files: 3
  Code files:        48
  Unknown files:     26

Auto-committing ALL 77 files...
  Code: 48
  Docs: 14
  Tests: 3
  New: 37
  Operational: 3

✓ All files committed successfully
✓ Git worktree is now clean
```

**Result:** Autopilot commits everything automatically. No manual intervention needed.

## Testing

### Test Auto-Commit (Dry Run)
```bash
# See what would be committed
WVO_GIT_DRY_RUN=1 bash tools/wvo_mcp/scripts/autopilot_git_handler.sh auto
```

Example output:
```
Auto-commit mode (full auto)

Auto-committing ALL 77 files...
  Code: 48
  Docs: 14
  Tests: 3
  New: 37
  Operational: 3

  Would commit all 77 files
```

### Test Recovery Script
```bash
# Run recovery
bash tools/wvo_mcp/scripts/git_error_recovery.sh
```

This will automatically fix any git issues and show what it did.

### Test TypeScript API
```typescript
import { GitRecovery } from "./utils/git_recovery";

const git = new GitRecovery("/path/to/workspace");

// Get status
const status = await git.getStatus();
console.log(JSON.stringify(status, null, 2));

// Run recovery
const result = await git.recover();
console.log(`Success: ${result.success}`);
console.log(`Actions: ${result.actions.join(", ")}`);
```

## Safety Features

### 1. Merge Conflict Strategy
- Uses "ours" strategy (keeps local changes)
- Rationale: Autopilot's changes are more recent
- Alternative: Can be configured to use "theirs" if needed

### 2. Commit Attribution
All auto-commits include:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

This makes it clear which commits were made by autopilot.

### 3. No Force Push
- Never uses `git push --force`
- Always uses rebase or merge for sync
- Preserves remote history

### 4. Recovery Logging
All recovery actions are logged:
```
⚡ Locked index detected (.git/index.lock)
✓ Index lock removed

⚡ Dirty worktree detected
✓ Changes committed

✓ Git error recovery complete
```

## Configuration

### Environment Variables

| Variable           | Default | Description                          |
|--------------------|---------|--------------------------------------|
| WVO_GIT_MODE       | auto    | Git handler mode (auto/cautious/stash/strict) |
| WVO_GIT_DRY_RUN    | 0       | Set to 1 for dry run (no actual changes) |
| WVO_SKIP_GIT_HANDLER | 0     | Set to 1 to skip git handler entirely |

### Example: Conservative Mode
```bash
# Use old behavior (warn only)
WVO_GIT_MODE=cautious make autopilot AGENTS=5
```

### Example: Skip Git Handling
```bash
# Don't auto-commit anything
WVO_SKIP_GIT_HANDLER=1 make autopilot AGENTS=5
```

## Troubleshooting

### "Changes still not committed"

If files remain uncommitted after auto-commit:

1. Check if they're gitignored:
   ```bash
   git check-ignore -v <file>
   ```

2. Check file permissions:
   ```bash
   ls -l <file>
   ```

3. Run recovery manually:
   ```bash
   bash tools/wvo_mcp/scripts/git_error_recovery.sh
   ```

### "Merge conflicts keep appearing"

If conflicts recur:

1. Check if you have uncommitted changes:
   ```bash
   git status
   ```

2. Pull latest remote changes:
   ```bash
   git pull --rebase
   ```

3. Run recovery:
   ```bash
   bash tools/wvo_mcp/scripts/git_error_recovery.sh
   ```

### "Auth failed when pushing"

If remote push fails:

1. Check SSH key:
   ```bash
   ssh -T git@github.com
   ```

2. Or use HTTPS with token:
   ```bash
   git remote set-url origin https://github.com/user/repo.git
   ```

Recovery script will continue even if push fails (works locally).

## Future Enhancements

1. **Smart Conflict Resolution**
   - Use LLM to resolve conflicts intelligently
   - Analyze code semantics, not just "ours/theirs"

2. **Commit Message AI**
   - Generate descriptive commit messages based on actual changes
   - Analyze diffs to understand what was changed

3. **Branch Management**
   - Auto-create feature branches for logical work units
   - Auto-merge branches when work completes

4. **PR Creation**
   - Automatically create pull requests when branch is ready
   - Generate PR descriptions from commit history

5. **Rollback Support**
   - Track which commits were made by autopilot
   - Provide easy rollback if needed

## Related Documentation

- `tools/wvo_mcp/scripts/autopilot_git_handler.sh` - Main git handler
- `tools/wvo_mcp/scripts/git_error_recovery.sh` - Error recovery
- `tools/wvo_mcp/src/utils/git_recovery.ts` - TypeScript API
- `docs/orchestration/ORCHESTRATOR_EVOLUTION_SPEC.md` - Orchestrator design

---

**Summary:** Autopilot now handles ALL git operations automatically - no more "manual review" warnings. It commits everything (code, docs, tests, new files) with smart commit messages, and automatically recovers from any git errors. Fully autonomous.
