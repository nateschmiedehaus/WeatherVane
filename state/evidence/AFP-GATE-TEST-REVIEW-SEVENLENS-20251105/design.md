# Design: AFP-GATE-TEST-REVIEW-SEVENLENS-20251105

> **Purpose:** Review seven_lens_evaluator.ts for AFP/SCAS alignment
> **Parent:** AFP-GATE-TEST-MACRO-20251105 (GATE Testing Campaign)
> **Complexity:** Simple (first empirical test)

---

## Context

**What problem are you solving and WHY?**

**Problem:** `tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts` has hardcoded business logic that's difficult to tune and maintain.

**Specific Issues:**

1. **Hardcoded Keywords (lines 114-120, repeated in other lenses)**
   ```typescript
   const pocValidationKeywords = [
     'poc', 'proof of concept', 'validate model', 'model validation',
     // ... 16 more hardcoded strings
   ];
   ```
   - Keywords define task prioritization but are embedded in source code
   - No way to update without code change + recompile + redeploy
   - Typos in task titles cause silentscoring failures
   - Domain-specific jargon requires code changes

2. **No Decision Persistence (line 66 - evaluateTask())**
   - Evaluates task fresh every time (no caching)
   - If task evaluated twice, scores could differ (non-deterministic)
   - No audit trail of WHY a task was prioritized
   - Wastes computation re-scoring same task

3. **Missing Validation (line 66 - context parameter)**
   ```typescript
   evaluateTask(task: Task, context?: any): TwelveLensReport
   ```
   - `context` is `any` type - could pass malformed data
   - No validation of task fields before evaluation
   - Lens evaluations use optional chaining without null checks

**Root Cause:** Configuration embedded in code (violates "configuration > code" principle)

**Impact:**
- Operations team can't tune scoring without engineering involvement
- A/B testing keywords requires code branches
- Debugging historical decisions is impossible
- Production hotfixes require full deployment cycle

**Why this matters for GATE testing:**
- Tests AFP principle: configuration should be external to code
- Simple enough to complete in one session
- Clear alternatives for evaluation
- Measurable outcome (keywords external, caching works, types safe)

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

**Files examined:**

1. **tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts** (784 LOC)
   - Lines 114-120: pocValidationKeywords (20 LOC)
   - Lines 127-128: negativeCaseKeywords (embedded)
   - Lines 134-135: e2eKeywords (embedded)
   - Lines 144: revenueKeywords (embedded)
   - Lines 156: blockingKeywords (embedded)
   - **Similar patterns in all 12 lens methods** (estimated 150+ LOC of hardcoded arrays)

   **Can we DELETE?** Not entirely, but we can EXTRACT to configuration and reduce code volume.

2. **Existing configuration files:**
   - `tools/wvo_mcp/config/` directory exists (empty)
   - No keyword configuration currently

   **Opportunity:** Use existing infrastructure, don't create new

**Via Negativa Opportunities:**

### Opportunity 1: DELETE Duplicate Keyword Logic
**Current state:** Each lens method has similar keyword checking pattern:
```typescript
const keywords = ['a', 'b', 'c'];
const matches = keywords.some(kw => text.includes(kw));
```

**Via negativa:** Extract to `matchesKeywords(text, keywordGroup)` utility
- DELETE 12 repeated implementations
- ADD 1 shared function
- **Net:** ~-50 LOC (estimated)

### Opportunity 2: DELETE Hardcoded Arrays from Source
**Current:** 150+ LOC of keyword arrays embedded in methods

**Via negativa:** Move to `config/lens_keywords.json`
- DELETE all hardcoded arrays
- ADD config file + loader (~30 LOC)
- **Net:** ~-120 LOC

### Opportunity 3: SIMPLIFY Context Type
**Current:** `context?: any` accepts anything

**Via negativa:** Define minimal required interface
- Don't accept everything (any)
- Only accept what we actually use
- **Net:** ~0 LOC (type definition, no runtime code)

**Why deletion/simplification insufficient:**

We still need keywords for scoring logic. But we can:
- **DELETE** from source code
- **MOVE** to configuration
- **REDUCE** code complexity

**Net effect of via negativa approach:** -120 LOC from source, +30 LOC for loader = **-90 net LOC**

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

**This is REFACTOR (fixing root cause).**

**Root cause:** Business logic (keywords) embedded in application code

**Why it's a refactor, not a patch:**

1. **Addresses architectural issue:**
   - Moves configuration to proper layer
   - Separates concerns (logic vs data)
   - Enables runtime reconfiguration

2. **Not adding workarounds:**
   - Not wrapping hardcoded arrays with abstraction
   - Not adding flags to switch between hard coded sets
   - Actually relocating the data

