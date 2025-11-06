# Plan: Automated Distributed Knowledge Base Implementation

**Task ID:** AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106
**Phase:** PLAN
**Date:** 2025-11-06

## Implementation Overview

**Total Estimated LOC:** ~250
- Template: ~50 LOC
- readme_init.sh: ~60 LOC
- readme_update.sh: ~80 LOC
- pre-commit hook: ~40 LOC
- Helper functions: ~20 LOC

**Files to Create:**
1. `docs/templates/readme_template.md` - Standard README template with YAML frontmatter
2. `scripts/readme_init.sh` - Initialize README from template
3. `scripts/readme_update.sh` - Update README "Recent Changes"
4. `scripts/readme_lib.sh` - Shared helper functions
5. `.git/hooks/pre-commit` - Enforce README freshness (update existing)

**Files to Modify:**
1. `MANDATORY_WORK_CHECKLIST.md` - Add README steps to STRATEGIZE/VERIFY
2. `.gitignore` - Ensure no exclusion of READMEs

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────┐
│ Agent Workflow                           │
├─────────────────────────────────────────┤
│ STRATEGIZE → readme_init.sh             │
│   ↓                                      │
│ [work on code]                           │
│   ↓                                      │
│ VERIFY → readme_update.sh               │
│   ↓                                      │
│ git commit → pre-commit hook            │
│   ↓ (checks README freshness)           │
│ Commit succeeds/fails                    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ README Structure (Machine-Parsable)      │
├─────────────────────────────────────────┤
│ YAML Frontmatter (parsable)             │
│ ├─ type, directory, status              │
│ ├─ last_updated, owner                  │
│ └─ dependencies[], consumers[]          │
│                                          │
│ Markdown Body (human-readable)          │
│ ├─ Purpose                              │
│ ├─ Recent Changes (structured)          │
│ ├─ Modules/Contents                     │
│ ├─ Integration Points                   │
│ └─ Navigation Links                     │
└─────────────────────────────────────────┘
```

## Detailed Design

### 1. Template: `docs/templates/readme_template.md`

**Purpose:** Standard structure for all directory READMEs

**Content:**
```markdown
---
type: directory_readme
directory: {{DIRECTORY_PATH}}
status: in-progress
last_updated: {{CURRENT_DATE}}
owner: WeatherVane Autopilot
dependencies: []
consumers: []
---

# {{DIRECTORY_NAME}}

**Status:** In Progress
**Last Updated:** {{CURRENT_DATE}}
**Owner:** WeatherVane Autopilot

## Purpose

[TODO: Describe what this directory does in 1-2 sentences]

## Recent Changes

### {{TASK_ID}} - Initial setup
- Files: README.md
- Impact: low
- See: state/evidence/{{TASK_ID}}/

## Modules / Contents

[TODO: List subdirectories or key files]

## Integration Points

**Uses:** [TODO: List dependencies]
**Used by:** [TODO: List consumers]

## Navigation

- **Parent:** [../README.md](../README.md)
- **Children:** [TODO: Add subdirectories]

## See Also

- [Related documentation]
```

**Variables to Replace:**
- `{{DIRECTORY_PATH}}` → Full path from repo root (e.g., tools/wvo_mcp/src/prove)
- `{{DIRECTORY_NAME}}` → Last path component (e.g., Proof System)
- `{{CURRENT_DATE}}` → YYYY-MM-DD format
- `{{TASK_ID}}` → Current task from evidence bundle or git branch

**LOC:** ~50

### 2. Script: `scripts/readme_init.sh`

**Purpose:** Initialize README in directory if missing

**Usage:**
```bash
# Explicit directory
scripts/readme_init.sh tools/wvo_mcp/src/new_feature

# Current directory
scripts/readme_init.sh .

