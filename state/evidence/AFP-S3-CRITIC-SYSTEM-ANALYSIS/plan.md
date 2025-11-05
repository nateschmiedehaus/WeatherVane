# PLAN: Critic System Refactor Execution Plan

**Task ID:** AFP-S3-CRITIC-SYSTEM-ANALYSIS
**Date:** 2025-11-05
**Phase:** PLAN (Phase 3 of 10)

---

## Executive Summary

**Goal:** Transform critic system from 3.2/10 → 8/10 AFP/SCAS compliance in **5-7 days** of focused work.

**Approach:** Via Negativa first (delete 500 LOC day 1-2), then Refactor (consolidate 2,000 LOC day 3-5), then Test (add coverage day 6-7).

**Total Impact:**
- Delete/consolidate: 2,500 LOC (31% reduction)
- Test coverage: 13% → 70%
- Build: BROKEN → PASSING
- Time: 5-7 days (not weeks)

---

## Via Negativa Analysis: What Can We DELETE/SIMPLIFY?

### Priority 1: Delete Immediately (2-4 hours)

**D1: Delete ModelingReality v1 Wrapper** (~100 LOC)
```bash
# File: src/critics/modeling_reality.ts
# It's just: this.v2Critic = new ModelingRealityV2Critic()
# Then: return await this.v2Critic.evaluate()

rm src/critics/modeling_reality.ts

# Edit session.ts:
- modeling_reality: ModelingRealityCritic,
- modeling_reality_v2: ModelingRealityV2OrchestratorCritic,
+ modeling_reality: ModelingRealityV2Critic,
```
**Savings:** 100 LOC, 1 less class, clearer intent

**D2: Delete Broken Test Files** (3 files)
```bash
rm src/critics/__tests__/ml_task_aggregator.test.ts
rm src/critics/__tests__/ml_task_aggregator_critic_results.test.ts
rm src/critics/__tests__/ml_task_meta_critic.test.ts

# They import ml_task_aggregator.ts (in graveyard)
# Cannot fix without restoring from graveyard
# Decision: DELETE (cleaner than restore)
```
**Savings:** 3 broken test files, -20 TypeScript errors

**D3: Simplify Intelligence Engine** (298 → 50 LOC)
```typescript
// KEEP: Basic failure categorization
export function categorizeFailure(stderr: string): FailureCategory {
  if (stderr.includes('timeout')) return 'timeout';
  if (stderr.includes('AssertionError')) return 'test_failure';
  if (stderr.includes('Expected')) return 'lint_error';
  // ... 10 more patterns
  return 'unknown';
}

// DELETE: Everything else in intelligence_engine.ts
// - ResearchManager integration (broken, unused)
// - Historical tracking (no ROI)
// - Recommendation system (generic, not helpful)
```
**Savings:** 250 LOC, removes broken dependency

**D4: Replace Trivial Critics with Config** (8 classes → 1 object)
```typescript
// BEFORE: 8 separate class files (~150 LOC total)
export class BuildCritic extends Critic {
  protected command(): string { return "make lint"; }
}

// AFTER: Simple config (~20 LOC)
const SHELL_CRITICS = {
  build: "make lint",
  tests: "bash tools/wvo_mcp/scripts/run_integrity_tests.sh",
  typecheck: "tsc --noEmit",
  security: "npm audit",
  // ... 4 more
};

// Factory:
class ShellCritic extends Critic {
  constructor(private cmd: string) { super(); }
  protected command(): string { return this.cmd; }
}
```
**Savings:** 130 LOC, 8 fewer files

**PHASE 1 TOTAL: DELETE 480 LOC in 2-4 hours**

---

### Priority 2: Refactor Root Causes (1-2 days)

**R1: Extract ObservationCritic Base Class** (HIGHEST IMPACT)

**Problem:** 5 critics with 80% duplicate structure (2,449 LOC)