3. **Enables future simplification:**
   - Operations can tune without deployments
   - A/B testing becomes trivial
   - Domain experts can update keywords directly

**What technical debt does this create?**

**None - this REDUCES technical debt:**
- Removes configuration from code
- Adds validation layer
- Improves maintainability
- Standard configuration pattern (JSON files in config/)

**What technical debt does this REMOVE?**

- Hardcoded business logic
- Deploy cycle for configuration changes
- Inability to A/B test scoring
- No audit trail for decisions

---

## Alternatives Considered

### Alternative 1: Configuration File Only (Minimal - RECOMMENDED)

**What:**
- Extract keywords to `tools/wvo_mcp/config/lens_keywords.json`
- Load at initialization, cache in memory
- Add basic validation (keywords are strings)
- Skip caching and context typing for now

**Approach:**
```typescript
// config/lens_keywords.json
{
  "ceo": {
    "pocValidation": ["poc", "proof of concept", ...],
    "negativeCase": ["negative", "random", ...],
    "e2e": ["end-to-end", "e2e", ...],
    "revenue": ["demo", "customer", ...]
  },
  // ... other lenses
}

// Load in constructor
constructor() {
  this.keywords = loadKeywordConfig();
}
```

**Pros:**
- Simplest approach (~2 hours implementation)
- Addresses primary issue (hardcoded keywords)
- Net deletion (-90 LOC estimated)
- Easy to roll back if issues
- Operational team can update immediately

**Cons:**
- Doesn't add caching (performance unchanged)
- Doesn't improve type safety (context still `any`)
- Partial solution only

**LOC estimate:** +30 (config + loader) -120 (removed hardcoded) = **-90 net LOC** ✅

**Why selected:** Follows via negativa (net deletion), addresses root cause, enables operational flexibility

### Alternative 2: Full Refactor (All 3 Improvements)

**What:**
- Extract keywords to configuration ✅
- Add decision caching with audit trail
- Define LensContext interface
- Add validation layer

**Approach:**
```typescript
interface LensContext {
  roadmap?: {
    recentCommits?: string[];
    tasks?: Task[];
  };
  evaluationCache?: Map<string, TwelveLensReport>;
}

class TaskEvaluationCache {
  private cache = new Map<string, {result: TwelveLensReport, timestamp: number}>();

  get(task: Task, contextHash: string): TwelveLensReport | null {
    const key = `${task.id}:${contextHash}`;
    const entry = this.cache.get(key);
    if (entry && (Date.now() - entry.timestamp) < TTL) {
      return entry.result;
    }
    return null;
  }
}
```

**Pros:**
- Most comprehensive solution
- Addresses all 3 issues
- Improves performance (caching)
- Improves reliability (validation)
- Adds audit trail

**Cons:**
- More complex (~4-5 hours)
- **+175 net LOC** (approaches micro-batching limit)
- More testing required
- Harder to roll back

**LOC estimate:** +30 (config) -120 (removed) +100 (cache) +40 (validation) +25 (types) = **+75 net LOC**

**Why not selected:** Exceeds scope for "simple" GATE test, adds complexity without proving keywords fix first

### Alternative 3: Two-Phase Approach

**What:**
- **Phase 1 (this task):** Extract keywords + minimal validation
- **Phase 2 (future task):** Add caching + full context typing

**Rationale:** Prove configuration extraction works before adding caching complexity

**Phase 1 LOC:** -90 net LOC
**Phase 2 LOC:** +100 net LOC (if needed)

**Pros:**
- Splits risk across two batches
- Can validate Phase 1 before committing to Phase 2
- Each phase under micro-batching limit
- Iterative approach (SCAS principle)

**Cons:**
- Two GATE reviews instead of one
- Phase 2 might not be needed (premature optimization)

**Why not selected:** Phase 2 value unclear until Phase 1 proves valuable. Do Phase 1, measure, then decide.

---

## Selected Approach: Alternative 1 (Configuration File Only)

**Rationale:**

1. **Via Negativa:** Net -90 LOC (actual deletion!)
2. **Addresses Root Cause:** Configuration extracted from code
3. **Enables Operations:** Non-engineers can tune keywords
4. **Simple:** 2-3 hours, easy to test
5. **Reversible:** Can roll back if issues
6. **GATE Testing Value:** Tests whether DesignReviewer recognizes/rewards net deletion

**How it aligns with AFP/SCAS:**
- **Via Negativa:** DELETE hardcoded arrays, net -90 LOC
- **Refactor not Repair:** Fixes architectural issue (config in code)
- **Simple Modules:** Separates concerns (data vs logic)
- **High Feedback Density:** Can tune keywords in minutes, not days

---

## Complexity Analysis

**How does this change affect complexity?**

### Complexity Decreases ✅

