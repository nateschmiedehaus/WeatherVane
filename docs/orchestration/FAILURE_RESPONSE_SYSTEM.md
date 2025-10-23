# Failure Response System - Design

**Immediate, intelligent response to task failures with automatic remediation.**

---

## Problem Statement

**Current Behavior** (UNACCEPTABLE):
- Tasks fail silently
- No immediate intervention
- Same error repeats across multiple workers
- 100% failure rate tolerated
- No root cause analysis

**Required Behavior**:
1. **Immediate detection**: Failure triggers instant response (< 1 second)
2. **Worker reassignment**: Failed task switches to different worker immediately
3. **2-failure threshold**: After 2 failures, trigger root cause analysis
4. **Systematic fixes**: Prevent entire error classes, not just individual failures

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│          Failure Response Pipeline                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. DETECT (< 1s)                                   │
│     ├─ Task status: failed/blocked                  │
│     ├─ Error log parsing                            │
│     └─ Blocker classification                       │
│                                                     │
│  2. CLASSIFY (< 2s)                                 │
│     ├─ Error pattern matching                       │
│     ├─ Blocker type identification                  │
│     └─ Failure history check                        │
│                                                     │
│  3. RESPOND (< 5s)                                  │
│     ├─ First failure → Reassign worker              │
│     ├─ Second failure → Root cause analysis         │
│     └─ Third+ failure → Escalate to human           │
│                                                     │
│  4. FIX (< 5 min)                                   │
│     ├─ Apply targeted fix                           │
│     ├─ Prevent error class systemically             │
│     └─ Update documentation                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Component 1: Failure Detector

**Purpose**: Instant detection when task fails/blocks

**Triggers**:
1. Task status changes to `failed`
2. Task status changes to `blocked`
3. Worker reports error
4. Task exceeds time limit (timeout)

**Implementation**:
```typescript
class FailureDetector {
  private stateMachine: StateMachine;
  private failureCallback: (event: FailureEvent) => void;

  detectFailure(taskId: string): FailureEvent | null {
    const task = this.stateMachine.getTask(taskId);

    if (!task) return null;

    // Check for failure conditions
    if (task.status === 'failed') {
      return {
        type: 'TASK_FAILED',
        taskId,
        timestamp: Date.now(),
        worker: task.assigned_to,
        errorLog: this.getErrorLog(taskId)
      };
    }

    if (task.status === 'blocked') {
      return {
        type: 'TASK_BLOCKED',
        taskId,
        timestamp: Date.now(),
        worker: task.assigned_to,
        blockerReason: this.getBlockerReason(taskId)
      };
    }

    return null;
  }
}
```

---

## Component 2: Error Classifier

**Purpose**: Categorize errors into fixable classes

**Error Classes**:

### 1. File Not Found
**Pattern**: `ENOENT: no such file or directory`
**Fix**: Verify file paths, create missing files
**Prevention**: Pre-flight path validation

### 2. Permission Denied
**Pattern**: `EACCES: permission denied`
**Fix**: Adjust file permissions, check ownership
**Prevention**: Permission audit in pre-flight

### 3. Build Failure
**Pattern**: `error TS\d+:`, `npm ERR!`
**Fix**: Fix TypeScript errors, resolve dependencies
**Prevention**: Pre-commit hooks, CI checks

### 4. Missing Dependency
**Pattern**: `Cannot find module`, `MODULE_NOT_FOUND`
**Fix**: Install missing dependencies
**Prevention**: Lock file validation

### 5. Invalid Path
**Pattern**: Path references non-existent location
**Fix**: Correct path in code
**Prevention**: Path validation helper

### 6. API Rate Limit
**Pattern**: `429 Too Many Requests`
**Fix**: Backoff and retry, switch provider
**Prevention**: Token management

### 7. Timeout
**Pattern**: Task exceeds time limit
**Fix**: Simplify task, increase timeout
**Prevention**: Task complexity estimation

**Implementation**:
```typescript
interface ErrorClass {
  name: string;
  patterns: RegExp[];
  fix: (task: Task, error: string) => Promise<FixResult>;
  prevention: (task: Task) => Promise<void>;
}

class ErrorClassifier {
  private errorClasses: ErrorClass[] = [
    {
      name: 'FILE_NOT_FOUND',
      patterns: [/ENOENT: no such file or directory/i, /cannot find file/i],
      fix: async (task, error) => {
        const filePath = this.extractFilePath(error);
        return {
          action: 'create_missing_file',
          details: { filePath },
          applied: false
        };
      },
      prevention: async (task) => {
        // Add pre-flight path validation
        await this.addPathValidation(task);
      }
    },
    // ... more error classes
  ];

  classify(errorLog: string): ErrorClass | null {
    for (const errorClass of this.errorClasses) {
      for (const pattern of errorClass.patterns) {
        if (pattern.test(errorLog)) {
          return errorClass;
        }
      }
    }
    return null;
  }
}
```

