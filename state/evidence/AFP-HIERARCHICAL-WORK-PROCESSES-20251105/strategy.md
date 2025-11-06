# STRATEGIZE: Hierarchical Work Processes with Meta-Review

**Task ID:** AFP-HIERARCHICAL-WORK-PROCESSES-20251105
**Date:** 2025-11-05
**Phase:** STRATEGIZE (Phase 1 of 10)

---

## Problem Statement

**Current state:**

1. **Work processes exist ONLY at individual task level** (10-phase AFP lifecycle)
   - No cognitive framework for reasoning about task sets (groups of related tasks)
   - No cognitive framework for reasoning about epics (large features spanning multiple task sets)
   - No mechanism for work processes to edit the structure they're operating within

2. **No meta-review capability**
   - Work processes don't review themselves for flaws
   - No mechanism to improve work processes based on experience
   - Problems with work processes only discovered after failures
   - No mandatory remediation loop

3. **No self-improvement at process level**
   - Individual tasks get reviewed, but the PROCESS itself never improves
   - Work processes are static (don't evolve based on effectiveness data)
   - No feedback loop: "This work process phase is ineffective, let's improve it"

**What this means:**

**For hierarchical organization:**
- When autopilot works on a task set, it treats tasks as independent units
- No holistic view: "Are these 5 tasks actually solving the right problem?"
- No ability to say: "This task set is solving problem X, but we should DELETE task sets Y and Z"
- No self-editing: Work processes can't propose structural changes to the roadmap

**For meta-review:**
- Work processes can identify flaws in TASKS but not flaws in THE WORK PROCESS ITSELF
- Example: DesignReviewer might repeatedly flag same issue → no mechanism to improve DesignReviewer's template
- No mandatory followups when work process problems are found
- Processes degrade over time without self-correction

**Concrete example:**

```
Epic: Self-Editing Capability
├── Task Set: Roadmap Schema
│   ├── Task: Define TypeScript schema ✅
│   ├── Task: Write JSON schema validator ✅
│   └── Task: Create YAML parser ✅
│
│   [Task Set Work Process runs]
│   → Identifies: "These 3 tasks are too granular, should be 1 task"
│   → Creates: Remediation task to restructure task set
│   → Meta-review: "Task set process took 10 min (too slow), improve template"
│   → Creates: Followup task to optimize task set work process
│
└── Task Set: Mutation API
    ├── Task: Design API interface ✅
    └── Task: Implement CRUD operations ✅

    [Task Set Work Process runs]
    → Identifies: "Missing task: Add validation logic"
    → Creates: New task immediately
    → Meta-review: "Process didn't catch this earlier, improve ASSESS phase"
    → Creates: Followup to enhance ASSESS phase template
```

**Missing capabilities:**
1. Hierarchical work processes (task set, epic levels)
2. Self-editing (processes can mutate roadmap)
3. **Meta-review (processes review and improve themselves)**
4. **Mandatory remediation (flaws trigger automatic followup tasks)**
5. **Regular intervals (meta-reviews happen at meaningful milestones)**

---

## Root Cause Analysis

**Why don't hierarchical work processes with meta-review exist?**

### Root Cause 1: Historical evolution
- AFP 10-phase process was designed for atomic tasks first
- No abstraction for task sets/epics as cognitive units
- Single-level thinking (only task-scoped processes)

### Root Cause 2: No mutation capability
- Work processes are read-only; they can't edit roadmap structure
- Missing API for programmatic roadmap changes
- No guardrails for safe mutations

### Root Cause 3: No meta-cognitive framework
- **Deepest root cause**: Work processes have no mechanism to examine themselves
- "Quality checks" exist for code, but not for the quality checking process itself
- Meta-review is a second-order capability (review the review)
- Requires self-referential design (work process as both subject and object)

### Root Cause 4: No mandatory improvement loop
- When flaws are found, they're documented but not immediately remediated
- No enforcement that "finding a flaw = creating a remediation task"
- Optional followups → forgotten followups

**Deeper analysis:**

**Via Negativa gap at process level:**
- Work processes can identify tasks to add, but not task sets/epics to DELETE
- Work processes can identify code to improve, but not PROCESS PHASES to DELETE
- Missing: "This phase of the work process is useless, remove it"

**Refactor vs Repair gap at process level:**
- Work processes can patch individual tasks, but can't refactor entire epics
- Work processes can't refactor THEMSELVES (no self-refactoring)
- Missing: "This work process is fundamentally flawed, redesign it"

**No evolution at meta level:**
- Individual tasks evolve (feedback loop: code → metrics → lessons → better code)
- Work processes DON'T evolve (no feedback loop: process → effectiveness → lessons → better process)
- Missing: Pattern fitness tracking FOR WORK PROCESSES (which process templates work best?)

---

## Goal

**Enable autopilot to reason strategically at ALL organizational levels AND continuously improve the processes themselves:**

### Level 1: Task Level (existing)
- **Work Process:** 10-phase AFP (STRATEGIZE → MONITOR)
- **Cognitive lens:** "Does this code solve the immediate problem?"
- **Meta-review:** Critics review code quality

### Level 2: Task Set Level (NEW)
- **Work Process:** Task Set Coherence Process (5-7 phases, TBD)
- **Cognitive lens:** "Do these tasks collectively achieve their stated objective?"
- **Self-editing:** Can propose adding/removing/reordering tasks within the set
- **Meta-review:** Process reviews itself after each execution
  - "Did this process find the real issues?"
  - "Which phases were useful vs. wasteful?"
  - "How can we improve this process?"
- **Mandatory remediation:** Flaws found → immediate followup task created

### Level 3: Epic Level (NEW)
- **Work Process:** Epic Strategic Validation (6-8 phases, TBD)
- **Cognitive lens:** "Does this epic solve the RIGHT problem? Should we DELETE this epic?"
- **Self-editing:** Can propose restructuring task sets, splitting/merging epics
- **Meta-review:** Process reviews strategic effectiveness
  - "Did we catch strategic misalignment early enough?"
  - "Are our ROI thresholds correct?"
  - "Should we add/remove validation phases?"
- **Mandatory remediation:** Strategic flaws → immediate epic restructuring task

### Level 4: Meta-Process Level (NEW - CRITICAL)
- **Work Process:** Process Improvement Loop
- **Cognitive lens:** "Are our work processes effective? How can they improve?"
- **Self-editing:** Can propose changes to work process templates themselves
- **Triggers:**
  - After each task set/epic completion (regular interval)
  - When process execution time exceeds threshold
  - When process fails to catch critical issues
  - Quarterly meta-review of all processes
- **Mandatory actions:**
  1. Identify process flaws (through any lens: efficiency, effectiveness, coverage)
  2. Create remediation task IMMEDIATELY (not optional)
  3. Execute remediation task BEFORE continuing (blocking)
  4. Update process template with improvements
  5. Log lessons learned about process improvement

---

## Key Capabilities

### 1. Hierarchical Organization
- Task sets coordinate related tasks
- Epics validate strategic alignment
- Each level has appropriate work process (not one-size-fits-all)

### 2. Self-Editing
- Work processes can MUTATE the structure they're examining
- Example: Epic-level process discovers task set redundancy → proposes deletion
- Mutations must pass validation (no cycles, no breaking dependencies)

### 3. Meta-Review (NEW - PRIMARY FOCUS)
- **What it is:** Work processes review their own effectiveness
- **When it happens:**
  - After each execution (immediate)
  - At meaningful intervals (e.g., after every 10 task sets)
  - Triggered by anomalies (process takes too long, misses critical issues)
- **What it examines:**
  - Effectiveness: "Did this process catch real problems?"
  - Efficiency: "Did this process waste time on useless checks?"
  - Coverage: "What did this process miss?"
  - Template quality: "Are the process phases well-designed?"
- **Output:**
  - Specific flaws identified
  - Remediation tasks created (MANDATORY, not optional)
  - Process improvements proposed

### 4. Mandatory Remediation
- **Rule:** Finding a flaw = Creating a remediation task (automatic)
- **Enforcement:** Process cannot mark "complete" until remediation task exists
- **Execution:** Remediation task is HIGH PRIORITY (executed soon, not deferred)
- **Scope:** Remediation applies to:
  - Tasks (fix code)
  - Task sets (restructure tasks)
  - Epics (redesign strategy)
  - **Work processes themselves (improve templates)**

### 5. Regular Intervals
- **Immediate meta-review:** After each process execution
  - Quick check: "Any obvious flaws?"
  - < 30 seconds
- **Milestone meta-review:** After meaningful intervals
  - Every 10 task sets completed
  - Every epic shipped
  - Deep analysis: "What patterns of problems emerge?"
  - 5-10 minutes
- **Quarterly meta-review:** Every 3 months
  - Comprehensive process audit
  - Statistical analysis (which processes most effective?)
  - Major template redesign if needed
  - 1-2 hours

---

## AFP/SCAS Alignment

### Via Negativa (Delete before adding)

**At task/epic level:**
- Epic process asks: "Can we DELETE entire epics?"
- Task set process asks: "Can we DELETE tasks or merge task sets?"

**At meta-process level (NEW):**
- Meta-review asks: "Can we DELETE phases from work processes?"
- "Is this validation step actually useful, or just bureaucracy?"
- "Can we SIMPLIFY the process template?"
- Example: "ASSESS phase in task set process redundant with VALIDATE → delete ASSESS"

### Refactor Not Repair (Fix root causes)

**At task/epic level:**
- If 5 tasks in a set are all patches → Epic process flags for refactoring

**At meta-process level (NEW):**
- If work process repeatedly misses same type of issue → REFACTOR the process template
- Don't patch the template (add more checks) → Refactor the template (redesign phases)
- Example: "DesignReviewer always misses concurrency issues → refactor template to include concurrency analysis phase"

### Coherence (Match terrain)

**At task/epic level:**
- Task set work processes check pattern reuse

**At meta-process level (NEW):**
- Meta-review checks if work process matches the terrain
- "Is this work process appropriate for this type of task set?"
- "Should simple task sets have simpler process?"
- Pattern matching: "Which process templates work for which types of work?"

### Evolution (Patterns prove fitness)

**At task/epic level:**
- Track which epic structures ship fast vs. which stall

**At meta-process level (NEW):**
- Track which work process templates are most effective
- Metrics: process execution time, issues caught, false positives, remediation rate
- Evolve process templates based on fitness data
- Deprecate ineffective process phases
- Promote effective process patterns

**This is the key insight:** Work processes themselves are patterns that need fitness tracking and evolution.

---

## Strategic Questions

### 1. What are the right hierarchical levels?
- User suggested: Task, Task Set, Epic
- But maybe there are better abstractions?
- Meta-review will help discover optimal levels (data-driven)

### 2. How do meta-reviews work technically?
- **After task set process:** Log effectiveness metrics → Compare to threshold → If below, create remediation task
- **Storage:** state/analytics/process_effectiveness.jsonl
- **Metrics:** Time spent, issues found, false positives, coverage gaps
- **Decision:** Automatic (if metrics bad) or manual (human review)?

### 3. What makes remediation "mandatory"?
- **Enforcement:** Process execution marks "needs_remediation: true" if flaws found
- **Blocking:** Autopilot cannot proceed to next work until remediation task created
- **Priority:** Remediation tasks get HIGH priority in task queue
- **Verification:** Remediation must be executed before process can be used again

### 4. How to prevent infinite meta-review loops?
- Meta-review DOES NOT trigger another meta-review (1 level deep only)
- Cooldown period: Process template can't be changed more than once per day
- Thresholds: Only trigger meta-review if metrics significantly degraded (>20%)

### 5. Who executes remediation tasks?
- Autopilot executes remediation tasks autonomously (no human in loop)
- Exception: Major process redesign (>50% of template changing) requires human approval
- Safety: All process template changes go through AFP 10-phase process themselves

---

## Success Criteria Preview

**Will define in SPEC phase, but initial thinking:**

1. **Hierarchical work processes exist** (task set, epic levels)
2. **Self-editing capability** allows processes to propose roadmap mutations
3. **Meta-review runs automatically** after each process execution
4. **Remediation tasks created mandatorily** when flaws found
5. **Process templates improve over time** (measured via effectiveness metrics)
6. **Autopilot can execute** all levels autonomously (95% of time)

---

## Meta-Review Scope

**Types of flaws meta-review can catch:**

### 1. Effectiveness Flaws
- "Process didn't catch critical issue X"
- "Process flagged non-issue as problem (false positive)"
- "Process caught issue too late (should have caught in earlier phase)"

### 2. Efficiency Flaws
- "Process took 10 minutes but should take 2 minutes"
- "Process phase Y contributed no value"
- "Redundant checks between phases"

### 3. Coverage Flaws
- "Process never checks for Z type of issue"
- "Process missing security review"
- "Process doesn't validate dependencies"

### 4. Template Design Flaws
- "Process phases in wrong order"
- "Process template too complex (10 phases when 5 would work)"
- "Process template too rigid (doesn't adapt to different task types)"

### 5. Adoption Flaws
- "Process requires human intervention 50% of time (should be <5%)"
- "Process generates unclear output (autopilot can't parse)"
- "Process template lacks examples"

---

## Next Steps

1. **SPEC**: Define acceptance criteria for hierarchical work processes + meta-review
2. **PLAN**: Design the actual work process templates for each level + meta-review infrastructure
3. **THINK**: Reason through edge cases (infinite meta-review loops, conflicting remediations, etc.)
4. **GATE**: Validate design before implementing
5. **IMPLEMENT**: Build the work process infrastructure + meta-review system
6. **VERIFY**: Test on real task sets/epics, verify meta-review catches process flaws
7. **REVIEW**: Quality check
8. **MONITOR**: Track process effectiveness, trigger first meta-reviews

---

**Phase completion date**: 2025-11-05
**Strategist**: Claude Council

**Key insight**: The user's requirement for meta-review is CRITICAL. It transforms work processes from static templates into self-improving systems. This is the difference between "process compliance" (bureaucracy) and "process evolution" (continuous improvement).
