# AUTOPILOT VALIDATION RULES

**⚠️ CRITICAL: READ BEFORE ANY AUTOPILOT WORK ⚠️**

---

## Definition: What IS Autopilot?

### AUTOPILOT = Autonomous Development by AI Agents

**Minimum bar:** AI agents autonomously:
1. **Select tasks** from roadmap (decision-making)
2. **Write code** to implement tasks (code generation)
3. **Execute work** end-to-end (autonomous operation)
4. **Update state** (task status, evidence, logs)
5. **Continue** without human intervention (true autonomy)

### What IS Autopilot:

✅ **Agent selects next task and implements it** (writes code, commits, updates status)
✅ **Agent fixes bugs autonomously** (detects failure, writes fix, retries)
✅ **Agent makes design decisions** (chooses approach, writes implementation)
✅ **Agent runs full work process** (STRATEGIZE → MONITOR phases autonomously)

### What is NOT Autopilot:

❌ **Task tracking system** (just updates status, no code generation)
❌ **Logging/monitoring** (observability only, no autonomous action)
❌ **Scheduling/orchestration** (runs tasks but doesn't write code)
❌ **Human-driven with automation** (human decides, system executes)

### The Test:

**"Can the system write and deploy code WITHOUT human intervention?"**
- **YES** → This is autopilot
- **NO** → This is automation, not autopilot

---

## The ONLY Rule That Matters

### FOR AUTOPILOT AND ALL AI AGENT SYSTEMS:

## **BUILD PASSING IS NEVER EVER EVER EVER EVER SATISFACTORY**

---

## What Does NOT Count as Validation

### ❌ Build Passing

```bash
npm run build
✓ Compiled successfully
```

**DOES NOT MEAN:** Autopilot works
**ONLY MEANS:** Code has no syntax errors

### ❌ Tests Passing

```bash
npm test
✓ All tests passed
```

**DOES NOT MEAN:** Autopilot works
**ONLY MEANS:** Unit tests passed (which test isolated functions, not autonomous behavior)

### ❌ npm Audit Clean

```bash
npm audit
found 0 vulnerabilities
```

**DOES NOT MEAN:** Autopilot works
**ONLY MEANS:** No known security issues in dependencies

### ❌ Type Checking

```bash
npm run typecheck
✓ No type errors
```

**DOES NOT MEAN:** Autopilot works
**ONLY MEANS:** TypeScript types are correct

### ❌ Linting

```bash
npm run lint
✓ No linting errors
```

**DOES NOT MEAN:** Autopilot works
**ONLY MEANS:** Code follows style guidelines

---

## What DOES Count as Validation

### ✅ Live-Fire Execution on Real Tasks

```bash
npm run wave0
[Autopilot running...]
Task AFP-MVP-AGENTS-SCAFFOLD: completed
Task AFP-REVIEW-GATE: completed
Task AFP-DATA-QUALITY: blocked (missing dependency)
...
Success rate: 8/10 tasks (80%)
```

**THIS MEANS:** Autopilot actually works (or doesn't, and we learn why)

### Required Evidence

1. **Execution logs showing real task attempts**
   - state/analytics/wave0_runs.jsonl
   - Timestamps, task IDs, outcomes

2. **Evidence bundles for each task**
   - state/evidence/[TASK-ID]/summary.md
   - Actual work product, not just logs

3. **Success metrics**
   - X tasks completed / Y tasks attempted
   - Failure modes documented
   - Gaps identified

4. **Learnings captured**
   - What worked well
   - What broke
   - What's missing for next wave
5. **PLAN alignment**
   - The relevant `plan.md` lists the Wave 0 live loop (commands + telemetry)
   - VERIFY executes those steps and captures evidence (logs, screenshots, metrics)
6. **GitHub traceability**
   - Commit and push all autopilot code + evidence with the AFP task ID
   - Evidence lives under `state/evidence/<TASK-ID>/` and is versioned

---

## Reviewer Command Flow (Phases 1–4)

Before Autopilot transitions from THINK → IMPLEMENT, the following CLI commands **must** run for the active task:

```bash
cd tools/wvo_mcp
npm run strategy:review -- <TASK-ID>
npm run spec:review -- <TASK-ID>
npm run plan:review -- <TASK-ID>
npm run think:review -- <TASK-ID>
```

Each reviewer logs results to `state/analytics/<review>_reviews.jsonl` (`strategy_reviews.jsonl`, `spec_reviews.jsonl`, `plan_reviews.jsonl`, `thinking_reviews.jsonl`). The gate enforces these approvals; missing entries will block the transition.

---

## The Verification Loop for Autopilot

**Standard verification (for normal code):**
```
1. Build → 2. Test → 3. Audit → DONE ✅
```

**Autopilot verification (REQUIRED):**
```
1. Build → 2. Test → 3. Audit →
4. DEPLOY → 5. LIVE-FIRE (10+ tasks) →
6. ANALYZE results → 7. CAPTURE learnings → DONE ✅
```

**Steps 4-7 are NON-NEGOTIABLE for autopilot.**

---

## Why This Matters

### Autopilot is NOT Normal Code

**Normal code:**
- Deterministic behavior
- Predictable inputs/outputs
- Unit tests catch most bugs
- Build passing = high confidence

**Autopilot (AI agents):**
- Non-deterministic behavior (LLMs, complex logic)
- Emergent patterns in production
- Unit tests can't capture autonomous behavior
- Build passing = near-zero confidence

### Real Failures Happen in Production

**What builds miss:**
- Infinite loops in task selection
- State corruption from race conditions
- Token budget exhaustion
- Edge cases in roadmap parsing
- LLM hallucinations in decision-making
- Resource leaks over time
- Failure mode cascades

**ONLY live-fire testing reveals these.**

---

## Enforcement

### Pre-Commit Hook (Proposed)

```bash
# Check if autopilot code changed
if git diff --cached --name-only | grep -q "wave0/"; then
  echo "⚠️ Autopilot code changed"
  echo "❌ Build passing is NOT sufficient"
  echo "✅ Required: Live-fire validation logs"
  echo ""
  echo "Did you run: npm run wave0 (on real tasks)?"
  echo "Did you capture: state/analytics/wave0_runs.jsonl?"
  echo "Did you document: learnings in evidence bundle?"
  echo ""
  read -p "Confirm live-fire validation complete [y/N]: " confirm
  if [ "$confirm" != "y" ]; then
    echo "❌ Commit blocked - run live-fire validation first"
    exit 1
  fi
fi
```

### Code Review Checklist

When reviewing autopilot PRs:

- [ ] ❌ "Build passed" - NOT sufficient
- [ ] ❌ "Tests passed" - NOT sufficient
- [ ] ❌ "Looks good to me" - NOT sufficient
- [ ] ✅ "Ran on 10 production tasks, 8 completed, 2 blocked, learnings documented" - THIS is sufficient

### Documentation Requirement

Every autopilot PR MUST include:

**🔥 Live-Fire Validation Evidence:**
- Tasks attempted: [list task IDs]
- Success rate: X/Y (percentage)
- Failure modes: [document what broke]
- Learnings: [what did we learn]
- Validation logs: [link to state/analytics/wave0_runs.jsonl]

**Without this section, PR is automatically rejected.**

---

## Examples

### ❌ UNACCEPTABLE PR Description

```
## Changes
- Implemented Wave 0 autopilot
- Added task selection logic
- Added execution wrapper

## Testing
✓ Build passed
✓ Tests passed
✓ npm audit clean

Ready for review!
```

**REJECTED:** No live-fire validation

---

### ✅ ACCEPTABLE PR Description

```
## Changes
- Implemented Wave 0 autopilot
- Added task selection logic
- Added execution wrapper

## Testing
✓ Build passed
✓ Tests passed
✓ npm audit clean

## 🔥 Live-Fire Validation
**Tasks attempted:** 10 (AFP-MVP-AGENTS-SCAFFOLD, AFP-REVIEW-GATE, ...)
**Success rate:** 8/10 (80%)
**Failure modes:**
- 2 tasks blocked due to missing dependencies
- Task selection correctly skipped in_progress tasks
**Learnings:**
- Wave 0 successfully handles basic task loop
- Needs dependency resolution for Wave 1
- Rate limiting (5 min) is appropriate
**Evidence:** state/analytics/wave0_runs.jsonl (10 entries)

Ready for review!
```

**APPROVED:** Live-fire validation documented

---

## Cultural Shift Required

### Old mindset (WRONG):
> "I built it, tests pass, ship it"

### New mindset (CORRECT):
> "I built it, tests pass, NOW let me run it on 10 production tasks to see if it actually works"

### Old question (WRONG):
> "Does it compile?"

### New question (CORRECT):
> "What happened when you ran it on real tasks?"

### Old success metric (WRONG):
> "Code merged"

### New success metric (CORRECT):
> "Tasks completed in production"

---

## Exceptions (None)

**Q:** "What if it's just a small fix?"
**A:** STILL needs live-fire validation. Small fixes can have big impacts on autonomous behavior.

**Q:** "What if I'm confident it works?"
**A:** Confidence is NOT validation. Run it on real tasks.

**Q:** "What if live-fire testing is slow?"
**A:** Then we need faster validation, not skipped validation.

**Q:** "What if it's urgent?"
**A:** Urgent is when you MOST need validation. Rushing = incidents.

**There are NO exceptions to live-fire validation for autopilot.**

---

## TL;DR

### THE RULE:

# **AUTOPILOT BUILDS ARE NEVER EVER EVER EVER EVER SATISFACTORY**

### ONLY LIVE-FIRE VALIDATION ON REAL TASKS COUNTS

### IF YOU DIDN'T RUN IT ON PRODUCTION TASKS, YOU DIDN'T TEST IT

---

**Document Owner:** Claude Council
**Enforcement:** Pre-commit hooks + Code review
**Exceptions:** NONE
**Negotiable:** NO

**Read this before EVERY autopilot change.**
