# MCP Admin Flags Tool — Runtime Control Without Restart

## Overview

The `mcp_admin_flags` tool provides infrastructure-level control over runtime flags that govern tool behavior, feature toggles, and system configuration. Changes take effect **immediately** without restarting the MCP server.

**Tool ID**: `mcp_admin_flags`
**Capability Level**: Medium
**Atomic Operations**: Yes (all updates within single database transaction)
**Impact Scope**: Global (affects all subsequent tool invocations)

## Actions

### 1. Get Current Flags

**Purpose**: Read all flags or a single flag value.

```json
{"action": "get"}
```

Returns all current flag values with their types and settings.

**Get Single Flag**:

```json
{"action": "get", "flag": "PROMPT_MODE"}
```

Returns the value of a specific flag.

**Response Example**:

```json
{
  "PROMPT_MODE": "compact",
  "SANDBOX_MODE": "none",
  "OTEL_ENABLED": "0",
  ...
}
```

### 2. Set Flags

**Purpose**: Update one or more flags atomically without MCP restart.

```json
{
  "action": "set",
  "flags": {
    "PROMPT_MODE": "verbose",
    "OTEL_ENABLED": "1",
    "CRITIC_INTELLIGENCE_LEVEL": "3"
  }
}
```

**Key Characteristics**:
- **Atomic**: All updates happen within a single database transaction
- **Transactional**: Partial failure = no changes applied
- **Immediate**: Changes visible via LiveFlags polling (500ms default)
- **Validated**: Each flag value is normalized before storage

**Response Example**:

```json
{
  "updated_flags": {
    "PROMPT_MODE": "verbose",
    "OTEL_ENABLED": "1",
    "CRITIC_INTELLIGENCE_LEVEL": "3"
  },
  "note": "Changes take effect immediately via LiveFlags polling"
}
```

### 3. Reset Flag to Default

**Purpose**: Restore a single flag to its default value.

```json
{"action": "reset", "flag": "PROMPT_MODE"}
```

**Response Example**:

```json
{
  "flag": "PROMPT_MODE",
  "default_value": "compact"
}
```

## Available Flags

### Prompt & Output Control

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `PROMPT_MODE` | Enum | `compact` \| `verbose` | Optimize prompt size vs. detail |
| `SANDBOX_MODE` | Enum | `none` \| `pool` | Execution sandbox strategy |

### Observability & Tracing

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `OTEL_ENABLED` | Boolean | `0` \| `1` | Enable OpenTelemetry tracing |

### Scheduling & Task Execution

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `SCHEDULER_MODE` | Enum | `legacy` \| `wsjf` | Task scheduling algorithm (WSJF = Weighted Shortest Job First) |
| `SELECTIVE_TESTS` | Boolean | `0` \| `1` | Run only critical tests (skip non-essential) |

### Safety & Risk Management

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `DANGER_GATES` | Boolean | `0` \| `1` | Allow risky operations (requires explicit approval) |

### Feature Toggles

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `UI_ENABLED` | Boolean | `0` \| `1` | Enable UI features |
| `MO_ENGINE` | Boolean | `0` \| `1` | Multi-objective optimization engine |
| `DISABLE_NEW` | Boolean | `0` \| `1` | Disable new implementations (rollback to stable) |
| `RESEARCH_LAYER` | Boolean | `0` \| `1` | Enable research/experimental features |

### Intelligence & Logic

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `INTELLIGENT_CRITICS` | Boolean | `0` \| `1` | Enable advanced critic reasoning logic |
| `EFFICIENT_OPERATIONS` | Boolean | `0` \| `1` | Optimize operations for speed/token efficiency |
| `CONSENSUS_ENGINE` | Boolean | `0` \| `1` | Enable consensus-based decision making |
| `CRITIC_INTELLIGENCE_LEVEL` | Integer | `1` \| `2` \| `3` | Critic reasoning depth (3 = deep analysis) |

### Sensitivity & Thresholds

| Flag | Type | Values | Purpose |
|------|---humor——---|---------|---------|
| `RESEARCH_TRIGGER_SENSITIVITY` | Float | `0.0` – `1.0` | Research activation threshold (0.5 = medium) |

### Reputation & Attribution

| Flag | Type | Values | Purpose |
|------|------|--------|---------|
| `CRITIC_REPUTATION` | Boolean | `0` \| `1` | Track critic accuracy over time |
| `EVIDENCE_LINKING` | Boolean | `0` \| `1` | Link critic decisions to source evidence |
| `VELOCITY_TRACKING` | Boolean | `0` \| `1` | Monitor team velocity metrics |

## Default Values

All flags have sensible defaults configured in `src/state/live_flags.ts:DEFAULT_LIVE_FLAGS`:

```typescript
PROMPT_MODE: 'compact'
SANDBOX_MODE: 'none'
OTEL_ENABLED: '0'
SCHEDULER_MODE: 'legacy'
SELECTIVE_TESTS: '0'
DANGER_GATES: '0'
UI_ENABLED: '0'
MO_ENGINE: '0'
DISABLE_NEW: '0'
RESEARCH_LAYER: '1'
INTELLIGENT_CRITICS: '1'
EFFICIENT_OPERATIONS: '1'
RESEARCH_TRIGGER_SENSITIVITY: '0.5'
CRITIC_INTELLIGENCE_LEVEL: '2'
CRITIC_REPUTATION: '0'
EVIDENCE_LINKING: '0'
VELOCITY_TRACKING: '0'
CONSENSUS_ENGINE: '1'
```

