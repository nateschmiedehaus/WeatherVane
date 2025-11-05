# AFP-SMART-LOC-ENFORCEMENT-20251105: Specification

## Functional Requirements

### FR1: Context-Aware Limits
**MUST** apply different LOC limits based on file type:

| File Type | Base Limit | Multiplier | Example |
|-----------|------------|------------|---------|
| Tests (*.test.ts) | 150 | 3.0x | 450 LOC |
| Templates (templates/**/*.md) | 150 | 4.0x | 600 LOC |
| Docs (docs/**/*.md) | 150 | 3.0x | 450 LOC |
| Guides (*GUIDE.md) | 150 | 3.0x | 450 LOC |
| Types/Schema (types.ts) | 150 | 1.5x | 225 LOC |
| Scripts (scripts/**/*) | 150 | 1.5x | 225 LOC |
| Config (config.ts) | 150 | 1.3x | 195 LOC |
| Evidence (state/evidence/**/*) | 150 | 2.5x | 375 LOC |
| **Core Logic (src/**/*.ts)** | 150 | **0.8x** | **120 LOC** (stricter!) |
| Default | 150 | 1.0x | 150 LOC |

### FR2: Deletion Credits (Via Negativa Incentive)
**MUST** award credits for deleted lines:
- Formula: `deletionCredit = floor(deletedLOC / 2)`
- Example: Delete 200 lines → earn 100 LOC credit
- Applied to adjusted limit: `adjustedLimit = baseLimit * multiplier + deletionCredit`

### FR3: Effective LOC Calculation
**MUST** calculate "effective LOC" excluding:
- Empty lines
- Comment-only lines
- Import/export statements (pure imports, not export functions)
- Type definitions (counted as 0.5x weight)

**MUST** detect patterns that justify higher limits:
- `high-imports` (>20 imports): +20 LOC bonus
- `well-documented` (>30% comments): +30 LOC bonus
- `type-heavy` (>15 type defs): +25 LOC bonus
- `readable-spacing` (>20% whitespace): +10 LOC bonus

### FR4: Progressive Enforcement
**MUST** use tiered severity instead of binary pass/fail:

| Net LOC vs. Adjusted Limit | Severity | Action |
|----------------------------|----------|--------|
| ≤ 100% | **Pass** ✅ | Allow |
| 100-150% | **Warning** ⚠️ | Allow with message |
| 150-200% | **Strong Warning** ⚠️⚠️ | Allow with recommendations |
| > 200% | **Blocked** ❌ | Reject (must split or override) |

### FR5: Actionable Recommendations
**MUST** provide specific guidance when over limit:
- For core logic: "Split into smaller modules", "Extract helper functions"
- For zero deletions + high additions: "Via negativa: can you DELETE/SIMPLIFY existing code?"
- For low multiplier files: "Consider refactoring into multiple files"

### FR6: Analytics Logging
**MUST** log all LOC analyses to enable tuning:
- File path, tier, multipliers, credits, severity, outcome
- Location: `state/analytics/loc_enforcement.jsonl`
- Format: JSON lines, one per file analyzed

### FR7: Override Mechanism
**MUST** support manual override with justification:
- Commit message contains `LOC_OVERRIDE: <reason>`
- Or: Create `loc_override.yml` in evidence directory
- Override still logs to analytics for review

## Non-Functional Requirements

### NFR1: Performance
- Analysis of 20-file commit **MUST** complete in <2 seconds
- Pre-commit hook **MUST** not add >3 seconds to commit time

### NFR2: Maintainability
- File-type patterns **MUST** be in config (not hardcoded)
- Multipliers **MUST** be tunable without code changes
- Clear separation: analyzer (TypeScript) vs. hook (Bash)

### NFR3: Debuggability
- **MUST** provide verbose mode showing all calculations
- **MUST** show: base limit, multiplier, credits, adjusted limit, net LOC
- **MUST** explain why each credit/bonus was applied

### NFR4: Backward Compatibility
- **MUST** support fallback to flat 150 LOC limit via flag
- **MUST NOT** break existing commits/workflows

### NFR5: Auditability
- All overrides **MUST** be logged
- Analytics **MUST** enable answering:
  - Which file types most often exceed limits?
  - What's the bypass rate?
  - Are deletion credits being used?
  - Are multipliers tuned correctly?

## Acceptance Criteria

### AC1: Core Logic Remains Strict
- ✅ Test: 180 LOC change to `src/orchestrator/runtime.ts` → **BLOCKED**
- ✅ Test: 120 LOC change with 100 deletions → **PASS** (deletion credit)

### AC2: Tests Get Generous Limits
- ✅ Test: 400 LOC comprehensive test suite → **PASS**
- ✅ Test: 600 LOC test with poor coverage → **WARNING** (but not blocked)

### AC3: Via Negativa Incentivized
- ✅ Test: Delete 300, add 200 (net -100) → **PASS** with 150 credit
- ✅ Test: Refactoring shows "✅ Deletion credit: +150" in output

### AC4: Patterns Detected
- ✅ Test: File with 25 imports → "high-imports" pattern, +20 bonus
- ✅ Test: File with 40% comments → "well-documented", +30 bonus

### AC5: Progressive Warnings Work
- ✅ Test: 200 LOC (150 limit) → **WARNING** (not blocked)
- ✅ Test: 350 LOC (150 limit) → **BLOCKED**

### AC6: Clear Feedback
- ✅ Test: Blocked file shows specific recommendations
- ✅ Test: Output shows: file, tier, limit, credits, severity

### AC7: Analytics Logged
- ✅ Test: Commit creates entry in `state/analytics/loc_enforcement.jsonl`
- ✅ Test: Entry includes all metadata for tuning

## Out of Scope

- **NOT** implementing cyclomatic complexity analysis (future enhancement)
- **NOT** analyzing code quality (only LOC)
- **NOT** language-specific analysis beyond TypeScript/JavaScript
- **NOT** integrating with IDE/editor (hook only)

## Dependencies

- TypeScript (for analyzer module)
- Bash (for pre-commit hook integration)
- `git diff --numstat` (for file change detection)
- Node.js runtime (for script execution)

## Success Metrics

**4-Week Review:**
- Bypass rate (`--no-verify` usage) decreases by 50%
- False positive rate <5% (legitimate files blocked)
- Deletion rate increases by 25% (via negativa working)
- Agent feedback: "enforcement feels smarter"

## Edge Cases

1. **Renamed files:** Treat as delete + add (credits apply)
2. **Binary files:** Skip analysis (not applicable)
3. **Generated files:** Detect and exempt (e.g., `dist/`, `*.generated.ts`)
4. **Moved code:** Pure moves (100% overlap) don't count as adds
5. **Whitespace-only changes:** Ignored in effective LOC
