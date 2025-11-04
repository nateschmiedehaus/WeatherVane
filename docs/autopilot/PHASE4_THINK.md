# Phase 4: Adversarial THINK - Model Router + WIP Limits

**Date**: 2025-10-26
**Status**: THINK (Adversarial Review)
**Reviewer**: Self (Claude Council)

---

## Mandate

**Challenge EVERYTHING. Find holes in the plan. Ask questions that expose risks.**

If I can't find problems, I'm not being adversarial enough.

---

## Challenge 1: Complexity Assessment Accuracy

**Question**: How do we KNOW the complexity scoring is accurate?

**Issues I see**:
1. **Arbitrary weights** - Why dependencies = 2, security = 3? No empirical basis
2. **Linear additive** - Real complexity is often non-linear (10 deps ≠ 5x worse than 2 deps)
3. **Missing factors**:
   - Code churn rate (frequently changed files = harder)
   - Team familiarity (new domains = harder)
   - External API dependencies (flaky = harder)
   - Test coverage (untested code = harder to change)
4. **No validation**: How do we measure if complexity score matches actual difficulty?

**What could go wrong**:
- Simple task scored as complex → waste budget on Sonnet 4.5
- Complex task scored as simple → Haiku fails repeatedly, wastes time

**Mitigations needed**:
1. Track actual vs predicted complexity (telemetry)
2. Auto-escalate model after 2 failures
3. Allow manual override
4. Review scoring after 50 tasks, tune weights

**Is this good enough for Phase 4?**
- YES: Manual override + auto-escalation handles misrouting
- Start with reasonable guesses, tune based on data
- Don't overengineer without data

---

## Challenge 2: Cost Reduction Reality Check

**Question**: Can we REALLY achieve 60% cost reduction?

**Math check**:
```
Current: 100% tasks use Sonnet 4.5 ($0.03/1K)
Target distribution:
- 70% Haiku ($0.001/1K) = 0.70 * $0.001 = $0.0007
- 20% Sonnet 3.5 ($0.015/1K) = 0.20 * $0.015 = $0.003
- 9% Sonnet 4.5 ($0.03/1K) = 0.09 * $0.03 = $0.0027
- 1% Sonnet 4.5+R ($0.05/1K) = 0.01 * $0.05 = $0.0005

Weighted average: $0.0069/1K
Reduction: ($0.03 - $0.0069) / $0.03 = 77% reduction
```

**Wait, that's better than 60%! What's the catch?**

**Reality check issues**:
1. **Distribution assumption** - Is 70% of work REALLY simple enough for Haiku?
   - Looking at Phase 3: StateGraph refactoring = NOT simple
   - Complex tasks dominate development time
2. **Retry costs** - If Haiku fails, we retry with Sonnet 3.5 (double cost)
3. **Context length** - Complex tasks need long context → higher cost per token
4. **Quality drops** - Haiku might produce working code that fails review

**More realistic scenario**:
```
Actual distribution (weighted by time):
- 50% Haiku (quick fixes)
- 30% Sonnet 3.5 (moderate features)
- 15% Sonnet 4.5 (complex refactoring)
- 5% Sonnet 4.5+R (critical architecture)

Weighted: $0.0115/1K
Reduction: 62% (closer to 60% target)
```

**Is 60% achievable?**
- MAYBE: Depends on task mix
- Need to measure ACTUAL cost over 1 week
- If below 40% reduction, tune thresholds

---

## Challenge 3: WIP Limits Too Restrictive?

**Question**: Will WIP=1 per worker STARVE throughput?

**Scenario**:
```
Worker 1: Implementing complex task (2 hours)
Worker 2: Implementing complex task (2 hours)
Worker 3: Waiting for review
Worker 4: Waiting for review
Worker 5: Waiting for review
Worker 6: Waiting for review

WIP: 6/6 (2 implementing, 4 blocked waiting)
Queue: 10 ready tasks
Throughput: 0 (nothing completing)
```

**This is the exact problem WIP is supposed to PREVENT!**

**But what if WIP limit creates artificial bottleneck?**

**Trade-offs**:
- **Too loose (WIP=10)**: Context switching, low completion
- **Too strict (WIP=1)**: Idle workers, wasted capacity
- **Sweet spot (WIP=1-2)**: Balance completion + utilization

**Counter-argument to plan**:
- Plan says "1 task per worker" - is this TOO strict?
- What if we need WIP=2 to keep workers fed during blockers?

**Test needed**:
- Start WIP=2, measure completion rate
- If >80% complete in 24h, reduce to WIP=1
- If <60% complete, keep WIP=2

---

## Challenge 4: Integration Assumptions

