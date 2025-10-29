# IMP-ADV-01.4 Specification - Corpus Size Monitoring

## Acceptance Criteria

### AC1: Corpus Size Helper Function

**Requirement**: `getCorpusSize(workspaceRoot)` accurately counts task vectors

**Verification**:
```typescript
// Test: Count known corpus
const size = await getCorpusSize('/path/to/workspace');
expect(size).toBe(actualLineCount); // Match wc -l output

// Test: Empty corpus
const emptySize = await getCorpusSize('/path/with/no/corpus');
expect(emptySize).toBe(0); // Return 0 if file doesn't exist
```

**Pass Criteria**:
- ✅ Returns exact line count from task_vectors.jsonl
- ✅ Returns 0 if file doesn't exist (graceful degradation)
- ✅ Handles large files (2000+ vectors) efficiently (<50ms)

---

### AC2: Metric Emitted in MONITOR Phase

**Requirement**: Corpus size metric emitted after task vector recorded

**Verification**:
```typescript
// Check monitor_runner.ts integration
// After line ~95 (task vector recording):
const corpusSize = await getCorpusSize(workspaceRoot);
emitMetric('quality_graph_corpus_size', corpusSize);
```

**Pass Criteria**:
- ✅ Metric emitted after successful task vector recording
- ✅ Metric value matches current corpus size
- ✅ Integration point: monitor_runner.ts after recordTaskVector() call

---

### AC3: Metric Registered in Metrics Collector

**Requirement**: `quality_graph_corpus_size` registered as gauge metric

**Verification**:
```typescript
// metrics_collector.ts should include:
registerMetric({
  name: 'quality_graph_corpus_size',
  type: 'gauge', // Current value (not cumulative)
  description: 'Number of task vectors in quality graph corpus',
  unit: 'vectors'
});
```

**Pass Criteria**:
- ✅ Metric registered in metrics_collector.ts
- ✅ Type: gauge (not counter or histogram)
- ✅ Proper metadata: description, unit

---

### AC4: Non-Blocking Error Handling

**Requirement**: MONITOR phase succeeds even if corpus metric fails

**Verification**:
```typescript
// Test: Metric failure doesn't crash MONITOR
try {
  const size = await getCorpusSize(workspaceRoot);
  emitMetric('quality_graph_corpus_size', size);
} catch (error) {
  logWarning('Corpus size metric failed', { error });
  // Continue MONITOR phase (don't throw)
}
```

**Pass Criteria**:
- ✅ Try-catch around metric emission
- ✅ Error logged as warning (not error)
- ✅ MONITOR phase completes successfully even on metric failure

---

### AC5: Documentation Updated

**Requirement**: Quality graph README documents corpus monitoring

**Verification**:
Check `quality_graph/README.md` includes:
- Section: "Corpus Size Monitoring"
- Metric name and description
- Alert thresholds (warn at 1800, critical at 2000)
- Manual check command: `wc -l state/quality_graph/task_vectors.jsonl`

**Pass Criteria**:
- ✅ README section added
- ✅ Metric documented with example query
- ✅ Alert thresholds documented
- ✅ Manual inspection commands provided

---

### AC6: Test Coverage

**Requirement**: Unit tests verify corpus size counting

**Verification**:
```typescript
// Test file: corpus_metrics.test.ts
describe('getCorpusSize', () => {
  it('counts vectors in JSONL file', async () => {
    // Write test corpus with known size
    // Verify getCorpusSize() returns correct count
  });

  it('returns 0 for missing file', async () => {
    // Verify graceful handling of non-existent corpus
  });

  it('handles empty corpus', async () => {
    // Empty file should return 0
  });
});
```

**Pass Criteria**:
- ✅ Test file created: `corpus_metrics.test.ts`
- ✅ Tests: known corpus, missing file, empty corpus
- ✅ All tests passing

---

## Verification Mapping

