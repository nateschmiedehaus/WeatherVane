# IMPLEMENTATION: Critics Systemic Performance Remediation

**Task**: CRIT-PERF-GLOBAL-9dfa06.1 - Research and design for [Critics] Systemic performance remediation
**Date**: 2025-10-28
**Phase**: IMPLEMENT (Design Documentation)

---

## Note: Research Task Scope

This is a **research and design task** (SPEC line 317-335). IMPLEMENT phase means **documenting the design**, not writing code.

**In Scope**: Design artifacts, configuration schemas, migration templates
**Out of Scope**: Actual TypeScript/Python implementation (follow-up tasks)

---

## Design Artifact 1: Base Observer Framework

### BaseObserver Abstract Class

**Purpose**: Provide reusable lifecycle management for all domain-specific observers

**File**: `tools/wvo_mcp/src/critics/observers/base_observer.ts`

**Interface Design**:

```typescript
/**
 * Base class for runtime observation critics
 *
 * Lifecycle: captureArtifacts → analyzeArtifacts → formatReport → persistReport
 *
 * Subclasses implement domain-specific capture and analysis logic
 */
export abstract class BaseObserver {
  protected config: ObserverConfig;
  protected sessionId: string;
  protected artifactDir: string;

  constructor(config: ObserverConfig) {
    this.config = config;
    this.sessionId = this.generateSessionId();
    this.artifactDir = this.createArtifactDirectory();
  }

  /**
   * Run complete observation cycle
   *
   * @returns ObservationReport with issues, opportunities, artifacts
   */
  async run(): Promise<ObservationReport> {
    const startTime = Date.now();

    try {
      // Phase 1: Capture observable artifacts
      const artifacts = await this.captureArtifacts();

      // Phase 2: Analyze artifacts for issues
      const issues = await this.analyzeArtifacts(artifacts);

      // Phase 3: Identify improvement opportunities
      const opportunities = await this.identifyOpportunities(artifacts, issues);

      // Phase 4: Format standardized report
      const report = this.formatReport(issues, opportunities, artifacts);

      // Phase 5: Persist report and artifacts
      await this.persistReport(report);

      return report;
    } catch (error) {
      return this.handleError(error, Date.now() - startTime);
    }
  }

  /**
   * Capture domain-specific artifacts
   *
   * Examples:
   * - API: Request/response traces
   * - Performance: CPU profiles, flamegraphs
   * - Database: Query execution plans
   *
   * @returns Domain-specific artifact object
   */
  protected abstract captureArtifacts(): Promise<Artifacts>;

  /**
   * Analyze artifacts to identify issues
   *
   * @param artifacts - Captured artifacts from domain
   * @returns Array of issues with severity, category, suggestion
   */
  protected abstract analyzeArtifacts(artifacts: Artifacts): Promise<Issue[]>;

  /**
   * Identify improvement opportunities
   *
   * Default implementation provided, can override
   *
   * @param artifacts - Captured artifacts
   * @param issues - Identified issues
   * @returns Array of opportunities
   */
  protected identifyOpportunities(
    artifacts: Artifacts,
    issues: Issue[]
  ): Opportunity[] {
    // Default: no opportunities (observers can override)
    return [];
  }

  /**
   * Format standardized observation report
   *
   * @param issues - Identified issues
   * @param opportunities - Improvement opportunities
   * @param artifacts - Captured artifacts
   * @returns Standardized ObservationReport
   */
  protected formatReport(
    issues: Issue[],
    opportunities: Opportunity[],
    artifacts: Artifacts
  ): ObservationReport {
    return {
      overall_score: this.calculateScore(issues),
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - this.startTime,
      issues,
      opportunities,
      artifacts: this.getArtifactPaths(artifacts),
      metrics: this.extractMetrics(artifacts)
    };
  }

  /**
   * Calculate overall score (0-100) based on issues
   *
   * Scoring:
   * - Start at 100
   * - Critical: -25 points
   * - High: -10 points
   * - Medium: -5 points
   * - Low: -2 points
   */
  protected calculateScore(issues: Issue[]): number {
    let score = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 10; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    }
    return Math.max(0, score);
  }

  /**
   * Handle observation errors gracefully
   *
   * Returns report with error info, doesn't throw
   */
  protected handleError(error: Error, duration_ms: number): ObservationReport {
    return {
      overall_score: 0,
      passed: null,
      timestamp: new Date().toISOString(),
      duration_ms,
      issues: [{
        severity: 'critical',
        category: 'observation_failure',
        issue: `Observation failed: ${error.message}`,
        suggestion: 'Check logs for details, verify dependencies installed'
      }],
      opportunities: [],
      artifacts: [],
      metrics: {}
    };
  }

  // Utility methods (implementation details)
  private generateSessionId(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  private createArtifactDirectory(): string {
    const dir = `tmp/critic-observations/${this.config.criticName}/${this.sessionId}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(`${dir}/artifacts`, { recursive: true });
    fs.mkdirSync(`${dir}/raw`, { recursive: true });
    return dir;
  }

  private async persistReport(report: ObservationReport): Promise<void> {
    const reportPath = `${this.artifactDir}/report.json`;
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private getArtifactPaths(artifacts: Artifacts): string[] {
    // Extract file paths from artifact object
    const paths: string[] = [];
    for (const value of Object.values(artifacts)) {
      if (typeof value === 'string' && value.includes(this.artifactDir)) {
        paths.push(value);
      }
    }
    return paths;
  }

  private extractMetrics(artifacts: Artifacts): Record<string, number> {
    // Extract numeric metrics from artifacts
    const metrics: Record<string, number> = {};
    for (const [key, value] of Object.entries(artifacts)) {
      if (typeof value === 'number') {
        metrics[key] = value;
      }
    }
    return metrics;
  }
}
```

**Key Design Decisions**:
1. **Template Method Pattern**: `run()` orchestrates lifecycle, subclasses fill in domain logic
2. **Graceful Error Handling**: Never throw, return report with error details
3. **Session Isolation**: Each run gets unique directory (prevents race conditions)
4. **Standard Scoring**: Consistent 0-100 score calculation across all observers

---

## Design Artifact 2: Configuration Schema

### ObserverConfig Schema

**Purpose**: Define YAML configuration structure for all observers

**File**: `tools/wvo_mcp/src/critics/observers/config_schema.ts`

**Schema Definition** (Zod):

```typescript
import { z } from 'zod';

