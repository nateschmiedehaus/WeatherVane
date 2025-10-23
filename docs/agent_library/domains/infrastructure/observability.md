# Observability & Monitoring

Telemetry, tracing, and metrics for WeatherVane's autonomous systems.

---

## Quick Reference

**Primary Documentation**: `/docs/orchestration/T6.4.8_OBSERVABILITY_INTEGRATION.md`

**Purpose**: Monitor system health, detect anomalies, and provide debugging context

---

## Observability Stack

```
┌──────────────────────────────────────────────┐
│          Observability Architecture          │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────┐     │
│  │  OpenTelemetry (OTEL)              │     │
│  │  - Spans (task execution)          │     │
│  │  - Metrics (throughput, latency)   │     │
│  │  - Context propagation             │     │
│  └────────┬───────────────────────────┘     │
│           │                                  │
│           ↓                                  │
│  ┌────────────────────────────────────┐     │
│  │  Telemetry Exporter                │     │
│  │  - JSON files (state/telemetry/)   │     │
│  │  - Structured logs                 │     │
│  │  - Metrics aggregation             │     │
│  └────────┬───────────────────────────┘     │
│           │                                  │
│           ↓                                  │
│  ┌────────────────────────────────────┐     │
│  │  Health Reports                    │     │
│  │  - Autopilot metrics               │     │
│  │  - Critic results                  │     │
│  │  - Anomaly detection               │     │
│  └────────────────────────────────────┘     │
│                                              │
└──────────────────────────────────────────────┘
```

---

## OpenTelemetry Integration

### Enabling OTEL

**Environment variable**:
```bash
export OTEL_ENABLED=1
```

**Initialization**:
```typescript
// tools/wvo_mcp/src/telemetry/tracing.ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('weathervane-orchestrator');
```

---

## Span Types

### 1. Task Execution Spans

**Purpose**: Track full task lifecycle

**Example**:
```typescript
const span = tracer.startSpan('task_execution', {
  attributes: {
    'task.id': 'T1.1.1',
    'task.title': 'Implement weather cache',
    'task.complexity': 5,
    'task.priority': 'high'
  }
});

try {
  // Execute task...
  await executeTask(task);

  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message
  });
  span.recordException(error);
} finally {
  span.end();
}
```

**Captured metrics**:
- Start time, end time, duration
- Task metadata (complexity, priority)
- Success/failure status
- Error details (if failed)

---

### 2. Critic Execution Spans

**Purpose**: Monitor critic performance and results

**Example**:
```typescript
const span = tracer.startSpan('critic_run', {
  attributes: {
    'critic.name': 'data_quality',
    'critic.authority': 'blocking'
  }
});

const result = await runCritic('data_quality');

span.setAttributes({
  'critic.status': result.status,  // pass/fail
  'critic.issue_count': result.issues.length,
  'critic.duration_ms': result.duration
});

span.end();
```

---

### 3. Provider API Spans

**Purpose**: Track LLM API calls and token usage

**Example**:
```typescript
const span = tracer.startSpan('provider_call', {
  attributes: {
    'provider.name': 'codex',
    'provider.model': 'gpt-5-codex',
    'provider.tier': 'MEDIUM'
  }
});

const response = await callProvider(prompt);

span.setAttributes({
  'provider.tokens.prompt': response.usage.prompt_tokens,
  'provider.tokens.completion': response.usage.completion_tokens,
  'provider.tokens.total': response.usage.total_tokens,
  'provider.latency_ms': response.latency
});

span.end();
```

---

## Metrics Collection

### Key Metrics

**Throughput**:
- Tasks completed per hour
- Critics run per hour
- API calls per hour

**Latency**:
- Task execution time (p50, p95, p99)
- Critic execution time
- Provider API response time

**Resource Usage**:
- Token consumption (hourly, daily)
- Database queries
- Memory usage

**Quality**:
- Test pass rate
- Critic pass rate
- Verification loop iterations

---

### Metrics Export

**Location**: `state/telemetry/usage.jsonl`

**Format** (JSON Lines):
```json
{"timestamp":"2025-10-23T12:00:00Z","metric":"task_completed","task_id":"T1.1.1","duration_ms":125000}
{"timestamp":"2025-10-23T12:01:00Z","metric":"critic_run","critic":"data_quality","status":"pass","duration_ms":3500}
{"timestamp":"2025-10-23T12:02:00Z","metric":"provider_call","provider":"codex","tokens":1250,"latency_ms":850}
```

**Aggregation**:
```bash
# View telemetry with formatting
node scripts/format_telemetry.mjs
```

---

## Health Monitoring

### Autopilot Health Report

**Location**: `state/analytics/autopilot_health_report.json`

**Generated**: Every hour + on shutdown

**Example**:
```json
{
  "running": true,
  "lastCycle": 42,
  "metricsHistory": [
    {
      "timestamp": 1729645200000,
      "pendingCount": 28,
      "readyCount": 5,
      "inProgressCount": 2,
      "doneCount": 119,
      "queueDepth": 5,
      "wipUtilization": 0.67,
      "throughputLastHour": 12,
      "staleTaskCount": 0,
      "dependencySyncRatio": 1.0
    }
  ],
  "activeAnomalies": [],
  "recentRemediations": [
    {
      "timestamp": 1729645100000,
      "anomaly": "stale_tasks",
      "action": "recover_stale_tasks",
      "result": "success",
      "message": "Recovered 2 stale task(s)"
    }
  ]
}
```

---

### OODA Loop Metrics

**See**: [Health Monitoring Process](/docs/agent_library/common/processes/health_monitoring.md)

**Metrics tracked**:
- Observation frequency (target: every 60s)
- Anomaly detection rate
- Remediation success rate
- False positive rate

