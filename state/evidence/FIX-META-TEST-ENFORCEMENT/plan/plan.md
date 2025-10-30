# PLAN: FIX-META-TEST-ENFORCEMENT

**Task ID**: FIX-META-TEST-ENFORCEMENT
**Date**: 2025-10-30
**Scope**: Phase 1 (Observe Mode) implementation

---

## Implementation Tasks

### Task 1: Create VerificationLevelDetector Class (AC1)
**File**: `tools/wvo_mcp/src/quality/verification_level_detector.ts`
**Time**: 2 hours

**Implementation**:
- `detectLevel(evidencePath: string): DetectionResult` method
- Parse implement/*.md and verify/*.md files for level evidence
- Return: level (1/2/3/null), confidence (high/medium/low), evidence (matched strings)
- Level 1: Search for build output ("npm run build", "0 errors")
- Level 2: Search for test execution ("npm test", "X passing", "expect(")
- Level 3: Search for integration testing or explicit deferral

### Task 2: Create Test Suite for Detector (AC2, AC7)
**File**: `tools/wvo_mcp/src/quality/__tests__/verification_level_detector.test.ts`
**Time**: 1.5 hours

**Tests**:
- Test on 10+ existing evidence directories
- Edge cases: Missing evidence, partial evidence, deferral
- Validate >90% accuracy
- Test confidence levels

### Task 3: Integrate into WorkProcessEnforcer (AC3)
**File**: `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`
**Time**: 1 hour

**Integration**:
- Add `checkVerificationLevel(taskId, fromPhase, toPhase)` method
- Call before phase transitions (IMPLEMENT→VERIFY, VERIFY→REVIEW, REVIEW→PR)
- Phase 1: Always allow, log mismatches
- Return advisory message

### Task 4: Add Analytics Tracking (AC5)
**File**: `state/analytics/verification_mismatches.jsonl`
**Time**: 30 minutes

**Implementation**:
- Log to JSONL file on each mismatch
- Fields: timestamp, taskId, transition, required, detected, confidence, phase

### Task 5: Create Helpful Error Messages (AC4)
**Time**: 30 minutes

**Implementation**:
- Message template with: Required level, detected level, what's missing, how to fix
- Link to VERIFICATION_LEVELS.md
- Note "OBSERVE MODE - transition allowed"

### Task 6: Add Configuration Flags (AC6)
**Time**: 30 minutes

**Flags**:
- VERIFICATION_ENFORCEMENT_MODE (observe/soft/hard)
- VERIFICATION_ENFORCEMENT_ENABLED (true/false)
- Default: observe mode, enabled

---

##Total Estimated Time: 6 hours

---

**Next Phase**: THINK (pre-mortem, assumptions)
