# PLAN: FIX-META-TEST-MANUAL-SESSIONS

**Task ID**: FIX-META-TEST-MANUAL-SESSIONS
**Date**: 2025-10-30
**Strategic Approach**: Universal standards + context-specific enforcement

---

## Implementation Tasks

### Task 1: Update VERIFICATION_LEVELS.md Introduction (AC1)

**Objective**: Clarify that standards apply to all code changes (not just autopilot)

**Changes Required**:
1. Update introduction section (lines 1-15)
2. Add explicit statement: "applies to all code changes regardless of workflow"
3. Separate "Core Taxonomy" (universal) from "Autopilot Integration" (workflow-specific)
4. Remove autopilot-centric framing from Level 1-4 descriptions

**File**: `docs/autopilot/VERIFICATION_LEVELS.md`

**Estimated Time**: 15 minutes

**Dependencies**: None

**Verification**:
```bash
grep -i "manual\|all code changes\|regardless of workflow" docs/autopilot/VERIFICATION_LEVELS.md | head -5
```

---

### Task 2: Create Lightweight Checklist (AC3)

**Objective**: Provide simple template for manual session verification

**Deliverable**: `docs/autopilot/MANUAL_SESSION_VERIFICATION.md` (≤500 words)

**Content Structure**:
1. Introduction (when to use this)
2. Quick checklist template (copy-paste markdown)
3. Minimal documentation requirements
4. Link to full VERIFICATION_LEVELS.md for reference
5. Note: "Not for autopilot - use full WORK_PROCESS.md"

**Template Sections**:
- Verification Level Achieved (checkboxes)
- What Was Tested (Level 2)
- What Was NOT Tested (Level 3)
- Deferral Justification (if Level 3 deferred)

**Estimated Time**: 30 minutes

**Dependencies**: None (can be done in parallel with Task 1)

**Verification**:
```bash
wc -w docs/autopilot/MANUAL_SESSION_VERIFICATION.md  # Should be ≤500 words
test -f docs/autopilot/MANUAL_SESSION_VERIFICATION.md && echo "✅ File exists"
```

---

### Task 3: Add Manual Session Examples (AC5)

**Objective**: Provide realistic examples of manual session verification

**Deliverables**: 3 examples (either in MANUAL_SESSION_VERIFICATION.md or separate files)

**Examples Required**:
1. **Quick Bug Fix** (Level 2, Level 3 deferred)
   - Task: Fix typo in error message
   - Shows: Low-risk deferral justification

2. **User-Requested Feature** (Level 2-3 achieved)
   - Task: Add new UI component
   - Shows: Full verification with integration testing

3. **Exploration/PoC** (Level 1-2, Level 3 deferred)
   - Task: Prototype new algorithm
   - Shows: PoC-specific deferral (not production code)

**Format**: Each example shows filled-out lightweight checklist

**Estimated Time**: 20 minutes (all 3 examples)

**Dependencies**: Task 2 (need checklist template first)

**Verification**:
```bash
# Check examples exist
grep -c "Example:" docs/autopilot/MANUAL_SESSION_VERIFICATION.md  # Should be ≥3
```

---

### Task 4: Add CLAUDE.md Section (AC2)

**Objective**: Add "Verification Levels for Manual Sessions" section to CLAUDE.md

**Changes Required**:
1. Add new section 7.8 (or renumber if needed)
2. Explain when/how to use verification standards in manual sessions
3. Link to MANUAL_SESSION_VERIFICATION.md
4. Provide guidance: "Document level achieved, but no full STRATEGIZE→MONITOR required"

**File**: `CLAUDE.md`

**Location**: After section 7.7 (or as new section before section 8)

**Content**:
```markdown
## 7.8) Verification Levels for Manual Sessions (Outside Autopilot)

**When this applies**: Working outside structured autopilot workflow (one-off fixes, user requests, explorations)

**Requirement**: Still document verification level achieved, but WITHOUT full STRATEGIZE→MONITOR evidence structure

**How to document**:
- Use lightweight checklist: [MANUAL_SESSION_VERIFICATION.md](docs/autopilot/MANUAL_SESSION_VERIFICATION.md)
- Minimum: Level achieved, what tested, what not tested, deferral justification
- Optional: Create evidence in state/evidence/ if significant work

**Key principle**: Same quality standards (Level 1-4), lighter process

**See**: [VERIFICATION_LEVELS.md](docs/autopilot/VERIFICATION_LEVELS.md) for level definitions
```

**Estimated Time**: 10 minutes

**Dependencies**: Task 2 (need MANUAL_SESSION_VERIFICATION.md to link to)

**Verification**:
```bash
grep -n "Manual Sessions\|7.8" CLAUDE.md | head -3
```

---

### Task 5: Update WORK_PROCESS.md Introduction (AC4)

