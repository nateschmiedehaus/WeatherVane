# WeatherVane Orchestrator MCP Server

This package implements the Model Context Protocol (MCP) server that powers the autonomous **WeatherVane Orchestrator (WVO)**. It exposes planning, context, filesystem, command, and critic tools so MCP clients can manage the WeatherVane repository end-to-end.

## Recent Changes (2025-11-06)

✅ **Proof System Complete (3 Layers)**
- Layer 1: Structural enforcement (auto-verification)
- Layer 2: Multi-critic validation (future)
- Layer 3: Production feedback tracking (**NEW**)
- Self-improvement: Auto-creates improvement tasks (**NEW**)
- Wave 0: Fully integrated with proof validation (**NEW**)

✅ **Wave 0 Fundamental Fixes**
- Fixed roadmap parser: Replaced regex with YAML.parse()
- Added `npm run wave0` script for easy autopilot launch

See: `src/prove/README.md`, `src/wave0/README.md` for details.

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
