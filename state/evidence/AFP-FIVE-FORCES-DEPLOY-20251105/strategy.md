# Strategy: AFP Five Forces Deployment

**Task ID:** AFP-FIVE-FORCES-DEPLOY-20251105
**Date:** 2025-11-05
**Phase:** STRATEGIZE

---

## IF: Should We Even Do This?

**Critical question:** Is deploying five forces framework worth the disruption?

**Arguments FOR:**
- Current AFP is incomplete (missing pattern reuse, evolution)
- Code muck accumulates ~1000 LOC/day without controls
- GATE testing revealed pattern blindness (Tasks 1, 4)
- No learning mechanism (repeat same mistakes)
- Earlier intervention = less refactoring debt

**Arguments AGAINST:**
- Adds friction to development (pre-commit checks)
- Unproven framework (no empirical validation yet)
- Risk of over-engineering (paralysis by analysis)
- Could slow velocity short-term
- Maybe existing 6 principles are "good enough"

**Decision:** YES, deploy. The cost of NOT doing this (unbounded code muck) exceeds cost of doing it (some friction). BUT we need escape hatch and 2-week review to kill if not working.

---

## Problem Statement

**Immediate Crisis:**
Code is being written RIGHT NOW without AFP principles. Every hour of delay creates technical debt that compounds. In 6 days we'll have thousands of lines of code muck that violates:
- Pattern reuse (duplicate code everywhere)
- Via negativa (unbounded growth)
- Complexity control (god objects)
- Error handling (silent failures)
- Learning (no pattern evolution)

**Root Cause:**
Current AFP has 6 ad-hoc principles without coherent framework. Missing:
- Pattern recognition/reuse (COHERENCE)
- Pattern evolution/fitness (EVOLUTION)
- Formalized measurement
- Mechanical enforcement

**Evidence:**
- GATE testing campaign (Tasks 1-5) revealed pattern reuse gaps
- Task 1: Didn't check if other evaluators use config patterns
- Task 4: Error handling patterns inconsistent across modules
- No mechanism to track which patterns work vs fail
- 3,858 LOC monolith exists (Task 5) - complexity unchecked

---

## Goal (WHY)

**Primary:** Stop code muck accumulation by deploying five forces framework TODAY.

**Specific objectives:**
1. Formalize AFP as five coherent forces (not 6 ad-hoc rules)
2. Make principles mechanically enforceable (pre-commit hook)
3. Start pattern fitness tracking (evolution data)
4. Provide actionable guidance (not just philosophy)

**Success metric:** Every commit after deployment follows five forces OR explicitly justifies deviation.

---

## WHEN: Timing Analysis

**Why NOW specifically?**
- GATE testing just completed (fresh insights on gaps)
- Codebase at inflection point (998 tests, growing complexity)
- Roundtable consensus reached (momentum exists)
- Small team (easier to coordinate change)

**Why NOT wait?**
- Every day of delay = more code muck to refactor
- Patterns solidifying without fitness tracking
- Cost of change increases with codebase size
- Fresh context from GATE testing will fade

**Why NOT earlier?**
- Didn't have five forces framework yet (just developed)
- Needed GATE testing evidence (Tasks 1-5 provided it)
- Needed expert synthesis (roundtable discussion)

**Timing decision:** Deploy TODAY. Window of opportunity closes as codebase grows.

---

## WHO: Stakeholder Analysis

**Primary affected:**
- **Autopilot agents** (Atlas, etc.) - must follow new rules immediately
- **Human developers** (Nate) - must understand new workflow
- **Future contributors** - inherit enforced standards

**Secondary affected:**
- **Code reviewers** - have clear criteria (five forces)
- **Onboarding** - new developers see consistent patterns
- **Tools** - pre-commit hook, GATE process

**Champions needed:**
- Someone to maintain pre-commit hook (technical)
- Someone to curate patterns (taste + judgment)
- Someone to review overrides weekly (governance)

