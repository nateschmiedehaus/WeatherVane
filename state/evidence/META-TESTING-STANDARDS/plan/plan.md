# PLAN: META-TESTING-STANDARDS

**Task ID**: META-TESTING-STANDARDS
**Phase**: PLAN
**Date**: 2025-10-30

---

## Implementation Order (Prioritized by Value)

### Task 1: Create VERIFICATION_LEVELS.md (AC1) - 30 min
**Why first**: Foundation for everything else

**Steps**:
1. Create `docs/autopilot/VERIFICATION_LEVELS.md`
2. Write Level 1-4 definitions with "Proves" and "Does NOT prove"
3. Add examples for each level (good vs bad)
4. Add task-type-specific guidance

**Dependencies**: None
**Output**: Core taxonomy document

---

### Task 2: Create Case Studies (AC6) - 20 min
**Why second**: Concrete motivation before updating process docs

**Steps**:
1. Create `docs/autopilot/examples/verification/case_studies/`
2. Write IMP-35 Round 1 case study (build-without-validate)
3. Write IMP-35 Auth case study (auth assumption)
4. Link from VERIFICATION_LEVELS.md

**Dependencies**: Task 1 complete (reference levels)
**Output**: 2 cautionary tales with analysis

---

### Task 3: Update Work Process Docs (AC2) - 40 min
**Why third**: Integrate into existing workflow

**Steps**:
1. Update `docs/autopilot/WORK_PROCESS.md` VERIFY section
2. Update `CLAUDE.md` section 8 (Complete Protocol)
3. Update `AGENTS.md` equivalent sections
4. Add phase-specific verification level requirements
5. Add "return to earlier phase if level insufficient" gates

**Dependencies**: Task 1 complete (reference levels)
**Output**: 3 files updated with level requirements

---

### Task 4: Update Pre-Commit Checklist (AC5) - 15 min
**Why fourth**: Operationalize at point of completion

**Steps**:
1. Update `CLAUDE.md` section 7.6 (Pre-Commit Verification Protocol)
2. Add "Verification Level" field to checklist
3. Map checklist items to levels
4. Add deferral path

**Dependencies**: Task 1, 3 complete
**Output**: Updated checklist with levels

---

### Task 5: Create Examples Library (AC3) - 60 min
**Why fifth**: Reinforcement and reference

**Steps**:
1. Create `docs/autopilot/examples/verification/` directory structure
2. Write 8 examples (4 good, 4 bad):
   - API integration (good + bad)
   - Auth integration (good + bad)
   - ML model (good + bad)
   - UI feature (good + bad)
3. Each example: description, claimed level, actual level, why good/bad, how to fix

**Dependencies**: Task 1, 2 complete (reference levels and case studies)
**Output**: 8 example files

---

### Task 6: Create Detection Script (AC4) - DEFER
**Why deferred**: Nice-to-have, significant effort

**Rationale**:
- Examples and documentation provide 80% of value
- Script adds automation but requires ongoing maintenance
- Can be added later if manual detection proves insufficient

**Deferral plan**: Create FIX-META-TEST-DETECTION task for future

---

### Task 7: WorkProcessEnforcer Integration (AC7) - DEFER
**Why deferred**: Optional, requires testing infrastructure

**Rationale**:
- Observe mode requires baseline data
- Enforcement too rigid before standards proven
- Better to establish cultural adoption first

**Deferral plan**: Revisit after 60 days of manual adoption

---

## Task Dependencies

```
Task 1 (VERIFICATION_LEVELS.md)
  ↓
Task 2 (Case Studies) ← depends on Task 1
  ↓
Task 3 (Work Process) ← depends on Task 1
  ↓
Task 4 (Pre-Commit Checklist) ← depends on Task 1, 3
  ↓
Task 5 (Examples Library) ← depends on Task 1, 2

Task 6 (Detection Script) → DEFERRED
Task 7 (Enforcer Integration) → DEFERRED
```

**Critical path**: Tasks 1 → 3 → 4 (75 min total)
**Full completion**: Tasks 1-5 (165 min total, ~2.75 hours)

---

## Estimation

| Task | Effort | Priority | Status |
|------|--------|----------|--------|
| Task 1: VERIFICATION_LEVELS.md | 30 min | MUST | Planned |
| Task 2: Case Studies | 20 min | MUST | Planned |
| Task 3: Work Process Updates | 40 min | MUST | Planned |
| Task 4: Pre-Commit Checklist | 15 min | MUST | Planned |
| Task 5: Examples Library | 60 min | MUST | Planned |
| Task 6: Detection Script | 120 min | DEFER | Deferred |
| Task 7: Enforcer Integration | 180 min | DEFER | Deferred |

**Total Must-Have**: 165 min (~2.75 hours)
**Total Deferred**: 300 min (~5 hours)

---

## Implementation Strategy

### Approach: Documentation-First

**Rationale**: Examples and clear docs drive adoption better than enforcement

**Sequence**:
1. Define levels (taxonomy)
2. Show failures (case studies)
3. Update process (integration)
4. Operationalize (checklist)
5. Provide reference (examples)

### NOT Doing (Explicitly)

- NOT building enforcement tooling initially
- NOT requiring specific coverage thresholds
- NOT prescribing testing frameworks
- NOT blocking all work until perfect

### Success Criteria

**Immediate** (end of IMPLEMENT):
- All 5 must-have ACs complete
- Docs are clear and actionable
- Examples are concrete and realistic

**Short-term** (30 days):
- Agents reference verification levels
- Zero false completions
- Faster completion (less back-and-forth)

---

## File Structure (After Implementation)

```
docs/autopilot/
  VERIFICATION_LEVELS.md          ← Task 1 (NEW)
  WORK_PROCESS.md                 ← Task 3 (UPDATED)
  examples/verification/          ← NEW directory
    case_studies/
      imp_35_round1.md            ← Task 2
      imp_35_auth.md              ← Task 2
    api_integration_good.md       ← Task 5
    api_integration_bad.md        ← Task 5
    auth_integration_good.md      ← Task 5
    auth_integration_bad.md       ← Task 5
    ml_model_good.md              ← Task 5
    ml_model_bad.md               ← Task 5
    ui_feature_good.md            ← Task 5
    ui_feature_bad.md             ← Task 5

CLAUDE.md                         ← Task 3, 4 (UPDATED)
AGENTS.md                         ← Task 3 (UPDATED)
```

---

## Risk Mitigation

**Risk**: Documentation too prescriptive → agents feel constrained
**Mitigation**: Emphasize deferral is acceptable with justification

**Risk**: Examples too simple → not applicable to real tasks
**Mitigation**: Use real IMP-35 failures as examples

**Risk**: Low adoption → standards ignored
**Mitigation**: Start with high-value examples, integrate into checklist

---

**PLAN Status**: ✅ COMPLETE

**Next Phase**: THINK (assumptions, edge cases, pre-mortem)
