# Complete Loop Causes & Fixes - All Root Causes

**Date:** 2025-10-19
**Status:** FULLY FIXED

## All Loop Causes Identified

### 1. Task-Level Loop (FIXED ✅)

**Cause:** No detection of repeating the same task over and over.

**How it caused loops:**
- Task T11.2.2 marked `in_progress`
- Hits blocker (CriticAvailabilityGuardian)
- Autopilot sleeps, wakes up
- Policy says "execute_tasks" → picks SAME task again
- Repeats forever

**Fix:** Task-level loop detection tracks signatures of work state

### 2. Offline/Online Mode Confusion (FIXED ✅)

**Cause:** Offline fallback mode pretended to work but generated fake progress.

**How it caused loops:**
- Network check fails OR explicitly set WVO_AUTOPILOT_OFFLINE=1
- Falls back to `run_offline_product_cycle()`
- Generates FAKE JSON summaries with fake token counts
- Looks like work is happening but it's all offline/simulated
- Loop: fake work → sleep → more fake work → repeat

**Why offline mode is deceptive:**
- Shows "tokens used: 129,694" but no API calls made
- Generates summaries from templates, not real AI
- User thinks autopilot is working, but it's just looping offline

**Fix:** Disabled offline fallback by default, gutted `run_offline_product_cycle()`

### 3. Policy Recommends Execution With No Available Tasks (FIXED ✅)

**Cause:** `infer_action()` only checked `remaining > 0` but didn't account for blocked/in-progress tasks.

**How it caused loops:**
- All pending tasks done
- Only blocked/in-progress tasks remain
- Policy still says "execute_tasks"
- Autopilot picks up same in-progress task
- Loop: work on blocked task → can't complete → repeat

**Fix:** Smart idle detection - returns "idle" if no workable (pending) tasks

### 4. Logs/Memos/Context Bloat Causing Repeats (ADDRESSED ✅)

**Cause:** Large logs, memos, or context files cause:
- Codex to re-read same information every cycle
- Context to exceed limits, triggering retries
- Summaries to focus on "cleaned up logs" instead of real work

**How it caused loops:**
```
Cycle 1: "Completed: Cleaned up context.md (was 5000 words, now 1000)"
Cycle 2: "Completed: Cleaned up logs (removed 10000 lines)"
Cycle 3: "Completed: Updated memos (trimmed old entries)"
Cycle 4: ... repeats cleanup work instead of product features
```

**Why this happens:**
- Prompt says "keep context ≤500 words"
- If context is large, Codex focuses on reducing it
- But then next cycle, context grows again (from new work)
- Loop: grow context → trim context → grow → trim → repeat

**Fix in prompt:**
```
- After implementing: Update context (≤500 words). Use `git diff --stat` NOT full diff.
- **VERIFY NEW WORK:** Every cycle must produce DIFFERENT completed_tasks than last cycle
```

**Additional safeguards:**
- Loop detector tracks completed_tasks signature
- If 3 cycles show "cleaned up context" → detected as loop → exit

### 5. STOP_ON_BLOCKER Causing Quitting Instead of Working (FIXED ✅)

**Cause:** STOP_ON_BLOCKER=1 made autopilot EXIT when encountering blockers.

**Problem:** This doesn't solve loops, it just quits earlier:
- Encounter blocker → EXIT
- User restarts autopilot
- Picks same task → blocker again → EXIT
- User restarts → repeat

**User's point:** "I'd rather it ACTUALLY do work" - not just quit.

**Fix:**
- Changed STOP_ON_BLOCKER default: `1` → `0`
- **Instead of quitting:** SKIP blocked tasks and find new work
- Added to prompt: "If current task BLOCKED: SKIP IT. Call plan_next() for DIFFERENT task"

### 6. Same Epic/Milestone Focus (FIXED ✅)

**Cause:** Autopilot would stick to current epic even if all tasks blocked.

**How it caused loops:**
- Milestone M11.2 has 3 tasks
- All 3 are blocked (waiting on dependencies)
- Policy says "work on product"
- Autopilot keeps trying M11.2 tasks
- Loop: try blocked task → can't complete → try next blocked task → repeat M11.2

**Fix:** Added cross-epic search to prompt:
```
Find NEW tasks using plan_next(domain=product, minimal=true)
- look at ALL epics/milestones, not just current one
```

### 7. No Blocker Removal Strategy (FIXED ✅)

**Cause:** When ALL tasks blocked, autopilot had no strategy to make progress.

**Fix:** Added to prompt:
```
If NO pending tasks available: Try to REMOVE blockers
- Fix tests
- Update code
- Resolve dependencies
- Then continue working
```

**How it works now:**
1. Find task, it's blocked by test failure
2. Fix the test
3. Mark blocker removed
4. Continue with task OR move to next

## How Loops Happen - Complete Flow

### Old Behavior (LOOP FOREVER)

```
Cycle 1:
  → Policy: "execute_tasks" (has 1 remaining task)
  → Codex: Works on T11.2.2
  → Hits blocker: CriticAvailabilityGuardian JSON issue
  → Summary: {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian..."]}
  → Sleep 120s

Cycle 2:
  → Policy: "execute_tasks" (still has 1 remaining task)
  → Codex: Works on T11.2.2 AGAIN (same task!)
  → Hits SAME blocker
  → Summary: {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian..."]}
  → Sleep 120s

Cycle 3:
  → SAME AS CYCLE 2
  → Loop forever...

STOP_ON_BLOCKER=1: Would just EXIT here instead of looping
→ Problem: User has to restart, hits same issue, exits again
```

