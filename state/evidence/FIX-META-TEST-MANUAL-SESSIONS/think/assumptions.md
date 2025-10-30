# THINK: FIX-META-TEST-MANUAL-SESSIONS

**Task ID**: FIX-META-TEST-MANUAL-SESSIONS
**Date**: 2025-10-30

---

## Key Assumptions

### Assumption 1: Manual Sessions Need Lighter Process

**Assumption**: Manual Claude sessions outside autopilot don't need full STRATEGIZE→MONITOR evidence structure

**Rationale**:
- Manual sessions are typically smaller, one-off tasks
- Human is present to guide and verify work
- Full autopilot evidence structure would be overhead that reduces productivity
- But quality standards (Level 1-4) still apply

**Validation**: Check with user if lightweight checklist is sufficient

**Risk if wrong**: Manual sessions become too rigid, users bypass standards entirely

**Mitigation**: Start with lightweight checklist, gather feedback, adjust if too rigid or too loose

---

### Assumption 2: Manual Sessions Produce Production Code

**Assumption**: Manual Claude sessions (outside autopilot) still produce code that goes to production

**Rationale**:
- User requests in manual sessions often result in commits
- One-off fixes, user-requested features, explorations can all become production code
- Even "quick fixes" affect users

**Validation**: Audit recent manual session commits to see if they're production-bound

**Risk if wrong**: If manual sessions are only exploratory, lightweight checklist may be overkill

**Mitigation**: Make checklist even lighter for pure exploration (Level 1-2 only, no Level 3 requirement)

---

### Assumption 3: Users Will Adopt Lightweight Checklist

**Assumption**: Users will actually use the lightweight checklist instead of skipping verification documentation

**Rationale**:
- Lightweight format (≤500 words) is low overhead
- Copy-paste template makes it easy
- Examples show it in action
- But users could still skip it

**Validation**: Monitor usage in first 30 days (search for "Manual Session Verification Checklist" in evidence/commits)

**Risk if wrong**: Checklist is ignored, manual sessions remain unverified

**Mitigation**:
- Make checklist VERY lightweight
- Provide realistic examples
- Add to CLAUDE.md as recommended practice (not mandatory initially)
- Monitor adoption, strengthen if needed

---

### Assumption 4: Standards Are Clear as Universal

**Assumption**: Updating introduction sections will be sufficient to position standards as universal (not autopilot-only)

**Rationale**:
- Explicit "applies to all code changes" statement should be clear
- Separating core taxonomy from workflow-specific guidance makes scope obvious
- But users might still see "autopilot" directory and assume autopilot-only

**Validation**: Ask user to review updated intro sections

**Risk if wrong**: Manual sessions continue without verification standards

**Mitigation**:
- Make universal framing very explicit
- Consider renaming "docs/autopilot/" to "docs/quality/" in future (out of scope for this task)
- Add clear signposting in CLAUDE.md

---

## Pre-Mortem: How Could This Fail?

### Failure Mode 1: Checklist Too Long, Users Skip It

**Scenario**: We create "lightweight" checklist but it's still 1,000+ words, users ignore it

**Likelihood**: LOW (SPEC requires ≤500 words)

**Impact**: HIGH (defeats purpose)

**Early Warning Signs**:
- Checklist draft exceeds 500 words
- Too many required fields
- Complex instructions

**Preventions**:
- **Task 0.1**: Enforce strict 500-word limit in implementation
- **Task 0.2**: Use copy-paste template format (not prose)
- **Task 0.3**: Provide examples that demonstrate speed of use

**Mitigation**: If adoption is low after 30 days, shorten checklist to bare minimum (3 fields)

---

### Failure Mode 2: Manual Sessions Confused With Autopilot

**Scenario**: Users try to follow full STRATEGIZE→MONITOR in manual sessions, get frustrated

**Likelihood**: MEDIUM (docs are still in "docs/autopilot/" directory)

**Impact**: MEDIUM (user frustration, wasted time)

**Early Warning Signs**:
- Evidence directories created for trivial manual tasks
- User complaints about "too much documentation"
- Full work process followed for one-off fixes

**Preventions**:
- **Task 0.4**: Add clear distinction in WORK_PROCESS.md intro: "For manual sessions, use MANUAL_SESSION_VERIFICATION.md"
- **Task 0.5**: Add note to MANUAL_SESSION_VERIFICATION.md: "This is NOT for autopilot - use WORK_PROCESS.md"
- **Task 0.6**: Make scope crystal clear in both documents

**Mitigation**: Add prominent "For Manual Sessions Only" banner to checklist doc

---

### Failure Mode 3: Standards Diverge (Autopilot vs Manual)

**Scenario**: Over time, autopilot and manual session standards drift apart, creating two quality bars

**Likelihood**: MEDIUM (no automation to prevent drift)

**Impact**: HIGH (defeats universal standards goal)

**Early Warning Signs**:
- Level 1-4 definitions differ between docs
- Different deferral criteria for autopilot vs manual
- Manual standards become lax

**Preventions**:
- **Task 0.7**: Consistency check in AC6 (catch drift before commit)
- **Task 0.8**: Keep VERIFICATION_LEVELS.md as single source of truth for levels
- **Task 0.9**: Both docs link to VERIFICATION_LEVELS.md, not duplicating content

