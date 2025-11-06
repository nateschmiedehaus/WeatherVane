# PLAN - Worktree Stability & Git Hygiene (Intelligent Merge)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE
**Date:** 2025-11-05
**Author:** Claude Council
**Approach:** Less conservative = Intelligent three-way merge (keep all good changes)

---

## Via Negativa Analysis

**Question**: Can we DELETE code instead of adding?

### Existing Code to Examine

**File**: `tools/wvo_mcp/scripts/git_error_recovery.sh` (219 lines)
- Lines 88-94: Conservative conflict resolution (`git checkout --ours`)
- Lines 52-86: Conflict detection logic
- Lines 96-110: Post-resolution cleanup

**Analysis**:

1. **Conservative resolution block (lines 88-94)** - ❌ Cannot delete, must REPLACE
   ```bash
   # Current (conservative):
   while IFS= read -r file; do
     git checkout --ours "$file"  # Discards theirs
     git add "$file"
   done <<< "$conflicted_files"
   ```
   - **Why not delete**: Need conflict resolution (can't just skip)
   - **Alternative**: REPLACE with intelligent merge (not delete)

2. **Conflict detection (lines 52-86)** - ✅ Keep (reuse existing)
   - Already identifies conflicted files
   - No need to rewrite this logic

3. **Post-resolution cleanup (lines 96-110)** - ✅ Keep (reuse existing)
   - Stages files, creates commit
   - No changes needed

**Via Negativa Conclusion**:
- ❌ Cannot delete existing code
- ✅ CAN simplify by reusing conflict detection (no duplication)
- 🔄 MUST replace conservative resolution with intelligent merge (6 lines → ~150 lines)

**Net LOC**: +144 LOC (not pure addition, but replacement means net gain)

---

## Refactor vs Repair Analysis

**Question**: Is this a PATCH (quick fix) or a REFACTOR (root cause fix)?

### Current State (Conservative Merge)
```bash
git checkout --ours "$file"  # Patch: Quick but wasteful
```

**Why it's a patch:**
- ✅ Fast (no merge logic)
- ✅ Safe (never breaks build)
- ❌ Discards work (loses Agent B's contributions)
- ❌ Creates rework (features must be re-implemented)

### Proposed State (Intelligent Merge)
```bash
if attempt_auto_merge "$file"; then
  # Keep both changes
elif attempt_semantic_merge "$file"; then
  # Structure-aware merge
elif attempt_union_merge "$file"; then
  # Manual review
else
  git checkout --ours "$file"  # Fallback
fi
```

**Why it's a refactor:**
- ✅ Addresses root cause (merge is better than discard)
- ✅ Changes approach (from "pick side" to "merge both")
- ✅ Adds infrastructure (merge functions, validation, telemetry)
- ✅ Pays down tech debt (preserves work, reduces rework)

**Decision**: This is a REFACTOR (not a patch)
- Not just fixing a bug (current code works as designed)
- Changing strategy (from conservative to intelligent)
- Adding capabilities (semantic merge, validation, telemetry)

**Implication**: Higher LOC (150 LOC for refactor is justified)

---

## Architecture Design

### Files to Modify

**1. `tools/wvo_mcp/scripts/git_error_recovery.sh`** (MODIFY - 219 → ~370 lines)
- Replace conservative merge block (lines 88-94) with intelligent merge
- Add 4 new functions: `attempt_auto_merge`, `attempt_semantic_merge_typescript`, `attempt_union_merge`, `log_merge_decision`
- Reuse existing conflict detection (lines 52-86)

**2. `tools/wvo_mcp/scripts/merge_helpers.sh`** (NEW - ~100 lines)
- Extract merge functions to separate file (modularity)
- Functions:
  - `attempt_auto_merge()` - git merge-file wrapper
  - `attempt_semantic_merge_typescript()` - structure-aware TS merge
  - `attempt_semantic_merge_json()` - key-based JSON merge
  - `attempt_union_merge()` - conflict markers
  - `validate_merge()` - syntax/build validation
  - `log_merge_decision()` - JSONL telemetry
- Sourced by git_error_recovery.sh

**3. `state/analytics/git_merge_decisions.jsonl`** (CREATE - empty initially)
- Telemetry log for merge decisions
- Format: newline-delimited JSON (JSONL)

**Total Files**: 1 modified, 2 created (3 files < 5 file limit ✅)

---

### Function Design

#### Function 1: `attempt_auto_merge`

**Purpose**: Try git's built-in three-way merge

**Signature**:
```bash
attempt_auto_merge() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Algorithm**:
```bash
1. Extract base, ours, theirs versions:
   git show :1:"$file" > "$file.base"   # Common ancestor
   git show :2:"$file" > "$file.ours"   # Our version
   git show :3:"$file" > "$file.theirs" # Their version

2. Attempt merge:
   git merge-file -p "$file.ours" "$file.base" "$file.theirs" > "$file.merged"

3. Check exit code:
   if [ $? -eq 0 ]; then
     mv "$file.merged" "$file"
     return 0  # Success
   else
     return 1  # Failed (overlapping changes)
   fi
```

**LOC Estimate**: ~15 LOC

---

#### Function 2: `attempt_semantic_merge_typescript`

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
1. Extract components from ours:
   imports_ours=$(grep '^import ' "$file.ours" | sort -u)
   exports_ours=$(grep '^export ' "$file.ours")

2. Extract components from theirs:
   imports_theirs=$(grep '^import ' "$file.theirs" | sort -u)
   exports_theirs=$(grep '^export ' "$file.theirs")

3. Merge imports (union, deduplicate):
   imports_merged=$(echo -e "$imports_ours\n$imports_theirs" | sort -u)

4. Merge exports (keep both if different names):
   exports_merged=$(merge_exports "$exports_ours" "$exports_theirs")

5. Rebuild file:
   echo "$imports_merged" > "$file"
   echo "" >> "$file"
   echo "$exports_merged" >> "$file"

6. Validate with TypeScript:
   if npx tsc --noEmit "$file" 2>/dev/null; then
     return 0  # Success
   else
     return 1  # Validation failed
   fi
```

**Helper**: `merge_exports` (checks for name collisions)

**LOC Estimate**: ~40 LOC (including helper)

**Limitation**: Simplified for MVP (doesn't parse AST, just uses grep)
- Future: Use TypeScript parser for full AST merge

---

#### Function 3: `attempt_semantic_merge_json`

**Purpose**: Key-based merge for JSON files

**Signature**:
```bash
attempt_semantic_merge_json() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Algorithm**:
```bash
1. Parse both JSON files:
   jq -s '.[0] * .[1]' "$file.ours" "$file.theirs" > "$file.merged"
   # jq's * operator does recursive merge

2. Validate:
   if jq . "$file.merged" >/dev/null 2>&1; then
     mv "$file.merged" "$file"
     return 0  # Success
   else
     return 1  # Validation failed
   fi
```

**LOC Estimate**: ~10 LOC

**Note**: jq's `*` operator handles:
- Merging keys (union)
- Recursive merge for nested objects
- Prefers right side (theirs) on conflicts (acceptable for MVP)

---

#### Function 4: `attempt_union_merge`

**Purpose**: Keep both versions with conflict markers

**Signature**:
```bash
attempt_union_merge() {
  local file=$1
  # Returns: 0 (always succeeds)
}
```

**Algorithm**:
```bash
1. Create merged file with markers:
   {
     echo "<<<<<<< OURS (Agent A)"
     cat "$file.ours"
     echo "======="
     echo ">>>>>>> THEIRS (Agent B)"
     cat "$file.theirs"
   } > "$file"

2. Always return success:
   return 0
```

**LOC Estimate**: ~8 LOC

---

#### Function 5: `validate_merge`

**Purpose**: Ensure merged file is valid

**Signature**:
```bash
validate_merge() {
  local file=$1
  # Returns: 0 if valid, 1 if invalid
}
```

**Algorithm**:
```bash
1. Detect file type:
   case "$file" in
     *.ts|*.tsx)
       npx tsc --noEmit "$file" 2>/dev/null || return 1
       ;;
     *.json)
       jq . "$file" >/dev/null 2>&1 || return 1
       ;;
     *.sh)
       bash -n "$file" || return 1
       ;;
   esac

