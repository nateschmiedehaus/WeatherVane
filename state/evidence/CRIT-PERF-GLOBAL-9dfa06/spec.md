# SPEC: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: SPEC

---

## Objective

Design and specify a **generic observation framework** that enables 33 affected critics to execute runtime observations instead of being silently skipped due to `return null` command() methods.

**Success**: All affected critics can execute and provide actionable, evidence-based feedback.

---

## Problem Statement

### Current State

**Issue**: 33 critics return `null` from `command()` method → silently skipped
**Impact**:
- No runtime observations collected
- No actionable feedback generated
- Silent failures with no metrics
- `duration_ms: null` in state files

**Evidence**:
- `grep -l "return null" tools/wvo_mcp/src/critics/*.ts` → 33 files
- `state/critics/*.json` shows null duration_ms
- Forecast stitch had 12 consecutive failures before fix

### Desired State

**Goal**: All critics execute runtime observations
**Outcome**:
- Actual metrics collected (CPU, latency, coverage, etc.)
- Specific issues with severity levels
- Actionable recommendations
- Evidence artifacts (plots, traces, screenshots, profiles)
- Improvement opportunities identified

---

## Acceptance Criteria

### 1. Framework Design (100% Complete)

#### 1.1 Generic Observation Runner
- [ ] TypeScript base class for observation critics
- [ ] Standardized lifecycle: capture → analyze → report → persist
- [ ] Plugin architecture for domain-specific observations
- [ ] Configuration loading from YAML files
- [ ] Artifact management (create session dirs, cleanup)
- [ ] Error handling with graceful degradation

**Success Metric**: Can run observation with minimal config

#### 1.2 Configuration Schema
- [ ] YAML schema defined for all observation types
- [ ] Schema validation on load
- [ ] Per-critic config files in `state/` directory
- [ ] Default configs provided for each domain
- [ ] Override mechanism (env vars, CLI flags)

**Success Metric**: Config validates and loads correctly

#### 1.3 Reporting Format
- [ ] Standard JSON schema for observation reports
- [ ] Issues array with severity/category/suggestion
- [ ] Opportunities array with pattern/impact
- [ ] Artifacts array with file paths
- [ ] Metrics object with domain-specific numbers
- [ ] Overall score (0-100) calculated consistently

**Success Metric**: All critics output compatible reports

#### 1.4 Artifact Storage
- [ ] Consistent directory structure under `tmp/critic-observations/`
- [ ] Session-based isolation
- [ ] Automatic cleanup of old sessions (>7 days)
- [ ] Artifact path tracking in reports
- [ ] Size limits to prevent disk bloat

**Success Metric**: Artifacts organized and discoverable

---

### 2. Domain-Specific Observation Design (100% Complete)

#### 2.1 API Observation
**Observable Artifact**: API request/response traces
**What to Measure**:
- Latency (p50, p95, p99)
- Error rates and error types
- Response sizes
- Cache hit rates
- Concurrent load handling

**Configuration**:
```yaml
endpoints:
  - url: "/api/forecast"
    method: POST
    valid_data: {...}
    load_test:
      concurrent: 100
      duration_ms: 60000

thresholds:
  max_latency_p95_ms: 500
  max_error_rate: 0.01
```

**Success Metric**: Can profile 5+ API endpoints in <2 minutes

#### 2.2 Database Observation
**Observable Artifact**: Query execution plans
**What to Measure**:
- Query execution time
- Sequential scans on large tables
- Index usage
- Lock contention
- Connection pool stats

**Configuration**:
```yaml
critical_queries:
  - "SELECT * FROM forecasts WHERE location_id = ? AND date > ?"
  - "SELECT * FROM plans WHERE tenant_id = ?"

thresholds:
  max_query_time_ms: 100
  seq_scan_threshold_rows: 100000
```

**Success Metric**: Identifies slow queries and missing indexes

