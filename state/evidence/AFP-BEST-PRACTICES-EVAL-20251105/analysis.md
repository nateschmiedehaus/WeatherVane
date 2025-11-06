# Best Practices Evaluation - AFP/SCAS Alignment Analysis

**Date:** 2025-11-05
**Source:** https://rosmur.github.io/claudecode-best-practices/
**Evaluator:** Claude Council
**Framework:** AFP Five Forces + SCAS Principles

---

## Executive Summary

Evaluated 20+ best practices from community collation. **High alignment with AFP/SCAS**: 7 practices with immediate ROI. **Medium alignment**: 6 practices for roadmap. **Low priority**: 7 already implemented or low ROI.

**Critical finding:** Skills System with auto-activation delivers 40-60% token efficiency improvement while aligning with EVOLUTION and ECONOMY principles.

**IMPORTANT - Model Specificity:**
- **Claude-specific**: Skills, Planning Mode, /catchup, slash commands
- **Universal (all agents)**: Property-based testing, TDD, quality gates, dev docs, visual references, git worktrees
- **Strategy**: Implement universal practices first; add model-specific variants where beneficial

---

## High Alignment Practices (Implement Immediately)

### 1. Skills System with Auto-Activation ⭐⭐⭐⭐⭐

**⚠️ CLAUDE-SPECIFIC** - Skills are a Claude Code feature not available in Codex

**What it is:**
- Hook-based auto-activation of skills based on prompt analysis
- Progressive disclosure (main CLAUDE.md <500 lines + resource files)
- skill-rules.json defining trigger conditions

**AFP/SCAS Alignment:**
- ✅ **EVOLUTION**: Self-activating based on context
- ✅ **ECONOMY**: 40-60% token efficiency improvement
- ✅ **VISIBILITY**: Clear triggering rules
- ✅ **COHERENCE**: Skills group related functionality

**ROI:** 40-60% token savings = **CRITICAL** (for Claude sessions)

**Codex Alternative:** Use CLAUDE.md documentation with progressive disclosure pattern (still valuable but manual activation)

**Status:** NOT IMPLEMENTED
**Action:** Add as Claude-specific task to roadmap

---

### 2. Property-Based Testing (fast-check) ⭐⭐⭐⭐

**What it is:**
- Test invariants rather than specific cases
- Generate hundreds of test cases automatically
- Example: `fc.assert(fc.property(fc.integer(), (n) => reverse(reverse(n)) === n))`

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Tests express invariants, not implementation details
- ✅ **VISIBILITY**: Clear what properties must hold
- ✅ **EVOLUTION**: Tests evolve with property discovery

**ROI:** Better test quality + fewer tests needed

**Status:** NOT IMPLEMENTED
**Action:** Add to UNIVERSAL_TEST_STANDARDS.md

---

### 3. Enhanced Quality Gates (Block-at-Submit) ⭐⭐⭐⭐

**What it is:**
- PreToolUse hook wrapping Bash(git commit)
- Check for `/tmp/agent-pre-commit-pass` file
- Force "test-and-fix" loop until all checks pass

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Centralized quality enforcement
- ✅ **VISIBILITY**: Clear pass/fail criteria
- ✅ **ECONOMY**: Prevents bad commits from entering history

**ROI:** Prevents 100% of bad commits

**Status:** PARTIALLY IMPLEMENTED (have pre-commit hooks)
**Action:** Add test-and-fix loop pattern

---

### 4. Dev Docs Alignment ⭐⭐⭐

**What it is:**
- Three-file pattern: `[task]-plan.md`, `[task]-context.md`, `[task]-tasks.md`
- Living documents updated during implementation
- Enable context-less resume

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Our evidence bundles already do this
- ✅ **VISIBILITY**: Plan/context/tasks separation
- ✅ **LOCALITY**: Task-scoped documentation

**Current State:** We have `strategy.md`, `spec.md`, `plan.md`, `think.md`, `design.md`, `summary.md`

**Gap:** No `tasks.md` checklist, no `context.md` for key decisions

**ROI:** Better session resume + clarity

**Status:** PARTIALLY IMPLEMENTED
**Action:** Add tasks.md and context.md to evidence template

---

### 5. Visual Reference Workflow ⭐⭐⭐

**What it is:**
- Iterate with screenshots: mock → code → screenshot → compare → iterate
- Use screenshot MCP tools for design validation

**AFP/SCAS Alignment:**
- ✅ **VISIBILITY**: Visual feedback loop
- ✅ **EVOLUTION**: Iterative improvement
- ✅ **COHERENCE**: Design and implementation stay aligned

**ROI:** Better UI quality

**Status:** TOOLS AVAILABLE (screenshot_capture, screenshot_session)
**Action:** Formalize workflow in CLAUDE.md

---

### 6. TDD Workflow Formalization ⭐⭐⭐

**What it is:**
- Write tests BEFORE implementation
- Confirm tests fail
- Commit tests separately
- Implement until tests pass
- NEVER modify tests during implementation

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Tests define contract
- ✅ **VISIBILITY**: Clear success criteria
- ✅ **ECONOMY**: Prevents implementation drift

**ROI:** Better code quality + fewer bugs

**Status:** PARTIALLY IMPLEMENTED (VERIFY phase exists)
**Action:** Formalize TDD sequence in MANDATORY_WORK_CHECKLIST.md

---

### 7. Planning Mode Formalization ⭐⭐⭐

