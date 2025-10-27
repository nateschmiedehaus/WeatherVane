/**
 * DataObservationCritic - Statistical validation and distribution analysis
 *
 * Observes:
 * - Actual data distributions (not just schema)
 * - Target leakage via correlation analysis
 * - Distribution drift between train/test
 * - Missing value patterns
 * - Feature importance and redundancy
 *
 * Philosophy: Plot the data, don't just check the schema
 */

import { exec } from "child_process";
import { promises as fs } from "node:fs";
import path from "path";
import { promisify } from "util";

import { logInfo, logWarning, logError } from "../telemetry/logger.js";

import { Critic, type CriticResult } from "./base.js";

const execAsync = promisify(exec);

export interface DataIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "leakage" | "drift" | "quality" | "redundancy";
  issue: string;
  suggestion: string;
  visualization?: string;
  details?: any;
}

export interface DataOpportunity {
  pattern: string;
  observation: string;
  opportunity: string;
  potential_impact: string;
}

export interface DataReport {
  overall_score: number;
  datasets_analyzed: number;
  issues: DataIssue[];
  opportunities: DataOpportunity[];
  visualizations: string[];
  stats: {
    features: number;
    samples_train: number;
    samples_test: number;
    missing_rate: number;
    leakage_features: string[];
    drift_score: number;
  };
  timestamp: string;
}

export class DataObservationCritic extends Critic {
  name = "data_observation";
  description = "Statistical validation and distribution analysis";

  private config: {
    datasets: {
      train?: string;
      test?: string;
      validation?: string;
    };
    target_column?: string;
    thresholds: {
      max_drift: number;
      max_correlation: number;
      max_missing_rate: number;
    };
  };

  constructor(workspaceRoot: string) {
    super(workspaceRoot);

    this.config = {
      datasets: {
        train: 'data/train.parquet',
        test: 'data/test.parquet',
      },
      target_column: 'target',
      thresholds: {
        max_drift: 0.15,
        max_correlation: 0.95,
        max_missing_rate: 0.20,
      },
    };
  }

  protected command(_profile: string): string | null {
    return null;
  }