#### 2.3 Performance Observation
**Observable Artifact**: CPU/memory profiles + flamegraphs
**What to Measure**:
- CPU hot paths
- Memory leaks (steadily increasing)
- Event loop lag
- Startup time
- Heap size

**Configuration**:
```yaml
target:
  command: "node"
  args: ["dist/index.js"]
  workload: "scripts/performance_workload.js"

duration_ms: 60000
sample_interval_ms: 100

thresholds:
  max_cpu_percent: 80
  max_memory_mb: 512
  max_event_loop_lag_ms: 50
  max_startup_time_ms: 2000
```

**Success Metric**: Flamegraph generated, hot paths identified

#### 2.4 Data Observation
**Observable Artifact**: Distribution plots + statistical tests
**What to Measure**:
- Distribution drift (KL divergence)
- Target leakage (correlation >0.95)
- Missing values
- Outliers
- Feature importance

**Configuration**:
```yaml
datasets:
  train: "data/train.parquet"
  test: "data/test.parquet"

visualizations:
  - distribution_plots
  - correlation_heatmap
  - drift_analysis
  - residual_plots

thresholds:
  max_drift_kl: 0.15
  max_correlation: 0.95
  min_coverage: 0.75
```

**Success Metric**: Detects leakage and drift with visual evidence

#### 2.5 Infrastructure Observation
**Observable Artifact**: Chaos test metrics
**What to Measure**:
- Failover time
- Recovery success rate
- Service degradation behavior
- Alert triggering
- Health check response

**Configuration**:
```yaml
experiments:
  - name: "Database failover"
    failure: "Kill primary DB"
    expected: "Failover to replica"
    max_recovery_ms: 60000

  - name: "Network partition"
    failure: "Block traffic"
    expected: "Degrade gracefully"
```

**Success Metric**: Chaos tests run, recovery time measured

---

### 3. Implementation Plan (100% Complete)

#### 3.1 Affected Critics Inventory
- [ ] Complete list of 33 affected critics
- [ ] Categorized by domain (API, DB, Perf, Data, Infra, UX, Other)
- [ ] Priority assignment (critical, high, medium, low)
- [ ] Current status documented

**Success Metric**: Full inventory in spreadsheet/table format

#### 3.2 Implementation Phases
- [ ] Phase 1: Framework foundation (base classes, schemas)
- [ ] Phase 2: High-priority domains (API, Performance, Database)
- [ ] Phase 3: ML/Data domains (Data, Modeling)
- [ ] Phase 4: UX/Product domains (Design, Experience)
- [ ] Phase 5: Infrastructure/Meta (Infra, Meta-critique)

**Success Metric**: Clear phase breakdown with time estimates

#### 3.3 Per-Critic Migration Plan
- [ ] Template for migrating critics
- [ ] Step-by-step checklist
- [ ] Testing requirements
- [ ] Evidence capture requirements

**Success Metric**: Can migrate one critic in <2 hours

---

### 4. Success Metrics (100% Complete)

#### 4.1 Execution Metrics
- [ ] **Critic Execution Rate**: 100% of critics execute (not skipped)
- [ ] **Duration Tracking**: All critics have non-null duration_ms
- [ ] **Success Rate**: >95% of critic runs succeed
- [ ] **Error Rate**: <5% of runs fail

**Measurement**: Query `state/critics/*.json` for null durations

#### 4.2 Observation Quality
- [ ] **Issues Identified**: >0 issues found per observation
- [ ] **Actionability**: 100% of issues have suggestions
- [ ] **Evidence**: 100% of issues link to artifacts
- [ ] **Opportunities**: >0 opportunities found per observation

**Measurement**: Sample 10 critic reports, check schema compliance

#### 4.3 Performance
- [ ] **API Observation**: <2 minutes per run
- [ ] **DB Observation**: <1 minute per run
- [ ] **Perf Observation**: <5 minutes per run
- [ ] **Data Observation**: <3 minutes per run
- [ ] **Infra Observation**: <10 minutes per run

