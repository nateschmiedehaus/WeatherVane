# STRATEGIZE - Hierarchical Work Process Enforcement

**Task:** AFP-W5-M1-HIERARCHICAL-PROCESS-ENFORCEMENT
**Date:** 2025-11-05
**Agent:** Claude Council

---

## WHY (Problem Analysis)

### Root Cause
Agents are skipping the hierarchical work process structure. I just violated this by jumping straight to implementation without recognizing that I should be operating at the **task set** or **epic** level, not just individual task level.

The work_process_schema defines THREE cognitive levels:
1. **Task level**: AFP 10-phase (STRATEGIZE → MONITOR)
2. **Task Set level**: 6-phase (ASSESS → VALIDATE → VIA_NEGATIVA → OPTIMIZE → DOCUMENT → META-REVIEW)
3. **Epic level**: 7-phase (STRATEGIZE → ALTERNATIVES → ROI → VIA_NEGATIVA → STRUCTURE → DOCUMENT → META-REVIEW)

**Current Problem:** No enforcement ensures agents execute at the correct hierarchical level. Agents can:
- Skip task-set process when working on multiple related tasks
- Skip epic process when working on strategic initiatives
- Jump to individual task implementation without higher-level cognitive work

### Strategic Context (AFP/SCAS Alignment)

**COHERENCE**: Each hierarchical level has appropriate cognitive depth
- Individual tasks: Tactical execution
- Task sets: Validate coherence across related tasks
- Epics: Strategic analysis and alternative evaluation

**ECONOMY**: Higher-level processes prevent waste
- Task-set VIA_NEGATIVA: "Can we DELETE tasks?" (before implementing all)
- Epic ALTERNATIVES: "Is this the right approach?" (before committing resources)

**VISIBILITY**: Hierarchical structure makes organizational thinking explicit
- Task sets document validation and optimization decisions
- Epics document strategic analysis and ROI

**EVOLUTION**: Meta-review at each level improves processes
- Task-set meta-review: "Did our validation catch issues?"
- Epic meta-review: "Was our strategic analysis sufficient?"

**LOCALITY**: Each level operates at appropriate scope
- Tasks: File-level changes
- Task sets: Module-level coherence
- Epics: System-level architecture

### Goal
Implement pre-execution enforcement that guides agents to the correct hierarchical level and blocks execution without appropriate evidence bundle.

---

## Current State Analysis

**No Hierarchical Enforcement:**
- Only individual task enforcement exists (pre-commit hooks)
- No check for task-set or epic-level processes
- Agents can execute tasks in isolation without higher-level context

**Violation Example (Just Happened):**
- User requested "work through the first 3 tasks"
- I should have recognized: 3 related tasks = **task set**
- Should have executed: ASSESS → VALIDATE → VIA_NEGATIVA → OPTIMIZE → DOCUMENT → META-REVIEW
- Instead: Jumped straight to individual task implementation

**Risk:** Building without strategic validation leads to:
- Wasted effort on tasks that should be deleted
- Missing coherence issues across related tasks
- No meta-review to improve processes

---

## Alternatives Considered

### Alternative 1: Agent self-awareness (trust agents to choose correct level)
**Pros:** No enforcement overhead
**Cons:**
- Just failed - I didn't self-identify the correct level
- No forcing function to ensure compliance
- Meta-review doesn't happen

### Alternative 2: Pre-execution enforcement (CHOSEN)
**Pros:**
- Forces cognitive work at appropriate level
- Provides clear guidance when violated
- Creates evidence trail for meta-review
**Cons:**
- Requires identifying task/task-set/epic boundaries
- Slight execution overhead

### Alternative 3: Post-execution audit
**Pros:** Non-blocking
**Cons:** Damage already done, no prevention

**DECISION:** Pre-execution enforcement (Alternative 2) - only way to prevent violations.

---

## Success Criteria

**Technical:**
- Pre-execution check identifies hierarchical level (task/task-set/epic)
- Blocks execution without appropriate evidence bundle
- Provides clear error message with process guidance
- Override mechanism for edge cases (logged)

**Process Evidence Requirements:**
- Task level: strategy.md exists (AFP 10-phase)
- Task-set level: assessment.md exists (6-phase)
- Epic level: strategic_analysis.md exists (7-phase)

**AFP/SCAS:**
- COHERENCE: Enforcement ensures appropriate cognitive depth
- ECONOMY: Prevents wasted work via higher-level processes
- VISIBILITY: Evidence bundles document hierarchical thinking
- EVOLUTION: Meta-review at each level tracked

---

## Implementation Scope

**Files to Change:**
1. `.git/hooks/pre-commit` - Add hierarchical level check (~50 LOC)
2. New: `tools/wvo_mcp/src/enforcement/hierarchy_check.ts` - Hierarchical level detection logic (~100 LOC)
3. New test: `hierarchy_check.test.ts` - Validation tests (~80 LOC)

**LOC Estimate:**
- pre-commit enhancement: +50 LOC
- hierarchy_check.ts: ~100 LOC
- hierarchy_check.test.ts: ~80 LOC
- **Total:** ~230 LOC

**Complexity:** MEDIUM
- Requires heuristics to detect level (task/task-set/epic)
- Needs clear error messaging
- Must integrate with existing hooks

**Via Negativa Check:** Can we delete instead?
- No - this is NEW functionality (hierarchical enforcement)
- No existing enforcement covers this

**Refactor vs Repair:** Refactor
- Enhancing enforcement architecture (not patching)
- Adding new capability to existing hook infrastructure

---

## Next Phase: SPEC

Define precise heuristics for detecting hierarchical level and acceptance criteria for enforcement.