---

## Component 3: Worker Reassignment

**Purpose**: Immediately switch task to different worker

**Algorithm**:
1. Mark current worker as "failed on task X"
2. Select best alternative worker:
   - Different provider (Codex → Claude or vice versa)
   - Different model tier
   - Available (idle or low queue)
3. Reset task to `pending`
4. Assign to new worker
5. Update context with failure history

**Implementation**:
```typescript
class WorkerReassigner {
  async reassignTask(taskId: string, failedWorker: string): Promise<string> {
    const task = this.stateMachine.getTask(taskId);

    // Find alternative worker
    const newWorker = await this.selectAlternativeWorker(task, failedWorker);

    // Record failure history
    await this.recordFailure(taskId, failedWorker, task.metadata?.error);

    // Reset task
    await this.stateMachine.updateTask(taskId, {
      status: 'pending',
      assigned_to: null,
      metadata: {
        ...task.metadata,
        failureCount: (task.metadata?.failureCount ?? 0) + 1,
        failureHistory: [
          ...(task.metadata?.failureHistory ?? []),
          {
            worker: failedWorker,
            timestamp: Date.now(),
            error: task.metadata?.error
          }
        ]
      }
    });

    // Assign to new worker
    await this.agentPool.assignTask(taskId, newWorker);

    logInfo(`Reassigned task ${taskId} from ${failedWorker} to ${newWorker}`);

    return newWorker;
  }

  private async selectAlternativeWorker(
    task: Task,
    failedWorker: string
  ): Promise<string> {
    const failureHistory = task.metadata?.failureHistory ?? [];
    const failedWorkers = new Set(
      failureHistory.map((f: any) => f.worker)
    );
    failedWorkers.add(failedWorker);

    // Get available workers
    const availableWorkers = await this.agentPool.getAvailableWorkers();

    // Filter out workers that already failed this task
    const candidates = availableWorkers.filter(
      w => !failedWorkers.has(w.id)
    );

    if (candidates.length === 0) {
      throw new Error(`No alternative workers available for task ${task.id}`);
    }

    // Prefer different provider than failed worker
    const failedProvider = this.getWorkerProvider(failedWorker);
    const differentProvider = candidates.filter(
      w => this.getWorkerProvider(w.id) !== failedProvider
    );

    const selected = differentProvider.length > 0
      ? differentProvider[0]
      : candidates[0];

    return selected.id;
  }
}
```

---

## Component 4: Root Cause Analyzer

**Purpose**: After 2 failures, find and fix root cause

**Triggers**:
- Task failure count >= 2
- Same error class across multiple tasks
- Failure rate > 50% in last hour

**Analysis Steps**:
1. **Gather evidence**:
   - Error logs from all failures
   - Task metadata
   - Recent code changes
   - System state

2. **Identify pattern**:
   - Common error class?
   - Common file path?
   - Common worker/provider?
   - Common task type?

3. **Determine root cause**:
   - Code bug
   - Configuration error
   - Missing dependency
   - Infrastructure issue

4. **Generate fix**:
   - Code patch
   - Config update
   - Dependency install
   - Infrastructure change

