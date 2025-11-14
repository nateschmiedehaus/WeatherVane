# Plan: Quick Wins for Gaming Detection

**Task ID:** AFP-GAMING-DETECT-P1-QUICK-20251113
**Date:** 2025-11-13
**Phase:** PLAN (Phase 3 of 10)

## Executive Summary

This plan details EXACTLY how to implement the two quick wins:
1. Expand TODO detection patterns
2. Add context awareness to GS013

**File Modified:** `tools/wvo_mcp/scripts/detect_gaming.mjs`
**Lines Changed:** ~35 net LOC
**Time Estimate:** 1.5-2 hours implementation, 1-1.5 hours verification

---

## Current Code Analysis

### Current detectTodoMarkers (Line 170)

**Location:** tools/wvo_mcp/scripts/detect_gaming.mjs:170-200

**Current implementation:**
```javascript
function detectTodoMarkers({ files, repoRoot }) {
  const violations = [];
  const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB)\b/i;

  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs|tsx|jsx)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Skip string literals
      if (line.match(/['"`].*TODO.*['"`]/)) return;

      // Detect TODO markers
      if (pattern.test(line)) {
        violations.push({
          file,
          line: index + 1,
          content: line.trim(),
          message: 'TODO/stub marker found in production code'
        });
      }
    });
  }

  return violations;
}
```

**Keywords detected:** 10 patterns
- TODO, FIXME, XXX, HACK, TBD, @todo, INCOMPLETE, NOT IMPLEMENTED, PLACEHOLDER, STUB

### Current detectTodoVariations (Line 205)

**Location:** tools/wvo_mcp/scripts/detect_gaming.mjs:205-239

**Current implementation:**
```javascript
function detectTodoVariations({ files, repoRoot }) {
  const violations = [];
  const patterns = [
    /(finish|complete|implement).*later/i,
    /needs? work/i,
    /temporary|temp fix/i,
    /quick hack/i,
    /@deprecated.*use real implementation/i
  ];

  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.test(line) && !line.match(/['"`]/)) {
          violations.push({
            file,
            line: index + 1,
            content: line.trim(),
            message: 'Deceptive TODO variation detected'
          });
        }
      }
    });
  }

  return violations;
}
```

**Phrases detected:** 5 patterns
- "(finish|complete|implement).*later"
- "needs? work"
- "temporary|temp fix"
- "quick hack"
- "@deprecated.*use real implementation"

### Current detectNullReturns (Line 378)

**Location:** tools/wvo_mcp/scripts/detect_gaming.mjs:378-405

**Current implementation:**
```javascript
function detectNullReturns({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detect return of empty array/object/null
      if (line.match(/return\s+(\[\]|{}|null|undefined)\s*;/)) {
        violations.push({
          file,
          line: index + 1,
          content: line.trim(),
          message: 'Function returns empty/null without logic'
        });
      }
    });
  }

  return violations;
}
```

**Problem:** Line-by-line detection, no function context awareness

---

## Change #1: Expand TODO Keywords

### Modification: detectTodoMarkers (Line 172)

**Change:** Expand regex pattern to include 5 new keywords

**Before (Line 172):**
```javascript
const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB)\b/i;
```

**After (Line 172):**
```javascript
const pattern = /\b(TODO|FIXME|XXX|HACK|TBD|@todo|INCOMPLETE|NOT IMPLEMENTED|PLACEHOLDER|STUB|FUTURE|PENDING|WIP|NOTE|REMINDER)\b/i;
```

**New keywords added:**
- FUTURE (e.g., "// FUTURE: enhance this")
- PENDING (e.g., "// PENDING implementation")
- WIP (e.g., "// WIP code here")
- NOTE (e.g., "// NOTE: finish later")
- REMINDER (e.g., "// REMINDER: complete this")

**Lines Changed:** 1 line modified
**LOC Impact:** +0 net (same line, more content)

**Testing:**
```bash
# Test case 1: FUTURE keyword
echo "// FUTURE: enhance this later" > /tmp/test_future.ts
node detect_gaming.mjs --files /tmp/test_future.ts
# Expected: Violation detected

# Test case 2: WIP keyword
echo "// WIP implementation" > /tmp/test_wip.ts
node detect_gaming.mjs --files /tmp/test_wip.ts
# Expected: Violation detected