2. Optional: Build check (may be slow):
   if [[ "$FULL_VALIDATION" == "true" ]]; then
     cd tools/wvo_mcp && npm run build || return 1
   fi

3. Return success:
   return 0
```

**LOC Estimate**: ~20 LOC

**Note**: FULL_VALIDATION is optional (can skip for speed)

---

#### Function 6: `log_merge_decision`

**Purpose**: Append telemetry to JSONL

**Signature**:
```bash
log_merge_decision() {
  local file=$1
  local strategy=$2
  local result=$3
  # Returns: 0 (always, non-blocking)
}
```

**Algorithm**:
```bash
1. Gather metadata:
   timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
   ours_hash=$(git hash-object "$file.ours")
   theirs_hash=$(git hash-object "$file.theirs")
   ours_lines=$(wc -l < "$file.ours")
   theirs_lines=$(wc -l < "$file.theirs")

2. Build JSON event:
   event=$(jq -n \
     --arg ts "$timestamp" \
     --arg f "$file" \
     --arg s "$strategy" \
     --arg r "$result" \
     --arg oh "$ours_hash" \
     --arg th "$theirs_hash" \
     --argjson ol "$ours_lines" \
     --argjson tl "$theirs_lines" \
     '{timestamp: $ts, file: $f, resolution_strategy: $s, result: $r, ours_hash: $oh, theirs_hash: $th, ours_lines: $ol, theirs_lines: $tl}')

