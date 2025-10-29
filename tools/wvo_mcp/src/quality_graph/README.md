# Quality Graph - Task Similarity Search

Vector-based task similarity search for WeatherVane autopilot.

## Overview

The quality graph tracks completed tasks as 384-dimensional TF-IDF embeddings, enabling:
- **Similar task discovery**: Find past tasks similar to current work
- **Planning hints**: Provide context from successful similar tasks
- **Anomaly detection**: Compare task metrics vs historical baseline (future)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Quality Graph                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Task Completion (MONITOR) → Embedding → Vector Storage     │
│                                                               │
│  New Task (PLAN) → Query Similar → Hints → Planner          │
│                                                               │
│  Observer → Query Similar → Baseline → Anomaly Detection    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Components

**TypeScript Modules** (`src/quality_graph/`):
- `schema.ts` - Zod validation for task vectors
- `persistence.ts` - JSONL storage operations
- `similarity.ts` - Cosine similarity and top-K search
- `recorder.ts` - Task vector recording (MONITOR integration)
- `hints.ts` - Similar task hints (PLAN integration)

**Python Scripts** (`scripts/quality_graph/`):
- `schema.py` - Pydantic models
- `embeddings.py` - TF-IDF embedding generation
- `record_task_vector.py` - CLI for recording tasks
- `query_similar_tasks.py` - CLI for querying similar tasks

**Storage**:
- `state/quality_graph/task_vectors.jsonl` - Task vectors (one JSON object per line)
- `state/quality_graph/schema.json` - JSON schema definition

## Usage

### Automatic Recording (MONITOR Phase)

Tasks are automatically recorded after successful completion:

```typescript
// In state machine MONITOR phase
const result = await runMonitor(context, {
  supervisor,
  runAppSmoke,
  clearMemory,
  clearRouter,
  workspaceRoot,  // Enables quality graph recording
  artifacts,      // Extracts metadata
  startTime,      // Computes duration
});

// Task vector written to state/quality_graph/task_vectors.jsonl
```

### Automatic Hints (PLAN Phase)

Similar tasks are queried before planning:

```typescript
// In state machine PLAN phase
const result = await runPlan(context, {
  planner,
  workspaceRoot,  // Enables quality graph queries
});

// Hints attached to plan result:
// result.artifacts.plan.qualityGraphHints
// result.artifacts.plan.similarTasksCount
```

### Manual Recording

Record a task manually:

```bash
python3 tools/wvo_mcp/scripts/quality_graph/record_task_vector.py . "TASK-123" \
  --title "Add user authentication" \
  --description "Implement JWT-based auth" \
  --files "src/auth.ts,src/middleware.ts" \
  --outcome success \
  --duration_ms 7200000 \
  --quality high
```

### Manual Query

Query similar tasks:

```bash
python3 tools/wvo_mcp/scripts/quality_graph/query_similar_tasks.py . \
  --title "Implement OAuth login" \
  --k 5 \
  --min-similarity 0.3
```

Output:
```json
{
  "success": true,
  "count": 3,
  "similar_tasks": [
    {
      "task_id": "TASK-123",
      "title": "Add user authentication",
      "similarity": 0.87,
      "is_confident": true,
      "outcome": {"status": "success"},
      "quality": "high",
      "duration_ms": 7200000
    },
    ...
  ]
}
```

### Backfilling Historical Tasks

Populate the corpus from completed tasks:

```bash
# Dry run (show what would be backfilled)
./scripts/backfill_quality_graph.sh --days 90 --dry-run

# Backfill last 90 days
./scripts/backfill_quality_graph.sh --days 90

# Force re-process all tasks
./scripts/backfill_quality_graph.sh --days 90 --force
```

**Features:**
- Idempotent (skips existing vectors)
- Progress bar (if tqdm installed)
- Statistics reporting
- Graceful error handling

**Output:**
```
Quality Graph Backfill
=====================

Workspace: /path/to/WeatherVane
Looking back: 90 days
Found 247 historical tasks in last 90 days
Found 32 existing task vectors
215 tasks to backfill (32 already exist)

Backfilling tasks: 100%|████████| 215/215 [01:23<00:00,  2.58task/s]

============================================================
Backfill Complete
  Successful: 213
  Failed: 2
  Already existed: 32
============================================================

✅ Backfill completed successfully
```

## Embedding Algorithm

**TF-IDF with Random Projection:**

1. **Feature Extraction**:
   - Title: 40% weight (repeated 2x)
   - Description: 30% weight (repeated 2x)
   - Files: 30% weight (repeated 2x)

2. **Preprocessing**:
   - Remove emoji
   - Normalize code snippets (`foo()` → `CODE_SNIPPET`)
   - Lowercase, remove punctuation
   - Remove English stop words

3. **Vectorization**:
   - TF-IDF with max 1000 features
   - Random projection to 384 dimensions
   - Unit normalization (L2 norm = 1.0)

**Rationale:**
- TF-IDF is simple, fast, and doesn't require API calls
- 384 dimensions balance signal quality vs performance
- Unit normalization enables cosine similarity via dot product

## Similarity Search

**Cosine Similarity:**
```
similarity(v1, v2) = v1 · v2  (for unit-normalized vectors)
```

**Query Options:**
- `k`: Number of results (default: 5)
- `minSimilarity`: Threshold 0.0-1.0 (default: 0.3)
- `successOnly`: Only return successful tasks (default: false)
- `excludeAbandoned`: Exclude abandoned tasks (default: true)

