# IMP-COST-01 THINK: Pre-Mortem

**Date**: 2025-10-29
**Task ID**: IMP-COST-01
**Phase**: THINK - Pre-Mortem
**Status**: In Progress

---

## Pre-Mortem Purpose

Imagine it's 4 weeks post-deployment. IMP-COST-01 has **FAILED**. What went wrong? This pre-mortem identifies likely failure modes and prevention strategies.

---

## Failure Scenario 1: Budget Miscalibration → Task Starvation

### The Failure

**Timeline**:
- Week 1: Budget system deployed with calculated limits
- Week 2: 40% of tasks trigger stop-loss (should be <5%)
- Week 3: Developers create override for every task (budget system bypassed)
- Week 4: System abandoned - "budgets are unrealistic, we ignore them"

### Root Cause

**What Happened**: Base budgets and multipliers WRONG for real task complexity

**Specific Causes**:
1. **Base budgets too low**: THINK allocated 4,000 tokens, but typical THINK consumes 8,000
2. **Complexity multipliers insufficient**: "Large" tasks need 3× budget, not 1.5×
3. **Didn't account for backtracking**: Tasks that backtrack from IMPLEMENT to PLAN consume 2-3× expected budget

**Why We Didn't Catch It**:
- No baseline data collection (went straight to enforcement)
- Didn't test on representative sample of historical tasks
- Overestimated our ability to predict complexity

### Prevention

**Before Deployment**:
1. **Baseline Data Collection** (new Task 0.1):
   - Instrument existing autopilot with token tracking (no enforcement)
   - Run for 2 weeks on production workload
   - Collect p50, p90, p99 token usage per phase
   - Calibrate base budgets to p75 (not p50 - allow headroom)

2. **Historical Replay Test** (new Task 0.2):
   - Select 50 completed tasks (mix of complexity/importance)
   - Replay with budget system enabled (observe mode)
   - Measure false positive rate: how many would have been blocked?
   - Target: <5% false positive rate before enforcement

3. **Tuning Phase in Rollout Plan**:
   - Week 1: Observe mode (0% enforcement)
   - Week 2: Analyze data, adjust multipliers
   - Week 3: Enforce mode (low/medium priority only)
   - Week 4+: Full enforcement

**Monitoring**:
- Alert if stop-loss trigger rate >10% (expected <5%)
- Weekly review of blocked tasks (are they legitimate overages or miscalibration?)
- Dashboard: Budget utilization distribution (should be bell curve around 70-80%)

**Escape Hatch**:
- Fast override mechanism: Add `budget_multiplier: 2.0` to task metadata → doubles all limits
- Emergency config update: Increase base budgets globally
- Kill switch: `DISABLE_BUDGET_ENFORCEMENT=1` environment variable

---

## Failure Scenario 2: False Positive Epidemic → Lost Trust

### The Failure

**Timeline**:
- Week 1: Budget enforcement enabled
- Week 2: 15 tasks blocked by stop-loss (8 legitimate, 7 false positives)
- Week 3: Developers distrust system, request overrides preemptively
- Week 4: System perceived as "bureaucracy", bypassed whenever possible

### Root Cause

**What Happened**: Legitimate complex work blocked due to overly aggressive thresholds

**Specific Causes**:
1. **Stop-loss threshold too tight**: 1.2× cumulative budget triggers for normal variance
2. **Didn't account for research-heavy tasks**: Some THINK phases legitimately need 3-5× average budget
3. **No context for "why breach occurred"**: Reports show "budget exceeded" but not "because 10 edge cases discovered in THINK"

**Why We Didn't Catch It**:
- Tested on "typical" tasks, not edge cases (novel features, research spikes)
- Assumed variance is low (actually high for creative work)

### Prevention

**Threshold Adjustment**:
1. **Looser Stop-Loss** (update SPEC):
   - Cumulative: 1.5× instead of 1.2× (50% overage allowed)
   - Per-phase: 2.0× instead of 1.5× (100% overage allowed)
   - Rationale: Better to miss some cost overruns than block legitimate work

2. **Contextual Budgets** (future: IMP-COST-02):
   - Track "progress per token" in THINK phase
   - If high progress (many insights, edge cases found) → increase budget dynamically
   - If low progress ("spinning wheels") → enforce strictly

**Better Reporting**:
3. **Explain Budget Breaches** (new Task 0.3):
   - Budget report includes "Why did this phase exceed budget?"
   - Heuristics:
     - High token count + many file reads → "Extensive research"
     - High token count + repeated LLM calls → "Refinement/iteration"
     - High token count + minimal output → "Inefficient, needs investigation"
   - Helps distinguish legitimate complexity from waste

