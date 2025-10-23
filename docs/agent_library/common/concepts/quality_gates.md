# Quality Gates

Quality gates are decision points that determine whether work can proceed to the next stage.

---

## Overview

**Purpose**: Prevent low-quality work from reaching production

**Mechanism**: Automated checks + critic reviews

**Outcome**: Pass → proceed, Fail → fix and retry

---

## Gate Types

### 1. Advisory Gates

**Severity**: Low
**Effect**: Warning only, does not block release
**Who triggers**: Critics with advisory authority

**Example**:
```
⚠️  Advisory: Consider extracting this logic into a helper function
    File: src/weather/fetcher.ts:42
    Critic: code_quality
    Action: Optional - worker can choose to address or defer
```

**Use Cases**:
- Code style suggestions
- Performance optimizations (non-critical)
- Refactoring opportunities
- Documentation improvements

**Worker Response**:
- Can address immediately
- Can defer to future task
- Can choose not to address
- Should document decision if deferring

---

### 2. Blocking Gates

**Severity**: Medium
**Effect**: Blocks task completion until fixed
**Who triggers**: Critics with blocking authority

**Example**:
```
❌ BLOCKED: Test coverage below 80%
   File: src/weather/fetcher.test.ts
   Critic: tests
   Coverage: 65% (need 80%)
   Action: Add tests for edge cases and error handling

Exit Criteria:
- Unit test coverage ≥80%
- All 7 test dimensions covered
- Tests pass consistently
```

**Use Cases**:
- Insufficient test coverage (<80%)
- Build errors
- Type errors
- Lint violations
- Missing documentation
- Performance below threshold

**Worker Response**:
- **Must fix** before claiming task done
- Re-run critic after fix
- Task stays `in_progress` until gate passes

---

### 3. Critical Gates

**Severity**: High
**Effect**: Immediate escalation, may pause autopilot
**Who triggers**: Critics with critical authority

**Example**:
```
🚨 CRITICAL: Security vulnerability detected
   Type: SQL injection risk
   File: src/api/users.ts:23
   Severity: HIGH (CVE-2023-12345)
   Critic: security

   IMMEDIATE ACTION REQUIRED:
   1. Stop work on related tasks
   2. Escalate to Security team
   3. Atlas + Director Dana notified
   4. Fix before ANY release
```

**Use Cases**:
- Security vulnerabilities
- Data loss risks
- Privacy violations
- Compliance failures
- Critical bugs in production path

**Response**:
- **Immediate escalation** to Atlas + security team
- Work stops on related tasks
- May trigger rollback if in production
- Must fix before any release

---

## Quality Gate Checklist

Every task must pass these gates before `done`:

### 1. Build Gate

**Check**: Code compiles with zero errors

**Command**:
```bash
npm run build
```

**Criteria**:
- ✅ Build completes successfully
- ✅ Zero TypeScript errors
- ✅ Zero compilation errors

**Blocker**: Build failures
**Critic**: build

---

### 2. Test Gate

**Check**: All tests pass with adequate coverage

**Command**:
```bash
npm test
bash scripts/validate_test_quality.sh path/to/test.ts
```

**Criteria**:
- ✅ All tests pass
- ✅ Coverage ≥80%
- ✅ Essential 7 dimensions covered
- ✅ No flaky tests

**Blocker**: Test failures or insufficient coverage
**Critic**: tests

---

### 3. Type Safety Gate

**Check**: Type system is sound

**Command**:
```bash
npm run typecheck
```

**Criteria**:
- ✅ No type errors
- ✅ No `any` types (except approved exceptions)
- ✅ Interfaces properly defined

**Blocker**: Type errors
**Critic**: typecheck

---

### 4. Security Gate

**Check**: No vulnerabilities or security issues

**Command**:
```bash
npm audit
```

**Criteria**:
- ✅ 0 vulnerabilities
- ✅ No secrets in code
- ✅ Input validation present
- ✅ Authentication/authorization correct

**Blocker**: Security vulnerabilities
**Critic**: security

---

### 5. Performance Gate

**Check**: Meets performance requirements

**Command**:
```bash
npm run benchmark  # If applicable
```

**Criteria**:
- ✅ API responses <500ms (p95)
- ✅ Memory usage bounded
- ✅ No N+1 queries
- ✅ No memory leaks

**Blocker**: Performance below threshold
**Critic**: cost_perf

---

### 6. Code Quality Gate

**Check**: Code meets quality standards

**Criteria**:
- ✅ 85-95% across 7 quality dimensions
- ✅ Cyclomatic complexity <10
- ✅ No code duplication
- ✅ Clear naming

**Blocker**: Quality score <85%
**Critic**: exec_review, design_system (for UI)

---

### 7. Documentation Gate

**Check**: Documentation is complete

**Criteria**:
- ✅ Code comments for complex logic
- ✅ README updated (if needed)
- ✅ API docs updated (if public interface changed)
- ✅ Commit message follows standards

**Blocker**: Missing or outdated docs
**Critic**: org_pm

