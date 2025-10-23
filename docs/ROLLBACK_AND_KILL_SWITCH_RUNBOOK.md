# Rollback & Kill-Switch Runbook

## Overview

This runbook covers the automatic rollback monitoring system and manual kill-switch operations for WeatherVane's canary upgrade process. The system monitors worker health post-promotion and can automatically rollback or escalate to on-call engineers.

## Quick Reference

| Scenario | Trigger | Action | Owner |
|----------|---------|--------|-------|
| High error rates (>20% for 5 checks) | RollbackMonitor | Automatic rollback to previous worker | System |
| Consecutive health failures (≥2) | RollbackMonitor | Escalation + kill-switch activation | System |
| Manual emergency stop needed | On-call decision | Set `DISABLE_NEW=1` flag | On-call Engineer |
| Recovery after incident | Post-incident | Reset `DISABLE_NEW=0` flag | On-call Engineer |

---

## Part 1: Automatic Monitoring & Rollback

### How It Works

After a successful canary promotion:

1. **RollbackMonitor starts** automatically for 10 minutes (configurable)
2. **Health checks run every 30 seconds** (configurable):
   - Active worker health via RPC
   - Error rate from operations manager
   - Resource utilization (memory, file handles)
3. **Decision tree evaluates**:
   - **Healthy** (0-5% error rate, no failures) → Continue normal operation
   - **Degraded** (5-20% error rate, minor failures) → Increase monitoring frequency
   - **Escalate** (≥2 consecutive failures) → Trigger kill-switch + alert on-call
   - **Rollback** (>20% error rate for 5 consecutive checks) → Automatic rollback

### Automatic Rollback Trigger

**Condition**: Error rate > 20% AND failure count ≥ 3 in the recent check window

**Automatic Actions**:
1. Stop monitoring
2. Call `WorkerManager.switchToActive()` to restore previous worker
3. Record decision in audit trail
4. Emit `rollback-executed` event

**Evidence in Logs**:
```
[RollbackMonitor] CRITICAL: Executing automatic rollback
  reason: "High error rate (42.5%) with 5 failures"
  errorRate: 0.425
  failureCount: 5
```

**Post-Rollback**:
- Previous worker is restored
- Canary worker is disposed
- All flags reset to defaults (via `DISABLE_NEW` protection)
- New canary can be built and re-run upgrade

### Automatic Escalation Trigger

**Condition**: ≥2 consecutive health check failures

**Automatic Actions**:
1. Stop monitoring
2. Set `DISABLE_NEW=1` flag (activates kill-switch)
3. Record escalation decision
4. Emit `escalation-triggered` event with alerting context
5. Alert on-call engineer via telemetry exporter

**Why This Matters**: If RPC communication is broken, automatic rollback may not work. Kill-switch ensures system reverts to safe defaults even if orchestrator communication fails.

---

## Part 2: Kill-Switch (DISABLE_NEW Flag)

### What is DISABLE_NEW?

`DISABLE_NEW` is an emergency flag that reverts the system to legacy behavior:

```typescript
// In live_flags.ts
if (snapshot.DISABLE_NEW === '1') {
  // Revert ALL flags to defaults
  const disabledSnapshot: LiveFlagSnapshot = { ...DEFAULT_LIVE_FLAGS };
  this.cache = disabledSnapshot;
}
```

**Effect**: Restores all system behavior to pre-promotion state:
- `PROMPT_MODE` → `compact` (safe, lower token usage)
- `SANDBOX_MODE` → `none` (conservative execution)
- `RESEARCH_LAYER` → `1` (safety features enabled)
- `DISABLE_NEW` → `1` (kill-switch active)

### Automatic Activation

The system automatically sets `DISABLE_NEW=1` when:
1. Escalation threshold is triggered (≥2 consecutive failures)
2. Critical resource exhaustion detected
3. Worker process terminates unexpectedly

### Manual Activation

