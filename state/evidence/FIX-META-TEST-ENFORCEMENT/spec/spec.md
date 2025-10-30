# SPEC: FIX-META-TEST-ENFORCEMENT

**Task ID**: FIX-META-TEST-ENFORCEMENT
**Date**: 2025-10-30
**Strategic Decision**: Smart Progressive Enforcement (3-phase rollout)

---

## Scope

**This iteration**: Phase 1 (Observe Mode) only
**Future iterations**: Phase 2 (Soft-block), Phase 3 (Hard-block)

**Rationale**: Validate detection accuracy before enforcing. Build foundation for progressive enforcement.

---

## Acceptance Criteria

### AC1: Verification Level Detector Implemented (MUST-HAVE)

**Requirement**: Create `VerificationLevelDetector` class that parses evidence documents and detects achieved verification level

**Detection Algorithm**:

**Level 1 (Compilation)**:
- Search for: "npm run build", "0 errors", "Build successful", "tsc", "compilation"
- File locations: `implement/*.md`, `verify/*.md`
- Confidence: HIGH if build output present, MEDIUM if "Level 1" mentioned without evidence

**Level 2 (Smoke Testing)**:
- Search for: "npm test", "tests pass", "X/X passing", "expect(", "assert", "Level 2"
- Must have: Test execution evidence (not just test files created)
- File locations: `verify/*.md`
- Confidence: HIGH if test output + assertions present, MEDIUM if "Level 2" mentioned

**Level 3 (Integration Testing)**:
- Search for: "integration test", "real API", "actual dependencies", "Level 3", "DEFERRED" + justification
- Deferral detection: "Level 3.*DEFERRED" + ("Reason:", "Justification:", "Why deferred")
- File locations: `verify/*.md`, `review/*.md`
- Confidence: HIGH if integration evidence or explicit deferral, LOW if neither

**Success Criteria**:
- [ ] `VerificationLevelDetector` class exists in `tools/wvo_mcp/src/quality/`
- [ ] `detectLevel(evidencePath: string): DetectionResult` method implemented
- [ ] Returns: `{ level: 1 | 2 | 3 | null, confidence: 'high' | 'medium' | 'low', evidence: string[] }`
- [ ] Tests cover all 3 levels + deferral detection

**Verification**:
```typescript
const detector = new VerificationLevelDetector();
const result = detector.detectLevel('state/evidence/TASK-ID');
// result.level === 2, result.confidence === 'high', result.evidence includes test outputs
```

---

### AC2: Detection Accuracy Validated (MUST-HAVE)

**Requirement**: Detector achieves >90% accuracy on existing evidence

**Test Set**: Use existing evidence from completed tasks
- META-TESTING-STANDARDS (Level 2 - tests, examples)
- FIX-META-TEST-MANUAL-SESSIONS (Level 2 - documentation validation)
- IMP-35 Round 1 (Level 1 only - "build passed" false completion)
- IMP-35 Round 2 (Level 2-3 - full verification)

**Success Criteria**:
- [ ] Tested on ≥10 existing evidence directories
- [ ] Accuracy ≥90% (correct level detected)
- [ ] False positives ≤10% (claimed level higher than actual)
- [ ] False negatives ≤10% (claimed level lower than actual)
- [ ] Deferral detection works (detects explicit Level 3 deferral)

**Verification**:
```bash
npm run test -- verification_level_detector.test.ts
# Output: Accuracy: 92% (11/12 correct)
```

---

### AC3: WorkProcessEnforcer Integration (Phase 1) (MUST-HAVE)

**Requirement**: Integrate detector into WorkProcessEnforcer phase transition checks (observe mode only)

**Integration Points**:
1. **IMPLEMENT → VERIFY**: Check Level 1 achieved
2. **VERIFY → REVIEW**: Check Level 2 achieved
3. **REVIEW → PR**: Check Level 3 achieved or explicitly deferred

