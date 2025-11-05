# Plan: AFP Five Forces Deployment

**Task ID:** AFP-FIVE-FORCES-DEPLOY-20251105
**Date:** 2025-11-05
**Phase:** PLAN

---

## Architecture Overview

**Four components to modify/create:**

1. `.githooks/pre-commit` - Enforcement layer
2. `docs/templates/design_template.md` - GATE guidance layer
3. `docs/AFP_QUICK_START.md` - Education layer (NEW)
4. `MANDATORY_WORK_CHECKLIST.md` - Integration layer

**Data flow:**
```
Developer writes code
  ↓
Runs GATE (uses design_template.md + checklist)
  ↓
Creates commit with pattern reference
  ↓
Pre-commit hook validates
  ↓
  [Passes] → Commit succeeds
  [Fails] → Error message with fix instructions
  [Override] → Logged to state/overrides.jsonl + commits
```

---

## Component 1: Pre-Commit Hook

**File:** `.githooks/pre-commit`
**Current state:** Has LOC limit (≤150) and file count (≤5) checks
**Changes:** Add five forces checks

**Implementation approach:**

```bash
#!/bin/bash

# Existing checks (preserve)
check_loc_limit() { ... }
check_file_count() { ... }

# NEW: Five forces checks
check_pattern_reference() {
  # Extract commit message (from git commit -m or editor)
  MSG=$(git log -1 --pretty=%B 2>/dev/null || cat .git/COMMIT_EDITMSG 2>/dev/null)

  if echo "$MSG" | grep -qE "(Pattern:|New pattern:)"; then
    return 0  # Pass
  else
    echo "❌ BLOCKED: No pattern reference found"
    echo ""
    echo "Five forces require COHERENCE check:"
    echo "  - Add 'Pattern: <name>' if reusing existing pattern"
    echo "  - Add 'New pattern: <reason>' if creating new pattern"
    echo ""
    echo "Examples:"
    echo "  Pattern: error_logging_with_context"
    echo "  New pattern: async error aggregation for batch processing"
    echo ""
    echo "To override: git commit --override='reason'"
    return 1  # Fail
  fi
}

check_deletion_accounting() {
  ADDED=$(git diff --cached --numstat | awk '{sum+=$1} END {print sum}')

  if [ "$ADDED" -gt 50 ]; then
    MSG=$(git log -1 --pretty=%B 2>/dev/null || cat .git/COMMIT_EDITMSG 2>/dev/null)

    if echo "$MSG" | grep -qE "Deleted:"; then
      return 0  # Pass
    else
      echo "❌ BLOCKED: +${ADDED} LOC added without deletion accounting"
      echo ""
      echo "Five forces require ECONOMY check:"
      echo "  - If adding >50 LOC, document what you deleted/simplified"
      echo "  - Add 'Deleted: <description>' to commit message"
      echo ""
      echo "Examples:"
      echo "  Deleted: duplicate error handling in 3 files (-45 LOC)"
      echo "  Deleted: unused config validation function (-20 LOC)"
      echo "  Simplified: combined 2 validators into 1 (-30 LOC)"
      echo ""
      echo "If genuinely can't delete: git commit --override='reason'"
      return 1  # Fail
    fi
  fi
  return 0  # Pass if <50 LOC
}

check_override() {
  # Check if --override flag passed
  if git config --get hooks.override >/dev/null 2>&1; then
    REASON=$(git config --get hooks.override)
    HASH=$(git rev-parse HEAD 2>/dev/null || echo "pending")
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Log override
    mkdir -p state
    echo "{\"timestamp\":\"$TIMESTAMP\",\"commit\":\"$HASH\",\"reason\":\"$REASON\"}" >> state/overrides.jsonl

    # Clear flag
    git config --unset hooks.override

    echo "⚠️  OVERRIDE used: $REASON"
    echo "Logged to state/overrides.jsonl for weekly review"
    return 0  # Allow commit
  fi
  return 1  # No override
}

# Main execution
if check_override; then
  exit 0  # Override everything
fi

# Run existing checks
check_loc_limit || exit 1
check_file_count || exit 1

# Run new checks
check_pattern_reference || exit 1
check_deletion_accounting || exit 1

echo "✅ AFP checks passed"
exit 0
```

