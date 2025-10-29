/**
 * Quality Graph - Task Vector Schema
 *
 * Defines the structure for task embeddings used in similarity search.
 * Vectors are stored in state/quality_graph/task_vectors.jsonl
 */

import { z } from 'zod';

/**
 * Task outcome schema
 */
export const TaskOutcomeSchema = z.object({
  status: z.enum(['success', 'failure', 'abandoned']),
  reason: z.string().optional(),
});

export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

/**
 * Task vector schema
 *
 * Each vector represents a completed task with:
 * - embedding: 384-dimensional TF-IDF vector (normalized)
 * - metadata: task info for context
 * - outcome: success/failure status
 */
export const TaskVectorSchema = z.object({
  // Required fields
  task_id: z.string().min(1),
  embedding: z.array(z.number()).length(384).describe('Unit-normalized TF-IDF embedding'),
  timestamp: z.string().datetime(),
  outcome: TaskOutcomeSchema,

  // Optional metadata
  title: z.string().optional(),
  description: z.string().optional(),
  files_touched: z.array(z.string()).optional(),
  complexity_score: z.number().min(0).max(100).optional(),
  duration_ms: z.number().min(0).optional(),
  quality: z.enum(['high', 'medium', 'low']).optional().describe('Embedding quality'),
});

export type TaskVector = z.infer<typeof TaskVectorSchema>;

/**
 * Similarity query result
 */
export const SimilarTaskSchema = z.object({
  task_id: z.string(),
  similarity: z.number().min(0).max(1),
  outcome: TaskOutcomeSchema,
  title: z.string().optional(),
  duration_ms: z.number().optional(),
  is_confident: z.boolean().describe('True if similarity > 0.5'),
});

export type SimilarTask = z.infer<typeof SimilarTaskSchema>;

/**
 * Validate task vector against schema
 *
 * @throws ZodError if validation fails
 */
export function validateTaskVector(data: unknown): TaskVector {
  return TaskVectorSchema.parse(data);
}

/**
 * Safe validation with error details
 */
export function validateTaskVectorSafe(data: unknown): {
  success: boolean;
  data?: TaskVector;
  errors?: string[];
} {
  const result = TaskVectorSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { success: false, errors };
  }
}

/**
 * Check if embedding is unit-normalized (for cosine similarity)
 *
 * Embeddings should have L2 norm ≈ 1.0 (within floating point tolerance)
 */
export function isNormalizedEmbedding(embedding: number[]): boolean {
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  return Math.abs(norm - 1.0) < 0.01; // Within 1% of unit norm
}

/**
 * Validate embedding quality
 */
export function validateEmbedding(embedding: number[]): {
  valid: boolean;
  reason?: string;
} {
  if (embedding.length !== 384) {
    return { valid: false, reason: `Expected 384 dimensions, got ${embedding.length}` };
  }

  if (embedding.some((x) => !isFinite(x))) {
    return { valid: false, reason: 'Contains NaN or Infinity' };
  }

  if (!isNormalizedEmbedding(embedding)) {
    return { valid: false, reason: 'Embedding not normalized (L2 norm should be 1.0)' };
  }

  return { valid: true };
}
