# Task Brief: Review unified_orchestrator.ts (CRITICAL)

**Task ID**: AFP-GATE-TEST-REVIEW-ORCHESTRATOR-20251105

**Parent**: AFP-GATE-TEST-MACRO-20251105

**Complexity**: Complex (STRESS TEST)

**Estimated Time**: 6-8 hours (or planning for decomposition)

---

## Objective

Review `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` and plan decomposition strategy for the largest file in the codebase.

**Focus**: This is NOT a single-task refactor. This is a **planning exercise** to design the decomposition approach.

---

## Findings from Exploration

**File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

**Size**: 3,858 LOC (MONOLITH)

**Critical Issue**: Too Large for Single Batch

This file is **26x the micro-batching limit** (+150 LOC).

Even if we DELETE 2,000 LOC, we'd still exceed limits.

**This cannot be one task.**

---

## The Real Task

**NOT:** "Fix the orchestrator"

**ACTUAL:** "Design the decomposition strategy"

**This tests GATE's ability to handle:**
1. Work that's too big for one batch
2. Requires architectural planning BEFORE coding
3. Must produce a multi-phase execution plan
4. Via negativa at scale (what can we DELETE from 3,858 LOC?)

---

## Issues Identified

### Issue 1: Mixed Responsibilities (AFP Violation)
**Current state:**
- Task routing
- Model selection
- Policy control
- Preflight validation
- Background task execution
- Health monitoring
- Escalation
- Evidence assembly
- **50+ dependencies**

**Problem:** Violates single responsibility principle at massive scale

### Issue 2: No Clear Boundaries
**Specific hotspots:**
- Lines 1-500: Complex initialization
- Lines ~1500-1700: Task classification (could be extracted)
- Lines ~2500-2700: Background task coordination (could be extracted)
- Lines ~3000-3200: Evidence assembly (could be extracted)

**Problem:** Can't safely refactor one concern without understanding all others

### Issue 3: Testing Nightmare
**Current reality:**
- 3,858 LOC file is nearly impossible to unit test
- Integration tests are brittle (too many dependencies)
- Changes anywhere can break anywhere

---

## Expected Deliverables (PLANNING, NOT IMPLEMENTATION)

### Deliverable 1: Decomposition Map
**Content:**
- Current responsibilities identified (list of 10-15)
- Proposed module boundaries
- Dependency graph between new modules
- Which concerns stay in orchestrator, which extract

**Format:** Architecture document with diagrams

### Deliverable 2: Phased Execution Plan
**Content:**
- 5-8 separate refactoring tasks
- Each task under micro-batching limit
- Dependency order (which must go first)
- Risk assessment for each phase

**Format:** Task breakdown with LOC estimates

### Deliverable 3: Via Negativa Analysis
**Content:**
- What can we DELETE? (not just extract)
- Dead code identification
- Redundant logic
- Over-abstracted patterns

**Goal:** Reduce total LOC, not just redistribute

### Deliverable 4: Testing Strategy
**Content:**
- How to maintain correctness during decomposition
- Integration test preservation
- Regression test approach

**Format:** Test plan

---

## Alternatives to Consider

### Alternative 1: Big Bang Refactor (NOT RECOMMENDED)
- Decompose everything at once
- **Problem:** Exceeds micro-batching limit by 26x
- **Problem:** High risk of breaking everything
- **Problem:** Violates AFP principles

### Alternative 2: Strangler Fig Pattern (RECOMMENDED)
- Extract one module at a time
- Old code delegates to new module
- Gradually replace old implementation
- Each phase is separate task under limits

**Example phases:**
1. Extract TaskRouter (200 LOC)
2. Extract PolicyEngine (250 LOC)
3. Extract EvidenceAssembler (300 LOC)
4. Extract HealthMonitor (150 LOC)
5. Refactor remaining core (delete 500+ LOC)

### Alternative 3: Freeze + Rewrite (RISKY)
- Stop changes to current orchestrator
- Build new orchestrator from scratch
- Switch over when ready
- **Problem:** High risk, duplicate effort

---

## Success Criteria

**This task succeeds if:**

✅ **Decomposition plan is detailed:**
- All responsibilities identified
- Clear module boundaries
- Dependency order specified
- Each phase under micro-batching limit

✅ **Via negativa is applied:**
- Identified deletion opportunities (>500 LOC target)
- Not just moving code, actually simplifying

✅ **Plan is executable:**
- Each phase is a real task brief
- LOC estimates are realistic
- Risks are identified

✅ **GATE process is stress-tested:**
- DesignReviewer handles architectural planning
- Design document is comprehensive (200-300 LOC expected)
- Alternatives are deeply analyzed

---

## GATE Test Value

**This is the ultimate GATE stress test:**

1. **Scale:** 3,858 LOC can't be fixed in one batch
2. **Complexity:** Requires architectural thinking, not just coding
3. **Alternatives:** Multiple decomposition strategies possible
4. **Via Negativa:** Must identify deletion opportunities at scale
5. **Planning:** Tests whether GATE works for planning tasks, not just implementation

**Expected outcome:**
- Design document is 250-350 LOC (most detailed yet)
- DesignReviewer may flag insufficient analysis
- Remediation cycles likely (this is hard!)
- If GATE works here, it works for anything

---

## Deliverables

1. **design.md** (250-350 LOC) - Architectural decomposition plan
2. **decomposition_map.md** - Visual/textual module boundaries
3. **phase_execution_plan.md** - 5-8 subtask briefs
4. **via_negativa_analysis.md** - What to DELETE (target: >500 LOC)
5. **testing_strategy.md** - How to maintain correctness
6. **metrics.yaml** - GATE effectiveness on complex planning
7. **summary.md** - Recommendations

---

## Key GATE Questions

1. Can GATE handle planning tasks (not just implementation)?
2. Does DesignReviewer recognize when a task is too big?
3. Is via negativa analysis meaningful at 3,858 LOC scale?
4. Can alternatives be evaluated for architectural decisions?

---

**This is NOT a coding task. This is an ARCHITECTURAL PLANNING task.**

**If you're writing TypeScript, you've misunderstood the assignment.**

**Start with GATE, create the decomposition design document.**
