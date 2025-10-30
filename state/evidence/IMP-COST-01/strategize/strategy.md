# IMP-COST-01: Cost/Latency Budgets + Stop-Loss — Strategy

**Date**: 2025-10-29
**Phase**: STRATEGIZE
**Task ID**: IMP-COST-01
**Epic**: Phase 2.1 Operational Safety Essentials

---

## Problem Statement

**Current State:**
- Autopilot has **role-based** token budgets (planner: 900-4000, implementer: 700-3200, verifier: 500-2000 tokens per `context_budgeting.ts`)
- Runtime resource monitoring exists (`resource_budgets.ts`) for memory/concurrency/timeouts
- **No per-PHASE (STRATEGIZE→MONITOR) cost/latency budgets**
- **No stop-loss gates** - phases can exceed budgets without blocking
- **No budget enforcement tracking** in evidence artifacts

**Problem:**
Without per-phase budgets and stop-loss enforcement:
1. **Runaway costs**: A single phase can consume unbounded tokens (e.g., THINK phase with extensive research)
2. **Latency bloat**: Phases can take arbitrarily long without triggering alerts
3. **No accountability**: Evidence doesn't show whether budget limits were respected
4. **Production risk**: Autopilot cannot safely operate autonomously without cost guardrails

**Impact:**
- Financial: Unconstrained token usage → budget overruns
- Operational: Long-running phases block task completion → reduced throughput
- Safety: No circuit breaker for excessive resource consumption → denial-of-wallet

---

## Objectives

**Primary Goal:** Implement per-phase token and latency budgets with stop-loss enforcement at VERIFY phase

**Specific Objectives:**
1. **Budget Definition**: Define per-phase token/time limits in Lifecycle Checkpoint (LCP) schema
2. **Budget Tracking**: Capture actual token usage and latency per phase during execution
3. **Stop-Loss Enforcement**: Block VERIFY → REVIEW transition if budgets exceeded
4. **Evidence Generation**: Attach `budget_enforcement.json` to phase evidence showing budget compliance
5. **Observability**: Emit budget breach counters and spans for monitoring

---

## Scope

**In Scope:**
- ✅ **Phase-level budgets**: STRATEGIZE, SPEC, PLAN, THINK, IMPLEMENT, VERIFY, REVIEW, PR, MONITOR
- ✅ **Two dimensions**: Token count + latency (time to complete phase)
- ✅ **Stop-loss at VERIFY**: Block phase advance if budget exceeded (fail-closed)
- ✅ **Budget enforcement report**: JSON artifact in `state/evidence/{task_id}/verify/budget_enforcement.json`
- ✅ **Integration with existing**: Extend WorkProcessEnforcer, use existing OTel spans/counters

**Out of Scope (deferred or not applicable):**
- ❌ **Cost estimation**: No pre-flight cost prediction (only tracking/enforcement)
- ❌ **Dynamic budget adjustment**: Budgets are static per task complexity tier
- ❌ **Rollback on breach**: Task continues but VERIFY blocks (no automatic rollback)
- ❌ **User-configurable budgets**: Budgets are system-defined, not user-overridable
- ❌ **Historical budget analysis**: No retrospective budget optimization (future work)

---

## Non-Goals

**Explicitly NOT doing:**
1. **Replacing existing budgets**: Keep role-based budgets (`context_budgeting.ts`) for context assembly
2. **Real-time cost tracking**: No live token counter during LLM calls (batch tracking after phase completion)
3. **Budget negotiation**: No dynamic budget increase on breach (strict enforcement)
4. **Cost attribution by file**: No per-file cost breakdown (phase-level only)
5. **Latency SLOs for sub-operations**: Phase-level only, not tool-call level

---

## Problem Reframing & Fundamental Questions

**Surface Requirement**: "Per-phase token/time budgets with stop-loss enforcement"

**But let's question the assumptions:**

### Question 1: Is "budget" the right abstraction?
**Current framing**: Hard limits on tokens/time per phase

