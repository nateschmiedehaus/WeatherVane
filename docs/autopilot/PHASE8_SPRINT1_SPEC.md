# Phase 8 Sprint 1: Observability Foundation - SPEC

## STRATEGIZE: Methodology Selection

### Task Classification
- **Type**: Infrastructure/Observability
- **Complexity**: High (multi-component system with real-time data flow)
- **Scope**: Dashboard UI + Backend API + Real-time metrics + Alerting system

### Problem-Solving Approach: **Incremental Capability Verification**

**Rationale**: Building observability infrastructure requires bottom-up composition:
1. Data layer: Extract metrics from existing decision journals
2. API layer: Serve metrics via REST/WebSocket endpoints
3. UI layer: Visualize metrics with charts and real-time updates
4. Alert layer: Monitor thresholds and trigger notifications

**Why this approach**:
- Each layer can be tested independently
- Bottom-up ensures data foundation is solid before building UI
- Allows for iterative refinement (start with basic charts, add sophistication)
- Prevents "pretty UI with no data" problem

### Verification Methodology: **Synthetic Data Simulation + Controlled Integration Harness**

**Synthetic Data Simulation**:
- Generate mock decision journals with known distributions
- Test edge cases (100 tasks in flight, 0 tasks, all tasks failing)
- Validate dashboard calculations against expected results

**Controlled Integration Harness**:
- Create test harness that runs StateGraph with instrumentation
- Capture metrics during test runs
- Verify dashboard displays correct data from real runs

**Success Criteria**:
- Dashboard accurately reflects 100% of test scenario metrics
- Real-time updates appear within 1 second
- Alert triggers fire within 5 seconds of threshold breach
- System handles 1000+ concurrent tasks without degradation

### Verification Strategy
1. **Unit tests**: Each component (metric extraction, API endpoints, chart rendering)
2. **Integration tests**: Full pipeline (journal → API → dashboard → alerts)
3. **Stress tests**: 1000 concurrent tasks, verify dashboard doesn't crash
4. **End-to-end tests**: Simulate full autopilot run, verify all metrics captured
5. **Manual smoke test**: Open dashboard, verify live updates work

---

## SPEC: Acceptance Criteria for AC1 (Observability Dashboard)

### Goal
Real-time visibility into all autopilot operations with comprehensive metrics, charts, and drill-down capabilities.

### Explicit Acceptance Criteria

#### AC1.1: Task Execution Dashboard

**Must Have**:
- [ ] Chart: Tasks by state (spec, plan, think, implement, verify, review, pr, monitor) - bar chart
- [ ] Metric: Task completion rate (per hour, per day, per week) - line chart over time
- [ ] Metric: Task success/failure/retry rates - pie chart + percentages
- [ ] Metric: Average time per stage - horizontal bar chart
- [ ] Alert: Bottleneck detection (which stage takes >20% of total time) - highlighted in red
- [ ] Real-time updates: Chart refreshes within 1 second of state change
- [ ] Drill-down: Click on bar → see list of tasks in that state

**Done Criteria**:
- Dashboard shows all 6 metrics
- Data is accurate (verified against test harness)
- Real-time updates work (< 1s latency)
- Drill-down shows task details

#### AC1.2: Quality Gate Dashboard

**Must Have**:
- [ ] Chart: Gate 1-5 approval/rejection rates - stacked bar chart
- [ ] Metric: Consensus reach rate - single number + trend (target: >95%)
- [ ] Chart: Review rubric scores over time - line chart for each dimension
- [ ] Table: Top 5 rejection reasons with counts
- [ ] Chart: Adversarial detector catches by category - bar chart
- [ ] Drill-down: Click on rejection reason → see tasks that failed for that reason

**Done Criteria**:
- All 5 quality gates have metrics
- Consensus reach rate calculated correctly (quorum_satisfied / total decisions)
- Rejection reasons sorted by frequency
- Adversarial categories match BULLSHIT_CATEGORIES enum

#### AC1.3: Resolution Loop Dashboard

