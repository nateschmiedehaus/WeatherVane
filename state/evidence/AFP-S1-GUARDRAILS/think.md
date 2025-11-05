# Think: AFP-S1-GUARDRAILS

## Edge Cases Analysis

### Edge Case 1: Missing Catalog File

**Scenario:** `meta/afp_scas_guardrails.yaml` doesn't exist

**Current behavior:** `readEntries()` throws `ENOENT`

**Impact:** Guardrail evaluation fails completely

**Mitigation:**
- Error message includes expected path: `meta/afp_scas_guardrails.yaml`
- Caller handles error gracefully
- Tests verify descriptive error message

**Test:**
```typescript
it('throws descriptive error when catalog missing', async () => {
  await expect(loadGuardrailCatalog('/nonexistent'))
    .rejects.toThrow(/afp_scas_guardrails.yaml/);
});
```

### Edge Case 2: Empty Guardrails Array

**Scenario:** YAML has `guardrails: []`

**Current behavior:** `readEntries()` throws "must list guardrails"

**Impact:** Prevents accidental empty catalogs

**Mitigation:**
- Schema validation requires at least 1 guardrail
- Clear error message

**Test:**
```typescript
it('rejects empty guardrails array', async () => {
  // Create temp catalog with empty array
  await expect(loadGuardrailCatalog(tempDir))
    .rejects.toThrow(/must list guardrails/);
});
```

### Edge Case 3: Duplicate Guardrail IDs

**Scenario:** Two guardrails with same `id`

**Current behavior:** `readEntries()` throws "Duplicate guardrail id"

**Impact:** Prevents configuration errors

**Mitigation:**
- Validation checks for duplicate IDs
- Error includes duplicate ID

**Test:**
```typescript
it('rejects duplicate guardrail IDs', async () => {
  // Catalog with duplicate IDs
  await expect(loadGuardrailCatalog(tempDir))
    .rejects.toThrow(/Duplicate guardrail id/);
});
```

### Edge Case 4: Unknown Builtin Check

**Scenario:** Guardrail references `check.name: 'unknown_check'`

**Current behavior:** `evaluateGuardrails()` throws "Unknown guardrail check"

**Impact:** Prevents typos in check names

**Mitigation:**
- Runtime validation when executing check
- Error includes check name

**Test:**
```typescript
it('throws on unknown builtin check', async () => {
  // Catalog with invalid check name
  await expect(evaluateGuardrails(tempDir))
    .rejects.toThrow(/Unknown guardrail check unknown_check/);
});
```

### Edge Case 5: Git Command Fails (worktree_clean)

**Scenario:** `git status --porcelain` fails (not a git repo)

**Current behavior:** `worktree_clean` catches error, returns fail with error message

**Impact:** Graceful degradation

**Mitigation:**
- Try-catch around execSync
- Error details in result.details

**Test:**
```typescript
it('handles git command failure gracefully', async () => {
  const results = await evaluateGuardrails('/tmp'); // Not a git repo
  const check = results.find(r => r.id === 'worktree-clean');
  expect(check?.status).toBe('fail');
  expect(check?.details).toContain('not a git repository');
});
```

### Edge Case 6: Ledger File Missing (ledger_integrity)

**Scenario:** `state/logs/work_process.jsonl` doesn't exist

**Current behavior:** `ledger_integrity` returns warn (not fail)

**Impact:** Graceful for new workspaces

**Mitigation:**
- Missing ledger is warning, not critical failure
- Details: "ledger missing"

**Test:**
```typescript
it('returns warn when ledger missing', async () => {
  const results = await evaluateGuardrails(tempDirWithoutLedger);
  const check = results.find(r => r.id === 'ledger-integrity');
  expect(check?.status).toBe('warn');
  expect(check?.details).toBe('ledger missing');
});
```

### Edge Case 7: Corrupted Ledger (ledger_integrity)

**Scenario:** Ledger file exists but hash chain broken

