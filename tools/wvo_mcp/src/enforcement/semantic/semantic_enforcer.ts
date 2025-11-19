/**
 * Semantic Enforcer - L5 and L6 Layers
 *
 * Provides proactive quality enforcement through semantic search.
 * L5: Retrieval enforcement - ensures sufficient context retrieved
 * L6: Coherence enforcement - ensures alignment with retrieved context
 */

import { EmbeddingService } from './embedding_service.js';
import { VectorStore, ChunkMetadata, SearchResult } from './vector_store.js';
import { ScentEnvironment, ScentType, LayerName } from '../prototype/scent_environment.js';
// Use the same Task interface as stigmergic enforcer uses from phase_executors
export interface Task {
  id: string;
  title: string;
  status: string;
}
import { logInfo, logWarning } from '../../telemetry/logger.js';

export interface RetrievalContext {
  query: string;
  results: SearchResult[];
  citations: string[];
  metadata: {
    retrievalTimeMs: number;
    resultCount: number;
    avgScore: number;
  };
}

export interface SemanticEnforcementResult {
  approved: boolean;
  retrievalPassed: boolean;
  coherencePassed: boolean;
  citations: string[];
  concerns: string[];
}

/**
 * Required artifact types per phase
 */
const PHASE_REQUIREMENTS: Record<string, string[]> = {
  strategize: ['adr', 'spec', 'doc'],
  spec: ['spec', 'test', 'code'],
  plan: ['code', 'test', 'doc'],
  think: ['test', 'doc', 'code'],
  design: ['adr', 'code', 'spec'],
  implement: ['code', 'test', 'spec'],
  verify: ['test', 'spec', 'code'],
  review: ['doc', 'adr', 'spec']
};

/**
 * Minimum citations required per phase
 */
const MIN_CITATIONS: Record<string, number> = {
  strategize: 5,
  spec: 5,
  plan: 5,
  think: 3,
  design: 5,
  implement: 7,
  verify: 5,
  review: 3
};

/**
 * Semantic Enforcer - Layers 5 and 6
 */
export class SemanticEnforcer {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private environment: ScentEnvironment;
  private initialized: boolean = false;

  constructor(workspaceRoot: string) {
    this.embeddingService = new EmbeddingService();
    this.vectorStore = new VectorStore(this.embeddingService);
    this.environment = new ScentEnvironment();
  }

  /**
   * Initialize the semantic search system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.embeddingService.initialize();
    await this.environment.bootstrap();
    this.initialized = true;

    logInfo('SemanticEnforcer: Initialized L5-L6 layers');
  }

  /**
   * Retrieve relevant context for a phase
   */
  async retrieve(
    query: string,
    phase: string,
    options?: {
      k?: number;
      types?: string[];
    }
  ): Promise<RetrievalContext> {
    const startTime = Date.now();

    // Use phase-specific requirements if not provided
    const types = options?.types || PHASE_REQUIREMENTS[phase] || ['code', 'test', 'doc'];
    const k = options?.k || 20;

    // Build search query with phase context
    const enhancedQuery = `${phase} phase: ${query}`;

    // Perform hybrid search
    const results = await this.vectorStore.hybridSearch(
      enhancedQuery,
      k,
      types.length > 0 ? { type: types[0] as any } : undefined
    );

    // Format citations
    const citations = this.formatCitations(results);

    // Calculate metadata
    const retrievalTimeMs = Date.now() - startTime;
    const avgScore = results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

    logInfo('SemanticEnforcer: Retrieved context', {
      phase,
      resultCount: results.length,
      avgScore,
      retrievalTimeMs
    });

    return {
      query: enhancedQuery,
      results,
      citations,
      metadata: {
        retrievalTimeMs,
        resultCount: results.length,
        avgScore
      }
    };
  }