**When to activate manually**:
- Customer reports degraded service behavior
- Unusual error patterns in logs
- Unexpected resource usage spikes
- Internal tests detect anomalies post-promotion

**How to activate**:

```bash
# Via MCP tool (preferred)
claude mcp call mcp_admin_flags set \
  --flags '{"DISABLE_NEW": "1"}'

# Or direct SQLite (if MCP unavailable)
sqlite3 state/orchestrator.db \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('DISABLE_NEW', '1')"
```

**Verify activation**:
```bash
# Check flag status
sqlite3 state/orchestrator.db "SELECT * FROM settings WHERE key='DISABLE_NEW'"
# Expected: DISABLE_NEW | 1

# Verify in logs
tail -f .codex/sessions/*/messages.log | grep "DISABLE_NEW"
# Expected: "Flag update: DISABLE_NEW=1"
```

### Resetting After Incident

**Prerequisites**:
1. Root cause identified and documented
2. Fix verified in staging environment
3. Post-incident review completed
4. Approval from senior engineer or Director Dana

**Reset Procedure**:

```bash
# Step 1: Alert on-call team
echo "Resetting DISABLE_NEW flag - calling reset_kill_switch endpoint"

# Step 2: Reset the flag (via MCP)
claude mcp call mcp_admin_flags set \
  --flags '{"DISABLE_NEW": "0"}'

# Step 3: Verify reset
sqlite3 state/orchestrator.db "SELECT * FROM settings WHERE key='DISABLE_NEW'"
# Expected: DISABLE_NEW | 0

# Step 4: Confirm system responds
# Check that new features re-enable
# Verify flag polling updated workers

# Step 5: Document reset
echo "Reset at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> state/analytics/kill_switch_audit.log
```

**Manual Reset via RollbackMonitor API**:
```typescript
// In on-call script or orchestrator
await rollbackMonitor.resetKillSwitch();
// Emits: kill-switch-reset event
// Updates: DISABLE_NEW=0 in SQLite
```

---

## Part 3: Incident Response

### Detecting Issues Post-Promotion

**Automatic Detection**:
- Monitoring dashboard alerts (if configured)
- RollbackMonitor emits `rollback-executed` or `escalation-triggered`
- Telemetry exporter captures `rollback_executed` or `escalation_triggered` events

**Manual Detection**:
```bash
# Check recent worker manager snapshot
cat state/analytics/worker_manager.json | jq '.status, .notes'

# Check error rates
cat state/analytics/orchestration_metrics.json | jq '.validation'

# Monitor real-time
tail -f .codex/sessions/*/messages.log | grep -i "error\|critical"
```

### Step 1: Immediate Response (First 5 Minutes)

```bash
# 1. Check current state
echo "=== CURRENT STATE ==="
cat state/analytics/worker_manager.json | jq '.'
cat state/analytics/orchestration_metrics.json | jq '.validation'

# 2. Verify rollback or escalation occurred
echo "=== ROLLBACK/ESCALATION STATUS ==="
sqlite3 state/orchestrator.db "SELECT * FROM settings WHERE key='DISABLE_NEW'"

# 3. If not already activated, trigger kill-switch
if [ "$(sqlite3 state/orchestrator.db "SELECT value FROM settings WHERE key='DISABLE_NEW'")" != "1" ]; then
  echo "Activating kill-switch..."
  sqlite3 state/orchestrator.db "INSERT OR REPLACE INTO settings (key, value) VALUES ('DISABLE_NEW', '1')"
fi

# 4. Verify all workers are responsive
curl -s http://localhost:3000/health || echo "API unresponsive"
```

### Step 2: Gather Evidence (5-30 Minutes)