**Implementation**:
```typescript
interface RootCauseAnalysis {
  taskId: string;
  errorClass: string;
  rootCause: string;
  evidence: string[];
  fix: {
    type: 'code' | 'config' | 'dependency' | 'infrastructure';
    description: string;
    steps: string[];
  };
  preventionStrategy: string;
}

class RootCauseAnalyzer {
  async analyze(taskId: string): Promise<RootCauseAnalysis> {
    const task = this.stateMachine.getTask(taskId);
    const failureHistory = task.metadata?.failureHistory ?? [];

    // Gather evidence
    const evidence = await this.gatherEvidence(task, failureHistory);

    // Classify errors
    const errorClasses = failureHistory.map((f: any) =>
      this.errorClassifier.classify(f.error)
    ).filter(Boolean);

    // Find common pattern
    const pattern = this.findCommonPattern(errorClasses);

    // Determine root cause
    const rootCause = await this.determineRootCause(pattern, evidence);

    // Generate fix
    const fix = await this.generateFix(rootCause, task);

    return {
      taskId,
      errorClass: pattern.name,
      rootCause: rootCause.description,
      evidence: evidence.map(e => e.summary),
      fix,
      preventionStrategy: pattern.prevention
    };
  }

  private async determineRootCause(
    pattern: ErrorPattern,
    evidence: Evidence[]
  ): Promise<RootCause> {
    // Example: File not found errors
    if (pattern.name === 'FILE_NOT_FOUND') {
      const filePaths = evidence
        .filter(e => e.type === 'file_path')
        .map(e => e.value);

      // Check if it's the agent library path bug
      if (filePaths.some(p => p.includes('agent_library'))) {
        return {
          type: 'code',
          description: 'Incorrect agent library doc paths in ContextAssembler',
          location: 'tools/wvo_mcp/src/orchestrator/context_assembler.ts',
          fix: 'Correct file paths to match actual directory structure'
        };
      }
    }

    return {
      type: 'unknown',
      description: 'Root cause not determined',
      location: 'unknown',
      fix: 'Manual investigation required'
    };
  }

  private async generateFix(
    rootCause: RootCause,
    task: Task
  ): Promise<Fix> {
    switch (rootCause.type) {
      case 'code':
        return {
          type: 'code',
          description: `Fix ${rootCause.description}`,
          steps: [
            `Edit ${rootCause.location}`,
            'Apply correction',
            'Rebuild',
            'Test fix'
          ]
        };

      case 'config':
        return {
          type: 'config',
          description: `Update configuration`,
          steps: [
            'Identify config file',
            'Apply correction',
            'Restart service'
          ]
        };

      case 'dependency':
        return {
          type: 'dependency',
          description: 'Install missing dependency',
          steps: [
            'npm install <package>',
            'Rebuild',
            'Verify import'
          ]
        };

      default:
        return {
          type: 'infrastructure',
          description: 'Manual intervention required',
          steps: ['Escalate to human operator']
        };
    }
  }
}
```

---

## Component 5: Systematic Fix Applier

**Purpose**: Apply fixes that prevent entire error classes

**Fix Types**:

### 1. Code Patch
```typescript
async applyCodeFix(fix: CodeFix): Promise<void> {
  // Edit file
  await this.fileEditor.edit(fix.filePath, fix.oldContent, fix.newContent);

  // Rebuild
  await this.buildSystem.rebuild();

  // Verify fix
  const testResult = await this.runTests(fix.affectedTests);

  if (!testResult.passed) {
    throw new Error('Fix verification failed');
  }
}
```

### 2. Config Update
```typescript
async applyConfigFix(fix: ConfigFix): Promise<void> {
  await this.configManager.update(fix.configPath, fix.updates);
  await this.restartService(fix.service);
}
```

### 3. Dependency Install
```typescript
async applyDependencyFix(fix: DependencyFix): Promise<void> {
  await this.packageManager.install(fix.packages);
  await this.buildSystem.rebuild();
}
```

### 4. Prevention Mechanism
```typescript
async applyPrevention(errorClass: ErrorClass, task: Task): Promise<void> {
  switch (errorClass.name) {
    case 'FILE_NOT_FOUND':
      // Add pre-flight path validation
      await this.addPathValidator();
      break;

    case 'BUILD_FAILURE':
      // Add pre-commit hook
      await this.addPreCommitHook();
      break;

    case 'MISSING_DEPENDENCY':
      // Add dependency checker
      await this.addDependencyChecker();
      break;
  }
}
```

---

## Integration with Orchestrator

**Hook Points**:

### 1. Task Status Change
```typescript
// In UnifiedOrchestrator
async handleTaskStatusChange(taskId: string, newStatus: string): Promise<void> {
  if (newStatus === 'failed' || newStatus === 'blocked') {
    // IMMEDIATE RESPONSE
    await this.failureResponseManager.handleFailure(taskId);
  }
}
```

### 2. Worker Assignment
```typescript
// In AgentPool
async assignTask(taskId: string, workerId: string): Promise<void> {
  const task = this.stateMachine.getTask(taskId);

  // Check failure history
  if (task.metadata?.failureCount >= 2) {
    // Trigger root cause analysis BEFORE reassignment
    await this.failureResponseManager.analyzeAndFix(taskId);
  }

  // Continue with assignment
  await this.doAssign(taskId, workerId);
}
```

---

## Failure Response Manager (Main Orchestrator)

