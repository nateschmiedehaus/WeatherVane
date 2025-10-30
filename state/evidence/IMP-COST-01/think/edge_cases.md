# IMP-COST-01 THINK: Edge Cases

**Date**: 2025-10-29
**Task ID**: IMP-COST-01
**Phase**: THINK - Edge Cases
**Status**: In Progress

---

## Purpose

Identify edge cases that could break budget calculation, tracking, or enforcement. For each edge case, define expected behavior and mitigation.

---

## Budget Calculation Edge Cases

### EC1: Zero or Negative Multipliers

**Scenario**: Config file contains invalid multipliers:
```yaml
importance_multipliers:
  critical: 0     # Zero!
  high: -0.5      # Negative!
```

**Impact**: Budget calculation produces 0 or negative limits → tasks can't execute

**Expected Behavior**:
- Config validation REJECTS zero or negative multipliers at load time
- Throws `InvalidConfigError` with clear message
- Falls back to hardcoded defaults
- Emits warning to telemetry

**Mitigation**:
- Validation function: `assert(mult > 0, "Multipliers must be positive")`
- Unit test: Load config with zero/negative multipliers → expect error

---

### EC2: Missing Phase in Config

**Scenario**: Config file omits a phase (e.g., MONITOR not defined in `base_budgets`)

**Impact**: Budget calculation fails when trying to look up missing phase

**Expected Behavior**:
- Config validation checks ALL phases from `WorkPhase` enum are present
- If missing, throws `InvalidConfigError: "Missing base budget for phase: MONITOR"`
- Falls back to hardcoded defaults
- Emits warning

**Mitigation**:
- Validation: `for (const phase of WorkPhases) { assert(config.base_budgets[phase]) }`
- Unit test: Config with missing phase → expect error

---

### EC3: Extremely Large Multipliers

**Scenario**: Config contains multipliers that produce absurdly large budgets:
```yaml
importance_multipliers:
  critical: 100.0    # 100× multiplier!
```

**Result**: Critical+Large+THINK = 4000 × 1.5 × 100 × 1.5 = 900,000 tokens

**Impact**: Single phase could consume entire daily budget

**Expected Behavior**:
- Config validation enforces maximum multipliers (e.g., 10.0)
- Throws `InvalidConfigError` if multiplier > 10.0
- Allows overrides to exceed max (for exceptional cases)

**Mitigation**:
- Validation: `assert(mult <= 10.0, "Multiplier exceeds maximum")`
- Unit test: Config with mult > 10 → expect error
- Document max limits in CONFIG_REFERENCE.md

---

### EC4: Task Override Conflicts

**Scenario**: Task has conflicting overrides in roadmap:
```yaml
- id: TASK-123
  complexity_score: 5  # Medium
  importance: critical
  budget_overrides:
    think:
      tokens: 500  # Override
```

**Question**: Does the 500 token override apply as-is, or do we apply multipliers on top?

**Decision**: Overrides are **absolute** values, NOT subject to further multiplication

**Rationale**: Override is an escape hatch for exceptional cases - applying multipliers defeats the purpose

**Expected Behavior**:
- `calculatePhaseBudget()` checks for override FIRST, returns immediately if present
- No multipliers applied to override values
- Log warning if override < calculated budget (potential underallocation)

**Mitigation**:
- Code: `if (overrides?.tokens) return overrides.tokens; // Skip calculation`
- Unit test: Override overrides calculated budget
- Doc: CONFIG_REFERENCE.md explains override behavior

---

### EC5: Fractional Tokens

**Scenario**: Budget calculation produces fractional tokens:
```
4000 × 0.8 × 0.7 × 1.5 = 3,360.0 (exact)
4000 × 0.5 × 1.5 × 0.6 = 1,800.0 (exact)
4000 × 0.8 × 1.5 × 1.2 = 5,760.0 (exact)
```

But what about: `4000 × 0.5 × 0.7 × 1.2 = 1,680.0` (exact)
or: `3000 × 0.5 × 0.7 × 1.5 = 1,575.0` (exact)

**Impact**: Token counts must be integers, but multipliers can produce fractions

**Expected Behavior**:
- Always round UP to nearest integer (ceil)
- Rationale: Rounding down could starve tasks, rounding up is safer

**Implementation**:
```typescript
const tokenLimit = Math.ceil(base.tokens × complexityMult × importanceMult × phaseWeight);
```

**Mitigation**:
- Unit test: Fractional calculation rounds up correctly
- Document rounding behavior in CONFIG_REFERENCE.md

---

