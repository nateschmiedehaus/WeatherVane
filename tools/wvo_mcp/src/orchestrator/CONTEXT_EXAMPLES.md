# Context Assembly Examples
## How Agents Get Just What They Need

---

## Example 1: Implementing a Feature (Codex Worker)

### Full State in Database (NOT sent to agent):
- 1,200 tasks in roadmap
- 15,000 events in log
- 3,500 quality metrics
- 200 context entries
- 50 checkpoints
- **Total: ~2MB of data**

### What Codex Actually Receives (assembled context):

```
## Current Task

**[T1.2.3] Add weather features to optimizer**
Integrate weather feature matrix from weather_cache into the optimizer's input pipeline.

Type: task | Status: in_progress | Complexity: 6

## Completed Dependencies
- [T1.2.1] Design optimizer API (includes input schema)
- [T1.2.2] Implement baseline optimizer (has working pipeline)

## Architectural Decisions (Context)
- **Weather Features**: Use daily aggregates only, hourly data too noisy for MMM
- **Feature Matrix**: Polars DataFrames for memory efficiency, not Pandas
- **Data Pipeline**: Feature store pattern, not direct API calls

## Constraints (Do Not Violate)
- Data Privacy: All weather data anonymized, no geo-coordinates in logs
- Performance: Feature matrix generation must complete in <500ms

## Recent Learnings
- DuckDB joins: 10x faster than Polars for multi-table joins >100k rows
- Weather API: Open-Meteo has rate limits, implement exponential backoff

## Relevant Files
- shared/feature_store/weather_cache.py
- shared/feature_store/feature_builder.py
- apps/model/baseline.py

*Use fs_read to examine these files before implementing*

## Project Status
Phase: **development** | Tasks completed today: 7 | Avg task duration: 23min | Quality trend: improving
```

**Size: ~400 tokens vs 50,000+ if we dumped everything**

---

## Example 2: Architectural Decision (Claude Code Coordinator)

### What Claude Code Receives (more strategic context):

```
## Current Task

**[E1.3] Design causal uplift methodology**
Define methodology for measuring incremental impact of weather-aware optimization vs baseline.

Type: epic | Status: in_progress | Complexity: 9

## Related Work
- [E1.2] Build optimizer (90% complete)
- [T1.2.7] MMM integration (blocked on this decision)
- [T1.2.8] Incrementality validation (blocked on this decision)

## Architectural Decisions (Context)
- **MMM Approach**: Using Bayesian structural time series (BSTS), not simple regression
- **Baseline Model**: Always-on OLS regression as control group
- **Test Framework**: Time-series validation, not k-fold (temporal leakage risk)

## Constraints (Do Not Violate)
- Scientific Rigor: Must be defensible to academic reviewers
- Business Reality: Methodology must work with <6 months historical data
- Causality: No correlation-only metrics, need actual causal evidence

## Quality Watch Points
- academic_rigor: 2 recent issues (need peer-reviewed citation for claims)
- causal: 1 recent issue (confounding variable not controlled)

## Recent Context Entries (Hypotheses)
- **Geo-granularity**: Testing whether ZIP-code level is sufficient vs county (confidence: 0.7)
- **Temporal windows**: Hypothesis that 7-day windows optimal for weather effects (confidence: 0.6)
- **Ad platform variation**: Meta may show stronger weather effects than Google (confidence: 0.5)

## Roadmap Health
- 47 tasks total, 32 completed (68%)
- 3 blocked (all waiting on this decision)
- Quality score: 0.87 (target: 0.85+)
- Phase: development → approaching shipping threshold

## Your Mission
1. Design methodology that unblocks downstream tasks
2. Document decision rationale for future context
3. Identify what new tasks needed to implement methodology
4. Flag any new constraints or hypotheses discovered

*You are the Staff Engineer. Think deeply, then delegate implementation to Codex workers.*
```

**Size: ~500 tokens (strategic context) vs 50,000+ if full dump**

---

## Example 3: Code Review Task (Claude Code)

### What Claude Code Receives:

```
## Current Task

**[T1.2.9] Review PR: Weather feature integration**
Code review for Codex worker #2's implementation of T1.2.3

Type: task | Status: needs_review | Complexity: 4

## Files Changed
- shared/feature_store/weather_cache.py (+120 lines)
- apps/model/baseline.py (+45 lines)
- tests/test_feature_builder.py (+200 lines)

*Use fs_read to examine these files*

## Original Task Requirements
[Context from T1.2.3 shown above]

## Quality Standards (Must Meet)
- Code Elegance: 85%+ (surgical edits, clear naming, proper abstraction)
- Test Coverage: 90%+ (edge cases covered)
- Performance: Feature matrix generation <500ms
- Documentation: Docstrings on public functions

## Recent Quality Issues in Similar Work
- Performance: 2 recent issues with Polars memory usage
- Testing: 1 issue with missing edge case (empty DataFrames)

## Review Checklist
- [ ] Meets original requirements
- [ ] Follows architectural decisions (Polars, not Pandas)
- [ ] Respects constraints (performance, privacy)
- [ ] Quality standards met
- [ ] Tests comprehensive
- [ ] No regressions introduced

## Next Actions
- If approved: Transition to 'done', unblock dependent tasks
- If needs work: Transition to 'needs_improvement', delegate fixes to Codex
```

**Size: ~350 tokens (focused review context)**

---

## Example 4: Bug Fix (Codex Worker)

### What Codex Receives:

```
## Current Task

**[BUG-42] Weather cache returns stale data**
Users report weather features lag by 24 hours, causing optimizer to use yesterday's weather.

Type: bug | Status: in_progress | Complexity: 5

## Recent Events Related to This Bug
- Reported: 2 hours ago by QA engineer
- Investigation: Cache invalidation logic may have regression
- Suspected Files: shared/feature_store/weather_cache.py

## Relevant Context
- **Caching Strategy**: Redis with 1-hour TTL for weather data
- **Update Schedule**: Weather API polled every 30 minutes
- **Recent Change**: Refactor in T1.2.3 may have broken cache key generation

## Relevant Files
- shared/feature_store/weather_cache.py (caching logic)
- shared/libs/connectors/weather.py (API calls)
- tests/test_weather_cache.py (existing tests)

## Quality Standard
This is a **production bug** - quality bar is HIGH:
- Root cause must be identified and fixed
- Add regression test to prevent recurrence
- Update monitoring to catch this faster next time
- Verify fix in staging before marking done

## Debugging Steps
1. Read weather_cache.py, look for cache key generation
2. Check if cache invalidation logic changed in recent commits
3. Write failing test that reproduces issue
4. Implement fix
5. Verify all tests pass

*Focus: Fix the bug correctly, don't rush*
```

**Size: ~300 tokens (debugging context)**

---

## Key Principles

### ✅ DO Include:
- **Task definition** - What needs to be done
- **Dependencies** - What it builds on
- **Decisions** - Why we chose current approach
- **Constraints** - What can't be changed
- **Learnings** - Avoid past mistakes
- **Quality bar** - Standards to meet
- **Files to read** - Where to look

### ❌ DON'T Include:
- Full event log (use summaries)
- All tasks in roadmap (just related ones)
- Historical quality metrics (just trends)
- Completed work details (just outcomes)
- Full conversation history (just decisions)

### 🎯 Result:
- **Prompts: 300-500 tokens** (focused)
- **vs Full Dump: 50,000+ tokens** (overwhelming)
- **Speed: 10x faster** (less to process)
- **Cost: 100x cheaper** (fewer tokens)
- **Quality: Better** (less distraction)

---

## Implementation Pattern

```typescript
// When assigning task to agent
async function promptAgent(agent: 'codex' | 'claude_code', taskId: string) {
  // 1. Assemble just-in-time context
  const context = await contextAssembler.assembleForTask(taskId, {
    includeCodeContext: agent === 'codex',  // Codex needs files
    includeQualityHistory: agent === 'claude_code',  // Claude does review
    maxDecisions: agent === 'claude_code' ? 10 : 5,  // Claude needs more context
    hoursBack: 24  // Only last 24 hours relevant
  });

  // 2. Format as concise prompt
  const promptContext = contextAssembler.formatForPrompt(context);

  // 3. Send ONLY this to agent (not full state)
  const prompt = `${promptContext}\n\n---\n\nYour task: ${getTaskInstructions(agent)}`;

  // 4. Execute
  return await executeAgent(agent, prompt);
}
```

This way:
- ✅ Agents get exactly what they need
- ✅ No wasted tokens on irrelevant data
- ✅ Fast processing (small prompts)
- ✅ High quality (focused attention)
- ✅ Cheap (minimal token usage)

---

**The full state machine can grow to gigabytes over months. Agents never see that. They see 300-500 tokens of laser-focused context.**
