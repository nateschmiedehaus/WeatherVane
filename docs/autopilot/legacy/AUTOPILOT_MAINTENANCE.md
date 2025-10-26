# Autopilot Maintenance System

## Overview

Autopilot automatically manages its operational files to prevent git repository bloat and keep the system running smoothly. The maintenance system runs before each autopilot session.

## What Gets Managed

### 1. Log Rotation (JSONL Files)

**Trigger:** Files > 50 MB
**Action:** Rotate and compress

```
Before:
state/analytics/autopilot_policy_history.jsonl (700 MB)

After:
state/analytics/autopilot_policy_history.jsonl (0 MB - fresh)
state/analytics/autopilot_policy_history.2025-10-23-080000.jsonl.gz (70 MB - compressed)
```

**Files managed:**
- `state/analytics/autopilot_policy_history.jsonl`
- `state/telemetry/usage.jsonl`
- `state/autopilot_events.jsonl`
- `state/artifacts.log.jsonl`

**Retention:** 90 days, then auto-deleted

### 2. Database Archival (SQLite)

**Trigger:** orchestrator.db > 50 MB
**Action:** Archive old data, run VACUUM

```
Before:
state/orchestrator.db (95 MB)

After:
state/orchestrator.db (10 MB - hot data only, last 7 days)
state/backups/db/archive-2025-10-23-080000.db.gz (30 MB - compressed archive)
```

**What gets archived:**
- Completed tasks older than 7 days
- Resolved decisions
- Historical context entries

**What stays hot:**
- Active tasks
- Recent decisions (last 7 days)
- Current session data

### 3. Git State Management

**Action:** Auto-commit operational files

Automatically commits:
- State file changes
- Analytics updates
- Config updates
- .gitignore changes

Creates commits like:
```
chore(autopilot): Auto-commit operational state [maintenance]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 4. Archive Cleanup

**Trigger:** Files older than 90 days
**Action:** Delete

Cleaned locations:
- `state/analytics/archives/*.gz`
- `state/backups/db/*.gz`
- `state/analytics/*.2025-*.jsonl.gz`

## How It Works

### Automatic Execution

Maintenance runs automatically at autopilot startup:

```bash
# Normal startup - maintenance runs automatically
make autopilot AGENTS=5

# Skip maintenance (not recommended)
WVO_SKIP_MAINTENANCE=1 make autopilot AGENTS=5
```

### Manual Execution

```bash
# Quick maintenance (log rotation + DB cleanup)
bash tools/wvo_mcp/scripts/maintenance.sh

# Full maintenance (includes git history check)
bash tools/wvo_mcp/scripts/maintenance.sh --full
```

### Workflow

```
Autopilot Start
     ↓
Run Maintenance
     ├── Check log files (> 50 MB?)
     │   ├── Rotate large logs
     │   └── Compress rotated logs
     ├── Check database (> 50 MB?)
     │   ├── Archive old tasks (> 7 days)
     │   └── VACUUM to reclaim space
     ├── Clean old archives (> 90 days)
     └── Auto-commit operational state
     ↓
Run Git Handler
     ├── Auto-commit remaining state
     └── Verify worktree status
     ↓
Start Orchestrator
```

## Configuration

### Environment Variables

```bash
# Skip maintenance entirely (not recommended)
export WVO_SKIP_MAINTENANCE=1

# Change rotation threshold (default: 50 MB)
# Note: Edit maintenance.sh to customize MAX_LOG_SIZE_MB

# Change retention period (default: 90 days)
# Note: Edit maintenance.sh to customize RETENTION_DAYS
```

### Custom Configuration

Edit `tools/wvo_mcp/scripts/maintenance.sh`:

```bash
# Configuration section (lines 29-34)
MAX_LOG_SIZE_MB=50      # Rotate logs larger than this
MAX_DB_SIZE_MB=50       # Archive DB larger than this
ARCHIVE_DAYS=7          # Archive data older than this
RETENTION_DAYS=90       # Delete archives older than this
```

## File Size Guidelines

### Healthy State Sizes

| File | Healthy Size | Warning Size | Action Size |
|------|-------------|--------------|-------------|
| `orchestrator.db` | < 10 MB | 25-50 MB | > 50 MB → Archive |
| `autopilot_policy_history.jsonl` | < 20 MB | 30-50 MB | > 50 MB → Rotate |
| `usage.jsonl` | < 5 MB | 10-25 MB | > 50 MB → Rotate |
| `autopilot_events.jsonl` | < 5 MB | 10-25 MB | > 50 MB → Rotate |

### Archive Sizes (Compressed)

After compression with gzip:
- JSONL logs: ~10x reduction (700 MB → 70 MB)
- SQLite DB: ~3x reduction (95 MB → 30 MB)

## Git History Protection

### What's Ignored

The `.gitignore` now includes:

```gitignore
# Runtime state (never tracked)
state/orchestrator.db*
state/analytics/*.jsonl

# Archives (never tracked)
state/analytics/**/*.jsonl.gz
state/analytics/archives/
state/backups/db/
```

### One-Time Cleanup

If large files were accidentally committed to git history:

```bash
# Clean up git history (DESTRUCTIVE - rewrites history)
bash tools/cleanup_git_history.sh