**What it is:**
- Mandatory planning before coding
- Review alternatives (2-3 approaches)
- Document plan before implementation
- Use "think hard" for deeper analysis

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Our STRATEGIZE → GATE phases already do this
- ✅ **VISIBILITY**: Clear plan before code
- ✅ **EVOLUTION**: Alternatives considered

**ROI:** Better decisions

**Status:** IMPLEMENTED (AFP 10-phase process)
**Action:** None (already have this)

---

## Medium Alignment Practices (Add to Roadmap)

### 8. Aggressive Context Clearing ⭐⭐

**What it is:**
- Clear at 60k tokens or 30% context
- /catchup pattern for restart
- Document & Clear for complex tasks

**AFP/SCAS Alignment:**
- ✅ **ECONOMY**: Reduces context bloat
- ⚠️ **COHERENCE**: May lose important context

**ROI:** Context efficiency

**Status:** NOT IMPLEMENTED
**Action:** Add `/catchup` slash command to roadmap

---

### 9. Specification Documents ⭐⭐

**What it is:**
- Detailed specs reduce ambiguity
- Example: 500MB broken code → 30KB working with clear spec

**AFP/SCAS Alignment:**
- ✅ **COHERENCE**: Clear requirements
- ✅ **VISIBILITY**: Explicit expectations

**ROI:** Prevents thrashing

**Status:** IMPLEMENTED (spec.md in evidence)
**Action:** None (already have this)

---

### 10. Git Worktrees for Parallel Work ⭐⭐

**What it is:**
- Run multiple Claude instances on independent tasks
- Parallel branches without context switching

**AFP/SCAS Alignment:**
- ✅ **LOCALITY**: Isolated work
- ⚠️ **ECONOMY**: Adds complexity

**ROI:** Parallelism for independent tasks

**Status:** NOT IMPLEMENTED
**Action:** Add to roadmap (low priority)

---

### 11. Multi-Claude Verification ⭐⭐

**What it is:**
- Claude A writes, Claude B reviews (fresh context)
- Multiple perspectives on same code

**AFP/SCAS Alignment:**
- ✅ **VISIBILITY**: Multiple review layers
- ⚠️ **ECONOMY**: More token usage

**ROI:** Better review quality

**Status:** IMPLEMENTED (Critics already do this)
**Action:** None (already have this via critics)

---

### 12. Utility Scripts in Skills ⭐⭐

**What it is:**
- Attach ready-to-use scripts to skills
- Example: test-auth-route.js for Keycloak auth

**AFP/SCAS Alignment:**
- ✅ **ECONOMY**: No wheel reinvention
- ✅ **LOCALITY**: Scripts colocated with skills

**ROI:** Faster execution

**Status:** NOT IMPLEMENTED
**Action:** Add example scripts to skills

---

### 13. Background Process Management (PM2) ⭐

**What it is:**
- PM2 for backend service logs
- Claude can autonomously debug

**AFP/SCAS Alignment:**
- ✅ **VISIBILITY**: Log access
- ⚠️ **ECONOMY**: Extra tooling

**ROI:** Better debugging

**Status:** NOT IMPLEMENTED
**Action:** Add to roadmap (optional)

---

## Low Priority / Already Implemented

### 14. Monorepo Architecture ✅
**Status:** ALREADY IMPLEMENTED
**Action:** None

### 15. Error Handling Standards ✅
**Status:** ALREADY ENFORCED (hooks/critics)
**Action:** None

### 16. Type Safety ✅
**Status:** ALREADY IMPLEMENTED (TypeScript strict mode)
**Action:** None

### 17. Incremental Commits ✅
**Status:** ALREADY IMPLEMENTED (micro-batching)
**Action:** None

### 18. Simple Control Loops ✅
**Status:** ALREADY ALIGNED (no complex multi-agent systems)
**Action:** None

### 19. Code Review ✅
**Status:** ALREADY IMPLEMENTED (critics + human review)
**Action:** None

### 20. Headless Mode ❌
**Status:** NOT ALIGNED (we use interactive process)
**Action:** Skip

---

## Implementation Priority

### Immediate (This Session)
1. ✅ Create this analysis document
2. 🔄 Add Skills System implementation to roadmap
3. 🔄 Add Property-Based Testing to UNIVERSAL_TEST_STANDARDS.md
4. 🔄 Add test-and-fix loop to pre-commit hooks
5. 🔄 Add tasks.md + context.md to evidence template

### Roadmap (Future Tasks)
6. Dev Docs Template Enhancement
7. Visual Reference Workflow Documentation
8. TDD Workflow Formalization
9. /catchup Slash Command
10. Utility Scripts for Skills
11. Git Worktrees Pattern (optional)
12. PM2 Integration (optional)

---

## Key Insights

1. **Token efficiency is CRITICAL** - Skills auto-activation (40-60% savings) is the highest ROI practice
2. **We already align well with best practices** - 7/20 already implemented
3. **Property-based testing is underutilized** - Easy win for better test quality
4. **Evidence bundles map to dev docs** - Just need tasks.md and context.md
5. **Visual workflows are available but underused** - We have screenshot tools but no workflow

---

## Recommendations

### Critical Path
1. Implement Skills System with auto-activation (Task 5 of hierarchical work processes)
2. Add property-based testing to standards
3. Enhance evidence template with tasks.md and context.md

### Quick Wins
4. Document visual reference workflow
5. Add test-and-fix loop to hooks
6. Create example utility scripts

### Long-term
7. Formalize TDD sequence
8. Add /catchup command
9. Consider git worktrees for parallel work

---

**Prepared by:** Claude Council
**Date:** 2025-11-05
**Next Action:** Implement critical practices and add others to roadmap