**Confidence:**
- High confidence: similarity > 0.5
- Moderate confidence: similarity 0.3-0.5

**Performance:**
- Query: <50ms for 100 vectors
- Linear O(n) scan (acceptable for corpus < 10,000)
- In-memory index loaded once per query

## Storage Format

**JSONL (JSON Lines):**

```jsonl
{"task_id":"T1","embedding":[0.1,0.2,...],"timestamp":"2025-10-29T...","outcome":{"status":"success"},"title":"..."}
{"task_id":"T2","embedding":[0.3,0.4,...],"timestamp":"2025-10-29T...","outcome":{"status":"success"},"title":"..."}
```

**Benefits:**
- Append-only (atomic writes on POSIX)
- Human-readable (each line is valid JSON)
- Easy to process (read line-by-line)
- Corrupt lines skipped gracefully

**Pruning:**
- Keep most recent 2000 vectors
- Auto-prune when corpus exceeds threshold
- Call `pruneOldVectors(workspaceRoot, keepRecent=2000)`

## Integration Points

### MONITOR Phase (Recording)

**File:** `state_runners/monitor_runner.ts`
**Line:** 62-102

After successful smoke test, records task vector:
- Extracts metadata from task and artifacts
- Computes duration from startTime
- Spawns Python subprocess to record
- Non-blocking: task completes even if recording fails

### PLAN Phase (Hints)

**File:** `state_runners/plan_runner.ts`
**Line:** 52-95

Before planning, queries similar tasks:
- Spawns Python subprocess to query
- Formats hints as markdown
- Attaches hints to plan result
- Non-blocking: planning works without hints

### Observer Phase (Baseline) **[FUTURE]**

**File:** TBD (waiting for IMP-OBS completion)

Compares task metrics vs similar tasks:
- Query similar tasks for current task
- Compute baseline (mean ± 2σ) from historical data
- Flag anomalies (e.g., "3x longer than similar tasks")
- Include in observer report

**Dependencies:**
- Observer agent/module must exist
- Observer phase in state machine
- Metrics collection infrastructure

## Testing

**Unit Tests:**
```bash
cd tools/wvo_mcp
npm test -- src/quality_graph/__tests__
```

**Python Tests:**
```bash
cd tools/wvo_mcp/scripts/quality_graph
python3 -m pytest tests/ -v
```

**Integration Tests:**
```bash
# Test recording after monitor
npm test -- monitor_integration.test.ts

# Test hints before plan
npm test -- plan_integration.test.ts
```

## Troubleshooting

### Recording Fails

**Symptom:** Task completes but no vector in `task_vectors.jsonl`

**Diagnosis:**
```bash
# Check logs for "Quality graph recording failed"
grep "Quality graph recording" state/logs/autopilot.log

# Test Python script manually
python3 tools/wvo_mcp/scripts/quality_graph/record_task_vector.py . "TEST" \
  --title "Test task" \
  --outcome success
```

**Common Causes:**
- Python dependencies not installed (`pip3 install scikit-learn numpy pydantic`)
- Workspace root path incorrect
- No metadata (title, description, or files) provided

### Query Returns Empty

**Symptom:** `similarTasksCount = 0` in plan notes

**Diagnosis:**
```bash
# Check corpus size
wc -l state/quality_graph/task_vectors.jsonl

# Test query manually
python3 tools/wvo_mcp/scripts/quality_graph/query_similar_tasks.py . \
  --title "Your task title" \
  --min-similarity 0.3
```

**Common Causes:**
- Corpus empty (run backfill script)
- Similarity threshold too high (try `--min-similarity 0.2`)
- Query task very different from corpus

### Backfill Fails

**Symptom:** Backfill script exits with errors

**Diagnosis:**
```bash
# Run with verbose logging
python3 scripts/backfill_quality_graph.py . --days 90 --dry-run

# Check resolution directory
ls -la resources/runs/*/resolution/
```

**Common Causes:**
- No historical tasks found (check resolution directories exist)
- Python dependencies not installed
- Resolution JSON files malformed

## Performance Targets

| Operation | Target | Actual |
|-----------|--------|--------|
| Embedding (cold) | <100ms | ~50-100ms |
| Embedding (warm) | <20ms | ~10-20ms |
| Similarity query (100 vectors) | <50ms | ~30-50ms |
| Recording overhead (MONITOR) | <100ms | ~50-100ms |
| Query overhead (PLAN) | <100ms | ~50-100ms |
| Backfill (100 tasks) | <5min | ~2-3min |

## Future Enhancements

1. **Neural Embeddings**: Replace TF-IDF with sentence-transformers
2. **Vector Database**: Use Pinecone/Weaviate for >10k corpus
3. **Prompt Integration**: Inject hints directly into planner LLM prompt
4. **Observer Baseline**: Complete integration (waiting for IMP-OBS)
5. **Semantic Clustering**: Group similar tasks for analysis
6. **Quality Prediction**: Predict task quality from similarity to past tasks

## References

- **Spec:** `state/evidence/IMP-ADV-01/spec/spec.md`
- **Plan:** `state/evidence/IMP-ADV-01/plan/plan.md`
- **Think:** `state/evidence/IMP-ADV-01/think/edge_cases.md`
- **Implementation:** `state/evidence/IMP-ADV-01/implement/implementation_summary.md`
