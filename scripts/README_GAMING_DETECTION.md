# Gaming Detection Guide

**For**: All verification workflows (autopilot + manual sessions, Claude/Codex/any agent)

---

## What is Gaming?

**Gaming** is writing tests/evidence that appear to meet verification standards but don't actually verify correctness.

**Examples**:
- ❌ Tests with no assertions (claim Level 2)
- ❌ "Integration" tests that mock everything (claim Level 3)
- ❌ Weak deferrals: "don't have time" (avoid proper justification)

**Why it matters**: Gaming undermines verification system → production issues slip through

---

## Usage

### Autopilot (Automatic)

Gaming detection runs automatically during VERIFY → REVIEW transitions.

**Check logs**:
```bash
tail -f state/analytics/gaming_detections.jsonl
```

**Results are logged, not blocking** (observe mode)

### Manual Sessions (Recommended)

Before claiming task done:

```bash
bash scripts/detect_test_gaming.sh --task MY-TASK
```

**If gaming detected**: Fix patterns before committing

---

## Detected Patterns

### Pattern 1: No Assertions

**What**: Test file with 0 assertions

**Example (GAMING)**:
```typescript
test('validates input', () => {
  const result = validateInput('test');
  // Missing: expect(result)...
});
```

**Fix**:
```typescript
test('validates input', () => {
  const result = validateInput('test');
  expect(result).toBe(true); // ✅
});
```

### Pattern 2: Mock-Heavy Integration

**What**: "Integration" test with >80% mocking

**Example (GAMING)**:
```typescript
describe('integration: user service', () => {
  test('creates user', () => {
    vi.mock('./database');     // All mocked
    vi.mock('./emailService');
    vi.mock('./validator');
  });
});
```

**Fix**:
```typescript
describe('integration: user service', () => {
  test('creates user', () => {
    // Use real database
    const user = await createUser({...});
    expect(user.id).toBeDefined(); // ✅
  });
});
```

### Pattern 3: Weak Deferrals

**What**: Generic deferral justification

**Example (GAMING)**:
```markdown
## Deferral Justification
**Reason**: Don't have time
**Risk**: Unknown
```

**Fix**:
```markdown
## Deferral Justification
**Reason**: No production database credentials in CI
**Validation plan**: Test in staging after merge
**Risk**: MEDIUM - Schema compatibility
**Mitigation**: Reviewed migration, no breaking changes
```

---

## Command Options

```bash
# Basic usage
detect_test_gaming.sh --task TASK-ID

# Direct evidence path
detect_test_gaming.sh --evidence-path state/evidence/MY-TASK

# Text format (human-readable)
detect_test_gaming.sh --task TASK-ID --format text

# Verbose output
detect_test_gaming.sh --task TASK-ID --verbose

# Help
detect_test_gaming.sh --help
```

---

## Exit Codes

- `0`: No gaming detected ✅
- `1`: Gaming patterns found ⚠️
- `2`: Error (invalid args, missing files) ❌

---

## False Positives

**Legitimate patterns that might be flagged**:

1. **Test utilities**: Files like `test-utils.ts` have no assertions (helpers)
   - **Fix**: Name as `*.util.ts` or `*.fixture.ts` (not `*.test.ts`)

2. **Snapshot tests**: `toMatchSnapshot()` is detected as valid assertion
   - **No action needed**: Already handled

3. **Mock-heavy unit tests**: Mocking is valid for unit tests
   - **No action needed**: Only flags "integration" files

---

## Integration

### Autopilot (WorkProcessEnforcer)

Automatic during VERIFY → REVIEW transition (observe mode).

No configuration needed.

### Manual (Git Hook - Optional)

```bash
# Install pre-commit hook
cat > .git/hooks/pre-commit << 'HOOK'
#!/bin/bash
# Run gaming detection on staged evidence

STAGED=$(git diff --cached --name-only | grep "state/evidence")
if [[ -n "$STAGED" ]]; then
  TASK_ID=$(echo "$STAGED" | cut -d/ -f3 | head -1)
  bash scripts/detect_test_gaming.sh --task "$TASK_ID" --format text
  
  if [[ $? -ne 0 ]]; then
    echo "⚠️  Gaming detected. Fix or skip with: git commit --no-verify"
    exit 1
  fi
fi
HOOK

chmod +x .git/hooks/pre-commit
```

### Manual (Self-Check)

```bash
# Before claiming task done
bash scripts/detect_test_gaming.sh --task MY-TASK

# Review flagged patterns
# Fix gaming issues
# Re-run until clean
# Then commit
```

---

## Examples

### Example 1: Clean Task

```bash
$ bash scripts/detect_test_gaming.sh --task FIX-META-TEST-ENFORCEMENT --format text
Gaming Detection Report
=======================
Task: FIX-META-TEST-ENFORCEMENT
Evidence: state/evidence/FIX-META-TEST-ENFORCEMENT

✅ No gaming patterns detected

$ echo $?
0
```

### Example 2: Gaming Detected

```bash
$ bash scripts/detect_test_gaming.sh --task EXAMPLE-BAD --format text
Gaming Detection Report
=======================
Task: EXAMPLE-BAD
Evidence: state/evidence/EXAMPLE-BAD

⚠️  Gaming patterns detected: 3

- [HIGH] no_assertions: Test file has 5 tests but 0 assertions
- [HIGH] mock_heavy: Integration test has 90% mocking (9 mocks, 1 real)
- [HIGH] weak_deferral: Weak deferral justification contains: 'don't have time'

$ echo $?
1
```

### Example 3: JSON Output

```bash
$ bash scripts/detect_test_gaming.sh --task EXAMPLE-BAD --format json
{
  "task_id": "EXAMPLE-BAD",
  "evidence_path": "state/evidence/EXAMPLE-BAD",
  "gaming_detected": true,
  "pattern_count": 3,
  "patterns": [
    {
      "type": "no_assertions",
      "severity": "high",
      "file": "src/foo.test.ts",
      "message": "Test file has 5 tests but 0 assertions"
    }
  ],
  "timestamp": "2025-10-30T20:00:00Z"
}
```

---

## Scope: Universal

This tool works for:
- ✅ Claude autopilot sessions
- ✅ Claude manual sessions
- ✅ Codex autopilot sessions
- ✅ Codex manual sessions
- ✅ Any future agent platforms

**Same detection logic, flexible integration.**

---

## Future Enhancements

**Phase 2** (future):
- Coverage-based validation
- Critical path analysis

**Phase 3** (future):
- LLM semantic analysis
- Adaptive learning

**Phase 4** (future):
- Production correlation tracking
- Ground truth validation

---

**See also**:
- [VERIFICATION_LEVELS.md](../docs/autopilot/VERIFICATION_LEVELS.md)
- [MANUAL_SESSION_VERIFICATION.md](../docs/autopilot/MANUAL_SESSION_VERIFICATION.md)
