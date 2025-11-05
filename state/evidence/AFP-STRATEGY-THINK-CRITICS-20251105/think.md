# Think — AFP-STRATEGY-THINK-CRITICS-20251105

## Hidden Assumptions & Validation

### Assumption 1: Automated critics can detect BS better than humans
**Model:** AI critic with pattern matching + intelligence layer can identify superficial thinking

**Is this true?**
- ✅ DesignReviewer exists and works (evidence: blocks superficial designs)
- ✅ Pattern matching can detect missing sections, generic phrases
- ⚠️ But: Clever agents might write longer superficial answers to bypass heuristics
- ⚠️ Intelligence layer quality depends on model capability

**If wrong:** Fall back to human review (Claude Council), but slower

**Validation strategy:**
- Test with 10+ real strategies (good vs bad)
- Measure false positive rate (blocking good work)
- Measure false negative rate (approving bad work)
- Target: <10% false positive, <20% false negative

### Assumption 2: Agents will provide honest via negativa analysis
**Model:** If we ask "what did you examine for deletion?", agents will truthfully list files

**Is this true?**
- ⚠️ Probably not - agents optimize for approval, might claim "I examined X" without doing it
- ✅ File path verification helps (mentioned files must exist)
- ⚠️ But: Agent could list real files without actually analyzing them

**If wrong:** Via negativa becomes compliance theater

**Mitigation:**
- Require specific reasoning: "File X couldn't be deleted because Y"
- Detect generic claims: "considered deletion but..."
- Cross-reference with design.md (should mention same files)
- Future: Code search validation (did they actually read these files?)

### Assumption 3: 30-line minimum indicates quality
**Model:** Superficial strategy.md will be short; deep analysis requires detail

**Is this true?**
- ✅ Partially - template has 6 major sections, can't answer deeply in <30 lines
- ⚠️ But: Agent could write long superficial answers (padding)
- ⚠️ Line count is proxy for depth, not direct measure

**If wrong:** Long but superficial strategies pass

**Mitigation:**
- Combine line count with section presence checks
- Check for generic phrases (compliance indicators)
- Intelligence layer analyzes depth, not just length
- Future: Semantic analysis of reasoning quality

### Assumption 4: Task rejection is a good outcome
**Model:** Critic recommending "don't do this task" saves effort by preventing waste

**Is this true?**
- ✅ Yes IF rejection reasoning is sound
- ⚠️ But: Could block valid tasks if critic logic flawed
- ⚠️ High rejection rate might frustrate agents

**If wrong:** Valuable tasks get rejected, work stops

**Mitigation:**
- Require human escalation for rejections (not auto-applied)
- Log rejection reasoning for review
- Track rejection rate (>20% indicates problem)
- Allow "ESCALATE" option for complex cases

### Assumption 5: Intelligence layer is always available
**Model:** Research layer / model router provides deep analysis

**Is this true?**
- ⚠️ Not guaranteed - token limits, rate limits, service outages
- ⚠️ Degraded mode needed

**If wrong:** Critic fails or blocks everything

**Mitigation:**
- Graceful degradation to heuristic-only mode
- Log when intelligence unavailable
- Basic pattern matching still better than no enforcement
- Retry logic for transient failures

## Essential vs Accidental Complexity

### Essential Complexity (Necessary)

**1. Template structure:**
- MUST have 6 sections (value, root cause, via negativa, alternatives, alignment, criteria)
- Each section MUST ask hard questions
- Cannot simplify without losing BS detection capability
- ~150 LOC is minimal for comprehensive coverage

**2. Critic intelligence:**
- MUST analyze semantic meaning, not just keywords
- MUST detect superficial vs deep answers
- MUST provide specific actionable feedback
- Cannot reduce to simple regex without losing effectiveness

**3. Anti-gaming measures:**
- MUST verify file references exist
- MUST detect generic platitudes
- MUST check for specific details
- Cannot skip without enabling compliance theater

**Why essential:**
- Problem domain is complex (detecting bad strategic thinking)
- No simple heuristic captures all BS patterns
- Agents are sophisticated and will game simple checks

### Accidental Complexity (Unnecessary)

**Could be simpler:**

