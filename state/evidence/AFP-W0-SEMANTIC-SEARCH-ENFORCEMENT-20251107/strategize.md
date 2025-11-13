# STRATEGIZE - AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107

**Task:** DRQC Citation Enforcement - Mandatory Research Citations in Every Phase
**Created:** 2025-11-07T16:00:00Z
**Priority:** CRITICAL - Enables research-backed quality

## Root Cause Analysis (WHY)

### The Problem

**Current State:**
- Deep research document exists ("Deep Research Into Quality Control for Agentic Coding.pdf", 45 pages)
- Research integration complete (80% alignment documented)
- **BUT: No enforcement** - agents can still complete tasks without citing DRQC
- **NO concordance tables** - no mapping of actions → DRQC citations → artifacts
- **NO live-fire mandate** - tests can be compile-only without real execution
- **Gates exist but don't require DRQC justification** - can pass without research grounding

**Example Violation:**
```markdown
# strategy.md (WITHOUT DRQC citations)
## Approach
We'll use hybrid search for semantic retrieval.

## Alternatives
1. BM25 only
2. Vector search only
3. Hybrid (selected)
```

**What's Missing:**
- No DRQC citation justifying hybrid search
- No quote from research explaining why
- No concordance table mapping decision → research → evidence

**User's Mandate:**
> "live testing is utterly essential and there is zero success without it"
> "this prompt doesn't fully understand work process so you'll have to improve upon it"

### Root Cause

**The gap:** We have research-backed architecture (80% aligned) but no **runtime enforcement** that makes DRQC citations mandatory.

Agents currently CAN:
- Write strategy.md without DRQC quotes ❌
- Design features without research justification ❌
- Plan tests without citing DRQC test philosophy ❌
- Skip live-fire testing for compile-only checks ❌
- Pass gates without concordance tables ❌

### Why This Matters

**Research (DRQC) is our source of truth for quality**, yet it's:
- Referenced but not enforced
- Known but not required
- Understood but not cited

**Result:** Quality decisions are still based on intuition, not doctrine.

**Goal:** Make DRQC citations as mandatory as passing tests - you literally cannot proceed without them.

## Strategic Intent (WHAT WE WILL DO)

### Mission

**ENFORCE DRQC CITATIONS AT EVERY PHASE BOUNDARY**

Every AFP phase document must:
1. ✅ **Quote DRQC** - Direct quotes from research (page/section)
2. ✅ **Cite DRQC** - Reference specific sections that justify decisions
3. ✅ **Provide Concordance** - Table mapping actions → DRQC citations → artifacts
4. ✅ **Prove Live-Fire** - Real execution logs, not just compile success

### Scope

**Phases Requiring DRQC Citations:**
1. **STRATEGIZE** - Quote research on strategy principles
2. **SPEC** - Cite research on properties, symmetries, invariants
3. **PLAN** - Cite research on cited plans, PBT, SGAT, mutation testing
4. **THINK** - Cite research on round-trip review, design validation
5. **GATE** (design.md) - Cite research on AFP/SCAS principles
6. **IMPLEMENT** - Implementation notes citing research patterns
7. **VERIFY** - Cite research on live-fire testing, PBT, mutation, SGAT
8. **REVIEW** - Cite research on adversarial review, round-trip protocol
9. **PR** - Include DRQC summary of applied clauses
10. **MONITOR** - Cite research on monitoring, anomaly backfill

### Enforcement Mechanism

**Pre-commit Hook Enhancement:**
```bash
# For each phase document in state/evidence/[TASK-ID]/
1. Extract DRQC citations
2. Check if ≥1 DRQC quote exists (with page/section)
3. Check if concordance table exists
4. Verify cited pages are valid (exist in PDF)
5. BLOCK commit if missing

# For VERIFY phase specifically:
6. Check for live-fire evidence (logs, execution output)
7. BLOCK if only compile/build success shown
```

**ProcessCritic Enhancement:**
```typescript
// Add to ProcessCritic checks:
- drqc_citations_missing
- drqc_concordance_missing
- live_fire_missing (VERIFY only)
- drqc_page_invalid
```

## Success Criteria

**Task is NOT done until:**

1. ✅ **Template Updates:**
   - All 10 phase templates (docs/templates/) include DRQC citation sections
   - Concordance table template added
   - Live-fire evidence template added (for VERIFY)

2. ✅ **Pre-commit Hook:**
   - Checks for DRQC citations in phase docs
   - Validates concordance tables
   - Blocks commits lacking citations
   - Allows exemptions for non-research tasks (docs-only, config changes)

3. ✅ **ProcessCritic Updates:**
   - New checks: `drqc_citations_missing`, `drqc_concordance_missing`, `live_fire_missing`
   - Integrated into existing ProcessCritic workflow
   - Tested on real task evidence

4. ✅ **Documentation:**
   - Update MANDATORY_WORK_CHECKLIST.md with DRQC requirements
   - Update AFP_QUICK_START.md with DRQC citation examples
   - Create DRQC_CITATION_GUIDE.md with templates, examples, anti-patterns

5. ✅ **Live-Fire Validation:**
   - Create 1 test task that goes through full AFP lifecycle
   - Verify pre-commit hook blocks without DRQC citations
   - Verify ProcessCritic blocks without concordance
   - Verify VERIFY phase requires live execution logs

## Alternatives Considered

### Option A: Make DRQC Citations Optional with Warnings

**Rejected:** User explicitly stated "live testing is utterly essential and there is zero success without it." Optional = ignored.

### Option B: Only Require DRQC Citations for Code Tasks

**Rejected:** All tasks benefit from research grounding (strategy, design, testing philosophy). No exemptions except trivial tasks.

