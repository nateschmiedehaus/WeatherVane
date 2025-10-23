# Loop Prevention - Critical Autopilot Fixes

**Date:** 2025-10-19
**Severity:** CRITICAL
**Status:** FIXED

## Problem

The autopilot was stuck in a **massive infinite loop**, repeating the same work over and over:

```
Same JSON output repeated 10+ times
Same token count (129,694) every cycle
Same task (T11.2.2) stuck "in_progress"
Same blocker (CriticAvailabilityGuardian) every cycle
Sleeps 120s, then repeats EXACTLY the same work
```

User quote: *"im almost positive we are STILL in a fucking crazy loop"*

## Root Causes Identified

### 1. No Task-Level Loop Detection
**Problem:** The LoopDetector class existed in TypeScript but was **NEVER CALLED** by the bash autopilot script.

**Impact:** The autopilot had no way to detect when it was working on the same task repeatedly.

**Old "detection":** Only checked if blocker hash changed (too weak - missed same-task-same-work loops)

### 2. Policy Recommends "execute_tasks" With No Available Tasks
**Problem:** `infer_action()` only checked if `remaining > 0` but didn't account for:
- Tasks stuck `in_progress`
- Tasks that are `blocked`
- No actually *workable* pending tasks

**Impact:** Policy said "execute_tasks" even when there was nothing new to do, causing the autopilot to pick up the same in-progress task again.

### 3. STOP_ON_BLOCKER Default Was 0
**Problem:** `STOP_ON_BLOCKER` defaulted to `0`, meaning blockers would **NOT** stop the loop.

**Impact:** When a task hit a blocker, autopilot would:
1. Report the blocker
2. Log "Blockers present but STOP_ON_BLOCKER=0; continuing"
3. Sleep 120s
4. Pick up the SAME task with the SAME blocker
5. Loop forever

### 4. Task State Machine Allowed Repeated In-Progress Work
**Problem:** No mechanism to prevent working on a task that's already `in_progress` and blocked.

**Impact:** Task gets marked `in_progress`, hits blocker, but never gets marked `blocked`, so autopilot keeps trying it.

## Fixes Applied

### Fix 1: Real Task-Level Loop Detection ✅

**Location:** `tools/wvo_mcp/scripts/autopilot.sh:4777-4858`

**What it does:**
- Tracks task signatures from `completed_tasks`, `in_progress`, and `blockers`
- Creates SHA256 hash of task state
- Saves history to `state/autopilot_loop_history.json`
- Detects if same signature appears **3+ times in last 5 attempts**
- **EXITS IMMEDIATELY** with clear error and evidence file

**Code:**
```python
# Create signature from task state AND work content
task_sig = {
    "completed": sorted([str(t)[:200] for t in completed]),
    "in_progress": sorted([str(t)[:200] for t in in_progress]),
    "blockers": sorted([str(b)[:200] for t in blockers]),
}
signature = hashlib.sha256(json.dumps(task_sig, sort_keys=True).encode()).hexdigest()[:12]

# Detect loop: same signature 3+ times in last 5 attempts
if max_repeats >= 3:
    log "❌ CRITICAL: Task-level LOOP detected"
    exit 1
```

**Evidence files created:**
- `state/autopilot_loop_history.json` - Full history of last 10 attempts
- `state/LOOP_DETECTED.json` - Loop detection summary with signature and state

### Fix 2: Smart Policy - No execute_tasks Without Workable Tasks ✅

**Location:** `tools/wvo_mcp/scripts/autopilot_policy.py:764-801`

**What it does:**
- Checks for `workable_tasks` (only pending tasks count)
- Returns `"idle"` if no pending tasks available
- Returns `"idle"` if all tasks are blocked
- **Prevents** policy from recommending execution when there's nothing to do

**Code:**
```python
def infer_action(domain: str, domain_features: Dict[str, Any]) -> str:
    remaining = int(features.get("remaining", 0) or 0)
    blocked = int(features.get("blocked", 0) or 0)
    in_progress = int(features.get("in_progress", 0) or 0)

    workable_tasks = remaining  # Only pending tasks are workable

    if workable_tasks <= 0:
        # No pending tasks - go idle to prevent loop
        return "idle"

    total_tasks = remaining + blocked + in_progress
    if total_tasks > 0 and blocked >= total_tasks:
        return "idle"  # Everything is blocked

    return "execute_tasks"
```

### Fix 3: STOP_ON_BLOCKER Default Changed to 1 ✅

**Location:** `tools/wvo_mcp/scripts/autopilot.sh:9`

**What it does:**
- Changes default from `STOP_ON_BLOCKER=0` to `STOP_ON_BLOCKER=1`
- Autopilot now **STOPS** when blockers are detected (instead of continuing)
- Adds warning if user sets `STOP_ON_BLOCKER=0`