**1. Separate StrategyReviewer and ThinkingCritic classes:**
- ❌ ACCIDENTAL - could share base logic, just different templates/checks
- ✅ BUT: Separation makes each simpler to reason about
- ✅ AND: Different concerns (strategy vs thinking depth)
- **Decision:** Keep separate for clarity, even if some duplication

**2. Analytics logging:**
- ❌ ACCIDENTAL - could skip initially
- ✅ BUT: Essential for learning and tuning
- ✅ AND: Cheap to add now, expensive to retrofit
- **Decision:** Include from start

**3. Remediation instructions generation:**
- ❌ ACCIDENTAL - could just show concerns
- ✅ BUT: Dramatically improves UX (agents know what to do)
- ✅ AND: Reduces support burden
- **Decision:** Include - small code, big value

**Truly unnecessary:**
- Multiple output formats (JSON, YAML, etc.) - use JSON only
- Configuration file for thresholds - hard-code initially, add later if needed
- Parallel execution optimization - premature (reviews are fast enough)

### Complexity Budget Analysis

**Current system complexity:** Medium
- DesignReviewer: ~500 LOC
- Base Critic class: ~200 LOC
- Pre-commit hooks: ~100 LOC

**Adding StrategyReviewer:** +~400 LOC
**Adding ThinkingCritic:** +~400 LOC
**Adding integration:** +~135 LOC

**Total new complexity:** ~935 LOC
**System complexity increase:** ~25%

**Is this justified?**
✅ YES:
- Catches bad work at phase 1 instead of phase 5+ (10x time savings)
- Scales automated review (vs manual)
- Compounds with existing GATE enforcement (end-to-end quality)
- Pays for itself after ~5 tasks (if prevents 1 bad task per 5)

**Maintenance burden:**
- Low - follows existing patterns (DesignReviewer)
- Test coverage: ~200 LOC per critic
- Analytics provides feedback loop for tuning

**Mental model impact:**
- Simplifies: "Every phase has enforcement" (consistent)
- Adds: "Must pass critics before proceeding" (but already exists for GATE)
- Net: Slightly more cognitive load, but predictable pattern

**Decision:** Complexity increase is justified by value delivered

## Second-Order Effects & Ripple Consequences

### Effect 1: Agent Behavior Change

**First-order:** Agents write better strategies (intended)

**Second-order effects:**
1. **Time per task increases** (30-60 min for strategy vs 5 min superficial)
   - ⚠️ Concern: Slower initial progress
   - ✅ But: Faster overall (less rework/waste)
   - Net: Positive after accounting for downstream savings

2. **Agents might resist / complain**
   - ⚠️ "This is too much process, bureaucracy"
   - ✅ But: Shows value through prevented waste
   - ✅ AND: Pre-commit hook enforces (no choice)
   - Mitigation: Clear documentation showing ROI

3. **Quality culture shift**
   - ✅ "Think first, code later" becomes norm
   - ✅ Strategic thinking becomes default
   - ✅ Peer expectations rise (good strategies become standard)
   - Net: Positive cultural change

### Effect 2: Task Selection Quality

**First-order:** Bad tasks get rejected (intended)

**Second-order effects:**
1. **Task pipeline shifts toward higher-value work**
   - ✅ Less "shiny object syndrome"
   - ✅ More root cause solutions
   - ✅ Better opportunity cost analysis
   - Net: Better strategic outcomes

2. **Innovation might be stifled**
   - ⚠️ Exploratory tasks might not pass "value analysis"
   - ⚠️ "Try something" tasks get rejected
   - Mitigation: Allow "EXPERIMENTAL" tag with different criteria
   - Mitigation: Escalation path for research tasks

3. **Conflict with roadmap**
   - ⚠️ Roadmap says "do task X", critic says "reject task X"
   - ⚠️ Who wins?
   - Mitigation: Escalate to human (Dana) for resolution
   - Mitigation: Feed critic insights back into roadmap planning

### Effect 3: System-Wide Quality

**First-order:** Strategy + GATE enforcement = better task quality

**Second-order effects:**
1. **Downstream failures decrease**
   - ✅ Better strategies → better designs → better code
   - ✅ Less VERIFY failures (built right from start)
   - ✅ Less tech debt accumulation
   - Metrics: Track VERIFY failure rate over time

