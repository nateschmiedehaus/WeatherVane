import { EventEmitter } from 'node:events';

import { ResearchManager } from '../intelligence/research_manager.js';
import type {
  AlternativeOption,
  PatternInsight,
  ResearchFinding,
} from '../intelligence/research_types.js';
import { logError, logInfo, logWarning } from '../telemetry/logger.js';
import type { StateMachine, Task } from './state_machine.js';
import type { ResearchTriggerPayload, ResearchTriggerType, TaskScheduler } from './task_scheduler.js';

export interface ResearchOrchestratorOptions {
  maxConcurrent?: number;
  defaultDomains?: ('arxiv' | 'scholar' | 'ssrn')[];
  patternSources?: string[];
  queueDebounceMs?: number;
}

interface ResearchRecord {
  findings: ResearchFinding[];
  patterns: PatternInsight[];
  alternatives: AlternativeOption[];
}

export interface ResearchCompletedPayload {
  taskId: string;
  triggerType: ResearchTriggerType;
  recordedContextId?: number;
}

const DEFAULT_DOMAINS: Array<'arxiv' | 'scholar' | 'ssrn'> = ['arxiv', 'scholar'];
const DEFAULT_SOURCES = ['github-trending', 'hackernews'];

/**
 * ResearchOrchestrator listens to scheduler research triggers and coordinates
 * calling the ResearchManager plus storing the results for downstream agents.
 */
export class ResearchOrchestrator extends EventEmitter {
  private readonly queue: ResearchTriggerPayload[] = [];
  private readonly maxConcurrent: number;
  private readonly domains: Array<'arxiv' | 'scholar' | 'ssrn'>;
  private readonly patternSources: string[];
  private readonly debounceMs: number;
  private active = 0;
  private disposed = false;
  private processScheduled = false;

  private readonly schedulerListener = (payload: ResearchTriggerPayload) => {
    if (this.disposed) {
      return;
    }
    logInfo('Research trigger queued', {
      taskId: payload.taskId,
      triggerType: payload.triggerType,
      confidence: payload.confidence,
      hints: payload.hints,
    });
    this.queue.push(payload);
    this.scheduleProcess();
  };

