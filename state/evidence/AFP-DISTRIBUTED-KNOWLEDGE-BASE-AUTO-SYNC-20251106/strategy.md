# Strategy: Automated Distributed Knowledge Base (README Sync)

**Task ID:** AFP-DISTRIBUTED-KNOWLEDGE-BASE-AUTO-SYNC-20251106
**Phase:** STRATEGIZE
**Date:** 2025-11-06

## Problem Statement

**Current Pain Points:**
1. **Manual README updates** - Agents must remember to update READMEs after changes
2. **Stale documentation** - READMEs become outdated immediately after task completion
3. **Centralized knowledge** - Information lives in `state/evidence/` but not where code lives
4. **Agent inefficiency** - Agents waste time searching for recent changes instead of reading local context
5. **No enforcement** - README sync is optional, not mandatory in work process

**Root Cause:**
README sync is a **manual afterthought**, not an **automated phase artifact**.

## Vision: Decentralized Knowledge Graph

**Goal:** Every directory is a **self-documenting knowledge node** that:
- **Knows its purpose** (what this directory does)
- **Knows its current state** (recent changes, status)
- **Knows its neighbors** (parent, children, integration points)
- **Updates automatically** (at task boundaries)

**Result:** Agents navigate like a graph, not a hierarchy. No central index needed.

## AFP/SCAS Analysis

### Via Negativa: What Can We DELETE?

**Delete:**
- ❌ Manual README updates (replace with automation)
- ❌ "Remember to update docs" reminders (structure enforces it)
- ❌ Stale information (auto-refresh at task boundaries)
- ❌ Centralized documentation searches (knowledge is local)

**Keep:**
- ✅ README files (they work, just need automation)
- ✅ Evidence bundles (different purpose - proof, not navigation)

### Simplicity: Simplest Automation That Works

**Design Principles:**
1. **Trigger-based, not polling** - Update on task boundaries (STRATEGIZE start, VERIFY end)
2. **Template-driven** - READMEs follow standard structure
3. **Incremental, not full rewrite** - Only update "Recent Changes" section
4. **Local-first** - Each directory manages its own README
5. **Propagation rules** - Changes bubble up hierarchy (local → parent → root)

### Clarity: Self-Documenting Structure

**README Template:**
```markdown
# [Directory Name]

**Status:** [new/in-progress/stable/deprecated]
**Last Updated:** YYYY-MM-DD
**Owner:** [Team/System]

## Purpose
[What this directory does in 1-2 sentences]

## Recent Changes (YYYY-MM-DD)
[Latest 3-5 changes with task IDs]

## Modules/Subdirectories
[Table or list with status]

## Integration Points
**Uses:** [Dependencies]
**Used by:** [Consumers]

## Navigation
- **Parent:** ../README.md
- **Children:** subdir1/, subdir2/
- **Neighbors:** ../neighbor/

## See Also
- Evidence: state/evidence/[TASK-ID]/
```

### Autonomy: Works Without Manual Intervention

**Automation Hooks:**
1. **Task Start (STRATEGIZE):**
   - Check: `./README.md` exists?
   - If NO → Generate from template
   - If YES → Read for context

2. **Task End (VERIFY/REVIEW):**
   - Update local README "Recent Changes"
   - Propagate to parent if major change
   - Commit with task artifacts

3. **Enforcement:**
   - Pre-commit hook checks: README updated in changed directories?
   - VERIFY phase: Fails if README out of sync

### Sustainability: Low Maintenance Overhead

**Design for Low Cost:**
- READMEs are **incremental** (append to "Recent Changes", not full rewrite)
- Updates are **localized** (only touched directories)
- Templates are **version-controlled** (docs/templates/readme_template.md)
- Automation is **simple** (bash scripts + git hooks, not complex framework)

### Antifragility: Gets Better With More Use

**Positive Feedback Loops:**
- More tasks → More README updates → Better navigation
- Agents use READMEs → Find issues → Improve templates
- Stale READMEs → Agents confused → Automation improves
- Production failures → README documents learnings → Future agents avoid issues

## Strategic Options (Considered)

### Option 1: Fully Automated (AST-Based)
**Approach:** Parse code files, auto-generate READMEs from docstrings/exports

**Pros:**
- Most automated
- Always in sync with code

**Cons:**
- ❌ High complexity (AST parsing for TS/JS/Python/etc)
- ❌ Misses context (code structure ≠ purpose/strategy)
- ❌ Hard to maintain across language changes
- ❌ Over-engineering for the problem

**Verdict:** ❌ Too complex, misses the point (purpose > code structure)