| **Acceptance Criterion** | **Verification Method** | **Evidence Location** |
|--------------------------|-------------------------|------------------------|
| AC1: Helper function accurate | Unit tests + manual verification | `corpus_metrics.test.ts` |
| AC2: Metric emitted in MONITOR | Code inspection + integration test | `monitor_runner.ts:~95` |
| AC3: Metric registered | Code inspection | `metrics_collector.ts` |
| AC4: Non-blocking errors | Error injection test | `monitor_runner.ts` (try-catch) |
| AC5: Documentation updated | Manual inspection | `quality_graph/README.md` |
| AC6: Test coverage | Test execution | `npm test -- corpus_metrics.test.ts` |

---

## KPIs

### Immediate (Post-Deployment)

**Metric Availability**:
- Target: 100% of MONITOR phases emit corpus size metric
- Measurement: Count `quality_graph_corpus_size` emissions in telemetry
- Alert: If metric missing for >24 hours

**Metric Accuracy**:
- Target: Metric value matches actual corpus size (±0 tolerance)
- Measurement: Spot check `wc -l` vs metric value
- Alert: If discrepancy detected

### Short-Term (Week 1-4)

**Corpus Growth Rate**:
- Target: Predictable growth (~1-10 vectors/day based on task completion rate)
- Measurement: Track metric over time, calculate slope
- Alert: If growth rate suddenly changes (>2x or <0.5x baseline)

**Prune Threshold Monitoring**:
- Target: Alert fires when corpus ≥1800 vectors (90% of 2000)
- Measurement: Check for alert when threshold reached
- Alert: If corpus exceeds 1800 without warning

### Long-Term (Month 1+)

**Performance Correlation**:
- Target: Query latency remains <100ms while corpus <2000
- Measurement: Correlate corpus size with hint query latency
- Alert: If latency >200ms for corpus <2000 (performance regression)

**Pruning Events**:
- Target: Pruning occurs before corpus exceeds 2000
- Measurement: Log pruning events, correlate with corpus size metric
- Alert: If corpus exceeds 2100 (pruning failed)

---

## Out of Scope (Explicitly NOT Included)

1. **Automatic Pruning**: This task only adds visibility, not new pruning behavior
2. **Corpus Quality Metrics**: Precision/recall covered by IMP-ADV-01.3
3. **Historical Trends**: Telemetry dashboard implementation (IMP-OBS-05)
4. **Alert Rules**: Alert configuration deferred to observability infrastructure
5. **Performance Optimization**: Query latency improvements separate task

---

## Dependencies

**Required (Must Exist)**:
- ✅ IMP-ADV-01: Quality Graph Baseline (COMPLETE)
- ✅ IMP-ADV-01.2: Hint Injection (COMPLETE - ensures corpus actively grows)
- ✅ `monitor_runner.ts`: Task vector recording (exists)
- ✅ `metrics_collector.ts`: Telemetry infrastructure (exists)

**Optional (Nice to Have)**:
- ⏳ IMP-OBS-05: Metrics Dashboard (for visualizing corpus size trends)
- ⏳ Alert infrastructure (for automated warnings at 1800 vectors)

---

## Rollback Plan

**If issues arise**:
1. **Remove metric emission**: Comment out `emitMetric()` call in monitor_runner.ts
   - Effect: Stop collecting corpus size data
   - Risk: Low (monitoring only, no behavior changes)

2. **Revert commit**: Rollback entire change
   - Effect: Remove helper function, metric registration, docs
   - Risk: Very Low (purely additive, no migrations)

**Rollback Testing**: Not required (metric emission is non-critical, can be disabled anytime)

---

## Success Definition

**Task Complete When**:
1. ✅ All 6 acceptance criteria met
2. ✅ Tests passing (corpus_metrics.test.ts)
3. ✅ Build clean (no TypeScript errors)
4. ✅ Metric visible in telemetry logs
5. ✅ Documentation updated
6. ✅ Evidence complete (9 phases)

**Production Ready When**:
- ✅ Deployed to production
- ✅ Metric emitted for at least 1 task completion
- ✅ Metric value verified against manual `wc -l` check
