# IMP-ADV-01 · PLAN: Quality Graph Integration

**Task**: Quality Graph Integration - Vector tracking for autopilot tasks
**Phase**: PLAN
**Date**: 2025-10-29

---

## Work Breakdown Structure

### Task 1: Vector Schema + Validation (IMP-ADV-01.1)
**Estimate**: 2-3 hours
**Owner**: Claude/Codex
**Priority**: P0 (Blocking all others)

**Subtasks:**
1. Define JSON schema at `state/quality_graph/schema.json`
2. Implement Python validation using Pydantic
3. Implement TypeScript validation using Zod
4. Write unit tests for schema validation
5. Document schema in `docs/autopilot/Quality-Graph.md`

**Deliverables:**
- `state/quality_graph/schema.json`
- `tools/wvo_mcp/src/quality_graph/schema.ts` (Zod schema)
- `tools/wvo_mcp/scripts/quality_graph/schema.py` (Pydantic model)
- Unit tests: `schema.test.ts`, `test_schema.py`

**Acceptance:**
- Schema validates correct vectors
- Rejects malformed vectors (missing fields, wrong types)
- Documentation covers all fields

---

### Task 2: Persistence Layer (IMP-ADV-01.2)
**Estimate**: 2-3 hours
**Owner**: Claude/Codex
**Priority**: P0 (Blocks similarity queries)

**Subtasks:**
1. Implement `write_vector()` function with atomic writes
2. Implement `read_vectors()` function with JSONL parsing
3. Handle concurrent writes (file locking or append-only)
4. Create `state/quality_graph/` directory structure
5. Add error handling (corrupt lines, disk full)

**Deliverables:**
- `tools/wvo_mcp/src/quality_graph/persistence.ts`
- Functions: `writeVector()`, `readVectors()`, `loadIndex()`
- Unit tests: `persistence.test.ts`
- Concurrent write test

**Acceptance:**
- 100 concurrent writes don't corrupt file
- Invalid JSONL lines are skipped with warning
- Atomic writes (no partial vectors)

---

### Task 3: Embedding Generation (IMP-ADV-01.3)
**Estimate**: 3-4 hours
**Owner**: Claude/Codex
**Priority**: P0 (Blocks vector recording)

**Subtasks:**
1. Implement TF-IDF vectorizer (using Python scikit-learn)
2. Text preprocessing: tokenization, stopword removal, stemming
3. Feature extraction: title (0.4) + description (0.3) + files (0.3)
4. Normalize embeddings to unit length
5. Handle edge cases: empty text, unicode, very long descriptions

**Deliverables:**
- `tools/wvo_mcp/scripts/quality_graph/embeddings.py`
- Functions: `compute_embedding(metadata)`, `preprocess_text(text)`
- Unit tests: `test_embeddings.py`
- Test cases: empty, unicode, long text

**Acceptance:**
- Embeddings are 384-dimensional float arrays
- All embeddings have unit norm (for cosine similarity)
- Handles 10 diverse test cases correctly

---

### Task 4: Similarity Query (IMP-ADV-01.4)
**Estimate**: 3-4 hours
**Owner**: Claude/Codex
**Priority**: P1 (Needed for integration)

**Subtasks:**
1. Load vectors into in-memory index (dict: task_id → vector)
2. Implement cosine similarity computation (numpy.dot)
3. Implement top-K search with priority queue
4. Exclude query task from results
5. Return task metadata with similarity scores

**Deliverables:**
- `tools/wvo_mcp/src/quality_graph/similarity.ts`
- Functions: `findSimilarTasks(taskId, k)`, `cosineSimilarity(v1, v2)`
- Unit tests: `similarity.test.ts`
- Performance test: 1000 tasks, <50ms

**Acceptance:**
- Top-K returns most similar tasks (manual verification)
- Query completes in <50ms (p95) for 1000 tasks
- Returns empty array if corpus empty

---

### Task 5: MONITOR Phase Integration (IMP-ADV-01.5)
**Estimate**: 2 hours
**Owner**: Claude/Codex
**Priority**: P1 (Core functionality)

**Subtasks:**
1. Add quality graph recorder hook in `state_graph.ts` MONITOR phase
2. Extract task metadata: title, files_touched, outcome, duration
3. Call Python script to compute embedding and record vector
4. Add span event: `quality_graph.vector_recorded`
5. Graceful degradation: log error if recording fails, don't block

**Deliverables:**
- Modified `tools/wvo_mcp/src/orchestrator/state_graph.ts`
- Python CLI script: `scripts/record_task_vector.py`
- Integration test: complete task → verify vector recorded

**Acceptance:**
- Task completion triggers vector recording
- Vector appears in `task_vectors.jsonl`
- Span event logged with task_id
- Task completes even if recording fails

