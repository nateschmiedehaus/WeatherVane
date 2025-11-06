# README Sync Automation

**Purpose:** Automated distributed knowledge base system that keeps READMEs fresh and synchronized with code changes.

## Overview

Every directory should have a README.md that serves as a **knowledge node** in the distributed knowledge graph. READMEs are automatically initialized and updated at task boundaries.

## Architecture

```
┌─────────────────────────────────────────┐
│ Agent Workflow                           │
├─────────────────────────────────────────┤
│ STRATEGIZE → readme_init.sh             │
│   ↓ (if README missing)                  │
│ [work on code]                           │
│   ↓                                      │
│ VERIFY → readme_update.sh               │
│   ↓ (append to Recent Changes)           │
│ git commit → pre-commit hook            │
│   ↓ (checks README freshness)           │
│ Commit succeeds/fails                    │
└─────────────────────────────────────────┘
```

## Scripts

### `scripts/readme_init.sh`

**Purpose:** Initialize README from template if missing

**Usage:**
```bash
# Initialize in current directory
scripts/readme_init.sh .

# Initialize in specific directory
scripts/readme_init.sh tools/wvo_mcp/src/new_feature

# With explicit task ID
scripts/readme_init.sh src/prove AFP-PROOF-123
```

**When to Use:**
- At start of task (STRATEGIZE phase)
- When creating new directory
- Before making first commit to directory

**Output:**
- Creates `README.md` from template
- Fills in directory path, name, current date, task ID
- Displays next steps (edit Purpose section, etc.)

### `scripts/readme_update.sh`

**Purpose:** Update README "Recent Changes" section after task completion

**Usage:**
```bash
# Update current directory
scripts/readme_update.sh .

# Update specific directory
scripts/readme_update.sh tools/wvo_mcp/src/prove

# With explicit task ID
scripts/readme_update.sh src/prove AFP-PROOF-123
```

**When to Use:**
- At end of task (VERIFY phase)
- Before committing code changes
- After significant work in directory

**Interactive Prompts:**
1. Change description (min 10 chars, use verb + what)
2. Impact level (low/medium/high)

**Output:**
- Appends to "Recent Changes" section
- Updates `last_updated` timestamp in YAML frontmatter
- Updates "Last Updated" in markdown header
- Lists changed files

**Example Entry:**
```markdown
### AFP-PROOF-123 - Added Layer 3 production feedback
- Files: production_feedback.ts, types.ts
- Impact: high
- Date: 2025-11-06
- See: state/evidence/AFP-PROOF-123/
```

### `scripts/readme_lib.sh`

**Purpose:** Shared helper functions for README scripts

**Key Functions:**
- `detect_current_task()` - Auto-detect task ID from evidence or git branch
- `directory_name_from_path()` - Convert path to human-readable name
- `log_event()` - Log to `state/analytics/readme_sync.log`
- `sed_inplace()` - Cross-platform in-place sed
- `current_date()` - Get date in YYYY-MM-DD format
- `hours_since()` - Calculate hours since date
- `validate_yaml_frontmatter()` - Validate README frontmatter
- `validate_readme_structure()` - Check required sections exist

## Pre-Commit Hook

**Location:** `.git/hooks/pre-commit`

**Purpose:** Enforce README freshness before allowing commit

**Checks:**
1. Does README exist in changed directories?
2. Is README updated within 24 hours?
3. Is README staged in the commit?

**Skipped Directories:**
- `.`, `.github`, `.git`, `scripts`, `state`, `docs`, `node_modules`, `dist`, `build`

**Error Messages:**
```
❌ README missing in: src/new_feature/
   Fix: scripts/readme_init.sh src/new_feature

❌ README stale in: src/prove/ (last updated: 2025-11-03)
   Fix: scripts/readme_update.sh src/prove

ℹ️  README changed but not staged: src/prove/README.md
   Fix: git add src/prove/README.md
```

**Emergency Override:**
```bash
git commit --no-verify -m "Emergency commit"
```

## README Template Structure