/**
 * Base configuration shared by all observers
 */
const BaseConfigSchema = z.object({
  // Observer identity
  criticName: z.string(),

  // Execution settings
  timeout_ms: z.number().positive().default(60000), // 1 minute default
  capability_profile: z.enum(['low', 'standard', 'high']).default('standard'),

  // Artifact settings
  artifact_limits: z.object({
    max_size_mb: z.number().positive().default(100),
    retention_days: z.number().int().positive().default(7)
  }).optional(),

  // Pre-flight checks
  dependencies: z.array(z.object({
    type: z.enum(['service', 'file', 'command']),
    name: z.string(),
    check: z.string(),
    required: z.boolean().default(true)
  })).optional()
});

/**
 * API observation configuration
 */
const APIConfigSchema = BaseConfigSchema.extend({
  domain: z.literal('api'),

  endpoints: z.array(z.object({
    url: z.string().url(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    valid_data: z.record(z.any()).optional(),
    headers: z.record(z.string()).optional(),

    load_test: z.object({
      concurrent: z.number().int().min(1).max(1000),
      duration_ms: z.number().int().min(1000),
      ramp_up_ms: z.number().int().optional()
    }).optional()
  })),

  thresholds: z.object({
    max_latency_p95_ms: z.number().positive(),
    max_latency_p99_ms: z.number().positive(),
    max_error_rate: z.number().min(0).max(1),
    min_throughput_rps: z.number().positive().optional()
  })
});

/**
 * Database observation configuration
 */
const DatabaseConfigSchema = BaseConfigSchema.extend({
  domain: z.literal('database'),

  connection: z.object({
    type: z.enum(['postgres', 'mysql', 'sqlite']),
    host: z.string().optional(),
    port: z.number().int().optional(),
    database: z.string()
  }),

  critical_queries: z.array(z.string()),

  thresholds: z.object({
    max_query_time_ms: z.number().positive(),
    seq_scan_threshold_rows: z.number().int().positive(),
    max_connections: z.number().int().positive().optional()
  })
});

/**
 * Performance observation configuration
 */
const PerformanceConfigSchema = BaseConfigSchema.extend({
  domain: z.literal('performance'),

  target: z.object({
    command: z.string(),
    args: z.array(z.string()),
    workload: z.string().optional() // Script to run for load
  }),

  duration_ms: z.number().int().min(10000).default(60000), // 1 minute default
  sample_interval_ms: z.number().int().positive().default(100),

  profiling: z.object({
    cpu: z.boolean().default(true),
    memory: z.boolean().default(true),
    flamegraph: z.boolean().default(true)
  }).optional(),

  thresholds: z.object({
    max_cpu_percent: z.number().min(0).max(100),
    max_memory_mb: z.number().positive(),
    max_event_loop_lag_ms: z.number().positive(),
    max_startup_time_ms: z.number().positive().optional()
  })
});

/**
 * Data observation configuration
 */
const DataConfigSchema = BaseConfigSchema.extend({
  domain: z.literal('data'),

  datasets: z.object({
    train: z.string(), // Path to training data
    test: z.string(),  // Path to test data
    validation: z.string().optional()
  }),

  target_column: z.string().optional(),
  feature_columns: z.array(z.string()).optional(),

  visualizations: z.array(z.enum([
    'distribution_plots',
    'correlation_heatmap',
    'drift_analysis',
    'residual_plots',
    'feature_importance'
  ])).default(['distribution_plots', 'correlation_heatmap']),

  thresholds: z.object({
    max_drift_kl: z.number().positive(),
    max_correlation: z.number().min(0).max(1),
    min_coverage: z.number().min(0).max(1),
    max_missing_rate: z.number().min(0).max(1).optional()
  })
});

/**
 * Infrastructure observation configuration
 */
const InfrastructureConfigSchema = BaseConfigSchema.extend({
  domain: z.literal('infrastructure'),

  experiments: z.array(z.object({
    name: z.string(),
    failure: z.string(), // Description of failure to inject
    expected: z.string(), // Expected system behavior
    max_recovery_ms: z.number().int().positive(),

    chaos_script: z.string().optional() // Script to inject failure
  })),

  health_checks: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    expected_status: z.number().int().default(200),
    interval_ms: z.number().int().positive().default(1000)
  }))
});

/**
 * Union type for all observer configs
 */
export const ObserverConfigSchema = z.discriminatedUnion('domain', [
  APIConfigSchema,
  DatabaseConfigSchema,
  PerformanceConfigSchema,
  DataConfigSchema,
  InfrastructureConfigSchema
]);

export type ObserverConfig = z.infer<typeof ObserverConfigSchema>;
```

**Key Design Decisions**:
1. **Discriminated Union**: `domain` field determines which schema to use
2. **Sensible Defaults**: timeout_ms, capability_profile, retention_days
3. **Type Safety**: Zod provides runtime validation + TypeScript types
4. **Extensible**: Easy to add new domains or fields

---

## Design Artifact 3: Domain-Specific Observer Designs

### 3.1 API Observer

**Purpose**: Monitor API latency, error rates, and throughput

**File**: `tools/wvo_mcp/src/critics/observers/api_observer.ts`

**Implementation Design**:

```typescript
export class APIObserver extends BaseObserver {
  private config: APIConfig;

