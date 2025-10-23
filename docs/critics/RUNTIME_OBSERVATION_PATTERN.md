# Runtime Observation Pattern - Beyond Static Analysis

**The Breakthrough:** What made Playwright work for UX wasn't the screenshots themselves - it was **observing the system in its actual running state** instead of just reading source code.

**This same pattern applies to EVERY domain.**

---

## The Universal Pattern

```
Static Analysis (reading code)
    ↓
Runtime Observation (watching behavior)
    ↓
Artifact Capture (evidence collection)
    ↓
Intelligent Analysis (applying principles)
    ↓
Actionable Feedback (what to improve)
```

**Key Insight:** For each domain, find the equivalent of "screenshots" - the observable artifact that shows actual behavior.

---

## Domain-Specific Observable Artifacts

### 1. UX/Design → Screenshots ✅ (What We Just Built)

**Observable Artifact:** Visual screenshots
**Tool:** Playwright
**What We Observe:** How the UI actually looks
**Why Better Than Static:** Linting can't see color contrast, spacing, hierarchy

```typescript
// BEFORE: Static analysis
await exec('npm run lint'); // Only checks code syntax

// AFTER: Runtime observation
const screenshots = await playwright.captureScreenshots();
const issues = await analyzeVisualPrinciples(screenshots);
// Actually sees the UI, checks contrast, spacing, etc.
```

---

### 2. Backend/API → API Call Traces

**Observable Artifact:** Actual API requests/responses + timing
**Tool:** API testing framework (like Playwright for APIs)
**What We Observe:** Real API behavior, latency, error handling
**Why Better Than Static:** OpenAPI specs don't show performance or error behavior

**Implementation:**

```typescript
class APIObservationCritic extends Critic {
  async run() {
    // 1. CAPTURE: Actually call the APIs
    const traces = await this.captureAPITraces();

    // 2. ANALYZE: Check observed behavior
    const issues = [];

    for (const trace of traces) {
      // Check latency
      if (trace.duration > 500) {
        issues.push({
          severity: 'high',
          endpoint: trace.url,
          issue: `P95 latency ${trace.duration}ms exceeds 500ms target`,
          suggestion: 'Add database indexes, enable query caching, or add CDN',
        });
      }

      // Check error handling
      if (trace.malformedInput && trace.status === 500) {
        issues.push({
          severity: 'critical',
          endpoint: trace.url,
          issue: 'Returns 500 on malformed input (should be 400)',
          suggestion: 'Add input validation middleware',
        });
      }
    }

    return { issues };
  }

  private async captureAPITraces() {
    const traces = [];

    // Start the server
    const server = await this.startDevServer();

    // Test each endpoint
    for (const endpoint of this.config.endpoints) {
      // Valid request
      const validTrace = await this.callAPI({
        url: endpoint.url,
        method: endpoint.method,
        data: endpoint.validData,
      });
      traces.push(validTrace);

      // Malformed request
      const malformedTrace = await this.callAPI({
        url: endpoint.url,
        method: endpoint.method,
        data: { invalid: 'data' },
        expectError: true,
      });
      malformedTrace.malformedInput = true;
      traces.push(malformedTrace);

      // Load test (100 concurrent)
      const loadTrace = await this.loadTest(endpoint.url, 100);
      traces.push(loadTrace);
    }

    return traces;
  }
}
```

**Artifacts Captured:**
- `tmp/api-traces/[session]/endpoint-traces.json` - Request/response logs
- `tmp/api-traces/[session]/performance-metrics.json` - Latency data
- `tmp/api-traces/[session]/error-samples.json` - Error responses

**Report Example:**
```json
{
  "overall_health": 75,
  "issues": [
    {
      "endpoint": "POST /api/forecast",
      "issue": "P95 latency 2.3s (target: 500ms)",
      "suggestion": "Add index on forecasts(timestamp, location_id)"
    }
  ],
  "opportunities": [
    {
      "pattern": "Response caching",
      "observation": "GET /api/catalog returns same data 95% of time",
      "opportunity": "Add Cache-Control: max-age=300 header (5min cache)"
    }
  ]
}
```

---

### 3. Data/ML → Distribution Visualizations

**Observable Artifact:** Actual data distributions + model predictions
**Tool:** Plot generation + statistical tests
**What We Observe:** Data drift, leakage, prediction quality
**Why Better Than Static:** Schema checks can't see distribution shifts or correlation

**Implementation:**

