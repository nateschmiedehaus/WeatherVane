/**
 * Context Assembler - Builds minimal, focused context for agents
 *
 * Philosophy:
 * - Agents get ONLY what they need for the current task
 * - No dumping of full logs or state
 * - Just-in-time assembly based on task type and dependencies
 * - Smart summarization of history (recent + relevant only)
 *
 * Example: For implementing a feature, agent gets:
 * - The task description
 * - Relevant architectural decisions
 * - Code files they'll need to modify
 * - Recent quality issues in that area
 * - NOT: Full event log, all metrics, entire roadmap
 */

import type { StateMachine, Task, ContextEntry, QualityMetric, ResearchCacheRecord } from './state_machine.js';
import { CodeSearchIndex } from '../utils/code_search.js';
import type { LiveFlagsReader } from './live_flags.js';

// ============================================================================
// Types
// ============================================================================

export interface AssembledContext {
  // Core task info
  task: Task;
  relatedTasks: Task[];  // Dependencies, parent, siblings

  // Focused context
  relevantDecisions: ContextEntry[];
  relevantConstraints: ContextEntry[];
  recentLearnings: ContextEntry[];

  // Quality signals
  qualityIssuesInArea: QualityMetric[];
  overallQualityTrend: {
    dimension: string;
    currentScore: number;
    trend: 'improving' | 'stable' | 'declining';
  }[];

  // Research insight
  researchHighlights?: string[];

  // Code context (if applicable)
  filesToRead?: string[];
  recentChangesInArea?: string[];

  // Strategic context
  projectPhase: string;
  velocityMetrics: {
    tasksCompletedToday: number;
    averageTaskDuration: number;
    qualityTrendOverall: string;
  };
}

export interface ContextAssemblyOptions {
  includeCodeContext?: boolean;
  includeQualityHistory?: boolean;
  maxDecisions?: number;
  maxLearnings?: number;
  hoursBack?: number;  // How far back to look for relevant history
}

const DEFAULT_ENTRY_MAX_LENGTH = 220;
const DEFAULT_SECTION_MAX_ITEMS = 6;
const MAX_COMPLETED_DEPENDENCIES = 5;
const MAX_BLOCKING_DEPENDENCIES = 3;
const MAX_FILES_REFERENCED = 5;
const COMPACT_ENTRY_MAX_LENGTH = 120;
const COMPACT_TOPIC_MAX_LENGTH = 60;
const COMPACT_MAX_ITEMS = 5;

export interface ContextAssemblerConfig {
  codeSearch?: CodeSearchIndex | null;
  enableCodeSearch?: boolean;
  liveFlags?: LiveFlagsReader;
  maxHistoryItems?: number;
}

// ============================================================================
// Context Assembler
// ============================================================================

export class ContextAssembler {
  private codeSearch: CodeSearchIndex | null;
  private readonly codeSearchEnabled: boolean;
  private readonly liveFlags?: LiveFlagsReader;
  private readonly maxHistoryItems: number;

  constructor(
    private stateMachine: StateMachine,
    private readonly _workspaceRoot: string,
    config: ContextAssemblerConfig = {}
  ) {
    this.codeSearch = config.codeSearch ?? null;
    this.codeSearchEnabled = config.enableCodeSearch ?? true;
    this.liveFlags = config.liveFlags;
    this.maxHistoryItems = Math.max(1, config.maxHistoryItems ?? 3);
  }

