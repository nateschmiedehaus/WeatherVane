/**
 * APIObservationCritic - Runtime API testing and performance analysis
 *
 * Observes:
 * - Actual API latency and throughput
 * - Error handling behavior
 * - Response schema validation
 * - Rate limiting and throttling
 * - Load test resilience
 *
 * Philosophy: Call the APIs, don't just read the OpenAPI spec
 */

import { Critic, type CriticResult } from "./base.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logInfo, logWarning, logError } from "../telemetry/logger.js";
import { spawn, type ChildProcess } from "node:child_process";

export interface APITrace {
  endpoint: string;
  method: string;
  status: number;
  duration: number;
  size: number;
  error?: string;
  headers?: Record<string, string>;
}

export interface LoadTestResult {
  endpoint: string;
  requests: number;
  successes: number;
  failures: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number; // requests per second
}

export interface APIIssue {
  severity: "critical" | "high" | "medium" | "low";
  endpoint: string;
  issue: string;
  suggestion: string;
  trace?: APITrace;
}

export interface APIOpportunity {
  pattern: string;
  observation: string;
  opportunity: string;
  endpoint: string;
}

export interface APIReport {
  overall_score: number;
  endpoints_tested: number;
  issues: APIIssue[];
  opportunities: APIOpportunity[];
  traces: APITrace[];
  load_tests: LoadTestResult[];
  timestamp: string;
}

export class APIObservationCritic extends Critic {
  name = "api_observation";
  description = "Runtime API testing and performance analysis";

  private devServer: ChildProcess | null = null;
  private config: {
    baseURL: string;
    endpoints: Array<{
      path: string;
      method: string;
      validData?: any;
      malformedData?: any;
    }>;
    thresholds: {
      maxLatencyMs: number;
      maxErrorRate: number;
    };
    devServer?: {
      command: string;
      port: number;
      readyCheck: string;
    };
  };

  constructor(workspaceRoot: string) {
    super(workspaceRoot);

    // Default config - can be overridden by loading from file
    this.config = {
      baseURL: 'http://localhost:3000',
      endpoints: [
        { path: '/api/health', method: 'GET' },
        { path: '/api/forecast', method: 'POST', validData: { location_id: 1, date: '2025-01-01' } },
        { path: '/api/catalog', method: 'GET' },
      ],
      thresholds: {
        maxLatencyMs: 500,
        maxErrorRate: 0.01,
      },
      devServer: {
        command: 'npm run dev',
        port: 3000,
        readyCheck: 'http://localhost:3000/api/health',
      },
    };
  }

  protected command(_profile: string): string | null {
    return null; // Runtime observation, not shell commands
  }

