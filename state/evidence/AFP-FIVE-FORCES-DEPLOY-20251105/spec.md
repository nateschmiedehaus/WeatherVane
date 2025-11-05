# Specification: AFP Five Forces Deployment

**Task ID:** AFP-FIVE-FORCES-DEPLOY-20251105
**Date:** 2025-11-05
**Phase:** SPEC

---

## Functional Requirements

### FR1: Pre-Commit Hook Enforcement

**Requirement:** Git pre-commit hook MUST block commits that don't follow five forces.

**Acceptance Criteria:**
- AC1.1: Hook checks for "Pattern: <name>" OR "New pattern: <reason>" in commit message
- AC1.2: If +50 LOC added, hook checks for "Deleted: <description>" in commit message
- AC1.3: Hook runs linter to detect empty catch blocks
- AC1.4: Hook allows override with explicit flag: `git commit --override="<reason>"`
- AC1.5: Overrides are logged to `state/overrides.jsonl` with timestamp, commit hash, reason
- AC1.6: Hook completes in <10 seconds (30-second budget, leave buffer)
- AC1.7: Error messages are HELPFUL with examples of how to fix

**Test Cases:**
- TC1.1: Commit without pattern reference → BLOCKED with helpful error
- TC1.2: Commit with "Pattern: error_logging" → ALLOWED
- TC1.3: Commit with "New pattern: custom auth flow" → ALLOWED
- TC1.4: Commit +60 LOC without deletion note → BLOCKED
- TC1.5: Commit +60 LOC with "Deleted: duplicate error handling" → ALLOWED
- TC1.6: Commit with `--override="emergency hotfix"` → ALLOWED + logged
- TC1.7: Hook execution time measured < 10 seconds

---

### FR2: GATE Template Update

**Requirement:** Design template MUST include five forces checklist.

**Acceptance Criteria:**
- AC2.1: Template contains "Five Forces Check" section
- AC2.2: Each force has checkbox: COHERENCE, ECONOMY, LOCALITY, VISIBILITY, EVOLUTION
- AC2.3: Each checkbox has 1-sentence explanation of what to check
- AC2.4: Template includes "Pattern Decision" section
- AC2.5: Pattern Decision requires listing patterns found + pattern selected OR new pattern justification
- AC2.6: Template includes leverage classification (critical/high/medium/low)
- AC2.7: Template preserves existing sections (Via Negativa, Refactor vs Repair, Alternatives, etc.)

**Test Cases:**
- TC2.1: Create design.md from template → contains all five forces
- TC2.2: Fill out five forces checklist → understand what each means
- TC2.3: Pattern Decision section guides pattern selection
- TC2.4: Leverage classification present and clear

---

### FR3: Quick-Start Guide

**Requirement:** Create AFP_QUICK_START.md that explains five forces in <10 minutes reading time.

**Acceptance Criteria:**
- AC3.1: Document is <1000 words total
- AC3.2: Each force explained in <200 words
- AC3.3: Each force has 30-second heuristic ("Check 3 similar modules" not "Search all code")
- AC3.4: Includes 2-3 examples of good vs bad code
- AC3.5: Links to full documentation for details
- AC3.6: Explains pattern commit message format with examples
- AC3.7: Explains deletion accounting format with examples
- AC3.8: Explains override mechanism and when to use

**Test Cases:**
- TC3.1: Read guide start-to-finish → understand five forces in <10 minutes
- TC3.2: Use heuristics → complete checks in 30 seconds each
- TC3.3: See examples → distinguish good from bad patterns
- TC3.4: Follow format examples → commit message passes hook

---

### FR4: Mandatory Checklist Update

**Requirement:** Update MANDATORY_WORK_CHECKLIST.md with five forces.

**Acceptance Criteria:**
- AC4.1: Checklist includes five forces section
- AC4.2: Each force has checkbox with brief description
- AC4.3: References AFP_QUICK_START.md for details
- AC4.4: Integrates with existing GATE phase requirements
- AC4.5: Preserves existing micro-batching, via negativa, refactor-not-repair sections
- AC4.6: Clear that five forces GENERATE existing principles (not replace them)

**Test Cases:**
- TC4.1: Read checklist → understand when to check five forces
- TC4.2: Follow checklist → covers all requirements
- TC4.3: Links work → can navigate to details

---

## Non-Functional Requirements

### NFR1: Performance
- Hook execution time: <10 seconds (worst case)
- Hook startup time: <2 seconds
- No external network calls (everything local)

