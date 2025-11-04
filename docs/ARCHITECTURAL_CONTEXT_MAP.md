# Architectural Context Map
## Low-Token System Vision for Integration Decisions

**Purpose**: Provide architectural context in < 500 tokens to prevent integration gaps
**Usage**: Read BEFORE starting ANY task involving integration

---

## Entry Points (How Things Start)

```
1. MCP Server (index-claude.js / index.js)
   ├─> OrchestratorRuntime (worker/worker_entry.js - IPC worker)
   │   ├─> UnifiedOrchestrator (orchestration logic)
   │   ├─> AgentPool (agent execution)
   │   └─> WorkerManager (process management)
   │
   └─> Tool Routers (MCP tool handlers)
       ├─> Orchestrator tools (planning, status, etc.)
       └─> Executor tools (file I/O, commands)

2. CLI Commands (package.json scripts)
   - auto:claude → claude chat --mcp weathervane (starts MCP + CLI)
   - start:claude → MCP server only
   - dev:claude → Development mode

3. Direct Execution
   - npm test → Vitest (test runner)
   - npm run build → TypeScript compiler
```

**Rule**: If adding safety/monitoring → integrate into **OrchestratorRuntime**, NOT UnifiedOrchestrator

---

## Integration Points (Where Features Go)

| Feature Type | Integration Point | Example |
|--------------|-------------------|---------|
| Safety/Monitoring | `OrchestratorRuntime.start()` | HeartbeatWriter, SafetyMonitor |
| Task Orchestration | `UnifiedOrchestrator` | State machine, task routing |
| Agent Execution | `AgentPool` | Agent lifecycle, execution |
| MCP Tools | `tool_router.ts` | New MCP tool handlers |
| CLI Commands | `package.json` scripts | New user-facing commands |
| Worker Processes | `WorkerManager` | Process spawning, lifecycle |

**Quick Check**:
```bash
# Where does my feature belong?
grep -r "class.*Runtime\|class.*Orchestrator" src/orchestrator/*.ts | grep -v test

# What's the actual entry point?
grep "new OrchestratorRuntime" src/ -r
```

---

## Common Patterns (How Similar Features Work)

### Pattern: Adding Safety/Monitoring

```typescript
// ✅ CORRECT: In OrchestratorRuntime
class OrchestratorRuntime {
  private featureName: FeatureType | null = null;

  async start() {
    // Start feature
    this.featureName = new FeatureType(config);
    this.featureName.start();

    // ... rest of start logic
  }

  stop() {
    if (this.featureName) {
      this.featureName.stop();
    }
    // ... rest of stop logic
  }
}
```

### Pattern: Adding MCP Tool

```typescript
// In tool_router.ts
async handleToolName(params: ToolParams): Promise<ToolResult> {
  // Validate params
  // Call underlying service
  // Return formatted result
}

// Register in routing table
private toolHandlers = {
  tool_name: this.handleToolName.bind(this),
  // ...
};
```

### Pattern: Adding State/Task Processing

```typescript
// In UnifiedOrchestrator or state runners
async handleState(context: StateContext): Promise<StateResult> {
  // State-specific logic
  // Delegate to agents
  // Return next state
}
```

---

## Systemic Issues (Root Causes to Fix)

### Issue 1: Integration Theater

**Symptom**: Feature called but output not used
**Root Cause**: No verification that output flows to consumer
**Fix**: Programmatic integration tests (verify data flow)
**Prevention**: Use integration verification script

### Issue 2: Wrong Integration Point

**Symptom**: Feature added to wrong class (e.g., UnifiedOrchestrator instead of OrchestratorRuntime)
**Root Cause**: Didn't verify entry point uses target class
**Fix**: DISCOVER phase (mandatory architecture discovery)
**Prevention**: Check with `grep "new TargetClass" entry_point.js`

### Issue 3: Documented But Not Implemented

**Symptom**: PLAN says "create X" but X never created
**Root Cause**: No artifact existence verification
**Fix**: Implementation completeness script
**Prevention**: Run `scripts/verify_implementation_completeness.sh` in VERIFY stage

### Issue 4: Assumption-Based Design

**Symptom**: "Should be" / "Probably" / "Assumes" in design docs
**Root Cause**: No verification of assumptions
**Fix**: DISCOVER phase with explicit verification
**Prevention**: Fail-fast checkpoint after STRATEGIZE (reject assumptions)

---

## Priority Matrix (What to Fix First)

