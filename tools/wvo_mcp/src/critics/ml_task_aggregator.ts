/**
 * ML Task Completion Aggregator
 *
 * Retrieves and aggregates past completed ML tasks for meta-critic review.
 * Extracts key metrics, artifacts, and completion evidence for analysis.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logInfo, logWarning } from "../telemetry/logger.js";

export interface MLTaskSummary {
  id: string;
  title: string;
  status: string;
  domain?: string;
  completed_at?: number;
  assigned_to?: string;
  estimated_complexity?: number;
  actual_duration_seconds?: number;
  metadata?: Record<string, unknown>;
  completion_path?: string;
}

export interface MLTaskCompletionReport {
  id: string;
  title: string;
  completion_path: string;
  extracted_at: number;
  deliverables: string[];
  quality_metrics: Record<string, number>;
  tests_passed: boolean;
  test_count?: number;
  coverage_dimensions?: number; // 0-7 dimensions covered
  artifacts_generated: string[];
  verification_checklist: Record<string, boolean>;
  critic_results: {
    modeling_reality_v2?: { passed: boolean; message?: string };
    academic_rigor?: { passed: boolean; message?: string };
    data_quality?: { passed: boolean; message?: string };
  };
}

export interface AggregatedMLTasksReport {
  total_tasks_analyzed: number;
  completed_tasks: number;
  in_progress_tasks: number;
  failed_tasks: number;
  average_completion_rate: number;
  tasks: MLTaskCompletionReport[];
  analysis_timestamp: number;
  blockers_detected: string[];
  patterns_observed: string[];
}

export class MLTaskAggregator {
  private readonly workspaceRoot: string;
  private readonly stateRoot: string;

  constructor(workspaceRoot: string, stateRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = stateRoot;
  }

  /**
   * Retrieve all completed ML tasks from the codebase
   */
  async getCompletedMLTasks(): Promise<MLTaskSummary[]> {
    const tasks: MLTaskSummary[] = [];

    try {
      // Search for completion reports in docs directory
      const docsDir = path.join(this.workspaceRoot, "docs");
      const completionReports = await this.findCompletionReportsInDir(docsDir);

      logInfo("Found completion reports", {
        count: completionReports.length,
      });

      for (const reportPath of completionReports) {
        const taskId = this.extractTaskIdFromPath(reportPath);
        const title = this.extractTitleFromPath(reportPath);

        tasks.push({
          id: taskId,
          title,
          status: "done",
          completion_path: reportPath,
        });
      }

      // Also check state machine for task records
      const stateTasks = await this.getTasksFromState();
      const completedStateTasks = stateTasks.filter(
        (t) => t.status === "done"
      );

      // Merge and deduplicate
      const mergedTasks = this.mergeTasks(tasks, completedStateTasks);
      return mergedTasks;
    } catch (error) {
      logWarning("Failed to retrieve completed ML tasks", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get detailed analysis of a completed ML task
   */
  async analyzeCompletedTask(
    taskId: string,
    completionPath?: string
  ): Promise<MLTaskCompletionReport | null> {
    try {
      const reportPath = completionPath ||
        (await this.findCompletionReport(taskId));
      if (!reportPath) {
        return null;
      }

      const fullPath = path.join(this.workspaceRoot, reportPath);
      const content = await fs.readFile(fullPath, "utf-8");

      return {
        id: taskId,
        title: this.extractTitleFromPath(reportPath),
        completion_path: reportPath,
        extracted_at: Date.now(),
        deliverables: this.extractDeliverables(content),
        quality_metrics: this.extractQualityMetrics(content),
        tests_passed: this.extractTestsPassed(content),
        test_count: this.extractTestCount(content),
        coverage_dimensions: this.extractCoverageDimensions(content),
        artifacts_generated: this.extractArtifacts(content),
        verification_checklist: this.extractVerificationChecklist(content),
        critic_results: this.extractCriticResults(content),
      };
    } catch (error) {
      logWarning("Failed to analyze completed task", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Generate aggregated report of all completed ML tasks
   */
  async generateAggregatedReport(): Promise<AggregatedMLTasksReport> {
    const tasks = await this.getCompletedMLTasks();
    const reports: MLTaskCompletionReport[] = [];

    let completed = 0;
    let inProgress = 0;
    let failed = 0;

    for (const task of tasks) {
      const report = await this.analyzeCompletedTask(
        task.id,
        task.completion_path as string | undefined
      );
      if (report) {
        reports.push(report);
        if (report.tests_passed) {
          completed++;
        }
      }

      // Track status for metrics
      if (task.status === "done") {
        completed++;
      } else if (task.status === "in_progress") {
        inProgress++;
      } else {
        failed++;
      }
    }

    const completionRate =
      tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

    return {
      total_tasks_analyzed: tasks.length,
      completed_tasks: completed,
      in_progress_tasks: inProgress,
      failed_tasks: failed,
      average_completion_rate: completionRate,
      tasks: reports,
      analysis_timestamp: Date.now(),
      blockers_detected: this.detectBlockers(reports),
      patterns_observed: this.observePatterns(reports),
    };
  }

  /**
   * Extract quality metrics from completion report
   */
  private extractQualityMetrics(content: string): Record<string, number> {
    const metrics: Record<string, number> = {};

    // Extract common quality metrics
    const patterns: Record<string, RegExp> = {
      build_success_rate: /Build.*?(\d+)%?/i,
      test_coverage: /Coverage.*?(\d+)%?/i,
      lint_score: /Lint.*?(\d+)/i,
      security_score: /Security.*?(\d+)/i,
      performance_score: /Performance.*?(\d+)/i,
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const value = parseInt(match[1], 10);
        if (!isNaN(value)) {
          metrics[key] = value;
        }
      }
    }

    return metrics;
  }

  /**
   * Extract deliverables list from completion report
   */
  private extractDeliverables(content: string): string[] {
    const deliverables: string[] = [];
    const deliverableMatch = content.match(
      /##?\s*Deliverables\s*:?\n([\s\S]*?)(?=\n##|$)/i
    );

    if (deliverableMatch) {
      const section = deliverableMatch[1];
      const items = section.match(/[-*]\s*(.+?)(?=\n[-*]|\n##|$)/g);
      if (items) {
        items.forEach((item) => {
          const cleaned = item.replace(/^[-*]\s*/, "").trim();
          if (cleaned) {
            deliverables.push(cleaned);
          }
        });
      }
    }

    return deliverables;
  }

  /**
   * Check if tests passed
   */
  private extractTestsPassed(content: string): boolean {
    const passingPatterns = [
      /all tests.*?passed/i,
      /tests.*?✅|✓/,
      /✅.*?tests/,
      /tests.*?PASS/i,
    ];

    const failingPatterns = [
      /tests.*?failed/i,
      /test.*?FAIL/i,
      /❌.*?test/,
    ];

    for (const pattern of failingPatterns) {
      if (pattern.test(content)) {
        return false;
      }
    }

    for (const pattern of passingPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    // Default: no clear indication
    return false;
  }

  /**
   * Extract test count from completion report
   */
  private extractTestCount(content: string): number | undefined {
    const match = content.match(/(\d+)\s*(?:tests?|test cases?)/i);
    if (match && match[1]) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count)) {
        return count;
      }
    }
    return undefined;
  }

  /**
   * Extract coverage dimensions (how many of 7 dimensions tested)
   */
  private extractCoverageDimensions(content: string): number {
    const dimensions = [
      /code.*?elegance/i,
      /architecture/i,
      /user.*?experience/i,
      /communication/i,
      /scientific.*?rigor/i,
      /performance/i,
      /security/i,
    ];

    let count = 0;
    for (const dimension of dimensions) {
      if (dimension.test(content)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Extract artifacts from completion report
   */
  private extractArtifacts(content: string): string[] {
    const artifacts: string[] = [];
    const artifactMatch = content.match(
      /##?\s*Artifacts?\s*:?\n([\s\S]*?)(?=\n##|$)/i
    );

    if (artifactMatch) {
      const section = artifactMatch[1];
      const items = section.match(/[-*]\s*(`[^`]+`|[^[\n]+)/g);
      if (items) {
        items.forEach((item) => {
          const cleaned = item.replace(/^[-*]\s*/, "").trim();
          if (cleaned) {
            artifacts.push(cleaned);
          }
        });
      }
    }

    // Also look for file paths in the content
    const filePaths = content.match(/(?:^|\n)\s*`[./a-zA-Z0-9_-]+\.[a-z]+`/gm);
    if (filePaths) {
      filePaths.forEach((p) => {
        const cleaned = p.replace(/[`\n\s]/g, "");
        if (cleaned && !artifacts.includes(cleaned)) {
          artifacts.push(cleaned);
        }
      });
    }

    return artifacts;
  }

  /**
   * Extract verification checklist results
   */
  /**
   * Extract critic results from completion report
   */
  private extractCriticResults(content: string): MLTaskCompletionReport['critic_results'] {
    const results: MLTaskCompletionReport['critic_results'] = {};

    const criticSections = [
      { name: 'modeling_reality_v2' as const, patterns: [/Modeling Reality.*?(?:✅|✓|pass|fail|✗|✘)/i, /Model Accuracy.*?(\d+)%/i] },
      { name: 'academic_rigor' as const, patterns: [/Academic Rigor.*?(?:✅|✓|pass|fail|✗|✘)/i, /Methodology.*?(?:valid|invalid|incomplete)/i] },
      { name: 'data_quality' as const, patterns: [/Data Quality.*?(?:✅|✓|pass|fail|✗|✘)/i, /Data.*?(?:validated|corrupted|incomplete)/i] }
    ];

    for (const { name, patterns } of criticSections) {
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          const text = match[0].toLowerCase();
          const passed = /(✅|✓|pass|valid)/.test(text);
          const message = match[1] ? `${match[1]}%` : undefined;

          results[name] = { passed, message };
          break;
        }
      }
    }

    return results;
  }

  private extractVerificationChecklist(
    content: string
  ): Record<string, boolean> {
    const checklist: Record<string, boolean> = {};

    // Common verification items with better patterns
    const items = [
      {
        name: "build",
        passPatterns: [/Build.*?(✅|✓|pass|success)/i],
        failPatterns: [/Build.*?(✗|✘|fail|error)/i],
      },
      {
        name: "tests",
        passPatterns: [
          /Tests?.*?(✅|✓|pass|passed|success)/i,
          /all.*tests.*(✅|✓|pass|passed)/i,
        ],
        failPatterns: [/Tests?.*?(✗|✘|fail|failed|error)/i],
      },
      {
        name: "audit",
        passPatterns: [/Audit.*?(✅|✓|pass|no|success)/i],
        failPatterns: [/Audit.*?(✗|✘|fail|error|vulnerabilities)/i],
      },
      {
        name: "documentation",
        passPatterns: [/Documentation.*?(✅|✓|complete|done)/i],
        failPatterns: [/Documentation.*?(✗|✘|incomplete|missing)/i],
      },
      {
        name: "performance",
        passPatterns: [/Performance.*?(✅|✓|pass|ok|good)/i],
        failPatterns: [/Performance.*?(✗|✘|fail|regression|slow)/i],
      },
    ];

    for (const item of items) {
      let hasPass = false;
      let hasFail = false;

      for (const pattern of item.passPatterns) {
        if (pattern.test(content)) {
          hasPass = true;
          break;
        }
      }

      for (const pattern of item.failPatterns) {
        if (pattern.test(content)) {
          hasFail = true;
          break;
        }
      }

      if (hasFail) {
        checklist[item.name] = false;
      } else if (hasPass) {
        checklist[item.name] = true;
      }
    }

    return checklist;
  }

  /**
   * Detect common blockers from task reports
   */
  private detectBlockers(reports: MLTaskCompletionReport[]): string[] {
    const blockers: string[] = [];
    const blockingPatterns = [
      "circular dependency",
      "infinite loop",
      "regression",
      "timeout",
      "out of memory",
      "permission denied",
      "missing dependency",
    ];

    for (const report of reports) {
      // Check verification checklist for failures
      const failedChecks = Object.entries(report.verification_checklist)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);

      if (failedChecks.length > 0) {
        blockers.push(`Task ${report.id} failed checks: ${failedChecks.join(", ")}`);
      }

      // Check for low test coverage
      if (report.coverage_dimensions && report.coverage_dimensions < 4) {
        blockers.push(
          `Task ${report.id} has incomplete test coverage (${report.coverage_dimensions}/7 dimensions)`
        );
      }

      // Check for missing artifacts
      if (report.artifacts_generated.length === 0) {
        blockers.push(`Task ${report.id} has no documented artifacts`);
      }
    }

    return [...new Set(blockers)]; // Deduplicate
  }

  /**
   * Observe patterns across completed tasks
   */
  private observePatterns(reports: MLTaskCompletionReport[]): string[] {
    const patterns: string[] = [];

    // Pattern: Average completion rate
    const avgCompletion =
      reports.filter((r) => r.tests_passed).length / Math.max(reports.length, 1);
    if (avgCompletion < 0.8) {
      patterns.push(
        `Low completion rate: ${(avgCompletion * 100).toFixed(1)}% of tasks passing`
      );
    }

    // Pattern: Coverage distribution
    const avgDimensions =
      reports.reduce((sum, r) => sum + (r.coverage_dimensions || 0), 0) /
      Math.max(reports.length, 1);
    if (avgDimensions < 4) {
      patterns.push(
        `Limited test coverage: average ${avgDimensions.toFixed(1)}/7 dimensions`
      );
    }

    // Pattern: Artifact generation
    const tasksWithoutArtifacts = reports.filter(
      (r) => r.artifacts_generated.length === 0
    ).length;
    if (tasksWithoutArtifacts > 0) {
      patterns.push(
        `${tasksWithoutArtifacts} tasks lack documented artifacts`
      );
    }

    // Pattern: Common verification failures
    const failureFrequency: Record<string, number> = {};
    for (const report of reports) {
      for (const [check, passed] of Object.entries(
        report.verification_checklist
      )) {
        if (!passed) {
          failureFrequency[check] = (failureFrequency[check] || 0) + 1;
        }
      }
    }

    const frequentFailures = Object.entries(failureFrequency)
      .filter(([, count]) => count >= 2)
      .map(([check]) => `${check} verification`)
      .slice(0, 3);

    if (frequentFailures.length > 0) {
      patterns.push(
        `Recurring verification failures: ${frequentFailures.join(", ")}`
      );
    }

    return patterns;
  }

  /**
   * Merge task lists from different sources
   */
  private mergeTasks(
    tasks1: MLTaskSummary[],
    tasks2: MLTaskSummary[]
  ): MLTaskSummary[] {
    const taskMap = new Map<string, MLTaskSummary>();

    // Add first set
    for (const task of tasks1) {
      taskMap.set(task.id, task);
    }

    // Add/merge second set
    for (const task of tasks2) {
      if (taskMap.has(task.id)) {
        // Merge metadata
        const existing = taskMap.get(task.id)!;
        taskMap.set(task.id, {
          ...existing,
          ...task,
          metadata: {
            ...existing.metadata,
            ...task.metadata,
          },
        });
      } else {
        taskMap.set(task.id, task);
      }
    }

    return Array.from(taskMap.values());
  }

  /**
   * Get tasks from state machine
   */
  private async getTasksFromState(): Promise<MLTaskSummary[]> {
    const tasks: MLTaskSummary[] = [];

    try {
      // Try to read state database or JSON files
      const analyticsPath = path.join(
        this.stateRoot,
        "analytics",
        "orchestration_metrics.json"
      );

      if (await this.fileExists(analyticsPath)) {
        const content = await fs.readFile(analyticsPath, "utf-8");
        const metrics = JSON.parse(content);

        if (metrics.decisions && Array.isArray(metrics.decisions)) {
          for (const decision of metrics.decisions) {
            if (
              decision.related_tasks &&
              Array.isArray(decision.related_tasks)
            ) {
              for (const taskId of decision.related_tasks) {
                if (!tasks.find((t) => t.id === taskId)) {
                  tasks.push({
                    id: taskId,
                    title: decision.topic || "Unknown",
                    status: "done",
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logWarning("Failed to read tasks from state", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return tasks;
  }

  /**
   * Find completion report for a task
   */
  private async findCompletionReport(taskId: string): Promise<string | null> {
    try {
      // Search in docs directory for completion reports matching task ID
      const docsDir = path.join(this.workspaceRoot, "docs");
      const reports = await this.findCompletionReportsInDir(docsDir);

      // Look for reports matching the task ID
      const matching = reports.filter((r) =>
        r.includes(taskId) && r.includes("COMPLETION")
      );

      if (matching.length > 0) {
        return matching[0];
      }

      // Fallback: search for any completion report
      return reports.length > 0 ? reports[0] : null;
    } catch (error) {
      logWarning("Failed to find completion report", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Extract task ID from file path
   */
  private extractTaskIdFromPath(filePath: string): string {
    // Try to extract task ID patterns like T12.0.1, T-MLR-4.3, etc.
    const matches = [
      filePath.match(/T[\d.]+/),
      filePath.match(/T-[A-Z]+-[\d.]+/),
      filePath.match(/TASK_([A-Z0-9-_.]+)/),
    ];

    for (const match of matches) {
      if (match) {
        return match[0];
      }
    }

    // Fallback: use filename without extension
    return path.basename(filePath, ".md");
  }

  /**
   * Extract title from file path
   */
  private extractTitleFromPath(filePath: string): string {
    const filename = path.basename(filePath, ".md");
    return filename
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .replace(/COMPLETION REPORT/, "")
      .trim();
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Recursively find completion reports in a directory
   */
  private async findCompletionReportsInDir(dirPath: string): Promise<string[]> {
    const reports: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(this.workspaceRoot, fullPath);

        if (entry.isDirectory()) {
          // Skip node_modules and .git
          if (entry.name !== "node_modules" && entry.name !== ".git") {
            const subReports = await this.findCompletionReportsInDir(fullPath);
            reports.push(...subReports);
          }
        } else if (entry.isFile() && entry.name.includes("COMPLETION") && entry.name.endsWith(".md")) {
          reports.push(relativePath);
        }
      }
    } catch (error) {
      logWarning("Failed to search directory for completion reports", {
        dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return reports;
  }
}
