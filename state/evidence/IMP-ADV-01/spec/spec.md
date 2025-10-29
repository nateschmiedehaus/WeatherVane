# IMP-ADV-01 · SPEC: Quality Graph Integration

**Task**: Quality Graph Integration - Vector tracking for autopilot tasks
**Phase**: SPEC
**Date**: 2025-10-29

---

## Acceptance Criteria

### AC1: Vector Schema Defined and Validated
- [ ] JSON schema exists at `state/quality_graph/schema.json`
- [ ] Schema includes required fields: `task_id`, `embedding`, `timestamp`, `outcome`
- [ ] Schema includes optional fields: `title`, `description`, `files_touched`, `complexity_score`, `duration_ms`
- [ ] Validation function rejects malformed vectors
- [ ] Embedding is dense float array with fixed dimensionality (e.g., 384)

**Verification**: Load schema, validate sample vectors, reject invalid ones

---

### AC2: Persistence Layer Functional
- [ ] Vectors write to `state/quality_graph/task_vectors.jsonl` (append-only)
- [ ] Each line is valid JSON (no partial writes)
- [ ] Read function loads all vectors into memory
- [ ] Write function is atomic (temp file + rename)
- [ ] Concurrent writes don't corrupt file (file locking or atomic append)

**Verification**: Write 100 vectors concurrently, read back, verify all present

---

### AC3: Embedding Generation Works
- [ ] Function `compute_task_embedding(task_metadata)` returns numpy array
- [ ] Embedding captures: title (weight 0.4) + description (0.3) + files_touched (0.3)
- [ ] TF-IDF vectorizer with max 1000 features
- [ ] Embedding normalized to unit length (for cosine similarity)
- [ ] Handles edge cases: empty description, no files touched, unicode

**Verification**: Compute embeddings for 10 diverse tasks, verify dimensions and norms

---

### AC4: Similarity Query Returns Top-K
- [ ] Function `find_similar_tasks(task_id, k=5)` returns list of (task_id, similarity_score, metadata)
- [ ] Results sorted by similarity descending
- [ ] Excludes query task itself from results
- [ ] Returns empty list if no similar tasks (corpus empty)
- [ ] Query completes in <50ms for corpus of 1000 tasks

**Verification**: Query similar tasks for known task, verify top result makes sense

---

### AC5: MONITOR Phase Records Vector
- [ ] After task completion, `state_graph.ts` calls quality graph recorder
- [ ] Vector computed from task metadata (title, files touched, outcome)
- [ ] Vector appended to `task_vectors.jsonl`
- [ ] Span event logged: `quality_graph.vector_recorded` with task_id
- [ ] Graceful degradation: if recording fails, log warning but don't block

**Verification**: Complete test task, verify vector in JSONL, verify span event

---

### AC6: PLAN Phase Receives Similarity Hints
- [ ] Before planning, query top-5 similar tasks
- [ ] Inject hints into planner context: "Similar tasks: <task_ids> with approach: <summary>"
- [ ] Planner can ignore hints (optional enhancement)
- [ ] If no similar tasks, planner proceeds normally
- [ ] Span event logged: `quality_graph.similarity_hints_provided` with count

**Verification**: Run planner on new task, verify similar task hints in context

---

### AC7: Observer Uses Baseline Comparison
- [ ] Observer queries similar tasks before review
- [ ] Compares current task metrics vs historical similar tasks
- [ ] Flags anomalies: "This task took 3x longer than similar tasks"
- [ ] Baseline: mean ± 2 std dev of similar task metrics
- [ ] If no similar tasks, observer proceeds without baseline

**Verification**: Complete task with anomalous duration, verify observer flags it

---

### AC8: Performance Acceptable
- [ ] Embedding computation: <100ms per task
- [ ] Similarity query: <50ms for corpus of 1000 tasks
- [ ] Vector recording: <20ms (async, non-blocking)
- [ ] Memory footprint: <50MB for 1000 task vectors

**Verification**: Benchmark script, profile memory usage

---

### AC9: Documentation Complete
- [ ] README: `docs/autopilot/Quality-Graph.md` explains purpose, schema, usage
- [ ] API docs: function signatures for persistence, similarity, embedding
- [ ] Examples: query similar tasks via CLI, interpret results
- [ ] Troubleshooting: common issues (empty corpus, slow queries, bad embeddings)
- [ ] Migration guide: backfill existing tasks

**Verification**: Docs reviewed, examples tested

---

