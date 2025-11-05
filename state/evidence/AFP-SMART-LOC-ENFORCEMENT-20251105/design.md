# AFP-SMART-LOC-ENFORCEMENT-20251105: Design (GATE Phase)

## Via Negativa: What Can We DELETE/SIMPLIFY?

**Current flat 150 LOC enforcement:**
- ❌ DELETE: Binary pass/fail logic → Replace with progressive warnings
- ❌ DELETE: Single flat limit → Replace with context-aware tiers
- ❌ DELETE: Deletion-agnostic counting → Replace with credit system
- ✅ KEEP: Git integration (works well)
- ✅ KEEP: Pre-commit blocking (right enforcement point)
- ✅ KEEP: 150 as base limit (reasonable starting point)

**From spec, can we simplify?**
- Pattern detection: Could delete, but loses intelligence
- Effective LOC: Could delete, but loses boilerplate filtering
- Progressive warnings: Could simplify to pass/fail, but loses education
- **Decision:** Keep all features - they're essential complexity, not accidental

## Refactor vs. Repair Analysis

**Current system is REPAIR:**
- Flat limit was never properly designed, just picked heuristically
- Doesn't handle known cases (tests, templates)
- Agents work around it with `--no-verify`

**This is proper REFACTOR:**
- Rethinking enforcement from first principles
- Building context awareness into design
- Structural incentives (deletion credits) not rules

**Evidence this is refactor not patch:**
1. New module (`loc_analyzer.ts`), not modifying existing
2. Replacing entire LOC check section in hook
3. Adding analytics for continuous improvement
4. Addressing root cause (context-blindness) not symptoms

## Alternatives Considered

### Alternative 1: Keep flat limit, add exemption list
**Approach:** Maintain 150 LOC, but exempt `*.test.ts`, `templates/**`, `docs/**`
**Pros:** Simple, minimal code
**Cons:** Binary (exempt or not), no via negativa incentive, no nuance within categories
**Rejected:** Too crude, just shifts problem

### Alternative 2: Manual review for violations
**Approach:** Block all >150 LOC, require human approval
**Pros:** Flexible, human judgment
**Cons:** Doesn't scale, slow, inconsistent, no structural incentives
**Rejected:** Not autonomous, creates bottleneck

### Alternative 3: Cyclomatic complexity only
**Approach:** Replace LOC with complexity metrics
**Pros:** More accurate measure of complexity
**Cons:** Harder to understand, harder to implement, no via negativa incentive
**Rejected:** Too complex for v1, can add later

### Alternative 4: Per-directory limits (monorepo style)
**Approach:** `src/` = 100 LOC, `tests/` = 500 LOC, configured per directory
**Pros:** Explicit, easy to understand
**Cons:** Rigid, requires config maintenance, doesn't handle cross-cutting files
**Rejected:** Less flexible than file-type detection

### Alternative 5: AI-based analysis
**Approach:** Use LLM to judge if LOC is justified
**Pros:** Maximum intelligence, can understand context deeply
**Cons:** Expensive, slow, non-deterministic, opaque
**Rejected:** Over-engineered, not transparent

### **Selected: Context-aware tiers + deletion credits + progressive warnings**
**Why:** Balances intelligence with simplicity, structural incentives, transparent formula, measurable

## Complexity Justification

**Adding ~700 LOC total across all files:**
- Core analyzer: 400 LOC
- CLI wrapper: 150 LOC
- Logger: 80 LOC
- Config: 60 LOC
- Tests: 250 LOC
- Docs: 300 LOC

**Is this increase justified?**

**YES, because:**
1. **Replacing bad complexity with good:** Flat limit + bypasses + agent workarounds is hidden complexity. This makes it explicit and manageable.
2. **Essential, not accidental:** Each piece serves clear purpose (tiers, credits, logging, testing).
3. **Prevents future bloat:** Via negativa incentive structurally reduces codebase over time.
4. **Self-optimizing:** Analytics enable tuning, making system better over time.
5. **One-time cost:** Once built, maintenance is minimal (config tweaks only).

**Mitigations:**
- Modular design (can remove features if unused)
- Config-driven (tune without code changes)
- Well-tested (reduces maintenance burden)
- Clear docs (reduces cognitive overhead)

## Implementation Plan (Files & LOC)

### Core Module: `tools/wvo_mcp/src/enforcement/`

**loc_analyzer.ts** (400 LOC) ✅ DONE
- `analyzeFileLOC()`: Single file analysis
- `analyzeCommitLOC()`: Multi-file analysis
- `formatAnalysis()`: Terminal output
- `getFileTypeMultiplier()`: Tier detection
- `calculateEffectiveLOC()`: Boilerplate removal
- `calculatePatternBonus()`: Pattern detection

**loc_logger.ts** (80 LOC)
```typescript
export function logLOCAnalysis(
  analysis: CommitAnalysisResult,
  outcome: 'passed' | 'warned' | 'blocked' | 'overridden'
): void {
  const logPath = join(WORKSPACE_ROOT, 'state/analytics/loc_enforcement.jsonl');
  const entry = { timestamp: new Date().toISOString(), ...analysis, outcome };
  appendFileSync(logPath, JSON.stringify(entry) + '\n');
}
```

**loc_config.ts** (60 LOC)
```typescript
export const LOC_CONFIG = {
  baseLimit: 150,
  fileTypeMultipliers: { test: 3.0, template: 4.0, ... },
  patternBonuses: { 'high-imports': 20, 'well-documented': 30, ... },
  severityThresholds: { warning: 1.5, strongWarning: 2.0, blocked: 2.0 },
  deletionCreditRatio: 0.5,
  effectiveLOCEnabled: true,
};
```

