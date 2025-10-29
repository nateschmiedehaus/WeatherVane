# IMP-FUND-09: Pre-Feature Monitoring Period Setup - STRATEGIZE

## Problem Statement

**Critical Gap**: Phase 1 (Prompting improvements) is BLOCKED by 1-2 week monitoring baseline period, but no monitoring is actually running.

**Impact**:
- Cannot proceed to Phase 1 until baseline established
- No visibility into phase skips, backtracks, process violations
- Cannot measure impact of Phase 1 changes without baseline

**Discovery**:
- Improvement plan marks IMP-FUND-09 as COMPLETE
- But monitoring script doesn't exist
- No snapshots have been captured
- Baseline period hasn't started

## Current State

**What Exists**:
- `.github/workflows/process-monitoring.yml` (workflow file)
- Improvement plan documentation claiming completion
- Various analytics files in state/analytics/

**What's Missing**:
- `scripts/create_process_snapshot.sh` script
- Initial baseline snapshot
- state/analytics/process_monitoring/ directory
- Actual monitoring data

## Objectives

1. Create monitoring script that captures baseline metrics
2. Capture initial snapshot with clean baseline
3. Enable daily automatic snapshots via CI
4. Begin 1-2 week baseline collection period
5. Unblock Phase 1 by providing gate data

## Strategy: Minimal Viable Monitoring

Create lightweight shell script that:
- Reads phase_ledger.jsonl for violations/skips/backtracks
- Counts completed tasks from evidence/
- Outputs JSON to state/analytics/process_monitoring/
- Runs daily via GitHub Actions

**Why**: Fast (< 1 hour), reliable (no deps), sufficient for gate decision

## Risks & Mitigations

1. **Metrics don't match reality** → Cross-validate against known state
2. **Monitoring fails silently** → CI fails on error, manual verify first run
3. **Baseline never starts** → THIS TASK fixes it
4. **Script becomes stale** → Version field, clear errors

## Timeline

- Full work process: ~2 hours
- Baseline period: 1-2 weeks after deployment
- Blocks: ALL Phase 1 work (IMP-21 through IMP-37)

