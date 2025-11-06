# Specification: Automated Distributed Knowledge Base

**Task ID:** AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106
**Phase:** SPEC
**Date:** 2025-11-06

## Functional Requirements

### FR1: README Template Structure
**Requirement:** Standard README template with consistent sections

**Template Sections:**
```markdown
---
# Machine-parsable metadata (YAML frontmatter)
type: directory_readme
directory: [path/to/directory]
status: [new|in-progress|stable|deprecated]
last_updated: YYYY-MM-DD
owner: [Team/System/Agent]
dependencies: []
consumers: []
---

# [Directory Name]

**Status:** [new/in-progress/stable/deprecated]
**Last Updated:** YYYY-MM-DD
**Owner:** [Team/System/Agent]

## Purpose
[1-2 sentence description of what this directory does]

## Recent Changes (YYYY-MM-DD)

### [Task ID] - [Change Description]
- Files: [list of changed files]
- Impact: [low/medium/high]
- See: state/evidence/[TASK-ID]/

[Keep last 5 entries, archive older to CHANGELOG.md]

## Modules / Contents
[Table or bullet list of subdirectories/files with status]

## Integration Points
**Uses:** [Dependencies - what this directory imports/requires]
**Used by:** [Consumers - what imports/uses this directory]

## Navigation
- **Parent:** [../README.md](../README.md)
- **Children:** [subdir1/](subdir1/), [subdir2/](subdir2/)
- **Neighbors:** [../neighbor/](../neighbor/)

## See Also
- [Related docs]
- [Evidence bundles]
```

**Acceptance Criteria:**
- ✅ Template file exists at `docs/templates/readme_template.md`
- ✅ All required sections present
- ✅ Examples provided for each section
- ✅ Variables clearly marked (e.g., [Directory Name])

### FR2: Automatic README Initialization
**Requirement:** Create README from template when starting work in directory without one

**Behavior:**
```bash
# When: Task starts (STRATEGIZE phase)
# Check: Does ./README.md exist in working directory?
# If NO: Generate from template with placeholders filled
# If YES: Read and display summary for agent context
```

**Auto-Fill Rules:**
- `[Directory Name]` → Extract from directory path
- `**Status:**` → Default to "in-progress"
- `**Last Updated:**` → Current date
- `**Owner:**` → "WeatherVane Autopilot" (default)
- `## Purpose` → Placeholder: "[TODO: Add purpose]"
- Other sections → Empty with structure preserved

**Acceptance Criteria:**
- ✅ Script detects missing README
- ✅ Generates valid README from template
- ✅ Placeholders auto-filled correctly
- ✅ Agent can edit Purpose before committing

### FR3: Automatic README Update
**Requirement:** Update README "Recent Changes" section when task completes

**Behavior:**
```bash
# When: Task ends (VERIFY/REVIEW phase)
# Action: Append to "Recent Changes" section
# Format:
### [TASK-ID] - [Change Summary]
- Files: [auto-detected from git diff]
- Impact: [agent selects: low/medium/high]
- See: state/evidence/[TASK-ID]/
```

**Auto-Detection:**
- Files changed: `git diff --name-only HEAD`
- Task ID: Extracted from evidence bundle path
- Timestamp: Current date

**Acceptance Criteria:**
- ✅ Detects task completion
- ✅ Appends new entry to Recent Changes
- ✅ Preserves existing entries
- ✅ Limits to last 5 entries (moves older to CHANGELOG.md)

### FR4: Parent README Propagation
**Requirement:** Bubble major changes to parent README

**Propagation Rules:**
```
Major changes (propagate to parent):
- New module/directory added
- Module deprecated/removed
- Breaking API change
- Status change (in-progress → stable, stable → deprecated)

Minor changes (stay local):
- Bug fixes
- Internal refactoring
- Documentation improvements
- Test additions
```

