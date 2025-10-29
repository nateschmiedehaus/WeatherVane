# IMP-ADV-01 · THINK: Quality Graph Edge Cases & Alternatives

**Task**: Quality Graph Integration - Vector tracking for autopilot tasks
**Phase**: THINK
**Date**: 2025-10-29

---

## Edge Cases & Questions

### Edge Case 1: Empty Corpus (Cold Start)

**Scenario**: First task in system, no historical vectors

**Questions**:
- How does similarity query behave with 0 historical tasks?
- Should planner/observer get different message vs "no similar tasks"?
- Does this degrade gracefully?

**Analysis**:
```typescript
// findSimilarTasks() when corpus empty
if (taskVectors.length === 0) {
  return []; // Empty array - planner handles gracefully
}
```

**Mitigation**:
- Return empty array (not error)
- Planner checks `similarTasks.length > 0` before using hints
- Log info message: "Quality graph corpus empty, building baseline..."
- Backfill script populates initial corpus (optional)

**Test Case**:
```typescript
it('returns empty array when corpus empty', () => {
  const result = findSimilarTasks('task-1', 5);
  expect(result).toEqual([]);
});
```

---

### Edge Case 2: Identical Tasks (100% Similarity)

**Scenario**: Task "Add GET /api/users" runs twice, embeddings identical

**Questions**:
- How to break ties when similarity = 1.0?
- Should identical tasks be excluded from results?
- What if user re-runs failed task?

**Analysis**:
```python
# Tie-breaking strategies:
1. Most recent task first (recency bias)
2. Successful tasks first (outcome bias)
3. Lowest duration first (efficiency bias)
```

**Mitigation**:
- Sort by (similarity DESC, timestamp DESC) - most recent identical task wins
- Include outcome in metadata: `{task_id, similarity, outcome: 'success'}`
- Planner prefers successful similar tasks over failed ones

**Test Case**:
```typescript
it('breaks ties by recency', () => {
  const older = {id: 't1', similarity: 1.0, timestamp: '2025-10-01'};
  const newer = {id: 't2', similarity: 1.0, timestamp: '2025-10-28'};
  const result = findSimilarTasks('t3', 2);
  expect(result[0].id).toBe('t2'); // Newer task first
});
```

---

### Edge Case 3: Vector Drift (Format Changes Over Time)

**Scenario**: Task descriptions change format: "Add API endpoint" → "feat(api): implement GET /users"

**Questions**:
- Will old vectors match new format?
- Should we re-compute historical vectors periodically?
- How to detect format drift?

**Analysis**:
```python
# TF-IDF is somewhat robust to format changes:
- "Add API endpoint" → [api:0.8, endpoint:0.6, add:0.4]
- "feat(api): implement GET /users" → [api:0.7, implement:0.6, users:0.5, feat:0.3]
# Still have "api" overlap, but lower similarity
```

**Mitigation**:
- Track average similarity of recent tasks (rolling window)
- If avg similarity drops <0.3 over 100 tasks → log warning: "Possible vector drift"
- Backfill script with `--recompute` flag to refresh old vectors
- Document in README: "Re-run backfill quarterly to refresh embeddings"

**Monitoring**:
```typescript
const avgSimilarity = recentTasks.map(t => t.topSimilarity).mean();
if (avgSimilarity < 0.3) {
  logWarning('Quality graph: possible vector drift detected');
}
```

---

### Edge Case 4: Corpus Growth (1000 → 10000 tasks)

**Scenario**: After 6 months, corpus has 10k vectors, similarity queries slow

**Questions**:
- Will in-memory index fit in RAM? (10k × 384 floats × 4 bytes = ~15MB, OK)
- Will similarity computation stay <50ms?
- Do we need pagination or pruning?

**Analysis**:
```
Worst case: 10k vectors × 384 dimensions
- Cosine similarity per task: 384 multiplications + 1 norm = ~400 ops
- 10k tasks × 400 ops = 4M ops
- Modern CPU: ~1-2ms for 4M float ops (acceptable!)
```

**Mitigation**:
- Benchmark at 1k, 5k, 10k corpus sizes
- If >100ms: prune old tasks (keep recent 2000) or use FAISS index
- Monitor p95 query latency via OTEL spans
- Alert if p95 > 100ms for 3 consecutive queries

**Fallback**:
```typescript
// Prune strategy: keep recent 2000 tasks
if (taskVectors.length > 2000) {
  taskVectors.sort((a, b) => b.timestamp - a.timestamp);
  taskVectors = taskVectors.slice(0, 2000);
  logInfo('Quality graph: pruned to 2000 most recent tasks');
}
```

---

### Edge Case 5: Concurrent Queries During Backfill

**Scenario**: Backfill script writing 500 vectors, planner queries mid-backfill

**Questions**:
- Will planner read partial corpus?
- Could concurrent access corrupt index?
- Should backfill lock corpus?

**Analysis**:
```
Option A: File locking (blocks queries during backfill)
Option B: Atomic swaps (write to temp file, rename)
Option C: Eventual consistency (queries see partial corpus, acceptable)
```

**Mitigation** (Option C - Eventual Consistency):
- Backfill appends to `task_vectors.jsonl` atomically (one line at a time)
- Planner loads index at query time (reads current file state)
- Partial corpus acceptable: planner works with whatever's available
- No locking needed (JSONL append is atomic on POSIX filesystems)

**Trade-off**:
- **Pro**: No blocking, simple implementation
- **Con**: Backfill mid-query sees partial corpus (acceptable for hints)

---

### Edge Case 6: Embedding Quality for Short Titles

**Scenario**: Task title = "Fix bug", description empty

**Questions**:
- Will TF-IDF produce meaningful embedding?
- All "Fix bug" tasks identical?
- Should we require minimum text length?

**Analysis**:
```python
# TF-IDF for "Fix bug":
# - Very generic, low signal
# - Will match ALL fix tasks (not useful)

# Enhancement: include files_touched in embedding
# "Fix bug" + ["src/api/users.ts"] → better signal
```

**Mitigation**:
- Weight files_touched higher (0.4) than title (0.3) for short titles
- Preprocess: expand abbreviations ("Fix" → "Fix bug error issue")
- Log warning if embedding text <20 chars: "Consider more descriptive title"
- Similarity threshold: ignore matches <0.5 (too generic)

**Enhancement (Future)**:
```python
# Context-aware expansion:
title = "Fix bug"
files = ["api/auth.ts"]
expanded_title = f"Fix bug in {infer_domain(files)}"  # "Fix bug in authentication"
```

---

### Edge Case 7: Unicode and Special Characters

**Scenario**: Task title has emoji, CJK characters, or code snippets

**Questions**:
- Will tokenizer handle unicode correctly?
- Should code snippets be removed or preserved?
- Emoji signals? (e.g., 🔥 for critical, 🐛 for bug)

**Analysis**:
```python
# Tokenization challenges:
"Fix 🐛 in API" → ["Fix", "🐛", "in", "API"]
"修复错误" → ["修复错误"] or ["修", "复", "错", "误"]?
"Add `cache.get(key)` method" → ["Add", "cache.get(key)", "method"] or split?
```

**Mitigation**:
- Use unicode-aware tokenizer (scikit-learn CountVectorizer with `token_pattern=r'\b\w\w+\b'`)
- Remove emoji (low signal): `text = emoji.remove_emoji(text)`
- Preserve code in backticks but normalize: `cache.get(key)` → `code_snippet`
- CJK: use jieba or similar for Chinese tokenization (optional, future)

**Test Case**:
```python
def test_unicode_embedding():
    metadata = {
        'title': 'Fix 🐛 in API',
        'description': 'Add cache.get(key) method',
        'files': []
    }
    embedding = compute_embedding(metadata)
    assert embedding.shape == (384,)
    assert not any(np.isnan(embedding))  # No NaN from unicode issues
```

---

### Edge Case 8: Task Outcome Unknown (In-Progress)

**Scenario**: Task started but not completed, should we record vector?

**Questions**:
- Do in-progress tasks have vectors?
- Should failed tasks have lower weight in similarity?
- How to handle abandoned tasks?

**Analysis**:
```
Recording strategy:
- Record vector ONLY at MONITOR phase (task complete)
- Include outcome: {success: true/false, abandoned: true/false}
- Similarity queries can filter: "similar successful tasks only"
```

**Mitigation**:
- Only record vector after task reaches MONITOR phase
- Include `outcome` field: `{status: 'success'|'failure'|'abandoned', reason: string}`
- Planner queries filter: `findSimilarTasks(taskId, k, {successOnly: true})`
- Failed tasks still useful: "avoid this approach, it failed last time"

**Query API**:
```typescript
interface SimilarityOptions {
  k: number;
  successOnly?: boolean;    // Only successful tasks
  minSimilarity?: number;   // Threshold (default: 0.3)
  excludeAbandoned?: boolean;
}
```

---

### Edge Case 9: Similarity Threshold Too Low

**Scenario**: Top-K returns tasks with similarity <0.2 (very different)

**Questions**:
- Should we return low-similarity results?
- What's the minimum useful similarity?
- How to calibrate threshold?

**Analysis**:
```
Manual eval of similarity thresholds:
- >0.8: Very similar (almost identical)
- 0.5-0.8: Moderately similar (same domain)
- 0.3-0.5: Loosely similar (some overlap)
- <0.3: Not similar (noise)
```

**Mitigation**:
- Default threshold: 0.3 (filter out noise)
- Return results with `{task_id, similarity, is_confident: similarity > 0.5}`
- Planner uses high-confidence hints differently than low-confidence
- Log distribution of similarities for tuning

