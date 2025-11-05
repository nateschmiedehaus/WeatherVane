# Smart LOC Enforcement

> **Context-aware, intelligent LOC limits with via negativa incentives**

## Overview

Smart LOC Enforcement replaces the flat 150 LOC limit with a sophisticated, context-aware system that:

- **Understands file context** - Tests get 3x limit, core logic gets 0.8x
- **Rewards cleanup** - Deletion credits (via negativa)
- **Focuses on real complexity** - Ignores comments, imports, boilerplate
- **Educates progressively** - Warnings before blocking
- **Measures and tunes** - Full analytics for continuous improvement

**Result:** Conservative but intelligent - strict where it matters, generous where justified.

## How It Works

### Formula

```
adjustedLimit = (baseLimit * fileTypeMultiplier) + deletionCredit + patternBonus
```

**Example (Test File):**
```
baseLimit = 150
multiplier = 3.0 (test file)
deletionCredit = 50 (deleted 100 lines)
patternBonus = 30 (well-documented)

adjustedLimit = (150 * 3.0) + 50 + 30 = 530 LOC allowed
```

### File Type Tiers

| File Type | Multiplier | Adjusted Limit | Rationale |
|-----------|------------|----------------|-----------|
| **Tests** (`*.test.ts`) | 3.0x | 450 LOC | Comprehensive tests > artificially split |
| **Templates** (`templates/**/*.md`) | 4.0x | 600 LOC | Examples and explanations are verbose |
| **System Docs** (`docs/architecture/**`, `docs/system/**`, `docs/orchestration/**`) | 4.0x | 600 LOC | Comprehensive system analysis valued |
| **Docs** (`docs/**/*.md`) | 3.0x | 450 LOC | Completeness valued |
| **Guides** (`*GUIDE.md`) | 3.0x | 450 LOC | Similar to docs |
| **Types** (`types.ts`) | 1.5x | 225 LOC | Type safety encouraged |
| **Scripts** (`scripts/**`) | 1.5x | 225 LOC | Automation complexity allowed |
| **Config** (`config.ts`) | 1.3x | 195 LOC | Moderate verbosity |
| **Evidence** (`state/evidence/**`) | 2.5x | 375 LOC | Documentation-like |
| **Core Logic** (`src/**/*.ts`) | **0.8x** | **120 LOC** | **STRICTEST** |
| **Default** | 1.0x | 150 LOC | Standard enforcement |

### Deletion Credits (Via Negativa)

**For every 2 lines deleted, earn 1 line of credit.**

**Examples:**
- Delete 100, add 200 → Net +100, but get +50 credit → Adjusted limit +50
- Refactoring (delete 300, add 250) → Net -50, but analysis sees 250 added with +150 credit

**Purpose:** Structurally incentivize cleanup and refactoring.

### Pattern Bonuses

**Detected automatically:**

| Pattern | Bonus | Detection |
|---------|-------|-----------|
| **high-imports** | +20 LOC | >20 import statements |
| **well-documented** | +30 LOC | >30% comment lines |
| **type-heavy** | +25 LOC | >15 type definitions |
| **readable-spacing** | +10 LOC | >20% whitespace |

**Rationale:** These patterns indicate structure, not complexity.

### Progressive Enforcement

| Net LOC vs. Adjusted Limit | Severity | Action |
|----------------------------|----------|--------|
| ≤ 100% | ✅ **Pass** | Allow, no warnings |
| 100-150% | ⚠️ **Warning** | Allow with message |
| 150-200% | ⚠️⚠️ **Strong Warning** | Allow with recommendations |
| > 200% | ❌ **Blocked** | Reject, must split or override |

**Philosophy:** Warn and educate before blocking.

## Usage

### Automatic (Pre-Commit Hook)

Smart LOC runs automatically on every commit:

```bash
git add src/myfile.ts
git commit -m "feat: add feature"

# Output:
# 📊 Running smart LOC analysis...
# ✅ src/myfile.ts
#    Within limit (120/120 LOC, core tier)
# ✅ Smart LOC check passed
```

### Manual Analysis