```bash
# Collect relevant logs and metrics
mkdir -p /tmp/incident-$(date +%Y%m%d-%H%M%S)
cd /tmp/incident-*/

# Worker state
cat ~/Documents/WeatherVane/state/analytics/worker_manager.json > worker_state.json

# Recent metrics
cat ~/Documents/WeatherVane/state/analytics/orchestration_metrics.json > metrics.json

# Rollback decisions (if recorded)
grep -i "rollback\|escalation" ~/Documents/WeatherVane/.codex/sessions/*/messages.log > rollback_logs.txt 2>/dev/null || echo "No rollback logs"

# Error logs from recent period
tail -1000 ~/Documents/WeatherVane/.codex/sessions/*/messages.log | grep -i "error\|critical" > errors.txt

# Flag state
sqlite3 ~/Documents/WeatherVane/state/orchestrator.db \
  "SELECT key, value FROM settings WHERE key IN ('DISABLE_NEW', 'PROMPT_MODE', 'SANDBOX_MODE')" \
  > flags.txt

echo "Evidence collected in $(pwd)"
```

### Step 3: Communication

```bash
# Notify team
slack send @#oncall "🚨 Incident Alert: Post-promotion degradation detected. DISABLE_NEW=1 activated. Investigating root cause. See: /tmp/incident-TIMESTAMP"

# Create incident document
cat > incident_$(date +%Y%m%d-%H%M%S).md <<EOF
# Incident Report

**Time**: $(date -u)
**Status**: Active

## Symptoms
- [Describe observed behavior]
- Error rate: [from worker_state.json]
- Affected service: [API/Orchestrator/Both]

## Evidence
- Worker state: See worker_state.json
- Metrics: See metrics.json
- Errors: See errors.txt

## Actions Taken
- Kill-switch activated: DISABLE_NEW=1
- [Rollback executed automatically] or [Escalation triggered]

## Next Steps
1. Root cause analysis
2. Fix and validation in staging
3. Reset kill-switch after approval
4. Retro document

## Assigned To
- Investigation: [Your name]
- Approval: Director Dana
EOF
```

### Step 4: Root Cause Analysis

**Common Causes**:

| Issue | Evidence | Fix |
|-------|----------|-----|
| Memory leak in new worker | `memoryUsageMb > 1024` in checks | Restart worker, check heap dumps |
| RPC communication broken | `health check failed` in logs | Verify network, restart MCP |
| Feature regression | Error logs mentioning specific feature | Revert feature flag in code |
| Dependency issue | `Cannot find module` errors | Check package.json changes |
| Database corruption | SQLite errors in logs | Restore from backup, re-init state |

**Investigation Queries**:

```bash
# Check for OOM errors
grep -i "out of memory\|memory\|heap" logs.txt

# Check for import/require issues
grep -i "cannot find\|no such file\|import" logs.txt

# Check for database issues
grep -i "sqlite\|database\|constraint" logs.txt

# Find first error after promotion
tail -r logs.txt | grep -m1 "error" | head -1
```

### Step 5: Fix & Validation

**In Staging**:
```bash
# 1. Identify problematic code
git log --oneline | head -5
# Find the commit that introduced the issue

# 2. Revert or fix
git revert <commit> OR git fix <commit>

# 3. Re-run upgrade process
npm run build
npm run test
./tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs --skip-promote

# 4. Validate shadow matches active
# Review experiments/mcp/upgrade/*/shadow.json for diffs
```

### Step 6: Reset Kill-Switch (Only After Fix Deployed)

```bash
# Prerequisites
# - Fix committed and deployed to main
# - Canary rebuilt and shadow validation passed
# - Post-incident review completed
# - Senior approval obtained

# 1. Verify fix is in place
git log --oneline | grep "<fix description>"

# 2. Reset kill-switch
sqlite3 state/orchestrator.db \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('DISABLE_NEW', '0')"

# 3. Verify reset
sqlite3 state/orchestrator.db "SELECT value FROM settings WHERE key='DISABLE_NEW'"
# Expected: 0

# 4. Document in incident file
echo "Kill-switch reset at $(date -u) after fix deployment" >> incident_*.md

# 5. Close incident
slack send @#oncall "✅ Incident resolved. Kill-switch reset. See incident_TIMESTAMP.md for details."
```

