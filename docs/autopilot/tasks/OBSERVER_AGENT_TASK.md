# Task: Implement Observer Agent

## Phase 1: STRATEGIZE

**Problem Statement:**
- Current Verify stage catches ~70% of issues
- No adversarial thinking in verification
- Binary pass/fail without nuance
- Using same model (codex) for all stages

**Root Cause Analysis:**
- Codex optimized for speed over thoroughness
- Single perspective on quality
- No "devil's advocate" review

**Proposed Approach:**
- Add Observer pattern for read-only analysis
- Use gpt-5-high for deeper thinking
- Run after Verify, before Review
- Feature flag for gradual rollout

**Connection to Purpose:**
- Supports <5% error rate for WeatherVane
- Reduces false "done" claims
- Increases trust in autopilot

## Phase 2: SPEC

**Acceptance Criteria:**
1. [ ] Observer runs only when feature flag enabled
2. [ ] Uses gpt-5-high model exclusively
3. [ ] No workspace modifications (read-only)
4. [ ] Runs after Verify completes successfully
5. [ ] Timeout of 30 seconds
6. [ ] Logs observations to telemetry
7. [ ] Does not block on failure
8. [ ] Respects cadence setting (e.g., every 3rd task)

**Success Metrics:**
- Catches 95%+ of issues that Verify catches
- Finds 20%+ additional issues Verify misses
- False positive rate < 5%
- Average runtime < 10 seconds
- Zero side effects

**Definition of Done:**
- All acceptance criteria met
- Unit tests pass (100%)
- Integration test with verify_runner
- Feature flag tested both states
- Telemetry validated
- Documentation complete

## Phase 3: PLAN

**Task Breakdown:**
1. Create ObserverAgent class (45 min)
   - Constructor with ModelRouter
   - observe() method
   - Error handling

2. Add feature flags (20 min)
   - autopilot.verify.observer.enabled
   - autopilot.verify.observer.cadence
   - autopilot.verify.observer.timeout_ms

3. Integrate with verify_runner (30 min)
   - Call after verifier.verify()
   - Check feature flag
   - Handle timeout

4. Add telemetry (30 min)
   - Create observer.jsonl writer
   - Log observations
   - Track metrics

5. Write tests (60 min)
   - Unit tests for ObserverAgent
   - Integration test
   - Feature flag tests

6. Documentation (30 min)
   - Update VERIFY stage docs
   - Add to quality gate docs
   - Usage examples

**Total Estimate:** 3.5 hours

## Phase 4: THINK

**Risk Analysis:**

1. **Risk: gpt-5-high unavailable/rate limited**
   - Mitigation: Fallback to gpt-5-medium
   - Mitigation: Implement exponential backoff

2. **Risk: False positives create noise**
   - Mitigation: Calibrate prompts carefully
   - Mitigation: Start with low cadence (every 5th)

3. **Risk: Observations conflict with Verify**
   - Mitigation: Observer is advisory only
   - Mitigation: Log conflicts for analysis

4. **Risk: Timeout blocks pipeline**
   - Mitigation: Strict 30s timeout
   - Mitigation: Async execution

5. **Risk: Cost explosion from gpt-5-high**
   - Mitigation: Cadence limits
   - Mitigation: Token limits in prompt

**Edge Cases:**
- Verify fails (Observer shouldn't run)
- Observer throws exception (log and continue)
- Feature flag changed mid-execution
- Multiple Observers running simultaneously
- Observer observations > 10KB

**Dependencies:**
- ModelRouter must support model selection
- Telemetry system must be initialized
- Feature flag system must be working

## Phase 5: IMPLEMENT

[Code implementation goes here]

## Phase 6: VERIFY

**Verification Checklist:**
- [ ] Run: npm test observer_agent.test.ts
- [ ] Verify: Feature flag disables Observer
- [ ] Check: Telemetry logs created
- [ ] Confirm: No workspace changes
- [ ] Validate: gpt-5-high model used
- [ ] Test: Timeout works correctly
- [ ] Coverage: > 80% for new code

**Evidence Required:**
- Test output showing 100% pass
- Telemetry sample from test run
- Feature flag toggle demonstration
- Performance metrics

## Phase 7: REVIEW

**Adversarial Questions:**
1. What if gpt-5-high costs 10x more than expected?
2. How do we prevent Observer from becoming a bottleneck?
3. What if Observer consistently disagrees with Verify?
4. How do we measure if Observer actually improves quality?
5. Could Observer observations leak sensitive information?

**Peer Review Checklist:**
- [ ] Code follows established patterns
- [ ] Error handling is comprehensive
- [ ] Feature flags have defaults
- [ ] Telemetry has required fields
- [ ] Tests cover edge cases
- [ ] Documentation is clear

## Phase 8: PR

**Pull Request Requirements:**
- Title: "feat(observer): Add read-only Observer agent with gpt-5-high for adversarial verification"
- Description: Complete problem/solution narrative
- Evidence:
  - Test results screenshot
  - Telemetry output sample
  - Feature flag demonstration
  - Before/after quality metrics
- Labels: enhancement, quality-gates, phase-1
- Reviewers: Quality team lead + Architecture reviewer

## Phase 9: MONITOR

**Post-Deployment Monitoring:**

**Metrics to Track:**
- Observer invocation count/hour
- False positive rate (per day)
- True positive rate (issues found)
- Average observation latency
- gpt-5-high token usage
- Cost per observation

**Success Criteria (Week 1):**
- False positive rate < 5%
- Latency p95 < 10 seconds
- At least 10 new issues found
- No pipeline disruptions

**Escalation Triggers:**
- False positive rate > 10%
- Latency p95 > 30 seconds
- Cost > $100/day
- Any workspace modifications detected

**Rollback Plan:**
- Set feature flag to false
- No code changes needed
- Monitor for 1 hour post-disable

---

## The Difference This Makes

**Without Full Process:**
- Jump to coding Observer
- Miss the timeout edge case
- No cost controls
- No success metrics
- Can't prove it works

**With Full Process:**
- Every risk considered
- Clear success criteria
- Evidence at each stage
- Rollback plan ready
- Measurable improvement

This is how EVERY task should be executed. No shortcuts. No exceptions.