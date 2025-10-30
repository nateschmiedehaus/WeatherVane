# SPEC: FIX-META-TEST-MANUAL-SESSIONS

**Task ID**: FIX-META-TEST-MANUAL-SESSIONS
**Date**: 2025-10-30
**Strategic Decision**: Reposition standards as universal + create lightweight checklist for manual sessions

---

## Acceptance Criteria

### AC1: VERIFICATION_LEVELS.md Clarifies Universal Scope (MUST-HAVE)

**Requirement**: Update VERIFICATION_LEVELS.md introduction to explicitly state standards apply to all code changes (autopilot and manual)

**Success Criteria**:
- [ ] Introduction section explicitly says "applies to all code changes regardless of workflow"
- [ ] Clear statement: "Whether working in autopilot or manual Claude sessions, these verification levels define minimum quality standards"
- [ ] No autopilot-specific framing in core taxonomy (Level 1-4 descriptions)
- [ ] Autopilot integration moved to separate section (not in introduction)

**Verification**:
```bash
# Check introduction mentions manual sessions
grep -i "manual\|all code changes\|regardless of workflow" docs/autopilot/VERIFICATION_LEVELS.md | head -5
```

**Why this matters**: Sets correct framing - standards are universal, not autopilot-specific

---

### AC2: CLAUDE.md Has "Manual Sessions" Section (MUST-HAVE)

**Requirement**: Add section 7.8 (or similar) to CLAUDE.md: "Verification Levels for Manual Sessions"

**Success Criteria**:
- [ ] New section added to CLAUDE.md
- [ ] Section explains how to apply verification standards when NOT in autopilot
- [ ] Clear statement: "Even outside structured autopilot workflow, document verification level achieved"
- [ ] Links to lightweight checklist (AC3)
- [ ] Provides examples of manual session verification (AC5)

**Content Requirements**:
```markdown
## 7.8) Verification Levels for Manual Sessions

**When this applies**: Working outside autopilot loop (one-off fixes, explorations, user-requested tasks)

**Requirement**: Still document verification level achieved, but without full STRATEGIZE→MONITOR evidence structure

**Minimum documentation**:
- What level was achieved (Level 1, 2, or 3)
- What was tested (and what wasn't)
- Why Level 3 deferred (if applicable)

**See**: [Lightweight Manual Session Checklist](#link-to-ac3)
```

**Verification**:
```bash
# Check section exists
grep -n "Manual Sessions\|7.8" CLAUDE.md | head -3
```

**Why this matters**: Provides clear guidance for manual work without requiring full autopilot process

---

### AC3: Lightweight Checklist Created (MUST-HAVE)

**Requirement**: Create simple 1-page checklist for manual session verification

**Location**: `docs/autopilot/MANUAL_SESSION_VERIFICATION.md`

**Success Criteria**:
- [ ] Checklist is ≤500 words (quick to read/use)
- [ ] Format: Copy-paste markdown template
- [ ] Covers: Level achieved, what tested, what not tested, deferral justification (if any)
- [ ] NO requirement for full STRATEGIZE→MONITOR evidence
- [ ] Examples of filled-out checklist for common manual tasks

**Template Format**:
```markdown
# Manual Session Verification Checklist

**Task**: [Brief description]
**Date**: [YYYY-MM-DD]

## Verification Level Achieved
- [ ] Level 1: Compilation ✅
- [ ] Level 2: Smoke Testing ✅/❌
- [ ] Level 3: Integration Testing ✅/❌/⏳ DEFERRED

## What Was Tested (Level 2 ✅)
- [What you tested with real execution]
- [Edge cases covered]

## What Was NOT Tested (Level 3 ⏳)
- [What you didn't test]
- [Why deferred - valid reason]

## Deferral Justification (if Level 3 deferred)
**Reason**: [e.g., "No production credentials available"]
**Validation plan**: [How will it be validated later]
**Risk**: [What could go wrong]
**Mitigation**: [Risk reduction steps]

---

**Reference**: [VERIFICATION_LEVELS.md](docs/autopilot/VERIFICATION_LEVELS.md)
```

**Verification**:
```bash
# Check file exists and is short
wc -w docs/autopilot/MANUAL_SESSION_VERIFICATION.md  # Should be ≤500 words
```

**Why this matters**: Provides practical, low-overhead way to document verification in manual sessions

---

### AC4: WORK_PROCESS.md Note Added (MUST-HAVE)

**Requirement**: Update WORK_PROCESS.md introduction to clarify scope

**Success Criteria**:
- [ ] Introduction section explicitly states: "This document describes the autopilot workflow. For manual Claude sessions, see [MANUAL_SESSION_VERIFICATION.md]"
- [ ] Verification level requirements (Level 1-4) noted as universal, not autopilot-specific
- [ ] Clear distinction: Process steps (STRATEGIZE→MONITOR) are autopilot-specific, quality standards (Level 1-4) are universal

