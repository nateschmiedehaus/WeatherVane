# IMP-ADV-01.6.1: STRATEGIZE - Batch Embeddings API

## Problem Analysis

**Current State**: Neural embeddings are 59x slower than TF-IDF (219ms vs 3.7ms per embedding).

**Root Cause**: Single-embedding API only - no batch processing
```python
# Current: Called N times for N tasks
for task in tasks:
    embedding = neural_backend.compute_embedding(task.title, task.description, task.files)
    # 219ms per call - full model overhead each time
```

**Why This Is Critical**:
- 1000 tasks: 219 seconds (3.6 minutes) - unacceptable
- sentence-transformers `encode()` already supports batching
- Batch processing is standard ML pattern, not "nice-to-have"
- Without batching, neural embeddings are unusable at production scale

---

## Solution Approach

### Core Implementation
Add `compute_embeddings_batch()` method that:
1. Accepts list of task metadata dicts
2. Builds list of input texts
3. Calls `model.encode()` with batch_size parameter
4. Returns np.ndarray of shape (N, 384)

**Key insight**: sentence-transformers already does batching internally. We just need to expose it.

```python
def compute_embeddings_batch(
    self,
    tasks: Sequence[Dict[str, Any]],
    batch_size: int = 32,
    show_progress: bool = False,
) -> np.ndarray:
    texts = [self.build_input_text(**task) for task in tasks]
    model = self._ensure_model()

    # sentence-transformers handles batching internally
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=show_progress,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    return embeddings  # Shape: (len(tasks), 384)
```

---

## Expected Performance

**Batch size impact** (estimated from ML benchmarks):
- Batch=1 (current): 219ms/task (baseline)
- Batch=8: ~50ms/task (4.4x faster)
- Batch=16: ~30ms/task (7.3x faster)
- Batch=32: ~20ms/task (11x faster) ✅ **Target met**
- Batch=64: ~15ms/task (15x faster)

**Why batching helps**:
1. Amortizes model overhead across multiple inputs
2. GPU parallelism (if available)
3. Efficient tensor operations
4. Reduced Python/PyTorch call overhead

**1000 tasks benchmark**:
- Current: 219 seconds
- With batch=32: ~40 seconds (5.5x faster) ✅
- Makes neural embeddings practical at scale

---

## Risks & Mitigations

### Risk 1: Memory Usage
**Risk**: Large batches could OOM on limited memory machines
**Mitigation**:
- Default batch_size=32 (safe for most machines)
- Document memory requirements
- Auto-adjust batch size if OOM detected

### Risk 2: Backward Compatibility
**Risk**: Breaking existing single-embedding API
**Mitigation**:
- Keep `compute_embedding()` unchanged
- Batch API is additive, not replacing
- All existing code continues to work

### Risk 3: Different Results
**Risk**: Batch vs sequential giving different embeddings
**Mitigation**:
- sentence-transformers is deterministic
- Add test: batch results == sequential results
- Verify in benchmark script

---

## Implementation Strategy

**Minimal changes approach**:
1. Add single method to NeuralBackend class
2. Use existing sentence-transformers batching
3. CLI integration optional (can call batch API directly)
4. No changes to TFIDFBackend (already fast)

**Effort: 2-3 hours**:
- 30 min: Implement method
- 30 min: Unit tests
- 60 min: Benchmark script + verification
- 30 min: Documentation

---

## Success Criteria

1. ✅ Batch API achieves ≥10x speedup at batch_size=32
2. ✅ Results identical to sequential (determinism)
3. ✅ Backward compatible (existing code works)
4. ✅ Benchmarked and documented
5. ✅ Makes neural embeddings production-ready

---

## Decision: Proceed with Implementation

**Rationale**:
- High value (makes neural embeddings usable)
- Low risk (additive API, well-understood pattern)
- Small effort (2-3 hours)
- Standard ML practice (not experimental)

**Next**: Move to IMPLEMENT phase.