# Test case 3: String literal (should NOT flag)
echo 'const msg = "FUTURE releases will include this";' > /tmp/test_string.ts
node detect_gaming.mjs --files /tmp/test_string.ts
# Expected: No violation
```

---

## Change #2: Expand TODO Phrase Patterns

### Modification: detectTodoVariations (Lines 207-213)

**Change:** Add 10 new phrase patterns to patterns array

**Before (Lines 207-213):**
```javascript
const patterns = [
  /(finish|complete|implement).*later/i,
  /needs? work/i,
  /temporary|temp fix/i,
  /quick hack/i,
  /@deprecated.*use real implementation/i
];
```

**After (Lines 207-213):**
```javascript
const patterns = [
  // Existing patterns (5)
  /(finish|complete|implement).*later/i,
  /needs? work/i,
  /temporary|temp fix/i,
  /quick hack/i,
  /@deprecated.*use real implementation/i,

  // New patterns (10)
  /will\s+(enhance|improve|complete|finish|implement)\s+(later|soon|this)/i,
  /basic\s+version\s+(for\s+now|only)/i,
  /coming\s+soon/i,
  /implement\s+(properly|eventually)/i,
  /for\s+now\s*,?\s*(just|only|simply)/i,
  /simplified\s+version/i,
  /temporary\s+(solution|implementation|code)/i,
  /quick\s+(fix|hack)\s+for\s+now/i,
  /need\s+to\s+(finish|complete|implement)\s+this/i,
  /(stub|placeholder)\s+(code|implementation)/i
];
```

**New patterns added:**
1. "will enhance/improve/complete/finish/implement later/soon/this"
2. "basic version for now/only"
3. "coming soon"
4. "implement properly/eventually"
5. "for now, just/only/simply"
6. "simplified version"
7. "temporary solution/implementation/code"
8. "quick fix/hack for now"
9. "need to finish/complete/implement this"
10. "stub/placeholder code/implementation"

**Lines Changed:** 10 lines added
**LOC Impact:** +10 net LOC

**Testing:**
```bash
# Test case 1: "will enhance later"
echo "// Will enhance this with proper GOL algorithm later" > /tmp/test_phrase1.ts
node detect_gaming.mjs --files /tmp/test_phrase1.ts
# Expected: Violation detected

# Test case 2: "basic version for now"
echo "// Basic version for now - just return empty grid" > /tmp/test_phrase2.ts
node detect_gaming.mjs --files /tmp/test_phrase2.ts
# Expected: Violation detected

# Test case 3: "coming soon"
echo "// Coming soon: full implementation" > /tmp/test_phrase3.ts
node detect_gaming.mjs --files /tmp/test_phrase3.ts
# Expected: Violation detected
```

---

## Change #3: Context-Aware GS013 Detection

### Replacement: detectNullReturns (Lines 378-405)

**Change:** Complete rewrite to add function context analysis

**Before (Lines 378-405):**
```javascript
function detectNullReturns({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detect return of empty array/object/null
      if (line.match(/return\s+(\[\]|{}|null|undefined)\s*;/)) {
        violations.push({
          file,
          line: index + 1,
          content: line.trim(),
          message: 'Function returns empty/null without logic'
        });
      }
    });
  }

  return violations;
}
```

**After (Lines 378-450):**
```javascript
function detectNullReturns({ files, repoRoot }) {
  const violations = [];
  const codeFiles = files.filter(f => f.match(/\.(ts|js|mjs)$/) && !f.match(/\.(test|spec)\./));

  for (const file of codeFiles) {
    const filePath = join(repoRoot, file);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf-8');

    // Extract functions using regex
    const functions = extractFunctionsFromContent(content);

    for (const func of functions) {
      // Check if function returns null/empty
      if (!hasNullishReturn(func.body)) continue;

      // Analyze function body for context
      const hasOtherLogic = analyzeForOtherLogic(func.body);

      // Flag ONLY if return is the ONLY logic (stub)
      if (!hasOtherLogic) {
        violations.push({
          file,
          line: func.lineNumber,
          content: func.name,
          message: 'Function only returns null/empty without any logic (stub implementation)'
        });
      }
      // If has other logic, likely legitimate (guard clause or error handling)
    }
  }

  return violations;
}

// Helper function: Extract functions from content
function extractFunctionsFromContent(content) {
  const functions = [];

  // Match function declarations and arrow functions
  // Pattern handles: function foo(), const foo = () =>, async foo()
  const functionPattern = /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*([^]*?)\{([^]*?)(?:^|\n)\}/gm;

  let match;
  while ((match = functionPattern.exec(content)) !== null) {
    const name = match[1] || match[2] || 'anonymous';
    const body = match[4] || '';
    const lineNumber = content.substring(0, match.index).split('\n').length;

    functions.push({ name, body, lineNumber });
  }

  return functions;
}

