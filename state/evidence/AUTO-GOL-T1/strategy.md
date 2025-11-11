# Strategic Analysis: AUTO-GOL-T1

**Task ID:** AUTO-GOL-T1
**Title:** GOL Tier-1: Finite Grid + Canonical Rules
**Epic:** Wave 0 Autonomy Validation
**Date:** 2025-11-10

## Executive Summary

This task validates Wave 0's autonomous execution capability by implementing Conway's Game of Life with forced task selection and enforcement bypasses. The strategic goal is not the GOL implementation itself, but proving the mutation patches (WAVE0_FORCE_TASK_ID, WAVE0_SKIP_REMEDIATION, WVO_DISABLE_SEMANTIC_ENFORCER) enable controller-driven execution for debugging and validation scenarios.

## Problem Analysis

### Context
Wave 0 autopilot historically fails to complete tasks autonomously due to:
1. Semantic enforcer initialization hangs (EISDIR on directory indexing)
2. Remediation loops (creates remediation-of-remediation infinitely)
3. Task selection ambiguity (picks wrong task or stalls)
4. Quality enforcement too strict for simple validation tasks

### Root Cause
The autonomous agent has no "manual override" mode for operators to force specific task execution while bypassing quality gates. This blocks debugging and incremental validation of Wave 0 components.

### Analysis Based on Existing Code

**File: tools/wvo_mcp/src/wave0/runner.ts:45-67**
- Current task selection uses selectNextTask() which can return undefined or wrong task
- No mechanism to force a specific task ID
- Relies on roadmap priorities which may not reflect debugging needs

**File: tools/wvo_mcp/src/enforcement/stigmergic_enforcer.ts:195-235**
- Remediation creation is mandatory when quality issues detected
- No flag to suppress remediation for validation runs
- Creates roadmap entries that hijack subsequent runs

**File: tools/wvo_mcp/src/enforcement/semantic/semantic_enforcer.ts:88-115**
- Initialization always runs, even for simple tasks
- Indexer attempts to index directories, causing EISDIR errors
- No flag to bypass entirely for non-semantic tasks

## Strategic Objectives

### Primary Goal
Enable **controller-driven Wave 0 execution** where human operators can:
1. Force specific task by ID (bypass selection logic)
2. Skip remediation creation (complete task despite quality issues)
3. Disable semantic enforcement (avoid indexer overhead/bugs)

### Success Criteria
1. Environment flag `WAVE0_FORCE_TASK_ID=1` + `TASK_ID=X` forces runner to select task X
2. Environment flag `WAVE0_SKIP_REMEDIATION=1` prevents remediation roadmap entries
3. Environment flag `WVO_DISABLE_SEMANTIC_ENFORCER=1` short-circuits semantic checks
4. Task completes all 10 AFP phases with flags active
5. No infinite loops, hangs, or remediation cascades

## Via Negativa Analysis

**What can we DELETE or SIMPLIFY?**

1. **Delete semantic enforcer calls** when flag set (don't just return early in methods, skip entirely)
2. **Remove remediation task creation** when flag set (log bypass, return approved)
3. **Simplify task selection** to single lookup when forced (no complex priority logic)

**What should we NOT add?**
- No new task selection algorithms (just force existing selection)
- No new quality enforcement layers (just bypass existing ones)
- No new configuration formats (use environment variables)

## Approach Comparison

### Approach A: Environment Flags (SELECTED)
**Pros:**
- Simple to implement (3 boolean checks)
- No config file changes needed
- Easy to use in CI/CD
- Clear intent (explicit bypass)

**Cons:**
- Environment variables can leak between runs
- No audit trail (unless logged)
- Bypasses may be forgotten/left on

**Complexity:** Low (56/100 justified by debugging value)

### Approach B: CLI Arguments
**Pros:**
- More explicit than env vars
- Better audit trail in process lists

**Cons:**
- Requires changing runner CLI interface
- Harder to set in systemd/PM2 configs
- More invasive changes

**Complexity:** Medium

### Approach C: Config File Overrides
**Pros:**
- Persistent, documented configuration
- Can track in git with justification

**Cons:**
- Requires config schema changes
- Easy to commit accidentally
- Slower to toggle on/off

**Complexity:** High

## Edge Cases & Mitigations

### Edge Case 1: Forced task doesn't exist
**Mitigation:** Log error, fall back to normal selection, exit gracefully

### Edge Case 2: Remediation flag ignored
**Mitigation:** Add explicit bypass logging, verify in tests that no roadmap entries created

### Edge Case 3: Semantic enforcer partially initializes before flag check
**Mitigation:** Check flag at earliest possible point (constructor/initialize, before indexer)

### Edge Case 4: Flags leak to production runs
**Mitigation:** Document clearly these are DEBUG-ONLY flags, add warnings to logs when active

### Edge Case 5: Multiple enforcement layers still block
**Mitigation:** Ensure bypasses apply to all relevant code paths (StigmergicEnforcer + SemanticEnforcer + TaskExecutor)

## Implementation Risks

### Risk 1: Bypass flags used inappropriately in production
**Severity:** Medium
**Mitigation:** Log warnings, document as debug-only, consider time-based expiry

### Risk 2: Semantic enforcer still causes EISDIR despite flag
**Severity:** Low (flag checks added early)
**Mitigation:** Return early from initialize() when flag set

### Risk 3: Task completion claimed but quality compromised
**Severity:** High (defeats purpose of quality enforcement)
**Mitigation:** Use only for validation/debugging, never for production tasks

## Success Metrics

1. **Forced selection works:** Wave 0 picks AUTO-GOL-T1 when WAVE0_FORCE_TASK_ID=1
2. **Remediation skipped:** No remediation tasks created when WAVE0_SKIP_REMEDIATION=1
3. **Semantic bypassed:** No EISDIR errors when WVO_DISABLE_SEMANTIC_ENFORCER=1
4. **Completes phases:** All 10 AFP phases execute (STRATEGIZE → MONITOR)
5. **No hangs:** Completes in <5 minutes with single-run flag
6. **Artifacts generated:** Phase evidence files created in state/evidence/

## References

- AFP-W0-STEP5-MUTATION: Parent task defining mutation testing requirements
- state/roadmap.yaml: Task definitions and priorities
- tools/wvo_mcp/src/wave0/runner.ts: Main autopilot loop
- tools/wvo_mcp/src/enforcement/stigmergic_enforcer.ts: Quality enforcement
- docs/orchestration/AUTOPILOT_VALIDATION_RULES.md: Wave 0 testing guidelines

## Conclusion

This task is narrowly scoped: add three environment flag checks to enable manual control of Wave 0 for debugging. It does NOT attempt to fix autonomous execution end-to-end, only to provide operators a way to force specific task execution while bypassing enforcement layers that may be buggy or too strict for validation scenarios.

Success = controller can force a simple task through all 10 phases without getting stuck in remediation loops or semantic enforcer hangs.
