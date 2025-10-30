# IMP-COST-01 THINK: Assumptions Register

**Date**: 2025-10-29
**Task ID**: IMP-COST-01
**Phase**: THINK - Assumptions
**Status**: In Progress

---

## Purpose

Document all assumptions about system behavior, user behavior, environment, and dependencies. For each assumption, note validation method and risk if wrong.

---

## System Architecture Assumptions

### A1: Phase Ledger is Source of Truth

**Assumption**: Phase Ledger SQLite database is authoritative for task state, not WorkProcessEnforcer's in-memory state

**Rationale**: Persistent storage survives restarts, provides audit trail

**Validation**:
- Integration test: Kill process mid-phase → restart → verify state recovered from ledger
- Code review: Enforcer queries ledger on restart, not cache

**Risk if Wrong**:
- State loss on crash → tasks stuck in limbo
- Inconsistent state between enforcer and ledger → corruption

**Mitigation**: Document in DEVELOPER_GUIDE.md, add recovery procedures

---

### A2: Model Router Reports Token Usage Accurately

**Assumption**: Model router extracts token counts from LLM API responses and reports them to budget tracker

**Rationale**: OpenAI/Anthropic APIs include `usage.total_tokens` in responses

**Validation**:
- Unit test: Mock LLM response with usage data → verify tracker receives correct count
- Integration test: Real LLM call → verify tokens match API response

**Risk if Wrong**:
- Token tracking inaccurate → budgets meaningless
- Stop-loss based on bad data → false positives/negatives

**Mitigation**: Fallback to token estimation (prompt length / 4), flag as unreliable

---

### A3: SQLite Can Handle Concurrent Writes

**Assumption**: SQLite with WAL mode supports concurrent reads + single writer without significant lock contention

**Rationale**: Phase transitions are sequential per task (no concurrent writes to same task_id)

**Validation**:
- Load test: 50 tasks advancing phases concurrently → verify no lock timeouts
- Benchmark: Phase Ledger write latency under load

**Risk if Wrong**:
- Lock contention → phase transitions slow → queue backs up
- Write failures → state corruption

**Mitigation**: Use transactions, implement retry logic, consider PostgreSQL if SQLite insufficient

---

### A4: Config File Changes Rare

**Assumption**: `config/phase_budgets.yaml` updated infrequently (monthly or quarterly, not daily)

**Rationale**: Budget calibration is strategic decision, not operational

**Validation**:
- Document config change procedure in CONFIG_REFERENCE.md
- Monitor: Log every config reload, track frequency

**Risk if Wrong**:
- Frequent changes → in-flight tasks use stale config → confusion
- Config churn → budgets never stabilize → can't measure effectiveness

**Mitigation**: Config versioning, immutable budgets per task (snapshot at task start)

---

### A5: Phase Execution is Sequential

**Assumption**: Tasks execute phases in strict order (STRATEGIZE → SPEC → ... → MONITOR), never concurrently

**Rationale**: WorkProcessEnforcer uses lease mechanism to prevent concurrent phase execution

**Validation**:
- Integration test: Attempt to start IMPLEMENT while THINK running → expect error
- Code review: Lease acquisition before phase start

**Risk if Wrong**:
- Budget tracker confused (which phase is active?)
- Usage attributed to wrong phase
- Ledger corruption

**Mitigation**: Assert lease held before budget tracking starts, add concurrency guard in tracker

---

## User Behavior Assumptions

### A6: Developers Won't Systematically Game Importance

**Assumption**: Most developers will honestly classify task importance, not inflate to avoid stop-loss

**Rationale**: Developers generally act in good faith, want system to succeed

**Validation**:
- Monitor: Importance distribution (should be stable over time)
- Alert: If "Critical" tasks >10% (up from baseline 5%)

**Risk if Wrong**:
- Importance inflation → budget system ineffective
- All tasks get inflated budgets → no cost control

**Mitigation**: Importance governance (Task 0.8), require justification for Critical

---

### A7: Users Will Read Budget Reports

**Assumption**: Developers will review budget reports and adjust behavior based on insights

**Rationale**: Reports provide valuable feedback for improving efficiency

**Validation**:
- Survey: Ask developers "Do you read budget reports? Are they useful?"
- Telemetry: Track report access logs (how often opened?)

**Risk if Wrong**:
- Reports ignored → no feedback loop → system generates noise, not insights
- Budget overages not investigated → no learning

**Mitigation**: Workflow integration (Task 0.9), executive summaries, actionable insights

---

### A8: Tasks Can Be Classified by Complexity/Importance at Start

**Assumption**: Task complexity (Tiny/Small/Medium/Large) and importance (Low/Medium/High/Critical) are known when task starts

**Rationale**: Roadmap metadata includes this information

**Validation**:
- Audit: Check roadmap for missing complexity/importance fields
- Default: If missing, assume Medium complexity, Medium importance

**Risk if Wrong**:
- Missing metadata → incorrect budget calculation
- Task marked "Small" but actually "Large" → starved

**Mitigation**: Roadmap linter validates metadata presence, enforcer uses defaults gracefully

---

### A9: Stop-Loss Blocking is Acceptable UX