---

## Part 4: Configuration & Thresholds

### RollbackMonitor Tuning

In `orchestrator_runtime.ts` or upgrade initialization:

```typescript
const monitor = new RollbackMonitor({
  // Time between health checks (ms)
  checkIntervalMs: 30_000,          // 30 seconds

  // How long to monitor after promotion (ms)
  postPromotionGracePeriodMs: 600_000,  // 10 minutes

  // Threshold for rollback (0-1.0)
  errorRateThreshold: 0.2,          // 20%

  // Consecutive failures before escalation
  consecutiveFailureThreshold: 2,    // 2+ consecutive failures

  // Number of recent checks to consider
  checkWindowSize: 5,               // Last 5 checks
});
```

### Recommended Thresholds

| Environment | Error Rate | Grace Period | Escalation |
|-------------|-----------|--------------|-----------|
| **Production** | 15% | 15 minutes | 1 failure |
| **Staging** | 25% | 5 minutes | 2 failures |
| **Development** | 50% | 2 minutes | 3 failures |

### Adjusting Thresholds

```bash
# Via flags
sqlite3 state/orchestrator.db \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('ROLLBACK_ERROR_THRESHOLD', '0.15')"

# Via environment
export WVO_ROLLBACK_ERROR_THRESHOLD=0.15
export WVO_ROLLBACK_GRACE_PERIOD_MS=900000  # 15 minutes
```

---

## Part 5: Testing & Validation

### Verify Monitoring is Active

```bash
# Check state after promotion
cat state/analytics/worker_manager.json | jq '.events | map(select(.type == "switch")) | last'
# Should show recent promotion

# Check monitoring started
tail -50 .codex/sessions/*/messages.log | grep "monitoring"
# Expected: "Starting post-promotion health monitoring"
```

### Simulate Escalation (Staging Only)

```bash
# Inject high error rate
sqlite3 state/orchestrator.db <<EOF
INSERT INTO operations_snapshots (error_rate, failure_count, recorded_at)
VALUES (0.5, 10, datetime('now'));
EOF

# Wait for health check cycle
sleep 35

# Verify escalation triggered
grep -i "escalation" .codex/sessions/*/messages.log
# Expected: "Escalation: Setting kill-switch"
```

### Verify Kill-Switch Effect

```bash
# Activate kill-switch
sqlite3 state/orchestrator.db \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('DISABLE_NEW', '1')"

# Verify all flags reverted
sqlite3 state/orchestrator.db "SELECT key, value FROM settings ORDER BY key"
# CONSENSUS_ENGINE should be 1 (default)
# DISABLE_NEW should be 1
# Others should match defaults

# Restart orchestrator and verify it uses defaults
pkill -f "orchestrator"
sleep 2
npm run dev  # or equivalent

# Check logs for "Flag DISABLE_NEW=1, reverting to safe defaults"
```

---

## Part 6: Troubleshooting

### Kill-Switch Not Activating

**Check flag write**:
```bash
# Verify SQLite write succeeded
sqlite3 state/orchestrator.db "SELECT COUNT(*) FROM settings WHERE key='DISABLE_NEW' AND value='1'"
# Should be 1

# Check for write lock
lsof state/orchestrator.db | grep LOCK

# Try direct update if insert failed
sqlite3 state/orchestrator.db "UPDATE settings SET value='1' WHERE key='DISABLE_NEW'"
```

**Check flag polling**:
```bash
# Verify live flags are polling
grep -i "live.*flag\|flag.*poll" .codex/sessions/*/messages.log
# Should show polling events every 500ms

# If not polling, check LiveFlags initialization
grep -i "liveflags.*init\|live.*start" .codex/sessions/*/messages.log
```

### Rollback Not Executing

**Check worker manager state**:
```bash
# Verify active worker exists
cat state/analytics/worker_manager.json | jq '.active'
# Should have non-null pid

# Check switchToActive availability
grep -i "switchtoactiive\|switch.*active" .codex/sessions/*/messages.log
```

