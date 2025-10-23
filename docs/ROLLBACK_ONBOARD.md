# On-Call Rollback Runbook

**Document**: ROLLBACK_ONBOARD.md
**Updated**: 2025-10-23
**Target Audience**: On-Call Engineers, SREs, Support

---

## Overview

WeatherVane implements **automatic health monitoring** that triggers automatic rollback when error rates spike after worker promotion. This runbook guides you through understanding, responding to, and recovering from rollback events.

### Key Features
- **Automatic Health Checks**: Every 30 seconds post-promotion
- **Error Rate Tracking**: 20% threshold over 5 consecutive checks
- **Automatic Rollback**: Triggers when thresholds exceeded
- **Kill-Switch Reset**: Manual recovery after issue resolution
- **Full Audit Trail**: All decisions logged for forensics

---

## When Rollback Is Triggered

The `RollbackMonitor` automatically executes rollback in these scenarios:

### Scenario 1: High Error Rate (Automatic Rollback)
**Trigger Condition**: `errorRate > 20%` for `3+ failures` in the last 5 checks
**Action**: Automatically reverts to previous worker
**Recovery Time**: <5 seconds

**Log Example**:
```json
{
  "level": "error",
  "message": "CRITICAL: Executing automatic rollback",
  "component": "RollbackMonitor",
  "reason": "High error rate (45.2%) with 4 failures",
  "errorRate": 0.452
}
```

### Scenario 2: Consecutive Failures (Escalation + Kill-Switch)
**Trigger Condition**: `2+ consecutive health check failures`
**Action**: Trigger kill-switch (`DISABLE_NEW=1`), escalate to on-call
**Recovery Time**: Requires manual intervention (see "Reset Kill-Switch" below)

**Log Example**:
```json
{
  "level": "error",
  "message": "ESCALATION: Setting kill-switch and alerting on-call",
  "component": "RollbackMonitor",
  "reason": "2+ consecutive health check failures detected"
}
```

### Scenario 3: Resource Exhaustion (Degradation)
**Trigger Condition**: Memory usage >1GB, file handles exhausted
**Action**: Increase monitoring frequency, wait for manual review
**Recovery Time**: Depends on issue severity

---

## Health Check Metrics

The monitor tracks these key metrics **every 30 seconds**:

| Metric | Threshold | Action |
|--------|-----------|--------|
| **Error Rate** | >20% | Degrade (1 failure), Rollback (3+ failures) |
| **Consecutive Failures** | 2+ | Escalate + Kill-Switch |
| **Memory Usage** | >1024 MB | Degrade |
| **Uptime** | Any | Informational only |

---

## On-Call Response Flowchart

```
Rollback Triggered
        ↓
   Check Logs
        ↓
   Is it automated rollback?
   (error rate spike)
        ├─→ YES: Monitor stability for 5 min
        │         → If stable: Resume normal ops
        │         → If continues: Investigate root cause
        │
        └─→ NO: Is kill-switch active?
                (DISABLE_NEW=1)
                ├─→ YES: Investigate + Fix → Reset (below)
                └─→ NO: Check if escalation in progress

   Root Cause Identified?
        ├─→ YES: Fix issue → Reset kill-switch
        └─→ NO: Escalate to engineering team
```

---

## Step-By-Step Recovery Guide

### 1. Confirm Rollback Status

```bash
# Check MCP logs for rollback events
tail -100 /tmp/wvo_mcp.log | grep -i "rollback\|escalation"

# Expected output:
# {"level":"error","message":"CRITICAL: Executing automatic rollback"...}
# {"level":"error","message":"ESCALATION: Setting kill-switch"...}
```

### 2. Assess Worker Status

```bash
# Check active worker and recent errors
curl -s http://localhost:3000/api/ops/worker-status | jq .

# Expected response:
{
  "activeWorker": {
    "pid": 12345,
    "uptime": 120000,
    "status": "running"
  },
  "previousWorker": {
    "pid": 12344,
    "uptime": 90000,
    "status": "standby"
  },
  "recentErrors": 0,
  "lastRollback": "2025-10-23T00:35:35.969Z"
}
```

### 3. Check Kill-Switch Status

