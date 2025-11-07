# THINK: Edge Cases and Failure Modes for Semantic Search

**Task ID:** AFP-W0-SEMANTIC-SEARCH-ENFORCEMENT-20251107
**Date:** 2025-11-07
**Phase:** THINK

---

## Critical Questions to Answer

1. What happens when semantic search returns irrelevant results?
2. How do we prevent over-citation and context bloat?
3. What if the embedding model hallucinates similarities?
4. How do we handle code that has no good examples?
5. What about performance impact on already-slow autopilot?

---

## Edge Case Analysis

### EC1: Zero Results for Novel Code

**Scenario:** Agent implements something genuinely new with no precedent

**What breaks:**
- Semantic search returns empty results
- Citation requirement blocks progression
- Agent stuck in infinite retrieval loop

**Mitigation:**
- Allow progression with explicit "NOVEL_IMPLEMENTATION" flag
- Require extra scrutiny in REVIEW phase
- Create new artifacts for future retrieval

### EC2: Too Many Results (Information Overload)

**Scenario:** Query "error handling" returns 10,000 matches

**What breaks:**
- Context window explodes
- Agent paralyzed by choice
- Reranking takes forever
- Memory overflow on M1

**Mitigation:**
- Aggressive filtering by recency and relevance
- Hierarchical retrieval (categories first, then details)
- Hard cap at 20 results after reranking
- Query refinement loop if too broad

### EC3: Semantic Drift Over Time

**Scenario:** Codebase evolves, old embeddings become stale

**What breaks:**
- Retrieved examples use deprecated patterns
- ADRs reference obsolete architecture
- Tests for removed features surface

**Mitigation:**
- Add temporal decay to relevance scoring
- Flag artifacts older than 6 months
- Periodic full re-indexing quarterly
- Version embeddings with model ID

### EC4: Adversarial Citation Gaming

**Scenario:** Agent cites irrelevant docs to pass gate

**What breaks:**
- Agent learns to retrieve anything to meet k≥5
- Citations become meaningless checkboxes
- Quality enforcement becomes security theater

**Mitigation:**
- Relevance scoring with threshold (>0.7 similarity)
- Human-in-the-loop for suspicious patterns
- Track citation → implementation alignment
- Penalize agents with poor citation quality

### EC5: Cross-Language Confusion

**Scenario:** Python agent retrieves Go code with similar logic

**What breaks:**
- Syntax errors from wrong language
- Import wrong patterns/idioms
- Test frameworks don't match

**Mitigation:**
- Strong language filtering in retrieval
- Separate embeddings per language
- Boost same-language results 2x
- Add language tag to all chunks

---

## Failure Mode Analysis

### FM1: Embedding Model Failure

**Trigger:** Model API down, out of memory, or corrupted weights

**Impact:**
- All semantic searches fail
- Autopilot completely blocked
- No fallback to lexical search

**Recovery:**
- Graceful degradation to pure lexical
- Cache last 1000 successful embeddings
- Local backup model (smaller, faster)
- Circuit breaker with 3-retry limit

### FM2: Index Corruption

**Trigger:** Disk failure, concurrent writes, or bad merge

**Impact:**
- Nonsense results returned
- Crashes on similarity search
- Silent wrong retrievals

**Recovery:**
- Checksum validation on load
- Write-ahead log for changes
- Daily backup of indices
- Rebuild from source on corruption

### FM3: Performance Degradation

**Trigger:** Index grows beyond memory, too many queries

**Impact:**
- Search takes 10+ seconds
- Autopilot times out waiting
- M1 Mac thermal throttles

**Recovery:**
- Index sharding by service/module
- Query caching (1 hour TTL)
- Load only needed shards
- Offload reranking to background

### FM4: Secret Leakage

**Trigger:** API keys, passwords indexed accidentally

**Impact:**
- Secrets surface in search results
- Agent includes secrets in PRs
- Security breach via embeddings

**Prevention:**
- Secret scanner in indexing pipeline
- Blocklist: .env, *_secret*, *_key*
- Regex patterns for common secrets
- Audit trail of what's indexed

### FM5: Hallucinated Similarities

**Trigger:** Embedding model maps unrelated concepts close

**Impact:**
- "Database migration" returns "bird migration"
- "Token bucket" returns "S3 bucket"
- Wrong patterns applied

**Detection:**
- A/B test retrieval quality
- Human review of suspicious results
- Track implementation failures
- Negative feedback loop

---

## Performance Impact Analysis

### Current Autopilot Performance

- Task execution: ~5-30 minutes
- Evidence generation: ~2-3 minutes per phase
- Enforcement overhead: ~100-500ms per phase

### Added Semantic Search Overhead

**Per-phase retrieval:**
- Embedding generation: 50ms
- Vector search: 100ms
- Reranking: 150ms
- **Total: ~300ms per phase**

