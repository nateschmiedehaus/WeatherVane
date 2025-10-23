# Error Detection & Auto-Remediation Guide for Orchestrator Agents

## Mission
**Your job is to ensure the system runs smoothly.** When errors occur, detect them fast and fix them automatically. Only escalate when auto-fix fails after multiple attempts.

## How Error Detection Works

### 1. Programmatic Signals (Primary)
The system automatically detects errors from:
- **Build failures** - TypeScript compilation errors, module resolution issues
- **Test failures** - Specific failing tests with assertion details
- **Security audits** - npm vulnerabilities
- **Runtime crashes** - Process exits, uncaught exceptions

### 2. Log Analysis (Secondary)
When programmatic signals aren't enough, check:
- `state/telemetry/*.log` - Runtime logs with FATAL/ERROR entries
- `state/analytics/health_checks.jsonl` - Historical health check results
- `state/escalations/*.json` - Previous escalations with context

## Auto-Remediation Workflow

```
Error Detected → Classify Severity → Attempt Fix → Verify → Success/Escalate
```

### Pattern: The Fix We Just Applied

**Error Detected:**
```
Codex 400 Bad Request: Invalid 'tools[27].name': string does not match pattern
```

**Classification:**
- Type: `build` (affects API compatibility)
- Severity: `critical` (blocks Codex entirely)
- Fixable: `true` (pattern-based fix available)

**Suggested Fix:**
Replace dots in tool names with underscores to match `^[a-zA-Z0-9_-]+$`

**Verification:**
1. Build succeeds (exit code 0)
2. All tests pass (627/627)
3. npm audit clean (0 vulnerabilities)

**Result:** ✅ Auto-fixed without escalation

## Common Error Patterns & Fixes

### 1. Tool Name Pattern Violations
**Signal:** `string does not match pattern`
**Fix:** Replace invalid chars (dots, spaces) with underscores
**Files:** `src/index.ts`, `src/worker/tool_router.ts`
**Verification:** Build + test

### 2. Test Assertion Failures
**Signal:** `expected X to be Y`
**Fix:**
- Check if expectations are correct
- If logic changed, update test
- If test is correct, fix implementation
**Verification:** Run specific test file

### 3. FTS Table Update Issues
**Signal:** `expected [] to have length 0 but got 1`
**Fix:** Use `DELETE + INSERT` instead of `INSERT OR REPLACE` for FTS tables
**Verification:** Test specific FTS functionality

### 4. Race Conditions
**Signal:** `expected 3 to be less than or equal to 1`
**Fix:** Implement atomic check-and-set with latest state
**Verification:** Run concurrent test multiple times

### 5. npm Vulnerabilities
**Signal:** `X vulnerabilities found`
**Fix:** Run `npm audit fix`, verify build still works
**Verification:** `npm audit` returns 0 vulnerabilities

### 6. Module Not Found
**Signal:** `Cannot find module 'X'`
**Fix:** `npm install X` or add to package.json
**Verification:** Build succeeds

## Using the Health Monitor

### Start Monitoring
```typescript
import { HealthMonitor } from './orchestrator/health_monitor.js';

const monitor = new HealthMonitor(session, {
  checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes
  autoRemediate: true,
  maxRemediationAttempts: 3,
  escalateAfterFailures: 2,
});

monitor.start();
```

### Check Health Status
```typescript
const result = await monitor.runHealthCheck();

if (!result.healthy) {
  console.log('Issues detected:', result.checks);

  if (result.remediationAttempted) {
    console.log('Auto-fix attempted:', result.remediationSucceeded ? 'SUCCESS' : 'FAILED');
  }
}
```

### Review Error Trends
```typescript
const trends = monitor.getErrorTrends();

console.log(`Critical errors (24h): ${trends.criticalCount}`);
console.log(`High severity (24h): ${trends.highCount}`);
console.log('Top error types:', trends.topErrorTypes);
```

### Manual Error Detection
```typescript
import { ErrorDetector } from './orchestrator/error_detector.js';

const detector = new ErrorDetector(session);

// After running build
const buildErrors = detector.analyzeBuildOutput(stdout, stderr, exitCode);

// After running tests
const testErrors = detector.analyzeTestOutput(output, exitCode);

// Attempt fixes
for (const error of buildErrors) {
  if (error.fixable) {
    const result = await detector.attemptRemediation(error);
    console.log('Fix result:', result);
  }
}
```