**Current state:**
```
api_observation.ts (564 LOC)
database_observation.ts (484 LOC)
infrastructure_observation.ts (543 LOC)
performance_observation.ts (470 LOC)
data_observation.ts (388 LOC)
────────────────────────────
TOTAL: 2,449 LOC
DUPLICATION: ~1,950 LOC (80%)
```

**Refactor plan:**
```typescript
// NEW FILE: src/critics/base_observation.ts (~400 LOC)
export abstract class ObservationCritic<T extends Trace> extends Critic {
  // Shared interfaces
  protected abstract observe(context: CriticContext): Promise<T[]>;
  protected abstract analyzeTraces(traces: T[]): Issue[];

  // Shared implementations
  protected async startDevServer(): Promise<void> { /* ... */ }
  protected async stopDevServer(): Promise<void> { /* ... */ }
  protected findOpportunities(traces: T[]): Opportunity[] { /* ... */ }
  protected generateReport(issues: Issue[], opps: Opportunity[]): Report { /* ... */ }

  async run(context: CriticContext): Promise<CriticResult> {
    const devServer = await this.maybeStartDevServer();
    const traces = await this.observe(context);
    const issues = await this.analyzeTraces(traces);
    const opportunities = this.findOpportunities(traces);
    await this.maybeStopDevServer(devServer);
    return this.buildResult(issues, opportunities);
  }
}

// REFACTORED: api_observation.ts (~150 LOC, down from 564)
export class APIObservationCritic extends ObservationCritic<APITrace> {
  protected async observe(context: CriticContext): Promise<APITrace[]> {
    // Only API-specific logic
    const endpoints = await this.discoverEndpoints();
    return await this.testEndpoints(endpoints);
  }

  protected analyzeTraces(traces: APITrace[]): APIIssue[] {
    // Only API-specific thresholds
    return traces.filter(t => t.duration_ms > 500).map(...);
  }
}

// Repeat for database, infrastructure, performance, data critics
```

**Savings:**
- api_observation: 564 → 150 LOC (-414)
- database_observation: 484 → 150 LOC (-334)
- infrastructure_observation: 543 → 180 LOC (-363)
- performance_observation: 470 → 140 LOC (-330)
- data_observation: 388 → 120 LOC (-268)
- **TOTAL: 2,449 → 1,140 LOC** (-1,309 LOC, 53% reduction)

**Effort:** 6-8 hours (extract base, migrate 5 critics, test)

---

**R2: Extract DocumentReviewerCritic Base Class**

**Problem:** 3 critics with 50% duplicate structure (1,882 LOC)

**Refactor plan:**
```typescript
// NEW FILE: src/critics/base_document_reviewer.ts (~300 LOC)
export abstract class DocumentReviewerCritic extends Critic {
  protected abstract analyzeDocument(content: string): DocumentAnalysis;
  protected abstract getDocumentName(): string; // "design.md", "strategy.md", etc.

  // Shared implementations
  protected async loadDocument(taskId: string): Promise<string> { /* ... */ }
  protected validateLineCount(content: string, min: number): boolean { /* ... */ }
  protected loadAgentTrackRecord(agent: string): Promise<TrackRecord> { /* ... */ }
  protected applyAdaptiveThreshold(concerns, trackRecord): Concern[] { /* ... */ }
  protected logReview(verdict, concerns, strengths): Promise<void> { /* ... */ }

  async reviewDocument(taskId: string, context: Context): Promise<CriticResult> {
    const content = await this.loadDocument(taskId);
    if (!this.validateLineCount(content, 30)) return this.fail("Too short");

    const analysis = await this.analyzeDocument(content);
    const trackRecord = await this.loadAgentTrackRecord(context.agent);
    const adjusted = this.applyAdaptiveThreshold(analysis.concerns, trackRecord);

    const verdict = this.determineVerdict(adjusted);
    await this.logReview(verdict, adjusted, analysis.strengths);

    return verdict === "APPROVED" ? this.pass() : this.fail();
  }
}

// REFACTORED: design_reviewer.ts (~200 LOC, down from 578)
export class DesignReviewerCritic extends DocumentReviewerCritic {
  protected getDocumentName(): string { return "design.md"; }

  protected analyzeDocument(content: string): DocumentAnalysis {
    // Only design-specific analysis (AFP/SCAS checks)
    const concerns: Concern[] = [];

    if (!content.includes("Via Negativa")) {
      concerns.push({ severity: "high", category: "via_negativa_missing", ... });
    }

    if (!content.includes("Refactor")) {
      concerns.push({ severity: "high", category: "refactor_missing", ... });
    }

    // ... more AFP/SCAS patterns

    return { concerns, strengths: this.findStrengths(content) };
  }
}

// Repeat for strategy_reviewer, thinking_critic
```