**LOC estimate:** +80 LOC (two new check functions + override logic)

---

## Component 2: GATE Template Update

**File:** `docs/templates/design_template.md`
**Current state:** Has Via Negativa, Refactor vs Repair, Alternatives, etc.
**Changes:** Add five forces checklist + pattern decision section

**Insertion point:** After "Context" section, before "Via Negativa Analysis"

```markdown
## Five Forces Check

Before proceeding, verify you've considered all five forces:

- [ ] **COHERENCE** - I searched for similar patterns in the codebase
  - Checked 3 most similar modules: [list them]
  - Pattern I'm reusing: [name] OR why existing patterns don't fit: [reason]

- [ ] **ECONOMY** - I explored deletion/simplification (via negativa)
  - Code I can delete: [specific files/functions] OR why I must add: [reason]
  - LOC estimate: +[X] -[Y] = net [Z] (≤150 limit)

- [ ] **LOCALITY** - Related changes are in same module
  - Files changing: [list, all in same area?]
  - Dependencies: [are they local or scattered?]

- [ ] **VISIBILITY** - Errors are observable, interfaces are clear
  - Error handling: [how are failures logged?]
  - Public API: [is it minimal and clear?]

- [ ] **EVOLUTION** - I'm using proven patterns OR documenting new one
  - Pattern fitness: [has this pattern worked before?]
  - If new pattern: [why is it needed? how will we measure success?]

## Pattern Decision

**Similar patterns found:** [from COHERENCE search]
- Pattern 1: [file:line, description]
- Pattern 2: [file:line, description]
- Pattern 3: [file:line, description]

**Pattern selected:** [which one I'm using]
**Why this pattern:** [fits my use case because...]

**OR**

**New pattern needed:** [name]
**Why existing patterns don't fit:** [specific reason]
**How this pattern differs:** [key differences]

## Leverage Classification

**Code leverage level:** [critical / high / medium / low]

- **Critical:** Auth, payments, core abstractions → formal verification or 100% coverage
- **High:** Public APIs, frequently changed → comprehensive testing
- **Medium:** Business logic, orchestrators → happy path + error cases
- **Low:** Utils, rarely changed → smoke tests

**My code is:** [level] because [reason]
**Assurance strategy:** [testing/verification approach based on leverage]
```

**LOC estimate:** +60 LOC (markdown)

---

## Component 3: Quick-Start Guide

**File:** `docs/AFP_QUICK_START.md` (NEW)
**Purpose:** 10-minute read that explains five forces with examples

**Structure:**

1. **What is AFP?** (100 words)
   - Anti-fragile programming = code that learns and improves
   - Five forces guide all decisions
   - Enforced by pre-commit hook

2. **The Five Forces** (5 × 150 words = 750 words)
   - COHERENCE: Match existing patterns (heuristic: check 3 similar modules)
   - ECONOMY: Delete before adding (heuristic: if >50 LOC, find deletions)
   - LOCALITY: Related code together (heuristic: changes in 1-2 modules max)
   - VISIBILITY: Errors loud, complexity hidden (heuristic: log all errors)
   - EVOLUTION: Patterns prove fitness (heuristic: reuse proven, measure new)

3. **How to Comply** (150 words)
   - Commit message format with examples
   - Deletion accounting format
   - Override mechanism

**LOC estimate:** +120 LOC (markdown, ~900 words)

---

## Component 4: Checklist Update

**File:** `MANDATORY_WORK_CHECKLIST.md`
**Current state:** Has micro-batching, via negativa, refactor-vs-repair, complexity checks
**Changes:** Add five forces section, link to quick-start

**Insertion point:** After "Phase 0: [GATE] Pre-Implementation Phase Verification"

