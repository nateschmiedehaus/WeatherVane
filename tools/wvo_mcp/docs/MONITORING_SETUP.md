# Anti-Drift Monitoring Setup

**Purpose:** Dashboard and alerting configuration for Phase -1 anti-drift mechanisms

**Status:** Production-ready configuration templates

---

## Metrics Overview

All metrics are written to `state/telemetry/counters.jsonl` with the following schema:

```json
{
  "name": "metric_name",
  "value": 1,
  "timestamp": "2025-10-28T22:00:00.000Z",
  "tags": {
    "taskId": "TASK-001",
    "phase": "IMPLEMENT",
    "severity": "high"
  }
}
```

### Anti-Drift Metrics

| Metric Name | Description | Tags | Target SLO |
|------------|-------------|------|------------|
| `evidence_gate_failed` | Phase transition blocked due to missing evidence | taskId, phase, missingEvidence | <1% |
| `prompt_drift_detected` | Prompt specification changed from baseline | taskId, phase, severity | High severity: 0 |
| `phase_lease_contention` | Lease acquisition failed (held by another agent) | taskId, phase, holder | <5% |
| `phase_skips_attempted` | Task tried to skip STRATEGIZE phase | taskId | 0 |
| `phase_validations_failed` | Phase validation check failed | taskId, phase, reason | <2% |

---

## Metrics Collection Pipeline

### Option 1: Stream to Monitoring System (Recommended)

```bash
#!/bin/bash
# Stream counters to monitoring system in real-time

tail -F state/telemetry/counters.jsonl | while read -r line; do
  # Parse JSON
  METRIC=$(echo "$line" | jq -r '.name')
  VALUE=$(echo "$line" | jq -r '.value')
  TIMESTAMP=$(echo "$line" | jq -r '.timestamp')
  TAGS=$(echo "$line" | jq -r '.tags | to_entries | map("\(.key):\(.value)") | join(",")')

  # Send to DataDog
  echo "anti_drift.$METRIC:$VALUE|c|#$TAGS" | nc -u -w0 localhost 8125

  # OR send to Prometheus Pushgateway
  # cat <<EOF | curl --data-binary @- http://localhost:9091/metrics/job/anti_drift
  # anti_drift_$METRIC{$TAGS} $VALUE $TIMESTAMP
  # EOF

  # OR send to CloudWatch
  # aws cloudwatch put-metric-data \
  #   --namespace AntiDrift \
  #   --metric-name $METRIC \
  #   --value $VALUE \
  #   --timestamp $TIMESTAMP \
  #   --dimensions $(echo $TAGS | sed 's/,/ /g')
done
```

### Option 2: Batch Export (Hourly)

```bash
#!/bin/bash
# Export last hour of metrics

END_TIME=$(date -u +%s)
START_TIME=$((END_TIME - 3600))

jq -c --arg start "$START_TIME" --arg end "$END_TIME" '
  select(
    (.timestamp | fromdateiso8601) >= ($start | tonumber) and
    (.timestamp | fromdateiso8601) <= ($end | tonumber)
  )
' state/telemetry/counters.jsonl > /tmp/anti_drift_metrics_$(date +%Y%m%d_%H).jsonl

# Upload to S3 for long-term storage
aws s3 cp /tmp/anti_drift_metrics_$(date +%Y%m%d_%H).jsonl \
  s3://monitoring-bucket/anti-drift-metrics/
```

---

## Dashboard Configuration

### DataDog Dashboard (JSON)

