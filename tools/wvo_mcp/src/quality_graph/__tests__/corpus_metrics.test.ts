/**
 * Corpus Metrics Tests
 *
 * Verifies corpus size counting functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { getCorpusSize } from '../corpus_metrics.js';

const TEST_WORKSPACE = '/tmp/corpus-metrics-test';

describe('getCorpusSize', () => {
  beforeEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
    await fs.mkdir(`${TEST_WORKSPACE}/state/quality_graph`, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it('counts vectors in corpus', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;
    await fs.writeFile(corpusPath, '{"task_id":"T1"}\n{"task_id":"T2"}\n{"task_id":"T3"}\n');

    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(3);
  });

  it('returns 0 for missing corpus', async () => {
    // Corpus directory exists but task_vectors.jsonl doesn't
    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(0);
  });

  it('returns 0 for empty corpus', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;
    await fs.writeFile(corpusPath, '');

    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(0);
  });

  it('handles corpus with trailing newline', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;
    // Three vectors with trailing newline (common file format)
    await fs.writeFile(corpusPath, '{"task_id":"T1"}\n{"task_id":"T2"}\n{"task_id":"T3"}\n');

    const size = await getCorpusSize(TEST_WORKSPACE);
    expect(size).toBe(3); // Should count 3, not 4 (no empty line at end)
  });

  it('handles large corpus efficiently', async () => {
    const corpusPath = `${TEST_WORKSPACE}/state/quality_graph/task_vectors.jsonl`;

    // Create 2000 vector corpus (prune threshold)
    const vectors: string[] = [];
    for (let i = 0; i < 2000; i++) {
      vectors.push(`{"task_id":"T${i}","embedding":[0.1,0.2]}`);
    }
    await fs.writeFile(corpusPath, vectors.join('\n') + '\n');

    const startTime = Date.now();
    const size = await getCorpusSize(TEST_WORKSPACE);
    const duration = Date.now() - startTime;

    expect(size).toBe(2000);
    expect(duration).toBeLessThan(50); // Should be fast (<50ms)
  });
});