3. Append to log (non-blocking):
   echo "$event" >> state/analytics/git_merge_decisions.jsonl 2>/dev/null || true

4. Always return success:
   return 0
```

**LOC Estimate**: ~20 LOC

---

### Main Integration (git_error_recovery.sh)

**Replace lines 88-94 with:**

```bash
# Intelligent merge resolution (replace conservative approach)
while IFS= read -r file; do
  if [ -f "$file" ]; then
    echo "Attempting intelligent merge for: $file"

    # Extract versions for merge functions
    git show :2:"$file" > "$file.ours" 2>/dev/null || true
    git show :3:"$file" > "$file.theirs" 2>/dev/null || true

    # Try merge strategies in order (auto → semantic → union → fallback)
    if attempt_auto_merge "$file"; then
      echo "  ✓ Auto-merged successfully"
      git add "$file"
      log_merge_decision "$file" "auto_merge" "kept_both"

    elif [[ "$file" == *.ts ]] || [[ "$file" == *.tsx ]] && attempt_semantic_merge_typescript "$file"; then
      echo "  ✓ Semantic merge (TypeScript) successful"
      git add "$file"
      log_merge_decision "$file" "semantic_merge_typescript" "kept_both"

    elif [[ "$file" == *.json ]] && attempt_semantic_merge_json "$file"; then
      echo "  ✓ Semantic merge (JSON) successful"
      git add "$file"
      log_merge_decision "$file" "semantic_merge_json" "kept_both"

    elif attempt_union_merge "$file"; then
      echo "  ⚠️  Union merge (manual review needed)"
      git add "$file"
      log_merge_decision "$file" "union_merge" "needs_review"

    else
      # Fallback to conservative (ours)
      echo "  ✗ Merge failed, keeping ours (fallback)"
      git checkout --ours "$file"
      git add "$file"
      log_merge_decision "$file" "fallback_ours" "discarded_theirs"
    fi

    # Clean up temp files
    rm -f "$file.base" "$file.ours" "$file.theirs" "$file.merged" 2>/dev/null || true
  fi
