# STRATEGIZE: FIX-META-TEST-MANUAL-SESSIONS

**Task ID**: FIX-META-TEST-MANUAL-SESSIONS
**Date**: 2025-10-30
**Source**: User feedback + META-TESTING-STANDARDS REVIEW (Recommendation 6, lines 323-326)

---

## Problem Statement (Surface Level)

**User request**: "there should also be a follow up task to make sure these standards apply to outside of autopilot work process as well"

**Gap identified**: VERIFICATION_LEVELS.md and WORK_PROCESS.md currently focus on autopilot workflow. May not be clear that standards apply to manual Claude sessions.

---

## Problem Reframing (Deep Thinking)

### Question the Problem

**Is this the right problem to solve?**

Surface problem: "Documentation doesn't say standards apply to manual sessions"

**Real problem**: Verification standards are seen as "autopilot-specific" rather than "universal quality requirements"

**Why this distinction matters**:
- Autopilot operates 24/7 autonomously → needs strict gates
- Manual sessions are human-guided → could be seen as "exempt"
- But both produce production code → both need same quality bar

**Root cause**: Standards were created in context of solving autopilot false completions (IMP-35), so framing is autopilot-centric

### Reframe the Goals

**What are we actually trying to achieve?**

NOT: "Make docs say 'applies to manual sessions too'"

ACTUALLY: "Ensure every code change (autopilot or manual) meets minimum verification standards"

**Deeper goal**: Create a culture where "Level 2 minimum" is universal, not workflow-specific

### What's the Elegant Solution?

**Option 1 (Surface fix)**: Add note "applies to manual sessions"
- Pros: Quick, addresses literal user request
- Cons: Doesn't address cultural framing, feels like afterthought

**Option 2 (Reframe as universal)**: Rewrite standards as "Code Quality Gates" not "Autopilot Process"
- Pros: Universal framing, no "autopilot vs manual" distinction
- Cons: Large refactor, could confuse existing autopilot integration

**Option 3 (Dual-track with shared core)**: Keep autopilot integration, add parallel "Manual Session Quick Start"
- Pros: Respects different contexts (autopilot structured, manual flexible)
- Cons: Risk of divergence, "two versions of truth"

**Option 4 (Universal standards + context-specific enforcement)**:
- Standards doc is workflow-agnostic (VERIFICATION_LEVELS.md)
- Enforcement is workflow-specific (WORK_PROCESS.md for autopilot, lightweight checklist for manual)
- Pros: One source of truth, flexible enforcement
- Cons: Requires careful positioning

**CHOSEN**: Option 4 - Universal standards with context-specific enforcement

### Long-Term Considerations

**5-year vision**: All code changes (autopilot, manual, CI/CD, one-off scripts) go through same quality gates

**How to get there**:
1. Establish standards as universal (not autopilot-specific)
2. Provide lightweight enforcement for manual work
3. Eventually automate checks at git commit level (pre-commit hooks)

**What scales**: Shared principles (Level 1-4 taxonomy), not process steps (STRATEGIZE→MONITOR)

---

## Strategic Alternatives

### Alternative 1: "Applies to Manual Sessions" Note
**Approach**: Add single note to each doc: "These standards apply to both autopilot and manual Claude sessions"

**Pros**:
- Minimal change
- Addresses literal user request
- Fast to implement

**Cons**:
- Doesn't solve usability problem (autopilot process doesn't fit manual work)
- Standards still read as autopilot-centric
- Manual users won't read full WORK_PROCESS.md (too long)

**Kill trigger**: If >50% of manual sessions still lack verification level documentation after 30 days

### Alternative 2: Separate Manual Session Standards
**Approach**: Create MANUAL_WORK_VERIFICATION.md with manual-specific process

**Pros**:
- Tailored to manual workflow
- No confusion with autopilot process
- Can be shorter, more pragmatic

**Cons**:
- Two sources of truth → drift risk
- Implies different quality bars for autopilot vs manual
- Maintenance overhead

**Kill trigger**: If manual and autopilot standards diverge within 60 days

### Alternative 3: Universal Quick Reference + Deep Dive
**Approach**:
- Create 1-page VERIFICATION_QUICK_START.md (workflow-agnostic)
- Keep VERIFICATION_LEVELS.md as deep reference
- WORK_PROCESS.md remains autopilot-specific

**Pros**:
- Quick start serves both autopilot and manual users
- Deep reference for complex cases
- No duplication, single source of truth

**Cons**:
- Requires creating new doc
- Need to maintain consistency across 3 docs

**Kill trigger**: If quick start doc is ignored (no references in evidence)

### Alternative 4 (RECOMMENDED): Reposition + Lightweight Checklist
**Approach**:
1. Update VERIFICATION_LEVELS.md intro to clarify scope (universal, not autopilot-only)
2. Add section to CLAUDE.md: "Verification Levels for Manual Sessions"
3. Create lightweight checklist for manual work (not full STRATEGIZE→MONITOR)
4. Provide examples of verification documentation for manual sessions

**Pros**:
- Minimal refactoring
- Clear positioning (standards are universal)
- Practical guidance for manual workflow
- Maintains single source of truth

**Cons**:
- Requires careful messaging (don't dilute autopilot integration)

**Why this wins**: Addresses root problem (universal standards) while respecting workflow differences

---

## Why Now?

**Timing**: User feedback came during META-TESTING-STANDARDS REVIEW phase → perfect time to course-correct before standards are widely adopted

**Urgency**: If we don't clarify now, manual sessions will continue without verification standards, creating quality gap

**Risk of waiting**: Standards become "autopilot thing", manual work becomes second-class citizen

---

## Strategic Worthiness

### Why is this worth doing?

**Problem severity**: MEDIUM
- Manual sessions produce production code
- No verification standards → same false completion risk as IMP-35
- But manual sessions are less frequent than autopilot loops

**Value**: Ensures consistent quality bar across all code changes

**Alternatives considered**: 4 alternatives evaluated (see above)

### Why NOT do this?

**Do Nothing** option:
- Let manual sessions operate without verification standards
- Risk: Quality gap between autopilot and manual work
- Cost: False completions in manual sessions, rework, bugs

**Why Do Nothing fails**: Manual sessions still produce production code → need same quality bar

---

## Success Metrics

**Short-term (30 days)**:
- 100% of manual sessions document verification level
- Zero false completions in manual sessions
- Lightweight checklist used in at least 5 manual sessions

**Medium-term (90 days)**:
- No quality gap between autopilot and manual work
- Manual session verification level documentation as rigorous as autopilot

**Long-term (6 months)**:
- All code changes (autopilot, manual, CI/CD) use same verification taxonomy

---

## Strategic Decision

**CHOSEN**: Alternative 4 - Reposition + Lightweight Checklist

**Rationale**:
1. Addresses root problem (standards seen as autopilot-only)
2. Respects workflow differences (structured autopilot vs flexible manual)
3. Maintains single source of truth (VERIFICATION_LEVELS.md)
4. Provides practical guidance (lightweight checklist)
5. Scalable to future workflows (CI/CD, scripts, etc.)

**Next**: SPEC phase - Define acceptance criteria for implementation

---

**Strategic Thinking Applied**:
- ✅ Questioned the problem (surface vs root cause)
- ✅ Reframed the goals (universal standards, not doc update)
- ✅ Explored alternatives (4 options evaluated)
- ✅ Considered long-term (5-year vision)
- ✅ Challenged requirements (user asked for note, we're doing comprehensive repositioning)
