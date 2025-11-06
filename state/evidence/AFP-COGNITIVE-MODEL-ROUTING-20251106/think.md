# Think: AFP-COGNITIVE-MODEL-ROUTING-20251106

## Edge Cases & Failure Modes

### 1. Phase Detection Failures

**Scenario 1.1: Conflicting phase signals**
- Task metadata says "IMPLEMENT"
- Evidence folder has strategy.md only
- Title says "STRATEGIZE: Define approach"

**What can go wrong:**
- System picks wrong phase → wrong model → poor output quality
- Example: Uses Sonnet (fast) when deep thinking needed

**Mitigation:**
- Priority order: metadata > evidence > title
- Rationale: Metadata is most explicit, controlled by orchestrator
- Log conflict warning for manual review

**Scenario 1.2: Stale evidence folder**
- Task completed STRATEGIZE, now in IMPLEMENT
- Evidence folder still only has strategy.md
- Metadata not updated

**What can go wrong:**
- Infers STRATEGIZE from evidence → uses expensive extended thinking unnecessarily

**Mitigation:**
- Always prefer metadata over evidence
- Evidence is fallback only when metadata missing
- Document: Update metadata when progressing phases

**Scenario 1.3: No phase information at all**
- New task, no metadata
- No evidence folder yet
- Generic title "Improve performance"

**What can go wrong:**
- Can't detect phase → falls back to task-based heuristics
- Might miss cognitive work (strategy needed but not detected)

**Mitigation:**
- Acceptable: fallback to existing heuristics is safe
- Encourage: Set `current_phase` in metadata when creating tasks
- Future: Autopilot can infer initial phase from task type/keywords

### 2. Model Selection Failures

**Scenario 2.1: Extended thinking budget too low**
- THINK phase with 1024 token budget (minimum)
- Complex problem needs 20K tokens of reasoning
- Claude hits budget limit mid-thought

**What can go wrong:**
- Incomplete analysis → poor design decisions
- ThinkingCritic fails task → remediation loop

**Mitigation:**
- Start with generous budgets (THINK: 24K tokens)
- Monitor: Track how often budgets are hit
- Adapt: Increase budget if >10% of tasks hit limit

**Scenario 2.2: Extended thinking budget too high**
- Simple SPEC phase task
- Budget set to 32K tokens
- Claude uses 28K tokens for trivial analysis

**What can go wrong:**
- Wasteful token usage → high cost
- Slower response times
- Over-analysis paralysis

**Mitigation:**
- Different budgets per phase (SPEC: 6K, THINK: 24K)
- Monitor: Track actual usage vs. budget
- Adjust: Reduce budget if <50% utilization

**Scenario 2.3: Model unavailable**
- Phase detector says "use Opus 4 with extended thinking"
- Opus 4 at capacity or user lacks access
- Fallback to Sonnet without extended thinking?

**What can go wrong:**
- Cognitive phase uses implementation model → shallow analysis
- StrategyReviewer fails → remediation

**Mitigation:**
- Model registry fallback (existing)
- Log: Warning when cognitive phase can't use extended thinking
- Escalate: If repeated, notify user to upgrade plan

**Scenario 2.4: Codex reasoning level ignored**
- selectCodexModel returns gpt-5-high
- But Codex API doesn't respect reasoning parameter
- Falls back to default reasoning

**What can go wrong:**
- Cognitive phase doesn't get deep reasoning
- Quality degradation goes unnoticed

**Mitigation:**
- Test: Verify Codex API honors reasoning_level parameter
- Telemetry: Log actual reasoning usage from API response
- Alert: If reasoning_level ignored, escalate to fix

### 3. Integration & Compatibility

