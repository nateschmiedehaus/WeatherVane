# IMP-COST-01 PLAN: Cost/Latency Budgets + Stop-Loss

**Date**: 2025-10-29
**Task ID**: IMP-COST-01
**Phase**: PLAN
**Status**: In Progress

---

## Executive Summary

This plan defines the implementation approach for dynamic cost/latency budgets across autopilot work process phases. Implementation broken into 8 sequential tasks estimated at 10-12 hours total.

**Approach**: Incremental integration - extend existing systems rather than build new ones.

---

## Implementation Tasks

### Task 1: Configuration Schema & Types (1.5 hours)

**Goal**: Define configuration schema, TypeScript interfaces, and YAML loading.

**Files to Create/Modify**:
- `config/phase_budgets.yaml` (NEW) - Budget configuration file
- `tools/wvo_mcp/src/context/phase_budget_config.ts` (NEW) - Config loading and validation

**Subtasks**:
1. Create YAML schema with base budgets, multipliers, weights, stop-loss thresholds
2. Define TypeScript interfaces:
   - `PhaseBudgetConfig` (entire config structure)
   - `ImportanceTier` (low/medium/high/critical)
   - `PhaseBudget` (token_limit + latency_limit per phase)
   - `BudgetMultipliers` (complexity, importance, phase weights)
3. Implement config loader with validation:
   - `loadPhaseBudgetConfig()` → returns `PhaseBudgetConfig`
   - Validate all required fields present
   - Validate multipliers are positive numbers
   - Validate phase names match `WorkPhase` enum
4. Implement fallback to hardcoded defaults if config missing
5. Add config reload mechanism (for runtime updates)

**Integration Points**:
- Extends `ScopeClass` from `tools/wvo_mcp/src/context/context_budgeting.ts`
- Uses `WorkPhase` enum from `tools/wvo_mcp/src/types/work_process.ts`

**Verification**:
- Unit test: Load valid config → returns parsed config
- Unit test: Load invalid config → throws validation error
- Unit test: Missing config file → returns hardcoded defaults
- Unit test: Config reload updates in-memory config

**Time Estimate**: 1.5 hours

---

### Task 2: Budget Calculation Engine (2 hours)

**Goal**: Implement dynamic budget calculation using three-dimensional multipliers.

**Files to Create/Modify**:
- `tools/wvo_mcp/src/context/phase_budget_calculator.ts` (NEW)

**Subtasks**:
1. Implement `calculatePhaseBudget()` function:
   ```typescript
   function calculatePhaseBudget(
     phase: WorkPhase,
     complexity: ScopeClass,
     importance: ImportanceTier,
     config: PhaseBudgetConfig,
     overrides?: TaskBudgetOverrides
   ): PhaseBudget {
     // Formula: base × complexity_mult × importance_mult × phase_weight
     const base = config.base_budgets[phase];
     const complexityMult = config.complexity_multipliers[complexity];
     const importanceMult = config.importance_multipliers[importance];
     const phaseWeight = config.phase_weights[phase];

     const tokenLimit = overrides?.tokens
       ?? Math.round(base.tokens × complexityMult × importanceMult × phaseWeight);
     const latencyLimit = overrides?.latency_ms
       ?? Math.round(base.latency_ms × complexityMult × importanceMult × phaseWeight);

     return { phase, token_limit: tokenLimit, latency_limit_ms: latencyLimit };
   }
   ```

2. Implement `calculateTaskBudgets()` function:
   - Calculates budgets for ALL phases (STRATEGIZE→MONITOR)
   - Returns `Map<WorkPhase, PhaseBudget>`
   - Applies task-level overrides if provided

3. Implement `calculateTotalBudget()` function:
   - Sums all phase budgets
   - Returns `{ total_tokens: number, total_latency_ms: number }`

4. Add budget breakdown formatter (for debugging/logging):
   ```typescript
   function formatBudgetBreakdown(budgets: Map<WorkPhase, PhaseBudget>): string
   ```