**Feedback Loop**:
4. **False Positive Reporting** (new Task 0.4):
   - When task blocked, prompt: "Was this a false positive? (Y/N)"
   - Track FP rate by complexity/importance tier
   - Auto-adjust thresholds if FP rate >5% for any tier

**Monitoring**:
- Weekly FP review meeting (first 4 weeks post-deployment)
- Dashboard: FP rate by task type, complexity, phase
- Alert: If FP rate >10% in any category

---

## Failure Scenario 3: Performance Death Spiral → System Disabled

### The Failure

**Timeline**:
- Week 1: Budget system deployed, performance acceptable
- Week 2: Task queue length increases (from 5 to 20 tasks)
- Week 3: Budget tracking overhead compounds, queue length 50 tasks
- Week 4: System disabled due to unacceptable latency

### Root Cause

**What Happened**: Budget tracking adds enough overhead that tasks slow down → queue backs up → more concurrent tracking → more overhead (positive feedback loop)

**Specific Causes**:
1. **Synchronous Database Writes**: Phase Ledger writes block phase transitions (10ms → 50ms at high load)
2. **Telemetry Emission Blocking**: OTel metric emission blocks (network delays)
3. **Report Generation Overhead**: VERIFY phase blocked by 500ms report generation
4. **Budget Calculation in Hot Path**: Repeated calculation instead of caching