```bash
# Analyze staged files
node scripts/analyze_loc.mjs --staged

# Analyze specific files
node scripts/analyze_loc.mjs --files src/foo.ts src/bar.ts

# Verbose mode (show all calculations)
node scripts/analyze_loc.mjs --staged --verbose

# Dry run (show results but don't block)
node scripts/analyze_loc.mjs --staged --dry-run
```

### Fallback to Flat Limit

If smart enforcement causes issues:

```bash
# Disable smart LOC for one commit
USE_SMART_LOC=0 git commit -m "..."

# Or permanently in shell config
export USE_SMART_LOC=0
```

## Examples

### Example 1: Core Logic (STRICT)

**File:** `src/orchestrator/runtime.ts`
- Type: Core logic
- Multiplier: 0.8x
- Base limit: 150 LOC
- **Adjusted limit: 120 LOC**

**Scenario:**
- Add 130 LOC, delete 0
- **Result:** ❌ BLOCKED (130 > 120)
- **Recommendation:** "Split into smaller modules"

### Example 2: Test File (GENEROUS)

**File:** `src/orchestrator/__tests__/runtime.test.ts`
- Type: Test
- Multiplier: 3.0x
- Base limit: 150 LOC
- **Adjusted limit: 450 LOC**

**Scenario:**
- Add 400 LOC comprehensive test suite
- **Result:** ✅ PASS (400 < 450)

### Example 3: Refactoring with Deletion Credits

**File:** `src/utils/helpers.ts`
- Type: Core logic
- Multiplier: 0.8x
- Base limit: 150 * 0.8 = 120 LOC
- Deleted: 200 lines (credit: +100)
- **Adjusted limit: 220 LOC**

**Scenario:**
- Delete 200, add 180 (net -20)
- **Result:** ✅ PASS with deletion credit message

### Example 4: Well-Documented Template

**File:** `docs/templates/strategy_template.md`
- Type: Template
- Multiplier: 4.0x
- Base limit: 150 * 4.0 = 600 LOC
- Pattern: well-documented (+30)
- **Adjusted limit: 630 LOC**

**Scenario:**
- Add 550 LOC with examples
- **Result:** ✅ PASS

### Example 5: Progressive Warning

**File:** `src/enforcement/analyzer.ts`
- Type: Core logic
- Multiplier: 0.8x
- Adjusted limit: 120 LOC

**Scenario:**
- Add 180 LOC (150% over limit)
- **Result:** ⚠️⚠️ STRONG WARNING (allowed, but recommended to split)

## Override Mechanism

### When to Override

- Infrastructure that genuinely requires high LOC
- Generated code or migration scripts
- One-time bulk changes with justification

**DO NOT override habitually** - defeats the purpose.

### How to Override

**Option 1: Commit Message**

```bash
git commit -m "LOC_OVERRIDE: One-time migration script for database schema

This is a one-time migration that touches 500 LOC across generated SQL.
Splitting would make it non-atomic and harder to review."
```

**Option 2: Evidence File**

Create `state/evidence/TASK-ID/loc_override.yml`:

```yaml
override: true
reason: |
  Comprehensive integration test suite covering all edge cases.
  Splitting would reduce test clarity and make maintenance harder.
files:
  - path: src/integration.test.ts
    justification: End-to-end test scenarios require context
```

**Both methods:**
- Allow the commit
- Log override to analytics for review

## Analytics

All analyses are logged to `state/analytics/loc_enforcement.jsonl`:

```jsonl
{
  "timestamp": "2025-11-05T12:00:00.000Z",
  "outcome": "passed",
  "totalFiles": 3,
  "totalNetLOC": 250,
  "files": [
    {
      "path": "src/foo.ts",
      "tier": "core",
      "netLOC": 100,
      "adjustedLimit": 120,
      "severity": "pass",
      "deletionCredit": 0,
      "patternBonus": 0,
      "multiplier": 0.8
    }
  ]
}
```

**Use cases:**
- Track bypass rate (measure effectiveness)
- Identify false positives (tune multipliers)
- Monitor deletion credit usage (via negativa metrics)
- Detect gaming patterns (unusual file types)

## Troubleshooting

### "Blocked: legitimate long file"

**Check:**
1. Is it really core logic? (Should use stricter 0.8x)
2. Can it be split? (Modularity principle)
3. Is there boilerplate? (Effective LOC should handle)

