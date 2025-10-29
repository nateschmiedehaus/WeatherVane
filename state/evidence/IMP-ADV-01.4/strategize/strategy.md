# IMP-ADV-01.4 Strategy - Corpus Size Monitoring

## Problem

**Current State**: Quality graph corpus grows unbounded as tasks complete
- Corpus stored in `state/quality_graph/task_vectors.jsonl` (JSONL format, one vector per line)
- Auto-recording active after MONITOR phase (IMP-ADV-01 implementation)
- Pruning threshold: 2000 vectors (defined in quality_graph/persistence.ts)
- **No visibility**: Can't see corpus size without manual `wc -l` inspection
- **No alerts**: No warning when approaching prune limit

**Risk**: Performance degrades as corpus grows beyond 2000 vectors
- Query latency increases (linear O(n) scan)
- Memory usage grows (vectors loaded into memory for similarity search)
- Prune threshold exceeded → unexpected pruning behavior

**Trigger**: Quality graph now active in production (IMP-ADV-01.2 complete)

## Objective

Add telemetry metric `quality_graph_corpus_size` to provide visibility and alerting for corpus health.

**Goals**:
1. **Visibility**: Expose corpus size as observable metric
2. **Alerting**: Warn when approaching prune threshold (e.g., ≥90% of 2000 = 1800 vectors)
3. **Prevention**: Prevent surprise performance issues from unbounded growth

**Non-Goals**:
- Changing pruning logic (already exists, works correctly)
- Adding new pruning triggers (keep existing 2000 vector threshold)
- Corpus quality metrics (covered by IMP-ADV-01.3 precision@5)

## Scope

**In Scope**:
- Add `quality_graph_corpus_size` metric to telemetry
- Count vectors in task_vectors.jsonl file
- Emit metric during MONITOR phase (natural integration point)
- Wire to metrics_collector.ts (existing telemetry infrastructure)

**Out of Scope**:
- Automatic pruning triggers (manual pruning already works)
- Corpus quality metrics (separate concern)
- Performance optimization (query latency covered separately)
- Historical corpus size trends (deferred to future observability work)

## Inputs

**Existing Infrastructure**:
- ✅ `state/quality_graph/task_vectors.jsonl` - Corpus storage (JSONL format)
- ✅ `quality_graph/persistence.ts` - Prune function with 2000 vector threshold
- ✅ `metrics_collector.ts` - Telemetry infrastructure
- ✅ `monitor_runner.ts` - MONITOR phase (records task vectors after completion)

**Dependencies**:
- IMP-ADV-01: Quality Graph Baseline (COMPLETE)
- IMP-ADV-01.2: Hint Injection (COMPLETE - ensures quality graph actively used)

## Alternatives Considered

### Alternative 1: Real-time metric updates on every query

**Approach**: Count corpus size every time hints are queried (plan_runner.ts)

**Pros**:
- Real-time accuracy
- No new integration point needed

**Cons**:
- Performance overhead: Count on every query (~10-50 queries/day)
- Unnecessary: Corpus only changes after MONITOR phase (1-5 times/day)
- Duplicate metrics: Same size reported many times

**Decision**: ❌ REJECTED - Too frequent, adds overhead

### Alternative 2: Periodic background job

**Approach**: Cron job or interval timer that counts corpus size every N minutes

**Pros**:
- Decoupled from task execution
- Can run even when autopilot idle

**Cons**:
- Requires new infrastructure (scheduler, background worker)
- Over-engineering for simple requirement
- May miss corpus changes if interval too long

**Decision**: ❌ REJECTED - Too complex for 30-minute task

### Alternative 3: Emit metric during MONITOR phase (CHOSEN)

**Approach**: Count corpus size after task vector recorded in monitor_runner.ts

**Pros**:
- Natural integration point (corpus just changed)
- No new infrastructure needed
- Minimal performance overhead (1 metric per task completion)
- Accurate: Emitted when corpus actually grows

**Cons**:
- Not real-time (only updates after task completion)
- Won't capture manual backfills (acceptable - backfill is rare)

**Decision**: ✅ CHOSEN - Simplest, most natural integration

## Strategy

**Minimal Integration Approach**:

1. **Add Corpus Size Helper** (`quality_graph/corpus_metrics.ts`)
   - Function: `getCorpusSize(workspaceRoot): Promise<number>`
   - Implementation: Count lines in task_vectors.jsonl
   - Error handling: Return 0 if file doesn't exist (corpus empty)

