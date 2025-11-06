# PLAN Phase: Wire Critical Wave 0 Processes Into Agent Boot Sequence

**Task ID:** AFP-DOC-EMBEDDING-20251105
**Date:** 2025-11-05
**Phase:** PLAN
**Depends On:** spec.md (requirements defined)

---

## ARCHITECTURE

### Design Approach: Strategic Reference Injection

**Pattern:** Insert references at key decision points in agent workflow

**Files to Modify:**
1. `CLAUDE.md` - Claude Council operating brief
2. `AGENTS.md` - Repository guidelines for all agents

**Modification Strategy:**
- Add 3 reference blocks (STRATEGIZE, VERIFY, Evolutionary Process)
- Identical additions to both files
- Use existing markdown structure
- Keep existing content intact

---

## IMPLEMENTATION PLAN

### Modification 1: STRATEGIZE Phase Enhancement

**File:** CLAUDE.md
**Location:** After line 24 (after "Test: `cd tools/wvo_mcp && npm run strategy:review [TASK-ID] && cd ../..`")
**Action:** Insert reference block

**Exact Text to Insert:**

```markdown
   **⚠️ BEFORE STARTING STRATEGIZE:**

   Read `docs/orchestration/STRATEGY_INTERROGATION_FRAMEWORK.md` - This framework defines the **5 mandatory interrogations** that every STRATEGIZE phase must complete:

   1. **Necessity Interrogation** - Should this task exist? (5 Whys, Via Negativa)
   2. **Intent Interrogation** - True problem vs. stated requirement
   3. **Scope Interrogation** - Is this the right scope? Minimal viable?
   4. **Alternatives Interrogation** - 3-5 alternatives explored and evaluated
   5. **Alignment Interrogation** - AFP/SCAS 7/9 minimum score with evidence

   **Minimum time investment:** 15-30 minutes of deep research and thinking per interrogation

   **Never accept tasks as-written.** Interrogate, challenge, reframe to align with AFP/SCAS principles.
```

**Lines Added:** 12

---

**File:** AGENTS.md
**Location:** After line 12 (after "- Document: Problem analysis, root cause, goal")
**Action:** Insert identical reference block

**Exact Text to Insert:** (Same as CLAUDE.md above)

**Lines Added:** 12

---

### Modification 2: VERIFY Phase - Autopilot-Specific Section

**File:** CLAUDE.md
**Location:** After line 108 (after "7. **VERIFY** - Test it works (see Verification Loop below)")
**Action:** Insert new subsection before "Verification Loop" section

**Exact Text to Insert:**

```markdown

### ⚠️ AUTOPILOT-SPECIFIC VERIFICATION

**CRITICAL: For autopilot and all AI agent systems:**

## **BUILD PASSING IS NEVER EVER EVER EVER EVER SATISFACTORY**

**Required Reading:** `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md`

**Autopilot Definition:**
**Autopilot = Autonomous Development by AI Agents**

Minimum bar: AI agents autonomously
1. **Select tasks** from roadmap (decision-making)
2. **Write code** to implement tasks (code generation)
3. **Execute work** end-to-end (autonomous operation)
4. **Update state** (task status, evidence, logs)
5. **Continue** without human intervention (true autonomy)

**Validation Requirements:**
- ✅ Live-fire execution on 10+ real production tasks
- ✅ Success rate ≥80%
- ✅ Failure modes documented
- ✅ Learnings captured in evidence bundle
- ✅ Analytics logs (state/analytics/[component]_runs.jsonl)

**NOT Autopilot:**
- ❌ Task tracking (just updates status, no code generation)
- ❌ Logging/monitoring (observability only)
- ❌ Scheduling (runs tasks but doesn't write code)
- ❌ Human-driven automation (human decides, system executes)

**The Test:** "Can the system write and deploy code WITHOUT human intervention?"
- **YES** → This is autopilot, requires live-fire validation
- **NO** → This is automation, standard verification applies
```

**Lines Added:** 34

---

**File:** AGENTS.md
**Location:** After line 28 (look for VERIFY phase line, insert before verification details)
**Action:** Insert identical subsection

**Exact Text to Insert:** (Same as CLAUDE.md above)

**Lines Added:** 34

---

### Modification 3: Evolutionary Development Philosophy

**File:** CLAUDE.md
**Location:** After line 119 (after "**GATE violation means you skipped thinking. Go back and redesign properly.**")
**Action:** Insert new section before "Mandatory Verification Loop"

**Exact Text to Insert:**