```typescript
export class FailureResponseManager {
  private detector: FailureDetector;
  private classifier: ErrorClassifier;
  private reassigner: WorkerReassigner;
  private analyzer: RootCauseAnalyzer;
  private fixer: SystematicFixApplier;

  async handleFailure(taskId: string): Promise<void> {
    const startTime = Date.now();

    // 1. DETECT (< 1s)
    const failure = this.detector.detectFailure(taskId);
    if (!failure) return;

    logInfo(`Failure detected: ${taskId}`, failure);

    // 2. CLASSIFY (< 2s)
    const errorClass = this.classifier.classify(failure.errorLog);

    // 3. RESPOND based on failure count
    const task = this.stateMachine.getTask(taskId);
    const failureCount = task.metadata?.failureCount ?? 0;

    if (failureCount === 0) {
      // FIRST FAILURE: Immediate worker reassignment
      await this.reassigner.reassignTask(taskId, failure.worker);
      logInfo(`Task ${taskId} reassigned after first failure`);

    } else if (failureCount === 1) {
      // SECOND FAILURE: Root cause analysis + fix
      const analysis = await this.analyzer.analyze(taskId);

      // Apply fix
      await this.fixer.applyFix(analysis.fix);

      // Apply prevention
      if (errorClass) {
        await this.fixer.applyPrevention(errorClass, task);
      }

      // Reassign to fresh worker
      await this.reassigner.reassignTask(taskId, failure.worker);

      logInfo(`Task ${taskId} analyzed and fixed after second failure`, analysis);

    } else {
      // THIRD+ FAILURE: Escalate to human
      await this.escalateToHuman(taskId, failure);
      logInfo(`Task ${taskId} escalated after ${failureCount + 1} failures`);
    }

    const duration = Date.now() - startTime;
    logInfo(`Failure response completed in ${duration}ms`);
  }

  private async escalateToHuman(taskId: string, failure: FailureEvent): Promise<void> {
    // Block task
    await this.stateMachine.updateTask(taskId, {
      status: 'blocked',
      metadata: {
        blocker: 'ESCALATED_TO_HUMAN',
        reason: `Failed ${failure.failureCount} times, requires manual intervention`,
        failureHistory: failure.history
      }
    });

    // Alert human operator
    await this.alertManager.sendAlert({
      severity: 'critical',
      title: `Task ${taskId} requires intervention`,
      description: `Failed ${failure.failureCount} times`,
      taskId
    });
  }
}
```

---

## Metrics & Monitoring

**Track**:
- Failure rate (per hour, per worker, per task type)
- Reassignment rate
- Root cause analysis trigger rate
- Fix success rate
- Time to recovery (detection → fix)

**Alerts**:
- Failure rate > 20%: Warning
- Failure rate > 50%: Critical
- Same error class > 5 times: Investigate
- No successful tasks in 1 hour: Emergency

---

## Testing Strategy

### Unit Tests
```typescript
describe('FailureResponseManager', () => {
  it('detects task failure immediately');
  it('classifies error correctly');
  it('reassigns worker on first failure');
  it('triggers root cause analysis on second failure');
  it('escalates to human on third failure');
  it('completes response in < 5s');
});
```

### Integration Tests
```typescript
describe('Failure Response Integration', () => {
  it('handles file-not-found error end-to-end');
  it('prevents same error from recurring');
  it('reassigns to different provider on failure');
});
```

---

## Rollout Plan

### Phase 1: Detection & Reassignment (Week 1)
- [ ] Implement FailureDetector
- [ ] Implement WorkerReassigner
- [ ] Integrate with UnifiedOrchestrator
- [ ] Test with real tasks

### Phase 2: Classification & Analysis (Week 2)
- [ ] Implement ErrorClassifier
- [ ] Implement RootCauseAnalyzer
- [ ] Add common error classes
- [ ] Test root cause detection

### Phase 3: Systematic Fixes (Week 3)
- [ ] Implement SystematicFixApplier
- [ ] Add code patch capability
- [ ] Add prevention mechanisms
- [ ] Test fix application

### Phase 4: Monitoring & Alerts (Week 4)
- [ ] Add failure metrics
- [ ] Add alerting
- [ ] Add dashboard
- [ ] Production deployment

---

## Success Criteria

✅ **Response Time**: Failure detected and worker reassigned in < 5s
✅ **Success Rate**: 90% of first reassignments succeed
✅ **Root Cause**: 80% of errors correctly classified
✅ **Fix Rate**: 70% of systematic fixes prevent recurrence
✅ **Escalation Rate**: < 5% of tasks require human intervention

---

**Status**: Design Complete
**Next**: Implementation
**Owner**: Autopilot Team
**Priority**: **CRITICAL** (blocking all task execution)
