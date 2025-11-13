# WeatherVane Authentication Policy

## 🔐 CRITICAL: NO API KEYS

**This document is the authoritative source for authentication requirements in WeatherVane.**

**Applies to:** Claude Council, Atlas, Dana, Codex, and ALL other AI agents

### Executive Summary

**WeatherVane uses MONTHLY SUBSCRIPTIONS for Claude AND Codex, NOT API KEYS.**

This has been communicated to every agent (Claude, Codex, etc.) working on this project. Any code that checks for, validates, or requires `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or similar API credentials is **INCORRECT** and must be removed.

---

## What We DO NOT Use

❌ **ANTHROPIC_API_KEY environment variable**
❌ **OPENAI_API_KEY environment variable**
❌ **Any API keys whatsoever**
❌ **API key validation or checks**
❌ **API rate limit handling**
❌ **API credential management**
❌ **API-based Claude/Codex access**
❌ **Programmatic API calls to Claude/Codex**

---

## What We DO Use

✅ **Monthly Claude subscription via Claude Desktop app**
✅ **Monthly Codex subscription via OpenAI Codex Desktop app**
✅ **MCP (Model Context Protocol) integration**
✅ **Direct desktop app interface access (Claude/Codex)**
✅ **Subscription-based model access**

---

## Architecture

### How Authentication Works

```
User → Desktop App (Claude/Codex with subscription)
                ↓
        MCP Server (wvo_mcp)
                ↓
        Wave 0 Autopilot
                ↓
        Tasks & Execution
```

**Key points:**
- Authentication happens at the desktop app level (Claude/Codex)
- No programmatic API authentication
- MCP uses IPC/stdio communication, not HTTP/REST APIs
- Subscription tier determines model access (not API quotas)
- Works the same for both Claude and Codex

### Where Subscription Credentials Are Stored

**EXACT LOCATIONS - Functioning Credentials:**

**Claude:**
- **Desktop app session:** `~/Library/Application Support/Claude/Cookies` (SQLite database with claude.ai session cookies) ← **THE authentication**
- **CLI session (home):** `~/.accounts/claude/claude_primary` (standardized location)
- **CLI session (repo):** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/.accounts/claude/claude_primary` (symlink to home)
- **Config & settings:** `~/.claude/` directory
  - User config: `~/.claude.json` (contains hashed userID, project settings)
  - Settings: `~/.claude/settings.json`
  - Session tracking: `~/.claude/statsig/statsig.session_id.*`
  - History: `~/.claude/history.jsonl`
- **Project-specific:** `[project]/.claude/settings.local.json` (permissions only, NO auth)

**Codex:**
- **Auth file:** `~/.codex/auth.json` ← **THE authentication**
- **Config:** `~/.codex/config.toml`
- **CLI session (home):** `~/.accounts/codex/codex_personal` (standardized location)
- **CLI session (repo):** `/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/.accounts/codex/codex_personal` (symlink to home)
- **Sessions:** `~/.codex/sessions/`
- **History:** `~/.codex/history.jsonl`

### Repo-Constrained Agent Access

For agents that can only access the WeatherVane repository (not the full home directory), symlinks provide access:

```
WeatherVane/.accounts/claude → ~/.claude
WeatherVane/.accounts/codex → ~/.codex
```

**Usage for repo-constrained agents:**
- Set `CLAUDE_CONFIG_DIR=/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/.accounts/claude`
- Set `CODEX_HOME=/Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/.accounts/codex`
- Access via: `$REPO_ROOT/.accounts/claude/claude_primary`

**Verification:**
```bash
ls -la .accounts/  # Shows symlinks
ls .accounts/claude/claude_primary  # Resolves to actual credential
```

**CRITICAL:** These are **NOT** API keys. They are session tokens/credentials managed by desktop apps or CLI tools. **DO NOT** read, modify, or reference these files in application code unless you're implementing auth diagnostics. Authentication is transparent through MCP/desktop apps.

---

## Error Handling Guidelines

### When You See Timeout/MCP Errors

**DO NOT assume it's an API key issue!**

#### Correct diagnostic steps:

1. **Check Claude Desktop app is running**
   ```bash
   ps aux | grep "Claude Desktop" || ps aux | grep "Claude"
   ```

2. **Check MCP server status**
   ```bash
   ps aux | grep wvo_mcp
   tail -f state/analytics/wave0_startup.log
   ```

3. **Check MCP server logs for errors**
   ```bash
   cat state/analytics/orchestration_metrics.json
   ```

4. **Verify network connectivity**
   ```bash
   ping claude.ai
   ```

5. **Check for MCP server crashes**
   ```bash
   grep -i "error\|crash\|fatal" state/logs/*/phase/*.jsonl
   ```

#### INCORRECT diagnostic steps:

❌ Check for `ANTHROPIC_API_KEY` in environment
❌ Validate API credentials
❌ Check API rate limits
❌ Retry with different API key

---

## Code Requirements

### Forbidden Patterns

**These patterns are PROHIBITED in all code:**

```typescript
// ❌ WRONG - Do not check for API keys
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('API key required');
}

// ❌ WRONG - Do not validate API keys
const hasApiKey = process.env.ANTHROPIC_API_KEY;
if (!hasApiKey) {
  console.error('Missing API key');
}

// ❌ WRONG - Do not mention API keys in error messages
throw new Error('ANTHROPIC_API_KEY not set');
```

### Correct Patterns

```typescript
// ✅ CORRECT - Check MCP server status
if (mcpServerNotResponding) {
  console.error('MCP server not responding');
  console.info('Check: 1) Claude Desktop running, 2) MCP logs, 3) Network');
}

// ✅ CORRECT - Diagnose without assuming API keys
private async handleTimeoutError(context: any): Promise<void> {
  this.logger.error('Timeout detected');
  this.logger.info('Possible causes:');
  this.logger.info('  1. MCP server not responding');
  this.logger.info('  2. Claude Desktop app not running');
  this.logger.info('  3. Network connectivity issue');
  // NO mention of API keys
}
```

---

## Testing Implications

### E2E Testing

**E2E tests run with the same authentication model:**
- Use Claude Desktop subscription
- Connect via MCP
- No API mocking needed

**Invalid E2E patterns:**
```bash
# ❌ WRONG
export ANTHROPIC_API_KEY=test_key_here
npm run e2e-test

# ✅ CORRECT
# Claude Desktop already running with subscription
npm run e2e-test
```

### Unit Testing

**Unit tests that need Claude access:**
- Mock MCP responses, not API responses
- Test MCP client connection logic
- Verify MCP error handling

---

## Migration Notes

### Removing API Key Code

If you find code that checks for API keys:

1. **Remove the check entirely**
2. **Remove related error messages**
3. **Update documentation**
4. **Add comment explaining subscription model**
5. **Test without any env vars set**

**Example migration:**

```typescript
// BEFORE (incorrect):
async startWave0() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('API key required');
  }
  // ... start Wave 0
}

// AFTER (correct):
async startWave0() {
  // Wave 0 uses MCP via Claude Desktop subscription
  // No API key needed - authentication handled by Claude Desktop app
  // ... start Wave 0
}
```

---

## Common Misconceptions

### ❓ "But the error says 'API timeout'?"

That's MCP protocol terminology, not REST API. MCP uses method names like `tools/call` which might sound API-like, but it's IPC communication.

### ❓ "How do we authenticate then?"

Authentication is handled by your Claude Desktop login. When you're signed into Claude Desktop with a subscription, all MCP servers can access Claude through that authenticated session.

### ❓ "What about CI/CD pipelines?"

CI/CD that needs Claude access requires:
- Claude Desktop equivalent for headless environments
- OR mock MCP responses for testing
- NOT API keys

### ❓ "What if we want API access later?"

That would be a **major architecture change** requiring:
- User decision and approval
- Complete redesign of authentication layer
- Migration plan for existing code
- Cost/benefit analysis

**Current policy:** Monthly subscriptions only. Do not add API key support "just in case."

---

## Enforcement

### Pre-commit Hooks

Consider adding pre-commit checks for forbidden patterns:

```bash
# Check for ANTHROPIC_API_KEY references
if git diff --cached | grep -i "ANTHROPIC_API_KEY"; then
  echo "ERROR: ANTHROPIC_API_KEY found in commit"
  echo "WeatherVane uses monthly subscriptions, not API keys"
  echo "See docs/AUTH_POLICY.md"
  exit 1
fi
```

### Code Review Checklist

- [ ] No `ANTHROPIC_API_KEY` checks
- [ ] No API credential validation
- [ ] No API key error messages
- [ ] MCP errors diagnosed correctly
- [ ] Documentation updated if auth-related

---

## References

- **CLAUDE.md** - Agent operating brief (includes auth policy summary)
- **integrated_cross_env_enforcer.ts** - Correct error handling (no API key checks)
- **orchestrator.mjs** - E2E test setup (no API key validation)

---

## Questions?

**Q: Why is this policy so strict?**
A: Because every agent has been told this, yet API key checks keep appearing. This document exists to make the policy absolutely clear and prevent future confusion.

**Q: Who can change this policy?**
A: Only the user/project owner. Agents should never assume API keys are available or add API key support.

**Q: What if I'm porting code from an API-based project?**
A: Strip out ALL API authentication code. WeatherVane's architecture is fundamentally different.

---

**Last updated:** 2025-11-12
**Policy version:** 1.0
**Status:** ACTIVE - NO EXCEPTIONS
