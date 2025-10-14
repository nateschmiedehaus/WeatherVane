# MCP Setup Status & Verification

## ✅ Setup Complete

###  Claude Code MCP Server
- **Status**: ✓ Connected
- **Command**: `node tools/wvo_mcp/dist/index-claude.js --workspace /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane`
- **Entry Point**: `tools/wvo_mcp/src/index-claude.ts`
- **Features**:
  - Lazy initialization for fast startup
  - Deferred authentication check (avoids deadlock)
  - Passive mode (tool-driven, not autonomous)
  - Non-blocking transport connection

### Codex MCP Server
- **Status**: ✓ Enabled
- **Command**: `node tools/wvo_mcp/dist/index.js --workspace /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane`
- **Entry Point**: `tools/wvo_mcp/src/index.ts`
- **Features**:
  - Full authentication support
  - Tool-based (not autonomous by default)
  - Compatible with Codex CLI

## Fixes Applied

### 1. Claude Code Server Startup Issues
**Problem**: Server was hanging during initialization, preventing Claude Code from connecting.

**Root Causes**:
1. Authentication check calling `claude whoami` created deadlock (Claude running server trying to check Claude auth)
2. Autonomous runtime starting immediately, dispatching tasks before connection
3. Checkpoint loading blocking server startup
4. Type casting issue on transport connection

**Fixes**:
1. Skipped authentication check for Claude Code MCP mode (deferred to lazy loading)
2. Disabled automatic runtime.start() - Claude Code MCP is now passive/tool-driven only
3. Moved checkpoint loading to lazy initialization
4. Removed incorrect type cast on `server.connect(transport)`

**Result**: Server now starts in ~200ms and responds to initialize handshake immediately.

### 2. Project Scope Configuration
**Problem**: MCP server was registered from wrong directory (`tools/wvo_mcp` instead of project root).

**Fix**: Re-registered from `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane` with correct workspace path.

**Result**: Both Claude Code and Codex now use correct project root.

## Provider Rotation & Network Sandbox

### Provider Manager Configuration
The system supports automatic rotation between Codex and Claude Code via `ProviderManager`:

```typescript
// Default provider from environment
const defaultProvider = process.env.WVO_DEFAULT_PROVIDER === "codex" ? "codex" : "claude_code";
const providerManager = new ProviderManager(defaultProvider);
```

**Features**:
- Token usage tracking per provider
- Automatic switching on rate limits
- Intelligent routing based on task complexity
- 5:1 Codex:Claude target ratio

### Network Sandbox Checks
From `docs/MCP_ORCHESTRATOR.md` line 47:
> Shell execution enforces workspace confinement and blocks destructive commands (`sudo`, `rm -rf /`, `git reset --hard`, `.git` deletion) while still allowing full access inside the repository.

**Implementation**: `tools/wvo_mcp/src/executor/guardrails.ts`

**Blocked Commands**:
- `sudo`, `su`
- `rm -rf /`, destructive rm operations
- `git reset --hard`, `git push --force` to main/master
- `.git` directory modifications
- Package removal commands

**Allowed Operations**:
- All operations within workspace root
- Git operations (except destructive)
- Package management (install, not removal)
- Test/build commands

## Verification Steps

### Test Claude Code MCP
```bash
# From project root
claude mcp list
# Should show: weathervane - ✓ Connected

# Test a tool call
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | \
  node tools/wvo_mcp/dist/index-claude.js --workspace $(pwd)
# Should return JSON response with capabilities
```

### Test Codex MCP
```bash
# From project root
CODEX_HOME=.accounts/codex/codex_personal codex mcp list
# Should show: weathervane - enabled

# Test via Codex session
CODEX_HOME=.accounts/codex/codex_personal codex exec \
  --profile weathervane_orchestrator \
  "Use weathervane.wvo_status to check system status"
```