done <<< "$conflicted_files"
```

**LOC Estimate**: ~40 LOC (replacement block)

---

## LOC Estimates

### Summary

| File | Current LOC | New LOC | Delta | Type |
|------|-------------|---------|-------|------|
| git_error_recovery.sh | 219 | 259 | +40 | Modified (replace 6 lines with 40) |
| merge_helpers.sh | 0 | 113 | +113 | New |
| git_merge_decisions.jsonl | 0 | 0 | 0 | New (empty file) |
| **Total** | **219** | **372** | **+153** | **Net addition** |

### Detailed Breakdown

**merge_helpers.sh** (NEW - 113 LOC):
- `attempt_auto_merge`: 15 LOC
- `attempt_semantic_merge_typescript`: 40 LOC
- `attempt_semantic_merge_json`: 10 LOC
- `attempt_union_merge`: 8 LOC
- `validate_merge`: 20 LOC
- `log_merge_decision`: 20 LOC

**git_error_recovery.sh** (MODIFIED - +40 LOC):
- Add `source merge_helpers.sh`: 1 LOC
- Replace conservative block (6 lines) with intelligent merge (40 lines): +34 LOC
- Add validation call: 5 LOC

**Total Net LOC**: +153 LOC

⚠️ **LOC Limit Violation**: +153 LOC > 150 LOC limit

---

## Micro-Batching Strategy

**Problem**: 153 LOC exceeds 150 LOC limit

**Solution**: Split into 2 batches

### Batch 1: Core Merge Functions (THIS TASK)
**Scope**: Auto-merge + telemetry (minimal functional increment)
**Files**:
1. `merge_helpers.sh` (NEW - ~50 LOC):
   - `attempt_auto_merge` (15 LOC)
   - `attempt_union_merge` (8 LOC)
   - `validate_merge` (20 LOC)
   - `log_merge_decision` (20 LOC - simplified version)
2. `git_error_recovery.sh` (MODIFIED - +30 LOC):
   - Source merge_helpers.sh
   - Replace conservative block with auto→union→fallback logic
3. `git_merge_decisions.jsonl` (CREATE - empty)

**Net LOC**: +80 LOC (under 150 limit ✅)

**Exit Criteria**:
- Auto-merge works (70% of conflicts resolved)
- Union merge works (manual review path)
- Telemetry logged
- Validation pipeline works

**Functionality**: Basic intelligent merge (auto + union fallback)

---

### Batch 2: Semantic Merge (FOLLOW-UP TASK)
**Scope**: Add structure-aware merge for TypeScript + JSON
**Task ID**: AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Files**:
1. `merge_helpers.sh` (MODIFY - +60 LOC):
   - `attempt_semantic_merge_typescript` (40 LOC)
   - `attempt_semantic_merge_json` (10 LOC)
   - `merge_exports` helper (10 LOC)
2. `git_error_recovery.sh` (MODIFY - +10 LOC):
   - Add semantic merge to resolution chain
   - Insert between auto and union

**Net LOC**: +70 LOC (under 150 limit ✅)

**Exit Criteria**:
- Semantic merge works for TypeScript (add functions from both sides)
- Semantic merge works for JSON (merge keys)
- Telemetry shows 20% semantic merge success rate

**Functionality**: Full intelligent merge (auto + semantic + union)

---

## Risk Analysis

### Risk 1: Auto-Merge Produces Invalid Files

**Likelihood**: MEDIUM (git merge-file can create syntax errors)
**Impact**: HIGH (breaks build)

**Mitigation**:
1. Validate after every merge (`validate_merge` function)
2. If validation fails → revert to conservative merge
3. Log validation failures to telemetry
4. Test validation pipeline in unit tests

**Fallback**: Conservative merge (git checkout --ours)

---

### Risk 2: Semantic Merge Logic is Too Simplistic

**Likelihood**: HIGH (grep-based parsing misses edge cases)
**Impact**: MEDIUM (some merges fail, fallback to union)

**Examples**:
- Multi-line imports (breaks grep)
- Comments in code (not preserved)
- Function order matters (grep doesn't preserve)

**Mitigation**:
1. Document MVP limitations in code comments
2. Use union merge as fallback (human reviews later)
3. Future: Use TypeScript AST parser (not grep)
4. Test with realistic code samples (not toy examples)

**Acceptance**: MVP doesn't need perfection, just better than conservative

---

### Risk 3: Telemetry File Growth

**Likelihood**: HIGH (1 event per conflict, no rotation)
**Impact**: LOW (disk space, but small JSON lines)

**Growth Rate**: ~200 bytes per event
- 100 conflicts/day = 20 KB/day
- 1 year = 7.3 MB (acceptable)

**Mitigation**:
1. Document manual rotation (archive monthly)
2. Future: Add log rotation (logrotate or internal)
3. Monitor file size in git hygiene critic

**Acceptance**: Manual rotation is acceptable for MVP

---

### Risk 4: Merge Takes Too Long

**Likelihood**: MEDIUM (TypeScript compilation is slow)
**Impact**: MEDIUM (autopilot waits for merge)

**Timing**:
- Auto-merge: ~1 sec per file
- Semantic merge: ~3 sec per file (grep parsing)
- Validation (tsc): ~10 sec per file (slow!)
- Total: ~15 sec per conflicted file

**Mitigation**:
1. Make validation optional (FULL_VALIDATION flag)
2. Skip validation for non-critical merges
3. Run validation async (don't block commit)
4. Future: Cache tsc results (incremental compilation)

**Acceptance**: 15 sec per conflict is acceptable (better than manual intervention)

---

### Risk 5: Git State Corruption During Merge

**Likelihood**: LOW (merge uses temp files)
**Impact**: HIGH (breaks git repo)

**Scenarios**:
- Crash during merge → temp files left behind
- Interrupted merge → conflicted files not staged
- Merge script exits early → dirty tree

**Mitigation**:
1. Use trap to clean temp files on exit: `trap "rm -f *.ours *.theirs *.merged" EXIT`
2. Check git state before commit (existing git hygiene checks)
3. Test interruption scenarios (kill script mid-merge)
4. Existing error recovery handles dirty state

**Fallback**: Existing git_error_recovery.sh already handles dirty state

---

## Edge Cases

### Edge Case 1: Both Agents Delete Same File

**Scenario**:
- Agent A: Deletes `file.ts`
- Agent B: Deletes `file.ts`
- Git conflict: "both deleted"

**Expected Behavior**: No conflict (git auto-resolves)

**Test**: Not applicable to intelligent merge (git handles this)

---

### Edge Case 2: Both Agents Add Different Content to New File

**Scenario**:
- Agent A: Creates `new_file.ts` with content X
- Agent B: Creates `new_file.ts` with content Y
- Git conflict: "both added"

**Expected Behavior**:
1. Auto-merge fails (entire file is conflicted)
2. Semantic merge attempts to merge (both add different functions)
3. If semantic succeeds → keep both functions
4. If semantic fails → union merge (keep both with markers)

**Test**: Create artificial conflict with 2 new files

---

### Edge Case 3: One Agent Renames File, Other Modifies

**Scenario**:
- Agent A: Renames `old.ts` → `new.ts`
- Agent B: Modifies `old.ts` (adds function)
- Git conflict: "renamed, modified"

**Expected Behavior**:
- Git auto-detects rename (tracks content similarity)
- Applies modification to renamed file
- No conflict (git handles this)

**Test**: Not applicable to intelligent merge (git rename detection works)

---

### Edge Case 4: Conflict in Binary File

**Scenario**:
- Both agents modify `image.png`
- Git conflict: "both modified" (binary)

**Expected Behavior**:
1. Auto-merge fails (binary files not mergeable)
2. Semantic merge skips (not TypeScript/JSON)
3. Union merge skips (binary files)
4. Fallback to conservative (`git checkout --ours`)

**Test**: Create artificial conflict with binary file

---

### Edge Case 5: Conflict in Generated File (node_modules, dist)

**Scenario**:
- Both agents modify `node_modules/package/index.js` (generated)
- Git conflict: "both modified"

**Expected Behavior**:
- Auto-merge attempts (may succeed)
- Semantic merge skips (not user code)
- Fallback to conservative (prefer ours)
- **Better**: Regenerate (npm install, npm run build)

**Note**: Generated files shouldn't be in git (gitignore issue)

**Test**: Skip (fix gitignore instead)

---

## Testing Strategy

### Unit Tests (Batch 1)

**File**: `tools/wvo_mcp/scripts/test_merge_batch1.sh`

**Test Cases** (15 total):

1. **Auto-merge: Non-overlapping changes**
   - Setup: Agent A adds line 10, Agent B adds line 50
   - Expected: Auto-merge succeeds, both lines present
   - Assertion: `grep "line 10" && grep "line 50"`

2. **Auto-merge: Overlapping changes**
   - Setup: Agent A adds line 10, Agent B adds line 10 (different content)
   - Expected: Auto-merge fails (exit code 1)
   - Assertion: `[ $? -eq 1 ]`

3. **Union merge: Keep both with markers**
   - Setup: Auto-merge failed
   - Expected: File has conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
   - Assertion: `grep "<<<<<<< OURS"`

4. **Validate merge: Valid TypeScript**
   - Setup: Merged file is valid TS
   - Expected: `npx tsc --noEmit` succeeds (exit code 0)
   - Assertion: `[ $? -eq 0 ]`

5. **Validate merge: Invalid TypeScript**
   - Setup: Merged file has syntax error
   - Expected: `npx tsc --noEmit` fails (exit code 1)
   - Assertion: `[ $? -eq 1 ]`

6. **Validate merge: Valid JSON**
   - Setup: Merged file is valid JSON
   - Expected: `jq .` succeeds
   - Assertion: `[ $? -eq 0 ]`

7. **Telemetry: Log auto-merge**
   - Setup: Auto-merge succeeds
   - Expected: Event logged to `git_merge_decisions.jsonl`
   - Assertion: `jq 'select(.resolution_strategy == "auto_merge")' git_merge_decisions.jsonl | wc -l` equals 1

8. **Telemetry: Log union merge**
   - Setup: Union merge used
   - Expected: Event logged with `"result": "needs_review"`
   - Assertion: `jq 'select(.result == "needs_review")'`

9. **Fallback: Conservative merge when all fail**
   - Setup: Validation fails
   - Expected: Fallback to `git checkout --ours`
   - Assertion: File matches ours version

10. **Temp files cleaned up**
    - Setup: Merge completes
    - Expected: No `*.ours`, `*.theirs`, `*.merged` files left
    - Assertion: `ls *.ours 2>&1 | grep "No such file"`

11-15. **Edge cases** (binary files, generated files, etc.)

---

### Integration Tests (Batch 1)

**File**: `tools/wvo_mcp/scripts/test_git_merge_integration_batch1.sh`

**Test Scenarios** (5 total):

1. **End-to-end: Auto-merge success**
   - Setup: Create git repo, 2 branches with non-overlapping changes
   - Run: `bash git_error_recovery.sh`
   - Expected: Merge succeeds, both changes in file, commit created

2. **End-to-end: Union merge (manual review)**
   - Setup: Create conflict with overlapping changes
   - Run: `bash git_error_recovery.sh`
   - Expected: Union merge markers present, commit created, telemetry logged

3. **End-to-end: Multiple files conflicted**
   - Setup: 5 files with different conflict types
   - Run: `bash git_error_recovery.sh`
   - Expected: All resolved (auto or union), all staged, single commit

4. **End-to-end: Validation failure fallback**
   - Setup: Merge produces invalid TypeScript
   - Run: `bash git_error_recovery.sh`
   - Expected: Fallback to conservative merge, build succeeds

5. **End-to-end: Telemetry completeness**
   - Setup: 10 conflicts of different types
   - Run: `bash git_error_recovery.sh`
   - Expected: 10 events in telemetry log, all fields populated

---

### Dogfooding Strategy (Autopilot Testing) 🐶

**Concept**: Use intelligent merge implementation as a test case for autopilot itself

**How**:
1. **Intentional conflicts during implementation**:
   - Create 2 branches: `feature/merge-impl-a` and `feature/merge-impl-b`
   - Both branches work on `merge_helpers.sh` simultaneously
   - Merge using the new intelligent merge logic
   - Verify both branches' work is preserved

2. **Test scenarios**:
   - **Scenario A**: Agent A adds `attempt_auto_merge`, Agent B adds `attempt_union_merge`
   - **Expected**: Semantic merge keeps both functions
   - **Validation**: Both functions present in final file

3. **Autopilot meta-testing**:
   - Run autopilot 5 times with intentional conflicts in implementation
   - Monitor: Does intelligent merge preserve all work?
   - Metric: `changes_preserved` should be >90%

4. **Benefits**:
   - ✅ Tests the feature (intelligent merge works)
   - ✅ Tests autopilot (handles conflicts during its own development)
   - ✅ Dogfooding (we use our own system)
   - ✅ Builds confidence (if it works on itself, it works everywhere)

**Implementation**:
- Add "Dogfooding Test" section to verify.md
- Document conflicts created and resolved
- Include telemetry data showing merge decisions

---

## File Modification Order

**Batch 1 (THIS TASK):**

1. **Create `merge_helpers.sh`** (NEW):
   - Start with empty file
   - Add `attempt_auto_merge` (15 LOC)
   - Add `attempt_union_merge` (8 LOC)
   - Add `validate_merge` (20 LOC)
   - Add `log_merge_decision` (20 LOC)
   - Total: 63 LOC (includes comments, blank lines)

2. **Create `state/analytics/git_merge_decisions.jsonl`** (NEW):
   - Create empty file (mkdir -p state/analytics)
   - No content yet (populated at runtime)

3. **Modify `git_error_recovery.sh`**:
   - Add source line: `source "$(dirname "$0")/merge_helpers.sh"`
   - Replace lines 88-94 (conservative merge) with intelligent merge block
   - Add validation call after merge
   - Add temp file cleanup (trap)
   - Total: +30 LOC

**Order Rationale**:
- Create helpers first (dependencies before usage)
- Create telemetry file (mkdir ensures directory exists)
- Modify main script last (integrates helpers)

---

## Implementation Plan (Batch 1)

### Step 1: Create merge_helpers.sh Foundation

**File**: `tools/wvo_mcp/scripts/merge_helpers.sh`

**Content** (skeleton):
```bash
#!/usr/bin/env bash
# Merge Helpers - Intelligent Git Conflict Resolution
# MVP Batch 1: Auto-merge + Union merge + Validation + Telemetry