**Assumption**: Developers will accept tasks being blocked by stop-loss as necessary cost control

**Rationale**: Budgets are business necessity, occasional blocking is expected

**Validation**:
- User feedback: Collect reactions to first 10 stop-loss events
- Iterate: Adjust thresholds based on feedback

**Risk if Wrong**:
- Developers see blocking as punitive → circumvent system → loss of trust
- High friction → productivity decrease

**Mitigation**: Graduated response (warning before blocking), clear explanations, fast override path

---

## Environment Assumptions

### A10: LLM API Latency is <5s per Call

**Assumption**: Model router LLM calls complete in <5 seconds p95

**Rationale**: Typical API latency for OpenAI/Anthropic is 1-3 seconds

**Validation**:
- Benchmark: Measure actual LLM API latency under production load
- Monitor: Track p95 latency in telemetry

**Risk if Wrong**:
- Latency budgets too tight → false positives
- Tasks blocked due to API slowness, not actual complexity

**Mitigation**: Latency budgets calibrated to p95 API latency + buffer (not average)

---

### A11: Telemetry Backend Available 99% of Time

**Assumption**: OpenTelemetry collector / observability backend available for metric emission

**Rationale**: Observability infrastructure is production-grade

**Validation**:
- Monitor: Telemetry backend uptime SLA
- Test: Metric emission during backend downtime

**Risk if Wrong**:
- Budget metrics lost → monitoring blind
- Alerts not triggered → cost overruns undetected