### Test Provider Rotation
```bash
# Run autopilot with mixed provider usage
./run_wvo_autopilot.sh

# Check telemetry for provider usage
tail -f state/telemetry/executions.jsonl | jq '.agent_type'
# Should show mix of "codex" and "claude_code"
```

## Known Issues & Next Steps

### Autopilot Tool Failures (from user report)
The autopilot logs show:
```
blockers: ["weathervane/plan_next and weathervane/critics_run endpoints are currently failing"]
```

**Likely Causes**:
1. Database schema mismatch (missing epic foreign keys) - Already fixed in E5/E6/E7/E8/E9/E11 backfill
2. Roadmap YAML → SQLite sync issues
3. Checkpoint format incompatibility

**Verification Needed**:
```bash
# Check database integrity
sqlite3 state/orchestrator.db "SELECT COUNT(*) FROM tasks;"
sqlite3 state/orchestrator.db "SELECT COUNT(*) FROM tasks WHERE epic_id IS NOT NULL;"

# Test plan_next directly
node tools/wvo_mcp/dist/index.js # then call plan_next via MCP
```

### Network Failover Guardrail
The user mentioned ensuring "the thing is running only when it can actually meaningfully work with claude and codex".

**Current Implementation**:
- `AuthChecker` verifies both providers
- `canProceed()` returns true if at least one provider is authenticated
- Warnings logged if only partial auth

**Enhancement Needed**: Add network connectivity check before task dispatch.

**Proposed**:
```typescript
class FailoverGuardrail {
  async checkProviderHealth(provider: Provider): Promise<boolean> {
    // 1. Auth check
    // 2. Network connectivity (ping API endpoint)
    // 3. Rate limit status
    // 4. Recent success rate
    return allChecksPass;
  }

  shouldAllowExecution(): boolean {
    const codexOk = this.checkProviderHealth("codex");
    const claudeOk = this.checkProviderHealth("claude_code");
    return codexOk || claudeOk;
  }
}
```

## Architecture Improvements

### Current State (After Fixes)
```
Claude Code (CLI)
  ↓ stdio transport
MCP Server (index-claude.js)
  → Passive mode (no autonomous runtime)
  → Responds to tool calls only
  → Fast startup (~200ms)

Codex (CLI)
  ↓ stdio transport
MCP Server (index.js)
  → Passive mode by default
  → Can start runtime if needed
  → Auth check on first tool use

Orchestrator (index-orchestrator.js)
  → Autonomous mode
  → Starts runtime immediately
  → Continuous task execution
```

### Future: Unified Entry Point?
Consider consolidating to single entry point with mode flag:
```bash
node tools/wvo_mcp/dist/index.js --mode=claude-code  # Passive, no auth
node tools/wvo_mcp/dist/index.js --mode=codex        # Passive, with auth
node tools/wvo_mcp/dist/index.js --mode=orchestrator # Autonomous
```

## Summary

✅ **Working Now**:
- Claude Code MCP connects successfully
- Codex MCP enabled and functional
- Provider manager ready for rotation
- Network sandbox/guardrails active

⚠️ **Needs Verification**:
- Autopilot plan_next/critics_run failures
- Provider rotation in practice
- Failover guardrail network checks

📋 **Recommended Next Steps**:
1. Test full autopilot loop with both providers
2. Monitor `state/telemetry/executions.jsonl` for provider distribution
3. Add connectivity checks to FailoverGuardrail
4. Verify database schema integrity
5. Test Codex execution with real tasks

## Testing Commands

```bash
# Full integration test
make mcp-autopilot

# Test Claude Code tools
claude mcp test weathervane wvo_status

# Test Codex tools
CODEX_HOME=.accounts/codex/codex_personal codex exec \
  --profile weathervane_orchestrator \
  "Get status with weathervane.wvo_status"

# Monitor provider rotation
tail -f state/telemetry/executions.jsonl | jq '{task: .task_id, agent: .agent_type, duration: .duration_seconds}'
```