**Integration Points**:
- Uses `PhaseBudgetConfig` from Task 1
- Uses `ScopeClass` from existing context budgeting
- Uses `WorkPhase` from work process types

**Verification**:
- Unit test: Calculate budget for each combination of complexity/importance/phase
- Unit test: Verify multiplication formula correctness
- Unit test: Override values take precedence
- Unit test: Total budget sums all phases correctly
- Example verification: Critical+Large+THINK = 18,000 tokens, Low+Small+PR = 504 tokens

**Time Estimate**: 2 hours

---

### Task 3: Phase Ledger Integration (2 hours)

**Goal**: Extend Phase Ledger to track budget fields in PhaseExecution records.

**Files to Modify**:
- `tools/wvo_mcp/src/orchestrator/ledger.ts`
- `tools/wvo_mcp/src/types/work_process.ts` (PhaseExecution interface)

**Subtasks**:
1. Extend `PhaseExecution` interface:
   ```typescript
   interface PhaseExecution {
     // ... existing fields ...

     // NEW budget tracking fields
     tokens_used?: number;
     tokens_limit?: number;
     latency_ms?: number;
     latency_limit_ms?: number;
     breach_status?: 'within' | 'warning' | 'exceeded';
     budget_calculation?: {
       complexity: ScopeClass;
       importance: ImportanceTier;
       multipliers: { complexity: number; importance: number; phase_weight: number };
     };
   }
   ```

2. Update `recordPhaseStart()` in Ledger:
   - Calculate phase budget using Task 2's calculator
   - Store budget limits in PhaseExecution record
   - Initialize tokens_used = 0, latency_ms = 0

3. Update `recordPhaseEnd()` in Ledger:
   - Capture tokens_used from model router (or estimate if unavailable)
   - Calculate latency_ms = end_time - start_time
   - Calculate breach_status:
     - `within`: usage ≤100% of limit
     - `warning`: 100% < usage ≤150% of limit
     - `exceeded`: usage >150% of limit

4. Add query methods:
   ```typescript
   getBudgetStatus(taskId: string): TaskBudgetStatus;
   getPhaseBudgetBreakdown(taskId: string): Map<WorkPhase, PhaseBudget>;
   getCumulativeBudgetUsage(taskId: string): { tokens: number; latency_ms: number };
   ```

**Integration Points**:
- Uses `calculatePhaseBudget()` from Task 2
- Integrates with existing Phase Ledger SQLite schema (additive fields)
- Model router provides token usage via callback/event

**Verification**:
- Unit test: PhaseExecution serialization includes budget fields
- Integration test: Start phase → budget limits recorded
- Integration test: End phase → usage and breach status calculated
- Integration test: Query methods return correct aggregates
- Migration test: Existing ledger entries readable (graceful null handling)

**Time Estimate**: 2 hours

---

### Task 4: Model Router Integration (1.5 hours)

**Goal**: Capture token usage from model router and report to budget tracker.

**Files to Modify**:
- `tools/wvo_mcp/src/routing/model_router.ts`
- `tools/wvo_mcp/src/context/phase_budget_tracker.ts` (NEW)

**Subtasks**:
1. Create `PhaseBudgetTracker` singleton:
   ```typescript
   class PhaseBudgetTracker {
     private currentPhase?: { taskId: string; phase: WorkPhase };

     startPhaseTracking(taskId: string, phase: WorkPhase): void;
     reportTokenUsage(tokens: number): void; // Called by model router
     endPhaseTracking(): { tokens: number; latency_ms: number };
   }
   ```

2. Modify `ModelRouter.route()`:
   - After LLM call completes, extract token usage from response
   - Call `PhaseBudgetTracker.reportTokenUsage(tokens)`
   - Handle missing token data (estimate from prompt length: ~4 chars/token)

