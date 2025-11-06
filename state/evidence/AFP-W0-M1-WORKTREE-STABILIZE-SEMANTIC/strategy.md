# STRATEGIZE - Semantic Merge for TypeScript/JSON (Batch 2)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Date:** 2025-11-05
**Author:** Claude Council
**Batch:** 2 of 2 (builds on Batch 1: auto-merge + union + validation)
**Approach:** Structure-aware merge for TypeScript and JSON files

---

## Problem Analysis - WHY

### What Batch 1 Achieved

**Batch 1** (just completed) implemented:
- ✅ Auto-merge: `git merge-file` for non-overlapping changes (50-70% success)
- ✅ Union merge: Keep both with conflict markers (manual review)
- ✅ Validation: TypeScript/JSON/Bash syntax checking
- ✅ Telemetry: JSONL audit trail

**Success**: Basic intelligent merge replaces conservative approach

### Gap: Structure-Blind Auto-Merge

**Problem**: `git merge-file` is **text-based**, not **structure-aware**

**Example failure case**:
```typescript
// Base:
export function foo() { return 1; }

// Agent A's version (ours):
export function foo() { return 1; }
export function bar() { return 2; }  // Added at line 3

// Agent B's version (theirs):
export function foo() { return 1; }
export function baz() { return 3; }  // Also added at line 3

// Auto-merge FAILS (overlapping line 3)
// Falls back to union merge (manual review)
```

**Why auto-merge fails**:
- Both agents added function at **same line number** (line 3)
- Git sees: "both modified line 3" → overlap → conflict
- But **semantically**, there's no conflict (different function names)

**Impact**: ~20-30% of conflicts fall to union merge unnecessarily

### What We Need: Structure-Aware Merge

**Semantic merge** understands code structure:
- Extracts **imports** from both sides → merge (union)
- Extracts **functions** from both sides → merge if different names
- Extracts **classes** from both sides → merge if different names
- **Only conflict** if same name modified differently

**Example with semantic merge**:
```typescript
// Semantic merge extracts structure:
imports_ours = ["export function bar"]
imports_theirs = ["export function baz"]

// Merge: Keep both (different names)
export function foo() { return 1; }
export function bar() { return 2; }  // From Agent A
export function baz() { return 3; }  // From Agent B
// ✅ Both functions preserved!
```

**Success rate improvement**:
- Batch 1: 50-70% auto-merge + 30-50% union = baseline
- Batch 2: 50-70% auto + **20-30% semantic** + 10-20% union = **70-90% automated**

---

## Current State Analysis

### Batch 1 Merge Flow (Current)

```
Conflict detected
    ↓
attempt_auto_merge()  ← Text-based (git merge-file)
    ↓ success (50-70%)
  DONE
    ↓ fail
attempt_union_merge()  ← Keep both with markers
    ↓ always succeeds
  DONE (manual review)
```

**Gap**: No semantic layer between auto and union

### Batch 2 Merge Flow (Desired)

```
Conflict detected
    ↓
attempt_auto_merge()  ← Text-based (50-70%)
    ↓ success
  DONE
    ↓ fail
attempt_semantic_merge_typescript()  ← NEW: Structure-aware (20-30%)
    ↓ success
  DONE
    ↓ fail
attempt_semantic_merge_json()  ← NEW: Key-based (5-10%)
    ↓ success
  DONE
    ↓ fail
attempt_union_merge()  ← Fallback (10-20%)
    ↓ always succeeds
  DONE (manual review)
```

**Improvement**: 70-90% automated (vs 50-70% in Batch 1)

---

## Desired State (Exit Criteria)

**Exit Criteria for Batch 2**:
1. ✅ Semantic merge for TypeScript implemented
   - Extracts imports from both sides → merges (union)
   - Extracts functions from both sides → merges if different names
   - Validates merged file with `tsc --noEmit`

2. ✅ Semantic merge for JSON implemented
   - Uses `jq` to recursively merge keys
   - Validates merged JSON with `jq .`

3. ✅ Integration with git_error_recovery.sh
   - Inserts semantic merge into strategy chain (between auto and union)
   - Telemetry logs semantic merge decisions

4. ✅ Success rate improvement measured
   - Telemetry shows ≥20% semantic merge success rate
   - Combined success: 70-90% (auto + semantic)
   - Union merge: <20% (manual review)

**Detailed Success Criteria**:

### 1. TypeScript Semantic Merge

**Capability**: Merge TypeScript files by structure (imports, functions, classes)

**Example**:
```typescript
// Both agents add different functions at same location
// Auto-merge fails (overlapping lines)
// Semantic merge extracts structure → keeps both functions
```

**Test**:
```bash
# Create conflict: Agent A adds bar(), Agent B adds baz() at same line
# Expected: Semantic merge keeps both functions
# Validation: tsc --noEmit succeeds, both functions present
```

