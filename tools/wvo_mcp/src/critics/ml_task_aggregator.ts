import { promises as fs } from "node:fs";
import path from "node:path";

import { logWarning } from "../telemetry/logger.js";
import { resolveStateRoot } from "../utils/config.js";

export interface CriticResult {
  label: string;
  passed: boolean;
  message?: string;
  raw?: string;
}

export interface MLTaskCompletionReport {
  id: string;
  status: "done" | "failed" | "in_progress";
  title?: string;
  summary?: string;
  blockers?: string[];
  deliverables: string[];
  quality_metrics: Record<string, number | string>;
  tests_passed?: boolean;
  test_count?: number;
  coverage_dimensions?: number;
  artifacts?: string[];
  verification_checklist: Record<string, boolean>;
  notes?: string[];
  completion_timestamp?: string;
  completion_path?: string;
  critic_results?: Record<string, CriticResult>;
}

export interface MLTaskSummary {
  id: string;
  title?: string;
  status: MLTaskCompletionReport["status"];
  tests_passed?: boolean;
  test_count?: number;
  coverage_dimensions?: number;
  artifacts_generated: string[];
  blockers?: string[];
  verification_checklist: Record<string, boolean>;
  deliverables: string[];
  completion_timestamp?: string;
  completion_path?: string;
  critic_results?: Record<string, CriticResult>;
}

export interface AggregatedMLTasksReport {
  total_tasks_analyzed: number;
  average_completion_rate: number;
  in_progress_tasks: number;
  failed_tasks: number;
  completed_tasks: number;
  patterns_observed: string[];
  blockers_detected: string[];
  tasks: MLTaskSummary[];
  average_delivery_time_days: number;
  coverage_dimensions_average: number;
  completion_rate_by_phase: Record<string, number>;
  tasks_missing_artifacts: number;
  tasks_with_followups: number;
  analysis_timestamp: number;
}

const COMPLETION_REPORT_PATTERN = /_COMPLETION_REPORT\.md$/;

export class MLTaskAggregator {
  private readonly workspaceRoot: string;
  private readonly stateRoot: string;

  constructor(workspaceRoot: string, stateRoot?: string) {
    this.workspaceRoot = workspaceRoot;
    this.stateRoot = stateRoot ?? resolveStateRoot(workspaceRoot);
  }

  /**
   * Aggregates completion reports and returns a summarized view.
   */
  async generateAggregatedReport(): Promise<AggregatedMLTasksReport> {
    const tasks = await this.getCompletedMLTasks();

    if (tasks.length === 0) {
      return this.createEmptyReport();
    }

    const reportIndex = await this.buildReportIndex();
    const reports = tasks.map((task) => reportIndex.get(task.id) ?? this.summaryToReport(task));
    const normalizedTasks = tasks.map((task, index) => this.normalizeTask(task, reports[index]));
    const doneTasks = normalizedTasks.filter((task) => task.status === "done").length;
    const failedTasks = normalizedTasks.filter((task) => task.status === "failed").length;
    const inProgressTasks = normalizedTasks.filter((task) => task.status === "in_progress").length;

    const completionRate = normalizedTasks.length === 0 ? 0 : (doneTasks / normalizedTasks.length) * 100;
    const coverageAverage =
      normalizedTasks.reduce((sum, task) => sum + (task.coverage_dimensions ?? 0), 0) / normalizedTasks.length;

    const tasksMissingArtifacts = normalizedTasks.filter((task) => (task.artifacts_generated ?? []).length === 0).length;
    const tasksWithFollowups = normalizedTasks.filter((task) =>
      Object.values(task.verification_checklist ?? {}).some((passed) => !passed),
    ).length;

    const blockersDetected = this.collectBlockers(reports, normalizedTasks);
    const patternsObserved = this.collectPatterns(reports);

    return {
      total_tasks_analyzed: normalizedTasks.length,
      average_completion_rate: Number.isFinite(completionRate) ? completionRate : 0,
      in_progress_tasks: inProgressTasks,
      failed_tasks: failedTasks,
      completed_tasks: doneTasks,
      patterns_observed: patternsObserved,
      blockers_detected: Array.from(blockersDetected),
      tasks: normalizedTasks,
      average_delivery_time_days: 0,
      coverage_dimensions_average: Number.isFinite(coverageAverage) ? coverageAverage : 0,
      completion_rate_by_phase: {
        strategize: 100,
        implement: Number.isFinite(completionRate) ? completionRate : 0,
        verify:
          normalizedTasks.length === 0
            ? 0
            : (normalizedTasks.filter((task) => task.tests_passed).length / normalizedTasks.length) * 100,
      },
      tasks_missing_artifacts: tasksMissingArtifacts,
      tasks_with_followups: tasksWithFollowups,
      analysis_timestamp: Date.now(),
    };
  }

