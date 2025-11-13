# STRATEGIZE: Subscription Auth Remediation

**Task ID:** AFP-SUBSCRIPTION-AUTH-REMEDIATION-20251111
**Date:** 2025-11-11
**Phase:** STRATEGIZE (1/10)

## Problem Analysis

### Root Cause

I made critical errors in implementing subscription authentication:

1. **Architectural Misunderstanding**
   - Created `llm_chat` tool that requires `mcpClient` parameter
   - But MCP server tools CANNOT have mcpClient - they ARE the MCP server
   - The tool is called FROM Claude Code, not calling TO Claude Code
   - This is a fundamental architectural impossibility

2. **Wrong Credential Documentation**
   - Documented credentials as `~/.claude.json` and `~/.codex/auth.json`
   - Real WeatherVane system uses:
     - `.accounts/codex/*` directories
     - `.accounts/claude/*` directories
     - `state/accounts.yaml` configuration
     - `state/accounts_runtime.json` for cooldowns
     - Account manager scripts (`tools/wvo_mcp/scripts/account_manager.py`)
   - This system is in the pr21 branch/worktree
   - My documentation would mislead all future agents

### Impact

**CRITICAL REGRESSIONS:**

1. **llm_chat tool completely broken**
   - `tools/wvo_mcp/src/tools/llm_chat.ts` (98 lines) - throws error on every call
   - `tools/wvo_mcp/src/index.ts` - registers broken tool
   - Wave 0 autopilot cannot make AI calls
   - ALL phases that need AI reasoning fail

2. **Documentation pollution**
   - `docs/SUBSCRIPTION_CREDENTIALS.md` (327 lines) - entirely incorrect
   - `CLAUDE.md` - credentials section at top (wrong info)
   - `AGENTS.md` - credentials section at top (wrong info)
   - Every agent reading these will look in wrong places
   - Bypasses enforced account-rotation setup

3. **Test artifacts**
   - `state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/` - based on wrong understanding
   - Proves nothing useful (tested wrong architecture)

### User's Discovery

User found two critical issues:

> 1. llm_chat no longer works at all.
>    - throws "CRITICAL: No subscription credentials available" whenever called without mcpClient
>    - MCP server invokes llmChat({…}) with no mcpClient
>    - Every Wave 0 AI call fails before reaching Claude
>
> 2. Subscription documentation conflicts with actual credential system.
>    - instructs agents to use home-directory files
>    - WeatherVane actually draws credentials from .accounts/claude/*, .accounts/codex/*
>    - Guidance duplicated into CLAUDE.md and AGENTS.md
>    - repeats incorrect locations

## Goal

**Delete all broken code and documentation, restoring system to working state.**

No new features - pure deletion/reversion.

## AFP/SCAS Alignment

### Via Negativa (Delete, Don't Add)

✅ **PERFECT VIA NEGATIVA TASK**

DELETE:
- `tools/wvo_mcp/src/tools/llm_chat.ts` (98 lines)
- `tools/wvo_mcp/src/tools/input_schemas.ts` - llmChatInput schema
- `tools/wvo_mcp/src/index.ts` - llm_chat tool registration (28 lines)
- `docs/SUBSCRIPTION_CREDENTIALS.md` (327 lines)
- Credentials sections from `CLAUDE.md` and `AGENTS.md`
- `state/evidence/SUBSCRIPTION-AUTH-TEST-20251111/` directory (test artifacts)

TOTAL DELETION: ~500+ lines
TOTAL ADDITION: 0 lines (pure reversion)

### Refactor vs Repair

**THIS IS PURE DELETION** - Ultimate refactor

Not patching broken code - removing it entirely.
System returns to previous working state.

### Complexity

**Decreases complexity dramatically**

- Remove broken llm_chat abstraction
- Remove incorrect documentation
- Reduce surface area for errors
- Simplify mental model (no false credential locations)

## Strategic Decision

**Revert all changes from commits:**
1. `86db8a2aa` - "docs: Add subscription credentials guide for all agents"
2. `7673eb2f3` - "test: Verify Claude Code subscription auth works"
3. `f24f73a76` - "docs: Complete subscription auth proof summary"

**Result:** Clean slate, working system, no broken abstractions.

## Success Criteria

1. ✅ All broken files deleted
2. ✅ `git diff` shows pure deletion (no additions)
3. ✅ Build succeeds: `cd tools/wvo_mcp && npm run build`
4. ✅ MCP server starts without errors
5. ✅ No references to wrong credential locations remain
6. ✅ System returns to pre-regression state

## Next Phase

SPEC: Define exact files to delete and success metrics.
