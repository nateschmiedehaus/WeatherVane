# STRATEGIZE Phase: Embed Wave 0 Documentation in Agent Instructions

**Task ID:** AFP-DOC-EMBEDDING-20251105
**Date:** 2025-11-05
**Author:** Claude Council
**Time Invested:** 30 minutes deep interrogation

---

## THE FIVE INTERROGATIONS

### 1. Necessity Interrogation: Should This Task Exist?

**Question:** Is updating CLAUDE.md/AGENTS.md truly necessary, or is this documentation theater?

**5 Whys:**

1. **Why update these files?**
   → To ensure all agents follow Wave 0 validation rules and strategy interrogation framework

2. **Why must agents follow these?**
   → Because build passing ≠ autopilot working; only live-fire validation counts

3. **Why won't agents follow them without doc updates?**
   → The critical docs (AUTOPILOT_VALIDATION_RULES.md, STRATEGY_INTERROGATION_FRAMEWORK.md) exist but aren't referenced in agent instructions

4. **Why does lack of reference matter?**
   → Agents read CLAUDE.md/AGENTS.md first; if critical requirements aren't mentioned, they'll be skipped

5. **Why can't we just tell agents verbally?**
   → Instructions must be written in authoritative docs; verbal = forgotten next session

**Via Negativa Analysis:**

**Can we DELETE this task entirely?**
- ❌ NO - Critical validation rules and strategy framework are invisible to agents without references
- Without this: Agents will skip interrogations, accept builds as sufficient, violate Wave 0 philosophy
- Evidence: User emphasized "everything must be in a task" and "instantiate better all of what we've been saying"

**Verdict:** TASK IS NECESSARY - New critical processes are orphaned without integration into agent instructions.

---

### 2. Intent Interrogation: What Problem Are We REALLY Solving?

**Stated Requirement:**
"Update CLAUDE.md and AGENTS.md with references to new documentation"

**True Intent (5 Whys Deep):**

**Surface:** Make agents aware of new docs
**Deeper:** Enforce validation rules system-wide
**Deeper:** Prevent agents from skipping interrogations or accepting builds as sufficient
**Deeper:** Embed Wave 0 evolutionary philosophy into development culture
**Deepest:** **Institutionalize antifragile development through stress-tested processes**

**The REAL Problem:**

We created world-class processes (Wave 0, validation rules, interrogations) but they exist in isolated documents. Agents won't discover them organically. This creates **process orphans** - excellent frameworks that die from lack of visibility.

**User Evidence:**
- "instantiate better all of what we've been saying" - make it real, not theoretical
- "everything must be in a task" - formalize, don't just discuss
- "when you update claude.md agents.md always needs a corresponding update" - keep instructions synchronized

**Root Cause:** Documentation exists but isn't **wired into the agent boot sequence**.

---

### 3. Scope Interrogation: Is This The Right Scope?

**Proposed Scope:** Update CLAUDE.md and AGENTS.md with references to:
- AUTOPILOT_VALIDATION_RULES.md
- STRATEGY_INTERROGATION_FRAMEWORK.md
- ROADMAP_RESTRUCTURING_REQUIRED.md

**Scope Challenge Questions:**

**Too Narrow?**
- Should we also update MANDATORY_WORK_CHECKLIST.md? (Already done in previous task)
- Should we update other agent docs? (Only CLAUDE.md/AGENTS.md are primary)

**Too Broad?**
- Are we trying to rewrite entire agent instructions? NO - just add critical references
- Are we restructuring documentation? NO - just wiring existing docs together

**Right-Sized?**
- ✅ Minimal viable integration: Add references + context where needed
- ✅ Synchronize CLAUDE.md ↔ AGENTS.md (user requirement)
- ✅ Focus on verification loop and STRATEGIZE phase sections

**Scope Decision:** RIGHT-SIZED - Wire critical docs into agent instructions, nothing more.

---

### 4. Alternatives Interrogation: Have We Explored Better Paths?

#### Alternative 1: Do Nothing (Wait for Agents to Discover Docs Organically)

**Pros:**
- Zero effort
- Natural discovery might mean higher adoption

**Cons:**
- ❌ No discovery mechanism exists
- ❌ Agents start with CLAUDE.md/AGENTS.md, won't find orphaned docs
- ❌ Validation rules will be ignored
- ❌ Strategy interrogations will be skipped

**Verdict:** REJECTED - Passive discovery fails for critical processes

#### Alternative 2: Create a Single "New Processes" Document

**Pros:**
- All new content in one place
- Easy to find once discovered

**Cons:**
- ❌ Still an orphan (not in agent boot sequence)
- ❌ Agents won't check for "new processes" file
- ❌ Doesn't synchronize CLAUDE.md ↔ AGENTS.md (user requirement)

**Verdict:** REJECTED - Doesn't solve visibility problem

#### Alternative 3: Embed Full Content Inline (Copy-Paste All Docs)

**Pros:**
- Maximum visibility
- Everything in one file

**Cons:**
- ❌ Massive duplication (CLAUDE.md and AGENTS.md both grow by thousands of lines)
- ❌ Maintenance nightmare (update in 3 places: original + CLAUDE + AGENTS)
- ❌ Violates DRY principle
- ❌ Makes agent instructions unreadable (too long)

**Verdict:** REJECTED - Creates worse problems than it solves

#### Alternative 4: Add References + Brief Context (CHOSEN)

**Pros:**
- ✅ Maximum visibility (in agent boot sequence)
- ✅ Minimal duplication (just references + short context)
- ✅ Maintainable (update original docs, references stay stable)
- ✅ Synchronizes CLAUDE.md ↔ AGENTS.md
- ✅ Keeps instructions readable

