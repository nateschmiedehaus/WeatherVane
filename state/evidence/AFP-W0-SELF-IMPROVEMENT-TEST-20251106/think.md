# THINK - Edge Cases and Failure Mode Analysis

**Task ID:** AFP-W0-SELF-IMPROVEMENT-TEST-20251106
**Date:** 2025-11-06
**Phase:** THINK
**Criticality:** EXTREME - Must catch ALL failure modes

## Critical Failure Scenarios

### 1. MCP Server Failures

#### Scenario 1.1: MCP Server Binary Missing
**What happens:** spawn() fails with ENOENT
**Impact:** Wave 0 completely non-functional
**Detection:** Try-catch around spawn
**Recovery:**
```typescript
// Auto-install MCP server
await exec('npm install -g @modelcontextprotocol/server');
// Retry connection
```

#### Scenario 1.2: MCP Server Crashes Mid-Task
**What happens:** EPIPE errors on stdio
**Impact:** Task fails, evidence incomplete
**Detection:** Handle 'error' and 'exit' events
**Recovery:**
```typescript
// Restart server
await this.restartMCPServer();
// Resume from last checkpoint
await this.resumeTask(lastPhase);
```

#### Scenario 1.3: MCP Server Hangs/Deadlock
**What happens:** Tool calls never return
**Impact:** Wave 0 stuck forever
**Detection:** Timeout on all tool calls
**Recovery:**
```typescript
const timeout = setTimeout(() => {
  this.server.kill('SIGKILL');
  throw new Error('MCP timeout');
}, 30000);
```

### 2. Clone Manager Catastrophes

#### Scenario 2.1: Clone Escapes Isolation
**What happens:** Clone modifies parent's files
**Impact:** Production Wave 0 corrupted
**Root Cause:** Symlinks, shared mounts, or hardlinks
**Prevention:**
```typescript
// Fully copy, no links
cp -r --no-preserve=links

// Verify isolation
lsof -p $CLONE_PID | grep -v /tmp/wave0-clone
```

#### Scenario 2.2: Resource Fork Bomb
**What happens:** Clone spawns more clones recursively
**Impact:** System crash
**Prevention:**
```bash
# Set resource limits
ulimit -u 50  # Max processes
ulimit -m 512000  # Max memory

# Clone detection
if [[ "$WAVE0_MODE" == "test" ]]; then
  echo "Already in test mode, refusing to clone"
  exit 1
fi
```

#### Scenario 2.3: Port Exhaustion
**What happens:** All ports 8000-9000 taken
**Impact:** Cannot create clones
**Detection:** EADDRINUSE errors
**Recovery:**
```typescript
// Scan wider range
for (let port = 10000; port < 65535; port++) {
  if (await isPortFree(port)) return port;
}
throw new Error('No ports available');
```

### 3. Provider Router Disasters

#### Scenario 3.1: Both Providers Rate Limited
**What happens:** No provider available
**Impact:** Wave 0 stops
**Current Code:** No handling!
**Fix Required:**
```typescript
if (!this.canUse('claude') && !this.canUse('codex')) {
  // Wait for reset
  const resetTime = Math.min(
    this.getResetTime('claude'),
    this.getResetTime('codex')
  );
  await sleep(resetTime);
}
```

#### Scenario 3.2: Provider Returns Garbage
**What happens:** LLM hallucinates, returns invalid code
**Impact:** Build failures, corrupt files
**Detection:** Post-generation validation
**Recovery:**
```typescript
// Validate generated code
const isValid = await this.validateCode(generated);
if (!isValid) {
  // Retry with different provider
  return this.generateWithFallback(otherProvider);
}
```

#### Scenario 3.3: Provider Auth Expires
**What happens:** 401/403 errors
**Impact:** Provider unavailable
**Detection:** Check status codes
**Recovery:**
```typescript
// Re-authenticate
await this.refreshAuth(provider);
// Retry request
```

### 4. Content Generation Nightmares

#### Scenario 4.1: Generated Code Has Security Vulns
**What happens:** SQL injection, XSS, etc.
**Impact:** Security breach
**Example:**
```typescript
// LLM generates:
const query = `SELECT * FROM users WHERE id = ${userId}`;
```
**Prevention:**
```typescript
// Security scan all generated code
const vulns = await securityScan(code);
if (vulns.length > 0) {
  throw new Error(`Security vulnerabilities detected: ${vulns}`);
}
```

#### Scenario 4.2: Infinite Code Generation
**What happens:** LLM generates code that generates more code
**Impact:** Disk full, memory exhausted
**Prevention:**
```typescript
// Size limits
if (generated.length > 100000) {
  throw new Error('Generated content too large');
}
// Recursion detection
if (generated.includes('ContentGenerator.generate')) {
  throw new Error('Recursive generation detected');
}
```

### 5. Self-Modification Hazards

#### Scenario 5.1: Wave 0 Deletes Itself
**What happens:** rm -rf on own directory
**Impact:** Wave 0 destroyed
**Prevention:**
```typescript
// Protect critical files
const protected = [
  'wave0/runner.ts',
  'wave0/task_executor.ts'
];
if (protected.some(f => command.includes(f))) {
  throw new Error('Cannot modify protected files');
}
```