**Objective**: Clarify WORK_PROCESS.md scope (autopilot workflow, not manual sessions)

**Changes Required**:
1. Update introduction (lines 1-20)
2. Add note: "This document describes autopilot workflow. For manual sessions, see [MANUAL_SESSION_VERIFICATION.md]"
3. Clarify: Process steps (STRATEGIZE→MONITOR) are autopilot-specific
4. Note: Quality standards (Level 1-4) are universal

**File**: `docs/autopilot/WORK_PROCESS.md`

**Location**: Introduction section (before "## The Work Process" heading)

**Content Addition**:
```markdown
**Scope**: This document describes the structured autopilot workflow. If you're working in a manual Claude session (outside autopilot), see [MANUAL_SESSION_VERIFICATION.md](docs/autopilot/MANUAL_SESSION_VERIFICATION.md) for a lightweight verification checklist.

**Universal Standards**: Verification levels (Level 1-4) apply to all code changes regardless of workflow. The STRATEGIZE→MONITOR process is autopilot-specific, but the quality gates (Level 1 for IMPLEMENT, Level 2 for VERIFY, Level 3 for REVIEW) are universal.
```

**Estimated Time**: 10 minutes

**Dependencies**: Task 2 (need MANUAL_SESSION_VERIFICATION.md to link to)

**Verification**:
```bash
head -30 docs/autopilot/WORK_PROCESS.md | grep -i "manual\|autopilot-specific"
```

---

### Task 6: Consistency Check (AC6, Optional)

**Objective**: Verify no conflicting guidance across docs

**Checks Required**:
1. Level 1-4 definitions match in all docs
2. Phase gate requirements consistent (Level 1/2/3)
3. Deferral criteria same for autopilot and manual
4. No implication of different quality bars

**Files to Check**:
- docs/autopilot/VERIFICATION_LEVELS.md
- docs/autopilot/MANUAL_SESSION_VERIFICATION.md
- docs/autopilot/WORK_PROCESS.md
- CLAUDE.md

**Method**: Manual review + grep checks

**Estimated Time**: 15 minutes

**Dependencies**: Tasks 1-5 complete

**Verification**:
```bash
# Check Level 1 definition matches
grep "Level 1:" docs/autopilot/VERIFICATION_LEVELS.md
grep "Level 1:" docs/autopilot/MANUAL_SESSION_VERIFICATION.md
grep "Level 1:" CLAUDE.md

# All should describe "Compilation" or "syntax valid"
```

---

## Task Dependencies

```
Task 1 (Update VERIFICATION_LEVELS.md) → No dependencies
Task 2 (Create lightweight checklist) → No dependencies
Task 3 (Add examples) → Depends on Task 2
Task 4 (Update CLAUDE.md) → Depends on Task 2
Task 5 (Update WORK_PROCESS.md) → Depends on Task 2
Task 6 (Consistency check) → Depends on Tasks 1-5
```

**Parallelizable**: Tasks 1 and 2 can be done in parallel

**Sequential**: Task 3, 4, 5 depend on Task 2

---

## Implementation Sequence

### Phase 1: Core Documents (Parallel)
1. Task 1: Update VERIFICATION_LEVELS.md introduction
2. Task 2: Create MANUAL_SESSION_VERIFICATION.md

### Phase 2: Integration (Sequential after Phase 1)
3. Task 3: Add 3 examples to MANUAL_SESSION_VERIFICATION.md
4. Task 4: Add section to CLAUDE.md (links to MANUAL_SESSION_VERIFICATION.md)
5. Task 5: Update WORK_PROCESS.md introduction (links to MANUAL_SESSION_VERIFICATION.md)

### Phase 3: Verification (After Phase 2)
6. Task 6: Consistency check across all docs

---

## Estimated Total Time

- Task 1: 15 min
- Task 2: 30 min
- Task 3: 20 min
- Task 4: 10 min
- Task 5: 10 min
- Task 6: 15 min

**Total**: ~100 minutes (1.7 hours)

**With thinking/review**: ~2 hours

---

## Files to Modify

**Created** (1 file):
- docs/autopilot/MANUAL_SESSION_VERIFICATION.md

**Modified** (3 files):
- docs/autopilot/VERIFICATION_LEVELS.md (introduction)
- docs/autopilot/WORK_PROCESS.md (introduction)
- CLAUDE.md (new section 7.8)

**Total**: 1 created, 3 modified

---

## Rollback Plan

If changes cause confusion or issues:
1. Revert commits (git revert)
2. Original docs remain valid (we're adding, not replacing)
3. VERIFICATION_LEVELS.md still works for autopilot even without manual session guidance

**Risk**: LOW (additive changes, not breaking existing functionality)

---

## Next Phase: THINK (Pre-mortem and assumptions)