---

## Gate Execution Flow

```
┌──────────────┐
│  Code Ready  │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  Run Gates   │ ← Automated + Critic checks
└──────┬───────┘
       │
       ├──→ Advisory Warning → Log + Continue
       │
       ├──→ Blocking Failure → Fix + Re-run
       │                           ↓
       │                      ┌────────────┐
       │                      │ Fix Issues │
       │                      └─────┬──────┘
       │                            │
       │                            ↓
       │                      (Re-run gates)
       │
       └──→ Critical Failure → Escalate + Stop
```

---

## Quality Gate Configuration

### Critic Authority Levels

**Defined in**: `tools/wvo_mcp/config/critic_identities.json`

```json
{
  "build": {
    "authority": "blocking",
    "rationale": "Code must compile"
  },
  "tests": {
    "authority": "blocking",
    "rationale": "Tests must pass and cover 7 dimensions"
  },
  "security": {
    "authority": "critical",
    "rationale": "Security vulnerabilities are unacceptable"
  },
  "design_system": {
    "authority": "advisory",
    "rationale": "UX improvements are important but not blocking"
  }
}
```

### Gate Thresholds

**Coverage**:
```typescript
const COVERAGE_THRESHOLD = 80;  // Percentage
```

**Performance**:
```typescript
const API_LATENCY_P95_MS = 500;
const MAX_MEMORY_MB = 500;
```

**Quality Scores**:
```typescript
const MIN_QUALITY_SCORE = 85;  // Out of 100
const TARGET_QUALITY_SCORE = 95;
```

---

## Bypassing Gates (Emergency Only)

**When allowed**:
- Critical production incident (fix now, improve later)
- Approved by Atlas + stakeholder
- Documented in context with remediation plan

**How to bypass**:
```yaml
# In task metadata
metadata:
  gate_bypass: true
  bypass_reason: "Critical production fix for data loss bug"
  bypass_approved_by: "Atlas"
  bypass_date: "2025-10-23"
  remediation_task: "T1.3.5"  # Follow-up to address skipped gates
```

**Requirements**:
1. Must have Atlas approval
2. Must document reason
3. Must create remediation task
4. Cannot bypass security gates (ever)

**Example**:
```markdown
## Emergency Gate Bypass - T1.2.3

**Reason**: Critical bug causing data loss in production
**Approved By**: Atlas (2025-10-23)
**Gates Bypassed**: test coverage (65% instead of 80%)
**Remediation**: Task T1.2.4 created to add missing tests
**Security Check**: ✅ Security gates passed (not bypassed)
```

---

## Gate Failure Handling

### Automatic Actions

**1. Blocking Gate Fails**:
- Task stays `in_progress`
- Critic report logged
- Worker notified
- Backoff timer starts (prevent spam)

**2. Critical Gate Fails**:
- Task blocked
- Atlas notified
- Director Dana notified
- Relevant specialist notified (e.g., security team)
- May pause related work

### Backoff Policy

**Purpose**: Prevent repeated re-checks before fix is ready

**Schedule**:
- 1st failure: Re-check immediately after fix
- 2nd failure: Wait 1 hour
- 3rd failure: Wait 4 hours
- 4th+ failure: Wait 24 hours (likely needs architectural fix)

**Managed by**: Director Dana via critic scheduling

---

## Quality Gate Metrics

### Pass Rate

**Formula**: `(passed_gates / total_gates) * 100`

**Target**: ≥95%

**Use**: Identify problematic areas

### Mean Time to Pass

**Formula**: Average time from first check to gate pass

**Target**: <30 minutes for blocking gates

**Use**: Optimize fix workflows

### Gate Failure Distribution

**Track**: Which gates fail most often

**Use**: Focus improvement efforts

**Example**:
```
Test Gate: 45% of failures
Security Gate: 25% of failures
Build Gate: 20% of failures
Type Gate: 10% of failures
```

**Action**: Improve test writing practices (biggest failure source)

---

## Best Practices

### 1. Run Gates Early

**Don't wait** until task is "done" to run gates:

```bash
# Run continuously during development
npm run build  # After each significant change
npm test       # After adding/changing code
```

### 2. Fix Fast

**Don't let gate failures accumulate**:
- Fix blocking gates within 30 minutes
- Fix critical gates immediately
- Don't move to next task until gates pass

### 3. Learn from Failures

**After gate failure**:
1. Why did it fail?
2. Could it have been caught earlier?
3. Is there a pattern?
4. Should we add preventative checks?

### 4. Keep Gates Fast

**Gates should be fast** to encourage frequent runs:
- Build: <30 seconds
- Tests: <60 seconds
- Audit: <10 seconds
- Type check: <20 seconds

**If gates are slow**, developers will avoid running them.

---

## References

- [Quality Standards](/docs/agent_library/common/standards/quality_standards.md)
- [Testing Standards](/docs/agent_library/common/standards/testing_standards.md)
- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md)
- [Critic Workflow](/docs/agent_library/common/processes/critic_workflow.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
