# PLAN: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: PLAN

---

## Implementation Strategy

### Phased Approach

**Philosophy**: Build foundation first, then migrate critics incrementally by domain priority.

**Total Estimated Time**: ~80-100 hours across all phases (implementation tasks, not this research task)

---

## Phase 1: Foundation Framework (Estimated: 16-20 hours)

### Goal
Create reusable observation framework that all critics can leverage.

### Tasks

#### 1.1 Base Observation Infrastructure (6-8 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/base_observer.ts` (~300 lines)
- `tools/wvo_mcp/src/critics/observation/types.ts` (~150 lines)
- `tools/wvo_mcp/src/critics/observation/config_loader.ts` (~200 lines)
- `tools/wvo_mcp/src/critics/observation/artifact_manager.ts` (~250 lines)

**Key Components**:
```typescript
// Base observer class
export abstract class BaseObserver {
  protected abstract captureArtifacts(): Promise<Artifacts>;
  protected abstract analyzeArtifacts(artifacts: Artifacts): Promise<Issues>;
  protected formatReport(issues: Issues): ObservationReport;
  protected calculateScore(issues: Issues): number;
}

// Observation report interface
export interface ObservationReport {
  overall_score: number;
  passed: boolean;
  timestamp: string;
  duration_ms: number;
  issues: Issue[];
  opportunities: Opportunity[];
  artifacts: string[];
  metrics: Record<string, number>;
}
```

**Deliverables**:
- [ ] BaseObserver class with lifecycle methods
- [ ] TypeScript interfaces for all observation types
- [ ] Config loader with YAML validation
- [ ] Artifact manager with session isolation
- [ ] Unit tests for framework components

**Time Breakdown**:
- Design: 2 hours
- Implementation: 4 hours
- Testing: 2 hours

---

#### 1.2 Configuration Schema & Validation (4-5 hours)

**Files to Create**:
- `tools/wvo_mcp/config/observation_schemas/` directory
  - `api.schema.yaml`
  - `database.schema.yaml`
  - `performance.schema.yaml`
  - `data.schema.yaml`
  - `infrastructure.schema.yaml`

**Example API Schema**:
```yaml
# api.schema.yaml
$schema: "http://json-schema.org/draft-07/schema#"
type: object
properties:
  endpoints:
    type: array
    items:
      type: object
      properties:
        url:
          type: string
          format: uri
        method:
          enum: [GET, POST, PUT, DELETE, PATCH]
        valid_data:
          type: object
      required: [url, method]
  thresholds:
    type: object
    properties:
      max_latency_p95_ms:
        type: number
        minimum: 0
      max_error_rate:
        type: number
        minimum: 0
        maximum: 1
required: [endpoints, thresholds]
```

**Deliverables**:
- [ ] JSON schemas for all 5 observation domains
- [ ] Schema validation utility
- [ ] Default configs for each domain
- [ ] Validation tests

**Time Breakdown**:
- Schema design: 2 hours
- Implementation: 2 hours
- Testing: 1 hour

---

#### 1.3 Reporting & Persistence (3-4 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/reporter.ts` (~200 lines)
- `tools/wvo_mcp/src/critics/observation/persistence.ts` (~150 lines)

**Key Features**:
- Consistent report formatting
- Severity-based scoring
- Artifact path tracking
- State file updates
- Cleanup of old artifacts

**Deliverables**:
- [ ] Report formatter with markdown/JSON output
- [ ] Persistence layer for state files
- [ ] Artifact cleanup with 7-day retention
- [ ] Size limits enforced (100MB per session)

**Time Breakdown**:
- Implementation: 2.5 hours
- Testing: 1.5 hours

---

#### 1.4 Critic Integration Template (3 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/critic_template.ts` (~100 lines)
- `docs/critics/OBSERVATION_MIGRATION_GUIDE.md` (~500 lines)

**Template Pattern**:
```typescript
export class DomainObservationCritic extends Critic {
  private observer: DomainObserver;

  protected command(profile: string): string | null {
    // Return null - we override run() instead
    return null;
  }

  async run(profile: string): Promise<CriticResult> {
    const config = await this.loadConfig();
    const artifacts = await this.observer.captureArtifacts(config);
    const issues = await this.observer.analyzeArtifacts(artifacts);
    const report = this.observer.formatReport(issues, profile);

    await this.saveReport(report);

    return this.formatResult(report, profile);
  }
}
```

