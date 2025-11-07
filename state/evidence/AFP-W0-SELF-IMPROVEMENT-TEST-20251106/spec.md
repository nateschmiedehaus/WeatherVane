# SPEC - Wave 0 Functional Requirements

**Task ID:** AFP-W0-SELF-IMPROVEMENT-TEST-20251106
**Date:** 2025-11-06
**Criticality Level:** MAXIMUM - No Theater Allowed

## Brutal Assessment of Current Wave 0

Wave 0.0 is **fundamentally broken**:
- It's a glorified echo chamber that writes timestamps
- MCPClient.execute() returns `{success: true}` without doing ANYTHING
- It can't even read a file, let alone modify code
- Provider "switching" is a lie - it's hardcoded
- The entire system is performance theater

## Non-Negotiable Requirements

### 1. Real MCP Tool Execution
**Current:** Fake responses, no actual execution
**Required:**
- MUST connect to real MCP server via stdio
- MUST execute actual tools (fs_read, fs_write, cmd_run)
- MUST handle real responses and errors
- MUST parse actual tool output

**Acceptance Criteria:**
```typescript
// This must ACTUALLY read a file, not return fake data
const content = await mcp.execute('fs_read', {path: 'package.json'});
assert(content.includes('"name"')); // Real file content
```

### 2. Self-Cloning for Testing
**Current:** Nonexistent
**Required:**
- MUST spawn separate process with new PID
- MUST use different state directory (e.g., /tmp/wave0-test-${timestamp})
- MUST handle port conflicts (MCP server ports)
- MUST clean up after testing
- MUST prevent lock file conflicts

**Acceptance Criteria:**
```bash
# Parent Wave 0 at PID 12345
# Clone spawns at PID 67890 with isolated state
ps aux | grep wave0  # Shows 2 distinct processes
```

### 3. Provider Intelligence
**Current:** Hardcoded, no switching
**Required:**
- MUST detect provider from environment/config
- MUST switch based on task complexity
- MUST handle rate limits with fallback
- MUST track token usage per provider
- MUST work with BOTH Claude and Codex

**Acceptance Criteria:**
```typescript
// Complex reasoning → Claude
// Code generation → Codex
// Automatic switching on rate limit
telemetry.provider_switches > 0
```

### 4. Real Content Generation
**Current:** Template strings with timestamps
**Required:**
- MUST generate actual executable code
- MUST create real passing tests
- MUST write meaningful documentation
- MUST produce compilable TypeScript/Python
- MUST handle different file types correctly

**Acceptance Criteria:**
```bash
# After Wave 0 implements something
npm run build  # MUST succeed
npm test       # MUST pass
git diff       # MUST show real, valuable changes
```

### 5. Feature Parity with Manual Mode
**Current:** Maybe 10% coverage
**Required:**
- TodoWrite for task tracking
- Git operations (add, commit, status)
- Build and test execution
- File operations (read, write, edit)
- Web fetch and search
- Error handling and retries
- Quality gate enforcement
- Evidence generation

**Acceptance Criteria:**
```
Manual mode features: 50+
Wave 0 features: 50+ (100% parity)
Missing features: 0
```

## Performance Requirements

### Throughput
- Complete simple task: < 5 minutes
- Complete complex task: < 30 minutes
- Provider switch time: < 2 seconds
- Clone creation: < 10 seconds

### Resource Usage
- Memory: < 512MB per instance
- CPU: < 25% sustained
- Disk I/O: < 100MB per task
- Network: Respect rate limits

### Reliability
- Success rate: > 80% for standard tasks
- Recovery rate: > 95% from transient failures
- Uptime: Can run 24+ hours continuously
- No memory leaks over time

## Self-Improvement Requirements

### Safe Testing
1. Clone must be fully isolated:
   - Separate PID and process group
   - Different working directory
   - Isolated MCP server instance
   - Separate state/evidence paths
   - No shared locks or leases

2. Validation before rollout:
   - Test clone must complete 3+ tasks successfully
   - Resource usage must stay within limits
   - No crashes or hangs allowed
   - Changes must be git-diffable

3. Rollback capability:
   - Keep last known good version
   - Automatic rollback on failure
   - Preserve evidence of failures

## Observable Evidence Requirements

Every Wave 0 execution MUST produce:

1. **Git commits** with real changes (not just timestamps)
2. **Build logs** showing compilation success
3. **Test results** with coverage metrics
4. **Telemetry** showing provider switches
5. **Resource metrics** proving efficiency
6. **Error logs** when things fail (they will)

## Critical Failure Modes to Handle

1. **MCP server not running** → Auto-start it
2. **Provider rate limited** → Switch providers
3. **Clone conflicts** → Use unique ports/paths
4. **Build failures** → Capture and retry
5. **Test failures** → Document and continue
6. **Memory leaks** → Restart periodically
7. **Infinite loops** → Timeout and kill

## Definition of Done

Wave 0.1 is ONLY complete when:

1. ✅ Can execute real MCP tools (verified by file changes)
2. ✅ Can clone itself safely (verified by ps aux)
3. ✅ Can switch providers (verified by telemetry)
4. ✅ Can generate real code (verified by compilation)
5. ✅ Can improve itself (verified by successful self-modification)
6. ✅ Matches manual mode features (verified by feature audit)
7. ✅ Handles all failure modes (verified by chaos testing)

**No shortcuts. No theater. Real functionality only.**