**Resistance expected:**
- "This slows me down" (mitigation: 30-second checks)
- "Too rigid" (mitigation: escape hatch)
- "Unproven" (mitigation: 2-week review, kill if not working)

---

## WHAT IF NOT: Consequences of Inaction

**Short-term (1 week):**
- ~7,000 LOC added without pattern checks
- Duplicate error handling patterns spread
- No pattern fitness data collected
- Silent failures continue

**Medium-term (1 month):**
- ~30,000 LOC of technical debt
- Multiple competing patterns for same problems
- Refactoring cost grows exponentially
- Onboarding difficulty increases

**Long-term (6 months):**
- Code archaeology required to understand patterns
- Major refactoring campaigns needed (weeks of work)
- Pattern inconsistency becomes "character of codebase"
- Anti-fragility goal abandoned

**Irreversible damage:**
- Cultural acceptance of "any pattern is fine"
- Loss of learning opportunity (no fitness data)
- Codebase becomes "brownfield" legacy system

**Decision:** Inaction is NOT neutral. It's choosing code muck.

---

## HOW WILL WE KNOW: Success Metrics

**Immediate (end of day):**
- Pre-commit hook successfully blocks 1 non-compliant commit
- GATE template used in 1 task
- Quick-start guide read by 1 person
- Zero complaints about "can't figure out how to comply"

**Week 1:**
- 100% of commits include pattern reference OR override justification
- Override rate <10% (if higher, hook too strict)
- Pattern reuse rate >50% (if lower, patterns unclear)
- Zero silent errors in new code

**Week 2:**
- LOC growth rate decreasing (via negativa working)
- Pattern fitness data accumulating (>10 pattern usages logged)
- Feedback survey: "Helpful" > "Annoying" by 2:1 ratio
- First pattern deprecated due to bad fitness

**Failure signals:**
- Override rate >30% (people bypassing constantly)
- Complaints about "can't get work done"
- Velocity drops >25% (too much friction)
- No pattern reuse happening (framework not working)

**Kill criteria:** If by week 2, override rate >30% OR velocity drops >25%, we REVERT and try different approach.

---

## Strategic Context

**Constraints:**
- Timeline: 4-6 hours max (code being written now)
- Can't wait for metrics dashboards, pattern catalogs, experiments
- Can't be so strict people bypass with --no-verify
- Must be immediately helpful, not blocking/annoying

**Stakeholders:**
- All agents (Atlas, other autopilots) - must follow new rules
- Human developers - must understand new workflow
- Future code reviewers - must have clear standards

**Alignment with AFP/SCAS:**
This task ITSELF must follow AFP:
- Via negativa: Remove ambiguity from current checklist
- Refactor not repair: Redesign principle framework (not patch existing)
- Micro-batching: Deploy minimum viable intervention (not full vision)
- Modularity: Five forces generate all behaviors (not 15 rules)

---

## Alternatives Considered

### Alternative 1: Wait and Build Complete System
- 6-month experiment, full metrics, pattern catalog, dashboards
- **Rejected:** Can't wait 6 months. Code muck accumulates daily.

### Alternative 2: Just Update Documentation
- Write better guides, hope people read them
- **Rejected:** Education without enforcement doesn't work under deadline pressure

### Alternative 3: Strict Enforcement Only
- Block everything, no escape hatch, maximum rigor
- **Rejected:** Too brittle. People will bypass with --no-verify.

### Selected: Minimum Viable Intervention
- Pre-commit hook (mechanical enforcement)
- GATE template update (design guidance)
- Quick-start guide (education)
- Escape hatch (flexibility for edge cases)
- **Why:** Balances enforcement + guidance + flexibility. Deployable in 4 hours.

---

## The Five Forces (Refined Framework)

### 1. COHERENCE → Match the terrain
Search for existing patterns before writing new code. Match the style/structure of surrounding code.

### 2. ECONOMY → Achieve more with less
Delete before adding. Reuse before writing. Simplify before extending.

### 3. LOCALITY → Related near, unrelated far
Code that changes together lives together. Minimize coupling across boundaries.

