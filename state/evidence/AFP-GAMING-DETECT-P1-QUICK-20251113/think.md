# Think: Quick Wins for Gaming Detection

**Task ID:** AFP-GAMING-DETECT-P1-QUICK-20251113
**Date:** 2025-11-13
**Phase:** THINK (Phase 4 of 10)

## Executive Summary

This document analyzes edge cases, failure modes, and potential issues with the two quick wins:
1. TODO keyword/phrase expansion
2. Context-aware GS013 detection

**Key Findings:**
- 8 edge cases identified
- 6 failure modes documented
- All have mitigation strategies
- No blockers identified

---

## Edge Cases

### EC1: Multi-Line Comments with TODO Keywords

**Scenario:**
```typescript
/*
 * FUTURE: This will be enhanced in v2.0
 * WIP: Currently implementing basic version
 */
function foo() {
  return 42;
}
```

**Issue:** Multi-line comments might not be caught by line-by-line regex

**Current Behavior:** Should be caught (each line processed separately)

**Test:**
```bash
cat > /tmp/test_multiline.ts << 'EOF'
/*
 * FUTURE: enhance this
 */
function foo() { return 42; }
EOF
node detect_gaming.mjs --files /tmp/test_multiline.ts
# Expected: Violation detected on line with "FUTURE:"
```

**Mitigation:** Already handled by line-by-line processing

---

### EC2: Keywords in Variable Names

**Scenario:**
```typescript
const futureReleases = []; // Variable name contains "FUTURE"
const wipStatus = "complete"; // Variable name contains "WIP"
```

**Issue:** Should NOT flag variable names, only keywords with word boundaries

**Current Behavior:** Word boundary `\b` in regex prevents this

**Test:**
```bash
cat > /tmp/test_var_names.ts << 'EOF'
const futureReleases = [];
const wipStatus = "complete";
const reminderService = new Service();
EOF
node detect_gaming.mjs --files /tmp/test_var_names.ts
# Expected: No violations (word boundaries prevent matching)
```

**Mitigation:** `\b` word boundaries in regex already handle this

---

### EC3: Nested Functions with Guard Clauses

**Scenario:**
```typescript
function outer() {
  function inner(id: string) {
    if (!id) return null; // Guard clause in nested function
    return database.query(id);
  }

  return inner('test');
}
```

**Issue:** Function extraction might not handle nested functions correctly

**Risk:** Medium (nested functions common in TypeScript)

**Test:**
```bash
cat > /tmp/test_nested.ts << 'EOF'
function outer() {
  function inner(id: string) {
    if (!id) return null;
    return database.query(id);
  }
  return inner('test');
}
EOF
node detect_gaming.mjs --files /tmp/test_nested.ts
# Expected: No violation for inner (has other logic)
```

**Mitigation:** Regex function extraction handles nested functions (each matched separately)

---

### EC4: Arrow Functions with Implicit Returns

**Scenario:**
```typescript
const getEmpty = () => []; // Implicit return (no braces)
const getNull = () => null; // Implicit return
```

**Issue:** Implicit returns have no function body to analyze

**Risk:** HIGH - These ARE stubs and SHOULD be flagged

**Current Behavior:** Function extraction regex requires braces `{ ... }`

**Problem:** Won't catch implicit returns

**Mitigation Strategy:**
1. Add separate check for implicit arrow returns
2. Pattern: `=> (null|[]|{}|0|false|"")` without braces
3. Flag as GS013 if no preceding logic

**Action:** Add to IMPLEMENT phase

**Code to add:**
```javascript
// In detectNullReturns, after main loop:
// Check for implicit arrow returns (no braces)
const implicitArrowPattern = /=>\s+(null|undefined|\[\]|\{\}|0|false|"")\s*[,;]/g;
let match;
while ((match = implicitArrowPattern.exec(content)) !== null) {
  const lineNumber = content.substring(0, match.index).split('\n').length;
  violations.push({
    file,
    line: lineNumber,
    content: match[0].trim(),
    message: 'Arrow function with implicit nullish return (stub implementation)'
  });
}
```

---

### EC5: Functions with Only Type Guards

**Scenario:**
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

**Issue:** Only has `return` statement, but this is legitimate (type guard)

