# Spec: AFP-S1-GUARDRAILS

## Acceptance Criteria

### AC1: Guardrail Catalog Exists and Validates

**Given:** Policy controller implementation at `tools/wvo_mcp/src/guardrails/catalog.ts`
**When:** I call `loadGuardrailCatalog(workspaceRoot)`
**Then:**
- File exists at `meta/afp_scas_guardrails.yaml`
- YAML parses successfully
- Returns array of CatalogEntry objects
- Each entry has required fields (id, suite, summary, enforcement, severity, check)

**Validation:**
```typescript
const entries = await loadGuardrailCatalog(workspaceRoot);
expect(entries.length).toBeGreaterThan(0);
expect(entries[0]).toHaveProperty('id');
expect(entries[0]).toHaveProperty('check');
```

### AC2: Baseline Guardrails Defined

**Given:** Catalog file loaded successfully
**When:** I inspect the catalog entries
**Then:**
- At least 4 guardrails defined (one per builtin check)
- Each guardrail references a valid builtin check
- Guardrails cover: security, quality, governance domains

**Guardrails required:**
1. **worktree_clean** - Git working tree must be clean
2. **command_allowlist_snapshot** - Command allowlist validated
3. **ledger_integrity** - Work process ledger intact
4. **policy_state_paths** - Policy directories exist

**Validation:**
```typescript
const checkNames = entries.map(e => e.check);
expect(checkNames).toContain('worktree_clean');
expect(checkNames).toContain('command_allowlist_snapshot');
expect(checkNames).toContain('ledger_integrity');
expect(checkNames).toContain('policy_state_paths');
```

### AC3: Guardrail Evaluation Runs Successfully

**Given:** Catalog loaded and baseline guardrails defined
**When:** I call `evaluateGuardrails(workspaceRoot, {suite: 'baseline'})`
**Then:**
- Evaluation completes without throwing
- Returns array of GuardrailResult objects
- Each result has: id, suite, summary, enforcement, severity, status
- Status is one of: 'pass' | 'warn' | 'fail'

**Validation:**
```typescript
const results = await evaluateGuardrails(workspaceRoot, {suite: 'baseline'});
expect(results.length).toBeGreaterThan(0);
expect(results[0]).toHaveProperty('status');
expect(['pass', 'warn', 'fail']).toContain(results[0].status);
```

### AC4: Guardrails Pass on Valid Configuration

**Given:** Clean workspace (git clean, ledger intact, directories exist)
**When:** I evaluate baseline guardrails
**Then:**
- All guardrails return status: 'pass' or 'warn' (not 'fail')
- No critical failures
- Audit trail logged

**Validation:**
```typescript
const results = await evaluateGuardrails(workspaceRoot, {suite: 'baseline'});
const failures = results.filter(r => r.status === 'fail' && r.severity === 'critical');
expect(failures).toHaveLength(0);
```

### AC5: Guardrails Fail on Intentionally Bad Configuration

**Given:** Corrupted configuration (dirty worktree, missing directories, invalid allowlist)
**When:** I evaluate baseline guardrails
**Then:**
- At least one guardrail returns status: 'fail'
- Failure details provided in result
- Enforcement level respected (audit vs. block)

**Validation:**
```typescript
// Simulate dirty worktree
await fs.writeFile('test-file.txt', 'uncommitted change');

const results = await evaluateGuardrails(workspaceRoot, {suite: 'baseline'});
const worktreeCheck = results.find(r => r.id === 'worktree-clean');
expect(worktreeCheck?.status).toBe('fail');
expect(worktreeCheck?.details).toContain('test-file.txt');

// Cleanup
await fs.unlink('test-file.txt');
```

---

## Functional Requirements

### FR1: Catalog Schema

**YAML structure:**
```yaml
guardrails:
  - id: unique-identifier
    suite: baseline | strict | audit  # Default: baseline
    summary: Human-readable description
    enforcement: audit | block          # Default: audit
    severity: info | warn | critical    # Default: warn
    evidence: path/to/evidence.md       # Optional
    check:
      kind: builtin
      name: check_function_name
```

**Constraints:**
- IDs must be unique across catalog
- Check kind must be 'builtin' (extensibility for 'custom' later)
- Check name must match BUILTIN_CHECKS registry
- Suite defaults to 'baseline' if not specified
- Enforcement defaults to 'audit' if not specified

### FR2: Builtin Checks

**4 checks already implemented in catalog.ts:**

