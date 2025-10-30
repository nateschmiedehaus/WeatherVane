# PRE-MORTEM: WorkProcessEnforcer Quality Integration

**Task**: FIX-INTEGRATION-WorkProcessEnforcer
**Date**: 2025-10-30
**Complexity**: 8/10 (Pre-mortem REQUIRED)
**Phase**: THINK

---

## Pre-Mortem Exercise

**Scenario**: It's 3 months from now. The WorkProcessEnforcer quality integration has been deployed, and it **FAILED CATASTROPHICALLY**. The autopilot is unusable, quality checks are disabled, and we've reverted the integration.

**Exercise**: What went wrong? Imagine the worst outcomes and work backwards to identify preventable failures.

---

## Failure Scenario 1: False Positive Storm

### What Happened
**Timeline**:
- Week 1: Deployed in enforce mode (skipped shadow/observe)
- Week 2: 80% of tasks blocked by quality checks
- Week 3: Agents find workarounds (disable checks, skip evidence)
- Week 4: Reverted integration, trust in quality system destroyed

**Root Causes**:
1. Quality gates too strict (file size limit 500 lines unrealistic for some modules)
2. Reasoning checks expect all 9 phases always (some tasks legitimately skip phases)
3. No tuning period (went straight to enforce mode)
4. No false positive tracking or override mechanism

**Warning Signs Missed**:
- Shadow mode telemetry showed 30% failure rate (ignored)
- Agent complaints about unrealistic expectations (dismissed)
- Quality gate thresholds never validated against real codebase

### Prevention (Task 0.1: False Positive Tuning)
**Actions Before Deployment**:
- MANDATORY: 1-2 week shadow mode period
- Analyze shadow mode failures: separate false positives from real issues
- Tune thresholds: adjust file size, coverage, TODO density based on data
- Add override mechanism: allow legitimate exceptions

**Success Criteria**:
- False positive rate <10% in shadow mode
- Real issues >50% of detections
- Agent satisfaction survey >80%

**Owner**: Before enforce mode rollout
**Cost**: 2 hours tuning + 1 week monitoring

---

## Failure Scenario 2: Performance Death Spiral

### What Happened
**Timeline**:
- Week 1: Integration deployed, autopilot slows to 2x normal duration
- Week 2: Quality checks timing out frequently (>50% timeout rate)
- Week 3: Fail-safe mode means checks never block, defeating purpose
- Week 4: Quality integration effectively disabled

**Root Causes**:
1. Quality checks take 5-10 minutes each (not 15-30s as assumed)
2. No parallelization (checks run serially)
3. Timeouts too aggressive for large codebases
4. No caching (same check run multiple times)

**Warning Signs Missed**:
- Manual testing only on small test tasks
- Didn't test on real production tasks (1000+ file repos)
- Telemetry showed p95 execution time 5x target (ignored)
- Timeout rate climbing >10% (no alerts)

### Prevention (Task 0.2: Performance Benchmarking)
**Actions Before Deployment**:
- Benchmark on real production tasks (not TEST-QA-001)
- Test on codebase at scale (10K+ files, 100K+ LOC)
- Measure execution time distribution (p50, p95, p99)
- Set timeout based on real p95, not assumptions

**Mitigation During Deployment**:
- Monitor timeout rate: alert if >5%
- Gradual timeout increase: start 30s, raise to 60s if needed
- Implement caching: skip check if passed <1 hour ago
- Parallelize checks: run preflight/quality/reasoning concurrently where safe

**Success Criteria**:
- p95 execution time within targets (30s/15s/20s)
- Timeout rate <1%
- Total workflow overhead <5 min

**Owner**: Before shadow mode rollout
**Cost**: 3 hours benchmarking + 2 hours optimization

---

## Failure Scenario 3: Integration Bugs Break Autopilot

### What Happened
**Timeline**:
- Day 1: Integration deployed, autopilot starts crashing
- Day 2: 50% of tasks fail with "TypeError: Cannot read property 'passed' of undefined"
- Day 3: Emergency rollback, autopilot operational but quality checks disabled
- Day 4: Investigation reveals runCheck returns undefined on error

