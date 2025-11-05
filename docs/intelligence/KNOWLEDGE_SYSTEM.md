# Knowledge System - Phase 1 User Guide

> **Purpose:** Enable agents to deeply understand the codebase through automated semantic extraction and natural language queries.

---

## Overview

The Knowledge System is infrastructure that gives agents "memory" and "understanding" beyond file operations. Instead of repeatedly grepping for code, agents can query semantic knowledge:

- **"Where should X go?"** → Answers based on similar code patterns
- **"What does function Y do?"** → Semantic purpose, not just syntax
- **"Is Z used anywhere?"** → Via negativa opportunities (dead code detection)

**Phase 1 Capabilities:**
- ✅ Semantic understanding of functions
- ✅ Call graph analysis (who calls whom)
- ✅ Natural language query interface
- ✅ Automated post-commit extraction

**Future Phases (not yet implemented):**
- ❌ Historical context (decision rationale)
- ❌ Pattern recognition (reusable solutions)
- ❌ Impact analysis (what breaks if X changes)
- ❌ Self-maintaining knowledge

---

## Quick Start

### 1. Enable the Knowledge System

```bash
npm run knowledge:enable
```

This creates `state/knowledge/.enabled` flag.

### 2. Build the Project

```bash
cd tools/wvo_mcp && npm run build && cd ../..
```

### 3. Extract Knowledge from Current Codebase

```bash
npm run knowledge:extract
```

This analyzes all staged files and populates the knowledge graph.

### 4. Query Knowledge

From agent code:

```typescript
import { KnowledgeStorage, KnowledgeQuery } from '../intelligence/index.js';

const storage = new KnowledgeStorage(workspaceRoot);
await storage.initialize();

const query = new KnowledgeQuery(storage);

const result = await query.query('Where should LOC enforcement code go?');

if (result.success) {
  console.log(result.answer);
  console.log('Evidence:', result.evidence);
} else if (result.fallback) {
  // Knowledge incomplete, fall back to traditional file search
  console.log('Fallback needed:', result.error);
}

storage.close();
```

---

## How It Works

### Automated Extraction (Post-Commit)

After every commit, `scripts/extract_knowledge.mjs` runs automatically:

1. **Detects staged files** that were committed
2. **Parses TypeScript/JavaScript** to find functions
3. **Generates semantic descriptions** (heuristics-based in Phase 1)
4. **Builds call graph** (who calls whom)
5. **Stores in SQLite** (`state/knowledge/knowledge_graph.db`)
6. **Logs metrics** (`state/analytics/knowledge_extraction.jsonl`)

**Non-blocking:** If extraction fails, commit still succeeds.

### Knowledge Storage

SQLite database with five tables:

```sql
-- Functions table
CREATE TABLE functions (
  id TEXT PRIMARY KEY,           -- "file/path.ts:functionName"
  file_path TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,         -- Semantic description
  confidence REAL NOT NULL,      -- 0-1 confidence score
  complexity INTEGER NOT NULL,   -- Cyclomatic complexity
  coverage REAL NOT NULL,        -- Test coverage %
  last_updated TEXT NOT NULL,
  git_sha TEXT NOT NULL
);

-- Call graph table
CREATE TABLE call_graph (
  from_id TEXT NOT NULL,         -- Caller
  to_id TEXT NOT NULL,           -- Callee
  file_path TEXT NOT NULL,
  line_number INTEGER NOT NULL
);

-- Modules, patterns, decisions (Phase 2+)
```

### Query Classification

Natural language queries are classified by keywords:

| Query Type | Keywords | Example |
|------------|----------|---------|
| **Location** | "where should", "what module", "what file" | "Where should complexity enforcement go?" |
| **Semantic** | "what does", "purpose", "why" | "What does analyzeFileLOC do?" |
| **Usage** | "is...used", "what calls", "who uses" | "Is getFileTypeMultiplier used?" |
| **Pattern** | "what pattern", "how to", "similar to" | "What pattern should I use?" (Phase 3) |

### Graceful Fallback

If knowledge is incomplete (function not found, module unknown), queries return:

```typescript
{
  success: false,
  fallback: true,
  error: "Function not found in knowledge graph",
  confidence: 0
}
```

Agents should fall back to traditional file search (Grep/Glob).

---

## Usage Patterns

### Pattern 1: "Where Should I Put This?"

**Agent workflow:**

