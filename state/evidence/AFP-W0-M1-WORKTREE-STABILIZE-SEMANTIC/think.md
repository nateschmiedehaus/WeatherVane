# THINK - Semantic Merge for TypeScript/JSON (Batch 2)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE-SEMANTIC
**Date:** 2025-11-05
**Author:** Claude Council
**Batch:** 2 of 2

---

## Edge Cases Analysis

### Edge Case 1: Multi-Line TypeScript Import

**Scenario**: Import spans multiple lines (common formatting)

```typescript
// Ours:
import {
  A,
  B,
  C
} from 'module';

// Grep result:
"import {"  // Only first line captured
```

**Likelihood**: HIGH (60%)
- Modern formatters (Prettier) create multi-line imports

**Impact**: MEDIUM
- Import not fully captured
- Validation (tsc) fails → fallback to union

**Detection**: Validation catches missing imports

**Mitigation**:
1. Accept limitation (MVP uses simple grep)
2. Validation ensures safety (tsc catches errors)
3. Future: Use AST parser for robust extraction

**Test**: Create multi-line import conflict, verify fallback works

---

### Edge Case 2: TypeScript Function with Multi-Line Signature

**Scenario**: Function signature spans multiple lines

```typescript
// Theirs:
export function complexFunction(
  param1: string,
  param2: number
): Promise<Result> {
  return Promise.resolve({});
}

// Grep result:
"export function complexFunction("  // Only first line
```

**Likelihood**: MEDIUM (40%)
- Long parameter lists formatted across lines

**Impact**: LOW
- Function extracted incompletely
- But `merge_typescript_functions` only checks names (not full signatures)
- Validation ensures merged file compiles

**Mitigation**:
1. Helper only checks function **names** (first line has name)
2. Validation catches syntax errors if extraction fails

**Test**: Create multi-line function signature, verify name extraction works

---

### Edge Case 3: JSON Array Merge (Both Agents Add Elements)

**Scenario**: Both agents modify same array

```json
// Ours:   {"items": [1, 2]}
// Theirs: {"items": [3, 4]}
// jq merge: {"items": [3, 4]}  // Right side wins
```

**Likelihood**: HIGH (50%)
- Common: Both agents add items to array

**Impact**: MEDIUM
- Loses ours' array elements
- jq's `*` operator **replaces** arrays (doesn't merge elements)

**Detection**: Telemetry shows `semantic_merge_json` with `result: kept_both` (misleading - actually kept theirs only)

**Mitigation**:
1. Document jq behavior (arrays replaced, not merged)
2. If problematic: Implement custom JSON merge (future enhancement)
3. For MVP: Accept jq semantics

**Acceptance**: Arrays are edge case (most JSON conflicts are key additions)

---

### Edge Case 4: TypeScript Class Definition (Not Function)

**Scenario**: Agents add classes instead of functions

```typescript
// Ours:
export class Bar {
  method() { }
}

// Theirs:
export class Baz {
  method() { }
}

// Grep '^export function ':
# No matches (classes not captured)

// Result:
# Falls back to union merge
```

**Likelihood**: MEDIUM (30%)
- TypeScript uses both functions and classes

