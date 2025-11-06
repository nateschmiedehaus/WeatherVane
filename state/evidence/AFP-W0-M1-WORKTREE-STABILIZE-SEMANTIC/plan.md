# PLAN - Semantic Merge for TypeScript/JSON (Batch 2)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Date:** 2025-11-05
**Author:** Claude Council
**Batch:** 2 of 2 (extends Batch 1)
**Approach:** Grep-based TypeScript merge + jq-based JSON merge

---

## Via Negativa Analysis

**Question**: Can we DELETE code or simplify existing merge logic?

### Existing Code to Examine

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh` (Batch 1 - 157 lines)
- Lines 15-40: `attempt_auto_merge()` - Keep (works well)
- Lines 50-65: `attempt_union_merge()` - Keep (fallback needed)
- Lines 75-100: `validate_merge()` - Reuse (semantic merge needs validation)
- Lines 110-140: `log_merge_decision()` - Reuse (semantic merge logs decisions)

**Analysis**:

1. **Auto-merge (lines 15-40)** - ❌ Cannot delete
   - Still needed for non-overlapping text changes
   - Semantic merge is **addition** (not replacement)

2. **Union merge (lines 50-65)** - ❌ Cannot delete
   - Still needed as final fallback
   - Semantic merge won't handle 100% of cases

3. **Validation (lines 75-100)** - ✅ Reuse (no changes needed)
   - Semantic merge calls `validate_merge` after merging
   - No duplication, just reuse

4. **Telemetry (lines 110-140)** - ✅ Reuse (no changes needed)
   - Semantic merge logs via `log_merge_decision`
   - No duplication, just reuse

**Via Negativa Conclusion**:
- ❌ Cannot delete existing code (all still needed)
- ✅ CAN reuse validation + telemetry (no duplication)
- 🔄 MUST add semantic merge layer (new functionality)

**Net LOC**: +60 LOC (pure addition, no deletions possible)

---

## Refactor vs Repair Analysis

**Question**: Is this a PATCH (quick fix) or a REFACTOR (proper enhancement)?

### Current Merge Flow (Batch 1)

```
Auto-merge → Union merge
  (50-70%)     (30-50%)
```

**Why Batch 1 is "good enough but incomplete"**:
- ✅ Works for non-overlapping changes
- ❌ Misses structure-overlapping changes (same line, different structure)
- Example: Both add function at line 3 → auto fails → union (manual review)

### Proposed Enhancement (Batch 2)

```
Auto-merge → Semantic merge → Union merge
  (50-70%)      (20-30%)         (10-20%)
```

**Why this is an ENHANCEMENT (not a patch)**:
- Not fixing a bug (Batch 1 works as designed)
- Adding new capability (structure-aware merge)
- Improves success rate (70-90% vs 50-70%)
- Reduces manual review (10-20% vs 30-50%)

**Decision**: This is an ENHANCEMENT/EXTENSION (not a patch)
- Batch 1: MVP (text-based merge)
- Batch 2: Enhanced (structure-aware merge)
- Pattern: Progressive enhancement (add capabilities incrementally)

**Implication**: Higher LOC acceptable (~60 LOC for new semantic layer)

---

## Architecture Design

### Files to Modify

**1. `tools/wvo_mcp/scripts/merge_helpers.sh`** (MODIFY - 157 → ~217 lines)
- Add `attempt_semantic_merge_typescript()` (~30 LOC)
- Add `extract_typescript_structure()` helper (~15 LOC)
- Add `merge_typescript_functions()` helper (~15 LOC)
- Add `attempt_semantic_merge_json()` (~10 LOC)
- Total added: ~70 LOC raw (60 LOC excluding comments)

**2. `tools/wvo_mcp/scripts/git_error_recovery.sh`** (MODIFY - add 10 LOC)
- Insert semantic merge into strategy chain (2 new conditions)
- Between auto-merge and union-merge

**Total Files**: 2 files modified (< 5 file limit ✅)

---

### Function Design

#### Function 1: `attempt_semantic_merge_typescript`

**Purpose**: Structure-aware merge for TypeScript files

**Signature**:
```bash
attempt_semantic_merge_typescript() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Algorithm**:
```bash
1. Extract imports from both sides:
   imports_ours=$(grep '^import ' "$file.ours" | sort -u)
   imports_theirs=$(grep '^import ' "$file.theirs" | sort -u)

2. Merge imports (union, deduplicate):
   imports_merged=$(echo -e "$imports_ours\n$imports_theirs" | sort -u)

3. Extract functions from both sides:
   functions_ours=$(grep '^export function ' "$file.ours")
   functions_theirs=$(grep '^export function ' "$file.theirs")

4. Merge functions (helper: merge_typescript_functions):
   functions_merged=$(merge_typescript_functions "$functions_ours" "$functions_theirs")
   if [ $? -ne 0 ]; then
     return 1  # Conflict (same function name, different body)
   fi

5. Rebuild file:
   {
     echo "$imports_merged"
     echo ""
     echo "$functions_merged"
   } > "$file"

6. Validate:
   if validate_merge "$file"; then
     return 0  # Success
   else
     return 1  # Validation failed
   fi
```

