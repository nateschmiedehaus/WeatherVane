# IMP-COST-01 SPEC: Cost/Latency Budgets + Stop-Loss

**Date**: 2025-10-29
**Task ID**: IMP-COST-01
**Phase**: SPEC
**Status**: In Progress

---

## Executive Summary

This specification defines acceptance criteria for implementing dynamic cost and latency budgets across the autopilot work process phases (STRATEGIZE→MONITOR), with stop-loss enforcement to prevent runaway resource consumption.

**Scope**: Static budget MVP with dynamic multipliers based on complexity, importance, and phase stage.

**Out of Scope**: Progress-based resource management (deferred to IMP-COST-02).

---

## Context

**Problem**: Autopilot tasks currently lack resource controls, risking:
- Runaway token costs (especially in THINK/STRATEGIZE phases)
- Extended latency blocking task queues
- No early warning system for budget breaches
- Inconsistent resource allocation (complex tasks get same budget as simple ones)

**Strategic Approach** (from STRATEGIZE phase):
- **Immediate (IMP-COST-01)**: Static budgets with dynamic multipliers - delivers cost control in 8-12 hours
- **Long-term (IMP-COST-02)**: Progress-based resource management - optimizes for value/cost, not just cost

---

## Acceptance Criteria

### AC1: Dynamic Budget Calculation ✅

**Requirement**: Budget system must account for three dimensions:

1. **Complexity Tier** (from ScopeClass):
   - Tiny: 0.5× multiplier
   - Small: 0.8× multiplier
   - Medium: 1.0× multiplier (baseline)
   - Large: 1.5× multiplier

2. **Importance Tier** (new):
   - Low: 0.7× multiplier
   - Medium: 1.0× multiplier (baseline)
   - High: 1.5× multiplier
   - Critical: 2.0× multiplier

3. **Phase Weight** (stage-specific):
   - STRATEGIZE: 1.5× (research-heavy)
   - SPEC: 1.0× (baseline)
   - PLAN: 1.2× (analysis)
   - THINK: 1.5× (exploration - highest)
   - IMPLEMENT: 1.0× (baseline)
   - VERIFY: 0.8× (mechanical)
   - REVIEW: 1.0× (evaluation)
   - PR: 0.6× (minimal)
   - MONITOR: 0.6× (mechanical - lowest)

**Formula**:
```
phase_token_limit = BASE_TOKENS[phase] × COMPLEXITY_MULT × IMPORTANCE_MULT × PHASE_WEIGHT
phase_latency_limit_ms = BASE_LATENCY_MS[phase] × COMPLEXITY_MULT × IMPORTANCE_MULT × PHASE_WEIGHT
```

**Verification**:
- [ ] Unit tests verify calculation for all combinations
- [ ] Examples: Critical+Large+THINK = 18,000 tokens, Low+Small+PR = 504 tokens
- [ ] Budget config exported from `tools/wvo_mcp/src/context/phase_budgets.ts`

---

### AC2: Phase-Level Budget Tracking ✅

**Requirement**: Each phase execution must track:
- Tokens consumed (prompt + completion)
- Latency (start to finish)
- Budget limits (calculated dynamically)
- Breach status (within/warning/exceeded)

**Data Structure**:
```typescript
interface PhaseExecution {
  phase: WorkPhase;
  task_id: string;
  tokens_used: number;
  tokens_limit: number;
  latency_ms: number;
  latency_limit_ms: number;
  breach_status: 'within' | 'warning' | 'exceeded';
  timestamp_start: string; // ISO 8601
  timestamp_end: string;
}
```

**Verification**:
- [ ] PhaseExecution records captured in Phase Ledger
- [ ] Token tracking integrated with model router
- [ ] Latency tracking captures full phase duration (not just LLM call time)

---

### AC3: Stop-Loss Enforcement at VERIFY ✅

**Requirement**: VERIFY phase must check cumulative budget status and BLOCK task completion if limits exceeded.

**Stop-Loss Rules**:
1. **Token Stop-Loss**: If cumulative tokens > 1.2× total budget → BLOCK + create remediation task
2. **Latency Stop-Loss**: If cumulative latency > 1.2× total latency budget → WARN + log
3. **Per-Phase Breach**: If any phase exceeds 1.5× its limit → WARN in evidence, allow continuation

**Blocking Behavior**:
- VERIFY fails with clear error message: "Task IMP-COST-01 exceeded token budget: 15,234 / 12,000 (127%)"
- Auto-creates remediation task: "FIX-BUDGET-BREACH-{TASK-ID}"
- Evidence document includes budget breach details

**Verification**:
- [ ] Integration test: Simulate budget breach, verify VERIFY blocks
- [ ] Remediation task auto-creation tested
- [ ] Evidence includes budget summary in `verify/budget_report.md`