**Phase 1 Behavior (Observe Mode)**:
- Detect verification level at each transition
- Log mismatch if insufficient (don't block)
- Track mismatches in `state/analytics/verification_mismatches.jsonl`

**Success Criteria**:
- [ ] `checkVerificationLevel(taskId, fromPhase, toPhase)` method in WorkProcessEnforcer
- [ ] Called before allowing phase transitions
- [ ] Logs mismatches to analytics file
- [ ] Does NOT block transitions (observe mode)
- [ ] Returns advisory message only

**Verification**:
```typescript
// In WorkProcessEnforcer
const check = await this.checkVerificationLevel('TASK-ID', 'VERIFY', 'REVIEW');
// check.allowed === true (always in Phase 1)
// check.message === "⚠️ Level 2 not detected. Expected: Test execution with assertions."
// Mismatch logged to state/analytics/verification_mismatches.jsonl
```

---

### AC4: Helpful Error Messages (MUST-HAVE)

**Requirement**: Provide actionable guidance when verification level insufficient

**Message Format**:
```
⚠️ Verification Level Check (Observe Mode)

Phase Transition: VERIFY → REVIEW
Required Level: Level 2 (Smoke Testing)
Detected Level: Level 1 (Compilation only)

What's Missing:
- No test execution evidence found
- Expected: Test output showing passing tests with assertions
- Example: "npm test → 15/15 passing"

How to Fix:
1. Run tests: npm test
2. Document results in verify/verification_summary.md
3. Include: Test count, pass/fail status, assertions used

This is OBSERVE MODE - transition allowed but mismatch logged.

See: docs/autopilot/VERIFICATION_LEVELS.md for full level definitions
```

**Success Criteria**:
- [ ] Messages explain what level is required
- [ ] Messages explain what's missing
- [ ] Messages explain how to fix
- [ ] Messages link to VERIFICATION_LEVELS.md
- [ ] Messages note "OBSERVE MODE - transition allowed"

**Verification**: Manual review of message output

---

### AC5: Analytics Tracking (MUST-HAVE)

**Requirement**: Track verification level mismatches for analysis

**Analytics File**: `state/analytics/verification_mismatches.jsonl`

**Format**:
```jsonl
{"timestamp":"2025-10-30T12:00:00Z","taskId":"TASK-ID","transition":"VERIFY->REVIEW","required":"Level 2","detected":"Level 1","confidence":"high","phase":"observe"}
```

**Success Criteria**:
- [ ] JSONL file created on first mismatch
- [ ] Each mismatch logged as single line
- [ ] Fields: timestamp, taskId, transition, required level, detected level, confidence, phase (observe/soft/hard)
- [ ] File appended (not overwritten)

**Verification**:
```bash
cat state/analytics/verification_mismatches.jsonl | jq -r '.transition' | sort | uniq -c
# Output shows mismatch counts by transition
```

---

### AC6: Phase 1 Configuration (MUST-HAVE)

**Requirement**: Configure enforcement mode via flag

**Configuration Location**: `state/live_flags.db` or environment variable

**Flags**:
- `VERIFICATION_ENFORCEMENT_MODE`: "observe" | "soft" | "hard" (default: "observe")
- `VERIFICATION_ENFORCEMENT_ENABLED`: true | false (default: true for Phase 1)

**Success Criteria**:
- [ ] Mode configurable via live flag
- [ ] Default mode is "observe"
- [ ] Can be disabled completely (ENABLED=false) for emergencies
- [ ] Mode change takes effect immediately (no restart)

**Verification**:
```bash
# Check current mode
npx tsx tools/wvo_mcp/src/utils/check_enforcement_mode.ts
# Output: VERIFICATION_ENFORCEMENT_MODE=observe, ENABLED=true

# Change mode (future: Phase 2)
# mcp__weathervane__mcp_admin_flags --action set --flags '{"VERIFICATION_ENFORCEMENT_MODE":"soft"}'
```

---

### AC7: Tests Cover Detection Logic (MUST-HAVE)

**Requirement**: Unit and integration tests for detector and enforcer

**Test Coverage**:
- VerificationLevelDetector: 100% coverage (all detection paths)
- WorkProcessEnforcer integration: 90% coverage (phase transition checks)
- Edge cases: Missing evidence, ambiguous evidence, explicit deferral

**Success Criteria**:
- [ ] `verification_level_detector.test.ts` exists with ≥20 test cases
- [ ] `work_process_enforcer.verification.test.ts` exists with ≥10 test cases
- [ ] Edge cases tested: No evidence, partial evidence, deferral
- [ ] All tests pass

**Verification**:
```bash
npm test -- verification_level_detector
npm test -- work_process_enforcer.verification
# All tests pass
```

---

## Out of Scope

### NOT in This Iteration (Phase 1):
1. **Soft-block enforcement** (Phase 2 - confirmation required to proceed)
2. **Hard-block enforcement** (Phase 3 - no bypass except emergency)
3. **Automatic remediation** (suggesting fixes to code)
4. **Manual session enforcement** (only autopilot for now)
5. **Historical backfill** (analyzing past tasks)

### Deferred to Future Phases:
- Phase 2 (60 days): Soft-block with confirmation
- Phase 3 (90 days): Hard-block with emergency bypass only
- Gaming detection: Separate task (FIX-META-TEST-GAMING)

---

## Success Criteria Summary

**Must-Have** (7 ACs):
1. ✅ Verification level detector implemented
2. ✅ Detection accuracy >90% validated
3. ✅ WorkProcessEnforcer integration (observe mode)
4. ✅ Helpful error messages
5. ✅ Analytics tracking (mismatches logged)
6. ✅ Phase 1 configuration (observe mode default)
7. ✅ Tests cover detection logic

**Total**: 7 must-have acceptance criteria

**Minimum for completion**: All 7 must-have ACs met

---

## Verification Plan

**VERIFY phase will check**:
1. Detector correctly identifies levels in test cases
2. Detection accuracy measured on existing evidence
3. WorkProcessEnforcer calls detector at transitions
4. Mismatches logged to analytics file
5. Messages are helpful and actionable
6. Tests pass and cover edge cases
7. Configuration works (can enable/disable)

**REVIEW phase will challenge**:
1. Is detection accurate enough (>90%)?
2. Are error messages actually helpful?
3. Does observe mode provide value before enforcing?
4. Are we ready for Phase 2 (soft-block)?

---

**Next Phase**: PLAN (break down into implementation tasks)