```json
{
  "title": "Anti-Drift Mechanisms - Production",
  "description": "Real-time monitoring of Phase -1 anti-drift enforcement",
  "widgets": [
    {
      "definition": {
        "type": "timeseries",
        "title": "Evidence Gate Failure Rate",
        "requests": [
          {
            "q": "sum:anti_drift.evidence_gate_failed{*}.as_rate()",
            "display_type": "line"
          }
        ],
        "markers": [
          {
            "value": "y = 0.01",
            "display_type": "error dashed",
            "label": "SLO: <1%"
          }
        ]
      }
    },
    {
      "definition": {
        "type": "timeseries",
        "title": "Prompt Drift by Severity",
        "requests": [
          {
            "q": "sum:anti_drift.prompt_drift_detected{severity:high}.as_count()",
            "display_type": "bars",
            "style": { "palette": "red" }
          },
          {
            "q": "sum:anti_drift.prompt_drift_detected{severity:medium}.as_count()",
            "display_type": "bars",
            "style": { "palette": "orange" }
          },
          {
            "q": "sum:anti_drift.prompt_drift_detected{severity:low}.as_count()",
            "display_type": "bars",
            "style": { "palette": "yellow" }
          }
        ]
      }
    },
    {
      "definition": {
        "type": "timeseries",
        "title": "Phase Lease Contention Rate",
        "requests": [
          {
            "q": "sum:anti_drift.phase_lease_contention{*}.as_rate()",
            "display_type": "line"
          }
        ],
        "markers": [
          {
            "value": "y = 0.05",
            "display_type": "warning dashed",
            "label": "SLO: <5%"
          }
        ]
      }
    },
    {
      "definition": {
        "type": "query_table",
        "title": "Evidence Gate Failures by Phase",
        "requests": [
          {
            "q": "sum:anti_drift.evidence_gate_failed{*} by {phase}",
            "aggregator": "sum"
          }
        ]
      }
    },
    {
      "definition": {
        "type": "query_value",
        "title": "High Severity Prompt Drift (Last 24h)",
        "requests": [
          {
            "q": "sum:anti_drift.prompt_drift_detected{severity:high}.rollup(sum, 86400)",
            "aggregator": "last"
          }
        ],
        "precision": 0,
        "custom_unit": "drifts"
      }
    },
    {
      "definition": {
        "type": "heatmap",
        "title": "Lease Contention Heatmap (by Task)",
        "requests": [
          {
            "q": "sum:anti_drift.phase_lease_contention{*} by {task_id}"
          }
        ]
      }
    }
  ]
}
```

### Grafana Dashboard (JSON)

```json
{
  "dashboard": {
    "title": "Anti-Drift Mechanisms",
    "panels": [
      {
        "type": "graph",
        "title": "Evidence Gate Failure Rate",
        "targets": [
          {
            "expr": "rate(anti_drift_evidence_gate_failed_total[5m])",
            "legendFormat": "Failure Rate"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": { "params": [0.01], "type": "gt" },
              "query": { "params": ["A", "5m", "now"] }
            }
          ],
          "frequency": "1m",
          "name": "Evidence Gate Failure Rate Exceeded"
        }
      },
      {
        "type": "stat",
        "title": "High Severity Drift (24h)",
        "targets": [
          {
            "expr": "sum(increase(anti_drift_prompt_drift_detected_total{severity=\"high\"}[24h]))"
          }
        ],
        "thresholds": [
          { "value": 0, "color": "green" },
          { "value": 1, "color": "red" }
        ]
      },
      {
        "type": "table",
        "title": "Lease Contention by Holder",
        "targets": [
          {
            "expr": "topk(10, sum by (holder) (anti_drift_phase_lease_contention_total))"
          }
        ]
      }
    ]
  }
}
```

---

## Alert Configuration

### Alert Rules (YAML)