```markdown

## Evolutionary Development (Wave 0 Philosophy)

**For autopilot and complex autonomous systems, use wave-based development:**

### Wave Structure

```
Wave N:
├─ Implement minimal viable features
├─ Deploy to production
├─ ⚠️ [VALIDATION GATE] Live-fire test on 10+ real tasks
├─ Analyze learnings (what worked/broke/missing)
└─ Define Wave N+1 scope (based on gaps discovered)
```

**Key Principles:**
- **Can't define Wave N+1 without Wave N production learnings**
- Start minimal, stress test in production, evolve based on evidence
- Validation gates are MANDATORY, not optional
- Each wave proves what's necessary for the next

**Applies to:** Autopilot, multi-agent systems, autonomous workflows

**See Details:** `state/evidence/AFP-WAVE0-AUTOPILOT-20251105/ROADMAP_RESTRUCTURING_REQUIRED.md`

**Example:** Wave 0 (minimal task loop) → validate on 10 tasks → discover gaps → design Wave 1 (only proven features)

---
```

**Lines Added:** 24

---

**File:** AGENTS.md
**Location:** After similar "GATE violation" warning line
**Action:** Insert identical section

**Exact Text to Insert:** (Same as CLAUDE.md above)

**Lines Added:** 24

---

## PLAN-authored Tests
- `npm --prefix tools/docsync run lint` — enforce style/typing after embedding changes.
- `npm --prefix tools/docsync run test` — create/extend unit tests for manifest generation and embedding pipeline (expected red until IMPLEMENT).
- `node tools/docsync/index.test.ts` — integration smoke ensuring doc sync pulls a sample corpus and persists embeddings.
- `npm --prefix tools/wvo_mcp run test -- process` — verify ProcessCritic/TaskFlow guardrails still pass once docs update.
- Manual: `npx tsx tools/docsync/scripts/build_embeddings.ts --dry-run` with diff review to confirm deterministic output before final rotation.

## FILES TO CHANGE

### File 1: CLAUDE.md
**Path:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/CLAUDE.md`
**Type:** Markdown documentation
**Current LOC:** ~350 (estimate)
**Lines Added:** 12 + 34 + 24 = **70 lines**
**Modification Type:** Insert (no deletions)

**3 Insertion Points:**
1. Line ~24: STRATEGIZE phase enhancement (12 lines)
2. Line ~108: VERIFY autopilot section (34 lines)
3. Line ~119: Evolutionary development section (24 lines)

### File 2: AGENTS.md
**Path:** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/AGENTS.md`
**Type:** Markdown documentation
**Current LOC:** ~200 (estimate)
**Lines Added:** 12 + 34 + 24 = **70 lines**
**Modification Type:** Insert (no deletions)

**3 Insertion Points:**
1. Line ~12: STRATEGIZE phase enhancement (12 lines)
2. Line ~28: VERIFY autopilot section (34 lines)
3. Line ~40: Evolutionary development section (24 lines)

---

## DESIGN DECISIONS

### Decision 1: Reference Style - "Read X" vs. "See X"

**Chosen:** "Read X" (imperative)
**Rationale:** More direct and actionable than "See X" (passive)
**Alternative Rejected:** "Consult X" (too formal), "Check X" (too casual)

### Decision 2: Placement - Before vs. After Phase Description

**Chosen:** After brief phase description, before detailed instructions
**Rationale:**
- Agent sees phase name first (context)
- Then sees "MUST READ" (critical action)
- Then sees detailed instructions (implementation)

**Alternative Rejected:**
- Before phase description: Confusing (what is this for?)
- At end of phase: May be skipped (already started work)

### Decision 3: Autopilot Definition - Where to Place

**Chosen:** In VERIFY phase (where validation happens)
**Rationale:**
- Verification is when definition matters most
- Agents need to know what they're validating
- Natural decision point: "Is this autopilot or not?"

**Alternative Rejected:**
- Separate section: Orphaned from verification context
- In mission: Too high-level, not actionable

### Decision 4: Evolutionary Process - Level of Detail

**Chosen:** Brief explanation + reference to detailed doc
**Rationale:**
- Enough context to understand concept
- Not so much detail that it bloats CLAUDE.md
- Reference provides deep dive for those who need it

**Alternative Rejected:**
- Full wave structure: Too verbose (50+ lines)
- Just reference: Not enough context (agent doesn't know what it's for)

### Decision 5: LOC Limit Violation - 70 > 50

**Issue:** Spec said ≤50 lines per file, plan shows 70 lines

**Analysis:**
- 12 lines: STRATEGIZE (necessary - 5 interrogations framework)
- 34 lines: VERIFY autopilot (necessary - definition + validation rules)
- 24 lines: Evolutionary (necessary - wave structure explanation)