1. **worktree_clean**
   - Purpose: Ensure git working tree has no uncommitted changes
   - Pass: `git status --porcelain` returns empty
   - Fail: Returns file list of uncommitted changes

2. **command_allowlist_snapshot**
   - Purpose: Validate command allowlist integrity
   - Pass: Allowlist has 10+ entries, no duplicates
   - Warn: Duplicates detected
   - Fail: Allowlist suspiciously small (<10 entries)

3. **ledger_integrity**
   - Purpose: Validate work process ledger completeness
   - Pass: Ledger exists, not empty, hash chain intact
   - Warn: Ledger missing or empty
   - Fail: Hash chain broken

4. **policy_state_paths**
   - Purpose: Ensure required policy directories exist
   - Pass: `state/policy/` and `state/analytics/` exist and writable
   - Warn: Directories missing

### FR3: Evaluation API

**Function:** `evaluateGuardrails(workspaceRoot, options?)`

**Options:**
- `suite?: string` - Filter by suite (e.g., 'baseline')
- `overrides?: Record<string, CheckFn>` - Custom check implementations

**Returns:** `Promise<GuardrailResult[]>`

**Result Schema:**
```typescript
interface GuardrailResult {
  id: string;              // Guardrail identifier
  suite: string;           // Suite name
  summary: string;         // Human description
  enforcement: 'audit' | 'block';
  severity: 'info' | 'warn' | 'critical';
  evidence?: string;       // Optional evidence path
  status: 'pass' | 'warn' | 'fail';
  details?: string;        // Failure/warning details
}
```

---

## Non-Functional Requirements

### NFR1: Performance

- Catalog load: <50ms (small YAML file)
- Guardrail evaluation: <500ms for baseline suite (4 checks)
- Individual check: <200ms each

### NFR2: Reliability

- Graceful degradation if catalog missing (error, don't crash)
- Validation errors include helpful messages (which entry, what's wrong)
- Check failures don't prevent other checks from running

### NFR3: Maintainability

- Catalog is human-editable YAML (not JSON)
- Comments allowed in YAML for documentation
- Clear error messages for schema violations
- Extensible: easy to add new guardrails

### NFR4: Security

- Read-only catalog (no writes during evaluation)
- Checks run in isolation (one failure doesn't affect others)
- No arbitrary code execution (only builtin checks)

---

## Constraints

1. **No new builtin checks** - Only use existing 4 checks
2. **Baseline suite only** - Other suites (strict, audit) deferred
3. **No custom checks** - Only builtin kind supported initially
4. **Manual catalog** - No auto-generation (keep simple)
5. **YAML only** - No alternative formats

---

## Out of Scope

- Custom check implementations (Phase 2)
- Multi-suite configuration (Phase 2)
- Auto-generation from code analysis (Phase 2)
- CI/CD integration (separate task)
- Guardrail remediation automation (separate task)
- Policy version control (separate task)

---

## Test Coverage Requirements

### Unit Tests

1. **Catalog validation**
   - Valid catalog loads successfully
   - Invalid catalog throws descriptive error
   - Missing catalog throws error
   - Duplicate IDs rejected

2. **Guardrail evaluation**
   - Baseline suite runs all 4 checks
   - Results match expected schema
   - Pass/warn/fail statuses correct

3. **Individual checks**
   - worktree_clean: pass on clean, fail on dirty
   - command_allowlist_snapshot: pass on valid, fail on bad
   - ledger_integrity: pass on valid, fail on corrupt
   - policy_state_paths: pass when dirs exist, warn when missing

### Integration Tests

1. **End-to-end evaluation**
   - Load catalog → evaluate → verify results
   - Intentional failures detected
   - Audit enforcement respected

2. **Schema compliance**
   - All required fields present
   - Type validation (string/enum)
   - Default values applied correctly

---

## Dependencies

- `tools/wvo_mcp/src/guardrails/catalog.ts` - Policy controller (exists)
- `tools/wvo_mcp/src/executor/guardrails.ts` - ALLOWED_COMMANDS (exists)
- `tools/wvo_mcp/src/work_process/index.ts` - Ledger validation (exists)
- `yaml` package - YAML parsing (exists)

---

## Success Metrics

**Immediate:**
- ✅ All acceptance criteria met
- ✅ All tests passing
- ✅ No lint/type errors

**Long-term:**
- Guardrail violations detected and logged
- Policy compliance measurable
- Zero regressions in baseline checks

---

**Spec Date:** 2025-11-05
**Author:** Claude Council
**Status:** Ready for PLAN phase