// Helper function: Check if function has nullish return
function hasNullishReturn(body) {
  return /return\s+(null|undefined|\[\]|\{\}|0|false|"")\s*;/.test(body);
}

// Helper function: Analyze for other logic besides return
function analyzeForOtherLogic(body) {
  // Split into lines and filter out noise
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !line.startsWith('//'))         // Remove single-line comments
    .filter(line => !line.startsWith('/*'))         // Remove block comment starts
    .filter(line => !line.startsWith('*'))          // Remove block comment middle
    .filter(line => line !== '{' && line !== '}');  // Remove braces

  // Count non-return statements
  const nonReturnStatements = lines.filter(line =>
    !line.startsWith('return')
  );

  // If there are other statements, function has logic
  return nonReturnStatements.length > 0;
}
```

**Lines Changed:** 72 lines total (28 lines original → 72 lines new)
**LOC Impact:** +44 net LOC

**Testing:**
```bash
# Test case 1: Stub (should flag)
cat > /tmp/test_stub.ts << 'EOF'
function calculateNeighbors(row: number, col: number): number {
  return 0;
}
EOF
node detect_gaming.mjs --files /tmp/test_stub.ts
# Expected: Violation detected

# Test case 2: Guard clause (should NOT flag)
cat > /tmp/test_guard.ts << 'EOF'
function findUser(id: string): User | null {
  if (!id) return null;

  const user = database.query(id);
  return user || null;
}
EOF
node detect_gaming.mjs --files /tmp/test_guard.ts
# Expected: No violation

# Test case 3: Error handling (should NOT flag)
cat > /tmp/test_error.ts << 'EOF'
function safeParse(json: string): object | null {
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Parse error:', error);
    return null;
  }
}
EOF
node detect_gaming.mjs --files /tmp/test_error.ts
# Expected: No violation
```

---

## Summary of Changes

### File Modified
**Path:** `tools/wvo_mcp/scripts/detect_gaming.mjs`

### Line-by-Line Changes

| Line(s) | Change Type | Description | LOC Impact |
|---------|-------------|-------------|------------|
| 172 | MODIFY | Expand TODO keyword regex (+5 keywords) | +0 |
| 207-213 | MODIFY | Expand phrase patterns array (+10 patterns) | +10 |
| 378-405 | REPLACE | Rewrite detectNullReturns with context awareness | +44 |
| 406-450 | ADD | Add 3 helper functions for context analysis | (included above) |

**Total LOC Impact:** +54 gross, -0 deleted = **+54 net LOC**

(Note: Spec estimated ~35 LOC, actual is ~54 due to comprehensive helper functions)

---

## Implementation Order

### Step 1: Expand TODO Keywords (~15 minutes)

1. Navigate to line 172 in detect_gaming.mjs
2. Update regex pattern to include 5 new keywords
3. Save file
4. Test with 3 test cases (FUTURE, WIP, string literal)
5. Verify backwards compatibility (AUTO-GOL-T1 still caught)

### Step 2: Expand Phrase Patterns (~20 minutes)

1. Navigate to lines 207-213 in detect_gaming.mjs
2. Add 10 new phrase patterns to array
3. Format with comments for readability
4. Save file
5. Test with 5 test cases (various phrases)
6. Verify no false positives on legitimate code

### Step 3: Rewrite detectNullReturns (~45 minutes)

1. Create backup of original function
2. Replace function body (lines 378-405)
3. Add 3 helper functions below (lines 406-450)
4. Test extractFunctionsFromContent helper
5. Test hasNullishReturn helper
6. Test analyzeForOtherLogic helper
7. Test full function with 5 test cases

### Step 4: Integration Testing (~20 minutes)

1. Run against AUTO-GOL-T1 (baseline validation)
2. Run against adversarial suite (bypass rate)
3. Run against entire codebase (false positive check)
4. Performance benchmark (must be <100ms)
5. Verify all existing tests pass

**Total Time:** ~100 minutes (1 hour 40 minutes)

---

## Test Plan (PLAN-Authored Tests)

### Test Suite 1: TODO Keyword Expansion

**Test 1.1: New keywords detected**
```bash
# Create test files with each new keyword
for keyword in FUTURE PENDING WIP NOTE REMINDER; do
  echo "// $keyword: complete this" > /tmp/test_$keyword.ts
  node detect_gaming.mjs --files /tmp/test_$keyword.ts | grep -q "GS001"
  if [ $? -eq 0 ]; then echo "✅ $keyword"; else echo "❌ $keyword"; fi
