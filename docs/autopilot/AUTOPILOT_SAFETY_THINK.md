# Autopilot Safety Design - Adversarial Review (THINK Phase)

## Hard Questions & Challenges

### Process Cleanup Challenges

**Q1: What if the PID gets reused by another process?**
- **Scenario**: Autopilot writes PID 12345, crashes. OS assigns PID 12345 to `vim`. Next autopilot start reads PID file, kills PID 12345 (vim) by mistake.
- **Risk**: HIGH - could kill user's processes
- **Mitigation**:
  - Store more metadata in PID file: process name, start time, command line
  - On cleanup: verify process name matches "node" and command contains "unified_orchestrator"
  - If mismatch: log warning, delete PID file, don't kill process
- **Updated Design**: Add `verifyProcessIdentity(pid, metadata)` function

**Q2: What if process.kill(pid, 0) returns false positive?**
- **Scenario**: Process exists but is owned by different user → `process.kill()` throws EPERM (permission denied), not ESRCH (no such process)
- **Risk**: MEDIUM - would think process is alive when it's not (or vice versa)
- **Mitigation**:
  - Check both ESRCH and EPERM errors
  - On EPERM: check `/proc/{pid}/cmdline` (Linux) or `ps -p {pid}` (macOS)
- **Updated Design**: Handle EPERM separately from ESRCH

**Q3: What if child process becomes orphaned but reparented to init?**
- **Scenario**: Parent autopilot dies, child worker reparented to init (PID 1). kill_autopilot.sh can't find it.
- **Risk**: HIGH - orphaned workers consume resources indefinitely
- **Mitigation**:
  - Store ALL child PIDs in PID file: `{parent: 12345, children: [12346, 12347]}`
  - On cleanup: kill parent + all listed children
  - Use `pgrep` to find any `node.*unified_orchestrator` processes as fallback
- **Updated Design**: PID file stores process tree, not just parent

**Q4: What if SIGKILL is sent to parent but children are in different process group?**
- **Scenario**: Children spawned without `setpgid()`, parent killed with SIGKILL, children survive
- **Risk**: CRITICAL - exactly the bug we're trying to fix
- **Mitigation**:
  - MUST use `setpgid(0, 0)` when forking children
  - Test this with chaos test: start autopilot, SIGKILL parent, verify children die
- **Updated Design**: Add verification that process group is set correctly

###

 Continuous Operation Challenges

**Q5: What if autopilot gets stuck in infinite loop without crashing?**
- **Scenario**: Code bug causes `while (!this.shouldStop)` to never make progress, but doesn't throw error
- **Risk**: HIGH - supervisor won't restart (no crash), heartbeat stops, tasks never complete
- **Mitigation**:
  - Heartbeat monitoring: external script checks heartbeat age
  - If heartbeat > 15 min old → kill autopilot, supervisor restarts
  - Add `MAX_LOOP_ITERATIONS` circuit breaker
- **Updated Design**: Add external heartbeat monitor script

**Q6: What if supervisor itself crashes?**
- **Scenario**: Supervisor script crashes, autopilot continues running but won't restart on crash
- **Risk**: MEDIUM - single point of failure
- **Mitigation**:
  - Use systemd (Linux) or launchd (macOS) to keep supervisor alive
  - Document manual restart: `bash autopilot_supervisor.sh &`
  - Add PID file for supervisor itself
- **Updated Design**: Recommend systemd/launchd for production

**Q7: What if exponential backoff reaches max and autopilot keeps crashing?**
- **Scenario**: Persistent bug causes crash loop, backoff hits 60s, still crashes 10 times in 5 min
- **Risk**: LOW - circuit breaker stops it
- **Action**: This is correct behavior (fail-fast), but need to log WHY it's crashing
- **Mitigation**: Log stack traces to `state/autopilot_crashes.log` before exiting
- **Updated Design**: Add crash logging with stack traces

### Resource Limit Challenges

**Q8: What if `df` command is not available to check disk space?**
- **Scenario**: Minimal Docker container without `df`, script fails to start
- **Risk**: LOW - most systems have `df`
- **Mitigation**: Wrap in `command -v df` check, skip disk check if not available
- **Updated Design**: Make disk check optional

**Q9: What if setting process group fails (EPERM)?**
- **Scenario**: Running in restricted environment (container, sandbox) where setpgid is blocked
- **Risk**: MEDIUM - can't kill process tree reliably
- **Mitigation**:
  - Try setpgid, catch error, log warning if it fails
  - Fall back to killing individual PIDs from PID file
- **Updated Design**: Graceful degradation if setpgid fails

**Q10: What if memory limit is too low and workers OOM?**
- **Scenario**: `--max-old-space-size=2048` too small for large codebases, workers crash with OOM
- **Risk**: MEDIUM - autopilot appears broken
- **Mitigation**:
  - Make memory limit configurable (env var `WVO_WORKER_MEMORY_MB`)
  - Log clear error message when OOM detected
  - Default to 4GB, not 2GB