**Deliverables**:
- [ ] Template for migrating critics
- [ ] Migration guide documentation
- [ ] Checklist for testing
- [ ] Example migration (1 critic)

**Time Breakdown**:
- Template creation: 1 hour
- Documentation: 1.5 hours
- Example migration: 0.5 hours

---

## Phase 2: High-Priority Observations (Estimated: 24-30 hours)

### Goal
Implement observations for most impactful domains: API, Performance, Database.

---

### 2.1 API Observation Critic (8-10 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/api_observer.ts` (~400 lines)
- `apps/worker/monitoring/api_observation.py` (optional Python script, ~300 lines)
- `state/api_observation_config.yaml` (default config)

**Key Capabilities**:
```typescript
class APIObserver extends BaseObserver {
  async captureArtifacts(config: APIConfig): Promise<APIArtifacts> {
    const traces = [];

    for (const endpoint of config.endpoints) {
      // Valid request
      const trace = await this.callAPI(endpoint.url, endpoint.method, endpoint.valid_data);
      traces.push(trace);

      // Malformed request
      const errorTrace = await this.callAPI(endpoint.url, endpoint.method, {invalid: 'data'});
      traces.push(errorTrace);

      // Load test
      const loadTrace = await this.loadTest(endpoint.url, config.load_test);
      traces.push(loadTrace);
    }

    return { traces, timestamp: Date.now() };
  }

  async analyzeArtifacts(artifacts: APIArtifacts): Promise<Issue[]> {
    const issues = [];

    for (const trace of artifacts.traces) {
      // Check latency
      if (trace.p95_latency > this.config.thresholds.max_latency_p95_ms) {
        issues.push({
          severity: 'high',
          category: 'latency',
          issue: `P95 latency ${trace.p95_latency}ms exceeds ${this.config.thresholds.max_latency_p95_ms}ms`,
          suggestion: 'Add database indexes, enable caching, or optimize query',
          evidence: trace.flamegraph_path,
        });
      }

      // Check error handling
      if (trace.malformed && trace.status === 500) {
        issues.push({
          severity: 'critical',
          category: 'error_handling',
          issue: 'Returns 500 on malformed input (should be 400)',
          suggestion: 'Add input validation middleware',
        });
      }
    }

    return issues;
  }
}
```

**Artifacts Generated**:
- `tmp/critic-observations/api/[session]/traces.json` - Request/response logs
- `tmp/critic-observations/api/[session]/performance.json` - Latency data
- `tmp/critic-observations/api/[session]/errors.json` - Error samples

**Deliverables**:
- [ ] APIObserver implementation
- [ ] HTTP client with tracing
- [ ] Load testing utility
- [ ] Default config with common endpoints
- [ ] Unit tests
- [ ] Integration test with dev server

**Time Breakdown**:
- Design: 2 hours
- Implementation: 5 hours
- Testing: 2 hours
- Documentation: 1 hour

---

### 2.2 Performance Observation Critic (8-10 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/performance_observer.ts` (~500 lines)
- `scripts/performance_workload.js` (load script, ~100 lines)
- `state/performance_observation_config.yaml`

**Key Capabilities**:
- Start application with profiling enabled
- Run realistic workload
- Capture CPU/memory snapshots every 100ms
- Generate flamegraph
- Detect memory leaks (steadily increasing)
- Identify hot paths (>10% CPU time)

**Tools Used**:
- Node --prof + --prof-process (CPU profiling)
- v8 heap snapshots (memory analysis)
- pidusage (process monitoring)

**Artifacts Generated**:
- `tmp/critic-observations/performance/[session]/cpu_flamegraph.svg`
- `tmp/critic-observations/performance/[session]/heap_snapshot.heapsnapshot`
- `tmp/critic-observations/performance/[session]/memory_timeline.png`
- `tmp/critic-observations/performance/[session]/snapshots.json`

**Deliverables**:
- [ ] PerformanceObserver implementation
- [ ] Process spawning with profiling
- [ ] Snapshot collection utility
- [ ] Flamegraph generation
- [ ] Memory leak detection algorithm
- [ ] Unit tests
- [ ] Integration test

**Time Breakdown**:
- Design: 2 hours
- Implementation: 6 hours
- Testing: 2 hours