---

### AC4: Budget Enforcement Reports in Evidence ✅

**Requirement**: Each task evidence must include budget report showing:
- Per-phase token/latency consumption
- Budget limits (with multipliers breakdown)
- Breach status and warnings
- Cumulative totals vs aggregate limits

**Report Location**: `state/evidence/{TASK-ID}/verify/budget_report.md`

**Report Format**:
```markdown
# Budget Report: {TASK-ID}

## Summary
- **Total Tokens**: 8,234 / 10,000 (82%)
- **Total Latency**: 245s / 300s (82%)
- **Budget Status**: ✅ WITHIN LIMITS

## Per-Phase Breakdown

| Phase       | Tokens Used | Token Limit | Latency (s) | Latency Limit (s) | Status |
|-------------|-------------|-------------|-------------|-------------------|--------|
| STRATEGIZE  | 2,100       | 3,000       | 45          | 60                | ✅     |
| SPEC        | 800         | 1,500       | 20          | 40                | ✅     |
| THINK       | 3,800       | 4,000       | 85          | 90                | ⚠️ 95% |
...

## Budget Calculation Details
- **Complexity**: Medium (1.0×)
- **Importance**: High (1.5×)
- **Phase Weights**: STRATEGIZE 1.5×, SPEC 1.0×, PLAN 1.2×, THINK 1.5×, etc.
```

**Verification**:
- [ ] Budget reports generated for test tasks
- [ ] Reports include all required sections
- [ ] Reports accurately reflect Phase Ledger data

---

### AC5: Integration with Existing Systems ✅

**Requirement**: Budget system must integrate with:

1. **Phase Ledger** (`tools/wvo_mcp/src/orchestrator/ledger.ts`):
   - PhaseExecution records include budget fields
   - Ledger queries support budget filtering

2. **Resource Budget Manager** (`tools/wvo_mcp/src/observability/resource_budgets.ts`):
   - Extend with `trackPhaseBudget(phase, tokens, latency)` method
   - Emit budget metrics to telemetry

3. **WorkProcessEnforcer** (`tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`):
   - Call budget checks during phase transitions
   - Block advancement if stop-loss triggered

4. **Model Router** (`tools/wvo_mcp/src/routing/model_router.ts`):
   - Report token usage to budget tracker
   - Respect phase token limits when routing

**Verification**:
- [ ] Integration tests verify end-to-end budget tracking
- [ ] No duplicate budget tracking systems
- [ ] All integrations use shared TypeScript interfaces

---

### AC6: Configuration and Overrides ✅

**Requirement**: Budget configuration must be:
- Centralized in `config/phase_budgets.yaml`
- Overridable per-task via roadmap metadata
- Auditable (all overrides logged)

**Configuration Schema**:
```yaml
# config/phase_budgets.yaml
base_budgets:
  strategize: { tokens: 3000, latency_ms: 60000 }
  spec: { tokens: 1500, latency_ms: 40000 }
  plan: { tokens: 2000, latency_ms: 50000 }
  think: { tokens: 4000, latency_ms: 90000 }
  implement: { tokens: 3500, latency_ms: 120000 }
  verify: { tokens: 2500, latency_ms: 60000 }
  review: { tokens: 2000, latency_ms: 50000 }
  pr: { tokens: 1500, latency_ms: 30000 }
  monitor: { tokens: 1000, latency_ms: 20000 }

complexity_multipliers:
  Tiny: 0.5
  Small: 0.8
  Medium: 1.0
  Large: 1.5

importance_multipliers:
  low: 0.7
  medium: 1.0
  high: 1.5
  critical: 2.0

phase_weights:
  strategize: 1.5
  spec: 1.0
  plan: 1.2
  think: 1.5
  implement: 1.0
  verify: 0.8
  review: 1.0
  pr: 0.6
  monitor: 0.6

stop_loss:
  cumulative_token_threshold: 1.2  # 120% of total budget
  cumulative_latency_threshold: 1.2
  per_phase_threshold: 1.5  # 150% of phase budget
```

**Task Override** (in roadmap.yaml):
```yaml
- id: IMP-CRITICAL-SECURITY-FIX
  importance: critical  # Triggers 2.0× multiplier
  budget_overrides:
    think:
      tokens: 10000  # Override default calculation
```

**Verification**:
- [ ] Config file loaded and validated at startup
- [ ] Task overrides applied correctly
- [ ] All overrides logged in Phase Ledger

---

### AC7: Telemetry and Observability ✅

**Requirement**: Budget metrics must be emitted to telemetry for monitoring:

**OTel Metrics**:
- `autopilot.phase.tokens_used` (counter, attributes: phase, task_id, complexity, importance)
- `autopilot.phase.latency_ms` (histogram, attributes: phase, task_id)
- `autopilot.phase.budget_breach` (counter, attributes: phase, task_id, breach_type)
- `autopilot.task.tokens_total` (counter, attributes: task_id, budget_status)
- `autopilot.task.latency_total_ms` (histogram, attributes: task_id, budget_status)

**Dashboards**:
- Grafana dashboard showing budget utilization by phase/task
- Alert rules for budget breaches (>80% utilization, stop-loss triggered)

**Verification**:
- [ ] Metrics emitted during test task execution
- [ ] Metrics queryable in telemetry backend
- [ ] Dashboard template provided (in `docs/observability/budget_dashboard.json`)

---

### AC8: Documentation ✅

**Requirement**: Complete documentation covering:

1. **User Guide**: How to interpret budget reports, adjust budgets, handle breaches
2. **Developer Guide**: How to integrate budget tracking into new phases/tools
3. **Configuration Reference**: All config options with examples
4. **Troubleshooting**: Common issues (miscalculated budgets, false positives, performance impact)

**Documentation Files**:
- `docs/autopilot/budgets/USER_GUIDE.md`
- `docs/autopilot/budgets/DEVELOPER_GUIDE.md`
- `docs/autopilot/budgets/CONFIG_REFERENCE.md`
- `docs/autopilot/budgets/TROUBLESHOOTING.md`

**Verification**:
- [ ] All 4 documentation files created
- [ ] Documentation reviewed for completeness
- [ ] Examples tested and accurate

---

### AC9: Performance Impact ✅

**Requirement**: Budget tracking must have minimal performance overhead:
- Token tracking: <5ms per phase
- Latency tracking: <1ms per phase
- Budget calculation: <10ms per task
- Report generation: <100ms per task

**Verification**:
- [ ] Benchmarks run and documented in `verify/performance_benchmark.md`
- [ ] All performance targets met
- [ ] No synchronous blocking operations in hot paths

---

### AC10: Backward Compatibility ✅

**Requirement**: Budget system must NOT break existing tasks:
- Tasks without `importance` metadata default to `medium`
- Tasks without `budget_overrides` use calculated defaults
- Existing Phase Ledger entries still readable (graceful field addition)

**Verification**:
- [ ] Integration tests run against existing Phase Ledger data
- [ ] Smoke tests pass for tasks created before budget system
- [ ] No database migrations required (additive schema changes only)

---

### AC11: Error Handling and Graceful Degradation ✅

**Requirement**: Budget system must handle failures gracefully:
- Config file missing → Use hardcoded defaults, log warning
- Model router doesn't report tokens → Estimate from prompt length, log warning
- Budget calculation error → Use baseline (Medium complexity, Medium importance), log error
- Budget report generation fails → Log error, don't block task completion

**Error Scenarios**:
1. **Config Parse Error**: Fallback to hardcoded defaults
2. **Token Tracking Failure**: Estimate tokens, flag as unreliable
3. **Latency Tracking Failure**: Log error, don't enforce latency limits
4. **Stop-Loss Check Failure**: Log critical error, allow task continuation (fail-open)

**Verification**:
- [ ] Unit tests for each error scenario
- [ ] Integration test: Delete config, verify fallback behavior
- [ ] Integration test: Inject token tracking failure, verify estimation

---

## Out of Scope

The following are explicitly OUT OF SCOPE for IMP-COST-01 (may be addressed in IMP-COST-02):

### ❌ Progress-Based Resource Management
- Efficiency scoring (value per token)
- Adaptive budgets (increase for productive work, decrease for "spinning wheels")
- Multi-objective optimization (value/cost, not just minimize cost)

**Rationale**: Requires infrastructure from IMP-COST-01 (baseline budget data, telemetry integration). Deferring to IMP-COST-02 allows phased rollout and reduces risk.

### ❌ Cross-Task Budget Sharing
- Task priority pools (high-priority tasks borrow from low-priority budgets)
- Queue-level budgets (total daily/weekly budget for all tasks)

**Rationale**: Adds significant complexity (concurrency control, budget rebalancing). Not needed for MVP.

### ❌ Predictive Budget Allocation
- ML models predicting task complexity from title/description
- Historical analysis to auto-tune budget multipliers

**Rationale**: Requires historical data from IMP-COST-01. Can be added later as optimization.

### ❌ User-Facing Budget Controls
- CLI commands to check/adjust budgets mid-task
- Interactive budget negotiation ("task needs 5000 more tokens, approve?")

**Rationale**: Adds UX complexity. Autopilot is currently autonomous; interactive controls can be added if needed.

