import { logInfo } from '../telemetry/logger.js';

import type { PatternInsight, PatternMiningInput } from './research_types.js';

export interface PatternMiningOptions {
  enabled?: boolean;
}

/**
 * Placeholder pattern mining client.
 * Will eventually query GitHub, HN, and other sources.
 */
export class PatternMiningClient {
  private readonly enabled: boolean;

  constructor(options: PatternMiningOptions = {}) {
    this.enabled = options.enabled ?? false;
  }

  async findPatterns(input: PatternMiningInput): Promise<PatternInsight[]> {
    if (!this.enabled) {
      logInfo('PatternMiningClient stub invoked', {
        problem: input.problem,
        sources: input.sources,
      });
    }

    return [
      {
        id: `stub-pattern-${Date.now()}`,
        title: `Pattern stub for ${input.problem}`,
        summary:
          'Pattern mining is not yet implemented. Use this as a placeholder until remote sources are wired in.',
        url: undefined,
        repository: undefined,
        stars: undefined,
        language: undefined,
      },
    ];
  }
}