### AC10: Tests Pass
- [ ] Unit tests: embedding generation, persistence, similarity query
- [ ] Integration test: end-to-end (record vector → query similar → retrieve)
- [ ] Edge case tests: empty corpus, identical tasks, unicode handling
- [ ] Performance test: 1000 tasks, query latency < 50ms
- [ ] All tests green in CI

**Verification**: `npm test` passes, coverage ≥80% for quality_graph module

---

## Key Performance Indicators (KPIs)

### Functional KPIs
1. **Similarity Precision**: Top-3 similar tasks are actually similar (manual eval, target: ≥60%)
2. **Coverage**: ≥80% of tasks have at least 1 similar historical task after 2 weeks
3. **Adoption**: Planner uses similarity hints in ≥50% of planning runs

### Performance KPIs
4. **Query Latency**: p95 < 50ms for similarity queries (1000 task corpus)
5. **Recording Latency**: p95 < 20ms for vector recording (non-blocking)
6. **Memory Footprint**: <50MB for 1000 task vectors in memory

### Quality KPIs
7. **Drift Detection**: Observer flags ≥1 anomaly per 10 tasks (proves baseline comparison works)
8. **Planner Hint Usefulness**: User feedback (subjective, collect after 2 weeks)

---

## Verification Mapping

| Criterion | Verification Method | Evidence Location |
|-----------|---------------------|-------------------|
| AC1: Vector Schema | Schema validation tests | `verify/schema_tests.log` |
| AC2: Persistence | Concurrent write test | `verify/persistence_test.log` |
| AC3: Embedding | Embedding quality tests | `verify/embedding_tests.log` |
| AC4: Similarity Query | Top-K retrieval test | `verify/similarity_tests.log` |
| AC5: MONITOR Integration | Integration test | `verify/monitor_integration.log` |
| AC6: PLAN Integration | Integration test | `verify/plan_integration.log` |
| AC7: Observer Baseline | Anomaly detection test | `verify/observer_baseline.log` |
| AC8: Performance | Benchmark script output | `verify/performance_benchmark.json` |
| AC9: Documentation | Doc review checklist | `review/docs_reviewed.md` |
| AC10: Tests | CI test results | `verify/test_results.json` |

---

## Out of Scope

**Explicitly NOT included in this task:**
- Advanced embeddings (BERT, GPT, code2vec) - future enhancement
- Real-time vector updates - only at MONITOR phase
- Vector-based anomaly alerts - IMP-OBS-04 (Alert Scaffolding)
- Multi-modal embeddings (code + metrics + docs) - future enhancement
- Vector database migration - revisit if performance insufficient

---

## Success Threshold

**Minimum Viable:**
- AC1-AC5 complete (schema, persistence, embedding, similarity, MONITOR integration)
- Performance acceptable (AC8)
- Tests pass (AC10)

**Full Success:**
- All 10 acceptance criteria met
- KPIs 1-6 achieved
- Observer baseline comparison working (AC7)

**Exceptional:**
- Planner demonstrably uses hints to improve plans (user feedback)
- Drift detection surfaces real issues (saves debugging time)

---

## Dependencies

**Requires (from previous tasks):**
- Phase ledger (IMP-FUND-01) - for backfilling historical tasks
- OTEL spans (IMP-OBS-01) - for logging quality_graph events
- Telemetry sinks (IMP-OBS-03) - for recording span events

**Blocks (future tasks):**
- IMP-OBS-04 (Alert Scaffolding) - quality graph provides drift metrics for alerts
- IMP-ADV-04 (Cross-Check) - similarity used to sample cross-check targets

---

## Risk Mitigations

1. **Cold start (no historical vectors)**
   - **Mitigation**: Backfill script runs on first install
   - **Verification**: `scripts/backfill_quality_graph.sh` populates initial corpus

2. **Poor similarity quality (irrelevant results)**
   - **Mitigation**: Manual eval of top-K on 20 sample tasks
   - **Verification**: Precision ≥60% or pivot to better embedding

3. **Performance regression (slow queries)**
   - **Mitigation**: In-memory index, limit corpus to recent 1000 tasks
   - **Verification**: Benchmark enforces <50ms p95

4. **Integration fragility (breaks planner)**
   - **Mitigation**: Graceful degradation, similarity hints optional
   - **Verification**: Planner works even if quality graph unavailable

---

## Next Phase: PLAN

Break down implementation into sub-tasks:
1. Vector schema + persistence (2-3h)
2. Embedding generation (2-3h)
3. Similarity query (3-4h)
4. MONITOR integration (2h)
5. PLAN integration (2h)
6. Observer baseline (3h)
7. Tests + docs (4-5h)

**Total estimate**: 18-22 hours of work