- **Updated Design**: Increase default to 4GB, make configurable

### Testing Challenges

**Q11: How do you test SIGKILL without actually killing the test runner?**
- **Scenario**: `kill -9 $$` in test would kill test process itself
- **Risk**: Can't verify SIGKILL behavior
- **Mitigation**:
  - Fork child process in test
  - Send SIGKILL to child PID (not test runner)
  - Verify child's PID file gets cleaned up by next start
- **Updated Design**: Chaos tests fork child processes

**Q12: How do you test 24-hour run without waiting 24 hours?**
- **Scenario**: Stress test "run for 24 hours" is impractical for CI
- **Risk**: Can't verify long-running stability
- **Mitigation**:
  - Use time mocking or fast-forward clock (not always reliable)
  - Instead: test 1000 iterations in tight loop (equivalent stress)
  - Document manual 24h test for major releases
- **Updated Design**: Replace 24h test with 1000-iteration test

**Q13: What if test leaves orphaned processes that break subsequent tests?**
- **Scenario**: Chaos test crashes, orphans processes, next test fails due to "already running"
- **Risk**: HIGH - flaky CI
- **Mitigation**:
  - Add `beforeEach()` hook: kill all autopilot processes
  - Add `afterEach()` hook: verify no orphans remain
  - Use unique PID file names per test (`.test-{uuid}`)
- **Updated Design**: Test isolation via unique PID files

## Design Flaws Found

### Flaw 1: Race Condition in PID File Locking
**Problem**: Between reading PID file and writing new one, another process could start
```typescript
// WRONG:
if (!fs.existsSync(pidFile)) {
  fs.writeFileSync(pidFile, pid);  // Race here!
}
```

**Fix**: Use atomic file operations
```typescript
// RIGHT:
try {
  fs.writeFileSync(pidFile, pid, { flag: 'wx' });  // Exclusive write
} catch (err) {
  if (err.code === 'EEXIST') {
    throw new Error('Already running');
  }
}
```

### Flaw 2: No Timeout on Graceful Shutdown
**Problem**: `stop()` method could hang forever waiting for processes to exit

**Fix**: Add timeout
```typescript
async stop(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await this.gracefulShutdown();

  if (Date.now() > deadline) {
    // Force kill if timeout exceeded
    await this.forceKill();
  }
}
```

### Flaw 3: PID File Not Cleaned on Uncaught Exception
**Problem**: If Node.js throws uncaught exception, `finally` block may not run

**Fix**: Register cleanup in process event handlers
```typescript
process.on('uncaughtException', async (err) => {
  logError('Uncaught exception', err);
  await cleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (err) => {
  logError('Unhandled rejection', err);
  await cleanup();
  process.exit(1);
});
```

### Flaw 4: Supervisor Can't Distinguish Clean Exit from Crash
**Problem**: Exit code 0 could be crash that was caught and logged

**Fix**: Use specific exit codes
```typescript
// In unified_orchestrator.ts
const EXIT_CODES = {
  SUCCESS: 0,           // User-initiated stop
  CRASH: 1,             // Unexpected error
  RATE_LIMIT: 2,        // All providers exhausted
  DISK_FULL: 3,         // Disk space < 1GB
  ALREADY_RUNNING: 4,   // PID file lock failed
};
```

Supervisor ignores exit codes 2-4 (don't restart immediately)

## Updated Risk Assessment

| Risk | Original | Mitigated | Residual |
|------|----------|-----------|----------|
| Orphaned processes | CRITICAL | MEDIUM | LOW (requires PID reuse + identity mismatch) |
| Process tree survives parent death | CRITICAL | LOW | VERY LOW (requires setpgid failure in restricted env) |
| Infinite loop without crash | HIGH | LOW | LOW (heartbeat monitor catches it) |
| Supervisor crashes | MEDIUM | LOW | VERY LOW (recommend systemd) |
| PID file race condition | HIGH | VERY LOW | NEGLIGIBLE (atomic write) |
| Uncaught exception leaves PID file | HIGH | LOW | LOW (process event handlers) |

## Recommendations

1. **MUST**: Implement atomic PID file locking (Flaw 1)
2. **MUST**: Add process identity verification (Q1)
3. **MUST**: Store full process tree in PID file (Q3)
4. **MUST**: Add timeout to graceful shutdown (Flaw 2)
5. **MUST**: Register cleanup on uncaught exception (Flaw 3)
6. **SHOULD**: Add external heartbeat monitor (Q5)
7. **SHOULD**: Use specific exit codes (Flaw 4)
8. **SHOULD**: Make memory limit configurable (Q10)
9. **COULD**: Integrate with systemd/launchd (Q6)

## Proceed to IMPLEMENT?

**Decision**: YES, with updated design incorporating fixes for Flaws 1-4 and mitigations for Q1, Q3, Q5

**Confidence**: HIGH - adversarial review caught major issues, design is now robust

**Next**: Move to IMPLEMENT phase with updated plan
