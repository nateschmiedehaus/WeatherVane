/**
 * Vector Store for Semantic Search
 *
 * Simple in-memory vector store with similarity search.
 * In production, would use FAISS or similar.
 */

import { EmbeddingService } from './embedding_service.js';

export interface ChunkMetadata {
  id: string;
  path: string;
  type: 'code' | 'test' | 'doc' | 'adr' | 'spec';
  language?: string;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  content: string;
  timestamp?: number;
}

export interface SearchResult {
  metadata: ChunkMetadata;
  score: number;
  distance: number;
}

/**
 * Simple in-memory vector store
 * In production, would use FAISS or similar
 */
export class VectorStore {
  private vectors: Float32Array[];
  private metadata: ChunkMetadata[];
  private embeddingService: EmbeddingService;
  private dimensions: number;

  constructor(embeddingService: EmbeddingService, dimensions: number = 384) {
    this.vectors = [];
    this.metadata = [];
    this.embeddingService = embeddingService;
    this.dimensions = dimensions;
  }

  /**
   * Add vectors to the store
   */
  async addVectors(vectors: Float32Array[], metadata: ChunkMetadata[]): Promise<void> {
    if (vectors.length !== metadata.length) {
      throw new Error('Vectors and metadata must have same length');
    }

    for (let i = 0; i < vectors.length; i++) {
      this.vectors.push(vectors[i]);
      this.metadata.push(metadata[i]);
    }
  }

  /**
   * Add documents (text) to the store
   * Generates embeddings automatically
   */
  async addDocuments(documents: ChunkMetadata[]): Promise<void> {
    const texts = documents.map(d => d.content);
    const embeddings = await this.embeddingService.embed(texts);
    await this.addVectors(embeddings, documents);
  }

  /**
   * Search for similar vectors
   */
  async search(
    query: Float32Array | string,
    k: number = 10,
    filters?: Partial<ChunkMetadata>
  ): Promise<SearchResult[]> {
    // Get query embedding if string provided
    let queryVector: Float32Array;
    if (typeof query === 'string') {
      queryVector = await this.embeddingService.embedOne(query);
    } else {
      queryVector = query;
    }

    // Calculate similarities to all vectors
    const scores: Array<{ index: number; score: number; distance: number }> = [];

    for (let i = 0; i < this.vectors.length; i++) {
      // Apply filters
      if (filters && !this.matchesFilters(this.metadata[i], filters)) {
        continue;
      }

      const score = this.embeddingService.cosineSimilarity(queryVector, this.vectors[i]);
      const distance = 1 - score; // Convert similarity to distance

      scores.push({ index: i, score, distance });
    }

    // Sort by score (descending) and take top k
    scores.sort((a, b) => b.score - a.score);
    const topK = scores.slice(0, k);

    // Build results
    return topK.map(({ index, score, distance }) => ({
      metadata: this.metadata[index],
      score,
      distance
    }));
  }

  /**
   * Hybrid search combining lexical and semantic
   */
  async hybridSearch(
    query: string,
    k: number = 10,
    filters?: Partial<ChunkMetadata>
  ): Promise<SearchResult[]> {
    // Semantic search
    const semanticResults = await this.search(query, k * 2, filters);

    // Simple lexical search (keyword matching)
    const lexicalResults = this.lexicalSearch(query, k * 2, filters);

    // Merge and dedupe
    const merged = this.mergeResults(semanticResults, lexicalResults);

    // Take top k
    return merged.slice(0, k);
  }

  /**
   * Simple lexical search (keyword matching)
   */
  private lexicalSearch(
    query: string,
    k: number,
    filters?: Partial<ChunkMetadata>
  ): SearchResult[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const scores: Array<{ index: number; score: number }> = [];

    for (let i = 0; i < this.metadata.length; i++) {
      // Apply filters
      if (filters && !this.matchesFilters(this.metadata[i], filters)) {
        continue;
      }

      const content = this.metadata[i].content.toLowerCase();
      let matchCount = 0;

      for (const word of queryWords) {
        if (content.includes(word)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const score = matchCount / queryWords.length;
        scores.push({ index: i, score });
      }
    }

    // Sort by score and take top k
    scores.sort((a, b) => b.score - a.score);
    const topK = scores.slice(0, k);

    return topK.map(({ index, score }) => ({
      metadata: this.metadata[index],
      score: score * 0.5, // Scale lexical scores lower than semantic
      distance: 1 - score
    }));
  }

  /**
   * Merge semantic and lexical results
   */
  private mergeResults(
    semantic: SearchResult[],
    lexical: SearchResult[]
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    // Add semantic results (higher priority)
    for (const result of semantic) {
      merged.set(result.metadata.id, result);
    }

    // Add lexical results (boost if already in semantic)
    for (const result of lexical) {
      const existing = merged.get(result.metadata.id);
      if (existing) {
        // Boost score if in both
        existing.score = Math.min(1.0, existing.score * 1.2);
      } else {
        merged.set(result.metadata.id, result);
      }
    }

    // Sort by score
    const results = Array.from(merged.values());
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Check if metadata matches filters
   */
  private matchesFilters(
    metadata: ChunkMetadata,
    filters: Partial<ChunkMetadata>
  ): boolean {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && metadata[key as keyof ChunkMetadata] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get statistics about the store
   */
  getStats(): {
    vectorCount: number;
    dimensions: number;
    memoryMB: number;
    types: Record<string, number>;
  } {
    const types: Record<string, number> = {};
    for (const meta of this.metadata) {
      types[meta.type] = (types[meta.type] || 0) + 1;
    }

    const memoryBytes =
      this.vectors.length * this.dimensions * 4 + // Vector data
      this.metadata.length * 1024; // Rough estimate for metadata

    return {
      vectorCount: this.vectors.length,
      dimensions: this.dimensions,
      memoryMB: memoryBytes / (1024 * 1024),
      types
    };
  }

  /**
   * Clear the store
   */
  clear(): void {
    this.vectors = [];
    this.metadata = [];
  }

  /**
   * Remove vectors by filter
   */
  removeByFilter(filter: Partial<ChunkMetadata>): number {
    const indicesToRemove: number[] = [];

    for (let i = 0; i < this.metadata.length; i++) {
      if (this.matchesFilters(this.metadata[i], filter)) {
        indicesToRemove.push(i);
      }
    }

    // Remove in reverse order to maintain indices
    let removed = 0;
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      const index = indicesToRemove[i];
      this.vectors.splice(index, 1);
      this.metadata.splice(index, 1);
      removed++;
    }

    return removed;
  }
}