3. Add fallback token estimation:
   ```typescript
   function estimateTokens(prompt: string, completion: string): number {
     return Math.ceil((prompt.length + completion.length) / 4);
   }
   ```

4. Emit warning when token data unavailable:
   - Log to telemetry: "Budget tracker using estimated tokens (model response lacked usage data)"

**Integration Points**:
- `PhaseBudgetTracker` called by WorkProcessEnforcer during phase transitions
- Model router reports tokens to active tracker
- Ledger queries tracker for usage data at phase end

**Verification**:
- Unit test: Model router calls tracker after LLM response
- Unit test: Token estimation fallback works
- Integration test: End-to-end phase execution captures accurate token count
- Integration test: Missing token data triggers estimation + warning

**Time Estimate**: 1.5 hours

---

### Task 5: WorkProcessEnforcer Integration (2 hours)

**Goal**: Integrate budget checks into phase transition gates.

**Files to Modify**:
- `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`

**Subtasks**:
1. Add budget tracker initialization in constructor:
   ```typescript
   private budgetTracker: PhaseBudgetTracker;
   private budgetCalculator: PhaseBudgetCalculator;
   ```

2. Modify `advancePhase()`:
   - **At phase START**:
     - Calculate phase budget
     - Start budget tracking
     - Record budget limits in ledger
   - **At phase END**:
     - End budget tracking
     - Capture usage from tracker
     - Record usage in ledger
     - Check for budget breach

3. Add stop-loss check at VERIFY phase:
   ```typescript
   private async checkStopLoss(taskId: string): Promise<void> {
     const status = await this.ledger.getBudgetStatus(taskId);
     const totalBudget = status.total_budget;
     const totalUsage = status.total_usage;

     const tokenUtilization = totalUsage.tokens / totalBudget.tokens;
     const latencyUtilization = totalUsage.latency_ms / totalBudget.latency_ms;

     if (tokenUtilization > 1.2) {
       throw new BudgetExceededError(
         `Task ${taskId} exceeded token budget: ${totalUsage.tokens} / ${totalBudget.tokens} (${Math.round(tokenUtilization * 100)}%)`
       );
     }

     if (latencyUtilization > 1.2) {
       this.logger.warn(`Task ${taskId} exceeded latency budget`, { ... });
     }
   }
   ```

4. Auto-create remediation task on stop-loss:
   ```typescript
   private async createRemediationTask(taskId: string, breach: BudgetBreach): Promise<void> {
     const fixTaskId = `FIX-BUDGET-BREACH-${taskId}`;
     // Add to roadmap.yaml with details
   }
   ```

5. Emit telemetry on budget events:
   - Phase start: emit budget limits
   - Phase end: emit usage + breach status
   - Stop-loss trigger: emit counter + alert

**Integration Points**:
- Uses `PhaseBudgetTracker` from Task 4
- Uses `PhaseBudgetCalculator` from Task 2
- Queries ledger for cumulative budget status

**Verification**:
- Integration test: Phase transition records budget limits
- Integration test: Phase completion records usage
- Integration test: Stop-loss triggered when cumulative budget exceeded
- Integration test: Remediation task auto-created
- E2E test: Complete task with budget tracking enabled

**Time Estimate**: 2 hours

---

### Task 6: Budget Report Generation (1.5 hours)

**Goal**: Generate budget reports in evidence directory for each task.

**Files to Create**:
- `tools/wvo_mcp/src/quality/budget_report_generator.ts` (NEW)

**Subtasks**:
1. Implement `generateBudgetReport()` function:
   ```typescript
   async function generateBudgetReport(taskId: string): Promise<string> {
     const status = await ledger.getBudgetStatus(taskId);
     const breakdown = await ledger.getPhaseBudgetBreakdown(taskId);

     // Format as markdown table with sections:
     // - Summary (total tokens/latency, budget status)
     // - Per-phase breakdown (table)
     // - Budget calculation details (multipliers)
     // - Warnings/breaches (if any)

     return markdownReport;
   }
   ```