**Location**: WORK_PROCESS.md, lines 1-20 (introduction)

**Verification**:
```bash
# Check introduction mentions manual sessions
head -20 docs/autopilot/WORK_PROCESS.md | grep -i "manual\|autopilot-specific"
```

**Why this matters**: Prevents confusion about scope of WORK_PROCESS.md (autopilot workflow, not manual sessions)

---

### AC5: Manual Session Examples Provided (MUST-HAVE)

**Requirement**: Provide 2-3 examples of verification documentation for manual sessions

**Success Criteria**:
- [ ] Examples show realistic manual session scenarios
- [ ] At least 3 examples:
  1. Quick bug fix (Level 2, Level 3 deferred)
  2. User-requested feature (Level 2-3 achieved)
  3. Exploration/PoC (Level 1-2, Level 3 deferred)
- [ ] Each example shows filled-out lightweight checklist
- [ ] Examples demonstrate "what IS and IS NOT tested" documentation

**Location**: Either in MANUAL_SESSION_VERIFICATION.md or in `docs/autopilot/examples/verification/manual_sessions/`

**Example Structure**:
```markdown
# Example: Quick Bug Fix (Manual Session)

**Task**: Fix typo in error message (apps/web/src/components/ErrorDisplay.tsx)
**Date**: 2025-10-30

## Verification Level Achieved
- ✅ Level 1: Compilation
- ✅ Level 2: Smoke Testing
- ⏳ Level 3: Integration Testing - DEFERRED

## What Was Tested (Level 2 ✅)
- Component compiles (npm run build)
- Error message renders correctly (manual inspection)
- Text is readable and correct spelling

## What Was NOT Tested (Level 3 ⏳)
- Error display in production environment
- Error display with different error types
- Accessibility with screen readers

## Deferral Justification
**Reason**: Typo fix is low-risk, production testing not required
**Validation plan**: Will be validated by next user who encounters this error
**Risk**: LOW - Worst case: Still readable but slightly awkward phrasing
**Mitigation**: Reviewed by user before committing

---

**Verification Level**: Level 2 (Smoke Testing)
```

**Verification**:
```bash
# Check examples exist
ls -la docs/autopilot/examples/verification/manual_sessions/ || grep -A 20 "Example:" docs/autopilot/MANUAL_SESSION_VERIFICATION.md
```

**Why this matters**: Concrete examples show how to apply standards in practice

---

### AC6: Consistency Check (NICE-TO-HAVE)

**Requirement**: Verify no conflicting guidance between autopilot and manual session documentation

**Success Criteria**:
- [ ] Level 1-4 definitions match across all docs
- [ ] Phase gate requirements (Level 1/2/3) consistent
- [ ] Deferral criteria same for autopilot and manual
- [ ] No statement that implies different quality bars for autopilot vs manual

**Verification**:
```bash
# Check Level 1-4 definitions match
grep -h "Level 1:" docs/autopilot/VERIFICATION_LEVELS.md docs/autopilot/MANUAL_SESSION_VERIFICATION.md CLAUDE.md
```

**Why this matters**: Prevents drift between autopilot and manual session standards

---

## Out of Scope

### NOT Required:
1. **Automated enforcement**: WorkProcessEnforcer integration for manual sessions (separate task)
2. **Git hooks**: Pre-commit checks for manual sessions (separate task)
3. **Baseline data**: Historical audit of manual session quality (separate task)
4. **CI integration**: Automated verification level detection (separate task)

### Deferred to Future:
1. **Pre-commit hooks**: Will be handled in FIX-META-TEST-GAMING task
2. **Detection scripts**: Will be handled in FIX-META-TEST-GAMING task

---

## Success Criteria Summary

**Must-Have** (5 ACs):
1. ✅ VERIFICATION_LEVELS.md clarifies universal scope
2. ✅ CLAUDE.md has manual sessions section
3. ✅ Lightweight checklist created
4. ✅ WORK_PROCESS.md note added
5. ✅ Manual session examples provided (3 examples)

**Nice-to-Have** (1 AC):
6. ✅ Consistency check across all docs

**Total**: 6 acceptance criteria (5 must-have, 1 nice-to-have)

**Minimum for completion**: All 5 must-have ACs met

---

## Verification Plan

**VERIFY phase will check**:
1. All 5 must-have ACs met
2. Files created/updated as specified
3. Content matches requirements
4. Links work correctly
5. Examples are realistic and helpful
6. No conflicting guidance

**REVIEW phase will challenge**:
1. Is lightweight checklist actually lightweight?
2. Are examples realistic (not contrived)?
3. Is universal framing clear?
4. Could manual sessions be confused with autopilot process?
5. Is deferral guidance consistent?

---

**Next Phase**: PLAN (break down into implementation tasks)