set -euo pipefail

# [Functions will be added here in implementation phase]

# attempt_auto_merge()   - 15 LOC
# attempt_union_merge()  - 8 LOC
# validate_merge()       - 20 LOC
# log_merge_decision()   - 20 LOC
```

**LOC**: ~5 LOC (header + set)

---

### Step 2: Implement attempt_auto_merge

**Add to merge_helpers.sh**:
```bash
attempt_auto_merge() {
  local file=$1

  # Extract base, ours, theirs versions
  git show :1:"$file" > "$file.base" 2>/dev/null || return 1
  git show :2:"$file" > "$file.ours" 2>/dev/null || return 1
  git show :3:"$file" > "$file.theirs" 2>/dev/null || return 1

  # Attempt three-way merge
  if git merge-file -p "$file.ours" "$file.base" "$file.theirs" > "$file.merged" 2>/dev/null; then
    mv "$file.merged" "$file"
    return 0  # Success
  else
    return 1  # Overlapping changes
  fi
}
```

**LOC**: 15 LOC

---

### Step 3: Implement attempt_union_merge

**Add to merge_helpers.sh**:
```bash
attempt_union_merge() {
  local file=$1

  # Always succeeds - keep both versions with markers
  {
    echo "<<<<<<< OURS (Agent A)"
    cat "$file.ours"
    echo "======="
    echo ">>>>>>> THEIRS (Agent B)"
    cat "$file.theirs"
  } > "$file"

  return 0  # Always succeeds
}
```

**LOC**: 8 LOC

---

### Step 4: Implement validate_merge

**Add to merge_helpers.sh**:
```bash
validate_merge() {
  local file=$1

  # Syntax check based on file type
  case "$file" in
    *.ts|*.tsx)
      npx tsc --noEmit "$file" 2>/dev/null || return 1
      ;;
    *.json)
      jq . "$file" >/dev/null 2>&1 || return 1
      ;;
    *.sh)
      bash -n "$file" || return 1
      ;;
  esac

  return 0
}
```

**LOC**: 20 LOC

---

### Step 5: Implement log_merge_decision

**Add to merge_helpers.sh**:
```bash
log_merge_decision() {
  local file=$1
  local strategy=$2
  local result=$3

  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local telemetry_file="state/analytics/git_merge_decisions.jsonl"

  # Ensure directory exists
  mkdir -p "$(dirname "$telemetry_file")"

  # Build JSON event
  local event=$(jq -n \
    --arg ts "$timestamp" \
    --arg f "$file" \
    --arg s "$strategy" \
    --arg r "$result" \
    '{timestamp: $ts, file: $f, resolution_strategy: $s, result: $r}')

  # Append (non-blocking)
  echo "$event" >> "$telemetry_file" 2>/dev/null || true

  return 0  # Never fails
}
```

**LOC**: 20 LOC

---

### Step 6: Modify git_error_recovery.sh

**Replace lines 88-94 with:**

```bash
# Source merge helpers
source "$(dirname "$0")/merge_helpers.sh"

