# WVO MCP Efficiency Audit

## Executive Summary

✅ **Web inspiration is NOT forced** - it's opt-in via `WVO_ENABLE_WEB_INSPIRATION=1`
⚠️ **Found minor inefficiencies** - unnecessary initialization and function calls when features are disabled
✅ **Token management is well-designed** - context assembly uses multi-tier fallback strategies

---

## Findings

### 1. Web Inspiration Feature (NOT FORCED)

**Status:** Opt-in via environment variable

```bash
# autopilot.sh:36
WVO_ENABLE_WEB_INSPIRATION=${WVO_ENABLE_WEB_INSPIRATION:-0}  # Defaults to OFF
```

**Inefficiency Found:**
- `WebInspirationManager` is **always instantiated** even when disabled (orchestrator_runtime.ts:48-52)
- `ensureInspiration()` is **called for every task** (claude_code_coordinator.ts:192), though it exits early if disabled

**Impact:** Low (exits early), but wastes initialization cycles

**Recommendation:** Lazy-load or conditionally instantiate based on env var

---

### 2. Token Efficiency (WELL-DESIGNED)

**Context Assembly Strategy** (claude_code_coordinator.ts:499-544):
```typescript
// Multi-tier fallback to maximize context while staying under token limits
strategies = [
  { includeCodeContext: true, maxDecisions: 6, maxLearnings: 3, hoursBack: 24 },
  { includeCodeContext: true, maxDecisions: 4, maxLearnings: 2, hoursBack: 12 },
  { includeCodeContext: true, maxDecisions: 3, maxLearnings: 2, hoursBack: 12 },
  { includeCodeContext: false, maxDecisions: 2, maxLearnings: 1, hoursBack: 6 }
]
```

✅ **This is excellent** - progressively reduces context until it fits under 32K character limit

**Snapshot Throttling** (operations_manager.ts:206-208):
```typescript
// Max 1 snapshot per 2 seconds prevents expensive recomputation
if (now - this.lastSnapshotTime < this.SNAPSHOT_THROTTLE_MS && this.lastSnapshot) {
  return;  // Use cached snapshot
}
```

✅ **This is excellent** - prevents redundant expensive operations

---

### 3. No Other Forced Features

Audited for forced behaviors:
- ❌ No forced screenshot capture
- ❌ No forced web fetching
- ❌ No forced heavy operations
- ✅ All critics are opt-in via `critics_run` tool
- ✅ Capability profiles (low/medium/high) properly control resource usage

---

## Recommendations for Maximum Efficiency

### Immediate Fixes

**1. Lazy-load WebInspirationManager** (orchestrator_runtime.ts)

```typescript
// BEFORE (current)
this.webInspirationManager = new WebInspirationManager(
  workspaceRoot,
  this.stateMachine,
  this.operationsManager
);

// AFTER (conditional)
this.webInspirationManager = process.env.WVO_ENABLE_WEB_INSPIRATION === '1'
  ? new WebInspirationManager(workspaceRoot, this.stateMachine, this.operationsManager)
  : undefined;
```

**2. Skip ensureInspiration call entirely when disabled** (claude_code_coordinator.ts:192)

```typescript
// BEFORE (current)
await this.webInspirationManager?.ensureInspiration(task);

// AFTER (conditional check before call)
if (this.webInspirationManager?.isEnabled()) {
  await this.webInspirationManager.ensureInspiration(task);
}
```

**Savings:** Eliminates function call overhead for every task execution

---

### Long-term Optimizations

**3. Add telemetry for token usage tracking**
- Currently using character-based estimation (4 chars = 1 token)
- Consider actual token counting for precise budget management

**4. Cache expensive operations more aggressively**
- Quality monitor evaluations could be cached per git commit SHA
- Context assembly could use content-addressed caching

**5. Profile-based feature flags**
```typescript
interface ProfileConfig {
  enableWebInspiration: boolean;
  enableClaudeEval: boolean;
  snapshotThrottleMs: number;
  maxContextStrategies: number;
}

const PROFILES: Record<'low' | 'medium' | 'high', ProfileConfig> = {
  low: {
    enableWebInspiration: false,
    enableClaudeEval: false,
    snapshotThrottleMs: 5000,
    maxContextStrategies: 2  // Only try 2 fallback strategies
  },
  medium: {
    enableWebInspiration: false,  // Still opt-in via env
    enableClaudeEval: true,
    snapshotThrottleMs: 2000,
    maxContextStrategies: 4
  },
  high: {
    enableWebInspiration: true,
    enableClaudeEval: true,
    snapshotThrottleMs: 1000,
    maxContextStrategies: 4
  }
};
```

---

## Current Efficiency Scorecard

| Category | Rating | Notes |
|----------|--------|-------|
| Token Management | ✅ Excellent | Multi-tier context fallback, 32K char limit |
| Snapshot Throttling | ✅ Excellent | 2-second throttle prevents redundant work |
| Lazy Loading | ⚠️ Needs Work | WebInspirationManager always instantiated |
| Feature Forcing | ✅ Good | No features are forced; all opt-in |
| Caching Strategy | ✅ Good | Auth cache (15min TTL), MCP registry cache |
| Context Assembly | ✅ Excellent | Progressive reduction until fits budget |

---

## Implementation Priority

1. **HIGH:** Lazy-load WebInspirationManager (5 min fix, meaningful savings)
2. **MEDIUM:** Skip ensureInspiration call when disabled (2 min fix, minor savings)
3. **LOW:** Profile-based feature flags (1 hour, organizational improvement)
4. **RESEARCH:** Token-accurate counting vs char estimation (needs benchmarking)

---

## Summary

The MCP is **NOT forcing web inspiration or any other features**. Token efficiency is **well-designed** with multi-tier context assembly and snapshot throttling. The only inefficiency is unnecessary initialization of disabled features, which can be fixed with lazy loading.

**Overall Assessment:** 8.5/10 for agent efficiency
- Excellent token budgeting
- Good caching strategies
- Minor initialization waste (easily fixable)
- No forced features
