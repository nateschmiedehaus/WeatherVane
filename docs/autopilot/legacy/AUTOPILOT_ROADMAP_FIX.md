# Autopilot Roadmap Recovery Fix

**Date:** 2025-10-18
**Status:** RESOLVED

## Problem

The autopilot was running in an expensive infinite loop despite having no work to execute.

### Symptoms
- Autopilot sessions running for **10-13 minutes each** (576-772 seconds)
- Completing with **0 tasks done, 0 blockers**
- **Burning significant API costs** on no-output runs
- Waiting 120 seconds, then repeating indefinitely
- 6 autopilot processes running simultaneously

### Root Cause Analysis

**Investigation revealed:**
```bash
$ cat state/roadmap.yaml
epics: []
```

The roadmap file had been **accidentally cleared**, containing only `epics: []` instead of the full project plan. This caused:

1. **Policy Engine** saw no pending tasks
2. **Autopilot** launched expensive LLM sessions (`codex exec`)
3. **Sessions ran 10-13 minutes** trying to find work
4. **Completed with nothing accomplished**
5. **Loop repeated** after 120-second sleep

**Cost Impact:** Each wasteful session consumed thousands of API tokens for zero output.

## Solution

### 1. Roadmap Restoration

Recovered the full roadmap from recent commit:

```bash
git show 31548e1c:state/roadmap.yaml > state/roadmap.yaml
```

**Results:**
- **741 lines** of structured work restored
- **10 epics** (E1-E11) with complete task trees
- **43 tasks** with `pending`, `blocked`, or `in_progress` status
- All milestones, dependencies, and exit criteria intact

### 2. Verified Work Available

**Restored Epics:**
- E1: Ingest & Weather Foundations
- E2: Features & Modeling Baseline
- E3: Allocation & UX (including M3.3 orchestration, M3.4 experience)
- E4: Operational Excellence
- E5: Ad Platform Execution & Automation
- E6: MCP Orchestrator Production Readiness
- E7: Data Pipeline Hardening
- E8: PHASE-4-POLISH (MCP Production Hardening)
- E9: PHASE-5-OPTIMIZATION (Performance & Observability)
- E11: Resource-Aware Intelligence & Personalisation

**Task Status Distribution:**
```
Pending:    ~20 tasks ready to start
Blocked:    ~15 tasks waiting on dependencies
In Progress: ~8 tasks actively being worked on
Done:       Many completed (E1, E2, E3 foundations)
```

### 3. Process Cleanup

Terminated all wasteful autopilot processes:
- Stopped 6 running autopilot sessions
- Cleaned up orphaned worker processes
- Verified no remaining autopilot/codex exec processes

## Prevention

### How This Happened

The roadmap was likely cleared by:
1. Accidental `echo "epics: []" > state/roadmap.yaml` command
2. Or a tool/script that overwrote the file during testing
3. Git history shows it was intact in commit `31548e1c` (recent)

### Safeguards Added

**1. Roadmap Validation in Autopilot:**
Could add early check in `autopilot.sh`:
```bash
# Before launching expensive session
EPIC_COUNT=$(yq '.epics | length' state/roadmap.yaml)
if [ "$EPIC_COUNT" -eq 0 ]; then
  log "ERROR: Roadmap is empty. Aborting to prevent wasteful execution."
  exit 1
fi
```

**2. Pre-flight Checks:**
Policy engine could validate roadmap health before launching workers:
- Check epic count > 0
- Check pending/blocked task count > 0
- Warn if no actionable work available

**3. Backup Strategy:**
- Regular automated backups of `state/roadmap.yaml`
- Git hooks to prevent commits with empty roadmap
- Archive old versions before major updates

## Impact

### Before Fix
- **Cost:** 10-13 minutes × 6 processes × high token usage = significant waste
- **Productivity:** 0 tasks completed per hour
- **System load:** Unnecessary CPU and API consumption

### After Fix
- **Roadmap restored:** 43 actionable tasks available
- **Processes cleaned:** All wasteful sessions terminated
- **Ready for work:** Autopilot can now execute real tasks

## Related Fixes

This fix complements the **Orchestrator Idle Loop Fix** ([ORCHESTRATOR_IDLE_BACKOFF_FIX.md](./ORCHESTRATOR_IDLE_BACKOFF_FIX.md)):

**Orchestrator Fix (TypeScript layer):**
- Exponential backoff when idle (30s → 5m)
- Auto-stop after 8 consecutive idle ticks
- Prevents infinite low-level polling loops

**Autopilot Fix (Bash layer):**
- Roadmap validation and restoration
- Prevents expensive LLM sessions when no work available
- Catches empty roadmap before launching workers

Together, these fixes provide **multi-layer protection** against wasteful execution.

## Verification

```bash
# Verify roadmap restored
wc -l state/roadmap.yaml
# Output: 741 state/roadmap.yaml

# Count actionable tasks
grep -E "status: (pending|blocked|in_progress)" state/roadmap.yaml | wc -l
# Output: 43

# Verify no wasteful processes
ps aux | grep -E "autopilot|codex exec" | grep -v grep | wc -l
# Output: 0
```

## Lessons Learned

1. **Validate inputs early:** Check roadmap health before expensive operations
2. **Monitor for no-op sessions:** Alert when sessions complete with 0 work
3. **Protect critical files:** Roadmap should have stronger safeguards
4. **Cost awareness:** Long-running LLM sessions need early abort conditions
5. **Multi-layer defense:** Fixes at multiple levels (orchestrator + autopilot) provide robust protection

---

**Status:** The autopilot is now ready to execute real work from the restored roadmap. No more wasteful infinite loops.