done

# Expected: All 5 keywords detected
```

**Test 1.2: String literals ignored**
```bash
cat > /tmp/test_string_literal.ts << 'EOF'
const message = "FUTURE releases will include this";
const note = "NOTE: this is just documentation";
EOF

node detect_gaming.mjs --files /tmp/test_string_literal.ts
# Expected: Exit code 0 (no violations)
```

**Test 1.3: Backwards compatibility**
```bash
node detect_gaming.mjs --files state/autopilot/wave0/state/wave0_implementations/AUTO-GOL-T1.ts
# Expected: Exit code 1, GS001 violation for TODO comment
```

### Test Suite 2: Phrase Pattern Expansion

**Test 2.1: New phrases detected**
```bash
# Test each new phrase
cat > /tmp/test_phrases.ts << 'EOF'
// Will enhance this with proper implementation later
// Basic version for now - just return empty
// Coming soon: full implementation
// Implement properly later
// For now, just return empty
// Simplified version only
// Temporary solution here
// Quick hack for now
// Need to complete this task
// Stub implementation
EOF

node detect_gaming.mjs --files /tmp/test_phrases.ts
# Expected: 10 violations detected (one per phrase)
```

**Test 2.2: Legitimate comments ignored**
```bash
cat > /tmp/test_legitimate.ts << 'EOF'
// This algorithm completes the task efficiently
// The version number is tracked separately
// User can implement their own handler
EOF

node detect_gaming.mjs --files /tmp/test_legitimate.ts
# Expected: Exit code 0 (no violations)
```

**Test 2.3: Adversarial examples caught**
```bash
# Use example from adversarial report
cat > /tmp/test_adversarial.ts << 'EOF'
class GameOfLifeStub {
  // Will enhance this with proper GOL algorithm later
  updateGrid(): void {
    // Basic version for now - just return empty grid
    return;
  }
}
EOF

node detect_gaming.mjs --files /tmp/test_adversarial.ts
# Expected: 2 violations detected
```

### Test Suite 3: Context-Aware GS013

**Test 3.1: Stubs detected (return-only functions)**
```bash
cat > /tmp/test_stubs.ts << 'EOF'
function calculateNeighbors(row: number, col: number): number {
  return 0;
}

function getGrid(): Cell[][] {
  return [];
}

function getConfig(): Config {
  return {};
}
EOF

node detect_gaming.mjs --files /tmp/test_stubs.ts
# Expected: 3 violations detected
```

**Test 3.2: Guard clauses NOT flagged**
```bash
cat > /tmp/test_guards.ts << 'EOF'
function findUser(id: string): User | null {
  if (!id) return null;

  const user = database.query(id);
  return user || null;
}

function getItems(list: Item[]): Item[] {
  if (list.length === 0) return [];

  return list.filter(item => item.active);
}
EOF

node detect_gaming.mjs --files /tmp/test_guards.ts
# Expected: Exit code 0 (no violations)
```

**Test 3.3: Error handling NOT flagged**
```bash
cat > /tmp/test_errors.ts << 'EOF'
function safeParse(json: string): object | null {
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Parse error:', error);
    return null;
  }
}
EOF

node detect_gaming.mjs --files /tmp/test_errors.ts
# Expected: Exit code 0 (no violations)
```

**Test 3.4: False positive elimination**
```bash
# Scan entire codebase
node detect_gaming.mjs --all --priority P0 > /tmp/all_violations.txt

# Count GS013 violations
GS013_COUNT=$(grep -c "GS013" /tmp/all_violations.txt)

# Manually review each GS013 violation
# Count false positives
# Expected: <5% false positive rate
```

### Test Suite 4: Performance

**Test 4.1: Small commit performance**
```bash
# Create 5 test files
for i in {1..5}; do
  echo "function foo$i() { return null; }" > /tmp/test_file_$i.ts
done

# Time detection
time node detect_gaming.mjs --files /tmp/test_file_*.ts
# Expected: <50ms
```

**Test 4.2: Large commit performance**
```bash
# Create 50 test files
for i in {1..50}; do
  cat > /tmp/test_file_$i.ts << EOF
function foo$i() { return null; }
function bar$i() { return []; }
function baz$i() { return {}; }
EOF
done