---

### 2.3 Database Observation Critic (8-10 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/database_observer.ts` (~400 lines)
- `apps/worker/monitoring/database_observation.py` (optional Python script, ~250 lines)
- `state/database_observation_config.yaml`

**Key Capabilities**:
```typescript
class DatabaseObserver extends BaseObserver {
  async captureArtifacts(config: DBConfig): Promise<DBArtifacts> {
    const profiles = [];

    for (const query of config.critical_queries) {
      // Run EXPLAIN ANALYZE
      const explainPlan = await this.db.query(`EXPLAIN ANALYZE ${query}`);

      // Measure actual execution time
      const start = Date.now();
      await this.db.query(query);
      const duration = Date.now() - start;

      profiles.push({
        query: query.slice(0, 100),
        duration,
        plan: explainPlan.rows,
        has_seq_scan: this.detectSeqScan(explainPlan.rows),
        rows_scanned: this.extractRowCount(explainPlan.rows),
      });
    }

    return { profiles, connection_pool_stats: await this.getPoolStats() };
  }
}
```

**Artifacts Generated**:
- `tmp/critic-observations/database/[session]/slow_queries.json`
- `tmp/critic-observations/database/[session]/execution_plans.txt`
- `tmp/critic-observations/database/[session]/index_recommendations.md`

**Deliverables**:
- [ ] DatabaseObserver implementation
- [ ] EXPLAIN plan parser
- [ ] Sequential scan detector
- [ ] Index recommendation generator
- [ ] Connection pool monitoring
- [ ] Unit tests
- [ ] Integration test

**Time Breakdown**:
- Design: 2 hours
- Implementation: 5 hours
- Testing: 2 hours
- Documentation: 1 hour

---

## Phase 3: ML/Data Observations (Estimated: 16-20 hours)

### Goal
Implement observations for data quality and ML model validation.

---

### 3.1 Data Observation Critic (10-12 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/data_observer.ts` (~300 lines)
- `apps/worker/monitoring/data_observation.py` (~400 lines, heavy Python for stats)
- `state/data_observation_config.yaml`

**Key Capabilities**:
- Load train/test datasets (Parquet, CSV)
- Generate distribution plots (matplotlib)
- Compute correlation matrix
- Detect distribution drift (KL divergence)
- Check for target leakage (correlation >0.95)
- Plot residuals if model exists

**Python Script** (data observation is best done in Python):
```python
import pandas as pd
import matplotlib.pyplot as plt
from scipy.stats import ks_2samp
import json

def run_data_observation(config):
    train = pd.read_parquet(config['datasets']['train'])
    test = pd.read_parquet(config['datasets']['test'])

    issues = []

    # Distribution drift
    for col in train.columns:
        stat, p_value = ks_2samp(train[col], test[col])
        if p_value < 0.05:
            issues.append({
                'severity': 'high',
                'category': 'drift',
                'issue': f'Column {col} has different distribution in train vs test',
                'suggestion': 'Check for temporal data leakage or sampling bias',
            })

    # Target leakage
    corr = train.corr()[config['target']].sort_values(ascending=False)
    for feature, corr_val in corr.items():
        if feature != config['target'] and abs(corr_val) > 0.95:
            issues.append({
                'severity': 'critical',
                'category': 'leakage',
                'issue': f'Feature {feature} has {corr_val:.3f} correlation with target',
                'suggestion': f'Remove {feature} - likely leaking future information',
            })

    return {'passed': len(issues) == 0, 'issues': issues}
```

**Artifacts Generated**:
- `tmp/critic-observations/data/[session]/train_distribution.png`
- `tmp/critic-observations/data/[session]/test_distribution.png`
- `tmp/critic-observations/data/[session]/correlation_heatmap.png`
- `tmp/critic-observations/data/[session]/drift_analysis.png`

**Deliverables**:
- [ ] DataObserver TypeScript wrapper
- [ ] Python monitoring script
- [ ] Distribution plotting
- [ ] Drift detection (KS test)
- [ ] Leakage detection
- [ ] Unit tests
- [ ] Integration test

**Time Breakdown**:
- Design: 2 hours
- Python implementation: 6 hours
- TypeScript integration: 2 hours
- Testing: 2 hours

---

### 3.2 Migrate modeling_reality Critic (6-8 hours)