2. **Learning loop accelerates**
   - ✅ Analytics captures patterns in bad strategies
   - ✅ Critics evolve based on data
   - ✅ Templates improve based on common failures
   - Net: Continuous improvement

3. **Dependency on automation increases**
   - ⚠️ Agents become reliant on critics for validation
   - ⚠️ If critics fail, work stops
   - ⚠️ Single point of failure
   - Mitigation: Graceful degradation
   - Mitigation: Human escalation path always available

### Effect 4: Documentation & Evidence

**First-order:** More comprehensive strategy.md files

**Second-order effects:**
1. **Evidence quality improves**
   - ✅ Better post-hoc analysis (why did we do this?)
   - ✅ Easier onboarding (new agents read strategies)
   - ✅ Audit trail for decisions
   - Net: Better institutional memory

2. **Storage bloat**
   - ⚠️ More text → larger repository
   - ⚠️ But: ~200 LOC per strategy.md = ~50KB
   - ⚠️ 100 tasks = ~5MB (negligible)
   - Net: Not a concern

### Effect 5: Unintended Consequences

**What could go wrong that we haven't considered?**

1. **Gaming escalates:**
   - Agents get better at writing superficial strategies that pass
   - "Compliance theater v2" - longer but still BS
   - Mitigation: Evolve detection based on patterns
   - Mitigation: Periodic human spot-checks

2. **Critic becomes bottleneck:**
   - Review takes 60+ seconds instead of <30s
   - Slows pre-commit workflow
   - Mitigation: Performance optimization
   - Mitigation: Async review option

3. **False positives erode trust:**
   - Critic blocks good work 20%+ of the time
   - Agents lose trust, seek workarounds
   - Mitigation: Track false positive rate
   - Mitigation: Tune thresholds based on feedback

4. **Checklist fatigue:**
   - Too many checkboxes → agents stop reading
   - Mechanical checkbox-ticking without thinking
   - Mitigation: Keep checkboxes minimal (5-6 per section)
   - Mitigation: Make questions engaging, not bureaucratic

## Long-Term Trajectory (6-12 Months)

**If successful:**

**Month 1-2:**
- 20-30% of strategies fail first review (learning curve)
- Agents complain about "process overhead"
- Quality indicators start rising (fewer GATE failures)

**Month 3-4:**
- First-review pass rate increases to 60-70%
- Agents internalize strategic thinking patterns
- At least 2-3 tasks rejected (saved wasted effort)
- Analytics show common failure modes

**Month 5-6:**
- Strategic thinking becomes second nature
- Pass rate >80% first review
- Critics evolve based on analytics (new checks added)
- Templates updated based on patterns

**Month 7-12:**
- Culture shift complete: "Think first" is default
- Task selection quality measurably higher
- Downstream failures (VERIFY, production bugs) decrease 30-50%
- ROI clearly positive (time saved >> overhead added)

**If unsuccessful:**

**Warning signs:**
- Pass rate stays <40% (too strict or poor guidance)
- False positive rate >15% (blocking good work)
- Agents actively seek workarounds (--no-verify, etc.)
- No measurable downstream improvement

**Pivot points:**
- If too strict: Relax thresholds, add more "medium" severity
- If gamed: Add anti-gaming checks, human spot-checks
- If too slow: Optimize performance, cache more
- If no value: Deprecate critics, keep templates only

## Failure Modes & Robustness

### Failure Mode 1: Intelligence Layer Unavailable

**Symptom:** API timeout, rate limit, service outage

**Blast radius:** All strategy reviews fail

**Reversibility:** ✅ Two-way door - can disable critic temporarily

**Mitigation:**
- Graceful degradation to heuristic-only mode
- Return "WARN" instead of "FAIL" when intelligence unavailable
- Log degraded mode usage
- Retry logic (3 attempts with backoff)

**Recovery:**
- Manual review by Claude Council
- Temporary `--no-verify` with documented reason
- Review once intelligence restored

### Failure Mode 2: Critic Logic Bug

**Symptom:** False positives (blocking good strategies) or false negatives (approving bad)