  constructor(
    private readonly scheduler: TaskScheduler,
    private readonly researchManager: ResearchManager,
    private readonly stateMachine: StateMachine,
    options: ResearchOrchestratorOptions = {},
  ) {
    super();
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
    this.domains = options.defaultDomains ?? DEFAULT_DOMAINS;
    this.patternSources = options.patternSources ?? DEFAULT_SOURCES;
    this.debounceMs = Math.max(0, Math.floor(options.queueDebounceMs ?? 50));

    this.scheduler.on('research:trigger', this.schedulerListener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduler.off('research:trigger', this.schedulerListener);
    this.queue.length = 0;
  }

  private scheduleProcess(): void {
    if (this.processScheduled || this.disposed) {
      return;
    }
    this.processScheduled = true;
    setTimeout(() => {
      this.processScheduled = false;
      void this.processQueue();
    }, this.debounceMs);
  }

  private async processQueue(): Promise<void> {
    if (this.disposed) return;
    if (this.active >= this.maxConcurrent) {
      return;
    }

    const payload = this.queue.shift();
    if (!payload) {
      return;
    }

    this.active += 1;
    try {
      const record = await this.handleTrigger(payload);
      const recordedContext = record?.contextId;
      this.emit('research:completed', {
        taskId: payload.taskId,
        triggerType: payload.triggerType,
        recordedContextId: recordedContext,
      } satisfies ResearchCompletedPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('Research orchestrator failed to process trigger', {
        taskId: payload.taskId,
        triggerType: payload.triggerType,
        error: message,
      });
      this.emit('research:error', {
        taskId: payload.taskId,
        triggerType: payload.triggerType,
        error: message,
      });
    } finally {
      this.active -= 1;
      if (this.queue.length > 0) {
        this.scheduleProcess();
      }
    }
  }

  private async handleTrigger(
    payload: ResearchTriggerPayload,
  ): Promise<{ contextId?: number }> {
    const task = this.stateMachine.getTask(payload.taskId);
    if (!task) {
      logWarning('Research trigger received for missing task', {
        taskId: payload.taskId,
        triggerType: payload.triggerType,
      });
      return {};
    }

    const keywords = this.extractKeywords(task);
    const research = await this.collectResearch(task, keywords);

    if (!research) {
      return {};
    }

    const content = this.composeContent(research);
    const confidence = this.normalizeConfidence(payload.confidence);
    const context = this.stateMachine.addContextEntry({
      entry_type: 'learning',
      topic: `Research insights: ${task.title}`,
      content,
      related_tasks: [task.id],
      confidence,
      metadata: {
        trigger: {
          taskId: payload.taskId,
          reason: payload.reason,
          type: payload.triggerType,
          hints: payload.hints,
        },
        counts: {
          findings: research.findings.length,
          patterns: research.patterns.length,
          alternatives: research.alternatives.length,
        },
        keywords,
        timestamp: Date.now(),
      },
    });

    logInfo('Recorded research insights', {
      taskId: task.id,
      triggerType: payload.triggerType,
      contextId: context.id,
      findings: research.findings.length,
      patterns: research.patterns.length,
      alternatives: research.alternatives.length,
    });

    return { contextId: context.id };
  }

  private async collectResearch(
    task: Task,
    keywords: string[],
  ): Promise<ResearchRecord | null> {
    const findings = await this.runSafe(async () =>
      this.researchManager.query({
        topic: task.title,
        keywords: keywords.slice(0, 6),
        domains: this.domains,
        recency: 'latest',
      }),
    );

    const patterns = await this.runSafe(async () =>
      this.researchManager.findPatterns({
        problem: task.title,
        sources: this.patternSources,
        filters: { epic: task.epic_id ?? '', type: task.type },
      }),
    );

    const alternatives = await this.runSafe(async () =>
      this.researchManager.suggestAlternatives({
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        contextTags: keywords.slice(0, 5),
        creativity: this.resolveCreativity(task),
      }),
    );

    if (!findings && !patterns && !alternatives) {
      return null;
    }

    return {
      findings: findings ?? [],
      patterns: patterns ?? [],
      alternatives: alternatives ?? [],
    };
  }

  private async runSafe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      logWarning('Research orchestrator dependency failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private extractKeywords(task: Task): string[] {
    const text = `${task.title ?? ''} ${task.description ?? ''}`.toLowerCase();
    const tokens = text.match(/[a-z0-9]{4,}/g) ?? [];
    const unique = Array.from(new Set(tokens));
    return unique.slice(0, 16);
  }

  private resolveCreativity(task: Task): 'conservative' | 'balanced' | 'high' {
    const complexity = task.estimated_complexity ?? 5;
    if (complexity >= 8) {
      return 'high';
    }
    if (complexity >= 6) {
      return 'balanced';
    }
    return 'conservative';
  }

  private composeContent(research: ResearchRecord): string {
    const sections: string[] = [];

    if (research.findings.length > 0) {
      const lines = research.findings.slice(0, 5).map((finding) => {
        const suffix = finding.url ? ` (${finding.url})` : '';
        return `- ${finding.title}${suffix}`;
      });
      sections.push(`Research Findings:\n${lines.join('\n')}`);
    }

    if (research.patterns.length > 0) {
      const lines = research.patterns.slice(0, 5).map((pattern) => {
        const suffix = pattern.url ? ` (${pattern.url})` : '';
        return `- ${pattern.title}${suffix}`;
      });
      sections.push(`Industry Patterns:\n${lines.join('\n')}`);
    }

    if (research.alternatives.length > 0) {
      const lines = research.alternatives.slice(0, 5).map((alternative) => {
        return `- ${alternative.title} (confidence ${Math.round(alternative.confidence * 100)}%)`;
      });
      sections.push(`Alternative Approaches:\n${lines.join('\n')}`);
    }

    if (sections.length === 0) {
      return 'No actionable research findings available yet. Re-run once sources are connected.';
    }

    return sections.join('\n\n');
  }

  private normalizeConfidence(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.6;
    }
    if (value <= 0) return 0.4;
    if (value >= 1) return 0.95;
    return Math.round(value * 100) / 100;
  }
}
