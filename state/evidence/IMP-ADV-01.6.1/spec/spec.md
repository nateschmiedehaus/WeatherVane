# IMP-ADV-01.6.1: Batch Embeddings API for Performance

## Problem Statement

**Current Performance**: Neural embeddings are 59x slower than TF-IDF (219ms vs 3.7ms per embedding).

**Root Cause**: No batch API - each embedding:
1. Calls `model.encode()` with single text string
2. No amortization of model loading/inference overhead
3. No GPU parallelism (batch size = 1)
4. Missing standard ML optimization pattern

**Impact**:
- Indexing 1000 tasks: 219 seconds (3.6 minutes) vs 3.7 seconds
- With batching (batch_size=32): Estimated 20-40 seconds (10-50x faster)
- Neural embeddings marked "opt-in" due to performance, limiting adoption

**Why This Matters**:
- IMP-ADV-01.6 achieved 42% precision improvement but unusable at scale
- Batch API is standard practice for ML inference (not a "nice-to-have")
- Current implementation leaves 10-50x performance on the table

---

## Spec: Batch Embeddings API

### Acceptance Criteria

#### AC1: Batch Embedding Method
Add `compute_embeddings_batch()` method to NeuralBackend:

```python
def compute_embeddings_batch(
    self,
    tasks: Sequence[Dict[str, Any]],  # List of {title, description, files_touched}
    batch_size: int = 32,
    show_progress: bool = False,
) -> np.ndarray:
    """
    Compute embeddings for multiple tasks in batches.

    Returns: np.ndarray of shape (len(tasks), 384)
    """
```

**Verification**:
- ✅ Method exists and type-checks
- ✅ Returns correct shape (N, 384) for N tasks
- ✅ Each vector is unit-normalized
- ✅ Results match sequential `compute_embedding()` calls (same inputs → same outputs)

---

#### AC2: Performance Improvement
Batch API must be ≥10x faster than sequential for N≥32 tasks.

**Benchmark**:
```bash
python3 scripts/quality_graph/benchmark_batch_embeddings.py \
  --mode neural \
  --num-tasks 100 \
  --batch-sizes 1,8,16,32,64
```

**Target Metrics**:
- Batch size 1 (baseline): ~219ms/task
- Batch size 8: ≤50ms/task (4.4x speedup)
- Batch size 16: ≤30ms/task (7.3x speedup)
- Batch size 32: ≤20ms/task (10.9x speedup)
- Batch size 64: ≤15ms/task (14.6x speedup)

**Acceptance**:
- ✅ Batch size 32 achieves ≥10x speedup vs batch size 1
- ✅ Results are deterministic (same inputs → same outputs)
- ✅ Memory usage reasonable (≤2GB for 1000 tasks)

---

#### AC3: CLI Integration
Update record_task_vector.py and query_similar_tasks.py to use batch API:

**record_task_vector.py**:
```bash
# Auto-batch mode (records multiple tasks efficiently)
python3 scripts/quality_graph/record_task_vector.py <workspace> \
  --embedding-mode neural \
  --batch-size 32 \
  --batch-from-file <task_ids.txt>
```

**query_similar_tasks.py**:
```bash
# Batch query mode (queries multiple tasks)
python3 scripts/quality_graph/query_similar_tasks.py <workspace> \
  --embedding-mode neural \
  --batch-query <task_ids.txt>
```

**Verification**:
- ✅ Batch flags work
- ✅ Output format same as sequential mode
- ✅ Performance improvement measured and logged

---

#### AC4: Backward Compatibility
Single embedding API (`compute_embedding()`) must still work.

**Verification**:
- ✅ Existing code using `compute_embedding()` works unchanged
- ✅ Tests using single embeddings pass
- ✅ Default behavior unchanged (batch API is opt-in)

---

#### AC5: Documentation Updates
- ✅ README.md updated with batch API usage examples
- ✅ Performance comparison table (sequential vs batched)
- ✅ Guidance on when to use batch API (N≥32 tasks)
- ✅ Benchmark results documented

---

#### AC6: Tests & Verification
- ✅ Unit tests: `test_batch_embeddings_shape`, `test_batch_embeddings_normalized`, `test_batch_vs_sequential`
- ✅ Benchmark script: `benchmark_batch_embeddings.py` with results in verify/
- ✅ Integration test: MonitorRunner uses batch API for corpus updates
- ✅ Full test suite passes

---

## Implementation Notes

### Batch API Design
```python
# In NeuralBackend class
def compute_embeddings_batch(
    self,
    tasks: Sequence[Dict[str, Any]],
    batch_size: int = 32,
    show_progress: bool = False,
) -> np.ndarray:
    texts = [self.build_input_text(**task) for task in tasks]
    model = self._ensure_model()

    # sentence-transformers has built-in batching
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=show_progress,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    return embeddings  # Shape: (len(tasks), 384)
```

### Expected Performance
sentence-transformers `encode()` with batch_size>1 automatically:
- Processes multiple texts in parallel
- Amortizes model overhead across batch
- Utilizes GPU parallelism if available

Typical speedups:
- CPU (4 cores): 5-10x faster for batch_size=32
- GPU (single): 20-50x faster for batch_size=32

---

## Dependencies

- Requires: IMP-ADV-01.6 (neural embeddings backend)
- Blocks: None (optimization, not blocker)
- Enables: Production-ready neural embeddings at scale

---

## Effort Estimate

**2-3 hours**:
- 1 hour: Implement batch API method
- 0.5 hour: Update CLI scripts with batch flags
- 0.5 hour: Write benchmark script
- 0.5 hour: Unit tests for batch API
- 0.5 hour: Documentation updates

---

## Success Metrics

**Before**:
- Neural embeddings: 219ms/task, 3.6 minutes for 1000 tasks
- Marked "opt-in" due to performance concerns

**After**:
- Neural embeddings: ≤20ms/task (batched), ≤40 seconds for 1000 tasks
- Performance competitive with TF-IDF for batch operations
- Neural becomes viable default (42% better precision, acceptable latency)

---

## Rollout Plan

1. **Phase 1**: Implement batch API, keep single API as default
2. **Phase 2**: Update MonitorRunner to use batch API for corpus updates
3. **Phase 3**: Measure production performance improvements
4. **Phase 4**: Consider making neural default (if latency acceptable)

---

## Status

**Created**: 2025-10-29 (follow-up to IMP-ADV-01.6)
**Priority**: HIGH (makes IMP-ADV-01.6 production-ready)
**Effort**: 2-3 hours
**Blocking**: No (IMP-ADV-01.6 works, just slow)
**Parent**: IMP-ADV-01.6 (neural embeddings upgrade)
