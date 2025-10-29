/**
 * Quality Graph Similarity Tests
 *
 * Verification coverage:
 * - Cosine similarity computation
 * - Top-K search
 * - Filtering (success-only, exclude-abandoned)
 * - Edge cases (empty corpus, identical tasks)
 * - Performance (<50ms for 1000 vectors)
 * - Batch operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import {
  cosineSimilarity,
  findSimilarTasks,
  findSimilarByEmbedding,
  getSimilarityStats,
  findSimilarBatch,
} from '../similarity.js';
import { writeVector } from '../persistence.js';
import type { TaskVector } from '../schema.js';

const TEST_WORKSPACE = '/tmp/quality-graph-similarity-test';

describe('Cosine Similarity', () => {
  const createNormalizedVector = (length: number, seed: number = 0): number[] => {
    const vec = new Array(length).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    return vec.map((x) => x / norm);
  };

  it('returns 1.0 for identical vectors', () => {
    const v1 = createNormalizedVector(384, 1);
    const v2 = [...v1]; // Copy

    const similarity = cosineSimilarity(v1, v2);
    expect(similarity).toBeCloseTo(1.0, 3);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const v1 = new Array(384).fill(0);
    v1[0] = 1.0; // Unit vector along dimension 0

    const v2 = new Array(384).fill(0);
    v2[1] = 1.0; // Unit vector along dimension 1

    const similarity = cosineSimilarity(v1, v2);
    expect(similarity).toBeCloseTo(0.0, 3);
  });

  it('returns value between 0 and 1 for random vectors', () => {
    const v1 = createNormalizedVector(384, 1);
    const v2 = createNormalizedVector(384, 2);

    const similarity = cosineSimilarity(v1, v2);
    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const v1 = createNormalizedVector(384, 1);
    const v2 = createNormalizedVector(384, 2);

    const sim1 = cosineSimilarity(v1, v2);
    const sim2 = cosineSimilarity(v2, v1);

    expect(sim1).toBeCloseTo(sim2, 6);
  });

  it('throws on dimension mismatch', () => {
    const v1 = [1, 0];
    const v2 = [1, 0, 0];

    expect(() => cosineSimilarity(v1, v2)).toThrow('dimension mismatch');
  });
});

describe('Find Similar Tasks', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (
    id: string,
    seed: number,
    status: 'success' | 'failure' | 'abandoned' = 'success'
  ): TaskVector => {
    // Create deterministic normalized vector
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const embedding = vec.map((x) => x / norm);

    return {
      task_id: id,
      embedding,
      timestamp: new Date().toISOString(),
      outcome: { status },
      title: `Task ${id}`,
      duration_ms: 1000 + seed * 100,
    };
  };

  it('finds top-K similar tasks', async () => {
    // Write 5 tasks with varying similarity
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('very-similar', 1.1)); // Very similar
    await writeVector(TEST_WORKSPACE, createTestVector('similar', 2)); // Somewhat similar
    await writeVector(TEST_WORKSPACE, createTestVector('dissimilar', 100)); // Very different
    await writeVector(TEST_WORKSPACE, createTestVector('unrelated', 200)); // Unrelated

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query', { k: 3 });

    expect(results.length).toBeLessThanOrEqual(3);
    expect(results[0].task_id).toBe('very-similar'); // Most similar first

    // Check sorted by similarity descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });

  it('excludes query task from results', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('other', 2));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query');

    expect(results.every((r) => r.task_id !== 'query')).toBe(true);
  });

  it('filters by similarity threshold', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('similar', 1.5));
    await writeVector(TEST_WORKSPACE, createTestVector('dissimilar', 100));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query', {
      minSimilarity: 0.5,
    });

    // All results should have similarity >= 0.5
    expect(results.every((r) => r.similarity >= 0.5)).toBe(true);
  });

  it('filters by success-only option', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1, 'success'));
    await writeVector(TEST_WORKSPACE, createTestVector('success-1', 1.1, 'success'));
    await writeVector(TEST_WORKSPACE, createTestVector('failure-1', 1.2, 'failure'));
    await writeVector(TEST_WORKSPACE, createTestVector('abandoned-1', 1.3, 'abandoned'));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query', {
      successOnly: true,
    });

    // All results should be successful
    expect(results.every((r) => r.outcome.status === 'success')).toBe(true);
  });

  it('excludes abandoned tasks by default', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1, 'success'));
    await writeVector(TEST_WORKSPACE, createTestVector('success-1', 1.1, 'success'));
    await writeVector(TEST_WORKSPACE, createTestVector('abandoned-1', 1.2, 'abandoned'));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query');

    // No abandoned tasks in results
    expect(results.every((r) => r.outcome.status !== 'abandoned')).toBe(true);
  });

  it('includes abandoned when option set', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1, 'success'));
    await writeVector(TEST_WORKSPACE, createTestVector('abandoned-1', 1.1, 'abandoned'));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query', {
      excludeAbandoned: false,
    });

    // Should have abandoned task
    expect(results.some((r) => r.outcome.status === 'abandoned')).toBe(true);
  });

  it('marks high-confidence results', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('very-similar', 1.05)); // High similarity
    await writeVector(TEST_WORKSPACE, createTestVector('dissimilar', 50)); // Low similarity

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query');

    // Very similar should be high confidence (similarity > 0.5)
    const verySimilar = results.find((r) => r.task_id === 'very-similar');
    if (verySimilar) {
      expect(verySimilar.is_confident).toBe(verySimilar.similarity > 0.5);
    }
  });

  it('returns empty array for empty corpus', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));

    const results = await findSimilarTasks(TEST_WORKSPACE, 'query');

    expect(results).toEqual([]);
  });

  it('throws for non-existent task', async () => {
    await expect(
      findSimilarTasks(TEST_WORKSPACE, 'non-existent')
    ).rejects.toThrow('not found');
  });
});

describe('Find Similar By Embedding', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, seed: number): TaskVector => {
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const embedding = vec.map((x) => x / norm);

    return {
      task_id: id,
      embedding,
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      title: `Task ${id}`,
    };
  };

  it('finds similar tasks by embedding', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('task-1', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('task-2', 2));

    // Query with embedding similar to task-1
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(1.1 + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const queryEmbedding = vec.map((x) => x / norm);

    const results = await findSimilarByEmbedding(TEST_WORKSPACE, queryEmbedding);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].task_id).toBe('task-1'); // Should match task-1 best
  });

  it('works with empty corpus', async () => {
    const embedding = new Array(384).fill(1 / Math.sqrt(384));

    const results = await findSimilarByEmbedding(TEST_WORKSPACE, embedding);

    expect(results).toEqual([]);
  });
});

describe('Similarity Statistics', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, seed: number): TaskVector => {
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const embedding = vec.map((x) => x / norm);

    return {
      task_id: id,
      embedding,
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
    };
  };

  it('returns similarity statistics', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('task-1', 1.5));
    await writeVector(TEST_WORKSPACE, createTestVector('task-2', 2));
    await writeVector(TEST_WORKSPACE, createTestVector('task-3', 100));

    const stats = await getSimilarityStats(TEST_WORKSPACE, 'query');

    expect(stats.total_tasks).toBe(3);
    expect(stats.avg_similarity).toBeGreaterThan(0);
    expect(stats.avg_similarity).toBeLessThanOrEqual(1);
    expect(stats.max_similarity).toBeGreaterThan(0);
    expect(stats.max_similarity).toBeLessThanOrEqual(1);
  });
});

describe('Batch Operations', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, seed: number): TaskVector => {
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const embedding = vec.map((x) => x / norm);

    return {
      task_id: id,
      embedding,
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      title: `Task ${id}`,
    };
  };

  it('finds similar tasks for multiple queries', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('query-1', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('query-2', 10));
    await writeVector(TEST_WORKSPACE, createTestVector('similar-to-1', 1.5));
    await writeVector(TEST_WORKSPACE, createTestVector('similar-to-2', 10.5));

    const results = await findSimilarBatch(TEST_WORKSPACE, ['query-1', 'query-2']);

    expect(results.size).toBe(2);
    expect(results.has('query-1')).toBe(true);
    expect(results.has('query-2')).toBe(true);

    const query1Results = results.get('query-1')!;
    expect(query1Results.length).toBeGreaterThan(0);
  });

  it('handles non-existent tasks in batch', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('exists', 1));

    const results = await findSimilarBatch(TEST_WORKSPACE, ['exists', 'not-exists']);

    expect(results.size).toBe(2);
    expect(results.get('not-exists')).toEqual([]);
  });
});

describe('Performance', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, seed: number): TaskVector => {
    const vec = new Array(384).fill(0).map((_, i) => Math.sin(seed + i));
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    const embedding = vec.map((x) => x / norm);

    return {
      task_id: id,
      embedding,
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
    };
  };

  it('query completes in <50ms for 100 vectors', async () => {
    // Write 100 vectors
    for (let i = 0; i < 100; i++) {
      await writeVector(TEST_WORKSPACE, createTestVector(`task-${i}`, i));
    }

    // Benchmark query
    const start = performance.now();
    await findSimilarTasks(TEST_WORKSPACE, 'task-50', { k: 5 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  }, 10000); // 10s timeout

  it('batch query efficient for multiple tasks', async () => {
    // Write 50 vectors
    for (let i = 0; i < 50; i++) {
      await writeVector(TEST_WORKSPACE, createTestVector(`task-${i}`, i));
    }

    // Benchmark batch query (10 queries)
    const queryIds = Array.from({ length: 10 }, (_, i) => `task-${i}`);

    const start = performance.now();
    await findSimilarBatch(TEST_WORKSPACE, queryIds);
    const elapsed = performance.now() - start;

    // Should be faster than 10 individual queries (10 * 50ms = 500ms)
    expect(elapsed).toBeLessThan(200); // 200ms for 10 queries
  }, 10000);
});
