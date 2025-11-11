# WeatherVane Subscription Credentials Guide

**CRITICAL: All agents must read this before working on WeatherVane or Wave 0**

## Executive Summary

WeatherVane uses **subscription-based authentication** - NO API KEYS.

- ✅ Codex credentials: `~/.codex/auth.json` (OpenAI OAuth tokens)
- ✅ Claude Code credentials: `~/.claude.json` + `~/.claude/session-env/` (session tokens)
- ❌ NO `ANTHROPIC_API_KEY` - do NOT look for or require API keys

---

## Credential Locations

### 1. Codex Credentials (OpenAI/ChatGPT Pro)

**Location:** `~/.codex/auth.json`

**Structure:**
```json
{
  "OPENAI_API_KEY": null,
  "tokens": {
    "id_token": "eyJhbGci...",
    "access_token": "eyJhbGci...",
    "refresh_token": "rt_...",
    "account_id": "uuid-here"
  },
  "last_refresh": "2025-11-08T18:45:23.354845Z"
}
```

**Type:** OAuth tokens (NOT API keys)

**Used by:** Codex CLI (`codex` command)

**Access method:**
```bash
# Codex handles authentication automatically
codex exec "your prompt here"

# Credentials are loaded from ~/.codex/auth.json
# No manual token passing needed
```

---

### 2. Claude Code Credentials (Anthropic Subscription)

**Location:**
- Primary: `~/.claude.json` (44KB config + session data)
- Sessions: `~/.claude/session-env/` (2414+ session directories)

**Type:** Subscription tokens (managed by Claude Code process)

**Used by:**
- Claude Code desktop app
- Wave 0 MCP server (runs as Claude Code subprocess)
- All MCP tools that delegate to Claude Code

**Access method:**
```typescript
// Wave 0 inherits authentication from Claude Code automatically
// via MCP Task tool delegation

// In llm_chat.ts:
const response = await mcpClient.executeTool("Task", {
  subagent_type: "general-purpose",
  description: "AI reasoning for Wave 0",
  prompt: taskPrompt,
  model: "sonnet" // haiku, sonnet, opus
});

// Claude Code handles authentication using session tokens
// No manual credential loading needed
```

---

## How Wave 0 Authentication Works

### Architecture

```
User (Claude Code subscription)
  ↓
Claude Code Desktop App (authenticated session)
  ↓
Wave 0 MCP Server (stdio subprocess - inherits auth)
  ↓
llm_chat tool → Task tool delegation
  ↓
Claude Code makes API call (uses subscription tokens)
  ↓
Returns AI response to Wave 0
```

### Implementation

**File:** `tools/wvo_mcp/src/tools/llm_chat.ts`

```typescript
/**
 * NO API KEYS NEEDED
 * Uses Claude Code's subscription credentials via Task tool
 */
export async function llmChat(
  request: LLMChatRequest,
  mcpClient?: any
): Promise<LLMChatResponse> {
  if (mcpClient && typeof mcpClient.executeTool === "function") {
    // Delegate to Claude Code's Task tool
    // Inherits subscription authentication automatically
    const response = await mcpClient.executeTool("Task", {
      subagent_type: "general-purpose",
      prompt: formatMessagesAsPrompt(request.messages),
      model: request.model || "sonnet"
    });

    return {
      provider: "anthropic",
      content: response.result || response.content || "",
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0
      }
    };
  }

  // Error if no MCP client (subscription auth required)
  throw new Error("No subscription credentials available");
}
```

---

## For Agents: How to Use Credentials

### If You're Working on Wave 0

**DO:**
- ✅ Use `mcpClient.executeTool("Task", ...)` for AI calls
- ✅ Pass `mcpClient` parameter to `llmChat()`
- ✅ Let Claude Code handle authentication
- ✅ Check that Wave 0 runs as subprocess of Claude Code

**DON'T:**
- ❌ Look for `ANTHROPIC_API_KEY` environment variable
- ❌ Make direct HTTPS calls to `api.anthropic.com`
- ❌ Try to extract or manage subscription tokens
- ❌ Add API key checks or requirements

### If You're Working on Codex Integration

**DO:**
- ✅ Use `codex exec` command (handles auth automatically)
- ✅ Trust that `~/.codex/auth.json` exists and is valid
- ✅ Let Codex CLI handle OAuth token refresh