# Intelligent merge resolution (Batch 1: auto + union)
while IFS= read -r file; do
  if [ -f "$file" ]; then
    echo "Attempting intelligent merge for: $file"

    # Extract versions
    git show :2:"$file" > "$file.ours" 2>/dev/null || true
    git show :3:"$file" > "$file.theirs" 2>/dev/null || true

    # Try merge strategies
    if attempt_auto_merge "$file"; then
      echo "  ✓ Auto-merged successfully"
      if validate_merge "$file"; then
        git add "$file"
        log_merge_decision "$file" "auto_merge" "kept_both"
      else
        echo "  ✗ Validation failed, fallback to ours"
        git checkout --ours "$file"
        git add "$file"
        log_merge_decision "$file" "fallback_ours" "validation_failed"
      fi

    elif attempt_union_merge "$file"; then
      echo "  ⚠️  Union merge (manual review needed)"
      git add "$file"
      log_merge_decision "$file" "union_merge" "needs_review"

    else
      # Should never reach (union always succeeds)
      echo "  ✗ All strategies failed, fallback to ours"
      git checkout --ours "$file"
      git add "$file"
      log_merge_decision "$file" "fallback_ours" "all_failed"
    fi

    # Clean up temp files
    rm -f "$file.base" "$file.ours" "$file.theirs" "$file.merged" 2>/dev/null || true
  fi