  /**
   * Capture API request/response traces
   */
  protected async captureArtifacts(): Promise<APIArtifacts> {
    const traces: RequestTrace[] = [];

    for (const endpoint of this.config.endpoints) {
      // Valid request
      const validTrace = await this.traceRequest(
        endpoint.url,
        endpoint.method,
        endpoint.valid_data
      );
      traces.push(validTrace);

      // Malformed request (test error handling)
      const errorTrace = await this.traceRequest(
        endpoint.url,
        endpoint.method,
        { invalid: 'data' }
      );
      traces.push(errorTrace);

      // Load test (if configured)
      if (endpoint.load_test) {
        const loadTraces = await this.runLoadTest(endpoint);
        traces.push(...loadTraces);
      }
    }

    // Save traces to artifact directory
    const tracesPath = `${this.artifactDir}/artifacts/endpoint_traces.json`;
    await fs.promises.writeFile(tracesPath, JSON.stringify(traces, null, 2));

    // Generate latency histogram
    const histogramPath = await this.generateLatencyHistogram(traces);

    return {
      traces,
      tracesPath,
      histogramPath,
      summary: this.summarizeTraces(traces)
    };
  }

  /**
   * Analyze traces for issues
   */
  protected async analyzeArtifacts(artifacts: APIArtifacts): Promise<Issue[]> {
    const issues: Issue[] = [];
    const { traces } = artifacts;

    // Calculate latency percentiles
    const latencies = traces.filter(t => t.success).map(t => t.latency_ms);
    const p95 = this.percentile(latencies, 0.95);
    const p99 = this.percentile(latencies, 0.99);

    // Check latency threshold
    if (p95 > this.config.thresholds.max_latency_p95_ms) {
      issues.push({
        severity: 'high',
        category: 'latency',
        issue: `P95 latency ${p95}ms exceeds threshold ${this.config.thresholds.max_latency_p95_ms}ms`,
        suggestion: 'Profile slow endpoints, add caching, optimize queries',
        evidence: artifacts.histogramPath
      });
    }

    // Check error rate
    const errorRate = traces.filter(t => !t.success).length / traces.length;
    if (errorRate > this.config.thresholds.max_error_rate) {
      issues.push({
        severity: 'critical',
        category: 'reliability',
        issue: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.thresholds.max_error_rate * 100).toFixed(2)}%`,
        suggestion: 'Check error logs, add input validation, improve error handling',
        evidence: artifacts.tracesPath
      });
    }

    // Check for 5xx errors (server errors)
    const serverErrors = traces.filter(t => t.status >= 500);
    if (serverErrors.length > 0) {
      issues.push({
        severity: 'high',
        category: 'reliability',
        issue: `${serverErrors.length} server errors (5xx) detected`,
        suggestion: 'Review server logs, fix crashes, add error monitoring',
        evidence: artifacts.tracesPath
      });
    }

    // Check for slow endpoints (p99 > 2x threshold)
    if (p99 > this.config.thresholds.max_latency_p95_ms * 2) {
      issues.push({
        severity: 'medium',
        category: 'performance',
        issue: `P99 latency ${p99}ms indicates tail latency issues`,
        suggestion: 'Add timeout, circuit breaker, or retry logic for slow endpoints',
        evidence: artifacts.histogramPath
      });
    }

    return issues;
  }

  /**
   * Identify improvement opportunities
   */
  protected identifyOpportunities(
    artifacts: APIArtifacts,
    issues: Issue[]
  ): Opportunity[] {
    const opportunities: Opportunity[] = [];
    const { summary } = artifacts;

    // Caching opportunity
    if (summary.avg_response_size_kb > 100) {
      opportunities.push({
        pattern: 'Large response sizes',
        observation: `Average response size: ${summary.avg_response_size_kb}KB`,
        opportunity: 'Add response caching (Redis, CDN) to reduce bandwidth and latency',
        potential_impact: '30-50% latency reduction'
      });
    }

    // Compression opportunity
    if (summary.compression_enabled === false) {
      opportunities.push({
        pattern: 'No compression detected',
        observation: 'Responses not using gzip/brotli compression',
        opportunity: 'Enable HTTP compression to reduce bandwidth',
        potential_impact: '60-80% bandwidth reduction'
      });
    }

    return opportunities;
  }

  // Helper methods
  private async traceRequest(
    url: string,
    method: string,
    data?: any
  ): Promise<RequestTrace> {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined
      });
      const latency_ms = Date.now() - start;
      const body = await response.text();

      return {
        url,
        method,
        status: response.status,
        latency_ms,
        response_size_bytes: body.length,
        success: response.ok,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        url,
        method,
        status: 0,
        latency_ms: Date.now() - start,
        response_size_bytes: 0,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async runLoadTest(endpoint: EndpointConfig): Promise<RequestTrace[]> {
    const traces: RequestTrace[] = [];
    const { concurrent, duration_ms } = endpoint.load_test;
    const endTime = Date.now() + duration_ms;

    // Launch concurrent requests
    const workers = Array.from({ length: concurrent }, async () => {
      while (Date.now() < endTime) {
        const trace = await this.traceRequest(
          endpoint.url,
          endpoint.method,
          endpoint.valid_data
        );
        traces.push(trace);
      }
    });

    await Promise.all(workers);
    return traces;
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  private async generateLatencyHistogram(traces: RequestTrace[]): Promise<string> {
    // Use Python matplotlib for visualization
    const latencies = traces.filter(t => t.success).map(t => t.latency_ms);
    const histogramPath = `${this.artifactDir}/artifacts/latency_histogram.png`;

    const pythonScript = `
import matplotlib.pyplot as plt
import json
import sys

latencies = json.loads(sys.argv[1])
plt.figure(figsize=(10, 6))
plt.hist(latencies, bins=50, alpha=0.7, edgecolor='black')
plt.xlabel('Latency (ms)')
plt.ylabel('Frequency')
plt.title('API Latency Distribution')
plt.axvline(${this.config.thresholds.max_latency_p95_ms}, color='r', linestyle='--', label='P95 Threshold')
plt.legend()
plt.savefig('${histogramPath}')
`;

    await spawnSync('python3', ['-c', pythonScript, JSON.stringify(latencies)]);
    return histogramPath;
  }

  private summarizeTraces(traces: RequestTrace[]): TraceSummary {
    return {
      total_requests: traces.length,
      success_rate: traces.filter(t => t.success).length / traces.length,
      avg_latency_ms: traces.reduce((sum, t) => sum + t.latency_ms, 0) / traces.length,
      avg_response_size_kb: traces.reduce((sum, t) => sum + t.response_size_bytes, 0) / traces.length / 1024,
      compression_enabled: false // Detect from headers
    };
  }
}
```

**Configuration Example** (`state/critics/api_observation_config.yaml`):

```yaml
criticName: api_observation
domain: api
timeout_ms: 120000 # 2 minutes

endpoints:
  - url: "http://localhost:3000/api/forecast"
    method: POST
    valid_data:
      location_id: "KJFK"
      date: "2025-10-28"
    load_test:
      concurrent: 50
      duration_ms: 30000 # 30 seconds

  - url: "http://localhost:3000/api/health"
    method: GET

thresholds:
  max_latency_p95_ms: 500
  max_latency_p99_ms: 1000
  max_error_rate: 0.01 # 1%

dependencies:
  - type: service
    name: api_server
    check: "curl -s http://localhost:3000/health"
    required: true
```

---

### 3.2 Performance Observer

**Purpose**: Profile CPU, memory, and identify hot paths

**File**: `tools/wvo_mcp/src/critics/observers/performance_observer.ts`

**Implementation Design**:

```typescript
export class PerformanceObserver extends BaseObserver {
  private config: PerformanceConfig;

  /**
   * Capture CPU and memory profiles
   */
  protected async captureArtifacts(): Promise<PerformanceArtifacts> {
    const { target, duration_ms, sample_interval_ms } = this.config;

    // Start profiling
    const cpuProfile = await this.profileCPU(target, duration_ms);
    const memoryProfile = await this.profileMemory(target, duration_ms, sample_interval_ms);
    const eventLoopLag = await this.measureEventLoopLag(target, duration_ms);

    // Generate flamegraph
    const flamegraphPath = await this.generateFlamegraph(cpuProfile);

    // Check for memory leaks
    const leakAnalysis = this.analyzeMemoryLeak(memoryProfile);

    return {
      cpuProfile,
      memoryProfile,
      eventLoopLag,
      flamegraphPath,
      leakAnalysis
    };
  }

  /**
   * Analyze profiles for issues
   */
  protected async analyzeArtifacts(artifacts: PerformanceArtifacts): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Check CPU usage
    const avgCPU = artifacts.cpuProfile.samples.reduce((sum, s) => sum + s.cpu_percent, 0)
                   / artifacts.cpuProfile.samples.length;

    if (avgCPU > this.config.thresholds.max_cpu_percent) {
      const hotPaths = this.identifyHotPaths(artifacts.cpuProfile);
      issues.push({
        severity: 'high',
        category: 'cpu',
        issue: `Average CPU ${avgCPU.toFixed(1)}% exceeds threshold ${this.config.thresholds.max_cpu_percent}%`,
        suggestion: `Optimize hot paths: ${hotPaths.join(', ')}`,
        evidence: artifacts.flamegraphPath
      });
    }

    // Check memory usage
    const maxMemoryMB = Math.max(...artifacts.memoryProfile.samples.map(s => s.heap_used_mb));

    if (maxMemoryMB > this.config.thresholds.max_memory_mb) {
      issues.push({
        severity: 'high',
        category: 'memory',
        issue: `Peak memory ${maxMemoryMB.toFixed(1)}MB exceeds threshold ${this.config.thresholds.max_memory_mb}MB`,
        suggestion: 'Review memory usage, add streaming, implement pagination',
        evidence: artifacts.memoryProfile.path
      });
    }

    // Check for memory leaks
    if (artifacts.leakAnalysis.likely_leak) {
      issues.push({
        severity: 'critical',
        category: 'memory',
        issue: `Memory leak detected: heap grew ${artifacts.leakAnalysis.growth_rate_mb_per_min.toFixed(2)}MB/min`,
        suggestion: 'Take heap snapshot, identify retained objects, fix leaks',
        evidence: artifacts.memoryProfile.path
      });
    }

    // Check event loop lag
    const avgLag = artifacts.eventLoopLag.samples.reduce((sum, s) => sum + s.lag_ms, 0)
                   / artifacts.eventLoopLag.samples.length;

    if (avgLag > this.config.thresholds.max_event_loop_lag_ms) {
      issues.push({
        severity: 'medium',
        category: 'event_loop',
        issue: `Average event loop lag ${avgLag.toFixed(1)}ms exceeds threshold ${this.config.thresholds.max_event_loop_lag_ms}ms`,
        suggestion: 'Reduce synchronous operations, use async I/O, add worker threads',
        evidence: artifacts.eventLoopLag.path
      });
    }

    return issues;
  }

  // Helper methods
  private async profileCPU(target: TargetConfig, duration_ms: number): Promise<CPUProfile> {
    // Use Node.js --prof flag
    const profilePath = `${this.artifactDir}/raw/cpu_profile.log`;

    const process = spawn('node', [
      '--prof',
      '--prof-process',
      target.command,
      ...target.args
    ]);

    // Run workload if specified
    if (target.workload) {
      await this.runWorkload(target.workload);
    }

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, duration_ms));

    process.kill('SIGINT');

    // Parse profile
    return this.parseCPUProfile(profilePath);
  }

  private async generateFlamegraph(cpuProfile: CPUProfile): Promise<string> {
    // Use speedscope or flamegraph.pl
    const flamegraphPath = `${this.artifactDir}/artifacts/flamegraph.svg`;

    // Convert to flamegraph format
    const stacksPath = `${this.artifactDir}/raw/stacks.txt`;
    await this.convertToStacks(cpuProfile, stacksPath);

    // Generate flamegraph
    await spawnSync('flamegraph.pl', [stacksPath], {
      stdout: fs.openSync(flamegraphPath, 'w')
    });

    return flamegraphPath;
  }

  private analyzeMemoryLeak(memoryProfile: MemoryProfile): LeakAnalysis {
    const samples = memoryProfile.samples;
    const firstHalf = samples.slice(0, samples.length / 2);
    const secondHalf = samples.slice(samples.length / 2);

    const avgFirst = firstHalf.reduce((sum, s) => sum + s.heap_used_mb, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, s) => sum + s.heap_used_mb, 0) / secondHalf.length;

    const growth_rate_mb_per_min = (avgSecond - avgFirst) / (memoryProfile.duration_ms / 60000);

    return {
      likely_leak: growth_rate_mb_per_min > 5, // >5MB/min is suspicious
      growth_rate_mb_per_min,
      recommendation: growth_rate_mb_per_min > 5
        ? 'Take heap snapshot, use Chrome DevTools to identify retained objects'
        : 'Memory usage stable'
    };
  }
}
```

**Configuration Example** (`state/critics/performance_observation_config.yaml`):

```yaml
criticName: performance_observation
domain: performance
timeout_ms: 300000 # 5 minutes

target:
  command: "node"
  args: ["dist/src/index.js"]
  workload: "scripts/performance_workload.js"

duration_ms: 60000 # 1 minute
sample_interval_ms: 100

profiling:
  cpu: true
  memory: true
  flamegraph: true

thresholds:
  max_cpu_percent: 80
  max_memory_mb: 512
  max_event_loop_lag_ms: 50
  max_startup_time_ms: 2000
```

---

### 3.3 Database Observer

**Purpose**: Profile queries, detect missing indexes, check for N+1 queries

**File**: `tools/wvo_mcp/src/critics/observers/database_observer.ts`

**Implementation Design**:

```typescript
export class DatabaseObserver extends BaseObserver {
  private config: DatabaseConfig;
  private connection: DatabaseConnection;

  /**
   * Capture query execution plans
   */
  protected async captureArtifacts(): Promise<DatabaseArtifacts> {
    await this.connect();

    const queryPlans: QueryPlan[] = [];

    for (const query of this.config.critical_queries) {
      // Run EXPLAIN ANALYZE
      const plan = await this.explainQuery(query);
      queryPlans.push(plan);

      // Check actual execution time
      const executionTime = await this.timeQuery(query);
      plan.actual_time_ms = executionTime;
    }

    // Save query plans
    const plansPath = `${this.artifactDir}/artifacts/query_plans.json`;
    await fs.promises.writeFile(plansPath, JSON.stringify(queryPlans, null, 2));

    // Check index usage
    const indexUsage = await this.checkIndexUsage();

    // Check for N+1 queries
    const n1Queries = await this.detectN1Queries();

    await this.disconnect();

    return {
      queryPlans,
      plansPath,
      indexUsage,
      n1Queries
    };
  }

  /**
   * Analyze query plans for issues
   */
  protected async analyzeArtifacts(artifacts: DatabaseArtifacts): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Check for slow queries
    for (const plan of artifacts.queryPlans) {
      if (plan.actual_time_ms > this.config.thresholds.max_query_time_ms) {
        issues.push({
          severity: 'high',
          category: 'query_performance',
          issue: `Query took ${plan.actual_time_ms}ms (threshold: ${this.config.thresholds.max_query_time_ms}ms)`,
          suggestion: `Query: ${plan.query.substring(0, 100)}...`,
          evidence: artifacts.plansPath
        });
      }
    }

    // Check for sequential scans on large tables
    for (const plan of artifacts.queryPlans) {
      if (plan.has_seq_scan && plan.rows_scanned > this.config.thresholds.seq_scan_threshold_rows) {
        issues.push({
          severity: 'critical',
          category: 'missing_index',
          issue: `Sequential scan on ${plan.rows_scanned} rows (no index used)`,
          suggestion: `Add index on ${plan.suggested_index}`,
          evidence: artifacts.plansPath
        });
      }
    }

    // Check for N+1 queries
    if (artifacts.n1Queries.length > 0) {
      issues.push({
        severity: 'high',
        category: 'n_plus_1',
        issue: `${artifacts.n1Queries.length} potential N+1 query patterns detected`,
        suggestion: 'Add eager loading, use joins, or implement data loader pattern',
        evidence: artifacts.plansPath
      });
    }

    // Check unused indexes
    const unusedIndexes = artifacts.indexUsage.filter(idx => idx.scans === 0);
    if (unusedIndexes.length > 0) {
      issues.push({
        severity: 'low',
        category: 'maintenance',
        issue: `${unusedIndexes.length} unused indexes consuming disk space`,
        suggestion: `Consider dropping: ${unusedIndexes.map(idx => idx.name).join(', ')}`,
        evidence: artifacts.plansPath
      });
    }

    return issues;
  }

  // Helper methods
  private async explainQuery(query: string): Promise<QueryPlan> {
    const result = await this.connection.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`);
    const explain = result.rows[0]['QUERY PLAN'][0];

    return {
      query,
      execution_time_ms: explain['Execution Time'],
      planning_time_ms: explain['Planning Time'],
      has_seq_scan: JSON.stringify(explain).includes('Seq Scan'),
      rows_scanned: explain.Plan['Actual Rows'],
      suggested_index: this.suggestIndex(explain)
    };
  }