**Mitigation**: Quarterly audit of verification docs for consistency

---

### Failure Mode 4: Examples Are Contrived, Not Helpful

**Scenario**: Manual session examples don't match real workflows, users can't relate

**Likelihood**: LOW (plan includes realistic scenarios)

**Impact**: MEDIUM (users don't adopt because examples aren't helpful)

**Early Warning Signs**:
- Examples too simplistic ("fix typo" only)
- No examples of complex manual tasks
- User feedback: "examples don't match my work"

**Preventions**:
- **Task 0.10**: Include 3 diverse examples (bug fix, feature, PoC)
- **Task 0.11**: Show both Level 2 and Level 3 scenarios
- **Task 0.12**: Use real task types from user's typical manual sessions

**Mitigation**: Add more examples based on user feedback

---

## Edge Cases

### Edge Case 1: Exploration/PoC Code

**Scenario**: User does exploration that may never become production code

**Current Solution**: Example 3 shows PoC-specific deferral (Level 1-2, Level 3 deferred with "not production code" justification)

**Guidance**: Level 3 can be deferred with "Exploration only, not production-bound" reason

---

### Edge Case 2: Urgent Hotfix

**Scenario**: Production down, need immediate fix, no time for verification documentation

**Current Solution**: VERIFICATION_LEVELS.md mentions emergency exception (lines 87-92)

**Guidance**: Hotfix first, document verification level retroactively

---

### Edge Case 3: Collaborative Manual Session

**Scenario**: Multiple people working together in manual session (pair programming with Claude)

**Current Solution**: Not explicitly addressed

**Recommendation**: One person documents verification level at end, includes "Co-authors: X, Y"

---

### Edge Case 4: Long-Running Manual Task (Multi-Session)

**Scenario**: Manual task spans multiple sessions, when to document verification?

**Current Solution**: Not explicitly addressed

**Recommendation**: Document at logical checkpoints (e.g., after each feature complete) OR at final completion

---

## Preventive Task List (From Pre-Mortem)

**Task 0.1**: Enforce 500-word limit on MANUAL_SESSION_VERIFICATION.md ✅ (in SPEC)
**Task 0.2**: Use copy-paste template format ✅ (in PLAN Task 2)
**Task 0.3**: Provide examples demonstrating speed ✅ (in PLAN Task 3)
**Task 0.4**: Add clear distinction in WORK_PROCESS.md ✅ (in PLAN Task 5)
**Task 0.5**: Add "Not for autopilot" note to checklist → ADD TO IMPLEMENT
**Task 0.6**: Make scope crystal clear → ADD TO IMPLEMENT
**Task 0.7**: Consistency check ✅ (in PLAN Task 6)
**Task 0.8**: Keep VERIFICATION_LEVELS.md as source of truth ✅ (in STRATEGY)
**Task 0.9**: Both docs link to VERIFICATION_LEVELS.md ✅ (in PLAN Tasks 2, 4, 5)
**Task 0.10**: Include 3 diverse examples ✅ (in PLAN Task 3)
**Task 0.11**: Show Level 2 and Level 3 scenarios ✅ (in PLAN Task 3)
**Task 0.12**: Use real task types ✅ (in PLAN Task 3)

**Additional tasks needed**:
- Task 0.13: Add "For Manual Sessions Only" banner to MANUAL_SESSION_VERIFICATION.md
- Task 0.14: Add edge case guidance (exploration, hotfix, collaborative, multi-session)

---

## Dependencies and Integration Points

### Integration with Existing Systems

**VERIFICATION_LEVELS.md** (modified):
- Update introduction to be workflow-agnostic
- Separate core taxonomy from autopilot integration

**WORK_PROCESS.md** (modified):
- Add scope note linking to MANUAL_SESSION_VERIFICATION.md

**CLAUDE.md** (modified):
- Add section 7.8 linking to MANUAL_SESSION_VERIFICATION.md

**MANUAL_SESSION_VERIFICATION.md** (created):
- Links to VERIFICATION_LEVELS.md for level definitions
- No duplication of level definitions

### No Breaking Changes

**Risk**: Could this break existing autopilot workflows?

**Assessment**: NO
- Additive changes only (new doc, updated introductions)
- No changes to core Level 1-4 definitions
- No changes to autopilot process steps
- WORK_PROCESS.md remains valid for autopilot

**Rollback**: Straightforward (revert commits if issues arise)

---

## Success Indicators

### After Implementation

**Immediate** (within 7 days):
- All 6 ACs met (verifiable in VERIFY phase)
- Docs updated as specified
- No broken links

**Short-term** (30 days):
- At least 3 manual sessions use lightweight checklist
- No user confusion about manual vs autopilot
- No quality gap between autopilot and manual sessions

**Medium-term** (90 days):
- 100% of manual sessions document verification level
- Examples are helpful (user feedback)
- No drift between autopilot and manual standards

---

## Assumptions Validated, Pre-Mortem Complete

**Next Phase**: IMPLEMENT (execute 6 tasks from PLAN)
