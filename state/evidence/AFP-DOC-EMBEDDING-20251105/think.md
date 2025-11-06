# THINK Phase: Wire Critical Wave 0 Processes Into Agent Boot Sequence

**Task ID:** AFP-DOC-EMBEDDING-20251105
**Date:** 2025-11-05
**Phase:** THINK
**Depends On:** plan.md (design finalized)

---

## EDGE CASES

### Edge Case 1: Files Have Changed Since Plan

**Scenario:** CLAUDE.md or AGENTS.md structure has been modified by another agent/process

**Symptoms:**
- Line numbers in plan.md no longer match
- Sections have been moved or renamed
- New content added at insertion points

**Impact:** Medium
**Likelihood:** Low (recent files, no parallel work)

**Mitigation:**
1. Read current file state before editing
2. Use relative markers ("after STRATEGIZE phase") not absolute line numbers
3. Visual inspection after edit to verify placement
4. If structure drastically changed, re-plan insertions

**Fallback:** If too different, abort and create new plan

---

### Edge Case 2: One File Edits Succeed, Other Fails

**Scenario:** CLAUDE.md edit succeeds, AGENTS.md edit fails (or vice versa)

**Symptoms:**
- One file modified, other unchanged
- Synchronization violated
- Git diff shows divergence

**Impact:** HIGH (violates user requirement)
**Likelihood:** Low (using Edit tool, not manual)

**Mitigation:**
1. Use Edit tool for both files
2. If second edit fails, revert first edit
3. Never commit partial synchronization
4. Verify both files changed before proceeding

**Recovery:**
```bash
git checkout CLAUDE.md  # Revert first edit
# Re-try both edits
```

---

### Edge Case 3: Referenced Docs Don't Exist

**Scenario:** One of the referenced docs has been moved or deleted

**Symptoms:**
- Broken links in CLAUDE.md/AGENTS.md
- Agents get 404 when trying to read referenced doc

**Impact:** Medium
**Likelihood:** Very Low (docs created in previous task, stable)

**Mitigation:**
1. Verify all 3 docs exist before editing
2. Use relative paths from repo root (stable)
3. If doc missing, escalate (critical doc deleted)

**Verification:**
```bash
ls -la docs/orchestration/STRATEGY_INTERROGATION_FRAMEWORK.md
ls -la docs/orchestration/AUTOPILOT_VALIDATION_RULES.md
ls -la state/evidence/AFP-WAVE0-AUTOPILOT-20251105/ROADMAP_RESTRUCTURING_REQUIRED.md
```

---

### Edge Case 4: Agent Ignores References

**Scenario:** Agent reads CLAUDE.md/AGENTS.md but skips reading referenced docs

**Symptoms:**
- Agent doesn't apply 5 interrogations
- Agent accepts builds as sufficient for autopilot
- No behavior change despite doc updates

**Impact:** HIGH (defeats purpose of task)
**Likelihood:** Medium (agents may skim)

