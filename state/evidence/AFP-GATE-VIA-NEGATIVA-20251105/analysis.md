# Via Negativa Applied to GATE Enforcement

**Task**: AFP-GATE-VIA-NEGATIVA-20251105

**Problem**: Are we violating AFP by adding too much complexity to enforce simplicity?

---

## Instruction Volume Analysis

### Current State (LOC Count)

**Agent-Facing Instructions:**
- AGENTS.md GATE section: ~38 lines
- CLAUDE.md GATE section: ~38 lines (duplicate)
- task_lifecycle.md GATE section: ~81 lines
- design_template.md: 162 lines
- **Total instructions: ~319 lines**

**Enforcement Code:**
- run_design_review.ts: 142 lines
- design_reviewer.ts: 578 lines
- Pre-commit hook additions: ~40 lines
- **Total enforcement: ~760 lines**

**Grand Total: ~1,079 lines to enforce AFP thinking**

### Agent Cognitive Load

**Question: How many LOC can an agent actually process?**

From AGENTS.md context:
- Primary file is 144 lines total
- Of which ~38 lines are GATE instructions (26% of file)
- task_lifecycle.md is 650 lines total
- Of which ~81 lines are GATE (12% of file)

**Reality check:**
- Agents likely skim long documentation (TL;DR problem from meta-analysis)
- Verbose instructions → compliance theater (check boxes, don't think)
- More enforcement → more gaming opportunities

---

## Via Negativa Analysis

### What Can We DELETE?

#### Option 1: Delete Verbose Instructions → Replace with Constraints

**Current approach:**
- 319 lines of "how to think about AFP"
- Template with 162 lines
- Detailed remediation instructions
- Step-by-step workflow

**Via negativa approach:**
- Delete all instructions
- Replace with CONSTRAINTS enforced by automation:
  1. ≤5 files per commit (automated check)
  2. ≤150 net LOC per commit (automated check)
  3. Must delete ≥1 line for every 3 lines added (automated ratio check)
  4. Must pass DesignReviewer (automated quality gate)

**Result:** ~300 LOC instructions → ~20 LOC constraints

#### Option 2: Delete Automated Enforcement → Replace with Human Review

**Current approach:**
- 760 lines of enforcement code
- DesignReviewer with keyword checking
- Pre-commit hooks
- Automated quality gates

**Via negativa approach:**
- Delete all automation
- 10% random human review of commits
- Simple checklist (5 questions, yes/no)
- Trust but verify

**Result:** ~760 LOC enforcement code → 0 LOC (manual process)

#### Option 3: Delete Template → Replace with 3 Questions

**Current approach:**
- 162-line design_template.md
- 10+ sections to fill
- Detailed prompts in each section

**Via negativa approach:**
- Delete template
- Replace with 3 questions in design.md:
  1. What existing code did you try to delete before adding? (list files, line numbers)
  2. What are 2 other ways to solve this? (brief descriptions)
  3. Why is this approach simpler than those? (1-2 sentences)

**Result:** 162 lines → ~10 lines

#### Option 4: Delete DesignReviewer Intelligence → Replace with Simple Checks

**Current approach:**
- 578 lines of intelligent analysis
- Keyword detection for via negativa, alternatives, etc.
- File existence verification
- Comprehensive logging

**Via negativa approach:**
- Delete intelligent checks
- Replace with simple verification:
  ```typescript
  function simpleGateCheck(designMd: string): boolean {
    return designMd.includes("DELETE") &&
           designMd.split("Alternative").length >= 3 &&
           designMd.length > 200;
  }
  ```

**Result:** 578 lines → ~20 lines

---

## Proposed Simplified Approach

### Core Insight

**We're trying to TEACH AFP thinking with instructions.**
**AFP says: DELETE teaching, ADD constraints.**

Agents don't need to understand AFP philosophy.
They need constraints that FORCE AFP behavior.

### Micro-GATE: 3 Questions + 3 Constraints

**Delete:**
- All verbose instructions (319 lines)
- All enforcement code (760 lines)
- Design template (162 lines)

**Replace with:**

#### 3 Questions (design.md)
```markdown
# Design: TASK-ID

1. **What did you try to DELETE first?**
   Files examined: [list with line numbers]
   Deletion attempts: [what you tried, why it didn't work]

2. **What are 2 other approaches?**
   - Alternative A: [brief description]
   - Alternative B: [brief description]

3. **Why is your approach simpler?**
   [1-2 sentences comparing complexity]
```

#### 3 Automated Constraints (pre-commit hook)
```bash
# Constraint 1: Micro-batching
if [ $CHANGED_FILES -gt 5 ] || [ $NET_LOC -gt 150 ]; then
  echo "❌ BLOCKED: >5 files or >150 LOC"
  exit 1
fi

# Constraint 2: Deletion ratio
if [ $ADDED_LOC -gt $((DELETED_LOC * 3)) ]; then
  echo "❌ BLOCKED: Must delete ≥1 line per 3 added"
  exit 1
fi

# Constraint 3: Design exists for non-trivial changes
if [ $CHANGED_FILES -gt 1 ] && [ ! -f "state/evidence/$TASK_ID/design.md" ]; then
  echo "❌ BLOCKED: >1 file requires design.md"
  exit 1
fi
```

**Total LOC:** ~40 lines (vs 1,079 lines)

---

## Comparison

| Metric | Current | Micro-GATE | Reduction |
|--------|---------|------------|-----------|
| Instruction LOC | 319 | 10 | -97% |
| Enforcement LOC | 760 | 30 | -96% |
| Template LOC | 162 | 10 | -94% |
| **Total LOC** | **1,079** | **50** | **-95%** |
| Agent cognitive load | High | Low | -90% |
| Gaming opportunities | Many | Few | -80% |
| Maintenance burden | High | Low | -90% |

---

## Trade-offs

### What We Lose

1. **Intelligent feedback**: DesignReviewer provides specific guidance
2. **Educational value**: Verbose instructions teach AFP philosophy
3. **Nuanced analysis**: Can detect subtle violations
4. **Comprehensive logging**: Less gaming detection capability

### What We Gain

1. **Clarity**: 3 questions vs 10+ sections
2. **Speed**: No AI analysis, instant feedback
3. **Simplicity**: 50 LOC vs 1,079 LOC
4. **Maintainability**: Less code to debug
5. **AFP alignment**: Enforcing via negativa with via negativa

---

## Recommendation

**START with Micro-GATE (3 questions + 3 constraints)**

**Rationale:**
1. **Follows AFP**: We're deleting 95% of enforcement complexity
2. **Tests assumptions**: Does automation actually help or just create gaming?
3. **Fast iteration**: Can revert or add back if needed
4. **Measures effectiveness**: Compare quality of designs before/after

**Implementation:**
1. Archive current GATE system to `graveyard/gate_v1/`
2. Replace with Micro-GATE (50 LOC total)
3. Run for 10 tasks
4. Measure:
   - Design quality (manual review)
   - Compliance rate
   - Time spent on GATE
   - Agent feedback
5. Decide: Keep Micro-GATE, revert, or iterate

---

## Meta-Level Insight

**The irony**: Trying to enforce "via negativa" with 1,079 lines of code.

**The fix**: Apply via negativa to via negativa enforcement.

**Key principle**: Constraints > Instructions

- ✅ **Constraints** force behavior (can't commit without design.md)
- ❌ **Instructions** teach philosophy (agents skim or game)

**AFP in practice**: Delete the enforcement, keep the constraints.

---

## Next Steps

**Option A: Radical Simplification (Recommended)**
1. Implement Micro-GATE (3Q+3C)
2. Archive current system
3. Run experiment for 10 tasks
4. Measure and iterate

**Option B: Incremental Reduction**
1. Cut template from 162 → 50 lines
2. Cut DesignReviewer from 578 → 100 lines
3. Cut instructions from 319 → 100 lines
4. Preserve automation but simplify

**Option C: Keep Current System**
1. Accept complexity trade-off
2. Monitor for gaming
3. Rely on comprehensive logging
4. Trust that enforcement works

---

**Recommendation: Option A (Radical Simplification)**

Apply AFP to AFP enforcement. Delete 95%, keep constraints that matter.