**Question**: Does StateGraph ACTUALLY support passing modelSelection to runners?

**Checking the plan**:
- Plan assumes runners can receive `modelSelection` in context
- Plan assumes agents can use provided model

**But looking at current code**:
- Runners take `RunnerContext` with task + attemptNumber
- Agents use `router.pickModel()` internally

**Integration points NOT in plan**:
1. **Runner interface change** - Need to add `modelSelection` to RunnerContext
2. **Agent interface change** - Need to make agents honor provided model
3. **Backward compat** - What if modelSelection is undefined?
4. **Override handling** - Where does task.metadata.model_override get processed?

**Missing from plan**:
- Schema changes for RunnerContext
- Agent refactoring (all 5 agents)
- Testing backward compatibility

**Time estimate**:
- Plan says "2 hours for agent updates"
- Reality: 5 agents × 30 min each = 2.5 hours (optimistic)
- + Testing: 1 hour
- + Integration issues: 1 hour
- **Real estimate: 4-5 hours, not 2**

**Is Day 3 still achievable?**
- MAYBE: Depends on how smooth integration goes
- Contingency: Agents continue using router.pickModel(), just log complexity assessment

---

## Challenge 5: Performance Overhead

**Question**: What's the overhead of complexity assessment per task?

**Plan says**: "<10ms routing overhead per task"

**But complexity assessment involves**:
1. Check dependencies → O(1) lookup
2. Check metadata → O(1) lookup
3. String length → O(1) operation
4. Calculate score → O(1) arithmetic

**Total**: Probably 0.1ms, well under 10ms

**BUT: What about StateGraph overhead?**
- StateGraph must call assessComplexity() for EVERY state
- 8 states × 0.1ms = 0.8ms per task

**This is negligible. ✓**

**However, WIP controller overhead**:
- reserveSlot() → Map lookup + insert = O(1)
- releaseSlot() → Map delete = O(1)
- canAcceptTask() → Map size check = O(1)

**Total**: 0.1ms per task

**Combined overhead: ~1ms per task (10% of baseline 6ms)**

**Is this acceptable?**
- YES: 10% overhead for 60% cost savings = worth it
- Performance budget: Must stay <2ms overhead (target met)

---

## Challenge 6: Testing Coverage Gaps

**Question**: Does the test plan cover all failure modes?

**Plan includes**:
- Complexity assessment tests ✓
- Model selection tests ✓
- WIP reservation tests ✓

**What's MISSING**:
1. **Retry/escalation flow**
   - What happens when Haiku fails 2x?
   - Does it auto-escalate to Sonnet 3.5?
   - Test: Task starts with Haiku, fails, retries with Sonnet 3.5

2. **Race conditions**
   - What if 2 workers try to reserve same slot?
   - WIP controller must be thread-safe
   - Test: Concurrent reservations (10 workers)

3. **Queue starvation**
   - What if all workers blocked, queue has ready tasks?
   - Does prefetch trigger when slots released?
   - Test: Release slot, verify prefetch called

4. **Model override edge cases**
   - What if override model doesn't exist?
   - What if override is invalid string?
   - Test: Invalid overrides handled gracefully

5. **Telemetry gaps**
   - Are routing decisions logged?
   - Are WIP status changes logged?
   - Test: Verify telemetry captures all events

**Additional tests needed**:
- Escalation flow (2 hours)
- Race condition tests (1 hour)
- Queue starvation tests (1 hour)
- Edge case tests (1 hour)

**Revised testing estimate: +5 hours**

---

## Challenge 7: Rollout Risk

**Question**: What if this breaks production?

**Failure modes**:
1. **Model router breaks** → All tasks fail routing → No work done
2. **WIP controller breaks** → Can't reserve slots → No work done
3. **Integration breaks** → StateGraph crashes → No work done

**Blast radius: ENTIRE SYSTEM**

**Mitigation in plan**:
- Feature flags (WVO_MODEL_ROUTING_ENABLED, WVO_WIP_LIMIT)
- Gradual rollout

**But plan is MISSING**:
1. **Fallback behavior**
   - If router fails, what's the default?
   - If WIP controller fails, what's the default?
2. **Circuit breaker**
   - After N failures, automatically disable?
3. **Monitoring alerts**
   - How do we KNOW if it's broken?

**Additional requirements**:
1. Add try-catch around router, fall back to Sonnet 3.5
2. Add try-catch around WIP controller, fall back to unlimited
3. Add telemetry alerts for routing failures
4. Add telemetry alerts for WIP controller errors

**This adds**: 2 hours for error handling + monitoring

---

## Challenge 8: Documentation Debt

**Question**: Will future developers understand this system?