```typescript
const result = await query.query(
  'Where should cyclomatic complexity enforcement go?'
);

if (result.success) {
  // result.answer: "Based on similar code, it should go in: tools/wvo_mcp/src/enforcement/"
  // result.evidence: Functions with similar purposes
  const suggestedModule = extractModulePath(result.answer);

  // Agent proceeds autonomously
  await createFile(`${suggestedModule}/complexity_analyzer.ts`);
} else {
  // Fallback: Ask user
  console.log('Knowledge incomplete. Please specify target module.');
}
```

**ROI:** Eliminates "where should X go?" questions → saves ~5 min per task.

### Pattern 2: "What Does This Function Do?"

**Agent workflow:**

```typescript
const result = await query.query('What does analyzeFileLOC do?');

if (result.success) {
  // result.answer: "analyzeFileLOC: Analyzes file LOC and applies context-aware limits\n\nLocation: tools/wvo_mcp/src/enforcement/loc_analyzer.ts\nComplexity: 5\nCoverage: 85%"

  // Agent understands semantic purpose, not just signature
  const understanding = parseSemanticPurpose(result.answer);

  // Agent can now make informed decisions
  if (understanding.purpose.includes('context-aware')) {
    console.log('This uses context-aware pattern, I should too');
  }
}
```

**ROI:** Semantic understanding enables pattern reuse → faster implementation.

### Pattern 3: "Can I Delete This?" (Via Negativa)

**Agent workflow:**

```typescript
const result = await query.query('Is oldHelperFunction used?');

if (result.success && result.answer.includes('NOT used')) {
  // result.answer: "oldHelperFunction is NOT used by any other functions.\n\n⚠️ Via negativa opportunity: This function may be safe to delete."

  // Agent can propose deletion autonomously
  console.log('Detected dead code, proposing deletion in PR');
  await git.rm('path/to/old_helper.ts');
}
```

**ROI:** Automated via negativa detection → continuous complexity reduction.

---

## Success Metrics (Phase 1)

Track in `state/analytics/knowledge_queries.jsonl`:

```json
{
  "timestamp": "2025-11-05T12:34:56Z",
  "query": "Where should X go?",
  "answered": true,
  "fallback": false,
  "latencyMs": 45,
  "taskId": "AFP-EXAMPLE-123"
}
```

**Target metrics (4-week measurement):**
- **Query success rate:** >70% (answered without fallback)
- **Guidance reduction:** 50% fewer "where should X go" questions
- **Task velocity:** 20% faster task completion
- **Extraction reliability:** >95% of commits processed successfully

**Phase 2 decision:** Only proceed if Phase 1 shows >70% success rate AND measurable velocity improvement.

---

## Operational Notes

### Enable/Disable

```bash
# Enable (creates .enabled flag)
npm run knowledge:enable

# Disable (removes .enabled flag, stops post-commit extraction)
npm run knowledge:disable

# Check status
ls state/knowledge/.enabled
```

### Manual Extraction

```bash
# Extract from current commit
npm run knowledge:extract

# Check statistics
cd tools/wvo_mcp
npx tsx scripts/knowledge_stats.ts
cd ../..
```

### Database Management

```bash
# View database
sqlite3 state/knowledge/knowledge_graph.db

# Get statistics
SELECT COUNT(*) FROM functions;
SELECT COUNT(*) FROM call_graph;

# Find most complex functions
SELECT name, file_path, complexity FROM functions
ORDER BY complexity DESC LIMIT 10;

# Find unused functions (via negativa candidates)
SELECT f.name, f.file_path
FROM functions f
LEFT JOIN call_graph c ON f.id = c.to_id
WHERE c.to_id IS NULL;
```

### Troubleshooting

**Extraction fails silently:**
- Check logs: `tail -n 20 state/analytics/knowledge_extraction.jsonl`
- Verify build: `cd tools/wvo_mcp && npm run build`
- Manual extraction: `npm run knowledge:extract`

**Queries return fallback:**
- Check database: `sqlite3 state/knowledge/knowledge_graph.db "SELECT COUNT(*) FROM functions"`
- If empty, run: `npm run knowledge:extract`
- Knowledge builds incrementally over time

**Performance issues:**
- Check database size: `du -h state/knowledge/knowledge_graph.db`
- If >100MB, consider pruning old entries
- Query latency target: <100ms

---

## Architecture

### Module Structure

```
tools/wvo_mcp/src/intelligence/
├── knowledge_types.ts      # Type definitions
├── knowledge_storage.ts    # SQLite persistence
├── knowledge_extractor.ts  # Code analysis
├── knowledge_query.ts      # Natural language interface
└── index.ts                # Exports

scripts/
└── extract_knowledge.mjs   # Post-commit hook

state/knowledge/
├── knowledge_graph.db      # SQLite database
└── .enabled                # Enable flag
```

