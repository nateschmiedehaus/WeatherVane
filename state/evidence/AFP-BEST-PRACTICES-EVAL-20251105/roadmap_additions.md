# Recommended Roadmap Additions - Best Practices Evaluation

**Date:** 2025-11-05
**Based on:** Best practices analysis from https://rosmur.github.io/claudecode-best-practices/

---

## Universal Practices (All Agents)

### HIGH PRIORITY

#### 1. Enhanced Evidence Template
**ID:** AFP-EVIDENCE-TEMPLATE-ENHANCEMENT
**Dependencies:** None
**LOC:** ~50 (template files)
**ROI:** Better session resume + clarity

**Description:**
Add `tasks.md` and `context.md` to evidence bundle template:
- `tasks.md`: Checklist of work items (like todo list)
- `context.md`: Key decisions and important files

**Exit Criteria:**
- [ ] Template includes tasks.md with checklist format
- [ ] Template includes context.md for decisions
- [ ] Updated docs/templates/evidence_template/

**Priority:** HIGH (quick win, immediate value)

---

#### 2. Visual Reference Workflow Documentation
**ID:** AFP-VISUAL-REFERENCE-WORKFLOW
**Dependencies:** None
**LOC:** ~100 (documentation only)
**ROI:** Better UI quality through iteration

**Description:**
Document workflow for using screenshot tools:
1. Provide visual mock/design
2. Implement in code
3. Capture screenshot (screenshot_capture or screenshot_session)
4. Compare and iterate (typically 2-3 rounds)

**Exit Criteria:**
- [ ] Workflow documented in CLAUDE.md
- [ ] Examples of screenshot-driven iteration
- [ ] Integration with design_system critic

**Priority:** HIGH (tools already available, just need workflow)

---

#### 3. Test-and-Fix Loop in Pre-Commit Hooks
**ID:** AFP-TEST-FIX-LOOP-HOOKS
**Dependencies:** None
**LOC:** ~100 (hook enhancement)
**ROI:** Prevents 100% of bad commits

**Description:**
Enhance pre-commit hook with test-and-fix loop:
- Create `/tmp/agent-pre-commit-pass` marker file
- Force iterative fixes until all checks pass (build + tests + audit)
- Block commit until marker exists

**Exit Criteria:**
- [ ] Hook implements test-and-fix loop
- [ ] Documented in pre-commit hook
- [ ] Tested with intentional failures

**Priority:** HIGH (enforcement improvement)

---

### MEDIUM PRIORITY

#### 4. TDD Workflow Formalization
**ID:** AFP-TDD-WORKFLOW-FORMAL
**Dependencies:** None
**LOC:** ~50 (documentation)
**ROI:** Better code quality

**Description:**
Formalize TDD sequence in MANDATORY_WORK_CHECKLIST.md:
1. Write tests BEFORE implementation
2. Confirm tests fail
3. Commit tests separately
4. Implement until tests pass
5. NEVER modify tests during implementation

**Exit Criteria:**
- [ ] TDD sequence added to checklist
- [ ] Enforcement via pre-commit reminder
- [ ] Integration with VERIFY phase

**Priority:** MEDIUM (already partially done via VERIFY phase)

---

#### 5. Utility Scripts Library
**ID:** AFP-UTILITY-SCRIPTS
**Dependencies:** None
**LOC:** ~200 (scripts)
**ROI:** Faster execution, no wheel reinvention

**Description:**
Create library of ready-to-use utility scripts:
- test-auth-route.js (authentication testing)
- format-code.sh (manual formatting between sessions)
- check-quality.sh (comprehensive quality check)

**Exit Criteria:**
- [ ] Scripts created in tools/scripts/
- [ ] Documentation for each script
- [ ] Used in at least 3 workflows

**Priority:** MEDIUM (nice-to-have, accumulate over time)

---

## Claude-Specific Practices

### HIGH PRIORITY (Claude sessions only)

#### 6. Skills System with Auto-Activation
**ID:** AFP-CLAUDE-SKILLS-SYSTEM
**Dependencies:** None
**LOC:** ~300 (hook + skill-rules.json + example skills)
**ROI:** 40-60% token savings (CRITICAL for Claude)

**Description:**
Implement Skills System with hook-based auto-activation:
- UserPromptSubmit hook analyzes prompt for keywords
- Automatically activates relevant skills
- skill-rules.json defines trigger conditions
- Progressive disclosure (main <500 lines + resource files)

**Exit Criteria:**
- [ ] Hook-based auto-activation working
- [ ] skill-rules.json with trigger patterns
- [ ] 3-5 example skills created
- [ ] Token usage measured (expect 40-60% savings)

**Priority:** HIGH for Claude, N/A for Codex

**Codex Alternative:** Progressive disclosure in CLAUDE.md (manual)

---

### MEDIUM PRIORITY (Claude sessions only)

#### 7. /catchup Slash Command
**ID:** AFP-CLAUDE-CATCHUP-COMMAND
**Dependencies:** None
**LOC:** ~50 (slash command)
**ROI:** Fast context recovery

**Description:**
Add /catchup slash command for quick session resume:
- Reads summary.md from evidence bundle
- Provides condensed context
- Enables fast restart after /clear

**Exit Criteria:**
- [ ] /catchup command implemented
- [ ] Integrated with evidence bundles
- [ ] Documented in CLAUDE.md

**Priority:** MEDIUM for Claude, N/A for Codex

---

## Lower Priority (Future Consideration)

8. **Git Worktrees Pattern** (parallel work isolation) - Complex, evaluate need first
9. **PM2 Integration** (backend log access) - Optional tooling
10. **Headless Mode Patterns** (CI/CD) - Not aligned with interactive process

---

## Implementation Strategy

**Phase 1 (Immediate - Next Session):**
- Enhanced Evidence Template
- Visual Reference Workflow Documentation
- Test-and-Fix Loop Enhancement

**Phase 2 (Claude-specific - If using Claude):**
- Skills System with Auto-Activation
- /catchup Slash Command

**Phase 3 (Gradual - Over Time):**
- TDD Workflow Formalization
- Utility Scripts Library

---

## Success Metrics

**Before:**
- Token usage per session: baseline
- Test quality: 7/7 dimensions manual
- Session resume time: slow

**After:**
- Token usage (Claude): -40-60% with skills
- Test quality: improved with property-based tests
- Session resume time: fast with tasks.md/context.md
- Commit quality: 100% passing tests (test-and-fix loop)

---

**Prepared by:** Claude Council
**Date:** 2025-11-05
**Status:** Ready for integration into roadmap.yaml
