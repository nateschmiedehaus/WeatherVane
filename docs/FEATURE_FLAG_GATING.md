# Feature Flag Gating for Canary Upgrades

## Overview

This document describes how feature flags control behavior during canary upgrade promotion. Flags allow features to be safely toggled at runtime without code changes, enabling staged rollouts and rapid rollback if issues are detected.

**Key Principle**: All new features should be gated behind flags with safe defaults. Features activate only after canary validation passes.

## Live Flags Infrastructure

**Location**: `tools/wvo_mcp/src/state/live_flags.ts` and `tools/wvo_mcp/src/orchestrator/live_flags.ts`

**Storage**: SQLite database in `state/orchestrator.db` (settings table)

**Access**:
- **Reading**: `LiveFlags.getValue(key)` (read-only, auto-polling every 500ms)
- **Writing**: `SettingsStore.upsert(key, value)` (enforced in live mode only)

**CLI Management**:
```bash
# View current flags
ts-node tools/wvo_mcp/scripts/live_flags.ts get

# Set individual flag
ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE=verbose

# Set multiple flags
ts-node tools/wvo_mcp/scripts/live_flags.ts set SCHEDULER_MODE=wsjf DANGER_GATES=1
```

## Feature Flag Definitions

### 1. PROMPT_MODE: Prompt Header Verbosity

**Values**: `'compact'` | `'verbose'`
**Default**: `'compact'`
**Complexity**: Low

**Behavior**:
- `'compact'`: Reduced context, abbreviated prompts, optimized for token efficiency
  - Max entry length: 120 characters
  - Limited history (5 items max)
  - Fewer file references (3 max)
- `'verbose'`: Full context, detailed prompts, comprehensive information
  - Max entry length: 220 characters
  - Extended history (6 items default)
  - Full file references (5 max)

**Where It's Checked**:
- `tools/wvo_mcp/src/orchestrator/context_assembler.ts` - Line 587
  - `lazyContextEnabled()` method returns true when PROMPT_MODE='compact'
  - Controls context trimming, history depth, file references
- `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts`
  - `getPromptMode()` retrieves flag for prompt header generation

**Safe Toggle Sequence**:
1. Shadow validation runs with active mode
2. Canary starts with same mode as active
3. After promotion, toggle to new mode only if stable metrics ≥5min
4. Rollback available anytime with no performance impact

---

### 2. SANDBOX_MODE: Browser Process Pooling

**Values**: `'pool'` | `'none'`
**Default**: `'none'` (no pooling)
**Complexity**: Medium

**Behavior**:
- `'none'`: Fresh browser process for each operation (isolated, slower)
  - Chromium launched with `--no-sandbox`, `--disable-setuid-sandbox`
  - Each screenshot/fetch spawns new process
- `'pool'`: Reuse browser instances across operations (faster, less isolated)
  - Chromium launched without sandbox disable flags (better security)
  - Process reused for multiple operations

**Where It's Checked**:
- `tools/wvo_mcp/src/utils/browser.ts` - Lines 42-80
  - `getBrowser()` method reads SANDBOX_MODE
  - Conditionally adds `--no-sandbox` and `--disable-setuid-sandbox` args
  - Configurable via `browserManager.setLiveFlags(flags)`

**Safety Considerations**:
- Pooling reduces memory/startup overhead but increases isolation risk
- ONLY enable pool mode after extensive single-operation testing
- Never toggle during active web operations
- Monitor browser process count during transition

**Safe Toggle Sequence**:
1. Shadow validation: both active and canary use 'none' mode
2. Post-promotion: monitor 30 seconds in 'none' mode
3. If stable: slowly toggle to 'pool' (10s at a time)
4. Revert to 'none' immediately if resource issues detected

---

### 3. SCHEDULER_MODE: Task Scheduling Algorithm

**Values**: `'wsjf'` | `'legacy'`
**Default**: `'legacy'` (simple status-based)
**Complexity**: High

**Behavior**:
- `'legacy'`: Status-based priority queue
  - needs_review: 105, needs_improvement: 95, pending: 60, etc.
  - Fast calculation, predictable behavior
- `'wsjf'`: Weighted Shortest Job First multi-criteria scheduling
  - Considers: job value, task duration, complexity, risk
  - Optimizes for business value per unit time
  - Slower calculation, smarter prioritization

**Where It's Used**:
- `tools/wvo_mcp/src/orchestrator/task_scheduler.ts`
  - Would check flag in priority calculation (NOT YET IMPLEMENTED)
  - Switch between DEFAULT_STATUS_WEIGHTS and WSJF weights