```typescript
class DataObservationCritic extends Critic {
  async run() {
    // 1. CAPTURE: Generate visualizations
    const artifacts = await this.captureDataArtifacts();

    // 2. ANALYZE: Statistical tests
    const issues = [];

    // Check distribution shift
    const driftScore = await this.detectDistributionDrift(
      artifacts.train_distribution,
      artifacts.test_distribution
    );

    if (driftScore > 0.15) {
      issues.push({
        severity: 'high',
        issue: `Distribution drift detected (KL divergence: ${driftScore})`,
        suggestion: 'Retrain model or investigate data collection changes',
        visualization: artifacts.drift_plot,
      });
    }

    // Check for leakage
    const leakageCorr = await this.checkTargetLeakage(artifacts.correlations);
    if (leakageCorr.length > 0) {
      issues.push({
        severity: 'critical',
        issue: `Features correlated >0.95 with target: ${leakageCorr.join(', ')}`,
        suggestion: 'Remove features that leak future information',
        visualization: artifacts.correlation_heatmap,
      });
    }

    return { issues, artifacts };
  }

  private async captureDataArtifacts() {
    const artifacts = {};

    // Load train/test data
    const trainData = await this.loadData('train.parquet');
    const testData = await this.loadData('test.parquet');

    // Generate distribution plots
    artifacts.train_distribution = await this.plotDistributions(trainData, 'train');
    artifacts.test_distribution = await this.plotDistributions(testData, 'test');
    artifacts.drift_plot = await this.plotDriftAnalysis(trainData, testData);

    // Generate correlation heatmap
    artifacts.correlations = await this.computeCorrelations(trainData);
    artifacts.correlation_heatmap = await this.plotHeatmap(artifacts.correlations);

    // Generate prediction analysis (if model exists)
    if (this.modelExists()) {
      const predictions = await this.generatePredictions(testData);
      artifacts.residuals_plot = await this.plotResiduals(predictions, testData.target);
      artifacts.feature_importance = await this.plotFeatureImportance();
    }

    return artifacts;
  }
}
```

**Artifacts Captured:**
- `tmp/data-analysis/[session]/train_distribution.png` - Feature distributions
- `tmp/data-analysis/[session]/correlation_heatmap.png` - Correlation matrix
- `tmp/data-analysis/[session]/drift_plot.png` - Distribution shift
- `tmp/data-analysis/[session]/residuals_plot.png` - Prediction errors

**Report Example:**
```json
{
  "data_health": 60,
  "issues": [
    {
      "severity": "critical",
      "issue": "Target leakage: 'future_value' has 0.98 correlation with target",
      "visualization": "tmp/data-analysis/correlation_heatmap.png",
      "suggestion": "Remove 'future_value' - it leaks information from the future"
    },
    {
      "severity": "high",
      "issue": "Distribution drift detected (KL divergence: 0.23)",
      "visualization": "tmp/data-analysis/drift_plot.png",
      "suggestion": "Train/test split may be temporal - use time-based splitting"
    }
  ]
}
```

---

### 4. Database → Query Execution Plans

**Observable Artifact:** Actual query execution traces
**Tool:** EXPLAIN ANALYZE + query profiling
**What We Observe:** Real query performance, index usage, sequential scans
**Why Better Than Static:** Schema review can't show which queries are slow

**Implementation:**

```typescript
class DatabaseObservationCritic extends Critic {
  async run() {
    // 1. CAPTURE: Profile actual queries
    const profiles = await this.captureQueryProfiles();

    // 2. ANALYZE: Find slow queries and missing indexes
    const issues = [];

    for (const profile of profiles) {
      // Check for sequential scans on large tables
      if (profile.seq_scan && profile.rows > 100000) {
        issues.push({
          severity: 'critical',
          query: profile.query,
          issue: `Sequential scan on ${profile.rows.toLocaleString()} rows`,
          suggestion: `CREATE INDEX idx_${profile.table}_${profile.column} ON ${profile.table}(${profile.column})`,
          execution_plan: profile.explain_output,
        });
      }

      // Check for slow queries
      if (profile.duration > 1000) {
        issues.push({
          severity: 'high',
          query: profile.query,
          issue: `Query takes ${profile.duration}ms (target: <100ms)`,
          suggestion: 'Add indexes or optimize query logic',
          execution_plan: profile.explain_output,
        });
      }
    }

    return { issues };
  }

  private async captureQueryProfiles() {
    const profiles = [];

    // Connect to database
    const db = await this.connectDB();

    // Profile critical queries
    for (const query of this.config.criticalQueries) {
      const start = Date.now();

      // Get execution plan
      const explain = await db.query(`EXPLAIN ANALYZE ${query}`);

      const duration = Date.now() - start;

      profiles.push({
        query: query.slice(0, 100),
        duration,
        explain_output: explain.rows,
        seq_scan: this.hasSeqScan(explain.rows),
        rows: this.getRowCount(explain.rows),
        table: this.extractTable(query),
        column: this.extractColumn(explain.rows),
      });
    }

    return profiles;
  }
}
```

