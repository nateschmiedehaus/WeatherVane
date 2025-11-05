# AFP-SMART-LOC-ENFORCEMENT-20251105: Plan

## Architecture

```
Pre-commit Hook (.githooks/pre-commit)
    ↓
Calls: scripts/analyze_loc.mjs
    ↓
Uses: tools/wvo_mcp/src/enforcement/loc_analyzer.ts
    ↓
Logs: state/analytics/loc_enforcement.jsonl
    ↓
Decision: PASS / WARN / BLOCK
```

## Files to Create

### 1. Core Analyzer (TypeScript)
**File:** `tools/wvo_mcp/src/enforcement/loc_analyzer.ts` ✅ (CREATED)
**Size:** ~400 LOC
**Purpose:** Sophisticated LOC analysis logic
**Exports:**
- `analyzeFileLOC(file, content?): LOCAnalysisResult`
- `analyzeCommitLOC(files): CommitAnalysis`
- `formatAnalysis(analysis): string`

### 2. CLI Script (Node.js)
**File:** `scripts/analyze_loc.mjs`
**Size:** ~150 LOC
**Purpose:** Wrapper for pre-commit hook usage
**Behavior:**
- Reads `git diff --cached --numstat`
- Loads file content for each changed file
- Calls analyzer
- Outputs formatted results
- Exits with code 0 (pass) or 1 (block)

### 3. Analytics Logger
**File:** `tools/wvo_mcp/src/enforcement/loc_logger.ts`
**Size:** ~80 LOC
**Purpose:** JSONL logging for analytics
**Exports:**
- `logLOCAnalysis(analysis, outcome)`

### 4. Config File
**File:** `tools/wvo_mcp/src/enforcement/loc_config.ts`
**Size:** ~60 LOC
**Purpose:** Tunable parameters
**Contents:**
```typescript
export const LOC_CONFIG = {
  baseLim it: 150,
  fileTypeMultipliers: { ... },
  patternBonuses: { ... },
  severityThresholds: { ... },
  deletionCreditRatio: 0.5,
};
```

### 5. Pre-commit Hook Integration
**File:** `.githooks/pre-commit` (modify existing)
**Changes:** Add sophisticated LOC check section
**Size:** +50 LOC

### 6. Documentation
**File:** `docs/enforcement/SMART_LOC_ENFORCEMENT.md`
**Size:** ~300 LOC
**Contents:**
- How it works
- File type tiers
- Credit system
- Override mechanism
- Tuning guide

### 7. Tests
**File:** `tools/wvo_mcp/src/enforcement/__tests__/loc_analyzer.test.ts`
**Size:** ~250 LOC
**Coverage:** All acceptance criteria from spec

## Implementation Steps

### Phase 1: Core Analyzer (DONE ✅)
- [x] Create `loc_analyzer.ts`
- [x] Implement file type detection
- [x] Implement deletion credits
- [x] Implement effective LOC calculation
- [x] Implement pattern detection
- [x] Implement progressive enforcement
- [ ] Build and verify types

### Phase 2: CLI Wrapper
- [ ] Create `scripts/analyze_loc.mjs`
- [ ] Integrate with `git diff --cached`
- [ ] Load file contents
- [ ] Call analyzer
- [ ] Format output for terminal
- [ ] Handle exit codes

### Phase 3: Analytics Logging
- [ ] Create `loc_logger.ts`
- [ ] Implement JSONL appending
- [ ] Create analytics directory if needed
- [ ] Log all analyses

### Phase 4: Hook Integration
- [ ] Modify `.githooks/pre-commit`
- [ ] Add sophisticated LOC section
- [ ] Replace flat 150 LOC check
- [ ] Preserve backward compat (flag for fallback)
- [ ] Test locally

### Phase 5: Documentation
- [ ] Create `SMART_LOC_ENFORCEMENT.md`
- [ ] Document tiers and multipliers
- [ ] Explain credit system
- [ ] Provide examples
- [ ] Add troubleshooting section

### Phase 6: Testing
- [ ] Create comprehensive test suite
- [ ] Test all acceptance criteria
- [ ] Test edge cases
- [ ] Integration test with hook