2. **Emit Metric in MONITOR Phase** (`monitor_runner.ts`)
   - After recording task vector (existing code at line ~95)
   - Call `getCorpusSize()` and emit metric
   - Non-blocking: Don't fail MONITOR if metric emission fails

3. **Wire to Metrics Collector** (`metrics_collector.ts`)
   - Register `quality_graph_corpus_size` metric
   - Type: Gauge (current value, not cumulative)
   - Tags: none needed (single global corpus)

4. **Documentation** (`quality_graph/README.md`)
   - Add "Corpus Size Monitoring" section
   - Describe metric, alert thresholds, manual check commands

**Integration Points**:
- `monitor_runner.ts:95` - After task vector recorded
- `metrics_collector.ts` - Register new metric
- `quality_graph/corpus_metrics.ts` - New file (~15 lines)

**Performance Impact**: Negligible
- File line count: O(n) where n = corpus size (~2000 max)
- Frequency: 1-5 times per day (per task completion)
- Cost: <10ms per metric emission

## Risk Assessment

**Technical Risks**:
1. **File I/O failure**: task_vectors.jsonl doesn't exist
   - **Mitigation**: Return 0 if file missing (corpus empty)
   - **Severity**: Low (graceful degradation)

2. **Performance overhead**: Counting large file slows MONITOR
   - **Mitigation**: Corpus capped at 2000 lines (fast to count)
   - **Severity**: Very Low (<10ms overhead)

3. **Metric not emitted**: metrics_collector failure
   - **Mitigation**: Non-blocking, don't fail MONITOR phase
   - **Severity**: Low (monitoring only, not critical path)

**Process Risks**:
1. **Scope creep**: Adding auto-prune triggers, quality metrics, etc.
   - **Mitigation**: Strict scope definition (metric only, no new behavior)
   - **Severity**: Low (30-minute time box enforced)

**Overall Risk**: LOW - Simple metric emission, no behavior changes

## Success Criteria

**Immediate** (Day 1):
- ✅ `quality_graph_corpus_size` metric emitted after task completion
- ✅ Metric value matches actual corpus size (verified manually)
- ✅ MONITOR phase doesn't fail if metric emission fails

**Short-Term** (Week 1-2):
- ✅ Metric visible in telemetry logs/dashboard
- ✅ Corpus size trends observable over time
- ✅ Alert fires when corpus ≥1800 vectors (90% threshold)

**Long-Term** (Month 1+):
- ⏳ Corpus growth rate predictable (X vectors/day)
- ⏳ Pruning events correlated with corpus size metric
- ⏳ No surprise performance issues from unbounded growth

## Acceptance Criteria (Preview)

Will be formalized in SPEC phase, but key criteria:

1. **AC1**: `getCorpusSize()` function counts task_vectors.jsonl lines accurately
2. **AC2**: Metric emitted in MONITOR phase after task vector recorded
3. **AC3**: Metric registered in metrics_collector.ts
4. **AC4**: Non-blocking: MONITOR succeeds even if metric fails
5. **AC5**: Documentation updated with monitoring guidance

## Migration Path

No migration needed - this is purely additive (new metric, no behavior changes).

**Rollout**:
1. Deploy code with metric emission
2. Verify metric appears in telemetry
3. Add alert rule when observability dashboard ready (IMP-OBS-05)

**Rollback**:
- Remove metric emission code
- No data migration needed (no schema changes)

## References

- **Quality Graph README**: `tools/wvo_mcp/src/quality_graph/README.md:276-280` (pruning documentation)
- **Persistence Module**: `tools/wvo_mcp/src/quality_graph/persistence.ts` (pruning logic)
- **Monitor Runner**: `tools/wvo_mcp/src/orchestrator/state_runners/monitor_runner.ts` (task vector recording)
- **Metrics Collector**: `tools/wvo_mcp/src/telemetry/metrics_collector.ts` (telemetry infrastructure)

## Time Estimate

**Total**: 30 minutes

**Breakdown**:
- STRATEGIZE: 5 minutes (this document)
- SPEC: 5 minutes (acceptance criteria)
- PLAN: 3 minutes (3 tasks: helper function, emit metric, update docs)
- THINK: 2 minutes (error handling, alert thresholds)
- IMPLEMENT: 10 minutes (write code)
- VERIFY: 3 minutes (test metric emission)
- REVIEW: 1 minute (quick quality check)
- PR: 1 minute (commit)
- MONITOR: negligible (update roadmap)