**Savings:**
- design_reviewer: 578 → 200 LOC (-378)
- strategy_reviewer: 671 → 220 LOC (-451)
- thinking_critic: 633 → 210 LOC (-423)
- **TOTAL: 1,882 → 930 LOC** (-952 LOC, 51% reduction)

**Effort:** 4-6 hours (extract base, migrate 3 critics, test)

---

**R3: Split Critic God Class** (776 → 300 LOC)

**Problem:** base.ts has 10+ responsibilities

**Refactor plan:**
```typescript
// KEEP IN base.ts (~300 LOC):
export abstract class Critic {
  protected abstract command(context: CriticContext): string | null;

  async run(context: CriticContext): Promise<CriticResult> {
    // Core execution logic only
  }

  protected async pass(message: string): Promise<CriticResult> { /* ... */ }
  protected async fail(message: string): Promise<CriticResult> { /* ... */ }
}

// EXTRACT TO src/critics/escalation_manager.ts (~200 LOC):
export class EscalationManager {
  async handleEscalation(result: CriticResult, config: EscalationConfig) {
    // All escalation logic moved here
  }
}

// EXTRACT TO src/critics/delegation_coordinator.ts (~150 LOC):
export class DelegationCoordinator {
  async coordinateDelegates(result: CriticResult, delegates: string[]) {
    // All delegation logic moved here
  }
}

// EXTRACT TO src/critics/critic_persistence.ts (~100 LOC):
export class CriticPersistence {
  async persistResult(result: CriticResult) {
    // All save/load logic moved here
  }
}

// INJECT DEPENDENCIES (not import):
export abstract class Critic {
  constructor(
    protected workspaceRoot: string,
    protected escalationMgr?: EscalationManager,
    protected delegationCoord?: DelegationCoordinator,
    protected persistence?: CriticPersistence
  ) { }
}
```

**Benefits:**
- Testability: Each component testable in isolation
- Clarity: Single Responsibility Principle
- Reusability: Can use EscalationManager elsewhere

**Effort:** 4-6 hours (extract, wire dependencies, test)

**PHASE 2 TOTAL: REFACTOR 2,261 LOC → 600 LOC, saving 1,661 LOC in 1-2 days**

---

### Priority 3: Add Critical Tests (1-2 days)

**T1: Test Document Reviewers** (HIGHEST PRIORITY - GATE blockers)

```typescript
// NEW FILE: src/critics/__tests__/design_reviewer.test.ts
describe('DesignReviewerCritic', () => {
  it('should APPROVE when all AFP/SCAS sections present', async () => {
    const design = `
      # Via Negativa
      We can delete X, Y, Z...

      # Refactor vs Repair
      Root cause is...

      # Complexity Justification
      100 LOC justified because...

      # Alternatives Considered
      1. Option A: pros/cons
      2. Option B: pros/cons
    `;

    const critic = new DesignReviewerCritic(workspace);
    const result = await critic.reviewDesign(taskId, { document: design });

    expect(result.passed).toBe(true);
    expect(result.verdict).toBe('APPROVED');
  });

  it('should BLOCK when Via Negativa missing', async () => {
    const design = `
      # Some sections but no Via Negativa
    `;

    const result = await critic.reviewDesign(taskId, { document: design });

    expect(result.passed).toBe(false);
    expect(result.verdict).toBe('BLOCKED');
    expect(result.concerns).toContainEqual({
      severity: 'high',
      category: 'via_negativa_missing'
    });
  });

  // ... 10-15 more tests covering all concern types
});
```

