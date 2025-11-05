# Iterative GATE Process

**Purpose:** Ensure significant effort is spent on design review and remediation, preventing compliance theater.

---

## Overview

GATE (phase 5) is **NOT a checkbox** - it's an **iterative review cycle** that may take 2-3 rounds before approval.

```
STRATEGIZE → SPEC → PLAN → THINK
                ↓
            [GATE] ← You are here
                ↓
         design.md created
                ↓
         DesignReviewer
                ↓
         ┌──────┴──────┐
         │             │
    APPROVED    NEEDS REVISION
         │             │
         │             ↓
         │      REMEDIATION CYCLE
         │      (30-60 min/issue)
         │             │
         │      Update strategy/spec/plan
         │             │
         │      Update design.md
         │             │
         │      Re-submit
         │             │
         └─────────────┘
                ↓
           IMPLEMENT
```

---

## Why GATE is Iterative

**Problem with single-pass review:**
- Agent writes superficial design.md
- Gets blocked
- Makes minimal edits to pass
- **Compliance theater** ❌

**Solution with iterative review:**
- Agent writes initial design.md
- DesignReviewer finds issues
- Agent creates **REMEDIATION TASK** (new cycle)
- Agent does **REAL research** (30-60 min per issue)
- Agent **updates upstream artifacts** (strategy, spec, plan)
- Agent updates design.md with findings
- Re-submits for review
- May iterate 2-3 times until solid
- **Real thinking enforced** ✅

---

## Remediation Cycle Requirements

When DesignReviewer finds issues, agent MUST:

### 1. Create New Task

**Format:** `ORIGINAL-TASK-ID-REMEDIATION-{timestamp}`

**Example:** `AFP-CACHE-FIX-20251105-REMEDIATION-1731019234`

**Purpose:**
- Makes remediation work **visible and trackable**
- Enforces new STRATEGIZE→MONITOR loop
- Prevents quick edits to pass GATE

### 2. Start at STRATEGIZE (Not IMPLEMENT)

**From Autonomous Continuation Mandate:**
> "Any 'next step' that produces new work must spin up a fresh STRATEGIZE→MONITOR loop. Never jump directly to IMPLEMENT, even when the follow-up feels obvious."

**What this means:**
- STRATEGIZE: Why did DesignReviewer flag this? What's the real problem?
- SPEC: What does "good via negativa analysis" look like?
- PLAN: How will I explore deletion/simplification approaches?
- THINK: What existing code should I examine? What questions to ask?
- Then do the work (research, analysis, exploration)

### 3. Do Actual Research (30-60 min per critical issue)

**Via Negativa Remediation:**
- List 5-10 existing files/functions
- For EACH: Could it be deleted? Simplified? Consolidated?
- Document WHY deletion won't work (be specific)
- **Expected time:** 30+ minutes

**Refactor Analysis Remediation:**
- Identify target file/function
- If >200 LOC or >50 LOC: Design FULL refactor
- Don't just say "I considered it" - show the design
- Compare: patch cost vs refactor cost
- **Expected time:** 45+ minutes

**Alternatives Exploration Remediation:**
- Research 3-5 different approaches
- For EACH: Pros, cons, complexity, AFP/SCAS alignment
- Justify selection with trade-off analysis
- **Expected time:** 30+ minutes

### 4. Update UPSTREAM Artifacts (Not Just design.md)

**Critical:** design.md is a SUMMARY of phases 1-4. If DesignReviewer finds fundamental issues, you must GO BACK and revise the underlying work.

**Examples:**

**Via negativa concern:**
- Update `PLAN.md` with deletion analysis findings
- Show specific files/LOC that could be deleted
- Explain why deletion doesn't work (with evidence)
- Update design.md Via Negativa section with summary

**Refactor concern:**
- Update `STRATEGY.md` to target root cause, not symptom
- Add full refactor approach to `PLAN.md`
- Include LOC estimates, complexity analysis
- Update design.md Refactor section with summary

**Alternatives concern:**
- Add new alternatives to `SPEC.md`
- Document trade-offs in `PLAN.md`
- Update design.md Alternatives section with summary

### 5. Track Effort in design.md

**Template includes GATE Review Tracking section:**

```markdown
### Review 1: 2025-11-05
- **DesignReviewer Result:** needs-revision
- **Concerns Raised:** via_negativa_missing (high), insufficient_alternatives (medium)
- **Remediation Task:** AFP-CACHE-FIX-20251105-REMEDIATION-1731019234
- **Time Spent:** 2.5 hours (1.5h via negativa research, 1h alternatives analysis)

### Review 2: 2025-11-05
- **DesignReviewer Result:** approved
- **Final Approval:** yes
- **Total GATE Effort:** 3.5 hours (initial design 1h + remediation 2.5h)
```

**Why track effort:**
- Demonstrates **real work**, not compliance theater
- Shows AFP/SCAS compliance is **expensive but valuable**
- Makes superficial fixes **visible and unacceptable**
- Builds culture of **thoughtful design**

### 6. Re-submit for Review

- Stage updated design.md
- DesignReviewer will re-review
- May approve, or find new issues
- **2-3 iterations is NORMAL and GOOD**

---

## Enforcement Mechanisms

### 1. DesignReviewer Logs Remediations

**File:** `state/analytics/gate_remediations.jsonl`

**Entry format:**
```json
{
  "timestamp": "2025-11-05T10:30:00Z",
  "task_id": "AFP-CACHE-FIX-20251105",
  "concerns_count": 2,
  "high_severity_count": 1,
  "summary": "Design needs revision: via negativa missing",
  "concerns": [...]
}
```

