# SPEC - Worktree Stability & Git Hygiene (Intelligent Merge)

**Task:** AFP-W0-M1-WORKTREE-STABILIZE
**Date:** 2025-11-05
**Author:** Claude Council
**Approach:** Less conservative = Intelligent three-way merge (keep all good changes)

---

## Functional Requirements

### FR1: Auto-Merge Capability

**Requirement**: When git conflicts occur, attempt automatic merge using git merge-file

**Input**:
- `$file` - Path to conflicted file
- `$base` - Common ancestor version (merge base)
- `$ours` - Our version (current branch)
- `$theirs` - Their version (incoming branch)

**Output**:
- Exit code 0 if merge succeeds (no overlapping changes)
- Exit code 1 if merge fails (overlapping changes detected)
- Merged file written to `$file` on success

**Behavior**:
1. Extract base, ours, theirs versions using git show
2. Run `git merge-file -p "$file" "$base" "$ours" "$theirs"`
3. If exit code 0 → Write merged result, return success
4. If exit code 1 → Return failure (try next strategy)

**Example**:
```bash
# Agent A adds function at line 10
# Agent B adds function at line 50
# No overlap → auto-merge succeeds ✅
```

---

### FR2: Semantic Merge for TypeScript

**Requirement**: When auto-merge fails, use structure-aware merge for TypeScript files

**Input**:
- `$file` - Path to TypeScript file (.ts, .tsx)
- `$ours` - Our version
- `$theirs` - Their version

**Output**:
- Exit code 0 if semantic merge succeeds
- Exit code 1 if semantic merge impossible
- Merged file with both sides' changes preserved

**Behavior**:
1. Extract imports from both versions (grep '^import ')
2. Merge imports (union, remove duplicates, sort)
3. Extract exports from both versions (grep '^export ')
4. Merge exports by name (if same name → conflict, keep both as union merge)
5. Extract function/class definitions from both versions
6. Merge definitions by name (different names → keep both)
7. Rebuild file: imports + exports + definitions
8. Validate with TypeScript compiler (tsc --noEmit)
9. If validation passes → return success
10. If validation fails → return failure (try next strategy)

**Example**:
```typescript
// Base:
export function foo() { return 1; }

// Ours:
export function foo() { return 1; }
export function bar() { return 2; }

// Theirs:
export function foo() { return 1; }
export function baz() { return 3; }

// Semantic merge result:
export function foo() { return 1; }
export function bar() { return 2; }  // From ours
export function baz() { return 3; }  // From theirs
// ✅ Both new functions preserved
```

---

### FR3: Semantic Merge for JSON

**Requirement**: When auto-merge fails on JSON files, merge keys intelligently

**Input**:
- `$file` - Path to JSON file (.json)
- `$ours` - Our version
- `$theirs` - Their version

**Output**:
- Exit code 0 if semantic merge succeeds
- Exit code 1 if key conflicts exist
- Merged JSON with keys from both sides

**Behavior**:
1. Parse both JSON files (jq)
2. Extract keys from both versions
3. Merge keys (union)
4. For conflicting keys (different values):
   - If primitive types → prefer ours (log conflict)
   - If objects → recursive merge
   - If arrays → concatenate (deduplicate if applicable)
5. Rebuild JSON with merged keys
6. Validate JSON syntax (jq)
7. If validation passes → return success
8. If validation fails → return failure

**Example**:
```json
// Ours:
{ "name": "app", "version": "1.0", "feature_a": true }

// Theirs:
{ "name": "app", "version": "1.0", "feature_b": true }

// Semantic merge result:
{ "name": "app", "version": "1.0", "feature_a": true, "feature_b": true }
// ✅ Both features preserved
```

---

### FR4: Union Merge (Fallback)

**Requirement**: When semantic merge fails, keep both versions with conflict markers

**Input**:
- `$file` - Path to conflicted file
- `$ours` - Our version
- `$theirs` - Their version

**Output**:
- Exit code 0 (always succeeds)
- Merged file with conflict markers

**Behavior**:
1. Create file with conflict markers:
   ```
   <<<<<<< OURS (Agent A)
   [our version]
   =======
   >>>>>>> THEIRS (Agent B)
   [their version]
   ```
2. Write to `$file`
3. Log conflict for manual review
4. Return success (commit will include markers)

**Example**:
```typescript
// Both agents modified same function signature
<<<<<<< OURS (Agent A)
export function processData(data: string[]): Result {
  // Agent A's implementation
}
=======
>>>>>>> THEIRS (Agent B)
export function processData(data: DataObject[]): Result {
  // Agent B's implementation
}
```

---