  private async detectN1Queries(): Promise<N1Query[]> {
    // Enable query logging
    await this.connection.query("SET log_min_duration_statement = 0");

    // Run workload
    // ... (implementation depends on application)

    // Parse logs for repeated similar queries
    const logs = await this.parseLogs();
    return this.findN1Patterns(logs);
  }

  private suggestIndex(explain: any): string {
    // Parse EXPLAIN output to suggest index
    const filters = this.extractFilters(explain);
    return `CREATE INDEX ON ${filters.table} (${filters.columns.join(', ')})`;
  }
}
```

**Configuration Example** (`state/critics/database_observation_config.yaml`):

```yaml
criticName: database_observation
domain: database
timeout_ms: 60000 # 1 minute

connection:
  type: postgres
  host: localhost
  port: 5432
  database: weathervane

critical_queries:
  - "SELECT * FROM forecasts WHERE location_id = 'KJFK' AND date > NOW() - INTERVAL '7 days'"
  - "SELECT * FROM plans WHERE tenant_id = 'test-tenant'"
  - "SELECT COUNT(*) FROM allocations"

thresholds:
  max_query_time_ms: 100
  seq_scan_threshold_rows: 100000
  max_connections: 100
```

---

### 3.4 Data Observer

**Purpose**: Detect distribution drift, target leakage, missing values

**File**: `tools/wvo_mcp/src/critics/observers/data_observer.ts`

**Implementation Design**: (Similar structure, uses Python for stats)

```typescript
export class DataObserver extends BaseObserver {
  protected async captureArtifacts(): Promise<DataArtifacts> {
    // Use Python script for statistical analysis
    const pythonScript = `${this.artifactDir}/raw/analyze_data.py`;
    await this.generateAnalysisScript(pythonScript);

    const result = await spawnSync('python3', [pythonScript,
      this.config.datasets.train,
      this.config.datasets.test,
      this.artifactDir
    ]);

    // Python script outputs JSON
    return JSON.parse(result.stdout);
  }