- `tools/wvo_mcp/src/orchestrator/priority_queue_dispatcher.ts`
  - Would integrate WSJF scoring in priority lane selection

**Implementation Status**: 🚧 NOT YET IMPLEMENTED
- Flag defined and validated
- Infrastructure in place
- WSJF algorithm needs implementation

**Safe Toggle Sequence**:
1. Implement and test WSJF algorithm thoroughly
2. Run shadow validation with legacy mode only
3. Promote with legacy mode
4. Toggle to 'wsjf' only after 1+ hour stable in production
5. Have legacy mode readily available for rollback

---

### 4. SELECTIVE_TESTS: Test Filtering

**Values**: `'1'` (selective) | `'0'` (all - default)
**Default**: `'0'`
**Complexity**: Medium

**Behavior**:
- `'0'`: Run all tests (comprehensive, slow)
  - Full test suite executes for all relevant tasks
  - Ensures complete coverage
- `'1'`: Run only critical tests (fast, selective)
  - Quick smoke tests for critical paths
  - Skip comprehensive verification
  - Faster deployment cycle

**Where It's Checked**:
- `tools/wvo_mcp/src/orchestrator/task_verifier.ts` - Lines 39-54
  - Would read flag to filter test execution
  - Currently runs all modeling verification tests
- Test filtering not yet integrated

**Implementation Status**: 🚧 NOT YET IMPLEMENTED
- Flag defined and validated
- Infrastructure in place
- Test filtering logic needs implementation

**Test Categories** (proposed):
- **Critical**: Unit tests, type checks, linting
- **Standard**: Integration tests, API contract tests
- **Comprehensive**: End-to-end tests, performance tests

**Safe Toggle Sequence**:
1. Only enable in production after extensive testing
2. Shadow validation: run all tests (mode='0')
3. Promote with mode='0'
4. Toggle to mode='1' only after 24+ hours stable
5. Ensure critical tests still pass with mode='1'

---

### 5. DANGER_GATES: Command Safety Enforcement

**Values**: `'1'` (strict) | `'0'` (relaxed - default)
**Default**: `'0'`
**Complexity**: Medium

**Behavior**:
- `'0'` (relaxed - DEFAULT):
  - Block multiline, chaining, command substitution (but with relaxed messages)
  - Block dangerous commands (rm -rf, git reset, etc.)
  - Warnings are clear but enforcement is standard
- `'1'` (strict):
  - SAME checks as mode='0', but with stricter enforcement level
  - Error messages include `[DANGER_GATES]` prefix
  - Can be extended with additional restrictions

**Where It's Checked**:
- `tools/wvo_mcp/src/executor/guardrails.ts` - Lines 146-186
  - `assertCommandSyntax()` accepts `dangerGatesEnabled` parameter
  - `ensureAllowedCommand()` reads flag from liveFlags parameter
- `tools/wvo_mcp/src/executor/command_runner.ts`
  - Would pass liveFlags to guardrail functions

**Safety Model**:
- Danger gates don't change WHAT is blocked, only HOW strictly it's enforced
- Default (mode='0') is already safe for production
- Mode='1' adds visibility and stricter error handling
- Both modes prevent destructive operations

**Safe Toggle Sequence**:
1. Shadow validation: test with both modes
2. Promote with mode='0' (default, safest)
3. Can toggle to mode='1' anytime for stricter monitoring
4. No performance impact either way

---

### 6. MO_ENGINE: Multi-Objective Optimization

**Values**: `'1'` (enabled) | `'0'` (disabled - default)
**Default**: `'0'`
**Complexity**: Very High

**Behavior**:
- `'0'` (DISABLED - DEFAULT):
  - Single-objective: optimize for speed or cost with basic quality checks
  - Current behavior (maintain backwards compatibility)
- `'1'` (ENABLED):
  - Multi-objective: simultaneously optimize cost, speed, quality, resource utilization
  - Pareto frontier approach: generate optimal solutions
  - Select best solution based on current constraints

**Where It's Used**:
- `tools/wvo_mcp/src/orchestrator/operations_manager.ts`
  - Decision engine for task execution
- `tools/wvo_mcp/src/orchestrator/model_router.ts`
  - Model/provider selection
- `tools/wvo_mcp/src/orchestrator/consensus/consensus_engine.ts`
  - Consensus-building algorithm

**Implementation Status**: 🚧 NOT IMPLEMENTED
- Flag defined and validated
- Placeholder methods in FeatureGates
- Full MO framework needs design and implementation

