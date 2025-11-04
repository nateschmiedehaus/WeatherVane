import { logInfo } from '../telemetry/logger.js';

import type { ResearchQuery, ResearchFinding } from './research_types.js';

export interface AcademicSearchOptions {
  enabled?: boolean;
}

/**
 * Placeholder academic search client.
 * The real implementation will integrate with external APIs.
 */
export class AcademicSearchClient {
  private readonly enabled: boolean;

  constructor(options: AcademicSearchOptions = {}) {
    this.enabled = options.enabled ?? false;
  }

  async search(query: ResearchQuery): Promise<ResearchFinding[]> {
    if (!this.enabled) {
      logInfo('AcademicSearchClient stub invoked', {
        topic: query.topic,
        keywords: query.keywords,
      });
    }

    return [
      {
        id: `stub-academic-${Date.now()}`,
        title: `Research stub for ${query.topic}`,
        summary:
          'Academic research integration is not yet implemented. Enable the research_layer flag once ready.',
        url: undefined,
        source: 'placeholder',
        confidence: 0.1,
      },
    ];
  }
}