**index.ts** (20 LOC)
```typescript
export * from './loc_analyzer.js';
export * from './loc_logger.js';
export * from './loc_config.js';
```

### CLI Wrapper: `scripts/analyze_loc.mjs` (150 LOC)

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { analyzeCommitLOC, formatAnalysis, logLOCAnalysis } from '../tools/wvo_mcp/dist/enforcement/index.js';

// Parse args (--staged, --files, --verbose, --dry-run)
// Get file changes via git diff --cached --numstat
// Load file content for each
// Call analyzeCommitLOC()
// Format and print results
// Log to analytics
// Exit with appropriate code
```

### Hook Integration: `.githooks/pre-commit` (modify)

Replace existing LOC check section (lines 32-44) with:
```bash
# ============================================================
# PART 1a: Sophisticated LOC Enforcement
# ============================================================

if [ "${USE_SMART_LOC:-1}" = "1" ]; then
  echo -e "${YELLOW}📊 Running sophisticated LOC analysis...${NC}"
  if node scripts/analyze_loc.mjs --staged; then
    echo -e "${GREEN}✅ LOC analysis passed${NC}"
  else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 2 ]; then
      # Warning only, not blocking
      echo -e "${YELLOW}⚠️  LOC warnings (not blocking)${NC}"
    else
      echo -e "${RED}❌ LOC analysis blocked${NC}"
      exit 1
    fi
  fi
else
  # Fallback: flat 150 LOC limit (original code)
  ...existing code...
fi
```

### Documentation: `docs/enforcement/SMART_LOC_ENFORCEMENT.md` (300 LOC)

Sections:
1. Overview (why smart enforcement)
2. How it works (formula, tiers, credits)
3. File type tiers (table)
4. Deletion credit system
5. Pattern detection
6. Progressive warnings
7. Override mechanism
8. Examples (pass/warn/block scenarios)
9. Troubleshooting
10. Tuning guide

### Tests: `tools/wvo_mcp/src/enforcement/__tests__/loc_analyzer.test.ts` (250 LOC)

```typescript
describe('LOC Analyzer', () => {
  describe('File type detection', () => {
    test('identifies test files with 3.0x multiplier', () => {...});
    test('identifies core logic with 0.8x multiplier', () => {...});
    // ... 8 more cases
  });

  describe('Deletion credits', () => {
    test('awards credit at 0.5x ratio', () => {...});
    test('handles zero deletions', () => {...});
    // ... 3 more cases
  });

  describe('Effective LOC', () => {
    test('excludes comments and imports', () => {...});
    test('counts type defs as 0.5x', () => {...});
    // ... 6 more cases
  });

  describe('Pattern detection', () => {
    test('detects high-imports pattern', () => {...});
    test('detects well-documented pattern', () => {...});
    // ... 4 more cases
  });

  describe('Progressive enforcement', () => {
    test('passes when within limit', () => {...});
    test('warns when 100-150% over', () => {...});
    test('blocks when >200% over', () => {...});
    // ... 1 more case
  });

  describe('Integration', () => {
    test('analyzes multi-file commit', () => {...});
    test('formats output correctly', () => {...});
  });
});
```

## Risks & Mitigations

**Risk 1: Multipliers miscalibrated**
- Mitigation: Shadow mode week 1, tune based on analytics
- Fallback: Easy config update

**Risk 2: Performance impact**
- Mitigation: Optimize (target <2s for 20 files)
- Fallback: Disable effective LOC calculation

**Risk 3: False positives frustrate agents**
- Mitigation: Clear error messages, easy override
- Fallback: Increase multipliers

**Risk 4: Gaming/exploitation**
- Mitigation: Log overrides, periodic audits
- Fallback: Tighten multipliers, add heuristics

## Testing Plan

**Unit tests:** All functions isolated
**Integration tests:** CLI + hook simulation
**Manual tests:** Real commits, agent feedback
**Performance tests:** 20-file commit <2s
**Acceptance tests:** All spec criteria

## AFP/SCAS Compliance

✅ **Via Negativa:** Deletion credits structurally incentivize cleanup
✅ **Refactor Not Repair:** Complete redesign, not patch
✅ **Complexity Control:** Adding essential complexity to remove accidental complexity
✅ **Micro-Batching:** Still enforces small changes, just smarter
✅ **Modularity:** Clean separation (analyzer/logger/config/CLI/hook)

## Deployment Strategy

**Week 1: Shadow mode** (warnings only, collect data)
**Week 2: Soft enforcement** (block severe only)
**Week 3: Full enforcement** (all blocking enabled)
**Week 4: Review & decide** (keep/tune/revert)

## Success Metrics (4-Week Review)

- Bypass rate decreases by 50%
- False positive rate <5%
- Deletion rate increases by 25%
- Agent feedback: "enforcement feels smarter"
- Zero false positives on tests/templates/docs

## GATE Approval

This design:
- ✅ Addresses root cause (context-blindness)
- ✅ Uses via negativa (deletion credits)
- ✅ Proper refactor (not patch)
- ✅ Considers alternatives (5 options evaluated)
- ✅ Justifies complexity (measurable benefits)
- ✅ Mitigates risks (shadow mode, fallback, logging)
- ✅ Measurable (analytics, decision point)
- ✅ Reversible (can revert)

**Recommendation: PROCEED with implementation**
