/**
 * ML Task Meta-Critic
 *
 * Reviews past completed ML tasks to identify patterns, blockers, and improvement opportunities.
 * Generates actionable insights for improving task completion quality and methodology.
 */

import path from "node:path";
import { Critic, type CriticResult, type CriticIdentityProfile } from "./base.js";
import {
  MLTaskAggregator,
  type AggregatedMLTasksReport,
} from "./ml_task_aggregator.js";
import { logInfo } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

export class MLTaskMetaCriticCritic extends Critic {
  private aggregator: MLTaskAggregator;
  protected stateRoot: string;

  constructor(workspaceRoot: string, options = {}) {
    super(workspaceRoot, {
      ...options,
      defaultIdentity: {
        title: "ML Task Meta-Critic",
        mission:
          "Review past completed ML tasks to identify patterns, blockers, and improvement opportunities.",
        powers: [
          "Analyze task completion quality across projects",
          "Identify recurring blockers and failure patterns",
          "Assess test coverage and verification rigor",
          "Generate improvement recommendations",
          "Track delivery velocity and quality trends",
        ],
        authority: "Quality assurance and continuous improvement",
        domain: "ML task completion and methodology",
        autonomy_guidance:
          "Run automatically after task clusters complete to identify systemic improvements.",
        preferred_delegates: ["Atlas", "Research", "QA"],
      },
    });

    this.stateRoot = resolveStateRoot(workspaceRoot);
    this.aggregator = new MLTaskAggregator(workspaceRoot, this.stateRoot);
  }

  protected command(profile: string): string | null {
    // Meta-critic runs Python analysis if available
    const epicFilter = process.env.WVO_ML_TASK_FILTER ?? "";
    const baseCmd = `python tools/wvo_mcp/scripts/ml_task_meta_critic.py --json`;
    return epicFilter ? `${baseCmd} --filter ${epicFilter}` : baseCmd;
  }

