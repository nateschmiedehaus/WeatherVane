# Task Ticket: Complete Autopilot Safety System Integration

**Status**: Ready for Implementation
**Priority**: P0 (Critical for autonomous operation)
**Estimated Time**: 30-60 minutes
**Created**: 2025-10-27

---

## Context

Autopilot safety system (HeartbeatWriter + SafetyMonitor) has been:
- ✅ Built (all TypeScript compiles, 0 errors)
- ✅ Integrated into OrchestratorRuntime (imports, fields, start/stop methods)
- ✅ Modified worker_entry.ts to call `await runtime.start()`
- ⚠️ **NOT VERIFIED**: Heartbeat file still not created during testing

## Problem

Worker process starts successfully but heartbeat file never appears. This suggests:
1. `runtime.start()` not being called despite code changes
2. OR runtime.start() is hanging/failing silently
3. OR dist files not updated correctly after build

## Acceptance Criteria

1. Worker creates `state/heartbeat` file within 30s of startup
2. Heartbeat updates every 30s
3. SafetyMonitor logs appear: "Safety monitor started"
4. Worker runs stably for 5+ minutes
5. Clean shutdown removes heartbeat and stops safety monitor

## Implementation Steps

### Step 1: Verify Build Output (5 min)

```bash
# Check if dist files actually have the changes
grep -A 5 "await runtime.start()" dist/worker/worker_entry.js
grep -A 10 "heartbeatWriter.*start" dist/src/orchestrator/orchestrator_runtime.js

# If NOT found:
npm run build --force
# OR
rm -rf dist && npm run build
```

### Step 2: Add Debug Logging (10 min)

In `src/orchestrator/orchestrator_runtime.ts` (line ~269):

```typescript
// Start safety monitoring
const path = await import('node:path');
const heartbeatPath = path.join(this.workspaceRoot, 'state', 'heartbeat');

console.log('[DEBUG] About to start heartbeat writer:', { heartbeatPath });

const heartbeatInterval = (safetyLimitsConfig as any).supervisor?.heartbeat_interval_seconds ?? 30;
this.heartbeatWriter = new HeartbeatWriter(heartbeatPath, heartbeatInterval * 1000);
this.heartbeatWriter.start();

console.log('[DEBUG] Heartbeat writer started');

logInfo('Heartbeat writer started', { path: heartbeatPath, intervalMs: heartbeatInterval * 1000 });
```

### Step 3: Test with Debug (10 min)

```bash
npm run build
rm -f state/heartbeat state/worker_pid
node dist/worker/worker_entry.js > /tmp/test_debug.log 2>&1 &
WORKER_PID=$!

sleep 10

# Check for debug logs
grep "DEBUG" /tmp/test_debug.log

# Check heartbeat
ls -la state/heartbeat
cat state/heartbeat
```

### Step 4: Fix Based on Findings (20 min)

**If debug logs show heartbeat started**:
- Heartbeat writer has a bug → check heartbeat.ts writeHeartbeat()
- File permissions issue → check state/ directory permissions

**If debug logs DON'T appear**:
- runtime.start() not being called → verify worker_entry.js changes
- runtime.start() hanging → check for await/async issues
- Build not updating dist → force clean rebuild

**If heartbeat file appears but doesn't update**:
- Interval timer issue → check setInterval in heartbeat.ts
- Process exiting too soon → check worker lifecycle

### Step 5: Verify Complete Integration (10 min)

```bash
# Start worker
node --max-old-space-size=2048 dist/worker/worker_entry.js > /tmp/final.log 2>&1 &
WORKER_PID=$!

# Wait 60s
sleep 60

# Verify:
# 1. Heartbeat exists and updates
test -f state/heartbeat || echo "FAIL: No heartbeat"
INITIAL=$(cat state/heartbeat)
sleep 30
UPDATED=$(cat state/heartbeat)
[ "$INITIAL" != "$UPDATED" ] && echo "PASS: Heartbeat updates" || echo "FAIL: Heartbeat static"

# 2. Worker still running
ps -p $WORKER_PID && echo "PASS: Worker stable" || echo "FAIL: Worker crashed"

# 3. Memory within limits
RSS=$(ps -p $WORKER_PID -o rss= | awk '{print $1/1024}')
[ $(echo "$RSS < 100" | bc) -eq 1 ] && echo "PASS: Memory OK ($RSS MB)" || echo "WARN: Memory high ($RSS MB)"

# 4. Logs show safety started
grep "Safety monitor started" /tmp/final.log && echo "PASS: Safety monitor" || echo "FAIL: No safety monitor"
grep "Heartbeat writer started" /tmp/final.log && echo "PASS: Heartbeat" || echo "FAIL: No heartbeat log"
```