# Time detection
time node detect_gaming.mjs --files /tmp/test_file_*.ts
# Expected: <500ms
```

**Test 4.3: Memory usage**
```bash
# Run with memory profiling
/usr/bin/time -l node detect_gaming.mjs --all 2>&1 | grep "maximum resident"
# Expected: <100MB
```

### Test Suite 5: Integration

**Test 5.1: Baseline validation**
```bash
node detect_gaming.mjs --files state/autopilot/wave0/state/wave0_implementations/AUTO-GOL-T1.ts
# Expected: Exit code 1, GS001 violation
```

**Test 5.2: All detectors still work**
```bash
node detect_gaming.mjs --all --priority P0 | grep -E "GS001|GS003|GS004|GS009|GS013|GS015|GS019|GS027"
# Expected: All 8 P0 detectors functional
```

**Test 5.3: Exit codes correct**
```bash
# Test exit code 0 (pass)
echo "function foo() { return 42; }" > /tmp/test_pass.ts
node detect_gaming.mjs --files /tmp/test_pass.ts
echo "Exit code: $?"
# Expected: 0

# Test exit code 1 (critical)
echo "// TODO: finish this" > /tmp/test_critical.ts
node detect_gaming.mjs --files /tmp/test_critical.ts
echo "Exit code: $?"
# Expected: 1
```

---

## Risks and Mitigation

### Risk 1: Helper Functions Break Existing Code

**Likelihood:** LOW
**Impact:** HIGH

**Mitigation:**
1. Functions are new additions (no existing dependencies)
2. detectNullReturns is fully replaced (no partial modifications)
3. Comprehensive testing before deployment

### Risk 2: Regex Performance Degradation

**Likelihood:** LOW
**Impact:** MEDIUM

**Mitigation:**
1. Benchmark before and after
2. Profile if >100ms detected
3. Optimize specific patterns if needed
4. Can disable slow patterns individually

### Risk 3: False Positives in Helper Functions

**Likelihood:** MEDIUM
**Impact:** MEDIUM

**Mitigation:**
1. Test with diverse codebase examples
2. Manual review of all GS013 flags
3. Adjust logic if >5% false positive rate
4. Can revert to line-by-line detection if needed

---

## Rollback Plan

If critical issues discovered after deployment:

### Option 1: Revert Specific Change

**If TODO keywords cause issues:**
```bash
git diff HEAD~1 tools/wvo_mcp/scripts/detect_gaming.mjs | grep "^-.*pattern ="
# Copy old pattern
git checkout HEAD~1 -- tools/wvo_mcp/scripts/detect_gaming.mjs
# Re-apply other changes manually
```

**If phrase patterns cause issues:**
```bash
# Remove problematic patterns from array
# Keep core 5 patterns, remove new 10
```

**If GS013 rewrite causes issues:**
```bash
# Revert to line-by-line detection
git show HEAD~1:tools/wvo_mcp/scripts/detect_gaming.mjs | sed -n '378,405p' > /tmp/old_gs013.txt
# Replace function with old version
```

### Option 2: Full Revert

```bash
git revert HEAD
git push
```

**Rollback time:** <10 minutes

---

## Success Criteria (from SPEC)

### Primary (ALL must pass):

1. ✅ **Bypass rate reduced to ≤60%**
   - Test: Re-run adversarial suite
   - Current: 80% (12/15 bypasses successful)
   - Target: ≤60% (≤9/15 bypasses successful)

2. ✅ **False positives eliminated to <5%**
   - Test: Scan entire codebase, manual review
   - Current: 25% (3/12 GS013 detections wrong)
   - Target: <5% (<1/20 detections wrong)

3. ✅ **Baseline maintained**
   - Test: AUTO-GOL-T1 still caught
   - Test: All existing tests pass
   - Test: No regressions in other detectors

4. ✅ **Performance acceptable**
   - Test: Average commit <100ms
   - Test: Large commit <500ms
   - Test: No memory issues

5. ✅ **Quality standards met**
   - Test: Code is readable and maintainable
   - Test: Functions are well-documented
   - Test: Easy to extend later

### Secondary (nice-to-have):

1. ⭐ Bypass rate <50%
2. ⭐ False positive rate <2%
3. ⭐ Performance <50ms
4. ⭐ Catches ≥5 new adversarial patterns

---

## Next Phase Actions

**After PLAN:**
- THINK phase: Edge cases, failure modes
- DESIGN phase: Architecture validation, AFP/SCAS check
- IMPLEMENT phase: Make the changes
- VERIFY phase: Run all PLAN-authored tests
- REVIEW phase: Quality check, stage, commit

**PLAN Phase Complete:** ✅

All implementation details specified. Ready for THINK phase.
