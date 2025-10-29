/**
 * Quality Graph Schema Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateTaskVector,
  validateTaskVectorSafe,
  isNormalizedEmbedding,
  validateEmbedding,
  type TaskVector,
} from '../schema.js';

describe('TaskVector Schema', () => {
  // Helper: create normalized embedding
  const createNormalizedEmbedding = (length: number): number[] => {
    const vec = new Array(length).fill(1 / Math.sqrt(length));
    return vec;
  };

  it('validates correct task vector', () => {
    const vector: TaskVector = {
      task_id: 'test-1',
      embedding: createNormalizedEmbedding(384),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
    };

    expect(() => validateTaskVector(vector)).not.toThrow();
  });

  it('rejects vector with wrong embedding dimensions', () => {
    const vector = {
      task_id: 'test-1',
      embedding: [0.1, 0.2, 0.3], // Only 3 dimensions
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
    };

    const result = validateTaskVectorSafe(vector);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('embedding');
  });

  it('rejects vector with missing required fields', () => {
    const vector = {
      task_id: 'test-1',
      // Missing embedding, timestamp, outcome
    };

    const result = validateTaskVectorSafe(vector);
    expect(result.success).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('accepts optional metadata fields', () => {
    const vector: TaskVector = {
      task_id: 'test-1',
      embedding: createNormalizedEmbedding(384),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      title: 'Add API endpoint',
      description: 'Implement GET /api/users',
      files_touched: ['src/api/users.ts'],
      complexity_score: 65,
      duration_ms: 12000,
      quality: 'high',
    };

    expect(() => validateTaskVector(vector)).not.toThrow();
  });

  it('validates outcome status enum', () => {
    const validStatuses = ['success', 'failure', 'abandoned'];

    for (const status of validStatuses) {
      const vector = {
        task_id: 'test-1',
        embedding: createNormalizedEmbedding(384),
        timestamp: new Date().toISOString(),
        outcome: { status },
      };

      expect(() => validateTaskVector(vector)).not.toThrow();
    }

    const invalidVector = {
      task_id: 'test-1',
      embedding: createNormalizedEmbedding(384),
      timestamp: new Date().toISOString(),
      outcome: { status: 'invalid-status' },
    };

    const result = validateTaskVectorSafe(invalidVector);
    expect(result.success).toBe(false);
  });
});

describe('Embedding Validation', () => {
  it('detects normalized embeddings', () => {
    const normalized = new Array(384).fill(1 / Math.sqrt(384));
    expect(isNormalizedEmbedding(normalized)).toBe(true);
  });

  it('detects unnormalized embeddings', () => {
    const unnormalized = new Array(384).fill(1.0);
    expect(isNormalizedEmbedding(unnormalized)).toBe(false);
  });

  it('validates correct embedding', () => {
    const embedding = new Array(384).fill(1 / Math.sqrt(384));
    const result = validateEmbedding(embedding);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects embedding with wrong dimensions', () => {
    const embedding = new Array(100).fill(0.1);
    const result = validateEmbedding(embedding);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Expected 384 dimensions');
  });

  it('rejects embedding with NaN', () => {
    const embedding = new Array(384).fill(NaN);
    const result = validateEmbedding(embedding);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('NaN');
  });

  it('rejects embedding with Infinity', () => {
    const embedding = new Array(384).fill(Infinity);
    const result = validateEmbedding(embedding);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('NaN');
  });

  it('rejects unnormalized embedding', () => {
    const embedding = new Array(384).fill(1.0);
    const result = validateEmbedding(embedding);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not normalized');
  });
});

describe('Edge Cases', () => {
  it('handles unicode in title and description', () => {
    const vector: TaskVector = {
      task_id: 'test-1',
      embedding: new Array(384).fill(1 / Math.sqrt(384)),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      title: 'Fix 🐛 in API',
      description: '修复错误',
    };

    expect(() => validateTaskVector(vector)).not.toThrow();
  });

  it('handles empty arrays for files_touched', () => {
    const vector: TaskVector = {
      task_id: 'test-1',
      embedding: new Array(384).fill(1 / Math.sqrt(384)),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      files_touched: [],
    };

    expect(() => validateTaskVector(vector)).not.toThrow();
  });

  it('validates complexity_score bounds', () => {
    const validVector: TaskVector = {
      task_id: 'test-1',
      embedding: new Array(384).fill(1 / Math.sqrt(384)),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      complexity_score: 50,
    };

    expect(() => validateTaskVector(validVector)).not.toThrow();

    const invalidVector = {
      ...validVector,
      complexity_score: 150, // Out of bounds
    };

    const result = validateTaskVectorSafe(invalidVector);
    expect(result.success).toBe(false);
  });

  it('validates duration_ms is non-negative', () => {
    const invalidVector = {
      task_id: 'test-1',
      embedding: new Array(384).fill(1 / Math.sqrt(384)),
      timestamp: new Date().toISOString(),
      outcome: { status: 'success' },
      duration_ms: -100,
    };

    const result = validateTaskVectorSafe(invalidVector);
    expect(result.success).toBe(false);
  });
});
