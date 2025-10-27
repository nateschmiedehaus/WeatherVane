# Phase 8: LEAN Scope (Essential Production Readiness Only)

## Philosophy: Ship Essential, Defer Optimization

**Question**: What's the MINIMUM needed to safely deploy autopilot to production?

**Answer**: Observability + Alerting + Reliability. NOT scale optimization.

---

## LEAN Phase 8: 4 Essential Components

### AC1: Basic Observability Dashboard (Essential) ✅

**Goal**: See what autopilot is doing in real-time

**Essential Features**:
- [ ] Task status dashboard (how many tasks in each state)
- [ ] Quality gate decisions (approval/rejection rates)
- [ ] Recent activity log (last 50 tasks)
- [ ] Resource usage (token counts, rough cost estimates)

**NOT Essential** (defer):
- ❌ Advanced charts (burndown, velocity, forecasting) → Phase 9
- ❌ Real-time WebSocket updates → Use polling (5s refresh)
- ❌ Export/download features → Phase 9
- ❌ Drill-down/filtering → Phase 9

**Estimated Effort**: 8-10 hours (vs 15-20h for full version)

**MVP Implementation**:
```typescript
// Simple Express endpoint serving JSON
GET /api/status → {
  tasks_by_state: { spec: 2, implement: 5, done: 120 },
  quality_gates: { approved: 95, rejected: 5 },
  recent_tasks: [...last 50 tasks],
  token_usage: { total: 150000, cost_estimate: "$3.00" }
}

// Simple React dashboard with basic charts
<Dashboard>
  <TasksPieChart data={tasksByState} />
  <QualityGateBarChart data={qualityGates} />
  <RecentActivityTable data={recentTasks} />
</Dashboard>
```

---

### AC2: Critical Alerting Only (Essential) ✅

**Goal**: Know when autopilot is broken or stuck

**Essential Alerts**:
- [ ] **Infinite loop** (>5 attempts) → Slack + log
- [ ] **MCP server down** → Slack + auto-restart
- [ ] **Disk space <10%** → Slack + cleanup warning
- [ ] **Build/test failures** (3+ tasks failing) → Slack

**NOT Essential** (defer):
- ❌ PagerDuty integration → Phase 9 (Slack is sufficient initially)
- ❌ Warning alerts (approaching limits) → Phase 9
- ❌ Info alerts → Just use logs
- ❌ Advanced alert suppression/snooze → Phase 9

**Estimated Effort**: 4-5 hours (vs 10-12h for full version)

**MVP Implementation**:
```typescript
// Simple Slack webhook
async function sendAlert(level: 'critical', type: string, details: any) {
  if (level === 'critical') {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify({
        text: `🚨 [CRITICAL] ${type}: ${JSON.stringify(details)}`
      })
    });
  }
  // Always log
  await appendFile('state/analytics/alerts.jsonl', JSON.stringify({
    timestamp: new Date(),
    level,
    type,
    details
  }));
}
```

---

### AC3: Basic Circuit Breakers (Essential) ✅

**Goal**: Prevent cascading failures

**Essential Circuit Breakers**:
- [ ] **Model API failures** (5 consecutive failures → switch provider)
- [ ] **MCP server failures** (3 timeouts in 5 min → restart + pause tasks)
- [ ] **Disk full** (>90% → pause evidence recording)

**NOT Essential** (defer):
- ❌ Quality gate circuit breaker → Phase 9
- ❌ Advanced graceful degradation modes → Phase 9
- ❌ Exponential backoff strategies → Use simple fixed retry (1 min)

**Estimated Effort**: 6-8 hours (vs 12-15h for full version)

**MVP Implementation**:
```typescript
class SimpleCircuitBreaker {
  private failures = 0;
  private isOpen = false;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new Error('Circuit breaker open');
    }

    try {
      const result = await fn();
      this.failures = 0; // Reset on success
      return result;
    } catch (error) {
      this.failures++;
      if (this.failures >= 5) {
        this.isOpen = true;
        await sendAlert('critical', 'circuit_breaker_open', { failures: this.failures });
        // Auto-close after 1 minute
        setTimeout(() => { this.isOpen = false; this.failures = 0; }, 60000);
      }
      throw error;
    }
  }
}
```

---

### AC4: Basic Auto-Recovery (Essential) ✅