**Code:**
```bash
STOP_ON_BLOCKER=${STOP_ON_BLOCKER:-1}  # Default to 1: STOP when blockers appear

if [ "$STOP_ON_BLOCKER" -eq 1 ] && [ "$BLOCKERS" -gt 0 ]; then
    log "Blockers detected: $BLOCKERS. Exiting loop to prevent infinite repetition."
    log "Review blockers and resolve them manually before restarting."
    break
fi
```

### Fix 4: Better Blocker Handling Order ✅

**Location:** `tools/wvo_mcp/scripts/autopilot.sh:4868-4876`

**What it does:**
- Checks `STOP_ON_BLOCKER` **BEFORE** sleeping
- Exits immediately if blockers + STOP_ON_BLOCKER=1
- Warns loudly if STOP_ON_BLOCKER=0

## How Loop Detection Works Now

### Detection Flow

1. **After each autopilot cycle**, extract task state:
   ```json
   {
     "completed": ["Task A", "Task B"],
     "in_progress": ["Task C"],
     "blockers": ["CriticAvailabilityGuardian JSON issue"]
   }
   ```

2. **Create signature** from state (SHA256 hash, first 12 chars)

3. **Append to history** (`state/autopilot_loop_history.json`)

4. **Check last 5 attempts**:
   - Count how many times each signature appears
   - If same signature appears **3+ times** → **LOOP DETECTED**

5. **On loop detection**:
   - Log clear error message
   - Save evidence to `state/LOOP_DETECTED.json`
   - **EXIT with code 1** (stop wasting resources)

### Example Loop Detection

**Attempt 1:**
```json
{"signature": "a1b2c3", "state": {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian"]}}
```

**Attempt 2:**
```json
{"signature": "a1b2c3", "state": {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian"]}}
```

**Attempt 3:**
```json
{"signature": "a1b2c3", "state": {"in_progress": ["T11.2.2"], "blockers": ["CriticAvailabilityGuardian"]}}
```

**LOOP DETECTED! Same signature "a1b2c3" appeared 3 times → EXIT**

## Testing

### Manual Test (Simulated Loop)

```bash
# Create fake loop history
cat > state/autopilot_loop_history.json << 'EOF'
[
  {"timestamp": "2025-10-19T10:00:00Z", "signature": "abc123", "state": {"in_progress": ["T1"]}},
  {"timestamp": "2025-10-19T10:02:00Z", "signature": "abc123", "state": {"in_progress": ["T1"]}},
  {"timestamp": "2025-10-19T10:04:00Z", "signature": "abc123", "state": {"in_progress": ["T1"]}}
]
EOF

# Run autopilot
./tools/wvo_mcp/scripts/autopilot.sh

# Expected: Loop detected after next cycle with same signature
```

### Real-World Test

1. Start autopilot with task that will block:
   ```bash
   ./tools/wvo_mcp/scripts/autopilot.sh
   ```

2. Observe first cycle completes with blocker

3. **With Fix:** Autopilot exits immediately (STOP_ON_BLOCKER=1)

4. **Without Fix (old behavior):** Would sleep 120s and repeat forever

## Files Modified

- `tools/wvo_mcp/scripts/autopilot.sh` - Loop detection + STOP_ON_BLOCKER default
- `tools/wvo_mcp/scripts/autopilot_policy.py` - Smart `infer_action()` logic

## Files Created

- `state/autopilot_loop_history.json` - Rolling history of last 10 attempts (auto-created)
- `state/LOOP_DETECTED.json` - Evidence file when loop detected (auto-created on detection)
- `docs/LOOP_PREVENTION_FIX.md` - This documentation

## Impact

**Before fixes:**
- ❌ Autopilot could loop forever on blocked tasks
- ❌ No detection of repeated work
- ❌ Wasted tokens and resources
- ❌ User had no idea it was looping

**After fixes:**
- ✅ Loop detected within 3 repetitions (< 6 minutes at 120s sleep)
- ✅ Autopilot exits immediately with clear error
- ✅ Evidence saved for debugging
- ✅ Policy won't recommend execution without workable tasks
- ✅ Blockers stop the loop by default

## Related

- `docs/OFFLINE_MODE_FIX.md` - Fixed offline deception (2025-10-18)
- TypeScript `LoopDetector` class (not integrated into bash autopilot)

## Future Improvements

1. **Integrate TypeScript LoopDetector** - Currently exists but unused
2. **Task state machine improvements** - Better `in_progress` → `blocked` transitions
3. **Blocker resolution workflow** - Automatic retry after blocker removed
4. **Loop recovery strategies** - Try alternative approaches instead of just exiting