**Artifacts Captured:**
- `tmp/db-profiles/[session]/slow_queries.json` - Queries >100ms
- `tmp/db-profiles/[session]/execution_plans.txt` - EXPLAIN output
- `tmp/db-profiles/[session]/index_recommendations.md` - Suggested indexes

---

### 5. Performance → Profiling Traces

**Observable Artifact:** CPU/memory profiles + flamegraphs
**Tool:** Node profiler / py-spy / perf
**What We Observe:** Actual bottlenecks, memory leaks, hot paths
**Why Better Than Static:** Big-O analysis can't show real bottlenecks

**Implementation:**

```typescript
class PerformanceObservationCritic extends Critic {
  async run() {
    // 1. CAPTURE: Profile application under load
    const profiles = await this.capturePerformanceProfiles();

    // 2. ANALYZE: Find bottlenecks
    const issues = [];

    // Check CPU hotspots
    for (const hotspot of profiles.cpu_hotspots) {
      if (hotspot.cpu_percent > 10) {
        issues.push({
          severity: 'high',
          function: hotspot.function,
          issue: `Function consumes ${hotspot.cpu_percent}% of CPU`,
          suggestion: 'Optimize algorithm or cache results',
          flamegraph: profiles.cpu_flamegraph,
        });
      }
    }

    // Check memory leaks
    if (profiles.memory_growth > 5) { // 5MB/min
      issues.push({
        severity: 'critical',
        issue: `Memory leak detected: ${profiles.memory_growth}MB/min growth`,
        suggestion: 'Check for unclosed connections or unbounded caches',
        heap_snapshot: profiles.heap_snapshot,
      });
    }

    return { issues };
  }

  private async capturePerformanceProfiles() {
    // Start application with profiling
    const app = await this.startWithProfiling();

    // Run load test
    await this.runLoadTest(app, {
      duration: 60000, // 1 minute
      rps: 100, // 100 requests/second
    });

    // Capture profiles
    const profiles = {
      cpu_flamegraph: await this.generateFlamegraph(),
      cpu_hotspots: await this.analyzeCPU(),
      heap_snapshot: await this.captureHeapSnapshot(),
      memory_growth: await this.detectMemoryLeak(),
    };

    return profiles;
  }
}
```

**Artifacts Captured:**
- `tmp/perf-profiles/[session]/cpu_flamegraph.svg` - CPU flamegraph
- `tmp/perf-profiles/[session]/heap_snapshot.heapsnapshot` - Memory dump
- `tmp/perf-profiles/[session]/memory_timeline.png` - Memory over time

---

### 6. Infrastructure → Live Metrics

**Observable Artifact:** Real system metrics during chaos tests
**Tool:** Chaos engineering + monitoring
**What We Observe:** System behavior under failure
**Why Better Than Static:** Architecture diagrams don't show failure modes

**Implementation:**

```typescript
class InfraObservationCritic extends Critic {
  async run() {
    // 1. CAPTURE: Run chaos experiments
    const experiments = await this.runChaosExperiments();

    // 2. ANALYZE: Check resilience
    const issues = [];

    for (const experiment of experiments) {
      if (!experiment.recovered) {
        issues.push({
          severity: 'critical',
          scenario: experiment.name,
          issue: `System did not recover from ${experiment.failure}`,
          suggestion: 'Add health checks and auto-restart',
          metrics: experiment.metrics_screenshot,
        });
      }

      if (experiment.recovery_time > 60000) {
        issues.push({
          severity: 'high',
          scenario: experiment.name,
          issue: `Recovery took ${experiment.recovery_time}ms (target: <60s)`,
          suggestion: 'Reduce failover time or add circuit breakers',
        });
      }
    }

    return { issues };
  }

  private async runChaosExperiments() {
    const experiments = [];

    // Experiment 1: Kill primary database
    experiments.push(await this.runExperiment({
      name: 'Database failover',
      failure: 'Kill primary database',
      action: () => this.killProcess('postgres-primary'),
      expectedRecovery: 'Failover to replica',
    }));

    // Experiment 2: Network partition
    experiments.push(await this.runExperiment({
      name: 'Network partition',
      failure: 'Block traffic to service',
      action: () => this.blockTraffic('api-service'),
      expectedRecovery: 'Degrade gracefully',
    }));

    return experiments;
  }
}
```

**Artifacts Captured:**
- `tmp/chaos-tests/[session]/db_failover_metrics.png` - Metrics during test
- `tmp/chaos-tests/[session]/recovery_timeline.json` - Recovery data
- `tmp/chaos-tests/[session]/error_logs.txt` - Errors during failure

---

## The Universal Implementation Template

