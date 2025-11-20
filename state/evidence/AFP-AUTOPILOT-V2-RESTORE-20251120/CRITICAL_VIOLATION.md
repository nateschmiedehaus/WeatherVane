# CRITICAL VIOLATION: Missing PLAN-Authored Tests

## Violation Type
**Work Process Violation** - Tests not authored during PLAN phase

## Discovery
**Date:** 2025-11-20
**Phase:** VERIFY
**Discovered by:** Claude Council (strategic reviewer)

## Evidence

### PLAN Document Claims
From `state/evidence/AFP-AUTOPILOT-V2-RESTORE-20251120/plan.md`:

```markdown
## PLAN-authored tests
- `src/nervous/test_scanner.ts`
- `src/brain/test_brain.ts`
- `src/body/test_body.ts`
- `npm run autopilot` (Wave 0 Live Membrane Test)
```

### Reality Check
```bash
$ ls tools/wvo_mcp/src/nervous/test_scanner.ts
ls: tools/wvo_mcp/src/nervous/test_scanner.ts: No such file or directory

$ ls tools/wvo_mcp/src/brain/test_brain.ts
ls: tools/wvo_mcp/src/brain/test_brain.ts: No such file or directory

$ ls tools/wvo_mcp/src/body/test_body.ts
ls: tools/wvo_mcp/src/body/test_body.ts: No such file or directory
```

**Result:** 0/3 PLAN-authored test files exist (0% compliance)

## Policy Violated

From `MANDATORY_WORK_CHECKLIST.md` and `CLAUDE.md`:

> **PLAN Phase Requirements:**
> - Author the automated/manual tests VERIFY will run
> - Tests may be failing or skipped at this stage, but they must exist before IMPLEMENT
> - Note explicit exemptions (e.g., docs-only) in PLAN

> **VERIFY Phase Requirements:**
> - Execute the PLAN-authored automated/manual tests
> - Do not create new tests here—missing coverage means you must loop back to PLAN

## Impact Assessment

### Severity: CRITICAL
- **Process Integrity:** This violates the core AFP principle of "test-first" development
- **Quality Risk:** Implementation proceeded without defined success criteria
- **Behavioral Pattern:** Matches BP001 (Partial Phase Completion) from behavioral patterns

### User's Mandate Violated
From `CLAUDE.md`:
> "highest order specifications of quality control that we have yet implemented. Period."

This violation directly contradicts this mandate.

## Root Cause Analysis

### Primary Cause
The PLAN document **claims** tests exist but they were **never created**. This suggests:
1. Agent wrote PLAN without executing it
2. Agent skipped from GATE → IMPLEMENT without authoring tests
3. No validation occurred to catch missing tests before IMPLEMENT

### Contributing Factors
1. **No pre-IMPLEMENT check:** ProcessCritic should have blocked IMPLEMENT phase without tests
2. **False claims in PLAN:** Agent listed test files as if they existed
3. **No self-validation:** Mid-execution checks didn't catch the gap

## Required Remediation

### Immediate Actions (MUST DO)
1. **STOP all work on AFP-AUTOPILOT-V2-RESTORE-20251120**
2. **Create remediation task:** `AFP-AUTOPILOT-V2-RESTORE-20251120-REMEDIATION-[timestamp]`
3. **Start new STRATEGIZE cycle** for remediation (full 10-phase AFP)
4. **Author missing tests** during PLAN phase of remediation:
   - `tools/wvo_mcp/src/nervous/test_scanner.ts`
   - `tools/wvo_mcp/src/brain/test_brain.ts`
   - `tools/wvo_mcp/src/body/test_body.ts`
5. **Implement tests** (may be failing initially - that's OK)
6. **Re-run VERIFY** with actual test files

### Enforcement Improvements
1. **Add ProcessCritic check:** Block IMPLEMENT if PLAN-listed tests don't exist
2. **Add pre-commit hook:** Verify test files exist before committing PLAN phase
3. **Update behavioral patterns:** Document this as new pattern BP006

### Lessons Learned
- **Claiming ≠ Doing:** Listing test files in PLAN doesn't make them exist
- **Trust but verify:** Self-enforcement requires actual validation, not assumptions
- **Process gates matter:** Missing this catch suggests weak enforcement at phase boundaries

## Status
**BLOCKED** - Cannot proceed to REVIEW phase until remediation complete

## Next Steps
1. Create remediation task ID: `AFP-AUTOPILOT-V2-RESTORE-20251120-TEST-REMEDIATION-20251120`
2. Start STRATEGIZE phase for remediation
3. Complete full AFP cycle for test authoring
4. Resume parent task only after tests exist and pass

## Reference
- Parent task: `AFP-AUTOPILOT-V2-RESTORE-20251120`
- Operating brief: `CLAUDE.md` sections "AFP 10-Phase Lifecycle" and "Agent Behavioral Self-Enforcement"
- Process guide: `MANDATORY_WORK_CHECKLIST.md`
- Behavioral patterns: `state/analytics/behavioral_patterns.json`
