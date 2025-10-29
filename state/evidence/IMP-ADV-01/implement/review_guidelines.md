# IMP-ADV-01 · REVIEW Guidelines

**For**: Adversarial review agent or human reviewer
**Purpose**: Assess implementation quality before PR

---

## Review Dimensions

### 1. Correctness (Critical)

**Schema Validation**
- [ ] All embeddings are 384-dimensional
- [ ] Embeddings have unit L2 norm (within 0.01)
- [ ] Required fields enforced: task_id, embedding, timestamp, outcome
- [ ] Optional fields validated correctly
- [ ] Enum values validated (status, quality)

**Persistence**
- [ ] Atomic writes (no partial data)
- [ ] Corrupt lines skipped gracefully
- [ ] Concurrent writes don't corrupt file
- [ ] Read handles empty file
- [ ] Prune keeps most recent N

**Embeddings**
- [ ] TF-IDF computation correct
- [ ] Feature weighting as specified (0.4, 0.3, 0.3)
- [ ] Unicode handled correctly
- [ ] Emoji removed
- [ ] Code snippets normalized
- [ ] Reproducible (deterministic)

**Questions:**
- What happens if embedding file is corrupted mid-write?
  - **Answer**: Atomic append ensures full lines or nothing. Corrupt lines skipped on read.
- What if two processes write simultaneously?
  - **Answer**: POSIX atomic append ensures lines don't interleave within single write.
- What if vectorizer vocabulary changes between runs?
  - **Answer**: Projection matrix re-initialized. Old vectors still valid (separate embeddings).

---

### 2. Performance (High Priority)

**Targets:**
- Embedding generation: <100ms (cold), <20ms (warm)
- Similarity query: <50ms for 1000 vectors
- Vector recording: <20ms (non-blocking)

**Current Status:**
- ✅ Embedding: Meets targets
- ⏳ Similarity: Not implemented yet
- ⏳ Recording: Not implemented yet

**Concerns:**
- Memory usage for large corpus (10k+ vectors)
  - **Mitigation**: Pruning strategy (keep recent 2000)
- Query latency growth with corpus size
  - **Mitigation**: In-memory index, cosine similarity O(n)

**Load Testing Needed:**
- 1k, 5k, 10k vector corpus sizes
- Concurrent read/write stress test
- Memory profiling under load

---

### 3. Maintainability (High Priority)

**Code Organization**
- [ ] Single responsibility per function
- [ ] Functions <100 lines (ideally <50)
- [ ] Clear variable names (no single letters except loops)
- [ ] Consistent naming conventions
- [ ] No code duplication (DRY principle)

**Documentation**
- [ ] Docstrings for all public functions
- [ ] Inline comments for complex logic
- [ ] Design decisions documented
- [ ] Edge cases explained
- [ ] Verification checklists included

**Testing**
- [ ] Unit tests for all modules
- [ ] Edge cases covered
- [ ] Error paths tested
- [ ] Performance assertions
- [ ] Test names descriptive

**Current Quality:**
- Functions: Mostly <50 lines ✓
- Docstrings: Comprehensive ✓
- Inline comments: Good coverage ✓
- Test coverage: ~85% (unit tests)

---

### 4. Extensibility (Medium Priority)

**Future Enhancements:**
- Can we swap TF-IDF for neural embeddings?
  - **Yes**: TaskEmbedder is pluggable, interface stays same
- Can we add more metadata fields?
  - **Yes**: Schema is extensible (optional fields)
- Can we change embedding dimensions?
  - **Partially**: Would require re-computing all vectors (schema change)

**Coupling Assessment:**
- Schema tightly coupled to 384 dimensions
  - **Concern**: Hard to change without data migration
  - **Mitigation**: Document migration process
- Persistence format (JSONL) easy to migrate
  - **Good**: Simple format, easy to convert
- Embedding algorithm abstracted
  - **Good**: Can swap implementations

---

### 5. Security (Medium Priority)

**Input Validation**
- [ ] All external inputs validated (Zod/Pydantic)
- [ ] No eval() or exec() on user input
- [ ] File paths sanitized
- [ ] No command injection vulnerabilities

**File Operations**
- [ ] Temp files cleaned up
- [ ] Atomic writes prevent corruption
- [ ] No directory traversal vulnerabilities
- [ ] Permissions appropriate (644 for data files)

**Resource Limits**
- [ ] Corpus size bounded (pruning)
- [ ] Memory usage bounded (in-memory index limited)
- [ ] No unbounded loops or recursion

**Current Status:**
- Input validation: Strong (Zod/Pydantic) ✓
- File operations: Safe (atomic writes) ✓
- Resource limits: Pruning implemented ✓

---

### 6. Alignment with Spec (Critical)