**Adaptive Threshold**:
```typescript
// If top result has low similarity, expand threshold
const topResult = results[0];
if (topResult.similarity < 0.3) {
  logInfo('Quality graph: top similarity low, consider expanding corpus');
  return []; // Don't return unhelpful hints
}
```

---

### Edge Case 10: Backfill Skips Tasks (Missing Metadata)

**Scenario**: Old tasks in phase ledger lack files_touched or description

**Questions**:
- Can we compute embedding without description?
- Should we skip tasks with missing data?
- What's minimum required metadata?

**Analysis**:
```python
# Required fields: title (always present)
# Optional fields: description, files_touched

# Strategy: Compute with available data
if not title:
    skip("No title")
elif not description and not files:
    embedding = compute_from_title_only(title)  # Low quality but better than nothing
else:
    embedding = compute_full(title, description, files)
```

**Mitigation**:
- Minimum requirement: task_id + title
- Graceful degradation: use title-only embeddings if other fields missing
- Log stats: "Backfilled 100 tasks: 80 full, 15 title-only, 5 skipped"
- Mark low-quality embeddings: `{quality: 'high'|'medium'|'low'}`

**Backfill Report**:
```json
{
  "tasks_processed": 100,
  "embeddings_high_quality": 80,
  "embeddings_low_quality": 15,
  "skipped_no_title": 5,
  "duration_ms": 12000
}
```

---

## Worthiness & Alternatives

### ROI Quick Test

**Question**: Does this move KPI K by ≥ T at cost ≤ B?

**KPIs**:
- **K1**: Planner reuses proven approaches → 20% faster planning (qualitative)
- **K2**: Observer detects anomalies → catches 1 issue per 10 tasks (prevents debugging waste)
- **K3**: Reduced redundant work → 10% fewer duplicate implementations

**Cost**:
- **B1**: Implementation time: ~25h (one week)
- **B2**: Maintenance: ~2h/month (monitor corpus, tune embeddings)
- **B3**: Runtime overhead: <50ms per task (negligible)

**ROI**:
- If observer catches 1 major issue per month → saves 4-8h debugging → ROI positive in 3 months
- If planner hints reduce planning time 20% → saves 30min/week → ROI positive in 2 months

**Conclusion**: Worthwhile if autopilot runs ≥10 tasks/week

---

### Duplication Scan

**Question**: Existing patterns/tools that cover ≥80%?

**Existing Solutions**:
1. **Phase Ledger** (IMP-FUND-01): Stores task history but no similarity search
2. **Decision Journal**: Records decisions but no vector embeddings
3. **Evidence Artifacts**: Plan/spec/review outputs but no cross-task comparison

**Coverage**: Existing tools provide 40% of functionality (historical data, no similarity)

**Conclusion**: Quality Graph adds net-new capability (similarity search)

---

### Not-Do Decision

**Option**: Defer Quality Graph, rely on manual pattern recognition

**Rationale**:
- **Pro**: Simpler, no new code, no embeddings complexity
- **Con**: Autopilot re-solves problems, observer lacks baseline, no quantitative improvement tracking

**Decision**: Proceed with Quality Graph

**Why**: Similarity search is core to "learning from past tasks" - manual pattern recognition doesn't scale

---

## Mitigations Summary

| Edge Case | Mitigation | Test |
|-----------|-----------|------|
| Empty Corpus | Return empty array, graceful degradation | Integration test: first task |
| Identical Tasks | Sort by (similarity DESC, timestamp DESC) | Tie-breaking unit test |
| Vector Drift | Monitor avg similarity, re-backfill quarterly | Drift detection test |
| Corpus Growth | Prune to 2000 tasks, monitor p95 latency | Benchmark 1k/5k/10k |
| Concurrent Queries | Eventual consistency, atomic appends | Concurrent query test |
| Short Titles | Weight files_touched higher, log warning | Short title test case |
| Unicode | Remove emoji, unicode-aware tokenizer | Unicode test case |
| In-Progress Tasks | Record only at MONITOR, include outcome | Integration test |
| Low Similarity | Threshold 0.3, return empty if top <0.3 | Threshold test |
| Missing Metadata | Graceful degradation, title-only embeddings | Backfill test |

---

## Next Phase: IMPLEMENT

Ready to implement:
- Schema validated ✓
- Persistence strategy decided ✓
- Embedding approach chosen (TF-IDF) ✓
- Edge cases analyzed and mitigated ✓
- Performance targets set ✓

**Implementation order**:
1. Schema + validation (2-3h)
2. Persistence layer (2-3h)
3. Embedding generation (3-4h)
4. Similarity query (3-4h)
5. MONITOR integration (2h)
6. PLAN integration (2h)
7. Tests + docs (4-5h)

**Total**: 18-24h of focused implementation
