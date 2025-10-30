# Follow-Up Tasks: IMP-COST-01

**Parent Task**: IMP-COST-01 (Cost/Latency Budgets + Stop-Loss)
**Date**: 2025-10-29
**Status**: Core system complete, integrations deferred

---

## Integration Tasks (High Priority)

These tasks complete the full implementation by integrating the core budget system with existing autopilot infrastructure.

### IMP-COST-01.1: WorkProcessEnforcer Integration
**Priority**: High
**Estimated Effort**: 3-4 hours
**Dependencies**: IMP-COST-01 complete

**Description**:
Integrate budget tracking and stop-loss enforcement into WorkProcessEnforcer.

**Acceptance Criteria**:
1. WorkProcessEnforcer calls `phaseBudgetTracker.startPhaseTracking()` on phase entry
2. WorkProcessEnforcer calls `phaseBudgetTracker.endPhaseTracking()` on phase exit
3. Stop-loss enforcement: Block phase advancement if breach_status = 'exceeded'
4. Stop-loss config: Read from config/phase_budgets.yaml stop_loss section
5. Allow completion threshold: permit finish if <10% over (allow_completion_threshold)
6. Tests verify enforcement logic with mocked phases

**Integration Points**:
- File: `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`
- Methods: `enterPhase()`, `exitPhase()`, `checkBudgetConstraints()`
- Add: Import phaseBudgetTracker, calculateTaskBudgets

**Example Code**:
```typescript
async enterPhase(taskId: string, phase: WorkPhase, complexity: ScopeClass, importance: ImportanceTier) {
  // Calculate budget for this phase
  const config = loadPhaseBudgetConfig();
  const budget = calculatePhaseBudget(phase, complexity, importance, config);

  // Start tracking
  phaseBudgetTracker.startPhaseTracking(taskId, phase, budget);
}

async exitPhase(taskId: string) {
  // End tracking and get execution record
  const execution = phaseBudgetTracker.endPhaseTracking(false);

  // Check for budget breach
  if (execution.breach_status === 'exceeded') {
    const stopLoss = loadPhaseBudgetConfig().stop_loss;
    const allowCompletion = (execution.tokens_used / execution.tokens_limit) < stopLoss.allow_completion_threshold;

    if (!allowCompletion) {
      throw new BudgetExceededError(`Phase ${execution.phase} exceeded budget: ${execution.tokens_used}/${execution.tokens_limit} tokens`);
    }
  }

  // Store execution in Phase Ledger (see IMP-COST-01.3)
}
```

---

### IMP-COST-01.2: Model Router Integration
**Priority**: High
**Estimated Effort**: 2-3 hours
**Dependencies**: IMP-COST-01 complete

**Description**:
Integrate token usage reporting from Model Router to PhaseBudgetTracker.

**Acceptance Criteria**:
1. Model Router calls `phaseBudgetTracker.reportTokenUsage()` after each LLM response
2. Token count extracted from model response (usage.total_tokens or estimated)
3. If no usage data, use PhaseBudgetTracker.estimateTokens() fallback
4. Set tokens_estimated flag appropriately
5. Tests verify reporting with mocked LLM responses

**Integration Points**:
- File: `tools/wvo_mcp/src/model/model_router.ts` (or equivalent)
- Method: `callModel()` or similar
- Add: Import phaseBudgetTracker, PhaseBudgetTracker

**Example Code**:
```typescript
async callModel(prompt: string, config: ModelConfig): Promise<ModelResponse> {
  const response = await this.client.chat(prompt, config);

  // Report token usage
  if (response.usage?.total_tokens) {
    phaseBudgetTracker.reportTokenUsage(response.usage.total_tokens);
  } else {
    // Fallback: estimate tokens
    const estimated = PhaseBudgetTracker.estimateTokens(prompt, response.content);
    phaseBudgetTracker.reportTokenUsage(estimated);
    // Note: endPhaseTracking() will be called with tokensEstimated=true
  }

  return response;
}
```

---

### IMP-COST-01.3: Phase Ledger Integration
**Priority**: Medium
**Estimated Effort**: 2-3 hours
**Dependencies**: IMP-COST-01 complete, IMP-COST-01.1 complete

**Description**:
Store PhaseExecution records in Phase Ledger for historical analysis.

**Acceptance Criteria**:
1. Phase Ledger stores PhaseExecution record on phase exit
2. Schema extended with budget fields (tokens_used, tokens_limit, breach_status)
3. Query API supports filtering by budget status
4. Historical budget analysis queries (tasks by breach status, avg utilization, etc.)
5. Tests verify storage and retrieval

**Integration Points**:
- File: `tools/wvo_mcp/src/orchestrator/phase_ledger.ts`
- Table: `phase_ledger` (add columns: tokens_used, tokens_limit, latency_ms, latency_limit_ms, breach_status, tokens_estimated)
- Methods: `recordPhaseEntry()`, `recordPhaseExit()`, `queryByBudgetStatus()`

