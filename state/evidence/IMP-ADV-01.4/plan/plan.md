# IMP-ADV-01.4 Plan - Corpus Size Monitoring

## Work Breakdown

### Task 1: Create corpus_metrics.ts helper module (5 minutes)

**File**: `tools/wvo_mcp/src/quality_graph/corpus_metrics.ts`

**Code** (~15 lines):
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Get the current size of the quality graph corpus
 *
 * @param workspaceRoot - Workspace root directory
 * @returns Number of task vectors in corpus (0 if corpus doesn't exist)
 */
export async function getCorpusSize(workspaceRoot: string): Promise<number> {
  const corpusPath = path.join(workspaceRoot, 'state', 'quality_graph', 'task_vectors.jsonl');

  try {
    const content = await fs.readFile(corpusPath, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.length > 0 && lines[0] !== '' ? lines.length : 0;
  } catch (error) {
    // File doesn't exist (empty corpus) or read error
    return 0;
  }
}
```

**Verification**:
- TypeScript compiles without errors
- Handles missing file gracefully (returns 0)
- Handles empty file gracefully (returns 0)

---

### Task 2: Integrate metric emission in monitor_runner.ts (3 minutes)

**File**: `tools/wvo_mcp/src/orchestrator/state_runners/monitor_runner.ts`

**Location**: After task vector recording (line ~95)

**Code** (~8 lines):
```typescript
// Import at top of file
import { getCorpusSize } from '../../quality_graph/corpus_metrics.js';

// After recordTaskVector() call (line ~95):
try {
  const corpusSize = await getCorpusSize(workspaceRoot);
  logInfo('Quality graph corpus size', { corpusSize });
  // TODO: Wire to metrics_collector when available
} catch (error) {
  logWarning('Failed to get corpus size', { error: error instanceof Error ? error.message : String(error) });
}
```

**Verification**:
- Log message appears after task completion
- Corpus size value matches manual `wc -l` check
- Error doesn't crash MONITOR phase

---

### Task 3: Register metric in metrics_collector.ts (2 minutes)

**File**: `tools/wvo_mcp/src/telemetry/metrics_collector.ts`

**Code** (~10 lines):
```typescript
// Add to metric registry
registerMetric({
  name: 'quality_graph_corpus_size',
  type: 'gauge',
  description: 'Number of task vectors in quality graph corpus',
  unit: 'vectors',
  tags: [],
});

// Add metric emission method
export function recordCorpusSize(size: number): void {
  emitGauge('quality_graph_corpus_size', size);
}
```

**Note**: Actual implementation depends on existing metrics_collector.ts API
- If metrics_collector doesn't exist yet (waiting for IMP-OBS), log only (Task 2 implementation)
- If it exists, wire up properly

**Verification**:
- Metric appears in telemetry output
- Type is gauge (current value, not counter)

---

### Task 4: Add unit tests (5 minutes)

**File**: `tools/wvo_mcp/src/quality_graph/__tests__/corpus_metrics.test.ts`

**Tests** (~40 lines):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { getCorpusSize } from '../corpus_metrics.js';

const TEST_WORKSPACE = '/tmp/corpus-metrics-test';

describe('getCorpusSize', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(`${TEST_WORKSPACE}/state/quality_graph`, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('counts vectors in corpus', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;
    await fs.writeFile(corpusPath, '{"task_id":"T1"}\n{"task_id":"T2"}\n{"task_id":"T3"}\n');

    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(3);
  });

  it('returns 0 for missing corpus', async () => {
    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(0);
  });

  it('returns 0 for empty corpus', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;
    await fs.writeFile(corpusPath, '');

    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(0);
  });
});
```

**Verification**:
- All 3 tests pass
- Coverage: known corpus, missing file, empty file

---

### Task 5: Update documentation (3 minutes)

**File**: `tools/wvo_mcp/src/quality_graph/README.md`

**Location**: After "Storage Format" section (line ~280)

**Content** (~30 lines):
```markdown
## Corpus Size Monitoring

**Metric**: `quality_graph_corpus_size`

The quality graph emits a corpus size metric after each task completion to monitor corpus health and prevent performance degradation.

### Metric Details

- **Name**: `quality_graph_corpus_size`
- **Type**: Gauge (current value)
- **Unit**: vectors
- **Emitted**: After task vector recorded in MONITOR phase
- **Frequency**: 1-5 times per day (per task completion)

### Alert Thresholds

- **Warning**: corpus ≥1800 vectors (90% of prune limit)
- **Critical**: corpus ≥2000 vectors (prune limit exceeded)

**Action**: When warning threshold reached, consider:
1. Review corpus growth rate (is it expected?)
2. Manually prune if needed: Call `pruneOldVectors(workspaceRoot, keepRecent=2000)`
3. Investigate if growth rate unexpectedly high

### Manual Inspection

Check corpus size manually:
```bash
# Count vectors
wc -l state/quality_graph/task_vectors.jsonl

# Check most recent vectors
tail -5 state/quality_graph/task_vectors.jsonl

# Check oldest vectors (will be pruned first)
head -5 state/quality_graph/task_vectors.jsonl
```

### Performance Expectations

- **Query Latency**: <100ms for corpus <2000 vectors
- **Memory Usage**: ~1-2MB for 2000 vectors (loaded during query)
- **Pruning Behavior**: Auto-prune keeps most recent 2000 vectors

**Note**: If corpus exceeds 2000, performance may degrade. Pruning should be triggered before this threshold.
```

**Verification**:
- Documentation clear and actionable
- Alert thresholds documented
- Manual commands provided

---

### Task 6: Build and test integration (2 minutes)

**Commands**:
```bash
# Build TypeScript
npm run build

# Run unit tests
npm test -- corpus_metrics.test.ts

# Verify no TypeScript errors
npx tsc --noEmit
```

**Verification**:
- Build succeeds (0 errors)
- Tests pass (3/3)
- No new TypeScript errors

---

## Dependencies

**Task Dependencies**:
- Task 1 (corpus_metrics.ts) → Task 2 (monitor integration)
- Task 1 → Task 4 (tests import corpus_metrics)
- No dependencies on Task 3 (metrics_collector) or Task 5 (docs)

**Execution Order**:
1. Task 1 (helper function) - FIRST
2. Task 4 (tests) - Can run in parallel with Task 2
3. Task 2 (monitor integration) - After Task 1
4. Task 3 (metrics_collector) - Independent
5. Task 5 (documentation) - Independent
6. Task 6 (build/test) - LAST

---

## Time Estimates

| Task | Estimate | Cumulative |
|------|----------|------------|
| Task 1: corpus_metrics.ts | 5 min | 5 min |
| Task 2: monitor_runner.ts integration | 3 min | 8 min |
| Task 3: metrics_collector.ts registration | 2 min | 10 min |
| Task 4: Unit tests | 5 min | 15 min |
| Task 5: Documentation | 3 min | 18 min |
| Task 6: Build & test | 2 min | 20 min |
| **TOTAL IMPLEMENT** | **20 min** | - |

**Other Phases**:
- STRATEGIZE: 5 minutes (complete)
- SPEC: 5 minutes (complete)
- PLAN: 3 minutes (this document)
- THINK: 2 minutes (edge cases)
- VERIFY: 3 minutes (run tests, manual check)
- REVIEW: 1 minute (quick quality check)
- PR: 1 minute (commit)
- MONITOR: negligible (update roadmap)

**Total**: ~30 minutes (on track)

---

## Rollback Plan

**If issues during implementation**:
1. **Partial Completion**: Commit Task 1 + Task 4 only (helper function + tests)
   - Defer integration (Tasks 2-3) to follow-up
   - Ensures helper function is tested and available

2. **Complete Rollback**: Revert commit
   - Effect: Remove all changes
   - Risk: Very Low (purely additive, no behavior changes)

**If issues in production**:
1. **Disable metric emission**: Comment out Task 2 integration
   - Effect: Stop collecting corpus size data
   - MONITOR phase continues normally

2. **Revert commit**: Full rollback
   - Effect: Remove helper function, tests, docs
   - No data migration needed

---

## Change Budget

**Files Modified**: 4
- `tools/wvo_mcp/src/quality_graph/corpus_metrics.ts` (NEW, ~15 lines)
- `tools/wvo_mcp/src/orchestrator/state_runners/monitor_runner.ts` (MODIFY, +8 lines)
- `tools/wvo_mcp/src/telemetry/metrics_collector.ts` (MODIFY, +10 lines) [if exists]
- `tools/wvo_mcp/src/quality_graph/README.md` (MODIFY, +30 lines)

**Files Created**: 1
- `tools/wvo_mcp/src/quality_graph/__tests__/corpus_metrics.test.ts` (NEW, ~40 lines)

**Total Lines**: ~103 lines (well within 30-minute estimate)

---

## Contingencies

**If metrics_collector.ts doesn't exist**:
- Task 3: Skip metric registration
- Task 2: Log only (no metric emission)
- Documentation: Note that metric wiring pending IMP-OBS completion
- **Effort**: No change (logging is simpler than metric emission)

**If monitor_runner.ts integration complex**:
- Break Task 2 into sub-tasks:
  - 2a: Add import
  - 2b: Call getCorpusSize()
  - 2c: Add try-catch
  - 2d: Log/emit metric
- **Effort**: +2 minutes contingency

**If tests fail unexpectedly**:
- Debug test environment setup
- Verify file paths correct
- Check async/await handling
- **Effort**: +5 minutes contingency

**Total Contingency**: +7 minutes = 30 minutes total (still on track)

---

## Acceptance Criteria Mapping

| Task | Acceptance Criteria |
|------|---------------------|
| Task 1 | AC1: Helper function accurate |
| Task 2 | AC2: Metric emitted in MONITOR |
| Task 3 | AC3: Metric registered |
| Task 2 | AC4: Non-blocking errors |
| Task 5 | AC5: Documentation updated |
| Task 4 | AC6: Test coverage |

**All AC covered**: ✅