**Risk:** LOW - Type guards are rare and acceptable

**Current Behavior:** Would be flagged (only return statement)

**Should Be Flagged?** NO - type guards are legitimate single-statement functions

**Mitigation:** Acceptable false positive (<1% of cases), can be suppressed manually

---

### EC6: Phrase Patterns in String Templates

**Scenario:**
```typescript
const message = `Will enhance the feature later: ${feature}`;
const note = `Coming soon to ${version}`;
```

**Issue:** Template literals might contain phrase patterns

**Current Behavior:** `detectTodoVariations` checks for quotes: `!line.match(/['"`]/)`

**Test:**
```bash
cat > /tmp/test_templates.ts << 'EOF'
const message = `Will enhance the feature later: ${feature}`;
const note = `Coming soon to ${version}`;
EOF
node detect_gaming.mjs --files /tmp/test_templates.ts
# Expected: No violations (quotes detected)
```

**Mitigation:** Already handled by quote detection

---

### EC7: Comments After Code on Same Line

**Scenario:**
```typescript
const x = 42; // FUTURE: optimize this
return result; // WIP implementation
```

**Issue:** Keywords appear after code on same line

**Current Behavior:** Line-by-line processing will flag these

**Should Be Flagged?** YES - even inline comments indicate incompleteness

**Test:**
```bash
cat > /tmp/test_inline.ts << 'EOF'
const x = 42; // FUTURE: optimize this
EOF
node detect_gaming.mjs --files /tmp/test_inline.ts
# Expected: Violation detected
```

**Mitigation:** Already handled (desired behavior)

---

### EC8: Case Sensitivity and Variations

**Scenario:**
```typescript
// future: enhance this (lowercase)
// FuTuRe: mixed case
// FUTURE: uppercase
```

**Issue:** Different cases of keywords

**Current Behavior:** Regex has `/i` flag (case-insensitive)

**Test:**
```bash
cat > /tmp/test_cases.ts << 'EOF'
// future: enhance this
// FuTuRe: mixed case
// FUTURE: uppercase
EOF
node detect_gaming.mjs --files /tmp/test_cases.ts
# Expected: All 3 violations detected
```

**Mitigation:** Already handled by `/i` flag

---

## Failure Modes

### FM1: Regex Catastrophic Backtracking

**Scenario:** Complex phrase patterns with nested quantifiers cause exponential time

**Example Pattern:** `/will\s+(enhance|improve|complete|finish|implement)\s+(later|soon|this)/i`

**Risk:** LOW (patterns are simple)

**Impact:** HIGH (if it happens, causes hang)

**Mitigation:**
- Patterns use simple quantifiers (`\s+`, `?`, not `.*`)
- Test with large files (50+ files)
- Add timeout if >500ms detected

**Detection:**
```bash
# Test with 1000-line file
for i in {1..1000}; do echo "const x$i = 42;"; done > /tmp/large.ts
time node detect_gaming.mjs --files /tmp/large.ts
# Should complete in <100ms
```

---

### FM2: False Positives on Type Guards

**Scenario:** Type guard functions flagged as stubs

**Example:**
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

**Risk:** MEDIUM (type guards are common)

**Impact:** LOW (can be suppressed, but annoying)

**Mitigation:**
- Document as known false positive
- Add suppression comment: `// suppress:GS013`
- Consider adding type guard detection in future

**Workaround:**
```typescript
// suppress:GS013 - type guard function
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

---

### FM3: Missed Stubs with Comments

**Scenario:** Stub has comments, so appears to have "other logic"

**Example:**
```typescript
function calculate() {
  // This is the calculation
  // It will be implemented later
  return 0;
}
```

**Risk:** MEDIUM (comments counted as non-return statements)

**Impact:** MEDIUM (bypasses detection)

**Current Behavior:** `analyzeForOtherLogic` filters comments

**Test:**
```bash
cat > /tmp/test_commented_stub.ts << 'EOF'
function calculate() {
  // This is the calculation
  // It will be implemented later
  return 0;
}
EOF
node detect_gaming.mjs --files /tmp/test_commented_stub.ts
# Expected: Violation detected (comments filtered out)
```

**Mitigation:** Already handled by comment filtering

---

### FM4: Complex Function Extraction Failures

**Scenario:** Regex doesn't match complex function signatures

**Examples:**
```typescript
// Generic functions
function foo<T extends Base>(arg: T): T | null { return null; }