**Future Design**:
- Pareto optimization across objectives
- Weighted scoring with constraint handling
- Cost-quality-speed tradeoff curves
- Runtime adaptation based on resource availability

**Safe Toggle Sequence**:
1. Implement MO framework completely before deploying
2. Test extensively in isolated environments
3. Shadow validation: test with mode='0' only
4. Promote with mode='0'
5. Only enable mode='1' after months of production data and careful tuning

---

## Feature Gates Wrapper Class

**Location**: `tools/wvo_mcp/src/orchestrator/feature_gates.ts`

Provides clean interface for checking all flags:

```typescript
import { FeatureGates } from './feature_gates.js';

const gates = new FeatureGates(liveFlags);

// Check individual features
if (gates.isCompactPromptMode()) { /* ... */ }
if (gates.isSandboxPoolEnabled()) { /* ... */ }
if (gates.isWsjfSchedulerEnabled()) { /* ... */ }
if (gates.isSelectiveTestingEnabled()) { /* ... */ }
if (gates.isDangerGatesEnabled()) { /* ... */ }
if (gates.isMoEngineEnabled()) { /* ... */ }

// Get values directly
const mode = gates.getPromptMode(); // 'compact' | 'verbose'

// Get full snapshot
const snapshot = gates.getSnapshot();
```

---

## Canary Promotion Flow with Flags

### Phase 1: DRY_RUN Shadow Validation

1. **Active Worker**: Starts with ALL flags at safe defaults
   ```
   PROMPT_MODE=compact (safe)
   SANDBOX_MODE=none (safe)
   SCHEDULER_MODE=legacy (safe)
   SELECTIVE_TESTS=0 (comprehensive)
   DANGER_GATES=0 (standard)
   MO_ENGINE=0 (disabled)
   ```

2. **Canary Worker**: Starts with SAME flags as active
   - Shadow validation compares outputs
   - No new features activated during validation
   - Differences indicate behavior change

3. **Shadow Checks**:
   - dispatch, verify, plan_next, orchestrator_status, autopilot_status
   - Output normalized (timestamps scrubbed)
   - Diffs recorded if any mismatches

### Phase 2: Promotion (if shadow passes)

1. **Pre-Promotion Metrics**: Capture baseline
   - Token usage, duration, quality scores
   - Resource utilization
   - Error rates

2. **Worker Switch**: Atomically switch routing to canary
   - `WorkerManager.switchToCanary()` redirects all calls
   - No downtime, atomic cut-over

3. **Health Monitoring** (10 minutes minimum):
   - Token budget check
   - Quality metric trends
   - Error rate monitoring
   - Resource health

### Phase 3: Staged Flag Flips

Only after health checks pass for sufficient time:

```
T+10min: Re-evaluate metrics
T+15min: If stable, unlock Phase 3

Stage 1 (cost optimization):
  PROMPT_MODE=verbose → compact (reduce token use)
  Wait 5min for metrics stabilization

Stage 2 (performance):
  SANDBOX_MODE=none → pool (reduce memory)
  Wait 5min for process stability

Stage 3 (intelligence):
  SCHEDULER_MODE=legacy → wsjf (better scheduling)
  Wait 5min for queue behavior

Stage 4 (testing):
  SELECTIVE_TESTS=0 → 1 (faster tests)
  Wait 5min for cycle time

Stage 5 (security):
  DANGER_GATES=0 → 1 (stricter enforcement)
  Wait 5min for command handling

Stage 6 (advanced):
  MO_ENGINE=0 → 1 (advanced optimization)
  Wait 10min for behavior stabilization
```

**Rollback Criteria** (any stage):
- Token budget exceeded
- Quality metric decline > 10%
- Error rate increase > 5%
- Resource utilization spike > 20%
- Manual request

### Phase 4: Rollback (if needed)

1. **Switch Back**: `WorkerManager.switchToActive()`
2. **Flag Reset**: Reset all flags to safe defaults
3. **Investigation**: Analyze which flag caused issue
4. **Fix & Retry**: Address root cause, re-run upgrade

---

## Safe Defaults Matrix

| Flag | Default | Safe | Risky | Notes |
|------|---------|------|-------|-------|
| PROMPT_MODE | compact | ✅ | verbose | Verbose uses more tokens |
| SANDBOX_MODE | none | ✅ | pool | Pool has isolation risk |
| SCHEDULER_MODE | legacy | ✅ | wsjf | WSJF needs tuning |
| SELECTIVE_TESTS | 0 | ✅ | 1 | Selective skips coverage |
| DANGER_GATES | 0 | ✅ | 1 | Both safe, just different enforcement |
| MO_ENGINE | 0 | ✅ | 1 | Not yet fully implemented |