done <<< "$conflicted_files"
```

**LOC**: +40 LOC (replaces 6 lines)

---

### Step 7: Add trap for cleanup

**Add near top of git_error_recovery.sh (after set -euo pipefail):**

```bash
# Clean up temp files on exit (including Ctrl+C)
trap "rm -f *.base *.ours *.theirs *.merged 2>/dev/null || true" EXIT
```

**LOC**: +1 LOC

---

## Total LOC (Batch 1)

| Component | LOC |
|-----------|-----|
| merge_helpers.sh (NEW) | 68 LOC |
| git_error_recovery.sh (MODIFY) | +41 LOC |
| git_merge_decisions.jsonl (CREATE) | 0 LOC |
| **Total** | **109 LOC** |

✅ **Under 150 LOC limit**

---

## Batch 2 Preview (Semantic Merge)

**Task ID**: AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Scope**: Add TypeScript/JSON semantic merge
**Files**:
1. `merge_helpers.sh` (MODIFY - +60 LOC):
   - `attempt_semantic_merge_typescript` (40 LOC)
   - `attempt_semantic_merge_json` (10 LOC)
   - `merge_exports` helper (10 LOC)
2. `git_error_recovery.sh` (MODIFY - +10 LOC):
   - Insert semantic merge into resolution chain

**Total**: +70 LOC (under 150 limit ✅)

**Deferred to separate task** (micro-batching compliance)

---

## Success Criteria (Batch 1)

**Exit Criteria**:
1. ✅ Auto-merge resolves ≥50% of conflicts (lower than 70% target, but MVP)
2. ✅ Union merge handles all remaining conflicts (manual review path)
3. ✅ Validation catches invalid merges (no broken builds)
4. ✅ Telemetry logs all merge decisions (audit trail)
5. ✅ Unit tests pass (15 test cases)
6. ✅ Integration tests pass (5 scenarios)
7. ✅ Dogfooding test: intelligent merge resolves its own implementation conflicts

**Metrics**:
- Merge attempts: 100% logged
- Auto-merge success: ≥50% (MVP target, Batch 2 will improve to 70%)
- Validation pass rate: ≥95%
- Fallback rate: <5%

**Batch 2 will add**:
- Semantic merge for TypeScript (target: 20% success)
- Semantic merge for JSON (target: 10% success)
- Combined success rate: 70% auto + 20% semantic = 90% intelligent merge

---

## Next Phase: THINK

**Deliverables**:
- Edge cases analysis (6+ cases with likelihood, impact, mitigation)
- Failure modes (5+ modes with detection and recovery)
- Complexity analysis (cyclomatic, cognitive, testing complexity)
- Mitigation strategies
- Assumptions validation

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: PLAN phase complete, ready for THINK phase

**LOC Estimate**: 109 LOC (Batch 1 only, under 150 limit ✅)
**Files**: 1 new, 1 modified, 1 created (3 files < 5 file limit ✅)
**Micro-batching**: Compliant ✅
**Dogfooding**: Embedded in testing strategy ✅
