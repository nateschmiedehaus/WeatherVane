# Autopilot Guaranteed Safety - STRATEGIZE Phase

**Date**: 2025-10-27
**Goal**: Define what safety guarantees are possible for autopilot operation
**User Request**: "guarantee autopilot will never crash my computer or have processes that escape control"

## Problem Classification

This is a **Resource Management + Process Containment** problem requiring:
1. Hard limits on system resources (memory, CPU, disk, file descriptors)
2. Process supervision and automatic recovery
3. Containment mechanisms to prevent escape
4. Health monitoring and circuit breakers
5. Stress testing to verify limits hold under adversarial conditions

## What Can Be Guaranteed?

### Hard Guarantees (100% - Mathematically Provable)

✅ **Already Implemented (Phase 1)**:
1. **Single instance enforcement**: Atomic PID file locking guarantees only one autopilot runs
2. **PID file cleanup**: Cleanup handlers on all 6 exit paths guarantee no stale PID files
3. **Child process cleanup**: `killProcessTree()` guarantees children are killed on shutdown

### Strong Guarantees (99.9% - System-Level Enforcement)

🔨 **Need to Implement**:
1. **Memory bounded**: Process max RSS limit (Node.js `--max-old-space-size`, OS ulimit)
   - Guarantee: Process killed by OS before consuming all RAM
   - Failure mode: OOM killer, not system freeze

2. **Disk bounded**: Pre-flight disk space check + periodic monitoring
   - Guarantee: Autopilot refuses to start if <10% free space
   - Guarantee: Autopilot pauses if disk usage >90%
   - Failure mode: Clean shutdown, not disk full crash

3. **CPU capped**: Process nice level + optional cgroup CPU quota
   - Guarantee: Autopilot gets lower CPU priority than system processes
   - Guarantee: Optional hard cap (e.g., 80% of one core)
   - Failure mode: Slow execution, not system freeze

4. **File descriptors limited**: ulimit -n (max open files)
   - Guarantee: Process dies before exhausting system FDs
   - Failure mode: Clean error, not system-wide FD exhaustion

5. **Process tree contained**: Process groups + cgroups (optional)
   - Guarantee: All child processes in same process group
   - Guarantee: Kill entire tree with single signal
   - Failure mode: Orphaned processes detectable and killable

### Best-Effort Guarantees (95% - Application-Level)

🔨 **Need to Implement**:
1. **Auto-restart on crash**: Supervisor script with exponential backoff
   - Guarantee: Crash doesn't stop autopilot permanently
   - Failure mode: Repeated crashes eventually stop (after 5 attempts)

2. **Health monitoring**: Heartbeat + stuck detection
   - Guarantee: Supervisor detects and kills hung processes
   - Failure mode: Slow detection (30-60s)

3. **Graceful degradation**: Circuit breakers on external services
   - Guarantee: API failures don't crash autopilot
   - Failure mode: Reduced functionality, not crash

### What CANNOT Be Guaranteed (OS Limitations)

❌ **Impossible to guarantee**:
1. **Kernel panics**: Bugs in OS kernel
2. **Hardware failures**: Disk failure, RAM failure, CPU overheating
3. **Power loss**: System loses power
4. **Force kill by root**: User runs `sudo kill -9` or reboots
5. **Malicious interference**: Root-level tampering

## Verification Methodology Selection

Based on task classification, I choose:

### 1. Chaos/Fault Injection Testing
**Why**: Need to prove system survives resource exhaustion and crashes
**What to test**:
- Memory leak simulation (allocate until OOM)
- Disk full simulation (write until ENOSPC)
- CPU spin simulation (infinite loop)
- Process fork bomb simulation (create 1000 children)
- Crash simulation (throw uncaught exception)
- SIGKILL simulation (force kill supervisor)

### 2. Stress Testing
**Why**: Verify limits hold under sustained load
**What to test**:
- 1000 task cycles with resource monitoring
- Concurrent operations (100 parallel tasks)
- Long-running operations (24-hour run)
- Memory growth over time (detect leaks)

### 3. State Space Exploration
**Why**: Test all failure modes and recovery paths
**What to test**:
- All crash types → auto-restart works
- All resource limits → clean shutdown
- All health check failures → supervisor intervenes

