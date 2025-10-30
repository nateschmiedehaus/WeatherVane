# THINK: META-TESTING-STANDARDS Assumptions & Risks

**Task ID**: META-TESTING-STANDARDS
**Phase**: THINK
**Date**: 2025-10-30

---

## Key Assumptions

### A1: Documentation Will Be Read
**Assumption**: Agents will read VERIFICATION_LEVELS.md when confused about testing

**Risk if wrong**: Standards exist but aren't followed (low adoption)

**Mitigation**:
- Link prominently from WORK_PROCESS.md
- Include in pre-commit checklist
- Use in IMP-35 auth fix as example

**Validation**: Track references to verification levels in evidence docs

---

### A2: Examples Drive Understanding
**Assumption**: Good/bad examples more effective than abstract rules

**Risk if wrong**: Examples not general enough, agents don't see relevance

**Mitigation**:
- Use real failures (IMP-35) not hypotheticals
- Cover diverse task types (API, ML, UI, auth)
- Include "how to fix" for all bad examples

**Validation**: Ask agent "how would you verify X?" and see if they reference examples

---

### A3: Deferral Path Acceptable
**Assumption**: Allowing Level 3 deferral prevents pushback on standards

**Risk if wrong**: Agents defer everything, standards toothless

**Mitigation**:
- Require explicit justification for deferral
- Make justification visible in REVIEW phase
- Track deferral rate (alert if >50%)

**Validation**: Monitor deferral rate over 30 days

---

### A4: IMP-35 Auth Wrong Implementation
**Assumption**: Multi-model runner should use CLI not SDK

**Risk if wrong**: My understanding of auth system is incorrect

**Mitigation**:
- Checked auth_checker.ts, browser_login_tracker.ts
- System clearly uses `codex login` and `claude` CLI
- User explicitly said "monthly subscription logins"

**Validation**: User confirms after seeing auth fix

---

## Edge Cases

### Edge 1: Research Tasks with No Code
**Scenario**: Task is "research X" with no implementation

**Verification level**: Level 1 doesn't apply (no code), Level 2 is "research validated"

**Handling**: VERIFICATION_LEVELS.md includes note: "Research tasks achieve Level 2 by documenting sources, conclusions, and review"

---

### Edge 2: Refactoring with No New Tests
**Scenario**: Pure refactor, existing tests cover functionality

**Verification level**: Level 2 still required (run existing tests, prove they pass)

**Handling**: "No new tests" acceptable if existing tests validate refactor

---

### Edge 3: Emergency Hotfix
**Scenario**: Production down, need immediate fix, no time for Level 2

**Verification level**: Can skip levels with `EMERGENCY_HOTFIX=true` flag

**Handling**: Document in standards: "Emergency exception allowed, MUST create follow-up task to add tests"

---

### Edge 4: External Dependency Unavailable
**Scenario**: Level 3 requires real API but API is down

**Verification level**: Acceptable to defer Level 3 with "API unavailable" justification

**Handling**: Document deferral reason, create follow-up task when API available

---

## Pre-Mortem: What Will Go Wrong?

### Failure Mode 1: Standards Ignored
**Likelihood**: HIGH (initially)
**Impact**: MEDIUM (no improvement in false completion rate)

**Symptoms**: Agents continue claiming "build passed = done"

**Prevention**:
- Integrate into pre-commit checklist (hard to skip)
- Reference in every WORK_PROCESS phase
- Use IMP-35 as cautionary example (recent, relevant)

**Detection**: Track verification level mentions in evidence over 30 days

---

### Failure Mode 2: Standards Too Rigid
**Likelihood**: MEDIUM
**Impact**: HIGH (agent pushback, workarounds)

**Symptoms**: High deferral rate (>50%), complaints about overhead

**Prevention**:
- Allow deferral with justification
- Focus on high-value cases (APIs, integrations)
- Don't require Level 3 for all tasks

**Detection**: Survey agents, measure deferral rate

---

### Failure Mode 3: Examples Not Applicable
**Likelihood**: LOW
**Impact**: MEDIUM (agents don't see relevance)

**Symptoms**: Agents say "but my task is different"

**Prevention**:
- Diverse examples (API, ML, UI, auth, research)
- Real failures (IMP-35) not contrived scenarios
- "How to adapt" guidance for each example

**Detection**: Track example references, ask for feedback

---

### Failure Mode 4: Confusion About Levels
**Likelihood**: MEDIUM
**Impact**: MEDIUM (misapplication of standards)

**Symptoms**: Agents claim wrong level, unclear boundaries

**Prevention**:
- Sharp distinctions ("Proves X, Does NOT prove Y")
- Decision tree: "How do I know what level I need?"
- FAQ section in VERIFICATION_LEVELS.md

**Detection**: Review evidence docs, check for level mismatches

---

## Critical Success Factors

### CSF1: Integration into Workflow
**Why critical**: Standards outside workflow get ignored

**How achieved**:
- Update WORK_PROCESS.md (agents read this)
- Update pre-commit checklist (agents use this)
- Link from CLAUDE.md section 8

---

### CSF2: Concrete Examples
**Why critical**: Abstract rules don't drive behavior change

**How achieved**:
- Use real IMP-35 failures
- Show cost ("wasted 2 hours", "needs rewrite")
- Include "how to fix"

---

### CSF3: Low Friction
**Why critical**: High friction → workarounds

**How achieved**:
- Deferral allowed
- No specific frameworks mandated
- Focus on outcomes not process

---

**THINK Status**: ✅ COMPLETE

**Next Phase**: IMPLEMENT (create all documentation)