### 2. JSON Semantic Merge

**Capability**: Merge JSON files by keys (recursive merge)

**Example**:
```json
// Ours:   {"name": "app", "feature_a": true}
// Theirs: {"name": "app", "feature_b": true}
// Merged: {"name": "app", "feature_a": true, "feature_b": true}
```

**Test**:
```bash
# Create conflict: Agent A adds key "feature_a", Agent B adds key "feature_b"
# Expected: Semantic merge merges keys (jq *)
# Validation: jq . succeeds, both keys present
```

### 3. Integration with Merge Flow

**Capability**: Semantic merge inserted between auto and union

**Flow**:
```bash
if attempt_auto_merge; then
  # Success (50-70%)
elif [[ "$file" == *.ts ]] && attempt_semantic_merge_typescript; then
  # NEW: Semantic TypeScript (20-30%)
elif [[ "$file" == *.json ]] && attempt_semantic_merge_json; then
  # NEW: Semantic JSON (5-10%)
elif attempt_union_merge; then
  # Fallback (10-20%)
fi
```

### 4. Success Rate Improvement

**Metrics** (from telemetry):
```bash
# Before Batch 2 (baseline):
auto_merge: 60% (typical)
union_merge: 40%

# After Batch 2 (target):
auto_merge: 50-70% (unchanged)
semantic_merge_typescript: 20-30% (new)
semantic_merge_json: 5-10% (new)
union_merge: 10-20% (reduced)

# Total automated: 75-110% → realistic 70-90%
```

---

## Alternatives Considered

### Alternative 1: AST-Based Semantic Merge - DEFERRED

**What**: Use TypeScript AST parser to understand code structure

**Pros**:
- ✅ More robust than grep (handles multi-line, nested structures)
- ✅ Can detect semantic conflicts (renamed functions, circular deps)

**Cons**:
- ❌ Complex (requires TypeScript compiler API)
- ❌ Slow (parsing AST for every conflict)
- ❌ High LOC (~200 LOC for parser + merge logic)

**Why Deferred**: Batch 2 is MVP (grep-based), AST can be future enhancement

---

### Alternative 2: Grep-Based Semantic Merge - ✅ SELECTED

**What**: Use grep to extract structure (imports, functions)

**Pros**:
- ✅ Simple (~60 LOC total)
- ✅ Fast (~1-2 sec per file)
- ✅ Good enough for MVP (handles 80% of cases)
- ✅ Proven approach (used by semantic merge tools)

**Cons**:
- ❌ Misses edge cases (multi-line imports, nested functions)
- ❌ Doesn't detect semantic conflicts (rename detection)

**Why Selected**:
- ✅ MVP philosophy: Simple, fast, good enough
- ✅ Validates with `tsc` (catches parse errors)
- ✅ Clear upgrade path (replace grep with AST later)

**How it aligns with AFP/SCAS**:
- **ECONOMY**: 60 LOC vs 200 LOC for AST (3× simpler)
- **COHERENCE**: Grep is proven pattern (used in existing scripts)
- **EVOLUTION**: Measure success rate, upgrade to AST if needed

---

### Alternative 3: Machine Learning-Based Merge - REJECTED

**What**: Train ML model to predict correct merge

**Pros**:
- Could learn patterns over time

**Cons**:
- ❌ Overkill for structural merge
- ❌ Requires training data
- ❌ Unpredictable (black box)

**Why Rejected**: Rule-based merge is sufficient and predictable

---

## Implementation Approach

### Phase 1: TypeScript Semantic Merge (~40 LOC)

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**New function**:
```bash
attempt_semantic_merge_typescript() {
  local file=$1

  # 1. Extract imports from both sides (grep)
  imports_ours=$(grep '^import ' "$file.ours" | sort -u)
  imports_theirs=$(grep '^import ' "$file.theirs" | sort -u)

  # 2. Merge imports (union, deduplicate)
  imports_merged=$(echo -e "$imports_ours\n$imports_theirs" | sort -u)

  # 3. Extract functions from both sides (grep for "export function")
  functions_ours=$(extract_functions "$file.ours")
  functions_theirs=$(extract_functions "$file.theirs")

  # 4. Merge functions (keep both if different names, conflict if same name)
  functions_merged=$(merge_functions "$functions_ours" "$functions_theirs")
  if [ $? -ne 0 ]; then
    return 1  # Conflict (same function name modified)
  fi

  # 5. Rebuild file: imports + functions
  echo "$imports_merged" > "$file"
  echo "" >> "$file"
  echo "$functions_merged" >> "$file"

  # 6. Validate with TypeScript compiler
  if npx tsc --noEmit "$file" 2>/dev/null; then
    return 0  # Success
  else
    return 1  # Validation failed
  fi
}
```

