# MCP Authentication & Model Discovery - Implementation Progress

## ✅ Completed

### 1. Telemetry Cleanup (Phase 1)
**Status: COMPLETE**

#### What Was Done:
- Added `archiveAndReset()` method to `TelemetryExporter` that moves existing telemetry to archives/
- Integrated automatic cleanup into `OperationsManager` constructor
- Cleanup runs by default on startup (disable with `WVO_CLEAN_TELEMETRY=0`)
- Archives are timestamped and stored in `state/telemetry/archives/`

#### Files Modified:
- `tools/wvo_mcp/src/telemetry/telemetry_exporter.ts` - Added archive method
- `tools/wvo_mcp/src/orchestrator/operations_manager.ts` - Integrated cleanup

#### How It Works:
```typescript
// On startup, OperationsManager automatically:
const cleanTelemetry = process.env.WVO_CLEAN_TELEMETRY !== '0';
if (cleanTelemetry) {
  void this.telemetryExporter.archiveAndReset();
  void this.executionTelemetryExporter.archiveAndReset();
}
```

#### Testing:
Run `make mcp-autopilot` and check:
- Old telemetry moved to `state/telemetry/archives/`
- Fresh `operations.jsonl` and `executions.jsonl` created

### 2. Model Discovery Service (Phase 2)
**Status: COMPLETE - Core Infrastructure**

#### What Was Done:
Created comprehensive model discovery system with three key components:

**A. ModelRegistry (`tools/wvo_mcp/src/models/model_registry.ts`)**
- Central registry for all discovered models
- Stores model metadata (costs, capabilities, availability)
- Caching with configurable TTL (default 24 hours)
- Embedded defaults as fallback
- Subscription vs API awareness

**B. ModelDiscoveryService (`tools/wvo_mcp/src/models/model_discovery.ts`)**
- Discovers models via CLI commands
- Falls back to defaults if discovery fails
- Queries Claude via `claude models list` or `claude whoami`
- Queries Codex via `codex status`
- Graceful error handling

**C. ModelManager (`tools/wvo_mcp/src/models/model_manager.ts`)**
- High-level interface for model operations
- Automatic initialization on startup
- Periodic refresh (24 hours)
- Convenience methods for model queries

#### Key Features:
- **Automatic Discovery**: Queries provider CLIs for available models
- **Smart Caching**: Only refreshes when stale (>24 hours)
- **Graceful Fallback**: Uses embedded defaults if discovery fails
- **Access Method Awareness**: Tracks subscription vs API access
- **Cost Tracking**: Stores per-million-token costs for estimation

#### Data Structure:
```json
{
  "last_updated": "2025-10-16T12:00:00Z",
  "ttl_hours": 24,
  "providers": {
    "claude": {
      "access_method": "subscription",
      "models": [
        {
          "id": "claude-opus-4",
          "cost_per_mtok": {"input": 15.0, "output": 75.0},
          "capabilities": ["coding", "reasoning", "multimodal"],
          "available": true
        }
      ]
    },
    "codex": {
      "access_method": "subscription",
      "models": [
        {
          "id": "gpt-5-codex",
          "reasoning_levels": ["minimal", "low", "medium", "high"],
          "cost_per_mtok": {"input": 12.0, "output": 24.0}
        }
      ]
    }
  }
}
```

### 3. Architecture Documentation
**Status: COMPLETE**

Created comprehensive design document:
- `docs/orchestration/auth_and_model_discovery.md` - Full architecture spec
- `docs/orchestration/implementation_progress.md` - This file

## 🚧 In Progress / Pending

### 3. Semi-Permanent Authentication (Phase 3)
**Status: DESIGNED, NOT IMPLEMENTED**

#### What's Needed:
- `tools/wvo_mcp/src/auth/auth_manager.ts` - Authentication lifecycle manager
- `tools/wvo_mcp/src/auth/google_oauth.ts` - Google OAuth flow for Claude.ai
- `tools/wvo_mcp/src/auth/token_refresher.ts` - Background token refresh service
- Encrypted storage for refresh tokens (`.accounts/*/refresh_token.enc`)
- Integration with existing `auth_checker.ts`

#### Design Highlights:
- **Google OAuth Support**: Opens browser for consent, captures callback
- **Auto-Refresh**: Background service refreshes tokens before expiry
- **Semi-Permanent**: Stays logged in until explicitly logged out
- **Secure Storage**: Encrypted refresh tokens with Node crypto module

#### Why It's Important:
You mentioned Claude auth expires frequently and you use Google login for claude.ai. This would eliminate manual re-authentication.

### 4. Subscription-Aware Rate Limiting (Phase 4)
**Status: DESIGNED, NOT IMPLEMENTED**

#### What's Needed:
- `tools/wvo_mcp/src/limits/subscription_tracker.ts` - Track hourly/daily usage
- `tools/wvo_mcp/src/limits/usage_estimator.ts` - Estimate remaining quota
- Integration with `AgentPool` for pre-request checks
- Usage logging to `state/limits/usage_log.jsonl`

#### Design Highlights:
- **Proactive Limiting**: Warns at 80%, switches at 95%, blocks at 99%
- **Hourly & Daily Tracking**: Separate counters with reset timestamps
- **Provider Switching**: Automatically switches when approaching limits
- **Tier Awareness**: Different limits for Free/Pro/Team tiers

#### Why It's Important:
Currently the system only reacts to rate limits after hitting them. This would prevent hitting limits in the first place.