### 4. VISIBILITY → Important obvious, unimportant hidden
Errors must be loud. Interfaces must be clear. Hide complexity behind abstraction.

### 5. EVOLUTION → Patterns prove fitness
Track which patterns work (low bugs, easy changes). Deprecate patterns that fail. Let good patterns spread.

**Key insight from roundtable:** CERTAINTY is not a force - it's a risk-based dial. Different code needs different assurance levels (critical → formal verification, low-leverage → smoke tests).

---

## Strategic Approach

**Phase 1 (Today - 4 hours):**
- Update pre-commit hook with five forces checks
- Update GATE template with five forces checklist
- Write quick-start guide (<1000 words)
- Deploy and announce

**Phase 2 (Next week):**
- Build pattern search tool
- Start pattern fitness tracking
- Create pattern catalog

**Phase 3 (Next month):**
- Metrics dashboard
- Effectiveness analysis
- Refine based on data

**Today's scope:** Minimum viable intervention that stops the bleeding.

---

## Why This Matters (Long-term Vision)

**Without this:**
- Codebase grows to millions of LOC without coherent structure
- Each module reinvents patterns (no reuse)
- No learning mechanism (repeat same mistakes)
- Technical debt accumulates faster than we can refactor

**With this:**
- Pattern reuse becomes automatic (COHERENCE enforced)
- Code growth controlled (ECONOMY enforced)
- Pattern fitness tracked (EVOLUTION measured)
- System learns what works (data-driven improvement)

**The meta-goal:** Create a codebase that gets BETTER over time, not worse. Anti-fragile = learns from stress.

---

## Risk Analysis

**Risk 1: Too strict → people bypass hooks**
- Mitigation: Escape hatch with justification required
- Mitigation: Error messages HELPFUL not cryptic
- Mitigation: 30-second checks, not hour-long searches

**Risk 2: Not strict enough → rules ignored**
- Mitigation: Pre-commit hook blocks (not just warns)
- Mitigation: Weekly review of override usage
- Mitigation: Make following rules EASIER than bypassing

**Risk 3: Adds overhead → slows development**
- Mitigation: Checks run in <10 seconds
- Mitigation: Provide heuristics (30-second rules)
- Mitigation: Focus on high-leverage code (not everything)

**Risk 4: Principles don't actually help**
- Mitigation: Track metrics from day 1
- Mitigation: Review in 2 weeks, adapt if not working
- Mitigation: Kill sacred cows if data shows failure

---

## Success Criteria

**Immediate (end of today):**
- ✅ Pre-commit hook blocks non-compliant commits
- ✅ GATE template has five forces checklist
- ✅ Quick-start guide exists and is readable
- ✅ Team knows rules changed

**Week 1:**
- ✅ No commits without pattern reference
- ✅ Override log shows <10% override rate
- ✅ Feedback collected (too strict? too loose?)

**Week 2:**
- ✅ Pattern reuse increasing (tracked in commits)
- ✅ LOC growth slowing (via negativa working)
- ✅ Fewer silent errors (visibility working)

---

## Decision

**PROCEED with minimum viable intervention.**

Deploy five forces framework TODAY with:
1. Pre-commit hook enforcement
2. GATE template update
3. Quick-start guide
4. Escape hatch for edge cases

This stops code muck accumulation while we build more sophisticated tooling (pattern search, metrics, catalog).

**Estimated effort:** 4-6 hours (within micro-batching if we count this as design+documentation, not code)

**Files to change:**
1. `.githooks/pre-commit` (enforcement)
2. `docs/templates/design_template.md` (GATE guidance)
3. `docs/AFP_QUICK_START.md` (NEW - education)
4. `MANDATORY_WORK_CHECKLIST.md` (update with five forces)

**Estimated LOC:** ~200 added (hook logic + documentation), ~50 deleted (old checklist items) = +150 net (at limit but justified for foundational change)

---

**Next Phase:** SPEC (define detailed requirements and acceptance criteria)