**Full task overhead:**
- 8 phases × 300ms = 2.4 seconds
- **Impact: <0.5% of total execution time**

### Memory Impact

**Current autopilot:**
- Node.js process: ~500MB
- TypeScript compiler: ~200MB

**Added semantic search:**
- FAISS index: ~1GB (mmap'd, shared)
- Embeddings cache: ~200MB
- **Total: ~1.2GB additional**

**M1 Mac capacity:**
- 8GB model: Tight but feasible
- 16GB model: Comfortable
- 24GB+ model: No issues

---

## Security Considerations

### SC1: Embedding Inversion Attacks

**Risk:** Embeddings might be invertible to recover source

**Mitigation:**
- Use lower-dimensional embeddings (384 vs 768)
- Add noise to embeddings (differential privacy)
- Don't store raw text with embeddings

### SC2: Cross-Tenant Information Leakage

**Risk:** Multi-tenant system might leak between projects

**Mitigation:**
- Separate indices per workspace
- Workspace ID in all metadata
- Filter at query time by workspace

### SC3: Poisoned Embeddings

**Risk:** Malicious code designed to rank high

**Mitigation:**
- Review suspicious high-ranking new code
- Track embedding "jumps" in similarity
- Anomaly detection on embedding distances

---

## Integration Complexity

### With Existing Stigmergic System

**Touchpoints:**
1. Add SemanticEnforcer alongside StigmergicEnforcer
2. Create L5_RETRIEVAL layer in scent environment
3. Modify each phase executor to call retrieval
4. Add citations to PhaseContext type
5. Update enforcement to check citations

**Estimated LOC:**
- SemanticEnforcer: ~500 LOC
- Retrieval layer: ~200 LOC
- Phase modifications: ~20 LOC × 8 = 160 LOC
- **Total: ~860 LOC**

### With MCP Tools

**New tool needed:**
```typescript
mcp.semanticSearch({
  query: string,
  types: string[],
  k: number,
  filters: Record<string, any>
}) => {
  results: Array<{
    content: string,
    path: string,
    score: number,
    metadata: Record<string, any>
  }>,
  citations: string[]
}
```

---

## Success Criteria

### Minimum Viable Success

1. Retrieves relevant ADRs 70% of the time
2. No more than 500ms latency per search
3. Citations actually appear in evidence
4. No crashes or OOM on M1 Mac

### Production Success

1. Retrieval precision@10 > 0.8
2. Reduces bypass patterns by 30%
3. Increases "good first try" rate by 50%
4. Developers report "finds what I need"

---

## Risk Matrix

| Risk | Probability | Impact | Mitigation Effort | Priority |
|------|-------------|---------|-------------------|----------|
| Performance degradation | Medium | High | Low | HIGH |
| Irrelevant results | High | Medium | Medium | HIGH |
| Secret leakage | Low | Critical | Low | HIGH |
| Embedding drift | Medium | Medium | High | MEDIUM |
| Gaming citations | Medium | Medium | High | MEDIUM |
| Index corruption | Low | High | Low | MEDIUM |
| Model failure | Low | High | Low | LOW |

---

## Go/No-Go Decision Framework

### GO Conditions ✅
- Retrieval works on test queries
- Performance <500ms per search
- Memory usage <2GB additional
- Citations improve evidence quality

### NO-GO Conditions ❌
- Crashes M1 Mac (OOM)
- Adds >2 seconds per phase
- Retrieval precision <50%
- Increases complexity beyond maintenance capacity

---

## Edge Case Test Plan

```typescript
// Test Suite for Edge Cases
describe('Semantic Search Edge Cases', () => {

  it('handles zero results gracefully', async () => {
    const results = await search('completely novel quantum blockchain AI');
    expect(results.length).toBe(0);
    expect(canProceedWithoutCitations).toBe(true);
  });

  it('caps results at 20 even for broad queries', async () => {
    const results = await search('function');
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('filters by language correctly', async () => {
    const results = await search('async', { language: 'python' });
    expect(results.every(r => r.language === 'python')).toBe(true);
  });

  it('degrades to lexical on embedding failure', async () => {
    mockEmbeddingFailure();
    const results = await search('test');
    expect(results.source).toBe('lexical_fallback');
  });

  it('blocks secrets from indexing', async () => {
    const indexed = await indexFile('.env');
    expect(indexed).toBe(false);
  });
});
```

---

## Conclusion

The edge cases are manageable and the failure modes have clear mitigations. The biggest risks are:

1. **Performance degradation** - Mitigate with caching and sharding
2. **Irrelevant results** - Mitigate with reranking and thresholds
3. **Gaming the system** - Mitigate with relevance scoring

None of these are showstoppers. The system degrades gracefully and adds minimal overhead.

**Recommendation:** Proceed to PLAN phase to design the concrete architecture.

The semantic search layer is **intellectually honest** about its limitations but **practically valuable** for quality enforcement. It won't catch everything, but it will catch more than grep alone.