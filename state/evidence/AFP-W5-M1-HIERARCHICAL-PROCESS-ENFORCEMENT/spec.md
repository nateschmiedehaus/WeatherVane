# SPEC - Hierarchical Work Process Enforcement

**Task:** AFP-W5-M1-HIERARCHICAL-PROCESS-ENFORCEMENT
**Date:** 2025-11-05

---

## Functional Requirements

### FR1: Hierarchical Level Detection
**Input:** Commit message, staged files, current context
**Output:** Detected level (task | task-set | epic) or error
**Logic:**
- **Task**: Single task ID mentioned (e.g., "AFP-W5-M1-PROPERTY-BASED-TESTING")
- **Task Set**: Multiple related task IDs (e.g., "work through tasks T1, T2, T3") OR user explicitly states "task set"
- **Epic**: Epic ID mentioned (e.g., "WAVE-5") OR user explicitly states "epic"

### FR2: Evidence Bundle Validation
**Input:** Task/task-set/epic ID, detected level
**Output:** Pass/fail + missing files
**Logic:**
- Task level: Require `state/evidence/[ID]/strategy.md`
- Task-set level: Require `state/evidence/[ID]/assessment.md`
- Epic level: Require `state/evidence/[ID]/strategic_analysis.md`

### FR3: Enforcement Action
**When:** Pre-commit hook execution
**Action:** Block commit if evidence missing
**Message Template:**
```
❌ HIERARCHICAL PROCESS VIOLATION

Detected Level: [task-set]
Task Set: [AFP-W5-M1-TASKS-1-3]
Missing: state/evidence/AFP-W5-M1-TASKS-1-3/assessment.md

Required Process: Task Set (6 phases)
1. ASSESS: Understand task set scope and dependencies
2. VALIDATE: Check coherence across tasks
3. VIA_NEGATIVA: Can we delete any tasks?
4. OPTIMIZE: Sequence and resource allocation
5. DOCUMENT: Create task set plan
6. META-REVIEW: Analyze process effectiveness

Create evidence bundle:
  mkdir -p state/evidence/AFP-W5-M1-TASKS-1-3
  # Execute 6-phase process
  # Create assessment.md

Override (if truly needed):
  SKIP_HIERARCHY_CHECK=1 git commit
```

### FR4: Override Mechanism
**Trigger:** `SKIP_HIERARCHY_CHECK=1` environment variable
**Action:** Log to `state/overrides.jsonl` with reason
**Format:**
```json
{
  "timestamp": "2025-11-05T19:55:00Z",
  "type": "hierarchy_check_skipped",
  "level": "task-set",
  "id": "AFP-W5-M1-TASKS-1-3",
  "reason": "Emergency fix, will remediate post-commit"
}
```

---

## Non-Functional Requirements

### NFR1: Performance
- Hook execution: <500ms overhead
- No external dependencies

### NFR2: Usability
- Clear error messages with remediation steps
- Examples in error output

### NFR3: Maintainability
- Detection logic in separate module (testable)
- Hook just calls module

---

## Acceptance Criteria

**AC1:** Task-level detection
- GIVEN: Commit message "feat: implement AFP-W5-M1-TASK-NAME"
- WHEN: Pre-commit hook runs
- THEN: Detects level = "task", requires strategy.md

**AC2:** Task-set detection
- GIVEN: Commit message mentions 2+ related tasks OR "task set"
- WHEN: Pre-commit hook runs
- THEN: Detects level = "task-set", requires assessment.md

**AC3:** Epic detection
- GIVEN: Commit message mentions "WAVE-X" OR "epic"
- WHEN: Pre-commit hook runs
- THEN: Detects level = "epic", requires strategic_analysis.md

**AC4:** Blocking behavior
- GIVEN: Missing evidence bundle for detected level
- WHEN: Pre-commit hook runs
- THEN: Commit blocked with clear error message

**AC5:** Override logging
- GIVEN: SKIP_HIERARCHY_CHECK=1 set
- WHEN: Commit proceeds
- THEN: Override logged to state/overrides.jsonl

---

## Out of Scope

- Automatic evidence bundle creation (agent must create)
- Validation of evidence bundle CONTENT (only existence checked)
- Post-commit remediation (separate task)

---

## Next Phase: PLAN

Design detection heuristics and hook integration architecture.
