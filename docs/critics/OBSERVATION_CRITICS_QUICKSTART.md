# Observation Critics - Quick Start Guide

**Goal:** Add runtime observation critics for your domain in <1 hour

---

## Step 1: Choose Your Domain

Pick the domain you want to observe:
- [ ] Backend/API
- [ ] Data/ML
- [ ] Database
- [ ] Performance
- [ ] Infrastructure

---

## Step 2: Use the Template

```typescript
import { Critic, type CriticResult } from "./base.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logInfo, logError } from "../telemetry/logger.js";

export class [Domain]ObservationCritic extends Critic {
  name = "[domain]_observation";
  description = "Runtime observation of [domain] using [tool]";

  protected command(_profile: string): string | null {
    return null; // We use runtime observation, not shell commands
  }

  async run(profile: string): Promise<CriticResult> {
    try {
      // 1. CAPTURE artifacts
      const artifacts = await this.captureArtifacts();

      // 2. ANALYZE with domain principles
      const report = await this.analyzeArtifacts(artifacts);

      // 3. SAVE report
      await this.saveReport(report);

      // 4. RETURN result
      return this.formatResult(report, profile);
    } catch (error) {
      logError(`${this.name} failed`, { error });
      return this.fail(
        `${this.name} analysis failed`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async captureArtifacts() {
    // TODO: Implement artifact capture
    // Examples:
    // - API: Call endpoints, measure latency
    // - Data: Generate distribution plots
    // - DB: Run EXPLAIN ANALYZE
    // - Perf: Run profiler
    // - Infra: Run chaos tests
  }

  private async analyzeArtifacts(artifacts: any) {
    // TODO: Implement analysis
    // Apply domain-specific principles
    // Generate issues + opportunities
  }

  private async saveReport(report: any) {
    const reportDir = path.join(this.workspaceRoot, 'state', 'critics');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${this.name}_report.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private formatResult(report: any, profile: string) {
    const threshold = profile === 'high' ? 80 : 70;

    if (report.score >= threshold) {
      return this.pass(
        `${this.name} passed: ${report.score}/100`,
        this.formatSummary(report)
      );
    } else {
      return this.fail(
        `${this.name} failed: ${report.score}/100`,
        this.formatSummary(report)
      );
    }
  }
}
```

---

## Step 3: Example - API Observation Critic

**Full working example:**