```bash
# Query feature flags to see if kill-switch is active
curl -s -X POST http://localhost:3000/api/admin/flags/get \
  -H "Content-Type: application/json" \
  -d '{"flag": "DISABLE_NEW"}' | jq .

# Expected: value: "1" (active) or "0" (inactive)
```

### 4. Investigate Root Cause

Check these in order:

**A. Recent Deployments**
```bash
git log --oneline -5
# Identify any recent changes that might have introduced issues
```

**B. Resource Constraints**
```bash
# Check memory and CPU
top -n1 | grep node
ps aux | grep worker

# Check disk space
df -h | head -5
```

**C. Network/RPC Issues**
```bash
# Test RPC connectivity to workers
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "health", "params": {}}' | jq .

# Should return: {"ok": true, "uptime": ...}
```

**D. External Dependencies**
```bash
# Check API availability (if applicable)
curl -I https://api.example.com/health

# Check database connectivity
sqlite3 state/orchestrator.db "SELECT COUNT(*) FROM tasks;"
```

### 5. Identify Issue

Based on logs, narrow down to one of:

| Issue | Symptoms | Fix |
|-------|----------|-----|
| **Bad Deployment** | Errors started after recent commit | Revert commit, rebuild, redeploy |
| **Resource Leak** | Increasing memory usage over time | Restart worker, investigate memleak |
| **RPC Timeout** | "RPC timeout" in logs repeatedly | Check network, firewall, ports |
| **Dependency Failure** | External API errors | Wait for dependency recovery or failover |
| **Configuration Error** | Wrong flags/env vars | Update config, restart |

### 6. Fix the Issue

Once root cause identified:

```bash
# Example: Revert bad deployment
git revert HEAD
npm run build
npm test

# Deploy fixed version
# (follow your deployment process)
```

### 7. Reset Kill-Switch

**Only after issue is resolved** and new code is deployed:

```bash
# Option A: Via MCP admin flag tool
curl -X POST http://localhost:3000/api/admin/flags/set \
  -H "Content-Type: application/json" \
  -d '{"flag": "DISABLE_NEW", "value": "0"}' | jq .

# Expected: {"success": true, "flag": "DISABLE_NEW", "value": "0"}

# Option B: Via CLI (if available)
mcp_admin_flags --action set --flag DISABLE_NEW --value 0
```

### 8. Monitor Stability

After reset, monitor for **10 minutes**:

```bash
# Watch logs in real-time
tail -f /tmp/wvo_mcp.log | grep -E "health|error|rollback"

# Check health dashboard
open http://localhost:3000/api/ops/health-dashboard

# Verify error rate is <5%
curl -s http://localhost:3000/api/ops/metrics | jq .errorRate
```

---

## Understanding Kill-Switch

### What is DISABLE_NEW?

`DISABLE_NEW=1` (kill-switch active):
- Disables all new features and optimizations
- Reverts to legacy behavior
- Forces use of older, proven code paths
- Acts as "emergency brake" for system stability

`DISABLE_NEW=0` (normal operation):
- New features enabled
- Optimizations active
- Current code paths in use

### When to Use Kill-Switch

| Situation | Action |
|-----------|--------|
| **Unknown critical issue** | Keep active (`=1`) until root cause found |
| **Production fire** | Activate (`=1`) immediately for stability |
| **Issue resolved** | Deactivate (`=0`) after fix deployed and verified |
| **Cascading failures** | Keep active, escalate to engineering |

### Resetting Kill-Switch

**Prerequisites**:
- [ ] Root cause identified and documented
- [ ] Fix deployed and tested in staging
- [ ] New code passes CI/CD checks
- [ ] Health metrics normal (<5% error rate)

**Steps**:

```bash
# 1. Verify fix is in place
git log --oneline -1  # Should show fix commit

# 2. Check current flag status
curl http://localhost:3000/api/admin/flags/get?flag=DISABLE_NEW | jq .

# 3. Reset kill-switch
curl -X POST http://localhost:3000/api/admin/flags/set \
  -d '{"flag": "DISABLE_NEW", "value": "0"}' | jq .

# 4. Confirm reset
curl http://localhost:3000/api/admin/flags/get?flag=DISABLE_NEW | jq .
# Expected: value: "0"

# 5. Monitor for 10 minutes
tail -f /tmp/wvo_mcp.log
```

---

## Monitoring Dashboard

Access real-time health status:

