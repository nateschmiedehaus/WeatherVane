/**
 * Embedding Service for Semantic Search
 *
 * Generates embeddings for text using a lightweight model
 * that fits on M1 Mac. Uses simple in-memory caching.
 */

import crypto from 'node:crypto';

export interface EmbeddingResult {
  text: string;
  embedding: Float32Array;
  dimensions: number;
}

/**
 * Minimal embedding service using a simple approach
 * In production, would use sentence-transformers or similar
 */
export class EmbeddingService {
  private cache: Map<string, Float32Array>;
  private dimensions: number;

  constructor(dimensions: number = 384) {
    this.cache = new Map();
    this.dimensions = dimensions;
  }

  /**
   * Initialize the embedding model
   * For prototype, we'll use a simple hash-based approach
   * In production, would load actual transformer model
   */
  async initialize(): Promise<void> {
    // In production: load sentence-transformers model
    // For now: ready immediately
    console.log(`EmbeddingService: Initialized with ${this.dimensions} dimensions`);
  }

  /**
   * Generate embeddings for text
   * For prototype: deterministic hash-based vectors
   * In production: actual transformer embeddings
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];

    for (const text of texts) {
      // Check cache
      const cacheKey = this.getCacheKey(text);
      if (this.cache.has(cacheKey)) {
        results.push(this.cache.get(cacheKey)!);
        continue;
      }

      // Generate embedding (prototype: hash-based)
      const embedding = this.generateEmbedding(text);

      // Cache it
      this.cache.set(cacheKey, embedding);
      results.push(embedding);
    }

    return results;
  }

  /**
   * Generate a single embedding
   */
  async embedOne(text: string): Promise<Float32Array> {
    const results = await this.embed([text]);
    return results[0];
  }

  /**
   * Compute cosine similarity between two embeddings
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < this.dimensions; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; memoryMB: number } {
    const size = this.cache.size;
    const memoryBytes = size * this.dimensions * 4; // 4 bytes per float32
    return {
      size,
      memoryMB: memoryBytes / (1024 * 1024)
    };
  }

  /**
   * Generate deterministic embedding from text (prototype only)
   * In production, this would use actual transformer model
   */
  private generateEmbedding(text: string): Float32Array {
    const embedding = new Float32Array(this.dimensions);

    // Create multiple hashes for better distribution
    const hashes = [
      crypto.createHash('sha256').update(text).digest(),
      crypto.createHash('sha256').update(text + '1').digest(),
      crypto.createHash('sha256').update(text + '2').digest(),
      crypto.createHash('sha256').update(text + '3').digest()
    ];

    // Fill embedding with normalized values from hashes
    for (let i = 0; i < this.dimensions; i++) {
      const hashIndex = Math.floor(i / 32) % hashes.length;
      const byteIndex = i % 32;
      const byteValue = hashes[hashIndex][byteIndex];

      // Normalize to [-1, 1] range
      embedding[i] = (byteValue / 127.5) - 1;
    }

    // Normalize the vector
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * Get cache key for text
   */
  private getCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }
}