**Measurement**: Actual runtime from duration_ms field

#### 4.4 Artifact Quality
- [ ] **Storage Efficiency**: <100MB per session
- [ ] **Retention**: 7-day automatic cleanup
- [ ] **Accessibility**: All artifacts have valid paths
- [ ] **Usefulness**: Artifacts reviewable by humans

**Measurement**: Check `tmp/critic-observations/` size and structure

---

## Definition of Done

This research/design task (CRIT-PERF-GLOBAL-9dfa06.1) is **DONE** when:

### Documentation Complete
- [x] STRATEGIZE: Problem analysis and approach
- [ ] SPEC: This document (acceptance criteria)
- [ ] PLAN: Implementation plan with time estimates
- [ ] THINK: Edge cases and alternatives analyzed
- [ ] Design artifacts for all 5 observation domains
- [ ] Configuration schema examples
- [ ] Migration templates created

### Validation Complete
- [ ] Framework design reviewed (REVIEW phase)
- [ ] Can explain design to stakeholders
- [ ] Trade-offs documented
- [ ] Risks identified with mitigations
- [ ] Follow-up tasks created

### Evidence Complete
- [ ] All evidence files in `state/evidence/CRIT-PERF-GLOBAL-9dfa06/`
- [ ] Cross-references to prior work (forecast_stitch)
- [ ] Code references for affected files
- [ ] Example configurations provided

---

## Non-Goals (Out of Scope)

This is a **research and design** task. Implementation is deferred to follow-up tasks.

**NOT in scope**:
- ❌ Implementing actual observation scripts
- ❌ Migrating all 33 critics
- ❌ Running critics end-to-end
- ❌ Production deployment
- ❌ Performance optimization of framework
- ❌ Integration with CI/CD

**In scope**:
- ✅ Framework design
- ✅ Configuration schema
- ✅ Implementation plan
- ✅ Success metrics
- ✅ Example configurations
- ✅ Migration templates

---

## Dependencies

### Internal
- Forecast stitch implementation (reference)
- Runtime observation pattern doc (reference)
- Critic base class (extend)
- State management (integrate)

### External
- None (design phase only)

---

## Risks & Mitigations

### Risk 1: Framework Too Complex
**Likelihood**: Medium
**Impact**: High (delays adoption)
**Mitigation**: Start with minimal viable framework, iterate based on first implementations

### Risk 2: Domain Expertise Required
**Likelihood**: High (for quality observations)
**Impact**: Medium (initial observations may be shallow)
**Mitigation**: Document patterns from prior work, leverage existing monitoring scripts where available

### Risk 3: Performance Overhead
**Likelihood**: Medium
**Impact**: Medium (observations may be slow)
**Mitigation**: Set time budgets per observation type, allow skipping heavy observations on "low" profile

### Risk 4: Artifact Bloat
**Likelihood**: High (flamegraphs, screenshots, plots add up)
**Impact**: Low (disk space)
**Mitigation**: Automatic cleanup after 7 days, size limits per artifact type

---

## Follow-Up Tasks

After this research task completes, create:

1. **CRIT-PERF-GLOBAL-9dfa06.2**: Implement observation framework foundation
2. **CRIT-PERF-API-OBSERVATION**: Implement API observation critic
3. **CRIT-PERF-DB-OBSERVATION**: Implement database observation critic
4. **CRIT-PERF-PERF-OBSERVATION**: Implement performance observation critic
5. **CRIT-PERF-DATA-OBSERVATION**: Implement data observation critic
6. **CRIT-PERF-INFRA-OBSERVATION**: Implement infrastructure observation critic

---

## References

- **STRATEGIZE**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/strategize.md`
- **Prior Work**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md`
- **Pattern Guide**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
- **Affected Critics**: 33 files (see grep output in STRATEGIZE)
