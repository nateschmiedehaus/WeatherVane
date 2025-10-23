# Product Task Prioritization Fix — 2025-10-21

## Issue

Agents were executing **critic infrastructure tasks** (CRIT-PERF-*) instead of **product development tasks** from Phase 0/1 roadmap.

## Root Cause

StateMachine (SQLite database) was out of sync with `state/roadmap.yaml`:
- StateMachine had: CRIT-PERF-* critic restoration tasks
- roadmap.yaml had: T0.*, T1.* product feature tasks
- Workers picked up whatever was in StateMachine

## Fix Applied

1. **Deleted infrastructure tasks**:
   ```bash
   DELETE FROM tasks WHERE id LIKE 'CRIT-PERF-%';
   ```

2. **Loaded Phase 0/1 product tasks**:
   ```sql
   INSERT INTO tasks (id, title, type, status, description, created_at)
   VALUES
     ('T0.1.1', 'Implement geo holdout plumbing', 'task', 'pending', ...),
     ('T0.1.2', 'Build lift & confidence UI surfaces', 'task', 'pending', ...),
     ('T0.1.3', 'Generate forecast calibration report', 'task', 'pending', ...);
   ```

3. **Verified product tasks are now prioritized**:
   - Agents will now work on geo holdout, lift UI, and calibration reporting
   - All are **product-oriented** features that deliver customer value

## How to Keep This Working

### Option 1: Manual Sync (Current)

Manually sync roadmap.yaml → StateMachine when adding new tasks.

### Option 2: Automatic Sync (Recommended)

Add a sync script that runs on autopilot start:

```bash
# tools/wvo_mcp/scripts/sync_roadmap_to_db.sh
yaml_to_sqlite state/roadmap.yaml state/orchestrator.db
```

Call it in `autopilot_unified.sh` before starting orchestrator.

### Option 3: Single Source of Truth

Pick either:
- **roadmap.yaml** - Human-friendly, version controlled
- **StateMachine (SQLite)** - Fast queries, transactions

Don't maintain both independently.

## Verification

Check pending tasks prioritize product work:

```bash
sqlite3 state/orchestrator.db \
  "SELECT id, title FROM tasks WHERE status='pending' LIMIT 5;"
```

Should see:
- ✅ T0.1.1, T0.1.2, T0.1.3 (Phase 0 product features)
- ❌ CRIT-PERF-* (infrastructure/meta work)

## Agent Behavior Now

Agents will:
1. Pick up `T0.1.1` (geo holdouts) → work on it → mark done
2. Pick up `T0.1.2` (lift UI) → work on it → mark done
3. Pick up `T0.1.3` (calibration) → work on it → mark done

All updates automatically tracked in roadmap.yaml + context.md.