### YAML Frontmatter (Machine-Parsable)
```yaml
---
type: "directory_readme"
directory: "tools/wvo_mcp/src/prove"
status: "in-progress"  # new|in-progress|stable|deprecated
last_updated: "2025-11-06"
owner: "WeatherVane Autopilot"
dependencies: []
consumers: []
---
```

### Markdown Sections (Human-Readable)

1. **Title & Metadata** - Directory name, status, last updated, owner
2. **Purpose** - 1-2 sentence description (human-written)
3. **Recent Changes** - Last 5 changes with task ID, files, impact
4. **Modules/Contents** - List of subdirectories and key files
5. **Integration Points** - Dependencies (uses) and consumers (used by)
6. **Navigation** - Links to parent, children, neighbors
7. **See Also** - Related docs and evidence bundles

## Integration with Work Process

### STRATEGIZE Phase
**Checklist item:** "Check if local README exists, if not run `scripts/readme_init.sh .`"

**Actions:**
1. Run `scripts/readme_init.sh .`
2. If README exists: Read it for context
3. If missing: Edit Purpose section to describe intent

### VERIFY Phase
**Checklist item:** "Update local README with recent changes: `scripts/readme_update.sh .`"

**Actions:**
1. Run `scripts/readme_update.sh .`
2. Describe change (verb + what)
3. Select impact level
4. Stage README: `git add README.md`

### Pre-Commit
**Automatic:** Hook runs before every commit

**Actions:**
- Checks README freshness in changed directories
- Blocks commit if stale or missing
- Provides clear fix instructions

## Quality Standards

### Good Change Descriptions

✅ **Good:**
- "Added proof validation layer"
- "Fixed roadmap parser infinite loop"
- "Refactored README automation to use YAML"
- "Removed deprecated template sections"

❌ **Bad:**
- "Updated stuff"
- "Changed things"
- "Fixed bugs"
- "Modified code"

### Impact Levels

**High:**
- New major feature
- Breaking API change
- Fundamental fix (like roadmap parser)
- Architecture refactor

**Medium:**
- New minor feature
- Non-breaking enhancement
- Significant bug fix

**Low:**
- Documentation update
- Small bug fix
- Code formatting
- Test additions

## Troubleshooting

### "README missing" Error

**Problem:** Pre-commit hook blocks commit

**Fix:**
```bash
scripts/readme_init.sh path/to/directory
# Edit Purpose section
git add path/to/directory/README.md
git commit
```

### "README stale" Error

**Problem:** README not updated in 24 hours

**Fix:**
```bash
scripts/readme_update.sh path/to/directory
# Describe changes, select impact
git add path/to/directory/README.md
git commit
```

### "Invalid YAML frontmatter" Error

**Problem:** YAML syntax error in README

**Fix:**
```bash
# Backup corrupted README
cp path/to/README.md path/to/README.md.broken

# Regenerate frontmatter
scripts/readme_init.sh path/to/directory --force

# Manually merge content if needed
```

### Script Portability Issues

**Problem:** Scripts fail on Linux or macOS

**Fix:**
- Ensure bash 4.0+ installed
- Check `sed_inplace()` wrapper in `readme_lib.sh`
- Use POSIX-compliant commands

## Analytics

**Log Location:** `state/analytics/readme_sync.log`

**Format:**
```
[2025-11-06T12:34:56Z] README_INIT src/new_feature/ SUCCESS task=AFP-TEST-001
[2025-11-06T12:45:23Z] README_UPDATE src/prove/ SUCCESS task=AFP-PROOF-123 impact=high
```

**Metrics:**
- Initialization count
- Update frequency
- Impact distribution
- Compliance rate

## Future Enhancements (Phase 2)

**Parent Propagation:**
- Automatic parent README updates for major changes
- Depth limit (max 3 levels)
- Circuit breaker (prevent infinite loops)

**Quality Improvements:**
- Periodic quality audit (self-improvement)
- README linter (check for common issues)
- Link validation (ensure navigation works)

**Advanced Features:**
- Full CHANGELOG.md generation
- README search/index
- Visual README linter
- Multi-language support

---

**See Also:**
- [Template](../templates/readme_template.md)
- [Design](../../state/evidence/AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106/design.md)
- [Evidence Bundle](../../state/evidence/AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106/)