**Cons:**
- Requires agents to actually read referenced docs (but they already do this)

**Verdict:** SELECTED - Best balance of visibility and maintainability

#### Alternative 5: Use Pre-Commit Hooks to Enforce (No Doc Updates)

**Pros:**
- Automatic enforcement
- Can't be skipped

**Cons:**
- ❌ Doesn't help agents understand WHY
- ❌ Enforcement without education = confusion
- ❌ Hooks should supplement docs, not replace them

**Verdict:** REJECTED as sole solution - Use as complement, not alternative

---

### 5. Alignment Interrogation: Does This Uphold AFP/SCAS?

#### AFP Principles (5/5)

✅ **Via Negativa (Deletion Before Addition):**
- NOT adding new processes - wiring existing ones
- Minimal additions to CLAUDE.md/AGENTS.md (just references)
- Alternative 3 (embed full content) was rejected as excessive

✅ **Skin in the Game:**
- If this integration fails, agents will continue bad practices (builds = done)
- We own the consequences of poor documentation architecture
- Low stakes: worst case = need to update docs again

✅ **Antifragility:**
- Distributed documentation with clear references = robust
- If one doc changes, references stay valid
- Modular architecture improves with stress testing

✅ **Pareto Principle (80/20):**
- 20% effort (add references) → 80% impact (system-wide behavior change)
- Targeting just 2 files (CLAUDE.md/AGENTS.md) reaches all agents

✅ **Simplicity:**
- Simplest solution: wire docs together with references
- No new frameworks, no new tools, just strategic links

**AFP Score: 5/5**

#### SCAS Principles (4/4)

✅ **Simplicity:**
- Clear references to authoritative docs
- No complex indirection or navigation required

✅ **Clarity:**
- Intent is crystal clear: "Read these docs for critical processes"
- Agents know exactly where to look

✅ **Autonomy:**
- Agents can find and apply rules independently
- No human intervention needed after wiring

✅ **Sustainability:**
- Low maintenance (update original docs, not copies)
- Scales to future doc additions

**SCAS Score: 4/4**

**Combined AFP/SCAS Score: 9/9** ✅

---

## REVISED TASK

**Original (Stated):**
"Update CLAUDE.md and AGENTS.md with references to new documentation"

**Revised (Intent-Aligned):**
**"Wire Critical Wave 0 Processes Into Agent Boot Sequence"**

**Why Better:**
- Captures true intent: visibility in agent instructions
- Emphasizes integration, not just "updating"
- Makes success criteria clear: processes must be discoverable at boot

**Concrete Actions:**

1. Add references to AUTOPILOT_VALIDATION_RULES.md in verification sections
2. Add references to STRATEGY_INTERROGATION_FRAMEWORK.md in STRATEGIZE phase
3. Add brief context for when to consult each doc
4. Synchronize both files (CLAUDE.md ↔ AGENTS.md)
5. Verify agents see critical rules at key decision points

---

## STRATEGY

### Goal

Integrate Wave 0 critical processes into agent instructions so all agents:
1. Apply 5 interrogations in STRATEGIZE phase
2. Never accept builds as sufficient for autopilot
3. Understand evolutionary roadmap philosophy

### Approach

**Phase 1: STRATEGIZE Section**
- Add reference to STRATEGY_INTERROGATION_FRAMEWORK.md
- Brief context: "Read before starting any STRATEGIZE phase"

**Phase 2: VERIFY Section**
- Add reference to AUTOPILOT_VALIDATION_RULES.md
- Clear statement: "Build passing is NEVER sufficient for autopilot - read validation rules"

**Phase 3: Evolutionary Process Context**
- Add brief section on Wave-based development
- Reference ROADMAP_RESTRUCTURING_REQUIRED.md for details

**Phase 4: Synchronization**
- Ensure CLAUDE.md and AGENTS.md have identical additions
- User requirement: "when you update claude.md agents.md always needs a corresponding update"

### Constraints

- ≤50 lines total additions per file
- No inline duplication (use references)
- Maintain existing document structure
- Clear, actionable language

### Success Criteria

- [ ] STRATEGIZE phase mentions STRATEGY_INTERROGATION_FRAMEWORK.md
- [ ] VERIFY phase mentions AUTOPILOT_VALIDATION_RULES.md
- [ ] Both docs mention evolutionary roadmap philosophy
- [ ] CLAUDE.md and AGENTS.md are synchronized
- [ ] Build passes
- [ ] No duplication of full doc contents

---

## RISKS

**Risk 1: Agents still skip referenced docs**
- Mitigation: Add imperative language ("MUST READ before...")
- Backup: Pre-commit hooks enforce (future task)

**Risk 2: Too many references = noise**
- Mitigation: Only 3 critical docs, placed strategically
- Clear "when to consult" guidance

**Risk 3: Docs diverge over time**
- Mitigation: User requirement already established (update together)
- This task reinforces the pattern

---

## STRATEGIC RECOMMENDATION

**Proceed with Alternative 4: Add References + Brief Context**

This task is NECESSARY, RIGHT-SCOPED, and 9/9 AFP/SCAS aligned.

**Estimated Impact:**
- High: System-wide behavior change
- Low cost: ~50 lines per file
- Sustainable: Clear maintenance pattern

**Next Phase:** SPEC (define exact placement and wording)

---

**STRATEGIZE Phase Complete**
**Time Invested:** 30 minutes
**AFP/SCAS Score:** 9/9
**Recommendation:** PROCEED TO SPEC