**Root Causes**:
1. Error handling incomplete (uncaught exceptions in quality integration)
2. Null/undefined checks missing (assumed result always returned)
3. Integration tests didn't cover error paths
4. No feature flag to disable (hard-coded integration)

**Warning Signs Missed**:
- Unit tests only covered happy path
- Integration tests used mocks, not real scripts
- No testing with failing scripts or timeouts
- Feature flag existed but not tested

### Prevention (Task 0.3: Comprehensive Error Testing)
**Actions Before Deployment**:
- Test ALL error paths: script not found, timeout, invalid JSON, exit code >0
- Test with real scripts (not just mocks)
- Verify fail-safe behavior: errors never throw, always return result
- Test feature flag disable: ensure autopilot works with checks disabled

**Mitigation During Deployment**:
- Deploy with feature flag OFF initially
- Enable in shadow mode first (no blocking)
- Monitor autopilot error rate: alert if >baseline+5%
- Keep rollback procedure ready (disable flag → restart)

**Success Criteria**:
- Zero autopilot crashes in 100 test runs
- All error paths tested and passing
- Feature flag disable verified functional

**Owner**: During testing phase (before merge)
**Cost**: 1 hour additional testing

---

## Failure Scenario 4: Silent Failures (Fail-Safe Too Effective)

### What Happened
**Timeline**:
- Week 1-4: Integration running smoothly, no complaints
- Week 5: Manual audit discovers quality has degraded
- Week 6: Investigation reveals checks timing out 80% of time
- Week 7: Fail-safe mode meant no blocks, quality violations accumulated

**Root Causes**:
1. Fail-safe mode too permissive (timeouts/errors never block)
2. No alerting on high timeout/error rates
3. Telemetry collected but never reviewed
4. False sense of security ("checks running" ≠ "checks working")

**Warning Signs Missed**:
- Telemetry showed 80% timeout rate (nobody checked)
- Dashboard existed but not monitored
- No alerts configured for anomalies
- Assumed "no complaints" meant "working well"

### Prevention (Task 0.4: Monitoring & Alerting)
**Actions Before Deployment**:
- Configure alerts: timeout rate >10%, error rate >5%, check run rate <80%
- Create monitoring dashboard: track pass/fail/timeout/error rates
- Weekly review schedule: analyze telemetry trends
- Escalation policy: if anomalies persist >3 days, investigate

**Mitigation During Deployment**:
- Daily monitoring first 2 weeks
- Alert immediately on timeout rate spikes
- Adjust timeouts or disable checks if fail-safe mode >50%

**Success Criteria**:
- Alerts configured and tested
- Dashboard reviewed weekly
- Timeout rate stays <5%
- Check execution rate >95%

**Owner**: Before shadow mode rollout
**Cost**: 2 hours setup + 30 min/week monitoring

---

## Failure Scenario 5: Script Incompatibility

### What Happened
**Timeline**:
- Day 1: Integration deployed on production
- Day 2: Quality checks fail on Windows agents (bash not available)
- Day 3: Quality checks fail on Docker containers (missing dependencies)
- Day 4: Quality checks disabled for non-macOS environments

**Root Causes**:
1. Scripts assume macOS environment (bash, grep, awk)
2. No testing on other platforms
3. Hard-coded paths (/tmp/, absolute script paths)
4. Missing dependency checks (jq, shellcheck)

**Warning Signs Missed**:
- Only tested on dev Mac laptops
- Didn't validate in CI environment
- No cross-platform compatibility testing
- Assumed "works on my machine" = "works everywhere"

### Prevention (Task 0.5: Cross-Platform Testing)
**Actions Before Deployment**:
- Test on all target platforms: macOS, Linux, Docker containers
- Validate script dependencies: bash, jq, shellcheck, node
- Use portable paths: prefer relative paths, cross-platform temp dirs
- Document platform requirements in README