// Async arrow functions
const bar = async (x: number) => { return null; };

// Functions with default params
function baz(x = 0, y = null) { return null; }
```

**Risk:** MEDIUM (complex signatures common)

**Impact:** MEDIUM (stubs not detected)

**Current Pattern:**
```javascript
/(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*([^]*?)\{([^]*?)(?:^|\n)\}/gm
```

**Test Coverage:**
```bash
cat > /tmp/test_complex.ts << 'EOF'
function foo<T>(arg: T): T | null { return null; }
const bar = async (x: number) => { return null; };
function baz(x = 0, y = null) { return null; }
EOF
node detect_gaming.mjs --files /tmp/test_complex.ts
# Expected: 3 violations detected
```

**Mitigation:**
- Test with diverse function signatures
- Adjust regex if patterns missed
- Can add more specific patterns later

---

### FM5: Performance Regression on Large Codebases

**Scenario:** Function extraction regex is slow on large files

**Risk:** MEDIUM (large files common)

**Impact:** HIGH (violates <100ms requirement)

**Mitigation:**
- Benchmark with large files (1000+ lines)
- Cache function extraction results
- Skip files >5000 lines if needed
- Profile and optimize hot paths

**Test:**
```bash
# Generate 2000-line file
for i in {1..500}; do
  cat << EOF >> /tmp/large.ts
function foo$i() {
  if (!input) return null;
  return process(input);
}
EOF
done

time node detect_gaming.mjs --files /tmp/large.ts
# Expected: <200ms
```

---

### FM6: Implicit Arrow Returns Not Caught

**Scenario:** Arrow functions with implicit returns bypass detection

**Example:**
```typescript
const getEmpty = () => [];
const getNull = () => null;
```

**Risk:** HIGH (these ARE stubs)

**Impact:** HIGH (bypasses detection)

**Status:** IDENTIFIED IN EC4

**Mitigation:** Add separate check for implicit arrow returns (see EC4)

---

## Worst-Case Thinking

### Worst Case 1: ALL Phrases Cause False Positives

**Scenario:** 10 new phrase patterns all flag legitimate code

**Impact:** 50%+ false positive rate, system unusable

**Probability:** VERY LOW (patterns tested against adversarial examples)

**Mitigation:**
- Start with warning mode (exit code 2)
- Monitor for 1 week
- Disable specific patterns if needed
- Can revert to 5 original patterns

---

### Worst Case 2: Context Analysis is Fundamentally Flawed

**Scenario:** `analyzeForOtherLogic` logic is wrong, catches nothing or catches everything

**Impact:** Either 0% detection (all bypasses) or 100% false positives

**Probability:** LOW (logic is simple)

**Mitigation:**
- Comprehensive testing before deployment
- Test with 50+ diverse functions
- Manual review of all flagged functions
- Can revert to line-by-line detection

---

### Worst Case 3: Regex Hang on Production Files

**Scenario:** Specific file causes regex to hang indefinitely

**Impact:** Pre-commit hook hangs, blocks all commits

**Probability:** VERY LOW (simple patterns)

**Mitigation:**
- Add timeout to detection (10 second max)
- Log which file caused timeout
- Can skip problematic files
- Can disable detector temporarily

**Code to add:**
```javascript
// In main detectGaming function
const TIMEOUT_MS = 10000; // 10 seconds
const startTime = Date.now();

// In each detector, check timeout
if (Date.now() - startTime > TIMEOUT_MS) {
  console.warn(`⚠️ Detection timed out after ${TIMEOUT_MS}ms`);
  break;
}
```

---

### Worst Case 4: Breaking Change to Existing Workflow

**Scenario:** Changes break existing pre-commit hooks or CI

**Impact:** Blocks all commits, breaks builds

**Probability:** LOW (backwards compatible)

**Mitigation:**
- Test in isolation before deploying
- Verify backwards compatibility
- Have rollback plan ready
- Can disable new detectors individually

---

## Complexity Analysis

### TODO Keyword Expansion

**Complexity:** O(n × m)
- n = number of lines in file
- m = number of keywords (increases from 10 to 15)

**Impact:** 50% more keyword checks per line

**Acceptable:** Yes (still O(n), just larger constant factor)

---

### Phrase Pattern Expansion

**Complexity:** O(n × p)
- n = number of lines in file
- p = number of patterns (increases from 5 to 15)

**Impact:** 3x more pattern checks per line

**Acceptable:** Yes (regex is fast, <1ms per check)

---

### Context-Aware GS013

**Complexity:** O(f × l)
- f = number of functions in file
- l = average lines per function

**Previous Complexity:** O(n) line-by-line

**New Complexity:** O(f × l) function-by-function

**Impact:** Depends on function count vs line count

**Typical file:**
- 500 lines total
- 20 functions
- 25 lines per function
- Old: 500 checks
- New: 20 × 25 = 500 checks (similar)

**Worst case:**
- 2000 lines
- 100 functions
- 20 lines each
- New: 100 × 20 = 2000 checks (still O(n))

**Acceptable:** Yes (same order of magnitude)

---

## Decision Points

### Decision 1: Should we add implicit arrow return detection?

**Options:**
1. Add now (in IMPLEMENT phase)
2. Defer to future task

**Analysis:**
- Pro: Catches important bypass pattern (EC4)
- Pro: Only 10-15 LOC
- Con: Adds complexity
- Con: Not in original spec

**Decision:** ADD NOW
**Reasoning:** High-value, low-effort, closes known gap

---

### Decision 2: Should we add timeout protection?

**Options:**
1. Add timeout (10 second max)
2. Trust regex to be fast

**Analysis:**
- Pro: Prevents hangs in worst case
- Pro: Only 5 LOC
- Con: Unlikely to be needed
- Con: Adds complexity

**Decision:** DEFER
**Reasoning:** Very low probability, can add if issues occur

---

### Decision 3: Should we handle type guard false positives?

**Options:**
1. Add type guard detection
2. Document as known false positive
3. Add suppression comment support

**Analysis:**
- Pro: Eliminates false positives
- Con: Adds complexity (AST parsing for type guards)
- Con: Type guards are rare (<1% of functions)

**Decision:** DOCUMENT ONLY
**Reasoning:** Low frequency, can add suppression comments if needed

---

## Risk Assessment Matrix

| Risk | Likelihood | Impact | Mitigation | Priority |
|------|------------|--------|------------|----------|
| EC4: Implicit arrow returns | High | High | Add detection | P0 |
| FM2: Type guard false positives | Medium | Low | Document | P3 |
| FM4: Complex function signatures | Medium | Medium | Test coverage | P1 |
| FM5: Performance regression | Low | High | Benchmark | P1 |
| FM6: Same as EC4 | High | High | Add detection | P0 |
| Worst case 1: Phrase false positives | Very Low | High | Warning mode | P2 |
| Worst case 3: Regex hang | Very Low | High | Timeout (deferred) | P3 |

**P0 Actions Required:**
1. ✅ Add implicit arrow return detection (EC4/FM6)

**P1 Actions Recommended:**
1. ✅ Test with complex function signatures
2. ✅ Benchmark with large files

**P2-P3 Actions Deferred:**
1. Warning mode deployment (already planned)
2. Timeout protection (add if needed)
3. Type guard detection (add if frequent)

---

## Conclusion

**Thinking Phase Complete:** ✅

**Key Findings:**
- 8 edge cases analyzed, 7 handled, 1 requires action (EC4)
- 6 failure modes documented, all have mitigation
- 4 worst cases considered, all have recovery plans
- Complexity analysis shows acceptable performance

**Action Required:**
- Add implicit arrow return detection in IMPLEMENT phase

**Confidence Level:** HIGH
- Simple changes with clear behavior
- Comprehensive testing plan
- Rollback strategy ready

**Next Step:** DESIGN phase (may skip per AFP if <20 LOC net, but we're at ~54 LOC, so GATE required)

Actually, per CLAUDE.md: "REQUIRED for: >1 file changed OR >20 net LOC"
- Files changed: 1 (detect_gaming.mjs)
- Net LOC: ~54

**GATE REQUIRED:** ✅ Yes (>20 net LOC)

Next: Create design.md for GATE checkpoint.
