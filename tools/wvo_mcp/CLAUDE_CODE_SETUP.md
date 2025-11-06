# Claude Code Setup Guide

This guide will help you set up the WeatherVane Orchestrator MCP server with Claude Code.

## Features

- ✨ **Enhanced UX**: Clear descriptions, examples, and helpful error messages
- 🔄 **Intelligent Provider Switching**: Automatic failover between Codex and Claude Code based on token limits
- 📊 **Task-Based Model Selection**: Routes tasks to the most efficient provider based on complexity
- 🔐 **Dual Authentication**: Checks both providers at startup, runs with at least one authenticated
- 📝 **Rich Formatting**: Beautiful, readable responses with emojis and structured data
- 🚀 **Onboarding Tools**: wvo_status, provider_status, and auth_status for easy orientation

## Quick Start

### 1. Authenticate to Providers (Recommended: Both)

**For Best Experience**: Authenticate to BOTH providers for automatic failover

```bash
# Authenticate to Codex
codex login

# Authenticate to Claude Code
# (via Claude Desktop or CLI - check official docs)
```

The MCP server will:
- Check authentication at startup
- Work with just one provider (with warnings)
- Automatically switch between providers when token limits are reached
- Select the best provider for each task based on complexity

### 2. Build the MCP Server

```bash
cd tools/wvo_mcp
npm install
npm run build
```

### 3. Configure Claude Code

Claude Code can be configured via:
- **Claude Desktop App**: Settings → Developer → Model Context Protocol
- **Claude Code CLI**: Configuration file (location varies by OS)

### 3. Add MCP Server Configuration

Add this configuration to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "weathervane": {
      "command": "node",
      "args": [
        "/absolute/path/to/WeatherVane/tools/wvo_mcp/dist/index-claude.js",
        "--workspace",
        "/absolute/path/to/WeatherVane"
      ],
      "env": {
        "CODEX_PROFILE": "medium"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/WeatherVane` with the actual absolute path to your WeatherVane repository.

### 4. Restart Claude Code

Restart Claude Code (or Claude Desktop) to load the new MCP server.

### 5. Test the Integration

In a Claude Code session, you can now invoke WeatherVane Orchestrator tools:

```
Please use the plan_next tool to show me the next tasks.
```

---

## Available Tools

Once configured, the following tools are available:

### System & Status
- **wvo_status** - 🚀 Get system status, available tools, and quick start guide
- **provider_status** - 🔄 Check provider capacity and intelligent routing
- **auth_status** - 🔐 Verify authentication status for both providers

### Planning & Context
- **plan_next** - 📋 Get prioritized roadmap tasks (with intelligent routing)
- **plan_update** - ✅ Update task status
- **context_write** - 📝 Update running context
- **context_snapshot** - 💾 Create recovery checkpoint

### File & Command Execution
- **fs_read** - 📂 Read workspace files
- **fs_write** - 📝 Write workspace files
- **cmd_run** - ⚡ Execute shell commands (with safety guardrails)

### Quality & Critics
- **critics_run** - 🔍 Run quality critic suites (build, tests, typecheck, security, etc.)
- 🚨 **ProcessCritic** now enforces that `plan.md` lists authored tests (no deferrals/placeholders) and that new test files match the plan. Fix plan/test sequencing before attempting VERIFY.
- 🛰️ Autopilot features must stage PLAN updates with Wave 0 live testing steps (`npm run wave0`, `ps aux | grep wave0`, TaskFlow smoke) and VERIFY must run them; commits touching autopilot/wave0 code without that plan will fail.

### Autopilot & Background Tasks
- **autopilot_record_audit** - 🤖 Record QA audits
- **autopilot_status** - Get autopilot state
- **heavy_queue_enqueue** - ⏳ Queue background tasks
- **heavy_queue_update** - Update task status
- **heavy_queue_list** - List background tasks

### Metadata
- **artifact_record** - Register artifacts
- **cli_commands** - List Claude Code CLI commands

All tools include:
- Clear descriptions with examples
- Parameter documentation
- Error messages with actionable guidance
- Automatic provider routing based on task complexity

---

## Capability Profiles

Set the `CODEX_PROFILE` environment variable to control resource usage:

### Low Profile
```json
"env": {
  "CODEX_PROFILE": "low"
}
```
- Minimal resource usage
- Baseline critics only
- Best for: Quick iterations, low-power machines

### Medium Profile (Default)
```json
"env": {
  "CODEX_PROFILE": "medium"
}
```
- Standard workflow
- Full critic suite
- Best for: Normal development

### High Profile
```json
"env": {
  "CODEX_PROFILE": "high"
}
```
- Maximum capabilities
- Deep simulations and experiments
- Best for: CI/CD, comprehensive validation

---

## Troubleshooting

### Server Not Appearing
1. Check the absolute paths in your configuration
2. Ensure the server is built: `npm run build`
3. Restart Claude Code/Desktop completely
4. Check logs (location varies by OS)

### Tools Not Working
1. Verify the workspace path is correct
2. Check file permissions
3. Run a local smoke test:
   ```bash
   npm run start:claude -- --workspace /absolute/path/to/WeatherVane
   ```

### Finding Your Config File

**macOS/Linux**:
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
- Claude Code CLI: Check `~/.config/claude/` or `~/.claude/`

**Windows**:
- `%APPDATA%\Claude\` or similar

Consult the official Claude Code documentation for the exact location.

---

## State & Persistence

The MCP server persists state in:
- `state/roadmap.yaml` - Task roadmap
- `state/context.md` - Running context (≤1000 words)
- `state/checkpoint.json` - Recovery checkpoints
- `state/critics/` - Critic outputs

These files are created automatically in the WeatherVane repository root.

---

## Advanced: Session Recovery

If Claude Code loses context (e.g., after restart), you can recover:

1. The MCP server automatically saves checkpoints
2. State is loaded on server startup
3. Use `context_snapshot` tool before long operations to ensure state is saved

---

## Next Steps

1. Review `docs/MCP_ORCHESTRATOR.md` for full architecture details
2. Explore the critic modules in `tools/wvo_mcp/src/critics/`
3. Customize roadmap in `state/roadmap.yaml` (created on first run)

---

## Support

For issues specific to:
- **WeatherVane Orchestrator**: Check `tools/wvo_mcp/README.md`
- **Claude Code**: Consult official Claude Code documentation
- **MCP Protocol**: See https://modelcontextprotocol.io
