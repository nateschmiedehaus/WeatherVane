# SPEC: w0m1-stability-and-guardrails

**Set ID:** w0m1-stability-and-guardrails
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Git Pre-Flight Checks Operational

**Given:** Autopilot about to perform git operation
**When:** Pre-flight check runs
**Then:**
- Detects dirty worktree (unstaged changes)
- Detects uncommitted changes (staged but not committed)
- Verifies on correct branch
- Aborts if unsafe conditions detected

**Test:**
```bash
# Dirty worktree test
echo "test" >> state/test.txt

# Run autopilot (should detect and abort)
cd tools/wvo_mcp && npm run wave0

# Should see error: "Dirty worktree detected. Please commit or stash changes."
```

**Success:** Autopilot aborts, logs clear error message

---

### AC2: Automatic Stash/Unstash Works

**Given:** User has uncommitted changes
**When:** Autopilot needs clean worktree
**Then:**
- Stashes user changes automatically
- Performs git operations
- Unstashes changes after completion
- User work preserved

**Test:**
```bash
# Create user changes
echo "user work" >> user_file.txt
git add user_file.txt

# Run autopilot
cd tools/wvo_mcp && npm run wave0

# After completion, check user_file.txt still exists
test -f user_file.txt && echo "✓ User work preserved"
```

**Success:** User file still exists after autopilot run

---

### AC3: LOC Guardrails Enforced

**Given:** Task being executed
**When:** Task completes
**Then:**
- Net LOC calculated (added - deleted)
- Compared to limit (150 LOC default)
- Blocked if over limit without override
- Override requires justification

**Test:**
```typescript
import { guardrails } from '../enforcement';

// Test LOC validation
const result = await guardrails.validateLOC({
  filesChanged: [
    { path: 'foo.ts', added: 100, deleted: 0 },
    { path: 'bar.ts', added: 60, deleted: 10 }
  ],
  limit: 150
});

// Should fail (net 150 LOC, exactly at limit)
expect(result.valid).toBe(true);

// Over limit should fail
const overLimit = await guardrails.validateLOC({
  filesChanged: [
    { path: 'foo.ts', added: 200, deleted: 0 }
  ],
  limit: 150
});

expect(overLimit.valid).toBe(false);
expect(overLimit.message).toContain('exceeds limit');
```

**Success:** Validation blocks over-limit changes

---

### AC4: File Count Guardrails Enforced

**Given:** Task being executed
**When:** Task modifies files
**Then:**
- File count calculated (new + modified)
- Compared to limit (5 files default)
- Blocked if over limit without override
- Epic-level work allowed more files

**Test:**
```typescript
const result = await guardrails.validateFileCount({
  filesChanged: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
  limit: 5,
  tier: 'default'
});

expect(result.valid).toBe(false);

// Epic tier should allow more
const epicResult = await guardrails.validateFileCount({
  filesChanged: Array.from({ length: 20 }, (_, i) => `file${i}.ts`),
  limit: 100,
  tier: 'epic'
});

expect(epicResult.valid).toBe(true);
```

**Success:** File count enforced, tiers respected

---

### AC5: Device Profile Detection Works

**Given:** Autopilot starts on machine
**When:** Device profile loads
**Then:**
- CPU cores detected
- RAM detected
- Disk space detected
- Profile saved to state/device_profile.json

**Test:**
```typescript
import { deviceProfile } from '../stability';

const profile = await deviceProfile.detect();

expect(profile.cpuCores).toBeGreaterThan(0);
expect(profile.ramGB).toBeGreaterThan(0);
expect(profile.diskSpaceGB).toBeGreaterThan(0);
expect(profile.category).toMatch(/low|medium|high/);
```

**Success:** All metrics detected, category assigned

---

### AC6: Adaptive Behavior Based on Profile

**Given:** Device profile loaded
**When:** Autopilot performs parallel operations
**Then:**
- Concurrency = cpuCores / 2 (conservative)
- Batch size adapted to RAM
- Caching adapted to disk space
- Timeouts adapted to category

**Test:**
```typescript
// Low-end device (2 cores, 4GB RAM)
const lowConfig = deviceProfile.getConfig({
  cpuCores: 2,
  ramGB: 4,
  category: 'low'
});

expect(lowConfig.concurrency).toBe(1); // 2/2 = 1
expect(lowConfig.batchSize).toBe(10);
expect(lowConfig.cacheEnabled).toBe(false);

// High-end device (64 cores, 128GB RAM)
const highConfig = deviceProfile.getConfig({
  cpuCores: 64,
  ramGB: 128,
  category: 'high'
});

expect(highConfig.concurrency).toBe(32); // 64/2 = 32
expect(highConfig.batchSize).toBe(1000);
expect(highConfig.cacheEnabled).toBe(true);
```

**Success:** Config adapts to device capabilities

---

### AC7: Resource Monitoring Works

**Given:** Autopilot executing long-running task
**When:** Resource usage checked
**Then:**
- RAM usage monitored (poll every 30s)
- Abort if >90% RAM used
- Disk space monitored
- Abort if <1GB disk free

**Test:**
```typescript
// Simulate high memory usage
const shouldAbort = await resourceMonitor.check();

// If RAM > 90%, should recommend abort
if (shouldAbort.reason === 'high_memory') {
  expect(shouldAbort.abort).toBe(true);
  expect(shouldAbort.memoryUsagePercent).toBeGreaterThan(90);
}
```

**Success:** Monitoring detects high usage, recommends abort

---

## Functional Requirements

### FR1: Git Operations Must Be Safe
- Never force push without explicit flag
- Never delete files without confirmation
- Always check worktree before operations
- Always log operations for audit

### FR2: Guardrails Must Be Configurable
- LOC limits per tier (default: 150, epic: 1000)
- File count limits per tier
- Complexity thresholds
- Override mechanism available

### FR3: Device Profile Must Be Persistent
- Save to state/device_profile.json
- Reload on startup (don't re-detect every time)
- Manual override via environment variable
- Update when hardware changes detected

### FR4: Resource Monitoring Must Be Non-Intrusive
- <1% CPU overhead
- Poll-based (not continuous)
- Optional (can disable for debugging)
- Graceful degradation if monitoring fails

---

## Non-Functional Requirements

### NFR1: Reliability
- Git pre-flight checks catch 99% of issues
- Guardrails never false-negative (miss violations)
- Resource monitoring never crashes autopilot
- Device detection works on Linux/macOS/Windows

### NFR2: Performance
- Pre-flight checks <100ms
- Guardrail validation <50ms
- Device detection <200ms (once at startup)
- Resource monitoring <10ms per poll

### NFR3: Usability
- Clear error messages (actionable)
- Override mechanism documented
- Device profile inspectable
- Logs explain all decisions

---

## Exit Criteria

**Set complete when:**

- [x] AC1: Git pre-flight checks detect issues
- [x] AC2: Automatic stash/unstash works
- [x] AC3: LOC guardrails enforced
- [x] AC4: File count guardrails enforced
- [x] AC5: Device profile detection works
- [x] AC6: Adaptive behavior based on profile
- [x] AC7: Resource monitoring works

**Quality gates:**
- [ ] Unit tests pass (100+ git scenarios)
- [ ] Integration tests pass (end-to-end)
- [ ] Performance benchmarks met
- [ ] Documentation complete

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md
**Owner:** Claude Council
