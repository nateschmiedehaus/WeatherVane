# Specification: Quick Wins for Gaming Detection

**Task ID:** AFP-GAMING-DETECT-P1-QUICK-20251113
**Date:** 2025-11-13
**Phase:** SPEC (Phase 2 of 10)

## Executive Summary

This spec defines EXACTLY what will be improved in detect_gaming.mjs to reduce bypass rate from 80% to 50-60% and eliminate 25% false positive rate.

**Two improvements:**
1. Expand TODO detection patterns (+15 patterns)
2. Add context awareness to GS013 (function body analysis)

**Files Modified:**
- `tools/wvo_mcp/scripts/detect_gaming.mjs` (~35 net LOC added)

**Expected Outcome:**
- Bypass rate: 80% → 50-60%
- False positive rate: 25% → <5%

---

## Improvement #1: Expand TODO Detection Patterns

### Current State

**Existing regex in `detectTodoMarkers()`:**
```javascript
const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB)\b/i;
```

**Coverage:** Catches 9 explicit marker keywords

**Bypass examples from adversarial testing:**
```typescript
// Will enhance this with proper GOL algorithm later
// Basic version for now - just return empty grid
// Coming soon: full implementation
// Finish implementation when specs are clear
// Note: This is a simplified version
```

### Proposed Addition: Synonym Keywords (5 patterns)

Add to existing regex:
```javascript
const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB|FUTURE|PENDING|WIP|NOTE|REMINDER)\b/i;
```

**New keywords:**
1. `FUTURE` - "future work", "future enhancement"
2. `PENDING` - "pending implementation", "pending review"
3. `WIP` - "work in progress", "WIP implementation"
4. `NOTE` - "note: finish this", "note to self"
5. `REMINDER` - "reminder: complete later"

**Expected catch rate:** +15-20% of bypasses use these synonyms

### Proposed Addition: Phrase Patterns (10 patterns)

Create new function `detectTodoVariations()` with phrase matching:

```javascript
function detectTodoVariations({ files, repoRoot }) {
  const phrases = [
    /will\s+(enhance|improve|complete|finish|implement)\s+(later|soon|this)/i,
    /basic\s+version\s+(for\s+now|only)/i,
    /coming\s+soon/i,
    /finish\s+(later|implementation|this)/i,
    /implement\s+(properly|later|eventually)/i,
    /for\s+now\s*,?\s*(just|only|simply)/i,
    /simplified\s+version/i,
    /temporary\s+(solution|implementation|code)/i,
    /quick\s+(hack|fix)\s+for\s+now/i,
    /need\s+to\s+(finish|complete|implement)\s+this/i
  ];

  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const phrase of phrases) {
        if (phrase.test(line)) {
          violations.push({
            strategy: 'GS002',
            severity: 'CRITICAL',
            file,
            line: index + 1,
            content: line.trim(),
            message: 'Deceptive incomplete implementation marker found'
          });
          break; // One violation per line
        }
      }
    });
  }

  return violations;
}
```

**New phrases detected:**
1. "will enhance/improve/complete/finish/implement later/soon"
2. "basic version for now/only"
3. "coming soon"
4. "finish later/implementation/this"
5. "implement properly/later/eventually"
6. "for now, just/only/simply"
7. "simplified version"
8. "temporary solution/implementation/code"
9. "quick hack/fix for now"
10. "need to finish/complete/implement this"

**Expected catch rate:** +20-25% of bypasses use these phrases

**Combined TODO improvement:** +35-45% bypass detection increase

---

## Improvement #2: Context-Aware GS013 Detection

### Current State

**Existing logic in `detectNullReturns()`:**
```javascript
function detectNullReturns({ files, repoRoot }) {
  const violations = [];

  // Simplified - actually uses regex to find functions
  for (const file of files) {
    const functions = extractFunctions(file); // AST or regex

    for (const func of functions) {
      if (func.body.includes('return null') ||
          func.body.includes('return []') ||
          func.body.includes('return {}')) {
        violations.push({
          strategy: 'GS013',
          file,
          message: 'Null object pattern detected'
        });
      }
    }
  }

  return violations;
}
```

**Problem:** Flags ALL null returns, even legitimate ones