**Alternative framings**:
1. **Value-Based Resource Allocation**:
   - Instead of "How much can we spend?", ask "How much value are we getting per token?"
   - Phases that produce high-value insights (THINK discovers critical edge case) should get MORE budget dynamically
   - Phases that are low-productivity (IMPLEMENT blocked on external API) should get LESS

2. **Return-on-Investment Model**:
   - Track "progress per token" not just "tokens used"
   - If THINK phase finds 10 edge cases in first 1000 tokens → high ROI, allocate more
   - If THINK phase finds 0 new insights after 3000 tokens → diminishing returns, cut budget

3. **Adaptive Budget with Learning**:
   - System learns from historical tasks: "Similar tasks to this one typically need 5000 tokens in IMPLEMENT"
   - Budget adjusts based on actual task characteristics discovered during execution
   - Not static limits, but probabilistic forecasts with confidence intervals

**Elegant Insight**: Budget is a MEANS (cost control) not the END (value delivery). We should optimize for value-per-cost, not just minimize cost.

### Question 2: When should we enforce limits?
**Current framing**: Stop-loss at VERIFY (hard gate before REVIEW)

**Alternative enforcement points**:
1. **Progressive Intervention**:
   - 50% budget: Informational (log, no action)
   - 80% budget: Warning + analysis (why is this expensive? is it worth continuing?)
   - 100% budget: Soft limit (require justification to continue)
   - 150% budget: Hard limit (force stop)

2. **Checkpointing with Rollback**:
   - Every 25% of budget, create savepoint with "value delivered so far"
   - If next 25% doesn't deliver proportional value → rollback to previous checkpoint
   - Budget becomes a series of "continue/stop" decisions, not a single gate

3. **Predictive Early Warning**:
   - Model predicts "if we continue at this rate, VERIFY will exceed budget by 200%"
   - Trigger intervention in IMPLEMENT (earlier phase) before waste compounds
   - Prevents "too late to stop" scenarios

**Elegant Insight**: Enforcement should be continuous and predictive, not a single gate at the end. Early intervention prevents waste.

### Question 3: Should budgets be fixed or adaptive?
**Current framing**: Static limits per complexity/importance/phase

**Alternative approaches**:
1. **Portfolio Budgeting**:
   - Don't budget per-task, budget per-sprint or per-week
   - Some tasks overspend, others underspend → balances out
   - Allows risk-taking on high-potential tasks, strict limits on low-value tasks
   - System optimizes for "total value delivered per week" not "cost per task"

2. **Market-Based Allocation**:
   - Phases "bid" for tokens based on expected value delivery
   - THINK phase says "I can find critical security issue with 2000 more tokens"
   - System compares bids across all active tasks, allocates to highest ROI
   - Dynamic reallocation as priorities shift

3. **Learned Budget Schedules**:
   - System learns "for security tasks, THINK typically needs 1.8× baseline, IMPLEMENT needs 0.9×"
   - Budget formula becomes a learned model, not hand-tuned multipliers
   - Continuously improves as more tasks complete

**Elegant Insight**: Fixed budgets optimize for predictability. Adaptive budgets optimize for outcomes. We need both.

### Question 4: What are we actually trying to prevent?
**Stated goal**: "Runaway costs" and "latency bloat"

**Deeper analysis**:
- **Root cause of runaway costs**: Not just lack of limits, but lack of VALUE SIGNAL
  - If a phase is stuck (retrying failed builds, researching irrelevant alternatives), no budget will help
  - Real problem: We don't know when a phase is "spinning wheels" vs "making progress"

- **Root cause of latency bloat**: Not just long phases, but BLOCKED phases
  - Phase waits for external API, rate limit, human input → time passes but no value created
  - Real problem: We charge "time" even when system is idle

- **Root cause of both**: Lack of progress measurement
  - We measure INPUT (tokens, time) but not OUTPUT (insights, code quality, test coverage)
  - Budget should be OUTPUT-based: "You can use unlimited tokens until you've identified 5 edge cases"

**Elegant Insight**: Budgets should measure PROGRESS, not just CONSUMPTION. A phase that's stuck at 0% progress should be stopped regardless of budget. A phase making rapid progress should get more resources.

### Proposed Elegant Solution: **Progress-Based Resource Management**