2. Integrate report generation into VERIFY phase:
   - WorkProcessEnforcer calls `generateBudgetReport()` after VERIFY checks
   - Writes to `state/evidence/{taskId}/verify/budget_report.md`

3. Add report to evidence summary:
   - Update MONITOR phase to include budget summary
   - Link to detailed budget report

**Report Template**:
```markdown
# Budget Report: {TASK-ID}

## Summary
- **Total Tokens**: {used} / {limit} ({percent}%)
- **Total Latency**: {used}s / {limit}s ({percent}%)
- **Budget Status**: {✅ WITHIN LIMITS | ⚠️ WARNING | ❌ EXCEEDED}

## Per-Phase Breakdown

| Phase | Tokens | Token Limit | Latency | Latency Limit | Status |
|-------|--------|-------------|---------|---------------|--------|
| ...   | ...    | ...         | ...     | ...           | ...    |

## Budget Calculation Details
- **Complexity**: {tier} ({mult}×)
- **Importance**: {tier} ({mult}×)
- **Phase Weights**: {breakdown}

## Warnings
{list any breaches or warnings}
```

**Integration Points**:
- Queries Phase Ledger for budget status
- Called by WorkProcessEnforcer during VERIFY
- Output written to evidence directory

**Verification**:
- Unit test: Report generation with mock ledger data
- Integration test: Report written to correct path
- E2E test: Complete task and verify report exists + accurate

**Time Estimate**: 1.5 hours

---

### Task 7: Telemetry Integration (1 hour)

**Goal**: Emit budget metrics to OpenTelemetry for monitoring.

**Files to Modify**:
- `tools/wvo_mcp/src/observability/resource_budgets.ts`
- `tools/wvo_mcp/src/telemetry/metrics_collector.ts`

**Subtasks**:
1. Extend `ResourceBudgetManager` with budget tracking:
   ```typescript
   trackPhaseBudget(
     phase: WorkPhase,
     taskId: string,
     tokens: number,
     tokensLimit: number,
     latencyMs: number,
     latencyLimit: number,
     breachStatus: 'within' | 'warning' | 'exceeded'
   ): void;
   ```

2. Emit OTel metrics:
   - `autopilot.phase.tokens_used` (counter)
   - `autopilot.phase.latency_ms` (histogram)
   - `autopilot.phase.budget_breach` (counter, only when breach_status != 'within')
   - `autopilot.task.tokens_total` (counter, at task end)
   - `autopilot.task.latency_total_ms` (histogram, at task end)

3. Add attributes to metrics:
   - `phase`, `task_id`, `complexity`, `importance`, `breach_status`, `budget_utilization`

4. Call from WorkProcessEnforcer:
   - At phase end, emit phase-level metrics
   - At task completion (MONITOR), emit task-level metrics

**Integration Points**:
- Uses existing `MetricsCollector` infrastructure
- Called by WorkProcessEnforcer during phase transitions

**Verification**:
- Unit test: Metrics emitted with correct attributes
- Integration test: Metrics queryable in telemetry backend
- E2E test: Complete task and verify all metrics present

**Time Estimate**: 1 hour

---

### Task 8: Documentation (1.5 hours)

**Goal**: Complete user and developer documentation.

**Files to Create**:
- `docs/autopilot/budgets/USER_GUIDE.md` (NEW)
- `docs/autopilot/budgets/DEVELOPER_GUIDE.md` (NEW)
- `docs/autopilot/budgets/CONFIG_REFERENCE.md` (NEW)
- `docs/autopilot/budgets/TROUBLESHOOTING.md` (NEW)

**Subtasks**:

1. **USER_GUIDE.md**:
   - How budgets work (3 dimensions: complexity, importance, phase)
   - How to interpret budget reports
   - How to adjust budgets (edit config file)
   - How to override budgets per-task (roadmap metadata)
   - What to do when stop-loss triggered