  async run(profile: string): Promise<CriticResult> {
    logInfo("ML Task Meta-Critic starting analysis...");

    try {
      // First, try to run Python script if available
      const pythonCmd = this.command(profile);
      if (pythonCmd) {
        try {
          const { runCommand } = await import(
            "../executor/command_runner.js"
          );
          const result = await runCommand(pythonCmd, {
            cwd: this.workspaceRoot,
          });

          if (result.code === 0) {
            logInfo("Python ML task analysis completed successfully");
            const finalResult = await this.finalizeResult({
              critic: this.getCriticKey(),
              ...result,
              passed: true,
              analysis: null,
            });
            return finalResult;
          }
        } catch (error) {
          logInfo("Python script not available, falling back to TypeScript analysis", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Fallback: Run TypeScript analysis
      return await this.runTypeScriptAnalysis();
    } catch (error) {
      return await this.fail(
        "ML Task Meta-Critic analysis failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Run analysis using TypeScript aggregator
   */
  private async runTypeScriptAnalysis(): Promise<CriticResult> {
    try {
      const report = await this.aggregator.generateAggregatedReport();

      // Generate insights and recommendations
      const insights = this.generateInsights(report);
      const recommendations = this.generateRecommendations(report);

      // Format output
      const output = this.formatAnalysisOutput(report, insights, recommendations);

      // Check if we should escalate
      const shouldEscalate = this.shouldEscalate(report, insights);

      if (shouldEscalate) {
        const failResult = await this.fail(
          "ML Task Meta-Critic identified critical issues",
          output
        );
        return failResult;
      } else {
        const passResult = await this.pass("ML Task Meta-Critic analysis complete", output);
        return passResult;
      }
    } catch (error) {
      return await this.fail(
        "TypeScript analysis failed",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Generate insights from aggregated task report
   */
  private generateInsights(report: AggregatedMLTasksReport): string[] {
    const insights: string[] = [];

    // Completion rate insight
    insights.push(
      `Task Completion: ${report.average_completion_rate.toFixed(1)}% of ${report.total_tasks_analyzed} tasks completed successfully`
    );

    // Status breakdown
    if (report.in_progress_tasks > 0) {
      insights.push(
        `In Progress: ${report.in_progress_tasks} tasks currently being worked on`
      );
    }

    if (report.failed_tasks > 0) {
      insights.push(
        `Issues: ${report.failed_tasks} tasks encountered blockers`
      );
    }

    // Blocker analysis
    if (report.blockers_detected.length > 0) {
      insights.push(
        `Critical Blockers: ${report.blockers_detected.length} issues identified`
      );
      for (const blocker of report.blockers_detected.slice(0, 3)) {
        insights.push(`  - ${blocker}`);
      }
    }

    // Pattern analysis
    if (report.patterns_observed.length > 0) {
      insights.push(`Patterns Observed:`);
      for (const pattern of report.patterns_observed) {
        insights.push(`  - ${pattern}`);
      }
    }

    // Task quality distribution
    const highQualityTasks = report.tasks.filter(
      (t) => t.coverage_dimensions && t.coverage_dimensions >= 6
    ).length;
    const lowQualityTasks = report.tasks.filter(
      (t) => t.coverage_dimensions && t.coverage_dimensions < 4
    ).length;

    insights.push(
      `Quality Distribution: ${highQualityTasks} high-quality, ${lowQualityTasks} low-quality completions`
    );

    return insights;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    report: AggregatedMLTasksReport
  ): string[] {
    const recommendations: string[] = [];

    // Low completion rate
    if (report.average_completion_rate < 0.7) {
      recommendations.push(
        "URGENT: Investigate root causes of low completion rate. Consider process changes or resource allocation."
      );
    }

    // Test coverage improvement
    const avgCoverageDimensions =
      report.tasks.reduce((sum, t) => sum + (t.coverage_dimensions || 0), 0) /
      Math.max(report.tasks.length, 1);

    if (avgCoverageDimensions < 5) {
      recommendations.push(
        `Improve test coverage: Average is ${avgCoverageDimensions.toFixed(1)}/7 dimensions. Target: 6+`
      );
    }

    // Artifact documentation
    const tasksWithoutArtifacts = report.tasks.filter(
      (t) => t.artifacts_generated.length === 0
    ).length;

    if (tasksWithoutArtifacts > 0) {
      recommendations.push(
        `Enforce artifact documentation: ${tasksWithoutArtifacts} tasks lack documented artifacts`
      );
    }

    // Blocker prevention
    if (report.blockers_detected.length > 3) {
      recommendations.push(
        "Implement blocker prevention: Establish pre-flight checks and dependency validation before task start"
      );
    }

    // Quality gate improvements
    const failedVerifications = report.tasks.filter((t) => {
      const passedChecks = Object.values(t.verification_checklist).filter(
        (v) => v
      ).length;
      return passedChecks < 3;
    }).length;

    if (failedVerifications > 0) {
      recommendations.push(
        `Strengthen quality gates: ${failedVerifications} tasks failed verification checks`
      );
    }

    // Training recommendations
    if (
      report.tasks.length > 5 &&
      report.average_completion_rate < 0.8
    ) {
      recommendations.push(
        "Consider team training on task completion methodology and quality standards"
      );
    }

    return recommendations;
  }

  /**
   * Determine if results warrant escalation
   */
  private shouldEscalate(
    report: AggregatedMLTasksReport,
    insights: string[]
  ): boolean {
    // Escalate if completion rate is critical
    if (report.average_completion_rate < 0.6) {
      return true;
    }

    // Escalate if many blockers detected
    if (report.blockers_detected.length > 5) {
      return true;
    }

    // Escalate if significant failures
    if (report.failed_tasks > Math.max(report.completed_tasks / 2, 1)) {
      return true;
    }

    // Escalate if test coverage is critically low
    const avgCoverageDimensions =
      report.tasks.reduce((sum, t) => sum + (t.coverage_dimensions || 0), 0) /
      Math.max(report.tasks.length, 1);

    if (avgCoverageDimensions < 3) {
      return true;
    }

    return false;
  }

  /**
   * Format analysis output as readable text
   */
  private formatAnalysisOutput(
    report: AggregatedMLTasksReport,
    insights: string[],
    recommendations: string[]
  ): string {
    const sections: string[] = [];

    sections.push("═══════════════════════════════════════════════════════════");
    sections.push("ML TASK META-CRITIC ANALYSIS REPORT");
    sections.push("═══════════════════════════════════════════════════════════\n");

    // Summary
    sections.push("SUMMARY:");
    sections.push(`  • Total Tasks Analyzed: ${report.total_tasks_analyzed}`);
    sections.push(`  • Completed: ${report.completed_tasks}`);
    sections.push(`  • In Progress: ${report.in_progress_tasks}`);
    sections.push(`  • Failed: ${report.failed_tasks}`);
    sections.push(
      `  • Completion Rate: ${report.average_completion_rate.toFixed(1)}%\n`
    );

    // Insights
    sections.push("KEY INSIGHTS:");
    for (const insight of insights) {
      sections.push(`  ${insight}`);
    }
    sections.push("");

    // Recommendations
    if (recommendations.length > 0) {
      sections.push("RECOMMENDATIONS:");
      for (const rec of recommendations) {
        sections.push(`  → ${rec}`);
      }
      sections.push("");
    }

    // Detailed task analysis
    if (report.tasks.length > 0) {
      sections.push("DETAILED TASK ANALYSIS:");
      for (const task of report.tasks.slice(0, 5)) {
        sections.push(`\n  Task: ${task.id} - ${task.title}`);
        sections.push(
          `    Coverage: ${task.coverage_dimensions || 0}/7 dimensions`
        );
        sections.push(`    Tests Passed: ${task.tests_passed ? "✓" : "✗"}`);

        const verificationStatus = Object.entries(task.verification_checklist)
          .filter(([, v]) => !v)
          .map(([k]) => k);

        if (verificationStatus.length > 0) {
          sections.push(
            `    Failed Checks: ${verificationStatus.join(", ")}`
          );
        }

        if (task.deliverables.length > 0) {
          sections.push(
            `    Deliverables: ${task.deliverables.slice(0, 2).join(", ")}`
          );
        }
      }
      sections.push("");
    }

    sections.push("═══════════════════════════════════════════════════════════");

    return sections.join("\n");
  }

  protected getCriticKey(): string {
    return "ml_task_meta";
  }
}