**Blast radius:** Work blocked (FP) or bad work proceeds (FN)

**Reversibility:** ✅ Two-way door - can fix critic and re-review

**Mitigation:**
- Comprehensive test suite (10+ examples)
- Analytics track false positive complaints
- Version critic code (rollback if needed)
- Human escalation always available

**Recovery:**
- Hotfix critic logic
- Re-review affected tasks
- Notify agents of fix

### Failure Mode 3: Template Unclear

**Symptom:** Agents don't understand what to write

**Blast radius:** Many failures, frustration, support burden

**Reversibility:** ✅ Two-way door - can improve template

**Mitigation:**
- Include examples in template (good vs bad)
- Provide guidance document
- Iterate based on feedback

**Recovery:**
- Update template based on common confusion
- Add FAQ section
- Provide example strategies

### Failure Mode 4: Gaming / Compliance Theater

**Symptom:** Agents write long superficial answers that pass critic

**Blast radius:** Bad strategies approved, waste not prevented

**Reversibility:** ⚠️ Partial - wasted effort already incurred

**Mitigation:**
- Anti-gaming checks (file verification, generic phrase detection)
- Human spot-checks (random audit 10% of strategies)
- Analytics detect patterns
- Evolve detection over time

**Recovery:**
- Add new anti-gaming checks
- Require deeper evidence (code snippets, specific line numbers)
- Increase human review frequency temporarily

### Failure Mode 5: Cultural Rejection

**Symptom:** Agents revolt, refuse to use critics, seek workarounds

**Blast radius:** System adoption fails, back to manual review

**Reversibility:** ⚠️ One-way door - trust once lost is hard to regain

**Mitigation:**
- Show clear value (time saved, waste prevented)
- Provide opt-out with escalation (not secret bypass)
- Listen to feedback, iterate quickly
- Celebrate successes (tasks saved from waste)

**Recovery:**
- If adoption fails: Pivot to templates-only (no enforcement)
- If feedback negative: Simplify requirements
- If value unclear: Measure and publish ROI data

## Robustness Analysis (Taleb's Antifragility Lens)

### Fragile Aspects (Break Under Stress)

**1. Intelligence layer dependency:**
- Stress: API outages, rate limits
- Breaks: All reviews fail
- Mitigation: Graceful degradation

**2. Heuristic thresholds:**
- Stress: Edge cases, new patterns
- Breaks: False positives/negatives spike
- Mitigation: Analytics-driven tuning

**3. Agent compliance:**
- Stress: Cultural resistance
- Breaks: Workarounds, bypass
- Mitigation: Show value, enforce via hook

### Robust Aspects (Survive Stress)

**1. Template structure:**
- Stress: Critic fails
- Survives: Templates still guide thinking (even without enforcement)

**2. Analytics logging:**
- Stress: Bugs in critic logic
- Survives: Data captures issues for debugging

**3. Human escalation:**
- Stress: Critic blocked on valid work
- Survives: Human can override with reasoning

### Antifragile Aspects (Improve Under Stress)

**1. Critic evolution:**
- Stress: Gaming attempts
- Improves: New anti-gaming checks added, detection improves

**2. Template iteration:**
- Stress: Confusion, unclear sections
- Improves: Templates refined based on feedback

**3. Strategic thinking culture:**
- Stress: Initial overhead/friction
- Improves: Agents internalize thinking, become better strategists

**Design for antifragility:**
- ✅ Analytics provides feedback loop (learns from failures)
- ✅ Modular design allows piece-by-piece improvement
- ✅ Human-in-loop for edge cases (avoids brittleness)
- ✅ Version control allows rollback (two-way doors)

## How Could This Make Things Worse? (Iatrogenic Effects)

### Iatrogenic Risk 1: Process Over Outcome

**Mechanism:** Focus shifts from "good strategies" to "passing the critic"

**Symptoms:**
- Agents optimize for approval, not quality
- Checkbox mentality replaces genuine thinking
- Form over substance

**Likelihood:** Medium (common in bureaucratic systems)

**Prevention:**
- Critic feedback emphasizes "why" not "what"
- Spot-checks for genuine thinking vs compliance
- Celebrate rejected tasks (prevented waste) not just approved ones

