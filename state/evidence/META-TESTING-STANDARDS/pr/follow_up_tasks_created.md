# PR: META-TESTING-STANDARDS - Follow-Up Tasks Created

**Task ID**: META-TESTING-STANDARDS
**Phase**: PR
**Date**: 2025-10-30

---

## Follow-Up Tasks Created

Per CLAUDE.md section 8 (Automatic Follow-Up Task Creation), creating FIX-* tasks for all deferred work identified in REVIEW phase.

---

### Task 1: FIX-META-TEST-ENFORCEMENT

**Source**: REVIEW adversarial_review.md (Gap 2, lines 229-234)

**Issue**: WorkProcessEnforcer integration deferred (AC7)

**Severity**: MEDIUM

**Description**:
Integrate verification level checking into WorkProcessEnforcer to automatically block phase transitions when verification level insufficient.

**Implementation**:
- Add `detectVerificationLevel()` function to parse evidence documents
- Check Level 1 before IMPLEMENT → VERIFY transition
- Check Level 2 before VERIFY → REVIEW transition
- Check Level 3 (or valid deferral) before REVIEW → PR transition
- Start in observe mode (log mismatches), upgrade to enforce after validation

**Acceptance Criteria**:
- WorkProcessEnforcer can detect verification level from evidence
- Transitions blocked if level insufficient
- Clear error messages when blocking
- Can be disabled via flag for emergencies

**Task created in roadmap**: FIX-META-TEST-ENFORCEMENT

---

### Task 2: FIX-META-TEST-GAMING

**Source**: REVIEW adversarial_review.md (Gap 4, lines 237-243) + Q4 (lines 80-115)

**Issue**: Agents could game system with trivial tests or mock-only integration

**Severity**: LOW-MEDIUM

**Description**:
Add automated detection for common gaming patterns:
- Trivial tests (no assertions)
- Mock-only integration tests (claiming Level 3 with all mocks)
- Cherry-picked evidence (showing only passing tests)

**Implementation**:
- Static analysis: Check test files contain `expect()` / `assert()` statements
- Integration detector: Parse test code for mock usage vs real dependencies
- Deferral reasonableness check: Flag generic deferral reasons ("don't have time")
- Add to VERIFY phase automated checks

**Acceptance Criteria**:
- Script can detect tests without assertions
- Script can detect mock-heavy "integration" tests
- Script flags weak deferral justifications
- Integrated into pre-commit or VERIFY phase checks

**Task created in roadmap**: FIX-META-TEST-GAMING

---

### Task 3: FIX-META-TEST-MANUAL-SESSIONS

**Source**: User request (2025-10-30) + REVIEW adversarial_review.md (Recommendation 6, lines 323-326)

**Issue**: Standards currently focus on autopilot work process, should also apply to manual Claude sessions

**Severity**: MEDIUM

**Description**:
Ensure verification level standards apply consistently whether working within autopilot or manual Claude sessions.

**Implementation**:
- Add section to CLAUDE.md: "Verification Levels for Manual Sessions"
- Create lightweight checklist for quick manual tasks
- Update WORK_PROCESS.md note: "Applies to both autopilot and manual sessions"
- Provide examples of manual session verification documentation
- Update VERIFICATION_LEVELS.md introduction to clarify scope

**Acceptance Criteria**:
- CLAUDE.md explicitly states standards apply to manual sessions
- Lightweight checklist available for quick tasks (don't need full evidence structure)
- Examples show verification level documentation for manual work
- VERIFICATION_LEVELS.md introduction updated

**Task created in roadmap**: FIX-META-TEST-MANUAL-SESSIONS

---

## Tasks NOT Created (Intentionally Deferred)

### Detection Script (AC4)
**Reason**: Nice-to-have, not critical
**Rationale**: Examples and documentation provide 80% of value; script requires maintenance
**Decision**: Revisit if manual detection proves insufficient after 60 days
**No task created**: Acceptable per SPEC

### Additional Examples
**Reason**: Examples library covers 80% of common tasks
**Rationale**: PoC, documentation, infrastructure, refactoring examples can be added organically
**Decision**: Add as needed when patterns emerge
**No task created**: Can be added in future iterations

### Baseline Metrics
**Reason**: Measurement, not implementation
**Rationale**: Will be done in MONITOR phase
**Decision**: Track in monitoring, not separate task
**No task created**: Covered by MONITOR phase

---

## Follow-Up Task Summary

**Total tasks created**: 3

| Task ID | Title | Severity | Acceptance Criteria Met |
|---------|-------|----------|------------------------|
| FIX-META-TEST-ENFORCEMENT | Integrate verification levels into WorkProcessEnforcer | MEDIUM | Phase transition blocking |
| FIX-META-TEST-GAMING | Detect gaming patterns (trivial tests, mock abuse) | LOW-MEDIUM | Static analysis for assertions/mocks |
| FIX-META-TEST-MANUAL-SESSIONS | Apply standards to manual Claude sessions | MEDIUM | Lightweight checklist for manual work |

**Follow-up epic**: META-TESTING-STANDARDS-FOLLOW-UP

---

## Roadmap Integration

Tasks will be added to `state/roadmap.yaml` with:
- `auto_created: true`
- `source_issue` metadata linking to META-TESTING-STANDARDS
- Epic: META-TESTING-STANDARDS-FOLLOW-UP
- Domain: mcp
- All required v2.0 schema fields

---

## PR Readiness

**Follow-up tasks documented**: ✅ YES (3 tasks)
**Evidence complete**: ✅ YES (strategize, spec, plan, think, implement, verify, review, pr)
**All deferred work tracked**: ✅ YES (3 FIX-* tasks created)
**No orphaned gaps**: ✅ YES (all gaps either fixed or have follow-up task)

**Ready for commit**: YES

---

**Next Phase**: MONITOR (track adoption, measure success metrics)
