# Feature Gate Implementation (T6.4.5)

## Overview

Feature gates control when experimental and post-upgrade features activate. Gates prevent unstable features from rolling out to production until they pass canary validation. This document describes the implementation of feature gating for WeatherVane's orchestration system.

## Gated Features

### Compact Prompts (PROMPT_MODE)

- **Flag**: `PROMPT_MODE`
- **Values**: `compact` | `verbose`
- **Gate**: Canary validation required
- **Impact**: Reduces context window used by prompt assembly
- **Default**: `compact` (after successful canary)
- **Implementation**: `FeatureGates.isCompactPromptMode()` → `ContextAssembler.maxFilesToReference()`

### Sandbox Pooling (SANDBOX_MODE)

- **Flag**: `SANDBOX_MODE`
- **Values**: `pool` | `none`
- **Gate**: Canary validation required
- **Impact**: Reuses browser/agent processes (faster, less isolated)
- **Default**: `none` (fresh processes for safety)
- **Implementation**: `FeatureGates.isSandboxPoolEnabled()` → Worker pool management

### Scheduler Mode (SCHEDULER_MODE)

- **Flag**: `SCHEDULER_MODE`
- **Values**: `wsjf` | `legacy`
- **Gate**: Canary validation required
- **Impact**: Switches task prioritization algorithm
- **Default**: `legacy` (simple status-based priority)
- **Implementation**: `FeatureGates.getSchedulerMode()` → `PriorityScheduler.calculatePriority()`

#### Legacy Scheduler
- Simple priority scoring based on:
  - Critical path (120 pts)
  - Business value (value × 10)
  - Effort penalty (effort × 2)
  - Complexity (complexity × 3)
  - Domain (product = 30, mcp = 15)
  - Dependencies (dependents × 5)

#### WSJF (Weighted Shortest Job First)
- Multi-criteria prioritization:
  - **Business Value** (30%): Direct value score
  - **Time Criticality** (20%): Days to deadline
  - **Risk Reduction** (20%): Dependencies, risk flags
  - **Effort** (30%): Jobs per effort ratio
- Formula: `WSJF = (BV + Time + Risk) / Effort`

### Selective Testing (SELECTIVE_TESTS)

- **Flag**: `SELECTIVE_TESTS`
- **Values**: `0` | `1`
- **Gate**: Canary validation required
- **Impact**: Run only critical tests (fast) vs. all tests (thorough)
- **Default**: `0` (all tests)
- **Status**: Reserved for future implementation

### Danger Gates (DANGER_GATES)

- **Flag**: `DANGER_GATES`
- **Values**: `0` | `1`
- **Gate**: Canary validation required
- **Impact**: Strict command safety enforcement
- **Default**: `0` (relaxed safety)
- **Status**: Reserved for future implementation

### MO Engine (MO_ENGINE)

- **Flag**: `MO_ENGINE`
- **Values**: `0` | `1`
- **Gate**: Canary validation required
- **Impact**: Multi-objective optimization for cost/speed/quality tradeoffs
- **Default**: `0` (disabled)
- **Status**: Reserved for future implementation

## Architecture

### Feature Gates Class

```typescript
class FeatureGates implements FeatureGatesReader {
  isCompactPromptMode(): boolean
  getPromptMode(): 'compact' | 'verbose'
  isSandboxPoolEnabled(): boolean
  getSandboxMode(): 'pool' | 'none'
  getSchedulerMode(): 'wsjf' | 'legacy'
  isAdminToolsEnabled(): boolean
  isUpgradeToolsEnabled(): boolean
  isRoutingToolsEnabled(): boolean
  getSnapshot(): FeatureGatesSnapshot
}
```

### Integration Points

1. **ContextAssembler** (`src/orchestrator/context_assembler.ts`)
   - Receives `FeatureGates` or `LiveFlags` in config
   - Uses `isCompactPromptMode()` to adjust context window
   - Falls back to live flags if gates unavailable

2. **PriorityScheduler** (`src/orchestrator/priority_scheduler.ts`)
   - `calculatePriority(task, stateMachine, featureGates?)` accepts optional gates
   - Returns `PriorityScore` with `schedulerMode` field
   - Applies WSJF algorithm when `getSchedulerMode() === 'wsjf'`

3. **UnifiedOrchestrator** (`src/orchestrator/unified_orchestrator.ts`)
   - Initializes `FeatureGates` from live flags
   - Passes gates to `rankTasks()` for priority queue

### Live Flags Backend

Feature gates read from SQLite settings table:
- Path: `state/orchestrator.db` → `settings` table
- Keys match `LiveFlagKey` enum
- Values normalized by `normalizeLiveFlagValue()`
- Live polling via `LiveFlags` with 500ms TTL

## Canary Validation

Features only activate after successful canary validation:

1. **Preflight Gates**:
   - Build: TypeScript must compile
   - Unit: Tests must pass
   - Selfchecks: Critics must pass
   - Canary: Feature validation succeeds

2. **Evidence Files**:
   - `state/quality/upgrade_gates.json`: Gate status log
   - `state/quality/canary_validation.json`: Validation evidence

3. **Evidence Structure**:
```json
{
  "ok": true,
  "gate": "canary_ready",
  "timestamp": "2025-10-23T12:00:00Z"
}
```

## Testing