  /**
   * L5: Enforce retrieval requirements
   */
  async enforceRetrieval(
    task: Task,
    phase: string,
    retrievalContext: RetrievalContext
  ): Promise<boolean> {
    if (retrievalContext.results.length === 0) {
      logWarning('SemanticEnforcer L5: No indexed context available, skipping retrieval enforcement', {
        taskId: task.id,
        phase
      });
      return true;
    }
    const minRequired = MIN_CITATIONS[phase] || 5;
    const foundCount = retrievalContext.citations.length;

    if (foundCount < minRequired) {
      // Leave scent for insufficient context
      await this.environment.leaveScent({
        type: ScentType.QUALITY_CONCERN,
        strength: 0.9,
        decayRate: 0.2,
        taskId: task.id,
        layer: LayerName.L5_CONSENSUS, // Using L5 as closest match
        metadata: {
          phase,
          found: foundCount,
          required: minRequired,
          concern: 'INSUFFICIENT_CONTEXT'
        }
      });

      logWarning('SemanticEnforcer L5: Insufficient context retrieved', {
        taskId: task.id,
        phase,
        found: foundCount,
        required: minRequired
      });

      return false;
    }

    // Check quality of retrieved results
    if (retrievalContext.metadata.avgScore < 0.5) {
      await this.environment.leaveScent({
        type: ScentType.QUALITY_CONCERN,
        strength: 0.7,
        decayRate: 0.3,
        taskId: task.id,
        layer: LayerName.L5_CONSENSUS,
        metadata: {
          phase,
          avgScore: retrievalContext.metadata.avgScore,
          concern: 'LOW_RELEVANCE_SCORES'
        }
      });

      logWarning('SemanticEnforcer L5: Low relevance scores', {
        taskId: task.id,
        phase,
        avgScore: retrievalContext.metadata.avgScore
      });

      return false;
    }

    logInfo('SemanticEnforcer L5: Retrieval requirements met', {
      taskId: task.id,
      phase,
      citations: foundCount
    });

    return true;
  }

  /**
   * L6: Enforce coherence with retrieved context
   */
  async enforceCoherence(
    task: Task,
    phase: string,
    evidenceContent: string,
    retrievalContext: RetrievalContext
  ): Promise<boolean> {
    // Check if evidence cites retrieved artifacts
    const citedCount = this.countCitations(evidenceContent, retrievalContext.citations);
    const citationRatio = citedCount / retrievalContext.citations.length;

    if (citationRatio < 0.3) {
      // Evidence doesn't use retrieved context
      await this.environment.leaveScent({
        type: ScentType.QUALITY_CONCERN,
        strength: 0.8,
        decayRate: 0.3,
        taskId: task.id,
        layer: LayerName.L6_DOCUMENTATION, // Using L6 as closest match
        metadata: {
          phase,
          citationRatio,
          concern: 'IGNORING_RETRIEVED_CONTEXT'
        }
      });

      logWarning('SemanticEnforcer L6: Evidence ignores retrieved context', {
        taskId: task.id,
        phase,
        citationRatio
      });

      return false;
    }

    // Check for contradictions (simplified for prototype)
    const hasContradiction = await this.detectContradictions(
      evidenceContent,
      retrievalContext
    );

    if (hasContradiction) {
      await this.environment.leaveScent({
        type: ScentType.QUALITY_CONCERN,
        strength: 0.95,
        decayRate: 0.2,
        taskId: task.id,
        layer: LayerName.L6_DOCUMENTATION,
        metadata: {
          phase,
          concern: 'CONTRADICTS_EXISTING_DECISIONS'
        }
      });

      logWarning('SemanticEnforcer L6: Evidence contradicts existing decisions', {
        taskId: task.id,
        phase
      });

      return false;
    }

    logInfo('SemanticEnforcer L6: Coherence requirements met', {
      taskId: task.id,
      phase,
      citationRatio
    });

    return true;
  }