**Manual fallback**:
```bash
# If automatic rollback fails, manually switch
cat > /tmp/manual_rollback.mjs <<EOF
import { WorkerManager } from "./dist/worker/worker_manager.js";
const mgr = new WorkerManager();
const result = await mgr.switchToActive();
console.log("Rollback result:", result);
EOF

node /tmp/manual_rollback.mjs
```

### Incident Re-occurs After Reset

**Don't reset yet** – analyze further:
```bash
# Check if fix actually deployed
git log --oneline | head -5
git diff HEAD~1

# Re-test in staging with full upgrade cycle
./tools/wvo_mcp/scripts/mcp_safe_upgrade.mjs --skip-promote

# If shadow validation fails, revert and try different fix
```

---

## Part 7: Audit & Compliance

### Rollback Decision Audit Trail

All rollback decisions are recorded with:
- **timestamp**: When decision was made
- **decision**: `healthy | degrade | escalate | rollback`
- **reason**: Human-readable explanation
- **errorRate**: Actual error rate detected
- **failureCount**: Number of failures in window
- **evidence**: Recent checks, failure pattern, threshold

**Location**: `state/analytics/rollback_audit.jsonl` (append-only)

**Query example**:
```bash
# Find all rollbacks in last 24 hours
jq 'select(.decision == "rollback" and (.timestamp | fromdate) > (now - 86400))' \
  state/analytics/rollback_audit.jsonl

# Find all escalations
jq 'select(.decision == "escalate")' state/analytics/rollback_audit.jsonl
```

### Kill-Switch Activation Audit

**Location**: `state/analytics/kill_switch_audit.log`

Format:
```
2025-10-22T14:32:15Z ACTIVATED reason="Escalation: 2+ consecutive failures" actor="system"
2025-10-22T14:33:22Z RESET reason="Fix deployed and validated" actor="on-call-engineer" approver="director_dana"
```

---

## Checklists

### Post-Promotion Checklist

- [ ] Monitoring started automatically (check logs)
- [ ] Health checks running every 30 seconds
- [ ] No errors in first 5 minutes
- [ ] Error rate stable below 5%
- [ ] Resource usage normal (<512 MB)
- [ ] At 10 minutes: monitoring stops automatically
- [ ] Review upgrade artifacts for evidence

### Incident Response Checklist

- [ ] Incident detected (automatic or manual)
- [ ] Kill-switch activated (DISABLE_NEW=1)
- [ ] Evidence collected (/tmp/incident-*)
- [ ] Team notified via Slack
- [ ] Root cause identified
- [ ] Fix prepared in staging
- [ ] Shadow validation passes
- [ ] Fix deployed to main
- [ ] Kill-switch reset (DISABLE_NEW=0)
- [ ] Incident report written
- [ ] Post-mortem scheduled

### Kill-Switch Reset Checklist

- [ ] Fix is deployed and verified on main
- [ ] Post-incident review is documented
- [ ] Senior engineer or Director Dana approved reset
- [ ] No new errors in last 15 minutes
- [ ] Reset command executed successfully
- [ ] Flag status verified in SQLite
- [ ] Orchestrator logs confirm DISABLE_NEW=0
- [ ] New features confirmed working
- [ ] Team notified of reset

---

## References

- **RollbackMonitor API**: `tools/wvo_mcp/src/orchestrator/rollback_monitor.ts`
- **Live Flags System**: `tools/wvo_mcp/src/state/live_flags.ts`
- **Worker Manager**: `tools/wvo_mcp/src/worker/worker_manager.ts`
- **Canary Upgrade Flow**: `docs/CANARY_UPGRADE_FLOW.md`
- **Health Check Critic**: `tools/wvo_mcp/src/critics/health_check.ts`

---

**Last Updated**: 2025-10-22
**Maintained By**: Atlas (Autopilot Lead)
**On-Call Escalation**: Director Dana