---

## Anomaly Detection

### Anomaly Types

**1. Stale Tasks**:
- **Threshold**: >10 minutes in `in_progress`
- **Severity**: Warning (auto-remediate)
- **Action**: Reset to `pending`

**2. Dependency Desync**:
- **Threshold**: Table deps ≠ YAML deps
- **Severity**: Critical
- **Action**: Alert + manual sync

**3. Throughput Degradation**:
- **Threshold**: <50% of baseline
- **Severity**: Warning
- **Action**: Investigate bottleneck

**4. WIP Starvation**:
- **Threshold**: <50% WIP utilization
- **Severity**: Warning
- **Action**: Prefetch more tasks

**5. Provider Rate Limiting**:
- **Threshold**: 429 errors
- **Severity**: Critical
- **Action**: Switch provider

---

### Anomaly Detection Code

```typescript
function detectAnomalies(metrics: HealthMetrics): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Stale tasks
  if (metrics.staleTaskCount > 0) {
    anomalies.push({
      type: 'stale_tasks',
      severity: 'warning',
      count: metrics.staleTaskCount,
      action: 'auto_remediate'
    });
  }

  // Throughput degradation
  const baseline = 8;  // tasks/hour
  if (metrics.throughputLastHour < baseline * 0.5) {
    anomalies.push({
      type: 'throughput_degradation',
      severity: 'warning',
      current: metrics.throughputLastHour,
      baseline: baseline,
      action: 'investigate'
    });
  }

  // Dependency desync
  if (metrics.dependencySyncRatio < 0.95) {
    anomalies.push({
      type: 'dependency_desync',
      severity: 'critical',
      ratio: metrics.dependencySyncRatio,
      action: 'manual_sync_required'
    });
  }

  return anomalies;
}
```

---

## Alerting

### Alert Channels

**Current**: Logs + JSON files

**Future**:
- Email alerts (critical issues)
- Slack notifications
- PagerDuty integration

---

### Alert Thresholds

**Critical** (immediate action):
- MCP server down
- Database corruption
- All providers failing
- Dependency desync

**Warning** (investigate):
- Throughput <50% baseline
- Provider at 80% capacity
- Stale task rate >5%

**Info** (log only):
- Stale task recovered
- Queue refilled
- Provider switched

---

## Debugging Workflows

### Task Execution Debugging

**Problem**: Task failed or timed out

**Steps**:
1. **Find span**:
   ```bash
   grep "T1.1.1" state/telemetry/usage.jsonl
   ```

2. **Check attributes**:
   ```json
   {
     "task.id": "T1.1.1",
     "status": "error",
     "error.message": "Build failed: TypeScript error in file.ts:42"
   }
   ```

3. **Review logs**:
   ```bash
   tail -100 /tmp/wvo_mcp.log | grep "T1.1.1"
   ```

4. **Check verification loop**:
   - Did build pass?
   - Did tests pass?
   - Which step failed?

---

### Critic Performance Debugging

**Problem**: Critic timing out or producing false positives

**Steps**:
1. **Check critic span**:
   ```bash
   grep "critic_run.*data_quality" state/telemetry/usage.jsonl
   ```

2. **Analyze duration**:
   - Expected: <5 minutes
   - If >5 minutes: Check data size, complexity

3. **Review issues**:
   ```bash
   cat state/critics/data_quality.json | jq '.issues'
   ```

4. **Validate findings**:
   - Are issues real or false positives?
   - Update critic logic if needed

---

### Provider Debugging

**Problem**: High latency or failures

**Steps**:
1. **Check provider spans**:
   ```bash
   grep "provider_call" state/telemetry/usage.jsonl | tail -20
   ```

2. **Analyze patterns**:
   - Is latency increasing?
   - Are errors clustered?
   - Is specific model failing?

3. **Check provider status**:
   ```typescript
   const status = await mcp.provider_status();
   console.log(status);
   ```

4. **Switch provider if needed**:
   - Manual failover
   - OR wait for automatic failover

---

## Retention & Archival

### Telemetry Retention

**Active data**: Last 7 days in `state/telemetry/usage.jsonl`

**Archive**: Older data moved to `state/telemetry/archives/`
- Format: `usage_YYYY-MM-DD.jsonl`
- Retention: 90 days

**Cleanup**:
```bash
# Archive old telemetry (runs nightly)
node scripts/archive_telemetry.mjs
```

---

### Health Report Retention

**Current report**: `state/analytics/autopilot_health_report.json`

**History**: Last 24 hours in `metricsHistory` array

**No archive**: Reports are ephemeral (regenerate as needed)

---

## Performance Optimization

### Reducing Telemetry Overhead

**Problem**: OTEL spans add latency

**Solutions**:
1. **Sampling**: Only trace 10% of tasks
   ```typescript
   const shouldTrace = Math.random() < 0.1;
   if (shouldTrace) {
     span = tracer.startSpan(...);
   }
   ```

2. **Async export**: Don't block on write
   ```typescript
   span.end();  // Non-blocking
   ```

3. **Batching**: Aggregate before export
   ```typescript
   const batchExporter = new BatchSpanProcessor(exporter, {
     maxQueueSize: 100,
     scheduledDelayMillis: 5000
   });
   ```

---

## Key Documents

- [Observability Integration](/docs/orchestration/T6.4.8_OBSERVABILITY_INTEGRATION.md)
- [OTEL Spans Implementation](/tools/wvo_mcp/src/telemetry/otel_spans.ts)
- [Telemetry Exporter](/tools/wvo_mcp/src/telemetry/telemetry_exporter.ts)
- [Health Monitoring Process](/docs/agent_library/common/processes/health_monitoring.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