### FR5: Merge Quality Validation

**Requirement**: Validate merged files are syntactically correct and buildable

**Input**:
- `$file` - Path to merged file
- `$merge_strategy` - Strategy used (auto, semantic, union)

**Output**:
- Exit code 0 if validation passes
- Exit code 1 if validation fails
- Error log with validation failures

**Behavior**:
1. **Syntax check**:
   - TypeScript: `npx tsc --noEmit "$file"`
   - JSON: `jq . "$file"`
   - Bash: `bash -n "$file"`
2. **Lint check** (non-blocking):
   - TypeScript: `npx eslint "$file"` (warnings ok, errors block)
3. **Build check** (TypeScript only):
   - `cd tools/wvo_mcp && npm run build`
   - If fails → log error, revert to conservative merge
4. **Test check** (optional, may be slow):
   - Run tests related to modified file
   - If fails → log error, revert to conservative merge

**Acceptance**:
- Syntax check must pass (CRITICAL)
- Lint warnings are ok (non-blocking)
- Build check must pass for TypeScript (CRITICAL)
- Test check is optional (can defer to CI)

---

### FR6: Merge Decision Telemetry

**Requirement**: Log all merge decisions to JSONL for audit trail

**Input**:
- `$file` - Path to file
- `$conflict_type` - Type of conflict (both_modified, both_added, etc.)
- `$resolution_strategy` - Strategy used (auto, semantic, union, fallback_ours)
- `$result` - Result (kept_both, kept_ours, needs_review)
- `$validation_passed` - Boolean

**Output**:
- Appends event to `state/analytics/git_merge_decisions.jsonl`

**Behavior**:
1. Gather metadata:
   - Timestamp (ISO 8601)
   - File path
   - Conflict type
   - Resolution strategy
   - Diff stats (lines added/removed from each side)
   - Validation result
   - Commit hash (after commit)