### NFR2: Usability
- Error messages must explain WHAT failed and HOW to fix
- Examples provided in error messages where possible
- Documentation readable by junior developers
- Heuristics actionable without deep expertise

### NFR3: Maintainability
- Hook logic in functions (not monolithic script)
- Comments explain WHY not just WHAT
- Override log is JSONL for easy parsing
- Pattern references extractable from commit messages

### NFR4: Compatibility
- Works with existing git workflow
- Doesn't break existing pre-commit checks (LOC limit, file count)
- Backward compatible with old commit message formats (warns but doesn't block old commits)

### NFR5: Flexibility
- Override mechanism for legitimate edge cases
- Hook can be temporarily disabled for emergencies (`SKIP_AFP=1 git commit`)
- Patterns can be marked as "experimental" vs "proven"

---

## Acceptance Criteria Summary

**Must have (blocking):**
- ✅ Pre-commit hook blocks non-compliant commits
- ✅ Hook completes in <10 seconds
- ✅ Error messages are helpful (explain how to fix)
- ✅ Override mechanism works and logs
- ✅ GATE template has five forces checklist
- ✅ Quick-start guide exists and is <1000 words
- ✅ Mandatory checklist updated

**Should have (important):**
- ✅ Override log is queryable (JSONL format)
- ✅ Pattern references extractable from commits
- ✅ Examples in documentation (good vs bad)
- ✅ Heuristics are 30-second actionable

**Nice to have (future):**
- Pattern search tool (next week)
- Pattern fitness dashboard (next month)
- Automatic pattern extraction (future)

---

## User Stories

**As an autopilot agent:**
- I want clear rules so I know what's allowed
- I want fast feedback so I don't waste time on blocked commits
- I want examples so I can learn good patterns
- I can follow heuristics without deep reasoning

**As a human developer:**
- I want to understand WHY rules exist
- I want to fix violations quickly
- I want escape hatch for legitimate edge cases
- I want to learn good patterns from examples

**As a code reviewer:**
- I want objective criteria for code quality
- I want pattern consistency across codebase
- I want to see pattern fitness data
- I can reject commits that bypass rules without justification

**As future contributor:**
- I want to see consistent patterns everywhere
- I want onboarding to teach me the patterns
- I want to avoid creating duplicate patterns
- I can trust that existing patterns are good (fitness-proven)

---

## Constraints

**Timeline:**
- Must deploy in 4-6 hours
- Can't wait for perfect solution
- Must be minimum viable intervention

**Technical:**
- Hook must work in bash (existing .githooks/pre-commit)
- Must not require external dependencies
- Must work on macOS (current platform)

**Organizational:**
- Must not block legitimate work
- Must provide escape hatch
- Must be reversible if not working

---

## Out of Scope (Not Today)

**Explicitly NOT included in this task:**
- Pattern search tool (next week)
- Pattern fitness dashboard (next month)
- Metrics collection/visualization (next month)
- Pattern catalog documentation (ongoing)
- Formal verification (future)
- 6-month effectiveness study (future)

---

## Dependencies

**Required before implementation:**
- ✅ Strategy document (this phase)
- ✅ Spec document (this phase)
- Plan document (next phase)
- Think document (next phase)
- Design document (GATE phase)

**External dependencies:**
- None (all tools/files exist or will be created)

---

## Risks & Mitigations

**Risk:** Hook too slow → people disable it
- **Mitigation:** Keep checks simple, measure performance, <10 second budget

**Risk:** Hook too strict → people use --override constantly
- **Mitigation:** Monitor override rate, iterate in week 1 if >10%

**Risk:** Documentation unclear → people don't know how to comply
- **Mitigation:** Examples in all error messages, quick-start guide <1000 words

**Risk:** Framework doesn't actually help → wasted effort
- **Mitigation:** 2-week review, kill criteria defined in strategy

---

## Success Metrics (Quantified)

**Day 1 (deployment):**
- Hook blocks at least 1 non-compliant commit ✅
- 0 complaints about "can't figure out how to comply" ✅
- Hook execution time <10 seconds ✅

**Week 1:**
- 100% commits have pattern reference OR override justification
- Override rate <10%
- 0 silent errors in new code

**Week 2:**
- Pattern reuse rate >50%
- LOC growth rate decreasing
- "Helpful vs Annoying" ratio >2:1 in feedback

**Fail fast criteria:**
- Override rate >30% by week 2 → REVERT
- Velocity drops >25% → REVERT
- No pattern reuse happening → REVISE

---

**Next Phase:** PLAN (design the implementation approach)