  async run(profile: string): Promise<CriticResult> {
    logInfo('APIObservationCritic starting', { profile });

    try {
      // Load config if exists
      await this.loadConfig();

      // Start dev server if configured
      const serverStarted = await this.ensureServerRunning();
      if (!serverStarted) {
        return this.fail(
          'Failed to start dev server',
          'Check that the server command is correct and port is available'
        );
      }

      // Capture API traces
      const traces = await this.captureAPITraces();

      // Run load tests on critical endpoints
      const loadTests = await this.runLoadTests();

      // Analyze results
      const report = this.analyzeResults(traces, loadTests);

      // Save report
      await this.saveReport(report);

      // Stop dev server if we started it
      if (this.devServer) {
        await this.stopServer();
      }

      // Return result
      return await this.formatResult(report, profile);
    } catch (error) {
      logError('APIObservationCritic failed', { error });

      if (this.devServer) {
        await this.stopServer();
      }

      return this.fail(
        'API observation failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.workspaceRoot, 'state', 'api_observation_config.yaml');

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      // TODO: Parse YAML - for now using defaults
      logInfo('Using default API observation config');
    } catch {
      logInfo('No config file found, using defaults');
    }
  }

  private async ensureServerRunning(): Promise<boolean> {
    if (!this.config.devServer) {
      logInfo('No dev server config, assuming server is running');
      return true;
    }

    // Check if already running
    if (await this.isServerRunning()) {
      logInfo('Server already running');
      return true;
    }

    // Start server
    logInfo('Starting dev server', { command: this.config.devServer.command });

    this.devServer = spawn(this.config.devServer.command, [], {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });

    this.devServer.unref();

    // Wait for server to be ready
    return await this.waitForServer(30000);
  }

  private async isServerRunning(): Promise<boolean> {
    if (!this.config.devServer) return true;

    try {
      const response = await fetch(this.config.devServer.readyCheck, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok || response.status === 404;
    } catch {
      return false;
    }
  }

  private async waitForServer(maxWaitMs: number): Promise<boolean> {
    if (!this.config.devServer) return true;

    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      if (await this.isServerRunning()) {
        logInfo('Server ready');
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logError('Server failed to start within timeout');
    return false;
  }

  private async captureAPITraces(): Promise<APITrace[]> {
    const traces: APITrace[] = [];

    logInfo(`Testing ${this.config.endpoints.length} endpoints`);

    for (const endpoint of this.config.endpoints) {
      // Test with valid data
      const validTrace = await this.callEndpoint(endpoint.path, endpoint.method, endpoint.validData);
      traces.push(validTrace);

      // Test with malformed data if POST/PUT
      if ((endpoint.method === 'POST' || endpoint.method === 'PUT') && endpoint.malformedData) {
        const malformedTrace = await this.callEndpoint(
          endpoint.path,
          endpoint.method,
          endpoint.malformedData
        );
        traces.push(malformedTrace);
      }

      // Test error handling (invalid route)
      if (endpoint.method === 'GET') {
        const errorTrace = await this.callEndpoint(`${endpoint.path}/nonexistent-12345`, 'GET');
        traces.push(errorTrace);
      }
    }

    return traces;
  }

  private async callEndpoint(path: string, method: string, data?: any): Promise<APITrace> {
    const url = `${this.config.baseURL}${path}`;
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method,
        headers: data ? { 'Content-Type': 'application/json' } : {},
        body: data ? JSON.stringify(data) : undefined,
        signal: AbortSignal.timeout(10000),
      });

      const duration = Date.now() - start;
      const text = await response.text();

      return {
        endpoint: path,
        method,
        status: response.status,
        duration,
        size: text.length,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch (error) {
      return {
        endpoint: path,
        method,
        status: 0,
        duration: Date.now() - start,
        size: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runLoadTests(): Promise<LoadTestResult[]> {
    const results: LoadTestResult[] = [];

    // Only load test GET endpoints for safety
    const getEndpoints = this.config.endpoints.filter(e => e.method === 'GET');

    for (const endpoint of getEndpoints.slice(0, 2)) { // Limit to 2 endpoints
      logInfo(`Load testing ${endpoint.path}`);

      const result = await this.loadTestEndpoint(endpoint.path, {
        concurrent: 10,
        requests: 100,
      });

      results.push(result);
    }

    return results;
  }

  private async loadTestEndpoint(
    path: string,
    options: { concurrent: number; requests: number }
  ): Promise<LoadTestResult> {
    const url = `${this.config.baseURL}${path}`;
    const durations: number[] = [];
    let successes = 0;
    let failures = 0;

    const startTime = Date.now();

    // Run requests in batches
    const batchSize = options.concurrent;
    const totalBatches = Math.ceil(options.requests / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const requests = Array(Math.min(batchSize, options.requests - batch * batchSize))
        .fill(null)
        .map(async () => {
          const start = Date.now();
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const duration = Date.now() - start;
            durations.push(duration);

            if (response.ok) {
              successes++;
            } else {
              failures++;
            }
          } catch {
            failures++;
            durations.push(5000); // Timeout duration
          }
        });

      await Promise.all(requests);
    }

    const totalDuration = Date.now() - startTime;
    durations.sort((a, b) => a - b);

    return {
      endpoint: path,
      requests: options.requests,
      successes,
      failures,
      p50: durations[Math.floor(durations.length * 0.5)] || 0,
      p95: durations[Math.floor(durations.length * 0.95)] || 0,
      p99: durations[Math.floor(durations.length * 0.99)] || 0,
      throughput: (options.requests / totalDuration) * 1000, // requests per second
    };
  }

  private analyzeResults(traces: APITrace[], loadTests: LoadTestResult[]): APIReport {
    const issues: APIIssue[] = [];
    const opportunities: APIOpportunity[] = [];

    // Analyze traces
    for (const trace of traces) {
      // Check latency
      if (trace.status >= 200 && trace.status < 300 && trace.duration > this.config.thresholds.maxLatencyMs) {
        issues.push({
          severity: trace.duration > 1000 ? 'high' : 'medium',
          endpoint: trace.endpoint,
          issue: `Latency ${trace.duration}ms exceeds ${this.config.thresholds.maxLatencyMs}ms target`,
          suggestion: 'Add caching, optimize database queries, or add indexes',
          trace,
        });
      }

      // Check error handling
      if (trace.status >= 500) {
        issues.push({
          severity: 'critical',
          endpoint: trace.endpoint,
          issue: `Server error: ${trace.status}`,
          suggestion: 'Check server logs and add proper error handling',
          trace,
        });
      }

      // Check for missing error handling (should return 4xx for bad input)
      if (trace.error && trace.status === 0) {
        issues.push({
          severity: 'high',
          endpoint: trace.endpoint,
          issue: `Request failed: ${trace.error}`,
          suggestion: 'Check endpoint exists and server is running',
          trace,
        });
      }

      // Suggest caching for fast endpoints
      if (trace.method === 'GET' && trace.duration < 50 && trace.status === 200) {
        opportunities.push({
          pattern: 'Response caching',
          observation: `${trace.endpoint} is fast (${trace.duration}ms)`,
          opportunity: 'Add Cache-Control header for CDN/browser caching',
          endpoint: trace.endpoint,
        });
      }

      // Check for missing compression
      if (trace.size > 10000 && !trace.headers?.['content-encoding']) {
        opportunities.push({
          pattern: 'Response compression',
          observation: `${trace.endpoint} returns ${(trace.size / 1024).toFixed(1)}KB uncompressed`,
          opportunity: 'Enable gzip/brotli compression for 70-90% size reduction',
          endpoint: trace.endpoint,
        });
      }
    }

    // Analyze load tests
    for (const loadTest of loadTests) {
      if (loadTest.p95 > this.config.thresholds.maxLatencyMs) {
        issues.push({
          severity: 'high',
          endpoint: loadTest.endpoint,
          issue: `P95 latency ${loadTest.p95}ms under load exceeds ${this.config.thresholds.maxLatencyMs}ms`,
          suggestion: 'Optimize for concurrent requests, add connection pooling',
        });
      }

      const errorRate = loadTest.failures / loadTest.requests;
      if (errorRate > this.config.thresholds.maxErrorRate) {
        issues.push({
          severity: 'critical',
          endpoint: loadTest.endpoint,
          issue: `Error rate ${(errorRate * 100).toFixed(1)}% under load exceeds ${this.config.thresholds.maxErrorRate * 100}% threshold`,
          suggestion: 'Add rate limiting, connection pooling, and error recovery',
        });
      }
    }

    // Calculate score
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;

    const penalty = (criticalCount * 25) + (highCount * 15) + (mediumCount * 5);
    const overall_score = Math.max(0, 100 - penalty);

    return {
      overall_score,
      endpoints_tested: this.config.endpoints.length,
      issues,
      opportunities,
      traces,
      load_tests: loadTests,
      timestamp: new Date().toISOString(),
    };
  }

  private async saveReport(report: APIReport): Promise<void> {
    const reportDir = path.join(this.workspaceRoot, 'state', 'critics');
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, 'api_observation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    logInfo('API observation report saved', { path: reportPath });
  }

  private async formatResult(report: APIReport, profile: string): Promise<CriticResult> {
    const threshold = profile === 'high' ? 80 : profile === 'medium' ? 70 : 60;

    const lines: string[] = [];

    lines.push(`**Overall Score:** ${report.overall_score}/100`);
    lines.push(`**Endpoints Tested:** ${report.endpoints_tested}`);
    lines.push('');

    if (report.issues.length > 0) {
      lines.push(`**Issues Found (${report.issues.length}):**`);
      const bySeverity = {
        critical: report.issues.filter(i => i.severity === 'critical'),
        high: report.issues.filter(i => i.severity === 'high'),
        medium: report.issues.filter(i => i.severity === 'medium'),
        low: report.issues.filter(i => i.severity === 'low'),
      };

      for (const [severity, issues] of Object.entries(bySeverity)) {
        if (issues.length > 0) {
          lines.push(`- **${severity.toUpperCase()}**: ${issues.length}`);
          for (const issue of issues.slice(0, 3)) {
            lines.push(`  - ${issue.endpoint}: ${issue.issue}`);
            lines.push(`    → *${issue.suggestion}*`);
          }
        }
      }
      lines.push('');
    }

    if (report.load_tests.length > 0) {
      lines.push(`**Load Test Results:**`);
      for (const test of report.load_tests) {
        lines.push(`- ${test.endpoint}: P95=${test.p95}ms, Success=${((test.successes / test.requests) * 100).toFixed(1)}%`);
      }
      lines.push('');
    }

    if (report.opportunities.length > 0) {
      lines.push(`**Optimization Opportunities (${report.opportunities.length}):**`);
      for (const opp of report.opportunities.slice(0, 5)) {
        lines.push(`- **${opp.pattern}**: ${opp.opportunity}`);
      }
      lines.push('');
    }

    lines.push(`**Full Report:** state/critics/api_observation_report.json`);

    const summary = lines.join('\n');

    if (report.overall_score >= threshold) {
      return await this.pass(
        `API observation passed: ${report.overall_score}/100`,
        summary
      );
    } else {
      return await this.fail(
        `API observation failed: ${report.overall_score}/100 (threshold: ${threshold})`,
        summary
      );
    }
  }

  private async stopServer(): Promise<void> {
    if (this.devServer) {
      try {
        this.devServer.kill('SIGTERM');
        logInfo('Dev server stopped');
      } catch (error) {
        logWarning('Failed to stop dev server', { error });
      }
    }
  }
}
