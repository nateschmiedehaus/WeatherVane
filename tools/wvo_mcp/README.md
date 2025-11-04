# WeatherVane Orchestrator MCP Server

This package implements the Model Context Protocol (MCP) server that powers the autonomous **WeatherVane Orchestrator (WVO)**. It exposes planning, context, filesystem, command, and critic tools so MCP clients can manage the WeatherVane repository end-to-end.

**This package supports two MCP client variants:**
- **Codex** - via `index.ts` entry point
- **Claude Code** - via `index-claude.ts` entry point

Both variants share the same core functionality and differ only in CLI command awareness and client-specific optimizations.

## Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- Run all commands from the WeatherVane repo root unless stated otherwise.

## Installation
```bash
cd tools/wvo_mcp
npm install
npm run build
```

This builds both `dist/index.js` (Codex) and `dist/index-claude.js` (Claude Code).

---

## Usage with Codex

### Local Smoke Test
```bash
# From tools/wvo_mcp
npm run start:codex -- --workspace ../../..
```
The server listens on stdio until an MCP client connects.

### Codex Integration
```bash
codex mcp add weathervane -- node tools/wvo_mcp/dist/index.js --workspace $PWD
```
Then start a Codex session with the WeatherVane base instructions and call tools such as `plan_next`, `plan_update`, `context_write`, `cmd_run`, `critics_run`.

### Codex-Specific Scripts
```bash
npm run register:codex  # Register with Codex MCP
npm run auto:codex      # Build, register, and start session
```

---

## Usage with Claude Code

### Local Smoke Test
```bash
# From tools/wvo_mcp
npm run start:claude -- --workspace ../../..
```

### Claude Code Integration

Add this MCP server to your Claude Code configuration file (typically `~/.claude/config.json` or via Claude Desktop settings):

```json
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": [
        "/absolute/path/to/WeatherVane/tools/wvo_mcp/dist/index-claude.js",
        "--workspace",
        "/absolute/path/to/WeatherVane"
      ]
    }
  }
}
```

Replace `/absolute/path/to/WeatherVane` with your actual repository path.

You can also use the helper script:

```bash
tools/wvo_mcp/scripts/run_with_claude.sh
```

or the package script:

```bash
npm run auto:claude -- --workspace ../../..
```

### Available Tools
Once registered, Claude Code can invoke:
- `plan_next` - Retrieve prioritized roadmap tasks
- `plan_update` - Update task status
- `context_write` - Update running context
- `context_snapshot` - Create checkpoint for recovery
- `fs_read` / `fs_write` - File operations
- `cmd_run` - Execute shell commands
- `critics_run` - Run quality critics
- `autopilot_record_audit` - Record QA audits
- `autopilot_status` - Get autopilot state
- `heavy_queue_enqueue` / `heavy_queue_update` / `heavy_queue_list` - Manage background tasks
- `artifact_record` - Register artifacts
- `cli_commands` - List available CLI commands

---

## Capability Modes
Set `CODEX_PROFILE=low|medium|high` before launching to adjust resource usage, test breadth, and critic scope. Defaults to `medium`.

- **low**: Minimal resource usage, baseline critics only
- **medium**: Default workflow, standard critic suite
- **high**: Full critics, deep simulations, long-running experiments

---

## Restarting After Context Loss
1. Call `context_snapshot` to write `state/checkpoint.json`.
2. Start a fresh session pointing to this MCP server.
3. The server hydrates roadmap/context state automatically and resumes work.

---

## Development

```bash
# Run Codex version in dev mode
npm run dev:codex -- --workspace ../../..

# Run Claude Code version in dev mode
npm run dev:claude -- --workspace ../../..

# Lint
npm run lint

# Test
npm run test
```

---

## Gaming Detection (Work Process Enforcement)

The WorkProcessEnforcer automatically detects gaming patterns in verification evidence during VERIFY → REVIEW phase transitions.

### What is Gaming?