### 4. Property-Based Testing
**Why**: Verify invariants hold across all inputs
**Properties to verify**:
- Memory usage ≤ max-old-space-size
- Disk usage never >90%
- Process count ≤ expected (no fork bombs)
- CPU usage ≤ configured limit
- All processes in same process group

## Problem-Solving Approach

I'll use **Working Backwards** from desired guarantees:

**Desired**: System never freezes due to autopilot
**Required**: Memory/CPU/disk/FD limits enforced
**Implementation**: Node.js flags + ulimit + disk checks + monitoring

**Desired**: No escaped processes
**Required**: All children in process group, supervisor monitors for orphans
**Implementation**: setpgid(0,0) + process group killing + periodic ps check

**Desired**: Autopilot always recovers from crashes
**Required**: Supervisor detects crashes and restarts with backoff
**Implementation**: Supervisor script + exit code monitoring + exponential backoff

## Success Criteria

Implementation is successful when:

1. **Stress test**: 1000 task cycles complete without system freeze
2. **Memory limit test**: Process dies (OOM) at configured limit, doesn't crash system
3. **Disk limit test**: Autopilot refuses to start when disk >90% full
4. **CPU limit test**: System remains responsive under autopilot load
5. **Crash test**: Supervisor auto-restarts within 5 seconds
6. **Fork bomb test**: Process group killing prevents escape
7. **Hung process test**: Supervisor kills stuck processes within 60s

## Implementation Phases

**Phase 2: Supervision & Auto-Restart** (CRITICAL - prevents crashes from stopping work)
- Supervisor script with exponential backoff
- Exit code monitoring
- Crash detection and restart
- Health monitoring

**Phase 3: Resource Limits** (CRITICAL - prevents system freeze/crash)
- Memory limits (--max-old-space-size)
- Disk space checks and monitoring
- CPU nice level
- File descriptor limits
- Process group enforcement

**Phase 4: Verification** (MANDATORY - prove guarantees hold)
- Chaos tests (OOM, disk full, CPU spin, fork bomb)
- Stress tests (1000 cycles, 24-hour run)
- Property-based tests (invariants verification)

## Risks & Mitigations

**Risk 1**: Node.js doesn't respect --max-old-space-size under all conditions
- **Mitigation**: Also set ulimit -v (virtual memory limit)
- **Verification**: Stress test allocates memory until killed

**Risk 2**: Process group killing fails on some platforms
- **Mitigation**: Fallback to recursive child enumeration (pgrep/ps)
- **Verification**: Fork bomb test on macOS/Linux

**Risk 3**: Supervisor itself crashes
- **Mitigation**: Supervisor is minimal shell script (hard to crash)
- **Verification**: Chaos test injects errors into supervisor

**Risk 4**: Disk space check has race condition
- **Mitigation**: Check before every major write operation
- **Verification**: Simulate disk filling during operation

**Risk 5**: Orphaned processes escape supervision
- **Mitigation**: Periodic orphan detection and cleanup
- **Verification**: Fork bomb test creates orphans

## Technical Decisions

**Decision 1**: Use shell script for supervisor (not Node.js)
- **Rationale**: Shell script can't leak memory or crash easily
- **Trade-off**: Less sophisticated monitoring vs. reliability

**Decision 2**: Hard-code conservative resource limits
- **Rationale**: Safety over performance
- **Limits**: 2GB RAM, 80% CPU, 10% disk minimum, 1024 FDs

**Decision 3**: Exponential backoff on restarts (not immediate)
- **Rationale**: Prevents crash loop from consuming resources
- **Backoff**: 1s, 2s, 4s, 8s, 16s, then stop

**Decision 4**: Process group enforcement at Node.js level
- **Rationale**: setpgid() is cross-platform
- **Fallback**: pgrep/ps for orphan detection

**Decision 5**: Disk space monitoring every 60 seconds
- **Rationale**: Balance between responsiveness and overhead
- **Trade-off**: 60s window where disk could fill vs. CPU cost

## Next Steps

1. **SPEC**: Document resource limit values and supervision logic
2. **PLAN**: Break down into concrete implementation tasks
3. **THINK**: Adversarially challenge limits (can they be bypassed?)
4. **IMPLEMENT**: Add resource limits and supervisor
5. **VERIFY**: Run chaos tests to prove guarantees hold
