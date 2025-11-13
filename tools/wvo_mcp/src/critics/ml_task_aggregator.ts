import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPORT_SUFFIX = '_COMPLETION_REPORT.md';

export interface CriticResultSummary {
  passed: boolean;
  message?: string;
  raw: string;
}

export type CriticResultMap = Record<string, CriticResultSummary>;

export interface MLTaskSummary {
  id: string;
  title: string;
  status: 'done' | 'failed' | 'in_progress';
  report_path: string;
  deliverables: string[];
  artifacts_generated: string[];
  quality_metrics: Record<string, number>;
  verification_checklist: Record<string, boolean>;
  tests_passed: boolean | null;
  test_count: number | null;
  coverage_dimensions: number | null;
  blockers: string[];
  completion_path?: string;
  critic_results: CriticResultMap;
}

export interface AggregatedMLTasksReport {
  analysis_timestamp: number;
  total_tasks_analyzed: number;
  completed_tasks: number;
  in_progress_tasks: number;
  failed_tasks: number;
  average_completion_rate: number;
  tasks: MLTaskSummary[];
  blockers_detected: string[];
  patterns_observed: string[];
}

const dedupe = <T>(items: T[]) => Array.from(new Set(items));

export class MLTaskAggregator {
  constructor(private readonly workspaceRoot: string, private readonly stateRoot: string) {}

  async getCompletedMLTasks(): Promise<MLTaskSummary[]> {
    const reports = await this.listReports();
    const summaries: MLTaskSummary[] = [];
    for (const relative of reports) {
      const summary = await this.analyzeCompletedTask(this.deriveId(relative), relative);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  async analyzeCompletedTask(taskId: string, relativePath: string): Promise<MLTaskSummary | null> {
    const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(this.workspaceRoot, relativePath);
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }

    const deliverables = extractList(content, 'Deliverables');
    const qualityMetrics = extractMetrics(content, 'Quality Metrics');
    const verification = extractChecklist(content);
    const testsPassed = detectTestsPassed(content);
    const testCount = extractTestCount(content);
    const coverage = extractCoverageDimensions(content);
    const criticResults = extractCriticResults(content);
    const blockers = dedupe([
      ...Object.entries(verification).filter(([, ok]) => !ok).map(([label]) => `Verification failed: ${label}`),
      ...(testsPassed === false ? ['Tests failing'] : []),
      ...(coverage !== null && coverage < 4 ? ['Insufficient coverage'] : []),
      ...Object.entries(criticResults)
        .filter(([, result]) => !result.passed)
        .map(([critic, result]) =>
          result.raw ? `Critic failure (${critic}): ${result.raw}` : `Critic failure (${critic})`
        ),
      ...(hasCriticalLanguage(content) ? ['Reported critical issues'] : []),
    ]);

    return {
      id: taskId,
      title: extractTitle(content) ?? taskId,
      status: blockers.length > 0 || testsPassed === false ? 'failed' : 'done',
      report_path: path.relative(this.workspaceRoot, filePath),
      completion_path: path.relative(this.workspaceRoot, filePath),
      deliverables,
      artifacts_generated: deliverables.slice(),
      quality_metrics: qualityMetrics,
      verification_checklist: verification,
      tests_passed: testsPassed,
      test_count: testCount,
      coverage_dimensions: coverage,
      blockers,
      critic_results: criticResults,
    };
  }

  async generateAggregatedReport(): Promise<AggregatedMLTasksReport> {
    const rawSummaries = await this.getCompletedMLTasks();
    const tasks = await Promise.all(rawSummaries.map((summary) => this.ensureSummary(summary)));

    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === 'done' && task.tests_passed !== false && task.blockers.length === 0).length;
    const inProgress = tasks.filter((task) => task.status === 'in_progress').length;
    const failed = tasks.filter((task) => task.status === 'failed' || task.tests_passed === false || task.blockers.length > 0).length;
    const blockers = dedupe(tasks.flatMap((task) => task.blockers)).sort();
    const patterns = detectPatterns(tasks, completed, failed);

    return {
      analysis_timestamp: Date.now(),
      total_tasks_analyzed: total,
      completed_tasks: completed,
      in_progress_tasks: inProgress,
      failed_tasks: failed,
      average_completion_rate: total === 0 ? 0 : (completed / total) * 100,
      tasks,
      blockers_detected: blockers,
      patterns_observed: patterns,
    };
  }

  private async ensureSummary(summary: Partial<MLTaskSummary> & { id: string; completion_path?: string }): Promise<MLTaskSummary> {
    const hasAllCoreFields =
      summary.tests_passed !== undefined &&
      summary.coverage_dimensions !== undefined &&
      summary.blockers !== undefined &&
      summary.verification_checklist !== undefined &&
      summary.critic_results !== undefined;

    if (!hasAllCoreFields) {
      const source = summary.report_path ?? summary.completion_path;
      if (source) {
        const enriched = await this.analyzeCompletedTask(summary.id, source);
        if (enriched) {
          return {
            ...enriched,
            title: summary.title ?? enriched.title,
            status:
              summary.status === 'in_progress'
                ? 'in_progress'
                : summary.status === 'failed'
                  ? 'failed'
                  : enriched.status,
            completion_path: enriched.report_path,
            critic_results: summary.critic_results ?? enriched.critic_results,
          };
        }
      }
    }

    const reportPath = summary.report_path ?? summary.completion_path ?? '';
    return {
      id: summary.id,
      title: summary.title ?? summary.id,
      status: summary.status ?? 'done',
      report_path: reportPath,
      completion_path: summary.completion_path ?? reportPath,
      deliverables: summary.deliverables ?? [],
      artifacts_generated: summary.artifacts_generated ?? summary.deliverables ?? [],
      quality_metrics: summary.quality_metrics ?? {},
      verification_checklist: summary.verification_checklist ?? {},
      tests_passed: summary.tests_passed ?? null,
      test_count: summary.test_count ?? null,
      coverage_dimensions: summary.coverage_dimensions ?? null,
      blockers: summary.blockers ?? [],
      critic_results: summary.critic_results ?? {},
    };
  }

