# IMP-ADV-01.4 Think - Edge Cases and Design Decisions

## Edge Cases

### Edge Case 1: Corpus file doesn't exist

**Scenario**: First task completion before any vectors recorded, or corpus manually deleted

**Behavior**:
```typescript
// getCorpusSize() returns 0
try {
  const content = await fs.readFile(corpusPath, 'utf-8');
  // ...
} catch (error) {
  return 0; // File doesn't exist = empty corpus
}
```

**Resolution**: ✅ Return 0 (empty corpus)
- Not an error condition (corpus starts empty)
- MONITOR phase continues normally
- Next task will create corpus file (auto-recording)

**Test Coverage**: `corpus_metrics.test.ts` - "returns 0 for missing corpus"

---

### Edge Case 2: Empty corpus file (0 bytes)

**Scenario**: Corpus file exists but contains no vectors (edge case from manual intervention)

**Behavior**:
```typescript
const content = await fs.readFile(corpusPath, 'utf-8'); // Returns ""
const lines = content.trim().split('\n'); // Returns [""]
return lines.length > 0 && lines[0] !== '' ? lines.length : 0; // Returns 0
```

**Resolution**: ✅ Return 0 (empty corpus)
- Empty file treated same as missing file
- Avoids counting empty string as 1 vector

**Test Coverage**: `corpus_metrics.test.ts` - "returns 0 for empty corpus"

---

### Edge Case 3: Malformed JSONL (corrupt vectors)

**Scenario**: task_vectors.jsonl contains invalid JSON lines

**Behavior**:
```typescript
// getCorpusSize() only counts lines, doesn't parse JSON
const lines = content.trim().split('\n');
return lines.length; // Count all lines, even if malformed
```

**Resolution**: ✅ Count lines regardless of JSON validity
- **Rationale**: Corpus size metric measures storage, not quality
- Malformed vectors caught by quality graph query (separate concern)
- Simpler implementation (no JSON parsing overhead)

**Alternative Considered**: Parse each line, only count valid JSON
- **Rejected**: Too slow, unnecessary (quality graph handles validation)

---

### Edge Case 4: File read permission error

**Scenario**: task_vectors.jsonl exists but unreadable (permissions issue)

**Behavior**:
```typescript
try {
  const content = await fs.readFile(corpusPath, 'utf-8');
  // ...
} catch (error) {
  return 0; // Treat permission error same as missing file
}
```

**Resolution**: ✅ Return 0, log warning
- Non-blocking: MONITOR phase continues
- Logged in monitor_runner.ts try-catch: `logWarning('Failed to get corpus size', { error })`