# With task ID
scripts/readme_init.sh src/prove AFP-PROOF-123
```

**Algorithm:**
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Parse arguments
DIRECTORY="${1:-.}"
TASK_ID="${2:-$(detect_current_task)}"

# 2. Check if README exists
if [[ -f "$DIRECTORY/README.md" ]]; then
  echo "✅ README already exists: $DIRECTORY/README.md"
  cat "$DIRECTORY/README.md" | head -30  # Show summary
  exit 0
fi

# 3. Load template
TEMPLATE="docs/templates/readme_template.md"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌ Template not found: $TEMPLATE"
  exit 1
fi

# 4. Fill variables
DIRECTORY_PATH="$DIRECTORY"
DIRECTORY_NAME=$(directory_name_from_path "$DIRECTORY")
CURRENT_DATE=$(date +%Y-%m-%d)

# 5. Generate README
sed \
  -e "s|{{DIRECTORY_PATH}}|$DIRECTORY_PATH|g" \
  -e "s|{{DIRECTORY_NAME}}|$DIRECTORY_NAME|g" \
  -e "s|{{CURRENT_DATE}}|$CURRENT_DATE|g" \
  -e "s|{{TASK_ID}}|$TASK_ID|g" \
  "$TEMPLATE" > "$DIRECTORY/README.md"

# 6. Log
log_event "README_INIT" "$DIRECTORY" "SUCCESS"

echo "✅ README created: $DIRECTORY/README.md"
echo "📝 Next: Edit Purpose section before committing"
```

**Helper Functions (in readme_lib.sh):**
```bash
detect_current_task() {
  # Try to extract from evidence bundle
  ls -t state/evidence/ | head -1
}

directory_name_from_path() {
  # tools/wvo_mcp/src/prove → "Proof System"
  basename "$1" | tr '_' ' ' | sed 's/\b\(.\)/\u\1/g'
}

log_event() {
  # Append to state/analytics/readme_sync.log
  echo "[$(date -Iseconds)] $1 $2 $3" >> state/analytics/readme_sync.log
}
```

**LOC:** ~60

### 3. Script: `scripts/readme_update.sh`

**Purpose:** Append to "Recent Changes" section after task completion

**Usage:**
```bash
# Update with current task
scripts/readme_update.sh src/prove

# Update with specific task
scripts/readme_update.sh src/prove AFP-PROOF-123

# Propagate to parent
scripts/readme_update.sh src/prove --propagate
```

**Algorithm:**
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Parse arguments
DIRECTORY="${1:-.}"
TASK_ID="${2:-$(detect_current_task)}"
PROPAGATE="${3:-}"

# 2. Check README exists
if [[ ! -f "$DIRECTORY/README.md" ]]; then
  echo "❌ README not found. Run: scripts/readme_init.sh $DIRECTORY"
  exit 1
fi

# 3. Detect changed files
CHANGED_FILES=$(git diff --name-only HEAD | grep "^$DIRECTORY/" | head -5)
if [[ -z "$CHANGED_FILES" ]]; then
  echo "ℹ️  No files changed in $DIRECTORY"
  exit 0
fi

# 4. Ask agent for change summary
echo "Files changed in $DIRECTORY:"
echo "$CHANGED_FILES"
read -p "📝 Change description: " CHANGE_DESC
read -p "🎯 Impact [low/medium/high]: " IMPACT

# 5. Generate new entry
NEW_ENTRY=$(cat <<EOF

### $TASK_ID - $CHANGE_DESC
- Files: $(echo "$CHANGED_FILES" | tr '\n' ', ' | sed 's/,$//')
- Impact: $IMPACT
- See: state/evidence/$TASK_ID/
EOF
)

# 6. Update README
# Find "## Recent Changes" section and insert after it
sed -i.bak "/^## Recent Changes/a\\
$NEW_ENTRY
" "$DIRECTORY/README.md"

# 7. Update frontmatter last_updated
CURRENT_DATE=$(date +%Y-%m-%d)
sed -i.bak "s/^last_updated: .*/last_updated: $CURRENT_DATE/" "$DIRECTORY/README.md"
sed -i.bak "s/\*\*Last Updated:\*\* .*/\*\*Last Updated:\*\* $CURRENT_DATE/" "$DIRECTORY/README.md"

# 8. Limit to 5 recent entries (archive older to CHANGELOG.md)
limit_recent_changes "$DIRECTORY/README.md" 5

