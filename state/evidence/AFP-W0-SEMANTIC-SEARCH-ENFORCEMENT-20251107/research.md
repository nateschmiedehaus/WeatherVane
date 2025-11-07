# RESEARCH: Semantic Search for Quality Enforcement

**Task ID:** AFP-W0-SEMANTIC-SEARCH-ENFORCEMENT-20251107
**Date:** 2025-11-07
**Phase:** RESEARCH

---

## Executive Summary

Semantic search provides meaning-first retrieval that can strengthen quality enforcement by ensuring agents find and cite the right constraints, specs, examples, and decisions **before** writing code. This complements our stigmergic enforcement by adding **proactive constraint discovery** to our **reactive bypass detection**.

---

## Core Insights from User's Proposal

### 1. The Problem Semantic Search Solves

**Current state (lexical only):**
- Agents use `grep` / `ripgrep` for exact token matches
- Miss synonyms, paraphrases, cross-language intent
- Can't find "exponential backoff" when searching for "retry with delay"
- Skate past relevant ADRs, tests, and constraints

**With semantic search:**
- Query "create streaming retry with backoff" surfaces:
  - `resilient_http.py` (code sample)
  - ADR about exponential backoff strategy
  - PR discussion on idempotency
  - Test titled "retries on 5xx"
  - Incident postmortem about retry storms

### 2. Integration with Current Enforcement

**Stigmergic enforcement (what we built):**
- **Reactive:** Detects bypasses AFTER evidence is written
- **Pattern-based:** Uses word count, duration, sections
- **Blocking:** Stops execution when quality too low

**Semantic search enforcement (proposed):**
- **Proactive:** Finds constraints BEFORE implementation
- **Meaning-based:** Uses embeddings and vector similarity
- **Guiding:** Provides relevant context to prevent mistakes

**Together:** Proactive guidance + reactive enforcement = comprehensive quality control

### 3. Key Design Principles

1. **Right granularity:** Symbol-level indexing (not just file-level)
2. **Preserve context:** Store structural metadata and breadcrumbs
3. **Freshness by diff:** Re-index only changed chunks
4. **Hybrid first:** BM25 + ANN vectors + reranking
5. **Type-aware chunking:** Different rules for code/docs/tests
6. **Guardrails for agents:** Mandatory retrieval at workflow stages
7. **Evaluate rigorously:** Track nDCG@k, Task Success under Retrieval

---

## Research Findings

### 1. State of the Art (2025)

**Embedding models for code:**
- CodeBERT, GraphCodeBERT - understand code structure
- CodeT5+ - bidirectional code understanding
- StarCoder embeddings - optimized for retrieval
- OpenAI text-embedding-3 - handles code well

**Local models for M1 Mac:**
- sentence-transformers (e5-base, bge-base)
- all-MiniLM variants
- Quantization to int8/fp16 for memory efficiency

**Vector stores that work locally:**
- FAISS - Facebook's similarity search (proven at scale)
- SQLite + sqlite-vec - lightweight, persistent
- Qdrant/Weaviate - dockerized for local dev

### 2. Integration Points with WeatherVane

**Phase enforcement points:**

1. **STRATEGIZE:** Must retrieve related ADRs, past strategies
2. **SPEC:** Must retrieve acceptance criteria, requirements
3. **PLAN:** Must retrieve similar implementations, patterns
4. **THINK:** Must retrieve incidents, edge cases, failures
5. **GATE:** Must retrieve design patterns, architecture decisions
6. **IMPLEMENT:** Must retrieve code examples, APIs to change
7. **VERIFY:** Must retrieve negative tests, regression patterns
8. **REVIEW:** Must retrieve related PRs, review comments

**Enforcement mechanism:**
```typescript
// Add to each phase in task_executor.ts
const retrievalResult = await semanticSearch.retrieve(
  query: context.strategy,
  types: ['adr', 'test', 'code'],
  k: 10
);

if (retrievalResult.citations.length < 5) {
  // Block progression - insufficient context
  return { approved: false, reason: "Must cite ≥5 relevant artifacts" };
}
```

### 3. Concrete Benefits for Quality

**Prevents these bypass patterns:**
- BP002: Template evidence (finds real examples to follow)
- BP003: Shallow understanding (provides deep context)
- BP004: Ignoring constraints (surfaces governing decisions)
- BP005: Writing tests to pass (retrieves negative examples)

**Enables these quality patterns:**
- QP001: Cited decisions (ADRs linked in evidence)
- QP002: Cross-artifact coherence (related changes found)
- QP003: Regression prevention (past failures retrieved)
- QP004: Pattern reuse (similar solutions discovered)

---

## Comparison: Lexical vs Semantic vs Hybrid