**Impact**: LOW
- Semantic merge skips classes → union merge
- No worse than Batch 1 (just doesn't improve this case)

**Mitigation**:
1. Document limitation (Batch 2 only handles functions)
2. Future: Add class extraction (grep '^export class ')

**Acceptance**: Functions are most common (classes can be Batch 3)

---

### Edge Case 5: JSON Key Conflict (Different Values)

**Scenario**: Both agents modify same key to different values

```json
// Ours:   {"version": "1.0"}
// Theirs: {"version": "2.0"}
// jq merge: {"version": "2.0"}  // Theirs wins
```

**Likelihood**: MEDIUM (40%)
- Common: Both agents update same config value

**Impact**: MEDIUM
- Discards ours' value (may lose valid update)
- jq's `*` operator prefers right side (theirs)

**Detection**: Telemetry shows `semantic_merge_json` but doesn't indicate value was discarded

**Mitigation**:
1. Document jq behavior (right side wins on conflicts)
2. If problematic: Detect key conflicts, log warning
3. Future: Custom merge logic (prompt for conflict resolution)

**Acceptance**: Right side = incoming changes (reasonable default)

---

### Edge Case 6: TypeScript Function Name Collision (Same Name, Different Bodies)

**Scenario**: Both agents add function with same name but different implementations

```typescript
// Ours:
export function process() { return "A"; }

// Theirs:
export function process() { return "B"; }

// Semantic merge:
# Helper detects same name → returns 1 (conflict)
# Falls back to union merge
```

**Likelihood**: LOW (10%)
- Rare: Agents usually add uniquely-named functions

**Impact**: LOW
- Correct behavior (semantic conflict → union merge)

**Detection**: Helper's `grep` check catches same name

**Mitigation**: Already handled correctly by helper

**Test**: Create same-name function conflict, verify detection works

---

### Edge Case 7: Empty Files (One Side Adds, Other Side Empty)

**Scenario**: One agent adds content, other leaves file empty

```typescript
// Ours:   (empty file)
// Theirs: export function foo() { }

// Semantic merge:
# grep '^export function ' on ours: (no matches)
# grep '^export function ' on theirs: "export function foo..."
# Merge: Just theirs' function
```

**Likelihood**: LOW (5%)
- Rare: Both agents usually add something

**Impact**: NONE
- Correct behavior (keep non-empty side)

**Mitigation**: Not needed (works correctly)

---

### Edge Case 8: TypeScript Import from Same Module (Different Exports)

**Scenario**: Both agents import different exports from same module

```typescript
// Ours:
import {A} from 'module';

// Theirs:
import {B} from 'module';

// Semantic merge:
import {A} from 'module';
import {B} from 'module';

// tsc validation:
# Error: Duplicate imports from same module
```

**Likelihood**: MEDIUM (30%)
- Common: Agents import different things from same module

**Impact**: HIGH (validation fails)
- tsc rejects duplicate import statements
- Falls back to union merge

**Detection**: Validation catches (tsc error)

**Mitigation**:
1. Accept limitation (MVP doesn't merge import lists)
2. Validation ensures safety
3. Future: Parse imports, merge export lists

**Acceptance**: Validation prevents broken merges

---

## Failure Modes

### Failure Mode 1: Grep Extraction Fails (Malformed TypeScript)

**Description**: grep `'^export function '` matches nothing (malformed code)

**Likelihood**: LOW (5%)
- Rare: Agents produce valid TypeScript

**Impact**: MEDIUM
- Semantic merge skips file → union merge
- No worse than Batch 1

**Detection**:
- `functions_ours` is empty
- Semantic merge returns 1 (no functions to merge)

**Recovery**:
1. Falls back to union merge (manual review)
2. Telemetry logs `union_merge`

**Prevention**: Agents should produce valid TypeScript

---

### Failure Mode 2: jq Merge Produces Invalid JSON

**Description**: jq `-s` fails or produces malformed JSON

**Likelihood**: LOW (5%)
- jq is robust (rarely fails on valid JSON)

**Impact**: HIGH (if no validation)
- Invalid JSON staged → build breaks

**Detection**:
- Validation: `jq . "$file.merged"` fails

**Recovery**:
1. Validation catches invalid JSON
2. Returns 1 → falls back to union merge

**Prevention**: Always validate after jq merge

---

### Failure Mode 3: TypeScript Validation Fails After Merge

**Description**: Semantic merge produces syntactically invalid TypeScript

**Likelihood**: MEDIUM (20%)
- Example: Duplicate imports, missing semicolons

**Impact**: HIGH (if no fallback)
- Invalid TypeScript staged → build breaks

**Detection**:
- Validation: `npx tsc --noEmit` fails

**Recovery**:
1. Validation catches errors
2. Returns 1 → falls back to union merge

**Prevention**: Always validate after semantic merge

---

### Failure Mode 4: Function Name Collision Not Detected

**Description**: Helper misses same function name (regex bug)

**Likelihood**: LOW (5%)
- Regex tested, but edge cases possible

**Impact**: HIGH
- Merges duplicate functions → tsc error
- But validation catches it

**Detection**:
- Validation: tsc reports duplicate function

**Recovery**:
1. Validation catches duplicate
2. Returns 1 → falls back to union merge

**Prevention**: Test helper with various function name patterns

---

### Failure Mode 5: Semantic Merge Success Rate < 10%

**Description**: Actual success rate much lower than expected

**Likelihood**: MEDIUM (30%)
- Assumption: ≥20% conflicts are structure-mergeable
- Risk: Actual rate may be 5-10%

**Impact**: MEDIUM
- Batch 2 adds complexity for minimal gain
- May not be worth 70 LOC investment

**Detection**:
- Telemetry query: Count `semantic_merge_*` events
- Calculate percentage

**Recovery**:
1. If <10%: Consider reverting Batch 2
2. If 10-20%: Acceptable (keep for future)
3. If >20%: Success (as planned)

**Measurement**:
```bash
jq -s '
  ([ .[] | select(.resolution_strategy | startswith("semantic"))] | length) as $semantic |
  (length) as $total |
  ($semantic / $total * 100)
' state/analytics/git_merge_decisions.jsonl
```

---

### Failure Mode 6: Semantic Merge Slower Than Expected

**Description**: TypeScript semantic merge takes >10 sec per file

**Likelihood**: LOW (10%)
- grep + sed are fast (<1 sec)
- But tsc validation can be slow (5-10 sec)

**Impact**: MEDIUM
- Total merge time >60 sec goal
- Slows down autopilot

**Detection**:
- Time merge operations
- Monitor autopilot run duration

**Recovery**:
1. Make validation optional (FAST_MERGE=1)
2. Accept slowdown for safety

**Acceptance**: Safety > speed (validation is critical)

---

## Complexity Analysis

### Cyclomatic Complexity

**New Functions**:

**`attempt_semantic_merge_typescript`** (30 LOC):
- Branches: 3 (grep fails, merge fails, validation fails)
- Loops: 0
- **Cyclomatic Complexity**: 3 (LOW)

**`merge_typescript_functions`** (15 LOC):
- Branches: 2 (conflict check, merge success)
- Loops: 1 (for name in names)
- **Cyclomatic Complexity**: 3 (LOW)

**`attempt_semantic_merge_json`** (10 LOC):
- Branches: 2 (jq fails, validation fails)
- Loops: 0
- **Cyclomatic Complexity**: 2 (LOW)

**Integration** (git_error_recovery.sh, 15 LOC):
- Branches: 4 (auto, semantic TS, semantic JSON, union)
- Loops: 1 (existing while loop over files)
- **Cyclomatic Complexity**: 5 (LOW)

**Total Batch 2 Complexity**: 3 + 3 + 2 + 5 = **13 paths (LOW)**

**Combined Batch 1 + 2**: 12 (Batch 1) + 13 (Batch 2) = **25 paths (MEDIUM)**

**Thresholds**:
- 1-10: LOW (no risk)
- 11-20: MEDIUM (acceptable)
- 21-30: MEDIUM-HIGH (manageable)
- 31+: HIGH (refactor recommended)

**Verdict**: ✅ MEDIUM complexity (25 paths, within acceptable range)

---

### Cognitive Complexity

**`attempt_semantic_merge_typescript`**:
- Nesting: 1 level (if inside function)
- Logic: Linear (grep → merge → validate)
- Domain: MEDIUM (TypeScript structure knowledge)
- **Cognitive Complexity**: MEDIUM

**`merge_typescript_functions`**:
- Nesting: 2 levels (for loop + if)
- Logic: MEDIUM (name extraction + collision check)
- Domain: MEDIUM (sed regex, function naming)
- **Cognitive Complexity**: MEDIUM

**`attempt_semantic_merge_json`**:
- Nesting: 1 level (if inside function)
- Logic: Linear (jq → validate)
- Domain: LOW (jq usage is straightforward)
- **Cognitive Complexity**: LOW

**Integration** (git_error_recovery.sh):
- Nesting: 2 levels (while + if chains)
- Logic: MEDIUM (file type detection + strategy chain)
- Domain: MEDIUM (merge workflow)
- **Cognitive Complexity**: MEDIUM

**Overall Cognitive Complexity**: **MEDIUM**
- Most functions are MEDIUM (requires some domain knowledge)
- No HIGH complexity functions

**Mitigation**:
- Comments explain TypeScript structure extraction
- Examples show grep patterns
- Validation logic is well-documented

---

### Testing Complexity

**`attempt_semantic_merge_typescript`**:
- I/O: HIGH (reads files, runs tsc)
- Dependencies: grep, sed, tsc (widely available)
- Side effects: Modifies `$file`
- Setup: TypeScript test files with conflicts
- **Testing Complexity**: MEDIUM-HIGH

**`merge_typescript_functions`**:
- I/O: NONE (pure string manipulation)
- Dependencies: sed, grep (built-in)
- Side effects: None (pure function)
- Setup: String inputs (easy to mock)
- **Testing Complexity**: LOW

**`attempt_semantic_merge_json`**:
- I/O: MEDIUM (reads files, runs jq)
- Dependencies: jq (may not be available)
- Side effects: Modifies `$file`
- Setup: JSON test files
- **Testing Complexity**: MEDIUM

**Integration**:
- I/O: HIGH (git operations, file reads, all merge functions)
- Dependencies: git, grep, sed, jq, tsc
- Side effects: HIGH (modifies git state, stages files)
- Setup: Full git repo with TypeScript + JSON conflicts
- **Testing Complexity**: HIGH

**Overall Testing Complexity**: **MEDIUM-HIGH**
- Functions are testable (grep/sed can be mocked)
- Integration requires full git repo setup
- Dependencies manageable (all widely available)

**Mitigation**:
- Unit tests for pure functions (merge_typescript_functions)
- Integration tests for full workflow
- Use Docker for consistent environment

---

## Mitigation Strategies

### Mitigation 1: Always Validate After Semantic Merge

**Problem**: Semantic merge may produce invalid code

**Strategy**:
- Never stage without validation passing
- TypeScript: `npx tsc --noEmit`
- JSON: `jq .`
- If validation fails → fallback to union merge

**Implementation**:
```bash
if attempt_semantic_merge_typescript "$file"; then
  if validate_merge "$file"; then
    git add "$file"  # Safe
  else
    attempt_union_merge "$file"  # Fallback
    git add "$file"
  fi
fi
```

**Benefit**: Prevents broken merges (validation is safety net)

---

### Mitigation 2: Fallback Chain (Always Have Safe Exit)

**Problem**: Semantic merge may fail unexpectedly

**Strategy**:
- Build fallback chain: auto → semantic → union
- Union merge **always succeeds** (conflict markers)
- Never get stuck (always makes progress)

**Implementation**: Already in design (see PLAN phase)

**Benefit**: Robustness (semantic merge failure doesn't block autopilot)

---

### Mitigation 3: Simple MVP (Grep Not AST)

**Problem**: AST parsing is complex and fragile

**Strategy**:
- Use grep for MVP (simple, fast, good enough)
- Accept limitations (multi-line imports, nested functions)
- Validation catches errors
- Future: Upgrade to AST if needed

**Trade-off**:
- Simplicity vs completeness
- MVP: 70 LOC (grep) vs 200+ LOC (AST)

**Benefit**: Faster implementation, easier to maintain

---

### Mitigation 4: Measure Success Rate (Data-Driven)

**Problem**: Uncertain if semantic merge worth the complexity

**Strategy**:
- Measure actual success rate via telemetry
- If <10%: Consider reverting
- If 10-20%: Acceptable
- If >20%: Success

**Measurement**:
```bash
# Count semantic merge successes
semantic_count=$(jq -s '[.[] | select(.resolution_strategy | startswith("semantic"))] | length' \
  state/analytics/git_merge_decisions.jsonl)

# Total conflicts
total_count=$(jq -s 'length' state/analytics/git_merge_decisions.jsonl)

# Success rate
echo "scale=2; $semantic_count / $total_count * 100" | bc
```

**Benefit**: Evidence-based decision (not guesswork)

---

### Mitigation 5: Document Limitations

**Problem**: Users expect semantic merge to handle all cases

**Strategy**:
- Document limitations in code comments
- Log warnings for known edge cases
- Telemetry tracks fallback reasons

**Limitations**:
- Multi-line imports (not captured)
- Classes (not extracted)
- JSON arrays (replaced, not merged)
- Import from same module (duplicate imports)

**Benefit**: Set expectations, avoid surprises

---

## Assumptions Validation

### Assumption 1: Grep Can Extract Most TypeScript Structure

**Assumption**: `grep '^export function '` captures majority of functions

**Validation**:
- Test with realistic TypeScript files (not toy examples)
- Sample from actual codebase (apps/api, apps/web)

**Risk**: LOW-MEDIUM
- Single-line function declarations: captured ✅
- Multi-line signatures: only name captured (acceptable)
- Nested functions: not captured (limitation)

**Contingency**: Validation catches incomplete extractions

---

### Assumption 2: jq's `*` Operator is Sufficient

**Assumption**: Recursive merge is good enough for JSON conflicts

**Validation**:
- Test with nested JSON, array conflicts
- Check jq documentation for `*` operator semantics

**Risk**: MEDIUM
- Objects: merged correctly ✅
- Arrays: replaced (not merged) ⚠️
- Right side wins on key conflicts ⚠️

**Contingency**: Document jq behavior, custom merge if needed

---

### Assumption 3: ≥20% Conflicts Are Structure-Mergeable

**Assumption**: Semantic merge resolves 20-30% of conflicts

**Validation**:
- Analyze git log for conflict patterns
- Measure actual rate during 5 consecutive runs

**Risk**: MEDIUM
- If <10%: Batch 2 not worth complexity
- If 10-20%: Acceptable (marginal improvement)
- If >20%: Success (as planned)

**Contingency**: Revert Batch 2 if <10%

---

### Assumption 4: Validation (tsc, jq) Catches Semantic Errors

**Assumption**: TypeScript compiler catches merge errors

**Validation**:
- Standard practice in TypeScript projects
- tsc catches: syntax, type errors, duplicate functions

**Risk**: LOW
- Syntax errors: caught ✅
- Type errors: caught ✅
- Runtime logic bugs: NOT caught (tests catch these)

**Contingency**: Tests/CI catch runtime errors

---

### Assumption 5: Performance Acceptable (<60 sec for 5 files)

**Assumption**: Semantic merge doesn't slow down autopilot

**Validation**:
- Time merge operations in integration tests
- Measure: grep (~1 sec) + tsc (~5 sec) = ~6 sec per file
- 5 files × 6 sec = 30 sec (under 60 sec goal ✅)

**Risk**: LOW
- Typical case: 30-40 sec (under goal)
- Worst case: 50-60 sec (at limit)

**Contingency**: Make validation optional (FAST_MERGE flag)

---

## Performance Estimates

### Per-File Merge Time

**Auto-merge** (Batch 1):
- git merge-file: ~1 sec
- Validation: ~5 sec (if TypeScript)
- **Total**: ~6 sec

**Semantic TypeScript merge** (Batch 2):
- grep extractions: ~0.5 sec
- sed parsing: ~0.5 sec
- Merge functions: ~0.1 sec
- tsc validation: ~5 sec
- **Total**: ~6 sec (same as auto-merge)

**Semantic JSON merge** (Batch 2):
- jq merge: ~0.1 sec
- jq validation: ~0.1 sec
- **Total**: ~0.2 sec (faster than TypeScript)

### Total Merge Time (5 Files)

**Scenario: 2 TS, 1 JSON, 2 other**

**Best case** (all auto-merge, no validation):
- 5 × 1 sec = 5 sec ✅

**Typical case** (mix of strategies):
- 2 auto (TS): 2 × 6 sec = 12 sec
- 1 semantic (TS): 1 × 6 sec = 6 sec
- 1 semantic (JSON): 1 × 0.2 sec = 0.2 sec
- 1 union (other): 1 × 0.1 sec = 0.1 sec
- **Total**: ~18 sec ✅ (under 60 sec goal)

**Worst case** (all semantic + validation):
- 5 × 6 sec = 30 sec ✅ (under 60 sec goal)

**Verdict**: ✅ Performance acceptable (all scenarios <60 sec)

---

## Next Phase: GATE

**Deliverables**:
- Design documentation (design.md)
- Five Forces Check
- Via Negativa (final check)
- Refactor vs Repair verification
- Alternatives review
- Complexity justification
- DesignReviewer evaluation

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: THINK phase complete, ready for GATE phase

**Complexity Summary**:
- Cyclomatic: 25 paths (MEDIUM - combined Batch 1 + 2)
- Cognitive: MEDIUM (requires TypeScript/JSON knowledge)
- Testing: MEDIUM-HIGH (needs git repo fixtures)

**Risk Summary**: 8 edge cases, 6 failure modes, all mitigated
**Performance**: ~18 sec typical (under 60 sec goal)
**Success Rate Target**: ≥20% (will measure via telemetry)