  private async listReports(): Promise<string[]> {
    const roots = [path.join(this.workspaceRoot, 'docs'), path.join(this.stateRoot, 'evidence')];
    const discovered: string[] = [];
    for (const root of roots) {
      try {
        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(REPORT_SUFFIX)) {
            discovered.push(path.relative(this.workspaceRoot, path.join(root, entry.name)));
          }
        }
      } catch {
        // ignore missing roots
      }
    }
    return dedupe(discovered);
  }

  private deriveId(relativePath: string): string {
    return path.basename(relativePath, REPORT_SUFFIX).replace(/_/g, '-');
  }
}

const extractTitle = (content: string) => content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;

const extractSection = (content: string, heading: string) => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`##\\s+${escapedHeading}[\\s\\S]*?(?=\\n##\\s+|$)`, 'i');
  return content.match(pattern)?.[0] ?? '';
};

const extractList = (content: string, heading: string) =>
  extractSection(content, heading)
    .split('\n')
    .map((line) => line.trim().replace(/^[*-]\s*/, ''))
    .filter((line) => line && !line.startsWith('##'));

const extractMetrics = (content: string, heading: string) =>
  extractSection(content, heading)
    .split('\n')
    .reduce<Record<string, number>>((acc, line) => {
      const match = line.match(/[-*]\s*([^:]+):\s*([\d.]+)/);
      if (match) acc[match[1].trim()] = Number.parseFloat(match[2]);
      return acc;
    }, {});

const extractChecklist = (content: string) =>
  extractSection(content, 'Verification Checklist')
    .split('\n')
    .reduce<Record<string, boolean>>((acc, line) => {
      const match = line.match(/[-*]\s*(✅|✔️|✓|✗|✘|❌)\s*(.+)/);
      if (match) acc[match[2].replace(/-\s*/g, '').trim()] = match[1] === '✅' || match[1] === '✔️' || match[1] === '✓';
      return acc;
    }, {});

const detectTestsPassed = (content: string): boolean | null =>
  /✅\s*All\s+\d*\s*tests\s+passed/i.test(content)
    ? true
    : /❌\s*Tests\s+failed|tests\s+failed/i.test(content)
      ? false
      : null;

const extractTestCount = (content: string) => {
  const match = content.match(/(\d+)\s+tests\s+(?:passed|run|executed)/i);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractCoverageDimensions = (content: string) => {
  const block = extractSection(content, 'Coverage') || extractSection(content, 'Test Coverage');
  if (!block) return null;
  const bullets = block.split('\n').filter((line) => /[-*]\s/.test(line)).length;
  if (bullets > 0) return bullets;
  const mentions = (block.match(/covered/gi) ?? []).length;
  return mentions > 0 ? mentions : null;
};

const sanitizeCriticalMentions = (content: string) =>
  content
    .toLowerCase()
    .replace(/\bno\s+(critical issues?|blockers?|regressions?|failures?)\b/g, '')
    .replace(/\bwithout\s+(critical issues?|blockers?|regressions?|failures?)\b/g, '');

const hasCriticalLanguage = (content: string) => {
  const sanitized = sanitizeCriticalMentions(content);
  return /(critical issue|blocker|regression|failure)/i.test(sanitized);
};

const criticAliases: Record<string, string> = {
  'modeling reality': 'modeling_reality_v2',
  'modeling reality v2': 'modeling_reality_v2',
  'academic rigor': 'academic_rigor',
  'data quality': 'data_quality',
};

const extractCriticResults = (content: string): CriticResultMap =>
  extractSection(content, 'Critics')
    .split('\n')
    .reduce<CriticResultMap>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('##')) return acc;
      const match = trimmed.match(/^(.*?)[\s:-]+(✅|✔️|✓|✗|✘|❌)\s*(.*)$/i);
      if (!match) return acc;
      const [, rawLabel, symbol, rest] = match;
      const keyBase = rawLabel.trim().toLowerCase();
      const key = criticAliases[keyBase] ?? keyBase.replace(/[^a-z0-9]+/g, '_');
      const passed = symbol === '✅' || symbol === '✔️' || symbol === '✓';
      const message = rest.match(/(\d+(?:\.\d+)?%)/)?.[1];
      acc[key] = { passed, raw: rest.trim(), ...(message ? { message } : {}) };
      return acc;
    }, {});

const detectPatterns = (tasks: MLTaskSummary[], completed: number, failed: number) => {
  const patterns: string[] = [];
  const avgCoverage = tasks.reduce((sum, task) => sum + (task.coverage_dimensions ?? 0), 0) /
    Math.max(tasks.length, 1);
  if (failed > 0) patterns.push('Recurring task failures detected');
  if (avgCoverage < 5 && tasks.length > 0) patterns.push('Coverage gaps across ML tasks');
  if (tasks.some((task) => task.artifacts_generated.length === 0)) patterns.push('Tasks missing documented artifacts');
  if (completed < tasks.length / 2 && tasks.length > 0) patterns.push('Low completion rate trend');
  return patterns;
};
