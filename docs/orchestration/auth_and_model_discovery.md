# Authentication & Model Discovery Architecture

## Overview
This document outlines the architecture for semi-permanent authentication and automatic model discovery for the WeatherVane MCP system.

## Current Problems

### Authentication Issues
1. **Claude**: Uses `claude whoami` and checks `~/.claude/session.json` but auth expires frequently
2. **Codex**: Uses `codex status` and checks credentials but no persistent session management
3. **No Google OAuth Support**: User mentioned using Google login for claude.ai
4. **Manual Login Required**: After expiry, must manually re-authenticate

### Model Discovery Issues
1. **Hardcoded Models**: CODEX_PRESETS hardcoded with gpt-5-codex, gpt-5
2. **No Claude Model Variants**: Claude treated as single 'claude_code' agent
3. **Static Cost Table**: MODEL_COST_TABLE hardcoded in agent_coordinator.ts
4. **No API Discovery**: Models never queried from provider APIs or docs
5. **Subscription vs API Not Distinguished**: No awareness of access method

### Rate Limiting Issues
1. **Basic Cooldowns**: Only handles immediate rate limits with cooldownUntil
2. **No Subscription Tracking**: No hourly/daily limit tracking for monthly subscriptions
3. **No Proactive Limiting**: Hits limits then waits, doesn't anticipate

### Telemetry Issues
1. **No Cleanup**: state/telemetry/usage.jsonl grows indefinitely
2. **Inaccurate Metrics**: Old data pollutes current session analytics

## Proposed Architecture

### 1. Semi-Permanent Authentication System

#### Storage Structure
```
.accounts/
├── claude/
│   ├── claude_primary/
│   │   ├── session.json          # Session tokens
│   │   ├── refresh_token.enc     # Encrypted refresh token
│   │   ├── oauth_config.json     # OAuth flow configuration
│   │   └── last_refresh.json     # Timestamp tracking
│   └── claude_secondary/
│       └── ...
└── codex/
    ├── codex_personal/
    │   ├── credentials.json       # Codex tokens
    │   ├── refresh_token.enc      # Encrypted refresh token
    │   └── last_refresh.json
    └── codex_client/
        └── ...
```

#### Components

**`AuthenticationManager` (tools/wvo_mcp/src/auth/auth_manager.ts)**
- Manages authentication lifecycle for both providers
- Handles token refresh automatically
- Supports Google OAuth for Claude
- Persists sessions securely

**`GoogleOAuthFlow` (tools/wvo_mcp/src/auth/google_oauth.ts)**
- Implements OAuth 2.0 flow for Claude.ai Google login
- Opens browser for user consent
- Captures callback with local server
- Stores refresh tokens securely

**`TokenRefresher` (tools/wvo_mcp/src/auth/token_refresher.ts)**
- Background service that refreshes tokens before expiry
- Checks every 15 minutes
- Logs refresh attempts for debugging

#### Refresh Flow
```
1. On startup:
   - Load session.json and refresh_token.enc for each account
   - Validate tokens with provider APIs
   - If expired but refresh_token valid, refresh immediately
   - If refresh_token invalid, prompt for re-auth

2. During operation:
   - TokenRefresher runs every 15 minutes
   - Checks expiry timestamps
   - Refreshes 1 hour before expiry
   - Logs success/failure to state/auth_refresh.log

3. On auth failure:
   - Attempt refresh_token flow first
   - If refresh fails, mark account as "needs_reauth"
   - Emit event to notify Director/Atlas
   - Continue with other authenticated accounts
```

### 2. Automatic Model Discovery

#### Components

**`ModelDiscoveryService` (tools/wvo_mcp/src/models/model_discovery.ts)**
- Queries Claude and Codex APIs for available models
- Caches results with TTL (24 hours)
- Falls back to web scraping if API unavailable
- Updates model registry automatically

**`ClaudeModelFetcher` (tools/wvo_mcp/src/models/claude_fetcher.ts)**
- Queries claude.ai API or docs for model list
- Detects: claude-opus-4, claude-sonnet-4.5, claude-sonnet-4, claude-haiku-4, etc.
- Extracts capabilities, context windows, costs

**`CodexModelFetcher` (tools/wvo_mcp/src/models/codex_fetcher.ts)**
- Queries OpenAI/Codex API for model list
- Detects: gpt-5-codex, gpt-5, gpt-4o, etc.
- Extracts reasoning levels, costs, limits