```yaml
groups:
  - name: anti_drift_alerts
    interval: 1m
    rules:

      # CRITICAL: High severity prompt drift detected
      - alert: HighSeverityPromptDrift
        expr: increase(anti_drift_prompt_drift_detected_total{severity="high"}[5m]) > 0
        for: 0m
        labels:
          severity: critical
          component: anti_drift
        annotations:
          summary: "High severity prompt drift detected"
          description: "Task {{ $labels.task_id }} in phase {{ $labels.phase }} has high severity prompt drift. This indicates critical specification changes that may break task execution."
          runbook: "https://docs/anti-drift-runbook#prompt-drift"

      # WARNING: Evidence gate failure rate exceeded
      - alert: HighEvidenceGateFailureRate
        expr: rate(anti_drift_evidence_gate_failed_total[1h]) > 0.01
        for: 5m
        labels:
          severity: warning
          component: anti_drift
        annotations:
          summary: "Evidence gate failure rate exceeded 1%"
          description: "{{ $value | humanizePercentage }} of phase transitions are failing evidence validation. Target: <1%"
          runbook: "https://docs/anti-drift-runbook#evidence-gates"

      # WARNING: Lease contention storm
      - alert: LeaseContentionStorm
        expr: rate(anti_drift_phase_lease_contention_total[1m]) > 0.167  # >10/min
        for: 2m
        labels:
          severity: warning
          component: anti_drift
        annotations:
          summary: "Lease contention storm detected"
          description: "{{ $value | humanize }} lease contentions per second. Indicates potential multi-agent coordination issues."
          runbook: "https://docs/anti-drift-runbook#lease-contention"

      # WARNING: Phase validation failures
      - alert: PhaseValidationFailures
        expr: rate(anti_drift_phase_validations_failed_total[10m]) > 0.02
        for: 5m
        labels:
          severity: warning
          component: anti_drift
        annotations:
          summary: "Phase validation failure rate exceeded 2%"
          description: "Phase: {{ $labels.phase }}, Reason: {{ $labels.reason }}"
          runbook: "https://docs/anti-drift-runbook#validation-failures"

      # CRITICAL: STRATEGIZE phase skip attempted
      - alert: StrategizePhaseSkipped
        expr: increase(anti_drift_phase_skips_attempted_total[5m]) > 0
        for: 0m
        labels:
          severity: critical
          component: anti_drift
        annotations:
          summary: "Task attempted to skip STRATEGIZE phase"
          description: "Task {{ $labels.task_id }} attempted to skip mandatory STRATEGIZE phase. This violates core work process."
          runbook: "https://docs/anti-drift-runbook#phase-skips"
```

### PagerDuty Integration

```yaml
# alertmanager.yml
receivers:
  - name: pagerduty_anti_drift
    pagerduty_configs:
      - service_key: <YOUR_PAGERDUTY_SERVICE_KEY>
        severity: '{{ .CommonLabels.severity }}'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
          resolved: '{{ template "pagerduty.default.instances" .Alerts.Resolved }}'
          num_firing: '{{ .Alerts.Firing | len }}'
          num_resolved: '{{ .Alerts.Resolved | len }}'

route:
  group_by: ['alertname', 'component']
  receiver: pagerduty_anti_drift
  routes:
    - match:
        severity: critical
        component: anti_drift
      receiver: pagerduty_anti_drift
      continue: true
```

### Slack Integration

```yaml
# alertmanager.yml
receivers:
  - name: slack_anti_drift
    slack_configs:
      - api_url: <YOUR_SLACK_WEBHOOK_URL>
        channel: '#anti-drift-alerts'
        title: '{{ .CommonLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
        actions:
          - type: button
            text: 'Runbook'
            url: '{{ .CommonAnnotations.runbook }}'
          - type: button
            text: 'Dashboard'
            url: 'https://grafana/d/anti-drift'
```

---

## Verification Steps

### 1. Test Metrics Collection

```bash
# Generate test metrics
echo '{"name":"evidence_gate_failed","value":1,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","tags":{"taskId":"TEST","phase":"IMPLEMENT"}}' >> state/telemetry/counters.jsonl

# Verify streaming
tail -f state/telemetry/counters.jsonl | jq '.'
```

### 2. Test Alert Triggering

```bash
# Trigger high severity drift alert
for i in {1..5}; do
  echo '{"name":"prompt_drift_detected","value":1,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","tags":{"taskId":"TEST-'$i'","phase":"VERIFY","severity":"high"}}' >> state/telemetry/counters.jsonl
  sleep 1
done

# Check alert manager
curl http://localhost:9093/api/v1/alerts | jq '.data[] | select(.labels.alertname == "HighSeverityPromptDrift")'
```