**Current Status**: Returns null from command()
**Goal**: Implement model validation observations

**Key Capabilities**:
- Load model predictions
- Compare to actuals
- Check calibration (coverage of prediction intervals)
- Compute accuracy metrics (MAE, MAPE, R²)
- Detect prediction bias
- Plot residuals

**Reuse**: Leverage existing `forecast_stitch.py` pattern

**Deliverables**:
- [ ] Migrate to observation pattern
- [ ] Reuse forecast_stitch monitoring script
- [ ] Add model-specific metrics
- [ ] Update config
- [ ] Test with real model

**Time Breakdown**:
- Migration: 3 hours
- Enhancement: 2 hours
- Testing: 2 hours

---

## Phase 4: UX/Product Observations (Estimated: 12-16 hours)

### Goal
Migrate UX critics to observation pattern (some already done via Playwright).

---

### 4.1 Design System Visual Critic (Already Done) ✅

**Status**: Already uses Playwright screenshot pattern
**Action**: Verify compatibility with new framework
**Time**: 2 hours

---

### 4.2 Migrate Product/UX Critics (10-14 hours)

**Critics to Migrate**:
- experience_flow
- inspiration_coverage
- motion_design
- responsive_surface
- weather_aesthetic
- demo_conversion
- stakeholder_narrative

**Pattern**: Most of these check for artifact existence (files, directories)
**Strategy**: Simple file system checks + content validation

**Time per critic**: ~1.5-2 hours average
**Total**: 10-14 hours

---

## Phase 5: Infrastructure/Meta Observations (Estimated: 12-16 hours)

### Goal
Implement chaos testing and meta-critique observations.

---

### 5.1 Infrastructure Observation Critic (8-10 hours)

**Files to Create**:
- `tools/wvo_mcp/src/critics/observation/infrastructure_observer.ts` (~400 lines)
- `scripts/chaos_experiments.sh` (~200 lines)
- `state/infrastructure_observation_config.yaml`

**Key Capabilities**:
- Run chaos experiments (kill processes, block network)
- Monitor recovery time
- Check health endpoints
- Validate failover behavior
- Capture metrics during chaos

**Chaos Experiments**:
1. **Database Failover**: Kill primary DB, expect failover to replica
2. **Network Partition**: Block traffic, expect graceful degradation
3. **Service Crash**: Kill API server, expect auto-restart
4. **Disk Full**: Fill disk, expect graceful error handling

**Tools**: Docker Compose, iptables, stress-ng

**Deliverables**:
- [ ] InfrastructureObserver implementation
- [ ] Chaos experiment scripts
- [ ] Recovery time measurement
- [ ] Health check monitoring
- [ ] Unit tests
- [ ] Integration test

**Time Breakdown**:
- Design: 2 hours
- Implementation: 5 hours
- Testing: 2 hours
- Documentation: 1 hour

---

### 5.2 Meta-Critique Critic (4-6 hours)

**Goal**: Observe critic system itself (meta-observation)

**Key Capabilities**:
- Check critic execution rates
- Identify silent failures (null duration_ms)
- Monitor observation quality (issues per run)
- Track artifact storage growth
- Validate reporting consistency

**Simple Implementation**: Query state files, analyze patterns

**Deliverables**:
- [ ] Meta-observer implementation
- [ ] State file analyzer
- [ ] Quality metrics calculator
- [ ] Report generator

**Time Breakdown**:
- Implementation: 3 hours
- Testing: 1 hour
- Documentation: 1 hour

---

## Phase 6: Migration & Testing (Estimated: 12-16 hours)

### Goal
Migrate remaining critics and validate entire system.

---

### 6.1 Batch Migrate Remaining Critics (8-10 hours)

**Critics Remaining**: ~15-20 critics after Phases 2-5
**Strategy**: Use template, migrate in batches
**Average Time**: 30-45 minutes per critic

**Approach**:
1. Apply template
2. Configure defaults
3. Run smoke test
4. Verify state file updated

**Deliverables**:
- [ ] All 33 critics migrated
- [ ] Each critic has config file
- [ ] Each critic tested individually

---

### 6.2 End-to-End Validation (4-6 hours)

**Test Scenarios**:
1. Run all critics sequentially
2. Verify no null duration_ms
3. Check artifact sizes (<100MB per session)
4. Validate report formats
5. Test cleanup (7-day retention)
6. Measure total execution time