**Purpose:**
- Makes remediation work **trackable**
- Can analyze: How often is GATE catching issues?
- Can measure: Average remediation effort
- Can adapt: Are certain patterns common?

### 2. Remediation Instructions Enforce New Cycle

When DesignReviewer blocks, it returns **specific instructions:**

```
⚠️  GATE REMEDIATION REQUIRED

You have 2 design concerns (1 critical).

**DO NOT just edit design.md to pass GATE.** That's compliance theater.

You must:

1. **START A NEW REMEDIATION CYCLE**
   - Create new task: AFP-CACHE-FIX-20251105-REMEDIATION-1731019234
   - Start fresh at STRATEGIZE phase
   - Document: What did DesignReviewer flag? Why is it a problem?

2. **DO THE ACTUAL THINKING WORK**
   VIA NEGATIVA REMEDIATION:
   - List 5-10 existing files/functions in codebase
   - For EACH: Could it be deleted? Simplified? Consolidated?
   - Document why deletion won't work (be specific)
   - This takes TIME - expect 30+ minutes of exploration

3. **UPDATE UPSTREAM ARTIFACTS (not just design.md)**
   - Remediation may require changing your STRATEGY, SPEC, or PLAN
   - Update those phase documents based on what you learned
   - THEN update design.md to reflect revised approach

...
```

### 3. Template Forces Iteration Tracking

Can't hide that you took shortcuts - effort is documented.

### 4. Claude Instructed to Reject Superficial Fixes

From CLAUDE.md:
> "Reject superficial fixes - only approve when real work demonstrated"

---

## Expected vs Actual Patterns

### GOOD Pattern (Real Work)

```
10:00 AM: Agent creates design.md (1 hour)
11:00 AM: DesignReviewer review → needs revision (via negativa missing)
11:15 AM: Agent creates AFP-TASK-REMEDIATION task
11:15 AM: Agent starts STRATEGIZE phase for remediation
11:30 AM: Agent researches existing cache code (45 min)
12:15 PM: Agent updates PLAN.md with deletion analysis
12:30 PM: Agent updates design.md with findings
12:45 PM: Agent re-submits for review
12:50 PM: DesignReviewer review → approved ✅
01:00 PM: Agent proceeds to IMPLEMENT

Total GATE effort: 3 hours
Iterations: 2
Real thinking: YES
```

### BAD Pattern (Compliance Theater) - Should Be Rejected

```
10:00 AM: Agent creates design.md (30 min, superficial)
10:30 AM: DesignReviewer review → needs revision
10:35 AM: Agent adds paragraph "I considered deletion" (5 min)
10:40 AM: Agent re-submits
10:45 AM: DesignReviewer review → STILL needs revision ❌
           (Detected superficial fix)

Agent must do real remediation cycle.
```

---

## Metrics to Track

**From `state/analytics/gate_remediations.jsonl`:**

1. **Remediation Rate:** % of designs needing revision
2. **Average Iterations:** Mean number of review rounds
3. **Effort Per Issue:** Time spent per concern type
4. **Common Patterns:** Which concerns appear most?
5. **Agent Performance:** Which agents need most remediation?

**Adaptive thresholds:**
- If remediation rate >80%: Agents not thinking enough initially
- If remediation rate <20%: GATE may be too lenient
- If effort <15 min/issue: Likely superficial fixes
- If effort >2 hours/issue: May need better guidance

---

## Integration with Autopilot vs Manual

### Autopilot Mode

```typescript
// Autopilot workflow includes GATE
const task = await getNextTask();

// Agent creates design.md
await createDesign(task.id);

// DesignReviewer runs automatically
const review = await designReviewer.reviewDesign(task.id);

if (!review.passed) {
  // Create remediation task
  const remediationTask = await createTask({
    id: `${task.id}-REMEDIATION-${Date.now()}`,
    parent: task.id,
    phase: "STRATEGIZE",
  });

  // Agent works on remediation
  await executeTask(remediationTask);

  // Re-review after remediation
  const review2 = await designReviewer.reviewDesign(task.id);

  // May iterate multiple times
}

// Only when approved, proceed to IMPLEMENT
await implement(task.id);
```

### Manual Mode (You + Agent)

```
You: "Let's implement cache improvements"

Agent: "I'll start by creating design documentation."
       [Creates design.md]

Agent: "Submitting for DesignReviewer..."

DesignReviewer: "Design needs revision - via negativa missing"
                [Shows remediation instructions]

Agent: "I need to do via negativa analysis. Creating remediation task."
       "This will take 30-45 minutes to properly explore deletion approaches."

       [Agent does research, updates PLAN.md, updates design.md]

Agent: "Re-submitting design for review..."

DesignReviewer: "Approved - good via negativa analysis showing 3 files
                 examined for deletion with specific reasons why
                 consolidation is needed instead."

Agent: "GATE approved. Proceeding to IMPLEMENT."
```

---

## Key Takeaways

1. **GATE is iterative** - expect 2-3 review rounds
2. **Remediation is expensive** - 30-60 min per critical issue
3. **Update upstream artifacts** - not just design.md
4. **Track effort** - demonstrates real work
5. **New cycle for remediation** - full STRATEGIZE→MONITOR loop
6. **Superficial fixes rejected** - DesignReviewer detects them
7. **This is GOOD** - prevents compliance theater, ensures quality

**GATE effort is an investment in quality, not overhead.**

---

**Version:** 1.0.0
**Last Updated:** 2025-11-05
**Related:** [AFP Work Phases](/docs/concepts/afp_work_phases.md), [DesignReviewer Critic](/tools/wvo_mcp/src/critics/design_reviewer.ts)