**Mitigation**: Graceful degradation (don't block tasks on telemetry failure), retry with backoff

---

### A12: Disk Space Sufficient for Phase Ledger Growth

**Assumption**: Disk space for Phase Ledger SQLite database won't be exhausted (grows ~1KB per phase execution)

**Estimate**: 100,000 phase executions = 100MB

**Validation**:
- Monitor: Phase Ledger file size growth
- Alert: If database >1GB (indicates retention issue)

**Risk if Wrong**:
- Disk full → Phase Ledger writes fail → state corruption
- Database grows unbounded → performance degradation

**Mitigation**: Ledger retention policy (archive old tasks after 90 days), database size monitoring

---

## Technical Assumptions

### A13: Token Estimation Reasonably Accurate

**Assumption**: `(prompt.length + completion.length) / 4` estimates tokens within 20% accuracy

**Rationale**: Based on OpenAI's tokenizer (≈4 chars/token for English text)

**Validation**:
- Test: Compare estimated tokens vs actual for 100 LLM calls
- Measure: Error distribution (should be ≤20% error p95)

**Risk if Wrong**:
- Estimated tokens wildly inaccurate → budget enforcement unreliable when model router fails
- False positives/negatives on stop-loss

**Mitigation**: Improve estimation (use tiktoken library), flag estimated tokens as unreliable

---

### A14: Complexity Multipliers are Multiplicative, Not Additive

**Assumption**: Budget calculation uses multiplication (base × complexity × importance × phase_weight), not addition

**Rationale**: Multiplicative scales better (Large+Critical = 3× base, not +1.5+2.0)

**Validation**:
- Example verification: Large+Critical+THINK = 4000×1.5×2.0×1.5 = 18,000 (not 4000+1.5+2.0+1.5)

**Risk if Wrong**:
- Additive would under-allocate (Large+Critical would be ~4007 tokens, not 18,000)
- Complex tasks starved

**Mitigation**: Unit tests verify multiplicative formula, document in CONFIG_REFERENCE.md

---

### A15: Phase Weights Reflect Resource Intensity

**Assumption**: THINK and STRATEGIZE are most resource-intensive (1.5× weight), PR and MONITOR are lightest (0.6× weight)

**Rationale**: Research/exploration phases need more iterations, mechanical phases are quick

**Validation**:
- Baseline data collection (Task 0.1): Measure actual token usage per phase
- Calibrate: Adjust phase weights based on data

**Risk if Wrong**:
- Weights don't match reality → budgets misallocated
- Heavy phases starved, light phases over-provisioned

**Mitigation**: Data-driven calibration, allow phase-specific overrides

---

### A16: Base Budgets are Median, Not Mean

**Assumption**: Base budgets represent p50 (median) usage, not average (mean)

**Rationale**: Mean can be skewed by outliers, median more representative of typical task

**Validation**:
- Baseline data: Calculate both median and mean, use median for base budgets
- Document: CONFIG_REFERENCE.md explains why median chosen

**Risk if Wrong**:
- If using mean and distribution is skewed → base too high (overallocation) or too low (underallocation)

**Mitigation**: Use p75 (75th percentile) instead of p50 for buffer, document percentile in config

---

### A17: Stop-Loss Thresholds are Cumulative, Not Per-Phase

**Assumption**: Stop-loss checks cumulative usage across ALL phases (not individual phase breaches)

**Rationale**: Total cost matters more than individual phase overages

**Validation**:
- Code review: `getCumulativeBudgetUsage()` sums all phases
- Integration test: Phase breach doesn't trigger stop-loss, cumulative breach does

**Risk if Wrong**:
- Per-phase stop-loss too strict (THINK exceeds 150% → blocked, even if total <100%)
- Cumulative-only too lenient (every phase 120% → total 120% → not blocked, but waste)

**Mitigation**: Dual thresholds (per-phase warning at 150%, cumulative blocking at 120%)

---

## Dependency Assumptions

### A18: WorkProcessEnforcer is Single Writer to Phase Ledger

**Assumption**: Only WorkProcessEnforcer writes to Phase Ledger, all other components read-only

**Rationale**: Simplifies concurrency (no write conflicts), clear ownership

**Validation**:
- Code review: Grep for `ledger.write*` calls → should only be in work_process_enforcer.ts
- Access control: Phase Ledger could enforce this with database roles (if using PostgreSQL)

**Risk if Wrong**:
- Multiple writers → race conditions → corruption
- Difficult to debug (who wrote what?)

**Mitigation**: Document in DEVELOPER_GUIDE.md, add assertion in ledger (track caller)

---

### A19: Model Router Upgrade Won't Break Token Reporting

**Assumption**: Future model router changes will maintain token reporting interface

**Rationale**: Token usage is standard field in LLM APIs, unlikely to change

**Validation**:
- Integration test: Mock model router upgrade → verify budget tracker still works
- Monitor: Token reporting failures (should be ~0%)

**Risk if Wrong**:
- Router upgrade breaks tracking → budget enforcement blind
- No fallback → system unusable

**Mitigation**: Graceful degradation (fallback to estimation), version model router interface

---

### A20: OTel GenAI Conventions Support Budget Metrics

**Assumption**: OpenTelemetry GenAI semantic conventions allow budget-related metrics

**Rationale**: OTel GenAI spec includes token usage, latency, cost tracking

**Validation**:
- Review: OTel GenAI spec (https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- Verify: Attributes like `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` supported

**Risk if Wrong**:
- Custom metric schema → incompatible with standard tooling
- Can't use OTel ecosystem (Grafana, Prometheus integrations)

**Mitigation**: Use standard OTel GenAI conventions, extend with custom attributes if needed

---

## Assumptions Summary

| Category | Count | High Risk | Validation Method |
|----------|-------|-----------|-------------------|
| System Architecture | 5 | A2, A3 | Integration tests, load tests |
| User Behavior | 4 | A6, A7 | Monitoring, surveys |
| Environment | 3 | A11 | Uptime monitoring |
| Technical | 7 | A15, A16 | Baseline data collection |
| Dependency | 3 | A19 | Integration tests |

**Total Assumptions**: 20

**High Risk Assumptions** (must validate early):
- **A2**: Model router reports tokens accurately → Integration test (Task 4)
- **A3**: SQLite handles concurrent writes → Load test (Task 0.6)
- **A6**: Developers won't game importance → Monitoring (Task 0.8)
- **A15**: Phase weights reflect resource intensity → Baseline data (Task 0.1)
- **A16**: Base budgets are median, not mean → Baseline data (Task 0.1)
- **A19**: Model router upgrade won't break → Integration test (Task 4)

**Medium Risk Assumptions** (monitor post-deployment):
- **A7**: Users will read reports → Task 0.9 (workflow integration)
- **A9**: Stop-loss blocking acceptable UX → User feedback
- **A11**: Telemetry backend available → Graceful degradation

**Low Risk Assumptions** (document and accept):
- **A1, A4, A5, A8, A10, A12, A13, A14, A17, A18, A20**: Low likelihood of being wrong, mitigations in place

---

## Assumption Validation Plan

**Pre-Implementation** (THINK phase):
- [x] Document all assumptions (this document)
- [ ] Identify high-risk assumptions (A2, A3, A6, A15, A16, A19)
- [ ] Design validation tests for high-risk assumptions

**During Implementation**:
- [ ] Task 0.1 (Baseline Data): Validate A15, A16 (phase weights, base budgets)
- [ ] Task 0.6 (Load Testing): Validate A3 (SQLite concurrent writes)
- [ ] Task 4 (Model Router Integration): Validate A2, A19 (token reporting)

**Post-Deployment**:
- [ ] Week 1: Monitor A6 (importance distribution), A11 (telemetry uptime)
- [ ] Week 2: Survey users for A7 (report readability), A9 (stop-loss UX)
- [ ] Month 1: Review all assumptions, update based on production data

---

## Invalidated Assumptions (Update as Learned)

**Template**:
```
### AX: [Assumption]
**Date Invalidated**: YYYY-MM-DD
**How Discovered**: [Production incident, testing, monitoring, etc.]
**Impact**: [What broke, what was affected]
**Corrective Action**: [How assumption updated, what changed in system]
```

*No invalidated assumptions yet (pre-deployment)*

---

## THINK - Assumptions Complete

**Status**: ✅ Assumptions register complete (20 assumptions documented, 6 high-risk identified)

**THINK Phase Complete**:
- [x] Edge cases analyzed (23 cases)
- [x] Pre-mortem conducted (8 failure scenarios, 10 mitigation tasks)
- [x] Assumptions documented (20 assumptions, validation plan)

**Next Phase**: IMPLEMENT

---

## 🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