**Current behavior:** `assertLedgerCompleteness()` throws, caught and returned as fail

**Impact:** Detects tampering

**Mitigation:**
- Hash chain validation catches corruption
- Error message from assertion

**Test:**
```typescript
it('fails when ledger hash chain broken', async () => {
  // Create ledger with broken hash chain
  const results = await evaluateGuardrails(tempDirWithCorruptLedger);
  const check = results.find(r => r.id === 'ledger-integrity');
  expect(check?.status).toBe('fail');
  expect(check?.details).toContain('hash');
});
```

### Edge Case 8: Policy Directories Missing (policy_state_paths)

**Scenario:** `state/policy/` or `state/analytics/` don't exist

**Current behavior:** `policy_state_paths` returns warn with missing paths

**Impact:** Non-critical warning

**Mitigation:**
- Checks both directories
- Lists missing paths in details

**Test:**
```typescript
it('warns when policy directories missing', async () => {
  const results = await evaluateGuardrails(tempDirWithoutDirs);
  const check = results.find(r => r.id === 'policy-paths');
  expect(check?.status).toBe('warn');
  expect(check?.details).toContain('state/policy');
});
```

### Edge Case 9: Malformed YAML Syntax

**Scenario:** Invalid YAML (unclosed quote, bad indentation)

**Current behavior:** `yaml.parse()` throws syntax error

**Impact:** Clear error from parser

**Mitigation:**
- YAML library provides line numbers
- Error includes problematic line

**Test:**
```typescript
it('throws on malformed YAML', async () => {
  // Create file with invalid YAML
  await expect(loadGuardrailCatalog(tempDir))
    .rejects.toThrow(/YAML/);
});
```

### Edge Case 10: Suite Filter Returns Empty

**Scenario:** `evaluateGuardrails(root, {suite: 'nonexistent'})`

**Current behavior:** Returns empty array

**Impact:** No guardrails evaluated (potentially unintended)

**Mitigation:**
- Document behavior
- Caller should check result length

**Test:**
```typescript
it('returns empty array for nonexistent suite', async () => {
  const results = await evaluateGuardrails(workspaceRoot, {suite: 'nonexistent'});
  expect(results).toHaveLength(0);
});
```

---

## Failure Modes Analysis

### Failure Mode 1: Check Execution Throws

**What could go wrong:** Builtin check function throws unexpected error

**Probability:** Low (checks are defensive)