**Effort per critic:** 2-3 hours (15-20 tests each)
**Total:** 6-9 hours for all 3 document reviewers

---

**T2: Test Observation Critics** (Process spawning = risky)

```typescript
// NEW FILE: src/critics/__tests__/api_observation.test.ts
describe('APIObservationCritic', () => {
  it('should detect slow endpoints (>500ms)', async () => {
    // Mock observe() to return slow traces
    const critic = new APIObservationCritic(workspace);
    jest.spyOn(critic as any, 'observe').mockResolvedValue([
      { endpoint: '/api/slow', duration_ms: 1200 }
    ]);

    const result = await critic.run(context);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual({
      severity: 'high',
      issue: expect.stringContaining('slow')
    });
  });

  it('should start and stop dev server', async () => {
    const startSpy = jest.spyOn(critic as any, 'startDevServer');
    const stopSpy = jest.spyOn(critic as any, 'stopDevServer');

    await critic.run(context);

    expect(startSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });

  // ... 10-15 more tests
});
```

**Effort per critic:** 3-4 hours (more complex mocking)
**Total:** 15-20 hours for all 5 observation critics

---

**T3: Integration Test Suite**

```typescript
// NEW FILE: src/critics/__tests__/integration.test.ts
describe('Critic System Integration', () => {
  it('should run all critics without errors', async () => {
    const results = await sessionContext.runCritics(
      Object.keys(CRITIC_REGISTRY),
      'low',
      'test-task-id'
    );

    expect(results).toHaveLength(46);
    results.forEach(r => {
      expect(r.code).toBeGreaterThanOrEqual(0);
      expect(r.critic).toBeTruthy();
    });
  });

  it('should escalate on critical failures', async () => {
    // Test escalation flow end-to-end
  });

  it('should persist results correctly', async () => {
    // Test persistence
  });
});
```

**Effort:** 2-3 hours

**PHASE 3 TOTAL: ADD 30+ tests, reach 70% coverage in 1-2 days**

---

## Alternatives Considered

### Alternative 1: Big Bang Rewrite

**Approach:** Redesign entire critic system from scratch

**Pros:**
- Clean slate, perfect architecture
- No legacy constraints

**Cons:**
- High risk (break everything)
- Weeks to months of work
- Cannot ship incrementally
- Users blocked during rewrite

**REJECTED:** Too risky, too slow

---

### Alternative 2: Do Nothing (Accept Technical Debt)

**Approach:** Live with 3.2/10 AFP/SCAS score

**Pros:**
- Zero effort
- No risk of breaking things

**Cons:**
- Build still broken
- 13% test coverage = bugs in production
- Duplication = maintenance burden
- Cannot extend (hardcoded registry)

**REJECTED:** Unacceptable for critical system

---

### Alternative 3: Incremental Refactor (SELECTED)

**Approach:** Via Negativa → Refactor → Test (5-7 days)

**Pros:**
- Ship value every day
- Low risk (one piece at a time)
- Can validate with users
- Rollback easy (git revert)

**Cons:**
- Takes 5-7 days (not instant)
- Some duplication remains during transition
- Need discipline (follow plan)

**SELECTED:** Best balance of risk/reward/speed

---

### Alternative 4: Partial Refactor (Observation Critics Only)

**Approach:** Only fix observation critic duplication