### Iatrogenic Risk 2: Innovation Suppression

**Mechanism:** Experimental/exploratory tasks fail "value analysis"

**Symptoms:**
- Only safe, incremental work proceeds
- No research, no "try something" tasks
- Stagnation

**Likelihood:** Low-Medium (depends on critic strictness)

**Prevention:**
- Explicitly allow "EXPERIMENTAL" tag with different criteria
- "Value" includes learning/knowledge gain
- Escalation path for research tasks

### Iatrogenic Risk 3: Decreased Agency

**Mechanism:** Agents rely on critic instead of own judgment

**Symptoms:**
- "Critic will catch it" mentality
- Less independent thinking
- Dependency on automation

**Likelihood:** Low (agents are sophisticated)

**Prevention:**
- Frame critic as "second opinion" not "authority"
- Encourage self-review before running critic
- Teach strategic thinking, don't just enforce it

### Iatrogenic Risk 4: Analysis Paralysis

**Mechanism:** Too much upfront thinking delays action

**Symptoms:**
- Tasks take 2-3x longer
- Overthinking simple tasks
- Paralysis, no shipping

**Likelihood:** Low-Medium (depends on thresholds)

**Prevention:**
- Scope gates: trivial tasks (<20 LOC) skip strategy review
- Time-box strategy phase (60 min max)
- "Ship and iterate" still valid for reversible decisions

### Iatrogenic Risk 5: False Security

**Mechanism:** Critic approval creates false confidence

**Symptoms:**
- "Critic approved it, must be good"
- Skip downstream verification
- Blindly trust automation

**Likelihood:** Low (multiple enforcement layers exist)

**Prevention:**
- Critic is necessary not sufficient
- Still require GATE, VERIFY, REVIEW phases
- Human review for high-stakes decisions

## Outstanding Questions & Uncertainties

**Q1: What's the right threshold for "superficial" detection?**
- Current plan: 30 lines, section presence, generic phrase count
- Uncertainty: Might be too strict or too lenient
- Resolution: Test with real data, tune based on false positive rate

**Q2: Should task rejection be auto-applied or require human approval?**
- Current plan: Block commit, require human escalation
- Uncertainty: Might slow workflow too much
- Resolution: Require escalation initially, relax if safe

**Q3: How to handle disagreement between critic and human?**
- Current plan: Human overrides with documented reason
- Uncertainty: Could undermine critic authority
- Resolution: Log overrides, review patterns, improve critic

**Q4: Should we differentiate trivial vs complex tasks?**
- Current plan: All tasks >1 file or >20 LOC require strategy.md
- Uncertainty: Overhead might not justify for small tasks
- Resolution: Start strict, relax if overhead > value for simple tasks

**Q5: What's the right balance between guidance and flexibility?**
- Current plan: Structured template but open-ended questions
- Uncertainty: Might be too prescriptive or too loose
- Resolution: Iterate based on agent feedback

## Risk Mitigations Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Intelligence unavailable | High | Graceful degradation to heuristics |
| False positives | High | Test suite, tuning, human escalation |
| Gaming/compliance theater | Medium | Anti-gaming checks, spot audits |
| Cultural rejection | Medium | Show ROI, listen to feedback |
| Innovation suppression | Low | EXPERIMENTAL tag, escalation |
| Analysis paralysis | Low | Time-box, scope gates |
| Critic bugs | Medium | Test coverage, version control |
| Performance bottleneck | Low | Optimization, async option |

## Decision: Proceed with Caution

**This implementation is sound IF:**
1. We test thoroughly (10+ real examples)
2. We tune based on data (false positive rate <10%)
3. We provide human escalation (always available)
4. We show ROI (track time saved vs overhead)
5. We iterate quickly (fix issues within days not weeks)

**Red flags to watch:**
- False positive rate >15% after 2 weeks
- Pass rate <40% after 1 month
- No measurable downstream improvement after 2 months
- Active workaround seeking (--no-verify abuse)

**If red flags appear:** Pivot quickly (relax thresholds, simplify template, or deprecate)

**Next phase:** GATE - Document this in design.md, get DesignReviewer approval before implementing
