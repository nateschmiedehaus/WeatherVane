/**
 * Wave 0.1 Monitoring Dashboard
 *
 * Tracks autonomous operation metrics, performance, and health
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { CloneManager } from './clone_manager.js';
import { ProviderRouter } from './provider_router.js';

export interface MonitoringMetrics {
  timestamp: Date;
  uptime: number;
  tasksCompleted: number;
  tasksInProgress: number;
  tasksFailed: number;
  performance: {
    throughput: number;
    avgTaskTime: number;
    memoryUsed: number;
    cpuUsage: number;
  };
  providers: {
    claude: {
      tokensUsed: number;
      rateLimited: boolean;
      errors: number;
    };
    codex: {
      tokensUsed: number;
      rateLimited: boolean;
      errors: number;
    };
  };
  clones: {
    active: number;
    total: number;
    avgLifetime: number;
  };
  quality: {
    criticsRun: number;
    validationsPassed: number;
    validationsFailed: number;
    avgQualityScore: number;
  };
  errors: {
    total: number;
    recovered: number;
    critical: number;
  };
}

export class Wave0Monitor {
  private startTime: Date;
  private metrics: MonitoringMetrics;
  private metricsHistory: MonitoringMetrics[] = [];
  private readonly maxHistorySize = 1000;
  private readonly metricsFile: string;
  private readonly dashboardFile: string;
  private cloneManager: CloneManager;
  private providerRouter: ProviderRouter;

  constructor(stateDir: string = 'state') {
    this.startTime = new Date();
    this.metricsFile = path.join(stateDir, 'wave0_metrics.json');
    this.dashboardFile = path.join(stateDir, 'wave0_dashboard.html');
    this.cloneManager = new CloneManager();
    this.providerRouter = new ProviderRouter();

    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize empty metrics
   */
  private initializeMetrics(): MonitoringMetrics {
    return {
      timestamp: new Date(),
      uptime: 0,
      tasksCompleted: 0,
      tasksInProgress: 0,
      tasksFailed: 0,
      performance: {
        throughput: 0,
        avgTaskTime: 0,
        memoryUsed: 0,
        cpuUsage: 0
      },
      providers: {
        claude: {
          tokensUsed: 0,
          rateLimited: false,
          errors: 0
        },
        codex: {
          tokensUsed: 0,
          rateLimited: false,
          errors: 0
        }
      },
      clones: {
        active: 0,
        total: 0,
        avgLifetime: 0
      },
      quality: {
        criticsRun: 0,
        validationsPassed: 0,
        validationsFailed: 0,
        avgQualityScore: 0
      },
      errors: {
        total: 0,
        recovered: 0,
        critical: 0
      }
    };
  }

  /**
   * Update monitoring metrics
   */
  async updateMetrics(): Promise<void> {
    try {
      // Update timestamp and uptime
      this.metrics.timestamp = new Date();
      this.metrics.uptime = Date.now() - this.startTime.getTime();

      // Update performance metrics
      const memUsage = process.memoryUsage();
      this.metrics.performance.memoryUsed = memUsage.heapUsed / 1024 / 1024; // MB

      // Get CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      this.metrics.performance.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // seconds

      // Update provider metrics
      const providerStatus = this.providerRouter.getStatus();
      this.metrics.providers.claude = {
        tokensUsed: providerStatus.providers.claude.tokensUsed,
        rateLimited: providerStatus.providers.claude.rateLimited,
        errors: providerStatus.providers.claude.errors
      };
      this.metrics.providers.codex = {
        tokensUsed: providerStatus.providers.codex.tokensUsed,
        rateLimited: providerStatus.providers.codex.rateLimited,
        errors: providerStatus.providers.codex.errors
      };

      // Update clone metrics
      const cloneStatus = this.cloneManager.getStatus();
      this.metrics.clones.active = cloneStatus.activeClones;

      // Add to history
      this.metricsHistory.push(JSON.parse(JSON.stringify(this.metrics)));

      // Trim history if too large
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }

      // Save metrics to file
      await this.saveMetrics();

    } catch (error) {
      logError('Failed to update metrics', { error });
    }
  }

  /**
   * Record task completion
   */
  recordTaskCompleted(taskId: string, duration: number): void {
    this.metrics.tasksCompleted++;

    // Update average task time
    const totalTime = this.metrics.performance.avgTaskTime * (this.metrics.tasksCompleted - 1);
    this.metrics.performance.avgTaskTime = (totalTime + duration) / this.metrics.tasksCompleted;

    // Calculate throughput (tasks per hour)
    const uptimeHours = this.metrics.uptime / (1000 * 60 * 60);
    this.metrics.performance.throughput = this.metrics.tasksCompleted / uptimeHours;

    logInfo(`Task completed: ${taskId}`, {
      duration,
      totalCompleted: this.metrics.tasksCompleted
    });
  }

  /**
   * Record task failure
   */
  recordTaskFailed(taskId: string, error: string): void {
    this.metrics.tasksFailed++;
    this.metrics.errors.total++;

    logWarning(`Task failed: ${taskId}`, { error });
  }

  /**
   * Record quality metrics
   */
  recordQualityCheck(passed: boolean, score: number): void {
    this.metrics.quality.criticsRun++;

    if (passed) {
      this.metrics.quality.validationsPassed++;
    } else {
      this.metrics.quality.validationsFailed++;
    }

    // Update average quality score
    const totalScore = this.metrics.quality.avgQualityScore * (this.metrics.quality.criticsRun - 1);
    this.metrics.quality.avgQualityScore = (totalScore + score) / this.metrics.quality.criticsRun;
  }

  /**
   * Record error and recovery
   */
  recordError(critical: boolean = false, recovered: boolean = false): void {
    this.metrics.errors.total++;

    if (critical) {
      this.metrics.errors.critical++;
    }

    if (recovered) {
      this.metrics.errors.recovered++;
    }
  }

  /**
   * Save metrics to file
   */
  private async saveMetrics(): Promise<void> {
    try {
      await fs.writeFile(
        this.metricsFile,
        JSON.stringify({
          current: this.metrics,
          history: this.metricsHistory.slice(-100) // Save last 100 entries
        }, null, 2)
      );
    } catch (error) {
      logError('Failed to save metrics', { error });
    }
  }

  /**
   * Generate HTML dashboard
   */
  async generateDashboard(): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Wave 0.1 Monitoring Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      color: white;
      padding: 20px;
      min-height: 100vh;
    }
    .header {
      text-align: center;
      padding: 20px;
      margin-bottom: 30px;
    }
    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      background: #4CAF50;
      border-radius: 20px;
      font-weight: bold;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 10px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .card h2 {
      margin-bottom: 15px;
      color: #64b5f6;
      font-size: 1.2em;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .metric:last-child {
      border: none;
    }
    .metric-value {
      font-weight: bold;
      color: #81c784;
    }
    .metric-value.warning {
      color: #ffb74d;
    }
    .metric-value.danger {
      color: #e57373;
    }
    .performance-score {
      font-size: 3em;
      text-align: center;
      margin: 20px 0;
      color: #81c784;
    }
    .timestamp {
      text-align: center;
      opacity: 0.7;
      margin-top: 20px;
      font-size: 0.9em;
    }
    .chart {
      height: 200px;
      background: rgba(255,255,255,0.05);
      border-radius: 5px;
      margin-top: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.3);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 Wave 0.1 Monitoring Dashboard</h1>
    <span class="status">OPERATIONAL</span>
  </div>

  <div class="grid">
    <div class="card">
      <h2>📊 System Status</h2>
      <div class="metric">
        <span>Uptime</span>
        <span class="metric-value">${(this.metrics.uptime / 1000 / 60).toFixed(1)} min</span>
      </div>
      <div class="metric">
        <span>Tasks Completed</span>
        <span class="metric-value">${this.metrics.tasksCompleted}</span>
      </div>
      <div class="metric">
        <span>Tasks In Progress</span>
        <span class="metric-value">${this.metrics.tasksInProgress}</span>
      </div>
      <div class="metric">
        <span>Tasks Failed</span>
        <span class="metric-value ${this.metrics.tasksFailed > 0 ? 'warning' : ''}">${this.metrics.tasksFailed}</span>
      </div>
    </div>

    <div class="card">
      <h2>⚡ Performance</h2>
      <div class="performance-score">${this.metrics.performance.throughput.toFixed(0)}</div>
      <div style="text-align: center; margin-bottom: 15px;">tasks/hour</div>
      <div class="metric">
        <span>Avg Task Time</span>
        <span class="metric-value">${(this.metrics.performance.avgTaskTime / 1000).toFixed(2)}s</span>
      </div>
      <div class="metric">
        <span>Memory Used</span>
        <span class="metric-value">${this.metrics.performance.memoryUsed.toFixed(1)} MB</span>
      </div>
      <div class="metric">
        <span>CPU Time</span>
        <span class="metric-value">${this.metrics.performance.cpuUsage.toFixed(1)}s</span>
      </div>
    </div>

    <div class="card">
      <h2>🤖 Providers</h2>
      <div class="metric">
        <span>Claude Tokens</span>
        <span class="metric-value ${this.metrics.providers.claude.rateLimited ? 'danger' : ''}">${this.metrics.providers.claude.tokensUsed}</span>
      </div>
      <div class="metric">
        <span>Claude Status</span>
        <span class="metric-value ${this.metrics.providers.claude.rateLimited ? 'danger' : ''}">${this.metrics.providers.claude.rateLimited ? 'RATE LIMITED' : 'ACTIVE'}</span>
      </div>
      <div class="metric">
        <span>Codex Tokens</span>
        <span class="metric-value ${this.metrics.providers.codex.rateLimited ? 'danger' : ''}">${this.metrics.providers.codex.tokensUsed}</span>
      </div>
      <div class="metric">
        <span>Codex Status</span>
        <span class="metric-value ${this.metrics.providers.codex.rateLimited ? 'danger' : ''}">${this.metrics.providers.codex.rateLimited ? 'RATE LIMITED' : 'ACTIVE'}</span>
      </div>
    </div>

    <div class="card">
      <h2>🧬 Clones</h2>
      <div class="metric">
        <span>Active Clones</span>
        <span class="metric-value">${this.metrics.clones.active}/3</span>
      </div>
      <div class="metric">
        <span>Total Created</span>
        <span class="metric-value">${this.metrics.clones.total}</span>
      </div>
      <div class="metric">
        <span>Avg Lifetime</span>
        <span class="metric-value">${(this.metrics.clones.avgLifetime / 1000).toFixed(1)}s</span>
      </div>
    </div>

    <div class="card">
      <h2>✅ Quality</h2>
      <div class="metric">
        <span>Quality Score</span>
        <span class="metric-value">${this.metrics.quality.avgQualityScore.toFixed(1)}/100</span>
      </div>
      <div class="metric">
        <span>Critics Run</span>
        <span class="metric-value">${this.metrics.quality.criticsRun}</span>
      </div>
      <div class="metric">
        <span>Validations Passed</span>
        <span class="metric-value">${this.metrics.quality.validationsPassed}</span>
      </div>
      <div class="metric">
        <span>Validations Failed</span>
        <span class="metric-value ${this.metrics.quality.validationsFailed > 0 ? 'warning' : ''}">${this.metrics.quality.validationsFailed}</span>
      </div>
    </div>

    <div class="card">
      <h2>⚠️ Errors</h2>
      <div class="metric">
        <span>Total Errors</span>
        <span class="metric-value ${this.metrics.errors.total > 0 ? 'warning' : ''}">${this.metrics.errors.total}</span>
      </div>
      <div class="metric">
        <span>Recovered</span>
        <span class="metric-value">${this.metrics.errors.recovered}</span>
      </div>
      <div class="metric">
        <span>Critical</span>
        <span class="metric-value ${this.metrics.errors.critical > 0 ? 'danger' : ''}">${this.metrics.errors.critical}</span>
      </div>
      <div class="metric">
        <span>Recovery Rate</span>
        <span class="metric-value">${this.metrics.errors.total > 0 ? ((this.metrics.errors.recovered / this.metrics.errors.total) * 100).toFixed(1) : 100}%</span>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>📈 Performance History</h2>
    <div class="chart">Chart visualization would go here</div>
  </div>

  <div class="timestamp">
    Last updated: ${this.metrics.timestamp.toLocaleString()}
  </div>

  <script>
    // Auto-refresh every 10 seconds
    setTimeout(() => location.reload(), 10000);
  </script>
</body>
</html>`;

    await fs.writeFile(this.dashboardFile, html);
    logInfo(`Dashboard updated: ${this.dashboardFile}`);
  }

  /**
   * Get current metrics
   */
  getMetrics(): MonitoringMetrics {
    return this.metrics;
  }

  /**
   * Get metrics history
   */
  getHistory(): MonitoringMetrics[] {
    return this.metricsHistory;
  }

  /**
   * Start monitoring loop
   */
  async startMonitoring(intervalMs: number = 10000): Promise<void> {
    logInfo('Wave 0 monitoring started', { interval: intervalMs });

    setInterval(async () => {
      await this.updateMetrics();
      await this.generateDashboard();
    }, intervalMs);

    // Initial update
    await this.updateMetrics();
    await this.generateDashboard();
  }

  /**
   * Health check
   */
  isHealthy(): boolean {
    // Check various health criteria
    const checks = {
      uptime: this.metrics.uptime > 0,
      memory: this.metrics.performance.memoryUsed < 500, // MB
      errors: this.metrics.errors.critical === 0,
      quality: this.metrics.quality.avgQualityScore >= 85,
      providers: !this.metrics.providers.claude.rateLimited || !this.metrics.providers.codex.rateLimited
    };

    return Object.values(checks).every(check => check);
  }
}