### Step 6: Document & Commit (5 min)

```bash
# Update test results
echo "## Final Integration Test - $(date)" >> docs/autopilot/AUTOPILOT_TEST_RESULTS.md
echo "- Heartbeat: [PASS/FAIL]" >> docs/autopilot/AUTOPILOT_TEST_RESULTS.md
echo "- Safety Monitor: [PASS/FAIL]" >> docs/autopilot/AUTOPILOT_TEST_RESULTS.md

# Commit
git add -A
git commit -m "fix(safety): Verify heartbeat + safety monitor operational" \
  -m "Heartbeat creates state/heartbeat and updates every 30s" \
  -m "SafetyMonitor enforces memory/disk/process limits" \
  -m "All acceptance criteria met"
```

---

## Files to Verify

| File | What to Check | Expected |
|------|---------------|----------|
| `dist/worker/worker_entry.js` | Contains `await runtime.start()` | Line ~109 |
| `dist/src/orchestrator/orchestrator_runtime.js` | Contains heartbeat startup code | Line ~266-275 |
| `src/utils/heartbeat.ts` | writeHeartbeat() logic | Should use fs.writeFileSync |
| `src/utils/safety_monitor.ts` | start() method | Should call setInterval |

---

## Troubleshooting Guide

### Issue: "No heartbeat file"

**Diagnosis**:
```bash
# Check if runtime.start() called
grep "Heartbeat writer started\|Safety monitor started" /tmp/test.log

# Check if heartbeat dir exists
ls -la state/

# Check file permissions
ls -ld state/
```

**Fix**:
- If logs missing → runtime.start() not called (check worker_entry.js)
- If dir missing → create state/ directory
- If permission denied → chmod 755 state/

### Issue: "Heartbeat file exists but doesn't update"

**Diagnosis**:
```bash
# Check initial value
cat state/heartbeat
# Wait 30s
sleep 30
# Check again
cat state/heartbeat
```

**Fix**:
- If same → interval timer not working (check heartbeat.ts setInterval)
- If different → **WORKING!**

### Issue: "Worker crashes after startup"

**Diagnosis**:
```bash
# Check full log
cat /tmp/test.log

# Check for errors
grep -i "error" /tmp/test.log
```

**Fix**:
- If safety monitor error → check safety_limits.json exists
- If heartbeat error → check state/ directory writable
- If unhandled promise rejection → add try/catch in runtime.start()

---

## Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Heartbeat file created | Within 30s | `ls -la state/heartbeat` |
| Heartbeat updates | Every 30s | Watch file modification time |
| Worker stability | > 5 min uptime | `ps -p $WORKER_PID` |
| Memory usage | < 100MB initially | `ps -p $WORKER_PID -o rss` |
| Safety logs present | 2 log lines | `grep "Safety\|Heartbeat" /tmp/test.log` |

---

## Reference Documents

- Complete test results: `docs/autopilot/AUTOPILOT_TEST_RESULTS.md`
- Meta-process improvements: `docs/autopilot/META_PROCESS_IMPROVEMENT_PROTOCOL.md`
- Architectural context: `docs/ARCHITECTURAL_CONTEXT_MAP.md`
- Integration gaps found: See AUTOPILOT_TEST_RESULTS.md § "Critical Integration Gaps Discovered"

---

## Next Session Checklist

Before starting:
- [ ] Read this task ticket completely
- [ ] Review AUTOPILOT_TEST_RESULTS.md
- [ ] Check current git status
- [ ] Verify build is up to date

During implementation:
- [ ] Follow DISCOVER phase (verify architecture)
- [ ] Add debug logging before testing
- [ ] Run verification steps in order
- [ ] Document results as you go

After completion:
- [ ] All 5 success metrics pass
- [ ] Commit with evidence in commit message
- [ ] Update AUTOPILOT_TEST_RESULTS.md with final status
- [ ] Mark this ticket as DONE

---

**Estimated Total Time**: 30-60 minutes
**Blocker Risk**: Low (all code written, just needs verification)
**Impact**: High (enables autonomous operation with safety guarantees)