  /**
   * Complete semantic enforcement for a phase
   */
  async enforcePhase(
    task: Task,
    phase: string,
    evidenceContent: string,
    query?: string
  ): Promise<SemanticEnforcementResult> {
    // Initialize if needed
    await this.initialize();

    // Retrieve relevant context
    const retrievalContext = await this.retrieve(
      query || `${task.title} ${phase}`,
      phase
    );

    // L5: Enforce retrieval
    const retrievalPassed = await this.enforceRetrieval(task, phase, retrievalContext);

    // L6: Enforce coherence
    const coherencePassed = await this.enforceCoherence(
      task,
      phase,
      evidenceContent,
      retrievalContext
    );

    // Build result
    const concerns: string[] = [];
    if (!retrievalPassed) {
      concerns.push(`Insufficient context: ${retrievalContext.citations.length} < ${MIN_CITATIONS[phase]}`);
    }
    if (!coherencePassed) {
      concerns.push('Evidence does not align with retrieved context');
    }

    return {
      approved: retrievalPassed && coherencePassed,
      retrievalPassed,
      coherencePassed,
      citations: retrievalContext.citations,
      concerns
    };
  }

  /**
   * Add documents to the vector store for indexing
   */
  async indexDocuments(documents: ChunkMetadata[]): Promise<void> {
    await this.vectorStore.addDocuments(documents);

    logInfo('SemanticEnforcer: Indexed documents', {
      count: documents.length,
      types: documents.reduce((acc, d) => {
        acc[d.type] = (acc[d.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
  }

  /**
   * Format citations from search results
   */
  private formatCitations(results: SearchResult[]): string[] {
    return results
      .filter(r => r.score > 0.5) // Only relevant results
      .map(r => {
        const meta = r.metadata;
        const location = meta.lineStart
          ? `${meta.path}:${meta.lineStart}-${meta.lineEnd}`
          : meta.path;
        return `[${meta.type}] ${location} (score: ${r.score.toFixed(2)})`;
      });
  }

  /**
   * Count how many citations appear in evidence
   */
  private countCitations(evidence: string, citations: string[]): number {
    let count = 0;
    const evidenceLower = evidence.toLowerCase();

    for (const citation of citations) {
      // Extract path from citation
      const pathMatch = citation.match(/\[(.*?)\]\s+([^\s]+)/);
      if (pathMatch) {
        const path = pathMatch[2].split(':')[0];
        if (evidenceLower.includes(path.toLowerCase())) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Detect contradictions between evidence and retrieved context
   * Simplified for prototype - in production would use NLI model
   */
  private async detectContradictions(
    evidence: string,
    retrievalContext: RetrievalContext
  ): Promise<boolean> {
    // Simple heuristic: check for negation words near key terms
    const negationWords = ['not', 'never', 'avoid', 'don\'t', 'shouldn\'t', 'without', 'instead'];
    const evidenceLower = evidence.toLowerCase();

    for (const result of retrievalContext.results) {
      const contentLower = result.metadata.content.toLowerCase();

      // Extract key terms from retrieved content
      const keyTerms = contentLower
        .split(/\s+/)
        .filter(word => word.length > 5);

      for (const term of keyTerms) {
        if (evidenceLower.includes(term)) {
          // Check if negation appears near the term in evidence
          const termIndex = evidenceLower.indexOf(term);
          const contextWindow = evidenceLower.substring(
            Math.max(0, termIndex - 50),
            Math.min(evidenceLower.length, termIndex + 50)
          );

          for (const negation of negationWords) {
            if (contextWindow.includes(negation)) {
              // Potential contradiction detected
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Get statistics about the semantic system
   */
  getStats(): {
    initialized: boolean;
    vectorStoreStats: any;
    cacheStats: any;
  } {
    return {
      initialized: this.initialized,
      vectorStoreStats: this.vectorStore.getStats(),
      cacheStats: this.embeddingService.getCacheStats()
    };
  }
}