### Option C: Require DRQC Citations at Every Phase (SELECTED)

**Why:** Only option that ensures research-backed decisions. Matches user's mandate and ChatGPT prompt philosophy.

**Trade-offs:**
- More work per task (5-10 min to find/cite research)
- Higher bar for task completion
- BUT: Decisions are provably aligned with research
- BUT: Quality is grounded in doctrine, not vibes

## Implementation Approach

### Via Negativa - What Can We DELETE?

**None.** This is pure addition - we're adding mandatory citations that didn't exist before.

**Justification:** Research grounding is a foundational capability we're missing. Can't delete our way to quality enforcement.

### Refactor vs Repair

**This is ENHANCEMENT ✅**

**Why:**
- Extending existing ProcessCritic (not patching)
- Extending existing templates (not replacing)
- Extending existing pre-commit hooks (not working around)
- Building on existing 80% DRQC alignment

### High-Level Plan

**Phase 1: Templates (2 hours)**
- Update all 10 phase templates with DRQC citation sections
- Add concordance table template
- Add live-fire evidence template (VERIFY)
- Document in AFP_QUICK_START.md

**Phase 2: ProcessCritic (3 hours)**
- Add DRQC citation extraction logic
- Add concordance validation logic
- Add live-fire evidence check (VERIFY only)
- Test on existing task evidence

**Phase 3: Pre-commit Hook (2 hours)**
- Integrate DRQC checks into .git/hooks/pre-commit
- Add concordance validation
- Add exemption logic (non-research tasks)
- Test on real commits

**Phase 4: Documentation (1 hour)**
- Update MANDATORY_WORK_CHECKLIST.md
- Create DRQC_CITATION_GUIDE.md
- Update AFP_QUICK_START.md

**Phase 5: Live-Fire Validation (1 hour)**
- Create test task
- Run through full AFP lifecycle
- Verify all gates enforce DRQC
- Fix any issues discovered

**Total: 9 hours**

## Risks & Mitigation

**Risk 1: DRQC PDF Not Accessible**
- **Impact:** Can't validate page/section references
- **Mitigation:** Store PDF in repo root (already done)
- **Note:** PDF is 287.8KB - acceptable for version control

**Risk 2: Agents Don't Know How to Cite**
- **Impact:** Tasks blocked waiting for citation help
- **Mitigation:** Comprehensive DRQC_CITATION_GUIDE.md with examples
- **Mitigation:** Template shows exact format required

**Risk 3: Too Strict - Blocks Valid Work**
- **Impact:** Agents stuck on trivial tasks
- **Mitigation:** Exemption logic for non-research tasks
- **Examples:** Pure config changes, documentation fixes

**Risk 4: Live-Fire Takes Too Long**
- **Impact:** VERIFY phase slower
- **Mitigation:** Accept it - research says compile-only testing is insufficient
- **Note:** User explicitly demanded live testing

## Measurement

**Before (Current State):**
- DRQC citations required: 0/10 phases
- Tasks with concordance tables: 0%
- VERIFY phases with live-fire logs: ~40% (manual only)
- Pre-commit enforcement: None
- ProcessCritic checks: 0 for DRQC

**After (Target State):**
- DRQC citations required: 10/10 phases (100%)
- Tasks with concordance tables: 100%
- VERIFY phases with live-fire logs: 100% (enforced)
- Pre-commit enforcement: Blocks lacking citations
- ProcessCritic checks: 3 new checks (citations, concordance, live-fire)

**Success Metric:**
- 100% of completed tasks have DRQC citations
- 0% of tasks can bypass DRQC requirements
- Zero tolerance for research-free decisions

## DRQC Citations for This Strategy

**Action:** Require DRQC citations at every phase
**DRQC Citation:** Page 3, "First Principles" section:
> "The purpose is fixed; the roadmap is mutable. Encode the purpose as invariants, acceptance criteria, and non-functional constraints (NFRs)."

**Interpretation:** Just as purpose is encoded as invariants, research principles must be encoded as mandatory citations. You cannot claim quality without proving research alignment.

**Action:** Require live-fire testing
**DRQC Citation:** Page 8, "Live-Fire Over Compile-Only" section:
> "Always run the program (or a realistic harness), not just lints. Add property-based tests + a tiny mutation budget per PR."

**Interpretation:** Compile success is insufficient. VERIFY must include execution logs proving the code actually runs.

**Action:** Use concordance tables
**DRQC Citation:** Page 12, "Evidence or it didn't happen" section:
> "Every decision produces evidence (citations, diffs, test results). If it's not in the ledger, it didn't happen."

**Interpretation:** Concordance tables are the ledger. Action → DRQC citation → artifact. If not in the table, decision isn't research-backed.

### Concordance (Strategy)

| Action | DRQC Citation | Artifact |
|--------|---------------|----------|
| Require DRQC citations | Page 3, "First Principles" | This strategy.md |
| Require live-fire testing | Page 8, "Live-Fire Over Compile-Only" | Verify template updates |
| Use concordance tables | Page 12, "Evidence or it didn't happen" | Concordance template |
| Enforce at phase boundaries | Page 15, "Role separation + hard gates" | ProcessCritic updates |
| No silent assumptions | Page 18, "No gate, no progress" | Pre-commit hook |

---

**Strategic Conclusion:**

We will not claim research alignment without proving it. Every phase must cite DRQC. Every decision must have a concordance entry. Every verification must show live execution.

**No citations. No concordance. No live-fire. No progress.**

---
Generated by Claude Council
Date: 2025-11-07T16:00:00Z
Phase: STRATEGIZE
Task: AFP-W0-DRQC-CITATION-ENFORCEMENT-20251107