## Budget Tracking Edge Cases

### EC6: Token Usage Exceeds Limit Mid-Phase

**Scenario**: THINK phase allocated 4,000 tokens, but model response contains 5,000 tokens

**Question**: Do we:
1. Truncate usage to limit (report 4,000)
2. Report actual usage (5,000), mark breach
3. Stop mid-phase when limit reached

**Decision**: Report actual usage, mark breach, allow phase to complete

**Rationale**:
- Option 1 (truncate) hides real cost → bad for budgeting
- Option 3 (stop mid-phase) could corrupt work → too risky for MVP
- Option 2 (report + breach) provides visibility without breaking workflow

**Expected Behavior**:
- `recordPhaseEnd()` records actual tokens_used (even if > limit)
- Calculates breach_status based on actual vs limit
- Stop-loss check at VERIFY phase decides whether to block task

**Mitigation**:
- Code: No artificial capping in `recordPhaseEnd()`
- Unit test: Usage exceeds limit → breach_status = 'exceeded'

---

### EC7: Model Router Doesn't Report Token Usage

**Scenario**: LLM response lacks `usage` field (API failure, unsupported provider, etc.)

**Impact**: Can't track actual token consumption → budget enforcement unreliable

**Expected Behavior**:
1. Fall back to token estimation: `(prompt.length + completion.length) / 4`
2. Mark usage as `estimated: true` in PhaseExecution record
3. Emit warning to telemetry: "Using estimated tokens for phase {phase} task {task_id}"
4. Still enforce stop-loss based on estimates (better than nothing)

**Mitigation**:
- Code: `tokens = response.usage?.total_tokens ?? estimateTokens(prompt, completion)`
- Flag: `PhaseExecution.tokens_estimated: boolean`
- Unit test: Missing usage data → triggers estimation + warning

---

### EC8: Clock Skew / Time Travel

**Scenario**: Phase end timestamp < phase start timestamp (clock adjustment, timezone issue, etc.)

**Impact**: Calculated latency_ms is negative or absurdly large