---

## Monitoring During Promotion

### Key Metrics to Watch

1. **Token Efficiency** (when toggling PROMPT_MODE):
   - Active: PromptMode=compact → avg_tokens/request
   - Canary: PromptMode=verbose → avg_tokens/request
   - Acceptable variance: ±5%

2. **Resource Utilization** (when toggling SANDBOX_MODE):
   - Memory: browser process count × avg_memory
   - CPU: process launch time
   - Acceptable variance: ±10%

3. **Schedule Quality** (when toggling SCHEDULER_MODE):
   - Queue depth, average wait time
   - Task completion time
   - Acceptable variance: ±15%

4. **Test Coverage** (when toggling SELECTIVE_TESTS):
   - Test pass rate
   - Coverage metrics
   - Must maintain ≥95% pass rate

5. **Error Handling** (when toggling DANGER_GATES):
   - Command rejection rate
   - Safety violation count
   - Both modes should be ≈ 0

6. **Decision Quality** (when toggling MO_ENGINE):
   - Consensus satisfaction
   - Solution optimality
   - Resource constraints satisfied

---

## Testing Feature Flags

### Unit Tests

```bash
# Test FeatureGates wrapper
npm test -- feature_gates.test.ts -w tools/wvo_mcp

# Test guardrails with DANGER_GATES
npm test -- guardrails.test.ts -w tools/wvo_mcp
```

### Integration Tests

```bash
# Shadow validation with different flag combinations
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --keep-staging

# Inspect shadow.json for flag-specific diffs
cat experiments/mcp/upgrade/*/shadow.json | jq '.differences'
```

### Manual Testing

```bash
# Set flags before running upgrade
ts-node tools/wvo_mcp/scripts/live_flags.ts set PROMPT_MODE=verbose

# Run shadow validation
./tools/wvo_mcp/scripts/mcp_safe_upgrade.sh --skip-tests --allow-dirty

# Check if verbose mode was used
cat experiments/mcp/upgrade/*/steps.json | grep -i prompt
```

---

## Troubleshooting Flag Issues

### Flag Changes Not Taking Effect

1. Check if LiveFlags are reading from correct database
   ```bash
   sqlite3 state/orchestrator.db "SELECT key, val FROM settings WHERE key='PROMPT_MODE';"
   ```

2. Verify poll interval hasn't expired
   ```bash
   ts-node tools/wvo_mcp/scripts/live_flags.ts get PROMPT_MODE
   ```

3. Restart worker if flags still not updated
   ```bash
   ./scripts/restart_mcp.sh
   ```

### Shadow Validation Shows Unexpected Diffs

1. Review shadow.json for which operation differed
   ```bash
   cat experiments/mcp/upgrade/*/shadow.json | jq '.details'
   ```

2. Check if flag values differ between active and canary
   ```bash
   # Active flags
   ts-node tools/wvo_mcp/scripts/live_flags.ts get

   # Check canary flags (from staging dir)
   WVO_STATE_ROOT=tmp/wv-upgrade-*/state ts-node tools/wvo_mcp/scripts/live_flags.ts get
   ```

3. Expected diffs (flag-intentional changes):
   - Output truncation (PROMPT_MODE)
   - Process creation patterns (SANDBOX_MODE)
   - Queue ordering (SCHEDULER_MODE)
   - Test execution lists (SELECTIVE_TESTS)

---

## Reference Implementation

See these files for examples:

- **Flag Reading**: `src/orchestrator/live_flags.ts:47-48`
- **Flag Writing**: `src/state/live_flags.ts:175-192`
- **Feature Gates**: `src/orchestrator/feature_gates.ts`
- **PROMPT_MODE Usage**: `src/orchestrator/context_assembler.ts:586-588`
- **SANDBOX_MODE Usage**: `src/utils/browser.ts:42-80`
- **DANGER_GATES Usage**: `src/executor/guardrails.ts:146-186`

---

## Future Enhancements

- [ ] Implement SCHEDULER_MODE WSJF algorithm
- [ ] Implement SELECTIVE_TESTS filtering
- [ ] Implement MO_ENGINE multi-objective framework
- [ ] Add flag dependency validation (some flags require others)
- [ ] Add metrics-driven automatic flag optimization
- [ ] Add flag rollback automation on metric degradation
- [ ] Add feature flag audit log
- [ ] Add flag change notifications/webhooks
