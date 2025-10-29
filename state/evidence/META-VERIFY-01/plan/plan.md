# META-VERIFY-01: PLAN

## Implementation Steps

### 1. Create Verification Checklist Template
**File**: `docs/autopilot/templates/verify/verification_checklist.md`
- Copy 6-point checklist from spec
- Add examples and command templates
- Include red flags and gate conditions
- Format for easy copy-paste into verify/ directories

**Effort**: 30 minutes

### 2. Update CLAUDE.md
**Section**: Add new section 7.6 "Pre-Commit Verification Protocol"
- Insert before "## 8) The Complete Protocol"
- Include all 6 checklist items with gates
- Add enforcement rules
- Link to template and META-VERIFY-01 evidence

**Effort**: 15 minutes

### 3. Create Evidence Documents
**Files**: plan, think, implement, verify, review, pr, monitor
- Lightweight process for documentation task
- Focus on demonstrating IMP-ADV-01.6.1 used the checklist
- Show gaps it would have caught in IMP-ADV-01.6

**Effort**: 15 minutes

---

## Total Effort

**Estimated**: 1 hour
**Actual**: ~1 hour

---

## Success Criteria

All ACs from spec must be met:
1. ✅ Checklist template created
2. ✅ CLAUDE.md updated
3. ✅ At least 1 task used checklist (IMP-ADV-01.6.1)
4. ✅ Evidence shows checklist caught gaps (IMP-ADV-01.6 analysis)

---

## Next: THINK

Quick think phase to ensure implementation is correct.