# Then force push
git push --force-with-lease origin main
```

⚠️ **Warning:** This rewrites git history. Coordinate with team.

## Monitoring

### Check Current Sizes

```bash
# Show all state file sizes
du -h state/orchestrator.db state/analytics/*.jsonl

# Show archive sizes
du -sh state/analytics/archives/ state/backups/db/

# Count rotated logs
find state/analytics -name "*.jsonl.gz" | wc -l
```

### Check Maintenance Logs

Maintenance output is shown at autopilot startup:

```
📋 Checking log files...
  Rotating: state/analytics/autopilot_policy_history.jsonl (700MB)
  ✓ Rotated to: state/analytics/autopilot_policy_history.2025-10-23.jsonl.gz

💾 Checking database...
  ✓ Database size OK (10MB)

🧹 Cleaning old archives (> 90 days)...
  ✓ Deleted 5 old archive(s)

📝 Committing operational state...
  ✓ Operational state committed

✓ Maintenance complete

Current sizes:
  orchestrator.db: 10M
  autopilot_policy_history.jsonl: 2.1M
  usage.jsonl: 1.4M
```

## Troubleshooting

### Problem: Logs keep growing despite rotation

**Cause:** Autopilot is running continuously without restarts
**Solution:** Logs only rotate at startup. Restart autopilot periodically:

```bash
# Stop current session
Ctrl+C

# Restart (maintenance runs automatically)
make autopilot AGENTS=5
```

### Problem: Database stays large after archival

**Cause:** VACUUM needs to complete, or sqlite3 not installed
**Solution:**

```bash
# Check if sqlite3 is available
which sqlite3

# Install if needed (macOS)
brew install sqlite

# Manual VACUUM
sqlite3 state/orchestrator.db "VACUUM;"
```

### Problem: Git push fails with "file too large"

**Cause:** Large files were committed before maintenance system was added
**Solution:**

```bash
# One-time history cleanup
bash tools/cleanup_git_history.sh

# Force push (coordinate with team first!)
git push --force-with-lease origin main
```

### Problem: Maintenance script fails

**Cause:** Permission issues or disk space
**Solution:**

```bash
# Check disk space
df -h .

# Check script permissions
ls -la tools/wvo_mcp/scripts/maintenance.sh

# Make executable if needed
chmod +x tools/wvo_mcp/scripts/maintenance.sh

# Check script errors
bash -x tools/wvo_mcp/scripts/maintenance.sh
```

## Best Practices

### 1. Let Autopilot Manage State

✅ **Do:**
- Let maintenance run automatically
- Trust the automatic rotation/archival
- Keep archives for 90 days

❌ **Don't:**
- Manually edit `orchestrator.db`
- Manually delete log files
- Commit large operational files to git

### 2. Monitor Periodically

Weekly check:
```bash
# Check state sizes
make autopilot AGENTS=1  # Runs maintenance, shows sizes
```

Monthly check:
```bash
# Full maintenance with git history check
bash tools/wvo_mcp/scripts/maintenance.sh --full
```

### 3. Archive Important Data

Before major changes:
```bash
# Backup current state
cp state/orchestrator.db state/backups/db/manual-backup-$(date +%Y%m%d).db
gzip state/backups/db/manual-backup-*.db
```

### 4. Clean Git History Proactively

If you see large files in `git status`:
```bash
# Check for large files
git ls-files -s | awk '{if ($4 > 52428800) print $2, $4}'

# Clean immediately
bash tools/cleanup_git_history.sh
```

## Integration with CI/CD

### GitHub Actions

```yaml
# .github/workflows/autopilot.yml
name: Autopilot Maintenance

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  maintenance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run maintenance
        run: bash tools/wvo_mcp/scripts/maintenance.sh --full
      - name: Push changes
        run: |
          git push origin main
```

## FAQ

**Q: Can I disable maintenance?**
A: Yes, but not recommended. Use `WVO_SKIP_MAINTENANCE=1`

**Q: Will this delete my data?**
A: No. Data is archived and compressed, not deleted. Archives are kept for 90 days.

**Q: What if I need older logs?**
A: Check `state/analytics/archives/` for compressed logs up to 90 days old.

**Q: Does this affect performance?**
A: Maintenance adds ~2-10 seconds at startup. VACUUM can take 30-60 seconds for large DBs.

**Q: Can I restore from archives?**
A: Yes. Decompress with `gunzip` and restore manually:
```bash
gunzip state/backups/db/archive-2025-10-23.db.gz
sqlite3 state/orchestrator.db < state/backups/db/archive-2025-10-23.db
```

**Q: What happens if maintenance fails?**
A: Autopilot continues anyway with a warning. Check logs and fix issues.

## Summary

The maintenance system ensures:
- ✅ Git repository stays small (< 100 MB)
- ✅ Logs don't grow unbounded
- ✅ Database stays performant
- ✅ Archives are automatically cleaned
- ✅ Operational state is auto-committed
- ✅ No manual intervention needed

Set it and forget it! 🎉
