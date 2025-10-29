/**
 * Quality Graph Persistence Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  writeVector,
  readVectors,
  loadIndex,
  getVectorCount,
  deleteVector,
  pruneOldVectors,
  getTaskVectorsPath,
} from '../persistence.js';
import type { TaskVector } from '../schema.js';

const TEST_WORKSPACE = '/tmp/quality-graph-test';

describe('Persistence Layer', () => {
  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, timestamp?: string): TaskVector => ({
    task_id: id,
    embedding: new Array(384).fill(1 / Math.sqrt(384)),
    timestamp: timestamp || new Date().toISOString(),
    outcome: { status: 'success' },
    title: `Test task ${id}`,
  });

  it('writes and reads single vector', async () => {
    const vector = createTestVector('test-1');
    await writeVector(TEST_WORKSPACE, vector);

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(1);
    expect(vectors[0].task_id).toBe('test-1');
  });

  it('appends multiple vectors', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('test-1'));
    await writeVector(TEST_WORKSPACE, createTestVector('test-2'));
    await writeVector(TEST_WORKSPACE, createTestVector('test-3'));

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(3);
    expect(vectors.map((v) => v.task_id)).toEqual(['test-1', 'test-2', 'test-3']);
  });

  it('handles empty file', async () => {
    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toEqual([]);
  });

  it('skips invalid JSON lines', async () => {
    const filePath = getTaskVectorsPath(TEST_WORKSPACE);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write mix of valid and invalid lines
    const vector1 = createTestVector('test-1');
    const vector2 = createTestVector('test-2');

    const content = [
      JSON.stringify(vector1),
      '{invalid json',
      JSON.stringify(vector2),
      '',
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf8');

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(2);
    expect(vectors.map((v) => v.task_id)).toEqual(['test-1', 'test-2']);
  });

  it('skips vectors with invalid schema', async () => {
    const filePath = getTaskVectorsPath(TEST_WORKSPACE);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const validVector = createTestVector('test-1');
    const invalidVector = {
      task_id: 'test-2',
      // Missing required fields
    };

    const content = [
      JSON.stringify(validVector),
      JSON.stringify(invalidVector),
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf8');

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(1);
    expect(vectors[0].task_id).toBe('test-1');
  });
});

describe('Index Operations', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string): TaskVector => ({
    task_id: id,
    embedding: new Array(384).fill(1 / Math.sqrt(384)),
    timestamp: new Date().toISOString(),
    outcome: { status: 'success' },
  });

  it('loads index as map', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('test-1'));
    await writeVector(TEST_WORKSPACE, createTestVector('test-2'));

    const index = await loadIndex(TEST_WORKSPACE);
    expect(index.size).toBe(2);
    expect(index.has('test-1')).toBe(true);
    expect(index.has('test-2')).toBe(true);
  });

  it('gets vector count without loading', async () => {
    expect(await getVectorCount(TEST_WORKSPACE)).toBe(0);

    await writeVector(TEST_WORKSPACE, createTestVector('test-1'));
    expect(await getVectorCount(TEST_WORKSPACE)).toBe(1);

    await writeVector(TEST_WORKSPACE, createTestVector('test-2'));
    expect(await getVectorCount(TEST_WORKSPACE)).toBe(2);
  });

  it('deletes vector by ID', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('test-1'));
    await writeVector(TEST_WORKSPACE, createTestVector('test-2'));
    await writeVector(TEST_WORKSPACE, createTestVector('test-3'));

    await deleteVector(TEST_WORKSPACE, 'test-2');

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(2);
    expect(vectors.map((v) => v.task_id)).toEqual(['test-1', 'test-3']);
  });

  it('deletes non-existent vector (no-op)', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('test-1'));

    await deleteVector(TEST_WORKSPACE, 'non-existent');

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(1);
  });
});

describe('Pruning', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string, daysAgo: number): TaskVector => {
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() - daysAgo);

    return {
      task_id: id,
      embedding: new Array(384).fill(1 / Math.sqrt(384)),
      timestamp: timestamp.toISOString(),
      outcome: { status: 'success' },
    };
  };

  it('prunes old vectors keeping most recent', async () => {
    // Write 5 vectors with different timestamps
    await writeVector(TEST_WORKSPACE, createTestVector('old-1', 100));
    await writeVector(TEST_WORKSPACE, createTestVector('old-2', 50));
    await writeVector(TEST_WORKSPACE, createTestVector('recent-1', 2));
    await writeVector(TEST_WORKSPACE, createTestVector('recent-2', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('recent-3', 0));

    const pruned = await pruneOldVectors(TEST_WORKSPACE, 3);
    expect(pruned).toBe(2); // Pruned 2 old vectors

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(3);

    // Should keep 3 most recent
    const ids = vectors.map((v) => v.task_id).sort();
    expect(ids).toEqual(['recent-1', 'recent-2', 'recent-3']);
  });

  it('does not prune if under limit', async () => {
    await writeVector(TEST_WORKSPACE, createTestVector('test-1', 1));
    await writeVector(TEST_WORKSPACE, createTestVector('test-2', 0));

    const pruned = await pruneOldVectors(TEST_WORKSPACE, 5);
    expect(pruned).toBe(0);

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(2);
  });
});

describe('Concurrent Writes', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  const createTestVector = (id: string): TaskVector => ({
    task_id: id,
    embedding: new Array(384).fill(1 / Math.sqrt(384)),
    timestamp: new Date().toISOString(),
    outcome: { status: 'success' },
  });

  it('handles concurrent writes', async () => {
    const writes = Array.from({ length: 100 }, (_, i) =>
      writeVector(TEST_WORKSPACE, createTestVector(`test-${i}`))
    );

    await Promise.all(writes);

    const vectors = await readVectors(TEST_WORKSPACE);
    expect(vectors).toHaveLength(100);

    // All task IDs should be present
    const ids = new Set(vectors.map((v) => v.task_id));
    expect(ids.size).toBe(100);
  });
});
