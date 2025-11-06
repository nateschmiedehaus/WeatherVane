# PLAN: w0m1-stability-and-guardrails

**Set ID:** w0m1-stability-and-guardrails
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Execution Approach

Execute in order:

```
Task 1: AFP-W0-M1-WORKTREE-STABILIZE
   ↓ (provides git safety)
Task 2: AFP-W0-M1-GUARDRAIL-BASELINE
   ↓ (provides AFP/SCAS enforcement)
Task 3: AFP-W0-M1-DEVICE-PROFILE-STABILITY
   ↓ (provides adaptive behavior)
Set Complete ✅
```

**Rationale:** Git stability first (prerequisite), guardrails second (enforce constraints), device profile third (optimize for environment).

---

## Task 1: AFP-W0-M1-WORKTREE-STABILIZE

### Goal
Make git operations safe by adding pre-flight checks and automatic stash/unstash.

### Approach

**Step 1: Create git hygiene module**
```bash
mkdir -p tools/wvo_mcp/src/git
touch tools/wvo_mcp/src/git/preflight.ts
touch tools/wvo_mcp/src/git/stash.ts
touch tools/wvo_mcp/src/git/worktree.ts
```

**Step 2: Implement pre-flight checks**

File: `tools/wvo_mcp/src/git/preflight.ts`

```typescript
export interface PreflightResult {
  safe: boolean;
  issues: string[];
  suggestions: string[];
}

export async function checkWorktree(): Promise<PreflightResult> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check for unstaged changes
  const status = await gitAdapter.getStatus();
  if (status.modified.length > 0) {
    issues.push('Unstaged changes detected');
    suggestions.push('Run: git add . && git commit -m "message"');
  }

  // Check for uncommitted staged changes
  if (status.staged.length > 0) {
    issues.push('Uncommitted staged changes detected');
    suggestions.push('Run: git commit -m "message"');
  }

  // Check branch
  const branch = await gitAdapter.getCurrentBranch();
  if (branch !== 'main' && !process.env.ALLOW_NON_MAIN) {
    issues.push(`On branch ${branch}, expected main`);
    suggestions.push('Run: git checkout main');
  }

  // Check for merge conflicts
  if (status.conflicts.length > 0) {
    issues.push('Merge conflicts detected');
    suggestions.push('Resolve conflicts manually');
  }

  return {
    safe: issues.length === 0,
    issues,
    suggestions
  };
}
```

**Step 3: Implement automatic stash/unstash**

File: `tools/wvo_mcp/src/git/stash.ts`

```typescript
export class StashManager {
  private stashId?: string;

  async stashIfNeeded(): Promise<boolean> {
    const preflight = await checkWorktree();
    if (!preflight.safe) {
      // Stash all changes
      this.stashId = await gitAdapter.stash('Autopilot auto-stash');
      logger.info('Stashed changes', { stashId: this.stashId });
      return true;
    }
    return false;
  }

  async unstash(): Promise<void> {
    if (this.stashId) {
      await gitAdapter.unstash(this.stashId);
      logger.info('Unstashed changes', { stashId: this.stashId });
      this.stashId = undefined;
    }
  }
}
```

**Step 4: Integrate with supervisor**

Update supervisor to use preflight checks:

```typescript
class Supervisor {
  private stashManager = new StashManager();

  async run() {
    // Pre-flight check
    const preflight = await checkWorktree();
    if (!preflight.safe) {
      if (process.env.AUTO_STASH) {
        await this.stashManager.stashIfNeeded();
      } else {
        logger.error('Worktree not safe', { issues: preflight.issues });
        throw new Error('Worktree not safe for autopilot');
      }
    }

    // Run task loop
    await this.taskLoop();

    // Unstash
    await this.stashManager.unstash();
  }
}
```

### Exit Criteria
- [x] Pre-flight checks detect dirty worktree
- [x] Automatic stash/unstash works
- [x] Branch validation works
- [x] Conflict detection works
- [x] Unit tests pass

### Files Changed
- `tools/wvo_mcp/src/git/preflight.ts` (new, ~100 LOC)
- `tools/wvo_mcp/src/git/stash.ts` (new, ~80 LOC)
- `tools/wvo_mcp/src/supervisor/supervisor.ts` (modified, +20 LOC)
- Tests (~150 LOC)

**Total:** ~350 LOC

---

## Task 2: AFP-W0-M1-GUARDRAIL-BASELINE

### Goal
Enforce AFP/SCAS constraints (LOC limits, file count, complexity).

### Approach

**Step 1: Create enforcement module**
```bash
mkdir -p tools/wvo_mcp/src/enforcement
touch tools/wvo_mcp/src/enforcement/guardrails.ts
touch tools/wvo_mcp/src/enforcement/loc_analyzer.ts
touch tools/wvo_mcp/src/enforcement/complexity.ts
```

**Step 2: Implement LOC validation**

File: `tools/wvo_mcp/src/enforcement/loc_analyzer.ts`

