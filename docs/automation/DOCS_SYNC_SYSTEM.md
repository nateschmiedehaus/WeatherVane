# Documentation Sync System

**Purpose:** Keep AGENTS.md automatically in sync with CLAUDE.md for shared sections

## How It Works

### 1. Mark Sections in CLAUDE.md (Source)

Wrap sections you want to sync with markers:

```markdown
<!-- SYNC_START: section-name -->

Your content here...
This will be copied to AGENTS.md

<!-- SYNC_END: section-name -->
```

### 2. Mark Injection Points in AGENTS.md (Target)

Add markers where content should be injected:

```markdown
<!-- INJECT_START: section-name -->

Content between these markers will be REPLACED
by content from CLAUDE.md section-name

<!-- INJECT_END: section-name -->
```

### 3. Run the Sync Script

```bash
# Manual sync
bash scripts/sync_agent_docs.sh

# Review changes
git diff docs/agents/AGENTS.md

# Commit if correct
git add docs/agents/AGENTS.md
git commit -m "docs: sync AGENTS.md from CLAUDE.md"
```

## Synced Sections

The following sections are automatically synced:

| Section Name | Description | CLAUDE.md Location |
|--------------|-------------|-------------------|
| `protocol` | Complete Spec→Monitor Protocol | Section 8 |
| `learning` | Learning System Mandate | Section 7.5 |
| `integration-first` | Integration-First Development | Section 8.1 |
| `zero-gaps` | Zero Gaps Policy | Section 6 REVIEW |
| `verification` | Verification Standards | Section 5 VERIFY |

## Adding New Synced Sections

1. **Mark in CLAUDE.md:**
   ```markdown
   <!-- SYNC_START: new-section-name -->
   Your content...
   <!-- SYNC_END: new-section-name -->
   ```

2. **Mark in AGENTS.md:**
   ```markdown
   <!-- INJECT_START: new-section-name -->
   Placeholder (will be replaced)
   <!-- INJECT_END: new-section-name -->
   ```

3. **Update sync script:**
   ```bash
   # Add to scripts/sync_agent_docs.sh
   echo -e "${YELLOW}  Syncing: New Section Name${NC}"
   NEW_CONTENT=$(extract_section "$CLAUDE_MD" \
     "<!-- SYNC_START: new-section-name -->" \
     "<!-- SYNC_END: new-section-name -->")

   replace_section "$AGENTS_MD" \
     "<!-- INJECT_START: new-section-name -->" \
     "<!-- INJECT_END: new-section-name -->" \
     "$NEW_CONTENT"
   ```

## Pre-Commit Hook (Optional)

To automatically sync before commits:

```bash
# Create .git/hooks/pre-commit
cat > .git/hooks/pre-commit <<'EOF'
#!/usr/bin/env bash
# Auto-sync AGENTS.md if CLAUDE.md changed

if git diff --cached --name-only | grep -q "CLAUDE.md"; then
  echo "🔄 CLAUDE.md changed, syncing to AGENTS.md..."
  bash scripts/sync_agent_docs.sh
  git add docs/agents/AGENTS.md
  echo "✅ AGENTS.md synced and staged"
fi
EOF

chmod +x .git/hooks/pre-commit
```

## CI Check (Optional)

Add to CI pipeline to verify docs are in sync:

```yaml
# .github/workflows/docs-sync-check.yml
name: Docs Sync Check

on: [pull_request]

jobs:
  check-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run sync script
        run: bash scripts/sync_agent_docs.sh
      - name: Check for changes
        run: |
          if git diff --exit-code docs/agents/AGENTS.md; then
            echo "✅ Docs are in sync"
          else
            echo "❌ AGENTS.md out of sync with CLAUDE.md"
            echo "Run: bash scripts/sync_agent_docs.sh"
            exit 1
          fi
```

## Benefits

✅ **Single source of truth** - Edit in CLAUDE.md, sync to AGENTS.md automatically
✅ **No manual duplication** - Eliminates copy-paste errors
✅ **Version controlled** - All changes tracked in git
✅ **Selective sync** - Only sync sections you mark
✅ **Agent-specific content** - AGENTS.md can still have unique sections

## Example Workflow

1. **Update CLAUDE.md** - Edit section 7.5 (Learning System)
2. **Run sync** - `bash scripts/sync_agent_docs.sh`
3. **Review** - `git diff docs/agents/AGENTS.md`
4. **Commit both** - `git add CLAUDE.md docs/agents/AGENTS.md && git commit`

## Troubleshooting

**Q: Sync script fails with "marker not found"**
- Ensure both SYNC_START and SYNC_END markers exist in CLAUDE.md
- Ensure both INJECT_START and INJECT_END markers exist in AGENTS.md
- Check spelling of section-name (must match exactly)

**Q: Content not syncing**
- Verify markers are on their own lines
- Check for extra spaces in marker comments
- Run with `set -x` for debugging: `bash -x scripts/sync_agent_docs.sh`

**Q: Want to temporarily disable sync for a section**
- Comment out the sync block in scripts/sync_agent_docs.sh
- Or rename the markers (e.g., add `.disabled` suffix)

## Maintenance

- **Review synced sections quarterly** - Remove sections no longer needed
- **Update script comments** - Keep section list in script header current
- **Test after major refactors** - Ensure markers still work after restructuring docs
