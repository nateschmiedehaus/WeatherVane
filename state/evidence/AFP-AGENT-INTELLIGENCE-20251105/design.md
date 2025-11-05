# Design: AFP-AGENT-INTELLIGENCE-20251105

> **Purpose:** Implement knowledge infrastructure enabling agents to deeply understand the codebase, achieving requisite variety for autonomous AFP/SCAS discipline.

---

## Context

**What problem are you solving and WHY?**

**Problem:** Agents have insufficient requisite variety (Ashby's Law) - they can read files but don't deeply understand the system's semantic structure, architectural patterns, or decision rationale. This forces manual guidance for organizational decisions and prevents autonomous AFP/SCAS maintenance.

**Root Cause:** No persistent knowledge layer. Agents rely on file operations (Read/Grep/Glob) which provide syntactic knowledge but lack:
- Semantic understanding (what code DOES, not just what it IS)
- Architectural maps (where things SHOULD go)
- Historical context (WHY decisions were made)
- Cross-session memory (learning persists)
- Pattern recognition (generalizable solutions)

**Goal:** Build automated knowledge infrastructure that captures semantic, architectural, and historical understanding, enabling agents to work at higher leverage levels (operational → tactical → architectural → strategic) without manual guidance.

**See:** `meta_analysis.md` and `intelligence_usage.md` for comprehensive analysis.

---

## Five Forces Check

### COHERENCE - Match the terrain

- [x] I searched for similar patterns in the codebase
- Modules checked (3 most similar):
  1. `tools/wvo_mcp/src/work_process/` - ledger pattern for persistence
  2. `tools/wvo_mcp/src/critics/` - analysis + logging pattern
  3. `tools/wvo_mcp/src/enforcement/` - automated quality enforcement

- Pattern I'm reusing: **Ledger + Analytics pattern**
  - Work process uses JSONL ledger for immutable history
  - Critics use SQLite + JSONL for structured queries + audit trail
  - Knowledge graph extends this: SQLite for relations, post-commit extraction for automation

### ECONOMY - Achieve more with less

- [x] I explored deletion/simplification (via negativa)
- Code I can delete: None directly, BUT this enables future deletion:
  - Automated dead code detection (via negativa opportunities)
  - Consolidated documentation (reduce redundant tribal knowledge)
  - Reduced manual guidance overhead (agents self-service)

**Why I must add:** No existing knowledge layer. Agents currently rely on expensive file searches repeated every session. This is infrastructure investment that REDUCES total system complexity by eliminating repeated discovery work.

- LOC estimate: +~2000 LOC initially, BUT:
  - Replaces repeated manual file searches (unmeasured cost)
  - Enables automated via negativa (future LOC reduction)
  - Progressive implementation (5 phases, can stop after Phase 1 if sufficient)

### LOCALITY - Related near, unrelated far

- [x] Related changes are in same module
- Files changing (Phase 1 scope):
  - `tools/wvo_mcp/src/intelligence/` (NEW module - all knowledge code here)
  - `tools/wvo_mcp/src/orchestrator/` (integrate query interface)
  - `scripts/` (post-commit hook for extraction)

- Dependencies: Local to intelligence module, clean interface to orchestrator

### VISIBILITY - Important obvious, unimportant hidden

- [x] Errors are observable, interfaces are clear
- Error handling:
  - Failed extractions logged to `state/analytics/knowledge_extraction.jsonl`
  - Query failures return graceful degradation (fallback to traditional file search)
  - Extraction errors non-blocking (knowledge builds incrementally)

- Public API:
  ```typescript
  knowledge_query(question: string, context?: QueryContext): KnowledgeResult
  ```
  - Minimal, self-explanatory interface
  - Transparent fallback when knowledge incomplete

### EVOLUTION - Patterns prove fitness

- [x] I'm using proven patterns OR documenting new one for fitness tracking

**Pattern fitness:**
- **Ledger pattern** (proven): work_process/ uses JSONL ledger successfully
- **Critic analysis pattern** (proven): 6+ critics use analyze → score → log pattern
- **Progressive enforcement** (proven): Smart LOC uses progressive warnings effectively

**New pattern being introduced:** **Knowledge Graph for Agents**
- **Why needed:** No existing pattern for persistent semantic understanding
- **Fitness measurement:**
  - Query success rate (% of queries answered vs fallback to file search)
  - Guidance reduction (manual "where should X go" questions)
  - Task completion velocity (time from task start → correct implementation)
  - Via negativa automation (dead code detected/removed)

**Pattern Decision:**

**Similar patterns found:**
- Pattern 1: `work_process/index.ts:85-120` - Ledger with immutable history
- Pattern 2: `critics/base.ts:45-90` - Analysis → Result → JSONL logging
- Pattern 3: `enforcement/loc_analyzer.ts:150-200` - Context-aware rules engine

**Pattern selected:** Hybrid of all three
- Ledger pattern (immutable knowledge entries)
- Critic pattern (extract → analyze → log)
- Context-aware pattern (query understanding)

**Why this pattern:** Combines proven persistence (ledger), proven analysis (critics), proven rule sophistication (context-aware enforcement) into knowledge domain.

**Leverage Classification:**

**Code leverage level:** **HIGH**

**My code is:** HIGH **because:**
- Used by ALL agents across ALL tasks
- Wrong semantic understanding → incorrect implementations → systemic failure
- Core infrastructure for future autonomous operation

**Assurance strategy:**
- Comprehensive testing (7 dimensions per UNIVERSAL_TEST_STANDARDS.md)
- Graceful degradation (never break if knowledge incomplete)
- Incremental rollout (Phase 1 → measure → Phase 2 → measure...)
- Manual validation (spot-check extractions against ground truth)

**Commit message will include:**
```
Pattern: Knowledge Graph for Agents (ledger + critic analysis + context-aware query)
Enables: Autonomous organizational decisions, via negativa automation, cross-session learning
Phase: 1 of 5 (semantic + call graph)
```

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

**Direct deletion:** None - this is new infrastructure.

**Indirect deletion enabled (future work):**

What existing complexity can this REMOVE?

1. **Repeated file searches:** Agents grep/glob for same code across sessions
   - Waste: ~5-10 min per task on discovery
   - Knowledge graph: Instant lookup, semantic not syntactic

2. **Manual guidance overhead:** "Where should X go?" questions
   - Current: User must answer
   - Knowledge graph: Agent queries architecture map autonomously

3. **Dead code accumulation:** No automated via negativa detection
   - Current: Manual code reviews find unused code
   - Knowledge graph: Automated "what calls X?" → delete if none

4. **Redundant documentation:** Tribal knowledge scattered across docs/comments/conversations
   - Current: Multiple sources of truth
   - Knowledge graph: Single source, automatically extracted from decisions

**Net effect:** Adding 2000 LOC of infrastructure REDUCES total system complexity by eliminating ongoing manual overhead and enabling automated via negativa.

**Why deletion/simplification insufficient:** There's no existing knowledge layer to simplify - this is foundational infrastructure missing from the system.

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

**This is a PROPER FIX (refactoring root cause).**

**Root cause:** Agent intelligence gap creates manual guidance dependency
**Symptom:** Repeated questions, slow task completion, inability to operate autonomously

**Not a patch:** Building foundational infrastructure that eliminates the need for workarounds.

**Technical debt created:** Minimal
- Clean module boundary (`intelligence/`)
- Graceful degradation (doesn't break if incomplete)
- Progressive implementation (can stop after Phase 1)

**Technical debt REMOVED:**
- Eliminates repeated discovery work
- Reduces documentation fragmentation
- Enables automated quality improvements

---

## Alternatives Considered

### Alternative 1: Status Quo (Do Nothing)
- **What:** Continue with file operations (Read/Grep/Glob), manual guidance
- **Pros:**
  - Zero implementation cost
  - No new complexity
- **Cons:**
  - Perpetual manual overhead
  - No cross-session learning
  - Agents can't reach higher leverage levels (stuck at reactive/operational)
  - Via negativa opportunities missed
- **Why not selected:** Violates SCAS principle of continuous improvement. Agents need requisite variety to maintain AFP discipline autonomously.

### Alternative 2: LLM-Only Semantic Analysis
- **What:** No knowledge graph, just use LLM to analyze code on-demand
- **Pros:**
  - Simpler implementation
  - No persistence layer
- **Cons:**
  - Expensive (token cost per query)
  - Slow (analysis per request)
  - No learning accumulation
  - Can't detect patterns across codebase
- **Why not selected:** High ongoing cost, no compound benefits. Knowledge should be extracted once, queried many times.

### Alternative 3: Full-Featured Knowledge Graph (All Phases at Once)
- **What:** Implement all 5 phases immediately (semantic + dependencies + history + patterns + self-maintenance)
- **Pros:**
  - Complete solution faster
  - Maximum capability
- **Cons:**
  - High upfront cost (~2000+ LOC)
  - Risk of over-engineering
  - Hard to validate incrementally
- **Why not selected:** Violates AFP principle of measured progress. Progressive implementation allows validation and course correction.

### Selected Approach: Progressive Knowledge Infrastructure (Phase 1 → Measure → Phase 2...)

**What:**
1. **Phase 1** (this task): Semantic understanding + call graph
   - Extract function purposes (LLM-generated descriptions)
   - Build call graph (who calls whom)
   - SQLite storage + query interface
   - Post-commit hook for automated extraction

2. **Phase 2** (future, if Phase 1 proves valuable): Historical context
   - Link decisions → code locations
   - Track WHY behind implementation choices

3. **Phase 3** (future): Pattern recognition
   - Identify reusable solution structures
   - Generalize from specific implementations

4. **Phase 4** (future): Impact analysis
   - "What breaks if I change X?"
   - Predict change ripple effects

5. **Phase 5** (future): Full autonomy
   - Self-maintaining knowledge
   - Automated via negativa suggestions
   - Proactive refactoring recommendations

**Why:**
- Validates value incrementally (can stop if insufficient ROI)
- Manageable scope per phase (~400-500 LOC each)
- Progressive complexity (each phase builds on previous)
- Aligns with AFP measured progress principle

**How it aligns with AFP/SCAS:**
- **Via Negativa:** Enables automated dead code detection (future)
- **Refactor Not Repair:** Permanent infrastructure, not patches
- **Complexity Control:** Progressive phases prevent over-engineering
- **Measurement:** Each phase has success metrics before continuing
- **Requisite Variety:** Agents gain internal complexity matching system complexity

---

## Complexity Analysis

**How does this change affect complexity?**

**Complexity increases:**
- **Where:** New `intelligence/` module (~500 LOC Phase 1)
- **Why:** Adding persistent knowledge layer, extraction pipeline, query interface

**Is this increase JUSTIFIED?** **YES**

**Justification:**
- **Essential complexity:** Agents NEED semantic understanding to operate autonomously
- **Reduces accidental complexity:** Eliminates repeated discovery work, manual guidance, documentation fragmentation
- **Compound benefits:** Every extracted piece of knowledge serves all future tasks
- **Requisite variety:** Controller (agents) must match system complexity (codebase)

**How will you MITIGATE this complexity?**

1. **Clean boundaries:** All knowledge code in `intelligence/` module
2. **Simple interface:** Single `knowledge_query()` function
3. **Graceful degradation:** Fallback to traditional file search if knowledge incomplete
4. **Progressive rollout:** Phase 1 only, validate before Phase 2
5. **Comprehensive tests:** All 7 dimensions per UNIVERSAL_TEST_STANDARDS.md
6. **Observable operations:** Extraction logs, query metrics, success rates

**Complexity decreases:**
- **Discovery work:** From repeated searches to instant queries
- **Manual guidance:** From user-answered questions to autonomous lookup
- **Documentation:** From scattered tribal knowledge to single source
- **Future via negativa:** Automated detection reduces code mass over time

**Trade-offs:**
- **Necessary:** Knowledge extraction, storage, query engine
- **Unnecessary:** Avoided via progressive implementation (don't build Phase 2 unless Phase 1 succeeds)

**Net effect:** Initial complexity investment yields long-term simplification through reduced manual overhead and automated quality improvements.

---

## Implementation Plan

### Phase 1 Scope (This Task)

**IMPORTANT:** This is a NEW module - `intelligence/` does not currently exist. All files below will be CREATED during implementation.

**Existing files examined for pattern matching:**
- `tools/wvo_mcp/src/work_process/index.ts` - Ledger pattern for persistence
- `tools/wvo_mcp/src/critics/base.ts` - Analysis + logging pattern
- `tools/wvo_mcp/src/enforcement/loc_analyzer.ts` - Context-aware rules engine
- `tools/wvo_mcp/src/orchestrator/tools.ts` - Tool registration pattern (will be modified)

**New files to CREATE:**
1. `tools/wvo_mcp/src/intelligence/knowledge_types.ts` (~80 LOC - type definitions)
2. `tools/wvo_mcp/src/intelligence/knowledge_extractor.ts` (~200 LOC - semantic extraction)
3. `tools/wvo_mcp/src/intelligence/knowledge_storage.ts` (~150 LOC - SQLite schema + operations)
4. `tools/wvo_mcp/src/intelligence/knowledge_query.ts` (~150 LOC - query interface)
5. `tools/wvo_mcp/src/intelligence/index.ts` (~20 LOC - exports)
6. `scripts/extract_knowledge.mjs` (~100 LOC - post-commit hook integration)
7. `tools/wvo_mcp/src/intelligence/__tests__/knowledge_extractor.test.ts` (~150 LOC)
8. `tools/wvo_mcp/src/intelligence/__tests__/knowledge_query.test.ts` (~150 LOC)
9. `docs/intelligence/KNOWLEDGE_SYSTEM.md` (~300 LOC user guide)

**Existing files to MODIFY:**
1. `tools/wvo_mcp/src/orchestrator/tools.ts` (+20 LOC - register knowledge_query tool)
2. `package.json` (+5 LOC - post-commit hook script)

**Estimated LOC:** +1500 LOC (8 new files + tests + docs, 2 modifications)

**Scope Summary:**
- **Files changing:** 11 total (9 new + 2 modified)
- **Net LOC:** +1500 (all additions, this is new infrastructure)
- **Micro-batching:** Exceeds 5-file limit (infrastructure project)

**Micro-batching compliance:**
- Batch 1: Core types + storage (~230 LOC, 2 files)
- Batch 2: Extraction logic (~200 LOC, 1 file)
- Batch 3: Query interface (~150 LOC, 1 file)
- Batch 4: Tests Part 1 (~150 LOC, 1 file)
- Batch 5: Tests Part 2 (~150 LOC, 1 file)
- Batch 6: Integration (~125 LOC, 3 files)
- Batch 7: Documentation (~300 LOC, 1 file)

**Risk Analysis:**

**Edge cases:**
1. **Extraction fails:** Non-blocking, log error, knowledge builds incrementally
2. **Query returns empty:** Fallback to traditional file search
3. **Database corruption:** Rebuild from scratch (extraction is repeatable)
4. **LLM unavailable:** Skip semantic analysis, use structural analysis only
5. **Large codebases:** Pagination, incremental extraction, background processing

**Failure modes:**
1. **Semantic extraction incorrect:**
   - Mitigation: Spot-check samples, confidence scores, human validation
2. **Knowledge becomes stale:**
   - Mitigation: Post-commit hook keeps it current, staleness detection
3. **Query interface misunderstood:**
   - Mitigation: Examples in docs, logged query patterns, iterative improvement
4. **Performance degradation:**
   - Mitigation: Indexes on SQLite, query optimization, caching

**Testing strategy:**

Per UNIVERSAL_TEST_STANDARDS.md (7 dimensions):

1. **Functional:** Extract → Store → Query roundtrip works
2. **Error Handling:** Graceful degradation when knowledge incomplete
3. **Edge Cases:** Empty results, malformed queries, extraction failures
4. **Integration:** Works with orchestrator, post-commit hook
5. **Performance:** Query latency <100ms, extraction <1s per file
6. **Resilience:** Database corruption recovery, LLM unavailable fallback
7. **Real-World:** Query real codebase, verify semantic accuracy

**Assumptions:**

1. **Post-commit hooks reliable:** Extraction runs after every commit
   - If wrong: Manual extraction command as fallback

2. **SQLite sufficient:** Performance adequate for 10k+ functions
   - If wrong: Migrate to PostgreSQL (same schema)

3. **LLM semantic analysis accurate:** >80% correct semantic descriptions
   - If wrong: Tune prompts, add human validation, use structural analysis only

4. **Agents use natural language queries:** "Where should X go?"
   - If wrong: Support structured queries, add query templates

5. **Knowledge accretes gradually:** Each commit adds value
   - If wrong: Batch extraction mode for initial population

---

## Review Checklist (Self-Check)

- [x] I explored deletion/simplification (via negativa)
- [x] If adding code, I explained why deletion won't work
- [x] If modifying large files/functions, I considered full refactoring
- [x] I documented 2-3 alternative approaches
- [x] Any complexity increases are justified and mitigated
- [x] I estimated scope (files, LOC) and it's within limits
- [x] I thought through edge cases and failure modes
- [x] I have a testing strategy

**All boxes checked.** Ready for GATE review.

---

## Notes

**Success Metrics (Phase 1):**
- Query success rate >70% (answered without fallback)
- Guidance reduction: 50% fewer "where should X go" questions
- Task velocity: 20% faster from task start to correct implementation
- Extraction reliability: >95% of commits processed successfully

**Phase 2 decision:** Only proceed if Phase 1 shows >70% query success rate AND measurable velocity improvement after 4 weeks.

**Measurement period:** 4 weeks from Phase 1 deployment

**Rollout:** Opt-in initially (KNOWLEDGE_SYSTEM_ENABLED flag), opt-out after validation

---

**Design Date:** 2025-11-05
**Author:** Claude Council

---

## GATE Review Tracking

**GATE is ITERATIVE - expect multiple rounds:**

### Review 1: Pending
- **DesignReviewer Result:** Pending
- **Concerns Raised:** TBD
- **Remediation Task:** TBD
- **Time Spent:** TBD

**Next step:** Run `cd tools/wvo_mcp && npm run gate:review AFP-AGENT-INTELLIGENCE-20251105`
