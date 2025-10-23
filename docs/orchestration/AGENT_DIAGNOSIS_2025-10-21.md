# Agent System Diagnosis and Fix — 2025-10-21

## Executive Summary

**Problem**: Agents appeared "idle" with 0 tasks completed, tasks showed as "running" but never finished.

**Root Cause**: Model configuration used unsupported tiered Codex models (`gpt-5-codex-medium`, `gpt-5-codex-high`, `gpt-5-codex-low`) which are not available on ChatGPT accounts.

**Status**: ✅ **FIXED** - Updated to use `gpt-5-codex` base model

---

## What Was Happening

###  1. "Agents" Are Not Real Processes

The UnifiedOrchestrator creates **in-memory Agent objects**, not actual background worker processes.

```typescript
// This just creates a JavaScript object
const agent: Agent = {
  id: `worker-${index}`,
  config: { provider: 'codex', model: 'gpt-5-codex-medium', ... },
  status: 'idle',
  ...
};
```

When tasks execute, the orchestrator calls `codex exec` or `claude` CLI commands **synchronously** via `execa()`.

### 2. CLI Commands Were Failing

```bash
$ CODEX_HOME=.accounts/codex/codex_personal \
  codex exec --model gpt-5-codex-medium "test"

ERROR: unexpected status 400 Bad Request:
{"detail":"The 'gpt-5-codex-medium' model is not supported when using Codex with a ChatGPT account."}
```

The system retried 5 times with exponential backoff (~6 seconds total), then failed. This created the appearance of "running" tasks that never completed.

### 3. Supported vs Unsupported Models

| Model | Status | Account Type |
|-------|--------|--------------|
| `gpt-5-codex` | ✅ Works | ChatGPT |
| `gpt-5-codex-high` | ❌ Fails | API key only |
| `gpt-5-codex-medium` | ❌ Fails | API key only |
| `gpt-5-codex-low` | ❌ Fails | API key only |
| `claude-sonnet-4-5` | ✅ Works | All |
| `claude-haiku-4-5` | ✅ Works | All |

---

## The Fix

### Files Changed

**`tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`**

Changed hardcoded model names from tiered Codex models to base model:

```diff
- model = 'gpt-5-codex-high';   // Orchestrator
+ model = 'gpt-5-codex';

- model = 'gpt-5-codex-medium'; // Workers
+ model = 'gpt-5-codex';

- model = 'gpt-5-codex-low';    // Critics
+ model = 'gpt-5-codex';
```

### Rebuild

```bash
npm --prefix tools/wvo_mcp run build
```

---

## How to Test

### Quick CLI Test

```bash
# Test Codex execution (should print "TEST_OK")
CODEX_HOME=.accounts/codex/codex_personal \
  codex exec \
  --profile weathervane_orchestrator \
  --dangerously-bypass-approvals-and-sandbox \
  "Print exactly: TEST_OK"

# Test Claude execution (should print "TEST_OK")
CLAUDE_CONFIG_DIR=.accounts/claude/claude_primary \
  claude --print \
  --model claude-3-5-sonnet-20241022 \
  "Print exactly: TEST_OK"
```

### Full Orchestrator Test

```bash
bash tools/wvo_mcp/scripts/test_single_task.sh
```

This creates a test task and executes it with the orchestrator. Should complete in 30-90 seconds.

### Full Autopilot Run

```bash
make autopilot AGENTS=3 MAX_ITERATIONS=1
```

---

## Agent Architecture Reference

### 1. MCP Server Worker Manager (Different System)

**File**: `tools/wvo_mcp/src/worker/worker_manager.ts`

- **Actually forks processes** using `child_process.fork()`
- Spawns N executor workers based on `WVO_WORKER_COUNT`
- Used by the MCP server when running as a service
- **Not used by autopilot_unified.sh**

### 2. UnifiedOrchestrator (What Autopilot Uses)

**File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

- Creates in-memory Agent objects
- Calls CLI commands synchronously
- Used by `autopilot_unified.sh`
- **No actual process spawning**

### Why Two Systems?

1. **MCP Server** - Background service for Claude Code IDE integration
2. **Autopilot** - Standalone batch executor for autonomous task execution

They were designed independently and have different architectures.

---

## Verification Checklist

✅ CLI execution works (no 400 errors)
✅ Code rebuilt after model changes
✅ Test task completes successfully
✅ Agents show completed task counts > 0
✅ Tasks transition from `pending` → `in_progress` → `done`

---

## Future Improvements

1. **Detect unsupported models** - Add runtime validation to fail fast with clear error
2. **Model capability probing** - Query available models from CLI and adapt
3. **Better error reporting** - Surface 400 errors immediately instead of silent retries
4. **Unify architectures** - Consider merging MCP Worker Manager and UnifiedOrchestrator

---

## Contact

For questions about this fix, check:
- This document: `docs/orchestration/AGENT_DIAGNOSIS_2025-10-21.md`
- Test scripts: `tools/wvo_mcp/scripts/test_*.sh`
- Source: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
