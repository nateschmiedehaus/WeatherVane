# Plan: Complete 3-Layer Proof System Deployment

**Task ID:** AFP-PROOF-SYSTEM-COMPLETE-DEPLOYMENT-20251106
**Phase:** PLAN
**Date:** 2025-11-06

## Scope

Add unit tests, implement all 3 layers, and deploy to Wave 0.

## Implementation Plan

### 1. Unit Tests (~500 LOC)
- `prove/phase_manager.test.ts` - Test phase creation, completion, progress calculation
- `prove/proof_system.test.ts` - Test proof execution, criteria parsing
- `prove/discovery_reframer.test.ts` - Test language transformation
- `prove/achievement_system.test.ts` - Test stat tracking, achievement unlocking

### 2. Layer 2: Multi-Critic Validation (~200 LOC)
- Enhance DesignReviewer to validate proof criteria quality
- Check for comprehensive criteria (≥3 different types)
- Ensure realistic test scenarios

### 3. Layer 3: Production Feedback (~150 LOC)
- `prove/production_feedback.ts` - Track "false proven" tasks
- Record production failures
- Link back to original task

### 4. Wave 0 Integration (~100 LOC)
- Modify `wave0/runner.ts` to use ProofIntegration
- Add proof system to execution flow
- Enable by default

### 5. Deployment & Testing
- Build and verify
- Restart Wave 0
- Add test tasks
- Monitor execution

**Total Estimate:** ~950 LOC + integration + testing

## Proof Criteria (Designed BEFORE Implementation)

### Build Verification
```bash
cd /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/tools/wvo_mcp
npm run build
# Expected: 0 errors in new code
```

### Live Wave 0 Integration Tests

**Test 1: Wave 0 Starts with Proof System**
```bash
# Kill existing Wave 0
ps aux | grep wave0 | grep -v grep | awk '{print $2}' | xargs kill -9

# Start Wave 0 with proof system
cd /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/tools/wvo_mcp
npm run wave0 &

# Monitor startup
tail -f ../../state/analytics/wave0_startup.log
```
**Expected:** Wave 0 starts, proof system initializes, no errors

**Test 2: Task Execution with Proof**
```bash
# Add test task to roadmap (will do manually)
# Create test task with plan.md including proof criteria

# Monitor execution
tail -f state/analytics/wave0_startup.log

# Check for:
# - Task execution
# - Proof attempt
# - verify.md generation
```
**Expected:** Task completes, verify.md created, status = "done" (proven)

**Test 3: Discovery Phase (Failing Proof)**
```bash
# Create task with proof criteria that will fail
# (e.g., expect specific file that doesn't exist)

# Monitor Wave 0
# Expected: Discovery complete message
# Expected: Improvement phases generated
# Expected: Status = "blocked" (discovering)
```

**Test 4: Achievement Unlocking**
```bash
# Complete 3+ tasks with iterations

# Check stats
cat state/analytics/agent_stats.json

# Expected: Achievement unlocked (Thorough Tester or similar)
```

**Test 5: Production Feedback**
```bash
# Manually trigger production feedback for a task

# Expected: FALSE_PROVEN.md created
# Expected: production_failures.jsonl updated
```

**Test 6: Self-Improvement (New Requirement)**
```bash
# Let Wave 0 run for full cycle (complete all tasks)

# Expected: Self-improvement tasks auto-created
# Expected: Revisits old work at reasonable cadence
# Expected: No infinite loops
```

### Success Criteria (All Must Pass)

- ✅ Build: 0 errors in new code
- ⏳ Live Test 1: Wave 0 starts with proof system
- ⏳ Live Test 2: Task completes with verify.md
- ⏳ Live Test 3: Discovery phase works
- ⏳ Live Test 4: Achievement unlocks
- ⏳ Live Test 5: Production feedback works
- ⏳ Live Test 6: Self-improvement creates tasks

Let's implement and validate.