# 9. Propagate to parent if major change
if [[ "$PROPAGATE" == "--propagate" ]] || is_major_change "$IMPACT"; then
  propagate_to_parent "$DIRECTORY" "$TASK_ID" "$CHANGE_DESC"
fi

# 10. Log
log_event "README_UPDATE" "$DIRECTORY" "SUCCESS task=$TASK_ID"

echo "✅ README updated: $DIRECTORY/README.md"
rm "$DIRECTORY/README.md.bak"
```

**Helper Functions:**
```bash
limit_recent_changes() {
  # Keep only last N entries in Recent Changes
  # Move older to CHANGELOG.md
}

is_major_change() {
  [[ "$1" == "high" ]] || [[ "$1" == "medium" ]]
}

propagate_to_parent() {
  # Update parent README's subdirectory list
}
```

**LOC:** ~80

### 4. Hook: `.git/hooks/pre-commit`

**Purpose:** Enforce README freshness before allowing commit

**Algorithm:**
```bash
#!/usr/bin/env bash

# 1. Get list of changed directories
CHANGED_DIRS=$(git diff --cached --name-only | xargs -n1 dirname | sort -u)

# 2. For each directory with changes
for DIR in $CHANGED_DIRS; do
  README="$DIR/README.md"

  # Skip if no README required (root, scripts, etc)
  if should_skip_readme_check "$DIR"; then
    continue
  fi

  # 3. Check if README exists
  if [[ ! -f "$README" ]]; then
    echo "❌ README missing in: $DIR"
    echo "   Run: scripts/readme_init.sh $DIR"
    exit 1
  fi

  # 4. Check if README updated recently (within 24h)
  LAST_UPDATED=$(grep "^last_updated:" "$README" | cut -d' ' -f2)
  HOURS_OLD=$(hours_since "$LAST_UPDATED")

  if [[ $HOURS_OLD -gt 24 ]]; then
    echo "❌ README stale in: $DIR (last updated: $LAST_UPDATED)"
    echo "   Run: scripts/readme_update.sh $DIR"
    exit 1
  fi

  # 5. Check if README staged
  if ! git diff --cached --name-only | grep -q "^$README$"; then
    echo "ℹ️  README changed but not staged: $README"
    echo "   Run: git add $README"
    exit 1
  fi
done

echo "✅ README freshness check passed"
exit 0
```

**Helper Functions:**
```bash
should_skip_readme_check() {
  # Skip: root, .github, scripts, state, docs
  case "$1" in
    "." | ".github" | "scripts" | "state" | "docs" ) return 0 ;;
    * ) return 1 ;;
  esac
}

hours_since() {
  # Calculate hours since date
}
```

**LOC:** ~40

### 5. Shared Library: `scripts/readme_lib.sh`

**Purpose:** Shared functions for README scripts

**Functions:**
- `detect_current_task()` - Find active task ID
- `directory_name_from_path()` - Convert path to human name
- `log_event()` - Log to analytics
- `limit_recent_changes()` - Keep last N entries
- `is_major_change()` - Determine propagation
- `propagate_to_parent()` - Update parent README
- `hours_since()` - Date math
- `should_skip_readme_check()` - Skip directories

**LOC:** ~20

## Integration Plan

### Phase 1: Template + Scripts
1. Create `docs/templates/readme_template.md`
2. Create `scripts/readme_lib.sh`
3. Create `scripts/readme_init.sh`
4. Test manually: `scripts/readme_init.sh test_dir`

### Phase 2: Update Script
1. Create `scripts/readme_update.sh`
2. Test manually: Make change, run update script
3. Verify YAML frontmatter and Recent Changes update

### Phase 3: Hook
1. Update `.git/hooks/pre-commit` (append README check)
2. Test: Make change without updating README → commit blocked
3. Test: Update README → commit succeeds

### Phase 4: Documentation
1. Update `MANDATORY_WORK_CHECKLIST.md`
2. Add README steps to STRATEGIZE and VERIFY phases
3. Document in `docs/workflows/README_SYNC.md`

## Proof Criteria (Designed BEFORE Implementation)

### Build Verification
```bash
# Scripts are syntactically valid
shellcheck scripts/readme_init.sh
shellcheck scripts/readme_update.sh
shellcheck scripts/readme_lib.sh
```
**Expected:** 0 errors

### Functional Tests

**Test 1: Initialize README**
```bash
# Setup
rm -f test_dir/README.md

