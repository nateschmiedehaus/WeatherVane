# IMP-ADV-01 · STRATEGIZE: Quality Graph Integration

**Task**: Quality Graph Integration - Vector tracking for autopilot tasks
**Phase**: STRATEGIZE
**Date**: 2025-10-29

---

## Problem Statement

**Current State:**
- Autopilot planner runs without historical context
- Observer agent has no similarity-based hints
- Similar tasks don't benefit from past learnings
- No quantitative measure of task "similarity" or complexity drift

**Issue:**
Autopilot re-solves similar problems from scratch every time. When planning "add API endpoint X", it doesn't know it already solved "add API endpoint Y" last week with a specific pattern. Observer agent reviews tasks without context of similar successful/failed tasks.

**Impact:**
- Wasted compute re-planning known patterns
- Missed opportunities to reuse proven approaches
- Observer can't flag "this looks different from similar past tasks"
- No quantitative tracking of task complexity evolution

---

## Objectives

1. **Vector Schema & Persistence**
   - Define task embedding schema (task_id → vector)
   - Store vectors in queryable format (SQLite with vector extension or JSONL + in-memory index)
   - Capture: task description, files touched, test patterns, outcome

2. **Similarity Queries**
   - Enable "find top-K similar tasks" for planner and observer
   - Return: task_id, similarity_score, outcome (success/failure), approach summary
   - Use for: plan hints, observer baseline comparison

3. **Vector Deltas at MONITOR**
   - Compute task embedding after completion
   - Record vector in quality graph DB
   - Track vector drift: how different is this task from similar historical tasks?

---

## Scope

**In Scope:**
- Minimal vector schema (embedding format, metadata)
- Persistence layer (SQLite table or JSONL file)
- Similarity query interface (top-K search)
- Integration hook in MONITOR phase (record vector after task completes)
- Integration hook in PLAN phase (query similar tasks for hints)
- Observer integration (provide baseline for "this task is anomalous")

**Out of Scope (Future Work):**
- Sophisticated embeddings (start with simple bag-of-words + TF-IDF)
- Real-time vector updates during task execution
- Vector-based anomaly detection alerts (IMP-OBS-04)
- Multi-modal embeddings (code + docs + metrics)
- Vector database migration to specialized DB (Pinecone, Weaviate)

---

## Non-Goals

- **NOT building ML models**: Use simple similarity metrics (cosine, Jaccard)
- **NOT replacing planner**: Only providing hints, not making decisions
- **NOT requiring external dependencies**: Stick to Python stdlib + numpy initially

---

## Inputs

**Required:**
- Task metadata: id, title, description, files_touched, test_files
- Task outcome: success/failure, duration, complexity_score
- Existing telemetry: state/telemetry/traces.jsonl, state/analytics/

**Available:**
- Phase ledger (task history)
- Evidence artifacts (plan, spec, review outputs)
- Decision journal entries

---

## Risks

1. **Cold start problem**: No vectors initially, takes time to build corpus
   - **Mitigation**: Backfill from recent completed tasks in phase ledger

2. **Embedding quality**: Simple bag-of-words may have low signal
   - **Mitigation**: Start simple, iterate based on similarity query usefulness

3. **Performance**: Vector similarity computation could be slow
   - **Mitigation**: In-memory index, limit corpus to recent N tasks (e.g., 1000)

4. **Integration complexity**: Planner/observer need to adopt similarity hints
   - **Mitigation**: Make hints optional, fail gracefully if no similar tasks

5. **Vector drift**: Task descriptions change format over time
   - **Mitigation**: Track drift explicitly, re-compute vectors periodically

---

## Strategy

**"Simple First, Iterate Fast"**

1. **Phase 1: Schema + Storage** (IMP-ADV-01.1)
   - Define JSONL schema for task vectors
   - Implement persistence to `state/quality_graph/task_vectors.jsonl`
   - Write/read utilities with schema validation

2. **Phase 2: Embedding Generation** (IMP-ADV-01.2)
   - Compute simple embedding: TF-IDF on (title + description + files)
   - Store as dense vector (numpy array serialized to list)
   - Metadata: timestamp, task_id, outcome

3. **Phase 3: Similarity Search** (IMP-ADV-01.3)
   - Load vectors into in-memory index (dict or faiss-lite)
   - Implement cosine similarity top-K search
   - Return task context + similarity score

4. **Phase 4: Integration Hooks** (IMP-ADV-01.4)
   - MONITOR phase: compute and record vector after task completion
   - PLAN phase: query similar tasks, inject as context hints
   - Observer: query similar tasks for baseline comparison

5. **Phase 5: Verification** (IMP-ADV-01.5)
   - Integration test: complete task, verify vector recorded
   - Similarity test: verify top-K returns sensible results
   - Performance test: similarity query <50ms for 1000 tasks

---

## Success Criteria

**Must Have:**
- [ ] Vector schema defined and validated (Zod/Pydantic)
- [ ] Persistence layer writes/reads vectors correctly
- [ ] Similarity query returns top-K similar tasks
- [ ] MONITOR phase records vector after task completion
- [ ] PLAN phase receives similar task hints (even if unused)
- [ ] Observer can query similar tasks for baseline

**Should Have:**
- [ ] Backfill script for existing completed tasks
- [ ] Similarity query performance <50ms
- [ ] Drift tracking (vector delta from historical mean)

**Nice to Have:**
- [ ] CLI tool to query similar tasks interactively
- [ ] Visualization of task similarity clusters

---

## Alternatives Considered

**Option A: Use existing vector DB (Pinecone, Weaviate)**
- **Pros**: Battle-tested, sophisticated similarity search
- **Cons**: External dependency, overkill for 100-1000 tasks
- **Decision**: Start simple, migrate later if needed

**Option B: Embed using OpenAI/Claude embeddings**
- **Pros**: High-quality semantic embeddings
- **Cons**: API cost, latency, external dependency
- **Decision**: Start with TF-IDF, upgrade if similarity quality is poor

**Option C: Store vectors in SQLite with vector extension**
- **Pros**: SQL queries, integrated with existing DB
- **Cons**: Requires sqlite-vss extension, not standard
- **Decision**: Use JSONL + in-memory index for simplicity

---

## Kill Triggers

Stop work if any of these occur:
1. Similarity queries consistently return irrelevant tasks (precision <20%)
2. Performance unacceptable (>500ms for similarity query)
3. Integration rejected by planner/observer due to added complexity
4. User feedback: "similarity hints are distracting/unhelpful"

Review after 2 weeks of usage, pivot to Option A/B if needed.

---

## References

- **Prior Art**: `docs/autopilot/ClaudeCouncil-Extended.md` (quality graph concept)
- **Integration Points**: `tools/wvo_mcp/src/orchestrator/state_graph.ts` (MONITOR phase)
- **Schema Examples**: `state/telemetry/traces.jsonl` (JSONL format patterns)

---

## Next Phase: SPEC

Define acceptance criteria:
- Vector schema fields (required/optional)
- Similarity query API contract
- Integration point signatures
- Performance KPIs (latency, accuracy)