**Pros:**
- Biggest bang for buck (1,300 LOC savings)
- 1-2 days work
- Low risk

**Cons:**
- Build still broken
- Document reviewers still duplicated
- God class remains
- Only solves 1/6 problems

**REJECTED:** Leaves too many issues unresolved

---

## Files to Create/Edit/Delete

### DELETE (2-4 hours)

```
src/critics/modeling_reality.ts                           # DELETE
src/critics/__tests__/ml_task_aggregator*.test.ts       # DELETE (3 files)
src/critics/intelligence_engine.ts                        # SIMPLIFY (298 → 50 LOC)
src/critics/{build,tests,security,typecheck,...}.ts      # DELETE (8 files)
```

### CREATE (1-2 days)

```
src/critics/base_observation.ts                          # NEW (~400 LOC)
src/critics/base_document_reviewer.ts                    # NEW (~300 LOC)
src/critics/escalation_manager.ts                        # NEW (~200 LOC)
src/critics/delegation_coordinator.ts                    # NEW (~150 LOC)
src/critics/critic_persistence.ts                        # NEW (~100 LOC)
src/critics/shell_critic.ts                              # NEW (~50 LOC)
src/critics/__tests__/design_reviewer.test.ts           # NEW (~300 LOC)
src/critics/__tests__/strategy_reviewer.test.ts         # NEW (~300 LOC)
src/critics/__tests__/thinking_critic.test.ts           # NEW (~300 LOC)
src/critics/__tests__/api_observation.test.ts           # NEW (~400 LOC)
src/critics/__tests__/database_observation.test.ts      # NEW (~400 LOC)
src/critics/__tests__/infrastructure_observation.test.ts # NEW (~400 LOC)
src/critics/__tests__/performance_observation.test.ts   # NEW (~400 LOC)
src/critics/__tests__/data_observation.test.ts          # NEW (~400 LOC)
src/critics/__tests__/integration.test.ts               # NEW (~200 LOC)
```

### EDIT (1-2 days)

```
src/critics/base.ts                                      # REDUCE (776 → 300 LOC)
src/critics/api_observation.ts                           # REDUCE (564 → 150 LOC)
src/critics/database_observation.ts                      # REDUCE (484 → 150 LOC)
src/critics/infrastructure_observation.ts                # REDUCE (543 → 180 LOC)
src/critics/performance_observation.ts                   # REDUCE (470 → 140 LOC)
src/critics/data_observation.ts                          # REDUCE (388 → 120 LOC)
src/critics/design_reviewer.ts                           # REDUCE (578 → 200 LOC)
src/critics/strategy_reviewer.ts                         # REDUCE (671 → 220 LOC)
src/critics/thinking_critic.ts                           # REDUCE (633 → 210 LOC)
src/session.ts                                           # EDIT (update CRITIC_REGISTRY)
```

---

## Execution Timeline (5-7 Days)

### Day 1: Via Negativa (2-4 hours)
- ☐ Delete ModelingReality v1
- ☐ Delete 3 broken test files
- ☐ Simplify intelligence_engine (298 → 50 LOC)
- ☐ Replace trivial critics with ShellCritic + config
- ☐ **Verify build passes** ✅

**Deliverable:** BUILD PASSING, 480 LOC deleted

---

### Day 2-3: Refactor Observation Critics (8-12 hours)
- ☐ Create base_observation.ts
- ☐ Migrate api_observation.ts
- ☐ Migrate database_observation.ts
- ☐ Migrate infrastructure_observation.ts
- ☐ Migrate performance_observation.ts
- ☐ Migrate data_observation.ts
- ☐ **Verify all 5 critics still work**

**Deliverable:** 1,309 LOC saved, 5 critics refactored

---

### Day 3-4: Refactor Document Reviewers (6-8 hours)
- ☐ Create base_document_reviewer.ts
- ☐ Migrate design_reviewer.ts
- ☐ Migrate strategy_reviewer.ts
- ☐ Migrate thinking_critic.ts
- ☐ **Verify GATE process still works**