For ANY domain:

```typescript
class DomainObservationCritic extends Critic {
  async run(profile: string) {
    // 1. CAPTURE: Get observable artifacts
    const artifacts = await this.captureRuntimeArtifacts();

    // 2. ANALYZE: Apply domain principles
    const issues = await this.analyzePrinciples(artifacts);

    // 3. VISUALIZE: Generate report
    const report = {
      score: this.calculateScore(issues),
      issues: issues,
      artifacts: artifacts.paths,
      inspirations: this.generateOpportunities(artifacts),
    };

    // 4. SAVE: Persist for iteration
    await this.saveReport(report);

    return this.formatResult(report);
  }

  private async captureRuntimeArtifacts() {
    // Domain-specific: What to observe?
    // - UX: Screenshots
    // - API: Request traces
    // - Data: Distribution plots
    // - DB: Query plans
    // - Perf: Flamegraphs
    // - Infra: Chaos test metrics
  }

  private async analyzePrinciples(artifacts) {
    // Domain-specific: What principles to check?
    // - UX: Visual hierarchy, contrast, spacing
    // - API: Latency, error handling, schema
    // - Data: Distribution, leakage, drift
    // - DB: Indexes, query time, locks
    // - Perf: CPU, memory, I/O
    // - Infra: Recovery, failover, monitoring
  }
}
```

---

## Comparison Table

| Domain | Static Analysis | Runtime Observation | Improvement |
|--------|----------------|--------------------|-----------|
| **UX** | Lint CSS | **Screenshot + visual analysis** | See actual layout issues |
| **API** | Read OpenAPI spec | **Call APIs + trace** | See real latency/errors |
| **Data** | Check schema | **Plot distributions + stats** | See drift/leakage |
| **DB** | Review schema | **Profile queries + EXPLAIN** | See actual bottlenecks |
| **Perf** | Big-O analysis | **Flamegraph + profiling** | See real hot paths |
| **Infra** | Read diagrams | **Chaos tests + metrics** | See failure modes |

---

## Configuration Pattern

Each critic gets a config file (like `screenshot_config.yaml`):

**API Config:** `state/api_observation_config.yaml`
```yaml
endpoints:
  - url: "/api/forecast"
    method: POST
    valid_data: { location_id: 1, date: "2025-01-01" }
  - url: "/api/catalog"
    method: GET

load_test:
  concurrent: 100
  duration: 60000

thresholds:
  max_latency_ms: 500
  max_error_rate: 0.01
```

**Data Config:** `state/data_observation_config.yaml`
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
  max_drift: 0.15
  max_correlation: 0.95
```

---

## The Power: Iteration + Inspiration

Just like Playwright for UX, each observation critic provides:

1. **Evidence** - Actual artifacts (plots, traces, flamegraphs)
2. **Issues** - Specific problems with severity
3. **Suggestions** - Actionable fixes
4. **Opportunities** - Inspired improvements
5. **Tracking** - Score over time

**Example API Inspiration:**
```
Pattern: Response caching
Observation: GET /api/catalog returns same data 95% of time
Opportunity: Add Cache-Control header (5min cache)
  → Reduces load by 95%
  → Improves P95 latency from 230ms to 5ms
```

**Example Data Inspiration:**
```
Pattern: Feature engineering
Observation: Temperature and feels_like are highly correlated (0.92)
Opportunity: Create temperature_delta = feels_like - temperature
  → New feature may capture wind/humidity effects
  → Could improve model accuracy
```

---

## Implementation Priority

1. **✅ UX (Done)** - DesignSystemVisualCritic
2. **⚡ API (Next)** - Most impactful for backends
3. **📊 Data (Next)** - Critical for ML products
4. **🗄️ Database** - After API
5. **⚡ Performance** - After Database
6. **🏗️ Infrastructure** - After Performance

---

## Summary

**Yes, there is an efficient way!**

The pattern is:
1. Find the domain's "screenshots" (observable artifacts)
2. Capture them during runtime (not static analysis)
3. Analyze with domain principles
4. Generate issues + inspiration
5. Track improvements over iterations

**Tools you can use:**
- **API:** Playwright for APIs, Postman tests, k6 load testing
- **Data:** matplotlib/plotly, pandas profiling, Great Expectations
- **DB:** EXPLAIN ANALYZE, pg_stat_statements, slow query log
- **Perf:** Node --prof, py-spy, flamegraph.pl
- **Infra:** Chaos Mesh, Gremlin, Litmus Chaos

**The breakthrough insight:**
> Static analysis tells you what the code says.
> Runtime observation tells you what the system actually does.

For every domain, prefer observation over analysis.

---

*Next Steps: Implement APIObservationCritic using the pattern above*
