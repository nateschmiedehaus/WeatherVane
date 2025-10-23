# Feature Flag Gating System (T6.4.5)

## Overview

The Feature Flag Gating System enables runtime control over experimental features and operational modes without restarting the MCP server. This is critical for canary validation workflows where new features must be tested safely in production before full rollout.

## Architecture

### Live Flags Infrastructure

The system is built on two complementary layers:

**1. SQLite-backed SettingsStore** (`tools/wvo_mcp/src/state/live_flags.ts`)
- Persistent storage of flag values in `state/orchestrator.db`
- ACID-compliant database transactions
- Type-safe flag operations with normalization

**2. Polling LiveFlags Reader** (`tools/wvo_mcp/src/orchestrator/live_flags.ts`)
- Background polling of database (default: 500ms interval)
- In-memory cache for fast lookups
- Automatic value normalization

### MCP Admin Flags Tool** (`mcp_admin_flags`)
- HTTP-like API for flag management (GET, SET, RESET)
- Input validation and error handling
- Atomic multi-flag updates

## Feature Flags

### Compact Prompts (`PROMPT_MODE`)

**Default**: `compact`
**Values**: `compact` | `verbose`
**Purpose**: Control whether prompt headers are compact or verbose

```bash
# Enable verbose prompts for debugging
mcp_admin_flags --action set --flags '{"PROMPT_MODE": "verbose"}'
```

### Sandbox Pooling (`SANDBOX_MODE`)

**Default**: `none` (disabled)
**Values**: `none` | `pool`
**Purpose**: Enable sandbox resource pooling for efficiency

```bash
# Enable sandbox pooling after successful canary validation
mcp_admin_flags --action set --flags '{"SANDBOX_MODE": "pool"}'
```

### Scheduler WSJF Mode (`SCHEDULER_MODE`)

**Default**: `legacy`
**Values**: `legacy` | `wsjf`
**Purpose**: Switch to weighted shortest job first scheduling

```bash
# Activate WSJF scheduler for improved task prioritization
mcp_admin_flags --action set --flags '{"SCHEDULER_MODE": "wsjf"}'
```

### Selective Tests (`SELECTIVE_TESTS`)

**Default**: `0` (disabled)
**Values**: `0` | `1`
**Purpose**: Run only critical tests instead of full suite

```bash
# Enable selective testing for faster iteration
mcp_admin_flags --action set --flags '{"SELECTIVE_TESTS": "1"}'
```

### Danger Gates (`DANGER_GATES`)

**Default**: `0` (disabled)
**Values**: `0` | `1`
**Purpose**: Allow risky operations that require explicit approval

```bash
# Enable danger gates for advanced operations
mcp_admin_flags --action set --flags '{"DANGER_GATES": "1"}'
```

### Multi-Objective Engine (`MO_ENGINE`)

**Default**: `0` (disabled)
**Values**: `0` | `1`
**Purpose**: Enable multi-objective optimization engine

```bash
# Activate MO engine for advanced optimization
mcp_admin_flags --action set --flags '{"MO_ENGINE": "1"}'
```

### Consensus Engine (`CONSENSUS_ENGINE`)

**Default**: `1` (enabled)
**Values**: `0` | `1`
**Purpose**: Enable consensus-based decision making

### Other Flags

- `OTEL_ENABLED`: OpenTelemetry tracing (default: disabled)
- `UI_ENABLED`: UI features (default: disabled)
- `DISABLE_NEW`: Disable all new implementations (default: disabled)
- `RESEARCH_LAYER`: Enable research features (default: enabled)
- `INTELLIGENT_CRITICS`: Advanced critic logic (default: enabled)
- `EFFICIENT_OPERATIONS`: Operation optimization (default: enabled)
- `CRITIC_INTELLIGENCE_LEVEL`: 1-3 (default: 2)
- `RESEARCH_TRIGGER_SENSITIVITY`: 0.0-1.0 (default: 0.5)
- `CRITIC_REPUTATION`: Enable critic reputation tracking
- `EVIDENCE_LINKING`: Link evidence between decisions
- `VELOCITY_TRACKING`: Track execution velocity

## Usage

### Getting Current Flags

```bash
# Get all flags
mcp_admin_flags --action get

# Get specific flag
mcp_admin_flags --action get --flag PROMPT_MODE
```

### Setting Flags

```bash
# Set single flag
mcp_admin_flags --action set --flags '{"SANDBOX_MODE": "pool"}'

# Set multiple flags atomically
mcp_admin_flags --action set --flags '{
  "PROMPT_MODE": "compact",
  "SANDBOX_MODE": "pool",
  "SCHEDULER_MODE": "wsjf"
}'
```

### Resetting Flags

```bash
# Reset single flag to default
mcp_admin_flags --action reset --flag SANDBOX_MODE

# Reset all flags (requires multiple calls)
```

## Canary Validation Workflow

### 1. Baseline Measurement

Establish performance metrics with default settings:

```bash
# Verify all flags are at defaults
mcp_admin_flags --action get
```

### 2. Feature Enablement

Enable the feature for canary testing:

```bash
# Enable the new feature
mcp_admin_flags --action set --flags '{"NEW_FEATURE": "1"}'
```

### 3. Monitoring

Monitor system behavior, resource usage, and error rates for 24-48 hours.

### 4. Success Criteria

- Error rate < 0.1%
- Response time within baseline ±5%
- Memory usage stable
- No resource leaks
- User-reported issues: 0

### 5. Promotion to Production

After successful canary:

```bash
# Feature is already in production via flag
# Continue monitoring for 7 days before removing kill switch
```

### 6. Rollback

If issues detected:

```bash
# Immediately disable the feature
mcp_admin_flags --action reset --flag NEW_FEATURE
```

