# Autopilot Guaranteed Safety - THINK (Adversarial Review)

**Date**: 2025-10-27
**Goal**: Challenge every assumption, find every hole in the design
**Mindset**: Be maximally adversarial - try to break the guarantees

## Core Question: Can We Actually Guarantee Safety?

**Claim**: "Autopilot will never crash your computer or have processes escape control"

Let me try to break this claim.

## Attack Vector 1: Memory Exhaustion

**The Guarantee**: Memory limited to 2GB via `--max-old-space-size=2048` and `ulimit -v`

**Attack 1.1**: Allocate 3GB of memory rapidly
```javascript
const arrays = [];
while (true) {
  arrays.push(new Array(1024 * 1024).fill(0));  // 8MB per iteration
}
```

**Expected**: Node.js V8 kills process at 2GB (before system freeze)
**Question**: Does `--max-old-space-size` apply to ALL memory or just V8 heap?
**Risk**: Native modules, Buffers, off-heap allocations might bypass limit

**Mitigation**: `ulimit -v 2097152` (2GB virtual memory) catches EVERYTHING
**Verification**: Chaos test allocates 3GB, monitor RSS, verify death at 2GB

**Attack 1.2**: Memory leak via event listeners
```javascript
while (true) {
  process.on('customEvent', () => {});  // Never removed
}
```

**Expected**: Eventually hits 2GB limit, process dies
**Question**: How long does it take? Hours? Days?
**Risk**: Slow leak might not be caught by short tests

**Mitigation**: 24-hour stress test with memory monitoring
**Verification**: Run for 24h, verify memory stays <2GB OR process dies and restarts

**Attack 1.3**: Shared memory / mmap bypass
```javascript
const shm = require('shm-typed-array');
shm.create(3 * 1024 * 1024 * 1024);  // 3GB shared memory
```

**Expected**: `ulimit -v` should catch this (virtual memory includes shared)
**Question**: Does ulimit -v work on macOS? (Different from Linux)
**Risk**: macOS might not enforce ulimit -v the same way