**Solutions:**
- Add deletion (refactor existing code)
- Move to appropriate directory (scripts/, tools/)
- Use override with justification

### "Test file blocked unexpectedly"

**Likely causes:**
- File doesn't match `.test.ts` pattern
- Extremely large test (>450 LOC)

**Solutions:**
- Ensure `.test.ts` suffix
- Split into multiple test files by feature

### "Getting warnings on every commit"

**If warnings are legitimate:**
- Good! System is educating you.
- Consider splitting files proactively.

**If warnings are false positives:**
- Review analytics (`state/analytics/loc_enforcement.jsonl`)
- File issue with examples
- May need multiplier tuning

### "Performance is slow"

**Target:** <2 seconds for 20-file commit

**If slower:**
- Check effective LOC calculation (most expensive)
- Disable with `USE_SMART_LOC=0` temporarily
- Report performance issue with commit details

## Tuning Guide

### Adjusting Multipliers

Edit `tools/wvo_mcp/src/enforcement/loc_config.ts`:

```typescript
export const DEFAULT_LOC_CONFIG: LOCConfig = {
  fileTypeMultipliers: {
    test: 3.5,  // Increase if tests frequently blocked
    core: 0.7,  // Decrease for stricter core logic
    // ...
  },
};
```

Then rebuild:
```bash
cd tools/wvo_mcp && npm run build
```

### Shadow Mode (Tuning Period)

To collect data without blocking:

```bash
# In pre-commit hook, temporarily change:
if node scripts/analyze_loc.mjs --staged --dry-run; then
  # Always pass, just show analysis
fi
```

Run for 1 week, analyze logs, tune multipliers.

### Analyzing Trends

```bash
# Count outcomes
jq -r '.outcome' state/analytics/loc_enforcement.jsonl | sort | uniq -c

# False positive rate
jq 'select(.outcome == "blocked")' state/analytics/loc_enforcement.jsonl | less

# Deletion credit usage
jq 'select(.files[].deletionCredit > 0)' state/analytics/loc_enforcement.jsonl | wc -l
```

## Philosophy

### Why Context Matters

**A 150-line god function is harmful.**
**A 450-line comprehensive test suite is good.**

Flat limits can't distinguish. Context-aware limits can.

### Via Negativa First

Deletion is better than addition. Smart LOC structurally rewards this:
- Delete 200, add 200 → get +100 credit
- Pure addition → no credit

**Result:** Refactoring becomes easier than patching.

### Progressive, Not Binary

Most systems: Pass or fail.
Smart LOC: Pass → Warn → Strong warn → Block.

**Result:** Education and guidance, not just rejection.

### Transparent Formula

Every decision is explainable:
- Base limit: 150
- Multiplier: 3.0x (test)
- Deletion credit: +50
- Pattern bonus: +30
- **= 580 LOC allowed**

No magic, no AI, just clear rules.

## FAQ

**Q: Will this make commits slower?**
A: Target <2s for typical commits. If slower, report issue.

**Q: Can I still use --no-verify?**
A: Yes, but it's logged. Habitually bypassing = system isn't working, file issue.

**Q: What if I disagree with a block?**
A: Use LOC_OVERRIDE with justification. System logs it for review.

**Q: How often are multipliers tuned?**
A: Monthly review of analytics, adjust as needed.

**Q: Can I disable this?**
A: Yes: `USE_SMART_LOC=0`. But please file issue explaining why.

**Q: Does this replace other AFP checks?**
A: No. Still enforces: ≤5 files, micro-batching, phase discipline, critics.

**Q: What about cyclomatic complexity?**
A: Future enhancement. V1 focuses on LOC with context awareness.

## Rollout Plan

**Week 1: Shadow mode** - Warnings only, collect data
**Week 2: Soft enforcement** - Block severe only (>200%)
**Week 3: Full enforcement** - All thresholds active
**Week 4: Review** - Analyze metrics, decide: keep/tune/revert

## Support

**Issues:** Create issue with:
- Commit SHA
- File path
- Expected vs. actual behavior
- Output from `node scripts/analyze_loc.mjs --staged --verbose`

**Questions:** Check this doc first, then ask in discussions.

**Contributions:** Tuning PRs welcome with analytics justification.