### Data Flow

```
Commit → Post-commit hook → Extractor → Parser → Semantic analysis
                                                      ↓
                                               SQLite storage
                                                      ↓
                         Query interface ← Agents query knowledge
                                ↓
                          Answer + Evidence (or fallback)
```

### Extension Points (Phase 2+)

**Historical context:**
- Parse `design.md` files for decision rationale
- Link decisions to code locations
- Enable "why was this designed this way?" queries

**Pattern recognition:**
- Track successful implementation patterns
- Measure pattern fitness (usage count, bug rate)
- Enable "what pattern should I use?" queries

**Impact analysis:**
- Build reverse dependency graph
- Predict change ripple effects
- Enable "what breaks if I change X?" queries

---

## Testing

Comprehensive tests in `__tests__/` cover all 7 dimensions:

```bash
cd tools/wvo_mcp
npm test -- intelligence

# Run specific test file
npm test -- knowledge_query.test.ts

# Coverage report
npm run test:coverage
```

**Test dimensions:**
1. ✅ Functional correctness (extraction, queries work)
2. ✅ Error handling (graceful degradation)
3. ✅ Edge cases (empty files, malformed code, nested functions)
4. ✅ Integration (storage, call graph)
5. ✅ Performance (extraction <1s, queries <100ms)
6. ✅ Resilience (database errors, git failures)
7. ✅ Real-world usage (actual code patterns)

---

## Limitations (Phase 1)

**Known limitations:**
- **Heuristic semantic analysis:** Uses pattern matching, not LLM (Phase 1 simplification)
- **Limited to TypeScript/JavaScript:** Other languages not supported yet
- **No cross-file type resolution:** Call graph edges don't resolve imports
- **No coverage data:** Placeholder (would integrate with test runner)
- **No historical context:** Decision rationale not captured (Phase 2)
- **No pattern recognition:** "What pattern should I use?" not implemented (Phase 3)

**Workarounds:**
- LLM semantic analysis can be added in Phase 1.5 if heuristics prove insufficient
- Cross-language support deferred to Phase 4
- Coverage integration deferred to Phase 2

---

## Security Considerations

**Data privacy:**
- Knowledge database stays local (`state/knowledge/` in .gitignore)
- No external API calls in Phase 1
- Semantic analysis is heuristic-based (no code sent to LLM)

**Performance impact:**
- Post-commit extraction adds ~1s per commit
- Query latency <100ms (local SQLite)
- Database size: ~1MB per 1000 functions (manageable)

**Failure modes:**
- Extraction failure → commit still succeeds (non-blocking)
- Query failure → agent falls back to file search (graceful degradation)
- Database corruption → rebuild from commits (extraction is repeatable)

---

## Migration Notes

**For existing codebases:**

1. Enable system: `npm run knowledge:enable`
2. Initial extraction: `npm run knowledge:extract` (may take 1-2 min)
3. Validate: Check `state/knowledge/knowledge_graph.db` has entries
4. Monitor: Track metrics for 4 weeks before Phase 2 decision

**Rollback:**

```bash
npm run knowledge:disable
rm -rf state/knowledge/
```

Agents automatically fall back to traditional file search.

---

## Frequently Asked Questions

**Q: Why SQLite instead of in-memory?**
A: Persistence across sessions. Knowledge accumulates over time, agents learn from past commits.

**Q: Why not use an LLM for semantic analysis?**
A: Phase 1 uses heuristics for speed/simplicity. LLM integration is Phase 1.5 if needed.

**Q: What if queries return wrong answers?**
A: Agents should validate with file reads. Knowledge is a hint, not truth. Log bad queries for improvement.

**Q: How much disk space does this use?**
A: ~1MB per 1000 functions. For 50k LOC codebase, expect ~50MB total.

**Q: Can I query from outside the codebase?**
A: Not in Phase 1. Would require API server (deferred to Phase 4).

---

## Further Reading

- `state/evidence/AFP-AGENT-INTELLIGENCE-20251105/meta_analysis.md` - Deep analysis of agent intelligence requirements
- `state/evidence/AFP-AGENT-INTELLIGENCE-20251105/intelligence_usage.md` - How to leverage intelligence for AFP/SCAS work
- `state/evidence/AFP-AGENT-INTELLIGENCE-20251105/design.md` - Implementation design with AFP/SCAS analysis

---

**Last Updated:** 2025-11-05
**Phase:** 1 of 5
**Status:** Production-ready (pending verification loop)
