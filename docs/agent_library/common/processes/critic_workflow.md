# Critic Workflow

How critics execute quality reviews and provide feedback.

---

## Overview

**Purpose**: Maintain quality standards through specialized reviews

**Who**: 25+ specialized critics (see [Critic Identities](/docs/agent_library/roles/critics/critic_identities.md))

**When**: Triggered by Director Dana based on task type and backoff policy

**Output**: Pass/fail + actionable feedback

---

## Critic Execution Flow

```
┌────────────────┐
│  Task Ready    │
└───────┬────────┘
        │
        ↓
┌────────────────┐
│  Trigger       │ ← Director Dana schedules critic
│  Critic        │   based on task type + backoff
└───────┬────────┘
        │
        ↓
┌────────────────┐
│  1. OBSERVE    │ → Read code, run tools, analyze
└───────┬────────┘
        │
        ↓
┌────────────────┐
│  2. ANALYZE    │ → Compare against standards
└───────┬────────┘
        │
        ↓
┌────────────────┐
│  3. REPORT     │ → Generate feedback
└───────┬────────┘
        │
        ├──→ PASS (advisory) → Log + Continue
        ├──→ PASS (no issues) → Continue
        ├──→ FAIL (blocking) → Fix Required
        └──→ FAIL (critical) → Escalate + Stop
```

---

## Critic Phases

### Phase 1: OBSERVE

**Objective**: Gather data about the change

**Actions**:
- Read changed files
- Run specialized tools (build, test, audit, etc.)
- Review related context
- Check against baseline

**Example** (tests critic):
```typescript
// 1. Find test files for changed code
const changedFiles = await getChangedFiles();
const testFiles = findTestFiles(changedFiles);

// 2. Run tests
const testResults = await runTests(testFiles);

// 3. Measure coverage
const coverage = await measureCoverage(changedFiles);

// 4. Check test quality
const qualityReport = await validateTestQuality(testFiles);
```

---

### Phase 2: ANALYZE

**Objective**: Compare observations against quality standards

**Actions**:
- Check compliance with standards
- Identify violations
- Categorize by severity (advisory, blocking, critical)
- Determine root causes

**Example** (tests critic):
```typescript
const issues: Issue[] = [];

// Check coverage
if (coverage.overall < 80) {
  issues.push({
    type: 'coverage',
    severity: 'blocking',
    message: `Coverage ${coverage.overall}% is below 80% threshold`,
    files: coverage.uncoveredFiles
  });
}

// Check test dimensions
const dimensions = analyzeTestDimensions(testResults);
if (dimensions.missing.length > 0) {
  issues.push({
    type: 'dimensions',
    severity: 'blocking',
    message: `Missing test dimensions: ${dimensions.missing.join(', ')}`,
    expectedDimensions: ESSENTIAL_7
  });
}

// Check for flaky tests
const flakyTests = detectFlakyTests(testResults);
if (flakyTests.length > 0) {
  issues.push({
    type: 'flakiness',
    severity: 'blocking',
    message: `${flakyTests.length} flaky test(s) detected`,
    tests: flakyTests
  });
}
```

---

### Phase 3: REPORT

**Objective**: Provide actionable feedback

**Report Structure**:
```json
{
  "critic": "tests",
  "timestamp": "2025-10-23T12:00:00Z",
  "status": "fail",
  "severity": "blocking",
  "issues": [
    {
      "type": "coverage",
      "severity": "blocking",
      "file": "src/weather/fetcher.ts",
      "message": "Coverage 65% is below 80% threshold",
      "fix": "Add tests for error handling and edge cases",
      "locations": [
        { "file": "src/weather/fetcher.ts", "lines": [42, 67, 89] }
      ]
    }
  ],
  "exitCriteria": "All tests pass with ≥80% coverage and 7/7 dimensions",
  "nextSteps": [
    "Add tests for fetchWeatherData error handling",
    "Add tests for cache expiration",
    "Add tests for invalid location handling"
  ]
}
```

**Report Guidelines**:
- **Be specific**: Point to exact files, lines, issues
- **Be actionable**: Provide clear fix suggestions
- **Be constructive**: Frame as improvements, not complaints
- **Set exit criteria**: Clear conditions for passing