**`ModelRegistry` (state/models_registry.json)**
```json
{
  "last_updated": "2025-10-16T12:00:00Z",
  "ttl_hours": 24,
  "providers": {
    "claude": {
      "access_method": "subscription",  // or "api"
      "models": [
        {
          "id": "claude-opus-4",
          "name": "Claude Opus 4",
          "context_window": 200000,
          "max_output": 16384,
          "cost_per_mtok": {"input": 15.0, "output": 75.0},
          "capabilities": ["coding", "reasoning", "multimodal"],
          "available": true,
          "subscription_tier": "pro"
        },
        {
          "id": "claude-sonnet-4.5",
          "name": "Claude Sonnet 4.5",
          "context_window": 200000,
          "max_output": 16384,
          "cost_per_mtok": {"input": 3.0, "output": 15.0},
          "capabilities": ["coding", "reasoning", "multimodal"],
          "available": true,
          "subscription_tier": "pro"
        }
      ]
    },
    "codex": {
      "access_method": "subscription",
      "models": [
        {
          "id": "gpt-5-codex",
          "name": "GPT-5 Codex",
          "reasoning_levels": ["minimal", "low", "medium", "high"],
          "cost_per_mtok": {"input": 12.0, "output": 24.0},
          "available": true
        }
      ]
    }
  }
}
```

#### Discovery Flow
```
1. On first run or if cache expired:
   - Fetch models from each provider API
   - Parse available models, costs, capabilities
   - Write to state/models_registry.json
   - Log discovery results

2. During operation:
   - Load models from registry
   - Use for cost estimation and routing decisions
   - Re-fetch if models unavailable or task references unknown model

3. Fallback strategy:
   - If API fetch fails, scrape provider docs/websites
   - If both fail, use embedded defaults (current CODEX_PRESETS)
   - Log warnings about stale model data
```

### 3. Subscription-Aware Rate Limiting

#### Components

**`SubscriptionLimitTracker` (tools/wvo_mcp/src/limits/subscription_tracker.ts)**
- Tracks hourly and daily usage for subscription accounts
- Estimates limits based on tier (Free, Pro, Team)
- Warns when approaching limits

**`UsageEstimator` (tools/wvo_mcp/src/limits/usage_estimator.ts)**
- Estimates remaining quota based on token usage
- Projects when limits will be hit
- Recommends provider switching

#### Limit Tracking Structure
```json
{
  "provider": "claude",
  "account": "claude_primary",
  "tier": "pro",
  "limits": {
    "hourly_requests": 500,
    "daily_requests": 5000,
    "hourly_tokens": 100000,
    "daily_tokens": 1000000
  },
  "usage": {
    "current_hour": {
      "requests": 45,
      "tokens": 12500,
      "reset_at": "2025-10-16T13:00:00Z"
    },
    "current_day": {
      "requests": 350,
      "tokens": 95000,
      "reset_at": "2025-10-17T00:00:00Z"
    }
  },
  "warnings": {
    "approaching_hourly_limit": false,
    "approaching_daily_limit": false,
    "percentage_used": 0.35
  }
}
```

#### Rate Limiting Flow
```
1. Before each request:
   - Check current usage against limits
   - If >80% of hourly limit, warn and consider switching providers
   - If >95% of hourly limit, switch providers or queue task
   - If >99% of daily limit, mark provider unavailable until reset

2. After each request:
   - Update usage counters
   - Record token usage
   - Log to state/limits/usage_log.jsonl

3. On limit hit:
   - Set cooldown based on reset_at timestamp
   - Emit event for Director/Atlas notification
   - Switch to other provider if available
   - Queue tasks if no providers available
```

### 4. Telemetry Cleanup

#### Implementation
Add to `autopilot.sh`:
```bash
# Clean telemetry on startup if requested
if [ "${WVO_CLEAN_TELEMETRY:-1}" = "1" ]; then
  TELEMETRY_FILE="$ROOT/state/telemetry/usage.jsonl"
  if [ -f "$TELEMETRY_FILE" ]; then
    BACKUP_DIR="$ROOT/state/telemetry/archives"
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    mv "$TELEMETRY_FILE" "$BACKUP_DIR/usage_${TIMESTAMP}.jsonl"
    echo "Archived telemetry to $BACKUP_DIR/usage_${TIMESTAMP}.jsonl"
  fi
fi
```