**Plan includes**:
- Code documentation ✓
- Test documentation ✓

**What's MISSING**:
1. **Architecture diagram**
   - How does router fit into StateGraph?
   - Flow: Task → Assess → Select → Route → Execute
2. **Tuning guide**
   - How to adjust complexity weights?
   - How to change WIP limits?
3. **Troubleshooting guide**
   - Router not working? Check...
   - WIP controller stuck? Check...
4. **Cost analysis report**
   - Track actual cost savings over time
   - Document in PHASE4_RESULTS.md

**Additional documentation**:
- Architecture diagram (1 hour)
- Tuning guide (1 hour)
- Troubleshooting guide (1 hour)
- Cost analysis template (0.5 hours)

**Total: +3.5 hours**

---

## Revised Timeline

**Original estimate**: 5 days (30 hours)

**Adjustments from THINK**:
- Agent integration: +3 hours (2 → 5)
- Testing (escalation, races, queue): +5 hours
- Error handling + monitoring: +2 hours
- Documentation: +3.5 hours

**Revised total**: 43.5 hours ≈ **6 days** (with interruptions)

**Can we cut scope to fit 5 days?**

**Option 1**: Ship without auto-escalation
- Remove retry/escalation logic
- Manual model override only
- Saves 2 hours

**Option 2**: Ship with reduced testing
- Skip race condition tests (assume Map is thread-safe)
- Skip queue starvation tests (document as known issue)
- Saves 2 hours

**Option 3**: Ship with minimal docs
- Skip tuning guide (document in PHASE4_RESULTS.md later)
- Skip troubleshooting guide (add as issues arise)
- Saves 2.5 hours

**Best approach**: Option 1 (skip auto-escalation)
- Manual override covers most cases
- Can add auto-escalation in Phase 6
- Timeline: 41.5 hours ≈ 5 days with focus

---

## Risks Summary

### High Risk (Must Address)
1. ✅ **Complexity scoring accuracy** → Manual override + telemetry
2. ✅ **WIP limits too strict** → Start WIP=2, tune down
3. ✅ **Integration breaking prod** → Feature flags + fallbacks

### Medium Risk (Address if Time)
4. ⚠️ **Cost reduction overpromised** → Measure actual, adjust expectations
5. ⚠️ **Testing gaps** → Cover critical paths, defer edge cases

### Low Risk (Can Defer)
6. ℹ️ **Performance overhead** → Already within budget
7. ℹ️ **Documentation debt** → Add incrementally
8. ℹ️ **Auto-escalation missing** → Manual override sufficient for v1

---

## Decision: Proceed with Adjustments

**Phase 4 plan is MOSTLY SOLID, with these changes:**

### Must Change:
1. **WIP Limit**: Start at 2, not 1 (tune based on data)
2. **Error Handling**: Add try-catch + fallbacks for router and WIP
3. **Testing**: Add escalation, race condition, queue starvation tests
4. **Timeline**: 5 days → 6 days (or cut auto-escalation to stay at 5)

### Should Change:
5. **Integration Time**: 2 hours → 5 hours for agents
6. **Documentation**: Add architecture diagram + tuning guide
7. **Cost Measurement**: Create tracking dashboard

### Can Defer:
8. **Auto-escalation**: v2 feature
9. **Advanced monitoring**: v2 feature
10. **Troubleshooting guide**: Add as issues found

---

## Updated Acceptance Criteria

**Original**: 7 functional requirements
**Revised**: 10 functional requirements

**Model Router**:
1. ✅ Assess task complexity (0-10)
2. ✅ Select model based on complexity
3. ✅ Support manual override
4. ✅ Track decisions in telemetry
5. ✅ Provide routing rationale
6. **NEW**: Fall back to Sonnet 3.5 if router fails
7. **NEW**: Log routing failures for monitoring

**WIP Limits**:
1. ✅ Enforce per-worker limit (start at 2)
2. ✅ Enforce global limit (12 for 6 workers × 2)
3. ✅ Block assignment when WIP exceeded
4. ✅ Queue tasks when at capacity
5. ✅ Release slot on completion
6. **NEW**: Fall back to unlimited if WIP controller fails
7. **NEW**: Log WIP failures for monitoring
8. **NEW**: Test race conditions (concurrent reservations)

---

## Conclusion

**Phase 4 plan is VIABLE, but needs adjustments.**

**Green Light to IMPLEMENT** with:
- 6-day timeline (not 5)
- WIP limit 2 (not 1)
- Error handling added
- Testing expanded

**Proceed to IMPLEMENT stage.**

---

**Status**: THINK COMPLETE
**Next**: IMPLEMENT (Day 1-2: ComplexityRouter)