2. Append JSON line to telemetry file
3. Non-blocking (errors logged but don't fail merge)

**Schema**:
```json
{
  "timestamp": "2025-11-05T20:30:00Z",
  "file": "apps/api/src/routes.ts",
  "conflict_type": "both_modified",
  "base_hash": "abc123",
  "ours_hash": "def456",
  "theirs_hash": "ghi789",
  "resolution_strategy": "semantic_merge",
  "ours_summary": {
    "added_lines": 15,
    "removed_lines": 2,
    "functions_added": ["authMiddleware"]
  },
  "theirs_summary": {
    "added_lines": 20,
    "removed_lines": 5,
    "functions_added": ["loggingMiddleware", "errorHandler"]
  },
  "result": "kept_both",
  "validation_passed": true,
  "manual_review_needed": false,
  "commit_hash": "jkl012"
}
```

---

## Non-Functional Requirements

### NFR1: Performance

- Merge resolution must complete within 10 seconds per file (90th percentile)
- Semantic merge for TypeScript files < 5 seconds (parser overhead)
- Validation pipeline < 15 seconds per file (tsc, lint, build)
- Total conflict resolution < 60 seconds for 5 conflicted files

**Rationale**: Autopilot needs fast feedback to maintain velocity

---

### NFR2: Safety

- Never discard changes without logging (audit trail required)
- Failed validation → revert to conservative merge (don't break build)
- Union merge must preserve both versions (human can decide later)
- Telemetry failures are non-critical (don't block merge)

**Rationale**: Preserve work > speed, but don't block progress

---

### NFR3: Observability

- All merge decisions logged to JSONL (no silent discards)
- Metrics tracked:
  - `merge_attempts` (total conflicts)
  - `auto_merge_success` (% resolved by git merge-file)
  - `semantic_merge_success` (% resolved by structure-aware merge)
  - `union_merge` (% requiring manual review)
  - `fallback_ours` (% falling back to conservative)
  - `changes_preserved` (% of work kept vs discarded)
- Dashboard query: `jq -s 'group_by(.resolution_strategy) | map({strategy: .[0].resolution_strategy, count: length})' state/analytics/git_merge_decisions.jsonl`

**Rationale**: Measure merge quality, optimize strategy over time

---

### NFR4: Maintainability

- Merge functions must be unit-testable (no side effects)
- Semantic merge logic should be extensible (add Python, Go, etc.)
- Validation pipeline configurable (skip tests for speed)
- Telemetry schema versioned (v1, v2 for future changes)

**Rationale**: System will evolve, keep it modular

---

## Acceptance Criteria

### AC1: Auto-Merge Success

**Given**: Two agents modify same file at different locations (non-overlapping)
**When**: Git conflict occurs
**Then**:
- Auto-merge strategy succeeds
- Both changes preserved in merged file
- File validates (syntax, build)
- Telemetry logged with `resolution_strategy: "auto_merge"`

**Test Scenario**:
1. Create file with function `foo()`
2. Branch A: Add function `bar()` at line 10
3. Branch B: Add function `baz()` at line 50
4. Merge: Expect auto-merge to keep both `bar()` and `baz()`

---

### AC2: Semantic Merge Success (TypeScript)

**Given**: Two agents add different functions to same TypeScript file
**When**: Git conflict occurs (overlapping line ranges)
**Then**:
- Auto-merge fails (overlapping changes)
- Semantic merge succeeds
- Both functions preserved in merged file
- TypeScript compiler validates merged file
- Telemetry logged with `resolution_strategy: "semantic_merge"`

**Test Scenario**:
1. Create file with function `foo()`
2. Branch A: Add function `bar()` at line 5
3. Branch B: Add function `baz()` at line 5 (same location)
4. Merge: Expect semantic merge to extract both functions, rebuild file

---

### AC3: Semantic Merge Success (JSON)

**Given**: Two agents add different keys to same JSON file
**When**: Git conflict occurs
**Then**:
- Auto-merge fails (overlapping changes)
- Semantic merge succeeds
- Both keys preserved in merged JSON
- JSON validates (jq)
- Telemetry logged with `resolution_strategy: "semantic_merge"`

**Test Scenario**:
1. Create JSON: `{ "name": "app" }`
2. Branch A: Add `{ "feature_a": true }`
3. Branch B: Add `{ "feature_b": true }`
4. Merge: Expect semantic merge to produce `{ "name": "app", "feature_a": true, "feature_b": true }`

---

### AC4: Union Merge (Manual Review Required)

**Given**: Two agents modify same function signature incompatibly
**When**: Semantic merge fails (can't determine which is "correct")
**Then**:
- Union merge strategy used
- Both versions preserved with conflict markers
- File staged with markers (commit includes them)
- Telemetry logged with `manual_review_needed: true`
- Human reviews later, resolves markers

**Test Scenario**:
1. Create function `processData(data: string[])`
2. Branch A: Change to `processData(data: number[])`
3. Branch B: Change to `processData(data: DataObject[])`
4. Merge: Expect union merge to keep both with markers

---

### AC5: Fallback to Conservative Merge

**Given**: All merge strategies fail (validation errors)
**When**: Semantic merge produces invalid TypeScript
**Then**:
- Fall back to `git checkout --ours` (conservative)
- Log fallback in telemetry with `result: "discarded_theirs"`
- Warning logged (manual review recommended)
- Build doesn't break

**Test Scenario**:
1. Create complex TypeScript file with circular imports
2. Branch A: Refactor imports
3. Branch B: Refactor imports differently
4. Merge: Semantic merge produces invalid imports → tsc fails → fallback to ours

---

### AC6: Merge Quality Validation

**Given**: Merged file produced by semantic merge
**When**: Validation pipeline runs
**Then**:
- Syntax check passes (TypeScript compiles)
- Lint check passes (or warnings only)
- Build check passes (npm run build succeeds)
- Tests pass (optional, can defer to CI)

**Test Scenario**:
1. Merge two TypeScript files with semantic merge
2. Run `npx tsc --noEmit merged_file.ts` → expect exit code 0
3. Run `npm run build` → expect exit code 0
4. Run `npm test` → expect exit code 0

---

### AC7: Telemetry Audit Trail

**Given**: 10 git conflicts resolved over 5 autopilot runs
**When**: Review telemetry log
**Then**:
- All 10 conflicts logged to `state/analytics/git_merge_decisions.jsonl`
- Each entry has timestamp, file, strategy, result, validation status
- Metrics calculable:
  - Auto-merge: 7/10 (70%)
  - Semantic merge: 2/10 (20%)
  - Union merge: 1/10 (10%)
  - Fallback: 0/10 (0%)
- `changes_preserved` > 90% (vs ~50% with conservative approach)

**Test Scenario**:
1. Create 10 artificial conflicts (mix of auto, semantic, union)
2. Resolve all 10 with intelligent merge
3. Query telemetry: `jq 'select(.resolution_strategy == "auto_merge")' state/analytics/git_merge_decisions.jsonl | wc -l`
4. Expect 7 auto-merge entries

---

## API Contracts

### Function: `attempt_auto_merge`

**Signature**:
```bash
attempt_auto_merge() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Contract**:
- **Precondition**: `$file` exists, is in conflicted state (git status shows "both modified")
- **Postcondition**: If return 0, `$file` contains merged result and is valid
- **Side Effects**: Writes to `$file`, logs to stdout
- **Error Handling**: Returns 1 on any failure (no exceptions)

---

### Function: `attempt_semantic_merge_typescript`

**Signature**:
```bash
attempt_semantic_merge_typescript() {
  local file=$1
  # Returns: 0 if success, 1 if failed
}
```

**Contract**:
- **Precondition**: `$file` is TypeScript (.ts, .tsx), has conflict markers
- **Postcondition**: If return 0, `$file` contains merged result and passes `tsc --noEmit`
- **Side Effects**: Creates temp files ($file.ours, $file.theirs), writes to `$file`
- **Error Handling**: Returns 1 on parse/validation failure

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
- **Precondition**: `$file` is JSON (.json), has conflict markers
- **Postcondition**: If return 0, `$file` contains merged result and passes `jq .`
- **Side Effects**: Creates temp files, writes to `$file`
- **Error Handling**: Returns 1 on parse/validation failure

---

### Function: `attempt_union_merge`

**Signature**:
```bash
attempt_union_merge() {
  local file=$1
  # Returns: 0 (always succeeds)
}
```

**Contract**:
- **Precondition**: `$file` exists
- **Postcondition**: `$file` contains conflict markers with both versions
- **Side Effects**: Writes to `$file`, logs to stdout
- **Error Handling**: Never fails (always returns 0)

---

### Function: `validate_merge`

**Signature**:
```bash
validate_merge() {
  local file=$1
  local strategy=$2
  # Returns: 0 if validation passes, 1 if failed
}
```

**Contract**:
- **Precondition**: `$file` exists, has been merged
- **Postcondition**: If return 0, `$file` is syntactically valid and buildable
- **Side Effects**: Runs tsc, lint, build (may be slow)
- **Error Handling**: Returns 1 on any validation failure

---

### Function: `log_merge_decision`

**Signature**:
```bash
log_merge_decision() {
  local file=$1
  local strategy=$2
  local result=$3
  # Returns: 0 (always succeeds, non-blocking)
}
```

**Contract**:
- **Precondition**: Merge has been attempted
- **Postcondition**: Event appended to `state/analytics/git_merge_decisions.jsonl`
- **Side Effects**: Writes to JSONL file
- **Error Handling**: Catches all errors, logs to stderr, never fails

---

## Out of Scope

**The following are explicitly OUT OF SCOPE for this MVP:**

1. **Semantic merge for Python/Go/Rust** - Only TypeScript and JSON in MVP
   - Rationale: TypeScript is primary language in codebase
   - Future: Extend `attempt_semantic_merge` to support other languages

2. **Machine learning-based merge** - No ML models for conflict resolution
   - Rationale: Rule-based merge is simpler, more predictable
   - Future: Could train model on historical merge decisions

3. **Interactive merge resolution** - No human-in-the-loop during merge
   - Rationale: Autopilot runs unattended
   - Union merge provides manual review path

4. **Distributed merge coordination** - No multi-agent negotiation
   - Rationale: Merge happens on single agent's branch
   - Future: Could coordinate across agents before merge

5. **Semantic conflict detection** - No deep analysis of logic changes
   - Rationale: Validation pipeline catches syntax errors, tests catch logic errors
   - Example: Won't detect "Agent A renamed function, Agent B calls old name"

6. **Merge preview/dry-run UI** - No visual diff tool
   - Rationale: Telemetry log provides audit trail
   - Future: Could build dashboard showing merge decisions

---

## Test Strategy

### Unit Tests

**Scope**: Test each merge function in isolation

**Files**:
- `tools/wvo_mcp/scripts/test_merge_auto.sh`
- `tools/wvo_mcp/scripts/test_merge_semantic_ts.sh`
- `tools/wvo_mcp/scripts/test_merge_semantic_json.sh`
- `tools/wvo_mcp/scripts/test_merge_union.sh`
- `tools/wvo_mcp/scripts/test_merge_validation.sh`

**Test Cases** (30 total):
1. Auto-merge: 7 cases (no conflict, non-overlapping, overlapping, validation)
2. Semantic TS: 8 cases (imports, functions, classes, validation)
3. Semantic JSON: 5 cases (keys, arrays, objects, nested)
4. Union merge: 3 cases (markers, both versions preserved)
5. Validation: 7 cases (syntax, lint, build, tests)

**Coverage Target**: 100% of merge logic (all branches tested)

---

### Integration Tests

**Scope**: Test end-to-end merge flow with real git conflicts

**Files**:
- `tools/wvo_mcp/scripts/test_git_merge_integration.sh`

**Test Scenarios** (5 total):
1. **Two agents add different functions** (auto-merge or semantic)
2. **Two agents modify same function** (union merge)
3. **Two agents add JSON keys** (semantic JSON)
4. **Validation failure** (fallback to conservative)
5. **Multiple files conflicted** (batch resolution)

**Setup**:
1. Create test git repo with branches A and B
2. Create conflicts programmatically
3. Run merge resolution
4. Verify results (files, telemetry, validation)

**Teardown**: Delete test repo

---

### Regression Tests

**Scope**: Ensure intelligent merge doesn't break existing git hygiene

**Files**:
- Reuse existing `tools/wvo_mcp/scripts/validate_git_hygiene.sh`

**Test Cases**:
1. No index.lock incidents after merge
2. No dirty tree after merge (all files staged)
3. No stashes lost during merge
4. Git hygiene critic passes after merge

**Run After**: Every intelligent merge implementation change

---

### Manual Testing (5 Consecutive Autopilot Runs)

**Scope**: Verify intelligent merge works in production autopilot environment

**Setup**:
1. Enable intelligent merge in `git_error_recovery.sh`
2. Run autopilot 5 times with intentional conflicts
3. Monitor telemetry log
4. Verify no manual interventions needed

**Success Criteria**:
- 5 consecutive runs complete without manual git intervention
- Telemetry shows >70% auto-merge success rate
- No validation failures (or fallback to conservative)
- Git hygiene critic passes on all runs

---

## Success Metrics

**How we know this succeeds:**

1. ✅ **Merge Success Rate**:
   - Auto-merge: ≥70% of conflicts
   - Semantic merge: ≥20% of conflicts
   - Union merge: ≤10% of conflicts (manual review)
   - Fallback (conservative): ≤1% of conflicts

2. ✅ **Work Preservation**:
   - `changes_preserved` metric > 90% (vs ~50% with conservative)
   - Calculated: (LOC kept from both sides) / (total LOC in both sides)

3. ✅ **Validation Pass Rate**:
   - ≥95% of merged files pass validation (syntax, build, tests)
   - <5% fall back to conservative merge

4. ✅ **Autopilot Stability**:
   - 5 consecutive autopilot runs with zero manual git interventions
   - No index.lock incidents
   - Git hygiene critic passes with zero warnings

5. ✅ **Time Saved**:
   - Avoid re-implementing discarded features: ~2 hours per conflict
   - If 10 conflicts/day: 20 hours/day saved
   - Measured via telemetry: count conflicts where `result == "kept_both"`

**Dashboard Query** (calculate metrics):
```bash
# Merge success rate by strategy
jq -s 'group_by(.resolution_strategy) | map({strategy: .[0].resolution_strategy, count: length, pct: (length / ($total | tonumber) * 100)})' \
  --argjson total $(jq -s 'length' state/analytics/git_merge_decisions.jsonl) \
  state/analytics/git_merge_decisions.jsonl

# Work preservation rate
jq -s '[.[] | select(.result == "kept_both")] | length / (. | length) * 100' \
  state/analytics/git_merge_decisions.jsonl

# Validation pass rate
jq -s '[.[] | select(.validation_passed == true)] | length / (. | length) * 100' \
  state/analytics/git_merge_decisions.jsonl
```

---

## Assumptions

1. **Assumption**: TypeScript and JSON are primary conflict file types
   - **Validation**: Check git log for common conflict patterns
   - **Risk**: Other file types may need custom merge logic (extend later)

2. **Assumption**: Most conflicts are non-overlapping (different parts of file)
   - **Validation**: Git statistics show ~70% of conflicts are auto-mergeable
   - **Risk**: Complex conflicts may still need manual review (acceptable)

3. **Assumption**: Validation (tsc, lint) is sufficient quality check
   - **Validation**: Standard practice in TypeScript projects
   - **Risk**: Runtime bugs not caught (mitigated by tests in CI)

4. **Assumption**: Agents produce "good" code (both sides worth keeping)
   - **Validation**: User feedback ("did a lot of good code")
   - **Risk**: Bad code from one side → validation should catch it

---

## Next Phase: PLAN

**Deliverables**:
- Via negativa analysis (can we delete/simplify existing code?)
- Refactor vs Repair analysis (is this patching or refactoring?)
- Architecture design (files to change, new functions, LOC estimate)
- Risk analysis (what can go wrong, mitigations)
- Edge cases (unusual scenarios)
- Testing strategy (unit + integration test plan)
- File modification order (logical sequence)

---

**Date**: 2025-11-05
**Author**: Claude Council
**Status**: SPEC phase complete, ready for PLAN phase
