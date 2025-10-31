# Authentication Guide

**Last Updated**: 2025-10-30
**Status**: Production

---

## Overview

This project uses **monthly subscriptions** (NOT raw API keys) for both Claude Code and Codex (OpenAI/ChatGPT).

**Authentication Method**: Session-based via CLI tools with stored OAuth tokens

**NO API KEYS NEEDED**: Do not export `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variables.

---

## Authentication Storage

### Codex (OpenAI/ChatGPT Plus)

**IMPORTANT**: This project has **TWO Codex logins** for different use cases.

**Locations**:
- **Client/Work**: `.accounts/codex/codex_client/auth.json` (primary for autopilot)
- **Personal**: `.accounts/codex/codex_personal/auth.json` (backup/personal projects)

**Primary Auth** (codex_client):

**Location**: `.accounts/codex/codex_client/auth.json`

**Contents**:
```json
{
  "OPENAI_API_KEY": null,
  "tokens": {
    "id_token": "JWT token...",
    "access_token": "JWT token...",
    "refresh_token": "rt_...",
    "account_id": "UUID"
  },
  "last_refresh": "2025-10-23T01:01:52.934958Z"
}
```

**Token Details**:
- **Type**: OAuth2 JWT tokens
- **Provider**: Google OAuth → OpenAI
- **Subscription**: ChatGPT Plus
- **Email**: nate@schmiedehaus.com
- **Account ID**: b0c3d80c-df19-4d3b-a7fe-8e6bc1b3107a
- **Subscription Active Until**: 2025-11-13 (auto-renews monthly)

**How it works**:
1. One-time login via `codex login` (completed for both accounts)
2. OAuth flow creates JWT tokens
3. Tokens stored in `auth.json`
4. Auto-refreshes using `refresh_token`
5. MCP server reads tokens from `auth.json`

**Dual Login Strategy**:
- **Client** (`codex_client`): Primary account for autopilot/production work
- **Personal** (`codex_personal`): Backup account for personal projects or failover
- Autopilot prioritizes `codex_client` by default
- Can switch accounts via `CODEX_HOME` environment variable

**Switching Accounts**:
```bash
# Use client account (default)
export CODEX_HOME="$PWD/.accounts/codex/codex_client"

# Use personal account
export CODEX_HOME="$PWD/.accounts/codex/codex_personal"
```

---

### Claude Code

**Location**: `/Volumes/BigSSD4/nathanielschmiedehaus/.claude/`

**Session Storage**:
- `session.json` - Current session tokens
- `config.json` - CLI configuration
- `history.jsonl` - Command history

**Symlink**: `.accounts/claude/claude_primary` → `~/.claude`

**How it works**:
1. One-time login via Claude Code Desktop or CLI (completed)
2. Session tokens stored in `~/.claude/session.json`
3. Claude Code CLI automatically uses stored session
4. MCP server inherits authentication from CLI session

**Current Status**: Authenticated via this running Claude Code session

---

## How MCP/Autopilot Uses Credentials

### Authentication Check Flow

1. **AuthChecker** (`tools/wvo_mcp/src/utils/auth_checker.ts`) checks both providers:
   - **Codex**: Reads `.accounts/codex/*/auth.json`, checks for tokens
   - **Claude**: Runs `claude whoami` or checks `~/.claude/session.json`

2. **CredentialsManager** (`tools/wvo_mcp/src/utils/credentials_manager.ts`) loads credentials:
   - **Priority**: Environment variables > Auth files > Defaults
   - **Codex**: Loads tokens from auth.json
   - **Claude**: Inherits from CLI session

3. **Model Discovery** (`tools/wvo_mcp/src/orchestrator/model_discovery.ts`) validates:
   - Checks for required environment variables (`OPENAI_API_KEY` NOT needed - uses tokens)
   - Verifies provider availability

### Usage in Eval Scripts

**WRONG** (old approach):
```bash
export ANTHROPIC_API_KEY="sk-..."
export OPENAI_API_KEY="sk-..."
bash tools/wvo_mcp/scripts/run_integrated_evals.sh
```

**CORRECT** (current approach):
```bash
# No API key exports needed!
# MCP server uses stored session tokens automatically
bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full
```

---

## Testing Authentication

### Quick Test

```bash
# Test both providers
npx tsx tools/wvo_mcp/src/utils/auth_checker.ts
```

**Expected Output**:
```
✅ Both providers authenticated
  codex: nate@schmiedehaus.com
  claude_code: authenticated
```

### Manual Checks

**Codex**:
```bash
cat .accounts/codex/codex_client/auth.json | jq '.tokens.account_id, .last_refresh'
```

**Claude**:
```bash
claude whoami  # Should show authenticated user
```

---

## Troubleshooting

### Codex Not Authenticated

**Symptom**: `auth.json` shows `"tokens": null`

**Fix**:
```bash
codex login
```

**Follow OAuth flow** → Tokens automatically stored in `auth.json`

---

### Claude Not Authenticated

**Symptom**: `claude whoami` shows "Not logged in"

**Fix**:
1. Open Claude Code Desktop → Log in
2. OR: `claude login` (if CLI installed)

Session stored in `~/.claude/session.json`

---

### Token Expiration

**Codex**:
- Tokens auto-refresh using `refresh_token`
- If refresh fails → run `codex login` again

**Claude**:
- Session persists across Desktop/CLI restarts
- If expired → log in again via Desktop or CLI

---

## Security Notes

**DO**:
- ✅ Keep auth.json files private (mode 0600)
- ✅ Use stored tokens (already set up)
- ✅ Let autopilot use credentials automatically

**DON'T**:
- ❌ Export API keys to environment
- ❌ Commit auth.json to git (already in .gitignore)
- ❌ Share tokens publicly
- ❌ Manually edit auth.json (let CLI manage it)

---

## File Locations Summary

| Component | Path | Purpose |
|-----------|------|---------|
| Codex Auth (Client) | `.accounts/codex/codex_client/auth.json` | OAuth tokens (PRIMARY) |
| Codex Auth (Personal) | `.accounts/codex/codex_personal/auth.json` | OAuth tokens (BACKUP) |
| Claude Session | `~/.claude/session.json` | Claude Code CLI session |
| Claude Config | `~/.claude/config.json` | CLI configuration |
| Auth Checker | `tools/wvo_mcp/src/utils/auth_checker.ts` | Validates both providers |
| Credentials Manager | `tools/wvo_mcp/src/utils/credentials_manager.ts` | Loads and manages creds |

---

## Integration with Evals

**See**: `tools/wvo_mcp/evals/README.md` for eval-specific authentication

**Key Points**:
- Evals automatically use stored session tokens
- No API key environment variables needed
- Autopilot has credentials configured
- Run evals via: `bash tools/wvo_mcp/scripts/run_integrated_evals.sh`

---

## Subscription Status

**Codex (ChatGPT Plus)**:
- **Status**: Active
- **Renewal**: Monthly (auto-renew)
- **Expires**: 2025-11-13 (then renews)
- **Plan**: Plus ($20/month)

**Claude Code**:
- **Status**: Active (via current session)
- **Type**: Monthly subscription via Anthropic

---

## For Future Reference

**When adding new team members**:
1. Have them run `codex login` for Codex access
2. Have them install and log in to Claude Code Desktop
3. Verify with: `npx tsx tools/wvo_mcp/src/utils/auth_checker.ts`
4. No API keys needed - all session-based

**When subscriptions renew**:
- Codex tokens auto-refresh (no action needed)
- Claude session persists (no action needed)
- If payment fails → tokens expire → re-login required