**Parent Update Format:**
```markdown
## Subdirectories

- `prove/` - Proof-driven development system
  - Status: ✅ Complete (3 layers)
  - Recent: Layer 3 production feedback added (2025-11-06)

- `wave0/` - Autonomous autopilot runner
  - Status: ✅ Proof-enabled
  - Recent: Parser fixed, proof integrated (2025-11-06)
```

**Acceptance Criteria:**
- ✅ Detects major vs minor changes
- ✅ Updates parent README for major changes
- ✅ Preserves parent's existing content
- ✅ Agent can override propagation decision

### FR5: Pre-Commit README Freshness Check
**Requirement:** Enforce README updates before committing code changes

**Check Logic:**
```bash
# For each directory with changed files:
# 1. Does README.md exist?
# 2. Is README.md "Last Updated" within 24 hours?
# 3. Are changed files mentioned in Recent Changes?

# If ANY check fails → Block commit + display message
```

**Error Messages:**
```
❌ README out of sync in: src/prove/
   - Files changed but README not updated
   - Run: scripts/readme_update.sh src/prove

❌ README missing in: src/new_feature/
   - Run: scripts/readme_init.sh src/new_feature
```

**Acceptance Criteria:**
- ✅ Detects README staleness
- ✅ Blocks commit if out of sync
- ✅ Provides clear fix instructions
- ✅ Allows override with --no-verify (for emergencies)

## Non-Functional Requirements

### NFR1: Performance
**Requirement:** README operations complete in <2 seconds

**Constraints:**
- Template generation: <100ms
- Update append: <50ms
- Freshness check: <500ms (even with 100+ changed files)

**Rationale:** Don't slow down development workflow

### NFR2: Reliability
**Requirement:** README automation never loses data

**Guarantees:**
- Atomic updates (write to temp file, then move)
- Backup before modification
- Rollback on error
- Idempotent operations

### NFR3: Maintainability
**Requirement:** Scripts are simple bash, easy to modify

**Constraints:**
- Pure bash (no Python/Node.js dependencies)
- <200 LOC per script
- Commented with examples
- Tested with shellcheck

### NFR4: Portability
**Requirement:** Works on macOS and Linux

**Constraints:**
- POSIX-compliant bash
- No GNU-specific extensions
- Test on both macOS and Ubuntu

### NFR5: Observability
**Requirement:** README operations are logged

**Log Format:**
```
[2025-11-06T12:34:56Z] README_INIT src/new_feature/ SUCCESS
[2025-11-06T12:45:23Z] README_UPDATE src/prove/ SUCCESS task=AFP-PROOF-123
[2025-11-06T12:50:11Z] README_PROPAGATE src/prove/ -> src/ SKIPPED reason=minor_change
```

**Log Location:** `state/analytics/readme_sync.log`

## Success Criteria

### Functional Success
- ✅ 100% of source directories have README.md
- ✅ 95%+ READMEs updated within 24h of changes
- ✅ 0 pre-commit failures due to forgotten README updates
- ✅ Navigation links work (0 broken links)

### Behavioral Success
- ✅ Agents read local README before starting (observable in workflow)
- ✅ Agents spend <1 min finding recent changes (vs 5-10 min before)
- ✅ New agents onboard to directory in <5 min (vs 20+ min before)

### Quality Success
- ✅ README "Recent Changes" sections have meaningful descriptions
- ✅ READMEs follow template structure consistently
- ✅ Integration points are accurate

## Out of Scope (For This Task)

- ❌ Full CHANGELOG.md generation (separate task)
- ❌ Multi-language support (only English)
- ❌ Visual README linter (nice-to-have future)
- ❌ README search/index (git grep is sufficient)
- ❌ Automated "Purpose" generation (requires human context)

## Dependencies

**Required:**
- Git (for file change detection)
- Bash 4.0+ (for associative arrays)
- Standard Unix tools (sed, awk, grep, date)

**Optional:**
- shellcheck (for script validation)
- prettier (for markdown formatting)

---

**SPEC Phase Complete**
**Next:** PLAN (design scripts and integration)