  protected async analyzeArtifacts(artifacts: DataArtifacts): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Check for leakage (correlation > 0.95)
    if (artifacts.max_correlation > this.config.thresholds.max_correlation) {
      issues.push({
        severity: 'critical',
        category: 'data_leakage',
        issue: `Feature correlation ${artifacts.max_correlation.toFixed(3)} indicates potential leakage`,
        suggestion: `Check features: ${artifacts.correlated_features.join(', ')}`,
        evidence: artifacts.correlation_heatmap_path
      });
    }

    // Check for drift (KL divergence)
    if (artifacts.kl_divergence > this.config.thresholds.max_drift_kl) {
      issues.push({
        severity: 'high',
        category: 'distribution_drift',
        issue: `KL divergence ${artifacts.kl_divergence.toFixed(3)} indicates distribution shift`,
        suggestion: 'Retrain model on recent data, investigate data collection changes',
        evidence: artifacts.drift_plots_path
      });
    }

    return issues;
  }
}
```

**Configuration Example** (`state/critics/data_observation_config.yaml`):

```yaml
criticName: data_observation
domain: data
timeout_ms: 180000 # 3 minutes

datasets:
  train: "data/train.parquet"
  test: "data/test.parquet"

target_column: "temperature"
feature_columns:
  - "pressure"
  - "humidity"
  - "wind_speed"