**Impact:** High (other checks don't run if not caught)

**Prevention:**
- Already mitigated in `catalog.ts:51-57` - try-catch wraps each check
- Returns fail status with error message

**Detection:**
- Failed guardrails logged to analytics
- Result includes error details

**Recovery:**
- Individual check failure doesn't prevent other checks
- Audit enforcement means no blocking

### Failure Mode 2: All Checks Fail

**What could go wrong:** Every guardrail returns 'fail' status

**Probability:** Low (would require systemic corruption)

**Impact:** High (indicates serious policy violations)

**Prevention:**
- Independent checks (one failure doesn't cascade)
- Defensive implementations (handle errors gracefully)

**Detection:**
- 100% fail rate in results
- Analytics show trend

**Recovery:**
- Manual investigation required
- Audit enforcement means system continues operating

### Failure Mode 3: Catalog Out of Sync with Checks

**What could go wrong:** Catalog references removed builtin check

**Probability:** Medium (during refactoring)

**Impact:** Medium (check fails to execute)

**Prevention:**
- Tests validate all check names exist in BUILTIN_CHECKS
- Code review catches removals

**Detection:**
- Evaluation throws "Unknown guardrail check"
- Test suite fails

**Recovery:**
- Update catalog to remove/replace check
- Or re-add builtin check

### Failure Mode 4: Check Returns Invalid Status

**What could go wrong:** Check returns 'invalid' or null instead of 'pass'|'warn'|'fail'

**Probability:** Very Low (TypeScript type checking)

**Impact:** Medium (result schema invalid)

**Prevention:**
- Type system enforces GuardrailStatus union type
- Return type checking in TypeScript

**Detection:**
- Type error at compile time
- Test validates result schema

**Recovery:**
- Fix check implementation
- Update tests

### Failure Mode 5: Filesystem Race Condition

**What could go wrong:** Catalog file deleted/modified during evaluation

**Probability:** Very Low

**Impact:** Low (eval throws, retryable)

**Prevention:**
- Catalog read atomically
- Immutable after loading

**Detection:**
- File read error

**Recovery:**
- Retry evaluation
- Check filesystem permissions

---

## Assumptions Documentation

### Assumption 1: YAML Library is Reliable

**Assumption:** `yaml.parse()` correctly parses valid YAML

**Impact if wrong:** Malformed catalogs accepted, invalid ones rejected

**Validation:** yaml library is widely used, well-tested

**Risk:** Low

**Contingency:** If issues arise, migrate to different YAML library (same API)

### Assumption 2: Git is Always Available

**Assumption:** `git status` command exists and works

**Impact if wrong:** `worktree_clean` check always fails

**Validation:** Git is required dependency for WeatherVane

**Risk:** Low (documented requirement)

**Contingency:** Skip worktree check if git unavailable (return warn)

### Assumption 3: Catalog Path is Fixed

**Assumption:** Catalog always at `meta/afp_scas_guardrails.yaml`

**Impact if wrong:** Can't load catalog from custom locations

**Validation:** Hard-coded in CATALOG_PATH constant

**Risk:** Low (can parameterize if needed)

**Contingency:** Add optional path parameter to `loadGuardrailCatalog()`

### Assumption 4: Baseline Suite is Sufficient

**Assumption:** 4 guardrails cover critical security/quality/governance

**Impact if wrong:** Important policies not enforced

**Validation:** Covers fundamental areas (git hygiene, ledger integrity, system structure)

**Risk:** Medium (may need expansion)

**Contingency:** Add more guardrails in Phase 2, or create 'strict' suite

### Assumption 5: Audit Enforcement Adequate

**Assumption:** Observability (audit) sufficient, blocking not needed initially

**Impact if wrong:** Policy violations don't prevent actions

**Validation:** AFP philosophy: measure before enforce

**Risk:** Low (can upgrade to 'block' per guardrail)

**Contingency:** Change specific guardrails to `enforcement: block` in catalog

### Assumption 6: No Concurrent Evaluations

**Assumption:** Guardrail evaluations don't run concurrently for same workspace

**Impact if wrong:** Filesystem race conditions, inconsistent results

**Validation:** Current usage is manual/CLI (sequential)

**Risk:** Low (no parallel execution planned)

**Contingency:** Add locking if concurrent evaluation needed

### Assumption 7: Check Execution is Fast (<200ms each)

**Assumption:** Each builtin check completes quickly

**Impact if wrong:** Evaluation takes too long, blocks workflows

**Validation:** Checks are simple (git status, file access, array validation)

**Risk:** Low (measured execution times acceptable)

**Contingency:** Parallelize check execution if needed

### Assumption 8: Catalog is Version Controlled

**Assumption:** `meta/afp_scas_guardrails.yaml` committed to git

**Impact if wrong:** Catalog changes not tracked, no audit trail

**Validation:** In `meta/` directory (tracked by git)

**Risk:** Very Low

**Contingency:** Add `.gitignore` entry if needed (unlikely)

### Assumption 9: One Catalog Per Workspace

**Assumption:** Each workspace has single canonical catalog

**Impact if wrong:** Ambiguity about which policies apply

**Validation:** Hard-coded path enforces single catalog

**Risk:** Very Low

**Contingency:** Support catalog inheritance (workspace → global) in Phase 2

### Assumption 10: JSON/YAML Deserialization is Safe

**Assumption:** Parsing untrusted YAML doesn't execute code

**Impact if wrong:** Code injection vulnerability

**Validation:** Modern YAML libraries disable unsafe features by default

**Risk:** Very Low (catalog is version-controlled, not user input)

**Contingency:** Use safe YAML loader (already default)

---

## Complexity Analysis

### Essential Complexity

**What complexity is inherent to the problem?**

1. **Schema validation** - Must validate catalog structure
   - Required: Yes (prevents invalid configurations)
   - Alternatives: None simpler

2. **Polymorphic checks** - Different checks have different logic
   - Required: Yes (security vs quality vs governance)
   - Alternatives: Consolidate? No, they're fundamentally different

3. **Error handling** - Checks can fail in various ways
   - Required: Yes (filesystem, git, ledger all have failure modes)
   - Alternatives: Crash on error? Unacceptable

4. **YAML parsing** - Configuration must be deserialized
   - Required: Yes (some config format needed)
   - Alternatives: JSON (slightly simpler but less human-friendly)

### Accidental Complexity

**What complexity is incidental and could be eliminated?**

1. **Multiple severity levels** - info/warn/critical
   - Necessary? Not initially (could default all to 'warn')
   - Keep: Yes (provides useful categorization)
   - Complexity cost: Low (enum handling)

2. **Evidence path field** - Optional path to evidence
   - Necessary? Not initially (could omit)
   - Keep: Yes (enables linking to documentation)
   - Complexity cost: Very Low (optional string)

3. **Suite filtering** - Evaluate specific suite
   - Necessary? Not for baseline only
   - Keep: Yes (enables future 'strict' suite)
   - Complexity cost: Low (simple filter)

**Verdict:** No significant accidental complexity to remove

### Mitigation Strategies

**How do we manage necessary complexity?**

1. **Schema validation** - Centralized in `readEntries()`
   - Clear error messages with entry index
   - Fail fast on invalid structure

2. **Check execution** - Uniform interface (`CheckFn`)
   - Each check returns `GuardrailStatus | [GuardrailStatus, string?]`
   - Wrapper handles both forms

3. **Error handling** - Consistent pattern
   - Try-catch at check level
   - Return fail status with error message
   - Don't propagate exceptions to caller

4. **Testing** - Comprehensive coverage
   - Schema validation tests (happy + error paths)
   - Individual check tests (pass + fail)
   - Integration tests (end-to-end)

---

## Testing Strategy

### Test Pyramid

**Unit Tests (60%):**
- Schema validation (5 tests)
- Individual checks (8 tests: 2 per check average)
- Error handling (4 tests)

**Integration Tests (30%):**
- End-to-end evaluation (3 tests)
- Suite filtering (2 tests)
- Result schema validation (2 tests)

**Behavior Tests (10%):**
- Real filesystem scenarios (2 tests)
- Git repository states (2 tests)

### Specific Test Cases

#### Schema Validation Tests

1. **Valid catalog loads**
   - Given: Well-formed YAML with 4 guardrails
   - When: Call `loadGuardrailCatalog()`
   - Then: Returns 4 CatalogEntry objects

2. **Missing guardrails key**
   - Given: YAML without `guardrails:` key
   - When: Call `loadGuardrailCatalog()`
   - Then: Throws "must list guardrails"

3. **Empty guardrails array**
   - Given: `guardrails: []`
   - When: Call `loadGuardrailCatalog()`
   - Then: Throws "must list guardrails"

4. **Missing entry ID**
   - Given: Guardrail without `id:` field
   - When: Call `loadGuardrailCatalog()`
   - Then: Throws "entry X missing id"

5. **Duplicate IDs**
   - Given: Two guardrails with `id: 'same-id'`
   - When: Call `loadGuardrailCatalog()`
   - Then: Throws "Duplicate guardrail id"

#### Individual Check Tests

6. **worktree_clean: pass**
   - Given: Clean git repository
   - When: Run check
   - Then: status='pass'

7. **worktree_clean: fail**
   - Given: Uncommitted file
   - When: Run check
   - Then: status='fail', details includes filename

8. **command_allowlist_snapshot: pass**
   - Given: Valid allowlist (10+ entries, no duplicates)
   - When: Run check
   - Then: status='pass'

9. **command_allowlist_snapshot: fail**
   - Given: Empty allowlist
   - When: Run check
   - Then: status='fail', details='allowlist suspiciously small'

10. **ledger_integrity: pass**
    - Given: Valid ledger with intact hash chain
    - When: Run check
    - Then: status='pass'

11. **ledger_integrity: warn**
    - Given: No ledger file
    - When: Run check
    - Then: status='warn', details='ledger missing'

12. **ledger_integrity: fail**
    - Given: Ledger with broken hash chain
    - When: Run check
    - Then: status='fail', details includes error

13. **policy_state_paths: pass**
    - Given: Both directories exist
    - When: Run check
    - Then: status='pass'

14. **policy_state_paths: warn**
    - Given: Missing directory
    - When: Run check
    - Then: status='warn', details lists missing paths

#### Integration Tests

15. **Baseline suite evaluation**
    - Given: Complete catalog
    - When: `evaluateGuardrails(root, {suite: 'baseline'})`
    - Then: Returns 4 results

16. **All checks execute**
    - Given: Valid workspace
    - When: Evaluate baseline
    - Then: Each guardrail has result

17. **Result schema valid**
    - Given: Evaluation completed
    - When: Inspect results
    - Then: All have id/suite/summary/status/etc

---

## Paranoid Thinking

### What's the worst that could happen?

**Scenario 1: Catalog Deleted Mid-Flight**

**Trigger:** Catalog file deleted while evaluation running

**Consequence:** File read fails, evaluation throws

**Impact:** Medium (evaluation fails, but retryable)

**Likelihood:** Very Low (file system operations are atomic at OS level)

**Mitigation:** Already handled (file read errors caught, propagated as failures)

**Worst case:** Transient evaluation failure, user retries

---

**Scenario 2: All Builtin Checks Removed**

**Trigger:** Code refactoring removes all BUILTIN_CHECKS entries

**Consequence:** All guardrails fail "Unknown check"

**Impact:** High (policy enforcement broken)

**Likelihood:** Very Low (would break tests immediately)

**Mitigation:** Tests validate check names exist

**Worst case:** Caught in CI, PR rejected

---

**Scenario 3: Malicious Catalog Injection**

**Trigger:** Attacker modifies catalog to disable critical guardrails

**Consequence:** Policy violations not detected

**Impact:** Critical (security/governance failures)

**Likelihood:** Very Low (requires commit access or file system access)

**Mitigation:**
- Catalog in version control (git audit trail)
- Code review required for catalog changes
- Enforcement levels in catalog (can't disable via code)

**Worst case:** Detected in code review or post-commit audit

---

**Scenario 4: Ledger Tampering**

**Trigger:** Attacker modifies ledger to hide policy violations

**Consequence:** ledger_integrity check fails (hash chain breaks)

**Impact:** Medium (tampering detected, but original data lost)

**Likelihood:** Low (requires file system access)

**Mitigation:** Hash chain detects tampering, check fails

**Worst case:** Tampering detected, ledger rebuild needed from commits

---

**Scenario 5: Git Repository Corruption**

**Trigger:** `.git/` directory corrupted

**Consequence:** worktree_clean fails with error

**Impact:** Low (single check fails, others run)

**Likelihood:** Very Low (git is robust)

**Mitigation:** Error caught, returned as fail status

**Worst case:** Check fails, user investigates git repository health

---

## Mitigation Summary

**For each edge case/failure mode:**
1. ✅ Error handling in place
2. ✅ Tests verify behavior
3. ✅ Documentation captures assumptions
4. ✅ Graceful degradation (no crashes)
5. ✅ Clear error messages for debugging

**Confidence:** High that implementation will be robust and maintainable

---

**Think Date:** 2025-11-05
**Author:** Claude Council
**Ready for:** GATE phase (design.md)