**Mitigation During Deployment**:
- Platform detection: check OS before running scripts
- Graceful degradation: disable checks on unsupported platforms
- Clear error messages: "Quality checks require bash (macOS/Linux only)"

**Success Criteria**:
- Scripts work on macOS, Linux (ubuntu)
- Docker container compatibility tested
- Platform requirements documented

**Owner**: Before merge (testing phase)
**Cost**: 1 hour cross-platform testing

---

## Failure Scenario 6: Autopilot Success Rate Drops

### What Happened
**Timeline**:
- Week 1: Baseline autopilot success rate 92%
- Week 2: Integration deployed in enforce mode
- Week 3: Success rate drops to 75%
- Week 4: Investigation reveals legitimate tasks blocked by overly strict gates

**Root Causes**:
1. Quality gates too strict for exploratory/research tasks
2. Reasoning validation expects all phases (some tasks skip legitimately)
3. No task-type exceptions (treat all tasks identically)
4. Enforcement too aggressive (no gradual rollout)

**Warning Signs Missed**:
- Shadow mode showed blocks would occur (ignored as "working as intended")
- Agent logs showed blocked tasks were legitimate
- No analysis of WHAT was blocked (assumed all bad work)
- Success rate drop not monitored

### Prevention (Task 0.6: Task-Type Exemptions)
**Actions Before Deployment**:
- Analyze task types: which legitimately skip phases? (research, exploration, spikes)
- Add task-type metadata to roadmap: type: 'feature' | 'research' | 'spike'
- Implement exemptions: research tasks have relaxed reasoning requirements
- Track blocked tasks: analyze legitimacy before enforce mode

**Mitigation During Deployment**:
- Monitor success rate: alert if drops >5% from baseline
- Analyze blocked tasks: separate false positives from real issues
- Adjust gates: relax for task types with high false positive rate
- Gradual rollout: 10% enforce, monitor, increase to 100%

**Success Criteria**:
- Success rate maintained >90%
- Blocked tasks >80% legitimate failures
- Task-type exemptions implemented

**Owner**: Before enforce mode rollout
**Cost**: 2 hours task-type analysis + 1 hour exemptions

---

## Failure Scenario 7: Knowledge Loss (Undocumented Integration)

### What Happened
**Timeline**:
- Month 1: Integration working, deployed in shadow mode
- Month 2: Original developer unavailable
- Month 3: New developer needs to modify integration, can't understand it
- Month 4: Broken changes deployed, autopilot crashes

**Root Causes**:
1. Insufficient inline documentation (no JSDoc comments)
2. Complex logic not explained (fail-safe mode, mode switching)
3. Configuration not documented (feature flags, timeouts)
4. No runbook for common issues

**Warning Signs Missed**:
- Code review didn't check documentation
- No knowledge transfer session
- Assumed "code is self-documenting"
- No troubleshooting guide

### Prevention (Task 0.7: Comprehensive Documentation)
**Actions Before Deployment**:
- Add JSDoc to all public methods (with examples)
- Document complex logic inline (why, not just what)
- Create runbook: common issues + solutions
- Update CLAUDE.md: explain integration architecture

**Mitigation After Deployment**:
- Knowledge transfer session: walk through code with team
- Video recording: architecture explanation
- FAQ document: common questions + answers

**Success Criteria**:
- 100% JSDoc coverage for public APIs
- Runbook covers 5+ common issues
- New developer can understand integration in <1 hour

**Owner**: During documentation phase (before merge)
**Cost**: 1 hour additional documentation (already planned)

---

## Mitigation Task Summary