**Schema Migration**:
```sql
ALTER TABLE phase_ledger ADD COLUMN tokens_used INTEGER;
ALTER TABLE phase_ledger ADD COLUMN tokens_limit INTEGER;
ALTER TABLE phase_ledger ADD COLUMN latency_ms INTEGER;
ALTER TABLE phase_ledger ADD COLUMN latency_limit_ms INTEGER;
ALTER TABLE phase_ledger ADD COLUMN breach_status TEXT CHECK(breach_status IN ('within', 'warning', 'exceeded'));
ALTER TABLE phase_ledger ADD COLUMN tokens_estimated INTEGER DEFAULT 0;
```

---

### IMP-COST-01.4: OTel Metrics Integration
**Priority**: Medium
**Estimated Effort**: 3-4 hours
**Dependencies**: IMP-COST-01 complete

**Description**:
Instrument budget system with OpenTelemetry metrics following GenAI semantic conventions.

**Acceptance Criteria**:
1. Metrics: `autopilot.phase.tokens.used`, `autopilot.phase.tokens.limit`, `autopilot.phase.budget_utilization`
2. Metrics: `autopilot.phase.latency.ms`, `autopilot.phase.breach.count`
3. Attributes: task_id, phase, complexity, importance, breach_status
4. Metrics exported to configured OTel collector
5. Dashboard: Budget utilization over time, breach frequency, avg utilization per phase
6. Tests verify metrics emission

**Integration Points**:
- File: `tools/wvo_mcp/src/telemetry/metrics_collector.ts`
- Methods: `recordPhaseBudgetExecution()`, `emitBudgetMetrics()`
- GenAI semantic conventions: gen_ai.usage.input_tokens, gen_ai.usage.output_tokens

**Example Code**:
```typescript
function recordPhaseBudgetExecution(execution: PhaseExecution) {
  const meter = getMeter();

  // Token usage
  meter.createHistogram('autopilot.phase.tokens.used').record(execution.tokens_used, {
    'task.id': execution.task_id,
    'phase': execution.phase,
    'breach.status': execution.breach_status,
  });

  // Budget utilization percentage
  const utilization = (execution.tokens_used / execution.tokens_limit) * 100;
  meter.createHistogram('autopilot.phase.budget_utilization').record(utilization, {
    'task.id': execution.task_id,
    'phase': execution.phase,
  });

  // Breach counter
  if (execution.breach_status !== 'within') {
    meter.createCounter('autopilot.phase.breach.count').add(1, {
      'phase': execution.phase,
      'severity': execution.breach_status,
    });
  }
}
```

---

### IMP-COST-01.5: Quality Gates Integration
**Priority**: Low
**Estimated Effort**: 1-2 hours
**Dependencies**: IMP-COST-01 complete, IMP-COST-01.1 complete

**Description**:
Add budget status checks to quality gates (pre-phase advancement checks).

**Acceptance Criteria**:
1. Quality gate checks cumulative budget status before advancing
2. Warning issued if cumulative_breach_status = 'warning'
3. Block advancement if cumulative_breach_status = 'exceeded' (unless allow_completion)
4. Budget report generated and included in quality gate output
5. Tests verify gate behavior with mocked budget status

**Integration Points**:
- File: `tools/wvo_mcp/src/quality/quality_gates.ts` (or equivalent)
- Method: `checkPhaseAdvancement()`
- Add: Import phaseBudgetTracker, generateBudgetReport

---

### IMP-COST-01.6: User Guide
**Priority**: Medium
**Estimated Effort**: 2-3 hours
**Dependencies**: IMP-COST-01 complete

**Description**:
Create comprehensive user guide for configuring and using budget system.

**Acceptance Criteria**:
1. Document created: `docs/autopilot/BUDGET_USER_GUIDE.md`
2. Sections: Configuration, Budget Calculation, Overrides, Troubleshooting, FAQ
3. Examples: Configuring for different task types, adjusting multipliers, interpreting reports
4. Troubleshooting: Common issues (budget too low, too high, estimation vs actual)
5. FAQ: When to override, how to tune budgets, what breach status means

**Outline**:
```markdown
# Budget System User Guide

## Overview
- What is the budget system?
- Why use it?
- When does it apply?

## Configuration
- config/phase_budgets.yaml structure
- Base budgets, multipliers, phase weights
- Stop-loss thresholds

## Budget Calculation
- Formula: base × complexity × importance × phase_weight
- Examples for common task types
- How to estimate appropriate budgets

## Overrides
- Task-level overrides
- Phase-level overrides
- When to use overrides

## Budget Reports
- Reading budget reports
- Interpreting breach status
- Understanding warnings

## Troubleshooting
- Budget too low (frequent breaches)
- Budget too high (wasted allocation)
- Token estimation inaccuracies
- Latency tracking issues

## FAQ
- How do I increase budget for complex tasks?
- What happens when budget exceeded?
- Can I disable budgets for specific tasks?
- How accurate is token estimation?
```

---