```bash
# Web UI (if available)
open http://localhost:3000/ops/health

# API endpoint
curl http://localhost:3000/api/ops/health-summary | jq .

# Expected output:
{
  "monitoringActive": true,
  "lastHealthCheck": "2025-10-23T00:35:37.275Z",
  "errorRate": 0.02,
  "lastDecision": {
    "decision": "healthy",
    "reason": "All health checks passing",
    "errorRate": 0.02
  },
  "recentChecks": [
    { "timestamp": "...", "ok": true, "errorRate": 0.01 },
    { "timestamp": "...", "ok": true, "errorRate": 0.02 }
  ]
}
```

---

## Escalation Checklist

If you cannot resolve within **15 minutes**, escalate:

- [ ] Document all findings in incident tracking system
- [ ] Attach logs and metrics snapshots
- [ ] Create GitHub issue with:
  - [ ] Timestamp of rollback
  - [ ] Error logs (last 100 lines)
  - [ ] Resource metrics
  - [ ] Recent commits
  - [ ] Attempted fixes
- [ ] Notify engineering team
- [ ] Keep system in safe state (kill-switch active) until resolved

---

## Common Scenarios

### Scenario A: Bad Code Deployment

**Symptoms**: Rollback happened immediately after deployment

**Resolution**:
```bash
git revert HEAD
npm run build && npm test
# Deploy fix
# Reset kill-switch
```

### Scenario B: Memory Leak

**Symptoms**: Gradual memory increase over hours, then rollback

**Resolution**:
```bash
# Check memory trend
curl http://localhost:3000/api/metrics/memory | jq .

# If confirmed leak:
# 1. Document issue
# 2. Restart worker (will clear memory)
# 3. Fix leak in code
# 4. Redeploy
```

### Scenario C: Intermittent External API Failure

**Symptoms**: Occasional health check failures, then recovery

**Resolution**:
```bash
# Monitor dependency health
curl https://dependency-status.example.com/status | jq .

# If dependency issue:
# - Wait for dependency recovery
# - No code fix needed
# - Kill-switch will auto-reset when dependency recovers

# If not resolving:
# - Implement failover/retry logic
# - Deploy fix
# - Reset kill-switch
```

### Scenario D: Cascading Failures

**Symptoms**: Rollback, then rollback again immediately

**Resolution**:
```bash
# 1. Keep kill-switch ACTIVE
kill-switch = "1"

# 2. Escalate immediately - this is critical

# 3. DO NOT attempt reset until issue fully understood
# 4. Wait for engineering team
```

---

## Useful Commands Reference

```bash
# View rollback monitor state
curl http://localhost:3000/api/ops/rollback-monitor/state | jq .

# Get recent health checks
curl http://localhost:3000/api/ops/health-checks/recent | jq .

# Check feature flag status
curl http://localhost:3000/api/admin/flags/all | jq .

# Stop monitoring (emergency only)
curl -X POST http://localhost:3000/api/ops/stop-monitoring | jq .

# View worker manager status
curl http://localhost:3000/api/ops/worker-manager/status | jq .

# Check audit log
tail -50 /tmp/rollback_audit.log | jq .
```

---

## Prevention

To prevent rollbacks in the future:

1. **Pre-Deployment Checks**:
   - Run full test suite: `npm test`
   - Check for security issues: `npm audit`
   - Validate TypeScript: `npm run build`

2. **Canary Deployment**:
   - Deploy to 1-2 instances first
   - Monitor for 10 minutes
   - Promote to full fleet if healthy

3. **Feature Gating**:
   - New features behind feature flags
   - Enable gradually via SCHEDULER_MODE, PROMPT_MODE, etc.
   - Monitor metrics before full rollout

4. **Load Testing**:
   - Test new code with production-like load
   - Identify resource constraints early
   - Fix before production deployment

---

## Support & Escalation

**Questions?** Contact:
- **Engineering Team**: Slack #weathervane-sre
- **Director Dana**: For policy/leadership decisions
- **Atlas**: For implementation details

**Urgent Issues?** Page on-call engineer:
PagerDuty service: WeatherVane Production

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2025-10-23 | Claude (Worker Agent) | Initial creation with full procedures |

---

**Last Updated**: 2025-10-23T00:35:00Z
**Next Review**: 2025-11-22