---

### Task 6: PLAN Phase Integration (IMP-ADV-01.6)
**Estimate**: 2 hours
**Owner**: Claude/Codex
**Priority**: P1 (Observer hints)

**Subtasks:**
1. Query top-5 similar tasks before planning
2. Format similarity hints for planner context
3. Inject hints into planner prompt (optional section)
4. Add span event: `quality_graph.similarity_hints_provided`
5. Handle empty corpus gracefully

**Deliverables:**
- Modified `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`
- Python CLI script: `scripts/query_similar_tasks.py`
- Integration test: planning with/without similar tasks

**Acceptance:**
- Planner receives similar task context
- Hints are optional (planner works without them)
- Span event logged with hint count

---

### Task 7: Observer Baseline Comparison (IMP-ADV-01.7)
**Estimate**: 3 hours
**Owner**: Claude/Codex
**Priority**: P2 (Enhancement)

**Subtasks:**
1. Query similar tasks in observer agent
2. Compute baseline metrics: mean ± 2 std dev of duration, complexity
3. Compare current task vs baseline
4. Flag anomalies: "3x longer than similar tasks"
5. Add to observer report

**Deliverables:**
- Modified `tools/wvo_mcp/src/orchestrator/observer_agent.ts` (if exists)
- Baseline comparison logic
- Integration test: anomalous task flagged

**Acceptance:**
- Observer queries similar tasks
- Baseline computed from historical data
- Anomalies flagged in observer report

---

### Task 8: Backfill Script (IMP-ADV-01.8)
**Estimate**: 2 hours
**Owner**: Claude/Codex
**Priority**: P2 (Helpful for cold start)

**Subtasks:**
1. Read phase ledger for completed tasks (last 90 days)
2. For each task, compute embedding and record vector
3. Show progress bar (e.g., `tqdm`)
4. Log stats: tasks backfilled, skipped (no metadata), failed
5. Make idempotent (skip existing vectors)

**Deliverables:**
- Script: `scripts/backfill_quality_graph.sh`
- Python script: `scripts/backfill_vectors.py`
- README section: "Backfilling Historical Tasks"

**Acceptance:**
- Backfills 100+ historical tasks in <5 minutes
- Idempotent (safe to re-run)
- Logs stats to console

---

### Task 9: Tests + Documentation (IMP-ADV-01.9)
**Estimate**: 4-5 hours
**Owner**: Claude/Codex
**Priority**: P0 (Required for completion)

**Subtasks:**
1. Unit tests for all modules (schema, persistence, embeddings, similarity)
2. Integration tests (end-to-end: record → query → retrieve)
3. Edge case tests (empty corpus, unicode, concurrent writes)
4. Performance benchmarks (embedding, similarity, recording)
5. Documentation: README, API reference, examples, troubleshooting

**Deliverables:**
- Test files: `tools/wvo_mcp/src/quality_graph/__tests__/*.test.ts`
- Python tests: `tools/wvo_mcp/scripts/quality_graph/tests/test_*.py`
- Docs: `docs/autopilot/Quality-Graph.md`
- Examples: CLI usage, query patterns

**Acceptance:**
- All tests pass (npm test, pytest)
- Coverage ≥80% for quality_graph module
- Documentation reviewed and examples tested

---

## Dependency Graph

```
                    ┌─────────────────────┐
                    │  Task 1: Schema     │ (2-3h)
                    └──────────┬──────────┘
                               │
                ┏━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━┓
                ↓                              ↓
    ┌─────────────────────┐      ┌─────────────────────┐
    │ Task 2: Persistence │      │ Task 3: Embeddings  │
    │        (2-3h)       │      │      (3-4h)         │
    └──────────┬──────────┘      └──────────┬──────────┘
               │                             │
               └──────────┬──────────────────┘
                          ↓
              ┌─────────────────────┐
              │ Task 4: Similarity  │ (3-4h)
              └──────────┬──────────┘
                         │
         ┏━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━┓
         ↓                                ↓
┌─────────────────────┐      ┌─────────────────────┐
│ Task 5: MONITOR     │      │ Task 6: PLAN        │
│   Integration (2h)  │      │  Integration (2h)   │
└─────────────────────┘      └─────────────────────┘
         │                                │
         └─────────┬──────────────────────┘
                   ↓
       ┌─────────────────────┐
       │ Task 7: Observer    │ (3h)
       │   Baseline          │
       └─────────────────────┘
                   │
       ┌───────────┴───────────┐
       ↓                       ↓
┌─────────────────┐   ┌─────────────────┐
│ Task 8: Backfill│   │ Task 9: Tests + │
│     (2h)        │   │   Docs (4-5h)   │
└─────────────────┘   └─────────────────┘
```