### ❌ Fine-Grained Token Accounting
- Per-tool-call token tracking
- Prompt vs completion token breakdown by phase

**Rationale**: Increases telemetry overhead. Phase-level granularity sufficient for cost control.

---

## Success Metrics

**Operational Success** (measured 2 weeks post-deployment):
1. **Budget Compliance**: >90% of tasks complete within 1.0× of allocated budget
2. **Stop-Loss Triggers**: <5% of tasks trigger stop-loss enforcement
3. **Performance Impact**: <5ms overhead per phase on average
4. **False Positives**: <2% of tasks blocked incorrectly

**Cost Savings** (measured 4 weeks post-deployment):
1. **Token Reduction**: 15-25% reduction in total token consumption (by catching runaway THINK phases early)
2. **Latency Improvement**: 10-20% reduction in p95 task completion time (by preventing latency bloat)

**Telemetry Coverage** (immediate):
1. **Budget Reports**: 100% of completed tasks have budget report in evidence
2. **Metric Emission**: 100% of phase executions emit budget metrics

---

## Dependencies

**Upstream** (must exist before implementation):
- ✅ Phase Ledger (`tools/wvo_mcp/src/orchestrator/ledger.ts`)
- ✅ WorkProcessEnforcer (`tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`)
- ✅ Resource Budget Manager (`tools/wvo_mcp/src/observability/resource_budgets.ts`)
- ✅ Model Router (`tools/wvo_mcp/src/routing/model_router.ts`)
- ✅ ScopeClass typing (`tools/wvo_mcp/src/context/context_budgeting.ts`)

**Downstream** (will be affected by this implementation):
- ⏳ IMP-COST-02: Progress-Based Resource Management (uses budget baseline data)
- ⏳ Grafana Dashboards: Budget utilization visualizations
- ⏳ Alerting Rules: Budget breach notifications

---

## Risk Assessment

**High Risks**:
1. **Budget Calculation Errors**: Incorrect multipliers → tasks starved or bloated
   - **Mitigation**: Extensive unit tests, manual verification of examples, staged rollout

2. **False Positive Stop-Loss**: Legitimate complex tasks blocked incorrectly
   - **Mitigation**: Generous thresholds (1.2× cumulative, 1.5× per-phase), override mechanism, monitoring

3. **Performance Overhead**: Token tracking slows down every phase
   - **Mitigation**: Async telemetry emission, minimal synchronous work, benchmarking

**Medium Risks**:
4. **Integration Complexity**: Multiple touch points (ledger, enforcer, router, budgets)
   - **Mitigation**: Incremental integration, integration tests, clear interfaces

5. **Configuration Drift**: Hardcoded values vs config file get out of sync
   - **Mitigation**: Single source of truth (config file), validation on load

**Low Risks**:
6. **Documentation Lag**: Docs outdated as system evolves
   - **Mitigation**: Docs written during IMPLEMENT, reviewed in REVIEW phase

---

## Acceptance Criteria Summary

| AC# | Criterion | Verification Method |
|-----|-----------|---------------------|
| AC1 | Dynamic Budget Calculation | Unit tests, examples |
| AC2 | Phase-Level Budget Tracking | Integration tests, ledger inspection |
| AC3 | Stop-Loss Enforcement | Simulated breach test |
| AC4 | Budget Reports in Evidence | Template validation |
| AC5 | Integration with Existing Systems | End-to-end tests |
| AC6 | Configuration and Overrides | Config loading test, override test |
| AC7 | Telemetry and Observability | Metric emission verification |
| AC8 | Documentation | Doc completeness review |
| AC9 | Performance Impact | Benchmarks |
| AC10 | Backward Compatibility | Smoke tests |
| AC11 | Error Handling | Fault injection tests |

**Total Acceptance Criteria**: 11
**All criteria must pass** before task can be marked COMPLETE.

---

## SPEC Phase Complete Checklist

- [x] Acceptance criteria defined (11 criteria)
- [x] Out-of-scope boundaries documented (5 items)
- [x] Success metrics defined (operational + cost savings + telemetry)
- [x] Dependencies mapped (upstream + downstream)
- [x] Risk assessment completed (6 risks with mitigations)
- [x] Verification methods specified for each AC
- [x] Configuration schema defined
- [x] Data structures specified
- [x] Integration points identified

**Status**: ✅ SPEC COMPLETE - Ready for PLAN phase

---

## Next Phase: PLAN

**PLAN phase will define**:
- Task breakdown (implementation tasks with time estimates)
- Implementation sequence (which files/systems to modify in what order)
- Testing strategy (unit, integration, e2e test plan)
- Rollout plan (staged deployment, rollback plan)
- Cross-item integration (related tasks, shared contracts)

---

## 🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