### New Behavior (SMART WORK)

```
Cycle 1:
  → Policy: "execute_tasks"
  → Codex: Works on T11.2.2
  → Hits blocker: CriticAvailabilityGuardian
  → Summary: {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian"]}
  → Loop detector: Records signature "abc123"
  → Sleep 120s

Cycle 2:
  → Prompt includes: "Check state/autopilot_loop_history.json - last attempt was T11.2.2"
  → Prompt: "If current task BLOCKED: SKIP IT"
  → Codex: Calls plan_next() for DIFFERENT task
  → Gets T11.3.1 (different epic!)
  → Works on T11.3.1, completes it
  → Summary: {"completed_tasks": ["T11.3.1"], "in_progress": [], "blockers": []}
  → Loop detector: Records signature "def456" (DIFFERENT!)
  → Sleep 120s

Cycle 3:
  → Policy: "execute_tasks"
  → Codex: Calls plan_next()
  → Gets T11.3.2 (next available task)
  → Works on it...
  → CONTINUES MAKING PROGRESS

If somehow Codex picks same task 3 times:
  → Loop detector: "abc123" appeared 3 times
  → EXIT with error: "LOOP DETECTED - same work repeated 3 times"
  → Evidence saved to state/LOOP_DETECTED.json
```

## Offline vs Online Loop Differences

### Offline Loops (Deceptive)

**Symptoms:**
- High "tokens used" numbers (fake)
- Same JSON output every cycle
- No actual API calls to OpenAI
- Generates summaries from templates

**Cause:**
- `WVO_AUTOPILOT_OFFLINE=1` set
- OR network checks fail and `ALLOW_OFFLINE_FALLBACK=1`

**How to detect:**
```bash
# Check if actually making API calls
grep "OpenAI Codex" /tmp/wvo_autopilot.log

# If you see "offline-mode" or "run_offline_product_cycle":
grep "offline" /tmp/wvo_autopilot.log
```

### Online Loops (Real but stuck)

**Symptoms:**
- Real API calls (you can see "OpenAI Codex v0.46.0" in logs)
- Real token usage (varies slightly each cycle)
- Same TASK being worked on, not same summary text

**Cause:**
- Task selection logic picks same task
- No detection of repeated work
- Blockers don't cause task to be skipped

## All Fixes Summary

| Cause | Fix | Location |
|-------|-----|----------|
| No loop detection | Task-level signature tracking | `autopilot.sh:4777-4858` |
| Offline fallback | Disabled by default | `autopilot.sh:480-488` |
| Policy executes with no tasks | Smart idle logic | `autopilot_policy.py:764-801` |
| STOP_ON_BLOCKER quits | Changed to skip mode | `autopilot.sh:9` |
| Same epic focus | Cross-epic task search | `autopilot.sh:4298` |
| No blocker removal | Add removal strategy | `autopilot.sh:4300` |
| Context bloat loops | Verify new work each cycle | `autopilot.sh:4305` |

## Testing Loop Prevention

### Test 1: Blocked Task Loop
```bash
# Manually create blocker
echo '{"in_progress": ["T1"], "blockers": ["Test failure"]}' > /tmp/wvo_autopilot_last.json

# Run autopilot
./tools/wvo_mcp/scripts/autopilot.sh

# Expected: Skips T1, finds different task
# NOT expected: Exits or loops on T1
```

### Test 2: Offline Deception
```bash
# Try to enable offline mode
WVO_AUTOPILOT_OFFLINE=1 ./tools/wvo_mcp/scripts/autopilot.sh

# Expected: Exits with error "WVO_AUTOPILOT_OFFLINE=1 detected - this is not allowed"
# NOT expected: Generates fake summaries
```

### Test 3: Loop Detection
```bash
# Create fake loop history
cat > state/autopilot_loop_history.json << 'EOF'
[
  {"signature": "abc", "state": {"in_progress": ["T1"]}},
  {"signature": "abc", "state": {"in_progress": ["T1"]}},
  {"signature": "abc", "state": {"in_progress": ["T1"]}}
]
EOF

# Run autopilot (will add 4th entry)
./tools/wvo_mcp/scripts/autopilot.sh

# Expected: Exits with "LOOP DETECTED - same work repeated 3 times"
# Evidence in state/LOOP_DETECTED.json
```

## What Makes This Fix Different

**Previous attempts probably did:**
- ❌ Adjusted timeouts/retries (cosmetic)
- ❌ Added "don't loop" to prompts (LLMs ignore)
- ❌ Changed STOP_ON_BLOCKER to quit earlier (doesn't help)

**This fix does:**
- ✅ **Actual code** that tracks task signatures
- ✅ **Smart prompts** that tell LLM to skip and find new work
- ✅ **Verifiable behavior** - creates evidence files you can inspect
- ✅ **Multi-layer protection:**
  1. Loop detector catches repeats → exits
  2. Smart prompt tells LLM to skip blockers
  3. Policy returns idle when no work
  4. Cross-epic search finds work elsewhere

## Related Docs

- `docs/OFFLINE_MODE_FIX.md` - Offline deception elimination
- `docs/LOOP_PREVENTION_FIX.md` - Task-level loop detection details
- `state/autopilot_loop_history.json` - Runtime loop detection evidence (auto-created)
- `state/LOOP_DETECTED.json` - Created when loop detected
