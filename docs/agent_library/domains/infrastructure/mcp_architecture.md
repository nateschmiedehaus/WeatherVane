# MCP Architecture

**Model Context Protocol (MCP)** server for multi-agent orchestration.

---

## Quick Reference

**Primary Documentation**: `/docs/orchestration/IMPLEMENTATION_COMPLETE.md`

**Location**: `tools/wvo_mcp/`

**Purpose**: Provide tools and state management for autonomous agent workflows

---

## MCP Tools (40+ available)

### Planning Tools
- `plan_next`: Get prioritized tasks
- `plan_update`: Update task status
- `roadmap_check_and_extend`: Auto-extend roadmap when needed

### State Management
- `context_write`: Write to running context
- `context_snapshot`: Create checkpoint
- `state_save`: Save compact checkpoint
- `state_prune`: Clean old state data

### Quality Tools
- `quality_standards`: View excellence criteria
- `quality_checklist`: Get task-specific quality checks
- `quality_philosophy`: Core quality principles

### Execution Tools
- `fs_read`: Read files from workspace
- `fs_write`: Write files to workspace
- `cmd_run`: Execute shell commands
- `critics_run`: Run quality critic suites

### Provider Management
- `provider_status`: Check provider capacity
- `auth_status`: Verify authentication

### Advanced Tools
- `screenshot_capture`: Capture web page screenshots
- `screenshot_session`: Intelligent multi-page capture
- `lsp_initialize`: Start language servers
- `lsp_definition`: Jump to definition
- `lsp_references`: Find all references
- `lsp_hover`: Get type information

**Full list**: Use `mcp__weathervane__wvo_status` tool

---

## Architecture Diagram

```
┌──────────────────────────────────────────────┐
│          MCP Client (Codex/Claude)           │
└───────────────────┬──────────────────────────┘
                    │
                    ↓ JSON-RPC
┌──────────────────────────────────────────────┐
│              MCP Server                      │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────┐     │
│  │  Tool Router                       │     │
│  │  - Route tool calls                │     │
│  │  - Validate inputs                 │     │
│  │  - Execute safely                  │     │
│  └────────┬───────────────────────────┘     │
│           │                                  │
│           ↓                                  │
│  ┌────────────────────────────────────┐     │
│  │  State Machine (SQLite)            │     │
│  │  - Tasks table                     │     │
│  │  - Dependencies table              │     │
│  │  - Agent pool                      │     │
│  └────────┬───────────────────────────┘     │
│           │                                  │
│           ↓                                  │
│  ┌────────────────────────────────────┐     │
│  │  Orchestrator                      │     │
│  │  - Task scheduling                 │     │
│  │  - Agent coordination              │     │
│  │  - Health monitoring               │     │
│  └────────────────────────────────────┘     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## Tool Invocation Flow

```
1. Client sends tool request
   └─→ JSON-RPC message: {method: "tools/call", params: {...}}

2. MCP Server receives & validates
   ├─→ Check tool exists
   ├─→ Validate parameters
   └─→ Check permissions (if needed)

3. Tool Router dispatches
   └─→ Call appropriate handler function

4. Handler executes
   ├─→ Read/write state (if needed)
   ├─→ Execute shell command (if cmd_run)
   └─→ Return result

5. Result sent back to client
   └─→ JSON-RPC response: {result: {...}}
```

---

## State Management

### SQLite Database

**Location**: `state/state.db`

**Schema**: See [Infrastructure Overview](/docs/agent_library/domains/infrastructure/overview.md#database-schema)

**Access**:
```typescript
// Via StateMachine API (preferred)
const tasks = stateMachine.getTasks({ status: ['pending'] });

// Via direct SQL (use sparingly)
const db = stateMachine.getDatabase();
const result = db.prepare('SELECT * FROM tasks WHERE status = ?').all('pending');
```

### Roadmap Sync

**Source of truth**: `state/roadmap.yaml`

**Sync to database**:
```bash
node scripts/force_roadmap_sync.mjs
```

**Auto-sync**: On orchestrator startup

**Validation**:
```bash
node scripts/diagnose_dependency_sync.mjs
```

---

## Safety & Sandboxing

### Command Execution

**Workspace-confined**: All commands run from `$ROOT` directory

**Dangerous commands blocked**:
- `rm -rf /`
- `git reset --hard`
- `git push --force` (to main/master)
- Destructive operations

**Safe commands allowed**:
- `git add`, `git commit`, `git push` (to feature branches)
- `npm install`, `npm build`, `npm test`
- `make` targets
- Python scripts

### File Operations

**Restricted to workspace**: Cannot access files outside `$ROOT`

**Allowed**:
- Read any file in workspace
- Write files in workspace
- Create directories

**Forbidden**:
- Access `/etc`, `/var`, system directories
- Write to `/tmp` (unless explicitly needed)

---

## Configuration

### Environment Variables

```bash
# Workspace root
export ROOT=/path/to/weathervane

# MCP entry point
export MCP_ENTRY=tools/wvo_mcp/dist/index.js

# OpenTelemetry
export OTEL_ENABLED=1

# Feature flags
export PROMPT_MODE=compact  # or verbose
export UI_ENABLED=1
export RESEARCH_LAYER=1
```

### MCP Server Config

**File**: `tools/wvo_mcp/mcp.json`

```json
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ROOT": "/path/to/workspace"
      }
    }
  }
}
```

---

## Telemetry

### OpenTelemetry Spans

**When enabled** (`OTEL_ENABLED=1`):

**Spans captured**:
- Tool calls (duration, parameters, results)
- Task execution (assignment → done)
- Critic runs (duration, pass/fail)
- Provider API calls (model, tokens, latency)

**Export**: `state/telemetry/usage.jsonl`

**Analysis**: Use `scripts/format_telemetry.mjs`

---

## Performance

### Tool Call Latency

**Targets**:
- `plan_next`: <50ms
- `context_write`: <10ms
- `fs_read`: <20ms
- `cmd_run`: Varies (depends on command)
- `critics_run`: <5 minutes (per critic)

**Optimization**:
- Database indexes (on status, priority, epic_id)
- Query result caching
- Lazy loading (only load needed data)

---

## Troubleshooting

### MCP Server Not Responding

**Symptoms**: Tools timeout or fail

**Diagnosis**:
```bash
# Check server is running
ps aux | grep "node.*index.js"

# Check logs
tail -f /tmp/wvo_mcp.log
```

**Fix**:
```bash
# Restart MCP server
./tools/wvo_mcp/scripts/restart_mcp.sh
```

### Database Lock Errors

**Symptoms**: "database is locked" errors

**Cause**: Multiple processes accessing SQLite simultaneously

**Fix**:
```bash
# Ensure only one orchestrator running
pkill -f unified_orchestrator

# Or use WAL mode (future)
PRAGMA journal_mode=WAL;
```

---

## Key Documents

- [Implementation Complete](/docs/orchestration/IMPLEMENTATION_COMPLETE.md)
- [MCP Architecture V2](/tools/wvo_mcp/ARCHITECTURE_V2.md)
- [Tool Input Schemas](/tools/wvo_mcp/src/tools/input_schemas.ts)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
