# THINK - Edge Cases & Failure Modes

**Task:** AFP-W5-M1-HIERARCHICAL-PROCESS-ENFORCEMENT

---

## Edge Cases

**EC1: Ambiguous level detection**
- Message: "Fix bugs in AFP-W5-M1-TASK1 and AFP-W5-M1-TASK2"
- Detected: task-set
- Risk: User might intend separate commits
- Mitigation: Error message suggests creating task-set bundle OR committing separately

**EC2: No task ID in message**
- Message: "fix typo"
- Detected: unknown
- Action: Allow (don't block trivial changes)

**EC3: Mixed levels**
- Message: "Work on WAVE-5 tasks AFP-W5-M1-TASK1, AFP-W5-M1-TASK2"
- Detected: Could be epic OR task-set
- Mitigation: Prioritize epic (higher level takes precedence)

**EC4: Evidence bundle exists but wrong level**
- Have: `state/evidence/AFP-W5-M1-TASK1/strategy.md`
- Detected: task-set (2 tasks mentioned)
- Missing: assessment.md for task-set
- Action: Block, guide to create task-set bundle

---

## Failure Modes

**FM1: Hook doesn't run (bypassed)**
- Cause: User uses `--no-verify`
- Impact: Enforcement skipped entirely
- Mitigation: Log override explicitly, weekly review

**FM2: False negatives (should block, doesn't)**
- Cause: Detection heuristic misses pattern
- Impact: Process violation allowed
- Mitigation: Iterative improvement based on override logs

**FM3: Performance degradation**
- Cause: Hook takes >1s
- Impact: Poor UX
- Mitigation: Bash-only implementation, no external tools

**FM4: Evidence bundle deleted mid-work**
- Cause: Agent deletes bundle accidentally
- Impact: Blocks commit even though work was done properly
- Mitigation: Error message suggests recreating or overriding

---

## Complexity Analysis

**Cyclomatic Complexity:** LOW
- Simple if/else logic
- Pattern matching with regex
- File existence checks

**Integration Complexity:** LOW
- Adding to existing hook infrastructure
- No new dependencies

**Cognitive Complexity:** MEDIUM
- Users must understand hierarchical levels
- Error messages must teach, not just block

---

## Mitigation Strategies

1. **Clear Documentation:** Add examples to error messages
2. **Iterative Improvement:** Collect override reasons, refine heuristics
3. **Escape Hatch:** SKIP_HIERARCHY_CHECK for emergencies
4. **Meta-Review:** Weekly review of overrides to improve detection

---

## Next Phase: GATE (design.md)
