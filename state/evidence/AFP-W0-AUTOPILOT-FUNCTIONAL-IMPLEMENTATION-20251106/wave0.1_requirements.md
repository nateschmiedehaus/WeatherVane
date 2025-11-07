# Wave 0.1 Requirements

**Based on Critical Review of Wave 0.0**
**Date:** 2025-11-06

## Core Deficiencies to Fix

### 1. Quality Issues (Current State)
- **Placeholder content generation** - Generic templates with no real value
- **No task type awareness** - Treats Review/Reform/Implementation identically
- **Fake quality gates** - Hardcoded approval without real validation
- **No domain understanding** - Doesn't read context or analyze requirements

### 2. Required Capabilities for Wave 0.1

#### A. Task Type Routing
```typescript
interface TaskRouter {
  route(task: Task): TaskHandler {
    if (task.title.includes("Review:")) return new ReviewTaskHandler();
    if (task.title.includes("Reform:")) return new ReformTaskHandler();
    return new ImplementationTaskHandler();
  }
}
```

#### B. Real Content Generation
- Context-aware analysis based on file searches
- Domain-specific implementations
- Actual code generation (not TODOs)
- Real test authoring with coverage

#### C. Quality Gate Integration
- Actually call DesignReviewer
- Actually call ProcessCritic
- Handle rejections and remediation loops
- Track quality metrics

#### D. Self-Improvement Capability (NEW REQUIREMENT)
```typescript
interface SelfImprovementEngine {
  // Clone Wave 0 for testing improvements
  createTestInstance(): Wave0Clone {
    // Separate PID, lock file, lease manager
    // Isolated evidence directory
    // Test roadmap (not production)
  }

  // Run improvements in parallel
  validateImprovement(change: Improvement): ValidationResult {
    const clone = this.createTestInstance();
    clone.applyChange(change);
    return clone.runValidationSuite();
  }

  // Apply validated improvements to self
  selfModify(improvement: Improvement): void {
    if (this.validateImprovement(improvement).passed) {
      this.applyToSelf(improvement);
      this.restart(); // Graceful restart with new code
    }
  }
}
```

## Implementation Requirements

### Process Isolation
- **Lock files:** `/tmp/wave0_main.lock` vs `/tmp/wave0_test_${id}.lock`
- **Lease namespace:** `wave0:main:*` vs `wave0:test:${id}:*`
- **Evidence paths:** `state/evidence/` vs `state/test_evidence/${id}/`
- **Roadmap:** `state/roadmap.yaml` vs `state/test_roadmap_${id}.yaml`

### Test Harness
```typescript
class Wave0TestHarness {
  async runIsolatedTest(taskId: string): Promise<TestResult> {
    const testId = crypto.randomUUID();
    const clone = new Wave0Runner({
      lockFile: `/tmp/wave0_test_${testId}.lock`,
      leasePrefix: `wave0:test:${testId}`,
      evidencePath: `state/test_evidence/${testId}`,
      roadmapPath: `state/test_roadmap_${testId}.yaml`
    });

    try {
      // Copy single task to test roadmap
      await this.createTestRoadmap(testId, taskId);

      // Run clone on test task
      const result = await clone.executeTask(taskId);

      // Validate output quality
      return this.validateOutput(result);
    } finally {
      // Cleanup test artifacts
      await this.cleanup(testId);
    }
  }
}
```

### Self-Modification Workflow

1. **Wave 0 picks up self-improvement task**
   - Example: "Implement better content generation for Wave 0"

2. **During IMPLEMENT phase:**
   - Wave 0 modifies its own phase_executors.ts
   - Creates improved content generation logic

3. **During VERIFY phase:**
   - Spawns test clone with new code
   - Runs test clone on sample tasks
   - Validates output quality improvement
   - Compares metrics (before/after)

4. **During REVIEW phase:**
   - If improvements validated: Apply to self
   - If not: Document failures for next iteration
   - Graceful restart with new capabilities

### Safety Constraints

1. **No infinite loops** - Max 3 self-modification attempts per task
2. **Quality regression prevention** - New version must score higher
3. **Rollback capability** - Keep last 3 versions for recovery
4. **Audit trail** - Log all self-modifications to state/analytics/

## Success Metrics

| Metric | Wave 0.0 (Current) | Wave 0.1 (Target) |
|--------|-------------------|-------------------|
| Content quality score | ~2/10 | >7/10 |
| Real implementation | 0% | 80%+ |
| Quality gate compliance | 0% | 100% |
| Task type awareness | No | Yes |
| Self-improvement capable | No | Yes |
| Continuous operation | Yes ✅ | Yes ✅ |
| AFP compliance | Mechanical only | Full |

## Testing Plan

1. **Unit tests for new components:**
   - TaskRouter
   - ReviewTaskHandler
   - ReformTaskHandler
   - ImplementationTaskHandler
   - Wave0TestHarness

2. **Integration tests:**
   - Self-cloning with isolation
   - Parallel execution without conflicts
   - Quality gate integration
   - Self-modification workflow

3. **Live validation:**
   - Run Wave 0.1 on test roadmap
   - Verify quality improvements
   - Test self-improvement on simple task
   - Validate no regressions

## Rollout Strategy

1. **Phase 1:** Task type routing (immediate)
2. **Phase 2:** Quality gate integration (next)
3. **Phase 3:** Improved content generation (iterative)
4. **Phase 4:** Self-improvement engine (advanced)

Each phase builds on the previous, with validation gates between phases.

## Risk Mitigation

- **Risk:** Self-modification creates broken Wave 0
- **Mitigation:** Test clones, validation suite, rollback capability

- **Risk:** Infinite self-improvement loops
- **Mitigation:** Max attempt limits, timeout controls

- **Risk:** Process/resource leaks from clones
- **Mitigation:** Strict cleanup, resource monitoring

## Next Steps

1. Implement TaskRouter with type-specific handlers
2. Integrate real DesignReviewer and ProcessCritic calls
3. Build Wave0TestHarness for isolated testing
4. Create self-improvement engine with safety controls
5. Validate on test roadmap before production deployment