```markdown
## Phase 1: Five Forces Alignment

Before implementing, verify all five forces:

### 7. COHERENCE Check
- [ ] I searched for similar patterns (checked 3 most similar modules)
- [ ] I'm reusing proven pattern OR justifying why new pattern needed
- [ ] This fits the style/structure of surrounding code

### 8. ECONOMY Check
- [ ] I explored deletion/simplification (via negativa)
- [ ] If adding >50 LOC, I identified what to delete
- [ ] Changes are minimal (≤150 LOC, ≤5 files)

### 9. LOCALITY Check
- [ ] Related code is in same module
- [ ] Dependencies are local (not scattered)
- [ ] Changes don't create coupling across boundaries

### 10. VISIBILITY Check
- [ ] Errors are logged with context (no silent failures)
- [ ] Public interfaces are clear and minimal
- [ ] Complexity hidden behind abstraction

### 11. EVOLUTION Check
- [ ] I'm using proven pattern (tracked fitness) OR measuring new pattern
- [ ] Pattern will be logged in commit for fitness tracking
- [ ] Bad patterns can be deprecated based on data

**See:** [docs/AFP_QUICK_START.md](../docs/AFP_QUICK_START.md) for details and examples.

**Note:** Five forces GENERATE the existing principles:
- ECONOMY → via negativa, micro-batching
- COHERENCE → refactor not repair (match root patterns)
- LOCALITY → modularity
- VISIBILITY → fail explicitly
```

**LOC estimate:** +50 LOC (markdown)

---

## File Change Summary

| File | Current LOC | Added | Deleted | Net | Type |
|------|-------------|-------|---------|-----|------|
| `.githooks/pre-commit` | ~100 | +80 | -0 | +80 | bash |
| `docs/templates/design_template.md` | ~160 | +60 | -0 | +60 | markdown |
| `docs/AFP_QUICK_START.md` | 0 | +120 | -0 | +120 | NEW markdown |
| `MANDATORY_WORK_CHECKLIST.md` | ~130 | +50 | -10 | +40 | markdown |
| **Total** | **~390** | **+310** | **-10** | **+300** | **4 files** |

**Micro-batching compliance:** ⚠️ +300 LOC exceeds ≤150 limit

**Justification:**
- This is foundational framework (exception warranted)
- Mostly documentation (markdown), not code
- Can't be split (all components interdependent)
- One-time cost for long-term benefit
- Via negativa applied where possible (-10 LOC from checklist)

**Alternatives considered:**
1. Split into 2 tasks → rejected (components must deploy together)
2. Reduce documentation → rejected (clarity essential for adoption)
3. Deploy iteratively → rejected (partial deployment confuses users)

---

## Implementation Sequence

**Order matters (dependencies):**

1. **Create AFP_QUICK_START.md** (30 min)
   - No dependencies
   - Reference material for other components

2. **Update design_template.md** (20 min)
   - References quick-start guide
   - Used in GATE process

3. **Update MANDATORY_WORK_CHECKLIST.md** (15 min)
   - References quick-start guide
   - References design template

4. **Update pre-commit hook** (60 min)
   - References all above documentation in error messages
   - Most complex component
   - Requires testing

5. **Create state/overrides.jsonl** (5 min)
   - Empty file with header comment
   - Referenced by hook

**Total estimate:** 2.2 hours implementation + 1 hour testing = 3.2 hours

---

## Testing Strategy

**Unit-level:**
- Test hook functions individually (pattern check, deletion check, override)
- Test with sample commit messages

**Integration-level:**
- Make test commit without pattern → verify blocked
- Make test commit with pattern → verify passes
- Make test commit with override → verify logs

**End-to-end:**
- Real task using new GATE template
- Real commit following new format
- Verify all documentation links work

---

## Rollout Plan

**Hour 1-2:** Implementation
- Create/modify all 4 files
- Test locally

**Hour 3:** Testing
- Try to break the hook
- Fix issues
- Verify error messages helpful

**Hour 4:** Deployment
- Commit changes
- Announce to team (Slack/wherever)
- Monitor first few commits

**Week 1:** Monitoring
- Review override log daily
- Collect feedback
- Fix pain points

---

**Next Phase:** THINK (analyze edge cases and failure modes)
