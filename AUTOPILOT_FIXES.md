# Autopilot Script Fixes - 2025-10-10

## Issues Fixed

### 1. **Bash Syntax Error in `log_dns_diagnostics()` Function**
**Location:** `tools/wvo_mcp/scripts/autopilot.sh:974-992`

**Problem:**
- Pipe operator `|` on line 992 after a Python heredoc caused syntax error
- Error: `tools/wvo_mcp/scripts/autopilot.sh: line 992: syntax error near unexpected token '|'`

**Fix:**
- Removed the pipe and integrated formatting directly into Python output
- Restructured heredoc to avoid ambiguous pipe placement

---

### 2. **Claude CLI `--mcp` Flag Issue**
**Location:** `tools/wvo_mcp/scripts/autopilot.sh:997-1015` (detection) and `:1117-1147` (usage)

**Problem:**
- Script checked for `--mcp` flag using `grep -q -- '--mcp'`
- This matched `--mcp-config` and `--mcp-debug`, causing false positive
- Script then tried to use `--mcp weathervane`, which doesn't exist in Claude Code CLI
- Claude Code 2.x uses `--mcp-config <file>`, not `--mcp <name>`

**Fix:**
- Updated `detect_claude_capabilities()` to use precise pattern: `grep -qE '\s--mcp-config\s'`
- Modified `run_claude_evaluation()` to:
  - Generate proper MCP config JSON file with server definition
  - Use `--mcp-config <file>` instead of `--mcp weathervane`
  - Clean up temp config file after use

---

### 3. **Error Handling Improvements**
**Location:** Various locations in error paths

**Improvements:**
- Added better error messages showing first 200 chars of Claude failure output
- Ensured all Claude evaluation failures return gracefully (don't crash script)
- Improved logging for MCP capability detection

---

## Verification

### Smoke Test (Passes ✅)
```bash
WVO_AUTOPILOT_SMOKE=1 make mcp-autopilot
```
- Verifies accounts are detected and authenticated
- Checks MCP server registration
- Does not run actual codex exec loop

### Syntax Check (Passes ✅)
```bash
bash -n tools/wvo_mcp/scripts/autopilot.sh
```

### DNS Resolution (Works ✅)
```bash
python - <<'PY'
import socket
for host in ["chatgpt.com", "api.openai.com"]:
    socket.getaddrinfo(host, None)
    print(f"✅ {host} resolves")
PY
```

---

## Remaining Considerations

### Codex Exec Issues
- `codex exec` may still fail due to connectivity, rate limits, or other API issues
- These are expected behaviors and the script handles them with retries
- Check `/tmp/wvo_autopilot.log` for details if autopilot runs but makes no progress

### Claude Evaluations
- Now properly configured to use `--mcp-config`
- Will only run if Claude Code CLI version supports MCP (2.x+)
- Gracefully disabled if MCP support not detected

### DNS Resolution
- Intermittent DNS failures can occur due to network conditions
- Script will exit gracefully (exit 0) if DNS fails, recording status in `/tmp/wvo_autopilot_last.json`
- Use `WVO_AUTOPILOT_OFFLINE=1` to skip connectivity checks entirely

---

## Testing Commands

```bash
# Run smoke test
WVO_AUTOPILOT_SMOKE=1 make mcp-autopilot

# Run with offline mode (skips DNS/connectivity checks)
WVO_AUTOPILOT_OFFLINE=1 make mcp-autopilot

# Check logs
tail -f /tmp/wvo_autopilot.log

# Check status
cat /tmp/wvo_autopilot_last.json | python3 -m json.tool
```

---

## Files Modified
1. `tools/wvo_mcp/scripts/autopilot.sh`
   - Lines 974-995: Fixed `log_dns_diagnostics()` function
   - Lines 997-1015: Fixed `detect_claude_capabilities()` detection
   - Lines 1117-1147: Fixed `run_claude_evaluation()` to use `--mcp-config`