### Option 2: Template + Manual (Status Quo)
**Approach:** Provide templates, agents manually update

**Pros:**
- Simple implementation
- Flexible content

**Cons:**
- ❌ Not enforced (agents forget)
- ❌ Inconsistent quality
- ❌ Stale immediately

**Verdict:** ❌ Current broken state

### Option 3: Template + Hook-Triggered (RECOMMENDED)
**Approach:** Templates + automation at task boundaries (STRATEGIZE/VERIFY)

**Pros:**
- ✅ Enforced by work process (can't skip)
- ✅ Simple (bash scripts + git hooks)
- ✅ Captures human context (agents write "Recent Changes")
- ✅ Scales (only updates changed directories)
- ✅ AFP-aligned (via negativa, simplicity, autonomy)

**Cons:**
- Requires git discipline (commit after each phase)
- Requires template maintenance (but version-controlled)

**Verdict:** ✅ **Best balance of automation + context**

## Recommended Strategy: Template + Hook-Triggered

### Implementation Plan (High-Level)

**1. Templates (Via Negativa)**
- Create `docs/templates/readme_template.md`
- Delete old scattered documentation patterns

**2. Initialization Script (STRATEGIZE Hook)**
```bash
# scripts/readme_init.sh
# Called at task start
# If README missing in working dir → generate from template
```

**3. Update Script (VERIFY Hook)**
```bash
# scripts/readme_update.sh
# Called at task end
# Append to "Recent Changes" section
# Propagate to parent if major change
```

**4. Enforcement (Pre-Commit Hook)**
```bash
# .git/hooks/pre-commit
# Check: Changed dirs have updated READMEs?
# Block commit if out of sync
```

**5. Integration with Work Process**
- Update `MANDATORY_WORK_CHECKLIST.md`
- Add README checks to STRATEGIZE and VERIFY phases

### Success Criteria

**Structural:**
- ✅ Every source directory has README.md
- ✅ READMEs follow template structure
- ✅ "Recent Changes" updated within 24h of task completion

**Behavioral:**
- ✅ Agents read local README before starting work (observable in logs)
- ✅ Agents don't waste time searching for recent changes
- ✅ Navigation links work (no 404s)

**Quality:**
- ✅ 90%+ READMEs up-to-date (checked by script)
- ✅ 0 pre-commit hook failures due to forgotten updates
- ✅ Agents report faster onboarding to new directories

## Risks & Mitigations

### Risk 1: README Quality Degrades
**Scenario:** Agents write lazy "Updated stuff" in Recent Changes

**Mitigation:**
- Template enforces structure (task ID, files changed, purpose)
- Pre-commit hook validates format
- Periodic README quality audit (monthly)

### Risk 2: Propagation Overhead
**Scenario:** Every change bubbles up, pollutes parent READMEs

**Mitigation:**
- Only "major changes" propagate (new feature, breaking change, deprecation)
- Parent READMEs summarize, don't duplicate
- Recent Changes limited to last 5 entries (older moves to CHANGELOG)

### Risk 3: Merge Conflicts
**Scenario:** Multiple agents update same README simultaneously

**Mitigation:**
- README updates are additive (append to Recent Changes)
- Use task IDs to avoid conflicts (each task gets unique timestamp)
- Git handles append-only conflicts well

### Risk 4: Template Evolution
**Scenario:** Template changes, existing READMEs become inconsistent

**Mitigation:**
- Template versioned in git (docs/templates/readme_template.md)
- Migration script when template changes (one-time update all READMEs)
- Gradual updates okay (not all-or-nothing)

## AFP/SCAS Compliance Checklist

- [x] **Via Negativa:** Deletes manual updates, stale docs, search overhead
- [x] **Simplicity:** Templates + bash scripts, no complex framework
- [x] **Clarity:** Standard structure, self-documenting navigation
- [x] **Autonomy:** Works automatically at task boundaries
- [x] **Sustainability:** Low maintenance, incremental updates
- [x] **Antifragility:** Gets better with use, failures improve templates

## Next Steps (SPEC Phase)

1. Define README template structure (sections, format)
2. Specify trigger points (when to init, when to update)
3. Define propagation rules (what bubbles up, what stays local)
4. Design enforcement mechanism (pre-commit hook details)
5. Create proof criteria (how to verify it works)

---

**Strategic Decision:** Template + Hook-Triggered approach
**Confidence:** High (AFP-aligned, proven pattern, low risk)
**Estimated LOC:** ~200 (templates + scripts + hooks)
**Estimated Time:** 1-2 tasks (design + implementation)