**Why We Didn't Catch It**:
- Load testing not performed (tested single task, not 50 concurrent)
- Didn't measure cumulative overhead across all phases
- Optimistic about async telemetry (wasn't truly async)

### Prevention

**Performance Requirements** (update AC9):
1. **Strict Latency Budgets**:
   - Token tracking: <2ms per phase (down from 5ms)
   - Latency tracking: <0.5ms per phase (down from 1ms)
   - Budget calculation: <5ms per task (cached)
   - Report generation: <50ms per task (async, non-blocking)

2. **Async Everything** (new Task 0.5):
   - Phase Ledger writes: Fire-and-forget with background flush
   - Telemetry emission: Buffer metrics, flush every 10s
   - Report generation: Async (don't block VERIFY)
   - Budget calculation: Eager caching at task start

3. **Load Testing** (new Task 0.6):
   - Simulate 50 concurrent tasks
   - Measure: Phase transition latency, task completion time, queue depth
   - Target: <5% latency increase vs no budget system
   - Benchmark before deployment

**Monitoring**:
- Dashboard: Phase transition latency (p50, p95, p99)
- Alert: If p95 latency >120% baseline
- Alert: If queue depth >30 tasks (indicates backlog)

**Circuit Breaker**:
- If phase transition latency >200% baseline for >10min → auto-disable budget enforcement
- Emit critical alert: "Budget system disabled due to performance degradation"
- Investigate, optimize, re-enable

---

## Failure Scenario 4: Integration Hell → Corrupted State

### The Failure

**Timeline**:
- Week 1: Budget system deployed
- Week 2: Intermittent Phase Ledger corruption (5 incidents)
- Week 3: Tasks stuck in limbo (can't advance, can't backtrack)
- Week 4: Emergency rollback, data recovery required

### Root Cause

**What Happened**: Budget system and Phase Ledger/WorkProcessEnforcer had race conditions, corrupted task state

**Specific Causes**:
1. **Concurrent Writes**: Budget tracker and enforcer write to Phase Ledger simultaneously → SQLite lock conflicts
2. **Inconsistent State**: Enforcer thinks phase ended, but ledger write failed → tracker out of sync
3. **No Transactions**: Multi-step operations (end phase, write budget, start next phase) not atomic

**Why We Didn't Catch It**:
- Integration tests ran sequentially (no concurrency)
- Didn't test failure scenarios (write failures, lock timeouts)
- Assumed SQLite would "just work" under contention

### Prevention

**Atomic Operations** (new Task 0.7):
1. **Database Transactions**:
   - Phase transitions wrapped in BEGIN...COMMIT
   - Budget writes and phase state updates atomic
   - Rollback on any failure

2. **Locking Strategy**:
   - Phase Ledger: Exclusive lock per task_id (not global)
   - Budget tracker: Only queries ledger, doesn't write directly (enforcer writes)
   - Clear ownership: WorkProcessEnforcer is writer, others are readers

3. **Idempotency**:
   - Phase start/end operations idempotent (safe to retry)
   - Deduplicate by (task_id, phase, attempt_number)

**Integration Testing** (update Task 5 verification):
1. **Concurrency Tests**:
   - Simulate 10 tasks advancing phases simultaneously
   - Inject write failures, lock timeouts
   - Verify: No corruption, no lost data, no stuck tasks

2. **Chaos Testing**:
   - Kill process mid-phase transition
   - Restart, verify task recovers correctly
   - Budget data consistent

**Monitoring**:
- Alert: Phase Ledger write failures (should be ~0/day)
- Alert: Tasks stuck in single phase >4 hours
- Dashboard: Ledger operation latency (detect lock contention)

**Recovery Mechanism**:
- Task recovery command: `tools/wvo_mcp/scripts/recover_stuck_task.ts --task-id TASK-123`
- Inspects ledger state, detects inconsistencies, repairs
- Document recovery procedures in TROUBLESHOOTING.md

---

## Failure Scenario 5: Cost Savings Mirage → No Actual Savings

### The Failure

**Timeline**:
- Week 4: Post-deployment analysis shows...
- **Token usage: DOWN 2%** (goal was 15-25%)
- **Task completion time: UP 5%** (goal was 10-20% reduction)
- **Conclusion**: System added overhead without delivering savings

### Root Cause

**What Happened**: Budget system blocked runaway tasks BUT also introduced overhead that canceled savings

**Specific Causes**:
1. **Few Runaway Tasks**: Pre-deployment, only 2-3% of tasks were runaways (most were efficient)
2. **Overhead Hit All Tasks**: 100% of tasks pay overhead cost, only 2-3% benefit from enforcement
3. **Savings Overestimated**: Assumed 30% of tasks had waste (actually 5%)

**Why We Didn't Catch It**:
- No baseline measurement of actual runaway task frequency
- Optimistic assumptions about waste prevalence
- Didn't model overhead impact on efficient tasks

### Prevention

**Realistic Goals** (update success metrics):
1. **Conservative Savings Targets**:
   - Token reduction: 5-10% (not 15-25%)
   - Latency improvement: 5-10% (not 10-20%)
   - Rationale: Most tasks already efficient, low-hanging fruit picked

2. **Overhead Minimization** (see Scenario 3 prevention):
   - Performance budget: <2% latency increase per task
   - If savings <2×overhead → not worth it

**Measurement**:
3. **Baseline Data Collection** (Task 0.1):
   - Before deployment: Measure current token usage, task latency, runaway frequency
   - After deployment: Compare apples-to-apples
   - Calculate ROI: (savings - overhead) / implementation cost

4. **Runaway Detection First** (alternative approach):
   - Phase 1: Just DETECT runaway tasks (no enforcement)
   - Analyze: How many, what patterns, what phases
   - Phase 2: Enforce IF runaway rate >10%
   - If runaway rate <5% → maybe budgets not needed (just alert on outliers)

**Honest Evaluation**:
- Success metric: "Budget system ROI >3×" (savings worth implementation cost)
- If ROI <2× after 4 weeks → consider sunsetting feature
- Document learnings for IMP-COST-02 (progress-based approach may have better ROI)

---

## Failure Scenario 6: Stop-Loss Gaming → Perverse Incentives

### The Failure

**Timeline**:
- Week 2: Developers learn that "Critical" tasks get 2× budget multiplier
- Week 3: 80% of tasks marked as "Critical" (up from 20%)
- Week 4: Budget system ineffective, all tasks have inflated limits

### Root Cause

**What Happened**: Developers gamed the system by inflating task importance to avoid stop-loss

**Specific Causes**:
1. **No Importance Governance**: Any developer can mark task as "Critical" in roadmap
2. **No Audit Trail**: Importance changes not logged, no accountability
3. **Perverse Incentive**: Blocking task (stop-loss) hurts developer more than inflating importance

**Why We Didn't Catch It**:
- Assumed developers would self-regulate
- No monitoring of importance distribution drift
- Didn't anticipate strategic behavior

### Prevention

**Importance Governance** (new Task 0.8):
1. **Importance Definition**:
   - **Critical**: Security vulnerabilities, data loss prevention, system outages (expect <5% of tasks)
   - **High**: User-facing features, performance improvements (expect <20% of tasks)
   - **Medium**: Internal tooling, refactoring (expect ~60% of tasks)
   - **Low**: Documentation, cleanup, nice-to-haves (expect ~15% of tasks)

2. **Approval Required for Critical**:
   - Tasks marked "Critical" require explicit justification in roadmap
   - Supervisor agent validates justification (or flags for human review)
   - Log: Who marked task as Critical, when, why

3. **Importance Drift Detection**:
   - Monitor: Importance distribution over time
   - Alert: If "Critical" tasks >10% (up from baseline 5%)
   - Weekly review: Are these tasks truly critical?

**Incentive Alignment**:
4. **Budget Overages Not Blocked Harshly**:
   - Instead of hard stop-loss, use graduated response:
     - 1.0-1.2× budget: Continue, no action
     - 1.2-1.5× budget: Continue, emit warning, log for review
     - 1.5-2.0× budget: Continue, require post-mortem (why overage?)
     - >2.0× budget: Block, require investigation
   - Reduces incentive to game importance

5. **Transparency**:
   - Dashboard: Budget utilization by task, developer, team
   - Peer visibility (not to shame, but to calibrate expectations)
   - Celebrate efficient tasks (gamify in positive direction)

**Monitoring**:
- Alert: Task importance changed from Low→Critical (unusual)
- Dashboard: Importance distribution trend (detect inflation)
- Monthly review: Are budgets being gamed?

---

## Failure Scenario 7: Budget Reports Ignored → No Feedback Loop

### The Failure

**Timeline**:
- Week 1: Budget reports generated for all tasks
- Week 2: Reports filed in evidence/, nobody reads them
- Week 4: System generates data but provides no insights

### Root Cause

**What Happened**: Budget reports too detailed, no actionable insights, not integrated into workflow

**Specific Causes**:
1. **Information Overload**: Report is 500-line markdown with every detail
2. **No Actionability**: Says "THINK used 5,234 tokens" but not "THINK was inefficient because..."
3. **Not in Workflow**: Report buried in evidence/, no notification or dashboard

**Why We Didn't Catch It**:
- Assumed developers would proactively read evidence documents (they don't)
- No user research on what information is actually useful

### Prevention

**Actionable Insights** (new Task 0.9):
1. **Executive Summary**:
   - Top of report: 3-line summary
     - "✅ Task completed within budget (78% utilized)"
     - "⚠️ THINK phase took 2× expected budget - investigate"
     - "💡 Recommendation: Increase THINK base budget for research tasks"

2. **Anomaly Detection**:
   - Highlight phases that were unusual (>150% or <50% of predicted)
   - Suggest investigation: "IMPLEMENT took 200% budget - why?"
   - Link to potential causes: "High file count, many LLM iterations, backtracking?"

3. **Trends**:
   - Show task's budget usage compared to similar tasks
   - "This THINK phase: 5,234 tokens. Average for Medium complexity: 3,500 tokens. You're 50% above average."

**Workflow Integration**:
4. **VERIFY Phase Gate** (update Task 5):
   - VERIFY displays budget summary (not full report)
   - If any phase >150% budget → prompt for explanation
   - Explanation added to report (human-in-loop)

5. **Dashboard**:
   - Real-time dashboard: Current task budget status
   - Notification: "⚠️ THINK phase at 90% budget, consider wrapping up"
   - Post-task: Link to budget report in task completion notification

**Continuous Improvement**:
6. **Monthly Budget Review**:
   - Aggregate reports: Which phases consistently over/under budget?
   - Adjust base budgets based on aggregate data
   - Document changes: "Increased THINK budget from 4,000→5,000 due to consistent overages"

---

## Failure Scenario 8: Security/Privacy Breach → Budget Data Leakage

### The Failure

**Timeline**:
- Week 2: Budget report accidentally committed to public repo
- Report contains: Task IDs, token counts, latencies, phase details
- **Privacy Issue**: Token counts reveal complexity of internal projects (competitive intel)

### Root Cause

**What Happened**: Budget reports treated as "just metadata" but actually contain sensitive information

**Specific Causes**:
1. **No Sensitivity Classification**: Didn't consider budget data as sensitive
2. **Evidence Directory Not Protected**: `state/evidence/` not in `.gitignore`
3. **No Redaction**: Reports contain raw task IDs that may be sensitive

**Why We Didn't Catch It**:
- Security review didn't include budget system (seemed benign)
- Didn't threat model: "What if budget data is leaked?"

### Prevention

**Data Classification** (new Task 0.10):
1. **Budget Data = Internal**:
   - Classification: Internal (not public, not confidential, but not for external sharing)
   - Rationale: Token counts reveal project complexity, priorities

2. **Redaction for External Sharing**:
   - If sharing reports externally: Redact task IDs, aggregate data
   - Example: "Medium complexity task, 12,500 tokens" (not "IMP-COST-01, 12,500 tokens")

**Access Control**:
3. **Evidence Directory Protection**:
   - `state/evidence/` in `.gitignore` (never committed)
   - Stored separately from code (e.g., S3 bucket with access controls)
   - Telemetry data encrypted at rest

4. **Report Access Logs**:
   - Log: Who accessed which budget report, when
   - Alert: Unusual access patterns (external IP, bulk downloads)

**Security Review**:
5. **Include Budget System in Security Audits**:
   - Threat model: Data leakage, tampering, injection attacks
   - Review: Config file security (can attacker modify budgets?), database security (can attacker corrupt ledger?)

---

## Pre-Mortem Summary

| Scenario | Root Cause | Top Prevention | New Task |
|----------|-----------|----------------|----------|
| 1. Task Starvation | Budgets miscalibrated | Baseline data collection, historical replay | Task 0.1, 0.2 |
| 2. False Positive Epidemic | Thresholds too tight | Looser stop-loss (1.5×), FP reporting | Task 0.3, 0.4 |
| 3. Performance Death Spiral | Overhead compounds | Async everything, load testing | Task 0.5, 0.6 |
| 4. Integration Hell | Race conditions | Atomic transactions, concurrency tests | Task 0.7 |
| 5. Cost Savings Mirage | Overhead > savings | Conservative goals, baseline measurement | Task 0.1 (reuse) |
| 6. Stop-Loss Gaming | Importance inflation | Importance governance, drift detection | Task 0.8 |
| 7. Reports Ignored | No actionable insights | Executive summary, workflow integration | Task 0.9 |
| 8. Security Breach | Budget data leakage | Data classification, access controls | Task 0.10 |

**Critical New Tasks** (must complete before deployment):
- **Task 0.1**: Baseline data collection (prevents Scenarios 1, 5)
- **Task 0.2**: Historical replay test (prevents Scenario 1)
- **Task 0.5**: Async everything (prevents Scenario 3)
- **Task 0.6**: Load testing (prevents Scenario 3)
- **Task 0.7**: Atomic transactions (prevents Scenario 4)

**Important New Tasks** (complete if time permits):
- **Task 0.3**: Explain budget breaches (prevents Scenario 2)
- **Task 0.4**: False positive reporting (prevents Scenario 2)
- **Task 0.8**: Importance governance (prevents Scenario 6)
- **Task 0.9**: Actionable insights (prevents Scenario 7)
- **Task 0.10**: Data classification (prevents Scenario 8)

**Total New Tasks from Pre-Mortem**: 10 tasks (~8-10 hours additional effort)

---

## Updated Implementation Plan

**Original Plan**: 8 tasks, 13 hours
**Pre-Mortem Additions**: 10 tasks, 8-10 hours
**New Total**: 18 tasks, 21-23 hours

**Critical Path**:
1. Task 0.1: Baseline data collection (2h)
2. Task 0.2: Historical replay test (2h)
3. Tasks 1-4: Config, Calculator, Ledger, Router (7h)
4. Task 0.7: Atomic transactions (1h)
5. Task 0.5: Async everything (1h)
6. Task 5: WorkProcessEnforcer integration (2h)
7. Task 0.6: Load testing (1h)
8. Tasks 6-8: Reports, Telemetry, Docs (4h)
9. Optional: Tasks 0.3, 0.4, 0.8, 0.9, 0.10 (5h)

**Staged Approach**:
- **Phase 1 (MVP)**: Tasks 0.1, 0.2, 1-8, 0.5, 0.6, 0.7 (18 hours) - Core functionality + critical mitigations
- **Phase 2 (Hardening)**: Tasks 0.3, 0.4, 0.8, 0.9, 0.10 (5 hours) - Additional mitigations

**Recommendation**: Complete Phase 1 in IMP-COST-01, defer Phase 2 to IMP-COST-01.1 (quick follow-up)

---

## Lessons from Pre-Mortem

1. **Baseline Data is Critical**: Can't set budgets without knowing current usage
2. **Conservative Thresholds**: Better to under-enforce than over-enforce (trust takes time to build, seconds to lose)
3. **Performance is Non-Negotiable**: Overhead must be <2% or system will be disabled
4. **Atomic Operations Essential**: Race conditions in state management = disaster
5. **Gaming is Inevitable**: Any system will be gamed, design for it
6. **Reports Must Be Actionable**: Data without insights is noise
7. **Security Review Everything**: Even "benign" metadata can be sensitive

---

## THINK - Pre-Mortem Complete

**Status**: ✅ Pre-mortem conducted (8 failure scenarios, 10 mitigation tasks)
**Next**: Assumptions register

---

## 🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