Gaming is when tests appear to verify functionality but don't actually test anything meaningful. Examples:
- **Tests with 0 assertions**: Claims Level 2 verification but tests don't verify anything
- **Mock-heavy integration tests**: Claims Level 3 but mocks all dependencies (no real integration)
- **Weak deferrals**: Uses phrases like "don't have time" instead of proper justification

### How It Works

1. VERIFY phase completes
2. Gaming detection script runs automatically
3. Results logged to `state/analytics/gaming_detections.jsonl`
4. If gaming detected: Warning logged, transition proceeds (observe mode)
5. REVIEW phase starts

**Phase 1 (Current)**: Observe mode - warnings only, no blocking
**Phase 2 (Future)**: Enforce mode - blocking transitions after 30-day validation

### Configuration

Gaming detection can be configured when instantiating WorkProcessEnforcer:

```typescript
const enforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot, metricsCollector, {
  gamingDetection: {
    enabled: true,                              // default: true
    scriptPath: 'scripts/detect_test_gaming.sh', // relative to workspaceRoot
    timeoutMs: 5000,                            // default: 5s
    telemetryEnabled: true,                     // default: true
    agentType: 'claude'                         // default: 'unknown' - agent identifier
  }
});
```

### Disabling Detection (for testing/debugging)

```typescript
const enforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot, metricsCollector, {
  gamingDetection: { enabled: false }
});
```

### Telemetry

Gaming detection results are logged to `state/analytics/gaming_detections.jsonl` in JSONL format:

```json
{
  "timestamp": "2025-10-30T20:00:00Z",
  "task_id": "TASK-ID",
  "evidence_path": "state/evidence/TASK-ID",
  "gaming_detected": true,
  "pattern_count": 2,
  "patterns": [
    {
      "type": "no_assertions",
      "severity": "high",
      "file": "path/to/test.test.ts",
      "message": "Test file has 3 test blocks but 0 assertions"
    }
  ],
  "execution_time_ms": 120,
  "agent_type": "claude",
  "workflow_type": "autopilot"
}
```

### Requirements

**Bash Required**: Gaming detection script requires bash interpreter. Supported platforms:
- ✅ macOS (bash is standard)
- ✅ Linux (bash is standard)
- ⚠️ Windows (requires Git Bash or WSL)

If bash is not available, detection fails gracefully (warning logged, phase transition proceeds).

### Enhancements (2025-10-30)

**FIX-META-TEST-GAMING-ENHANCEMENTS**:
- **Agent Type Configuration**: Added `agentType` field for accurate telemetry across agents (Claude, Codex, future agents)
- **SIGKILL Escalation**: Process termination reliability improved with SIGTERM → SIGKILL escalation (1s grace period)
- **Schema Version Validation**: Forward compatibility with optional schema_version validation (warning-only, fail-safe)

All enhancements are backward compatible, non-breaking, and maintain fail-safe behavior.

### See Also

- Gaming detection script: `scripts/detect_test_gaming.sh`
- Script documentation: `scripts/README_GAMING_DETECTION.md`
- Task evidence: `state/evidence/FIX-META-TEST-GAMING/`
- Integration evidence: `state/evidence/FIX-META-TEST-GAMING-INTEGRATION/`

---

## Roadmap Validation

Roadmap schema v2.0 is enforced both locally and in CI.

```bash
# Validate the repo’s roadmap before committing
npm --prefix tools/wvo_mcp run validate:roadmap
```

- Runs typed schema checks, dependency validation, and metadata coverage.
- CI workflow (`.github/workflows/roadmap-validation.yml`) executes the same command on PRs that touch `state/roadmap.yaml`.
- See `docs/roadmap/STRUCTURE.md` for full schema, metadata, and WSJF guidance.

---

## Architecture

See `docs/MCP_ORCHESTRATOR.md` for full design details.

**Key Files:**
- `src/index.ts` - Codex entry point
- `src/index-claude.ts` - Claude Code entry point
- `src/session.ts` - Shared session management
- `src/executor/codex_commands.ts` - Codex CLI awareness
- `src/executor/claude_code_commands.ts` - Claude Code CLI awareness
- `src/critics/` - Quality feedback modules
- `src/state/` - Persistence layer
