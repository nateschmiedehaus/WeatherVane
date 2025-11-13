# PLAN: Semantic Search Architecture for Quality Control

**Task ID:** AFP-W0-SEMANTIC-SEARCH-ENFORCEMENT-20251107
**Date:** 2025-11-07
**Phase:** PLAN

---

## Executive Summary

Design a minimal but functional semantic search system that integrates with our existing stigmergic enforcement layers (L1-L4) to provide comprehensive quality control. This adds proactive constraint discovery (L5-L6) to complement reactive bypass detection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   QUALITY CONTROL SYSTEM                 │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  PROACTIVE ENFORCEMENT          REACTIVE ENFORCEMENT     │
│  ┌─────────────────┐           ┌─────────────────┐      │
│  │ Semantic Search │           │   Stigmergic    │      │
│  │    (L5-L6)      │           │    (L1-L4)      │      │
│  └────────┬────────┘           └────────┬────────┘      │
│           │                              │                │
│           ├──────────────┬───────────────┤                │
│                          ▼                                │
│                   ┌──────────────┐                       │
│                   │ Task Executor │                       │
│                   │   (8 Phases)  │                       │
│                   └──────────────┘                       │
│                          │                                │
│                          ▼                                │
│                   ┌──────────────┐                       │
│                   │   Evidence    │                       │
│                   │  Generation   │                       │
│                   └──────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Retrieval Pipeline (2 hours)

**Files to create:**
1. `src/enforcement/semantic/embedding_service.ts` (~200 LOC)
   - Load sentence-transformers model
   - Batch embedding generation
   - Caching layer

2. `src/enforcement/semantic/vector_store.ts` (~300 LOC)
   - FAISS integration
   - Add/search/update operations
   - Metadata filtering

3. `src/enforcement/semantic/indexer.ts` (~400 LOC)
   - Parse code/docs/tests
   - Chunk by type
   - Generate embeddings
   - Store in FAISS

### Phase 2: Search Interface (1 hour)

**Files to create:**
1. `src/enforcement/semantic/search_service.ts` (~300 LOC)
   - Hybrid search (lexical + semantic)
   - Reranking
   - Citation formatting

2. `src/enforcement/semantic/semantic_enforcer.ts` (~200 LOC)
   - L5 Retrieval layer
   - L6 Coherence layer
   - Integration with scent environment

### Phase 3: Integration Points (1 hour)

**Files to modify:**
1. `src/wave0/task_executor.ts` (+100 LOC)
   - Add semantic retrieval before each phase
   - Store citations in context
   - Enforce citation requirements

2. `src/enforcement/stigmergic_enforcer.ts` (+50 LOC)
   - Check for citation scents
   - Aggregate with other layers

---

## Detailed Component Design

### 1. Embedding Service

```typescript
// src/enforcement/semantic/embedding_service.ts
export class EmbeddingService {
  private model: any; // sentence-transformers model
  private cache: Map<string, Float32Array>;

  async initialize(): Promise<void> {
    // Load model (all-MiniLM-L6-v2 for start)
    // 384 dimensions, good for code+text
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    // Batch process, use cache
    // Handle OOM with chunking
  }
}
```

### 2. Vector Store

```typescript
// src/enforcement/semantic/vector_store.ts
export class VectorStore {
  private index: any; // FAISS index
  private metadata: Map<number, ChunkMetadata>;

  async addVectors(
    vectors: Float32Array[],
    metadata: ChunkMetadata[]
  ): Promise<void> {
    // Add to FAISS
    // Store metadata separately
  }

  async search(
    query: Float32Array,
    k: number,
    filters?: Record<string, any>
  ): Promise<SearchResult[]> {
    // FAISS search
    // Apply metadata filters
    // Return with scores
  }
}
```

### 3. Indexer

```typescript
// src/enforcement/semantic/indexer.ts
export class CodebaseIndexer {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;

  async indexRepository(rootPath: string): Promise<void> {
    // Walk filesystem
    // Chunk by type:
    //   - Code: AST-based (using @typescript-eslint/parser)
    //   - Docs: Markdown headers
    //   - Tests: Test case boundaries
    // Generate embeddings
    // Store in vector DB
  }

  async indexDiff(changedFiles: string[]): Promise<void> {
    // Incremental update
    // Remove old chunks
    // Add new chunks
  }
}
```

### 4. Search Service

```typescript
// src/enforcement/semantic/search_service.ts
export class SemanticSearchService {
  async search(
    query: string,
    options: SearchOptions
  ): Promise<SearchResults> {
    // 1. Lexical search with ripgrep
    // 2. Semantic search with embeddings
    // 3. Merge and dedupe
    // 4. Rerank with relevance scoring
    // 5. Format citations

    return {
      results: [...],
      citations: [...],
      metadata: {...}
    };
  }
}
```

### 5. Semantic Enforcer (L5-L6)

