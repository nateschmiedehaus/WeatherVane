# STRATEGY: w0m1-stability-and-guardrails

**Set ID:** w0m1-stability-and-guardrails
**Milestone:** W0.M1 (Reboot Autopilot Core)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Autopilot operates in a production environment (local git repo, file system) and needs operational stability:
- **Git hygiene:** Autopilot must not corrupt worktree (unstaged changes blocking operations)
- **Guardrails:** Autopilot must respect AFP/SCAS constraints (LOC limits, file count, etc.)
- **Device profile:** Autopilot must adapt to machine capabilities (CPU, memory, disk)

**Current state:**
- Git operations brittle (autopilot crashes on dirty worktree)
- No guardrails enforced (can violate LOC limits, create too many files)
- No device awareness (same behavior on MacBook vs server)

**Pain points:**
1. **Git corruption** - Autopilot leaves worktree dirty, blocks future work
2. **Constraint violations** - Tasks exceed LOC limits, violate AFP principles
3. **Resource exhaustion** - Autopilot doesn't adapt to machine limits (CPU/memory/disk)
4. **No safety net** - Autopilot can do damage (force push, delete files)

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Autopilot developed without production operations experience
- Git operations assumed clean worktree (happy path only)
- No resource constraints during prototyping
- Safety deferred as "nice to have"

**Systemic:**
- No pre-flight checks (assume environment is clean)
- No post-operation validation (assume operations succeeded)
- No adaptive behavior (one-size-fits-all)

**The core issue:** **Autopilot assumes ideal environment, has no operational resilience**

---

## Goal / Desired Outcome

**Build operational stability layer:**

### 1. Worktree Stability
- Git pre-flight checks (detect dirty worktree, uncommitted changes)
- Automatic stash/unstash (preserve user work)
- Branch validation (confirm on correct branch)
- Conflict detection (abort on merge conflicts)

**Measurable:** Autopilot runs without git errors, worktree clean after execution

### 2. Guardrail Enforcement
- AFP/SCAS constraint validation (LOC limits, file count, complexity)
- Pre-commit hooks integrated (block violations)
- Task size validation (reject tasks that would violate)
- Override mechanism (explicit LOC_OVERRIDE with justification)

**Measurable:** 0 constraint violations, all overrides justified

### 3. Device Profile Awareness
- Detect machine capabilities (CPU cores, RAM, disk space)
- Adapt behavior (parallelism, batch sizes, caching)
- Resource monitoring (abort if approaching limits)
- Profile-based configuration (dev vs prod settings)

**Measurable:** Autopilot adapts to machine (2-core MacBook vs 64-core server)

---

## Strategic Urgency

**Why now?**

1. **Stability requirement** - Wave 0 exit criteria includes ≥4hr autonomous operation (requires stability)
2. **Safety critical** - Autopilot operating on production repo (risk of data loss)
3. **AFP compliance** - Can't enforce process if autopilot violates it
4. **Early prevention** - Easier to build in now than retrofit later

**Without this work:**
- Autopilot unstable (crashes on git conflicts)
- AFP violations go undetected (process compliance theater)
- Resource issues unpredictable (works on dev machine, fails on server)
- Risk of data loss (force push, file deletion)

**With this work:**
- Autopilot stable (handles git edge cases)
- AFP violations blocked (process enforced)
- Adaptive behavior (works on any machine)
- Safe operations (guardrails prevent damage)

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Blind git operations → pre-flight checks
- Unconstrained task size → guardrail enforcement
- Fixed resource usage → adaptive behavior
- Potential data loss → safety checks

**What are we ADDING?**
- Git hygiene checks (~200 LOC)
- Guardrail validation (~200 LOC)
- Device profile detection (~150 LOC)

**Is the addition justified?**
- **Yes:** Prevents git corruption (hours of manual cleanup avoided)
- **Yes:** Enforces AFP compliance (process integrity)
- **Yes:** Enables production operation (stability requirement)

### COHERENCE (Match Terrain)

**Reusing proven patterns:**
- Pre-flight checks (aviation, SpaceX)
- Guardrails (AWS limits, GitHub rate limiting)
- Device profiles (responsive web design, mobile apps)
- Git worktree management (git-flow, GitHub Actions)

---

## Success Criteria

**Set complete when:**

### Worktree Stability
- [ ] Pre-flight checks detect dirty worktree
- [ ] Automatic stash/unstash preserves user work
- [ ] Branch validation confirms correct branch
- [ ] Conflict detection aborts cleanly

### Guardrail Enforcement
- [ ] LOC limits enforced (task ≤150 LOC net)
- [ ] File count enforced (task ≤5 files)
- [ ] Complexity validation (cyclomatic complexity)
- [ ] Override mechanism works (LOC_OVERRIDE + justification)

### Device Profile Awareness
- [ ] Detects CPU cores, RAM, disk space
- [ ] Adapts parallelism (cores / 2 for concurrency)
- [ ] Monitors resources (abort if >90% RAM used)
- [ ] Profile-based config (dev vs prod)

---

## Risks and Mitigations

### Risk 1: Git Operations Fail Despite Checks
- **Threat:** Edge cases not covered by pre-flight checks
- **Mitigation:** Comprehensive test suite (100+ git scenarios)
- **Mitigation:** Fail-safe abort (never force operations)
- **Mitigation:** Logging for post-mortem analysis

### Risk 2: Guardrails Too Strict
- **Threat:** Legitimate tasks blocked by guardrails
- **Mitigation:** Override mechanism (LOC_OVERRIDE)
- **Mitigation:** Task-level justification required
- **Mitigation:** Review overrides in metrics

### Risk 3: Device Profile Inaccurate
- **Threat:** Misdetect capabilities (thinks 64-core when 2-core)
- **Mitigation:** Conservative defaults (assume low-end)
- **Mitigation:** Manual override (environment variable)
- **Mitigation:** Runtime validation (measure actual performance)

---

## Estimated Effort

**Worktree stability:** 8 hours (git checks, stash/unstash, conflict detection)
**Guardrail enforcement:** 6 hours (LOC validation, pre-commit integration)
**Device profile:** 4 hours (detection, adaptive config)

**Total:** ~18 hours

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M1-WORKTREE-STABILIZE, AFP-W0-M1-GUARDRAIL-BASELINE, AFP-W0-M1-DEVICE-PROFILE-STABILITY