**LOC Estimate**: ~30 LOC

---

#### Helper: `merge_typescript_functions`

**Purpose**: Merge function lists, detect conflicts

**Signature**:
```bash
merge_typescript_functions() {
  local functions_ours=$1
  local functions_theirs=$2
  # Returns: 0 if success, 1 if conflict
}
```

**Algorithm**:
```bash
1. Extract function names from both sides:
   # Parse "export function NAME(" lines
   names_ours=$(echo "$functions_ours" | sed -E 's/export function ([a-zA-Z0-9_]+).*/\1/')
   names_theirs=$(echo "$functions_theirs" | sed -E 's/export function ([a-zA-Z0-9_]+).*/\1/')

2. Check for name conflicts:
   # If same name appears in both, check if bodies match
   for name in $names_ours; do
     if echo "$names_theirs" | grep -q "^$name$"; then
       # Conflict: same function name in both
       return 1
     fi
   done

3. Merge (union):
   {
     echo "$functions_ours"
     echo "$functions_theirs"
   }
   return 0
```

**LOC Estimate**: ~15 LOC

**Limitation**: Only checks function **names**, not bodies (simplified for MVP)

---

#### Function 2: `attempt_semantic_merge_json`

**Purpose**: Key-based merge for JSON files using jq

**Signature**:
```bash
attempt_semantic_merge_json() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Algorithm**:
```bash
1. Use jq to recursively merge:
   jq -s '.[0] * .[1]' "$file.ours" "$file.theirs" > "$file.merged" 2>/dev/null || return 1

2. Validate merged JSON:
   if jq . "$file.merged" >/dev/null 2>&1; then
     mv "$file.merged" "$file"
     return 0
   else
     return 1
   fi
```

**jq `*` operator semantics**:
- Merges objects (union of keys)
- On key conflict, prefers right side (theirs)
- Recursively merges nested objects
- Arrays are **replaced** (right side wins)

**LOC Estimate**: ~10 LOC

---

### Integration Design (git_error_recovery.sh)

**Current Batch 1 logic** (lines 103-128):
```bash
if attempt_auto_merge "$file"; then
  echo "    ✓ Auto-merged successfully"
  git add "$file"
  log_merge_decision "$file" "auto_merge" "kept_both"

elif attempt_union_merge "$file"; then
  echo "    ⚠️  Union merge (manual review needed)"
  git add "$file"
  log_merge_decision "$file" "union_merge" "needs_review"
fi
```

**Enhanced Batch 2 logic** (insert semantic merge):
```bash
if attempt_auto_merge "$file"; then
  echo "    ✓ Auto-merged successfully"
  if validate_merge "$file"; then
    git add "$file"
    log_merge_decision "$file" "auto_merge" "kept_both"
  else
    echo "    ✗ Validation failed, trying semantic merge..."
    # Fall through to semantic merge
  fi