| Issue | Impact | Frequency | Priority | Action |
|-------|--------|-----------|----------|--------|
| Wrong entry point | High | Medium | **P0** | Add DISCOVER phase |
| Integration theater | High | High | **P0** | Add integration tests |
| Missing artifacts | Medium | High | **P1** | Add completeness checks |
| Assumptions | Medium | Medium | **P1** | Add verification step |
| Documentation debt | Low | Low | P2 | Periodic cleanup |

**Rule**: Always fix **systemic** issues (P0/P1) over **symptoms** (P2/P3)

---

## Quick Decision Tree (< 200 tokens)

```
Starting a task? →

┌─ Does it integrate with existing code?
│  ├─ YES → Run DISCOVER phase
│  │  ├─ Find entry point
│  │  ├─ Identify integration target
│  │  └─ Verify with grep/test
│  │
│  └─ NO → Proceed to SPEC
│
├─ Does it add safety/monitoring?
│  ├─ YES → Integrate to OrchestratorRuntime
│  └─ NO → Check pattern matching
│
├─ Does it add new tool?
│  ├─ YES → Add to tool_router.ts
│  └─ NO → Check pattern matching
│
└─ Unsure? → Read this doc + escalate
```

---

## Fast Verification (< 5 minutes)

```bash
# 1. Check entry point (30s)
cat package.json | jq '.scripts.auto'
grep "new.*Orchestrator" src/worker/worker_entry.ts

# 2. Find integration point (60s)
grep -r "class OrchestratorRuntime" src/
grep "export class OrchestratorRuntime" src/orchestrator/orchestrator_runtime.ts

# 3. Verify pattern (60s)
grep -A 10 "private.*Writer\|private.*Monitor" src/orchestrator/orchestrator_runtime.ts

# 4. Check similar features (60s)
ls src/utils/*.ts | grep -E "heartbeat|safety|monitor"

# 5. Validate assumptions (60s)
test -f dist/worker/worker_entry.js && echo "✅ Entry exists" || echo "❌ Entry missing"
```

**Total: < 5 minutes to gain architectural context**

---

## Context Queries (Use When Stuck)

### "Where does my feature belong?"

```bash
# Find similar features
grep -r "class.*$(echo $FEATURE | sed 's/Monitor//')" src/

# Check integration points
grep "new $FEATURE\|import.*$FEATURE" src/orchestrator/
```

### "What's the actual entry point?"

```bash
# Check package.json
cat package.json | jq '.scripts | to_entries[] | select(.key | contains("auto"))'

# Trace from entry
grep -r "new Orchestrator" src/worker/
```

### "Is this solving the root cause?"

Ask:
1. Does this fix OTHER instances of the same problem? (Systemic?)
2. Will this prevent FUTURE instances? (Preventive?)
3. Does this integrate with existing solutions? (Cohesive?)

If NO to all → **You're treating symptoms, not root causes**

---

## Token Budget

| Section | Tokens | When to Read |
|---------|--------|--------------|
| Entry Points | ~150 | Every integration task |
| Integration Points | ~100 | When adding features |
| Common Patterns | ~200 | When implementing |
| Systemic Issues | ~150 | When fixing bugs |
| Quick Decision Tree | ~100 | Every task start |
| Fast Verification | ~50 | Before SPEC stage |

**Total**: ~750 tokens for complete context (acceptable for task start)
**Minimum**: ~250 tokens for decision tree + verification (very efficient)

---

## Update Protocol

**When to update this doc**:
- New entry point discovered
- New integration pattern established
- New systemic issue identified
- Architecture changes

**How to update**:
- Keep sections under token budgets
- Prioritize actionable information
- Remove stale patterns
- Add verification commands, not prose

**Review frequency**: After every architectural change or integration gap incident

---

## Example Usage

**Scenario**: Adding HeartbeatWriter to monitor process health

**Before starting**:
```bash
# Quick check (2 min)
$ cat docs/ARCHITECTURAL_CONTEXT_MAP.md | grep -A 5 "Safety/Monitoring"
→ Integration Point: OrchestratorRuntime.start()

$ grep "class OrchestratorRuntime" src/
→ src/orchestrator/orchestrator_runtime.ts:export class OrchestratorRuntime

$ grep "new OrchestratorRuntime" src/
→ src/worker/worker_entry.ts: runtime = new OrchestratorRuntime(...)

$ test -f src/orchestrator/orchestrator_runtime.ts && echo "✅"
→ ✅
```

**Decision**: Integrate HeartbeatWriter into `OrchestratorRuntime`, test via `worker_entry.js`

**Time saved**: 2+ hours (would have integrated to wrong class otherwise)

---

**Document Version**: 1.0
**Tokens**: ~750 (acceptable for critical context)
**Last Updated**: 2025-10-27
**Owner**: Claude (Architectural Guardian)