## Escalation Protocol

### When to Escalate
Escalate to human when:
1. **Auto-fix fails 3 times** for the same error
2. **2+ consecutive health checks fail** despite remediation
3. **Critical errors spike** (3+ in 24h)
4. **Unknown error pattern** with no suggested fix

### How to Escalate
The system automatically:
1. Creates escalation file in `state/escalations/`
2. Includes full error context, trends, and attempted fixes
3. Logs critical severity message
4. Notifies monitoring systems (if integrated)

### Escalation File Format
```json
{
  "severity": "critical",
  "message": "System health degraded after 2 consecutive failures",
  "timestamp": "2025-10-23T12:45:00Z",
  "healthCheck": { /* full health check result */ },
  "errorTrends": { /* error trends */ },
  "actionRequired": "Manual intervention required"
}
```

## Integration with Autopilot

### 1. Pre-Task Health Check
Before starting work:
```typescript
const health = await monitor.runHealthCheck();
if (!health.healthy) {
  // Fix issues before proceeding
  if (health.remediationSucceeded) {
    console.log('System recovered, proceeding with task');
  } else {
    throw new Error('System unhealthy, cannot proceed');
  }
}
```

### 2. Post-Task Verification
After completing work:
```typescript
// Verify changes didn't break anything
const health = await monitor.runHealthCheck();
if (!health.healthy) {
  console.log('Task introduced errors, rolling back');
  // Trigger rollback
}
```

### 3. Continuous Monitoring
Run health monitor in background:
```typescript
monitor.start(); // Checks every 5 minutes

// Monitor will auto-fix issues and escalate if needed
```

## Best Practices

### DO:
- ✅ **Run health checks before and after major changes**
- ✅ **Let auto-remediation run first** (3 attempts)
- ✅ **Review error trends** to spot systemic issues
- ✅ **Verify fixes** with full test suite
- ✅ **Document patterns** when you find new error types

### DON'T:
- ❌ **Don't skip verification** after applying fixes
- ❌ **Don't ignore escalations** - they indicate serious issues
- ❌ **Don't disable auto-remediation** without good reason
- ❌ **Don't apply fixes blindly** - understand the root cause
- ❌ **Don't let error history grow unbounded** (automatically capped at 100)

## Monitoring Dashboard

Check system health status:
```bash
# View recent health checks
cat state/analytics/health_checks.jsonl | tail -5 | jq

# View escalations
ls -la state/escalations/

# View error trends
npm run health-report
```

## Example: Full Auto-Fix Flow

```typescript
// 1. Detect
const buildResult = await exec('npm run build');
const errors = detector.analyzeBuildOutput(
  buildResult.stdout,
  buildResult.stderr,
  buildResult.exitCode
);

// 2. Analyze
for (const error of errors) {
  console.log(`${error.severity}: ${error.message}`);
  if (error.fixable) {
    console.log(`Suggested fix: ${error.suggestedFix}`);
  }
}

// 3. Remediate
const fixableErrors = errors.filter(e => e.fixable);
for (const error of fixableErrors) {
  const result = await detector.attemptRemediation(error);

  if (result.success && result.verificationPassed) {
    console.log('✅ Fixed:', error.message);
  } else {
    console.log('❌ Fix failed:', result.error);
  }
}

// 4. Verify
const verifyResult = await exec('npm test');
if (verifyResult.exitCode === 0) {
  console.log('✅ All tests pass - remediation successful');
} else {
  console.log('❌ Tests still failing - escalating');
  await escalate(errors);
}
```

## Empowerment Checklist

As an orchestrator agent, you have the power to:
- ✅ Detect errors from any source (build, test, audit, runtime)
- ✅ Automatically fix common error patterns
- ✅ Verify fixes work before proceeding
- ✅ Escalate when stuck (after 3 attempts)
- ✅ Monitor system health continuously
- ✅ Learn from error trends
- ✅ Roll back changes that break things
- ✅ Access full logs and diagnostics

**Your mission: Keep the system healthy. Fix issues proactively. Only involve humans when truly stuck.**