### 3. Validate Dashboard Panels

```bash
# Query Prometheus for dashboard data
curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=rate(anti_drift_evidence_gate_failed_total[5m])' \
  | jq '.data.result'
```

---

## Runbook: Common Scenarios

### High Severity Prompt Drift

**Symptoms:** Alert fires for `HighSeverityPromptDrift`

**Investigation:**
1. Identify task: `jq '.tags.task_id' state/telemetry/counters.jsonl | sort | uniq -c`
2. Check baseline: `cat state/process/prompt_baselines.json | jq '."TASK:PHASE"'`
3. Compare hashes: `cat state/process/prompt_attestations.jsonl | jq 'select(.task_id == "TASK" and .phase == "PHASE")'`

**Resolution:**
- If intentional change: Reset baseline with `PromptAttestationManager.resetBaseline()`
- If unintentional: Investigate why requirements/artifacts changed

### Evidence Gate Failure Rate Exceeded

**Symptoms:** >1% of phase transitions blocked

**Investigation:**
1. Identify missing evidence: `jq 'select(.name == "evidence_gate_failed") | .tags.missingEvidence' state/telemetry/counters.jsonl | sort | uniq -c`
2. Check which phases: `jq 'select(.name == "evidence_gate_failed") | .tags.phase' state/telemetry/counters.jsonl | sort | uniq -c`

**Resolution:**
- Update evidence collection logic if false positives
- Fix task execution if genuinely missing evidence
- Adjust completion criteria if too strict

### Lease Contention Storm

**Symptoms:** >10 contentions/min

**Investigation:**
1. Identify hot tasks: `jq 'select(.name == "phase_lease_contention") | .tags.task_id' state/telemetry/counters.jsonl | sort | uniq -c`
2. Check holders: `jq 'select(.name == "phase_lease_contention") | .tags.holder' state/telemetry/counters.jsonl | sort | uniq -c`
3. Query lease table: `sqlite3 state/orchestrator.db "SELECT * FROM phase_leases WHERE task_id = 'TASK';"`

**Resolution:**
- Increase lease duration if tasks legitimately take longer
- Check for stuck leases: `SELECT * FROM phase_leases WHERE expires_at < datetime('now');`
- Force release if necessary: `DELETE FROM phase_leases WHERE task_id = 'TASK';`

---

## Deployment Checklist

- [ ] Metrics streaming pipeline running (`tail -F state/telemetry/counters.jsonl`)
- [ ] Dashboard deployed (DataDog/Grafana)
- [ ] Alerts configured (AlertManager/PagerDuty)
- [ ] Runbook accessible to on-call team
- [ ] Test alerts verified (trigger manually)
- [ ] Slack/PagerDuty integration tested
- [ ] SLO thresholds validated against baseline
- [ ] Team trained on alert response procedures

---

## Success Metrics

**Week 1:**
- ✅ Zero production incidents from anti-drift mechanisms
- ✅ Evidence gate failure rate <2%
- ✅ At least 1 prompt drift detection (any severity)
- ✅ Zero lease contention deadlocks

**Month 1:**
- ✅ Monitoring dashboards reviewed weekly
- ✅ All alerts have <5% false positive rate
- ✅ Evidence gate failure rate <1%
- ✅ Average alert response time <15 minutes

**Month 3:**
- ✅ Automated remediation for common issues
- ✅ SLO thresholds refined based on production data
- ✅ Zero critical incidents due to anti-drift mechanisms
- ✅ Team can diagnose/resolve alerts without escalation

---

## Next Steps

1. Deploy monitoring pipeline to production
2. Run 24-hour burn-in test with synthetic load
3. Calibrate alert thresholds based on observed baseline
4. Document team runbook procedures
5. Schedule weekly dashboard review meetings

**Last Updated:** 2025-10-28
**Owner:** TBD
**Review Cadence:** Weekly for first month, then monthly