**Expected Behavior**:
- Detect impossible latencies: `if (latency_ms < 0 || latency_ms > 24 * 3600 * 1000)`
- Log error: "Invalid latency calculation for phase {phase} task {task_id}"
- Set latency_ms = 0 (don't enforce latency limit for this phase)
- Emit telemetry alert

**Mitigation**:
- Code: Sanity check latency calculation
  ```typescript
  let latency_ms = end_time - start_time;
  if (latency_ms < 0 || latency_ms > 86400000) {
    logger.error("Invalid latency calculation", { ... });
    latency_ms = 0;
  }
  ```
- Unit test: End time < start time → latency set to 0, error logged

---

### EC9: Phase Executed Multiple Times (Backtracking)

**Scenario**: Task enters IMPLEMENT, then backtracks to PLAN, then re-enters IMPLEMENT

**Question**: How do we track budgets?
1. Each execution gets separate budget?
2. Cumulative budget across all executions?
3. Only count final execution?

**Decision**: Cumulative budget across ALL executions (including backtracks)

**Rationale**:
- Real cost is sum of all LLM calls (including "wasted" backtracked work)
- Stop-loss should prevent excessive rework
- Separate budgets per execution would hide true cost

**Expected Behavior**:
- Phase Ledger creates new `PhaseExecution` record for each entry (including re-entries)
- `getCumulativeBudgetUsage()` sums ALL executions for task_id
- Stop-loss check at VERIFY uses cumulative total

**Mitigation**:
- Phase Ledger schema: `(task_id, phase, execution_number)` unique key
- Query: `SUM(tokens_used) GROUP BY task_id`
- Unit test: Backtrack → re-execute → cumulative usage increases

---

### EC10: Concurrent Phase Execution (Should Never Happen)

**Scenario**: Bug in WorkProcessEnforcer allows THINK and IMPLEMENT to run concurrently

**Impact**: Budget tracker gets confused (which phase is active?), usage attributed incorrectly

**Expected Behavior**:
- Phase Ledger's lease mechanism PREVENTS concurrent execution (existing safeguard)
- If concurrent execution detected, emit CRITICAL alert
- Budget tracker throws error: "Cannot start phase {phase} - another phase active"

**Mitigation**:
- Code: PhaseBudgetTracker checks `this.currentPhase != null` before starting new phase
- Unit test: Attempt concurrent start → expect error
- Integration test: Lease mechanism prevents concurrent phases

---

## Stop-Loss Edge Cases

### EC11: Stop-Loss Triggered at VERIFY, But Task Almost Complete

**Scenario**: Task completes IMPLEMENT, enters VERIFY, stop-loss triggers due to 125% budget usage. Only PR and MONITOR phases remain (minimal cost).

**Question**: Should we:
1. Block task (strict enforcement)
2. Allow completion (phases after VERIFY are cheap)
3. Require manual override to continue

**Decision**: Block task, require remediation (strict enforcement)

**Rationale**:
- Budget breach indicates something went wrong (task complexity misjudged, runaway THINK, etc.)
- Allowing completion sets bad precedent ("budgets are suggestions")
- Remediation task can investigate root cause

**Exception**: If cumulative usage <110% AND only PR+MONITOR remain, allow completion with warning

**Expected Behavior**:
- Stop-loss check calculates "remaining budget" (total - used)
- Estimates cost of remaining phases (PR + MONITOR)
- If remaining_budget >= estimated_cost: allow continuation with warning
- Else: block task

**Mitigation**:
- Code: Heuristic for "almost done" check
  ```typescript
  const remainingPhases = ['PR', 'MONITOR'];
  const estimatedRemaining = remainingPhases.reduce((sum, p) => sum + budgets[p].tokens, 0);
  if (totalUsage < totalBudget * 1.1 && estimatedRemaining < remainingBudget) {
    logger.warn("Task near budget limit but allowing completion");
    return; // Allow
  }
  throw new BudgetExceededError(...);
  ```
- Config: `stop_loss.allow_completion_threshold: 1.1` (110%)

---

### EC12: Stop-Loss Triggered, Remediation Task Creation Fails

**Scenario**: Stop-loss triggers, tries to create `FIX-BUDGET-BREACH-TASK-123`, but roadmap file locked or write fails

**Impact**: Task blocked BUT no remediation task created → manual intervention required, no tracking

**Expected Behavior**:
- Attempt remediation task creation
- If fails, log critical error with task details
- Emit alert: "Budget stop-loss triggered for {task_id}, remediation task creation failed"
- Still block task (don't fail-open on remediation failure)

**Mitigation**:
- Code: Wrap remediation creation in try/catch
  ```typescript
  try {
    await createRemediationTask(taskId, breach);
  } catch (err) {
    logger.critical("Remediation task creation failed", { taskId, breach, err });
    // Still throw BudgetExceededError to block task
  }
  throw new BudgetExceededError(...);
  ```
- Manual monitoring: Alert on "remediation task creation failed" events

---

### EC13: False Positive Stop-Loss Due to Config Change

**Scenario**: Task starts with base budget 10,000 tokens, uses 9,500 tokens (95%). Admin updates config, reduces base to 8,000 tokens. Stop-loss check runs with NEW config, sees 9,500 / 8,000 = 119% → triggers.

**Impact**: Task blocked due to retroactive config change, not actual overage

**Expected Behavior**:
- Budget limits calculated AT TASK START are immutable for that task
- Stop-loss compares against ORIGINAL limits, not current config
- Config changes only affect NEW tasks

**Mitigation**:
- Code: Store calculated budget limits in PhaseExecution records at task start
- Stop-loss query uses stored limits: `SELECT tokens_limit FROM phase_ledger WHERE task_id = ?`
- Config reload doesn't affect in-flight tasks
- Unit test: Config change mid-task → stop-loss uses original limits

---

## Report Generation Edge Cases

### EC14: Task Incomplete, Budget Report Requested

**Scenario**: User requests budget report for task still in PLAN phase (IMPLEMENT not started yet)

**Impact**: Incomplete data (no usage for unexecuted phases)

**Expected Behavior**:
- Report shows executed phases with actual usage
- Shows planned phases with limits but no usage (marked "Not Started")
- Clearly indicates task incomplete: "⚠️ Report generated mid-task (current phase: PLAN)"

**Mitigation**:
- Code: Check task status before generating report
- If incomplete, add warning section
- Unit test: Report for incomplete task shows warning

---

### EC15: Phase Ledger Corrupted / Missing Data

**Scenario**: Database corruption, manual editing, or bug causes Phase Ledger to have missing PhaseExecution records

**Impact**: Budget report can't retrieve data, report generation fails

**Expected Behavior**:
- Graceful degradation: report shows "Data unavailable" for missing phases
- Emits warning: "Phase ledger incomplete for task {task_id}, report may be inaccurate"
- Does NOT block task completion (report is informational, not gate)

**Mitigation**:
- Code: Try/catch around ledger queries
  ```typescript
  let phaseData;
  try {
    phaseData = await ledger.getPhaseBudgetBreakdown(taskId);
  } catch (err) {
    logger.warn("Phase ledger query failed", { taskId, err });
    phaseData = new Map(); // Empty data
  }
  ```
- Report includes disclaimer if data incomplete

---

## Configuration Edge Cases

### EC16: Config File Changed Mid-Task

**Scenario**: Task starts with config v1, admin updates config to v2 mid-task, task continues

**Question**: Which config applies?

**Decision**: Task uses config snapshot from task start (immutable)

**Rationale**: Mid-task config changes could cause inconsistent budgets, confusing reports

**Expected Behavior**:
- `calculateTaskBudgets()` called at task start, results cached
- Config reload doesn't affect in-flight tasks
- New tasks pick up updated config

**Mitigation**:
- Code: Store config version/hash in PhaseExecution
  ```typescript
  interface PhaseExecution {
    config_hash: string;  // SHA256 of config at task start
  }
  ```
- Report includes config hash (for debugging)

---

### EC17: Task Override Syntax Errors

**Scenario**: Roadmap has invalid budget override:
```yaml
- id: TASK-123
  budget_overrides:
    think:
      tokens: "five thousand"  # String instead of number!
```

**Impact**: Budget calculation fails, task can't start

**Expected Behavior**:
- WorkProcessEnforcer validates overrides at task start
- If invalid, throws `InvalidTaskConfigError` with clear message
- Task marked as `blocked`, requires roadmap fix

**Mitigation**:
- Code: Validate override types
  ```typescript
  if (overrides?.tokens && typeof overrides.tokens !== 'number') {
    throw new InvalidTaskConfigError(`Invalid token override for ${taskId}`);
  }
  ```
- Schema validation (Zod/AJV) for roadmap entries

---

## Telemetry Edge Cases

### EC18: Telemetry Backend Unavailable

**Scenario**: OpenTelemetry collector down, metrics emission fails

**Impact**: Budget metrics not recorded, monitoring blind

**Expected Behavior**:
- Metric emission failures logged but don't block task execution
- Async emission with retry (exponential backoff)
- After 3 retries, drop metrics and emit warning
- Budget reports still generated (from Phase Ledger, not telemetry)

**Mitigation**:
- Code: Wrap metric emission in try/catch
  ```typescript
  try {
    metricsCollector.emitPhaseBudget(...);
  } catch (err) {
    logger.warn("Metric emission failed", { err });
    // Continue anyway
  }
  ```
- Telemetry is observability, not enforcement → fail gracefully

---

### EC19: Metric Cardinality Explosion

**Scenario**: Budget metrics have attributes `task_id`, `phase`, `complexity`, `importance`, `breach_status` → if 10,000 tasks × 9 phases × 4 complexity × 4 importance = 1.44M unique metric series

**Impact**: Telemetry backend overwhelmed, metrics dropped

**Expected Behavior**:
- Use high-cardinality attributes sparingly
- Aggregate metrics by phase/complexity/importance (drop task_id from metric labels)
- Store per-task details in Phase Ledger, not telemetry

**Mitigation**:
- Metric design: Use task_id in TRACES (spans), not METRICS (counters/histograms)
- Aggregate metrics: `autopilot.phase.tokens_used{phase="THINK", complexity="Medium"}`
- Per-task traces: `phase_execution` span with task_id attribute

---

## Performance Edge Cases

### EC20: Budget Calculation in Hot Path

**Scenario**: `calculatePhaseBudget()` called synchronously every time a phase starts → adds latency to phase transitions

**Impact**: If calculation takes 10ms, and phases transition frequently, could add 90ms per task (9 phases)

**Expected Behavior**:
- Calculate ALL phase budgets at task start (once)
- Cache in WorkProcessEnforcer: `this.taskBudgets = new Map()`
- Phase transition looks up cached budget (O(1))

**Mitigation**:
- Code: Lazy calculation
  ```typescript
  private async getTaskBudgets(taskId: string): Promise<Map<WorkPhase, PhaseBudget>> {
    if (!this.budgetCache.has(taskId)) {
      this.budgetCache.set(taskId, await calculateTaskBudgets(taskId, ...));
    }
    return this.budgetCache.get(taskId);
  }
  ```
- Benchmark: Verify <1ms lookup time

---

### EC21: Report Generation Blocks VERIFY Phase

**Scenario**: Report generation takes 500ms (large task with 100+ phases), blocks VERIFY completion

**Impact**: Task latency increases, user experience degrades

**Expected Behavior**:
- Report generation should be ASYNC (non-blocking)
- VERIFY phase continues immediately
- Report written in background
- If report fails, log error but don't block task

**Mitigation**:
- Code: Fire-and-forget report generation
  ```typescript
  // In VERIFY phase
  generateBudgetReport(taskId).catch(err => logger.error("Report generation failed", {err}));
  // Continue immediately, don't await
  ```
- Performance test: Verify VERIFY phase not blocked by report generation

---

## Integration Edge Cases

### EC22: WorkProcessEnforcer and Ledger Out of Sync

**Scenario**: WorkProcessEnforcer thinks task is in IMPLEMENT, but Ledger shows PLAN (due to crash/restart)

**Impact**: Budget tracking starts for wrong phase, usage attributed incorrectly

**Expected Behavior**:
- Phase transition verifies current phase with Ledger before starting budget tracking
- If mismatch, emit critical alert and resync
- Ledger is source of truth

**Mitigation**:
- Code: Verify phase before budget tracking
  ```typescript
  const currentPhase = await ledger.getCurrentPhase(taskId);
  if (currentPhase !== expectedPhase) {
    logger.critical("Phase mismatch", { taskId, expected: expectedPhase, actual: currentPhase });
    // Resync or fail
  }
  ```
- Integration test: Simulate crash → restart → verify resync

---

### EC23: Model Router Upgrade Changes Token Counting

**Scenario**: OpenAI updates API, changes how tokens counted (e.g., BPE encoding change)

**Impact**: Token counts suddenly increase/decrease, budgets no longer accurate

**Expected Behavior**:
- Detect significant (>20%) changes in token usage patterns
- Emit alert: "Token usage anomaly detected, possible model router change"
- Manual review and budget recalibration

**Mitigation**:
- Telemetry: Track token usage trends over time
- Alert rule: If p50 token usage changes >20% week-over-week → investigate
- Docs: TROUBLESHOOTING.md explains how to recalibrate budgets

---

## Edge Case Summary

| EC# | Edge Case | Impact | Mitigation |
|-----|-----------|--------|------------|
| EC1 | Zero/negative multipliers | Budget calc fails | Config validation |
| EC2 | Missing phase in config | Budget calc fails | Config validation |
| EC3 | Extremely large multipliers | Budget bloat | Max multiplier limit (10×) |
| EC4 | Task override conflicts | Unclear behavior | Overrides are absolute |
| EC5 | Fractional tokens | Non-integer limits | Round up (ceil) |
| EC6 | Usage exceeds limit mid-phase | Breach handling | Report actual, mark breach |
| EC7 | Model router no token usage | Tracking fails | Estimate from length |
| EC8 | Clock skew / time travel | Negative latency | Sanity check, set to 0 |
| EC9 | Phase executed multiple times | Budget attribution | Cumulative tracking |
| EC10 | Concurrent phase execution | Budget confusion | Lease mechanism prevents |
| EC11 | Stop-loss at VERIFY (task near done) | Harsh enforcement | "Almost done" heuristic |
| EC12 | Remediation task creation fails | No tracking | Log critical, still block |
| EC13 | Config change mid-task | Retroactive limits | Use original limits |
| EC14 | Task incomplete report | Missing data | Mark "Not Started" |
| EC15 | Phase ledger corruption | Report fails | Graceful degradation |
| EC16 | Config file changed mid-task | Inconsistent budgets | Config snapshot at start |
| EC17 | Task override syntax error | Task can't start | Validate overrides |
| EC18 | Telemetry backend unavailable | Metrics lost | Fail gracefully |
| EC19 | Metric cardinality explosion | Backend overwhelmed | Aggregate by phase/tier |
| EC20 | Budget calc in hot path | Latency increase | Cache at task start |
| EC21 | Report generation blocks VERIFY | Task slowdown | Async generation |
| EC22 | Enforcer/Ledger out of sync | Wrong phase tracking | Ledger is source of truth |
| EC23 | Model router token counting change | Budget drift | Trend monitoring + alerts |

**Total Edge Cases Identified**: 23

**High Priority** (must address in MVP): EC1, EC2, EC6, EC7, EC9, EC11, EC13, EC16, EC20
**Medium Priority** (address if time permits): EC3, EC4, EC5, EC8, EC10, EC17, EC21, EC22
**Low Priority** (document, handle in IMP-COST-02): EC12, EC14, EC15, EC18, EC19, EC23

---

## THINK - Edge Cases Complete

**Status**: ✅ Edge cases analyzed (23 identified)
**Next**: Pre-mortem (failure scenarios)

---

## 🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