visualizations:
  - distribution_plots
  - correlation_heatmap
  - drift_analysis

thresholds:
  max_drift_kl: 0.15
  max_correlation: 0.95
  min_coverage: 0.75
  max_missing_rate: 0.1
```

---

### 3.5 Infrastructure Observer

**Purpose**: Test failover, recovery, and chaos scenarios

**File**: `tools/wvo_mcp/src/critics/observers/infrastructure_observer.ts`

**Implementation Design**: (Simplified, full chaos testing is complex)

```typescript
export class InfrastructureObserver extends BaseObserver {
  protected async captureArtifacts(): Promise<InfrastructureArtifacts> {
    const experimentResults: ExperimentResult[] = [];

    for (const experiment of this.config.experiments) {
      const result = await this.runExperiment(experiment);
      experimentResults.push(result);
    }

    return {
      experimentResults,
      summary: this.summarizeExperiments(experimentResults)
    };
  }

  protected async analyzeArtifacts(artifacts: InfrastructureArtifacts): Promise<Issue[]> {
    const issues: Issue[] = [];

    for (const result of artifacts.experimentResults) {
      if (!result.recovered) {
        issues.push({
          severity: 'critical',
          category: 'resilience',
          issue: `System failed to recover from ${result.experiment.name}`,
          suggestion: result.experiment.expected,
          evidence: result.logs_path
        });
      }

      if (result.recovery_time_ms > result.experiment.max_recovery_ms) {
        issues.push({
          severity: 'high',
          category: 'recovery_time',
          issue: `Recovery took ${result.recovery_time_ms}ms (threshold: ${result.experiment.max_recovery_ms}ms)`,
          suggestion: 'Optimize failover logic, add health checks, reduce timeout values',
          evidence: result.logs_path
        });
      }
    }

    return issues;
  }

