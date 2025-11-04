import { logInfo } from '../telemetry/logger.js';

import type { TaskEnvelope } from './task_envelope.js';

export interface CriticalAgentInput {
  task: TaskEnvelope;
  patchHash: string;
}

export interface CriticalAgentResult {
  issues: string[];
  requiresEscalation: boolean;
}

export class CriticalAgent {
  async audit(input: CriticalAgentInput): Promise<CriticalAgentResult> {
    const issues: string[] = [];
    const haystack = `${input.task.title ?? ''} ${input.task.description ?? ''}`.toLowerCase();
    const labels = (input.task.labels ?? []).map(label => label.toLowerCase());
    if (/\bsecret\b|\bcredential\b|\btokens?\b/.test(haystack) || labels.includes('secret')) {
      issues.push('Secret handling detected; require human approval.');
    }
    if (labels.includes('auth') || /\boauth\b|\blogin\b/.test(haystack)) {
      issues.push('Authentication flow modified.');
    }
    const requiresEscalation = issues.length > 0;
    logInfo('CriticalAgent executed adversarial pass', {
      taskId: input.task.id,
      patchHash: input.patchHash,
      issueCount: issues.length,
    });
    return { issues, requiresEscalation };
  }
}