**Goal**: System fixes common failures without human intervention

**Essential Auto-Recovery**:
- [ ] **MCP server crash** → Auto-restart via script
- [ ] **Model API failure** → Switch to backup provider
- [ ] **Verify failure** → Plan delta + retry (already implemented in Phase 3)
- [ ] **Disk cleanup** → Compress old evidence artifacts

**NOT Essential** (defer):
- ❌ Advanced failure prediction → Phase 9
- ❌ Chaos engineering tests → Phase 9
- ❌ Complex recovery orchestration → Phase 9

**Estimated Effort**: 5-6 hours (vs 15-18h for full version)

**MVP Implementation**:
```typescript
// MCP server auto-restart
async function monitorMCPServer() {
  const pidFile = 'state/.mcp.pid';
  if (!fs.existsSync(pidFile)) return;

  const pid = fs.readFileSync(pidFile, 'utf-8').trim();
  const isRunning = await checkProcessRunning(pid);

  if (!isRunning) {
    await sendAlert('critical', 'mcp_server_down', { pid });
    // Auto-restart
    await exec('bash tools/wvo_mcp/scripts/restart_mcp.sh');
    await sleep(5000);
    // Verify recovery
    const recovered = await checkProcessRunning(fs.readFileSync(pidFile, 'utf-8').trim());
    if (recovered) {
      await sendAlert('info', 'mcp_server_recovered');
    }
  }
}

// Run every 30 seconds
setInterval(monitorMCPServer, 30000);
```

---

## LEAN Phase 8 Summary

**Total Effort**: 23-29 hours (~4-5 days)

**Sprint Breakdown**:
- **Sprint 1** (Days 1-2): Observability dashboard (8-10h)
- **Sprint 2** (Day 3): Alerting system (4-5h)
- **Sprint 3** (Day 4): Circuit breakers (6-8h)
- **Sprint 4** (Day 5): Auto-recovery (5-6h)

**Deployment Timeline**: 1 week (vs 6 weeks for full Phase 8)

---

## What We're Deferring to Phase 9

**Phase 9: Scale & Optimization** (future work):
- Parallel task execution (10 concurrent tasks)
- Performance optimization (10x throughput)
- Multi-repository support
- Advanced quality gates (ML-based)
- Real-time WebSocket updates
- Advanced alerting (PagerDuty, suppression, snooze)
- PM methodologies (dependency mapping, WBS, burndown charts)
- Knowledge management
- Stakeholder reporting

**Philosophy**: Ship working production system first, THEN optimize for scale.

---

## Essential Phase 8 Exit Criteria

**Observability**:
- [ ] Dashboard shows task status, quality gates, recent activity
- [ ] Accessible at localhost:3000
- [ ] Updates every 5 seconds (polling)

**Alerting**:
- [ ] Critical alerts fire correctly (infinite loop, MCP down, disk full)
- [ ] Slack integration works
- [ ] Alerts logged to state/analytics/alerts.jsonl

**Reliability**:
- [ ] Circuit breakers prevent cascading failures
- [ ] MCP server auto-restarts on crash
- [ ] Model API failover works

**Testing**:
- [ ] Unit tests pass
- [ ] Integration tests with synthetic journals pass
- [ ] Manual smoke test: Dashboard + alerts work

**Documentation**:
- [ ] README: How to run dashboard
- [ ] ALERTS.md: Alert configuration

---

## Decision Point

**Option A: LEAN Phase 8 (Recommended)**
- **Scope**: 4 essential components only
- **Effort**: 23-29 hours (~1 week)
- **Goal**: Safe production deployment
- **Philosophy**: Ship, then iterate

**Option B: Full Phase 8 (Original Plan)**
- **Scope**: 8 components (observability + scale + optimization + advanced features)
- **Effort**: 232-285 hours (~6 weeks)
- **Goal**: Production-ready AND highly scalable
- **Philosophy**: Build everything before shipping

**Recommendation**: Start with LEAN Phase 8, defer optimization to Phase 9.

**Rationale**:
- We don't know if we need 10x scale yet (no production usage data)
- Observability + alerting + reliability are ESSENTIAL
- Parallel execution + ML gates are OPTIMIZATION
- Better to ship working system fast, then iterate based on real usage

---

**Next Action**: User approval to proceed with LEAN Phase 8 (Option A) or Full Phase 8 (Option B)
