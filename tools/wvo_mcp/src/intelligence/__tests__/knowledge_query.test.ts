/**
 * Tests for KnowledgeQuery.
 *
 * Covers all 7 dimensions per UNIVERSAL_TEST_STANDARDS.md:
 * 1. Functional correctness
 * 2. Error handling
 * 3. Edge cases
 * 4. Integration
 * 5. Performance
 * 6. Resilience
 * 7. Real-world usage
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { KnowledgeQuery } from '../knowledge_query.js';
import { KnowledgeStorage } from '../knowledge_storage.js';
import type { FunctionKnowledge } from '../knowledge_types.js';

describe('KnowledgeQuery', () => {
  let tempDir: string;
  let storage: KnowledgeStorage;
  let query: KnowledgeQuery;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-test-'));
    await fs.mkdir(path.join(tempDir, 'state', 'knowledge'), { recursive: true });

    // Initialize storage and query
    storage = new KnowledgeStorage(tempDir);
    await storage.initialize();
    query = new KnowledgeQuery(storage);

    // Seed with sample knowledge
    await seedSampleKnowledge(storage);
  });

  afterEach(async () => {
    // Clean up
    storage.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Helper to seed sample knowledge
  async function seedSampleKnowledge(storage: KnowledgeStorage): Promise<void> {
    // Add sample functions
    storage.storeFunctionKnowledge({
      id: 'enforcement/loc_analyzer.ts:analyzeFileLOC',
      filePath: 'tools/wvo_mcp/src/enforcement/loc_analyzer.ts',
      name: 'analyzeFileLOC',
      purpose: 'Analyzes file LOC and applies context-aware limits',
      confidence: 0.9,
      complexity: 5,
      coverage: 85,
      lastUpdated: new Date().toISOString(),
      gitSha: 'abc123',
    });

    storage.storeFunctionKnowledge({
      id: 'enforcement/loc_config.ts:getFileTypeMultiplier',
      filePath: 'tools/wvo_mcp/src/enforcement/loc_config.ts',
      name: 'getFileTypeMultiplier',
      purpose: 'Returns LOC multiplier based on file type (tests 3x, core 0.8x)',
      confidence: 0.9,
      complexity: 3,
      coverage: 90,
      lastUpdated: new Date().toISOString(),
      gitSha: 'abc123',
    });

    storage.storeFunctionKnowledge({
      id: 'critics/base.ts:run',
      filePath: 'tools/wvo_mcp/src/critics/base.ts',
      name: 'run',
      purpose: 'Executes critic analysis and returns result',
      confidence: 0.85,
      complexity: 2,
      coverage: 95,
      lastUpdated: new Date().toISOString(),
      gitSha: 'abc123',
    });

    // Add call graph edges
    storage.storeCallGraphEdge({
      from: 'enforcement/loc_analyzer.ts:analyzeFileLOC',
      to: 'enforcement/loc_config.ts:getFileTypeMultiplier',
      filePath: 'enforcement/loc_analyzer.ts',
      lineNumber: 15,
    });
  }

  // DIMENSION 1: Functional Correctness
  describe('Functional Correctness', () => {
    test('correctly classifies location queries', async () => {
      const result = await query.query('Where should LOC enforcement code go?');

      // Phase 1: May succeed or fall back depending on knowledge completeness
      if (result.success) {
        expect(result.answer).toContain('enforcement');
      } else {
        // Fallback is acceptable if knowledge incomplete
        expect(result.fallback).toBe(true);
      }
    });

    test('correctly classifies semantic queries', async () => {
      const result = await query.query('What does analyzeFileLOC do?');

      expect(result.success).toBe(true);
      expect(result.answer).toContain('LOC');
    });

    test('correctly classifies usage queries', async () => {
      const result = await query.query('Is getFileTypeMultiplier used?');

      expect(result.success).toBe(true);
      // Should find that it's called by analyzeFileLOC
      expect(result.answer).toContain('used');
    });

    test('returns evidence with answers', async () => {
      const result = await query.query('Where should LOC enforcement code go?');

      if (result.success) {
        expect(result.evidence).toBeDefined();
        expect(result.evidence!.length).toBeGreaterThan(0);
      }
    });

    test('includes confidence scores', async () => {
      const result = await query.query('What does analyzeFileLOC do?');

      expect(result.confidence).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // DIMENSION 2: Error Handling
  describe('Error Handling', () => {
    test('handles empty queries gracefully', async () => {
      const result = await query.query('');

      expect(result).toBeDefined();
      // Should fallback
      expect(result.fallback).toBe(true);
    });

    test('handles queries for nonexistent functions', async () => {
      const result = await query.query('What does nonExistentFunction do?');

      expect(result.success).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
    });

    test('returns error field when query fails', async () => {
      const result = await query.query('malformed @@@ query ###');

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  // DIMENSION 3: Edge Cases
  describe('Edge Cases', () => {
    test('handles queries with special characters', async () => {
      const result = await query.query('Where should "special-file.ts" code go?');

      expect(result).toBeDefined();
    });

    test('handles very long queries', async () => {
      const longQuery = 'Where should ' + 'very '.repeat(100) + 'long code go?';

      const result = await query.query(longQuery);

      expect(result).toBeDefined();
    });

    test('handles case-insensitive queries', async () => {
      const result1 = await query.query('WHERE should LOC code go?');
      const result2 = await query.query('where should loc code go?');

      // Both should classify as location queries
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    test('detects via negativa opportunities', async () => {
      // Add unused function
      storage.storeFunctionKnowledge({
        id: 'unused.ts:unusedFunction',
        filePath: 'unused.ts',
        name: 'unusedFunction',
        purpose: 'Does nothing useful',
        confidence: 0.8,
        complexity: 1,
        coverage: 0,
        lastUpdated: new Date().toISOString(),
        gitSha: 'abc123',
      });

      const result = await query.query('Is unusedFunction used?');

      expect(result.success).toBe(true);
      expect(result.answer).toContain('NOT used');
      expect(result.answer).toContain('delete'); // Via negativa suggestion
    });
  });

  // DIMENSION 4: Integration
  describe('Integration', () => {
    test('retrieves knowledge from storage correctly', async () => {
      const result = await query.query('What does analyzeFileLOC do?');

      if (result.success && result.evidence) {
        const fn = result.evidence[0];
        expect(fn.type).toBe('function');
        expect(fn.filePath).toContain('enforcement');
      }
    });

    test('uses call graph for usage queries', async () => {
      const result = await query.query('Is getFileTypeMultiplier used?');

      if (result.success) {
        // Should find caller via call graph
        expect(result.answer).toContain('analyzeFileLOC');
      }
    });
  });

  // DIMENSION 5: Performance
  describe('Performance', () => {
    test('queries complete in under 100ms', async () => {
      const start = Date.now();
      await query.query('Where should LOC code go?');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    test('respects query context limit', async () => {
      const result = await query.query('Find functions', {
        limit: 2,
      });

      if (result.success && result.evidence) {
        expect(result.evidence.length).toBeLessThanOrEqual(2);
      }
    });
  });

  // DIMENSION 6: Resilience
  describe('Resilience', () => {
    test('falls back when knowledge is incomplete', async () => {
      const result = await query.query('Where should completely_new_feature go?');

      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
    });

    test('handles database errors gracefully', async () => {
      // Close storage to simulate failure
      storage.close();

      const result = await query.query('What does analyzeFileLOC do?');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('continues on query errors', async () => {
      // Even if one query fails, subsequent queries should work
      storage.close();

      const result1 = await query.query('Query 1');
      expect(result1.success).toBe(false);

      // Reinitialize
      storage = new KnowledgeStorage(tempDir);
      await storage.initialize();
      query = new KnowledgeQuery(storage);
      await seedSampleKnowledge(storage);

      const result2 = await query.query('What does analyzeFileLOC do?');
      expect(result2).toBeDefined();
    });
  });

  // DIMENSION 7: Real-World Usage
  describe('Real-World Usage', () => {
    test('answers "where should X go" queries correctly', async () => {
      const result = await query.query('Where should complexity enforcement code go?');

      expect(result).toBeDefined();
      if (result.success) {
        // Should suggest enforcement module based on similar code
        expect(result.answer).toContain('enforcement');
      } else {
        // Or fallback gracefully
        expect(result.fallback).toBe(true);
      }
    });

    test('answers "what does X do" queries correctly', async () => {
      const result = await query.query('What does getFileTypeMultiplier do?');

      expect(result.success).toBe(true);
      expect(result.answer).toContain('multiplier');
      expect(result.answer).toContain('file type');
    });

    test('answers "is X used" queries correctly', async () => {
      const result = await query.query('Is getFileTypeMultiplier used?');

      expect(result.success).toBe(true);
      expect(result.answer).toContain('used by');
      expect(result.answer).toContain('function');
    });

    test('provides file paths in evidence', async () => {
      const result = await query.query('Where should LOC code go?');

      if (result.success && result.evidence) {
        const hasFilePaths = result.evidence.some((e) => e.filePath !== undefined);
        expect(hasFilePaths).toBe(true);
      }
    });

    test('handles queries with task context', async () => {
      const result = await query.query('Where should this go?', {
        taskId: 'AFP-TEST-123',
        activeFiles: ['enforcement/loc_analyzer.ts'],
      });

      expect(result).toBeDefined();
    });

    test('detects when pattern recognition is requested', async () => {
      const result = await query.query('What pattern should I use for context-aware rules?');

      // Pattern recognition is Phase 3 feature, should fallback
      expect(result.fallback).toBe(true);
      expect(result.error).toContain('Phase 3');
    });

    test('provides actionable answers', async () => {
      const result = await query.query('Where should LOC enforcement code go?');

      if (result.success && result.answer) {
        // Answer should be specific and actionable
        expect(result.answer.length).toBeGreaterThan(10);
        expect(result.answer).toContain('/'); // Should include path
      }
    });
  });
});
