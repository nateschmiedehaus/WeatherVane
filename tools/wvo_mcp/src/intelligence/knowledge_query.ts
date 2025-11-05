/**
 * Knowledge query interface.
 *
 * Provides natural language query interface to the knowledge graph,
 * with graceful fallback to traditional file search.
 */

import type { KnowledgeEvidence, KnowledgeResult, QueryContext, QueryLog } from './knowledge_types.js';
import type { KnowledgeStorage } from './knowledge_storage.js';

/**
 * Handles knowledge queries with intelligent routing and fallback.
 */
export class KnowledgeQuery {
  constructor(private storage: KnowledgeStorage) {}

  /**
   * Query the knowledge graph with natural language.
   */
  async query(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    const startTime = Date.now();

    try {
      // Handle empty queries
      if (!query || query.trim().length === 0) {
        return {
          success: false,
          confidence: 0,
          fallback: true,
          error: 'Empty query provided',
        };
      }

      // Classify query type
      const queryType = this.classifyQuery(query, context);

      // Route to appropriate handler
      let result: KnowledgeResult;

      switch (queryType) {
        case 'location':
          result = await this.handleLocationQuery(query, context);
          break;
        case 'semantic':
          result = await this.handleSemanticQuery(query, context);
          break;
        case 'usage':
          result = await this.handleUsageQuery(query, context);
          break;
        case 'pattern':
          result = await this.handlePatternQuery(query, context);
          break;
        default:
          result = await this.handleGenericQuery(query, context);
      }

      // Log query analytics
      const latencyMs = Date.now() - startTime;
      await this.logQuery({
        timestamp: new Date().toISOString(),
        query,
        context,
        answered: result.success,
        fallback: result.fallback,
        latencyMs,
        taskId: context?.taskId,
      });

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      return {
        success: false,
        confidence: 0,
        fallback: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Classify query type based on keywords and context.
   */
  private classifyQuery(query: string, context?: QueryContext): string {
    if (context?.type) return context.type;

    const lower = query.toLowerCase();

    // Location queries: "where should...", "what module...", "what file..."
    if (
      lower.includes('where should') ||
      lower.includes('where to put') ||
      lower.includes('what module') ||
      lower.includes('what file') ||
      lower.includes('location')
    ) {
      return 'location';
    }

    // Usage queries: "is ... used", "what calls...", "who uses..."
    if (
      lower.includes('is') &&
      (lower.includes('used') || lower.includes('called')) ||
      lower.includes('what calls') ||
      lower.includes('who uses') ||
      lower.includes('can i delete')
    ) {
      return 'usage';
    }

    // Pattern queries: "what pattern...", "how to...", "similar to..."
    if (
      lower.includes('what pattern') ||
      lower.includes('how to') ||
      lower.includes('similar to') ||
      lower.includes('example')
    ) {
      return 'pattern';
    }

    // Semantic queries: "what does...", "purpose of...", "why..."
    if (lower.includes('what does') || lower.includes('purpose') || lower.includes('why')) {
      return 'semantic';
    }

    return 'generic';
  }

  /**
   * Handle "where should X go?" queries.
   */
  private async handleLocationQuery(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    // Extract what the user wants to place
    const targetMatch = query.match(/where should (.*?) (?:go|be placed)/i);
    const target = targetMatch ? targetMatch[1] : query;

    // Search for similar purposes in existing functions
    const functions = this.storage.searchFunctionsByPurpose(target, 5);

    if (functions.length > 0) {
      // Group by module (directory)
      const modules = new Map<string, number>();
      for (const fn of functions) {
        const module = fn.filePath.split('/').slice(0, -1).join('/');
        modules.set(module, (modules.get(module) || 0) + 1);
      }

      // Find most common module
      let bestModule = '';
      let bestCount = 0;
      for (const [module, count] of modules.entries()) {
        if (count > bestCount) {
          bestModule = module;
          bestCount = count;
        }
      }

      const evidence: KnowledgeEvidence[] = functions.slice(0, 3).map((fn) => ({
        type: 'function',
        id: fn.id,
        description: fn.purpose,
        relevance: fn.confidence,
        filePath: fn.filePath,
      }));

      return {
        success: true,
        answer: `Based on similar code, ${target} should go in: ${bestModule}/\n\nSimilar functions found:\n${functions.slice(0, 3).map((fn) => `- ${fn.name} (${fn.filePath}): ${fn.purpose}`).join('\n')}`,
        evidence,
        confidence: bestCount / functions.length,
        fallback: false,
      };
    }

    // Fallback: No knowledge available
    return {
      success: false,
      confidence: 0,
      fallback: true,
      error: 'No similar code found in knowledge graph. Knowledge may be incomplete.',
    };
  }

  /**
   * Handle "what does X do?" semantic queries.
   */
  private async handleSemanticQuery(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    // Extract function name
    const nameMatch = query.match(/what does ([\w.]+)/i);
    const functionName = nameMatch ? nameMatch[1] : '';

    if (!functionName) {
      return {
        success: false,
        confidence: 0,
        fallback: true,
        error: 'Could not extract function name from query',
      };
    }

    // Search by name (not just purpose)
    const functions = this.storage.searchFunctionsByName(functionName, 5);

    if (functions.length > 0) {
      const fn = functions[0];

      const evidence: KnowledgeEvidence[] = [
        {
          type: 'function',
          id: fn.id,
          description: fn.purpose,
          relevance: fn.confidence,
          filePath: fn.filePath,
        },
      ];

      return {
        success: true,
        answer: `${fn.name}: ${fn.purpose}\n\nLocation: ${fn.filePath}\nComplexity: ${fn.complexity}\nCoverage: ${fn.coverage.toFixed(0)}%`,
        evidence,
        confidence: fn.confidence,
        fallback: false,
      };
    }

    return {
      success: false,
      confidence: 0,
      fallback: true,
      error: 'Function not found in knowledge graph',
    };
  }

  /**
   * Handle "is X used?" usage queries.
   */
  private async handleUsageQuery(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    // Extract function name
    const nameMatch = query.match(/is ([\w.]+) (?:used|called)/i);
    const functionName = nameMatch ? nameMatch[1] : '';

    if (!functionName) {
      return {
        success: false,
        confidence: 0,
        fallback: true,
        error: 'Could not extract function name from query',
      };
    }

    // Find function (search by name, not just purpose)
    const functions = this.storage.searchFunctionsByName(functionName, 1);
    if (functions.length === 0) {
      return {
        success: false,
        confidence: 0,
        fallback: true,
        error: 'Function not found in knowledge graph',
      };
    }

    const fn = functions[0];
    const callers = this.storage.getCallers(fn.id);

    if (callers.length === 0) {
      return {
        success: true,
        answer: `${fn.name} is NOT used by any other functions.\n\n⚠️ Via negativa opportunity: This function may be safe to delete.`,
        evidence: [],
        confidence: 0.8,
        fallback: false,
      };
    }

    const evidence: KnowledgeEvidence[] = callers.slice(0, 5).map((callerId) => ({
      type: 'function',
      id: callerId,
      description: `Calls ${fn.name}`,
      relevance: 1.0,
    }));

    return {
      success: true,
      answer: `${fn.name} is used by ${callers.length} function(s):\n\n${callers.slice(0, 5).join('\n')}`,
      evidence,
      confidence: 0.9,
      fallback: false,
    };
  }

  /**
   * Handle "what pattern should I use?" queries.
   */
  private async handlePatternQuery(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    // This would search the patterns table (Phase 3 feature)
    // For now, return fallback

    return {
      success: false,
      confidence: 0,
      fallback: true,
      error: 'Pattern recognition not yet implemented (Phase 3 feature)',
    };
  }

  /**
   * Handle generic queries.
   */
  private async handleGenericQuery(query: string, context?: QueryContext): Promise<KnowledgeResult> {
    // Generic search across all knowledge types
    const functions = this.storage.searchFunctionsByPurpose(query, 5);

    if (functions.length > 0) {
      const evidence: KnowledgeEvidence[] = functions.map((fn) => ({
        type: 'function',
        id: fn.id,
        description: fn.purpose,
        relevance: fn.confidence,
        filePath: fn.filePath,
      }));

      return {
        success: true,
        answer: `Found ${functions.length} relevant function(s):\n\n${functions.map((fn) => `- ${fn.name} (${fn.filePath}): ${fn.purpose}`).join('\n')}`,
        evidence,
        confidence: 0.6,
        fallback: false,
      };
    }

    return {
      success: false,
      confidence: 0,
      fallback: true,
      error: 'No relevant knowledge found',
    };
  }

  /**
   * Log query for analytics.
   */
  private async logQuery(log: QueryLog): Promise<void> {
    // TODO: Append to state/analytics/knowledge_queries.jsonl
    // For now, just console log
    console.log('[KnowledgeQuery]', JSON.stringify(log));
  }
}
