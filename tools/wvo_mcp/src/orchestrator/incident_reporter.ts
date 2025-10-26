import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logWarning, logInfo } from '../telemetry/logger.js';
import type { TaskEnvelope } from './task_envelope.js';

export interface IncidentReportContext {
  task: TaskEnvelope;
  state: string;
  attempt: number;
  notes: string[];
}

export interface IncidentReportResult {
  prBranch: string;
  mrfcPath: string;
  requireHuman: boolean;
}

export interface IncidentReporterOptions {
  workspaceRoot: string;
  requireHuman?: (trigger: string, task: TaskEnvelope, metadata?: Record<string, unknown>) => Promise<void> | void;
}

export class IncidentReporter {
  private readonly workspaceRoot: string;
  private readonly requireHuman?: IncidentReporterOptions['requireHuman'];

  constructor(options: IncidentReporterOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.requireHuman = options.requireHuman;
  }

  async report(context: IncidentReportContext): Promise<IncidentReportResult> {
    const branch = `incident/${context.task.id}`.toLowerCase();
    const mrfcDir = path.join(this.workspaceRoot, 'repro', context.task.id);
    await fs.mkdir(mrfcDir, { recursive: true });
    const readme = path.join(mrfcDir, 'README.md');
    const scriptPath = path.join(mrfcDir, 'run.sh');
    const summary = [
      `# MRFC for ${context.task.id}`,
      '',
      `- state: ${context.state}`,
      `- attempt: ${context.attempt}`,
      `- notes:`,
      ...context.notes.map(note => `  - ${note}`),
      '',
      '## How to Reproduce',
      '',
      '`./run.sh`',
    ].join('\n');
    await fs.writeFile(readme, `${summary}\n`);
    await fs.writeFile(
      scriptPath,
      '#!/usr/bin/env bash\nset -euo pipefail\nprintf "[MRFC] Reproduce %s\\n" "$0"\n',
      { mode: 0o755 }
    );
    await this.requireHuman?.('incident', context.task, { state: context.state, branch });
    logInfo('Incident reporter created MRFC', {
      taskId: context.task.id,
      state: context.state,
      branch,
    });
    return {
      prBranch: branch,
      mrfcPath: mrfcDir,
      requireHuman: true,
    };
  }
}