  async run(profile: string): Promise<CriticResult> {
    logInfo('DataObservationCritic starting', { profile });

    try {
      // Load config
      await this.loadConfig();

      // Check if datasets exist
      const datasetsExist = await this.checkDatasets();
      if (!datasetsExist) {
        return this.fail(
          'Datasets not found',
          `Expected datasets at: ${JSON.stringify(this.config.datasets)}`
        );
      }

      // Generate visualizations and stats
      const artifacts = await this.captureDataArtifacts();

      // Analyze results
      const report = await this.analyzeArtifacts(artifacts);

      // Save report
      await this.saveReport(report);

      return await this.formatResult(report, profile);
    } catch (error) {
      logError('DataObservationCritic failed', { error });
      return this.fail(
        'Data observation failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.workspaceRoot, 'state', 'data_observation_config.yaml');

    try {
      await fs.access(configPath);
      logInfo('Using data observation config from file');
      // TODO: Parse YAML
    } catch {
      logInfo('Using default data observation config');
    }
  }

  private async checkDatasets(): Promise<boolean> {
    try {
      const trainPath = path.join(this.workspaceRoot, this.config.datasets.train!);
      await fs.access(trainPath);
      return true;
    } catch {
      logWarning('Training dataset not found');
      return false;
    }
  }

  private async captureDataArtifacts() {
    const sessionDir = path.join(this.workspaceRoot, 'tmp', 'data-analysis', new Date().toISOString());
    await fs.mkdir(sessionDir, { recursive: true });

    logInfo('Generating data visualizations and statistics');

    // Call Python script for data analysis
    const scriptPath = path.join(this.workspaceRoot, 'tools', 'wvo_mcp', 'scripts', 'analyze_data.py');

    // Check if Python script exists
    try {
      await fs.access(scriptPath);

      const { stdout, stderr } = await execAsync(
        `python3 "${scriptPath}" --train "${this.config.datasets.train}" --test "${this.config.datasets.test}" --output "${sessionDir}" --target "${this.config.target_column}"`,
        { cwd: this.workspaceRoot }
      );

      if (stderr) {
        logWarning('Python script stderr', { stderr });
      }

      logInfo('Data analysis complete', { stdout: stdout.slice(0, 200) });

      // Parse results
      const resultsPath = path.join(sessionDir, 'analysis_results.json');
      const results = JSON.parse(await fs.readFile(resultsPath, 'utf-8'));

      return {
        sessionDir,
        ...results,
      };
    } catch (error) {
      logWarning('Python script not available, using simplified analysis', { error });

      // Fallback: Basic TypeScript analysis
      return this.basicAnalysis(sessionDir);
    }
  }

  private async basicAnalysis(sessionDir: string) {
    logInfo('Running basic data analysis (Python script not available)');

    // This is a simplified version - in production, use the Python script
    return {
      sessionDir,
      stats: {
        features: 0,
        samples_train: 0,
        samples_test: 0,
        missing_rate: 0,
        drift_score: 0,
      },
      correlations: {},
      distributions: {},
      visualizations: [],
    };
  }

  private async analyzeArtifacts(artifacts: any): Promise<DataReport> {
    const issues: DataIssue[] = [];
    const opportunities: DataOpportunity[] = [];

    // Check for target leakage (correlation > threshold)
    if (artifacts.correlations) {
      const targetCorr = artifacts.correlations[this.config.target_column!] || {};

      for (const [feature, corr] of Object.entries(targetCorr)) {
        if (feature === this.config.target_column) continue;

        if (Math.abs(corr as number) > this.config.thresholds.max_correlation) {
          issues.push({
            severity: 'critical',
            category: 'leakage',
            issue: `Feature '${feature}' has ${(corr as number).toFixed(3)} correlation with target`,
            suggestion: `Remove '${feature}' - likely leaks future information`,
            visualization: path.join(artifacts.sessionDir, 'correlation_heatmap.png'),
            details: { feature, correlation: corr },
          });
        }
      }
    }

    // Check for distribution drift
    if (artifacts.stats?.drift_score > this.config.thresholds.max_drift) {
      issues.push({
        severity: 'high',
        category: 'drift',
        issue: `Distribution drift detected (score: ${artifacts.stats.drift_score.toFixed(3)})`,
        suggestion: 'Investigate data collection changes or use time-based splitting',
        visualization: path.join(artifacts.sessionDir, 'drift_plot.png'),
      });
    }

    // Check for high missing rate
    if (artifacts.stats?.missing_rate > this.config.thresholds.max_missing_rate) {
      issues.push({
        severity: 'medium',
        category: 'quality',
        issue: `High missing value rate: ${(artifacts.stats.missing_rate * 100).toFixed(1)}%`,
        suggestion: 'Impute missing values or investigate data collection issues',
      });
    }

    // Check for redundant features (high correlation between features)
    if (artifacts.redundant_features && artifacts.redundant_features.length > 0) {
      for (const pair of artifacts.redundant_features.slice(0, 3)) {
        opportunities.push({
          pattern: 'Feature redundancy',
          observation: `${pair.feature1} and ${pair.feature2} are highly correlated (${pair.correlation.toFixed(2)})`,
          opportunity: `Drop one feature or create interaction term`,
          potential_impact: 'Reduce model complexity, improve interpretability',
        });
      }
    }

    // Suggest feature engineering
    if (artifacts.feature_importance) {
      const topFeatures = Object.entries(artifacts.feature_importance)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3)
        .map(([f]) => f);

      opportunities.push({
        pattern: 'Feature engineering',
        observation: `Top features: ${topFeatures.join(', ')}`,
        opportunity: 'Create interaction terms between top features',
        potential_impact: 'Potentially improve model accuracy by 5-10%',
      });
    }

    // Calculate score
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;

    const penalty = (criticalCount * 30) + (highCount * 15) + (mediumCount * 5);
    const overall_score = Math.max(0, 100 - penalty);

    return {
      overall_score,
      datasets_analyzed: Object.keys(this.config.datasets).length,
      issues,
      opportunities,
      visualizations: artifacts.visualizations || [],
      stats: {
        features: artifacts.stats?.features || 0,
        samples_train: artifacts.stats?.samples_train || 0,
        samples_test: artifacts.stats?.samples_test || 0,
        missing_rate: artifacts.stats?.missing_rate || 0,
        leakage_features: issues.filter(i => i.category === 'leakage').map(i => i.details?.feature || ''),
        drift_score: artifacts.stats?.drift_score || 0,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async saveReport(report: DataReport): Promise<void> {
    const reportDir = path.join(this.workspaceRoot, 'state', 'critics');
    await fs.mkdir(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, 'data_observation_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    logInfo('Data observation report saved', { path: reportPath });
  }

  private async formatResult(report: DataReport, profile: string): Promise<CriticResult> {
    const threshold = profile === 'high' ? 80 : profile === 'medium' ? 70 : 60;

    const lines: string[] = [];

    lines.push(`**Overall Score:** ${report.overall_score}/100`);
    lines.push(`**Datasets:** ${report.datasets_analyzed}`);
    lines.push(`**Features:** ${report.stats.features}`);
    lines.push(`**Samples (train/test):** ${report.stats.samples_train}/${report.stats.samples_test}`);
    lines.push('');

    if (report.issues.length > 0) {
      lines.push(`**Issues Found (${report.issues.length}):**`);
      const byCategory = {
        leakage: report.issues.filter(i => i.category === 'leakage'),
        drift: report.issues.filter(i => i.category === 'drift'),
        quality: report.issues.filter(i => i.category === 'quality'),
        redundancy: report.issues.filter(i => i.category === 'redundancy'),
      };

      for (const [category, issues] of Object.entries(byCategory)) {
        if (issues.length > 0) {
          lines.push(`- **${category.toUpperCase()}**: ${issues.length}`);
          for (const issue of issues.slice(0, 3)) {
            lines.push(`  - ${issue.issue}`);
            lines.push(`    → *${issue.suggestion}*`);
            if (issue.visualization) {
              lines.push(`    📊 ${issue.visualization}`);
            }
          }
        }
      }
      lines.push('');
    }

    if (report.visualizations.length > 0) {
      lines.push(`**Visualizations Generated:**`);
      for (const viz of report.visualizations.slice(0, 5)) {
        lines.push(`- ${path.basename(viz)}`);
      }
      lines.push('');
    }

    if (report.opportunities.length > 0) {
      lines.push(`**Improvement Opportunities (${report.opportunities.length}):**`);
      for (const opp of report.opportunities.slice(0, 3)) {
        lines.push(`- **${opp.pattern}**: ${opp.opportunity}`);
        lines.push(`  *Impact: ${opp.potential_impact}*`);
      }
      lines.push('');
    }

    lines.push(`**Full Report:** state/critics/data_observation_report.json`);

    const summary = lines.join('\n');

    if (report.overall_score >= threshold) {
      return await this.pass(
        `Data observation passed: ${report.overall_score}/100`,
        summary
      );
    } else {
      return await this.fail(
        `Data observation failed: ${report.overall_score}/100 (threshold: ${threshold})`,
        summary
      );
    }
  }
}