Add to `OperationsManager` constructor:
```typescript
// Clean up telemetry at startup if fresh session
if (process.env.WVO_CLEAN_TELEMETRY !== '0') {
  await this.telemetryExporter.archiveAndReset();
}
```

### 5. Director & Critic Model Awareness

#### Integration Points

**Director Updates:**
- Reads from ModelRegistry to understand available models
- Can request specific model for strategic decisions
- Understands cost implications of model selection

**Critic Updates:**
- Each critic can specify preferred models for their domain
- Example: `tests` critic prefers fast models, `architecture` critic prefers reasoning models
- Model preferences stored in `tools/wvo_mcp/config/critic_model_preferences.json`

**Autopilot Updates:**
- Atlas (autopilot lead) queries ModelRegistry on startup
- Uses latest model information for task routing
- Reports model availability in status messages

## Implementation Plan

### Phase 1: Telemetry Cleanup (Immediate)
1. Add telemetry archiving to autopilot.sh
2. Add cleanup to OperationsManager
3. Test with make mcp-autopilot

### Phase 2: Model Discovery (Week 1)
1. Implement ModelDiscoveryService
2. Create ClaudeModelFetcher and CodexModelFetcher
3. Build ModelRegistry with caching
4. Update model_selector.ts to use registry
5. Update MODEL_COST_TABLE to query registry

### Phase 3: Semi-Permanent Auth (Week 1-2)
1. Implement AuthenticationManager
2. Create GoogleOAuthFlow for Claude
3. Build TokenRefresher service
4. Update auth_checker.ts to use new system
5. Add encrypted token storage

### Phase 4: Subscription Rate Limiting (Week 2)
1. Implement SubscriptionLimitTracker
2. Create UsageEstimator
3. Update AgentPool to check limits before dispatch
4. Add proactive provider switching

### Phase 5: Director/Critic Integration (Week 2-3)
1. Update Director to read ModelRegistry
2. Add model preferences to critic config
3. Update autopilot.sh to report model availability
4. Test end-to-end with various scenarios

## Testing Strategy

### Unit Tests
- AuthenticationManager token refresh logic
- ModelDiscoveryService API parsing
- SubscriptionLimitTracker usage calculations
- TokenRefresher expiry detection

### Integration Tests
- Full auth flow with mock OAuth
- Model discovery with mock APIs
- Rate limiting with simulated usage
- Telemetry cleanup on startup

### End-to-End Tests
- Claude MCP connection with semi-permanent auth
- Task routing with discovered models
- Limit handling with multiple accounts
- Failover when one provider reaches limits

## Rollout Plan

### Stage 1: Opt-In Beta
- New features behind feature flags
- `WVO_AUTH_MANAGER_ENABLED=1` for new auth
- `WVO_MODEL_DISCOVERY_ENABLED=1` for auto-discovery
- `WVO_SUBSCRIPTION_LIMITS_ENABLED=1` for limit tracking

### Stage 2: Gradual Rollout
- Enable for 25% of sessions
- Monitor for auth failures, model discovery errors
- Collect feedback from Director/Atlas

### Stage 3: Full Deployment
- Enable by default
- Keep old auth_checker.ts as fallback
- Document migration path for users

## Security Considerations

1. **Token Encryption**: Use Node crypto module to encrypt refresh tokens at rest
2. **OAuth Scopes**: Request minimal scopes for Google OAuth (email, profile)
3. **Token Rotation**: Rotate refresh tokens every 30 days
4. **Secure Storage**: Ensure .accounts/ directory has 0700 permissions
5. **Audit Logging**: Log all auth events to state/auth_audit.log

## Monitoring & Alerting

1. **Auth Health**: Track refresh success rate, alert on >5% failure
2. **Model Discovery**: Alert if discovery fails for >24 hours
3. **Limit Tracking**: Warn when >80% of any limit reached
4. **Telemetry Size**: Alert if archives exceed 100MB

## Documentation Updates

1. Update README.md with new auth setup instructions
2. Add guide for Google OAuth setup for Claude
3. Document model discovery configuration
4. Add troubleshooting guide for auth issues
5. Update MCP_ORCHESTRATOR.md with new architecture

## Success Metrics

1. **Auth Reliability**: >99% uptime without manual intervention
2. **Model Discovery**: Always current within 24 hours
3. **Limit Avoidance**: <1% of tasks hit rate limits
4. **Telemetry Accuracy**: Metrics accurate to current session
