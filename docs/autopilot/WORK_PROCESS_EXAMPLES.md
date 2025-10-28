# Work Process Examples - How Every Task MUST Flow

## The Mandatory Process
STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR

For every task, tie the work back to real Autopilot behavior: STRATEGIZE must state which agent workflow or guardrail the change affects; SPEC and PLAN must enumerate the user journeys and autonomy capabilities you will protect; THINK must analyze functional risks/regressions; REVIEW must confirm the identified Autopilot functionality still works (attach smoke tests, telemetry, or manual evidence).

## Example: Implementing Observer Agent

### STRATEGIZE
- **Problem**: Need read-only verification layer to catch issues early
- **Approach**: Observer pattern with gpt-5-high for adversarial thinking
- **Purpose**: Increase quality gate effectiveness from 70% to 95%

### SPEC
- **Acceptance Criteria**:
  - [ ] Observer runs after Verify stage
  - [ ] No side effects (read-only)
  - [ ] Feature flagged (disabled by default)
  - [ ] Logs observations to telemetry
  - [ ] Uses gpt-5-high model
- **Success Metrics**:
  - Observer catches 95%+ of issues Verify catches
  - False positive rate < 5%
  - No performance regression
- **Definition of Done**:
  - Tests pass 100%
  - Feature flag works
  - Telemetry logs created
  - Documentation complete

### PLAN
1. Create ObserverAgent class (30 min)
2. Add feature flags to live_flags.ts (15 min)
3. Wire into verify_runner.ts (20 min)
4. Add telemetry logging (20 min)
5. Write tests (45 min)
6. Update documentation (20 min)
Total: ~2.5 hours

### THINK
- **Risks**:
  - False positives could create noise
  - gpt-5-high latency might slow pipeline
  - Feature flag misconfiguration could break Verify
- **Edge Cases**:
  - Observer fails/times out - should not block
  - Conflicting observations with Verify
  - Rate limiting on gpt-5-high
- **Mitigations**:
  - Wrap in try/catch, fail open
  - Set timeout of 30s
  - Cache observations for similar tasks

### IMPLEMENT
```typescript
// src/orchestrator/observer_agent.ts
export class ObserverAgent {
  constructor(private modelRouter: ModelRouter) {}

  async observe(task: Task, verifyResult: VerifyResult): Promise<ObserverReport> {
    if (!this.isEnabled()) return { observations: [] };

    const model = this.modelRouter.getModelForPhase('OBSERVER'); // Returns gpt-5-high
    // ... implementation
  }
}
```

### VERIFY
- Run: `npm test observer_agent.test.ts`
- Check: Feature flag disables properly
- Validate: Telemetry logs created
- Confirm: No side effects in workspace
- Coverage: > 80% for new code

### REVIEW
- Adversarial questions:
  - What if gpt-5-high is unavailable?
  - How do we prevent observation loops?
  - Is the cadence configurable?
  - What's the cost impact?
- Peer review checklist:
  - [ ] Error handling complete
  - [ ] Feature flag tested both states
  - [ ] Telemetry has required fields

### PR
- Title: "feat(observer): Add read-only Observer agent with gpt-5-high"
- Evidence:
  - Test results: 100% pass
  - Feature flag demo
  - Telemetry sample
  - Performance comparison
- Reviewers: Assign to quality team

### MONITOR
- Track metrics post-deployment:
  - Observer invocation count
  - False positive rate
  - Average observation latency
  - Model costs
- Success criteria:
  - < 5% false positives after 1 week
  - No performance regression
  - Quality gate catch rate improved

---

## Example: Adding OpenTelemetry Spans

### STRATEGIZE
- **Problem**: No visibility into phase transitions and durations
- **Approach**: Wrap each phase with OTel spans
- **Purpose**: Enable data-driven optimization

### SPEC
- **Acceptance Criteria**:
  - [ ] Span per phase transition
  - [ ] Duration and result captured
  - [ ] Violations recorded as events
  - [ ] Traces written to jsonl file
- **Success Metrics**:
  - 100% of phases have spans
  - < 1ms overhead per span
- **Definition of Done**:
  - All phases instrumented
  - Traces readable
  - No performance impact

### PLAN
1. Add span wrapper utility (20 min)
2. Instrument StateGraph transitions (30 min)
3. Add violation events (15 min)
4. Create trace writer (20 min)
5. Test with sample workflow (30 min)
Total: ~2 hours

### THINK
- **Risks**:
  - Span leaks if not closed
  - File I/O could slow execution
  - Trace files could grow large
- **Mitigations**:
  - Use finally blocks
  - Async write with buffer
  - Rotate logs daily

### IMPLEMENT
```typescript
// src/telemetry/phase_tracker.ts
export function withPhaseSpan<T>(
  phase: WorkPhase,
  taskId: string,
  fn: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(`agent.phase.${phase}`, {
    attributes: { taskId, phase }
  });

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

### VERIFY
- Confirm spans in traces.jsonl
- Validate span hierarchy
- Check duration accuracy
- Test error cases

### REVIEW
- Check span naming conventions
- Validate attribute completeness
- Review performance impact

### PR
- Evidence of traces working
- Before/after performance

### MONITOR
- Track span counts
- Monitor trace file size
- Check for span leaks

---

## Why This Matters

**Without following the complete process:**
- We jump to IMPLEMENT and miss edge cases (THINK)
- We claim "done" without verification (VERIFY)
- We don't consider system impact (STRATEGIZE)
- We lack clear success criteria (SPEC)

**With the complete process:**
- Every angle considered
- Evidence collected at each stage
- Quality gates enforced
- Full traceability

## The Current Gap

Looking at our recent work:
- ❌ We fixed tests without STRATEGIZE/SPEC first
- ❌ We implemented WorkProcessEnforcer without PLAN/THINK
- ❌ We updated docs without VERIFY/REVIEW

This is exactly what WorkProcessEnforcer should prevent!

## Going Forward

Every remaining task MUST follow the complete loop:
1. Observer implementation (Phase 1)
2. OpenTelemetry spans (Phase 0)
3. Cross-Check runner (Phase 3)
4. Multi-agent consensus (Phase 4)

No shortcuts. No skipping. Every phase, every time.