**Critical Path**: Task 1 → Task 2/3 → Task 4 → Task 5/6 → Task 9
**Total Duration (sequential)**: ~20-25 hours
**Total Duration (parallel)**: ~12-15 hours (if Task 2/3 and 5/6 run in parallel)

---

## Change Budget

**Allowed Files** (new):
- `state/quality_graph/schema.json`
- `state/quality_graph/task_vectors.jsonl`
- `tools/wvo_mcp/src/quality_graph/` (new directory)
- `tools/wvo_mcp/scripts/quality_graph/` (new directory)
- `scripts/backfill_quality_graph.sh`
- `scripts/record_task_vector.py`
- `scripts/query_similar_tasks.py`
- `docs/autopilot/Quality-Graph.md`

**Allowed Files** (modified):
- `tools/wvo_mcp/src/orchestrator/state_graph.ts` (MONITOR hook)
- `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts` (similarity hints)
- `tools/wvo_mcp/src/orchestrator/observer_agent.ts` (baseline comparison)
- `tools/wvo_mcp/package.json` (add dependencies if needed)
- `requirements.txt` (add scikit-learn, numpy)

**Max Diff Lines**: ~2000 lines (schema + persistence + embeddings + similarity + integration + tests)

**Prohibited Operations**:
- Modifying existing vector storage (only append to task_vectors.jsonl)
- Breaking existing state_graph API
- Adding synchronous blocking operations in MONITOR phase

---

## Rollback Plan

**Sentence**: "Revert commit X; disable quality graph hooks in state_graph.ts; delete state/quality_graph/ directory"

**Preconditions**:
- Quality graph degrading performance (>100ms per task)
- Similarity queries returning irrelevant results (precision <20%)
- Integration causing state_graph failures

**Rollback Steps**:
1. `git revert <commit-hash>` (IMP-ADV-01 commits)
2. Comment out quality graph hooks in `state_graph.ts`
3. Delete `state/quality_graph/` directory (if corrupted)
4. Restart MCP server
5. Verify autopilot works without quality graph

**Recovery Time**: <5 minutes

**Data Loss**: Task vectors (can be re-generated via backfill)

---

## Estimates Summary

| Task | Estimate | Priority | Blocking |
|------|----------|----------|----------|
| 1. Schema + Validation | 2-3h | P0 | All tasks |
| 2. Persistence | 2-3h | P0 | Similarity, Integration |
| 3. Embeddings | 3-4h | P0 | Similarity, Integration |
| 4. Similarity Query | 3-4h | P1 | Integration |
| 5. MONITOR Integration | 2h | P1 | Observer |
| 6. PLAN Integration | 2h | P1 | - |
| 7. Observer Baseline | 3h | P2 | - |
| 8. Backfill Script | 2h | P2 | - |
| 9. Tests + Docs | 4-5h | P0 | Completion |
| **TOTAL** | **23-29h** | - | - |

**Phased Rollout**:
- **Phase 1** (MVP): Tasks 1-5, 9 → ~15-20h → Core functionality working
- **Phase 2** (Enhancements): Tasks 6-8 → ~7-9h → Full integration + backfill

---

## Risk Management

### Risk 1: TF-IDF embeddings low quality
**Likelihood**: Medium
**Impact**: High (similarity queries useless)
**Mitigation**: Manual eval of top-K on 20 tasks, pivot to better embeddings if needed
**Contingency**: Use OpenAI embeddings API (requires API key)

### Risk 2: Performance regression
**Likelihood**: Low
**Impact**: High (blocks tasks)
**Mitigation**: Benchmark early, optimize hot paths, async recording
**Contingency**: Disable quality graph hooks, rollback

### Risk 3: Integration complexity
**Likelihood**: Medium
**Impact**: Medium (delays delivery)
**Mitigation**: Graceful degradation, optional hints, extensive testing
**Contingency**: Ship MVP (Tasks 1-5) first, defer enhancements

### Risk 4: Backfill fails on historical tasks
**Likelihood**: Low
**Impact**: Low (empty corpus initially)
**Mitigation**: Incremental corpus growth, backfill non-blocking
**Contingency**: Wait for natural corpus growth over 2 weeks

---

## Next Phase: THINK

Analyze edge cases:
- Empty corpus (first task has no similar tasks)
- Identical tasks (100% similarity, how to break ties?)
- Vector drift (task descriptions change format over time)
- Corpus size growth (1000 → 10000 tasks, performance?)
- Concurrent queries during backfill
- Embedding quality for short titles (<5 words)

---

## Owners/Roles

- **Implementer**: Claude or Codex (as assigned by user)
- **Reviewer**: Adversarial review agent (verify acceptance criteria)
- **Tester**: Automated tests + manual quality eval
- **Supervisor**: User (approves Phase 1 → Phase 2 transition)
