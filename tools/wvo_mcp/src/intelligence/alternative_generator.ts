import { logInfo } from '../telemetry/logger.js';
import type { AlternativeOption, AlternativeRequest } from './research_types.js';

export interface AlternativeGeneratorOptions {
  enabled?: boolean;
}

/**
 * Placeholder alternative generator.
 * Will later synthesize approaches using the research cache + LLM delegation.
 */
export class AlternativeGenerator {
  private readonly enabled: boolean;

  constructor(options: AlternativeGeneratorOptions = {}) {
    this.enabled = options.enabled ?? false;
  }

  async suggestAlternatives(request: AlternativeRequest): Promise<AlternativeOption[]> {
    if (!this.enabled) {
      logInfo('AlternativeGenerator stub invoked', {
        taskId: request.taskId,
        title: request.taskTitle,
        creativity: request.creativity,
      });
    }

    return [
      {
        id: `stub-alternative-${Date.now()}`,
        title: `Alternative placeholder for ${request.taskTitle}`,
        summary:
          'Alternative generation is not yet implemented. This entry is returned to keep the pipeline stable.',
        pros: ['Placeholder recommendation'],
        cons: ['No real evaluation available'],
        confidence: 0.1,
      },
    ];
  }
}