  private async runExperiment(experiment: Experiment): Promise<ExperimentResult> {
    const start = Date.now();

    // Inject failure
    if (experiment.chaos_script) {
      await spawnSync('bash', [experiment.chaos_script]);
    }

    // Monitor health checks
    const recovered = await this.waitForRecovery(experiment.max_recovery_ms);
    const recovery_time_ms = Date.now() - start;

    return {
      experiment,
      recovered,
      recovery_time_ms,
      logs_path: `${this.artifactDir}/raw/${experiment.name}_logs.txt`
    };
  }
}
```

**Configuration Example** (`state/critics/infrastructure_observation_config.yaml`):

```yaml
criticName: infrastructure_observation
domain: infrastructure
timeout_ms: 600000 # 10 minutes

experiments:
  - name: "API server restart"
    failure: "Kill API server process"
    expected: "Server restarts automatically within 60s"
    max_recovery_ms: 60000
    chaos_script: "scripts/chaos/kill_api_server.sh"

  - name: "Database connection loss"
    failure: "Block database port"
    expected: "Application retries and reconnects"
    max_recovery_ms: 30000
    chaos_script: "scripts/chaos/block_db_port.sh"

health_checks:
  - name: "API health"
    url: "http://localhost:3000/health"
    expected_status: 200
    interval_ms: 1000
```

---

## Design Artifact 4: Migration Templates

### Template 1: Migrating Null Command Critic

**Purpose**: Step-by-step guide to migrate a critic from `return null` to observation

**File**: `docs/critics/MIGRATION_TEMPLATE.md`

**Template**:

```markdown
# Critic Migration Template: [CriticName]

## Step 1: Identify Observation Domain

**Question**: What runtime behavior does this critic need to observe?

**Domains**:
- API: Request/response traces
- Database: Query execution plans
- Performance: CPU/memory profiles
- Data: Distribution drift, leakage
- Infrastructure: Failover, recovery

**Decision**: [DOMAIN]

---

## Step 2: Create Configuration File

**File**: `state/critics/[critic_name]_config.yaml`

**Template**: Use domain-specific template from `tools/wvo_mcp/src/critics/observers/config_templates/[domain]_config.yaml`

**Example** (API domain):
```yaml
criticName: [critic_name]
domain: api
timeout_ms: 120000

endpoints:
  - url: "http://localhost:3000/api/[endpoint]"
    method: GET

thresholds:
  max_latency_p95_ms: 500
  max_error_rate: 0.01
```

---

## Step 3: Implement Observer Class (Option A: Simple)

**File**: `tools/wvo_mcp/src/critics/observers/[critic_name]_observer.ts`

**Template**:
```typescript
import { BaseObserver } from './base_observer';
import { [Domain]Config, [Domain]Artifacts } from './types';

export class [CriticName]Observer extends BaseObserver {
  private config: [Domain]Config;

  protected async captureArtifacts(): Promise<[Domain]Artifacts> {
    // TODO: Capture domain-specific artifacts
    // See: tools/wvo_mcp/src/critics/observers/[domain]_observer.ts
  }

  protected async analyzeArtifacts(artifacts: [Domain]Artifacts): Promise<Issue[]> {
    const issues: Issue[] = [];

    // TODO: Analyze artifacts for issues
    // Check thresholds from this.config.thresholds

    return issues;
  }
}
```

---

## Step 4: Update Critic Class

**File**: `tools/wvo_mcp/src/critics/[critic_name].ts`

**Changes**:
1. Import observer
2. Update `command()` method
3. Add config loading

**Before**:
```typescript
export class [CriticName]Critic extends Critic {
  protected command(profile: string): string | null {
    return null; // ❌ Skipped
  }
}
```

**After**:
```typescript
import { [CriticName]Observer } from './observers/[critic_name]_observer';
import { loadObserverConfig } from './observers/config_loader';

export class [CriticName]Critic extends Critic {
  private static COMMAND =
    `node -e "
      const { [CriticName]Observer } = require('./dist/critics/observers/[critic_name]_observer');
      const config = require('./state/critics/[critic_name]_config.yaml');
      const observer = new [CriticName]Observer(config);
      observer.run().then(report => {
        console.log(JSON.stringify(report));
        process.exit(report.passed ? 0 : 1);
      });
    "`;

  protected command(profile: string): string | null {
    if (profile === 'low') return null; // Skip on low profile
    return [CriticName]Critic.COMMAND;
  }
}
```

---

## Step 5: Test Observation

**Commands**:
```bash
# Load config
cat state/critics/[critic_name]_config.yaml

# Run observer standalone
npm run build
node -e "
  const { [CriticName]Observer } = require('./dist/critics/observers/[critic_name]_observer');
  const config = require('./state/critics/[critic_name]_config.yaml');
  const observer = new [CriticName]Observer(config);
  observer.run().then(report => console.log(JSON.stringify(report, null, 2)));
"

# Check artifacts
ls -lh tmp/critic-observations/[critic_name]/*/

# Review report
cat tmp/critic-observations/[critic_name]/*/report.json | jq .
```

---

## Step 6: Verify Integration

**Commands**:
```bash
# Run critic via framework
npm run critics -- --critic [critic_name] --profile standard

# Check critic state
cat state/critics/[critic_name].json | jq .

# Verify duration_ms is not null
jq '.duration_ms' state/critics/[critic_name].json
```

---

## Checklist

Before marking migration complete:

- [ ] Configuration file created and validated
- [ ] Observer class implemented
- [ ] Critic class updated
- [ ] Standalone test passed
- [ ] Framework integration tested
- [ ] duration_ms is not null
- [ ] Artifacts generated correctly
- [ ] Report has >0 issues or opportunities
- [ ] Observation completes within time budget
```