**Mitigation**: Test on actual macOS (user's platform)
**Verification**: Chaos test tries shared memory allocation on macOS

**CRITICAL FLAW FOUND**: What if Node.js spawns child process with DIFFERENT limits?

```javascript
child_process.spawn('node', ['-e', 'while(1) { a.push(new Array(1e9)); }']);
```

**Child inherits ulimits** ✅ (verified via man pages)
**BUT**: Child could change its own limits via `ulimit` command!

**Fix**: In supervisor, use `setrlimit` (C-level) not just shell `ulimit`
**Alternative**: Monitor total process tree RSS, not just parent

## Attack Vector 2: Disk Exhaustion

**The Guarantee**: Disk checked every 60s, shutdown at 95% full

**Attack 2.1**: Write 10GB/second to disk
```javascript
while (true) {
  fs.appendFileSync('/tmp/fill.dat', Buffer.alloc(1024 * 1024 * 1024));
}
```

**Expected**: Disk check detects >95%, shuts down gracefully
**Question**: Can it write 10GB in <60s (between checks)?
**Risk**: Disk fills to 100% before next check, system freezes

**Mitigation**: Reduce check interval to 10s? Or monitor disk writes?
**Trade-off**: More frequent checks = more overhead

**Better solution**: Set write limits on autopilot process (quota/cgroup)
**Verification**: Chaos test writes 20GB rapidly, verify shutdown before 100%

**Attack 2.2**: Symlink attack
```bash
ln -s /dev/sda1 state/tasks.json  # Write to disk root
```

**Expected**: Permission denied (normal user can't write to /dev/sda1)
**Question**: What if workspace is on external disk user owns?
**Risk**: Could fill boot disk even if workspace is elsewhere

**Mitigation**: Check BOTH workspace disk AND boot disk (/)
**Verification**: Monitor df for / and workspace separately

**Attack 2.3**: Many small files (inode exhaustion)
```javascript
for (let i = 0; i < 1000000; i++) {
  fs.writeFileSync(`/tmp/file${i}`, 'x');
}
```

**Expected**: Disk space check doesn't catch inodes, only blocks
**Risk**: Exhaust inodes (can't create files even with free space)
**Impact**: System can't create temp files, might freeze

**Mitigation**: Also check `df -i` (inode usage)
**Verification**: Chaos test creates 100K files, verify inode monitoring

**CRITICAL FLAW FOUND**: 60-second window is too long for fast writes

**Fix**: Monitor disk writes in real-time via file descriptor monitoring
**Alternative**: Set disk quota on autopilot user (OS-level, guaranteed)

## Attack Vector 3: CPU Exhaustion

**The Guarantee**: nice +5 (lower priority)

**Attack 3.1**: Infinite busy loop
```javascript
while (true) {}  // Single-threaded CPU spin
```

**Expected**: Process at lower priority, system stays responsive
**Question**: Does nice +5 actually prevent system freeze on single-core?
**Risk**: On low-core systems, even nice +5 might freeze UI

**Mitigation**: Add CPU usage monitoring, kill if >80% for >5 min
**Verification**: Chaos test spins CPU, verify system stays responsive

**Attack 3.2**: Multi-threaded CPU bomb
```javascript
const { Worker } = require('worker_threads');
for (let i = 0; i < os.cpus().length * 2; i++) {
  new Worker('while(1) {}', { eval: true });
}
```

**Expected**: All cores saturated at lower priority
**Question**: Can user still use system?
**Risk**: Even at nice +5, might make system unusable

**Mitigation**: cgroup CPU quota (if available) - hard 80% limit
**Fallback**: Detect CPU >80% for >1min, pause autopilot
**Verification**: Chaos test saturates all cores, measure user experience

**Attack 3.3**: Priority escalation
```javascript
child_process.exec('renice -n -20 ' + process.pid);
```

**Expected**: Permission denied (need root)
**Question**: What if user runs autopilot as root? (bad practice but possible)
**Risk**: Could escalate priority back to 0 or negative

**Mitigation**: Detect and warn if running as root (refuse to start?)
**Verification**: Try to renice self, verify failure

## Attack Vector 4: Process Escape

**The Guarantee**: All children in process group, killed together

**Attack 4.1**: Double-fork to escape process group
```javascript
child_process.spawn('sh', ['-c', '(sleep 1000 &)']);
```

**Expected**: Grandchild escapes process group (parent = 1)
**Question**: Does our process group setpgid prevent this?
**Risk**: Orphaned processes running after shutdown

**Mitigation**: Periodic orphan detection (pgrep -P 1), kill matches
**Verification**: Chaos test fork bombs with double-forks, verify cleanup

**Attack 4.2**: nohup to survive signals
```javascript
child_process.spawn('nohup', ['sleep', '1000']);
```

**Expected**: nohup ignores SIGHUP but not SIGKILL
**Question**: Does our kill_autopilot.sh use SIGKILL eventually?
**Risk**: Processes survive graceful shutdown

**Mitigation**: Already implemented - SIGTERM → 5s → SIGKILL
**Verification**: Spawn nohup processes, verify SIGKILL works

**Attack 4.3**: Process hides by renaming (ps evasion)
```javascript
child_process.execSync('exec -a "systemd" sleep 1000 &');
```

**Expected**: Process group kill gets it anyway (PID-based, not name)
**Question**: If process group fails, orphan detection uses name matching
**Risk**: Renamed processes evade detection

**Mitigation**: Orphan detection uses PPID=1 AND cgroup (if available)
**Fallback**: User manual check (ps aux | grep <pattern>)
**Verification**: Chaos test renames processes, verify detection

**CRITICAL FLAW FOUND**: Double-fork creates orphans we might not detect

**Fix**: Record all spawned PIDs, check if they still exist on shutdown
**Alternative**: Use cgroups for absolute containment (if available on macOS)

## Attack Vector 5: File Descriptor Exhaustion

**The Guarantee**: ulimit -n 1024 (max open files)

**Attack 5.1**: Open 2000 files
```javascript
for (let i = 0; i < 2000; i++) {
  fs.openSync(`/tmp/file${i}`, 'r');  // Never close
}
```

**Expected**: Fails with EMFILE at 1024
**Question**: Does this crash autopilot or handle gracefully?
**Risk**: Uncaught EMFILE crashes entire process

**Mitigation**: Global error handler for EMFILE, log and degrade gracefully
**Verification**: Chaos test opens 2000 files, verify graceful degradation

**Attack 5.2**: Socket leak
```javascript
setInterval(() => {
  net.createConnection(80, 'example.com');  // Never close
}, 10);
```

**Expected**: Eventually hits FD limit
**Question**: How long? What breaks first?
**Risk**: Network layer crashes before hitting limit

**Mitigation**: Monitor open FDs, warn at >800, kill at >1000
**Verification**: Chaos test leaks sockets, verify detection

**CRITICAL FLAW FOUND**: EMFILE errors might not be caught globally

**Fix**: Add process.on('uncaughtException') handler specifically for EMFILE
**Action**: Log warning, try to close excess FDs, continue if possible

## Attack Vector 6: Supervisor Failure

**The Guarantee**: Supervisor monitors and restarts autopilot

**Attack 6.1**: Kill supervisor process
```bash
kill -9 <supervisor_pid>
```

**Expected**: Supervisor dies, autopilot becomes orphaned (PPID=1)
**Question**: Who cleans up orphaned autopilot?
**Risk**: No supervisor = no resource limits enforced

**Mitigation**: Document: "Don't kill supervisor directly, use kill_autopilot.sh"
**Fallback**: Autopilot self-monitors resources even without supervisor
**Verification**: Kill supervisor, verify autopilot continues safely

**Attack 6.2**: Supervisor script has syntax error
```bash
# Typo in supervise_autopilot.sh
if [ $FOO -eq "bar" ]  # Missing quotes, crashes
```

**Expected**: Supervisor crashes on startup
**Question**: How do we detect bad script before deploying?
**Risk**: Deploy broken supervisor, no protection

**Mitigation**: Shellcheck linting + dry-run testing
**Verification**: Run shellcheck on supervise_autopilot.sh, fix all errors

**Attack 6.3**: Heartbeat file permission denied
```bash
chmod 000 state/heartbeat
```

**Expected**: Heartbeat writer fails to write
**Question**: Does this crash autopilot or just log error?
**Risk**: Supervisor sees no heartbeat, kills healthy process

**Mitigation**: Heartbeat writer handles EACCES gracefully, logs warning
**Fallback**: Create state/heartbeat with correct permissions on start
**Verification**: Remove write permissions, verify graceful degradation

## Design Flaws Found

After adversarial analysis, I found these **critical flaws**:

### Flaw 1: Child processes could bypass memory limits
**Severity**: HIGH
**Impact**: Child could allocate 10GB, crash system
**Fix**: Monitor total process tree RSS, not just parent
**Verification**: Chaos test spawns child that allocates 3GB

### Flaw 2: 60-second disk check window is too long
**Severity**: MEDIUM
**Impact**: Fast writes could fill disk before detection
**Fix**: Reduce to 10s check interval + monitor write syscalls
**Verification**: Chaos test writes 20GB in 30s, verify shutdown

### Flaw 3: Double-fork creates orphans we don't detect
**Severity**: MEDIUM
**Impact**: Orphaned processes survive shutdown
**Fix**: Record all PIDs, check on shutdown + periodic orphan sweep
**Verification**: Chaos test double-forks 100 processes, verify cleanup

### Flaw 4: EMFILE errors might crash process
**Severity**: LOW
**Impact**: FD exhaustion crashes autopilot ungracefully
**Fix**: Global uncaughtException handler for EMFILE
**Verification**: Chaos test opens 2000 files, verify graceful handling

### Flaw 5: Supervisor itself could crash
**Severity**: LOW
**Impact**: No monitoring if supervisor dies
**Fix**: Keep supervisor minimal (shell only), shellcheck linting
**Verification**: Syntax check + dry-run test

### Flaw 6: Inode exhaustion not monitored
**Severity**: LOW
**Impact**: Can't create files even with free disk space
**Fix**: Monitor `df -i` in addition to `df -h`
**Verification**: Create 100K files, verify inode monitoring

## Revised Implementation Plan

Based on flaws found, I need to ADD:

1. **Process tree monitoring**: Monitor total RSS of entire tree, not just parent
2. **Faster disk checks**: 10s interval instead of 60s
3. **PID tracking**: Record all spawned PIDs, verify on shutdown
4. **Global EMFILE handler**: Catch and handle FD exhaustion gracefully
5. **Inode monitoring**: Check `df -i` in addition to disk space
6. **Shellcheck linting**: Verify supervisor script syntax

## Stress Tests Required

To prove 100% reliability, I must run:

1. **Memory leak test**: Allocate 3GB, verify death at 2GB
2. **Child memory test**: Child allocates 3GB, verify parent detects
3. **Disk fill test**: Write 20GB rapidly, verify shutdown before 100%
4. **Fork bomb test**: Double-fork 100 processes, verify all killed
5. **FD exhaustion test**: Open 2000 files, verify graceful handling
6. **CPU saturation test**: Saturate all cores, verify system responsive
7. **Crash recovery test**: Crash 10 times rapidly, verify restarts
8. **Supervisor kill test**: Kill supervisor, verify autopilot safe
9. **Inode exhaustion test**: Create 100K files, verify detection
10. **Heartbeat permission test**: Remove permissions, verify graceful handling

## Property-Based Invariants

These must ALWAYS be true (verified continuously):

1. **Memory invariant**: `total_rss(process_tree) <= 2GB`
2. **Disk invariant**: `disk_usage < 95%` OR `autopilot_state = shutdown`
3. **Process invariant**: `orphaned_children(autopilot) == 0`
4. **FD invariant**: `open_fds < 1024`
5. **CPU invariant**: `nice_level >= 5`
6. **PID invariant**: `pid_file_process == running_process` OR `pid_file DNE`

If any invariant violated → BUG found, must fix before claiming "guaranteed safe".

## Conclusion

**Original claim**: "Autopilot will never crash your computer"

**Adversarial analysis**: Found 6 critical flaws that could violate claim

**Revised claim** (after fixes): "Autopilot will never crash your computer, proven via 10 chaos tests and 6 continuous invariants"

**Next step**: IMPLEMENT fixes for all 6 flaws, then VERIFY via chaos tests