**Action**: Fix permissions manually (not task's responsibility)

---

### Edge Case 5: Concurrent writes (race condition)

**Scenario**: Another process writes to task_vectors.jsonl while counting lines

**Behavior**:
```typescript
// File read is atomic operation
const content = await fs.readFile(corpusPath, 'utf-8');
// Returns snapshot of file at read time
```

**Resolution**: ✅ No issue (file reads are atomic)
- Corpus size reflects snapshot at metric emission time
- Slight lag acceptable (corpus changes slowly: 1-5 tasks/day)
- No locking needed

---

### Edge Case 6: Very large corpus (>2000 vectors, pruning failed)

**Scenario**: Pruning didn't trigger, corpus exceeds 2000 vectors

**Behavior**:
```typescript
const size = await getCorpusSize(workspaceRoot); // Returns actual count (e.g., 2500)
logInfo('Quality graph corpus size', { corpusSize: 2500 });
// Alert should fire (corpus > 2000)
```

**Resolution**: ✅ Report actual size, don't cap at 2000
- **Rationale**: Alert system needs actual value to trigger critical alert
- Visibility into problem (pruning failed)

**Expected Action**: Manual intervention to prune corpus

---

### Edge Case 7: Negative or NaN corpus size

**Scenario**: File system returns unexpected data

**Behavior**:
```typescript
const lines = content.trim().split('\n');
return lines.length; // Array.length always ≥0 (never negative)
```

**Resolution**: ✅ Not possible (Array.length is always non-negative integer)
- TypeScript type: `Promise<number>` enforces numeric return
- Math.max(0, lines.length) unnecessary (lines.length never negative)

---

## Alert Threshold Design

### Threshold Selection Rationale

**Prune Limit**: 2000 vectors
- Source: `quality_graph/persistence.ts` - `pruneOldVectors(workspaceRoot, keepRecent=2000)`
- Rationale: Performance acceptable for O(n) scan up to 2000 vectors (~50ms query)

**Warning Threshold**: 1800 vectors (90% of limit)
- Rationale: Give advance notice before critical threshold
- Action time: ~7-14 days at typical growth rate (10-20 vectors/week)
- Alert level: INFO or WARNING

**Critical Threshold**: 2000 vectors (100% of limit)
- Rationale: Pruning should have triggered by now
- Action time: Immediate manual investigation needed
- Alert level: ERROR or CRITICAL

**Growth Rate Alert**: >2x or <0.5x baseline
- Rationale: Detect unexpected changes in task completion rate
- Baseline: Calculated from 7-day rolling average
- Alert level: WARNING

### Alert Thresholds Table

| Threshold | Value | Alert Level | Action |
|-----------|-------|-------------|--------|
| **Nominal** | <1800 | None | No action needed |
| **Warning** | ≥1800, <2000 | WARNING | Review growth rate, prepare for prune |
| **Critical** | ≥2000 | ERROR | Manual prune needed, investigate why auto-prune didn't trigger |
| **Excessive** | ≥2100 | CRITICAL | Emergency prune, performance likely degraded |

---

## Performance Considerations

### File Reading Performance

**Operation**: Count lines in JSONL file

**Complexity**: O(n) where n = file size in bytes

**Expected Performance**:
- Corpus size: 2000 vectors
- Vector size: ~200 bytes average (task metadata)
- File size: ~400 KB
- Read time: <10ms on SSD

**Benchmark Target**: <50ms for 2000 vectors

**Optimization**: Not needed (file read is fast enough)

### Memory Usage

**Peak Memory**: ~400 KB for corpus file in memory during read

**Impact**: Negligible (MONITOR phase already uses MB for task artifacts)

**No Streaming Needed**: File small enough to read entirely

---

## Error Handling Strategy

### Non-Blocking Philosophy

**Principle**: Corpus size metric is **observability only**, not critical path

**Implementation**:
```typescript
try {
  const corpusSize = await getCorpusSize(workspaceRoot);
  logInfo('Quality graph corpus size', { corpusSize });
} catch (error) {
  logWarning('Failed to get corpus size', { error: error instanceof Error ? error.message : String(error) });
  // Don't throw - MONITOR phase continues
}
```

**Rationale**:
- Task completion more important than metric emission
- Metric failure shouldn't block progress
- Failures logged for debugging

### Error Categories

| Error Type | Handling | Log Level | MONITOR Continues? |
|------------|----------|-----------|---------------------|
| File not found | Return 0 | DEBUG | ✅ Yes |
| Permission denied | Return 0 | WARNING | ✅ Yes |
| Read I/O error | Return 0 | WARNING | ✅ Yes |
| Unexpected exception | Return 0 | WARNING | ✅ Yes |

**All errors**: Return 0, log, continue MONITOR

---

## Design Decisions Q&A

### Q1: Why count lines instead of parsing JSON?

**A**: Performance and simplicity
- Counting lines: O(n) in file size, no parsing overhead
- Parsing JSON: O(n) in file size + JSON parse cost per vector
- Corpus size = number of vectors, not quality of vectors
- JSON validation handled by quality graph query (separate concern)

**Decision**: ✅ Count lines (simpler, faster)

---

### Q2: Why emit metric in MONITOR phase instead of on every query?

**A**: Efficiency and accuracy
- Corpus only changes after task completion (MONITOR phase)
- Queries don't change corpus size (read-only)
- Emitting on every query: 10-50x more metrics, same value repeated
- MONITOR phase: 1-5 metrics/day, each time corpus actually grows

**Decision**: ✅ Emit in MONITOR (more efficient, accurate)

---

### Q3: Why not add automatic pruning when threshold reached?

**A**: Out of scope, requires careful design
- Pruning = data deletion (requires safety checks)
- Need to verify pruning logic correct before automating
- Manual pruning exists and works: `pruneOldVectors(workspaceRoot, keepRecent=2000)`
- This task: visibility only, no behavior changes

**Decision**: ✅ Manual pruning for now, defer automation to future task

---

### Q4: Why gauge metric instead of counter?

**A**: Semantic correctness
- **Gauge**: Current value (corpus size at this moment)
- **Counter**: Cumulative total (would grow forever, meaningless)
- Corpus size goes up AND down (after pruning)
- Gauges replace previous value, counters accumulate

**Decision**: ✅ Gauge (correct semantic)

---

### Q5: What if metrics_collector.ts doesn't exist yet?

**A**: Graceful degradation to logging
- Task 2 (monitor integration) logs corpus size regardless
- Task 3 (metrics_collector registration) optional if infrastructure not ready
- Documentation notes metric wiring pending IMP-OBS completion

**Decision**: ✅ Log corpus size always, emit metric if infrastructure ready

---

## Migration Path

**No migration needed** - purely additive change

**Deployment Steps**:
1. Deploy code with metric emission
2. Verify metric appears in logs: `grep "Quality graph corpus size" state/logs/autopilot.log`
3. If metrics_collector exists: Verify metric emitted to telemetry backend
4. Add alert rule when observability dashboard ready (IMP-OBS-05)

**Backward Compatibility**: 100% (no breaking changes)

---

## Future Enhancements (Out of Scope)

1. **Automatic Pruning**: Trigger pruning when corpus ≥1900
2. **Corpus Quality Metrics**: Track precision@5 over time
3. **Growth Rate Analysis**: Predict when prune threshold will be reached
4. **Historical Trends**: Dashboard showing corpus size over time (IMP-OBS-05)
5. **Per-Domain Corpus**: Separate corpora for different task types

**Note**: All future enhancements require this task complete first (need baseline metric)
