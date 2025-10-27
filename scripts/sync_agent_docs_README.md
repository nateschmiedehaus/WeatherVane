# Quick Start: CLAUDE.md → AGENTS.md Sync

## TL;DR

**Yes, it's easy!** Just wrap sections with markers and run a script.

## How to Use

### Step 1: Mark sections in CLAUDE.md

```markdown
<!-- SYNC_START: learning -->

## 7.5) Systematic Learning & Self-Improvement Mandate

[Your content here...]

<!-- SYNC_END: learning -->
```

### Step 2: Mark injection points in AGENTS.md

```markdown
## Learning System

<!-- INJECT_START: learning -->

This content will be replaced by content from CLAUDE.md

<!-- INJECT_END: learning -->
```

### Step 3: Run the sync

```bash
bash scripts/sync_agent_docs.sh
```

Done! 🎉

## Example: Adding a New Synced Section

**In CLAUDE.md:**
```markdown
<!-- SYNC_START: verification -->

### Stage 5: VERIFY
- Build must pass (0 errors)
- Tests must pass (100%)
- Audit clean (0 vulnerabilities)

<!-- SYNC_END: verification -->
```

**In AGENTS.md:**
```markdown
## Verification Requirements

<!-- INJECT_START: verification -->
Placeholder content
<!-- INJECT_END: verification -->
```

**Then:**
```bash
bash scripts/sync_agent_docs.sh  # Syncs automatically!
```

## Benefits

✅ Edit once in CLAUDE.md → sync to AGENTS.md automatically
✅ No manual copying
✅ Always in sync
✅ Version controlled

## Current Synced Sections

- `protocol` - Complete Spec→Monitor Protocol
- `learning` - Learning System Mandate
- `integration-first` - Integration-First Development
- `zero-gaps` - Zero Gaps Policy
- `verification` - Verification Standards

## Full Documentation

See [DOCS_SYNC_SYSTEM.md](../docs/automation/DOCS_SYNC_SYSTEM.md) for:
- Pre-commit hook setup
- CI integration
- Adding new sections to sync
- Troubleshooting