Instead of fixed token/time budgets, implement:

1. **Progress Tracking per Phase**:
   - STRATEGIZE: % of problem space explored (alternatives considered, risks identified)
   - SPEC: % of acceptance criteria defined (completeness score)
   - THINK: # of edge cases discovered, # of alternatives explored
   - IMPLEMENT: % of files modified, % of tests passing
   - VERIFY: % of acceptance criteria verified

2. **Resource Efficiency Score**:
   ```
   efficiency = progress_made / resources_consumed

   If efficiency < threshold:
     → Intervention: "This phase is inefficient, should we stop or pivot?"

   If efficiency > threshold:
     → Reward: "This phase is productive, allocate more resources"
   ```

3. **Dynamic Budget Adjustment**:
   - Base budget starts at baseline (complexity × importance × phase)
   - Budget increases if progress/token ratio is high (productive work)
   - Budget decreases if progress/token ratio is low (spinning wheels)
   - System learns optimal efficiency thresholds per phase type

4. **Multi-Objective Optimization**:
   - Don't just minimize cost
   - Maximize: (value delivered) / (cost + latency)
   - Where value = bugs prevented + features shipped + risks mitigated

**This approach**:
- ✅ Prevents runaway costs (low efficiency → budget cuts)
- ✅ Prevents latency bloat (idle time doesn't count against budget)
- ✅ Rewards productive work (high efficiency → more resources)
- ✅ Adapts to task needs (complex tasks naturally get more budget if productive)
- ✅ Provides early warning (efficiency drops before budget exhausted)

---

## Inputs

**Existing Systems (to integrate with):**
1. ✅ **WorkProcessEnforcer** (`work_process_enforcer.ts`) - phase transition gating
2. ✅ **Phase Ledger** (`phase_ledger.ts`) - immutable audit trail of phase transitions
3. ✅ **OTel Spans** (`otel_spans.ts`) - duration tracking, already captures phase latency
4. ✅ **Token Efficiency Manager** (`token_efficiency_manager.ts`) - token pressure signals
5. ✅ **Subscription Tracker** (`limits/subscription_tracker.ts`) - provider-level token tracking

**Missing Components (need to build):**
- ❌ **Phase Budget Schema** - Define budget limits per phase and task complexity
- ❌ **Budget Tracker** - Capture actual token/latency usage per phase
- ❌ **Budget Enforcer** - Integrate with WorkProcessEnforcer to block on breach
- ❌ **Budget Report Generator** - Create `budget_enforcement.json` artifacts

---

## Risks & Mitigations

### Risk 1: **Budget Breaches Block Progress** (High Impact)
**Scenario**: Legitimate complex tasks exceed budgets → blocked at VERIFY → manual intervention required

**Mitigation**:
- Use task complexity tiers (Tiny/Small/Medium/Large) to set realistic budgets
- Log budget breach details (phase, actual vs limit, task metadata) for analysis
- Provide override mechanism (manual approval flow, not auto-bypass)
- Monitor breach rate (target <5% of tasks blocked)

### Risk 2: **Token Tracking Inaccuracy** (Medium Impact)
**Scenario**: Token counts from provider APIs are delayed/missing → incorrect budget enforcement

**Mitigation**:
- Use provider-reported token counts (Anthropic/OpenAI response metadata)
- Fall back to estimation if provider data unavailable (tokenizer-based)
- Log data source (actual vs estimated) in budget report
- Accept false negatives (under-reporting) over false positives (over-blocking)

### Risk 3: **Latency Attribution Ambiguity** (Medium Impact)
**Scenario**: Phase latency includes wait time (rate limits, network delays) not just compute → unfair budget charges

**Mitigation**:
- Track "active time" vs "wall-clock time" separately
- Budget against active time only (exclude queue wait, rate limit backoff)
- Log wait reasons in budget report for debugging
- Use p95 latency for budget thresholds (accommodate variance)

### Risk 4: **Stop-Loss Kills Valid Work** (High Impact)
**Scenario**: Task exceeds budget in IMPLEMENT, continues to VERIFY, gets blocked → wasted work

**Mitigation**:
- **Early warning signals**: Emit budget pressure events at 80% threshold
- **Graceful degradation**: Allow task to "finish but flag" for manual review
- **Budget carry-forward**: If PLAN under-budget, allow IMPLEMENT overage (global task budget)
- **Audit trail**: Budget breach doesn't delete work, just blocks merge

### Risk 5: **Integration Complexity** (Medium Impact)
**Scenario**: WorkProcessEnforcer has tight coupling → budget integration breaks phase transitions

**Mitigation**:
- Feature flag: `ENABLE_BUDGET_ENFORCEMENT` (default: shadow mode)
- Shadow mode: Log budget breaches but don't block (collect baseline data)
- Rollout plan: Shadow (2 weeks) → Enforce on low-risk tasks → Full enforcement
- Fallback: Budget system failure → allow phase advance (fail-open for resilience)

---

## Recommended Phased Approach

**Problem**: We have two valid solutions:
1. **Simple Static Budgets** (meets immediate need, lower risk)
2. **Progress-Based Resource Management** (elegant long-term solution, higher complexity)

**Recommendation**: Implement BOTH in phases

### Phase 1: IMP-COST-01 (This Task) - Static Budget MVP
**Scope**: Simple per-phase token/latency budgets with dynamic multipliers (complexity, importance, phase weight)

**Why start here**:
- ✅ Delivers immediate value (cost control in 8-12 hours)
- ✅ Lower implementation risk (extends existing systems)
- ✅ Provides baseline data for Phase 2 (actual token usage per phase)
- ✅ Tests enforcement integration with WorkProcessEnforcer

**Limitations accepted**:
- No progress tracking (just consumption tracking)
- No adaptive budgets (static limits)
- No ROI optimization (just cost minimization)

### Phase 2: IMP-COST-02 (New Task) - Progress-Based Resource Management
**Scope**: Efficiency scoring, adaptive budgets, progress tracking per phase

**Why defer**:
- Requires progress measurement infrastructure (doesn't exist yet)
- Needs historical data to learn efficiency thresholds (Phase 1 provides this)
- Higher complexity → more time to implement correctly
- Builds on Phase 1 (doesn't replace it, enhances it)

**Dependencies**:
- IMP-COST-01 complete (baseline budget system working)
- 2-4 weeks of budget data collected (actual usage patterns)
- Progress tracking system designed (separate analysis needed)

**Value over Phase 1**:
- Rewards productive work (high efficiency gets more budget)
- Catches "spinning wheels" early (low efficiency triggers intervention)
- Learns optimal budgets from data (not hand-tuned multipliers)
- Optimizes for outcomes (value/cost) not just inputs (cost alone)

---

## Strategy (Phase 1: IMP-COST-01)

**Approach: Extend Existing Systems with Static Budget Layer + Dynamic Multipliers**

### Phase 1: Budget Schema & Tracking (SPEC/PLAN/IMPLEMENT)
1. Define `PhaseBudget` schema in `phase_budget_schema.ts`:
   ```typescript
   interface PhaseBudget {
     phase: WorkPhase;
     token_limit: number;          // Dynamic per complexity + importance + phase
     latency_limit_ms: number;     // Dynamic per complexity + importance + phase
     complexity_tier: ScopeClass;  // Tiny/Small/Medium/Large
     importance_tier: ImportanceTier; // Critical/High/Medium/Low
     phase_weight: number;         // Stage-specific multiplier (THINK=1.5x, PR=0.5x)
   }

   type ImportanceTier = 'critical' | 'high' | 'medium' | 'low';

   interface BudgetUsage {
     phase: WorkPhase;
     tokens_used: number;
     tokens_limit: number;         // Computed from base * complexity * importance * phase_weight
     latency_ms: number;
     latency_limit_ms: number;     // Computed from base * complexity * importance * phase_weight
     breached: boolean;
     data_source: 'provider' | 'estimated';
     budget_factors: {             // Explain how limit was computed
       base_tokens: number;
       complexity_multiplier: number;
       importance_multiplier: number;
       phase_multiplier: number;
     };
   }
   ```

2. **Dynamic Budget Calculation Formula**:
   ```
   phase_token_limit = BASE_TOKENS_PER_PHASE[phase]
                     × COMPLEXITY_MULTIPLIER[complexity_tier]
                     × IMPORTANCE_MULTIPLIER[importance_tier]
                     × PHASE_WEIGHT[phase]

   phase_latency_limit = BASE_LATENCY_MS[phase]
                       × COMPLEXITY_MULTIPLIER[complexity_tier]
                       × IMPORTANCE_MULTIPLIER[importance_tier]
                       × PHASE_WEIGHT[phase]
   ```

   **Base Values (Medium complexity, Medium importance)**:
   - STRATEGIZE: 3000 tokens, 60s (research-heavy, discovery phase)
   - SPEC: 2500 tokens, 45s (requirements definition)
   - PLAN: 2000 tokens, 30s (structured breakdown)
   - THINK: 4000 tokens, 90s (exploration, alternatives, edge cases - HIGHEST)
   - IMPLEMENT: 3500 tokens, 120s (code generation, file modifications)
   - VERIFY: 2500 tokens, 60s (test execution, validation)
   - REVIEW: 2000 tokens, 45s (rubric evaluation, critique)
   - PR: 1500 tokens, 30s (commit message, documentation)
   - MONITOR: 1000 tokens, 20s (smoke tests, final checks - LOWEST)

   **Complexity Multipliers**:
   - Tiny: 0.5× (2 files, <120 lines changed)
   - Small: 0.8× (≤6 files, <360 lines)
   - Medium: 1.0× (≤12 files, <720 lines)
   - Large: 1.5× (>12 files or >720 lines)

   **Importance Multipliers**:
   - Critical: 2.0× (security, data integrity, financial impact)
   - High: 1.5× (core functionality, user-facing features)
   - Medium: 1.0× (standard improvements, refactoring)
   - Low: 0.7× (minor fixes, documentation, cleanup)

   **Phase Weight Rationale**:
   - **Early phases (STRATEGIZE, THINK)**: 1.5× weight
     - More exploration needed
     - Ambiguity is highest
     - Research and discovery dominate
   - **Middle phases (IMPLEMENT, VERIFY)**: 1.0× weight
     - Execution-focused
     - Well-defined scope
   - **Late phases (PR, MONITOR)**: 0.6× weight
     - Mechanical work
     - Low ambiguity
     - Mostly documentation and validation

   **Example: Critical Security Fix (Large complexity)**:
   ```
   THINK phase budget = 4000 tokens × 1.5 (Large) × 2.0 (Critical) × 1.5 (THINK weight)
                      = 18,000 tokens, 270s latency

   PR phase budget = 1500 tokens × 1.5 (Large) × 2.0 (Critical) × 0.6 (PR weight)
                   = 2,700 tokens, 54s latency
   ```

   **Example: Low-priority Documentation (Small complexity)**:
   ```
   THINK phase budget = 4000 tokens × 0.8 (Small) × 0.7 (Low) × 1.5 (THINK weight)
                      = 3,360 tokens, 76s latency

   PR phase budget = 1500 tokens × 0.8 (Small) × 0.7 (Low) × 0.6 (PR weight)
                   = 504 tokens, 10s latency
   ```

3. **Importance Tier Determination** (Task Metadata):
   - Source: Roadmap task metadata (`importance_tier` field) OR auto-inferred from task properties
   - Auto-inference rules:
     - `Critical`: Task tags include "security", "data-loss", "financial", "production-down"
     - `High`: Task affects core autopilot functionality, user-facing features
     - `Medium`: Standard improvements, refactoring, test additions (default)
     - `Low`: Documentation, minor fixes, cleanup, non-functional improvements
   - Fallback: If not specified and not auto-inferred → default to `Medium`
   - Override: User can specify `--importance critical` flag to override for urgent work

4. Create `BudgetTracker` class:
   - Hook into phase completion events (via WorkProcessEnforcer)
   - Capture token counts from provider responses (Anthropic/OpenAI metadata)
   - Calculate phase duration from OTel spans
   - Store usage in phase ledger entry
   - Compute dynamic budget limits using formula above
   - Track budget factors (base, complexity mult, importance mult, phase weight) for transparency

5. Implement `BudgetReportGenerator`:
   - Generate `budget_enforcement.json` at VERIFY phase
   - Include: task_id, phase breakdowns, total usage, breach status, recommendations

### Phase 2: Stop-Loss Enforcement (IMPLEMENT/VERIFY)
1. Integrate with `WorkProcessEnforcer`:
   - Add budget check to `advancePhase` before VERIFY → REVIEW transition
   - Query `BudgetTracker` for cumulative task budget status
   - Block transition if `breached: true` (fail-closed)
   - Emit `budget_breach_blocked` counter + span event

2. Add escape hatch:
   - `--override-budget` flag for manual approval (requires justification)
   - Log override to audit trail with approver, reason, timestamp

### Phase 3: Observability & Tuning (VERIFY/MONITOR)
1. OTel integration:
   - Emit `phase_budget_usage` counter (phase, tokens, latency)
   - Emit `phase_budget_breach` counter (phase, breach_type: token|latency)
   - Add budget attributes to existing phase transition spans

2. Dashboard metrics:
   - Budget breach rate by phase (target <5%)
   - Average budget utilization (target 60-80%)
   - Tasks blocked vs completed

3. Tuning workflow:
   - Weekly review of budget breach incidents
   - Adjust limits per complexity tier based on p95 actual usage
   - Document changes in `docs/autopilot/BUDGET_TUNING.md`

---

## Success Criteria

**Functional:**
- ✅ Budget enforcement blocks VERIFY → REVIEW if token or latency limits exceeded
- ✅ `budget_enforcement.json` generated for every task at VERIFY phase
- ✅ Budget breach incidents logged with full context (phase, actual, limit, task metadata)

**Performance:**
- ✅ Budget tracking overhead <50ms per phase
- ✅ No false positives from token counting errors (validated against provider data)

**Operational:**
- ✅ Budget breach rate <5% of tasks (indicates realistic limits)
- ✅ Shadow mode runs cleanly for 2 weeks before enforcement enabled
- ✅ Monitoring dashboard shows budget metrics

---

## Alternatives Considered

### Alternative 1: **Global Task Budget** (rejected)
**Approach**: Single token/time budget for entire task (not per-phase)

**Pros**: Simpler implementation, more flexible (phases can trade off budgets)

**Cons**:
- No early warning signals (all phases could overspend until final check)
- Harder to debug which phase caused breach
- Less granular enforcement

**Rejection Reason**: Roadmap explicitly requires "per-phase" budgets for granular control

### Alternative 2: **Soft Limits Only** (rejected)
**Approach**: Log budget breaches but never block phase transitions

**Pros**: No risk of blocking legitimate work, easier rollout

**Cons**:
- Defeats purpose of "stop-loss" enforcement
- Budget breaches become normalized (no accountability)
- Financial risk remains unbounded

**Rejection Reason**: Roadmap acceptance criteria requires "stops honored" (hard enforcement)

### Alternative 3: **Pre-Flight Estimation** (deferred)
**Approach**: Estimate cost before task starts, reject if predicted to exceed budget

**Pros**: Prevents wasted work on over-budget tasks

**Cons**:
- Estimation accuracy poor (30-50% error)
- Complex implementation (need task-specific models)
- Blocks valid tasks based on predictions

**Deferral Reason**: Out of scope for IMP-COST-01, consider for future (IMP-COST-02)

---

## Integration Points

### WorkProcessEnforcer
- **File**: `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`
- **Hook**: `advancePhase()` method, add budget check before phase transition approval
- **Dependencies**: Import `BudgetTracker`, query for task budget status

### Phase Ledger
- **File**: `tools/wvo_mcp/src/ledger/phase_ledger.ts`
- **Hook**: Extend ledger entry schema to include budget usage per phase
- **Dependencies**: Store `BudgetUsage` object in ledger entry metadata

### OTel Spans
- **File**: `tools/wvo_mcp/src/telemetry/otel_spans.ts`
- **Hook**: Add budget attributes to phase transition spans (tokens_used, latency_ms, breached)
- **Dependencies**: Inject budget data into span metadata

### Token Efficiency Manager
- **File**: `tools/wvo_mcp/src/orchestrator/token_efficiency_manager.ts`
- **Hook**: Emit `budget_pressure` signals at 80% threshold for proactive warnings
- **Dependencies**: Subscribe to budget tracker events

---

## Timeline & Effort

**Estimated Effort**: 8-12 hours

**Breakdown**:
- STRATEGIZE: 1h (this document)
- SPEC: 1h (acceptance criteria, schema definitions)
- PLAN: 1h (file map, integration points, rollback plan)
- THINK: 1h (edge cases, failure modes, tuning strategies)
- IMPLEMENT: 4-6h (BudgetTracker, enforcer integration, report generator)
- VERIFY: 1h (unit tests, integration tests, smoke tests)
- REVIEW: 1h (adversarial review, security audit)
- PR: 1h (commit, documentation, CI checks)
- MONITOR: 1h (dashboard setup, alert configuration)

**Dependencies**: None (all prerequisite systems exist)

**Risks**: Integration with WorkProcessEnforcer requires careful testing to avoid breaking existing phase transitions

---

## Autopilot Functionality Impact

**What Autopilot Behavior Changes:**

Before IMP-COST-01:
- Autopilot phases can consume unbounded tokens/time
- No financial guardrails → runaway costs possible
- No stop-loss → phases complete regardless of resource consumption
- All tasks treated equally regardless of importance or complexity

After IMP-COST-01:
- **Dynamic budget allocation**: Critical/complex tasks get more budget, simple/low-priority tasks get less
- **Phase-aware budgets**: THINK phase gets 1.5× budget (exploration), PR gets 0.6× (mechanical)
- **Stop-loss at VERIFY**: Tasks blocked if budgets exceeded (manual review required)
- **Budget transparency**: Evidence shows actual vs limit AND budget factors (complexity, importance, phase weight)
- **Cost predictability**: Budget breach rate metric tracks enforcement effectiveness
- **Intelligent resource allocation**: High-value work gets appropriate resources, low-value work stays constrained

**Example Behavior Change**:
- **Before**: Documentation task can consume same tokens as security fix (no differentiation)
- **After**:
  - Security fix (Critical, Large): THINK phase gets 18,000 tokens
  - Documentation (Low, Small): THINK phase gets 3,360 tokens
  - System automatically scales budgets to task needs

**Which Agent Behavior?**
- **WorkProcessEnforcer**: Now checks budgets before approving phase transitions
- **Task completion**: Tasks that exceed budgets require manual intervention (don't auto-complete)
- **Observability**: Budget metrics visible in monitoring dashboard

**Which Guardrail?**
- **Financial guardrail**: Prevents unbounded token consumption per task
- **Latency guardrail**: Prevents long-running phases from blocking queue

**Which Workflow?**
- **Standard task execution**: STRATEGIZE → MONITOR now includes budget checks at each phase
- **Budget breach handling**: New workflow for manual review and override approval

---

## Verification Strategy

**How to prove this works:**

1. **Smoke Test**: Run task with artificially low budget → verify VERIFY phase blocks
2. **Telemetry Check**: Budget metrics appear in OTel traces and JSONL sinks
3. **Evidence Artifact**: `budget_enforcement.json` exists and contains correct usage data
4. **Integration Test**: WorkProcessEnforcer correctly blocks/allows based on budget status
5. **Shadow Mode Baseline**: 2 weeks of shadow mode data shows realistic budget breach patterns

---

## Kill Triggers

**Abandon this work if:**
1. **Budget tracking overhead >200ms per phase** → unacceptable latency impact
2. **False positive rate >20%** → legitimate tasks blocked due to tracking errors
3. **Integration breaks existing functionality** → phase transitions fail, rollback required
4. **Shadow mode shows >30% breach rate** → budgets unrealistic, need redesign

---

## Next Steps

1. ✅ STRATEGIZE complete (this document)
2. → Proceed to SPEC: Define schema, acceptance criteria, verification plan
3. → Proceed to PLAN: Create file map, estimate change size, define rollback