### IMP-COST-01.7: Developer Guide
**Priority**: Medium
**Estimated Effort**: 2-3 hours
**Dependencies**: IMP-COST-01 complete, IMP-COST-01.1-01.5 complete

**Description**:
Create developer guide for integrating budget system into new code.

**Acceptance Criteria**:
1. Document created: `docs/autopilot/BUDGET_DEVELOPER_GUIDE.md`
2. Sections: Architecture, API Reference, Integration Examples, Testing, Extending
3. Code examples: How to call tracker, how to handle budget breaches, how to generate reports
4. Testing: How to mock budget system, how to test budget enforcement
5. Extending: How to add new phases, how to customize calculation logic

**Outline**:
```markdown
# Budget System Developer Guide

## Architecture
- Component overview
- Data flow
- Integration points

## API Reference
- calculatePhaseBudget()
- calculateTaskBudgets()
- phaseBudgetTracker.startPhaseTracking()
- phaseBudgetTracker.reportTokenUsage()
- phaseBudgetTracker.endPhaseTracking()
- generateBudgetReport()

## Integration Examples
- Basic usage (standalone)
- Integration with WorkProcessEnforcer
- Integration with Model Router
- Integration with Quality Gates

## Testing
- Mocking budget system
- Testing budget enforcement
- Testing budget calculation
- Testing report generation

## Extending
- Adding new phases
- Customizing calculation logic
- Adding new breach thresholds
- Creating custom reports
```

---

### IMP-COST-01.8: Configuration Reference
**Priority**: Low
**Estimated Effort**: 1-2 hours
**Dependencies**: IMP-COST-01 complete

**Description**:
Create complete reference documentation for all configuration options.

**Acceptance Criteria**:
1. Document created: `docs/autopilot/BUDGET_CONFIG_REFERENCE.md`
2. Every config field documented (description, type, range, default, example)
3. Validation rules documented
4. Override syntax documented
5. Examples for common scenarios

**Outline**:
```markdown
# Budget Configuration Reference

## File Location
- config/phase_budgets.yaml

## Configuration Schema

### base_budgets
- Description: Base token and latency limits for each phase
- Type: Map<WorkPhase, {tokens: number, latency_ms: number}>
- Range: tokens > 0, latency_ms > 0
- Example: STRATEGIZE: {tokens: 3000, latency_ms: 60000}

### complexity_multipliers
- Description: Multipliers based on task complexity
- Type: Map<ScopeClass, number>
- Range: 0 < mult ≤ 10
- Example: Medium: 1.0

... (all fields documented)

## Override Syntax

Task-level overrides:
```typescript
const overrides = {
  THINK: {tokens: 10000, latency_ms: 120000}
};
const budgets = calculateTaskBudgets('Large', 'high', overrides);
```

## Common Scenarios

### Scenario: Research-Heavy Task
Use higher importance tier or override STRATEGIZE/THINK phases

### Scenario: Rapid Prototyping
Use lower importance tier or smaller complexity class

... (more scenarios)
```

---

## Future Enhancement Tasks (Lower Priority)

### IMP-COST-02: Progress-Based Resource Management
**Priority**: Low (elegant long-term solution)
**Estimated Effort**: 2-3 weeks (research + design + implementation)
**Dependencies**: IMP-COST-01 complete, IMP-COST-01.1-01.8 complete, production data collected

**Description**:
Implement progress-based resource management as proposed in strategy document. This is the elegant long-term solution that adapts budgets based on task progress signals.

**Key Features**:
- Progress signal detection (planner iterations, code quality, test coverage)
- Adaptive budget allocation (allocate more to phases making progress)
- Early stopping (detect lack of progress, stop early)
- Historical learning (ML model predicts resource needs)

**See**: `state/evidence/IMP-COST-01/strategize/strategy.md` for full design

---

## Task Prioritization

**Phase 1 (Critical - Complete IMP-COST-01)**:
1. IMP-COST-01.1: WorkProcessEnforcer Integration
2. IMP-COST-01.2: Model Router Integration

**Phase 2 (High Value - Observability & Documentation)**:
3. IMP-COST-01.3: Phase Ledger Integration
4. IMP-COST-01.4: OTel Metrics Integration
5. IMP-COST-01.6: User Guide

**Phase 3 (Polish & Extend)**:
6. IMP-COST-01.5: Quality Gates Integration
7. IMP-COST-01.7: Developer Guide
8. IMP-COST-01.8: Configuration Reference

**Phase 4 (Future - Elegant Solution)**:
9. IMP-COST-02: Progress-Based Resource Management

---

## Success Metrics

After integration tasks complete, measure:
- **Budget breach rate**: Target <5% of tasks exceed budget
- **Resource utilization**: Target 60-80% utilization (not too low, not too high)
- **False positive rate**: Target <2% of tasks incorrectly flagged
- **Cost savings**: Measure reduction in wasted tokens
- **Task completion rate**: Ensure budgets don't block legitimate tasks

---

**Last Updated**: 2025-10-29
**Parent Task**: IMP-COST-01
**Next Review**: After Phase 1 integration complete