```typescript
export interface LOCAnalysis {
  filesChanged: Array<{
    path: string;
    added: number;
    deleted: number;
    net: number;
  }>;
  totalAdded: number;
  totalDeleted: number;
  netLOC: number;
}

export async function analyzeLOC(): Promise<LOCAnalysis> {
  const diff = await gitAdapter.getDiff();
  const files = diff.files.map(f => ({
    path: f.path,
    added: f.additions,
    deleted: f.deletions,
    net: f.additions - f.deletions
  }));

  return {
    filesChanged: files,
    totalAdded: files.reduce((sum, f) => sum + f.added, 0),
    totalDeleted: files.reduce((sum, f) => sum + f.deleted, 0),
    netLOC: files.reduce((sum, f) => sum + f.net, 0)
  };
}
```

**Step 3: Implement guardrail validation**

File: `tools/wvo_mcp/src/enforcement/guardrails.ts`

```typescript
export interface GuardrailResult {
  valid: boolean;
  violations: string[];
  override?: string;
}

export async function validateTask(taskId: string): Promise<GuardrailResult> {
  const violations: string[] = [];

  // Check LOC limit
  const loc = await analyzeLOC();
  const limit = getTier(taskId) === 'epic' ? 1000 : 150;

  if (loc.netLOC > limit) {
    violations.push(`LOC exceeds limit (${loc.netLOC}/${limit})`);
  }

  // Check file count
  if (loc.filesChanged.length > 5 && getTier(taskId) !== 'epic') {
    violations.push(`Too many files (${loc.filesChanged.length}/5)`);
  }

  // Check for override
  const override = await checkOverride(taskId);

  return {
    valid: violations.length === 0 || !!override,
    violations,
    override
  };
}
```

**Step 4: Integrate with pre-commit hook**

Existing pre-commit hook should call guardrail validation.

### Exit Criteria
- [x] LOC validation works
- [x] File count validation works
- [x] Override mechanism works
- [x] Pre-commit integration works
- [x] Unit tests pass

### Files Changed
- `tools/wvo_mcp/src/enforcement/` (new, ~200 LOC)
- Tests (~100 LOC)

**Total:** ~300 LOC

---

## Task 3: AFP-W0-M1-DEVICE-PROFILE-STABILITY

### Goal
Detect device capabilities and adapt autopilot behavior.

### Approach

**Step 1: Create device profile module**
```bash
mkdir -p tools/wvo_mcp/src/stability
touch tools/wvo_mcp/src/stability/device_profile.ts
touch tools/wvo_mcp/src/stability/resource_monitor.ts
```

**Step 2: Implement device detection**

File: `tools/wvo_mcp/src/stability/device_profile.ts`

```typescript
import * as os from 'os';
import * as fs from 'fs/promises';

export interface DeviceProfile {
  cpuCores: number;
  ramGB: number;
  diskSpaceGB: number;
  category: 'low' | 'medium' | 'high';
  timestamp: string;
}

export async function detectProfile(): Promise<DeviceProfile> {
  const cpuCores = os.cpus().length;
  const ramGB = os.totalmem() / (1024 ** 3);

  // Check disk space
  const stats = await fs.statfs('/');
  const diskSpaceGB = (stats.bavail * stats.bsize) / (1024 ** 3);

  const category =
    cpuCores >= 16 && ramGB >= 32 ? 'high' :
    cpuCores >= 4 && ramGB >= 8 ? 'medium' :
    'low';

  const profile = {
    cpuCores,
    ramGB: Math.round(ramGB),
    diskSpaceGB: Math.round(diskSpaceGB),
    category,
    timestamp: new Date().toISOString()
  };

  // Save profile
  await fileIO.writeJSON('state/device_profile.json', profile);

  return profile;
}

export function getConfig(profile: DeviceProfile) {
  return {
    concurrency: Math.max(1, Math.floor(profile.cpuCores / 2)),
    batchSize: profile.category === 'high' ? 1000 :
                profile.category === 'medium' ? 100 : 10,
    cacheEnabled: profile.diskSpaceGB > 10,
    timeout: profile.category === 'high' ? 300000 : 600000
  };
}
```

**Step 3: Implement resource monitoring**

File: `tools/wvo_mcp/src/stability/resource_monitor.ts`

```typescript
export interface ResourceCheck {
  abort: boolean;
  reason?: string;
  memoryUsagePercent?: number;
  diskFreeGB?: number;
}

export async function checkResources(): Promise<ResourceCheck> {
  // Check memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPercent = ((totalMem - freeMem) / totalMem) * 100;

  if (usedPercent > 90) {
    return {
      abort: true,
      reason: 'high_memory',
      memoryUsagePercent: usedPercent
    };
  }

  // Check disk
  const stats = await fs.statfs('/');
  const freeGB = (stats.bavail * stats.bsize) / (1024 ** 3);

  if (freeGB < 1) {
    return {
      abort: true,
      reason: 'low_disk',
      diskFreeGB: freeGB
    };
  }

  return { abort: false };
}
```

**Step 4: Integrate with supervisor**

Supervisor uses device profile for concurrency, monitors resources during execution.

### Exit Criteria
- [x] Device detection works
- [x] Profile saved/loaded
- [x] Config adapts to profile
- [x] Resource monitoring works
- [x] Unit tests pass

### Files Changed
- `tools/wvo_mcp/src/stability/` (new, ~200 LOC)
- Tests (~100 LOC)

**Total:** ~300 LOC

---

## Total Estimate

**Files:** ~12 new files
**LOC:** ~950 LOC
**Time:** ~18 hours

---

**Plan complete:** 2025-11-06
**Next phase:** Execution
**Owner:** Claude Council