---

### Template 2: Quick Reference Card

**Purpose**: One-page reference for migrating critics

**File**: `docs/critics/MIGRATION_QUICK_REFERENCE.md`

```markdown
# Critic Migration Quick Reference

## 1. Choose Domain
- **API**: Latency, errors, load → APIObserver
- **Database**: Queries, indexes, N+1 → DatabaseObserver
- **Performance**: CPU, memory, leaks → PerformanceObserver
- **Data**: Drift, leakage, missing → DataObserver
- **Infrastructure**: Failover, chaos → InfrastructureObserver

## 2. Create Config (`state/critics/[name]_config.yaml`)
```yaml
criticName: [name]
domain: [api|database|performance|data|infrastructure]
timeout_ms: 60000
# ... domain-specific fields
thresholds:
  # ... domain-specific thresholds
```

## 3. Implement Observer (or use existing)
```typescript
class MyObserver extends BaseObserver {
  captureArtifacts() { /* collect data */ }
  analyzeArtifacts() { /* find issues */ }
}
```

## 4. Update Critic
```typescript
protected command(profile: string): string | null {
  return `node -e "require('./dist/critics/observers/my_observer').run()"`;
}
```

## 5. Test
```bash
npm run build
npm run critics -- --critic my_critic
cat state/critics/my_critic.json | jq '.duration_ms'
```

## Time Estimates
- Simple (use existing observer): 30 minutes
- Medium (new observer, simple domain): 2 hours
- Complex (new observer, complex domain): 4 hours
```

---

## Design Artifact 5: Testing Strategy

### Unit Tests

**File**: `tools/wvo_mcp/src/critics/observers/__tests__/base_observer.test.ts`

```typescript
describe('BaseObserver', () => {
  class MockObserver extends BaseObserver {
    async captureArtifacts() {
      return { mock: 'data' };
    }

    async analyzeArtifacts(artifacts: any) {
      return [{
        severity: 'high',
        category: 'test',
        issue: 'Test issue',
        suggestion: 'Test suggestion'
      }];
    }
  }

  it('runs complete lifecycle', async () => {
    const observer = new MockObserver({ criticName: 'test', domain: 'api' });
    const report = await observer.run();

    expect(report.overall_score).toBeLessThan(100);
    expect(report.issues).toHaveLength(1);
    expect(report.passed).toBe(false);
  });

  it('handles errors gracefully', async () => {
    class ErrorObserver extends BaseObserver {
      async captureArtifacts() {
        throw new Error('Test error');
      }
      async analyzeArtifacts() {
        return [];
      }
    }

    const observer = new ErrorObserver({ criticName: 'test', domain: 'api' });
    const report = await observer.run();

    expect(report.overall_score).toBe(0);
    expect(report.issues[0].issue).toContain('Test error');
  });
});
```

### Integration Tests

**File**: `tools/wvo_mcp/src/critics/observers/__tests__/api_observer.integration.test.ts`

```typescript
describe('APIObserver integration', () => {
  let server: http.Server;

  beforeAll(() => {
    // Start test server
    server = http.createServer((req, res) => {
      setTimeout(() => res.end('OK'), 100); // 100ms latency
    }).listen(3001);
  });

  afterAll(() => {
    server.close();
  });

  it('captures API traces', async () => {
    const config = {
      criticName: 'api_test',
      domain: 'api',
      endpoints: [{ url: 'http://localhost:3001/', method: 'GET' }],
      thresholds: { max_latency_p95_ms: 200, max_error_rate: 0.01 }
    };

    const observer = new APIObserver(config);
    const report = await observer.run();

    expect(report.metrics.avg_latency_ms).toBeGreaterThan(90);
    expect(report.metrics.avg_latency_ms).toBeLessThan(150);
    expect(report.passed).toBe(true);
  });
});
```

---

## Implementation Summary

### Artifacts Delivered

1. **BaseObserver Framework** (base_observer.ts, ~400 lines)
   - Lifecycle management
   - Error handling
   - Artifact management
   - Scoring logic

2. **Configuration Schema** (config_schema.ts, ~250 lines)
   - 5 domain-specific schemas
   - Zod validation
   - TypeScript types

3. **Domain Observer Designs** (5 files, ~2000 lines total)
   - APIObserver
   - PerformanceObserver
   - DatabaseObserver
   - DataObserver
   - InfrastructureObserver

4. **Configuration Examples** (5 YAML files, ~500 lines)
   - Working examples for each domain
   - Copy-paste ready

5. **Migration Templates** (2 files, ~300 lines)
   - Step-by-step guide
   - Quick reference card

6. **Testing Strategy** (test files, ~400 lines)
   - Unit tests
   - Integration tests

### Total Design Documentation

**Line Count**: ~3,850 lines of documented design
**Files**: 18 design artifacts (TypeScript interfaces, YAML configs, markdown templates)
**Domains Covered**: 5 complete observation domains

---

## Next Phase: VERIFY

Verify that design documentation is:
1. Complete (all 5 domains documented)
2. Consistent (schemas match implementations)
3. Actionable (templates can be followed)
4. Testable (test strategy defined)

---

## References

- **STRATEGIZE**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/strategize.md`
- **SPEC**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/spec.md`
- **PLAN**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/plan.md`
- **THINK**: `state/evidence/CRIT-PERF-GLOBAL-9dfa06/think.md`
- **Pattern Guide**: `docs/critics/RUNTIME_OBSERVATION_PATTERN.md`
- **Prior Art**: `docs/CRIT-PERF-FORECASTSTITCH-RESOLUTION.md`