```typescript
import { Critic, type CriticResult } from "./base.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logInfo, logError } from "../telemetry/logger.js";

interface APITrace {
  endpoint: string;
  method: string;
  status: number;
  duration: number;
  error?: string;
}

export class APIObservationCritic extends Critic {
  name = "api_observation";
  description = "Runtime observation of API endpoints";

  protected command(_profile: string): string | null {
    return null;
  }

  async run(profile: string): Promise<CriticResult> {
    logInfo('Starting API observation');

    try {
      // 1. Start dev server
      await this.startDevServer();

      // 2. Capture API traces
      const traces = await this.captureAPITraces();

      // 3. Analyze traces
      const report = this.analyzeTraces(traces);

      // 4. Save report
      await this.saveReport(report);

      // 5. Stop dev server
      await this.stopDevServer();

      return this.formatResult(report, profile);
    } catch (error) {
      logError('API observation failed', { error });
      return this.fail(
        'API observation failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async startDevServer() {
    // Implementation depends on your stack
    // Example: spawn('npm', ['run', 'dev'])
  }

  private async captureAPITraces(): Promise<APITrace[]> {
    const traces: APITrace[] = [];
    const baseURL = 'http://localhost:3000';

    // Test critical endpoints
    const endpoints = [
      { path: '/api/forecast', method: 'POST', data: { location_id: 1 } },
      { path: '/api/catalog', method: 'GET' },
      { path: '/api/users/me', method: 'GET' },
    ];

    for (const endpoint of endpoints) {
      const start = Date.now();
      try {
        const response = await fetch(`${baseURL}${endpoint.path}`, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.data ? JSON.stringify(endpoint.data) : undefined,
        });

        traces.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          status: response.status,
          duration: Date.now() - start,
        });
      } catch (error) {
        traces.push({
          endpoint: endpoint.path,
          method: endpoint.method,
          status: 0,
          duration: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return traces;
  }

  private analyzeTraces(traces: APITrace[]) {
    const issues = [];
    const opportunities = [];

    for (const trace of traces) {
      // Check latency
      if (trace.duration > 500) {
        issues.push({
          severity: 'high',
          endpoint: trace.endpoint,
          issue: `Latency ${trace.duration}ms exceeds 500ms target`,
          suggestion: 'Add caching, optimize query, or add index',
        });
      }

      // Check errors
      if (trace.status >= 500) {
        issues.push({
          severity: 'critical',
          endpoint: trace.endpoint,
          issue: `Server error: ${trace.status}`,
          suggestion: 'Check logs and add error handling',
        });
      }

      // Suggest caching for fast endpoints
      if (trace.method === 'GET' && trace.duration < 50) {
        opportunities.push({
          pattern: 'Response caching',
          observation: `${trace.endpoint} is fast (${trace.duration}ms)`,
          opportunity: 'Add Cache-Control header for even better performance',
        });
      }
    }

    const score = Math.max(0, 100 - (issues.length * 10));

    return {
      score,
      traces_count: traces.length,
      issues,
      opportunities,
      timestamp: new Date().toISOString(),
    };
  }

  private async saveReport(report: any) {
    const reportDir = path.join(this.workspaceRoot, 'state', 'critics');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'api_observation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private formatResult(report: any, profile: string) {
    const threshold = profile === 'high' ? 80 : 70;

    const summary = [
      `**Score:** ${report.score}/100`,
      `**Endpoints Tested:** ${report.traces_count}`,
      '',
      `**Issues (${report.issues.length}):**`,
      ...report.issues.slice(0, 5).map((i: any) => 
        `- **${i.severity.toUpperCase()}**: ${i.endpoint} - ${i.issue}\n  → ${i.suggestion}`
      ),
    ].join('\n');

    if (report.score >= threshold) {
      return this.pass(`API observation passed: ${report.score}/100`, summary);
    } else {
      return this.fail(`API observation failed: ${report.score}/100`, summary);
    }
  }

  private async stopDevServer() {
    // Kill dev server process
  }
}
```

---

## Step 4: Add Configuration

Create `state/[domain]_observation_config.yaml`:

```yaml
# API Observation Config
endpoints:
  - path: "/api/forecast"
    method: "POST"
    data:
      location_id: 1
      date: "2025-01-01"
  
  - path: "/api/catalog"
    method: "GET"

thresholds:
  max_latency_ms: 500
  max_error_rate: 0.01

dev_server:
  command: "npm run dev"
  port: 3000
  ready_check: "http://localhost:3000/health"
```

---

## Step 5: Register Critic

Add to your critic registry:

```typescript
import { APIObservationCritic } from './critics/api_observation.js';

const critics = {
  // ... existing critics
  api_observation: new APIObservationCritic(workspaceRoot),
};
```

---

## Step 6: Run It

```bash
# Via orchestrator
critics_run with { "critics": ["api_observation"] }

# Or directly
npm test -- api_observation.test.ts
```

---

## Quick Reference: Tools by Domain

| Domain | Capture Tool | Analyze Tool | Artifact |
|--------|-------------|--------------|----------|
| **API** | fetch/axios | Latency check | Request traces |
| **Data** | pandas | scipy.stats | Distribution plots |
| **DB** | EXPLAIN | pg_stat | Query plans |
| **Perf** | node --prof | speedscope | Flamegraphs |
| **Infra** | chaos-mesh | prometheus | Metrics |

---

## Tips

1. **Start Small** - Test 3-5 critical endpoints/queries/scenarios
2. **Automate Capture** - Make it run on every PR
3. **Track Over Time** - Save reports, compare scores
4. **Visualize** - Generate plots/graphs for reports
5. **Iterate** - Use feedback to improve

---

## Next Steps

1. Copy template above
2. Fill in `captureArtifacts()` for your domain
3. Fill in `analyzeArtifacts()` with principles
4. Add tests
5. Run on every commit

**Time to implement:** 30-60 minutes per domain

---

*Full patterns: See RUNTIME_OBSERVATION_PATTERN.md*
