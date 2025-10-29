/**
 * Quality Graph - Similarity Query
 *
 * Implements cosine similarity search for finding similar tasks.
 *
 * Design:
 * - In-memory index (Map: task_id → vector)
 * - Cosine similarity computation (dot product, vectors pre-normalized)
 * - Top-K search with priority queue
 * - Configurable threshold (default: 0.3)
 * - Filters: success-only, exclude abandoned
 *
 * Performance:
 * - O(n) similarity computation for corpus of size n
 * - O(k log k) sorting for top-K (where k << n)
 * - Target: <50ms for 1000 vectors
 *
 * Verification Checklist:
 * - [ ] Returns top-K most similar tasks
 * - [ ] Excludes query task from results
 * - [ ] Filters by similarity threshold
 * - [ ] Sorts by similarity descending
 * - [ ] Handles empty corpus gracefully
 * - [ ] Query completes in <50ms for 1000 vectors
 */

import { TaskVector, SimilarTask } from './schema.js';
import { loadIndex } from './persistence.js';

/**
 * Options for similarity search
 */
export interface SimilarityOptions {
  /** Number of similar tasks to return */
  k?: number;

  /** Minimum similarity threshold (0.0 - 1.0) */
  minSimilarity?: number;

  /** Only return successful tasks */
  successOnly?: boolean;

  /** Exclude abandoned tasks */
  excludeAbandoned?: boolean;
}

/**
 * Default similarity options
 */
const DEFAULT_OPTIONS: Required<SimilarityOptions> = {
  k: 5,
  minSimilarity: 0.3,
  successOnly: false,
  excludeAbandoned: true,
};

/**
 * Compute cosine similarity between two vectors
 *
 * Assumes vectors are unit-normalized (L2 norm = 1.0)
 * Cosine similarity = dot product when normalized
 *
 * @param v1 - First vector (must be normalized)
 * @param v2 - Second vector (must be normalized)
 * @returns Similarity score [0.0, 1.0]
 *
 * Performance: O(d) where d is dimension (384)
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    throw new Error(`Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
  }

  let dotProduct = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
  }

  // Clamp to [0, 1] to handle floating point errors
  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Find top-K similar tasks
 *
 * Algorithm:
 * 1. Load query task vector
 * 2. Compute similarity to all other tasks
 * 3. Filter by threshold and options
 * 4. Sort by similarity descending
 * 5. Return top-K
 *
 * @param workspaceRoot - Project root directory
 * @param taskId - Query task ID
 * @param options - Search options
 * @returns Array of similar tasks sorted by similarity descending
 *
 * Performance: O(n * d + k log k) where n=corpus size, d=dimensions, k=results
 * For n=1000, d=384, k=5: ~10-20ms
 */
export async function findSimilarTasks(
  workspaceRoot: string,
  taskId: string,
  options: SimilarityOptions = {}
): Promise<SimilarTask[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load index
  const index = await loadIndex(workspaceRoot);

  // Get query vector
  const queryVector = index.get(taskId);
  if (!queryVector) {
    throw new Error(`Task not found in quality graph: ${taskId}`);
  }

  // Compute similarities
  const similarities: Array<{
    taskId: string;
    similarity: number;
    vector: TaskVector;
  }> = [];

  for (const [otherTaskId, otherVector] of index.entries()) {
    // Skip self
    if (otherTaskId === taskId) {
      continue;
    }

    // Apply filters
    if (opts.successOnly && otherVector.outcome.status !== 'success') {
      continue;
    }

    if (opts.excludeAbandoned && otherVector.outcome.status === 'abandoned') {
      continue;
    }

    // Compute similarity
    const similarity = cosineSimilarity(queryVector.embedding, otherVector.embedding);

    // Filter by threshold
    if (similarity < opts.minSimilarity) {
      continue;
    }

    similarities.push({
      taskId: otherTaskId,
      similarity,
      vector: otherVector,
    });
  }

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Take top-K
  const topK = similarities.slice(0, opts.k);

  // Format results
  return topK.map((item) => ({
    task_id: item.taskId,
    similarity: item.similarity,
    outcome: item.vector.outcome,
    title: item.vector.title,
    duration_ms: item.vector.duration_ms,
    is_confident: item.similarity > 0.5,
  }));
}

/**
 * Find similar tasks by embedding (without loading from index)
 *
 * Useful for finding similar tasks before recording the query task
 *
 * @param workspaceRoot - Project root directory
 * @param embedding - Query embedding
 * @param options - Search options
 * @returns Array of similar tasks
 */
