# Plan: AFP-S1-GUARDRAILS

## Via Negativa Analysis

**Can I DELETE or SIMPLIFY existing code instead of adding?**

**Examined for deletion:**
- ❌ `tools/wvo_mcp/src/guardrails/catalog.ts` - Core policy infrastructure, cannot delete
- ❌ Builtin check functions - Already minimal implementations

**Why via negativa insufficient:**
This is creating a **missing configuration file**, not adding code complexity. The code infrastructure exists but is dormant without the catalog. This is completing an incomplete feature, not adding a new one.

**Minimal addition:** Only 4 guardrail definitions (~50 LOC YAML) - the smallest viable catalog.

---

## Architecture & Design Approach

### Approach: Minimal Baseline Catalog

**Pattern to reuse:** YAML configuration files (similar to `state/roadmap.yaml`)

**Why this pattern:**
- ✅ Already proven in codebase (roadmap.yaml, tsconfig.json)
- ✅ Human-editable
- ✅ Version-controllable
- ✅ Simple parsing (yaml library)

### Files to Change

**New files:**
1. `meta/afp_scas_guardrails.yaml` (~50 LOC)
   - Guardrail catalog with 4 baseline entries

2. `tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts` (~150 LOC)
   - Schema validation tests
   - Pass/fail behavior tests
   - Integration tests

**Modified files:**
None - catalog loader already exists in `catalog.ts`

**Total:** 2 new files, ~200 LOC

---

## LOC Estimate

**Breakdown:**
- Catalog YAML: ~50 LOC (4 guardrails × ~12 lines each)
- Test file: ~150 LOC (schema validation + behavior tests)
- Documentation: Already done (strategy.md, spec.md)

**Net LOC:** +200 LOC

**Within micro-batching limits?**
- ✅ Files: 2 (< 5 limit)
- ✅ LOC: 200 (>150 but justified - test file gets 3.0x multiplier)

---

## Refactor vs Repair

**Classification:** COMPLETION (neither repair nor refactor)

**Rationale:**
- Not repairing broken code (infrastructure works, just unused)
- Not refactoring existing implementation
- Completing incomplete feature (code without config)

**Technical debt created:** None
**Technical debt removed:** Dormant infrastructure activated

---

## Implementation Plan

### Phase 1: Create Catalog YAML

**File:** `meta/afp_scas_guardrails.yaml`

**Structure:**
```yaml
# AFP/SCAS Guardrail Catalog
# Defines baseline security, quality, and governance checks

guardrails:
  # Security: Git working tree must be clean
  - id: worktree-clean
    suite: baseline
    summary: Ensure git working tree has no uncommitted changes
    enforcement: audit
    severity: warn
    check:
      kind: builtin
      name: worktree_clean

  # Quality: Command allowlist validated
  - id: command-allowlist
    suite: baseline
    summary: Validate command allowlist has sufficient entries and no duplicates
    enforcement: audit
    severity: warn
    check:
      kind: builtin
      name: command_allowlist_snapshot

  # Governance: Work process ledger intact
  - id: ledger-integrity
    suite: baseline
    summary: Verify work process ledger exists and hash chain is intact
    enforcement: audit
    severity: warn
    check:
      kind: builtin
      name: ledger_integrity

  # Governance: Required policy directories exist
  - id: policy-paths
    suite: baseline
    summary: Ensure state/policy and state/analytics directories exist
    enforcement: audit
    severity: info
    check:
      kind: builtin
      name: policy_state_paths
```

**Design decisions:**
- All guardrails in 'baseline' suite (simplest start)
- All 'audit' enforcement (non-blocking, observability first)
- Severities: warn for actionable, info for FYI
- IDs: kebab-case, descriptive

### Phase 2: Write Tests

**File:** `tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts`

**Test structure:**
```typescript
describe('Guardrail Catalog', () => {
  describe('Schema Validation', () => {
    it('loads valid catalog successfully');
    it('rejects catalog with missing guardrails key');
    it('rejects entries with missing id');
    it('rejects entries with duplicate id');
    it('rejects entries without builtin check');
  });

  describe('Guardrail Evaluation', () => {
    it('evaluates baseline suite successfully');
    it('returns correct result schema');
    it('passes on valid configuration');
    it('fails on invalid configuration');
  });

  describe('Individual Checks', () => {
    it('worktree_clean passes on clean worktree');
    it('worktree_clean fails on dirty worktree');
    it('command_allowlist_snapshot passes on valid allowlist');
    it('ledger_integrity passes on intact ledger');
    it('policy_state_paths passes when directories exist');
  });
});
```

### Phase 3: Validation

**Manual checks:**
1. Catalog loads without errors
2. All 4 guardrails present
3. Evaluation runs successfully
4. Tests pass

**Automated checks:**
- Build: `npm run build` (0 errors)
- Tests: `npm test -- catalog` (all passing)
- Lint: No new issues

---