# Run
scripts/readme_init.sh test_dir AFP-TEST-001

# Verify
- README exists
- YAML frontmatter valid
- Variables replaced correctly
```

**Test 2: Update README**
```bash
# Setup: Create test README, make file changes

# Run
scripts/readme_update.sh test_dir AFP-TEST-002 <<EOF
Test update
medium
EOF

# Verify
- "Recent Changes" has new entry
- last_updated updated in frontmatter and markdown
- Changed files listed
```

**Test 3: Pre-commit Hook**
```bash
# Test 3a: Missing README blocks commit
git add test_dir/new_file.ts
git commit -m "test"
# Expected: Blocked with message

# Test 3b: Stale README blocks commit
# (Manually set last_updated to 3 days ago)
git add test_dir/file.ts
git commit -m "test"
# Expected: Blocked

# Test 3c: Fresh README allows commit
scripts/readme_update.sh test_dir
git add test_dir/README.md test_dir/file.ts
git commit -m "test"
# Expected: Success
```

**Test 4: Machine Parsability**
```bash
# Parse YAML frontmatter
cat test_dir/README.md | sed -n '/^---$/,/^---$/p' | yq '.status'
# Expected: Valid YAML, status extracted

# Parse with any YAML library (Python, Node.js, Ruby)
python -c "import yaml; print(yaml.safe_load(open('test_dir/README.md').read().split('---')[1]))"
# Expected: Dict with keys: type, directory, status, etc.
```

### Integration Test

**End-to-End Workflow:**
```bash
# 1. Start task in new directory
mkdir src/new_feature
scripts/readme_init.sh src/new_feature AFP-E2E-TEST

# 2. Make changes
echo "console.log('test');" > src/new_feature/index.ts
git add src/new_feature/index.ts

# 3. Try commit without updating README
git commit -m "add feature"
# Expected: Blocked

# 4. Update README
scripts/readme_update.sh src/new_feature AFP-E2E-TEST
git add src/new_feature/README.md

# 5. Commit succeeds
git commit -m "add feature"
# Expected: Success

# 6. Verify README valid
cat src/new_feature/README.md | head -20
# Expected: Valid structure, recent changes present
```

## Risk Mitigation

### Risk: README Merge Conflicts
**Mitigation:**
- Recent Changes section is append-only
- Each task gets unique timestamp
- Use git's sequential conflict resolution

### Risk: Script Portability (macOS vs Linux)
**Mitigation:**
- Use POSIX-compliant bash
- Avoid GNU-specific flags (e.g., `sed -i` with extension on macOS)
- Test on both platforms

### Risk: YAML Parsing Errors
**Mitigation:**
- Validate frontmatter syntax in pre-commit hook
- Use strict YAML subset (no complex types)
- Provide error messages with fix instructions

## Files to Create/Modify

**Create (5 files, ~250 LOC):**
1. `docs/templates/readme_template.md` (~50 LOC)
2. `scripts/readme_init.sh` (~60 LOC)
3. `scripts/readme_update.sh` (~80 LOC)
4. `scripts/readme_lib.sh` (~20 LOC)
5. `docs/workflows/README_SYNC.md` (~40 LOC documentation)

**Modify (2 files, ~10 LOC):**
1. `.git/hooks/pre-commit` (~40 LOC append)
2. `MANDATORY_WORK_CHECKLIST.md` (~10 LOC checklist items)

**Total:** ~260 LOC + 40 LOC docs = **~300 LOC**

## Success Criteria

- ✅ All scripts pass shellcheck
- ✅ All 4 functional tests pass
- ✅ End-to-end workflow succeeds
- ✅ READMEs machine-parsable (YAML frontmatter valid)
- ✅ Pre-commit hook enforces README freshness
- ✅ Documentation updated

---

**PLAN Phase Complete**
**Next:** THINK (edge cases and failure modes)