**False positive examples:**
```typescript
// LEGITIMATE CODE - Should NOT be flagged:

// Example 1: Guard clause with logic below
function findUser(id: string): User | null {
  if (!id) return null; // ← Currently flagged (FALSE POSITIVE)

  const user = database.query(id);
  return user || null;
}

// Example 2: Error handling with logic below
function parseConfig(path: string): Config | null {
  if (!fs.existsSync(path)) return null; // ← Currently flagged (FALSE POSITIVE)

  const content = fs.readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// GAMING CODE - SHOULD be flagged:

// Example 3: No-op stub (only return, no other logic)
function calculateNeighbors(row: number, col: number): number {
  return 0; // ← Should be flagged (TRUE POSITIVE)
}
```

### Proposed Solution: Function Body Analysis

**New logic:**
```javascript
function detectNullReturns({ files, repoRoot }) {
  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const functions = extractFunctions(content);

    for (const func of functions) {
      // Check if function returns null/empty
      if (!hasNullReturn(func.body)) continue;

      // NEW: Analyze function body for other logic
      const bodyLines = func.body
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => !line.startsWith('//'))     // Remove comments
        .filter(line => !line.startsWith('/*'))     // Remove block comments
        .filter(line => line !== '{' && line !== '}'); // Remove braces

      // Count non-return statements
      const nonReturnStatements = bodyLines.filter(line =>
        !line.startsWith('return')
      );

      // Flag ONLY if return is the ONLY logic
      if (nonReturnStatements.length === 0) {
        violations.push({
          strategy: 'GS013',
          severity: 'CRITICAL',
          file,
          line: func.lineNumber,
          functionName: func.name,
          message: 'Function only returns null/empty without any logic (stub implementation)'
        });
      }
      // If there are other statements, this is likely legitimate (guard clause or error handling)
    }
  }

  return violations;
}

// Helper functions
function hasNullReturn(body) {
  return /return\s+(null|undefined|\[\]|\{\}|0|false|"")/i.test(body);
}

function extractFunctions(content) {
  // Use simple regex to extract functions
  // (More sophisticated AST parsing could be added later)
  const functionPattern = /(?:function\s+(\w+)|(?:async\s+)?(\w+)\s*\([^)]*\)\s*:\s*[^{]+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gs;

  const functions = [];
  let match;

  while ((match = functionPattern.exec(content)) !== null) {
    const name = match[1] || match[2] || 'anonymous';
    const body = match[3] || match[4] || '';
    const lineNumber = content.substring(0, match.index).split('\n').length;

    functions.push({ name, body, lineNumber });
  }

  return functions;
}
```

**Key changes:**
1. ✅ Analyze function body for non-return statements
2. ✅ Filter out comments (single-line and block)
3. ✅ Count actual logic statements
4. ✅ Flag ONLY if return is ONLY statement
5. ✅ Allow guard clauses (early return with logic below)

**Expected outcome:**
- False positive rate: 25% → <5%
- Still catches real stubs (return-only functions)
- Legitimate code not flagged

---

## Functional Requirements

### FR1: TODO Keyword Detection (GS001 Enhancement)

**Requirement:** Detect expanded set of incomplete implementation markers