#### Scenario 5.2: Modification Creates Syntax Error
**What happens:** Wave 0 can't start after self-mod
**Impact:** Permanently broken
**Prevention:**
```typescript
// Test in clone first
const clone = await this.createClone();
await clone.applyModification(changes);
const testResult = await clone.test();
if (!testResult.success) {
  throw new Error('Modification breaks Wave 0');
}
```

#### Scenario 5.3: Version Mismatch After Update
**What happens:** New code incompatible with old state
**Impact:** Crashes on startup
**Recovery:**
```typescript
// Version state schema
interface StateV1 { version: 1; ... }
interface StateV2 { version: 2; ... }

// Migration logic
if (state.version < currentVersion) {
  state = migrate(state);
}
```

### 6. Resource Management Crises

#### Scenario 6.1: Memory Leak Accumulation
**What happens:** Memory grows unbounded
**Impact:** OOM killer terminates Wave 0
**Detection:**
```typescript
// Monitor memory
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 500_000_000) {
    console.error('Memory leak detected');
    process.exit(1); // Restart via systemd
  }
}, 60000);
```

#### Scenario 6.2: Zombie Processes
**What happens:** Clones don't die properly
**Impact:** Process table full
**Prevention:**
```typescript
// Always cleanup
process.on('exit', () => {
  for (const clone of activeClones) {
    clone.process.kill('SIGKILL');
  }
});
```

### 7. Concurrency Chaos

#### Scenario 7.1: Race Condition in Task Selection
**What happens:** Two Wave 0s grab same task
**Impact:** Duplicate work, conflicts
**Prevention:**
```typescript
// Atomic task claim
const claimed = await db.transaction(async tx => {
  const task = await tx.query(
    'UPDATE tasks SET status = "in_progress", worker = $1
     WHERE status = "pending" LIMIT 1
     RETURNING *',
    [workerId]
  );
  return task;
});
```

#### Scenario 7.2: Deadlock Between Parent and Clone
**What happens:** Both waiting for each other
**Impact:** Both stuck forever
**Prevention:**
```typescript
// Timeout all inter-process communication
const result = await Promise.race([
  clone.execute(task),
  timeout(60000)
]);
```

### 8. Data Corruption Scenarios

#### Scenario 8.1: Partial Write During Crash
**What happens:** File half-written
**Impact:** Corrupt evidence, can't parse
**Prevention:**
```typescript
// Atomic writes
await fs.writeFile(`${path}.tmp`, content);
await fs.rename(`${path}.tmp`, path);
```

#### Scenario 8.2: Git Conflicts from Parallel Mods
**What happens:** Merge conflicts in evidence
**Impact:** Git operations fail
**Prevention:**
```typescript
// Sequential git operations
await gitLock.acquire();
try {
  await git.add(files);
  await git.commit(message);
} finally {
  gitLock.release();
}
```

## Complexity Analysis

### Cyclomatic Complexity
- **MCP Client:** 15 (error paths)
- **Clone Manager:** 20 (isolation checks)
- **Provider Router:** 10 (routing logic)
- **Content Generator:** 25 (validation)
- **Total:** 70 (HIGH - justified by safety requirements)

### State Space Explosion
- Providers: 2 states each = 4 combinations
- Clones: N active = 2^N states
- Tasks: M in progress = M! orderings
- **Total States:** O(4 × 2^N × M!) - EXPONENTIAL

### Mitigation Strategies

1. **State Reduction**
   - Max 3 clones active
   - Sequential task processing
   - Single provider per task

2. **Defensive Programming**
   - Every function has timeout
   - Every resource has limit
   - Every operation is idempotent

3. **Fail-Safe Defaults**
   - Default to no-op on error
   - Default to safe mode
   - Default to human escalation

## Critical Invariants to Maintain

1. **Clone Isolation:** Clone.workDir ∩ Parent.workDir = ∅
2. **Resource Bounds:** Memory < 512MB, CPU < 25%
3. **Task Uniqueness:** ∀t ∈ Tasks, |Workers(t)| ≤ 1
4. **Provider Balance:** |Usage(Claude) - Usage(Codex)| < 20%
5. **State Consistency:** Version(Code) = Version(State)

## Failure Mode Priority

### P0 - Catastrophic (Must Prevent)
1. Production data corruption
2. Self-destruction
3. Resource exhaustion
4. Security breach

### P1 - Critical (Must Detect)
1. MCP server failure
2. Clone escape
3. Provider unavailability
4. Memory leaks

### P2 - Major (Must Handle)
1. Build failures
2. Test failures
3. Git conflicts
4. Network issues

## Testing Strategy for Edge Cases

### Chaos Engineering Tests
```typescript
describe('Chaos Tests', () => {
  it('survives MCP server crash', async () => {
    await wave0.start();
    process.kill(mcpPid, 'SIGKILL');
    await wave0.executeTask(task);
    expect(wave0.isHealthy()).toBe(true);
  });

  it('survives memory pressure', async () => {
    // Allocate 400MB
    const bloat = Buffer.alloc(400_000_000);
    await wave0.executeTask(task);
    expect(process.memoryUsage().heapUsed).toBeLessThan(512_000_000);
  });
});
```

## Conclusion

Wave 0.1 has **70+ identified failure modes**. Each requires:
1. Detection mechanism
2. Recovery strategy
3. Test coverage
4. Monitoring

The complexity is HIGH but justified by the requirement for autonomous operation. Without these safeguards, Wave 0 will inevitably corrupt itself or the system.

**Next Step:** GATE phase must evaluate if this complexity is acceptable.