---

## Critic Authority Levels

### Advisory (Low Risk)

**Effect**: Warning only, does not block

**Example**:
```json
{
  "critic": "design_system",
  "status": "pass_with_advisory",
  "severity": "advisory",
  "issues": [
    {
      "type": "style",
      "message": "Consider using consistent spacing (found 8px and 12px)",
      "file": "apps/web/src/components/WeatherCard.tsx",
      "fix": "Use spacing tokens from design system (space-2, space-3)"
    }
  ]
}
```

**Worker Response**: Optional - can address now or defer

---

### Blocking (Medium Risk)

**Effect**: Blocks task completion until fixed

**Example**:
```json
{
  "critic": "tests",
  "status": "fail",
  "severity": "blocking",
  "issues": [
    {
      "type": "coverage",
      "message": "Coverage 65% is below 80% threshold",
      "file": "src/weather/fetcher.ts",
      "fix": "Add tests for error handling (lines 42-67) and edge cases (lines 89-95)"
    }
  ],
  "exitCriteria": "Coverage ≥80% with all 7 dimensions covered"
}
```

**Worker Response**: Must fix before marking task `done`

---

### Critical (High Risk)

**Effect**: Immediate escalation, may stop autopilot

**Example**:
```json
{
  "critic": "security",
  "status": "fail",
  "severity": "critical",
  "issues": [
    {
      "type": "vulnerability",
      "cve": "CVE-2023-12345",
      "severity": "HIGH",
      "package": "lodash@4.17.20",
      "message": "Prototype pollution vulnerability",
      "fix": "Upgrade to lodash@4.17.21 or higher"
    }
  ],
  "escalation": {
    "to": ["Atlas", "Director Dana", "Security Team"],
    "priority": "critical",
    "action": "Stop release, fix immediately"
  }
}
```

**Response**: Immediate escalation + stop related work

---

## Backoff Policy

**Purpose**: Prevent over-execution and token waste

### Backoff Schedule

**1st failure**: Immediate re-check after fix
**2nd failure**: Wait 1 hour before next check
**3rd failure**: Wait 4 hours
**4th+ failure**: Wait 24 hours (likely needs architectural fix)

### Implementation

```typescript
interface BackoffState {
  critic: string;
  task_id: string;
  failures: number;
  last_check: Date;
  next_check: Date;
}

function calculateBackoff(failures: number): number {
  const backoffSchedule = [
    0,        // 0 failures: immediate
    0,        // 1 failure: immediate retry
    3600,     // 2 failures: 1 hour
    14400,    // 3 failures: 4 hours
    86400     // 4+ failures: 24 hours
  ];

  const index = Math.min(failures, backoffSchedule.length - 1);
  return backoffSchedule[index] * 1000; // Convert to ms
}

function canRunCritic(state: BackoffState): boolean {
  return new Date() >= state.next_check;
}
```

---

## Critic Scheduling

**Managed by**: Director Dana

**Triggers**:

### 1. Task Completion

```typescript
// Worker completes verification loop
await plan_update({ task_id: 'T1.2.3', status: 'done' });

// Orchestrator triggers relevant critics
const task = await getTask('T1.2.3');
const critics = selectCriticsForTask(task);

for (const critic of critics) {
  if (canRunCritic(critic, task.id)) {
    await runCritic(critic, task);
  }
}
```

### 2. Manual Trigger

```typescript
// User/Atlas requests specific critic
await runCritic('security', task);
```

### 3. Scheduled Review

```typescript
// Periodic health checks
schedule.every('1 hour').run(() => {
  runCritic('health_check', null);
});

// Milestone reviews
schedule.on('milestone_complete').run((milestone) => {
  runCritic('exec_review', milestone);
});
```

---

## Critic Selection

**Based on task characteristics**:

### By File Type

```typescript
function selectCriticsByFiles(changedFiles: string[]): string[] {
  const critics: string[] = [];

  if (changedFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    critics.push('build', 'typecheck', 'tests');
  }

  if (changedFiles.some(f => f.includes('apps/web'))) {
    critics.push('design_system');
  }

  if (changedFiles.some(f => f.includes('apps/model'))) {
    critics.push('academic_rigor', 'data_quality', 'leakage');
  }

  if (changedFiles.some(f => f.includes('package.json'))) {
    critics.push('security');
  }

  return critics;
}
```