  /**
   * Assemble minimal, focused context for a specific task
   * This is what gets injected into agent prompts
   */
  async assembleForTask(
    taskId: string,
    options: ContextAssemblyOptions = {}
  ): Promise<AssembledContext> {
    const {
      includeCodeContext = true,
      includeQualityHistory = true,
      maxDecisions = 5,
      maxLearnings = 3,
      hoursBack = 24
    } = options;

    const adaptiveMaxItems = this.lazyContextEnabled()
      ? Math.max(1, Math.min(this.maxHistoryItems, 5))
      : Math.max(1, this.maxHistoryItems);
    const effectiveDecisions = this.lazyContextEnabled()
      ? Math.min(maxDecisions, adaptiveMaxItems)
      : maxDecisions;
    const effectiveLearnings = this.lazyContextEnabled()
      ? Math.min(maxLearnings, adaptiveMaxItems)
      : maxLearnings;
    const effectiveHoursBack = this.lazyContextEnabled()
      ? Math.min(hoursBack, 12)
      : hoursBack;

    const task = this.stateMachine.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const cutoffTime = Date.now() - (effectiveHoursBack * 60 * 60 * 1000);

    const relatedTasks = await this.getRelatedTasks(task);
    if (this.lazyContextEnabled() && relatedTasks.length > adaptiveMaxItems) {
      relatedTasks.splice(adaptiveMaxItems);
    }

    // Assemble remaining context pieces in parallel for speed
    const settled = await Promise.allSettled([
      this.getRelevantDecisions(task, effectiveDecisions),
      this.getRelevantConstraints(task),
      this.getRecentLearnings(cutoffTime, effectiveLearnings),
      includeQualityHistory ? this.getQualityIssuesInArea(task, relatedTasks) : Promise.resolve([]),
      includeQualityHistory ? this.getQualityTrends() : Promise.resolve([]),
      includeCodeContext ? this.inferFilesToRead(task) : Promise.resolve(undefined),
      this.getVelocityMetrics(),
      this.fetchResearchHighlights(task)
    ]);

    const [
      relevantDecisions,
      relevantConstraints,
      recentLearnings,
      qualityIssues,
      qualityTrends,
      filesToRead,
      velocityMetrics,
      researchHighlights
    ] = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      switch (index) {
        case 0:
        case 1:
        case 2:
          return [];
        case 3:
        case 4:
          return [];
        case 5:
          return undefined;
        case 6:
          return { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'unknown' };
        case 7:
        default:
          return undefined;
      }
    }) as [
      ContextEntry[],
      ContextEntry[],
      ContextEntry[],
      QualityMetric[],
      AssembledContext['overallQualityTrend'],
      string[] | undefined,
      AssembledContext['velocityMetrics'],
      string[] | undefined
    ];

    const health = this.stateMachine.getRoadmapHealth();
    const trimmedDecisions = this.lazyContextEnabled()
      ? relevantDecisions.slice(0, adaptiveMaxItems)
      : relevantDecisions;
    const trimmedConstraints = this.lazyContextEnabled()
      ? relevantConstraints.slice(0, adaptiveMaxItems)
      : relevantConstraints;
    const trimmedLearnings = this.lazyContextEnabled()
      ? recentLearnings.slice(0, adaptiveMaxItems)
      : recentLearnings;
    const trimmedIssues = this.lazyContextEnabled()
      ? qualityIssues.slice(0, adaptiveMaxItems * 2)
      : qualityIssues;
    const trimmedResearch = researchHighlights && researchHighlights.length > 0
      ? researchHighlights.slice(0, adaptiveMaxItems)
      : undefined;
    const trimmedFiles = filesToRead ? filesToRead.slice(0, this.maxFilesToReference()) : undefined;

    return {
      task,
      relatedTasks,
      relevantDecisions: trimmedDecisions,
      relevantConstraints: trimmedConstraints,
      recentLearnings: trimmedLearnings,
      qualityIssuesInArea: trimmedIssues,
      overallQualityTrend: qualityTrends,
      filesToRead: trimmedFiles,
      researchHighlights: trimmedResearch,
      projectPhase: health.currentPhase,
      velocityMetrics
    };
  }

  /**
   * Format assembled context as a concise text block for agent prompts
   * This is the actual text that goes into Claude/Codex prompts
   */
  formatForPrompt(context: AssembledContext): string {
    const sections: string[] = [];

    const taskHeader = [
      '## Current Task',
      '',
      `**${this.limitContent(`[${context.task.id}] ${context.task.title}`, DEFAULT_ENTRY_MAX_LENGTH)}**`,
      context.task.description ? this.limitContent(context.task.description, DEFAULT_ENTRY_MAX_LENGTH) : '',
      '',
      `Type: ${context.task.type} | Status: ${context.task.status} | Complexity: ${context.task.estimated_complexity || 'TBD'}`
    ].filter(Boolean).join('\n');
    sections.push(taskHeader);

    if (context.relatedTasks.length > 0) {
      const completedDependencies = context.relatedTasks
        .filter(task => task.status === 'done')
        .slice(0, MAX_COMPLETED_DEPENDENCIES);
      const blockingDependencies = context.relatedTasks
        .filter(task => task.status !== 'done')
        .slice(0, MAX_BLOCKING_DEPENDENCIES);

      if (completedDependencies.length > 0) {
        const lines = completedDependencies
          .map(task => `- ${this.limitContent(`[${task.id}] ${task.title}`, DEFAULT_ENTRY_MAX_LENGTH)}`)
          .join('\n');
        sections.push(`## Completed Dependencies\n${lines}`);
      }

      if (blockingDependencies.length > 0) {
        const lines = blockingDependencies
          .map(task => `- ${this.limitContent(`[${task.id}] ${task.title} (${task.status})`, DEFAULT_ENTRY_MAX_LENGTH)}`)
          .join('\n');
        sections.push(`## ⚠️ Blocking Dependencies (Not Ready)\n${lines}`);
      }
    }

    if (context.relevantDecisions.length > 0) {
      const lines = context.relevantDecisions
        .slice(0, DEFAULT_SECTION_MAX_ITEMS)
        .map(decision => {
          const topic = this.limitContent(decision.topic, 80);
          const content = this.limitContent(decision.content, DEFAULT_ENTRY_MAX_LENGTH);
          return `- **${topic}**: ${content}`;
        })
        .join('\n');
      sections.push(`## Architectural Decisions (Context)\n${lines}`);
    }

    if (context.relevantConstraints.length > 0) {
      const lines = context.relevantConstraints
        .slice(0, DEFAULT_SECTION_MAX_ITEMS)
        .map(constraint => `- ${this.limitContent(constraint.topic, 80)}: ${this.limitContent(constraint.content, DEFAULT_ENTRY_MAX_LENGTH)}`)
        .join('\n');
      sections.push(`## Constraints (Do Not Violate)\n${lines}`);
    }

    if (context.recentLearnings.length > 0) {
      const lines = context.recentLearnings
        .slice(0, DEFAULT_SECTION_MAX_ITEMS)
        .map(learning => `- ${this.limitContent(learning.topic, 80)}: ${this.limitContent(learning.content, DEFAULT_ENTRY_MAX_LENGTH)}`)
        .join('\n');
      sections.push(`## Recent Learnings\n${lines}`);
    }

    if (context.researchHighlights && context.researchHighlights.length > 0) {
      const lines = context.researchHighlights
        .slice(0, DEFAULT_SECTION_MAX_ITEMS)
        .map((highlight) => `- ${this.limitContent(highlight, DEFAULT_ENTRY_MAX_LENGTH)}`)
        .join('\n');
      sections.push(`## Research Highlights\n${lines}`);
    }

    if (context.qualityIssuesInArea.length > 0) {
      const summary = this.summarizeQualityIssues(context.qualityIssuesInArea);
      if (summary) {
        sections.push(`## Quality Watch Points\n${summary}`);
      }
    }

    if (context.filesToRead && context.filesToRead.length > 0) {
      const lines = context.filesToRead
        .slice(0, MAX_FILES_REFERENCED)
        .map(filePath => `- ${this.limitContent(filePath, DEFAULT_ENTRY_MAX_LENGTH)}`)
        .join('\n');
      sections.push(`## Relevant Files\n${lines}\n*Use fs_read to examine these files before implementing*`);
    }

    const averageMinutes = Math.round((context.velocityMetrics.averageTaskDuration || 0) / 60);
    sections.push(`## Project Status\nPhase: **${context.projectPhase}** | Tasks completed today: ${context.velocityMetrics.tasksCompletedToday} | Avg task duration: ${averageMinutes}min | Quality trend: ${context.velocityMetrics.qualityTrendOverall}`);

    return sections.join('\n\n');
  }

  /**
   * Format assembled context as a compact JSON evidence pack.
   * Designed for low-token prompts while preserving key signals.
   */
  formatForPromptCompact(context: AssembledContext): string {
    const completedDeps = context.relatedTasks
      .filter(task => task.status === 'done')
      .slice(0, MAX_COMPLETED_DEPENDENCIES)
      .map(task => `${task.id}:${this.limitContent(task.title, COMPACT_TOPIC_MAX_LENGTH)}`);

    const blockingDeps = context.relatedTasks
      .filter(task => task.status !== 'done')
      .slice(0, MAX_BLOCKING_DEPENDENCIES)
      .map(task => `${task.id}:${task.status}`);

    const decisions = context.relevantDecisions
      .slice(0, COMPACT_MAX_ITEMS)
      .map(decision => ({
        topic: this.limitContent(decision.topic, COMPACT_TOPIC_MAX_LENGTH),
        summary: this.limitContent(decision.content, COMPACT_ENTRY_MAX_LENGTH),
      }));

    const constraints = context.relevantConstraints
      .slice(0, COMPACT_MAX_ITEMS)
      .map(constraint => this.limitContent(constraint.topic, COMPACT_TOPIC_MAX_LENGTH));

    const learnings = context.recentLearnings
      .slice(0, COMPACT_MAX_ITEMS)
      .map(learning => this.limitContent(learning.topic, COMPACT_TOPIC_MAX_LENGTH));

    const researchHighlights = (context.researchHighlights ?? [])
      .slice(0, COMPACT_MAX_ITEMS)
      .map((highlight) => this.limitContent(highlight, COMPACT_ENTRY_MAX_LENGTH));

    const qualityIssues = context.qualityIssuesInArea
      .slice(0, COMPACT_MAX_ITEMS)
      .map(issue => `${issue.dimension}:${Number(issue.score.toFixed(2))}`);

    const qualityTrend = context.overallQualityTrend
      .slice(0, COMPACT_MAX_ITEMS)
      .map(trend => `${trend.dimension}:${trend.trend}:${Number(trend.currentScore.toFixed(2))}`);

    const payload = {
      task: {
        id: context.task.id,
        title: this.limitContent(context.task.title, COMPACT_ENTRY_MAX_LENGTH),
        status: context.task.status,
        type: context.task.type,
        complexity: context.task.estimated_complexity ?? null,
        phase: context.projectPhase,
      },
      deps: {
        completed: completedDeps,
        blocking: blockingDeps,
      },
      decisions,
      constraints,
      learnings,
      research: researchHighlights,
      files: (context.filesToRead ?? []).slice(0, MAX_FILES_REFERENCED),
      quality: {
        issues: qualityIssues,
        trend: qualityTrend,
      },
    };

    return JSON.stringify(payload);
  }

  /**
   * Create an ultra-compact summary for checkpoints
   * This is for persistence, not prompting
   */
  createCompactSummary(context: AssembledContext): string {
    return JSON.stringify({
      task: { id: context.task.id, title: context.task.title, status: context.task.status },
      phase: context.projectPhase,
      decisions: context.relevantDecisions.length,
      quality: context.overallQualityTrend.map(t => `${t.dimension}:${t.currentScore.toFixed(2)}`).join(',')
    });
  }

  // ==========================================================================
  // Private: Context Assembly Helpers
  // ==========================================================================

  private async getRelatedTasks(task: Task): Promise<Task[]> {
    const related: Task[] = [];

    // Get dependencies
    const deps = this.stateMachine.getDependencies(task.id);
    for (const dep of deps) {
      const depTask = this.stateMachine.getTask(dep.depends_on_task_id);
      if (depTask) related.push(depTask);
    }

    // Get parent
    if (task.parent_id) {
      const parent = this.stateMachine.getTask(task.parent_id);
      if (parent) related.push(parent);
    }

    // Get siblings (same parent)
    if (task.parent_id) {
      const siblings = this.stateMachine.getTasks({ type: [task.type] }).filter(t => t.parent_id === task.parent_id && t.id !== task.id);
      related.push(...siblings.slice(0, 3));  // Max 3 siblings
    }

    return related;
  }

  private async getRelevantDecisions(task: Task, max: number): Promise<ContextEntry[]> {
    // Get all decisions
    const allDecisions = this.stateMachine.getContextEntries({ type: 'decision' });

    // Score decisions by relevance to task
    const scored = allDecisions.map(d => ({
      decision: d,
      score: this.calculateRelevance(d, task)
    }));

    // Return top N most relevant
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(s => s.decision);
  }

  private async getRelevantConstraints(task: Task): Promise<ContextEntry[]> {
    // All constraints are relevant (can't violate any)
    return this.stateMachine.getContextEntries({ type: 'constraint' });
  }

  private async getRecentLearnings(since: number, max: number): Promise<ContextEntry[]> {
    const learnings = this.stateMachine.getContextEntries({ type: 'learning', since });
    return learnings.slice(0, max);
  }

  private async getQualityIssuesInArea(task: Task, relatedTasks: Task[]): Promise<QualityMetric[]> {
    const relevantTaskIds = new Set<string>([task.id]);
    for (const related of relatedTasks) {
      relevantTaskIds.add(related.id);
    }

    const issues: QualityMetric[] = [];
    const seenKeys = new Set<string>();
    const since = Date.now() - (7 * 24 * 60 * 60 * 1000);

    for (const taskId of relevantTaskIds) {
      const metrics = this.stateMachine.getQualityMetrics({ taskId, since });
      for (const metric of metrics) {
        if (metric.score >= 0.85) continue;

        const key = metric.id
          ? `id:${metric.id}`
          : `ts:${metric.timestamp}:task:${metric.task_id ?? ''}:dim:${metric.dimension}`;

        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        issues.push(metric);
      }
    }

    issues.sort((a, b) => b.timestamp - a.timestamp);
    return issues;
  }

  private lazyContextEnabled(): boolean {
    return this.liveFlags?.getValue('EFFICIENT_OPERATIONS') === '1';
  }

  private maxFilesToReference(): number {
    return this.lazyContextEnabled() ? Math.min(MAX_FILES_REFERENCED, 3) : MAX_FILES_REFERENCED;
  }

  private async fetchResearchHighlights(task: Task): Promise<string[] | undefined> {
    if (!this.lazyContextEnabled()) {
      return undefined;
    }

    const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const entries = this.stateMachine.getContextEntries({ type: 'learning', since });
    const filtered = entries
      .filter((entry) => Array.isArray(entry.related_tasks) && entry.related_tasks.includes(task.id))
      .filter((entry) => entry.topic.toLowerCase().includes('research'))
      .slice(0, this.maxHistoryItems);

    if (filtered.length === 0) {
      const cacheEntries = this.stateMachine.getRecentResearchCache?.({
        limit: this.maxHistoryItems * 3,
      }) ?? [];

      const relevant = cacheEntries
        .filter((record) => this.isResearchRecordRelevant(record, task))
        .slice(0, this.maxHistoryItems);

      if (relevant.length === 0) {
        return undefined;
      }

      const highlights = relevant
        .map((record) => this.formatResearchHighlight(record))
        .filter((value): value is string => Boolean(value))
        .map((text) =>
          this.limitContent(text, this.lazyContextEnabled() ? COMPACT_ENTRY_MAX_LENGTH : DEFAULT_ENTRY_MAX_LENGTH)
        );

      return highlights.length > 0 ? highlights : undefined;
    }

    return filtered.map((entry) =>
      this.limitContent(entry.content, this.lazyContextEnabled() ? COMPACT_ENTRY_MAX_LENGTH : DEFAULT_ENTRY_MAX_LENGTH)
    );
  }

  private async getQualityTrends(): Promise<AssembledContext['overallQualityTrend']> {
    const dimensions = ['code_elegance', 'test_coverage', 'security', 'performance', 'ux_clarity'];
    const trends: AssembledContext['overallQualityTrend'] = [];

    const now = Date.now();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    for (const dim of dimensions) {
      const recent = this.stateMachine.getQualityMetrics({ dimension: dim, since: weekAgo });
      if (recent.length === 0) continue;

      const currentScore = recent[0].score;
      let trend: 'improving' | 'stable' | 'declining' = 'stable';

      if (recent.length > 1) {
        const oldScore = recent[recent.length - 1].score;
        if (currentScore > oldScore + 0.05) trend = 'improving';
        else if (currentScore < oldScore - 0.05) trend = 'declining';
      }

      trends.push({ dimension: dim, currentScore, trend });
    }

    return trends;
  }

  private async inferFilesToRead(task: Task): Promise<string[] | undefined> {
    // Smart inference based on task title/description
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    const heuristicMatches = this.matchHeuristicFiles(text);
    const searchMatches = await this.lookupFilesWithCodeSearch(text);

    const combined = new Set<string>();
    for (const file of [...searchMatches, ...heuristicMatches]) {
      if (file) {
        combined.add(file);
      }
    }

    if (combined.size === 0) {
      return undefined;
    }

    return Array.from(combined).slice(0, MAX_FILES_REFERENCED);
  }

  private matchHeuristicFiles(text: string): string[] {
    const fileMap: Record<string, string[]> = {
      'api': ['apps/api/main.py', 'apps/api/routes/__init__.py', 'apps/api/routes/catalog.py', 'apps/api/config.py'],
      'model': ['apps/model/baseline.py', 'apps/model/train.py'],
      'allocator': ['apps/allocator/heuristics.py'],
      'weather': ['shared/feature_store/weather_cache.py', 'shared/libs/connectors/weather.py'],
      'ingestion': ['apps/worker/ingestion/shopify.py', 'apps/worker/ingestion/ads.py'],
      'web': ['apps/web/src/pages/index.tsx', 'apps/web/src/pages/catalog.tsx', 'apps/web/src/components/Layout.tsx']
    };

    const files: string[] = [];
    for (const [keyword, paths] of Object.entries(fileMap)) {
      if (text.includes(keyword)) {
        files.push(...paths);
      }
    }

    return files.slice(0, MAX_FILES_REFERENCED);
  }

  private async lookupFilesWithCodeSearch(rawText: string): Promise<string[]> {
    const codeSearch = await this.getCodeSearch();
    if (!codeSearch) {
      return [];
    }

    try {
      const results = await codeSearch.search(rawText, {
        limit: MAX_FILES_REFERENCED * 3,
      });
      return results.map((hit) => hit.filePath);
    } catch (error) {
      return [];
    }
  }

  private async getCodeSearch(): Promise<CodeSearchIndex | null> {
    if (!this.codeSearchEnabled) {
      return null;
    }
    if (!this.codeSearch) {
      this.codeSearch = new CodeSearchIndex(this.stateMachine, this._workspaceRoot);
    }
    return this.codeSearch;
  }

  private async getVelocityMetrics(): Promise<AssembledContext['velocityMetrics']> {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const doneTasks = this.stateMachine.getTasks({ status: ['done'] });
    const completedToday = doneTasks.filter(t => t.completed_at && t.completed_at >= todayStart);
    const tasksWithDuration = doneTasks.filter(t => t.actual_duration_seconds);
    const avgDuration = tasksWithDuration.length > 0
      ? tasksWithDuration.reduce((sum, t) => sum + (t.actual_duration_seconds || 0), 0) / tasksWithDuration.length
      : 0;

    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentQuality = this.stateMachine.getQualityMetrics({ since: weekAgo });
    let qualityTrend = 'stable';
    if (recentQuality.length > 2) {
      const recent = recentQuality.slice(0, Math.floor(recentQuality.length / 2));
      const older = recentQuality.slice(Math.floor(recentQuality.length / 2));
      const recentAvg = recent.reduce((s, m) => s + m.score, 0) / recent.length;
      const olderAvg = older.reduce((s, m) => s + m.score, 0) / older.length;
      if (recentAvg > olderAvg + 0.05) qualityTrend = 'improving';
      else if (recentAvg < olderAvg - 0.05) qualityTrend = 'declining';
    }

    return {
      tasksCompletedToday: completedToday.length,
      averageTaskDuration: avgDuration,
      qualityTrendOverall: qualityTrend
    };
  }

  private isResearchRecordRelevant(record: ResearchCacheRecord, task: Task): boolean {
    const metadata = record.metadata ?? {};
    if (typeof metadata.taskId === 'string' && metadata.taskId === task.id) {
      return true;
    }

    const taskText = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
    const metaTextParts: string[] = [];
    for (const key of ['topic', 'problem', 'taskTitle']) {
      const value = metadata[key as keyof typeof metadata];
      if (typeof value === 'string') {
        metaTextParts.push(value);
      }
    }

    if (metaTextParts.length === 0) {
      return false;
    }

    const metaText = metaTextParts.join(' ').toLowerCase();
    return this.hasTokenOverlap(metaText, taskText);
  }

  private formatResearchHighlight(record: ResearchCacheRecord): string | null {
    const metadata = record.metadata ?? {};
    const kind = typeof metadata.kind === 'string' ? metadata.kind : 'research';
    const payload = record.payload;

    if (Array.isArray(payload) && payload.length > 0) {
      const first = payload[0] as Record<string, unknown>;
      if (kind === 'query' && typeof metadata.topic === 'string') {
        const title = typeof first.title === 'string' ? first.title : 'new findings discovered';
        return `Research on ${metadata.topic}: ${title}`;
      }
      if (kind === 'patterns' && typeof metadata.problem === 'string') {
        const title = typeof first.title === 'string' ? first.title : 'pattern discovered';
        return `Patterns for ${metadata.problem}: ${title}`;
      }
      if (kind === 'alternatives' && typeof metadata.taskTitle === 'string') {
        const title = typeof first.title === 'string' ? first.title : 'alternative approach available';
        return `Alternative for ${metadata.taskTitle}: ${title}`;
      }
      const title = typeof first.title === 'string' ? first.title : JSON.stringify(first);
      return `Research update: ${title}`;
    }

    if (typeof payload === 'string' && payload.length > 0) {
      return `Research update: ${payload.slice(0, 160)}`;
    }

    return null;
  }

  private hasTokenOverlap(a: string, b: string): boolean {
    const tokenize = (text: string): Set<string> => {
      return new Set(text.split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
    };

    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    for (const token of tokensA) {
      if (tokensB.has(token)) {
        return true;
      }
    }
    return false;
  }

  private calculateRelevance(decision: ContextEntry, task: Task): number {
    let score = 0;

    // Recency matters (decay over time)
    const ageHours = (Date.now() - decision.timestamp) / (1000 * 60 * 60);
    score += Math.max(0, 10 - ageHours / 24);  // Max 10 points, decays over days

    // Related tasks
    if (decision.related_tasks?.includes(task.id)) score += 20;
    if (decision.related_tasks?.includes(task.parent_id || '')) score += 15;
    if (decision.related_tasks?.includes(task.epic_id || '')) score += 10;

    // Topic relevance (keyword matching)
    const taskText = `${task.title} ${task.description || ''}`.toLowerCase();
    const decisionText = `${decision.topic} ${decision.content}`.toLowerCase();
    const taskWords = new Set(taskText.split(/\s+/));
    const decisionWords = decisionText.split(/\s+/);
    const matches = decisionWords.filter(w => taskWords.has(w)).length;
    score += matches * 2;

    // Confidence
    score += (decision.confidence || 0.5) * 10;

    return score;
  }

  private limitContent(value: string, maxLength = DEFAULT_ENTRY_MAX_LENGTH): string {
    if (!value) return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    const truncated = normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd();
    return `${truncated}...`;
  }

  private summarizeQualityIssues(issues: QualityMetric[]): string | null {
    if (issues.length === 0) return null;

    const byDimension = new Map<string, number>();
    for (const issue of issues) {
      byDimension.set(issue.dimension, (byDimension.get(issue.dimension) || 0) + 1);
    }

    const topDimensions = Array.from(byDimension.entries())
      .sort(([, countA], [, countB]) => countB - countA)
      .slice(0, 3);

    if (topDimensions.length === 0) {
      return null;
    }

    return topDimensions
      .map(([dimension, count]) => `- ${dimension}: ${count}`)
      .join('\n');
  }
}