**Scenario 3.1: Breaking change for existing workflows**
- Non-AFP task triggers phase detection
- Phase detector returns false positive (thinks it's STRATEGIZE)
- Switches model unnecessarily

**What can go wrong:**
- Performance regression (slower models for simple tasks)
- Cost increase (extended thinking when not needed)
- User confusion (why is this task taking so long?)

**Mitigation:**
- Conservative detection: Require strong signals (metadata + evidence/title)
- Fallback: If uncertain, use existing heuristics
- Test: Comprehensive regression tests on non-AFP tasks

**Scenario 3.2: Manual Claude Code override**
- User explicitly requests "use Sonnet 4"
- Phase detector says "use Opus 4 with extended thinking"
- System overrides user choice

**What can go wrong:**
- User frustration (system ignores explicit preference)
- Unexpected cost (user wanted cheaper model)
- Trust erosion

**Mitigation:**
- Respect explicit model parameter in MCP tools
- Phase detection is advisory, not mandatory
- Document: How to override phase-based routing

**Scenario 3.3: Autopilot phase progression**
- Autopilot completes STRATEGIZE phase
- Doesn't update task metadata to SPEC
- Next run still uses STRATEGIZE model (expensive)

**What can go wrong:**
- Stuck in expensive mode
- Cost escalation
- No clear signal phase is complete

**Mitigation:**
- Document: Autopilot should update `current_phase` when progressing
- Add: Phase progression checklist in REVIEW
- Future: Automatic phase progression based on evidence artifacts

### 4. Cost & Performance

**Scenario 4.1: Extended thinking explosion**
- Every STRATEGIZE task uses 16K thinking tokens
- 100 cognitive tasks per day
- 1.6M thinking tokens/day = $19.20/day (at $0.012/1K)

**What can go wrong:**
- Unsustainable cost for high-volume workflows
- Budget exhaustion
- Need to disable feature

**Mitigation:**
- Monitor: Daily thinking token usage dashboard
- Alert: If >10K tokens/day thinking budget
- Optimize: Reduce budgets for simpler cognitive tasks
- Gate: Limit extended thinking to critical tasks only

**Scenario 4.2: Latency increase**
- Extended thinking takes 10-30 seconds
- Cognitive phases become slow
- Autopilot throughput drops

**What can go wrong:**
- User impatience (feels slow)
- Autopilot cycle time increases
- Reduced productivity

**Mitigation:**
- Accept: Cognitive work should be thorough, not fast
- Communicate: Show "thinking..." progress indicator
- Optimize: Run cognitive phases async (don't block)
- Balance: Implementation phases stay fast (no extended thinking)

**Scenario 4.3: Token waste on repetitive cognitive work**
- Multiple tasks in same epic, all STRATEGIZE
- Each uses extended thinking to re-analyze same problem
- Redundant reasoning

**What can go wrong:**
- Wasteful token usage
- Inconsistent strategy across related tasks
- Cost inefficiency

**Mitigation:**
- Cache: Store strategy decisions in context
- Reference: Later tasks reference earlier cognitive work
- Optimize: Reduce thinking budget for related tasks
- Future: Cross-task reasoning cache

### 5. Quality Degradation

**Scenario 5.1: Overconfidence from extended thinking**
- STRATEGIZE uses high budget
- Claude produces elaborate but wrong strategy
- StrategyReviewer approves (looks thorough)
- Downstream work builds on flawed foundation

**What can go wrong:**
- Wasted implementation effort
- Hard to detect (strategy seems solid)
- Expensive remediation

**Mitigation:**
- Test: StrategyReviewer must validate logic, not just thoroughness
- Review: Human review for critical strategic decisions
- Iterate: Cheaper to catch errors in THINK/GATE than IMPLEMENT

**Scenario 5.2: Standard models for implementation still fail**
- IMPLEMENT uses Sonnet 4.5 (no extended thinking)
- Complex implementation needs deeper reasoning
- Produces buggy code

**What can go wrong:**
- Build failures
- Test failures
- Remediation loop (expensive)

**Mitigation:**
- Accept: Some implementations are complex enough to need extended thinking
- Override: Allow manual extended thinking request for complex IMPLEMENT
- Learn: Track implementation failure rate, adjust if needed

**Scenario 5.3: Phase mismatch with actual work**
- Task marked IMPLEMENT but doing strategic refactoring
- Uses standard model (no extended thinking)
- Produces shallow refactor (misses root cause)

**What can go wrong:**
- Poor quality output
- Rework needed
- User assigns wrong phase

**Mitigation:**
- Guidance: Document when to use each phase
- Validation: ProcessCritic checks phase alignment with work
- Flexible: Allow manual extended thinking override

## Complexity Analysis

**Algorithmic Complexity:**
- Phase detection: O(1) metadata lookup, O(n) file checks (n=5 phase files), O(m) title parsing (m=title length)
- Total: O(1) best case, O(n+m) worst case ~O(5+100) = O(105) trivial

**System Complexity:**
- **Added:** 1 new module (PhaseDetector), 2 modified modules
- **Increased:** Decision branches in model selection (+6 phase checks)
- **Risk:** Medium - adds branch to critical path (model selection)

**Justification:**
- Benefit: 85%+ cognitive quality (StrategyReviewer approval)
- Benefit: 20-30% cost reduction (no extended thinking for IMPLEMENT)
- Benefit: Consistent reasoning depth per phase type
- Cost: ~400 LOC, minimal runtime overhead
- Verdict: Complexity increase justified by quality+efficiency gains

## Alternative Approaches Considered

**Alternative 1: Prompt engineering instead of extended thinking**
- Add "think carefully" to prompts for cognitive phases
- No API changes, no thinking budget
- **Rejected:** Less reliable than explicit extended thinking API

**Alternative 2: Always use extended thinking**
- Enable for all Claude calls, regardless of phase
- Simpler (no detection logic)
- **Rejected:** Wasteful for IMPLEMENT, excessive cost

**Alternative 3: Manual phase tagging only**
- Require users to specify phase in every task
- No detection logic needed
- **Rejected:** High friction, easy to forget, breaks autopilot autonomy

**Alternative 4: Separate cognitive and implementation tasks**
- Split tasks: "TASK-1-STRATEGIZE" and "TASK-1-IMPLEMENT"
- Explicit task types
- **Rejected:** Adds task management overhead, fragments evidence

**Alternative 5: Phase-specific prompt templates**
- Different prompts per phase, trigger extended thinking via keywords
- No API extended thinking parameter
- **Rejected:** Less explicit, harder to control thinking budget

## Decision: Proceed with Phase Detection + Extended Thinking API

**Rationale:**
- Most explicit and controllable
- Leverages native Claude extended thinking feature
- Minimal complexity addition (O(1) detection)
- High quality gain (85%+ approval rates)
- Cost-efficient (20-30% reduction)
- Autopilot-friendly (auto-detection)