export async function findSimilarByEmbedding(
  workspaceRoot: string,
  embedding: number[],
  options: SimilarityOptions = {}
): Promise<SimilarTask[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Load index
  const index = await loadIndex(workspaceRoot);

  // Compute similarities
  const similarities: Array<{
    taskId: string;
    similarity: number;
    vector: TaskVector;
  }> = [];

  for (const [taskId, vector] of index.entries()) {
    // Apply filters
    if (opts.successOnly && vector.outcome.status !== 'success') {
      continue;
    }

    if (opts.excludeAbandoned && vector.outcome.status === 'abandoned') {
      continue;
    }

    // Compute similarity
    const similarity = cosineSimilarity(embedding, vector.embedding);

    // Filter by threshold
    if (similarity < opts.minSimilarity) {
      continue;
    }

    similarities.push({
      taskId,
      similarity,
      vector,
    });
  }

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  // Take top-K
  const topK = similarities.slice(0, opts.k);

  // Format results
  return topK.map((item) => ({
    task_id: item.taskId,
    similarity: item.similarity,
    outcome: item.vector.outcome,
    title: item.vector.title,
    duration_ms: item.vector.duration_ms,
    is_confident: item.similarity > 0.5,
  }));
}

/**
 * Get similar task statistics
 *
 * Useful for understanding corpus quality and similarity distribution
 *
 * @param workspaceRoot - Project root directory
 * @param taskId - Query task ID
 * @returns Statistics about similar tasks
 */
export async function getSimilarityStats(
  workspaceRoot: string,
  taskId: string
): Promise<{
  total_tasks: number;
  above_threshold: number;
  high_confidence: number;
  avg_similarity: number;
  max_similarity: number;
}> {
  const index = await loadIndex(workspaceRoot);
  const queryVector = index.get(taskId);

  if (!queryVector) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const similarities: number[] = [];
  for (const [otherTaskId, otherVector] of index.entries()) {
    if (otherTaskId === taskId) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector.embedding, otherVector.embedding);
    similarities.push(similarity);
  }

  const aboveThreshold = similarities.filter((s) => s >= 0.3).length;
  const highConfidence = similarities.filter((s) => s > 0.5).length;
  const avgSimilarity =
    similarities.length > 0
      ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
      : 0;
  const maxSimilarity = similarities.length > 0 ? Math.max(...similarities) : 0;

  return {
    total_tasks: similarities.length,
    above_threshold: aboveThreshold,
    high_confidence: highConfidence,
    avg_similarity: avgSimilarity,
    max_similarity: maxSimilarity,
  };
}

/**
 * Batch similarity query (find similar for multiple tasks)
 *
 * More efficient than calling findSimilarTasks multiple times
 * (loads index once, reuses)
 *
 * @param workspaceRoot - Project root directory
 * @param taskIds - Query task IDs
 * @param options - Search options
 * @returns Map of task_id to similar tasks
 */
export async function findSimilarBatch(
  workspaceRoot: string,
  taskIds: string[],
  options: SimilarityOptions = {}
): Promise<Map<string, SimilarTask[]>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const index = await loadIndex(workspaceRoot);
  const results = new Map<string, SimilarTask[]>();

  for (const taskId of taskIds) {
    const queryVector = index.get(taskId);
    if (!queryVector) {
      results.set(taskId, []);
      continue;
    }

    // Compute similarities (inline to avoid index reload)
    const similarities: Array<{
      taskId: string;
      similarity: number;
      vector: TaskVector;
    }> = [];

    for (const [otherTaskId, otherVector] of index.entries()) {
      if (otherTaskId === taskId) {
        continue;
      }

      if (opts.successOnly && otherVector.outcome.status !== 'success') {
        continue;
      }

      if (opts.excludeAbandoned && otherVector.outcome.status === 'abandoned') {
        continue;
      }

      const similarity = cosineSimilarity(queryVector.embedding, otherVector.embedding);

      if (similarity < opts.minSimilarity) {
        continue;
      }

      similarities.push({
        taskId: otherTaskId,
        similarity,
        vector: otherVector,
      });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    const topK = similarities.slice(0, opts.k);

    results.set(
      taskId,
      topK.map((item) => ({
        task_id: item.taskId,
        similarity: item.similarity,
        outcome: item.vector.outcome,
        title: item.vector.title,
        duration_ms: item.vector.duration_ms,
        is_confident: item.similarity > 0.5,
      }))
    );
  }

  return results;
}

/**
 * Find tasks similar to a new task (before it's recorded)
 *
 * Convenience function combining embedding generation + similarity search
 *
 * @param workspaceRoot - Project root directory
 * @param metadata - Task metadata (title, description, files)
 * @param options - Search options
 * @returns Similar tasks
 *
 * Note: Requires Python embedding script to be available
 */
export async function findSimilarToNewTask(
  workspaceRoot: string,
  metadata: {
    title?: string;
    description?: string;
    files_touched?: string[];
  },
  options: SimilarityOptions = {}
): Promise<SimilarTask[]> {
  // This would call Python script to compute embedding
  // For now, throw with helpful message
  throw new Error(
    'findSimilarToNewTask requires Python embedding script. ' +
      'Use compute_embedding.py then findSimilarByEmbedding()'
  );
}