**Code Complexity:**
- BEFORE: 150+ LOC of hardcoded keyword arrays scattered across file
- AFTER: 30 LOC config loader + single JSON file
- **Net reduction:** -120 LOC in source code

**Cognitive Complexity:**
- BEFORE: "To change keywords, edit source code, find right lens method, update array, test, deploy"
- AFTER: "Edit config/lens_keywords.json, restart server"

**Maintenance Complexity:**
- BEFORE: Engineer + deployment cycle for keyword changes
- AFTER: Operations team + file edit

### Complexity Increases (Minimal)

**Configuration Management:**
- BEFORE: All keywords in one file (TypeScript source)
- AFTER: Keywords in separate JSON file (need to know it exists)

**Is this justified?** YES

**Reasoning:**
- Industry standard pattern (config files for business logic)
- Enables non-engineers to tune scoring
- Reduces deployment frequency
- Enables A/B testing without code branches

**Mitigation:**
- Document config file location in README
- Add JSON schema for validation
- Include config file in deployment checklist

### Trade-offs

**Necessary complexity:**
- Config file loader (~30 LOC)
- Config file itself (~80 lines JSON)
- Documentation updates

**Unnecessary complexity avoided:**
- No caching layer (not needed yet)
- No complex validation (keep simple)
- No runtime reconfiguration (restart is fine)

**Net effect:** Significant complexity reduction (-90 net LOC, easier to maintain)

---

## Implementation Plan

### Scope

**Files to change:**
1. `tools/wvo_mcp/config/lens_keywords.json` - NEW (config file, ~80 lines)
2. `tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts` - MODIFY (~-120 +50 LOC)

**Estimated LOC:** +80 (config) +50 (loader) -120 (removed hardcoded) = **+10 net LOC**

Wait, let me recalculate:
- Config file: +80 LOC (JSON)
- Loader code: +30 LOC
- Removed hardcoded arrays: -120 LOC
- **Net: -10 LOC** ✅ (via negativa achieved!)

**Micro-batching compliance:** ✅ 2 files, -10 net LOC (under all limits)

### Implementation Steps

**Step 1: Create Configuration File**
```bash
# Create config directory if needed
mkdir -p tools/wvo_mcp/config

# Create lens_keywords.json
cat > tools/wvo_mcp/config/lens_keywords.json << 'EOF'
{
  "version": "1.0.0",
  "updated": "2025-11-05",
  "lenses": {
    "ceo": {
      "pocValidation": ["poc", "proof of concept", "validate model", ...],
      "negativeCase": ["negative", "random", "control", "placebo"],
      "e2e": ["end-to-end", "e2e", "full simulation"],
      "revenue": ["demo", "customer", "pilot", "revenue"]
    },
    // ... extract all keyword arrays from source
  }
}
EOF
```

**Step 2: Add Config Loader**
```typescript
// Add to seven_lens_evaluator.ts
import fs from 'node:fs';
import path from 'node:path';

interface KeywordConfig {
  version: string;
  updated: string;
  lenses: Record<string, Record<string, string[]>>;
}

// In class
private keywords: KeywordConfig;

constructor() {
  this.keywords = this.loadKeywordConfig();
}

private loadKeywordConfig(): KeywordConfig {
  const configPath = path.join(__dirname, '..', '..', 'config', 'lens_keywords.json');
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logWarning('Failed to load keyword config, using defaults', { error });
    return this.getDefaultKeywords(); // Fallback
  }
}
```

**Step 3: Update Lens Methods**
```typescript
// BEFORE:
const pocValidationKeywords = [
  'poc', 'proof of concept', ...
];
const isPoCValidation = pocValidationKeywords.some(kw => text.includes(kw));

// AFTER:
const isPoCValidation = this.matchesKeywords(text, 'ceo', 'pocValidation');

// Add helper method:
private matchesKeywords(text: string, lens: string, group: string): boolean {
  const keywords = this.keywords.lenses[lens]?.[group] || [];
  return keywords.some(kw => text.includes(kw));
}
```

**Step 4: Remove Hardcoded Arrays**
- Delete all keyword array definitions
- Replace with `this.matchesKeywords()` calls
- Verify all lenses updated

**Step 5: Add Tests**
```typescript
// Test config loading
test('loads keyword configuration', () => {
  const evaluator = new SevenLensEvaluator();
  expect(evaluator['keywords'].version).toBeDefined();
});

// Test keyword matching
test('matches POC validation keywords', () => {
  const evaluator = new SevenLensEvaluator();
  const task = { id: 'T1', title: 'poc validation test', status: 'pending' };
  const result = evaluator.evaluateTask(task);
  expect(result.lenses.find(l => l.lens === 'CEO')?.score).toBeGreaterThan(50);
});
```

### Risk Analysis