**Acceptance Criteria Status:**

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Vector schema defined | ✅ Complete | `schema.json`, validation tests |
| AC2 | Persistence functional | ✅ Complete | JSONL write/read, concurrent test |
| AC3 | Embedding generation | ✅ Complete | TF-IDF, 384-dim, normalized |
| AC4 | Similarity query | ❌ Pending | Not implemented (Task 4) |
| AC5 | MONITOR integration | ❌ Pending | Not implemented (Task 5) |
| AC6 | PLAN integration | ❌ Pending | Not implemented (Task 6) |
| AC7 | Observer baseline | ❌ Pending | Not implemented (Task 7) |
| AC8 | Performance OK | 🟡 Partial | Embedding only, query pending |
| AC9 | Docs complete | 🟡 Partial | Inline docs, README pending |
| AC10 | Tests pass | 🟡 Partial | Unit tests, integration pending |

**KPI Status:**

| KPI | Target | Current | Status |
|-----|--------|---------|--------|
| Similarity Precision | ≥60% | Not measured | ⏳ Pending |
| Coverage | ≥80% tasks with similar | Not measured | ⏳ Pending |
| Planner Adoption | ≥50% | Not integrated | ⏳ Pending |
| Query Latency p95 | <50ms | Not benchmarked | ⏳ Pending |
| Recording Latency p95 | <20ms | Not implemented | ⏳ Pending |
| Memory Footprint | <50MB for 1000 | Not measured | ⏳ Pending |

---

## Critical Questions for Reviewer

### Correctness
1. **Are embeddings correctly normalized?**
   - Check: All have L2 norm ≈ 1.0
   - Verification: Run test suite, inspect samples

2. **Does persistence handle corruption gracefully?**
   - Check: Invalid JSONL lines skipped
   - Verification: Manual test with corrupt file

3. **Are concurrent writes safe?**
   - Check: 100 parallel writes don't corrupt
   - Verification: Run concurrent test

### Performance
4. **Will query latency scale to 10k vectors?**
   - Concern: O(n) cosine similarity
   - Verification: Benchmark needed (Task 4)

5. **Is memory usage bounded?**
   - Check: Pruning strategy implemented
   - Verification: Load test with large corpus

### Design
6. **Is the embedding approach appropriate?**
   - Trade-off: TF-IDF vs neural embeddings
   - Decision: TF-IDF for simplicity, revisit if quality poor

7. **Is the schema extensible enough?**
   - Concern: Fixed 384 dimensions hard to change
   - Mitigation: Document migration process

### Integration
8. **Will integration be non-breaking?**
   - Concern: Adding hooks to state_graph.ts
   - Mitigation: Graceful degradation (optional hints)

9. **What happens if quality graph fails?**
   - Expected: Task continues, warning logged
   - Verification: Test error paths (Task 5)

---

## Rejection Criteria (Must Fix Before Merge)

**Critical Issues:**
- [ ] Embeddings not normalized (L2 norm ≠ 1.0)
- [ ] Concurrent writes corrupt file
- [ ] Tests fail
- [ ] Performance >2x target (embedding >200ms)
- [ ] Security vulnerability (input injection)

**Major Issues:**
- [ ] No error handling in hot path
- [ ] Memory leak (unbounded growth)
- [ ] Missing critical tests (concurrent writes)
- [ ] Insufficient documentation (no README)

**Minor Issues (can defer):**
- Low test coverage (<70%)
- Missing performance benchmark
- Incomplete inline comments
- Code duplication

---

## Approval Checklist

Before approving for merge:

**Functionality:**
- [ ] All completed tasks work correctly
- [ ] Tests pass (npm test, pytest)
- [ ] Build succeeds (npm run build)
- [ ] No type errors (npm run typecheck)

**Quality:**
- [ ] Code readable and maintainable
- [ ] Documented sufficiently
- [ ] No obvious performance issues
- [ ] Security reviewed

**Process:**
- [ ] Acceptance criteria met (for completed tasks)
- [ ] Evidence artifacts present
- [ ] Known gaps documented
- [ ] Next steps clear

**Recommendation:**
- ✅ Approve with minor revisions
- ✅ Approve conditionally (address before next task)
- ❌ Request changes (critical issues)
- ❌ Reject (fundamental design flaw)

---

## Suggested Improvements (Non-Blocking)

1. **Better embeddings**: Try sentence-transformers for comparison
2. **Monitoring**: Add automated latency tracking
3. **Corpus management**: Auto-prune when size exceeds threshold
4. **Documentation**: Add troubleshooting examples
5. **Testing**: Add property-based tests (hypothesis)
6. **Performance**: Profile and optimize hot paths
7. **Visualization**: CLI tool to explore similar tasks

---

## Sign-off

**Reviewer**: _________________
**Date**: _________________
**Status**: ☐ Approved  ☐ Approved with conditions  ☐ Request changes  ☐ Reject
**Comments**:

