# Programmatic Commit Enforcement

## Overview

WeatherVane enforces **frequent commits** programmatically to ensure:
- GitHub stays up to date
- Work is checkpointed regularly
- Phase boundaries are respected
- No loss of work from crashes or errors

## Enforcement Rules

### 1. Time-Based Enforcement
- **Warning:** 30 minutes without commit
- **Critical:** 60 minutes without commit → **AUTO-COMMIT**

### 2. File Count Enforcement
- **Warning:** 5+ uncommitted files
- **Critical:** 10+ uncommitted files → **AUTO-COMMIT**

### 3. Lines Changed Enforcement
- **Warning:** 150+ lines changed
- **Critical:** 300+ lines changed → **AUTO-COMMIT**

### 4. Phase Boundary Enforcement
- **AUTO-COMMIT** when AFP phase changes (STRATEGIZE → SPEC → PLAN, etc.)
- Ensures each phase's work is committed before moving to the next

## Usage

### Check Status (No Auto-Commit)
```bash
cd tools/wvo_mcp
npm run commit:check
```

### Enforce with Auto-Commit
```bash
cd tools/wvo_mcp
npm run commit:enforce
```

### Continuous Monitoring (Watch Mode)
```bash
cd tools/wvo_mcp
npm run commit:watch  # Monitors every 60 seconds, auto-commits when needed
```

## Integration with Wave 0 Autopilot

The commit enforcer is **automatically integrated** with Wave 0:
- Checks before starting each task
- Checks after completing each phase
- Auto-commits at phase boundaries
- Ensures GitHub stays synchronized

## Configuration

Edit `tools/wvo_mcp/scripts/enforce_commits.mjs`:

```javascript
const CONFIG = {
  MAX_UNCOMMITTED_MINUTES: 30,          // Force commit after 30 min
  MAX_UNCOMMITTED_FILES: 5,             // Max files before warning
  MAX_UNCOMMITTED_LINES: 150,           // Max LOC before warning
  CRITICAL_UNCOMMITTED_FILES: 10,       // Block work if this many files
  CRITICAL_UNCOMMITTED_LINES: 300,      // Block work if this many lines
  PHASE_BOUNDARY_COMMIT: true,          // Auto-commit at phase boundaries
  CHECK_INTERVAL_SECONDS: 60,           // Check every minute in watch mode
};
```

## Auto-Commit Messages

Auto-commits include context:
```
chore: auto-commit after 45 minutes

Branch: feature/my-work
Phase: IMPLEMENT
Files: 7

Auto-committed by commit enforcement
```

## Exit Codes

- `0` - No violations
- `1` - Critical violations found
- `2` - Warnings found

## Examples

### Example 1: Time-Based Auto-Commit
```bash
$ npm run commit:check

📊 Commit Enforcement Status

Branch: feature/new-feature
Phase: IMPLEMENT
Time since last commit: 35 minutes
Uncommitted files: 3
Lines changed: 120

⚠️  VIOLATIONS:
   ⏰ 35 minutes since last commit (max: 30)

💡 RECOMMENDATION: Commit your work after 35 minutes
   Run with --enforce to auto-commit
```

### Example 2: Phase Boundary Auto-Commit
```bash
$ npm run commit:enforce

📊 Commit Enforcement Status

Branch: task/AFP-NEW-FEATURE
Phase: DESIGN
Time since last commit: 15 minutes
Uncommitted files: 4
Lines changed: 85

⚠️  VIOLATIONS:
   🔄 Phase boundary: PLAN → DESIGN

🔨 ENFORCING: Creating auto-commit at phase boundary (DESIGN)
✅ Auto-committed: at phase boundary (DESIGN)
   Files: 4
   Branch: task/AFP-NEW-FEATURE
```

### Example 3: Critical Violations
```bash
$ npm run commit:check

📊 Commit Enforcement Status

Branch: feature/big-change
Phase: IMPLEMENT
Time since last commit: 75 minutes
Uncommitted files: 12
Lines changed: 350

⚠️  VIOLATIONS:
   ⏰ 75 minutes since last commit (max: 30)
   📁 12 uncommitted files (max: 5)
   📝 350 lines changed (max: 150)

🚨 CRITICAL VIOLATIONS:
   CRITICAL: More than 1 hour without commit
   CRITICAL: 12 uncommitted files
   CRITICAL: 350 lines changed

💡 RECOMMENDATION: Commit your work with 12 files
   Run with --enforce to auto-commit
```

## Best Practices

1. **Run `commit:check` frequently** during development
2. **Use `commit:watch` for long sessions** - it monitors automatically
3. **Commit at phase boundaries** - don't let work accumulate across phases
4. **Configure thresholds** based on your workflow
5. **Push branches regularly** - enforcement ensures commits, but you must push

## Integration with Pre-Commit Hooks

Commit enforcement works **alongside** pre-commit hooks:
- Pre-commit hooks validate commit **quality** (AFP rules, critics, etc.)
- Commit enforcement ensures commit **frequency**

Together they ensure:
- ✅ High-quality commits (pre-commit hooks)
- ✅ Frequent commits (enforcement)
- ✅ GitHub stays up to date

## Troubleshooting

### Issue: Auto-commit failing
**Solution:** Check git config and ensure repo is not in a detached HEAD state

### Issue: Too many auto-commits
**Solution:** Increase thresholds in CONFIG or commit manually more frequently

### Issue: Phase not detected
**Solution:** Ensure AFP phase files (strategize.md, plan.md, etc.) are in `state/evidence/<TASK-ID>/`

## See Also

- `MANDATORY_WORK_CHECKLIST.md` - AFP 10-phase lifecycle
- `.githooks/pre-commit` - Pre-commit validation
- `tools/wvo_mcp/src/wave0/` - Wave 0 autopilot integration