## Implementation Details

### Storage

- **Backend**: SQLite database (`state/orchestrator.db`)
- **Table**: `settings` (key-value store)
- **Schema**: `(key TEXT PRIMARY KEY, val TEXT, updated_at INTEGER)`
- **Indexing**: Fast lookups via primary key

### Polling & Propagation

The `LiveFlags` class polls the database every 500ms (configurable):

```typescript
private readonly pollInterval: number = 500; // milliseconds
```

Changes made via the admin tool are immediately persisted to SQLite and visible to all components within 500ms.

### Value Normalization

Each flag type has a normalizer function (`normalizeLiveFlagValue`) that:

1. **Validates input type** (string, number, or boolean → string)
2. **Enforces constraints** (enums, ranges, clamping)
3. **Handles invalid values** (falls back to defaults)

Example:

```typescript
// CRITIC_INTELLIGENCE_LEVEL: clamped to 1-3 range
const clamped = Math.min(3, Math.max(1, numeric));

// RESEARCH_TRIGGER_SENSITIVITY: clamped to 0.0-1.0 range
const clamped = Math.min(1, Math.max(0, numeric));
```

### Transaction Safety

The `SettingsStore.upsert()` method ensures atomic updates:

```sql
INSERT INTO settings (key, val, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(key) DO UPDATE SET
  val = excluded.val,
  updated_at = excluded.updated_at
```

All operations within a single `upsert` call are part of the same transaction.

## Use Cases

### 1. Enable Detailed Tracing for Debugging

```json
{
  "action": "set",
  "flags": {
    "OTEL_ENABLED": "1",
    "PROMPT_MODE": "verbose"
  }
}
```

### 2. Activate Advanced Critic Reasoning

```json
{
  "action": "set",
  "flags": {
    "INTELLIGENT_CRITICS": "1",
    "CRITIC_INTELLIGENCE_LEVEL": "3"
  }
}
```

### 3. Rollback to Stable Implementation

```json
{
  "action": "set",
  "flags": {
    "DISABLE_NEW": "1",
    "RESEARCH_LAYER": "0"
  }
}
```

### 4. Run Critical Tests Only

```json
{
  "action": "set",
  "flags": {
    "SELECTIVE_TESTS": "1"
  }
}
```

### 5. Enable Research Features

```json
{
  "action": "set",
  "flags": {
    "RESEARCH_LAYER": "1",
    "RESEARCH_TRIGGER_SENSITIVITY": "0.3"
  }
}
```

## Integration with Tool Routing

Future versions of this tool will support **v1/v2 handler routing**:

```json
{
  "action": "set",
  "flags": {
    "TOOL_HANDLER_VERSION": "v2",
    "FEATURES_TO_ROUTE": "consensus_engine,model_router"
  }
}
```

This enables **canary deployments** of new tool versions without MCP restart.

## Error Handling

### Unknown Flag

```json
{
  "error": "Flag not found",
  "message": "Unknown flag: INVALID_FLAG"
}
```

### Invalid Action

```json
{
  "error": "Invalid action",
  "message": "Unknown action: 'invalid'"
}
```

### Missing Required Parameter

```json
{
  "error": "Invalid input",
  "message": "set action requires 'flags' object"
}
```

## Monitoring & Observability

Flag changes are recorded in:

1. **SQLite updated_at timestamps**: `SELECT key, val, updated_at FROM settings WHERE updated_at > ?`
2. **MCP telemetry**: Operations logged via `logInfo()` in `telemetry/logger.ts`
3. **Audit trail**: Each change persists in the database for forensics

## Performance Characteristics

- **Get Operation**: O(1) — single key lookup
- **Set Operation**: O(n) — n updates, each O(1)
- **Reset Operation**: O(1) — single UPSERT
- **Propagation Latency**: ~500ms (LiveFlags poll interval)
- **Database Write**: <1ms per operation (SQLite WAL mode)

## Security Considerations

⚠️ **Important**: This tool modifies behavior across the entire MCP system. Access should be restricted to:

- ✅ Infrastructure engineers
- ✅ Authorized CI/CD systems
- ✅ Emergency response teams

❌ Do NOT expose this tool to untrusted users.

## Example Workflow

```bash
# 1. Check current settings
{"action": "get"}

# 2. Enable debug mode
{"action": "set", "flags": {"OTEL_ENABLED": "1"}}

# 3. Monitor for 5 minutes...
# (tracing is now active in all operations)

# 4. Disable debug mode
{"action": "reset", "flag": "OTEL_ENABLED"}

# 5. Verify reset
{"action": "get", "flag": "OTEL_ENABLED"}
```

## Related Documentation

- **LiveFlags Architecture**: `src/orchestrator/live_flags.ts`
- **Settings Storage**: `src/state/live_flags.ts:SettingsStore`
- **Feature Gates**: `src/orchestrator/feature_gates.ts`
- **Telemetry**: `src/telemetry/logger.ts`