### By Task Type

```typescript
function selectCriticsByTask(task: Task): string[] {
  const critics: string[] = ['build', 'tests', 'typecheck']; // Always run

  if (task.metadata?.type === 'feature') {
    critics.push('org_pm');
  }

  if (task.metadata?.type === 'security') {
    critics.push('security');
  }

  if (task.metadata?.type === 'ml') {
    critics.push('academic_rigor', 'data_quality');
  }

  if (task.epic_id?.startsWith('E-UI')) {
    critics.push('design_system');
  }

  return critics;
}
```

---

## Critic Feedback Loop

### Iteration 1: Initial Check

```
Worker completes task → Critic runs → Finds issues → Worker fixes
```

**Example**:
```
Worker: ✅ Task T1.2.3 complete
Tests Critic: ❌ Coverage 65% (need 80%)
Worker: Adds tests → Coverage 82%
Worker: ✅ Re-submits for review
```

### Iteration 2: Re-check

```
Worker fixes → Critic re-runs (if not in backoff) → Pass/Fail
```

**Example**:
```
Tests Critic: ✅ Coverage 82%, all dimensions covered
Worker: ✅ Marks task done
```

### Iteration 3+: Backoff

```
Worker fixes → Critic in backoff (wait 1 hour) → Worker waits or escalates
```

**Example**:
```
Worker: Fixed issues
Tests Critic: (backoff - wait 1 hour)
Worker: Escalates to Atlas (repeated failures)
Atlas: Reviews, provides guidance
```

---

## Critic Best Practices

### For Critics:

1. **Be specific**: Point to exact issues
2. **Be actionable**: Provide fix suggestions
3. **Be fast**: Complete review in <5 minutes
4. **Be consistent**: Apply same standards to all code
5. **Document standards**: Link to relevant docs

### For Workers:

1. **Run critics proactively**: Don't wait for official review
2. **Fix fast**: Address blocking issues within 30 minutes
3. **Learn from feedback**: Avoid repeat violations
4. **Ask for clarification**: If feedback is unclear
5. **Respect backoff**: Don't spam critics

---

## Critic Metrics

### Effectiveness Metrics

**False Positive Rate**: Issues flagged that weren't real problems
- **Target**: <5%
- **Calculation**: `false_positives / total_issues`

**False Negative Rate**: Issues missed by critic
- **Target**: <2%
- **Calculation**: `bugs_in_production / total_releases`

**Signal-to-Noise**: Useful feedback vs noise
- **Target**: >90%
- **Calculation**: `actionable_feedback / total_feedback`

### Efficiency Metrics

**Review Time**: Time to complete review
- **Target**: <5 minutes
- **Calculation**: `review_complete_time - review_start_time`

**Fix Time**: Time for worker to address issues
- **Target**: <30 minutes
- **Calculation**: `fix_complete_time - issue_reported_time`

**Pass Rate**: Tasks passing on first check
- **Target**: >80%
- **Calculation**: `passes_first_try / total_checks`

---

## Common Issues

### Issue: Critic too slow (>5 min)

**Causes**:
- Running too many checks
- Checking entire codebase instead of changes
- Network requests not cached

**Fix**:
- Optimize checks (only check changed files)
- Cache expensive operations
- Run checks in parallel

### Issue: Too many false positives

**Causes**:
- Standards too strict
- Critic not understanding context
- Rules not well-calibrated

**Fix**:
- Review and adjust standards
- Improve critic context awareness
- Tune rule thresholds

### Issue: Missing real issues (false negatives)

**Causes**:
- Incomplete checks
- Missing test cases
- Standards too lenient

**Fix**:
- Expand critic checks
- Add test cases for known patterns
- Tighten standards

---

## References

- [Critic Charter](/docs/agent_library/roles/critics/charter.md)
- [Critic Identities](/docs/agent_library/roles/critics/critic_identities.md)
- [Quality Framework](/docs/agent_library/roles/critics/quality_framework.md)
- [Quality Gates](/docs/agent_library/common/concepts/quality_gates.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