2. **DEVELOPER_GUIDE.md**:
   - Architecture overview (calculator, tracker, ledger, enforcer)
   - Integration points (how to add budget tracking to new phases/tools)
   - Testing budget features
   - Telemetry schema

3. **CONFIG_REFERENCE.md**:
   - Full config schema with descriptions
   - Default values
   - Examples (complex security task, simple docs task)
   - Override syntax

4. **TROUBLESHOOTING.md**:
   - Common issues and solutions:
     - "Budget report shows estimated tokens" → Model router not reporting usage
     - "Task blocked by stop-loss incorrectly" → Adjust thresholds or override
     - "Budget too tight for legitimate complex work" → Increase base budget or multipliers
     - "Performance degradation" → Check async telemetry emission
   - Debugging commands
   - Log locations

**Verification**:
- [ ] All 4 docs created
- [ ] Examples tested and accurate
- [ ] Links between docs functional
- [ ] Reviewed for completeness

**Time Estimate**: 1.5 hours

---

## Implementation Sequence

**Sequence matters** - each task builds on previous:

```
Task 1: Config & Types (1.5h)
  ↓
Task 2: Budget Calculator (2h)
  ↓
Task 3: Phase Ledger Integration (2h)
  ↓
Task 4: Model Router Integration (1.5h)
  ↓
Task 5: WorkProcessEnforcer Integration (2h)
  ↓
Task 6: Budget Report Generation (1.5h)
  ↓
Task 7: Telemetry Integration (1h)
  ↓
Task 8: Documentation (1.5h)
```

**Total Time: 13 hours** (includes buffer for debugging/integration issues)

