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

import type { StateMachine, Task, ContextEntry, QualityMetric } from './state_machine.js';

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

// ============================================================================
// Context Assembler
// ============================================================================

export class ContextAssembler {
  constructor(
    private stateMachine: StateMachine,
    private readonly _workspaceRoot: string
  ) {}

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

    const task = this.stateMachine.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);

    const relatedTasks = await this.getRelatedTasks(task);

    // Assemble remaining context pieces in parallel for speed
    const settled = await Promise.allSettled([
      this.getRelevantDecisions(task, maxDecisions),
      this.getRelevantConstraints(task),
      this.getRecentLearnings(cutoffTime, maxLearnings),
      includeQualityHistory ? this.getQualityIssuesInArea(task, relatedTasks) : Promise.resolve([]),
      includeQualityHistory ? this.getQualityTrends() : Promise.resolve([]),
      includeCodeContext ? this.inferFilesToRead(task) : Promise.resolve(undefined),
      this.getVelocityMetrics()
    ]);

    const [
      relevantDecisions,
      relevantConstraints,
      recentLearnings,
      qualityIssues,
      qualityTrends,
      filesToRead,
      velocityMetrics
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
        default:
          return { tasksCompletedToday: 0, averageTaskDuration: 0, qualityTrendOverall: 'unknown' };
      }
    }) as [
      ContextEntry[],
      ContextEntry[],
      ContextEntry[],
      QualityMetric[],
      AssembledContext['overallQualityTrend'],
      string[] | undefined,
      AssembledContext['velocityMetrics']
    ];

    const health = this.stateMachine.getRoadmapHealth();

    return {
      task,
      relatedTasks,
      relevantDecisions,
      relevantConstraints,
      recentLearnings,
      qualityIssuesInArea: qualityIssues,
      overallQualityTrend: qualityTrends,
      filesToRead: filesToRead ? filesToRead.slice(0, MAX_FILES_REFERENCED) : undefined,
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

    return files.length > 0 ? files.slice(0, MAX_FILES_REFERENCED) : undefined;
  }

  private async getVelocityMetrics(): Promise<AssembledContext['velocityMetrics']> {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const completedToday = this.stateMachine.getTasks({ status: ['done'] }).filter(t => t.completed_at && t.completed_at >= todayStart);

    const tasksWithDuration = this.stateMachine.getTasks({ status: ['done'] }).filter(t => t.actual_duration_seconds);
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
