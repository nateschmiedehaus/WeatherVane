# META-VERIFY-01: IMPLEMENT

## Changes Made

### 1. Created Verification Checklist Template
**File**: `docs/autopilot/templates/verify/verification_checklist.md`

**Content**:
- 6-point mandatory checklist
- Each point has clear gate conditions
- Examples of commands to run
- Red flags that require action
- Space for documenting results

**Features**:
- Copy-paste friendly (markdown checkboxes)
- Self-contained (includes all instructions)
- Examples from real tasks (IMP-ADV-01.6, IMP-ADV-01.6.1)

### 2. Updated CLAUDE.md
**Section**: Added 7.6 "Pre-Commit Verification Protocol (MANDATORY)"
**Location**: Lines 353-436 (before "## 8) The Complete Protocol")

**Content**:
- Overview of 6 checklist points
- Gate conditions for each
- Enforcement rules
- Links to template and evidence

**Integration**:
- Referenced from section 8 (The Complete Protocol)
- Marked as MANDATORY
- Clear trigger: "BEFORE marking ANY task complete"

### 3. Created Evidence Documents
**Files**: spec, plan, think, implement (this file)

**Remaining**: verify, review, pr, monitor

---

## Files Modified

1. `docs/autopilot/templates/verify/verification_checklist.md` (NEW)
2. `claude.md` (MODIFIED - added section 7.6)

---

## Next: VERIFY

Verify checklist works and CLAUDE.md integration is correct.