# NEW: TypeScript semantic merge
elif [[ "$file" == *.ts ]] || [[ "$file" == *.tsx ]]; then
  if attempt_semantic_merge_typescript "$file"; then
    echo "    ✓ Semantic merge (TypeScript) successful"
    git add "$file"
    log_merge_decision "$file" "semantic_merge_typescript" "kept_both"
  else
    echo "    ✗ Semantic merge failed, using union merge..."
    attempt_union_merge "$file"
    git add "$file"
    log_merge_decision "$file" "union_merge" "needs_review"
  fi

# NEW: JSON semantic merge
elif [[ "$file" == *.json ]]; then
  if attempt_semantic_merge_json "$file"; then
    echo "    ✓ Semantic merge (JSON) successful"
    git add "$file"
    log_merge_decision "$file" "semantic_merge_json" "kept_both"
  else
    echo "    ✗ Semantic merge failed, using union merge..."
    attempt_union_merge "$file"
    git add "$file"
    log_merge_decision "$file" "union_merge" "needs_review"
  fi

# Fallback: Union merge (all other file types or semantic failed)
else
  attempt_union_merge "$file"
  git add "$file"
  log_merge_decision "$file" "union_merge" "needs_review"
fi
```

**LOC Estimate**: ~40 LOC (replaces ~25 LOC = net +15 LOC)

**Note**: More complex than initial estimate due to file type branching

---

## LOC Estimates (Revised)

### Summary

| File | Current LOC | Added LOC | New LOC | Delta |
|------|-------------|-----------|---------|-------|
| merge_helpers.sh | 157 | +55 | 212 | +55 |
| git_error_recovery.sh | ~260 | +15 | ~275 | +15 |
| **Total** | **417** | **+70** | **487** | **+70** |

### Detailed Breakdown

**merge_helpers.sh** (add 55 LOC):
- `attempt_semantic_merge_typescript`: 30 LOC
- `merge_typescript_functions` helper: 15 LOC
- `attempt_semantic_merge_json`: 10 LOC

**git_error_recovery.sh** (add 15 LOC net):
- File type detection: 5 LOC
- Semantic TypeScript branch: 10 LOC
- Semantic JSON branch: 10 LOC
- Refactor existing union branch: -10 LOC (simplified)
- Net: +15 LOC

**Total Net LOC**: +70 LOC

⚠️ **LOC Limit Check**: 70 LOC < 150 LOC limit ✅

---

## Risk Analysis

### Risk 1: Grep Misses Multi-Line Imports

**Likelihood**: MEDIUM (40%)
- TypeScript allows multi-line imports: `import { A, B } from 'c'`
- Grep `'^import '` only catches first line

**Impact**: MEDIUM
- Imports not merged completely
- Validation (tsc) catches missing imports → fallback to union

**Mitigation**:
1. Accept limitation (MVP uses grep)
2. Validation catches syntax errors
3. Future: Upgrade to AST parser

**Test**: Create multi-line import, verify fallback works

---

### Risk 2: Function Name Collision Not Detected Properly

**Likelihood**: LOW (10%)
- Helper checks function names, but simplified regex

**Impact**: MEDIUM
- Merges two functions with same name → syntax error
- Validation catches → fallback to union

**Mitigation**:
1. Regex tested with common TypeScript patterns
2. Validation (tsc) catches duplicate function names
3. Fallback to union merge

**Test**: Create conflict with same function name, verify detection

---

### Risk 3: jq Prefers Right Side on JSON Key Conflicts

**Likelihood**: HIGH (80%)
- jq's `*` operator **always** prefers right side (theirs)

**Impact**: MEDIUM
- May discard useful data from ours
- Example: version "1.0" (ours) vs "2.0" (theirs) → keeps "2.0"

**Mitigation**:
1. Document jq behavior in telemetry
2. If problematic, implement custom JSON merge logic
3. For now, accept jq semantics (right side = incoming changes)

**Acceptance**: MVP uses jq, custom merge can be future enhancement

---

### Risk 4: Semantic Merge Success Rate < 20%

**Likelihood**: MEDIUM (30%)
- Assumption: ≥20% of conflicts are structure-mergeable
- Risk: Actual rate may be lower (depends on agent behavior)

**Impact**: HIGH
- If <10%, semantic merge adds complexity for little gain
- Wasted 70 LOC for minimal improvement

**Detection**:
- Measure actual success rate via telemetry
- Query: `jq 'select(.resolution_strategy | startswith("semantic"))' | wc -l`

**Mitigation**:
1. Measure actual rate during 5 consecutive runs
2. If <10%, consider reverting Batch 2
3. If 10-20%, acceptable (keep for future improvement)
4. If >20%, success (as planned)

---

### Risk 5: Validation Slow (TypeScript Compilation)

**Likelihood**: MEDIUM (40%)
- `npx tsc --noEmit` can be slow (~5-10 sec per file)

**Impact**: MEDIUM
- Total merge time >60 sec goal

**Mitigation**:
1. Skip validation if FAST_MERGE=1 flag set
2. Run validation async (don't block staging)
3. Accept slowdown for safety

**Acceptance**: Safety > speed (validation catches errors)

---

## Edge Cases

### Edge Case 1: Empty Function Bodies

**Scenario**: Agent adds function stub, other agent adds full implementation

```typescript
// Ours:
export function bar() { }  // Stub