**Edge Cases:**
1. Config file missing
   - **Mitigation:** Fallback to hardcoded defaults in `getDefaultKeywords()`

2. Config file malformed JSON
   - **Mitigation:** try-catch with fallback + error logging

3. Keywords arrays empty
   - **Mitigation:** Validate config has required groups on load

4. Typo in lens/group name
   - **Mitigation:** Return empty array (safe default), log warning

**Failure Modes:**
1. Config file not deployed
   - **Prevention:** Add to deployment checklist
   - **Detection:** Integration test verifies config loads

2. Keyword changes break scoring
   - **Prevention:** Test suite covers keyword matching
   - **Detection:** Smoke tests after config change

3. Performance regression
   - **Prevention:** Benchmark before/after
   - **Detection:** Monitor evaluation latency

**Testing Strategy:**
1. **Unit tests:** Config loading, keyword matching, fallback behavior
2. **Integration tests:** Full task evaluation with config file
3. **Manual test:** Edit config, restart, verify scoring changes
4. **Performance test:** Ensure no regression (should be faster, less code)

### Assumptions

1. **Assumption:** Config file can be deployed separately from code
   - **If wrong:** Include config in npm package

2. **Assumption:** Restart is acceptable for config changes
   - **If wrong:** Add file watcher for hot reload (future enhancement)

3. **Assumption:** JSON is sufficient format
   - **If wrong:** Switch to YAML or TOML (trivial change)

4. **Assumption:** Keywords are sufficient for scoring
   - **If wrong:** Add numeric weights in config (future enhancement)

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [x] I explored deletion/simplification (via negativa)
  - **Net -10 LOC** (config is +80, but source is -120, loader is +30)

- [x] If adding code, I explained why deletion won't work
  - Keywords are necessary for scoring logic
  - But we DELETE them from source code, MOVE to configuration

- [x] If modifying large files/functions, I considered full refactoring
  - Could do caching + validation too (Alternative 2)
  - Chose minimal fix first (Alternative 1) to prove value

- [x] I documented 2-3 alternative approaches
  - Alternative 1: Config only (selected)
  - Alternative 2: Full refactor (too complex for "simple" test)
  - Alternative 3: Two-phase (premature, might not need Phase 2)

- [x] Any complexity increases are justified and mitigated
  - Configuration management is industry standard
  - Reduces overall complexity (-10 net LOC)
  - Makes maintenance easier for operations

- [x] I estimated scope (files, LOC) and it's within limits
  - 2 files, -10 net LOC ✅ (well under +150 limit)

- [x] I thought through edge cases and failure modes
  - 4 edge cases with mitigations
  - 3 failure modes with prevention/detection
  - Testing strategy covers all scenarios

- [x] I have a testing strategy
  - Unit tests for config loading
  - Integration tests for evaluation
  - Manual testing for config changes
  - Performance benchmarks

---

## Notes

**This task is perfect for GATE testing:**

1. **Via Negativa Test:** Net -10 LOC proves DesignReviewer rewards deletion
2. **Simple Scope:** Can complete in 2-3 hours
3. **Clear Alternatives:** 3 approaches with trade-offs
4. **Measurable:** Config external, keywords work, tests pass
5. **Real Value:** Operations team can now tune scoring

**Expected GATE behavior:**
- Should APPROVE (thorough analysis, net deletion, clear justification)
- If blocks: Likely wants more detail on config file structure or testing

**Meta-observation:** This is first task in empirical campaign. How long GATE takes matters for usability metrics.

---

**Design Date:** 2025-11-05
**Author:** Claude (Sonnet 4.5)
**Estimated Implementation Time:** 2-3 hours
**Estimated GATE Time:** 30-45 minutes (design.md creation + review)

---

## GATE Review Tracking

### Review 1: 2025-11-05 15:36 UTC
- **DesignReviewer Result:** ✅ **APPROVED** (first try!)
- **Time Spent:** ~36 minutes total (30 min design + 6 min review/analysis)
- **Concerns:** 1 high-severity (fake_file_references)
  - File `tools/wvo_mcp/config/lens_keywords.json` doesn't exist
  - **Note:** This is correct - we're planning to CREATE this file
  - False positive: DesignReviewer doesn't distinguish "to be created" vs "missing"
- **Strengths:** 6 identified
  - Via negativa consideration ✅
  - Refactoring approach ✅
  - 13+ alternatives explored ✅
  - Complexity analysis ✅
  - Scope estimation ✅
  - Risk/edge case consideration ✅

**Outcome:** GATE passed on first attempt!

**Key Finding:** Via negativa analysis revealed net -10 LOC opportunity that wasn't obvious before thorough analysis.

**Next:** Proceed with implementation as designed (Alternative 1: Config file only)