**Mitigation:**
1. Use imperative language ("MUST READ", "REQUIRED")
2. Explain WHY doc is critical (not just "see X")
3. Place at decision points (can't skip if needed)
4. Future: Pre-commit hooks enforce (separate task)

**Acceptance:** Some agents will still skip, but we've done our best to make it visible

---

### Edge Case 5: LOC Limit Exceeded (70 > 50)

**Scenario:** Plan adds 70 lines per file, spec said ≤50

**Symptoms:**
- Doc feels verbose
- User may reject as too long

**Impact:** Low (functionality works, just verbose)
**Likelihood:** Low (user requested comprehensive integration)

**Justification:**
- All 3 additions are user-requested
- Already minimal (can't delete more without losing context)
- 70/350 = 20% increase (modest)

**Fallback:** If user objects, create follow-up task to refactor for conciseness

---

### Edge Case 6: Markdown Formatting Breaks

**Scenario:** Invalid markdown syntax in additions

**Symptoms:**
- Headers not rendering
- Code blocks broken
- Lists malformed

**Impact:** Medium (docs hard to read)
**Likelihood:** Low (simple markdown)

**Mitigation:**
1. Use standard markdown syntax
2. Verify with git diff visual inspection
3. Test in markdown preview if uncertain
4. Keep formatting simple (headers, lists, code blocks)

---

### Edge Case 7: Insertion Point Ambiguity

**Scenario:** Multiple matches for insertion markers (e.g., two "STRATEGIZE" mentions)

**Symptoms:**
- Edit tool applies to wrong location
- Content added in unexpected place

**Impact:** High (doc structure broken)
**Likelihood:** Low (using specific Edit tool old_string)

**Mitigation:**
1. Use unique old_string that includes surrounding context
2. Verify placement with read before edit
3. Git diff review after edit
4. If wrong location, revert and retry with more specific old_string

---

## FAILURE MODES

### Failure Mode 1: Synchronization Drift Over Time

**Description:** CLAUDE.md and AGENTS.md start identical, but diverge in future edits

**Root Cause:**
- Agent updates one file, forgets the other
- User requirement ("update both") not followed

**Impact:** HIGH (documentation inconsistency)
**Likelihood:** Medium (human error in future)

**Prevention:**
- This task establishes the pattern (both files updated together)
- Document pattern in commit message
- Future: Pre-commit hook checks synchronization

**Detection:**
```bash
# Check if STRATEGIZE sections match
diff <(grep -A 20 "STRATEGIZE" CLAUDE.md) <(grep -A 20 "STRATEGIZE" AGENTS.md)
```

**Recovery:** Identify divergence, re-synchronize files

---

### Failure Mode 2: Reference Rot (Links Break)

**Description:** Referenced docs move/rename, breaking links

**Root Cause:**
- Docs reorganized
- Path changes
- Files deleted

**Impact:** Medium (agents can't find docs)
**Likelihood:** Low (stable doc structure)

**Prevention:**
- Use relative paths from repo root (stable)
- Keep doc structure stable
- If docs move, update references

**Detection:** Agents report broken links

**Recovery:** Update paths in CLAUDE.md/AGENTS.md

---

### Failure Mode 3: Content Duplication Cascade

**Description:** Future agents copy content instead of using references

**Root Cause:**
- Agent doesn't understand reference pattern
- Easier to copy-paste than maintain reference

**Impact:** High (maintenance nightmare)
**Likelihood:** Low (this task sets reference pattern)

**Prevention:**
- This task demonstrates correct pattern
- Commit message explains rationale
- Documentation in evidence bundle

**Detection:** Git diff shows large content duplication

**Recovery:** Refactor duplicates to references

---

### Failure Mode 4: Stale References (Docs Update, References Don't)

**Description:** Referenced docs evolve, but reference text stays stale

**Example:**
- AUTOPILOT_VALIDATION_RULES.md adds 6th requirement
- CLAUDE.md still says "5 requirements"

**Root Cause:**
- References include brief summaries that can become stale

**Impact:** Low (main doc is still authoritative)
**Likelihood:** Medium (docs will evolve)

**Prevention:**
- Keep reference text minimal (avoid detailed summaries)
- Main reference is to full doc (authoritative)
- Brief context for "when to consult," not full content

**Detection:** Divergence between reference text and actual doc

**Recovery:** Update reference text, or remove summary entirely

---

### Failure Mode 5: Over-Reference (Too Many Links)

**Description:** Future tasks add more references, cluttering docs

**Root Cause:**
- Every new doc gets referenced in CLAUDE.md/AGENTS.md
- No pruning of less-critical references

**Impact:** Medium (noise, hard to find critical references)
**Likelihood:** Medium (documentation tends to grow)

**Prevention:**
- Only reference CRITICAL docs (not all docs)
- This task adds 3 references (baseline)
- Future: Audit references periodically

**Detection:** CLAUDE.md/AGENTS.md feel cluttered, too many "READ THIS" sections

**Recovery:** Prune less-critical references, keep only mandatory ones

---

### Failure Mode 6: Agents Skip Long Docs

**Description:** CLAUDE.md/AGENTS.md get too long, agents stop reading thoroughly

**Root Cause:**
- This task adds 70 lines per file
- Future tasks add more
- Docs exceed readable length

**Impact:** HIGH (defeats purpose of documentation)
**Likelihood:** Medium (documentation tends to grow)

**Prevention:**
- Keep additions minimal (already done)
- Favor references over inline content (already done)
- Future: Refactor for conciseness if needed

**Detection:** Agent behavior doesn't match doc instructions

**Recovery:** Refactor docs to be more concise, move detail to sub-docs

---

## COMPLEXITY ANALYSIS

### Cyclomatic Complexity: N/A
**Reason:** This is documentation, not code. No control flow.

### Cognitive Complexity: LOW

**Factors:**
- Simple markdown text
- Clear structure (3 additions, 3 references)
- No indirection or abstraction
- Linear reading flow

**Complexity Score:** 2/10

**Justification:**
- Agent sees section, reads reference, consults doc
- No complex decision trees
- No nested conditionals

### Maintenance Complexity: LOW

**Factors:**
- References are stable (relative paths)
- No duplication (references, not copies)
- Synchronization pattern established

**Maintenance Burden:**
- If source doc changes: 0 updates needed (reference still valid)
- If source doc moves: 2 path updates needed (CLAUDE.md, AGENTS.md)
- If new critical doc created: 2 reference additions (CLAUDE.md, AGENTS.md)

**Complexity Score:** 3/10

**Justification:**
- Minimal updates required over time
- Clear pattern for future additions

### Integration Complexity: LOW

**Factors:**
- Fits into existing structure
- No breaking changes
- No dependencies on other systems

**Integration Risk:** Very Low

**Justification:**
- Just markdown additions
- No code changes
- No tool or process changes

---

## WHAT CAN GO WRONG?

### Scenario 1: Catastrophic Synchronization Failure

**Trigger:** CLAUDE.md and AGENTS.md have completely different additions

**Impact:** HIGH
- Agents get different instructions depending on which file they read
- Claude Council sees different rules than other agents
- Confusion, inconsistency, failures

**Probability:** Low (using Edit tool carefully)

**Detection:** Git diff review before commit

**Recovery:** Revert both files, re-edit with synchronization

---

### Scenario 2: Critical Doc Missing

**Trigger:** One of the 3 referenced docs has been deleted

**Impact:** MEDIUM
- Broken links
- Agents can't find referenced content
- Instructions incomplete

**Probability:** Very Low (docs just created, stable)

**Detection:** Verify docs exist before editing

**Recovery:** Recreate missing doc or remove reference

---

### Scenario 3: Edit Tool Misapplies

**Trigger:** old_string matches multiple locations, edit applies to wrong place

**Impact:** HIGH
- Content in wrong section
- Doc structure broken
- Confusing reading flow

**Probability:** Low (using unique old_string)

**Detection:** Git diff visual inspection after edit

**Recovery:** Revert edit, use more specific old_string, retry

---

### Scenario 4: Future Agent Overrides

**Trigger:** Future agent modifies CLAUDE.md without updating AGENTS.md

**Impact:** MEDIUM
- Synchronization lost
- Divergence over time

**Probability:** Medium (human error in future)

**Detection:** Periodic synchronization audit

**Recovery:** Re-synchronize files

---

### Scenario 5: User Rejects Verbosity

**Trigger:** User sees 70-line additions, says "too verbose"

**Impact:** LOW
- Need to refactor for conciseness
- Functionality still works

**Probability:** Low (user requested comprehensive integration)

**Detection:** User feedback

**Recovery:** Create follow-up task to refactor

---

## MITIGATION STRATEGIES

### Strategy 1: Pre-Edit Verification

**Action:** Before editing, verify:
1. Files exist and are readable
2. Structure matches plan assumptions
3. Referenced docs exist
4. No parallel edits in progress

**Cost:** Low (1 minute)
**Benefit:** High (prevents most edge cases)

---

### Strategy 2: Unique old_string Selection

**Action:** Use old_string that includes unique context

**Example:**
Instead of:
```
old_string: "1. **STRATEGIZE**"
```

Use:
```
old_string: "1. **STRATEGIZE** - Understand WHY (not just WHAT)
   - Problem analysis, root cause, goal
   - AFP/SCAS alignment check
   - **Quality enforcement:** StrategyReviewer validates strategic thinking depth
   - Test: `cd tools/wvo_mcp && npm run strategy:review [TASK-ID] && cd ../..`"
```

**Cost:** Low (slightly longer old_string)
**Benefit:** High (prevents misapplication)

---

### Strategy 3: Post-Edit Verification

**Action:** After editing, verify:
1. Git diff shows expected additions
2. Both files modified identically
3. Markdown syntax valid
4. Placement looks natural

**Cost:** Low (2 minutes)
**Benefit:** High (catches errors before commit)

---

### Strategy 4: Rollback Plan

**Action:** If anything goes wrong, revert immediately

**Commands:**
```bash
git checkout CLAUDE.md
git checkout AGENTS.md
# Re-plan and retry
```

**Cost:** Low (git operation)
**Benefit:** High (prevents bad commits)

---

### Strategy 5: Evidence Trail

**Action:** Document all decisions, rationale, and changes in evidence bundle

**Files:**
- strategy.md (5 interrogations)
- spec.md (requirements)
- plan.md (exact implementation)
- think.md (this file - edge cases)
- design.md (AFP/SCAS analysis - next)

**Cost:** Medium (time to document)
**Benefit:** Very High (future maintainers understand decisions)

---

## COMPLEXITY JUSTIFICATION

### Why Add 70 Lines Per File?

**Question:** Is 70 lines worth it?

**Answer:** YES

**Benefits:**
- System-wide behavior change (all agents)
- Prevents build-only validation (critical for autopilot)
- Enforces 5 interrogations (prevents superficial strategies)
- Embeds evolutionary philosophy (Wave 0 process)

**Costs:**
- 70 lines per file (20% increase in CLAUDE.md)
- Slightly longer reading time
- Maintenance overhead (minimal - references)

**Ratio:** High benefit, low cost

**Alternative:** Shorter additions that lose context
**Result:** Agents skip references because they don't understand WHY

**Conclusion:** 70 lines is justified

---

### Why 3 References Instead of 1?

**Question:** Could we consolidate into 1 "new processes" doc?

**Answer:** NO

**Reason:**
- STRATEGIZE phase needs interrogations framework (specific)
- VERIFY phase needs autopilot validation rules (specific)
- Planning phase needs evolutionary process (specific)
- Different decision points need different references

**Alternative:** Single consolidated doc
**Problem:** Agents don't know which part to read when

**Conclusion:** 3 references are necessary

---

## RISK PRIORITIZATION

### Critical Risks (Must Prevent)

1. **Synchronization failure** (CLAUDE.md ≠ AGENTS.md)
   - Mitigation: Careful editing, post-edit verification
   - Impact: HIGH

2. **Wrong placement** (content in wrong section)
   - Mitigation: Unique old_string, visual inspection
   - Impact: HIGH

### Important Risks (Should Prevent)

3. **Agent ignores references**
   - Mitigation: Imperative language, decision-point placement
   - Impact: MEDIUM

4. **Markdown formatting breaks**
   - Mitigation: Standard syntax, visual inspection
   - Impact: MEDIUM

### Minor Risks (Accept)

5. **Future synchronization drift**
   - Mitigation: Pattern established, future enforcement
   - Impact: MEDIUM (future problem)

6. **LOC limit exceeded**
   - Mitigation: Justified, minimal additions
   - Impact: LOW

---

## DEFINITION OF DONE (THINK PHASE)

- [x] All edge cases identified and analyzed
- [x] All failure modes documented with mitigations
- [x] Complexity analysis complete
- [x] "What can go wrong?" scenarios explored
- [x] Mitigation strategies defined
- [x] Complexity justified (70 lines, 3 references)
- [x] Critical risks prioritized
- [x] Rollback plan established

**THINK Phase Complete**
**Next Phase:** GATE (design.md - AFP/SCAS analysis)

---

**Time Invested:** 30 minutes
**Edge Cases:** 7 identified
**Failure Modes:** 6 analyzed
**Risk Level:** LOW (good mitigations in place)
**Recommendation:** PROCEED TO GATE
