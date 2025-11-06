# SPEC - Semantic Merge for TypeScript/JSON (Batch 2)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Date:** 2025-11-05
**Author:** Claude Council
**Batch:** 2 of 2 (extends Batch 1: auto-merge + union + validation)
**Approach:** Structure-aware merge using grep + jq

---

## Functional Requirements

### FR1: TypeScript Semantic Merge

**Requirement**: When auto-merge fails on TypeScript files, attempt structure-aware merge

**Input**:
- `$file` - Path to TypeScript file (.ts, .tsx)
- `$file.ours` - Our version
- `$file.theirs` - Their version

**Output**:
- Exit code 0 if semantic merge succeeds (both sides' structures preserved)
- Exit code 1 if semantic merge fails (same function name modified differently)
- Merged file with both sides' imports and functions

**Behavior**:
1. Extract imports from ours: `grep '^import ' "$file.ours"`
2. Extract imports from theirs: `grep '^import ' "$file.theirs"`
3. Merge imports: Union, remove duplicates, sort
4. Extract functions from ours: `grep '^export function ' "$file.ours"`
5. Extract functions from theirs: `grep '^export function ' "$file.theirs"`
6. Merge functions:
   - If different function names → keep both
   - If same function name with different bodies → return 1 (conflict)
7. Rebuild file: imports + newline + functions
8. Validate: `npx tsc --noEmit "$file"`
9. If validation passes → return 0, else return 1

**Example**:
```typescript
// Ours:
import {A} from 'a';
export function bar() { return 2; }

// Theirs:
import {B} from 'b';
export function baz() { return 3; }

// Semantic merge:
import {A} from 'a';
import {B} from 'b';

export function bar() { return 2; }  // From ours
export function baz() { return 3; }  // From theirs
```

---

### FR2: JSON Semantic Merge

**Requirement**: When auto-merge fails on JSON files, use key-based recursive merge

**Input**:
- `$file` - Path to JSON file (.json)
- `$file.ours` - Our version
- `$file.theirs` - Their version

**Output**:
- Exit code 0 if semantic merge succeeds (keys merged)
- Exit code 1 if merge fails (invalid JSON produced)
- Merged JSON with keys from both sides

**Behavior**:
1. Use jq to recursively merge: `jq -s '.[0] * .[1]' "$file.ours" "$file.theirs"`
2. Validate merged JSON: `jq . "$file.merged"`
3. If valid → mv to $file, return 0
4. If invalid → return 1

**Merge semantics** (jq `*` operator):
- Merges keys (union)
- On key conflict, prefers right side (theirs)
- Recursively merges nested objects
- Arrays are **replaced** (not merged) - right side wins

**Example**:
```json
// Ours:
{"name": "app", "version": "1.0", "feature_a": true}

// Theirs:
{"name": "app", "version": "1.0", "feature_b": true}

// Semantic merge:
{"name": "app", "version": "1.0", "feature_a": true, "feature_b": true}
```

---

### FR3: Integration into Merge Strategy Chain

**Requirement**: Insert semantic merge between auto-merge and union-merge

**Current chain** (Batch 1):
```
auto-merge → union-merge
```

**New chain** (Batch 2):
```
auto-merge → semantic-merge (TS/JSON) → union-merge
```

**Behavior**:
```bash
if attempt_auto_merge "$file"; then
  # Success: 50-70% (text-based)
elif is_typescript && attempt_semantic_merge_typescript "$file"; then
  # Success: 20-30% (structure-based)
elif is_json && attempt_semantic_merge_json "$file"; then
  # Success: 5-10% (key-based)
elif attempt_union_merge "$file"; then
  # Fallback: 10-20% (manual review)
fi
```

**Telemetry**: Log strategy used
- `semantic_merge_typescript` → `result: kept_both`
- `semantic_merge_json` → `result: kept_both`

---

## Non-Functional Requirements

### NFR1: Performance

- TypeScript semantic merge: <3 sec per file (grep is fast)
- JSON semantic merge: <1 sec per file (jq is fast)
- No significant slowdown vs Batch 1 (<5 sec overhead per conflict)

**Rationale**: Keep merge fast (total <60 sec for 5 files)

---

### NFR2: Simplicity (MVP)

- Use grep for TypeScript (not AST parser)
- Use jq for JSON (not custom merge logic)
- Accept limitations (multi-line imports, nested functions)
- Validation catches errors (tsc, jq)

**Rationale**: Batch 2 is MVP, upgrade to AST in future if needed

---

### NFR3: Safety

- Always validate merged file (tsc, jq)
- If validation fails → fallback to union merge
- Never stage invalid code

**Rationale**: Preserve Batch 1 safety guarantees

---

### NFR4: Observability

- Log all semantic merge attempts (telemetry)
- Track success rate (% of conflicts resolved by semantic merge)
- Dashboard query: `jq 'select(.resolution_strategy | startswith("semantic"))' state/analytics/git_merge_decisions.jsonl`

**Rationale**: Measure improvement, decide if semantic merge worth the complexity

---

## Acceptance Criteria

### AC1: TypeScript Semantic Merge - Different Functions

**Given**: Two agents add different functions to same TypeScript file
**When**: Auto-merge fails (overlapping line numbers)
**Then**:
- Semantic merge extracts both functions
- Merged file contains both functions
- TypeScript compiler validates merged file
- Telemetry logged: `strategy: semantic_merge_typescript, result: kept_both`

**Test Scenario**:
```bash
# Setup:
echo "export function foo() { return 1; }" > test.ts
git add test.ts && git commit -m "base"

# Branch A:
echo "export function bar() { return 2; }" >> test.ts  # Line 2
git commit -am "add bar"

# Branch B (from base):
git checkout -b branch-b HEAD~1
echo "export function baz() { return 3; }" >> test.ts  # Also line 2
git commit -am "add baz"

# Merge:
git merge branch-a  # Conflict at line 2
# Expected: Semantic merge keeps both bar() and baz()
# Validation: grep "bar" test.ts && grep "baz" test.ts
```

---

### AC2: TypeScript Semantic Merge - Same Function (Conflict)

**Given**: Two agents modify same function differently
**When**: Auto-merge fails
**Then**:
- Semantic merge detects same function name
- Returns 1 (conflict)
- Falls back to union merge
- Telemetry logged: `strategy: union_merge, result: needs_review`

**Test Scenario**:
```bash
# Both agents modify function foo() differently
# Expected: Semantic merge fails (same name, different body)
# Expected: Union merge creates conflict markers
```

---

### AC3: JSON Semantic Merge - Different Keys

**Given**: Two agents add different keys to same JSON file
**When**: Auto-merge fails
**Then**:
- Semantic merge uses jq to merge keys
- Merged JSON contains both keys
- jq validates merged JSON
- Telemetry logged: `strategy: semantic_merge_json, result: kept_both`

**Test Scenario**:
```bash
# Setup:
echo '{"name": "app"}' > test.json
git add test.json && git commit -m "base"

# Branch A:
echo '{"name": "app", "feature_a": true}' > test.json
git commit -am "add feature_a"

# Branch B (from base):
git checkout -b branch-b HEAD~1
echo '{"name": "app", "feature_b": true}' > test.json
git commit -am "add feature_b"

# Merge:
git merge branch-a  # Conflict
# Expected: Semantic merge produces {"name": "app", "feature_a": true, "feature_b": true}
# Validation: jq '.feature_a' test.json && jq '.feature_b' test.json
```

---

### AC4: JSON Semantic Merge - Key Conflict (Right Side Wins)

**Given**: Two agents modify same key differently
**When**: Semantic merge encounters key conflict
**Then**:
- jq's `*` operator prefers right side (theirs)
- Merged JSON has their value (not ours)
- jq validates merged JSON

**Test Scenario**:
```bash
# Ours:   {"version": "1.0"}
# Theirs: {"version": "2.0"}
# Expected: {"version": "2.0"}  # Theirs wins
```

**Note**: This is jq's behavior, not a bug. Document in limitations.

---

### AC5: Integration - Strategy Chain Executes Correctly

**Given**: 5 conflicted files (2 TS, 1 JSON, 2 other)
**When**: Intelligent merge runs
**Then**:
- Auto-merge attempts all 5 files first
- For TS files where auto failed: semantic TypeScript merge attempts
- For JSON file where auto failed: semantic JSON merge attempts
- For other files where semantic failed: union merge
- Telemetry shows mix of strategies

**Test Scenario**:
```bash
# Create 5 conflicts (varied file types)
# Expected telemetry:
# - 1-2 files: auto_merge
# - 1-2 files: semantic_merge_typescript
# - 0-1 files: semantic_merge_json
# - 1-2 files: union_merge
```

---

## API Contracts

### Function: `attempt_semantic_merge_typescript`

**Signature**:
```bash
attempt_semantic_merge_typescript() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Contract**:
- **Precondition**: `$file` is TypeScript (.ts, .tsx), auto-merge failed, `$file.ours` and `$file.theirs` exist
- **Postcondition**: If return 0, `$file` contains merged imports + functions and passes `tsc --noEmit`
- **Side Effects**: Creates temp files, writes to `$file`, runs tsc
- **Error Handling**: Returns 1 on: grep failure, merge conflict (same function name), tsc validation failure

---

### Function: `attempt_semantic_merge_json`

**Signature**:
```bash
attempt_semantic_merge_json() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Contract**:
- **Precondition**: `$file` is JSON (.json), auto-merge failed, `$file.ours` and `$file.theirs` exist
- **Postcondition**: If return 0, `$file` contains merged JSON and passes `jq .`
- **Side Effects**: Runs jq, writes to `$file`
- **Error Handling**: Returns 1 on: jq parse failure, jq merge failure, validation failure

---

## Out of Scope

**The following are explicitly OUT OF SCOPE for Batch 2:**

1. **AST-based parsing** - Use grep (simple), upgrade to AST later if needed
2. **Multi-line imports** - grep `'^import '` only catches single-line
3. **Nested functions** - grep `'^export function '` misses inner functions
4. **Class merge** - Only functions in MVP, classes can be future enhancement
5. **Semantic conflict detection** - Don't detect renamed functions, circular deps
6. **Custom JSON merge** - Use jq's `*` operator (prefers right side on conflicts)
7. **Array merge in JSON** - jq replaces arrays (doesn't merge elements)

**Acceptable**: Validation (tsc, jq) catches most errors, union merge handles remaining cases

---

## Test Strategy

### Unit Tests (10 tests)

**Scope**: Test each semantic merge function in isolation

**Files**:
- `tools/wvo_mcp/scripts/test_semantic_merge_ts.sh` (5 tests)
- `tools/wvo_mcp/scripts/test_semantic_merge_json.sh` (5 tests)

**TypeScript Tests**:
1. Different functions → both preserved
2. Same function name → conflict detected
3. Imports merged → duplicates removed
4. Validation fails → returns 1
5. Complex file (multiple functions) → all merged

**JSON Tests**:
1. Different keys → both preserved
2. Same key → right side wins
3. Nested objects → recursive merge
4. Arrays → right side replaces
5. Validation fails → returns 1

---

### Integration Tests (3 tests)

**Scope**: Test end-to-end merge flow with semantic merge

**Files**:
- `tools/wvo_mcp/scripts/test_semantic_integration.sh`

**Scenarios**:
1. **TypeScript conflict resolved by semantic merge**
   - Create conflict (both add functions)
   - Run git_error_recovery.sh
   - Verify semantic merge used, both functions present

2. **JSON conflict resolved by semantic merge**
   - Create conflict (both add keys)
   - Run git_error_recovery.sh
   - Verify semantic merge used, both keys present

3. **Mixed file types**
   - Create 5 conflicts (2 TS, 1 JSON, 2 other)
   - Run git_error_recovery.sh
   - Verify strategy chain: auto → semantic → union

---

### Regression Tests

**Scope**: Ensure Batch 2 doesn't break Batch 1 functionality

**Tests**:
1. Auto-merge still works (text-based, non-TypeScript/JSON files)
2. Union merge still fallback (when semantic fails)
3. Validation still catches errors
4. Telemetry still logs all decisions

---

## Success Metrics

**How we know Batch 2 succeeds:**

1. ✅ **Semantic merge success rate**: ≥20% of conflicts (telemetry)
   - TypeScript: 15-25% of conflicts
   - JSON: 5-10% of conflicts

2. ✅ **Combined automation rate**: 70-90% (auto + semantic)
   - Before: 50-70% auto + 30-50% union
   - After: 50-70% auto + 20-30% semantic + 10-20% union

3. ✅ **Union merge reduced**: <20% (vs 30-50% in Batch 1)

4. ✅ **Validation pass rate**: ≥95% (semantic merges pass tsc/jq)

5. ✅ **Time saved**: Additional ~10 hours/day (5 semantic merges × 2 hours rework)

**Dashboard Query**:
```bash
# Count semantic merge successes
jq -s '[.[] | select(.resolution_strategy | startswith("semantic"))] | length' \
  state/analytics/git_merge_decisions.jsonl

# Success rate
jq -s '
  ([ .[] | select(.resolution_strategy | startswith("semantic"))] | length) as $semantic |
  (length) as $total |
  ($semantic / $total * 100)
' state/analytics/git_merge_decisions.jsonl
```

---

## Assumptions

1. **Assumption**: grep can extract most TypeScript structure
   - **Validation**: Test with real codebase files (not toy examples)
   - **Risk**: Multi-line imports, nested functions missed
   - **Contingency**: Validation catches syntax errors → union merge

2. **Assumption**: jq's `*` operator is sufficient for JSON merge
   - **Validation**: Test with nested JSON, array conflicts
   - **Risk**: Arrays replaced (not merged), right side wins on conflicts
   - **Contingency**: Document behavior, consider custom merge logic if issues

3. **Assumption**: ≥20% of conflicts are structure-mergeable
   - **Validation**: Analyze git log conflict patterns
   - **Risk**: If <10%, semantic merge not worth complexity
   - **Contingency**: Measure actual rate, revert if insufficient improvement

4. **Assumption**: Validation (tsc, jq) catches semantic errors
   - **Validation**: Standard practice in TypeScript/JSON projects
   - **Risk**: Runtime bugs (wrong function called) not caught
   - **Contingency**: Tests/CI catch semantic errors post-merge

---

## Next Phase: PLAN

**Deliverables**:
- Via negativa analysis (can we simplify further?)
- Refactor vs Repair analysis (extension, not patch)
- Architecture design (2 new functions + integration)
- LOC estimates (~60 LOC)
- Risk analysis (edge cases, failure modes)
- Implementation order

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: SPEC phase complete, ready for PLAN phase