**Acceptance Criteria:**
1. ✅ Catches all 14 keyword patterns (existing 9 + new 5)
2. ✅ Case-insensitive matching
3. ✅ Word boundary detection (no partial matches)
4. ✅ Filters string literals (don't flag TODO in strings)
5. ✅ Returns violation with file, line, content

**Test Cases:**
```javascript
// Should catch:
// FUTURE: Implement this
// PENDING implementation
// WIP code here
// NOTE: finish later
// REMINDER: complete this

// Should NOT catch:
const message = "TODO: buy groceries"; // String literal
const url = "https://future.com"; // Not a marker
```

### FR2: TODO Phrase Detection (GS002 Enhancement)

**Requirement:** Detect deceptive TODO variations using natural language

**Acceptance Criteria:**
1. ✅ Catches 10 phrase patterns
2. ✅ Case-insensitive matching
3. ✅ Handles whitespace variations
4. ✅ Only flags in code/comments (not strings)
5. ✅ Returns violation with detected phrase

**Test Cases:**
```javascript
// Should catch:
// Will enhance this later
// Basic version for now
// Coming soon: full implementation
// Finish implementation when ready
// Implement properly later
// For now, just return empty
// Simplified version only
// Temporary solution here
// Quick hack for now
// Need to complete this

// Should NOT catch:
"Basic version for now" // String literal
```

### FR3: Context-Aware Null Return Detection (GS013 Fix)

**Requirement:** Flag ONLY stub implementations, not legitimate guard clauses

**Acceptance Criteria:**
1. ✅ Detects functions that ONLY return null/empty
2. ✅ Ignores guard clauses (early return with logic below)
3. ✅ Ignores error handling (return with other logic)
4. ✅ Filters comments when analyzing body
5. ✅ Returns function name and line number

**Test Cases:**
```javascript
// SHOULD catch (stub - return only):
function getNeighbors() {
  return [];
}

function calculate() {
  return 0;
}

// Should NOT catch (legitimate - has other logic):
function findUser(id: string) {
  if (!id) return null; // Guard clause
  const user = db.query(id);
  return user || null;
}

function safeParse(json: string) {
  if (!json) return {}; // Error handling
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
```

### FR4: Backwards Compatibility

**Requirement:** Existing detection must continue to work

**Acceptance Criteria:**
1. ✅ Still catches AUTO-GOL-T1 TODO comment
2. ✅ GS001, GS003, GS015 unchanged
3. ✅ All other detectors unaffected
4. ✅ Exit codes same (0, 1, 2)
5. ✅ CLI interface unchanged

**Test Case:**
```bash
# Must still pass:
node tools/wvo_mcp/scripts/detect_gaming.mjs \
  --files state/autopilot/wave0/state/wave0_implementations/AUTO-GOL-T1.ts

# Expected: Exit code 1, "GS001: TODO/FIXME Comments"
```

---

## Non-Functional Requirements

### NFR1: Performance

**Requirement:** Detection speed must stay fast (<100ms for typical commit)

**Current Performance:** 30-40ms average

**Expected After Changes:** 40-60ms average (still well under 100ms limit)

**Why slower:**
- Phrase regex matching adds ~10ms
- Function body analysis adds ~10ms

**Acceptance Criteria:**
1. ✅ Average commit (5-10 files): <100ms
2. ✅ Large commit (50 files): <500ms
3. ✅ No memory leaks
4. ✅ No exponential complexity

**Test:**
```bash
time node tools/wvo_mcp/scripts/detect_gaming.mjs --staged

# Must complete in <100ms for normal commits
```

### NFR2: Maintainability

**Requirement:** Code must be readable and testable

**Acceptance Criteria:**
1. ✅ Clear function names
2. ✅ Well-commented regex patterns
3. ✅ Helper functions extracted
4. ✅ No code duplication
5. ✅ Easy to add new patterns later

**Example:**
```javascript
// Good: Self-documenting
const TODO_KEYWORDS = [
  'TODO', 'FIXME', 'XXX',  // Classic markers
  'FUTURE', 'PENDING', 'WIP',  // Synonym markers
  'NOTE', 'REMINDER'  // Deceptive markers
];

// Good: Extracted helper
function isOnlyReturnStatement(functionBody) {
  const nonReturnStatements = getNonReturnStatements(functionBody);
  return nonReturnStatements.length === 0;
}
```

---

## Success Criteria

### Primary Success Criteria (ALL must pass)

1. ✅ **Bypass Rate Reduced**
   - Before: 80% (12/15 adversarial bypasses successful)
   - After: ≤60% (≤9/15 bypasses successful)
   - Measurement: Re-run adversarial test suite

2. ✅ **False Positives Eliminated**
   - Before: 25% (3/12 GS013 detections wrong)
   - After: <5% (<1/20 detections wrong)
   - Measurement: Scan entire codebase, manually review flags

3. ✅ **Baseline Maintained**
   - AUTO-GOL-T1 still caught
   - All existing tests pass
   - No regressions in other detectors

4. ✅ **Performance Acceptable**
   - Average commit: <100ms
   - Large commit: <500ms
   - No memory issues

5. ✅ **Quality Standards Met**
   - Code is readable and maintainable
   - Functions are well-documented
   - Easy to extend later

### Secondary Success Criteria (nice-to-have)

1. ⭐ Bypass rate <50% (better than minimum 60%)
2. ⭐ False positive rate <2% (better than minimum 5%)
3. ⭐ Performance <50ms (better than minimum 100ms)
4. ⭐ Catches ≥5 new adversarial patterns (better than minimum 3)

---

## Out of Scope

**NOT included in this task:**

1. ❌ Identity operation detection (`count += 0`)
   - Reason: Requires AST parsing, too complex
   - Future: AFP-GAMING-DETECT-P1-IDENTITY-OPS

2. ❌ Test behavioral validation
   - Reason: Requires test framework integration
   - Future: AFP-GAMING-DETECT-P1-TEST-BEHAVIOR

3. ❌ Advanced AST parsing
   - Reason: Adds dependency, higher complexity
   - Current: Simple regex is sufficient

4. ❌ Machine learning detection
   - Reason: Overkill for current problem
   - Maybe: Future exploration

5. ❌ Pre-commit hook integration
   - Reason: Already exists, no changes needed
   - Current: detect_gaming.mjs is drop-in replacement

---

## Dependencies

**No new dependencies required:**
- ✅ Uses built-in Node.js `fs` module
- ✅ Uses built-in regex (no parsing library)
- ✅ Uses existing file structure
- ✅ Drop-in enhancement to existing code

**Files to modify:**
- `tools/wvo_mcp/scripts/detect_gaming.mjs` (~35 LOC added)

**Files to create:**
- Evidence files (this spec, plan, etc.)

---

## Risk Mitigation

### Risk 1: TODO expansion false positives

**Mitigation:**
1. Test against entire codebase before deploying
2. Manually review all new flags
3. Refine regex if >5% false positive rate
4. Can quickly revert if problematic

### Risk 2: GS013 misses gaming

**Mitigation:**
1. Test against adversarial examples first
2. Verify catches "return-only" stubs
3. Add test cases for edge cases
4. Can adjust logic if needed

### Risk 3: Performance regression

**Mitigation:**
1. Benchmark before and after
2. Profile if >100ms average
3. Optimize regex if needed
4. Can disable phrases if too slow (unlikely)

---

## Acceptance Testing Plan

### Test Suite 1: TODO Detection

**Test cases:**
1. ✅ Catches all 14 keywords
2. ✅ Catches all 10 phrases
3. ✅ Ignores string literals
4. ✅ Ignores legitimate code
5. ✅ Catches adversarial examples

**Pass criteria:** ≥90% accuracy on adversarial suite

### Test Suite 2: GS013 Context Awareness

**Test cases:**
1. ✅ Catches return-only stubs
2. ✅ Ignores guard clauses
3. ✅ Ignores error handling
4. ✅ Handles multi-line functions
5. ✅ Handles nested functions

**Pass criteria:** <5% false positive rate on codebase scan

### Test Suite 3: Baseline Validation

**Test cases:**
1. ✅ AUTO-GOL-T1 still caught
2. ✅ All other detectors work
3. ✅ Exit codes correct
4. ✅ CLI works as before

**Pass criteria:** 100% backwards compatibility

### Test Suite 4: Performance

**Test cases:**
1. ✅ Small commit (5 files): <50ms
2. ✅ Medium commit (20 files): <100ms
3. ✅ Large commit (50 files): <500ms
4. ✅ Memory usage <100MB

**Pass criteria:** All tests <100ms average

---

## Deployment Plan

### Phase 1: Implementation
- Modify detect_gaming.mjs
- Add new patterns and logic
- Local testing

### Phase 2: Verification
- Run against AUTO-GOL-T1 (baseline)
- Run against adversarial suite (bypass rate)
- Scan codebase (false positive rate)
- Performance benchmark

### Phase 3: Warning Mode
- Deploy in warning mode (exit code 2)
- Monitor for 1 week
- Collect metrics
- Adjust if needed

### Phase 4: Blocking Mode (Future)
- After P1 tasks complete
- After bypass rate <20%
- After false positive rate <2%
- After 2+ weeks of warning mode data

---

## Conclusion

This spec defines EXACTLY what will be built:

**Improvement #1: TODO Detection**
- Add 5 keyword synonyms
- Add 10 phrase patterns
- Expected: +35-45% bypass detection

**Improvement #2: GS013 Context**
- Analyze function body for non-return statements
- Flag only if return is ONLY logic
- Expected: 25% → <5% false positives

**Expected Outcome:**
- Bypass rate: 80% → 50-60%
- False positive rate: 25% → <5%
- Performance: 30-40ms → 40-60ms
- Code change: ~35 net LOC

**Next Step:** PLAN phase to detail implementation approach.

**Specification Completeness:** ✅ COMPLETE

All requirements, acceptance criteria, and test cases defined. Ready for planning.