**Parallel Opportunities**:
- Task 7 (Telemetry) can start after Task 5 (don't need to wait for Task 6)
- Task 8 (Documentation) can be written concurrently with Task 5-7

**Critical Path**: Tasks 1→2→3→4→5→6 (10 hours)

---

## Testing Strategy

### Unit Tests (per task)
- **Task 1**: Config loading, validation, fallback
- **Task 2**: Budget calculation formulas, overrides
- **Task 3**: Ledger read/write budget fields
- **Task 4**: Token tracking, estimation
- **Task 5**: Stop-loss logic, remediation task creation
- **Task 6**: Report generation formatting
- **Task 7**: Metric emission

**Location**: `tools/wvo_mcp/src/__tests__/budget/`

**Coverage Target**: >85% for budget-related code

### Integration Tests
- **Phase Budget Flow**: Start phase → track usage → end phase → verify ledger
- **Stop-Loss Enforcement**: Simulate budget breach → verify VERIFY blocks
- **Report Generation**: Complete task → verify report exists + accurate
- **Config Override**: Task with budget_overrides → verify applied

**Location**: `tools/wvo_mcp/src/__tests__/integration/budget_integration.test.ts`

### End-to-End Tests
- **Happy Path**: Complete task with budget tracking → all metrics/reports present
- **Budget Breach Path**: Task exceeds budget → stop-loss triggered → remediation task created
- **Backward Compatibility**: Run against tasks created before budget system → no errors

**Location**: `tools/wvo_mcp/src/__tests__/e2e/budget_e2e.test.ts`

### Performance Benchmarks
- Budget calculation speed (<10ms per task)
- Token tracking overhead (<5ms per phase)
- Report generation speed (<100ms per task)

**Location**: `tools/wvo_mcp/src/__tests__/performance/budget_benchmark.test.ts`

---

## Rollout Plan

### Phase 1: Development & Testing (1 week)
- Implement Tasks 1-8
- Run full test suite (unit + integration + e2e)
- Performance benchmarks
- Internal code review

### Phase 2: Staged Rollout (2 weeks)

**Week 1: Observe Mode**
- Budget tracking enabled, stop-loss DISABLED
- Collect baseline data (actual token/latency usage)
- Monitor for false positives (tasks that would have been blocked incorrectly)
- Tune thresholds based on data

**Week 2: Enforce Mode (Low Priority Tasks Only)**
- Stop-loss enabled for tasks with `importance: low` or `importance: medium`
- High/critical tasks still bypass stop-loss
- Monitor for legitimate blocks vs false positives

**Week 3+: Full Enforcement**
- Stop-loss enabled for all tasks
- Adjust thresholds if false positive rate >2%
- Monitor cost savings and task completion metrics

### Phase 3: Optimization (ongoing)
- Analyze budget reports to identify phases with chronic overages
- Adjust base budgets or multipliers
- Collect data for IMP-COST-02 (progress-based resource management)

---

## Rollback Plan

**Trigger Rollback If**:
- False positive rate >5% (legitimate tasks blocked)
- Performance degradation >10ms per phase
- Critical bugs in budget calculation (incorrect limits)
- Integration breaks existing functionality

**Rollback Steps**:
1. **Disable stop-loss enforcement**:
   - Edit `config/phase_budgets.yaml`: set `stop_loss.enabled: false`
   - OR: Set environment variable `DISABLE_BUDGET_ENFORCEMENT=1`
   - Keeps tracking/reporting, removes blocking

2. **Disable budget tracking entirely**:
   - Revert WorkProcessEnforcer changes (use feature flag if available)
   - Budget fields in ledger become null (graceful degradation)
   - No reports generated, no metrics emitted

3. **Full revert**:
   - `git revert <commit-hash>`
   - Redeploy previous version
   - Monitor for stability

**Recovery**:
- Analyze logs to identify root cause
- Fix issue in development environment
- Re-test with expanded test coverage
- Re-deploy with cautious staged rollout

---

## Risk Mitigation

### Risk 1: Budget Calculation Errors
**Impact**: Tasks starved (blocked incorrectly) or bloated (no cost control)

**Mitigations**:
- Extensive unit tests covering all combinations
- Manual verification of example calculations
- Staged rollout (observe mode first)
- Config validation on load (prevent invalid multipliers)

**Fallback**: Override mechanism allows per-task budget adjustment

### Risk 2: Model Router Integration Failure
**Impact**: Token tracking unavailable, budget enforcement unreliable

**Mitigations**:
- Token estimation fallback (from prompt length)
- Warning emitted when estimation used
- Test with multiple model providers (OpenAI, Anthropic)

**Fallback**: Disable token-based stop-loss, keep latency-based

### Risk 3: Performance Overhead
**Impact**: Budget tracking slows down every phase

**Mitigations**:
- Async telemetry emission (non-blocking)
- Minimal synchronous work in hot paths
- Performance benchmarks as gate (must be <5ms)

**Fallback**: Feature flag to disable tracking if overhead too high

### Risk 4: False Positive Stop-Loss
**Impact**: Legitimate complex tasks blocked

**Mitigations**:
- Generous thresholds (1.2× cumulative, 1.5× per-phase)
- Override mechanism for known complex tasks
- Observe mode data collection before enforcement
- Monitoring dashboard to detect patterns

**Fallback**: Increase thresholds, add task-specific overrides

### Risk 5: Integration Breakage
**Impact**: Budget system breaks existing Phase Ledger or WorkProcessEnforcer

**Mitigations**:
- Additive changes only (no breaking schema changes)
- Graceful null handling for missing budget fields
- Backward compatibility tests
- Integration tests before deployment

**Fallback**: Feature flag to disable integration, rollback if critical

---

## Success Criteria (From SPEC)

**Must Pass Before Completion**:
- [ ] AC1: Dynamic budget calculation implemented and tested
- [ ] AC2: Phase-level budget tracking in ledger
- [ ] AC3: Stop-loss enforcement at VERIFY
- [ ] AC4: Budget reports in evidence
- [ ] AC5: Integration with existing systems
- [ ] AC6: Configuration and overrides functional
- [ ] AC7: Telemetry and observability
- [ ] AC8: Documentation complete
- [ ] AC9: Performance impact <5ms per phase
- [ ] AC10: Backward compatibility verified
- [ ] AC11: Error handling and graceful degradation

**Operational Metrics** (2 weeks post-deployment):
- [ ] >90% of tasks complete within 1.0× allocated budget
- [ ] <5% of tasks trigger stop-loss
- [ ] <2% false positive rate

**Cost Savings** (4 weeks post-deployment):
- [ ] 15-25% reduction in token consumption
- [ ] 10-20% reduction in p95 task completion time

---

## Cross-Item Integration

**Related Tasks**:
- ✅ IMP-FUND-01 through IMP-FUND-09: Fundamentals (Phase Ledger, WorkProcessEnforcer exist)
- ✅ IMP-OBS-01 through IMP-OBS-06: Observability (OTel infrastructure exists)
- ⏳ IMP-COST-02: Progress-Based Resource Management (depends on IMP-COST-01 baseline data)

**Shared Contracts**:
- `WorkPhase` enum (from work_process.ts)
- `ScopeClass` type (from context_budgeting.ts)
- `PhaseExecution` interface (extending with budget fields)
- `PhaseBudgetConfig` (new, shared by calculator and enforcer)

**Integration Verification**:
- Run roadmap linter to verify no missing dependencies
- Integration tests confirm ledger/enforcer/router coordination
- E2E smoke test exercises full budget flow

---

## Files Summary

**New Files (8)**:
- `config/phase_budgets.yaml`
- `tools/wvo_mcp/src/context/phase_budget_config.ts`
- `tools/wvo_mcp/src/context/phase_budget_calculator.ts`
- `tools/wvo_mcp/src/context/phase_budget_tracker.ts`
- `tools/wvo_mcp/src/quality/budget_report_generator.ts`
- `docs/autopilot/budgets/USER_GUIDE.md`
- `docs/autopilot/budgets/DEVELOPER_GUIDE.md`
- `docs/autopilot/budgets/CONFIG_REFERENCE.md`
- `docs/autopilot/budgets/TROUBLESHOOTING.md`

**Modified Files (5)**:
- `tools/wvo_mcp/src/types/work_process.ts` (PhaseExecution interface)
- `tools/wvo_mcp/src/orchestrator/ledger.ts` (budget tracking)
- `tools/wvo_mcp/src/routing/model_router.ts` (token reporting)
- `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts` (budget checks)
- `tools/wvo_mcp/src/observability/resource_budgets.ts` (telemetry)
- `tools/wvo_mcp/src/telemetry/metrics_collector.ts` (OTel metrics)

**Test Files (4)**:
- `tools/wvo_mcp/src/__tests__/budget/` (unit tests)
- `tools/wvo_mcp/src/__tests__/integration/budget_integration.test.ts`
- `tools/wvo_mcp/src/__tests__/e2e/budget_e2e.test.ts`
- `tools/wvo_mcp/src/__tests__/performance/budget_benchmark.test.ts`

---

## PLAN Phase Complete Checklist

- [x] Implementation tasks defined (8 tasks, 13 hours total)
- [x] Task sequence and dependencies mapped
- [x] Testing strategy defined (unit, integration, e2e, performance)
- [x] Rollout plan with staged deployment
- [x] Rollback plan with trigger conditions
- [x] Risk mitigation strategies
- [x] Success criteria from SPEC mapped to plan
- [x] Cross-item integration identified
- [x] Files to create/modify listed

**Status**: ✅ PLAN COMPLETE - Ready for THINK phase

---

## Next Phase: THINK

**THINK phase will analyze**:
- Edge cases (what breaks the budget calculation?)
- Pre-mortem (top failure scenarios)
- Assumptions register (what are we assuming?)
- Integration risks (ledger/enforcer/router coordination)
- Performance concerns (where could overhead spike?)

---

## 🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