**Must Have**:
- [ ] Table: Active resolution loops (task ID, attempt #, elapsed time) - sortable
- [ ] Metric: Loop closure rate - percentage + trend (target: >95% within 3 attempts)
- [ ] Chart: Distribution of attempts to resolution - histogram
- [ ] Alert: Infinite loop detection (>5 attempts) - critical alert, red banner
- [ ] Metric: Incident reporter invocations - count + list of tasks
- [ ] Chart: Time to resolution - box plot (p50, p95, p99)

**Done Criteria**:
- Active loops update in real-time
- Closure rate matches actual resolution outcomes
- Infinite loop alert fires immediately when attempt > 5
- Incident reporter count matches actual invocations

#### AC1.4: Resource Utilization Dashboard

**Must Have**:
- [ ] Chart: Model token usage by provider - stacked area chart over time
- [ ] Chart: Token usage by task - bar chart of top 10 tasks
- [ ] Chart: Token usage by stage - pie chart
- [ ] Metric: Cost per task - average + histogram
- [ ] Chart: Memory/CPU usage - line chart over time
- [ ] Metric: Disk I/O for evidence artifacts - line chart + total size
- [ ] Health: MCP server status - green/red indicator + uptime %

**Done Criteria**:
- Token usage matches actual API calls (verified via provider logs)
- Cost calculated correctly (tokens * cost_per_token by provider)
- Memory/CPU tracked via process monitoring
- MCP server health updated every 30 seconds

### AC1.5: Dashboard Technical Requirements

**Backend API**:
- [ ] Express.js server serving metrics from decision journals
- [ ] REST endpoints: GET /api/metrics/{tasks,quality_gates,resolution_loops,resources}
- [ ] WebSocket endpoint: WS /api/metrics/live for real-time updates
- [ ] Caching: In-memory cache (5s TTL) to prevent journal re-reads on every request
- [ ] Authentication: API key or JWT token required

**Frontend UI**:
- [ ] React + Recharts or Observable Plot for visualizations
- [ ] Responsive layout (works on desktop, tablet, mobile)
- [ ] Dark mode support
- [ ] Export functionality (download charts as PNG, data as CSV)
- [ ] Date range selector (last 1h, 24h, 7d, 30d, custom)

**Performance Requirements**:
- [ ] Page load time < 2 seconds
- [ ] Chart render time < 500ms
- [ ] Real-time update latency < 1 second
- [ ] Supports 1000+ data points per chart without lag

**Deployment**:
- [ ] Hosted at `autopilot.weathervane.com/dashboard` (or localhost:3000 for local dev)
- [ ] Docker container for easy deployment
- [ ] Environment variables for configuration (journal path, API port, etc.)

### AC1.6: Data Sources

**Input: Decision Journals**
- `state/analytics/orchestration_metrics.json` - Quality gate decisions
- `state/analytics/autopilot_health_report.json` - Task execution metrics
- `state/analytics/provider_capacity_metrics.json` - Token usage by provider
- `state/roadmap.yaml` - Task status and completion data
- `state/limits/usage_log.json` - Token usage logs
- `state/.mcp.pid` - MCP server health

**Metric Extraction Logic**:
```typescript
// Extract task execution metrics
function extractTaskMetrics(journals: DecisionJournal[]): TaskMetrics {
  const byState = countBy(journals, j => j.task.state);
  const completionRate = journals.filter(j => j.task.state === 'done').length / totalTasks;
  const avgTimePerStage = calculateAvgTime(journals);
  // ...
}

// Extract quality gate metrics
function extractQualityGateMetrics(journals: DecisionJournal[]): QualityGateMetrics {
  const approvalRates = gates.map(g => ({
    gate: g,
    approved: journals.filter(j => j.reviews[g]?.approved).length,
    rejected: journals.filter(j => !j.reviews[g]?.approved).length,
  }));
  const consensusReachRate = journals.filter(j => j.quorum_satisfied).length / journals.length;
  // ...
}
```

### AC1.7: Constraints

**Performance Constraints**:
- Dashboard must handle 10,000+ tasks without slowdown
- Real-time updates must not impact autopilot execution performance
- Journal reads must be efficient (stream, don't load entire file)

**Compatibility Constraints**:
- Works with existing decision journal format (no breaking changes)
- Compatible with existing MCP server infrastructure
- Doesn't require changes to StateGraph or orchestrator

**Security Constraints**:
- API endpoints require authentication
- No sensitive data (secrets, API keys) exposed in dashboard
- Rate limiting on API endpoints (100 req/min per client)

### MVP (Minimum Viable Product)

**What's in MVP**:
- Task execution dashboard (AC1.1) - basic charts only
- Quality gate dashboard (AC1.2) - approval rates only
- Backend API with REST endpoints (no WebSocket yet)
- Basic React UI with Recharts
- Manual refresh (no real-time updates yet)

**What's NOT in MVP** (deferred to enhancement phase):
- Real-time WebSocket updates (use polling for MVP)
- Resolution loop dashboard (AC1.3) - add in iteration 2
- Resource utilization dashboard (AC1.4) - add in iteration 3
- Export functionality (CSV/PNG downloads)
- Dark mode
- Advanced filtering/drill-down

**MVP Timeline**: 8-10 hours

---

## SPEC: Acceptance Criteria for AC2 (Alerting & Incident Response)

### Goal
Proactive detection and auto-remediation of issues with configurable alerts via Slack, PagerDuty, and logging.

### Explicit Acceptance Criteria

#### AC2.1: Alert Categories

**Critical Alerts** (PagerDuty + Slack + Log):
- [ ] Infinite loop detected (>5 attempts without resolution)
- [ ] Quality gate consensus failure (quorum not reached after 3 attempts)
- [ ] Circuit breaker tripped (system degraded)
- [ ] MCP server down (pid file exists but process not running)
- [ ] Disk space <10% (evidence artifacts growing unbounded)

**Warning Alerts** (Slack + Log):
- [ ] Resolution loop attempt 3 (approaching limit)
- [ ] Quality gate rejection spike (>30% over 1h)
- [ ] Model token usage >80% of limit
- [ ] Task backlog growing (>20 pending tasks)
- [ ] Memory usage >80% of limit

**Info Alerts** (Log only):
- [ ] Task started
- [ ] Task completed
- [ ] Quality gate decision
- [ ] Plan delta recorded

#### AC2.2: Alert Delivery Mechanisms

**Slack Integration**:
- [ ] Webhook URL configured via env var `SLACK_WEBHOOK_URL`
- [ ] Alert format: `🚨 [CRITICAL] Infinite loop detected: Task T1.2.3 on attempt 6`
- [ ] Includes link to dashboard for drill-down
- [ ] Rate limiting: Max 1 alert per minute per alert type (prevent spam)

**PagerDuty Integration** (optional for MVP):
- [ ] Integration key configured via env var `PAGERDUTY_INTEGRATION_KEY`
- [ ] Only critical alerts trigger PagerDuty
- [ ] De-duplication: Don't re-trigger if alert already open

**Logging**:
- [ ] All alerts logged to `state/analytics/alerts.jsonl`
- [ ] Format: `{"timestamp": "2025-10-26T12:34:56Z", "level": "critical", "type": "infinite_loop", "task_id": "T1.2.3", "details": {...}}`

#### AC2.3: Auto-Remediation

**Infinite Loop Detection**:
```typescript
if (resolutionLoop.attempts > 5) {
  // Alert
  await alerter.send('critical', 'infinite_loop', { taskId, attempts });

  // Auto-remediation: Create incident report
  await incidentReporter.createMRFC({
    task: task,
    reason: 'infinite_loop',
    attempts: resolutionLoop.attempts,
  });

  // Pause task execution
  await stateGraph.pause(taskId);
}
```

**Circuit Breaker Auto-Recovery**:
```typescript
if (failureRate > 0.5 && timeWindow < 5min) {
  // Open circuit breaker
  circuitBreaker.open();

  // Alert
  await alerter.send('critical', 'circuit_breaker_tripped', { failureRate });

  // Graceful degradation
  await taskScheduler.pauseNewTasks();
  await taskScheduler.completeInFlightTasks();

  // Auto-recovery: Wait 5 minutes, then try to close
  setTimeout(() => {
    if (circuitBreaker.canClose()) {
      circuitBreaker.close();
      await alerter.send('info', 'circuit_breaker_recovered');
    }
  }, 5 * 60 * 1000);
}
```

**MCP Server Auto-Restart**:
```typescript
if (mcpServerDown && autoRestartEnabled) {
  // Alert
  await alerter.send('critical', 'mcp_server_down');

  // Auto-remediation: Restart server
  await bash(`bash tools/wvo_mcp/scripts/restart_mcp.sh`);

  // Verify restart succeeded
  await sleep(5000);
  if (mcpServerUp) {
    await alerter.send('info', 'mcp_server_recovered');
  } else {
    await alerter.send('critical', 'mcp_server_restart_failed');
  }
}
```

#### AC2.4: Alert Configuration

**Configurable Thresholds** (via config file or env vars):
```yaml
# config/alerts.yaml
critical:
  infinite_loop_threshold: 5
  disk_space_threshold: 10 # percent
  consensus_failure_threshold: 3

warning:
  resolution_loop_warning_threshold: 3
  rejection_spike_threshold: 0.30 # 30%
  token_usage_warning_threshold: 0.80 # 80%
  backlog_threshold: 20 # tasks

rate_limiting:
  max_alerts_per_minute: 10
  dedupe_window: 300 # seconds
```

**Alert Suppression** (prevent alert fatigue):
- [ ] Suppress duplicate alerts within 5-minute window
- [ ] Suppress info alerts if critical alert fired
- [ ] Allow manual snooze (via dashboard UI)

### AC2.5: MVP (Minimum Viable Product)

**What's in MVP**:
- Critical alerts: Infinite loop, MCP server down
- Slack integration (Slack webhook only)
- Logging to `state/analytics/alerts.jsonl`
- Basic auto-remediation: MCP server restart

**What's NOT in MVP**:
- PagerDuty integration (add in iteration 2)
- Circuit breaker logic (covered in AC3)
- Advanced alert suppression/snooze
- Alert dashboard UI (just logs + Slack)

**MVP Timeline**: 5-6 hours

---

## Timeline Estimate

**Total Sprint 1 Effort**:
- AC1 (Observability Dashboard): 15-20h
  - MVP: 8-10h
  - Full: 15-20h
- AC2 (Alerting System): 10-12h
  - MVP: 5-6h
  - Full: 10-12h
- Deployment & Testing: 3-4h

**Total**: 28-36 hours (~1 week at 6h/day)

**Sprint 1 MVP**: 16-20 hours (~3 days)

---

## Exit Criteria (ALL must be true)

**AC1 (Observability Dashboard)**:
- [ ] Dashboard accessible at localhost:3000
- [ ] Task execution dashboard shows all 6 metrics
- [ ] Quality gate dashboard shows approval/rejection rates
- [ ] Backend API serves data from decision journals
- [ ] Frontend charts render correctly
- [ ] Manual refresh updates data

**AC2 (Alerting System)**:
- [ ] Infinite loop alert fires when attempts > 5
- [ ] MCP server down alert fires when server not running
- [ ] Slack integration sends alerts
- [ ] Alerts logged to state/analytics/alerts.jsonl
- [ ] MCP server auto-restart works

**Testing**:
- [ ] Unit tests pass for metric extraction logic
- [ ] Integration tests pass for API endpoints
- [ ] End-to-end test with synthetic journals passes
- [ ] Manual smoke test: Dashboard + alerts work

**Documentation**:
- [ ] README: How to run dashboard locally
- [ ] DEPLOYMENT.md: How to deploy to production
- [ ] ALERTS.md: How to configure alerts

---

## Risks & Mitigations

### Risk 1: Real-time updates are complex
**Risk**: WebSocket implementation takes longer than estimated
**Mitigation**: Start with polling (HTTP GET every 5s), add WebSocket in iteration 2
**Contingency**: MVP uses polling, full version adds WebSocket

### Risk 2: Dashboard performance with large datasets
**Risk**: 10,000+ tasks cause chart rendering to freeze
**Mitigation**: Pagination (show last 1000 tasks), lazy loading, virtual scrolling
**Contingency**: Set hard limit of 1000 tasks visible, add filtering

### Risk 3: Decision journal format changes
**Risk**: Existing journals don't have all required fields
**Mitigation**: Graceful fallback (use default values if fields missing)
**Contingency**: Add migration script to backfill missing fields

### Risk 4: Alert fatigue
**Risk**: Too many alerts cause notification fatigue
**Mitigation**: Rate limiting, deduplication, alert suppression
**Contingency**: Add snooze functionality, allow disabling non-critical alerts

---

## Integration Points

**Existing Systems**:
- StateGraph: Read decision journals from `state/analytics/`
- MCP Server: Monitor health via `state/.mcp.pid`
- TokenEfficiencyManager: Read token usage from `state/limits/usage_log.json`
- IncidentReporter: Trigger MRFC creation on critical alerts

**New Systems Created**:
- ObservabilityServer: Express.js backend for dashboard
- DashboardUI: React frontend for visualizations
- AlertManager: Slack/PagerDuty/logging alerting system

**No Changes Required**:
- StateGraph (read-only access to journals)
- Orchestrator (no modifications needed)
- Existing runners (no instrumentation changes)

---

## Next Steps

1. **PLAN**: Break down AC1 (dashboard) and AC2 (alerting) into implementation steps
2. **THINK**: Challenge assumptions, identify edge cases
3. **IMPLEMENT**: Build MVP (dashboard + basic alerts)
4. **VERIFY**: Test with synthetic journals + real autopilot run
5. **REVIEW**: Self-review for performance, security, maintainability
6. **PR**: Create pull request with evidence
7. **MONITOR**: Deploy and monitor for issues

---

**Status**: SPEC complete, ready for PLAN stage

**Approval Required**: User approval to proceed with implementation

---

## Implementation Progress (2025-10-27)

- ✅ `ObservabilityMetricsLoader` + `ObservabilityMetricsProvider` aggregate task + quality gate data from existing state files.
- ✅ `ObservabilityServer` exposes `/healthz`, `/api/metrics/tasks`, `/api/metrics/quality_gates`, `/api/metrics/usage` with 5 s caching.
- ✅ `npm run observability` (backed by `tools/wvo_mcp/scripts/start_observability.ts`) runs the server with overridable host/port/workspace.
- ✅ Vitest coverage for aggregation + routing (`tools/wvo_mcp/src/observability/__tests__/observability_metrics.test.ts`).
- 📝 Usage + follow-up work documented in `docs/autopilot/OBSERVABILITY_DASHBOARD.md`.

Next slice: build the React dashboard + alert integrations on top of these API primitives, then expand coverage to resolution/resource metrics per AC1.3/AC1.4.