**DON'T:**
- ❌ Parse or extract tokens from `~/.codex/auth.json`
- ❌ Implement manual OAuth flow
- ❌ Require `OPENAI_API_KEY` environment variable

### If You're Building New MCP Tools

**DO:**
- ✅ Accept `mcpClient` parameter for Task tool delegation
- ✅ Use subscription auth via Task tool when available
- ✅ Provide clear error messages if auth unavailable

**DON'T:**
- ❌ Require API keys
- ❌ Hard-code authentication logic
- ❌ Bypass the Task tool delegation pattern

---

## Testing Subscription Auth

### Test 1: Verify Credentials Exist

```bash
# Check Codex credentials
ls -la ~/.codex/auth.json
# Should show: -rw------- (permissions 600)

# Check Claude credentials
ls -la ~/.claude.json
# Should show: -rw-r--r-- (readable config)

# Verify NO API key is set
echo $ANTHROPIC_API_KEY
# Should output: (empty) or "NOT SET"
```

### Test 2: Test Codex Auth

```bash
codex exec "Say: Codex auth works!"
# Should get response without errors
```

### Test 3: Test Wave 0 Auth

```typescript
// In tools/wvo_mcp directory
import { llmChat } from './dist/tools/llm_chat.js';
import { RealMCPClient } from './dist/wave0/real_mcp_client.js';

const mcp = new RealMCPClient();
await mcp.connect();

const response = await llmChat({
  messages: [{ role: 'user', content: 'Test subscription auth' }]
}, mcp);

console.log('Provider:', response.provider); // Should be "anthropic"
```

### Test 4: Verify Task Tool Delegation

```typescript
// Direct Task tool test
await mcpClient.executeTool("Task", {
  subagent_type: "general-purpose",
  description: "Test subscription auth",
  prompt: "Say: Subscription credentials working!",
  model: "haiku"
});
// Should succeed without API key errors
```

---

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not set"

**Cause:** Old code still checking for API keys

**Fix:** Update to use subscription auth via Task tool delegation

```typescript
// OLD (broken):
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

// NEW (correct):
if (mcpClient && typeof mcpClient.executeTool === "function") {
  const response = await mcpClient.executeTool("Task", {...});
}
```

### Error: "No subscription credentials available"

**Cause:** `llmChat()` called without `mcpClient` parameter

**Fix:** Always pass MCP client:

```typescript
// Wrong:
await llmChat({ messages: [...] });

// Correct:
await llmChat({ messages: [...] }, mcpClient);
```

### Error: "Task tool not available"

**Cause:** Wave 0 not running inside Claude Code session

**Fix:** Ensure Wave 0 MCP server runs as subprocess of Claude Code (stdio transport)

---

## Security Notes

### What's Safe

- ✅ Credentials stored in home directory (`~/.codex/`, `~/.claude/`)
- ✅ OAuth tokens rotate automatically (Codex)
- ✅ Session tokens managed by Claude Code (no manual handling)
- ✅ No plaintext API keys in environment or files

### What's NOT Safe

- ❌ Extracting tokens from credential files
- ❌ Storing credentials in git repositories
- ❌ Sharing credential files between users
- ❌ Running Wave 0 outside Claude Code session

---

## Summary for Agents

**REMEMBER:**

1. **No API Keys** - WeatherVane uses subscription credentials only
2. **Credentials Location**:
   - Codex: `~/.codex/auth.json`
   - Claude: `~/.claude.json` + `~/.claude/session-env/`
3. **How to Use**:
   - Codex: `codex exec` (automatic)
   - Wave 0: `mcpClient.executeTool("Task", ...)` (delegation)
4. **What NOT to Do**:
   - Don't look for `ANTHROPIC_API_KEY`
   - Don't make direct API calls to Anthropic
   - Don't parse or extract tokens manually
5. **Testing**:
   - Verify credentials exist (file checks)
   - Test with Codex CLI
   - Test Wave 0 with MCP client

**If you're unsure:** Check `tools/wvo_mcp/src/tools/llm_chat.ts` for the reference implementation.

---

## References

- Implementation: `tools/wvo_mcp/src/tools/llm_chat.ts`
- MCP Client: `tools/wvo_mcp/src/wave0/real_mcp_client.ts`
- Phase Executors: `tools/wvo_mcp/src/wave0/phase_executors_drqc.ts`
- Codex Verification: Run `codex exec "Read tools/wvo_mcp/src/tools/llm_chat.ts"` to see current implementation