### 5. Integration Work (Phase 5)
**Status: PARTIALLY COMPLETE**

#### What's Done:
- ✅ Model discovery infrastructure ready
- ✅ Telemetry cleanup integrated

#### What's Needed:
- Integrate `ModelManager` into `OrchestratorRuntime`
- Update `model_selector.ts` to query registry instead of hardcoded `CODEX_PRESETS`
- Update `MODEL_COST_TABLE` in `agent_coordinator.ts` to use registry
- Add model awareness to Director and Critics

### 6. Testing (Phase 6)
**Status: NOT STARTED**

#### What's Needed:
- Unit tests for model discovery
- Integration tests for auth refresh
- End-to-end test of Claude MCP connection
- Rate limiting simulation tests

## 🎯 Priority Recommendations

### Immediate (Can Complete Now):
1. **Integrate ModelManager into orchestrator** - Wire up the model discovery to actually run
2. **Update model_selector.ts** - Use registry instead of hardcoded models
3. **Test telemetry cleanup** - Run `make mcp-autopilot` and verify archives

### High Priority (Most Impact):
1. **Implement Google OAuth for Claude** - Solves your primary pain point
2. **Implement TokenRefresher** - Keeps auth alive automatically
3. **Test end-to-end Claude MCP integration** - Verify it actually works

### Medium Priority:
1. **Implement SubscriptionLimitTracker** - Prevent rate limit hits
2. **Add model awareness to Director/Critics** - Let them choose models
3. **Create comprehensive tests** - Ensure reliability

## 📝 Next Steps Guide

### To Complete Model Discovery Integration:

1. **Add ModelManager to OrchestratorRuntime:**
```typescript
// In tools/wvo_mcp/src/orchestrator/orchestrator_runtime.ts
import { ModelManager } from '../models/model_manager.js';

export class OrchestratorRuntime {
  private readonly modelManager: ModelManager;

  constructor(workspaceRoot: string, options: OrchestratorRuntimeOptions = {}) {
    // ... existing code ...
    this.modelManager = new ModelManager(workspaceRoot);
  }

  async start(): Promise<void> {
    // Initialize model discovery
    await this.modelManager.initialize();
    // ... rest of startup ...
  }

  getModelManager(): ModelManager {
    return this.modelManager;
  }
}
```

2. **Update model_selector.ts to use registry:**
```typescript
// Instead of hardcoded CODEX_PRESETS, query from registry
const modelManager = /* get from context */;
const registry = modelManager.getRegistry();
const availableModels = registry.getCodexModelsByCapability();
```

3. **Update agent_coordinator.ts costs:**
```typescript
// Replace MODEL_COST_TABLE with registry lookup
const modelManager = /* get from context */;
const cost = modelManager.getModelCost('codex', modelSlug);
```

### To Implement Google OAuth Authentication:

This is more involved. Key steps:
1. Create OAuth app in Google Cloud Console
2. Implement OAuth flow with local callback server
3. Store refresh tokens securely
4. Implement background refresh service
5. Integrate with existing auth_checker.ts

I can help with this if you'd like to proceed!

### To Test What's Been Built:

1. **Test Telemetry Cleanup:**
```bash
# Run autopilot and check archives
make mcp-autopilot
ls -la state/telemetry/archives/

# Should see timestamped archives:
# operations_2025-10-16T12-00-00.jsonl
# executions_2025-10-16T12-00-00.jsonl
```

2. **Test Model Discovery:**
```bash
# Enable discovery
export WVO_MODEL_DISCOVERY_ENABLED=1

# Run and check registry
make mcp-build
cat state/models_registry.json

# Should show discovered models
```

## 🔧 Environment Variables

### New Variables Added:
- `WVO_CLEAN_TELEMETRY` - Enable/disable telemetry cleanup (default: enabled)
- `WVO_MODEL_DISCOVERY_ENABLED` - Enable/disable model discovery (default: enabled)

### Existing Variables to Be Aware Of:
- `CLAUDE_BIN` - Path to claude CLI (default: "claude")
- `CODEX_HOME` - Path to codex config directory
- `CLAUDE_CONFIG_DIR` - Path to claude config directory

## 📊 Summary

### Lines of Code Added:
- **Telemetry Cleanup**: ~40 lines
- **Model Discovery**: ~650 lines
- **Documentation**: ~500 lines

### Files Created:
- `tools/wvo_mcp/src/models/model_registry.ts`
- `tools/wvo_mcp/src/models/model_discovery.ts`
- `tools/wvo_mcp/src/models/model_manager.ts`
- `docs/orchestration/auth_and_model_discovery.md`
- `docs/orchestration/implementation_progress.md`

### Files Modified:
- `tools/wvo_mcp/src/telemetry/telemetry_exporter.ts`
- `tools/wvo_mcp/src/orchestrator/operations_manager.ts`

## 🚀 What You Can Do Right Now

1. **Test telemetry cleanup** - It's ready to use!
2. **Review the model discovery code** - Provide feedback if needed
3. **Decide on priorities** - Which phase do you want me to tackle next?
4. **Test Claude MCP connection** - Try using the MCP with Claude Desktop

## ❓ Questions to Answer

1. **Google OAuth**: Do you want me to implement the full Google OAuth flow for Claude.ai login?
2. **Subscription Limits**: Do you know your actual subscription limits (hourly/daily requests)?
3. **Model Preferences**: Should Director and Critics have different model preferences?
4. **Testing**: Do you want to test what's built so far before continuing?

Let me know which direction you'd like me to go next!
