import { promises as fs } from 'node:fs';
import path from 'node:path';

import { logDebug, logWarning } from '../telemetry/logger.js';

export interface DecisionJournalEntry {
  taskId: string;
  state: string;
  attempt: number;
  payload?: Record<string, unknown>;
  notes?: string[];
}

export interface DecisionJournalOptions {
  workspaceRoot: string;
  runId?: string;
  disabled?: boolean;
}

export class DecisionJournal {
  private readonly runId: string;
  private readonly journalPath: string;

  constructor(private readonly options: DecisionJournalOptions) {
    this.runId =
      options.runId && options.runId.trim().length > 0
        ? this.normalizeRunId(options.runId)
        : this.normalizeRunId(new Date().toISOString());
    this.journalPath = path.join(
      options.workspaceRoot,
      'resources',
      'runs',
      this.runId,
      'journal.md'
    );
  }

  async record(entry: DecisionJournalEntry): Promise<void> {
    if (this.options.disabled) {
      return;
    }
    try {
      await fs.mkdir(path.dirname(this.journalPath), { recursive: true });
      const timestamp = new Date().toISOString();
      const sections = [
        `## [${timestamp}] ${entry.state} (attempt ${entry.attempt})`,
        `Task: ${entry.taskId}`,
      ];
      if (entry.notes?.length) {
        sections.push('Notes:', ...entry.notes.map((note) => `- ${note}`));
      }
      if (entry.payload) {
        sections.push('Payload:', '```json', JSON.stringify(entry.payload, null, 2), '```');
      }
      sections.push('');
      await fs.appendFile(this.journalPath, sections.join('\n'));
      logDebug('DecisionJournal appended entry', { state: entry.state, taskId: entry.taskId });
    } catch (error) {
      logWarning('DecisionJournal failed to record entry', {
        taskId: entry.taskId,
        state: entry.state,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private normalizeRunId(value: string): string {
    const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
    return sanitized.startsWith('run-') ? sanitized : `run-${sanitized}`;
  }
}