## Implementation Details

### Flag Normalization

Each flag type has specific normalization rules:

**String Modes**: `compact|verbose`, `none|pool`, `legacy|wsjf`
- Trimmed and lowercased
- Invalid values default to safe option

**Boolean Flags**: `0|1`
- Only `"1"` is true
- Everything else is `"0"`

**Numeric Ranges**:
- `RESEARCH_TRIGGER_SENSITIVITY`: Clamped to [0.0, 1.0]
- `CRITIC_INTELLIGENCE_LEVEL`: Clamped to [1, 3]

### Atomicity

Multi-flag updates are transactional:

```typescript
store.upsertMany({
  SANDBOX_MODE: 'pool',
  SCHEDULER_MODE: 'wsjf',
  MO_ENGINE: '1',
});
// All three flags updated atomically or none
```

### Polling vs Polling

Changes propagate via background polling (500ms default):

```
SET flag → Database update → (wait up to 500ms) → LiveFlags cache refresh → Agent sees new value
```

For immediate visibility in scripts, read directly from database or wait for next cache refresh.

## Default Values

```typescript
{
  PROMPT_MODE: 'compact',           // Conservative
  SANDBOX_MODE: 'none',             // Safe default
  OTEL_ENABLED: '0',                // Disabled
  SCHEDULER_MODE: 'legacy',         // Stable
  SELECTIVE_TESTS: '0',             // Full suite
  DANGER_GATES: '0',                // Safe
  UI_ENABLED: '0',                  // Disabled
  MO_ENGINE: '0',                   // Pending validation
  DISABLE_NEW: '0',                 // Enabled
  RESEARCH_LAYER: '1',              // Beneficial
  INTELLIGENT_CRITICS: '1',         // Beneficial
  EFFICIENT_OPERATIONS: '1',        // Beneficial
  RESEARCH_TRIGGER_SENSITIVITY: '0.5',
  CRITIC_INTELLIGENCE_LEVEL: '2',
  CRITIC_REPUTATION: '0',
  EVIDENCE_LINKING: '0',
  VELOCITY_TRACKING: '0',
  CONSENSUS_ENGINE: '1',            // Beneficial
}
```

## Testing

### Test Coverage

Run comprehensive tests:

```bash
npm test -- mcp_admin_flags.test.ts tool_router_admin_flags.test.ts
```

### Test Suites

1. **Flag Keys** - Validates all required flags exist
2. **Flag Normalization** - Tests value normalization per flag type
3. **SettingsStore** - Database operations (read, upsert, upsertMany)
4. **Canary Validation Gates** - Simulates canary workflows
5. **Feature Flag Combinations** - Tests multiple flags together
6. **Error Handling** - Invalid flags, missing parameters
7. **Admin Tool Behavior** - GET, SET, RESET actions

### Example Test

```typescript
it('should enable sandbox pooling for canary', async () => {
  const store = new SettingsStore({
    workspaceRoot: testWorkspaceRoot,
    sqlitePath: testDbPath,
    readOnly: false,
  });

  const result = store.upsert('SANDBOX_MODE', 'pool');
  expect(result.SANDBOX_MODE).toBe('pool');
  store.close();
});
```

## Best Practices

### 1. One Feature Per Flag

Don't overload flags with multiple features.

### 2. Canary Validation Required

Never promote features to production without successful canary testing.

### 3. Monitoring Integration

Integrate flag changes with observability systems:
- Alert on flag changes
- Correlate changes with metrics
- Tag logs with active flags

### 4. Documentation

Keep flag descriptions updated in this document as new flags are added.

### 5. Rollback Plan

Always have a clear rollback procedure before enabling flags.

### 6. Gradual Rollout

Use multiple feature flags to enable features in phases:
- Phase 1: Beta feature flag + opt-in flag
- Phase 2: Beta off, general availability flag
- Phase 3: Monitor and stabilize

## Performance Characteristics

### Polling Overhead

- Database queries: ~1 per 500ms (configurable)
- Memory usage: ~2KB for flag cache
- CPU impact: Negligible

### Flag Access

- Lookup time: O(1) constant
- Cache hit rate: 99%+ after initial load
- Propagation latency: <500ms

## Troubleshooting

### Flag Not Taking Effect

1. Verify flag was set: `mcp_admin_flags --action get --flag FLAG_NAME`
2. Check flag value: Should match expected value and type
3. Wait for cache refresh: Up to 500ms
4. Check agent is reading from LiveFlags, not hardcoded value

### Flag Persists After Reset

1. Verify reset was successful: `mcp_admin_flags --action get --flag FLAG_NAME`
2. Check it returned to DEFAULT_LIVE_FLAGS value
3. If not, the reset may have failed due to database lock

### Database Lock Errors

If you see database lock errors:

1. Check for other open connections to `orchestrator.db`
2. Verify database file is not on a slow filesystem
3. Consider increasing polling interval if in noisy environment

## Future Enhancements

- [ ] Flag deprecation warnings
- [ ] Flag change notifications
- [ ] Scheduled flag changes
- [ ] Feature flag analytics
- [ ] A/B testing support
- [ ] Gradual rollout percentage-based gates
- [ ] Flag validation hooks

## References

- `tools/wvo_mcp/src/state/live_flags.ts` - SettingsStore implementation
- `tools/wvo_mcp/src/orchestrator/live_flags.ts` - LiveFlags polling reader
- `tools/wvo_mcp/src/worker/tool_router.ts` - Admin flags handler
- `tools/wvo_mcp/src/tests/mcp_admin_flags.test.ts` - Flag tests
- `tools/wvo_mcp/src/tests/tool_router_admin_flags.test.ts` - Integration tests