  async getCompletedMLTasks(): Promise<MLTaskSummary[]> {
    const reports = await this.loadCompletionReports();
    return reports.map((report) => this.toSummary(report));
  }

  async analyzeCompletedTask(taskId: string, completionPath: string): Promise<MLTaskCompletionReport | null> {
    const absolutePath = path.isAbsolute(completionPath)
      ? completionPath
      : path.join(this.workspaceRoot, completionPath);

    try {
      const report = await this.parseCompletionReport(absolutePath);
      return report ? { ...report, id: taskId, completion_path: this.makeRelativePath(absolutePath) } : null;
    } catch (error) {
      logWarning("Failed to analyze ML task completion report", {
        taskId,
        completionPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async buildReportIndex(): Promise<Map<string, MLTaskCompletionReport>> {
    const reports = await this.loadCompletionReports();
    return new Map(reports.map((report) => [report.id, report]));
  }

  private async loadCompletionReports(): Promise<MLTaskCompletionReport[]> {
    const results = new Map<string, MLTaskCompletionReport>();

    const searchRoots = [
      path.join(this.workspaceRoot, "docs"),
      path.join(this.workspaceRoot, "state", "evidence"),
      path.join(this.stateRoot, "analytics"),
    ];

    for (const root of searchRoots) {
      try {
        const files = await this.walk(root);
        for (const file of files) {
          if (!COMPLETION_REPORT_PATTERN.test(file)) continue;
          const maybeReport = await this.parseCompletionReport(file);
          if (!maybeReport) continue;

          const existing = results.get(maybeReport.id);
          if (!existing) {
            results.set(maybeReport.id, maybeReport);
          } else {
            results.set(maybeReport.id, this.mergeReports(existing, maybeReport));
          }
        }
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code !== "ENOENT") {
          logWarning("Failed to scan completion reports", {
            root,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return Array.from(results.values());
  }

  private async walk(root: string): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walk(entryPath)));
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }

    return files;
  }

  private async parseCompletionReport(filePath: string): Promise<MLTaskCompletionReport | null> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const id = path.basename(filePath).replace("_COMPLETION_REPORT.md", "");

      const report: MLTaskCompletionReport = {
        id,
        status: this.extractStatus(content),
        title: this.extractTitle(content),
        deliverables: this.extractDeliverables(content),
        quality_metrics: this.extractQualityMetrics(content),
        blockers: this.extractBlockers(content),
        tests_passed: this.extractTestsPassed(content),
        test_count: this.extractTestCount(content),
        coverage_dimensions: this.extractCoverageDimensions(content),
        artifacts: this.extractArtifacts(content),
        verification_checklist: this.extractVerificationChecklist(content),
        notes: this.extractNotes(content),
        critic_results: this.extractCriticResults(content),
        completion_path: this.makeRelativePath(filePath),
      };

      return report;
    } catch (error) {
      logWarning("Failed to parse ML task completion report", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private extractStatus(markdown: string): MLTaskCompletionReport["status"] {
    if (/status:\s*done/i.test(markdown) || /✅\s*All tasks complete/i.test(markdown)) return "done";
    if (/status:\s*(blocked|failed|incomplete)/i.test(markdown) || /❌\s*(Tasks|Tests)\s+failed/i.test(markdown)) {
      return "failed";
    }
    if (/status:\s*(in[_\s]?progress|ongoing)/i.test(markdown)) return "in_progress";
    return "done";
  }

  private extractTitle(markdown: string): string | undefined {
    const match = markdown.match(/#\s+Task\s+(.+?)\s+Completion/i);
    return match ? match[1].trim() : undefined;
  }

  private extractDeliverables(markdown: string): string[] {
    const section = this.extractSection(markdown, "Deliverables");
    if (!section) return [];
    return this.extractList(section);
  }

  private extractQualityMetrics(markdown: string): Record<string, number | string> {
    const section = this.extractSection(markdown, "Quality Metrics");
    if (!section) return {};
    const metrics: Record<string, number | string> = {};
    for (const line of section.split("\n")) {
      const match = line.match(/-\s*(.+?):\s*(.+)/);
      if (!match) continue;

      const key = match[1].trim();
      const value = match[2].trim();
      const numeric = Number.parseFloat(value.replace(/[^\d.]/g, ""));
      metrics[key] = Number.isFinite(numeric) ? numeric : value;
    }
    return metrics;
  }

  private extractBlockers(markdown: string): string[] {
    const section = this.extractSection(markdown, "Blockers");
    if (!section) return [];
    return this.extractList(section);
  }

  private extractTestsPassed(markdown: string): boolean | undefined {
    if (/✅\s*All tests passed/i.test(markdown)) return true;
    if (/❌\s*Tests failed/i.test(markdown)) return false;
    return undefined;
  }

  private extractTestCount(markdown: string): number | undefined {
    const match = markdown.match(/(\d+)\s+tests?\s+(?:passed|executed)/i);
    if (!match) return undefined;
    const count = Number.parseInt(match[1], 10);
    return Number.isFinite(count) ? count : undefined;
  }

  private extractCoverageDimensions(markdown: string): number | undefined {
    const coverageHeaders = ["Test Coverage", "Coverage Dimensions", "Coverage"];
    for (const header of coverageHeaders) {
      const section = this.extractSection(markdown, header);
      if (!section) continue;
      const items = this.extractList(section);
      if (items.length > 0) {
        return items.length;
      }
    }

    const inlineMatches = markdown.match(/Coverage:\s*(\d+)\s*\/\s*(\d+)/i);
    if (inlineMatches) {
      const [covered, total] = inlineMatches.slice(1).map((value) => Number.parseInt(value, 10));
      if (Number.isFinite(covered) && Number.isFinite(total) && total > 0) {
        const ratio = covered / total;
        const estimatedDimensions = Math.round(ratio * 7);
        return Math.max(0, Math.min(7, estimatedDimensions));
      }
    }

    return undefined;
  }

  private extractArtifacts(markdown: string): string[] {
    const section = this.extractSection(markdown, "Artifacts");
    if (!section) return [];
    return this.extractList(section);
  }

  private extractVerificationChecklist(markdown: string): Record<string, boolean> {
    const section = this.extractSection(markdown, "Verification Checklist");
    if (!section) return {};
    const checklist: Record<string, boolean> = {};
    for (const line of section.split("\n")) {
      const match = line.match(/-\s*(✅|☑️|❌)\s*(.+)/);
      if (!match) continue;
      checklist[match[2].trim()] = match[1] !== "❌";
    }
    return checklist;
  }

  private extractNotes(markdown: string): string[] {
    const section = this.extractSection(markdown, "Learnings") ?? this.extractSection(markdown, "Notes");
    if (!section) return [];
    return this.extractList(section);
  }

  private extractCriticResults(markdown: string): Record<string, CriticResult> {
    const section = this.extractSection(markdown, "Critics");
    if (!section) return {};

    const results: Record<string, CriticResult> = {};
    for (const line of section.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const lineMatch = trimmed.match(/^(?:[-*+]\s*)?([^:]+):\s*(.+)$/);
      if (!lineMatch) continue;

      const criticLabel = lineMatch[1].trim();
      const payload = lineMatch[2].trim();

      const passed = /✅|✓|pass\b/i.test(payload);
      const failed = /✗|✘|fail\b|blocked/i.test(payload);

      const numericMessage = payload.match(/(\d+\s*%|\d+(?:\.\d+)?)/)?.pop();
      const fallbackMessage = payload.split(/-\s*/).pop()?.replace(/^(✅|✓|✗|✘)\s*/u, "").trim();
      const message = (numericMessage ?? fallbackMessage)?.trim();

      const key = this.normalizeCriticKey(criticLabel);
      if (!key) continue;

      if (!passed && !failed) {
      results[key] = {
        label: criticLabel,
        passed: true,
        message: message && message.length > 0 ? message : undefined,
        raw: payload,
      };
      continue;
    }

    results[key] = {
      label: criticLabel,
      passed: failed ? false : true,
      message: message && message.length > 0 ? message : undefined,
      raw: payload,
    };
  }

    return results;
  }

  private extractSection(markdown: string, header: string): string | null {
    const pattern = new RegExp(`##\\s+${header}[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
    const match = markdown.match(pattern);
    if (!match) return null;
    return match[0];
  }

  private extractList(section: string): string[] {
    const listItems: string[] = [];
    for (const line of section.split("\n")) {
      const match = line.match(/^\s*[-*+]\s+(.*)$/);
      if (match) {
        listItems.push(match[1].trim());
      }
    }
    return listItems;
  }

  private toSummary(report: MLTaskCompletionReport): MLTaskSummary {
    return {
      id: report.id,
      title: report.title,
      status: report.status,
      tests_passed: report.tests_passed,
      test_count: report.test_count,
      coverage_dimensions: report.coverage_dimensions,
      artifacts_generated: report.artifacts ?? report.deliverables ?? [],
      blockers: report.blockers,
      verification_checklist: report.verification_checklist,
      deliverables: report.deliverables,
      completion_timestamp: report.completion_timestamp,
      completion_path: report.completion_path,
      critic_results: report.critic_results,
    };
  }

  private summaryToReport(summary: MLTaskSummary): MLTaskCompletionReport {
    return {
      id: summary.id,
      status: summary.status,
      title: summary.title,
      deliverables: summary.deliverables ?? [],
      quality_metrics: {},
      blockers: summary.blockers ?? [],
      tests_passed: summary.tests_passed,
      test_count: summary.test_count,
      coverage_dimensions: summary.coverage_dimensions,
      artifacts: summary.artifacts_generated ?? [],
      verification_checklist: summary.verification_checklist ?? {},
      notes: [],
      completion_timestamp: summary.completion_timestamp,
      completion_path: summary.completion_path,
      critic_results: summary.critic_results,
    };
  }

  private createEmptyReport(): AggregatedMLTasksReport {
    return {
      total_tasks_analyzed: 0,
      average_completion_rate: 0,
      in_progress_tasks: 0,
      failed_tasks: 0,
      completed_tasks: 0,
      patterns_observed: [],
      blockers_detected: [],
      tasks: [],
      average_delivery_time_days: 0,
      coverage_dimensions_average: 0,
      completion_rate_by_phase: {
        strategize: 100,
        implement: 0,
        verify: 0,
      },
      tasks_missing_artifacts: 0,
      tasks_with_followups: 0,
      analysis_timestamp: Date.now(),
    };
  }

  private makeRelativePath(filePath: string): string {
    if (filePath.startsWith(this.workspaceRoot)) {
      return path.relative(this.workspaceRoot, filePath);
    }
    return filePath;
  }

  private mergeReports(primary: MLTaskCompletionReport, secondary: MLTaskCompletionReport): MLTaskCompletionReport {
    const status = this.rankStatus(primary.status) >= this.rankStatus(secondary.status)
      ? primary.status
      : secondary.status;

    return {
      ...primary,
      ...secondary,
      status,
      deliverables: this.mergeArrays(primary.deliverables, secondary.deliverables),
      blockers: this.mergeArrays(primary.blockers ?? [], secondary.blockers ?? []),
      artifacts: this.mergeArrays(primary.artifacts ?? [], secondary.artifacts ?? []),
      notes: this.mergeArrays(primary.notes ?? [], secondary.notes ?? []),
      verification_checklist: {
        ...primary.verification_checklist,
        ...secondary.verification_checklist,
      },
      critic_results: {
        ...primary.critic_results,
        ...secondary.critic_results,
      },
    };
  }

  private mergeArrays<T>(a: T[] = [], b: T[] = []): T[] {
    const set = new Set<T>([...a, ...b]);
    return Array.from(set);
  }

  private rankStatus(status: MLTaskCompletionReport["status"]): number {
    switch (status) {
      case "failed":
        return 2;
      case "in_progress":
        return 1;
      default:
        return 0;
    }
  }

  private collectBlockers(
    reports: MLTaskCompletionReport[],
    summaries: MLTaskSummary[],
  ): Set<string> {
    const blockers = new Set<string>();

    for (const summary of summaries) {
      for (const blocker of summary.blockers ?? []) {
        if (blocker) {
          blockers.add(blocker);
        }
      }

      if (summary.tests_passed === false) {
        blockers.add("Tests failing");
      }

      if ((summary.coverage_dimensions ?? 0) < 3) {
        blockers.add("Low coverage across quality dimensions");
      }
    }

    for (const report of reports) {
      for (const critic of Object.values(report.critic_results ?? {})) {
        if (critic.passed === false) {
          const descriptor = critic.message
            ? `${critic.label}: ${critic.raw ?? critic.message}`
            : critic.label;
          blockers.add(descriptor);
        }
      }
    }

    return blockers;
  }

  private collectPatterns(reports: MLTaskCompletionReport[]): string[] {
    const patterns = new Set<string>();

    const failingTests = reports.filter((report) => report.tests_passed === false).length;
    if (failingTests >= 3) {
      patterns.add("Recurring test failures across ML tasks");
    }

    const lowCoverage = reports.filter((report) => (report.coverage_dimensions ?? 0) < 4).length;
    if (lowCoverage >= 3) {
      patterns.add("Coverage gaps detected in multiple tasks");
    }

    const criticFailures = reports.some((report) =>
      Object.values(report.critic_results ?? {}).some((critic) => critic.passed === false),
    );
    if (criticFailures) {
      patterns.add("Critic failures observed in recent completions");
    }

    return Array.from(patterns);
  }

  private normalizeCriticKey(label: string): string | null {
    const normalized = label.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith("modeling reality")) return "modeling_reality_v2";
    if (normalized.startsWith("academic rigor")) return "academic_rigor";
    if (normalized.startsWith("data quality")) return "data_quality";
    return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  private normalizeTask(task: MLTaskSummary, report: MLTaskCompletionReport): MLTaskSummary {
    const derivedStatus = this.deriveStatus(task, report);
    return {
      ...task,
      status: derivedStatus,
      tests_passed: report.tests_passed ?? task.tests_passed,
      test_count: report.test_count ?? task.test_count,
      coverage_dimensions: report.coverage_dimensions ?? task.coverage_dimensions,
      artifacts_generated: report.artifacts ?? task.artifacts_generated ?? [],
      blockers: report.blockers?.length ? report.blockers : task.blockers,
      verification_checklist: Object.keys(report.verification_checklist ?? {}).length
        ? report.verification_checklist
        : task.verification_checklist ?? {},
      deliverables: report.deliverables ?? task.deliverables ?? [],
      completion_timestamp: report.completion_timestamp ?? task.completion_timestamp,
      completion_path: report.completion_path ?? task.completion_path,
      critic_results: report.critic_results ?? task.critic_results,
    };
  }

  private deriveStatus(
    task: MLTaskSummary,
    report: MLTaskCompletionReport,
  ): MLTaskCompletionReport["status"] {
    if (report.status === "failed") return "failed";
    if (report.status === "in_progress") return "in_progress";
    if (report.tests_passed === false || task.tests_passed === false) return "failed";
    if (Object.values(report.verification_checklist ?? {}).some((passed) => !passed)) return "failed";
    return task.status;
  }
}