## Risk Analysis

### Edge Cases

1. **Catalog file missing**
   - Handled: `loadGuardrailCatalog` throws descriptive error
   - Mitigation: Error message includes expected path

2. **Malformed YAML**
   - Handled: YAML parser throws
   - Mitigation: Schema validation catches issues

3. **Unknown builtin check**
   - Handled: Evaluation throws "Unknown guardrail check {name}"
   - Mitigation: Tests verify all check names valid

4. **Git command fails**
   - Handled: `worktree_clean` catches execSync errors
   - Mitigation: Returns fail status with error message

5. **Ledger file missing**
   - Handled: `ledger_integrity` returns warn status
   - Mitigation: Graceful degradation (not critical failure)

### Failure Modes

1. **Evaluation throws during check execution**
   - Impact: Other checks don't run
   - Mitigation: Wrap each check in try-catch (already done in catalog.ts:51-57)

2. **All checks fail**
   - Impact: Policy violations undetected
   - Mitigation: Logging to analytics for monitoring

3. **Catalog schema evolves**
   - Impact: Old catalogs incompatible
   - Mitigation: Version field (Phase 2), backward compatibility

### Testing Strategy

**Coverage targets:**
- Catalog loading: 100% (happy path + error paths)
- Schema validation: 100% (all required fields)
- Individual checks: 100% (pass + fail scenarios)
- Integration: End-to-end evaluation flow

**Test approach:**
- Unit tests for schema validation
- Integration tests for evaluation
- Behavior tests for individual checks (using InMemory filesystem where needed)

---

## Assumptions

1. **YAML format sufficient**
   - Assumption: YAML easier than JSON for humans
   - Risk: If wrong, migration to JSON is trivial

2. **Baseline suite adequate**
   - Assumption: 4 checks cover critical security/quality/governance
   - Risk: If wrong, add more checks in Phase 2

3. **Audit enforcement sufficient**
   - Assumption: Observability before enforcement
   - Risk: If wrong, upgrade specific guardrails to 'block'

4. **No immediate CI/CD integration needed**
   - Assumption: Manual evaluation sufficient initially
   - Risk: If wrong, add GitHub Actions workflow (separate task)

---

## Alternatives Considered

### Alternative 1: Comprehensive Catalog (20+ Guardrails)

**Pros:**
- Complete policy coverage from day 1
- All risks addressed immediately

**Cons:**
- High maintenance burden
- Over-engineering (SCAS violation)
- Slower to implement

**Why not selected:** Violates via negativa - start minimal, expand as needed

### Alternative 2: JSON Instead of YAML

**Pros:**
- Native TypeScript parsing
- Stricter syntax

**Cons:**
- Less human-friendly (no comments, requires quotes)
- Harder to hand-edit

**Why not selected:** YAML is more maintainable for configuration files

### Alternative 3: Generate Catalog from Code

**Pros:**
- Always in sync with builtin checks
- No manual maintenance

**Cons:**
- Complex implementation
- Removes human editorial control
- Still need metadata (summary, enforcement level)

**Why not selected:** Manual catalog is simpler and sufficient

### Selected Approach: Minimal YAML Catalog

**Why:**
- ✅ Simplest implementation (50 LOC YAML)
- ✅ Human-editable configuration
- ✅ Version-controllable
- ✅ Proven pattern (roadmap.yaml)
- ✅ Extensible (add more guardrails later)

---

## Commit Strategy

**Batch 1:** Catalog YAML + tests (~200 LOC, 2 files)
- Within micro-batching limits (tests get 3.0x multiplier)
- Single semantic unit (catalog + validation)

**Commit message:**
```
feat(guardrails): Add baseline guardrail catalog

Defines 4 baseline guardrails:
- worktree-clean: Git working tree validation
- command-allowlist: Command allowlist integrity
- ledger-integrity: Work process ledger validation
- policy-paths: Required directories exist

All guardrails: baseline suite, audit enforcement
Tests: Schema validation + behavior verification

Exit criteria met:
✅ Catalog defined and validated
✅ Tests pass on valid config, fail on bad config

Files:
- meta/afp_scas_guardrails.yaml (50 LOC)
- tools/wvo_mcp/src/guardrails/__tests__/catalog.test.ts (150 LOC)
```

---

## Success Criteria Mapping

**From spec.md exit criteria:**

1. ✅ Catalog exists at `meta/afp_scas_guardrails.yaml` → Phase 1
2. ✅ 4 baseline guardrails defined → Phase 1
3. ✅ Evaluation runs successfully → Phase 2 tests
4. ✅ Tests pass on valid config → Phase 2 tests
5. ✅ Tests fail on bad config → Phase 2 tests

---

**Plan Date:** 2025-11-05
**Author:** Claude Council
**Estimated Effort:** 2 hours (simple catalog + tests)
**Risk Level:** Low (no code changes, just configuration)
**Ready for:** THINK phase