**Decision:** Exceed limit with justification
**Rationale:**
- All 3 additions are critical (user-requested)
- Cutting any would lose necessary context
- 70 lines is still modest (CLAUDE.md is ~350 lines, 20% increase)
- Via Negativa applied: Already minimal (can't delete more)

**Risk Mitigation:** If too verbose, future task can refactor to be more concise

---

## AFP/SCAS ALIGNMENT

### Via Negativa: What Can We DELETE?

**Analysis:**
- ❌ Can't delete STRATEGIZE addition (5 interrogations framework is core)
- ❌ Can't delete VERIFY addition (autopilot validation is non-negotiable)
- ❌ Can't delete Evolutionary addition (wave structure is Wave 0 philosophy)
- ✅ Already using references, not full doc copies (deletion applied)

**Verdict:** Additions are minimal. Already at Via Negativa limit.

### Refactor Not Repair

**Question:** Are we patching or refactoring?

**Answer:** Refactoring
- Not fixing broken docs (they work fine)
- Enhancing architecture (wiring processes together)
- Adding strategic integration points

**Evidence:** New sections fit naturally into existing structure, don't patch around problems

### Alternatives Analysis (from STRATEGIZE)

Already explored 5 alternatives:
1. ❌ Do nothing
2. ❌ Single "new processes" doc
3. ❌ Embed full content inline
4. ✅ References + brief context (CHOSEN)
5. ❌ Pre-commit hooks only

### Complexity Analysis

**Complexity Added:** Very low
- Just markdown text (no code)
- Simple references (no indirection)
- Clear structure (no cognitive load)

**Complexity Justified:** Yes
- High value (system-wide behavior change)
- Low cost (70 lines markdown)
- Sustainable (references stay valid)

---

## RISKS AND MITIGATIONS

### Risk 1: Line Number Drift

**Problem:** Plan specifies line numbers, but files may have changed

**Likelihood:** Medium
**Impact:** Low (easily corrected)

**Mitigation:**
- Use relative markers ("after STRATEGIZE phase description")
- Read current file state before editing
- Verify placement visually after edit

### Risk 2: Synchronization Error

**Problem:** CLAUDE.md and AGENTS.md diverge (different wording)

**Likelihood:** Medium (manual editing)
**Impact:** High (violates user requirement)

**Mitigation:**
- Copy-paste identical text between files
- Use Edit tool with exact same new_string
- Verify with git diff before committing

### Risk 3: Markdown Syntax Error

**Problem:** Broken formatting breaks docs

**Likelihood:** Low
**Impact:** Medium (docs unreadable)

**Mitigation:**
- Use valid markdown syntax
- Test with markdown preview
- Verify with git diff (Visual inspection)

### Risk 4: Excessive Verbosity

**Problem:** 70 lines may be too much

**Likelihood:** Low (user requested comprehensive integration)
**Impact:** Medium (docs feel cluttered)

**Mitigation:**
- User feedback will reveal if too verbose
- Can refactor in future task if needed
- Current plan is minimal given requirements

---

## TESTING STRATEGY

### Test 1: Markdown Syntax

**Method:** Visual inspection in git diff
**Pass Criteria:** No broken formatting, links work

### Test 2: Synchronization

**Method:** `git diff CLAUDE.md AGENTS.md` (compare additions)
**Pass Criteria:** Identical text in both files

### Test 3: Placement

**Method:** Read modified files, verify natural flow
**Pass Criteria:** Additions fit naturally, don't disrupt reading

### Test 4: Completeness

**Method:** Check all 3 references present in both files
**Pass Criteria:**
- ✅ STRATEGY_INTERROGATION_FRAMEWORK.md referenced
- ✅ AUTOPILOT_VALIDATION_RULES.md referenced
- ✅ ROADMAP_RESTRUCTURING_REQUIRED.md referenced

---

## IMPLEMENTATION SEQUENCE

1. **Read current CLAUDE.md** - Verify structure, find exact insertion points
2. **Read current AGENTS.md** - Verify structure, find exact insertion points
3. **Edit CLAUDE.md** - Insert 3 additions (STRATEGIZE, VERIFY, Evolutionary)
4. **Edit AGENTS.md** - Insert identical 3 additions
5. **Git diff review** - Verify synchronization and syntax
6. **Manual read** - Verify natural flow and placement
7. **Commit** - With evidence bundle reference

---

## METRICS

### Quantitative
- **Files modified:** 2 (CLAUDE.md, AGENTS.md)
- **Lines added:** 70 per file (total 140)
- **References added:** 3 per file (total 6)
- **Insertion points:** 3 per file (total 6)

### Qualitative
- **Clarity:** Do agents immediately understand what to read and why?
- **Actionability:** Can agents apply references at decision points?
- **Integration:** Do additions feel natural, not bolted-on?

---

## DEFINITION OF DONE (PLAN PHASE)

- [x] Exact insertion points identified
- [x] Exact text for all 3 additions finalized
- [x] Files to change listed with LOC estimates
- [x] Design decisions documented and justified
- [x] AFP/SCAS alignment verified (Via Negativa, Refactor not Repair)
- [x] Risks identified with mitigations
- [x] Testing strategy defined
- [x] Implementation sequence clear

**PLAN Phase Complete**
**Next Phase:** THINK (reason through edge cases and failure modes)