**Deliverable:** 952 LOC saved, 3 critics refactored

---

### Day 4-5: Split God Class (6-8 hours)
- ☐ Extract escalation_manager.ts
- ☐ Extract delegation_coordinator.ts
- ☐ Extract critic_persistence.ts
- ☐ Refactor base.ts (776 → 300 LOC)
- ☐ Wire dependencies
- ☐ **Verify all critics still work**

**Deliverable:** 476 LOC cleaned up, SRP restored

---

### Day 5-6: Add Document Reviewer Tests (6-9 hours)
- ☐ Test design_reviewer.ts (15-20 tests)
- ☐ Test strategy_reviewer.ts (15-20 tests)
- ☐ Test thinking_critic.ts (15-20 tests)
- ☐ **Coverage: 3/46 → 6/46 (13% → 15%)**

**Deliverable:** GATE process fully tested

---

### Day 6-7: Add Observation Critic Tests (15-20 hours)
- ☐ Test api_observation.ts
- ☐ Test database_observation.ts
- ☐ Test infrastructure_observation.ts
- ☐ Test performance_observation.ts
- ☐ Test data_observation.ts
- ☐ Integration tests
- ☐ **Coverage: 6/46 → 32/46 (15% → 70%)**

**Deliverable:** All high-risk code tested

---

## Success Criteria

### Must Have (Blockers)
- ✅ Build passes: `npm run build` → 0 errors
- ✅ Tests pass: `npm test` → 0 failures
- ✅ LOC reduction: 8,078 → <6,000 LOC (25%+)
- ✅ Test coverage: 13% → 70%
- ✅ GATE critics tested: 0% → 100%

### Should Have (Important)
- ✅ God class split: base.ts 776 → 300 LOC
- ✅ Observation critics consolidated (5 → 1 base + 5 impl)
- ✅ Document reviewers consolidated (3 → 1 base + 3 impl)
- ✅ AFP/SCAS score: 3.2/10 → 7-8/10

### Nice to Have (Future)
- Plugin system (not in this phase)
- Effectiveness metrics (not in this phase)
- Feature flags (not in this phase)

---

## Rollback Strategy

**If refactor breaks things:**

```bash
# Each day creates a commit with working state
git log --oneline
# a1b2c3d Day 7: Add observation critic tests
# d4e5f6g Day 6: Add document reviewer tests
# g7h8i9j Day 5: Split god class
# j1k2l3m Day 4: Refactor document reviewers
# m4n5o6p Day 3: Refactor observation critics
# p7q8r9s Day 1: Via negativa deletions

# Rollback to any day:
git revert a1b2c3d
# Or:
git reset --hard m4n5o6p
```

**Risk per phase:**
- Day 1 (deletions): LOW - just removing code
- Day 2-3 (observation refactor): MEDIUM - but testable
- Day 3-4 (document refactor): MEDIUM - but GATE critical
- Day 4-5 (god class split): HIGH - touches base class
- Day 5-7 (tests): LOW - just adding tests

---

## Conclusion

**Approach:** Incremental refactor via Via Negativa → Refactor → Test

**Time:** 5-7 days focused work (not weeks)

**Risk:** Managed through daily commits and rollback strategy

**Impact:** 31% LOC reduction, 70% test coverage, 3.2 → 8.0 AFP/SCAS score

**Next Phase:** THINK - Analyze edge cases and failure modes

---

## Micro-Batching Compliance

This plan follows AFP micro-batching:
- Each day ships working code
- Each commit is <500 LOC net change
- Each phase independently verifiable
- Rollback possible at any stage

**Maximum single change:** Day 2-3 observation refactor (~600 LOC net)
- Justifiable: Shared base class, cannot split further without losing coherence
- Mitigation: Test each critic migration immediately