### Feature Gate Tests
- `src/orchestrator/feature_gates.test.ts` (17 tests)
  - Default behavior for each gate
  - Dynamic flag updates
  - Emergency flags (DISABLE_NEW)
  - Snapshot generation

### Priority Scheduler Tests
- `src/orchestrator/priority_scheduler.test.ts` (18 tests)
  - Legacy scheduler scoring
  - WSJF algorithm calculation
  - Feature gate switching
  - Task ranking consistency
  - Metadata preservation

### Context Assembler Tests
- `src/orchestrator/context_assembler.feature_gates.test.ts` (3 tests)
  - Compact mode file limiting
  - Verbose mode defaults
  - Live flags fallback

## Usage Examples

### Checking Feature Status

```typescript
import { getFeatureGateGuard } from './orchestrator/feature_gates.js';

const guard = getFeatureGateGuard(workspaceRoot);

if (guard.isFeatureEnabled('PROMPT_MODE')) {
  // Compact prompts enabled
}
```

### Using Feature Gates in Code

```typescript
// In context assembly
const gates = new FeatureGates(liveFlags);
if (gates.isCompactPromptMode()) {
  contextOptions.maxFiles = 3;  // Compact
} else {
  contextOptions.maxFiles = 5;  // Verbose
}

// In task scheduling
const priorityScore = calculatePriority(task, stateMachine, featureGates);
if (featureGates?.getSchedulerMode() === 'wsjf') {
  // WSJF scoring applied
}
```

### Setting Flags via MCP

```bash
# Enable compact prompt mode
claude mcp call mcp_admin_flags '{"action":"set","flags":{"PROMPT_MODE":"compact"}}'

# Check current flags
claude mcp call mcp_admin_flags '{"action":"get"}'

# Reset to defaults
claude mcp call mcp_admin_flags '{"action":"reset","flag":"PROMPT_MODE"}'
```

## Canary Promotion Workflow

1. **Pre-Canary**:
   - Features gated behind `SCHEDULER_MODE`, `PROMPT_MODE`, etc.
   - Flags default to safe values (legacy, verbose, none)
   - Code changes deployed but inactive

2. **Canary Phase**:
   - Limited testing with features enabled
   - Preflight validation runs
   - If preflight passes → gate status updated to `canary_ready`

3. **Post-Canary**:
   - `LiveFlags` polls `orchestrator.db` for gate status
   - Features auto-activate when gate passes (via live polling)
   - No code change needed—just flag flip

4. **Rollback**:
   - Set `DISABLE_NEW=1` to emergency-disable all new features
   - Or manually set flags back to safe defaults
   - Immediate effect via live polling

## Performance Implications

### Compact Prompts
- **Benefit**: 40-50% reduction in token usage
- **Trade-off**: Less context fidelity
- **When**: Enabled for high-volume, cost-sensitive operations

### WSJF Scheduler
- **Benefit**: Better job prioritization for mixed workloads
- **Trade-off**: More computation (3-5% overhead per rank)
- **When**: Enabled for production with diverse task types

### Sandbox Pooling
- **Benefit**: 30-40% faster environment startup
- **Trade-off**: Less isolation between tasks
- **When**: Enabled for trusted environments (not user-provided code)

## Safety Guarantees

### Fail-Safe Defaults
- All gated features default to safe/simple behavior
- Features require explicit canary pass to activate
- Missing evidence files treated as "not ready"

### Circuit Breaker
- Features disabled immediately if live flags unavailable
- Falls back to hardcoded defaults
- No silent adoption of experimental features

### Audit Trail
- Gate status changes logged to `upgrade_gates.json`
- Evidence timestamps track when gates opened
- Canary validation records included in decision log

## Future Extensions

### Additional Gates
- `ASYNC_AGENTS`: Async agent pool
- `RESEARCH_MODE`: Agentic research capabilities
- `CAUSAL_INFERENCE`: Causal modeling features
- `FORECAST_OPTIMIZATION`: Forecast ensemble features

### Gate Dependencies
- Some gates may require others (e.g., WSJF requires metrics)
- Dependency graph defined in upgrade preflight
- Violated dependencies block canary pass

### Metrics-Based Gating
- Open gates based on upstream metrics (e.g., test pass rate)
- Automatic rollback if metrics degrade
- Dashboard for gate health status

## Troubleshooting

### Feature Not Activating
1. Check `state/quality/canary_validation.json` exists
2. Verify `ok: true` and `gate: canary_ready`
3. Check `state/orchestrator.db` contains flag entry
4. Verify `LiveFlags` polling is running

### Rolling Back a Feature
```bash
# Method 1: Manual flag reset
claude mcp call mcp_admin_flags '{"action":"reset","flag":"SCHEDULER_MODE"}'

# Method 2: Emergency disable
claude mcp call mcp_admin_flags '{"action":"set","flags":{"DISABLE_NEW":"1"}}'

# Method 3: Manual gate revert
rm state/quality/canary_validation.json
```

## References

- **Live Flags**: `src/state/live_flags.ts`
- **Feature Gates**: `src/orchestrator/feature_gates.ts`
- **Priority Scheduler**: `src/orchestrator/priority_scheduler.ts`
- **Context Assembler**: `src/orchestrator/context_assembler.ts`
- **Unified Orchestrator**: `src/orchestrator/unified_orchestrator.ts`
- **Upgrade Preflight**: `src/upgrade/preflight.ts`