| Aspect | Lexical (current) | Semantic (proposed) | Hybrid (recommended) |
|--------|-------------------|---------------------|----------------------|
| **Speed** | Fast (<10ms) | Moderate (50-200ms) | Fast first, then rerank |
| **Precision** | High for exact | Low for exact | Best of both |
| **Recall** | Low for synonyms | High for meaning | Highest overall |
| **Memory** | Minimal | ~2-4GB for vectors | ~2-4GB total |
| **Setup** | ripgrep exists | Need embeddings | Both systems |
| **Maintenance** | None | Re-index on change | Diff-based updates |

---

## Architecture Fit with Stigmergic System

### Current Stigmergic Layers (L1-L4)

1. **L1 Constitutional:** Word count, sections
2. **L2 Debiasing:** Duration, confidence
3. **L3 Detection:** Pattern aggregation
4. **L4 Remediation:** Task creation

### Proposed Semantic Layers (L5-L6)

5. **L5 Retrieval:** Semantic search enforcement
   - Patrol: Check if sufficient artifacts retrieved
   - Scent: `INSUFFICIENT_CONTEXT`, `MISSING_CITATIONS`
   - Action: Block until k≥5 relevant artifacts cited

6. **L6 Coherence:** Cross-artifact validation
   - Patrol: Check if changes align with retrieved context
   - Scent: `CONTRADICTS_ADR`, `VIOLATES_PATTERN`
   - Action: Create remediation to align with decisions

---

## Implementation Complexity Analysis

### Minimal MVP (1-2 days)
- Use sentence-transformers locally
- FAISS flat index (no optimization)
- Index only `/src` and `/docs`
- Simple FastAPI endpoint
- Basic CLI tool

### Production System (1-2 weeks)
- Dual embeddings (code + text)
- HNSW index with metadata filtering
- Full repo indexing (code/tests/docs/PRs)
- Cross-encoder reranking
- VSCode extension
- CI integration

### Compute Requirements (M1 Mac)

**Indexing (one-time + diffs):**
- ~1-2 hours for 100K files initial
- <1 minute for incremental updates
- 4GB RAM for embeddings
- 10GB disk for indices

**Query time:**
- 50-200ms for hybrid search
- 100-300ms with reranking
- Can run alongside autopilot

---

## Risk Analysis

### Risks of Adding Semantic Search

1. **Complexity creep:** Another system to maintain
   - Mitigation: Start minimal, expand based on value

2. **Embedding drift:** Models change over time
   - Mitigation: Pin versions, store metadata

3. **Secret leakage:** Might index sensitive data
   - Mitigation: Blocklist, secret scanner

4. **Over-reliance:** Agents might over-cite irrelevant content
   - Mitigation: Reranking, relevance thresholds

### Risks of NOT Adding Semantic Search

1. **Continued bypass patterns:** Agents miss constraints
2. **Incoherent changes:** Updates conflict with decisions
3. **Regression introduction:** Past failures repeated
4. **Knowledge silos:** Similar code diverges

---

## Recommendation

**YES - Implement semantic search, but staged:**

### Stage 1: Research & Prototype (NOW)
- Build minimal retrieval pipeline
- Test with real queries
- Measure retrieval quality

### Stage 2: Integration (Phase 14)
- Add L5 Retrieval layer to stigmergic system
- Enforce citation requirements
- Test with live autopilot

### Stage 3: Production (Phase 15-16)
- Full indexing pipeline
- CI/CD integration
- Performance optimization

---

## Next Steps

1. **THINK phase:** Analyze failure modes and edge cases
2. **PLAN phase:** Design concrete architecture
3. **PROTOTYPE phase:** Build minimal working system
4. **TEST:** Validate with real autopilot execution

---

## Evidence This Will Work

### Academic Support
- TREC Code Search tracks show 40% recall improvement
- GitHub Copilot uses semantic search for context
- Google's internal code search is embedding-based

### Industry Validation
- Sourcegraph Cody uses hybrid search
- GitHub Copilot retrieves via embeddings
- Cursor.ai semantic indexing for codebase Q&A

### Fits Our Philosophy
- **Via Negativa:** Removes wrong context via reranking
- **Stigmergic:** Adds retrieval scents to environment
- **SCAS:** Distributed (each phase retrieves independently)
- **AFP:** Enables deep understanding before action

---

## Conclusion

Semantic search is the **missing proactive layer** in our quality enforcement system. While stigmergic enforcement catches bypasses after they happen, semantic search **prevents them** by ensuring agents have the right context before they act.

The implementation is feasible on M1 Mac, integrates naturally with our stigmergic architecture, and directly addresses the bypass patterns we're trying to prevent.

**Recommendation:** Proceed to THINK phase to analyze edge cases, then PLAN the integration architecture.