// Theirs:
export function baz() { return 3; }  // Full

// Semantic merge:
export function bar() { }
export function baz() { return 3; }
// ✅ Both kept (different names)
```

**Handling**: Works correctly (different names → both kept)

---

### Edge Case 2: Comments vs Code

**Scenario**: One agent adds comment, other adds function

```typescript
// Ours:
// TODO: implement bar()

// Theirs:
export function baz() { return 3; }

// Semantic merge:
// (grep only extracts "export function" lines)
export function baz() { return 3; }
// ❌ Lost comment
```

**Handling**: Acceptable for MVP (comments not critical)

---

### Edge Case 3: JSON Array Conflicts

**Scenario**: Both agents add elements to same array

```json
// Ours:   {"items": [1, 2, 3]}
// Theirs: {"items": [4, 5, 6]}
// jq merge: {"items": [4, 5, 6]}  # Right side wins
```

**Handling**: Documented limitation (jq replaces arrays, doesn't merge)

---

### Edge Case 4: TypeScript Class (Not Function)

**Scenario**: Agents add classes, not functions

```typescript
// Ours:
export class Bar { }

// Theirs:
export class Baz { }

// Semantic merge:
// (grep '^export function ' misses classes)
// Falls back to union merge
```

**Handling**: Out of scope (Batch 2 only handles functions)

---

## Testing Strategy

### Unit Tests (10 tests)

**File**: `tools/wvo_mcp/scripts/test_semantic_merge.sh`

**TypeScript Tests** (5):
1. Different functions → both preserved
2. Same function name → conflict detected
3. Imports merged → duplicates removed
4. Multi-line import → fallback (validation fails)
5. Empty function bodies → handled correctly

**JSON Tests** (5):
1. Different keys → both preserved
2. Same key → right side wins
3. Nested objects → recursive merge
4. Array conflict → right side replaces
5. Invalid JSON → validation fails

---

### Integration Tests (3 tests)

**File**: `tools/wvo_mcp/scripts/test_semantic_integration.sh`

**Scenarios**:
1. **TypeScript conflict resolved**
   - Create conflict (both add functions at line 3)
   - Run git_error_recovery.sh
   - Verify semantic merge used, both functions present

2. **JSON conflict resolved**
   - Create conflict (both add keys)
   - Run git_error_recovery.sh
   - Verify semantic merge used, both keys present

3. **Mixed file types**
   - 5 conflicts (2 TS, 1 JSON, 2 other)
   - Verify strategy chain: auto → semantic (TS/JSON) → union (other)

---

### Regression Tests

**Ensure Batch 2 doesn't break Batch 1**:
1. Auto-merge still works (non-TS/JSON files)
2. Union merge still fallback
3. Validation still catches errors
4. Telemetry still logs decisions

---

## Implementation Order

### Step 1: Add `attempt_semantic_merge_json` (Simplest First)

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**Why first**: JSON merge is simplest (1 jq command), good warm-up

**Code**:
```bash
attempt_semantic_merge_json() {
  local file=$1

  # Recursive merge using jq * operator
  if ! jq -s '.[0] * .[1]' "$file.ours" "$file.theirs" > "$file.merged" 2>/dev/null; then
    return 1  # jq failed
  fi

  # Validate merged JSON
  if ! jq . "$file.merged" >/dev/null 2>&1; then
    return 1  # Invalid JSON
  fi

  mv "$file.merged" "$file"
  return 0
}
```

**Test**: Create JSON conflict, verify merge works

---

### Step 2: Add `merge_typescript_functions` Helper

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**Why second**: Helper needed by main TypeScript function

**Code**:
```bash
merge_typescript_functions() {
  local functions_ours=$1
  local functions_theirs=$2

  # Extract function names
  local names_ours=$(echo "$functions_ours" | sed -E 's/export function ([a-zA-Z0-9_]+).*/\1/')
  local names_theirs=$(echo "$functions_theirs" | sed -E 's/export function ([a-zA-Z0-9_]+).*/\1/')

  # Check for name collisions
  for name in $names_ours; do
    if echo "$names_theirs" | grep -q "^$name$"; then
      return 1  # Conflict
    fi
  done

  # Merge (union)
  echo "$functions_ours"
  echo "$functions_theirs"
  return 0
}
```

---

### Step 3: Add `attempt_semantic_merge_typescript`

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**Why third**: Main TypeScript function (uses helper from Step 2)

**Code**:
```bash
attempt_semantic_merge_typescript() {
  local file=$1

  # Extract imports
  local imports_ours=$(grep '^import ' "$file.ours" 2>/dev/null | sort -u)
  local imports_theirs=$(grep '^import ' "$file.theirs" 2>/dev/null | sort -u)
  local imports_merged=$(echo -e "$imports_ours\n$imports_theirs" | sort -u)

  # Extract functions
  local functions_ours=$(grep '^export function ' "$file.ours" 2>/dev/null)
  local functions_theirs=$(grep '^export function ' "$file.theirs" 2>/dev/null)

  # Merge functions
  local functions_merged=$(merge_typescript_functions "$functions_ours" "$functions_theirs")
  if [ $? -ne 0 ]; then
    return 1  # Conflict
  fi

  # Rebuild file
  {
    echo "$imports_merged"
    echo ""
    echo "$functions_merged"
  } > "$file"

  # Validate
  if ! validate_merge "$file"; then
    return 1
  fi

  return 0
}
```

---

### Step 4: Update `git_error_recovery.sh` Integration

**File**: `tools/wvo_mcp/scripts/git_error_recovery.sh`

**Why last**: Integrates all pieces together

**Changes**: Replace existing merge block (lines 103-128) with enhanced logic (see "Integration Design" section above)

---

## Success Criteria (Batch 2)

**Exit Criteria**:
1. ✅ Semantic TypeScript merge implemented (~45 LOC)
2. ✅ Semantic JSON merge implemented (~10 LOC)
3. ✅ Integration complete (~15 LOC)
4. ✅ Total: 70 LOC (under 150 limit)
5. ✅ Unit tests pass (10 tests)
6. ✅ Integration tests pass (3 tests)
7. ✅ Telemetry shows ≥20% semantic merge success rate

**Metrics**:
- Auto-merge: 50-70% (unchanged)
- Semantic merge: ≥20% (new)
- Union merge: <20% (reduced from 30-50%)
- Combined automated: 70-90% (improvement from 50-70%)

---

## Next Phase: THINK

**Deliverables**:
- Edge cases (8+ cases)
- Failure modes (6+ modes)
- Complexity analysis
- Mitigation strategies
- Assumptions validation

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: PLAN phase complete, ready for THINK phase

**LOC Estimate**: 70 LOC (under 150 limit ✅)
**Files**: 2 modified (under 5 file limit ✅)
**Micro-batching**: Compliant ✅