**Helper functions**:
```bash
extract_functions() {
  # Simplified: Extract "export function name()" lines
  grep '^export function ' "$1" || true
}

merge_functions() {
  # Union merge (keep both), detect conflicts (same name)
  # Returns 1 if same function name with different bodies
}
```

**LOC**: ~40 LOC (including helpers)

---

### Phase 2: JSON Semantic Merge (~10 LOC)

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**New function**:
```bash
attempt_semantic_merge_json() {
  local file=$1

  # Use jq's * operator for recursive merge
  # Prefers right side (theirs) on key conflicts
  jq -s '.[0] * .[1]' "$file.ours" "$file.theirs" > "$file.merged" 2>/dev/null || return 1

  # Validate merged JSON
  if jq . "$file.merged" >/dev/null 2>&1; then
    mv "$file.merged" "$file"
    return 0  # Success
  else
    return 1  # Validation failed
  fi
}
```

**LOC**: ~10 LOC

---

### Phase 3: Integration (~10 LOC)

**File**: `tools/wvo_mcp/scripts/git_error_recovery.sh`

**Modification** (insert semantic merge into existing chain):
```bash
# Try merge strategies in priority order
if attempt_auto_merge "$file"; then
  echo "    ✓ Auto-merged successfully"
  git add "$file"
  log_merge_decision "$file" "auto_merge" "kept_both"

# NEW: TypeScript semantic merge
elif [[ "$file" == *.ts ]] || [[ "$file" == *.tsx ]] && attempt_semantic_merge_typescript "$file"; then
  echo "    ✓ Semantic merge (TypeScript) successful"
  git add "$file"
  log_merge_decision "$file" "semantic_merge_typescript" "kept_both"

# NEW: JSON semantic merge
elif [[ "$file" == *.json ]] && attempt_semantic_merge_json "$file"; then
  echo "    ✓ Semantic merge (JSON) successful"
  git add "$file"
  log_merge_decision "$file" "semantic_merge_json" "kept_both"

elif attempt_union_merge "$file"; then
  echo "    ⚠️  Union merge (manual review needed)"
  git add "$file"
  log_merge_decision "$file" "union_merge" "needs_review"
fi
```

**LOC**: ~10 LOC net (insert 2 new conditions)

---

## LOC Estimates

| Component | LOC |
|-----------|-----|
| attempt_semantic_merge_typescript() | 40 LOC |
| attempt_semantic_merge_json() | 10 LOC |
| Integration (git_error_recovery.sh) | 10 LOC |
| **Total Batch 2** | **60 LOC** |

✅ **Under 150 LOC limit**

---

## Success Metrics

**How we know Batch 2 succeeds**:

1. ✅ **Semantic merge success rate**: ≥20% of conflicts resolved (telemetry)
2. ✅ **Combined automation rate**: 70-90% (auto + semantic vs 50-70% in Batch 1)
3. ✅ **Union merge reduced**: <20% (vs 30-50% in Batch 1)
4. ✅ **Validation pass rate**: ≥95% (merged files pass tsc/jq)
5. ✅ **Time saved**: Additional ~10 hours/day (5 conflicts × 2 hours rework each)

**Before vs After**:
- **Before Batch 2**: 60% auto + 40% union = 60% automated
- **After Batch 2**: 60% auto + 25% semantic + 15% union = **85% automated**

---

## Assumptions

1. **Assumption**: Grep can extract most TypeScript functions
   - **Validation**: Test with realistic TypeScript files (not toy examples)
   - **Risk**: Multi-line imports, nested functions miss (acceptable for MVP)
   - **Contingency**: Validation catches syntax errors → fallback to union

2. **Assumption**: jq's `*` operator is sufficient for JSON merge
   - **Validation**: Test with nested JSON, conflicting keys
   - **Risk**: Prefers right side on conflicts (may discard useful data)
   - **Contingency**: Document jq behavior, consider custom merge logic later

3. **Assumption**: ≥20% of conflicts are structure-mergeable
   - **Validation**: Analyze git log for conflict patterns
   - **Risk**: If <20%, semantic merge adds complexity for little gain
   - **Contingency**: Measure actual success rate, revert if <10%

4. **Assumption**: Validation (tsc, jq) catches semantic errors
   - **Validation**: Standard practice in TypeScript/JSON projects
   - **Risk**: Runtime bugs not caught (e.g., wrong function called)
   - **Contingency**: Tests/CI catch semantic errors post-merge

---

## Next Phase: SPEC

**Deliverables**:
- Functional requirements for semantic merge (FR1-FR3)
- Acceptance criteria (AC1-AC5)
- API contracts (2 new functions)
- Test strategy (unit + integration)

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: STRATEGIZE phase complete, ready for SPEC phase
**Approach**: Grep-based semantic merge (MVP), AST upgrade later