### Phase 7: Deployment
- [ ] Run `npm run build`
- [ ] Sync hooks (`bash scripts/install_hooks.sh`)
- [ ] Test on real commit
- [ ] Monitor first week
- [ ] Tune multipliers if needed

## Module Structure

```
tools/wvo_mcp/src/enforcement/
├── loc_analyzer.ts         # Core logic (400 LOC) ✅
├── loc_logger.ts           # Analytics (80 LOC)
├── loc_config.ts           # Configuration (60 LOC)
├── index.ts                # Public exports
└── __tests__/
    └── loc_analyzer.test.ts  # Tests (250 LOC)
```

## Integration Points

### 1. Pre-commit Hook
**Current:** Flat 150 LOC check with `git diff --numstat`
**New:** Call `node scripts/analyze_loc.mjs`
**Backward compat:** Environment variable `USE_SMART_LOC=0` reverts to flat limit

### 2. Analytics Pipeline
**Output:** `state/analytics/loc_enforcement.jsonl`
**Consumers:**
- Future: Dashboard showing LOC trends
- Future: Tuning script analyzing false positives
- Future: Critic that reviews large commits

### 3. Override Mechanism
**Option A:** Commit message contains `LOC_OVERRIDE: <reason>`
**Option B:** Evidence directory contains `loc_override.yml`
**Both:** Log override to analytics for review

### 4. CLI Usage
```bash
# Analyze staged files (for pre-commit)
node scripts/analyze_loc.mjs --staged

# Analyze specific files (for manual check)
node scripts/analyze_loc.mjs --files src/foo.ts src/bar.ts

# Verbose mode (show all calculations)
node scripts/analyze_loc.mjs --staged --verbose

# Dry run (show results but don't block)
node scripts/analyze_loc.mjs --staged --dry-run
```

## Rollout Strategy

### Week 1: Shadow Mode
- Deploy but don't block (warnings only)
- Collect analytics
- Identify false positives
- Tune multipliers

### Week 2: Soft Enforcement
- Block only severe violations (>200% over limit)
- Continue tuning
- Monitor bypass rate

### Week 3: Full Enforcement
- Enable all blocking
- Monitor agent feedback
- Address issues quickly

### Week 4: Review
- Analyze metrics
- Decide: keep, tune, or revert
- Document lessons learned

## Risk Mitigation

**Risk 1:** Agents game the system (e.g., fake test files)
- **Mitigation:** Log all overrides, review patterns monthly
- **Detection:** High override rate for specific agents

**Risk 2:** Multipliers are miscalibrated
- **Mitigation:** Shadow mode week 1, tune based on data
- **Adjustment:** Config file for easy updates

**Risk 3:** Performance impact on commits
- **Mitigation:** Target <2s analysis time
- **Optimization:** Cache file content, parallel analysis

**Risk 4:** False positives frustrate agents
- **Mitigation:** Clear error messages, easy override
- **Feedback:** Weekly review of blocked commits

## Success Criteria

- ✅ Build passes
- ✅ All tests pass
- ✅ Pre-commit hook works locally
- ✅ Documentation complete
- ✅ No false positives in first 50 commits
- ✅ Bypass rate decreases
- ✅ Agent feedback positive

## Estimated Effort

- Phase 1 (Core): 2 hours ✅ (DONE)
- Phase 2 (CLI): 1 hour
- Phase 3 (Logging): 0.5 hours
- Phase 4 (Hook): 1 hour
- Phase 5 (Docs): 1 hour
- Phase 6 (Tests): 1.5 hours
- Phase 7 (Deploy): 0.5 hours

**Total:** ~8 hours (spread across sessions)

## Dependencies

- TypeScript build system (existing)
- Node.js 24+ (existing)
- Git hooks infrastructure (existing)
- Analytics directory structure (existing)

## Backward Compatibility

- Environment variable `USE_SMART_LOC=0` disables smart enforcement
- Falls back to flat 150 LOC limit
- No breaking changes to existing workflows
