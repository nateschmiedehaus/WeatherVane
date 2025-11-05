import path from "node:path";

import type { StateMachine, Task, ContextEntry } from "./state_machine.js";
import type { FeatureGatesReader } from "./feature_gates.js";
import type { LiveFlagsReader } from "../state/live_flags.js";
import type { CodeSearchIndex } from "../utils/code_search.js";

export interface ContextAssemblyOptions {
  includeCodeContext?: boolean;
  includeQualityHistory?: boolean;
  maxDecisions?: number;
  maxLearnings?: number;
  hoursBack?: number;
}

export interface AssembledContext {
  taskId: string;
  filesToRead: string[];
  relatedTasks: Array<{ id: string; title?: string; status?: string }>;
  qualityIssuesInArea: Array<{ dimension: string; score: number }>;
  relevantDecisions: Array<{ topic: string; content: string }>;
  recentLearnings: Array<{ topic: string; content: string }>;
  researchHighlights: string[];
  velocityMetrics?: Record<string, unknown>;
  promptSummary?: string;
}

interface ContextAssemblerOptions {
  codeSearch?: CodeSearchIndex;
  liveFlags?: LiveFlagsReader;
  featureGates?: FeatureGatesReader;
  maxHistoryItems?: number;
}

export class ContextAssembler {
  private readonly stateMachine?: StateMachine;
  private readonly workspaceRoot: string;
  private readonly options: ContextAssemblerOptions;

  constructor(stateMachine: StateMachine | undefined, workspaceRoot: string, options: ContextAssemblerOptions = {}) {
    this.stateMachine = stateMachine;
    this.workspaceRoot = workspaceRoot;
    this.options = options;
  }

  async assembleForTask(taskId: string, options: ContextAssemblyOptions = {}): Promise<AssembledContext> {
    const task = this.stateMachine?.getTask(taskId) ?? null;
    const relatedTasks = this.getRelatedTasks(taskId, task);
    const sinceTimestamp = options.hoursBack ? Date.now() - options.hoursBack * 60 * 60 * 1000 : undefined;

    const decisions = this.getContextEntries("decision", sinceTimestamp, options.maxDecisions);
    const learnings = this.getContextEntries("learning", sinceTimestamp, options.maxLearnings);

    return {
      taskId,
      filesToRead: this.deriveFilesToRead(task),
      relatedTasks,
      qualityIssuesInArea: [],
      relevantDecisions: decisions.map((entry) => ({
        topic: entry.topic,
        content: entry.content,
      })),
      recentLearnings: learnings.map((entry) => ({
        topic: entry.topic,
        content: entry.content,
      })),
      researchHighlights: [],
      velocityMetrics: undefined,
      promptSummary: task ? `${task.title} (${task.status})` : undefined,
    };
  }

  maxFilesToReference(): number {
    const gates = this.options.featureGates;
    if (gates) {
      return gates.isCompactPromptMode() ? 3 : 5;
    }

    const flags = this.options.liveFlags;
    if (flags) {
      const mode = flags.getValue("PROMPT_MODE" as any);
      return mode === "compact" ? 3 : 5;
    }

    return 5;
  }

  formatForPrompt(context: AssembledContext): string {
    const lines: string[] = [];
    lines.push(`# Task ${context.taskId}`);
    if (context.promptSummary) {
      lines.push(`Summary: ${context.promptSummary}`);
    }

    if (context.relatedTasks.length > 0) {
      lines.push(`\n## Related Tasks`);
      for (const related of context.relatedTasks) {
        lines.push(`- ${related.id}: ${related.title ?? "(untitled)"} [${related.status ?? "unknown"}]`);
      }
    }

    if (context.relevantDecisions.length > 0) {
      lines.push(`\n## Key Decisions`);
      for (const decision of context.relevantDecisions) {
        lines.push(`- ${decision.topic}: ${decision.content}`);
      }
    }

    if (context.recentLearnings.length > 0) {
      lines.push(`\n## Recent Learnings`);
      for (const learning of context.recentLearnings) {
        lines.push(`- ${learning.topic}: ${learning.content}`);
      }
    }

    if (context.researchHighlights.length > 0) {
      lines.push(`\n## Research Highlights`);
      for (const highlight of context.researchHighlights) {
        lines.push(`- ${highlight}`);
      }
    }

    return lines.join("\n").trim();
  }

  formatForPromptCompact(context: AssembledContext): string {
    const summaryParts: string[] = [];
    if (context.promptSummary) summaryParts.push(context.promptSummary);
    if (context.relatedTasks.length > 0) {
      summaryParts.push(`${context.relatedTasks.length} related tasks`);
    }
    if (context.relevantDecisions.length > 0) {
      summaryParts.push(`${context.relevantDecisions.length} recent decisions`);
    }
    if (context.recentLearnings.length > 0) {
      summaryParts.push(`${context.recentLearnings.length} learnings`);
    }
    return summaryParts.join(" • ") || `Task ${context.taskId}`;
  }

  private getRelatedTasks(taskId: string, task: Task | null): Array<{ id: string; title?: string; status?: string }> {
    if (!this.stateMachine) {
      return task ? [{ id: task.id, title: task.title, status: task.status }] : [];
    }

    const deps = this.stateMachine.getDependencies(taskId) ?? [];
    const related: Array<{ id: string; title?: string; status?: string }> = [];
    for (const dep of deps) {
      const depTask = this.stateMachine.getTask(dep.depends_on_task_id);
      if (depTask) {
        related.push({ id: depTask.id, title: depTask.title, status: depTask.status });
      }
    }
    return related;
  }

  private getContextEntries(type: ContextEntry["entry_type"], since?: number, limit?: number): ContextEntry[] {
    if (!this.stateMachine) return [];
    const entries = this.stateMachine.getContextEntries({ type, since });
    if (limit === undefined) return entries;
    return entries.slice(0, limit);
  }

  private deriveFilesToRead(task: Task | null): string[] {
    if (!task) return [];
    const metadata = task.metadata ?? {};
    const files = Array.isArray(metadata.files_to_read) ? metadata.files_to_read : [];
    const normalized = files
      .filter((entry): entry is string => typeof entry === "string")
      .map((file) => this.normalizeWorkspacePath(file));
    return normalized.slice(0, this.maxFilesToReference());
  }

  private normalizeWorkspacePath(file: string): string {
    if (path.isAbsolute(file)) {
      return path.relative(this.workspaceRoot, file).replace(/\\/g, "/");
    }
    return file.replace(/\\/g, "/");
  }
}