**Deliverables**:
- [ ] Integration test suite
- [ ] Performance benchmarks
- [ ] Validation report

---

## Timeline Summary

| Phase | Tasks | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| **Phase 1** | Foundation Framework | 16-20 hours | None |
| **Phase 2** | API, Perf, DB Observations | 24-30 hours | Phase 1 |
| **Phase 3** | ML/Data Observations | 16-20 hours | Phase 1 |
| **Phase 4** | UX/Product Migrations | 12-16 hours | Phase 1 |
| **Phase 5** | Infra/Meta Observations | 12-16 hours | Phase 1 |
| **Phase 6** | Migration & Testing | 12-16 hours | Phases 2-5 |
| **Total** | | **92-118 hours** | |

**Note**: Phases 2-5 can run in parallel after Phase 1 completes.

**Optimized Timeline**: ~4-5 weeks with parallelization
**Sequential Timeline**: ~12-15 weeks

---

## Resource Requirements

### Human Resources
- **Framework Engineer**: Phase 1 (full-time, 1 week)
- **Domain Engineers**: Phases 2-5 (parallel, 2-3 weeks each)
  - Backend/API specialist
  - DevOps/Infrastructure specialist
  - ML/Data specialist
  - Frontend/UX specialist
- **QA Engineer**: Phase 6 (full-time, 1 week)

### Infrastructure
- Development server for observations
- Database with sample data
- Load testing tools
- Monitoring/metrics stack

### Tools
- TypeScript/Node.js
- Python (data/ML observations)
- Playwright (UX observations)
- Docker (infrastructure chaos tests)
- matplotlib/plotly (visualization)

---

## Risk Mitigation

### Risk 1: Framework Overengineering
**Mitigation**: Start minimal, add features as needed
**Checkpoint**: Review after first 3 critics migrated

### Risk 2: Observation Slowness
**Mitigation**: Set time budgets, allow "quick" profile mode
**Checkpoint**: Benchmark after Phase 2

### Risk 3: Artifact Bloat
**Mitigation**: Implement cleanup early, enforce size limits
**Checkpoint**: Monitor after Phase 3

### Risk 4: Domain Expertise Gaps
**Mitigation**: Leverage existing monitoring scripts, document patterns
**Checkpoint**: Pair programming for complex observers

---

## Success Criteria

### Phase 1 Success
- [ ] Framework compiles without errors
- [ ] Can run example observation with config
- [ ] Artifacts stored in correct location
- [ ] Report validates against schema

### Phase 2-5 Success (Per Domain)
- [ ] Observation executes successfully
- [ ] Issues identified with evidence
- [ ] Artifacts generated and accessible
- [ ] Execution time within budget
- [ ] Tests pass

### Phase 6 Success (Overall)
- [ ] All 33 critics execute (not skipped)
- [ ] 0 critics with null duration_ms
- [ ] >90% critic success rate
- [ ] Artifacts <100MB per session
- [ ] Full critic suite runs in <30 minutes

---

## Follow-Up Implementation Tasks

After this research task, create these implementation tasks:

1. **CRIT-PERF-GLOBAL-9dfa06.2**: Implement observation framework foundation (Phase 1)
2. **CRIT-PERF-API**: Implement API observation critic (Phase 2.1)
3. **CRIT-PERF-PERFORMANCE**: Implement performance observation critic (Phase 2.2)
4. **CRIT-PERF-DATABASE**: Implement database observation critic (Phase 2.3)
5. **CRIT-PERF-DATA**: Implement data observation critic (Phase 3.1)
6. **CRIT-PERF-MODELING**: Migrate modeling_reality critic (Phase 3.2)
7. **CRIT-PERF-UX**: Migrate UX critics batch (Phase 4)
8. **CRIT-PERF-INFRA**: Implement infrastructure observation critic (Phase 5.1)
9. **CRIT-PERF-META**: Implement meta-critique critic (Phase 5.2)
10. **CRIT-PERF-MIGRATION**: Batch migrate remaining critics (Phase 6.1)
11. **CRIT-PERF-VALIDATION**: End-to-end validation (Phase 6.2)

---

## References

- **STRATEGIZE**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/strategize.md`
- **SPEC**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/spec.md`
- **Forecast Stitch Pattern**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md`
- **Runtime Observation Guide**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