| Task | Title | Priority | Cost | Owner | Deadline |
|------|-------|----------|------|-------|----------|
| 0.1 | False Positive Tuning | HIGH | 2h + 1w | Before enforce mode | Week 3 |
| 0.2 | Performance Benchmarking | HIGH | 5h | Before shadow mode | Week 1 |
| 0.3 | Comprehensive Error Testing | CRITICAL | 1h | Before merge | Day 1 |
| 0.4 | Monitoring & Alerting | HIGH | 2h setup | Before shadow mode | Week 1 |
| 0.5 | Cross-Platform Testing | MEDIUM | 1h | Before merge | Day 1 |
| 0.6 | Task-Type Exemptions | MEDIUM | 3h | Before enforce mode | Week 3 |
| 0.7 | Comprehensive Documentation | LOW | 1h | Before merge | Day 1 |

**Total Additional Effort**: ~7 hours (+ 1 week monitoring periods)

---

## Pre-Mortem Learnings

### Key Insights

**1. Shadow Mode Is Non-Negotiable**
- Going straight to enforce mode is reckless
- Need real-world data to tune gates
- 1-2 week shadow period minimum

**2. Monitoring Must Be Active**
- Collecting telemetry ≠ using telemetry
- Alerts required for anomalies
- Regular review cadence mandatory

**3. Fail-Safe Is Double-Edged**
- Prevents autopilot breakage (good)
- Masks quality issues if overused (bad)
- Must monitor fail-safe activation rate

**4. Testing Error Paths Is Critical**
- Happy path testing insufficient
- Must test: timeouts, errors, edge cases
- Integration tests with real scripts

**5. Documentation Prevents Future Failures**
- Code complexity requires explanation
- Runbook for common issues essential
- Knowledge transfer can't be skipped

---

## Rollout Decision Tree

```
START
  ↓
[Is comprehensive error testing complete?]
  NO → Task 0.3 (BLOCKER)
  YES ↓
[Is cross-platform testing complete?]
  NO → Task 0.5 (BLOCKER)
  YES ↓
[Is performance benchmarking complete?]
  NO → Task 0.2 (BLOCKER)
  YES ↓
[Is monitoring & alerting configured?]
  NO → Task 0.4 (BLOCKER)
  YES ↓
DEPLOY SHADOW MODE (Week 1-2)
  ↓
[Is false positive rate <10%?]
  NO → Task 0.1 (tune and retry)
  YES ↓
[Is timeout rate <5%?]
  NO → Increase timeouts (or optimize)
  YES ↓
[Is autopilot success rate maintained >90%?]
  NO → Investigate and fix
  YES ↓
DEPLOY OBSERVE MODE (Week 3)
  ↓
[Monitor for 1 week - any issues?]
  YES → Fix and retry observe mode
  NO ↓
[Are task-type exemptions needed?]
  YES → Task 0.6
  NO ↓
DEPLOY ENFORCE MODE - CANARY (Week 4, 10% tasks)
  ↓
[Success rate maintained >90%?]
  NO → Rollback to observe, investigate
  YES ↓
DEPLOY ENFORCE MODE - 50% (Week 5)
  ↓
[Success rate maintained >90%?]
  NO → Rollback to canary
  YES ↓
DEPLOY ENFORCE MODE - 100% (Week 6)
  ↓
SUCCESS - Monitor continuously
```

---

## Definition of "Done" for Pre-Mortem

This pre-mortem is complete when:
1. ✅ 5-7 failure scenarios identified
2. ✅ Each scenario has: timeline, root causes, warning signs, prevention
3. ✅ Mitigation tasks created (Task 0.x)
4. ✅ Mitigation tasks prioritized and costed
5. ✅ Rollout decision tree created
6. ✅ Key learnings extracted

**Status**: ✅ COMPLETE - 7 scenarios, 7 mitigation tasks, decision tree

---

**Impact on Implementation**:
- Task 0.3 (error testing): MUST do before merge (1 hour)
- Task 0.5 (cross-platform): MUST do before merge (1 hour)
- Task 0.7 (documentation): Already planned, ensure comprehensive
- Tasks 0.1, 0.2, 0.4, 0.6: Do during rollout phases

**Total Additional Effort**: ~2 hours before merge, ~5 hours during rollout

---

**Next Document**: edge_cases.md (if needed) or proceed to IMPLEMENT phase