```typescript
// src/enforcement/semantic/semantic_enforcer.ts
export class SemanticEnforcer {
  private searchService: SemanticSearchService;
  private environment: ScentEnvironment;

  // L5: Retrieval Layer
  async enforceRetrieval(
    task: Task,
    phase: string,
    context: PhaseContext
  ): Promise<void> {
    const results = await this.searchService.search(
      context[phase],
      { types: this.getRequiredTypes(phase), k: 10 }
    );

    if (results.citations.length < 5) {
      await this.environment.leaveScent({
        type: ScentType.INSUFFICIENT_CONTEXT,
        strength: 0.9,
        taskId: task.id,
        layer: LayerName.L5_RETRIEVAL,
        metadata: {
          found: results.citations.length,
          required: 5
        }
      });
    }
  }

  // L6: Coherence Layer
  async enforceCoherence(
    task: Task,
    phase: string,
    context: PhaseContext
  ): Promise<void> {
    // Check if implementation aligns with retrieved ADRs
    // Detect contradictions with past decisions
    // Ensure pattern consistency
  }
}
```

---

## Integration with Task Executor

```typescript
// Modifications to src/wave0/task_executor.ts

// Add semantic enforcer
private semanticEnforcer: SemanticEnforcer;

// In each phase (example for STRATEGIZE):
logInfo(`TaskExecutor: Executing STRATEGIZE for ${task.id}`);

// NEW: Semantic retrieval before execution
const retrievalContext = await this.semanticEnforcer.retrieve(
  "constraints and decisions for " + task.title,
  { types: ['adr', 'strategy', 'spec'], k: 10 }
);
context.citations = retrievalContext.citations;

// Execute phase with retrieval context
const strategyContent = await executeStrategize(task, mcp, {
  ...context,
  retrievalContext
});

// Write evidence
fs.writeFileSync(path.join(evidenceDir, "strategize.md"), strategyContent);

// NEW: Enforce semantic quality
await this.semanticEnforcer.enforceRetrieval(task, "strategize", context);
await this.semanticEnforcer.enforceCoherence(task, "strategize", context);

// Existing: Stigmergic enforcement
const result = await this.enforcer.enforcePhaseCompletion(task, "strategize", context);
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('Semantic Search Components', () => {
  describe('EmbeddingService', () => {
    it('generates embeddings for text');
    it('caches repeated inputs');
    it('handles batch processing');
  });

  describe('VectorStore', () => {
    it('stores and retrieves vectors');
    it('filters by metadata');
    it('returns similarity scores');
  });

  describe('SemanticEnforcer', () => {
    it('blocks on insufficient citations');
    it('detects coherence violations');
    it('integrates with scent environment');
  });
});
```

### Integration Tests

```typescript
describe('Quality Control Integration', () => {
  it('combines semantic + stigmergic enforcement', async () => {
    // Create task with low quality evidence
    // Run through task executor
    // Verify BOTH systems detect issues:
    //   - Semantic: insufficient citations
    //   - Stigmergic: low word count
    // Verify task blocked
  });

  it('approves high quality with citations', async () => {
    // Create task with good evidence + citations
    // Run through task executor
    // Verify both systems approve
    // Verify task completes
  });
});
```

---

## Resource Requirements

### Development Time
- Core retrieval: 2 hours
- Search interface: 1 hour
- Integration: 1 hour
- Testing: 1 hour
- **Total: 5 hours**

### Runtime Resources
- Memory: +1.5GB (model + index)
- Disk: +2GB (embeddings + indices)
- CPU: Low (except during indexing)
- Network: None (all local)

### Dependencies
```json
{
  "@xenova/transformers": "^2.x", // For embeddings
  "faiss-node": "^0.x", // Vector store
  "@typescript-eslint/parser": "^6.x", // AST parsing
  "unified": "^10.x", // Markdown parsing
  "p-limit": "^4.x" // Concurrency control
}
```

---

## Rollout Plan

### Stage 1: MVP (Today)
1. Implement basic embedding service
2. Create simple FAISS store
3. Index only `/src` directory
4. Test retrieval quality

### Stage 2: Integration (Tomorrow)
1. Add semantic enforcer
2. Integrate with task executor
3. Run with live autopilot
4. Measure impact

### Stage 3: Production (Next Week)
1. Full repository indexing
2. Incremental updates
3. Performance optimization
4. VSCode extension

---

## Success Metrics

### Technical Metrics
- Retrieval precision@10 > 0.7
- Search latency < 500ms
- Memory usage < 2GB
- Zero crashes on M1

### Quality Metrics
- Citation appearance in evidence > 80%
- Bypass patterns reduced by 30%
- Coherence violations caught > 50%
- Developer satisfaction > 7/10

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Model too large | Use quantized all-MiniLM (90MB) |
| Index corruption | Daily backups, checksums |
| Slow searches | Caching, sharding |
| Irrelevant results | Reranking, thresholds |
| Gaming citations | Track citation quality |

---

## Next Steps

1. **PROTOTYPE:** Build minimal implementation
2. **TEST:** Validate retrieval quality
3. **INTEGRATE:** Combine with stigmergic layers
4. **VALIDATE:** Run with live autopilot

---

## Conclusion

This plan provides a practical path to add semantic search to our quality control system. The design is:

- **Minimal:** Only essential features for MVP
- **Integrated:** Works with existing stigmergic layers
- **Practical:** Fits M1 Mac constraints
- **Testable:** Clear success metrics

The semantic search component will complete our quality control remediation by adding proactive constraint discovery to our reactive bypass detection, creating a comprehensive system that ensures agents produce high-quality, contextually-aware code.

**Ready to proceed to PROTOTYPE phase.**